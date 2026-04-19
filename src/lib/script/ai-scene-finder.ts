// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * AI Scene Finder
 * 
 * 根据người dùng自然Ngôn ngữMô tả，从剧本đang xử lý...景并Tạochuyên nghiệp场景dữ liệu
 * 
 * chức năng：
 * 1. Phân tíchngười dùng输入（如 "缺第5 tập的张家客厅"）
 * 2. 搜索剧本đang xử lý...thông tin
 * 3. AI Tạođầy đủ场景dữ liệu（包括Thị giác提示词）
 */

import type { ScriptScene, ProjectBackground, EpisodeRawScript, SceneRawContent } from '@/types/script';
import { callFeatureAPI } from '@/lib/ai/feature-router';

// ==================== 类型定义 ====================

export interface SceneSearchResult {
  /** 是否Tìm thấy场景 */
  found: boolean;
  /** 场景名/地点 */
  name: string;
  /** 置信度 0-1 */
  confidence: number;
  /** 出现的 tập数 */
  episodeNumbers: number[];
  /** Tìm thấy的上下文（场景内容等） */
  contexts: string[];
  /** AI Tạo的đầy đủ场景dữ liệu */
  scene?: ScriptScene;
  /** 搜索说明 */
  message: string;
}

/** @deprecated 不再需要手动传递，Tự động从ánh xạ dịch vụ获取 */
export interface SceneFinderOptions {
  apiKey?: string;
  provider?: string;
  baseUrl?: string;
}

// ==================== 核心函数 ====================

/**
 * Phân tíchngười dùng输入，提取场景名和 tập数thông tin
 */
