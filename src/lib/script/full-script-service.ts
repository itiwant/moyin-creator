// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Full Script Service - đầy đủ剧本Nhập和按 tập分镜Tạo服务
 * 
 * 核心chức năng：
 * 1. Nhập kịch bản đầy đủ（包含đại cương、nhân vật小传、60 tập内容）
 * 2. 按 tậpTạo分镜（一次Tạo一 tập）
 * 3. 更新单 tập或Tất cả分镜
 * 4. AIHiệu chuẩn：为thiếu标题的 tập数Tạo标题
 */

import type {
  EpisodeRawScript,
  ProjectBackground,
  PromptLanguage,
  ScriptData,
  Shot,
  SceneRawContent,
} from "@/types/script";
import {
  parseFullScript,
  convertToScriptData,
  parseScenes,
} from "./episode-parser";
import { normalizeScriptFormat, analyzeScriptStructureWithAI, applyAIAnalysis, preprocessLineBreaks } from "./script-normalizer";
import { populateSeriesMetaFromImport } from "./series-meta-sync";
import { callFeatureAPI } from "@/lib/ai/feature-router";
import { processBatched } from "@/lib/ai/batch-processor";
import { useScriptStore } from "@/stores/script-store";
import { useCharacterLibraryStore } from "@/stores/character-library-store";
import { useAPIConfigStore } from "@/stores/api-config-store";
import { retryOperation } from "@/lib/utils/retry";
import { ApiKeyManager } from "@/lib/api-key-manager";
import { getStyleDescription, getMediaType } from "@/lib/constants/visual-styles";
import { buildCinematographyGuidance } from "@/lib/constants/cinematography-profiles";
import { getMediaTypeGuidance } from "@/lib/generation/media-type-tokens";
import { getVariationForEpisode } from "./character-stage-analyzer";
import { analyzeSceneViewpoints, type ViewpointAnalysisOptions } from "./viewpoint-analyzer";
import { runStaggered } from "@/lib/utils/concurrency";
import { calibrateShotsMultiStage } from "./shot-calibration-stages";
import { buildSeriesContextSummary } from "./series-meta-sync";

export interface ImportResult {
  success: boolean;
  background: ProjectBackground | null;
  projectBackground?: ProjectBackground; // tương thíchtrường
  episodes: EpisodeRawScript[];
  scriptData: ScriptData | null;
  error?: string;
}

export interface GenerateShotsOptions {
  apiKey: string;
  provider: string;
  baseUrl?: string;
  styleId: string;
  targetDuration: string;
  promptLanguage?: import('@/types/script').PromptLanguage;
}

export interface GenerateEpisodeShotsResult {
  shots: Shot[];
  viewpointAnalyzed: boolean;
  viewpointSkippedReason?: string;
}

/**
 * Nhập kịch bản đầy đủ
 * @param fullText đầy đủ剧本文本
 * @param projectId 项目ID
 */
export async function importFullScript(
  fullText: string,
  projectId: string,
  importSettings?: { styleId?: string; promptLanguage?: PromptLanguage }
): Promise<ImportResult> {
  try {
    // -1. 预处理：为单行/超长行文本Tự động插入换行
    const preprocessed = preprocessLineBreaks(fullText);
    const processedText = preprocessed.text;
    
    // 0. AI Cấu trúc检测（第一步）→ 正则兗底
    let normalizeResult;
    const aiAnalysis = await analyzeScriptStructureWithAI(processedText);
    
    if (aiAnalysis) {
      // AI 检测成功：基于 AI kết quả插入标记 + bổ sungđại cương
      normalizeResult = applyAIAnalysis(processedText, aiAnalysis);
      console.log('[importFullScript] AI Cấu trúc检测hoàn thành:', normalizeResult.changes);
    } else {
      // AI không khả dụng或thất bại：降级到正则兗底
      normalizeResult = normalizeScriptFormat(processedText);
      if (normalizeResult.changes.length > 0) {
        console.log('[importFullScript] 正则兜底归一化:', normalizeResult.changes);
      }
    }
    
    // 1. Phân tích归一化后的文本
    const { background, episodes } = parseFullScript(normalizeResult.normalized);
    
    if (episodes.length === 0) {
      return {
        success: false,
        background: null,
        episodes: [],
        scriptData: null,
        error: "未能Phân tích出任何 tập数，请检查剧本格式",
      };
    }
    
    // 1.5 用 AI 的 era/genre Ghi đè正则检测值（AI 更准确）
    if (normalizeResult.aiAnalysis) {
      if (normalizeResult.aiAnalysis.era) {
        background.era = normalizeResult.aiAnalysis.era;
      }
      if (normalizeResult.aiAnalysis.genre) {
        background.genre = normalizeResult.aiAnalysis.genre;
      }
    }
    
    // 2. 转换为 ScriptData 格式
    const scriptData = convertToScriptData(background, episodes);
    
    // 3. 保存到 store（原文保存，归一化文本仅用于Phân tích）
    const store = useScriptStore.getState();
    store.setProjectBackground(projectId, background);
    store.setEpisodeRawScripts(projectId, episodes);
    store.setScriptData(projectId, scriptData);
    store.setRawScript(projectId, fullText);
    store.setParseStatus(projectId, "ready");
    
    // 4. 构建剧级元dữ liệu（SeriesMeta）— 用户选的风格和Ngôn ngữTrực tiếp传入
    const aiResult = normalizeResult.aiAnalysis || null;
    const seriesMeta = populateSeriesMetaFromImport(background, scriptData, aiResult, importSettings);
    store.setSeriesMeta(projectId, seriesMeta);
    
    // 5. Tự độngTạo项目元dữ liệu MD（作为 AI Tạo的全局Tham chiếu）
    const metadataMd = exportProjectMetadata(projectId);
    store.setMetadataMarkdown(projectId, metadataMd);
    console.log('[importFullScript] 元dữ liệu已Tự độngTạo，长度:', metadataMd.length);
    
    return {
      success: true,
      background,
      projectBackground: background, // 同时返回两trườngtương thích
      episodes,
      scriptData,
    };
  } catch (error) {
    console.error("Import error:", error);
    return {
      success: false,
      background: null,
      episodes: [],
      scriptData: null,
      error: error instanceof Error ? error.message : "Nhậpthất bại",
    };
  }
}

// ==================== 单 tậpCấu trúcbổ sung ====================

export interface SingleEpisodeImportResult {
  success: boolean;
  sceneCount: number;
  error?: string;
}

/**
 * 单 tậpCấu trúcbổ sung — Phân tích用户粘贴的单 tập剧本内容为场景Cấu trúc
 *
 * 流程：
 * 1. preprocessLineBreaks → parseScenes → 转换为 ScriptScene[]
 * 2. 原子写回 store（episodeRawScripts + scriptData.scenes + episodes.sceneIds）
 * 3. 清理本 tập旧 shot
 * 4. 轻量 AI Tạo标题+đại cương（后台不阻塞）
 */
export async function importSingleEpisodeContent(
  rawContent: string,
  episodeIndex: number,
  projectId: string,
): Promise<SingleEpisodeImportResult> {
  const TAG = '[importSingleEpisodeContent]';

  try {
    const store = useScriptStore.getState();
    const project = store.projects[projectId];
    if (!project?.scriptData) {
      return { success: false, sceneCount: 0, error: '项目或剧本dữ liệukhông tồn tại' };
    }

    const scriptData = project.scriptData;
    const episode = scriptData.episodes.find(e => e.index === episodeIndex);
    if (!episode) {
      return { success: false, sceneCount: 0, error: `找不到第 ${episodeIndex}  tập` };
    }

    // === 1. 预处理 + 场景Phân tích ===
    const preprocessed = preprocessLineBreaks(rawContent);
    const rawScenes = parseScenes(preprocessed.text);
    console.log(`${TAG} Phân tích出 ${rawScenes.length} 场景`);

    if (rawScenes.length === 0) {
      // 没有场景头也更新 rawContent
      store.updateEpisodeRawScript(projectId, episodeIndex, {
        rawContent,
        scenes: [],
      });
      return { success: true, sceneCount: 0 };
    }

    // === 2. SceneRawContent → ScriptScene ===
    const timestamp = Date.now();
    const timeMap: Record<string, string> = {
      '日': 'day', '夜': 'night', '晨': 'dawn', '暮': 'dusk',
      'Hoàng hôn': 'dusk', 'Bình minh': 'dawn', '清晨': 'dawn', '傍晚': 'dusk',
    };
    const newScenes = rawScenes.map((scene, idx) => {
      const sceneId = `scene_ep${episodeIndex}_${timestamp}_${idx + 1}`;
      const headerParts = scene.sceneHeader.split(/\s+/);
      const timeOfDay = headerParts[1] || '日';
      const hasInterior = headerParts[2] && /^(内|外|内\/外)$/.test(headerParts[2]);
      const locStart = hasInterior ? 3 : 2;
      let loc = headerParts.slice(locStart).join(' ') || headerParts[headerParts.length - 1] || '未知';
      loc = loc.replace(/\s*(?:nhân vật|角色)[：:].*/g, '').trim();

      let atmosphere = 'Bình tĩnh';
      if (/căng thẳng|危险|冲突|打斗|怒/.test(scene.content)) atmosphere = 'căng thẳng';
      else if (/ấm cúng|幸福|笑|欢/.test(scene.content)) atmosphere = 'ấm cúng';
      else if (/悲伤|哭|痛|泪/.test(scene.content)) atmosphere = 'Buồn bã';
      else if (/bí ẩn|阴森|黑暗/.test(scene.content)) atmosphere = 'bí ẩn';

      return {
        id: sceneId,
        name: `${episodeIndex}-${idx + 1} ${loc}`,
        location: loc,
        time: timeMap[timeOfDay] || 'day',
        atmosphere,
      };
    });
    const newSceneIds = newScenes.map(s => s.id);

    // === 3. 原子写回 store ===
    const oldSceneIds = new Set(episode.sceneIds);
    const remainingScenes = scriptData.scenes.filter(s => !oldSceneIds.has(s.id));
    const remainingShots = project.shots.filter(s => !oldSceneIds.has(s.sceneRefId));

    // 更新 episodeRawScript
    store.updateEpisodeRawScript(projectId, episodeIndex, {
      rawContent,
      scenes: rawScenes,
    });

    // 更新 scriptData（场景列表 + episode.sceneIds）
    store.setScriptData(projectId, {
      ...scriptData,
      scenes: [...remainingScenes, ...newScenes],
      episodes: scriptData.episodes.map(e =>
        e.index === episodeIndex ? { ...e, sceneIds: newSceneIds } : e
      ),
    });

    // 清理旧 shot
    if (remainingShots.length !== project.shots.length) {
      store.setShots(projectId, remainingShots);
      console.log(`${TAG} 清理旧 shot: ${project.shots.length - remainingShots.length} `);
    }

    console.log(`${TAG} Cấu trúcbổ sunghoàn thành: ${newScenes.length} 场景`);

    // === 4. 轻量 AI 标题+đại cương（后台不阻塞） ===
    generateSingleEpisodeTitleAndSynopsis(projectId, episodeIndex).catch(e => {
      console.warn(`${TAG} 标题/đại cươngTạothất bại（不影响Cấu trúcbổ sung）:`, e);
    });

    return { success: true, sceneCount: newScenes.length };
  } catch (error) {
    console.error('[importSingleEpisodeContent] Error:', error);
    return {
      success: false,
      sceneCount: 0,
      error: error instanceof Error ? error.message : 'Cấu trúcbổ sungthất bại',
    };
  }
}

/**
 * 轻量 AI 为单 tậpTạo标题+đại cương（后台任务，不阻塞Cấu trúcbổ sung）
 */
async function generateSingleEpisodeTitleAndSynopsis(
  projectId: string,
  episodeIndex: number,
): Promise<void> {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  if (!project) return;

  const epRaw = project.episodeRawScripts.find(e => e.episodeIndex === episodeIndex);
  if (!epRaw || !epRaw.rawContent) return;

  // hiện có有意义标题和đại cương则跳过
  const hasTitle = epRaw.title && !/^第[\d一二三四五六七八九十百千]+ tập$/.test(epRaw.title.trim());
  const hasSynopsis = !!(epRaw.synopsis && epRaw.synopsis.trim().length > 0);
  if (hasTitle && hasSynopsis) return;

  const background = project.projectBackground;
  const seriesCtx = buildSeriesContextSummary(project.seriesMeta || null);
  const contentSummary = epRaw.rawContent.slice(0, 800);

  const system = `你是剧本Cấu trúc分析专家。根据剧本全局背景和单 tập内容，Tạo该 tập的标题和đại cương。
${seriesCtx ? `\n【剧级知识Tham chiếu】\n${seriesCtx}\n` : ''}tên phim：${background?.title || project.scriptData?.title || '未命名'}
类型：${background?.genre || '未知'}
${background?.era ? `thời đại：${background.era}` : ''}

请以 JSON 格式返回：
{
  "title": "6-15字标题（体现本 tập核心冲突/转折）",
  "synopsis": "100-200字đại cương（概括本 tập主要剧情）",
  "keyEvents": ["Sự kiện quan trọng1", "Sự kiện quan trọng2", "Sự kiện quan trọng3"]
}`;

  const user = `第${episodeIndex} tập内容：\n${contentSummary}`;

  try {
    const result = await callFeatureAPI('script_analysis', system, user, {
      temperature: 0.3,
      maxTokens: 512,
    });
    if (!result) return;

    const jsonMatch = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const parsed = JSON.parse(jsonMatch[0]);
    const updates: Partial<EpisodeRawScript> = {};

    if (!hasTitle && parsed.title) {
      const fullTitle = `第${episodeIndex} tập：${parsed.title}`;
      updates.title = fullTitle;
      // 同步到 scriptData.episodes
      const cur = useScriptStore.getState();
      const sd = cur.projects[projectId]?.scriptData;
      if (sd) {
        cur.setScriptData(projectId, {
          ...sd,
          episodes: sd.episodes.map(e =>
            e.index === episodeIndex ? { ...e, title: fullTitle } : e
          ),
        });
      }
    }

    if (!hasSynopsis && parsed.synopsis) {
      updates.synopsis = parsed.synopsis;
      updates.keyEvents = parsed.keyEvents || [];
      updates.synopsisGeneratedAt = Date.now();
    }

    if (Object.keys(updates).length > 0) {
      useScriptStore.getState().updateEpisodeRawScript(projectId, episodeIndex, updates);
      console.log(`[generateSingleEpisodeTitleAndSynopsis] 第${episodeIndex} tập标题/đại cương已Tạo`);
    }
  } catch (e) {
    console.warn('[generateSingleEpisodeTitleAndSynopsis] AI gọi APIthất bại:', e);
  }
}

