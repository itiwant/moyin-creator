// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * 5阶段分镜Hiệu chuẩn模块
 * 
 * 将 30+ trường拆分为 5 独立 AI gọi API，Tránh推理模型 token 耗尽
 * 
 * Stage 1: tự sự骨架 (9 fields) — Kích thước cảnh/运动/thời lượng + tự sự分析
 * Stage 2: Mô tả thị giác (6 fields) — đang xử lý...述 + 角色 + 音频
 * Stage 3: 拍摄控制 (15 fields) — 灯光/景深/器材/角度/焦距等
 * Stage 4: khung đầu提示词 (3 fields) — imagePrompt + needsEndFrame
 * Stage 5: 动态+khung cuối提示词 (4 fields) — videoPrompt + endFramePrompt
 */

import type { PromptLanguage } from '@/types/script';
import { processBatched } from '@/lib/ai/batch-processor';
import { getStyleDescription, getMediaType } from '@/lib/constants/visual-styles';
import { buildCinematographyGuidance } from '@/lib/constants/cinematography-profiles';
import { getMediaTypeGuidance } from '@/lib/generation/media-type-tokens';
import { useScriptStore } from '@/stores/script-store';
import { buildSeriesContextSummary } from './series-meta-sync';

export interface ShotInputData {
  shotId: string;
  sourceText: string;
  actionSummary: string;
  dialogue?: string;
  characterNames?: string[];
  sceneLocation: string;
  sceneAtmosphere: string;
  sceneTime: string;
  sceneWeather?: string;
  architectureStyle?: string;
  colorPalette?: string;
  eraDetails?: string;
  lightingDesign?: string;
  currentShotSize?: string;
  currentCameraMovement?: string;
  currentDuration?: number;
}

export interface GlobalContext {
  title: string;
  genre?: string;
  era?: string;
  outline: string;
  characterBios: string;
  worldSetting?: string;
  themes?: string[];
  episodeTitle: string;
  episodeSynopsis?: string;
  episodeKeyEvents?: string[];
  episodeRawContent?: string;
  episodeSeason?: string;
  totalEpisodes?: number;
  currentEpisode?: number;
  /** 剧级上下文摘要（由 buildSeriesContextSummary Tạo） */
  seriesContextSummary?: string;
}

export interface CalibrationOptions {
  styleId?: string;
  cinematographyProfileId?: string;
  promptLanguage?: PromptLanguage;
}

/**
 * 5阶段分镜Hiệu chuẩn主函数
 */