function parseSceneQuery(query: string): { name: string | null; episodeNumber: number | null } {
  let name: string | null = null;
  let episodeNumber: number | null = null;
  
  // 提取 tập数：第X tập、第X话、EP.X、EpX 等
  const episodeMatch = query.match(/第\s*(\d+)\s*[ tập话]|EP\.?\s*(\d+)|episode\s*(\d+)/i);
  if (episodeMatch) {
    episodeNumber = parseInt(episodeMatch[1] || episodeMatch[2] || episodeMatch[3]);
  }
  
  // 移除 tập数相关文本
  let cleanQuery = query
    .replace(/第\s*\d+\s*[ tập话]/g, '')
    .replace(/EP\.?\s*\d+/gi, '')
    .replace(/episode\s*\d+/gi, '')
    .trim();
  
  // chế độ1：X这场景/X这地点/X这背景
  let nameMatch = cleanQuery.match(/[「「"']?([^「」""'\s,，。！？]+?)[」」"']?\s*这[场景地点背景环境]/);
  if (nameMatch) {
    name = nameMatch[1];
  }
  
  // chế độ2：缺/需要/Thêm + 场景名
  if (!name) {
    nameMatch = cleanQuery.match(/^[缺需要Thêm找查想请帮我的]+\s*[「「"']?([^「」""'\s,，。！？这场景地点]{2,15})[」」"']?/);
    if (nameMatch) {
      name = nameMatch[1];
    }
  }
  
  // chế độ3：场景：/地点：后面的内容
  if (!name) {
    nameMatch = cleanQuery.match(/[场景地点背景][：:名]?\s*[「「"']?([^「」""'\s,，。！？]{2,15})[」」"']?/);
    if (nameMatch) {
      name = nameMatch[1];
    }
  }
  
  // chế độ4：Trực tiếp就是场景名（2-15ký tự）
  if (!name) {
    const pureQuery = cleanQuery.replace(/^[缺需要Thêm找查想请帮我的]+/g, '').trim();
    if (pureQuery.length >= 2 && pureQuery.length <= 15 && /^[\u4e00-\u9fa5A-Za-z\s]+$/.test(pureQuery)) {
      name = pureQuery;
    }
  }
  
  return { name, episodeNumber };
}

/**
 * 从剧本đang xử lý...景
 */
function searchSceneInScripts(
  name: string,
  episodeScripts: EpisodeRawScript[],
  targetEpisode?: number
): {
  found: boolean;
  episodeNumbers: number[];
  contexts: string[];
  matchedScenes: { episodeIndex: number; scene: SceneRawContent }[];
} {
  const episodeNumbers: number[] = [];
  const contexts: string[] = [];
  const matchedScenes: { episodeIndex: number; scene: SceneRawContent }[] = [];
  
  // 遍历剧本搜索
  const scriptsToSearch = targetEpisode 
    ? episodeScripts.filter(ep => ep.episodeIndex === targetEpisode)
    : episodeScripts;
  
  for (const ep of scriptsToSearch) {
    if (!ep || !ep.scenes) continue;
    
    for (const scene of ep.scenes) {
      if (!scene) continue;
      
      // kiểm tra场景头是否Khớp（场景头通常chứa地点thông tin）
      const sceneHeader = scene.sceneHeader || '';
      const isMatch = 
        sceneHeader.includes(name) || 
        name.includes(sceneHeader.split(/\s+/).slice(-1)[0] || '') || // Khớp最后一词（通常是地点）
        sceneHeader.split(/\s+/).some(word => word.includes(name) || name.includes(word));
      
      if (isMatch) {
        if (!episodeNumbers.includes(ep.episodeIndex)) {
          episodeNumbers.push(ep.episodeIndex);
        }
        
        matchedScenes.push({ episodeIndex: ep.episodeIndex, scene });
        
        // thu thập上下文
        if (contexts.length < 5) {
          const sceneContext = [
            `【第${ep.episodeIndex} tập - ${sceneHeader}】`,
            scene.characters?.length ? `nhân vật: ${scene.characters.join(', ')}` : '',
            scene.actions?.slice(0, 2).join('\n') || '',
            scene.dialogues?.slice(0, 2).map(d => `${d.character}: ${d.line.slice(0, 30)}...`).join('\n') || '',
          ].filter(Boolean).join('\n');
          contexts.push(sceneContext);
        }
      }
    }
  }
  
  return {
    found: matchedScenes.length > 0,
    episodeNumbers,
    contexts,
    matchedScenes,
  };
}

/**
 * Sử dụng AI Tạođầy đủ场景dữ liệu
 */
async function generateSceneData(
  name: string,
  background: ProjectBackground,
  contexts: string[],
  matchedScenes: { episodeIndex: number; scene: SceneRawContent }[]
): Promise<ScriptScene> {
  
  // 从Khớp的场景đang xử lý...息
  const sceneHeaders = matchedScenes.map(s => s.scene.sceneHeader).filter(Boolean);
  const allActions = matchedScenes.flatMap(s => s.scene.actions || []).slice(0, 5);
  const allCharacters = [...new Set(matchedScenes.flatMap(s => s.scene.characters || []))];
  
  const systemPrompt = `你是chuyên nghiệp的影视场景Thiết kế师，擅长从剧本thông tinđang xử lý...景特征并Tạochuyên nghiệp的场景dữ liệu。

请根据提供的剧本thông tin和场景上下文，Tạođầy đủ的场景dữ liệu。

【Đầu rađịnh dạng】
请返回JSONđịnh dạng，chứa以下trường：
{
  "name": "场景名称（简短）",
  "location": "地点详细Mô tả",
  "time": "时间（如 'ban ngày'、'ban đêm'、'Hoàng hôn'、'清晨'）",
  "atmosphere": "Bầu không khíMô tả（如 'căng thẳng'、'ấm cúng'、'压抑'、'热闹'）",
  "visualPrompt": "英文Thị giác提示词，用于AI图像Tạo，Mô tả场景环境、光线、色调、Phong cách kiến trúc等",
  "visualPromptZh": "đang xử lý...Mô tả",
  "tags": ["标签1", "标签2"],
  "notes": "场景备注（剧情作用）"
}`;

  const userPrompt = `【剧本thông tin】
tên phim：《${background.title}》
类型：${background.genre || '剧情'}
thời đại：${background.era || '现代'}

【故事đại cương】
${background.outline?.slice(0, 800) || '无'}

【Bối cảnh thế giới/风格设定】
${background.worldSetting?.slice(0, 500) || '无'}

【要分析的场景】
${name}

【场景出现的场景头】
${sceneHeaders.slice(0, 5).join('\n')}

【场景内的动作描写】
${allActions.join('\n')}

【场景内出现的nhân vật】
${allCharacters.join(', ')}

【场景上下文】
${contexts.slice(0, 3).join('\n\n')}

请基于以上thông tin，Tạo场景「${name}」的đầy đủdữ liệu。如果thông tin不足，请根据剧本类型和thời đại背景合理推断。`;

  try {
    // 统一从ánh xạ dịch vụ获取cấu hình
    const result = await callFeatureAPI('script_analysis', systemPrompt, userPrompt);
    
    // Phân tích JSON
    let cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }
    
    const parsed = JSON.parse(cleaned);
    
    // 确保Tất cảtrường都是ký tự串类型（AI 可能返回对象）
    const ensureString = (val: any): string | undefined => {
      if (val === null || val === undefined) return undefined;
      if (typeof val === 'string') return val;
      if (typeof val === 'object') {
        if (Array.isArray(val)) {
          return val.join(', ');
        }
        return Object.entries(val)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ');
      }
      return String(val);
    };
    
    // 确保 tags 是ký tự串数组
    const ensureTags = (val: any): string[] | undefined => {
      if (!val) return undefined;
      if (Array.isArray(val)) {
        return val.map(t => String(t));
      }
      if (typeof val === 'string') {
        return val.split(/[,，、]/).map(t => t.trim()).filter(Boolean);
      }
      return undefined;
    };
    
    return {
      id: `scene_${Date.now()}`,
      name: ensureString(parsed.name) || name,
      location: ensureString(parsed.location) || name,
      time: ensureString(parsed.time) || 'ban ngày',
      atmosphere: ensureString(parsed.atmosphere) || '',
      visualPrompt: ensureString(parsed.visualPrompt),
      tags: ensureTags(parsed.tags),
      notes: ensureString(parsed.notes),
    };
  } catch (error) {
    console.error('[generateSceneData] AITạothất bại:', error);
    // 返回基础dữ liệu
    return {
      id: `scene_${Date.now()}`,
      name,
      location: name,
      time: 'ban ngày',
      atmosphere: '',
    };
  }
}

/**
 * 主函数：根据người dùngMô tả查找并Tạo场景
 */
export async function findSceneByDescription(
  userQuery: string,
  background: ProjectBackground,
  episodeScripts: EpisodeRawScript[],
  existingScenes: ScriptScene[],
  _options?: SceneFinderOptions // 不再需要，保留以tương thích
): Promise<SceneSearchResult> {
  console.log('[findSceneByDescription] người dùng查询:', userQuery);
  
  // 1. Phân tíchngười dùng输入
  const { name, episodeNumber } = parseSceneQuery(userQuery);
  
  if (!name) {
    return {
      found: false,
      name: '',
      confidence: 0,
      episodeNumbers: [],
      contexts: [],
      message: 'Không thể识别场景名。请用类似"缺第5 tập的张家客厅"hoặc"Thêm医院走廊这场景"的方式Mô tả。',
    };
  }
  
  console.log('[findSceneByDescription] Phân tíchkết quả:', { name, episodeNumber });
  
  // 2. kiểm tra是否已存在
  const existing = existingScenes.find(s => 
    s.name === name || 
    s.location === name || 
    (s.name && (s.name.includes(name) || name.includes(s.name))) ||
    s.location.includes(name) || 
    name.includes(s.location)
  );
  
  if (existing) {
    return {
      found: true,
      name: existing.name || existing.location,
      confidence: 1,
      episodeNumbers: [],
      contexts: [],
      message: `场景「${existing.name || existing.location}」已存在于场景列表中。`,
      scene: existing,
    };
  }
  
  // 3. 从剧本中搜索
  const searchResult = searchSceneInScripts(name, episodeScripts, episodeNumber || undefined);
  
  if (!searchResult.found) {
    // 没找到但可以让用户确认是否创建
    return {
      found: false,
      name,
      confidence: 0.3,
      episodeNumbers: [],
      contexts: [],
      message: episodeNumber
        ? `在第 ${episodeNumber} 集中未找到场景「${name}」。是否仍要创建这个场景？`
        : `在剧本中未找到场景「${name}」。是否仍要创建这个场景？`,
    };
  }
  
  // 4. Sử dụng AI Tạođầy đủ场景dữ liệu
  console.log('[findSceneByDescription] ĐangTạo场景dữ liệu...');
  
  const scene = await generateSceneData(
    name,
    background,
    searchResult.contexts,
    searchResult.matchedScenes
  );
  
  // 计算置信度
  const confidence = Math.min(
    0.5 + searchResult.matchedScenes.length * 0.1 + searchResult.episodeNumbers.length * 0.05,
    1
  );
  
  return {
    found: true,
    name: scene.name || scene.location,
    confidence,
    episodeNumbers: searchResult.episodeNumbers,
    contexts: searchResult.contexts,
    message: `已找到场景「${scene.name || scene.location}」，出现在第 ${searchResult.episodeNumbers.join(', ')} 集。`,
    scene,
  };
}

/**
 * 仅搜索（不gọi APIAI），用于nhanh预览
 */
export function quickSearchScene(
  userQuery: string,
  episodeScripts: EpisodeRawScript[],
  existingScenes: ScriptScene[]
): { name: string | null; found: boolean; message: string; existingScene?: ScriptScene } {
  const { name, episodeNumber } = parseSceneQuery(userQuery);
  
  if (!name) {
    return { name: null, found: false, message: '请输入场景名' };
  }
  
  // kiểm tra已存在
  const existing = existingScenes.find(s => 
    s.name === name || 
    s.location === name ||
    (s.name && (s.name.includes(name) || name.includes(s.name))) ||
    s.location.includes(name) || 
    name.includes(s.location)
  );
  
  if (existing) {
    return { 
      name: existing.name || existing.location, 
      found: true, 
      message: `场景「${existing.name || existing.location}」已存在`,
      existingScene: existing,
    };
  }
  
  // nhanh搜索
  const searchResult = searchSceneInScripts(name, episodeScripts, episodeNumber || undefined);
  
  if (searchResult.found) {
    return {
      name,
      found: true,
      message: `已找到「${name}」，出现在第 ${searchResult.episodeNumbers.join(', ')} 集。`,
    };
  }

  return {
    name,
    found: false,
    message: `未在剧本中找到「${name}」`,
  };
}
