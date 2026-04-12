// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Trailer Service - AI 预告片分镜chọn服务
 * 
 * 功能：从已有的分镜đang xử lý...选quan trọng分镜，Tạo预告片
 * chọn标准：
 * - tự sự功能为"cao trào/转折"的优先
 * - 有强烈情绪标签的优先
 * - 有视觉冲击的场景优先
 * - quan trọng角色出场的优先
 */

import type { Shot, ProjectBackground } from '@/types/script';
import type { SplitScene, TrailerDuration } from '@/stores/director-store';
import { callFeatureAPI } from '@/lib/ai/feature-router';

// 时长对应的分镜数量
const DURATION_TO_SHOT_COUNT: Record<TrailerDuration, number> = {
  10: 2,   // 10秒：2-3分镜
  30: 6,   // 30秒：5-6分镜
  60: 12,  // 1 phút：10-12分镜
};

/** @deprecated 不再需要手动传递，Tự động从ánh xạ dịch vụ获取 */
export interface TrailerGenerationOptions {
  apiKey?: string;
  provider?: string;
  baseUrl?: string;
}

export interface TrailerGenerationResult {
  success: boolean;
  selectedShots: Shot[];
  shotIds: string[];
  error?: string;
}

/**
 * AI chọn预告片分镜
 * 
 * @param shots Tất cả可用的分镜
 * @param background 项目背景信息
 * @param duration 预告片时长
 * @param options API 配置
 */