export async function calibrateShotsMultiStage(
  shots: ShotInputData[],
  options: CalibrationOptions,
  globalContext: GlobalContext,
  onStageProgress?: (stage: number, totalStages: number, stageName: string) => void
): Promise<Record<string, any>> {
  const { styleId, cinematographyProfileId, promptLanguage = 'zh+en' } = options;
  const {
    title, genre, era, episodeTitle, episodeSynopsis, episodeKeyEvents,
    totalEpisodes, currentEpisode, episodeSeason,
    outline, worldSetting, themes, characterBios
  } = globalContext;

  const styleDesc = getStyleDescription(styleId || 'cinematic');
  const cinematographyGuidance = cinematographyProfileId
    ? buildCinematographyGuidance(cinematographyProfileId)
    : '';
  const contextLine = [
    `《${title}》`, genre || '', era || '',
    totalEpisodes ? `共${totalEpisodes} tập` : '',
    `第${currentEpisode} tập「${episodeTitle}」`,
    episodeSeason || '',
  ].filter(Boolean).join(' | ');

  // 剧级上下文摘要：来自 SeriesMeta
  const seriesCtx = globalContext.seriesContextSummary || '';

  // tự sựneo：故事核心 + Bối cảnh thế giới + 核心冲突（cắt ngắnTránh过长）
  const narrativeAnchorParts = [
    seriesCtx ? `【剧级知识】\n${seriesCtx}` : '',
    outline ? `【故事核心】\n${outline.slice(0, 600)}` : '',
    worldSetting ? `【Bối cảnh thế giới/规则】\n${worldSetting.slice(0, 400)}` : '',
    themes?.length ? `【核心Chủ đề】${themes.join('、')}` : '',
    characterBios ? `【主要nhân vật】\n${characterBios.slice(0, 400)}` : '',
  ].filter(Boolean);
  const narrativeAnchorBlock = narrativeAnchorParts.length > 0
    ? `\n\n${narrativeAnchorParts.join('\n\n')}`
    : '';

  // 媒介类型约束（非电影风格时追加）
  const mt = getMediaType(styleId || 'cinematic');
  const mediaTypeHint = mt !== 'cinematic' ? `\n【媒介类型】${getMediaTypeGuidance(mt)}` : '';

  // thời đại/Bối cảnh thế giới上下文：供 Stage 2/4/5 Thị giácTạoSử dụng（Tránh AI 产生与thời đại不符的幻觉）
  const eraContextParts = [
    contextLine,
    era ? `⚠️ thời đại背景：${era}——Tất cảnhân vậttrang phục、Kiểu tóc、đạo cụ、建筑必须严格符合「${era}」时期，bị cấm出现其他thời đại的元素（如古装剧bị cấm西装/T恤/手机等现代vật phẩm）` : '',
    worldSetting ? `Bối cảnh thế giới设定：${worldSetting.slice(0, 300)}` : '',
    characterBios ? `nhân vật造型Tham chiếu：${characterBios.slice(0, 300)}` : '',
  ].filter(Boolean);
  const eraContextBlock = eraContextParts.length > 0
    ? `\n\n【⚠️ 剧本背景 — Thị giácTạo必须严格遵循】\n${eraContextParts.join('\n')}`
    : '';

  // JSON Phân tích辅助
  function parseStageJSON(raw: string): Record<string, any> {
    let cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }
    const parsed = JSON.parse(cleaned);
    return parsed.shots || parsed || {};
  }

  // 通用 Stage 执行器：Sử dụng processBatched Tự động分批（30+ shots 时Tự động拆分 sub-batch）
  async function runStage(
    stageName: string,
    buildPrompts: (batch: ShotInputData[]) => { system: string; user: string },
    outputTokensPerItem: number,
    maxTokens: number,
  ): Promise<void> {
    console.log(`[MultiStage] ${stageName}`);
    const { results, failedBatches } = await processBatched<ShotInputData, Record<string, any>>({
      items: shots,
      feature: 'script_analysis',
      buildPrompts,
      parseResult: (raw, batch) => {
        const shotsResult = parseStageJSON(raw);
        const result = new Map<string, Record<string, any>>();
        for (const item of batch) {
          if (shotsResult[item.shotId]) {
            result.set(item.shotId, shotsResult[item.shotId]);
          }
        }
        return result;
      },
      estimateItemOutputTokens: () => outputTokensPerItem,
      apiOptions: { maxTokens },
    });

    for (const shot of shots) {
      const stageResult = results.get(shot.shotId);
      if (stageResult) {
        Object.assign(merged[shot.shotId], stageResult);
      }
    }
    if (failedBatches > 0) {
      console.warn(`[MultiStage] ${stageName}: ${failedBatches} 批次thất bại`);
    }
  }

  // 初始化合并kết quả
  const merged: Record<string, any> = {};
  for (const shot of shots) {
    merged[shot.shotId] = {};
  }

  // ===================== Stage 1: tự sự骨架 =====================
  onStageProgress?.(1, 5, 'tự sự骨架');
  console.log('[MultiStage] Stage 1/5: tự sự骨架');

  const s1System = `你是电影tự sự分析师，精通镜头Ngôn ngữ和tự sựCấu trúc。分析每分镜的tự sựchức năng并确定镜头参数。

${contextLine}${narrativeAnchorBlock}${episodeSynopsis ? `\n\n【本 tậpđại cương】\n${episodeSynopsis}` : ''}${episodeKeyEvents?.length ? `\nSự kiện quan trọng：${episodeKeyEvents.join('、')}` : ''}

【⚠️ tự sựgiống性校验 — 必须执行】
每分镜必须回答：
1. 此镜头如何推动本 tập核心冲突的发展？（铺垫→升级→cao trào→转折→尾声）
2. 此镜头是否违反Bối cảnh thế giới设定？（如有违反，在 storyAlignment đang xử lý...
3. shotPurpose 必须体现该镜头与故事核心的关系，不能只Mô tả画面

为每分镜输出 JSON：
- shotSize: ECU/CU/MCU/MS/MLS/LS/WS/FS
- cameraMovement: none/static/tracking/orbit/zoom-in/zoom-out/pan-left/pan-right/tilt-up/tilt-down/dolly-in/dolly-out/truck-left/truck-right/crane-up/crane-down/drone-aerial/360-roll
- specialTechnique: none/hitchcock-zoom/timelapse/crash-zoom-in/crash-zoom-out/whip-pan/bullet-time/fpv-shuttle/macro-closeup/first-person/slow-motion/probe-lens/spinning-tilt
- duration: 秒数(整数)，纯动作3-5秒/简短Thoại4-6秒/长Thoại6-10秒/复杂动作5-8秒
- narrativeFunction: 铺垫/升级/cao trào/转折/chuyển tiếp/尾声
- conflictStage: 此镜头在本 tập核心冲突đang xử lý...（引入/激化/对抗/转折/解决/余波，无关填"辅助"）
- shotPurpose: 一句话说明此镜头如何服务于故事核心（中文）
- storyAlignment: 与Bối cảnh thế giới/故事核心的giống性（aligned/minor-deviation/needs-review）
- visualFocus: Tiêu điểm thị giácthứ tự（用→表示）
- cameraPosition: 机位Mô tả（中文）
- characterBlocking: nhân vậtbố cục（中文）
- rhythm: Nhịp điệu感（中文）

格式：{"shots":{"shot_id":{...}}}`;

  try {
    await runStage('Stage 1/5: tự sự骨架', (batch) => {
      const userShots = batch.map(s => {
        const chars = s.characterNames?.join('、') || '无';
        return `ID: ${s.shotId}\n场景: ${s.sceneLocation} | 时间: ${s.sceneTime}${s.sceneWeather ? ` | 天气: ${s.sceneWeather}` : ''}\n原文: ${s.sourceText || s.actionSummary}${s.dialogue ? `\nThoại: 「${s.dialogue}」` : ''}\n角色: ${chars} | 氛围: ${s.sceneAtmosphere}\n当前: Kích thước cảnh=${s.currentShotSize || '?'} 运动=${s.currentCameraMovement || '?'}`;
      }).join('\n\n---\n\n');
      return { system: s1System, user: `分析以下分镜：\n\n${userShots}` };
    }, 200, 4096);
  } catch (e) {
    console.error('[MultiStage] Stage 1 failed:', e);
  }

  // ===================== Stage 2: Mô tả thị giác + 音频 =====================
  onStageProgress?.(2, 5, 'Mô tả thị giác');
  console.log('[MultiStage] Stage 2/5: Mô tả thị giác');
  const includeEnVisualPrompt = promptLanguage !== 'zh';
  const s2VisualPromptRule = includeEnVisualPrompt
    ? '\n- visualPrompt: 纯英文，40词内，AI绘图用'
    : '';
  const s2JsonFormat = includeEnVisualPrompt
    ? '{"shots":{"shot_id":{"visualDescription":"","visualPrompt":"","characterNames":[],"emotionTags":[],"ambientSound":"","soundEffect":""}}}'
    : '{"shots":{"shot_id":{"visualDescription":"","characterNames":[],"emotionTags":[],"ambientSound":"","soundEffect":""}}}';

  const s2System = `你是影视Mô tả thị giác师。基于gốc剧本文本和tự sự分析，TạoMô tả thị giác和音频Thiết kế。${eraContextBlock}

⚠️ 规则：
- 场景归属绝对Cố định：主场景不可thay đổi，闪回用"画面叠加"Mô tả
- 角色列表必须đầy đủ来自原文，不增不减
- **thời đạigiống性**：nhân vậttrang phục、Kiểu tóc、đạo cụ、环境细节必须严格符合剧本设定的thời đại背景，bị cấm混入其他thời đại元素
- visualDescription: 纯đang xử lý...细画面Mô tả（trang phục/đạo cụ必须符合thời đại）
${s2VisualPromptRule}
- emotionTags Tùy chọn: happy/sad/angry/surprised/fearful/calm/tense/excited/mysterious/romantic/funny/touching/serious/relaxed/playful/gentle/passionate/low
- ambientSound/soundEffect: 纯中文
格式：${s2JsonFormat}`;

  try {
    await runStage('Stage 2/5: Mô tả thị giác', (batch) => {
      const userShots = batch.map(s => {
        const prev = merged[s.shotId] || {};
        const hasFlashback = /闪回|叠画|回忆|穿插/.test(s.sourceText || '');
        return `ID: ${s.shotId}\n【主场景（不可thay đổi）】: ${s.sceneLocation}${hasFlashback ? ' ⚠️含闪回，主场景không thay đổi！' : ''}\n原文: ${s.sourceText || s.actionSummary}${s.dialogue ? `\nThoại: 「${s.dialogue}」` : ''}\n角色: ${s.characterNames?.join('、') || '无'}\ntự sự: Kích thước cảnh=${prev.shotSize || '?'} | chức năng=${prev.narrativeFunction || '?'} | mục đích=${prev.shotPurpose || '?'}\n焦点: ${prev.visualFocus || '?'} | bố cục: ${prev.characterBlocking || '?'}`;
      }).join('\n\n---\n\n');
      return { system: s2System, user: `请TạoMô tả thị giác：\n\n${userShots}` };
    }, 200, 4096);
  } catch (e) {
    console.error('[MultiStage] Stage 2 failed:', e);
  }

  // ===================== Stage 3: 拍摄控制 =====================
  onStageProgress?.(3, 5, '拍摄控制');
  console.log('[MultiStage] Stage 3/5: 拍摄控制');

  const s3System = `你是电影摄影指导(DP)。根据Mô tả thị giác确定chuyên nghiệp拍摄参数。${cinematographyGuidance ? `\n\n${cinematographyGuidance}` : ''}

为每分镜输出：
- lightingStyle: natural/high-key/low-key/silhouette/chiaroscuro/neon
- lightingDirection: front/side/back/top/bottom/rim
- colorTemperature: warm-3200K/neutral-5600K/cool-7500K/mixed/golden-hour/blue-hour
- lightingNotes: đang xử lý...细节
- depthOfField: shallow/medium/deep/split-diopter
- focusTarget: đang xử lý...主体
- focusTransition: none/rack-focus/pull-focus/follow-focus
- cameraRig: tripod/handheld/steadicam/dolly/crane/drone/gimbal/shoulder
- movementSpeed: static/slow/normal/fast/whip
- atmosphericEffects: 数组（đang xử lý...如["雾气"]
- effectIntensity: subtle/moderate/heavy
- playbackSpeed: slow-0.25x/slow-0.5x/normal/fast-1.5x/fast-2x/timelapse
- cameraAngle: eye-level/low-angle/high-angle/birds-eye/worms-eye/dutch-angle/over-shoulder/pov/aerial
- focalLength: 14mm/18mm/24mm/28mm/35mm/50mm/85mm/100mm-macro/135mm/200mm
- photographyTechnique: long-exposure/double-exposure/high-speed/timelapse-photo/tilt-shift/silhouette/reflection/bokeh (可Để trống)

格式：{"shots":{"shot_id":{...}}}`;

  try {
    await runStage('Stage 3/5: 拍摄控制', (batch) => {
      const userShots = batch.map(s => {
        const prev = merged[s.shotId] || {};
        const artParts = [
          s.architectureStyle ? `建筑:${s.architectureStyle}` : '',
          s.colorPalette ? `色彩:${s.colorPalette}` : '',
          s.eraDetails ? `thời đại:${s.eraDetails}` : '',
          s.lightingDesign ? `光影:${s.lightingDesign}` : '',
        ].filter(Boolean);
        return `ID: ${s.shotId}\n场景: ${s.sceneLocation} | 时间: ${s.sceneTime}${s.sceneWeather ? ` | 天气:${s.sceneWeather}` : ''}\nKích thước cảnh: ${prev.shotSize || '?'} | 运动: ${prev.cameraMovement || '?'} | Nhịp điệu: ${prev.rhythm || '?'}\nMô tả thị giác: ${prev.visualDescription || '?'}${artParts.length ? `\n场景美术: ${artParts.join(' | ')}` : ''}`;
      }).join('\n\n---\n\n');
      return { system: s3System, user: `请确定拍摄参数：\n\n${userShots}` };
    }, 200, 4096);
  } catch (e) {
    console.error('[MultiStage] Stage 3 failed:', e);
  }

  // ===================== Stage 4: khung đầu提示词 =====================
  onStageProgress?.(4, 5, 'khung đầu提示词');
  console.log('[MultiStage] Stage 4/5: khung đầu提示词');

  // Stage 4: 根据 promptLanguage 动态调整输出trường
  const s4Fields = promptLanguage === 'zh'
    ? 'imagePromptZh (纯đang xử lý...60-100字)'
    : promptLanguage === 'en'
    ? 'imagePrompt (纯英文, 60-80词)'
    : 'imagePrompt (纯英文, 60-80词) 和 imagePromptZh (纯đang xử lý...60-100字)';
  const s4JsonFormat = promptLanguage === 'zh'
    ? '{"shots":{"shot_id":{"imagePromptZh":"","needsEndFrame":true}}}'
    : promptLanguage === 'en'
    ? '{"shots":{"shot_id":{"imagePrompt":"","needsEndFrame":true}}}'
    : '{"shots":{"shot_id":{"imagePrompt":"","imagePromptZh":"","needsEndFrame":true}}}';
  const s4LangWarning = promptLanguage === 'zh'
    ? '\n⚠️ imagePromptZh 必须纯中文'
    : promptLanguage === 'en'
    ? '\n⚠️ imagePrompt 必须100%纯英文，bị cấm任何đang xử lý...'
    : '\n⚠️ imagePrompt 必须100%纯英文，bị cấm任何đang xử lý...\n⚠️ imagePromptZh 必须纯đang xử lý...

  const s4System = `你是AI图像Tạo专家。根据Mô tả thị giác和拍摄参数，Tạokhung đầu提示词。${eraContextBlock}

${styleDesc}${mediaTypeHint}

⚠️ thời đạigiống性（最重要）：nhân vật的trang phục、Kiểu tóc、配饰必须严格符合剧本设定的thời đại背景。例如古装剧đang xử lý...n vật必须穿古代服饰，bị cấm出现西装、T恤、现代Kiểu tóc等。

${s4Fields} 必须包含：
a) 场景环境（地点+环境细节+时间氛围）
b) 光线Thiết kế（光源+质感+氛围）
c) nhân vậtMô tả（Tuổi+trang phục+Biểu cảm+Tư thế，每角色都写）
d) bố cục与Kích thước cảnh（Kích thước cảnh+nhân vật位置关系+焦点）
e) 重要đạo cụ（quan trọngđạo cụ+状态）
f) 画面风格（电影感/色调）
${s4LangWarning}

needsEndFrame 判断：
- true: nhân vật位置变化/动作序列/vật phẩm状态变化/镜头运动(非Static)
- false: 纯Thoại+位置không thay đổi/仅微Biểu cảm
- 不确定时设 true

格式：${s4JsonFormat}`;

  try {
    await runStage('Stage 4/5: khung đầu提示词', (batch) => {
      const userShots = batch.map(s => {
        const prev = merged[s.shotId] || {};
        return `ID: ${s.shotId}\nKích thước cảnh: ${prev.shotSize || '?'} | 角度: ${prev.cameraAngle || '?'} | 焦距: ${prev.focalLength || '?'}\n运动: ${prev.cameraMovement || '?'}\nMô tả thị giác: ${prev.visualDescription || '?'}\n角色: ${(prev.characterNames || s.characterNames || []).join('、')}\n灯光: ${prev.lightingStyle || '?'}, ${prev.lightingDirection || '?'}, ${prev.colorTemperature || '?'}\n景深: ${prev.depthOfField || '?'} | 焦点: ${prev.focusTarget || '?'}\n大气: ${(prev.atmosphericEffects || []).join(',')}${prev.lightingNotes ? `\n灯光备注: ${prev.lightingNotes}` : ''}`;
      }).join('\n\n---\n\n');
      return { system: s4System, user: `请Tạokhung đầu提示词：\n\n${userShots}` };
    }, 400, 8192);
  } catch (e) {
    console.error('[MultiStage] Stage 4 failed:', e);
  }

  // ===================== Stage 5: 动态 + khung cuối提示词 =====================
  onStageProgress?.(5, 5, '动态+khung cuối提示词');
  console.log('[MultiStage] Stage 5/5: 动态+khung cuối提示词');

  // Stage 5: 根据 promptLanguage 动态调整输出trường
  const s5VideoFields = promptLanguage === 'zh'
    ? 'videoPromptZh (纯đang xử lý...
    : promptLanguage === 'en'
    ? 'videoPrompt (纯英文)'
    : 'videoPrompt (纯英文) / videoPromptZh (纯đang xử lý...;
  const s5EndFields = promptLanguage === 'zh'
    ? 'endFramePromptZh (纯đang xử lý...60-100字)'
    : promptLanguage === 'en'
    ? 'endFramePrompt (纯英文, 60-80词)'
    : 'endFramePrompt (纯英文, 60-80词) / endFramePromptZh (纯đang xử lý...60-100字)';
  const s5JsonFormat = promptLanguage === 'zh'
    ? '{"shots":{"shot_id":{"videoPromptZh":"","endFramePromptZh":""}}}'
    : promptLanguage === 'en'
    ? '{"shots":{"shot_id":{"videoPrompt":"","endFramePrompt":""}}}'
    : '{"shots":{"shot_id":{"videoPrompt":"","videoPromptZh":"","endFramePrompt":"","endFramePromptZh":""}}}';
  const s5LangWarning = promptLanguage === 'zh'
    ? '\n⚠️ đang xử lý...ường必须纯中文'
    : promptLanguage === 'en'
    ? '\n⚠️ 英文trường必须100%纯英文'
    : '\n⚠️ 英文trường100%纯英文，đang xử lý...ường纯đang xử lý...

  const s5System = `你是AI视频Tạo专家。根据khung đầu画面，Tạo视频动作Mô tả和khung cuối画面。${eraContextBlock}

${s5VideoFields}：
- Mô tả视频đang xử lý...动作（nhân vật动作、物体移动、镜头运动）
- 强调动词，Mô tả运动quá trình
- ⚠️ Tất cảMô tả必须保持thời đạigiống性（trang phục/đạo cụ/环境不能偏离剧本设定的thời đại）

${s5EndFields}：
仅当 needsEndFrame=true 时Tạo，否则设为空ký tự串。
- Mô tả动作hoàn thành后的最终画面
- 包含与khung đầu相同的场景环境和光线
- 重点Mô tả与khung đầu的差异（新位置/新Tư thế/新Biểu cảm/đạo cụ新状态）
- 保持与khung đầu相同的画面风格和thời đại设定
${s5LangWarning}

格式：${s5JsonFormat}`;

  try {
    await runStage('Stage 5/5: 动态+khung cuối', (batch) => {
      const userShots = batch.map(s => {
        const prev = merged[s.shotId] || {};
        return `ID: ${s.shotId}\nthời lượng: ${prev.duration || '?'}秒 | 运动: ${prev.cameraMovement || '?'}\nneedsEndFrame: ${prev.needsEndFrame ?? true}\n动作: ${s.actionSummary || '?'}${s.dialogue ? `\nThoại: 「${s.dialogue}」` : ''}\nkhung đầu(EN): ${prev.imagePrompt || '?'}\nkhung đầu(ZH): ${prev.imagePromptZh || '?'}`;
      }).join('\n\n---\n\n');
      return { system: s5System, user: `请Tạo视频和khung cuối提示词：\n\n${userShots}` };
    }, 400, 8192);
  } catch (e) {
    console.error('[MultiStage] Stage 5 failed:', e);
  }

  console.log('[MultiStage] Tất cả 5 阶段hoàn thành，已Hiệu chuẩntrường:', Object.keys(merged[shots[0]?.shotId] || {}).length);
  return merged;
}
