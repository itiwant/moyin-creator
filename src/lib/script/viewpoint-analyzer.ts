// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * AI Viewpoint Analyzer
 * 
 * Sử dụng AI 分析场景和分镜内容，thông minhTạo合适的góc nhìn列表
 * 替代原有的硬编码quan trọng词Khớp
 */

import type { Shot, ScriptScene } from '@/types/script';
import { callFeatureAPI } from '@/lib/ai/feature-router';

export interface AnalyzedViewpoint {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  keyProps: string[];
  keyPropsEn: string[];
  shotIndexes: number[];  // 关联的分镜số thứ tự
}

export interface ViewpointAnalysisResult {
  viewpoints: AnalyzedViewpoint[];
  analysisNote: string;
}

export interface ViewpointAnalysisOptions {
  /** 本 tậpđại cương/剧情摘要 */
  episodeSynopsis?: string;
  /** 本 tậpSự kiện quan trọng */
  keyEvents?: string[];
  /** tên phim */
  title?: string;
  /** 类型（商战/武侠/爱情等） */
  genre?: string;
  /** thời đại背景 */
  era?: string;
  /** Bối cảnh thế giới/风格设定 */
  worldSetting?: string;
}

/**
 * AI 分析场景góc nhìn
 * 根据场景thông tin和分镜内容，thông minhTạo该场景需要的góc nhìn列表
 */