/**
 * 为单 tậpTạo分镜
 * @param episodeIndex  tậpchỉ mục（1-based）
 * @param projectId 项目ID
 * @param options TạoTùy chọn
 */
export async function generateEpisodeShots(
  episodeIndex: number,
  projectId: string,
  options: GenerateShotsOptions,
  onProgress?: (message: string) => void
): Promise<GenerateEpisodeShotsResult> {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  
  if (!project) {
    throw new Error("项目không tồn tại");
  }
  
  const episodeScript = project.episodeRawScripts.find(
    (ep) => ep.episodeIndex === episodeIndex
  );
  
  if (!episodeScript) {
    throw new Error(`找不到第 ${episodeIndex}  tập的剧本`);
  }
  
  // 更新 tập的Trạng thái tạo
  store.updateEpisodeRawScript(projectId, episodeIndex, {
    shotGenerationStatus: 'generating',
  });
  
  try {
    onProgress?.(`正在为第 ${episodeIndex}  tậpTạo分镜...`);
    
    // 获取该 tập对应的场景
    const scriptData = project.scriptData;
    if (!scriptData) {
      throw new Error("剧本dữ liệukhông tồn tại");
    }
    
    const episode = scriptData.episodes.find((ep) => ep.index === episodeIndex);
    if (!episode) {
      throw new Error(`找不到第 ${episodeIndex}  tập的Cấu trúcdữ liệu`);
    }
    
    const episodeScenes = scriptData.scenes.filter((s) =>
      episode.sceneIds.includes(s.id)
    );
    
    // 构建场景内容用于分镜Tạo
    const scenesWithContent = episodeScenes.map((scene, idx) => {
      const rawScene = episodeScript.scenes[idx];
      return {
        ...scene,
        // Sử dụnggốc内容Tạo分镜
        rawContent: rawScene?.content || '',
        dialogues: rawScene?.dialogues || [],
        actions: rawScene?.actions || [],
      };
    });
    
    // Tạo分镜
    const newShots = await generateShotsForEpisode(
      scenesWithContent,
      episodeIndex,
      episode.id,
      scriptData.characters,
      options,
      onProgress
    );
    
    // 更新hiện có分镜（移除该 tập旧分镜，Thêm新分镜）
    const existingShots = project.shots.filter(
      (shot) => shot.episodeId !== episode.id
    );
    const allShots = [...existingShots, ...newShots];
    
    store.setShots(projectId, allShots);
    
    // === AI góc nhìn分析（分镜Tạo后Tự động执行）===
    let viewpointAnalyzed = false;
    let viewpointSkippedReason: string | undefined;
    let analysisExecuted = false;
    let viewpointCount = 0;
    
    console.log('\n============================================');
    console.log('[generateEpisodeShots] === 开始 AI góc nhìn分析 ===');
    console.log('[generateEpisodeShots] apiKey:', options.apiKey ? `已配置(长度${options.apiKey.length})` : '未配置');
    console.log('[generateEpisodeShots] provider:', options.provider);
    console.log('[generateEpisodeShots] baseUrl:', options.baseUrl || '默认');
    console.log('[generateEpisodeShots] episodeScenes.length:', episodeScenes.length);
    console.log('[generateEpisodeShots] newShots.length:', newShots.length);
    console.log('============================================\n');
    
    if (!options.apiKey) {
      viewpointSkippedReason = 'apiKey 未配置';
      console.error('[generateEpisodeShots] ❌ 跳过 AI góc nhìn分析: apiKey 未配置');
    } else if (episodeScenes.length === 0) {
      viewpointSkippedReason = '无场景';
      console.warn('[generateEpisodeShots] ⚠️ 跳过 AI góc nhìn分析: 无场景');
    }
    
    if (options.apiKey && episodeScenes.length > 0) {
      onProgress?.(`正在 AI 分析场景góc nhìn（共 ${episodeScenes.length} 场景）...`);
      
      try {
        // 获取本 tậpđại cương和Sự kiện quan trọng
        const episodeSynopsis = episodeScript.synopsis || '';
        const keyEvents = episodeScript.keyEvents || [];
        
        console.log('[generateEpisodeShots] 本 tậpđại cương:', episodeSynopsis ? `已配置(${episodeSynopsis.length}字)` : '未配置');
        console.log('[generateEpisodeShots] Sự kiện quan trọng:', keyEvents.length > 0 ? keyEvents.join(', ') : '未配置');
        
        const background = project.projectBackground;
        const viewpointOptions: ViewpointAnalysisOptions = {
          episodeSynopsis,  // 传入本 tậpđại cương
          keyEvents,        // 传入Sự kiện quan trọng
          title: background?.title,
          genre: background?.genre,
          era: background?.era,
          worldSetting: background?.worldSetting,
        };
        
        console.log('[generateEpisodeShots] viewpointOptions 已构建, genre:', viewpointOptions.genre || '未知');
        
        // 获取并发数配置（Sử dụng顶部静态Nhập的 store）
        // 智谱 API 并发限制较严，góc nhìn分析最多Sử dụng 10 并发
        const userConcurrency = useAPIConfigStore.getState().concurrency || 1;
        const concurrency = Math.min(userConcurrency, 10);
        console.log(`[generateEpisodeShots] Sử dụng并发数: ${concurrency} (用户设置: ${userConcurrency}, 上限: 10)`);
        
        // 为每场景分析góc nhìn（支持并发）
        const updatedScenes = [...scriptData.scenes];
        
        // 准备场景分析任务
        const sceneAnalysisTasks = episodeScenes.map((scene, i) => ({
          scene,
          index: i,
          sceneShots: newShots.filter(s => s.sceneRefId === scene.id),
        })).filter(task => task.sceneShots.length > 0);
        
        console.log(`[generateEpisodeShots] 🚀 待分析场景: ${sceneAnalysisTasks.length} ，并发数: ${concurrency}`);
        
        // 处理单场景的函数
        const processScene = async (taskIndex: number) => {
          const task = sceneAnalysisTasks[taskIndex];
          const { scene, index: i, sceneShots } = task;
          
          console.log(`[generateEpisodeShots] 场景 ${i + 1}/${episodeScenes.length}: "${scene.location}" 有 ${sceneShots.length} 分镜`);
          analysisExecuted = true;
          onProgress?.(`AI 分析场景 ${i + 1}/${episodeScenes.length}: ${scene.location}...`);
          
          console.log(`[generateEpisodeShots] 🔄 gọi API analyzeSceneViewpoints for "${scene.location}"...`);
          const result = await analyzeSceneViewpoints(scene, sceneShots, viewpointOptions);
          console.log(`[generateEpisodeShots] ✅ AI 分析hoàn thành，返回 ${result.viewpoints.length} góc nhìn:`, 
            result.viewpoints.map(v => v.name).join(', '));
          console.log(`[generateEpisodeShots] 📝 analysisNote: ${result.analysisNote}`);
          
          return { scene, sceneShots, result };
        };
        
        // 错开启动的并发控制：每5秒启动一新任务，同时最多 concurrency 
        const settledResults = await runStaggered(
          sceneAnalysisTasks.map((_, taskIndex) => async () => {
            console.log(`[generateEpisodeShots] 🚀 启动场景 ${taskIndex + 1}/${sceneAnalysisTasks.length}`);
            return await processScene(taskIndex);
          }),
          concurrency,
          5000
        );
        
        // 处理Tất cảkết quả
        for (const settledResult of settledResults) {
          if (settledResult.status === 'fulfilled') {
            const { scene, sceneShots, result } = settledResult.value;
            
            // 更新场景的góc nhìndữ liệu
            const sceneIndex = updatedScenes.findIndex(s => s.id === scene.id);
            if (sceneIndex !== -1) {
              const viewpointsData = result.viewpoints.map((v: any, idx: number) => ({
                id: v.id,
                name: v.name,
                nameEn: v.nameEn,
                shotIds: v.shotIndexes.map((si: number) => sceneShots[si - 1]?.id).filter(Boolean),
                keyProps: v.keyProps,
                gridIndex: idx,
              }));
              
              // 检查是否有未分配的分镜，并将它们分配到合适的góc nhìn
              const allAssignedShotIds = new Set(viewpointsData.flatMap((v: any) => v.shotIds));
              const unassignedShots = sceneShots.filter((s: any) => !allAssignedShotIds.has(s.id));
              
              if (unassignedShots.length > 0) {
                console.log(`[generateEpisodeShots] ⚠️ Phát hiện ${unassignedShots.length} 未分配的分镜:`, unassignedShots.map((s: any) => s.id));
                
                // 策略：根据分镜内容thông minh分配到最Khớp的góc nhìn
                for (const shot of unassignedShots) {
                  const shotText = [
                    shot.actionSummary,
                    shot.visualDescription,
                    shot.visualFocus,
                    shot.dialogue,
                  ].filter(Boolean).join(' ').toLowerCase();
                  
                  // 查找最Khớp的góc nhìn
                  let bestViewpointIdx = 0;
                  let bestScore = 0;
                  
                  for (let vIdx = 0; vIdx < viewpointsData.length; vIdx++) {
                    const vp = viewpointsData[vIdx];
                    const vpName = vp.name.toLowerCase();
                    const vpKeywords = vp.keyProps || [];
                    
                    let score = 0;
                    const nameKeywords = vpName.replace(/(góc nhìn|区|位)$/g, '').split('');
                    for (const char of nameKeywords) {
                      if (shotText.includes(char)) score += 1;
                    }
                    for (const prop of vpKeywords) {
                      if (shotText.includes(prop.toLowerCase())) score += 2;
                    }
                    
                    if (score > bestScore) {
                      bestScore = score;
                      bestViewpointIdx = vIdx;
                    }
                  }
                  
                  if (bestScore === 0) {
                    const overviewIdx = viewpointsData.findIndex((v: any) => 
                      v.name.includes('全景') || v.id === 'overview'
                    );
                    bestViewpointIdx = overviewIdx >= 0 ? overviewIdx : 0;
                  }
                  
                  viewpointsData[bestViewpointIdx].shotIds.push(shot.id);
                  console.log(`[generateEpisodeShots]   - 分镜 ${shot.id} 分配到góc nhìn "${viewpointsData[bestViewpointIdx].name}" (score: ${bestScore})`);
                }
              }
              
              updatedScenes[sceneIndex] = {
                ...updatedScenes[sceneIndex],
                viewpoints: viewpointsData,
              };
              viewpointCount += viewpointsData.length;
              console.log(`[generateEpisodeShots] 💾 场景 "${scene.location}" viewpoints 已更新:`, viewpointsData);
            }
          } else {
            console.error(`[generateEpisodeShots] ❌ 场景分析thất bại:`, settledResult.reason);
          }
        }
        
        // 跳过无分镜的场景日志
        const skippedScenes = episodeScenes.filter(scene => 
          !sceneAnalysisTasks.find(t => t.scene.id === scene.id)
        );
        for (const scene of skippedScenes) {
          console.log(`[generateEpisodeShots] ⏭️ 跳过场景 "${scene.location}" (无分镜)`);
        }
        
        // 保存更新后的场景dữ liệu
        console.log('\n============================================');
        console.log('[generateEpisodeShots] 📦 保存 AI góc nhìn到 scriptData.scenes...');
        console.log('[generateEpisodeShots] updatedScenes đang xử lý...的场景:');
        updatedScenes.forEach(s => {
          if (s.viewpoints && s.viewpoints.length > 0) {
            console.log(`  - ${s.location}: ${s.viewpoints.length} góc nhìn [${s.viewpoints.map((v: any) => v.name).join(', ')}]`);
          }
        });
        
        store.setScriptData(projectId, {
          ...scriptData,
          scenes: updatedScenes,
        });
        
        console.log('[generateEpisodeShots] ✅ AI góc nhìn已保存到 store');
        console.log('[generateEpisodeShots] 总计 AI 分析góc nhìn数:', viewpointCount);
        console.log('============================================\n');
        
        viewpointAnalyzed = analysisExecuted;
        if (!analysisExecuted) {
          viewpointSkippedReason = '无分镜';
        }
        
        onProgress?.(`AI góc nhìn分析hoàn thành（${viewpointCount} góc nhìn）`);
      } catch (e) {
        const err = e as Error;
        console.error('\n============================================');
        console.error('[generateEpisodeShots] ❌ AI góc nhìn分析thất bại:', err);
        console.error('[generateEpisodeShots] Error name:', err.name);
        console.error('[generateEpisodeShots] Error message:', err.message);
        console.error('[generateEpisodeShots] Error stack:', err.stack);
        console.error('============================================\n');
        viewpointSkippedReason = `AI 分析thất bại: ${err.message}`;
        // 不影响主流程，但记录详细lỗi
      }
    }
    
    store.updateEpisodeRawScript(projectId, episodeIndex, {
      shotGenerationStatus: 'completed',
      lastGeneratedAt: Date.now(),
    });
    
    onProgress?.(`第 ${episodeIndex}  tập分镜Tạohoàn thành！共 ${newShots.length} 分镜`);
    
    return { shots: newShots, viewpointAnalyzed, viewpointSkippedReason };
  } catch (error) {
    store.updateEpisodeRawScript(projectId, episodeIndex, {
      shotGenerationStatus: 'error',
    });
    throw error;
  }
}

