// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * AI Scene Calibrator
 * 
 * Sử dụng AI thông minhHiệu chuẩn从剧本đang xử lý...场景列表
 * 
 * chức năng：
 * 1. 统计每场景的出场次数、出现 tập数
 * 2. AI 分析识别重要场景 vs chuyển tiếp场景
 * 3. AI 合并相同地点的变体（张家客厅 = 张明家客厅）
 * 4. AI 补充场景thông tin（Phong cách kiến trúc、光影、đạo cụ等）
 * 5. 大师级场景Thị giácThiết kế（chuyên nghiệp提示词Tạo）
 */

import type { ScriptScene, ProjectBackground, EpisodeRawScript, SceneRawContent, PromptLanguage } from '@/types/script';
import { callFeatureAPI } from '@/lib/ai/feature-router';
import { processBatched } from '@/lib/ai/batch-processor';
import { estimateTokens, safeTruncate } from '@/lib/ai/model-registry';
import { useScriptStore } from '@/stores/script-store';
import { buildSeriesContextSummary } from './series-meta-sync';

// ==================== 类型定义 ====================

export interface SceneCalibrationResult {
  /** Hiệu chuẩn后的场景列表 */
  scenes: CalibratedScene[];
  /** 被合并的场景记录 */
  mergeRecords: SceneMergeRecord[];
  /** AI 分析说明 */
  analysisNotes: string;
}

export interface CalibratedScene {
  id: string;
  name: string;
  location: string;
  time: string;
  atmosphere: string;
  /** 场景重要性 */
  importance: 'main' | 'secondary' | 'transition';
  /** 出现的 tập数 */
  episodeNumbers: number[];
  /** 出场次数 */
  appearanceCount: number;
  /** Phong cách kiến trúc */
  architectureStyle?: string;
  /** 光影Thiết kế */
  lightingDesign?: string;
  /** 色彩基调 */
  colorPalette?: string;
  /** quan trọngđạo cụ */
  keyProps?: string[];
  /** Bố cục không gian */
  spatialLayout?: string;
  /** thời đại特征 */
  eraDetails?: string;
  /** 英文Thị giác提示词 */
  visualPromptEn?: string;
  /** đang xử lý...Mô tả */
  visualPromptZh?: string;
  /** gốc名称变体 */
  nameVariants: string[];
}

export interface SceneMergeRecord {
  /** 最终Sử dụng的名称 */
  finalName: string;
  /** 被合并的变体 */
  variants: string[];
  /** 合并原因 */
  reason: string;
}

export interface SceneStats {
  name: string;
  location: string;
  /** 出场次数 */
  appearanceCount: number;
  /** 出现的 tập数 */
  episodeNumbers: number[];
  /** 场景内容样本 */
  contentSamples: string[];
  /** 出场角色 */
  characters: string[];
  /** 时间设定 */
  times: string[];
  /** 动作描写样本（用于推断场景đạo cụ/bố cục） */
  actionSamples: string[];
  /** Thoại样本（用于理解场景用途） */
  dialogueSamples: string[];
}

/** @deprecated 不再需要手动传递，Tự động从ánh xạ dịch vụ获取 */
export interface CalibrationOptions {
  apiKey?: string;
  provider?: string;
  baseUrl?: string;
  promptLanguage?: PromptLanguage;
}

// ==================== 统计函数 ====================

/**
 * 从tập剧本đang xử lý...ất cả场景的出场dữ liệu
 */