export async function selectTrailerShots(
  shots: Shot[],
  background: ProjectBackground | null,
  duration: TrailerDuration,
  _options?: TrailerGenerationOptions // 不再需要，保留以tương thích
): Promise<TrailerGenerationResult> {
  if (shots.length === 0) {
    return {
      success: false,
      selectedShots: [],
      shotIds: [],
      error: '没有可用的分镜',
    };
  }

  const targetCount = DURATION_TO_SHOT_COUNT[duration];
  
  // 如果分镜数量少于目标数量，Trực tiếp返回Tất cả分镜
  if (shots.length <= targetCount) {
    return {
      success: true,
      selectedShots: shots,
      shotIds: shots.map(s => s.id),
    };
  }

  try {
    // 构建分镜摘要供 AI 分析
    const shotSummaries = shots.map((shot, index) => ({
      index: index + 1,
      id: shot.id,
      episodeId: shot.episodeId,
      actionSummary: shot.actionSummary || '',
      visualDescription: shot.visualDescription || '',
      dialogue: shot.dialogue || '',
      characterNames: shot.characterNames || [],
      narrativeFunction: (shot as any).narrativeFunction || '',
      emotionTags: (shot as any).emotionTags || [],
      shotSize: shot.shotSize || '',
    }));

    const systemPrompt = `你是一位专业的电影预告片剪辑师，擅长从大量素材đang xử lý...具吸引力的镜头来制作预告片。

你的任务是从给定的分镜列表đang xử lý...最适合做预告片的 ${targetCount} 分镜。

【预告片Cấu trúc原则】
1. **开场**：建立氛围，吸引注意（1-2镜头）
2. **冲突升级**：Hiển thị故事的核心冲突（2-4镜头）
3. **cao trào悬念**：最具sức căng的画面，留下悬念（1-2镜头）

【chọn标准】
- 优先Chọntự sự功能为"cao trào"、"转折"、"冲突"的镜头
- 优先Chọn有强烈情绪（tense, excited, mysterious）的镜头
- 优先Chọn有视觉冲击力的画面（动作场面、Cực cận cảnh、对峙）
- 优先Chọn主要角色出场的quan trọng时刻
- Ghi đè不同 tập数，Hiển thị故事跨度
- 避免剧透quan trọng结局

【输出要求】
请返回一 JSON 数组，包含你chọn的分镜序号（index），按预告片播放thứ tự排列。
格式：{ "selectedIndices": [1, 5, 12, 23, 45, 60] }`;

    const userPrompt = `【项目信息】
${background?.title ? `tên phim：《${background.title}》` : ''}
${background?.outline ? `đại cương：${background.outline.slice(0, 500)}` : ''}

【分镜列表】（共 ${shots.length} 分镜）
${shotSummaries.map(s => 
  `[${s.index}] ${s.id}
   动作：${s.actionSummary.slice(0, 100)}
   Mô tả：${s.visualDescription.slice(0, 100)}
   角色：${s.characterNames.join('、') || '无'}
   tự sự功能：${s.narrativeFunction || '未知'}
   情绪：${Array.isArray(s.emotionTags) ? s.emotionTags.join(', ') : '无'}`
).join('\n\n')}

请从以上分镜đang xử lý...${targetCount} 最适合做预告片的镜头，返回 JSON 格式的序号列表。`;

    // 统一从ánh xạ dịch vụ获取配置
    const result = await callFeatureAPI('script_analysis', systemPrompt, userPrompt);

    // Phân tích AI 返回的 JSON - 支持多种格式
    let selectedIndices: number[] = [];
    
    console.log('[TrailerService] AI raw response (first 1000 chars):', result.slice(0, 1000));
    
    // 尝试匹配 { "selectedIndices": [...] } 格式
    const jsonMatch = result.match(/\{[\s\S]*?"selectedIndices"\s*:\s*\[[\d,\s]*\][\s\S]*?\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        selectedIndices = parsed.selectedIndices || [];
      } catch (e) {
        console.warn('[TrailerService] Failed to parse JSON match:', e);
      }
    }
    
    // 如果上面thất bại，尝试Trực tiếp匹配数字数组 [1, 2, 3, ...]
    if (selectedIndices.length === 0) {
      const arrayMatch = result.match(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/);
      if (arrayMatch) {
        try {
          selectedIndices = JSON.parse(arrayMatch[0]);
        } catch (e) {
          console.warn('[TrailerService] Failed to parse array match:', e);
        }
      }
    }
    
    // 如果还是thất bại，尝试提取Tất cả数字
    if (selectedIndices.length === 0) {
      const numbers = result.match(/\b(\d{1,3})\b/g);
      if (numbers) {
        selectedIndices = numbers
          .map(n => parseInt(n, 10))
          .filter(n => n >= 1 && n <= shots.length)
          .slice(0, targetCount);
      }
    }
    
    if (selectedIndices.length === 0) {
      throw new Error('AI 返回格式错误，无法Phân tích序号');
    }
    
    console.log('[TrailerService] Parsed selectedIndices:', selectedIndices);

    // 根据序号获取对应的分镜
    const selectedShots = selectedIndices
      .filter(idx => idx >= 1 && idx <= shots.length)
      .map(idx => shots[idx - 1]);

    return {
      success: true,
      selectedShots,
      shotIds: selectedShots.map(s => s.id),
    };
  } catch (error) {
    console.error('[TrailerService] AI selection failed:', error);
    
    // 回退方案：Sử dụng规则chọn
    const fallbackShots = selectTrailerShotsByRules(shots, targetCount);
    return {
      success: true,
      selectedShots: fallbackShots,
      shotIds: fallbackShots.map(s => s.id),
      error: 'AI chọnthất bại，Sử dụng规则chọn',
    };
  }
}

/**
 * 规则chọn（AI thất bại时的回退方案）
 */
function selectTrailerShotsByRules(shots: Shot[], targetCount: number): Shot[] {
  // 评分函数
  const scoreShot = (shot: Shot): number => {
    let score = 0;
    
    // tự sự功能评分
    const narrativeFunction = (shot as any).narrativeFunction || '';
    if (narrativeFunction.includes('cao trào')) score += 10;
    if (narrativeFunction.includes('转折')) score += 8;
    if (narrativeFunction.includes('冲突')) score += 6;
    if (narrativeFunction.includes('升级')) score += 4;
    
    // 情绪评分
    const emotionTags = (shot as any).emotionTags || [];
    if (emotionTags.includes('tense')) score += 5;
    if (emotionTags.includes('excited')) score += 5;
    if (emotionTags.includes('mysterious')) score += 4;
    if (emotionTags.includes('touching')) score += 3;
    
    // 有Thoại的镜头更有吸引力
    if (shot.dialogue) score += 2;
    
    // 有多角色的镜头更有戏剧性
    if (shot.characterNames && shot.characterNames.length >= 2) score += 2;
    
    return score;
  };

  // 按分数排序
  const scoredShots = shots.map(shot => ({
    shot,
    score: scoreShot(shot),
  })).sort((a, b) => b.score - a.score);

  // 从不同 tập数đang xử lý...选
  const episodeIds = shots.map(s => s.episodeId).filter((id): id is string => !!id);
  const episodeSet = new Set(episodeIds);
  const episodeCount = episodeSet.size;
  
  if (episodeCount > 1) {
    // 多 tập：每 tậpchọn一部分
    const perEpisode = Math.ceil(targetCount / episodeCount);
    const selected: Shot[] = [];
    const episodeSelected = new Map<string, number>();
    
    for (const { shot } of scoredShots) {
      const epId = shot.episodeId || 'default';
      const count = episodeSelected.get(epId) || 0;
      
      if (count < perEpisode && selected.length < targetCount) {
        selected.push(shot);
        episodeSelected.set(epId, count + 1);
      }
    }
    
    // 按gốcthứ tự排序（预告片按时间线）
    return selected.sort((a, b) => {
      const idxA = shots.findIndex(s => s.id === a.id);
      const idxB = shots.findIndex(s => s.id === b.id);
      return idxA - idxB;
    });
  } else {
    // 单 tập：Trực tiếp取分数最高的
    return scoredShots.slice(0, targetCount).map(s => s.shot);
  }
}