/**
 * 为指定 tập的场景Tạo分镜
 */
async function generateShotsForEpisode(
  scenes: Array<{
    id: string;
    name?: string;
    location: string;
    time: string;
    atmosphere: string;
    rawContent: string;
    dialogues: Array<{ character: string; parenthetical?: string; line: string }>;
    actions: string[];
  }>,
  episodeIndex: number,
  episodeId: string,
  characters: Array<{ id: string; name: string }>,
  options: GenerateShotsOptions,
  onProgress?: (message: string) => void
): Promise<Shot[]> {
  const shots: Shot[] = [];
  let shotIndex = 1;
  
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    onProgress?.(`处理场景 ${i + 1}/${scenes.length}: ${scene.name || scene.location}`);
    
    // 基于场景内容Tạo分镜
    const sceneShots = generateShotsFromSceneContent(
      scene,
      episodeId,
      shotIndex,
      characters
    );
    
    shots.push(...sceneShots);
    shotIndex += sceneShots.length;
  }
  
  return shots;
}

/**
 * 基于场景gốc内容Tạo分镜（规则化Tạo，不依赖AI）
 * 每Thoại或动作Tạo一分镜
 */
function generateShotsFromSceneContent(
  scene: {
    id: string;
    name?: string;
    location: string;
    time: string;
    atmosphere: string;
    rawContent: string;
    dialogues: Array<{ character: string; parenthetical?: string; line: string }>;
    actions: string[];
  },
  episodeId: string,
  startIndex: number,
  characters: Array<{ id: string; name: string }>
): Shot[] {
  const shots: Shot[] = [];
  let index = startIndex;
  
  // Phân tích场景内容，按thứ tựTạo分镜
  const lines = scene.rawContent.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // 跳过nhân vật行和空行（包括 markdown 格式如 **nhân vật：xxx**）
    if (!trimmedLine) continue;
    if (trimmedLine.startsWith('nhân vật') || trimmedLine.startsWith('**nhân vật')) continue;
    // 跳过纯 markdown 格式行（如 **xxx**）
    if (trimmedLine.match(/^\*\*[^nhân vật\*]+\*\*$/)) continue;
    
    // Thoại行
    const dialogueMatch = trimmedLine.match(/^([^：:（\([【\n△\*]{1,10})[：:]\s*(?:[（\(]([^）\)]+)[）\)])?\s*(.+)$/);
    if (dialogueMatch) {
      const charName = dialogueMatch[1].trim();
      const parenthetical = dialogueMatch[2]?.trim() || '';
      const dialogueText = dialogueMatch[3].trim();
      
      // 跳过非Thoại
      if (charName.match(/^[字幕旁白场景nhân vật]/)) continue;
      
      const charId = characters.find(c => c.name === charName)?.id || '';
      
      shots.push(createShot({
        index: index++,
        episodeId,
        sceneRefId: scene.id,
        actionSummary: `${charName}说话`,
        visualDescription: `${scene.location}，${charName}${parenthetical ? `（${parenthetical}）` : ''}说："${dialogueText.slice(0, 50)}${dialogueText.length > 50 ? '...' : ''}"`,
        dialogue: `${charName}${parenthetical ? `（${parenthetical}）` : ''}：${dialogueText}`,
        characterNames: [charName],
        characterIds: charId ? [charId] : [],
        shotSize: dialogueText.length > 30 ? 'MS' : 'CU',
        duration: Math.max(3, Math.ceil(dialogueText.length / 10)),
      }));
      continue;
    }
    
    // 动作行 (△开头)
    if (trimmedLine.startsWith('△')) {
      const actionText = trimmedLine.slice(1).trim();
      
      // 从动作Mô tảđang xử lý...能的角色
      const mentionedChars = characters.filter(c => 
        actionText.includes(c.name)
      );
      
      shots.push(createShot({
        index: index++,
        episodeId,
        sceneRefId: scene.id,
        // 保留đầy đủ的gốc动作文本，不要cắt ngắn，便于AIHiệu chuẩn时Sử dụng
        actionSummary: actionText,
        visualDescription: `${scene.location}，${actionText}`,
        characterNames: mentionedChars.map(c => c.name),
        characterIds: mentionedChars.map(c => c.id),
        shotSize: actionText.includes('全景') || actionText.includes('远') ? 'WS' : 'MS',
        duration: Math.max(2, Math.ceil(actionText.length / 15)),
        ambientSound: detectAmbientSound(actionText, scene.atmosphere),
      }));
      continue;
    }
    
    // 字幕【】
    if (trimmedLine.startsWith('【') && trimmedLine.endsWith('】')) {
      const subtitleText = trimmedLine.slice(1, -1);
      
      // 如果是闪回标记，Tạochuyển tiếp镜头
      if (subtitleText.includes('闪回')) {
        shots.push(createShot({
          index: index++,
          episodeId,
          sceneRefId: scene.id,
          actionSummary: subtitleText,
          visualDescription: `【${subtitleText}】画面渐变chuyển tiếp`,
          characterNames: [],
          characterIds: [],
          shotSize: 'WS',
          duration: 2,
        }));
        continue;
      }
      
      // 字幕显示
      if (subtitleText.startsWith('字幕')) {
        shots.push(createShot({
          index: index++,
          episodeId,
          sceneRefId: scene.id,
          actionSummary: '字幕显示',
          visualDescription: `画面叠加字幕：${subtitleText.replace('字幕：', '').replace('字幕:', '')}`,
          characterNames: [],
          characterIds: [],
          shotSize: 'WS',
          duration: 3,
        }));
      }
    }
  }
  
  // 如果场景没有Tạo任何分镜，tạo一默认的建立镜头
  if (shots.length === 0) {
    shots.push(createShot({
      index: index,
      episodeId,
      sceneRefId: scene.id,
      actionSummary: `${scene.name || scene.location} 建立镜头`,
      visualDescription: `${scene.location}，${scene.atmosphere}的氛围`,
      characterNames: [],
      characterIds: [],
      shotSize: 'WS',
      duration: 3,
      ambientSound: detectAmbientSound('', scene.atmosphere),
    }));
  }
  
  return shots;
}

/**
 * 根据 tập数Tự động匹nhân vật phụ色的阶段变体
 * 用于分镜Tạo时Tự độngChọn正确版本的角色（如第50 tậpTự động用张明đang xử lý...
 */
function matchCharacterVariationsForEpisode(
  characterIds: string[],
  episodeIndex: number
): Record<string, string> {
  const characterVariations: Record<string, string> = {};
  const charLibStore = useCharacterLibraryStore.getState();
  
  for (const charId of characterIds) {
    // 通过 characterLibraryId 查找角色库đang xử lý...
    // 注意：charId 是剧本đang xử lý...，需要找到关联的角色库角色
    const scriptStore = useScriptStore.getState();
    const projects = Object.values(scriptStore.projects);
    
    // 遍历项目找到角色
    for (const project of projects) {
      const scriptChar = project.scriptData?.characters.find(c => c.id === charId);
      if (scriptChar?.characterLibraryId) {
        const libChar = charLibStore.getCharacterById(scriptChar.characterLibraryId);
        if (libChar && libChar.variations.length > 0) {
          // 查找Khớp当前 tập数的阶段变体
          const matchedVariation = getVariationForEpisode(libChar.variations, episodeIndex);
          if (matchedVariation) {
            characterVariations[charId] = matchedVariation.id;
            console.log(`[VariationMatch] 角色 ${scriptChar.name} 第${episodeIndex} tập -> Sử dụng变体 "${matchedVariation.name}"`);
          }
        }
        break;
      }
    }
  }
  
  return characterVariations;
}

/**
 * 从 episodeId 提取 tập数
 */
function getEpisodeIndexFromId(episodeId: string): number {
  // episodeId 格式为 "ep_X"
  const match = episodeId.match(/ep_(\d+)/);
  return match ? parseInt(match[1], 10) : 1;
}

/**
 * tạo分镜对象
 */
function createShot(params: {
  index: number;
  episodeId: string;
  sceneRefId: string;
  actionSummary: string;
  visualDescription: string;
  dialogue?: string;
  characterNames: string[];
  characterIds: string[];
  shotSize: string;
  duration: number;
  ambientSound?: string;
  cameraMovement?: string;
}): Shot {
  // Tự động匹nhân vật phụ色阶段变体
  const episodeIndex = getEpisodeIndexFromId(params.episodeId);
  const characterVariations = matchCharacterVariationsForEpisode(
    params.characterIds,
    episodeIndex
  );
  
  return {
    id: `shot_${Date.now()}_${params.index}`,
    index: params.index,
    episodeId: params.episodeId,
    sceneRefId: params.sceneRefId,
    actionSummary: params.actionSummary,
    visualDescription: params.visualDescription,
    dialogue: params.dialogue,
    characterNames: params.characterNames,
    characterIds: params.characterIds,
    characterVariations,  // Tự động填充的阶段变体映射
    shotSize: params.shotSize,
    duration: params.duration,
    ambientSound: params.ambientSound,
    cameraMovement: params.cameraMovement || 'Static',
    imageStatus: 'idle',
    imageProgress: 0,
    videoStatus: 'idle',
    videoProgress: 0,
  };
}

/**
 * 检测环境音
 */
function detectAmbientSound(text: string, atmosphere: string): string {
  if (text.includes('雨') || atmosphere.includes('雨')) return '雨声';
  if (text.includes('风') || atmosphere.includes('风')) return '风声';
  if (text.includes('海') || text.includes('码头')) return '海浪声、海鸥声';
  if (text.includes('街') || text.includes('市场')) return '街道喧嚣、人声鼎沸';
  if (text.includes('夜') || atmosphere.includes('夜')) return 'ban đêm寂静、虫鸣';
  if (text.includes('饭') || text.includes('吃')) return '餐具碰撞声';
  return '环境音';
}

/**
 * 更新Tất cả tập的分镜
 */
export async function regenerateAllEpisodeShots(
  projectId: string,
  options: GenerateShotsOptions,
  onProgress?: (current: number, total: number, message: string) => void
): Promise<void> {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  
  if (!project || !project.episodeRawScripts.length) {
    throw new Error("没有可Tạo的 tập");
  }
  
  const totalEpisodes = project.episodeRawScripts.length;
  
  for (let i = 0; i < totalEpisodes; i++) {
    const ep = project.episodeRawScripts[i];
    onProgress?.(i + 1, totalEpisodes, `正在Tạo第 ${ep.episodeIndex}  tập...`);
    
    await generateEpisodeShots(
      ep.episodeIndex,
      projectId,
      options,
      (msg) => onProgress?.(i + 1, totalEpisodes, msg)
    );
  }
}

/**
 * 获取 tập的Trạng thái tạo摘要
 */
export function getEpisodeGenerationSummary(projectId: string): {
  total: number;
  completed: number;
  generating: number;
  idle: number;
  error: number;
} {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  
  if (!project) {
    return { total: 0, completed: 0, generating: 0, idle: 0, error: 0 };
  }
  
  const episodes = project.episodeRawScripts;
  return {
    total: episodes.length,
    completed: episodes.filter(ep => ep.shotGenerationStatus === 'completed').length,
    generating: episodes.filter(ep => ep.shotGenerationStatus === 'generating').length,
    idle: episodes.filter(ep => ep.shotGenerationStatus === 'idle').length,
    error: episodes.filter(ep => ep.shotGenerationStatus === 'error').length,
  };
}

// ==================== AI Hiệu chuẩnchức năng ====================

// CalibrationOptions 已不需要，统一从ánh xạ dịch vụ获取配置
export interface CalibrationOptions {
  // 保Để trốnggiao diện以保持tương thích性
}

export interface CalibrationResult {
  success: boolean;
  calibratedCount: number;
  totalMissing: number;
  error?: string;
}

/**
 * 检查 tập数是否thiếu标题
 * thiếu标题的判断标准：标题为空，或只有"第X tập"没有冒号后的内容
 */
function isMissingTitle(title: string): boolean {
  if (!title || title.trim() === '') return true;
  // Khớp "第X tập" 或 "第XX tập" 但没有后续标题
  const onlyEpisodeNum = /^第[\d一二三四五六七八九十百千]+ tập$/;
  return onlyEpisodeNum.test(title.trim());
}

/**
 * 获取thiếu标题的 tập数列表
 */
export function getMissingTitleEpisodes(projectId: string): EpisodeRawScript[] {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  
  if (!project || !project.episodeRawScripts.length) {
    return [];
  }
  
  return project.episodeRawScripts.filter(ep => isMissingTitle(ep.title));
}