export function collectSceneStats(
  episodeScripts: EpisodeRawScript[]
): Map<string, SceneStats> {
  const stats = new Map<string, SceneStats>();
  
  if (!episodeScripts || !Array.isArray(episodeScripts)) {
    console.warn('[collectSceneStats] episodeScripts 无效');
    return stats;
  }
  
  for (const ep of episodeScripts) {
    if (!ep || !ep.scenes) continue;
    const epIndex = ep.episodeIndex ?? 0;
    
    for (const scene of ep.scenes) {
      if (!scene || !scene.sceneHeader) continue;
      
      // Phân tích场景头获取地点
      const location = extractLocationFromHeader(scene.sceneHeader);
      const key = normalizeLocation(location);
      
      let stat = stats.get(key);
      if (!stat) {
        stat = {
          name: location,
          location: location,
          appearanceCount: 0,
          episodeNumbers: [],
          contentSamples: [],
          characters: [],
          times: [],
          actionSamples: [],
          dialogueSamples: [],
        };
        stats.set(key, stat);
      }
      
      stat.appearanceCount++;
      if (!stat.episodeNumbers.includes(epIndex)) {
        stat.episodeNumbers.push(epIndex);
      }
      
      // thu thập内容样本
      if (stat.contentSamples.length < 5) {
        const sample = scene.content?.slice(0, 150) || scene.sceneHeader;
        stat.contentSamples.push(`第${epIndex} tập: ${sample}`);
      }
      
      // thu thập动作描写（用于推断đạo cụ和场景bố cục）
      if (scene.actions && scene.actions.length > 0 && stat.actionSamples.length < 8) {
        // Sử dụngPhân tích出的动作描写（△开头）
        for (const action of scene.actions.slice(0, 3)) {
          if (action && stat.actionSamples.length < 8) {
            stat.actionSamples.push(`第${epIndex} tập: ${action.slice(0, 100)}`);
          }
        }
      } else if (scene.content && stat.actionSamples.length < 8) {
        // 如果没有△动作，Sử dụng场景内容的前200字作为动作样本
        const contentSample = scene.content.slice(0, 200).replace(/\n/g, ' ');
        stat.actionSamples.push(`第${epIndex} tập: ${contentSample}`);
      }
      
      // thu thậpThoại样本（用于理解场景đang xử lý...什么）
      if (scene.dialogues && stat.dialogueSamples.length < 5) {
        for (const d of scene.dialogues.slice(0, 2)) {
          if (d && stat.dialogueSamples.length < 5) {
            stat.dialogueSamples.push(`${d.character}: ${d.line.slice(0, 50)}`);
          }
        }
      }
      
      // thu thập角色
      for (const char of (scene.characters || [])) {
        if (!stat.characters.includes(char)) {
          stat.characters.push(char);
        }
      }
      
      // thu thập时间
      const time = extractTimeFromHeader(scene.sceneHeader);
      if (time && !stat.times.includes(time)) {
        stat.times.push(time);
      }
    }
  }
  
  return stats;
}

/**
 * 从场景头提取地点
 * 如 "1-1 日 内 沪上 张家" → "沪上 张家"
 */
function extractLocationFromHeader(header: string): string {
  // 去除场景编号和时间/内外标记
  const parts = header.split(/\s+/);
  // 跳过 "1-1", "日/夜", "内/外"
  const locationParts = parts.filter(p => 
    !p.match(/^\d+-\d+$/) && 
    !p.match(/^(日|夜|晨|暮|Hoàng hôn|Bình minh)$/) &&
    !p.match(/^(内|外|内\/外)$/)
  );
  return locationParts.join(' ') || header;
}

/**
 * 从场景头提取时间
 */
function extractTimeFromHeader(header: string): string {
  const timeMatch = header.match(/(日|夜|晨|暮|Hoàng hôn|Bình minh|清晨|傍晚)/);
  return timeMatch ? timeMatch[1] : '日';
}

/**
 * 标准化地点名称用于Khớp
 */
function normalizeLocation(location: string): string {
  return cleanLocationString(location)
    .replace(/\s+/g, '')
    .replace(/[\uff08\uff09()]/g, '')
    .toLowerCase();
}

/**
 * 清理场景地点ký tự串，移除nhân vậtthông tin等无关内容
 */