export async function analyzeSceneViewpoints(
  scene: ScriptScene,
  shots: Shot[],
  options?: ViewpointAnalysisOptions
): Promise<ViewpointAnalysisResult> {
  
  // 如果没有分镜，返回默认góc nhìn
  if (shots.length === 0) {
    return {
      viewpoints: [
        { id: 'overview', name: '全景', nameEn: 'Overview', description: '整体空间', descriptionEn: 'Overall space', keyProps: [], keyPropsEn: [], shotIndexes: [] },
        { id: 'detail', name: '细节', nameEn: 'Detail', description: '细节Cực cận cảnh', descriptionEn: 'Detail close-up', keyProps: [], keyPropsEn: [], shotIndexes: [] },
      ],
      analysisNote: '无分镜，Sử dụng默认góc nhìn',
    };
  }
  
  // 构建分镜内容摘要（Sử dụng更多详细trường）
  const shotSummaries = shots.map((shot, idx) => {
    const parts = [
      `【分镜${idx + 1}】`,
      shot.actionSummary && `动作Mô tả: ${shot.actionSummary}`,
      shot.visualDescription && `画面Mô tả: ${shot.visualDescription}`,
      shot.visualFocus && `Tiêu điểm thị giác: ${shot.visualFocus}`,
      shot.dialogue && `Thoại: ${shot.dialogue.slice(0, 80)}`,
      shot.ambientSound && `环境声: ${shot.ambientSound}`,
      shot.characterBlocking && `nhân vậtbố cục: ${shot.characterBlocking}`,
      shot.shotSize && `Kích thước cảnh: ${shot.shotSize}`,
      shot.cameraMovement && `镜头运动: ${shot.cameraMovement}`,
    ].filter(Boolean);
    return parts.join('\n  ');
  }).join('\n\n');
  
  // 统一处理可选参数
  const opts = options || {};

  // 构建本 tậpđại cương部分
  const synopsisPart = opts.episodeSynopsis 
    ? `【本 tậpđại cương】\n${opts.episodeSynopsis}\n`
    : '';
  const keyEventsPart = opts.keyEvents && opts.keyEvents.length > 0
    ? `【本 tậpSự kiện quan trọng】\n${opts.keyEvents.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n`
    : '';

  // 构建全局故事上下文
  const globalContextParts = [
    opts.title ? `tên phim：《${opts.title}》` : '',
    opts.genre ? `类型：${opts.genre}` : '',
    opts.era ? `thời đại背景：${opts.era}` : '',
    opts.worldSetting ? `Bối cảnh thế giới：${opts.worldSetting.slice(0, 200)}` : '',
  ].filter(Boolean);
  const globalContextSection = globalContextParts.length > 0
    ? `【剧本thông tin】\n${globalContextParts.join('\n')}\n\n`
    : '';

  const systemPrompt = `你是chuyên nghiệp的影视美术指导，擅长分析场景并确定需要的拍摄góc nhìn。

${globalContextSection}【任务】
根据本 tậpđại cương、场景thông tin和分镜内容，分析该场景需要哪些不同的góc nhìn/机位来Tạo场景背景图。

【重要原则】
1. góc nhìn必须与场景类型Khớp：
   - 大巴车/xe hơi场景：车、座位区、过道、驾驶位等
   - 室内家居：客厅、卧室、厨房、边等
   - 户外场景：全景、Cận cảnh、特定地标等
   - 古代场景：堂屋、庭院、案几等
2. 从分镜动作和画面Mô tảđang xử lý...际需要的góc nhìn
3. 结合本 tậpđại cương理解场景的tự sựchức năng，确定哪些góc nhìn是核心的
4. 每góc nhìn要有quan trọng道具（从分镜的Tiêu điểm thị giác和环境声đang xử lý...
5. 输出4-6góc nhìn

【输出格式】
返回 JSON:
{
  "viewpoints": [
    {
      "id": "唯一ID如window/seat/overview",
      "name": "đang xử lý...",
      "nameEn": "English Name",
      "description": "đang xử lý...（20字内）",
      "descriptionEn": "English description",
      "keyProps": ["道具1", "道具2"],
      "keyPropsEn": ["prop1", "prop2"],
      "shotIndexes": [1, 2]  // 哪些分镜需要这góc nhìn
    }
  ],
  "analysisNote": "分析说明"
}`;

  const userPrompt = `${synopsisPart}${keyEventsPart}【场景thông tin】
地点: ${scene.location || scene.name}
时间: ${scene.time || '日'}
氛围: ${scene.atmosphere || 'Bình tĩnh'}

【分镜内容（共 ${shots.length} 分镜）】
${shotSummaries}

请根据以上本 tậpđại cương和分镜内容，分析该场景需要的góc nhìn，返回 JSON。`;

  try {
    console.log('[analyzeSceneViewpoints] 🚀 开始gọi API AI API...');
    console.log('[analyzeSceneViewpoints] 场景:', scene.location || scene.name);
    console.log('[analyzeSceneViewpoints] 分镜数量:', shots.length);
    
    // 统一从ánh xạ dịch vụ获取配置
    const result = await callFeatureAPI('script_analysis', systemPrompt, userPrompt);
    
    console.log('[analyzeSceneViewpoints] ✅ AI API gọi API成功，返回内容长度:', result.length);
    console.log('[analyzeSceneViewpoints] gốc响应前 200 字符:', result.slice(0, 200));
    
    // Phân tích JSON
    let cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }
    
    const parsed = JSON.parse(cleaned);
    
    console.log('[analyzeSceneViewpoints] 🎯 JSON Phân tích成功，góc nhìn数量:', parsed.viewpoints?.length || 0);
    
    const viewpoints = (parsed.viewpoints || []).map((v: any, idx: number) => ({
      id: v.id || `viewpoint_${idx}`,
      name: v.name || '未命名góc nhìn',
      nameEn: v.nameEn || 'Unnamed Viewpoint',
      description: v.description || '',
      descriptionEn: v.descriptionEn || '',
      keyProps: v.keyProps || [],
      keyPropsEn: v.keyPropsEn || [],
      shotIndexes: v.shotIndexes || [],
    }));
    
    console.log('[analyzeSceneViewpoints] 📦 返回góc nhìn:', viewpoints.map((v: any) => v.name).join(', '));
    
    return {
      viewpoints,
      analysisNote: parsed.analysisNote || '',
    };
  } catch (error) {
    const err = error as Error;
    console.error('[analyzeSceneViewpoints] ❌ AI 分析thất bại:');
    console.error('[analyzeSceneViewpoints] Error name:', err.name);
    console.error('[analyzeSceneViewpoints] Error message:', err.message);
    console.error('[analyzeSceneViewpoints] Error stack:', err.stack);
    
    // 降级：返回基础góc nhìn
    return {
      viewpoints: [
        { id: 'overview', name: '全景', nameEn: 'Overview', description: '整体Bố cục không gian', descriptionEn: 'Overall spatial layout', keyProps: [], keyPropsEn: [], shotIndexes: [] },
        { id: 'medium', name: 'đang xử lý... nameEn: 'Medium Shot', description: 'đang xử lý...', descriptionEn: 'Medium view', keyProps: [], keyPropsEn: [], shotIndexes: [] },
        { id: 'detail', name: '细节', nameEn: 'Detail', description: '细节Cực cận cảnh', descriptionEn: 'Detail close-up', keyProps: [], keyPropsEn: [], shotIndexes: [] },
      ],
      analysisNote: 'AI 分析thất bại，Sử dụng默认góc nhìn',
    };
  }
}

/**
 * 批量分析多场景的góc nhìn
 */
export async function analyzeMultipleScenesViewpoints(
  scenesWithShots: Array<{ scene: ScriptScene; shots: Shot[] }>,
  options: ViewpointAnalysisOptions,
  onProgress?: (current: number, total: number, sceneName: string) => void
): Promise<Map<string, ViewpointAnalysisResult>> {
  const results = new Map<string, ViewpointAnalysisResult>();
  
  for (let i = 0; i < scenesWithShots.length; i++) {
    const { scene, shots } = scenesWithShots[i];
    
    onProgress?.(i + 1, scenesWithShots.length, scene.name || scene.location || '未知场景');
    
    const result = await analyzeSceneViewpoints(scene, shots, options);
    results.set(scene.id, result);
    
    // Tránh API 频率限制
    if (i < scenesWithShots.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
}