/**
 * 从 tập内容đang xử lý...要
 */
function extractEpisodeSummary(episode: EpisodeRawScript): string {
  const parts: string[] = [];
  
  // 取前3场景的内容摘要
  const scenesToUse = episode.scenes.slice(0, 3);
  for (const scene of scenesToUse) {
    // 场景thông tin（Sử dụng sceneHeader 代替 location）
    if (scene.sceneHeader) {
      parts.push(`场景：${scene.sceneHeader}`);
    }
    
    // 取前几条Thoại
    const dialogueSample = scene.dialogues.slice(0, 3).map(d => 
      `${d.character}：${d.line.slice(0, 30)}`
    ).join('\n');
    if (dialogueSample) {
      parts.push(dialogueSample);
    }
    
    // 取前几动作描写
    const actionSample = scene.actions.slice(0, 2).map(a => a.slice(0, 50)).join('\n');
    if (actionSample) {
      parts.push(actionSample);
    }
  }
  
  // 限制总长度
  const summary = parts.join('\n').slice(0, 800);
  return summary || '（无内容）';
}

/**
 * AIHiệu chuẩn：为thiếu标题的 tập数Tạo标题
 * @param projectId 项目ID
 * @param options AI配置
 * @param onProgress Tiến độ回调
 */
export async function calibrateEpisodeTitles(
  projectId: string,
  _options?: CalibrationOptions, // 不再需要，保留以tương thích
  onProgress?: (current: number, total: number, message: string) => void
): Promise<CalibrationResult> {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  
  if (!project) {
    return { success: false, calibratedCount: 0, totalMissing: 0, error: '项目không tồn tại' };
  }
  
  // 找出thiếu标题的 tập数
  const missingEpisodes = getMissingTitleEpisodes(projectId);
  const totalMissing = missingEpisodes.length;
  
  if (totalMissing === 0) {
    return { success: true, calibratedCount: 0, totalMissing: 0 };
  }
  
  onProgress?.(0, totalMissing, `找到 ${totalMissing}  tậpthiếu标题，开始Hiệu chuẩn...`);
  
  // 获取全局背景thông tin
  const background = project.projectBackground;
  const globalContext = {
    title: background?.title || project.scriptData?.title || '未命名剧本',
    outline: background?.outline || project.scriptData?.logline || '',
    characterBios: background?.characterBios || '',
    totalEpisodes: project.episodeRawScripts.length,
  };
  
  // 注入概览里的Bối cảnh thế giới知识（角色、phe phái、thời đại、力量hệ thống等）
  const seriesCtx = buildSeriesContextSummary(project.seriesMeta || null);
  
  try {
    // 准备 batch items
    type TitleItem = { index: number; contentSummary: string };
    const items: TitleItem[] = missingEpisodes.map(ep => ({
      index: ep.episodeIndex,
      contentSummary: extractEpisodeSummary(ep),
    }));
    
    const { results, failedBatches, totalBatches } = await processBatched<TitleItem, string>({
      items,
      feature: 'script_analysis',
      buildPrompts: (batch) => {
        const { title, outline, characterBios, totalEpisodes } = globalContext;
        const system = `你是好莱坞资深编剧，拥有艾美奖最佳编剧提名经历。

你的chuyên nghiệp能力：
- 精通剧 tập命名艺术：能用简短有力的标题捕捉每 tập核心冲突和情感转折
- tự sựCấu trúc把控：理解商战、家族、情感等不同类型剧 tập的命名风格
- 市场敏感度：知道什么样的标题能吸引观众，提升点击率

你的任务是根据剧本的全局背景和每 tập内容，为每 tậpTạo简短有吸引力的标题。
${seriesCtx ? `\n【剧级知识Tham chiếu】\n${seriesCtx}\n` : ''}
【剧本thông tin】
tên phim：${title}
总 tập数：${totalEpisodes} tập

【故事đại cương】
${outline.slice(0, 1500)}

【主要nhân vật】
${characterBios.slice(0, 1000)}

【要求】
1. 标题要能概括该 tập的主要内容或转折点
2. 标题长度控制在6-15字
3. 风格要符合剧本类型（如商战剧用商战术语，武侠剧用江湖气息）
4. 标题之间要有liên mạch性，体现剧情发展

请以JSON格式返回，格式为：
{
  "titles": {
    "1": "第1 tập标题",
    "2": "第2 tập标题"
  }
}`;
        const episodeContents = batch.map(ep => 
          `第${ep.index} tập内容摘要：${ep.contentSummary}`
        ).join('\n\n');
        const user = `请为以下 tập数Tạo标题：\n\n${episodeContents}`;
        return { system, user };
      },
      parseResult: (raw) => {
        let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        const result = new Map<string, string>();
        if (parsed.titles) {
          for (const [key, value] of Object.entries(parsed.titles)) {
            result.set(key, value as string);
          }
        }
        return result;
      },
      estimateItemOutputTokens: () => 30, // 标题很短，每 tập约 30 tokens
      onProgress: (completed, total, message) => {
        onProgress?.(completed, total, `[标题Hiệu chuẩn] ${message}`);
      },
    });
    
    // 处理kết quả
    let calibratedCount = 0;
    for (const ep of missingEpisodes) {
      const newTitle = results.get(String(ep.episodeIndex));
      if (newTitle) {
        store.updateEpisodeRawScript(projectId, ep.episodeIndex, {
          title: `第${ep.episodeIndex} tập：${newTitle}`,
        });
        
        const scriptData = store.projects[projectId]?.scriptData;
        if (scriptData) {
          const epData = scriptData.episodes.find(e => e.index === ep.episodeIndex);
          if (epData) {
            epData.title = `第${ep.episodeIndex} tập：${newTitle}`;
            store.setScriptData(projectId, { ...scriptData });
          }
        }
        
        calibratedCount++;
      }
    }
    
    if (failedBatches > 0) {
      console.warn(`[ tập标题Hiệu chuẩn] ${failedBatches}/${totalBatches} 批次thất bại`);
    }
    
    onProgress?.(calibratedCount, totalMissing, `已Hiệu chuẩn ${calibratedCount}/${totalMissing}  tập`);
    
    return {
      success: true,
      calibratedCount,
      totalMissing,
    };
  } catch (error) {
    console.error('[calibrate] Error:', error);
    return {
      success: false,
      calibratedCount: 0,
      totalMissing,
      error: error instanceof Error ? error.message : 'Hiệu chuẩnthất bại',
    };
  }
}

// ==================== AI 分镜Hiệu chuẩnchức năng ====================

export interface ShotCalibrationOptions {
  apiKey: string;
  provider: string;
  baseUrl?: string;
  model?: string;  // 可选指定模型
  styleId?: string;  // 风格nhãn，影响visualPromptTạo
  cinematographyProfileId?: string;  // 摄影风格档案 ID，影响拍摄控制trường默认值
  promptLanguage?: import('@/types/script').PromptLanguage;
}

export interface ShotCalibrationResult {
  success: boolean;
  calibratedCount: number;
  totalShots: number;
  error?: string;
}

/**
 * 根据用户Chọn的提示词Ngôn ngữ，清理/保留分镜提示词trường，TránhNgôn ngữ切换后残留旧trường
 */
function applyPromptLanguageToShotPrompts(
  existingShot: Shot,
  calibration: Record<string, any>,
  promptLanguage: PromptLanguage = 'zh+en',
): Pick<Shot, 'visualPrompt' | 'imagePrompt' | 'imagePromptZh' | 'videoPrompt' | 'videoPromptZh' | 'endFramePrompt' | 'endFramePromptZh'> {
  const nextVisualPrompt = calibration.visualPrompt || existingShot.visualPrompt;
  const nextImagePrompt = calibration.imagePrompt || existingShot.imagePrompt;
  const nextImagePromptZh = calibration.imagePromptZh || existingShot.imagePromptZh;
  const nextVideoPrompt = calibration.videoPrompt || existingShot.videoPrompt;
  const nextVideoPromptZh = calibration.videoPromptZh || existingShot.videoPromptZh;
  const nextEndFramePrompt = calibration.endFramePrompt || existingShot.endFramePrompt;
  const nextEndFramePromptZh = calibration.endFramePromptZh || existingShot.endFramePromptZh;

  if (promptLanguage === 'zh') {
    return {
      visualPrompt: undefined,
      imagePrompt: undefined,
      imagePromptZh: nextImagePromptZh,
      videoPrompt: undefined,
      videoPromptZh: nextVideoPromptZh,
      endFramePrompt: undefined,
      endFramePromptZh: nextEndFramePromptZh,
    };
  }

  if (promptLanguage === 'en') {
    return {
      visualPrompt: nextVisualPrompt,
      imagePrompt: nextImagePrompt,
      imagePromptZh: undefined,
      videoPrompt: nextVideoPrompt,
      videoPromptZh: undefined,
      endFramePrompt: nextEndFramePrompt,
      endFramePromptZh: undefined,
    };
  }

  return {
    visualPrompt: nextVisualPrompt,
    imagePrompt: nextImagePrompt,
    imagePromptZh: nextImagePromptZh,
    videoPrompt: nextVideoPrompt,
    videoPromptZh: nextVideoPromptZh,
    endFramePrompt: nextEndFramePrompt,
    endFramePromptZh: nextEndFramePromptZh,
  };
}

/**
 * AIHiệu chuẩn分镜：tối ưuđang xử lý...、Tạo英文visualPrompt、tối ưu镜头Thiết kế
 */