function cleanLocationString(location: string): string {
  if (!location) return '';
  // 移除 "nhân vật：XXX" 部分
  let cleaned = location.replace(/\s*nhân vật[\uff1a:].*/g, '');
  // 移除 "角色：XXX" 部分
  cleaned = cleaned.replace(/\s*角色[\uff1a:].*/g, '');
  // 移除 "时间：XXX" 部分
  cleaned = cleaned.replace(/\s*时间[\uff1a:].*/g, '');
  // 去除首尾空白
  return cleaned.trim();
}

// ==================== 核心Hiệu chuẩn函数 ====================

/**
 * AI Hiệu chuẩnTất cả场景（nhẹchế độ）
 * 
 * 【重要】此函数只补充hiện có场景的美术Thiết kếthông tin，不改变：
 * - 场景列表（不新增、不删除、不合并）
 * - 场景thứ tự
 * - viewpoints（Ảnh ghép đa góc nhìndữ liệu）
 * - sceneIds、shotIds 等关联dữ liệu
 */
export async function calibrateScenes(
  currentScenes: ScriptScene[],
  background: ProjectBackground,
  episodeScripts: EpisodeRawScript[],
  _options?: CalibrationOptions // 不再需要，保留以tương thích
): Promise<SceneCalibrationResult> {
  
  // 【nhẹchế độ】Trực tiếpSử dụng currentScenes，不重新统计
  if (!currentScenes || currentScenes.length === 0) {
    console.warn('[calibrateScenes] currentScenes 为空，无法Hiệu chuẩn');
    return {
      scenes: [],
      mergeRecords: [],
      analysisNotes: '场景列表为空',
    };
  }
  
  console.log('[calibrateScenes] nhẹchế độ：为', currentScenes.length, 'hiện có场景补充美术Thiết kế');
  
  // 1. thu thập场景的动作描写样本（用于推断đạo cụ）
  const stats = collectSceneStats(episodeScripts);
  
  // 2. 准备场景批处理 items（每场景带上统计thông tin）
  const batchItems = currentScenes.map((scene) => {
    const normalizedLoc = scene.location?.replace(/\s+/g, '').toLowerCase() || '';
    let sceneStat: SceneStats | undefined;
    for (const [key, stat] of stats) {
      if (key.includes(normalizedLoc) || normalizedLoc.includes(key) || 
          stat.name === scene.name || stat.location === scene.location) {
        sceneStat = stat;
        break;
      }
    }
    return {
      sceneId: scene.id,
      name: scene.name || scene.location,
      location: scene.location,
      characters: sceneStat?.characters?.slice(0, 5).join(', ') || '未知',
      appearCount: sceneStat?.appearanceCount || 1,
      episodes: sceneStat?.episodeNumbers?.join(',') || '1',
      actionSamples: sceneStat?.actionSamples?.slice(0, 3) || [],
      dialogueSamples: sceneStat?.dialogueSamples?.slice(0, 2) || [],
    };
  });
  
  // 2.5 注入剧级上下文
  const store = useScriptStore.getState();
  const activeProjectId = store.activeProjectId;
  const seriesMeta = activeProjectId ? store.projects[activeProjectId]?.seriesMeta : null;
  const seriesCtx = buildSeriesContextSummary(seriesMeta || null);
  const seriesCtxBlock = seriesCtx ? `\n\n${seriesCtx}\n` : '';

  // 3. 构建共享的 system prompt
  const systemPrompt = `你是chuyên nghiệp的影视美术指导和场景Thiết kế师，擅长为hiện có场景补充chuyên nghiệp的Thị giácThiết kế方案。${seriesCtxBlock}

【核心任务】
为以下场景补充美术Thiết kếthông tin，用于Tạo场景概念图。

【重要约束】
1. **不新增场景** - 只处理列表đang xử lý...
2. **不删除场景** - 即使是chuyển tiếp场景也保留
3. **不合并场景** - 只记录“合并gợi ý”，不自行合并
4. **保持gốc sceneId** - 必须原样返回

【场景Thiết kế要素 - 必须基于动作描写推断】
为每场景补充：
- Phong cách kiến trúc、光影Thiết kế、色彩基调
- **quan trọngđạo cụ**：必须根据「动作描写」推断
- Bố cục không gian、thời đại特征、importance 分类

请以JSON格式返回分析kết quả。`;

  // 共享的背景上下文
  const outlineContext = safeTruncate(background.outline || '', 1500);

  try {
    // 闭包thu thập跨批次的聚合trường
    const allMergeRecords: SceneMergeRecord[] = [];
    const allAnalysisNotes: string[] = [];
    
    const { results: sceneResults, failedBatches } = await processBatched<
      typeof batchItems[number],
      any
    >({
      items: batchItems,
      feature: 'script_analysis',
      buildPrompts: (batch) => {
        const sceneList = batch.map((s, i) => {
          const actionInfo = s.actionSamples.length
            ? `\n   动作描写: ${s.actionSamples.join('; ')}`
            : '';
          const dialogueInfo = s.dialogueSamples.length
            ? `\n   Thoại样本: ${s.dialogueSamples.join('; ')}`
            : '';
          return `${i + 1}. [sceneId: ${s.sceneId}] ${s.name}\n   地点: ${s.location} [出场${s.appearCount}次,  tập数${s.episodes}]\n   角色: ${s.characters}${actionInfo}${dialogueInfo}`;
        }).join('\n\n');
        
        const user = `【剧本thông tin】
tên phim：《${background.title}》
${background.genre ? `类型：${background.genre}` : ''}
${background.era ? `thời đại：${background.era}` : ''}
${background.storyStartYear ? `Năm câu chuyện：${background.storyStartYear}年${background.storyEndYear && background.storyEndYear !== background.storyStartYear ? ` - ${background.storyEndYear}年` : ''}` : ''}
${background.timelineSetting ? `时间线：${background.timelineSetting}` : ''}
${background.worldSetting ? `Bối cảnh thế giới：${safeTruncate(background.worldSetting, 200)}` : ''}
总 tập数：${episodeScripts.length} tập

【故事đại cương】
${outlineContext || '无'}

【hiện có场景列表 - 请为每场景补充美术Thiết kế】（共${batch.length}）
${sceneList}

【输出规则】
1. 必须返回每场景的 sceneId（与输入完全一致）
2. keyProps 必须从动作描写中提取
3. 合并gợi ý放在 mergeRecords

请返回JSON格式：
{
  "scenes": [
    {
      "sceneId": "gốc场景ID",
      "name": "场景名称",
      "location": "具体地点",
      "importance": "main/secondary/transition",
      "architectureStyle": "Phong cách kiến trúc",
      "lightingDesign": "光影Thiết kế",
      "colorPalette": "色彩基调",
      "keyProps": ["đạo cụ1", "đạo cụ2"],
      "spatialLayout": "Bố cục không gian",
      "eraDetails": "thời đại特征",
      "atmosphere": "氛围"
    }
  ],
  "mergeRecords": [],
  "analysisNotes": "分析说明"
}`;
        return { system: systemPrompt, user };
      },
      parseResult: (raw) => {
        // 增强容错的 JSON Phân tích
        let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const jsonStart = cleaned.indexOf('{');
        const jsonEnd = cleaned.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
        }
        
        let batchParsed: { scenes?: any[]; mergeRecords?: any[]; analysisNotes?: string } = { scenes: [] };
        try {
          batchParsed = JSON.parse(cleaned);
        } catch (parseErr) {
          console.warn('[calibrateScenes] 批次JSONPhân tích thất bại，尝试部分Phân tích...');
          const partialScenes: any[] = [];
          const scenePattern = /\{\s*"sceneId"\s*:\s*"([^"]+)"[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
          let match;
          while ((match = scenePattern.exec(raw)) !== null) {
            try {
              const sceneObj = JSON.parse(match[0]);
              if (sceneObj.sceneId) partialScenes.push(sceneObj);
            } catch { /* skip */ }
          }
          if (partialScenes.length > 0) {
            batchParsed = { scenes: partialScenes, mergeRecords: [], analysisNotes: '部分Phân tích' };
          } else {
            throw parseErr;
          }
        }
        
        // thu thập聚合trường
        allMergeRecords.push(...(batchParsed.mergeRecords || []));
        if (batchParsed.analysisNotes) allAnalysisNotes.push(batchParsed.analysisNotes);
        
        // 返回 Map<sceneId, 场景dữ liệu>
        const map = new Map<string, any>();
        for (const s of (batchParsed.scenes || [])) {
          if (s.sceneId) {
            map.set(s.sceneId, s);
          }
          // 备用：用 location/name 映射
          if (s.location) map.set('loc:' + normalizeLocation(s.location), s);
          if (s.name) map.set('loc:' + normalizeLocation(s.name), s);
        }
        return map;
      },
      estimateItemTokens: (item) => estimateTokens(
        `${item.name} ${item.location} ${item.characters} ` +
        item.actionSamples.join(' ') + ' ' + item.dialogueSamples.join(' ')
      ),
      estimateItemOutputTokens: () => 300,
    });
    
    if (failedBatches > 0) {
      console.warn(`[SceneCalibrator] ${failedBatches} 批次thất bại，Sử dụng部分kết quả`);
    }
    
    console.log('[calibrateScenes] AI 返回', sceneResults.size, '场景kết quả');
    
    // 【quan trọng】按gốcthứ tự遍历 currentScenes，只更新美术trường
    const scenes: CalibratedScene[] = currentScenes.map((orig, i) => {
      let aiData = sceneResults.get(orig.id);
      if (!aiData) aiData = sceneResults.get('loc:' + normalizeLocation(orig.location || ''));
      if (!aiData) aiData = sceneResults.get('loc:' + normalizeLocation(orig.name || ''));
      
      const matched = !!aiData;
      console.log(`[calibrateScenes] 场景 #${i + 1} "${orig.name || orig.location}" (${orig.id}) -> AI Khớp: ${matched ? '✓' : '✗'}`);
      
      return {
        id: orig.id,
        name: orig.name || orig.location,
        location: orig.location,
        time: orig.time || 'day',
        atmosphere: aiData?.atmosphere || orig.atmosphere || 'Bình tĩnh',
        importance: aiData?.importance || (orig as any).importance || 'secondary',
        episodeNumbers: (orig as any).episodeNumbers || [],
        appearanceCount: (orig as any).appearanceCount || 1,
        architectureStyle: aiData?.architectureStyle || (orig as any).architectureStyle,
        lightingDesign: aiData?.lightingDesign || (orig as any).lightingDesign,
        colorPalette: aiData?.colorPalette || (orig as any).colorPalette,
        keyProps: aiData?.keyProps || (orig as any).keyProps,
        spatialLayout: aiData?.spatialLayout || (orig as any).spatialLayout,
        eraDetails: aiData?.eraDetails || (orig as any).eraDetails,
        nameVariants: [orig.name || orig.location],
      };
    });
    
    // 为主要场景Tạochuyên nghiệpThị giác提示词
    const enrichedScenes = await enrichScenesWithVisualPrompts(
      scenes,
      background,
      _options?.promptLanguage || 'zh+en'
    );
    
    return {
      scenes: enrichedScenes,
      mergeRecords: allMergeRecords,
      analysisNotes: allAnalysisNotes.join('; ') || '',
    };
  } catch (error) {
    console.error('[SceneCalibrator] AIHiệu chuẩnthất bại:', error);
    const fallbackScenes: CalibratedScene[] = Array.from(stats.values())
      .sort((a, b) => b.appearanceCount - a.appearanceCount)
      .map((s, i) => ({
        id: `scene_${i + 1}`,
        name: s.name,
        location: s.location,
        time: s.times[0] || 'day',
        atmosphere: 'Bình tĩnh',
        importance: (s.appearanceCount >= 5 ? 'main' : 
                    s.appearanceCount >= 2 ? 'secondary' : 'transition') as any,
        episodeNumbers: s.episodeNumbers,
        appearanceCount: s.appearanceCount,
        nameVariants: [s.name],
      }));
    
    return {
      scenes: fallbackScenes,
      mergeRecords: [],
      analysisNotes: 'AIHiệu chuẩnthất bại，返回基于统计的kết quả',
    };
  }
}