/**
 * 将chọn的 Shot 转换为 SplitScene 格式（用于 AI Đạo diễn分镜chỉnh sửa）
 */
export function convertShotsToSplitScenes(
  shots: Shot[],
  sceneName?: string
): SplitScene[] {
  return shots.map((shot, index) => ({
    id: index,
    sceneName: sceneName || `预告片 #${index + 1}`,
    sceneLocation: '',
    imageDataUrl: '',
    imageHttpUrl: null,
    width: 0,
    height: 0,
    imagePrompt: shot.imagePrompt || shot.visualPrompt || '',
    imagePromptZh: shot.imagePromptZh || shot.visualDescription || '',
    videoPrompt: shot.videoPrompt || '',
    videoPromptZh: shot.videoPromptZh || '',
    endFramePrompt: shot.endFramePrompt || '',
    endFramePromptZh: shot.endFramePromptZh || '',
    needsEndFrame: shot.needsEndFrame || false,
    row: 0,
    col: index,
    sourceRect: { x: 0, y: 0, width: 0, height: 0 },
    endFrameImageUrl: null,
    endFrameHttpUrl: null,
    endFrameSource: null,
    characterIds: [],
    emotionTags: (shot.emotionTags || []) as any,
    shotSize: shot.shotSize as any || null,
    // Seedance 1.5 Pro 要求 4-12 秒，强制限制范围
    duration: Math.max(4, Math.min(12, shot.duration || 5)),
    ambientSound: shot.ambientSound || '',
    soundEffects: [],
    soundEffectText: shot.soundEffect || '',
    dialogue: shot.dialogue || '',
    actionSummary: shot.actionSummary || '',
    cameraMovement: shot.cameraMovement || '',
    // tự sự驱动trường
    narrativeFunction: (shot as any).narrativeFunction || '',
    shotPurpose: (shot as any).shotPurpose || '',
    visualFocus: (shot as any).visualFocus || '',
    cameraPosition: (shot as any).cameraPosition || '',
    characterBlocking: (shot as any).characterBlocking || '',
    rhythm: (shot as any).rhythm || '',
    visualDescription: shot.visualDescription || '',
    // 灯光师
    lightingStyle: shot.lightingStyle,
    lightingDirection: shot.lightingDirection,
    colorTemperature: shot.colorTemperature,
    lightingNotes: shot.lightingNotes,
    // 跟焦员
    depthOfField: shot.depthOfField,
    focusTarget: shot.focusTarget,
    focusTransition: shot.focusTransition,
    // 器材组
    cameraRig: shot.cameraRig,
    movementSpeed: shot.movementSpeed,
    // 特效师
    atmosphericEffects: shot.atmosphericEffects,
    effectIntensity: shot.effectIntensity,
    // 速度控制
    playbackSpeed: shot.playbackSpeed,
    // 连戏
    continuityRef: shot.continuityRef,
    imageStatus: 'idle' as const,
    imageProgress: 0,
    imageError: null,
    videoStatus: 'idle' as const,
    videoProgress: 0,
    videoUrl: null,
    videoError: null,
    videoMediaId: null,
    endFrameStatus: 'idle' as const,
    endFrameProgress: 0,
    endFrameError: null,
  }));
}