export async function calibrateEpisodeShots(
  episodeIndex: number,
  projectId: string,
  options: ShotCalibrationOptions,
  onProgress?: (current: number, total: number, message: string) => void,
  filterSceneId?: string,
): Promise<ShotCalibrationResult> {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  
  if (!project) {
    return { success: false, calibratedCount: 0, totalShots: 0, error: '项目không tồn tại' };
  }
  
  // 找到该 tập的分镜
  const scriptData = project.scriptData;
  if (!scriptData) {
    return { success: false, calibratedCount: 0, totalShots: 0, error: '剧本dữ liệukhông tồn tại' };
  }
  
  const episode = scriptData.episodes.find(ep => ep.index === episodeIndex);
  if (!episode) {
    return { success: false, calibratedCount: 0, totalShots: 0, error: `找不到第 ${episodeIndex}  tập` };
  }
  
  // 获取该 tập的Tất cả分镜（可选：只Hiệu chuẩn指定场景的分镜）
  let episodeShots = project.shots.filter(shot => shot.episodeId === episode.id);
  if (filterSceneId) {
    episodeShots = episodeShots.filter(shot => shot.sceneRefId === filterSceneId);
  }
  const totalShots = episodeShots.length;
  
  if (totalShots === 0) {
    return { success: false, calibratedCount: 0, totalShots: 0, error: '该 tập没有分镜' };
  }
  
  onProgress?.(0, totalShots, `开始Hiệu chuẩn第 ${episodeIndex}  tập的 ${totalShots} 分镜...`);
  
  // 获取全局背景thông tin
  const background = project.projectBackground;
  const episodeScript = project.episodeRawScripts.find(ep => ep.episodeIndex === episodeIndex);
  
  // 提取该 tập的gốc剧本内容（Thoại+动作）
  const episodeRawContent = episodeScript?.rawContent || '';
  
  // 构建剧级上下文摘要
  const seriesContextSummary = buildSeriesContextSummary(project.seriesMeta || null);
  
  const globalContext = {
    title: background?.title || project.scriptData?.title || '未命名剧本',
    genre: background?.genre || '',
    era: background?.era || '',
    outline: background?.outline || '',
    characterBios: background?.characterBios || '',
    worldSetting: background?.worldSetting || '',
    themes: background?.themes || [],
    episodeTitle: episode.title,
    episodeSynopsis: episodeScript?.synopsis || '',  // Sử dụng每 tậpđại cương
    episodeKeyEvents: episodeScript?.keyEvents || [],  // Sự kiện quan trọng
    episodeRawContent,  // 该 tậpgốc剧本内容（đầy đủThoại、动作描写）
    episodeSeason: episodeScript?.season,  // 本 tập季节
    totalEpisodes: project.episodeRawScripts.length,
    currentEpisode: episodeIndex,
    seriesContextSummary,  // 剧级上下文
  };
  
  // 构建gốc场景天气映射（从gốcPhân tích的场景đang xử lý...weather）
  const rawSceneWeatherMap = new Map<string, string>();
  if (episodeScript?.scenes) {
    for (const rawScene of episodeScript.scenes) {
      if (rawScene.weather) {
        // 用场景头做 key
        rawSceneWeatherMap.set(rawScene.sceneHeader, rawScene.weather);
      }
    }
  }
  
  try {
    // 获取用户设置的并发数
    const concurrency = useAPIConfigStore.getState().concurrency || 1;
    const batchSize = 5; // 每 AI gọi API处理 5 分镜
    let calibratedCount = 0;
    const updatedShots: Shot[] = [...project.shots];
    
    // 准备Tất cả批次任务
    const allBatches: { batch: Shot[]; batchNum: number; batchData: any[] }[] = [];
    for (let i = 0; i < episodeShots.length; i += batchSize) {
      const batch = episodeShots.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      
      // 准备批次dữ liệu
      const batchData = batch.map(shot => {
        const scene = scriptData.scenes.find(s => s.id === shot.sceneRefId);
        let sourceText = shot.actionSummary || '';
        if (shot.dialogue) {
          sourceText += `\nThoại：「${shot.dialogue}」`;
        }
        // 尝试查找场景对应的天气
        let sceneWeather = '';
        for (const [header, weather] of rawSceneWeatherMap) {
          if (scene?.location && header.includes(scene.location.replace(/\s+/g, ''))) {
            sceneWeather = weather;
            break;
          }
        }
        return {
          shotId: shot.id,
          sourceText,
          actionSummary: shot.actionSummary,
          dialogue: shot.dialogue,
          characterNames: shot.characterNames,
          sceneLocation: scene?.location || '',
          sceneAtmosphere: scene?.atmosphere || '',
          sceneTime: scene?.time || 'day',
          sceneWeather,
          architectureStyle: scene?.architectureStyle || '',
          colorPalette: scene?.colorPalette || '',
          eraDetails: scene?.eraDetails || '',
          lightingDesign: scene?.lightingDesign || '',
          currentShotSize: shot.shotSize,
          currentCameraMovement: shot.cameraMovement,
          currentDuration: shot.duration,
        };
      });
      
      allBatches.push({ batch, batchNum, batchData });
    }
    
    const totalBatches = allBatches.length;
    console.log(`🚀 [calibrateShots] 待处理: ${totalShots} 分镜，${totalBatches} 批，并发数: ${concurrency}`);
    
    // 错开启动的并发控制：每5秒启动一新批次，同时最多 concurrency 
    let completedBatches = 0;
    const settledBatchResults = await runStaggered(
      allBatches.map(({ batch, batchNum, batchData }) => async () => {
        console.log(`[calibrateShots] 🚀 启动批次 ${batchNum}/${totalBatches}`);
        onProgress?.(calibratedCount, totalShots, `🚀 处理批次 ${batchNum}/${totalBatches}...`);
        
        // 带Thử lại机制的 AI gọi API
        let calibrations: Record<string, any> = {};
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
          try {
            calibrations = await calibrateShotsMultiStage(
              batchData,
              { styleId: options.styleId, cinematographyProfileId: options.cinematographyProfileId, promptLanguage: options.promptLanguage },
              globalContext,
              (stage, total, name) => {
                console.log(`[calibrateShots] 批次 ${batchNum}/${totalBatches} - Stage ${stage}/${total}: ${name}`);
                onProgress?.(calibratedCount, totalShots, `批次 ${batchNum} Stage ${stage}/${total}: ${name}`);
              }
            );
            completedBatches++;
            console.log(`[calibrateShots] ✅ 批次 ${batchNum} hoàn thành，Tiến độ: ${completedBatches}/${totalBatches}`);
            return { batch, calibrations, success: true as const };
          } catch (err) {
            retryCount++;
            console.warn(`[calibrateShots] 批次 ${batchNum} thất bại，Thử lại ${retryCount}/${maxRetries}:`, err);
            if (retryCount >= maxRetries) {
              console.error(`[calibrateShots] 批次 ${batchNum} 达到最大Thử lại次数，跳过`);
              completedBatches++;
              return { batch, calibrations: {} as Record<string, any>, success: false as const };
            }
            await new Promise(r => setTimeout(r, 2000 * retryCount));
          }
        }
        completedBatches++;
        return { batch, calibrations, success: false as const };
      }),
      concurrency,
      5000
    );
    const results = settledBatchResults
      .filter((r): r is { status: 'fulfilled'; value: any } => r.status === 'fulfilled')
      .map(r => r.value);
    
    // 处理kết quả
    for (const { batch, calibrations, success } of results) {
      if (success) {
        for (const shot of batch) {
          const calibration = calibrations[shot.id];
          if (calibration) {
            const shotIndex = updatedShots.findIndex(s => s.id === shot.id);
            if (shotIndex !== -1) {
              updatedShots[shotIndex] = {
                ...updatedShots[shotIndex],
                visualDescription: calibration.visualDescription || updatedShots[shotIndex].visualDescription,
                shotSize: calibration.shotSize || updatedShots[shotIndex].shotSize,
                cameraMovement: calibration.cameraMovement || updatedShots[shotIndex].cameraMovement,
                duration: calibration.duration || updatedShots[shotIndex].duration,
                emotionTags: calibration.emotionTags || updatedShots[shotIndex].emotionTags,
                characterNames: calibration.characterNames?.length > 0 
                  ? calibration.characterNames 
                  : updatedShots[shotIndex].characterNames,
                ambientSound: calibration.ambientSound || updatedShots[shotIndex].ambientSound,
                soundEffect: calibration.soundEffect || updatedShots[shotIndex].soundEffect,
                ...applyPromptLanguageToShotPrompts(
                  updatedShots[shotIndex],
                  calibration,
                  options.promptLanguage || 'zh+en',
                ),
                needsEndFrame: calibration.needsEndFrame ?? updatedShots[shotIndex].needsEndFrame,
                narrativeFunction: calibration.narrativeFunction || updatedShots[shotIndex].narrativeFunction,
                conflictStage: calibration.conflictStage || updatedShots[shotIndex].conflictStage,
                shotPurpose: calibration.shotPurpose || updatedShots[shotIndex].shotPurpose,
                storyAlignment: calibration.storyAlignment || updatedShots[shotIndex].storyAlignment,
                visualFocus: calibration.visualFocus || updatedShots[shotIndex].visualFocus,
                cameraPosition: calibration.cameraPosition || updatedShots[shotIndex].cameraPosition,
                characterBlocking: calibration.characterBlocking || updatedShots[shotIndex].characterBlocking,
                rhythm: calibration.rhythm || updatedShots[shotIndex].rhythm,
                // 拍摄控制trường
                lightingStyle: calibration.lightingStyle || updatedShots[shotIndex].lightingStyle,
                lightingDirection: calibration.lightingDirection || updatedShots[shotIndex].lightingDirection,
                colorTemperature: calibration.colorTemperature || updatedShots[shotIndex].colorTemperature,
                lightingNotes: calibration.lightingNotes || updatedShots[shotIndex].lightingNotes,
                depthOfField: calibration.depthOfField || updatedShots[shotIndex].depthOfField,
                focusTarget: calibration.focusTarget || updatedShots[shotIndex].focusTarget,
                focusTransition: calibration.focusTransition || updatedShots[shotIndex].focusTransition,
                cameraRig: calibration.cameraRig || updatedShots[shotIndex].cameraRig,
                movementSpeed: calibration.movementSpeed || updatedShots[shotIndex].movementSpeed,
                atmosphericEffects: calibration.atmosphericEffects || updatedShots[shotIndex].atmosphericEffects,
                effectIntensity: calibration.effectIntensity || updatedShots[shotIndex].effectIntensity,
                playbackSpeed: calibration.playbackSpeed || updatedShots[shotIndex].playbackSpeed,
                cameraAngle: calibration.cameraAngle || updatedShots[shotIndex].cameraAngle,
                focalLength: calibration.focalLength || updatedShots[shotIndex].focalLength,
                photographyTechnique: calibration.photographyTechnique || updatedShots[shotIndex].photographyTechnique,
                specialTechnique: calibration.specialTechnique || updatedShots[shotIndex].specialTechnique,
              };
              calibratedCount++;
            }
          }
        }
      }
    }
    
    onProgress?.(calibratedCount, totalShots, `已Hiệu chuẩn ${calibratedCount}/${totalShots} 分镜`);
    
    // 保存更新后的分镜
    store.setShots(projectId, updatedShots);
    
    return {
      success: true,
      calibratedCount,
      totalShots,
    };
  } catch (error) {
    console.error('[calibrateShots] Error:', error);
    return {
      success: false,
      calibratedCount: 0,
      totalShots,
      error: error instanceof Error ? error.message : '分镜Hiệu chuẩnthất bại',
    };
  }
}

/**
 * AIHiệu chuẩn单分镜：用于预告片 Tab 点击单分镜进行Hiệu chuẩn
 */
export async function calibrateSingleShot(
  shotId: string,
  projectId: string,
  options: ShotCalibrationOptions,
  onProgress?: (message: string) => void
): Promise<ShotCalibrationResult> {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  
  if (!project) {
    return { success: false, calibratedCount: 0, totalShots: 1, error: '项目không tồn tại' };
  }
  
  const scriptData = project.scriptData;
  if (!scriptData) {
    return { success: false, calibratedCount: 0, totalShots: 1, error: '剧本dữ liệukhông tồn tại' };
  }
  
  // 找到目标分镜
  const shot = project.shots.find(s => s.id === shotId);
  if (!shot) {
    return { success: false, calibratedCount: 0, totalShots: 1, error: `找不到分镜 ${shotId}` };
  }
  
  onProgress?.(`正在Hiệu chuẩn分镜...`);
  
  // 获取分镜所属的场景和 tập thông tin
  const scene = scriptData.scenes.find(s => s.id === shot.sceneRefId);
  const episode = scriptData.episodes.find(ep => ep.id === shot.episodeId);
  const episodeIndex = episode?.index || 1;
  
  // 获取全局背景thông tin
  const background = project.projectBackground;
  const episodeScript = project.episodeRawScripts.find(ep => ep.episodeIndex === episodeIndex);
  const episodeRawContent = episodeScript?.rawContent || '';
  
  const globalContext = {
    title: background?.title || scriptData?.title || '未命名剧本',
    genre: background?.genre || '',
    era: background?.era || '',
    outline: background?.outline || '',
    characterBios: background?.characterBios || '',
    worldSetting: background?.worldSetting || '',
    themes: background?.themes || [],
    episodeTitle: episode?.title || `第${episodeIndex} tập`,
    episodeSynopsis: episodeScript?.synopsis || '',
    episodeKeyEvents: episodeScript?.keyEvents || [],
    episodeRawContent,
    episodeSeason: episodeScript?.season,
    totalEpisodes: project.episodeRawScripts.length,
    currentEpisode: episodeIndex,
  };
  
  try {
    // 准备分镜dữ liệu
    let sourceText = shot.actionSummary || '';
    if (shot.dialogue) {
      sourceText += `\nThoại：「${shot.dialogue}」`;
    }
    
    // 查找场景天气
    let sceneWeather = '';
    if (episodeScript?.scenes) {
      for (const rawScene of episodeScript.scenes) {
        if (rawScene.weather && scene?.location && rawScene.sceneHeader.includes(scene.location.replace(/\s+/g, ''))) {
          sceneWeather = rawScene.weather;
          break;
        }
      }
    }
    
    const shotData = [{
      shotId: shot.id,
      sourceText,
      actionSummary: shot.actionSummary || '',
      dialogue: shot.dialogue,
      characterNames: shot.characterNames,
      sceneLocation: scene?.location || '',
      sceneAtmosphere: scene?.atmosphere || '',
      sceneTime: scene?.time || 'day',
      sceneWeather,
      // 场景美术Thiết kếtrường（从AI场景Hiệu chuẩn获取）
      architectureStyle: scene?.architectureStyle || '',
      colorPalette: scene?.colorPalette || '',
      eraDetails: scene?.eraDetails || '',
      lightingDesign: scene?.lightingDesign || '',
      currentShotSize: shot.shotSize,
      currentCameraMovement: shot.cameraMovement,
      currentDuration: shot.duration,
    }];
    
    // gọi API AI Hiệu chuẩn
    const calibrations = await callAIForShotCalibration(shotData, options, globalContext);
    const calibration = calibrations[shot.id];
    
    if (!calibration) {
      return { success: false, calibratedCount: 0, totalShots: 1, error: 'AI Hiệu chuẩn未返回kết quả' };
    }
    
    // 更新分镜
    const updatedShots = project.shots.map(s => {
      if (s.id !== shot.id) return s;
      return {
        ...s,
        visualDescription: calibration.visualDescription || s.visualDescription,
        shotSize: calibration.shotSize || s.shotSize,
        cameraMovement: calibration.cameraMovement || s.cameraMovement,
        duration: calibration.duration || s.duration,
        emotionTags: calibration.emotionTags || s.emotionTags,
        characterNames: calibration.characterNames?.length > 0 ? calibration.characterNames : s.characterNames,
        ambientSound: calibration.ambientSound || s.ambientSound,
        soundEffect: calibration.soundEffect || s.soundEffect,
        // 3 lớp提示词系统（按 promptLanguage 清理旧trường）
        ...applyPromptLanguageToShotPrompts(
          s,
          calibration,
          options.promptLanguage || 'zh+en',
        ),
        needsEndFrame: calibration.needsEndFrame ?? s.needsEndFrame,
        // tự sựdẫn dắttrường
        narrativeFunction: calibration.narrativeFunction || s.narrativeFunction,
        conflictStage: calibration.conflictStage || s.conflictStage,
        shotPurpose: calibration.shotPurpose || s.shotPurpose,
        storyAlignment: calibration.storyAlignment || s.storyAlignment,
        visualFocus: calibration.visualFocus || s.visualFocus,
        cameraPosition: calibration.cameraPosition || s.cameraPosition,
        characterBlocking: calibration.characterBlocking || s.characterBlocking,
        rhythm: calibration.rhythm || s.rhythm,
        // 拍摄控制trường
        lightingStyle: calibration.lightingStyle || s.lightingStyle,
        lightingDirection: calibration.lightingDirection || s.lightingDirection,
        colorTemperature: calibration.colorTemperature || s.colorTemperature,
        lightingNotes: calibration.lightingNotes || s.lightingNotes,
        depthOfField: calibration.depthOfField || s.depthOfField,
        focusTarget: calibration.focusTarget || s.focusTarget,
        focusTransition: calibration.focusTransition || s.focusTransition,
        cameraRig: calibration.cameraRig || s.cameraRig,
        movementSpeed: calibration.movementSpeed || s.movementSpeed,
        atmosphericEffects: calibration.atmosphericEffects || s.atmosphericEffects,
        effectIntensity: calibration.effectIntensity || s.effectIntensity,
        playbackSpeed: calibration.playbackSpeed || s.playbackSpeed,
        cameraAngle: calibration.cameraAngle || s.cameraAngle,
        focalLength: calibration.focalLength || s.focalLength,
        photographyTechnique: calibration.photographyTechnique || s.photographyTechnique,
        specialTechnique: calibration.specialTechnique || s.specialTechnique,
      } as Shot;
    });
    
    store.setShots(projectId, updatedShots);
    onProgress?.(`分镜Hiệu chuẩnhoàn thành`);
    
    return {
      success: true,
      calibratedCount: 1,
      totalShots: 1,
    };
  } catch (error) {
    console.error('[calibrateSingleShot] Error:', error);
    return {
      success: false,
      calibratedCount: 0,
      totalShots: 1,
      error: error instanceof Error ? error.message : '单分镜Hiệu chuẩnthất bại',
    };
  }
}