/**
 * AI Hiệu chuẩn单 tập场景
 */
export async function calibrateEpisodeScenes(
  episodeIndex: number,
  currentScenes: ScriptScene[],
  background: ProjectBackground,
  episodeScripts: EpisodeRawScript[],
  options: CalibrationOptions
): Promise<SceneCalibrationResult> {
  // 找到该 tập的剧本
  const episodeScript = episodeScripts.find(ep => ep.episodeIndex === episodeIndex);
  if (!episodeScript) {
    throw new Error(`找不到第 ${episodeIndex}  tập的剧本`);
  }
  
  // 只Hiệu chuẩn该 tập的场景
  const singleEpisodeScripts = [episodeScript];
  
  // 复用全局Hiệu chuẩn逻辑，但只传入单 tậpdữ liệu
  return calibrateScenes(currentScenes, background, singleEpisodeScripts, options);
}

// ==================== chuyên nghiệpThị giácThiết kế ====================

/**
 * 为主要场景Tạochuyên nghiệp的Thị giác提示词
 */
async function enrichScenesWithVisualPrompts(
  scenes: CalibratedScene[],
  background: ProjectBackground,
  promptLanguage: PromptLanguage = 'zh+en'
): Promise<CalibratedScene[]> {
  // 只为主要场景和次要场景Tạo详细提示词
  const keyScenes = scenes.filter(s => 
    s.importance === 'main' || s.importance === 'secondary'
  );
  
  if (keyScenes.length === 0) {
    return scenes;
  }
  
  console.log(`[enrichScenesWithVisualPrompts] 为 ${keyScenes.length} quan trọng场景Tạochuyên nghiệp提示词...`);
  
  const systemPrompt = `你是好莱坞顶级美术指导，曾为《盗梦空间》《布达佩斯大饭店》等电影Thiết kế场景。

你的chuyên nghiệp能力：
- **空间美学**：懂得如何用bố cục、光影、色彩传达情绪
- **thời đại还原**：准确把握不同thập niên的建筑和室内装饰特征
- **AI图像Tạo**：深谙 Midjourney、DALL-E 等 AI 绘图模型的最佳提示词写法
- **电影Ngôn ngữ**：理解场景如何为tự sự服务

【剧本thông tin】
tên phim：《${background.title}》
类型：${background.genre || '未知类型'}
thời đại：${background.era || '未知'}

【故事đại cương】
${background.outline?.slice(0, 1000) || '无'}

【任务】
为以下场景Tạochuyên nghiệp的Thị giác提示词：

${keyScenes.map((s, i) => `${i+1}. ${s.name}
   - 重要性：${s.importance === 'main' ? '主场景' : '次要场景'}
   - Phong cách kiến trúc: ${s.architectureStyle || '未知'}
   - 光影：${s.lightingDesign || '未知'}
   - 色彩：${s.colorPalette || '未知'}
   - đạo cụ：${s.keyProps?.join(', ') || '未知'}
   - thời đại：${s.eraDetails || '未知'}`).join('\n\n')}

【输出要求】
为每场景Tạo：
${promptLanguage !== 'en' ? '- đang xử lý...Mô tả（100-150字，包含空间感、氛围、细节）' : ''}
${promptLanguage !== 'zh' ? '- 英文Thị giác提示词（50-80词，适合AI图像Tạo，包含风格、光影、bố cục）' : ''}

请返回JSON格式：
{
  "scenes": [
    {
      "name": "场景名"${promptLanguage !== 'en' ? ',\n      "visualPromptZh": "đang xử lý...Mô tả"' : ''}${promptLanguage !== 'zh' ? ',\n      "visualPromptEn": "English visual prompt for AI image generation"' : ''}
    }
  ]
}`;

  try {
    // 统一从ánh xạ dịch vụ获取配置
    const result = await callFeatureAPI('script_analysis', systemPrompt, '请为以上场景Tạochuyên nghiệpThị giác提示词');
    
    // Phân tíchkết quả
    let cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }
    
    const parsed = JSON.parse(cleaned);
    const designMap = new Map<string, any>();
    for (const s of (parsed.scenes || [])) {
      designMap.set(s.name, s);
    }
    
    // 合并到场景dữ liệu
    return scenes.map(s => {
      const design = designMap.get(s.name);
      if (design) {
        return {
          ...s,
          visualPromptZh: design.visualPromptZh,
          visualPromptEn: design.visualPromptEn,
        };
      }
      return s;
    });
  } catch (error) {
    console.error('[enrichScenesWithVisualPrompts] Tạothất bại:', error);
    return scenes;
  }
}