/**
 * gọi API AI API Hiệu chuẩn分镜 - 复用 callChatAPI
 */
async function callAIForShotCalibration(
  shots: Array<{
    shotId: string;
    sourceText: string;        // gốc剧本文本đoạn（该分镜对应的原文）
    actionSummary: string;
    dialogue?: string;
    characterNames?: string[];
    sceneLocation: string;
    sceneAtmosphere: string;
    sceneTime: string;
    sceneWeather?: string;        // 天气（雨/雪/雾等）
    // 场景美术Thiết kếtrường（与 ScriptScene trường名对齐）
    architectureStyle?: string;   // Phong cách kiến trúc
    colorPalette?: string;        // 色彩基调
    eraDetails?: string;          // thời đại特征
    lightingDesign?: string;      // 光影Thiết kế
    currentShotSize?: string;
    currentCameraMovement?: string;
    currentDuration?: number;
  }>,
  options: ShotCalibrationOptions,
  globalContext: {
    title: string;
    genre?: string;
    era?: string;
    outline: string;
    characterBios: string;
    worldSetting?: string;
    themes?: string[];
    episodeTitle: string;
    episodeSynopsis?: string;  // 每 tậpđại cương
    episodeKeyEvents?: string[];  // Sự kiện quan trọng
    episodeRawContent?: string;  // 该 tậpgốc剧本内容
    episodeSeason?: string;      // 本 tập季节
    totalEpisodes?: number;
    currentEpisode?: number;
  }
): Promise<Record<string, {
  visualDescription: string;
  visualPrompt: string;
  // 3 lớp提示词系统
  imagePrompt: string;      // khung đầu提示词（静态Mô tả）
  imagePromptZh: string;    // khung đầu提示词中文
  videoPrompt: string;      // 视频提示词（动态动作）
  videoPromptZh: string;    // 视频提示词中文
  endFramePrompt: string;   // khung cuối提示词（静态Mô tả）
  endFramePromptZh: string; // khung cuối提示词中文
  needsEndFrame: boolean;   // 是否需要khung cuối
  shotSize: string;
  cameraMovement: string;
  duration: number;         // thời lượng（秒）
  emotionTags: string[];    // 情绪标签
  characterNames: string[]; // đầy đủ角色列表
  ambientSound: string;     // 环境音
  soundEffect: string;      // Hiệu ứng âm thanh
  // === tự sựdẫn dắttrường（基于《电影Ngôn ngữ的语法》） ===
  narrativeFunction: string;  // tự sựchức năng：铺垫/升级/cao trào/转折/chuyển tiếp/尾声
  conflictStage?: string;     // 冲突阶段
  shotPurpose: string;        // 镜头mục đích：为什么用这镜头
  storyAlignment?: string;    // 与整体tự sự的一致性
  visualFocus: string;        // Tiêu điểm thị giác：观众应该看什么
  cameraPosition: string;     // 机位Mô tả
  characterBlocking: string;  // nhân vậtbố cục
  rhythm: string;             // Nhịp điệuMô tả
  // === 拍摄控制trường ===
  lightingStyle?: string;
  lightingDirection?: string;
  colorTemperature?: string;
  lightingNotes?: string;
  depthOfField?: string;
  focusTarget?: string;
  focusTransition?: string;
  cameraRig?: string;
  movementSpeed?: string;
  atmosphericEffects?: string[];
  effectIntensity?: string;
  playbackSpeed?: string;
  cameraAngle?: string;
  focalLength?: string;
  photographyTechnique?: string;
  specialTechnique?: string;
}>> {
  // 不再需要 apiKey/provider/baseUrl，统一从ánh xạ dịch vụ获取
  const { styleId, cinematographyProfileId } = options;
  const { 
    title, genre, era, outline, characterBios, worldSetting, themes,
    episodeTitle, episodeSynopsis, episodeKeyEvents, episodeRawContent,
    episodeSeason, totalEpisodes, currentEpisode 
  } = globalContext;
  
  // 截取gốc剧本内容（Tránh过长，取前3000字）
  const rawContentPreview = episodeRawContent ? episodeRawContent.slice(0, 3000) : '';
  
  // Sử dụng共享的风格Mô tả函数
  const styleDesc = getStyleDescription(styleId || 'cinematic');
  
  // 摄影风格档案指导文本
  const cinematographyGuidance = cinematographyProfileId
    ? buildCinematographyGuidance(cinematographyProfileId)
    : '';
  
  // 构建更đầy đủ的上下文thông tin
  const contextInfo = [
    `tên phim：《${title}》`,
    genre ? `类型：${genre}` : '',
    era ? `thời đại背景：${era}` : '',
    totalEpisodes ? `总 tập数：${totalEpisodes} tập` : '',
    `当前：第${currentEpisode} tập「${episodeTitle}」`,
    episodeSeason ? `季节：${episodeSeason}` : '',
  ].filter(Boolean).join(' | ');
  
  const systemPrompt = `你是世界级顶尖电影摄影大师，精通丹尼艾尔·阿里洪《电影Ngôn ngữ的语法》的Tất cả理论，拥有奥斯卡最佳摄影奖经验。

你的核心理念：**镜头不是孤立的画面，而是tự sự链条đang xử lý...。每镜头的Kích thước cảnh、运动、thời lượng都必须服务于tự sự。**

你的chuyên nghiệp能力：
- 精通镜头Ngôn ngữ：能准确判断每镜头的Kích thước cảnh、运动方式、光线Thiết kế
- **tự sựdẫn dắtThiết kế**：理解每镜头在整 tập故事đang xử lý...和chức năng，确保镜头Thiết kế服务于tự sự
- 场面调度：运用三角形原理、内外反拍等技法处理Chat场面
- 动态捕捉：能准确判断镜头的bắt đầu状态和kết thúc状态是否有显著差异
- AI视频Tạo经验：深谙 Seedance、Sora、Runway 等 AI 视频模型的工作原理

你的任务是根据剧本全局背景和分镜thông tin，为每分镜Tạochuyên nghiệp的Mô tả thị giác和3 lớp提示词。

【剧本thông tin】
${contextInfo}
${episodeSynopsis ? `
本 tậpđại cương：${episodeSynopsis}` : ''}
${episodeKeyEvents && episodeKeyEvents.length > 0 ? `
Sự kiện quan trọng：${episodeKeyEvents.join('、')}` : ''}
${worldSetting ? `
Bối cảnh thế giới：${worldSetting.slice(0, 200)}` : ''}
${themes && themes.length > 0 ? `
Chủ đề：${themes.join('、')}` : ''}
${outline ? `
故事背景：${outline.slice(0, 400)}` : ''}
${characterBios ? `
主要nhân vật：${characterBios.slice(0, 400)}` : ''}

【⚠️ 核心原则 - 必须严格遵守】

1. **场景归属绝对Cố định**（最重要！）：
   - 每分镜都有一【主场景】（由 sceneLocation trường指定），这是**绝对不可thay đổi的**
   - 即使分镜Mô tảđang xử lý...其他场景（如闪回、叠画、回忆画面、穿插镜头），**主场景vẫn是 sceneLocation**
   - 闪回/叠画是「当前主场景内的Thị giác表现手法」，不是场景切换
   - 你Tạo的Tất cảMô tả（visualDescription、imagePrompt 等）都必须以**主场景为背景**
   - 如果原文包含闪回/叠画内容，用「画面叠加」「画đang xử lý...主观回忆」等方式Mô tả，而不是Mô tả成另一场景
   - 例：主场景是"张家客厅"，原文提到"闪回台球厅"，应Mô tả为"张家客厅đang xử lý...叠加台球厅的回忆画面"

2. **严格基于原文**：每分镜都附带了【gốc剧本文本】，你的Tất cảTạo内容必须完全基于该原文：
   - Mô tả thị giác必须包含原文đang xử lý...Tất cảquan trọng元素（nhân vật、动作、đạo cụ、场景）
   - 不得Thêm原文đang xử lý...内容
   - 不得混入其他分镜的内容
   - 不得bỏ sót原文đang xử lý...thông tin

3. **角色đầy đủ识别**：出场角色必须đầy đủ来自原文，按出现thứ tự列出
   - 例：原文"张明与父母吃着饭" → characterNames: ["张明", "张父", "张母"]
   - 禁止bỏ sót角色，禁止新增原文đang xử lý...角色

3. **đang xử lý...离**：
   - **đang xử lý...ường**（visualDescription, ambientSound, soundEffect, imagePromptZh, videoPromptZh, endFramePromptZh）：必须是纯中文
   - **英文trường**（visualPrompt, imagePrompt, videoPrompt, endFramePrompt）：必须是100%纯英文，绝对禁止夹杂任何đang xử lý...
   - 如果不确定某词怎么翻译，用英文Mô tả或近义词代替，但绝不能留中文

4. **thời lượng估算**：根据动作复杂度和Thoại长度估算合理的分镜thời lượng（秒）
   - 纯动作无Thoại：3-5秒
   - 简短Thoại：4-6秒
   - 较长Thoại：6-10秒
   - 复杂动作序列：5-8秒

5. **音频Thiết kế**（必须用đang xử lý...根据原文识别并输出：
   - ambientSound（环境音）：如"外鸟鸣"、"餐厅嗨杂声"、"风声"
   - soundEffect（Hiệu ứng âm thanh）：如"酒杯碎裂声"、"脚步声"、"门关闭声"

【任务】
为每分镜Tạo：

**基础trường：**
1. đang xử lý...Mô tả (visualDescription): 详细、有画面感的**纯đang xử lý...Mô tả，必须包含原文Tất cảquan trọng元素（环境、nhân vật、动作、đạo cụ）
2. 英文Mô tả thị giác (visualPrompt): 用于AI绘图的**纯英文**Mô tả，40词内
3. Kích thước cảnh (shotSize): ECU/CU/MCU/MS/MLS/LS/WS/FS
4. 镜头运动 (cameraMovement): none/static/tracking/orbit/zoom-in/zoom-out/pan-left/pan-right/tilt-up/tilt-down/dolly-in/dolly-out/truck-left/truck-right/crane-up/crane-down/drone-aerial/360-roll
4b. Kỹ thuật quay đặc biệt手法 (specialTechnique): none/hitchcock-zoom/timelapse/crash-zoom-in/crash-zoom-out/whip-pan/bullet-time/fpv-shuttle/macro-closeup/first-person/slow-motion/probe-lens/spinning-tilt
5. thời lượng (duration): 秒数，整数
6. 情绪标签 (emotionTags): 1-3情绪标签ID
7. 出场角色 (characterNames): đầy đủ角色列表，来自原文
8. 环境音 (ambientSound): **đang xử lý...，根据场景推断
9. Hiệu ứng âm thanh (soundEffect): **đang xử lý...，根据动作推断

**tự sựdẫn dắttrường（重要！必须基于本 tậpđại cương分析）：**
10. tự sựchức năng (narrativeFunction): 铺垫/升级/cao trào/转折/chuyển tiếp/尾声
11. 镜头mục đích (shotPurpose): 为什么用这镜头？一句话说明
12. Tiêu điểm thị giác (visualFocus): 观众应该按什么thứ tự看？用箭头表示
13. 机位Mô tả (cameraPosition): 摄影机相对于nhân vật的位置
14. nhân vậtbố cục (characterBlocking): nhân vật在画面đang xử lý...关系
15. Nhịp điệuMô tả (rhythm): 这镜头的Nhịp điệu感

**拍摄控制trường（Cinematography Controls）：**
16. 灯光风格 (lightingStyle): natural/high-key/low-key/silhouette/chiaroscuro/neon
17. 灯光方向 (lightingDirection): front/side/back/top/bottom/rim
18. 色温 (colorTemperature): warm-3200K/neutral-5600K/cool-7500K/mixed/golden-hour/blue-hour
19. 灯光备注 (lightingNotes): 自由文本，đang xử lý...充灯光细节
20. 景深 (depthOfField): shallow/medium/deep/split-diopter
21. 焦点目标 (focusTarget): 自由文本，đang xử lý...述对焦主体
22. 焦点变化 (focusTransition): none/rack-focus/pull-focus/follow-focus
23. 摄影器材 (cameraRig): tripod/handheld/steadicam/dolly/crane/drone/gimbal/shoulder
24. 运动速度 (movementSpeed): static/slow/normal/fast/whip
25. 大气效果 (atmosphericEffects): 数组，可多选，如 ["雾气","烟尘"] 等天气/环境/艺术效果
26. 效果强度 (effectIntensity): subtle/moderate/heavy
27. 播放速度 (playbackSpeed): slow-0.25x/slow-0.5x/normal/fast-1.5x/fast-2x/timelapse
28. 拍摄角度 (cameraAngle): eye-level/low-angle/high-angle/birds-eye/worms-eye/dutch-angle/over-shoulder/pov/aerial
29. 镜头焦距 (focalLength): 14mm/18mm/24mm/28mm/35mm/50mm/85mm/100mm-macro/135mm/200mm
30. 摄影技法 (photographyTechnique): long-exposure/double-exposure/high-speed/timelapse-photo/tilt-shift/silhouette/reflection/bokeh（如不需要特殊技法可Để trống）

【3 lớp提示词系统 - 重要】

【16. khung đầu提示词 (imagePrompt/imagePromptZh): 用于 AI 图像Tạo，Mô tả视频khung đầu tiên的đầy đủ静态画面
    **必须包含以下Tất cả元素**（缺一不可）：
    
    a) **场景环境**：
       - 地点类型（家庭餐厅/办公室/街道等）
       - 环境细节（外景色、室内陈设、đạo cụ布置）
       - 时间氛围（ban ngày/傍晚/ban đêm、季节感）
    
    b) **光线Thiết kế**：
       - 光源类型（自然光/灯光/混合光）
       - 光线质感（柔和/硬朗/漫射）
       - 光影氛围（温暖/冷色调/明暗对比）
    
    c) **nhân vậtMô tả**（每出场nhân vật都要写）：
       - Độ tuổi（青年/đang xử lý...年）
       - trang phục概述（休闲装/正装/工作服等）
       - Biểu cảm神态（căng thẳng/严肃/微笑/担忧）
       - Tư thế动作（坐着/站立/俯身/Cầm tayvật phẩm）
    
    d) **bố cục与Kích thước cảnh**：
       - Kích thước cảnhMô tả（đang xử lý...入画/Cận cảnh半身/Cực cận cảnhKhuôn mặt）
       - nhân vật位置关系（左đang xử lý...、前后关系）
       - Tiêu điểm thị giác（主体在画面何处）
    
    e) **重要đạo cụ**：
       - 剧情quan trọngđạo cụ（证书、vật phẩm、食物等）
       - đạo cụ状态（Cầm tay/放置/Hiển thị）
    
    f) **画面风格**：
       - 电影感/写实风格/剧情照质感
       - 色调倾向（温暖/冷色/自然）
    
    - imagePromptZh: 纯đang xử lý...0-100字，包含以上Tất cả元素
    - imagePrompt: 纯英文，60-80词，对应đang xử lý...的đầy đủ翻译，适合AI图像模型

11. 视频提示词 (videoPrompt/videoPromptZh): Mô tả视频đang xử lý...内容
    - **必须强调动作**（如"反复观看"、"căng thẳng地吃饭"等动词）
    - 画面动作（nhân vật动作、物体移动）
    - 镜头运动Mô tả
    - Thoại提示（如有）
    - videoPromptZh: 纯中文
    - videoPrompt: 纯英文

【18. khung cuối提示词 (endFramePrompt/endFramePromptZh): 用于 AI 图像Tạo，Mô tả视频khung cuối cùng的đầy đủ静态画面
    
    **与khung đầu同等重要！必须包含以下Tất cả元素**（缺一不可）：
    
    a) **场景环境**：保持与khung đầu一致的场景，但反映变化后的状态
    
    b) **光线Thiết kế**：与khung đầu保持一致（除非剧情有时间变化）
    
    c) **nhân vậtMô tả**（重点！Mô tả动作hoàn thành后的状态）：
       - 同样包含Tuổi、trang phục
       - **新的Biểu cảm神态**（动作hoàn thành后的情绪）
       - **新的Tư thế位置**（动作hoàn thành后的位置）
       - đạo cụ的新状态
    
    d) **bố cục与Kích thước cảnh**：
       - 如有镜头运动，Mô tả运动kết thúc后的新Kích thước cảnh
       - nhân vật新的位置关系
    
    e) **变化对比**（核心！）：
       - 明确Mô tả与khung đầu的差异（位置/动作/Biểu cảm/đạo cụ状态）
    
    f) **画面风格**：与khung đầu保持一致
    
    - endFramePromptZh: 纯đang xử lý...0-100字，包含以上Tất cả元素
    - endFramePrompt: 纯英文，60-80词，对应đang xử lý...的đầy đủ翻译

19. 是否需要khung cuối (needsEndFrame):
    **必须设置为 true**：
    - nhân vật位置变化（走动、起身、坐下等）
    - 动作序列（拿起vật phẩm、放下东西等）
    - 状态变化（门打开/关闭、vật phẩm移动等）
    - 镜头运动（非Static）
    - vật phẩm状态变化（翻页、收起等）
    
    **可以设置为 false**：
    - 纯Thoại（位置không thay đổi）
    - 仅Biểu cảm微小变化
    - 完全静态镜头
    
    **不确定时设为 true**（宁可多Tạo不要bỏ sót）

【情绪标签Tùy chọn】
基础情绪: happy, sad, angry, surprised, fearful, calm
氛围情绪: tense, excited, mysterious, romantic, funny, touching
语气情绪: serious, relaxed, playful, gentle, passionate, low

【风格要求】
${styleDesc}
${cinematographyGuidance ? `
${cinematographyGuidance}
` : ''}
${(() => {
  const mt = getMediaType(styleId || 'cinematic');
  return mt !== 'cinematic' ? `
【媒介类型约束】
${getMediaTypeGuidance(mt)}
` : '';
})()}
镜头Thiết kế原则：
- 情感Thoại、内心活动: CU/ECU Cận cảnhCực cận cảnh
- 动作场面、追逐: MS/WS + Tracking跟随
- 场景建立、chuyển tiếp: WS/FS Viễn cảnh
- căng thẳng对峙: nhanh切换Kích thước cảnh
- 重要物件/细节: ECUCực cận cảnh

**Quan trọng:đang xử lý...rường必须严格分离！**
- visualDescription, ambientSound, soundEffect, imagePromptZh, videoPromptZh, endFramePromptZh → **必须是纯đang xử lý...
- visualPrompt, imagePrompt, videoPrompt, endFramePrompt → **必须是纯英文**

请以JSON格式返回，格式为:
{
  "shots": {
    "shot_id_1": {
      "visualDescription": "外栩子花绽放，餐桌旁，张明神情căng thẳng地与父母吃饭，父亲Cầm tay985研究生毕业证书反复观看。",
      "visualPrompt": "Gardenias blooming outside window, at dining table Zhang Ming eating nervously with parents, father holding graduate certificate examining it repeatedly",
      "shotSize": "MS",
      "cameraMovement": "static",
      "specialTechnique": "none",
      "duration": 5,
      "emotionTags": ["tense", "serious"],
      "characterNames": ["张明", "张父", "张母"],
      "ambientSound": "餐厅环境音，碗筷轻碰声",
      "soundEffect": "",
      "narrativeFunction": "铺垫",
      "shotPurpose": "建立家庭表面和谐但暗藏sức căng的氛围，用毕业证书暗示父亲对儿子的期望",
      "visualFocus": "外栀子花 → 张明căng thẳng的脸 → 父亲手đang xử lý...",
      "cameraPosition": "张明侧后方45°，可见三人关系",
      "characterBlocking": "张明(đang xử lý...s 父母(两侧)，形成包围感",
      "rhythm": "缓慢、压抑，营造表面平静下的căng thẳng感",
      "lightingStyle": "natural",
      "lightingDirection": "side",
      "colorTemperature": "warm-3200K",
      "lightingNotes": "午后侧光透过户，形成温暖但带有压迫感的明暗对比",
      "depthOfField": "medium",
      "focusTarget": "张明căng thẳng的Khuôn mặtBiểu cảm",
      "focusTransition": "rack-focus",
      "cameraRig": "tripod",
      "movementSpeed": "static",
      "atmosphericEffects": ["自然光斑"],
      "effectIntensity": "subtle",
      "playbackSpeed": "normal",
      "cameraAngle": "eye-level",
      "focalLength": "50mm",
      "photographyTechnique": "",
      "imagePrompt": "Cinematic medium shot, modern Chinese family dining room, warm afternoon sunlight through window with blooming gardenias outside, young man Zhang Ming (25, casual clothes, tense expression) sitting at dining table with his middle-aged parents, father (50s, stern face, holding graduate certificate examining it), mother (50s, worried look) beside them, wooden dining table with home-cooked dishes, warm color tones, realistic film style",
      "imagePromptZh": "电影感đang xử lý...代đang xử lý...餐厅，午后温暖阳光透过户洒入，外栩子花盛开。青年张明（25 tuổi，休闲装，神情căng thẳng）坐在餐桌旁，đang xử lý...（50多 tuổi，严肃Biểu cảm，Cầm tay985研究生毕业证书反复Xem），母亲（50多 tuổi，担忧神情）坐在旁边。木质餐桌上摆着家常菜肴，温暖色调，写实电影风格。",
      "videoPrompt": "Father repeatedly examining graduate certificate with focused attention, Zhang Ming eating nervously with chopsticks, occasionally glancing at father, mother sitting beside watching silently with worried expression",
      "videoPromptZh": "父亲专注地反复观看毕业证书，张明用筷子căng thẳng地吃饭，不时偷瞄父亲，母亲坐在旁边默默看着，神情担忧。",
      "needsEndFrame": true,
      "endFramePrompt": "Cinematic medium shot, same modern Chinese family dining room, warm afternoon light. Father (50s) now lowering the certificate with satisfied yet stern expression, Zhang Ming (25) stopped eating and looking down nervously, mother (50s) glancing between husband and son with concern. Certificate now placed on table beside dishes, tense atmosphere, warm color tones, realistic film style",
      "endFramePromptZh": "电影感đang xử lý...样的现代đang xử lý...餐厅，午后温暖光线。父亲（50多 tuổi）已放下证书，Biểu cảmhài lòng但仍严肃；张明（25 tuổi）停下筷子，低头神情căng thẳng；母亲（50多 tuổi）目光在父子之间游移，神情担忧。证书已放在餐桌上菜肴旁边，气氛căng thẳng，温暖色调，写实电影风格。"
    }
  }
}

**特别注意**：
- 栩子花 = gardenias（不是 peonies）
- visualDescription 必须是đang xử lý...要写英文
- ambientSound/soundEffect 必须是中文`
  
  const shotDescriptions = shots.map(shot => {
    const chars = shot.characterNames?.join('、') || '无';
    // 检测是否包含闪回/叠画内容
    const sourceText = shot.sourceText || shot.actionSummary || '';
    const hasFlashback = /闪回|叠画|回忆|穿插/.test(sourceText);
    const flashbackNote = hasFlashback 
      ? `\n⚠️ 注意：原文包含闪回/叠画内容，但主场景vẫn是「${shot.sceneLocation}」，不要Mô tả成另一场景！`
      : '';
    // 构建场景美术Thiết kếthông tin（如果有）
    const artDesignParts = [
      shot.architectureStyle ? `Phong cách kiến trúc: ${shot.architectureStyle}` : '',
      shot.colorPalette ? `色彩基调: ${shot.colorPalette}` : '',
      shot.eraDetails ? `thời đại特征: ${shot.eraDetails}` : '',
      shot.lightingDesign ? `光影Thiết kế: ${shot.lightingDesign}` : '',
    ].filter(Boolean);
    const artDesignSection = artDesignParts.length > 0 
      ? `\n【🎨 场景美术Thiết kế（必须严格遵循）】\n${artDesignParts.join('\n')}` 
      : '';
    return `ID: ${shot.shotId}
【⭐ 主场景（绝对不可thay đổi）】: ${shot.sceneLocation}${flashbackNote}${artDesignSection}
【gốc剧本文本】
${sourceText}
【已Phân tíchthông tin】
动作: ${shot.actionSummary}
Thoại: ${shot.dialogue || '无'}
当前角色: ${chars}
氛围: ${shot.sceneAtmosphere}
时间: ${shot.sceneTime}${shot.sceneWeather ? `
天气: ${shot.sceneWeather}` : ''}
当前Kích thước cảnh: ${shot.currentShotSize || '待定'}
当前镜头运动: ${shot.currentCameraMovement || '待定'}`;
  }).join('\n\n═══════════════════════════════════════\n\n');
  
  const userPrompt = `请严格基于每分镜的【gốc剧本文本】TạoHiệu chuẩn内容。

⚠️ 重要提醒（必须遵守）：
1. **场景归属绝对Cố định**：每分镜的【主场景】已经标注，即使原文提到闪回/叠画/回忆，主场景仍không thay đổi
2. 不要bỏ sót原文đang xử lý...quan trọngthông tin（nhân vật、动作、đạo cụ、环境）
3. 不要Thêm原文đang xử lý...内容
4. **đang xử lý...ường必须是纯đang xử lý...：visualDescription, ambientSound, soundEffect, imagePromptZh, videoPromptZh
5. **英文trường必须是纯英文**：visualPrompt, imagePrompt, videoPrompt, endFramePrompt
6. 角色列表必须đầy đủ
7. 栩子花 = gardenias（不是 peonies/peony）

🎬 **tự sựdẫn dắt分析（基于《电影Ngôn ngữ的语法》）**：
- 根据「本 tậpđại cương」判断每镜头在整 tập故事đang xử lý...chức năng
- 镜头Thiết kế必须服务于故事的情绪Nhịp điệu和tự sựcung
- Kích thước cảnhChọn要配合tự sựchức năng（铺垫用全景、cao trào用Cực cận cảnh等）
- 考虑nhân vậtbố cục和机位对故事sức căng的影响

${shotDescriptions}`;
  
  // 统一从ánh xạ dịch vụ获取配置（单分镜Hiệu chuẩn用更大 token 预算）
  const result = await callFeatureAPI('script_analysis', systemPrompt, userPrompt, { maxTokens: 16384 });
  
  // Phân tích JSON kết quả（增强版）
  try {
    let cleaned = result;
    
    // 移除 markdown 代码块标记
    cleaned = cleaned.replace(/^```json\s*/i, '');
    cleaned = cleaned.replace(/^```\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/i, '');
    cleaned = cleaned.trim();
    
    // 尝试找到 JSON 对象的起止位置
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }
    
    const parsed = JSON.parse(cleaned);
    return parsed.shots || {};
  } catch (e) {
    console.error('[calibrateShots] Failed to parse AI response:', result);
    console.error('[calibrateShots] Parse error:', e);
    
    // 尝试部分Phân tích：提取已hoàn thành的分镜
    try {
      const partialResult: Record<string, any> = {};
      // Khớp每 shot 的đầy đủ JSON 对象
      const shotPattern = /"(shot_[^"]+)"\s*:\s*(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})/g;
      let match;
      while ((match = shotPattern.exec(result)) !== null) {
        try {
          const shotId = match[1];
          const shotJson = match[2];
          partialResult[shotId] = JSON.parse(shotJson);
        } catch {
          // 单 shot Phân tích thất bại，继续下一
        }
      }
      
      if (Object.keys(partialResult).length > 0) {
        console.log(`[calibrateShots] 部分Phân tích成功，恢复了 ${Object.keys(partialResult).length} 分镜`);
        return partialResult;
      }
    } catch {
      // 部分Phân tích也thất bại
    }
    
    throw new Error('Phân tích AI 响应thất bại');
  }
}