// ==================== 转换函数 ====================

/**
 * 将Hiệu chuẩnkết quả转换回 ScriptScene 格式
 */
export function convertToScriptScenes(
  calibrated: CalibratedScene[],
  originalScenes?: ScriptScene[],
  promptLanguage: PromptLanguage = 'zh+en',
): ScriptScene[] {
  return calibrated.map(c => {
    // 查找gốc场景dữ liệu
    const original = originalScenes?.find(orig => 
      orig.name === c.name || 
      orig.location === c.location ||
      normalizeLocation(orig.location) === normalizeLocation(c.location)
    );
    
    // 清理地点ký tự串
    const cleanedLocation = cleanLocationString(c.location);
    const nextVisualPromptZh = c.visualPromptZh || original?.visualPrompt;
    const nextVisualPromptEn = c.visualPromptEn || original?.visualPromptEn;
    
    return {
      // 保留gốctrường
      ...original,
      // 更新/补充 AI Hiệu chuẩn的trường
      id: original?.id || c.id,
      name: c.name,
      location: cleanedLocation,
      time: c.time,
      atmosphere: c.atmosphere,
      // chuyên nghiệp场景Thiết kếtrường
      visualPrompt: promptLanguage === 'en' ? undefined : nextVisualPromptZh,
      visualPromptEn: promptLanguage === 'zh' ? undefined : nextVisualPromptEn,
      architectureStyle: c.architectureStyle,
      lightingDesign: c.lightingDesign,
      colorPalette: c.colorPalette,
      keyProps: c.keyProps,
      spatialLayout: c.spatialLayout,
      eraDetails: c.eraDetails,
      // 出场统计
      episodeNumbers: c.episodeNumbers,
      appearanceCount: c.appearanceCount,
      importance: c.importance,
      // 标签
      tags: [
        c.importance,
        `出场${c.appearanceCount}次`,
        ...(c.keyProps || []).slice(0, 3),
      ],
      // 【修复】保留gốc场景的 viewpoints dữ liệu（AIgóc nhìn分析kết quả）
      viewpoints: original?.viewpoints,
    };
  });
}

/**
 * 按重要性排序场景
 */
export function sortByImportance(scenes: CalibratedScene[]): CalibratedScene[] {
  const order = { main: 0, secondary: 1, transition: 2 };
  return [...scenes].sort((a, b) => {
    // 先按重要性
    const importanceOrder = order[a.importance] - order[b.importance];
    if (importanceOrder !== 0) return importanceOrder;
    // 再按出场次数
    return b.appearanceCount - a.appearanceCount;
  });
}