// ==================== AI Tạo每 tậpđại cương ====================

export interface SynopsisGenerationResult {
  success: boolean;
  generatedCount: number;
  totalEpisodes: number;
  error?: string;
}

/**
 * AI Tạo每 tậpđại cương
 * 基于全局背景和每 tập内容，Tạo简洁的 tậpđại cương
 */
export async function generateEpisodeSynopses(
  projectId: string,
  _options?: CalibrationOptions, // 不再需要，保留以tương thích
  onProgress?: (current: number, total: number, message: string) => void
): Promise<SynopsisGenerationResult> {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  
  if (!project) {
    return { success: false, generatedCount: 0, totalEpisodes: 0, error: '项目không tồn tại' };
  }
  
  const episodes = project.episodeRawScripts;
  const totalEpisodes = episodes.length;
  
  if (totalEpisodes === 0) {
    return { success: false, generatedCount: 0, totalEpisodes: 0, error: '没有 tậpdữ liệu' };
  }
  
  // 获取全局背景
  const background = project.projectBackground;
  const globalContext = {
    title: background?.title || project.scriptData?.title || '未命名剧本',
    genre: background?.genre || '',
    era: background?.era || '',
    worldSetting: background?.worldSetting || '',
    themes: background?.themes || [],
    outline: background?.outline || '',
    characterBios: background?.characterBios || '',
    totalEpisodes,
  };
  
  // 注入概览里的Bối cảnh thế giới知识（角色、phe phái、核心冲突、Vật phẩm quan trọng等）
  const seriesCtx = buildSeriesContextSummary(project.seriesMeta || null);
  
  onProgress?.(0, totalEpisodes, `开始为 ${totalEpisodes}  tậpTạođại cương...`);
  
  try {
    // 准备 batch items
    type SynopsisItem = { index: number; title: string; contentSummary: string };
    type SynopsisResult = { synopsis: string; keyEvents: string[] };
    const items: SynopsisItem[] = episodes.map(ep => ({
      index: ep.episodeIndex,
      title: ep.title,
      contentSummary: extractEpisodeSummary(ep),
    }));
    
    const { results, failedBatches, totalBatches } = await processBatched<SynopsisItem, SynopsisResult>({
      items,
      feature: 'script_analysis',
      buildPrompts: (batch) => {
        const { title, genre, era, worldSetting, themes, outline, characterBios, totalEpisodes: total } = globalContext;
        const system = `你是好莱坞资深剧本医生(Script Doctor)，擅长分析剧本Cấu trúc和tự sựNhịp điệu。

你的chuyên nghiệp能力：
- 剧本Cấu trúc分析：能nhanh提炼每 tập的核心冲突、转折点和情感cao trào
- tự sựNhịp điệu把控：理解不同类型剧 tập的Nhịp điệu特点
- Sự kiện quan trọng提取：能准确识别推动剧情发展的quan trọng场景和动作

你的任务是根据剧本全局背景和每 tập内容，为每 tậpTạo简洁的đại cương和Sự kiện quan trọng。
${seriesCtx ? `\n【剧级知识Tham chiếu】\n${seriesCtx}\n` : ''}
【剧本thông tin】
tên phim：${title}
类型：${genre || '未知'}
${era ? `thời đại背景：${era}` : ''}
${worldSetting ? `Bối cảnh thế giới：${worldSetting.slice(0, 200)}` : ''}
${themes && themes.length > 0 ? `Chủ đề：${themes.join('、')}` : ''}
总 tập数：${total} tập

【故事đại cương】
${outline.slice(0, 1000)}

【主要nhân vật】
${characterBios.slice(0, 800)}

【要求】
为每 tậpTạo：
1. synopsis: 100-200字的 tậpđại cương，概括本 tập主要剧情发展
2. keyEvents: 3-5Sự kiện quan trọng，每10-20字

注意：
- đại cương要突出本 tập的核心冲突和转折
- Sự kiện quan trọng要具体、可Thị giác化
- 保持前后 tập的liên mạch性

请以JSON格式返回：
{
  "synopses": {
    "1": {
      "synopsis": "本 tậpđại cương...",
      "keyEvents": ["事件1", "事件2", "事件3"]
    }
  }
}`;
        const episodeContents = batch.map(ep => 
          `第${ep.index} tập「${ep.title}」：\n${ep.contentSummary}`
        ).join('\n\n---\n\n');
        const user = `请为以下 tập数Tạođại cương和Sự kiện quan trọng：\n\n${episodeContents}`;
        return { system, user };
      },
      parseResult: (raw) => {
        let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        const result = new Map<string, SynopsisResult>();
        if (parsed.synopses) {
          for (const [key, value] of Object.entries(parsed.synopses)) {
            const v = value as SynopsisResult;
            result.set(key, {
              synopsis: v.synopsis || '',
              keyEvents: v.keyEvents || [],
            });
          }
        }
        return result;
      },
      estimateItemOutputTokens: () => 200, // đại cương + keyEvents 约 200 tokens
      onProgress: (completed, total, message) => {
        onProgress?.(completed, total, `[đại cươngTạo] ${message}`);
      },
    });
    
    // 处理kết quả
    let generatedCount = 0;
    for (const ep of episodes) {
      const res = results.get(String(ep.episodeIndex));
      if (res) {
        store.updateEpisodeRawScript(projectId, ep.episodeIndex, {
          synopsis: res.synopsis,
          keyEvents: res.keyEvents,
          synopsisGeneratedAt: Date.now(),
        });
        generatedCount++;
      }
    }
    
    if (failedBatches > 0) {
      console.warn(`[ tậpđại cươngTạo] ${failedBatches}/${totalBatches} 批次thất bại`);
    }
    
    onProgress?.(generatedCount, totalEpisodes, `已Tạo ${generatedCount}/${totalEpisodes}  tậpđại cương`);
    
    // đại cươngTạohoàn thành后，更Dự án mới元dữ liệu MD
    const updatedMetadata = exportProjectMetadata(projectId);
    store.setMetadataMarkdown(projectId, updatedMetadata);
    console.log('[generateSynopses] 元dữ liệu已更新，包含新Tạo的đại cương');
    
    return {
      success: true,
      generatedCount,
      totalEpisodes,
    };
  } catch (error) {
    console.error('[generateSynopses] Error:', error);
    return {
      success: false,
      generatedCount: 0,
      totalEpisodes,
      error: error instanceof Error ? error.message : 'đại cươngTạothất bại',
    };
  }
}

// ==================== 导出项目元dữ liệu MD ====================

/**
 * 导出项目元dữ liệu为 Markdown 格式
 * 类似 Cursor 的 .cursorrules，作为项mục đích知识库
 */
export function exportProjectMetadata(projectId: string): string {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  
  if (!project) {
    return '# lỗi\n\n项目không tồn tại';
  }
  
  const background = project.projectBackground;
  const episodes = project.episodeRawScripts;
  const scriptData = project.scriptData;
  const meta = project.seriesMeta;
  
  const sections: string[] = [];
  
  // 标题
  const title = meta?.title || background?.title || scriptData?.title || '未命名剧本';
  sections.push(`# 《${title}》`);
  sections.push('');
  
  // 基本thông tin
  sections.push('## 基本thông tin');
  const genre = meta?.genre || background?.genre;
  const era = meta?.era || background?.era;
  if (genre) sections.push(`- **类型**：${genre}`);
  if (era) sections.push(`- **thời đại**：${era}`);
  sections.push(`- **总 tập数**：${episodes.length} tập`);
  if (meta?.language || scriptData?.language) sections.push(`- **Ngôn ngữ**：${meta?.language || scriptData?.language}`);
  if (meta?.logline) sections.push(`- **Logline**：${meta.logline}`);
  if (meta?.centralConflict) sections.push(`- **核心冲突**：${meta.centralConflict}`);
  if (meta?.themes?.length) sections.push(`- **Chủ đề**：${meta.themes.join('、')}`);
  sections.push('');
  
  // 故事đại cương
  const outline = meta?.outline || background?.outline;
  if (outline) {
    sections.push('## 故事đại cương');
    sections.push(outline);
    sections.push('');
  }
  
  // Bối cảnh thế giới设定
  const worldNotes = meta?.worldNotes || background?.worldSetting;
  if (worldNotes || meta?.powerSystem || meta?.socialSystem) {
    sections.push('## Bối cảnh thế giới设定');
    if (worldNotes) sections.push(worldNotes);
    if (meta?.socialSystem) sections.push(`- **xã hộihệ thống**：${meta.socialSystem}`);
    if (meta?.powerSystem) sections.push(`- **力量hệ thống**：${meta.powerSystem}`);
    sections.push('');
  }
  
  // Cài đặt địa lý
  if (meta?.geography?.length) {
    sections.push('## Cài đặt địa lý');
    for (const g of meta.geography) {
      sections.push(`- **${g.name}**：${g.desc}`);
    }
    sections.push('');
  }
  
  // Vật phẩm quan trọng
  if (meta?.keyItems?.length) {
    sections.push('## Vật phẩm quan trọng');
    for (const item of meta.keyItems) {
      sections.push(`- **${item.name}**：${item.desc}`);
    }
    sections.push('');
  }
  
  // 主要nhân vật（gốc小传）
  if (background?.characterBios) {
    sections.push('## 主要nhân vật');
    sections.push(background.characterBios);
    sections.push('');
  }
  
  // 角色列表（Cấu trúc化）— 优先从 seriesMeta 读取
  const characters = meta?.characters || scriptData?.characters;
  if (characters && characters.length > 0) {
    sections.push('## 角色列表');
    for (const char of characters) {
      sections.push(`### ${char.name}`);
      if (char.gender) sections.push(`- Giới tính：${char.gender}`);
      if (char.age) sections.push(`- Tuổi：${char.age}`);
      if (char.role) sections.push(`- Danh tính：${char.role}`);
      if (char.personality) sections.push(`- Tính cách：${char.personality}`);
      if (char.traits) sections.push(`- 特质：${char.traits}`);
      if (char.relationships) sections.push(`- 关系：${char.relationships}`);
      if (char.skills) sections.push(`- 技能：${char.skills}`);
      sections.push('');
    }
  }
  
  // phe phái/势力
  if (meta?.factions?.length) {
    sections.push('## phe phái/势力');
    for (const f of meta.factions) {
      sections.push(`- **${f.name}**：${f.members.join('、')}`);
    }
    sections.push('');
  }
  
  // 剧 tậpđại cương
  sections.push('## 剧 tậpđại cương');
  for (const ep of episodes) {
    sections.push(`### 第${ep.episodeIndex} tập：${ep.title.replace(/^第\d+ tập[：:]？/, '')}`);
    if (ep.synopsis) {
      sections.push(ep.synopsis);
    }
    if (ep.keyEvents && ep.keyEvents.length > 0) {
      sections.push('**Sự kiện quan trọng：**');
      for (const event of ep.keyEvents) {
        sections.push(`- ${event}`);
      }
    }
    // 显示场景数量
    sections.push(`> 本 tập包含 ${ep.scenes.length} 场景`);
    sections.push('');
  }
  
  // Tạo时间
  sections.push('---');
  sections.push(`*导出时间：${new Date().toLocaleString('zh-CN')}*`);
  
  return sections.join('\n');
}

/**
 * 获取thiếuđại cương的 tập数
 */
export function getMissingSynopsisEpisodes(projectId: string): EpisodeRawScript[] {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  
  if (!project || !project.episodeRawScripts.length) {
    return [];
  }
  
  return project.episodeRawScripts.filter(ep => !ep.synopsis || ep.synopsis.trim() === '');
}
