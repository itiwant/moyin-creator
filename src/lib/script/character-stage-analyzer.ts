// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Character Stage Analyzer
 * 
 * 分析剧本đại cương，Tự động识别主要角色的阶段变化，Tạo多阶段变体。
 * 
 * 功能：
 * 1. 分析đại cươngđang xử lý...跨度和角色成长轨迹
 * 2. 为主要角色Tạo阶段变体（青年版、đang xử lý...）
 * 3. 每变体包含 tập数范围，供分镜时Tự độnggọi API
 */

import type { ProjectBackground, ScriptCharacter, PromptLanguage } from '@/types/script';
import type { CharacterVariation } from '@/stores/character-library-store';
import { callFeatureAPI } from '@/lib/ai/feature-router';

// ==================== 类型定义 ====================

export interface CharacterStageAnalysis {
  characterName: string;
  needsMultiStage: boolean;        // 是否需要多阶段
  reason: string;                   // 判断理由
  stages: StageVariationData[];     // 阶段列表
  consistencyElements: {            // 一致性元素
    facialFeatures: string;
    bodyType: string;
    uniqueMarks: string;
  };
}

export interface StageVariationData {
  name: string;                     // "青年版"、"đang xử lý...
  episodeRange: [number, number];   // [1, 15]
  ageDescription: string;           // "25 tuổi"
  stageDescription: string;         // "Khởi nghiệp ban đầu，意气风发"
  visualPromptEn: string;           // 英文提示词
  visualPromptZh: string;           // đang xử lý...词
}

// AnalyzeOptions 已经不需要了，统一从ánh xạ dịch vụ获取配置

// ==================== 核心函数 ====================

/**
 * 分析剧本角色，识别需要多阶段形象的角色
 * 
 * @param background 项目背景（包含đại cương）
 * @param characters 角色列表
 * @param totalEpisodes 总 tập数
 * @param options API配置
 */
export async function analyzeCharacterStages(
  background: ProjectBackground,
  characters: ScriptCharacter[],
  totalEpisodes: number,
  promptLanguage: PromptLanguage = 'zh+en'
): Promise<CharacterStageAnalysis[]> {
  
  // 只分析主要角色（前3或有详细Mô tả的）
  const mainCharacters = characters.slice(0, 5).filter(c => 
    c.role || c.personality || c.appearance
  );
  
  if (mainCharacters.length === 0) {
    console.log('[CharacterStageAnalyzer] 没有找到需要分析的主要角色');
    return [];
  }
  
  const systemPrompt = `你是专业的影góc nhìn色Thiết kế顾问，擅长分析角色在长篇剧 tậpđang xử lý...变化。

你的任务是分析剧本đại cương，判断每主要角色是否需要多阶段的形象变体。

【判断标准】
角色需要多阶段形象的情况：
1. 时间跨度大（如从25 tuổi到50 tuổi）
2. 身份地位变化（从普通人到成功企业家）
3. 外貌有显著变化（年轻→成熟→老年）
4. 剧 tập数量多（30 tập以上的nhân vật chính通常需要）

不需要多阶段的情况：
1. nhân vật phụ、出场少的角色
2. 时间跨度短的剧 tập
3. 角色外貌无明显变化

【阶段划分原则】
- 根据总 tập数合理划分，每阶段至少10 tập
- 阶段之间要有明显的形象区分
- 保持Khuôn mặt特征、体型等一致性元素

请以JSON格式返回分析kết quả。`;

  const userPrompt = `【剧本信息】
tên phim：《${background.title}》
总 tập数：${totalEpisodes} tập
类型：${background.genre || '未知'}
thời đại：${background.era || '现代'}

【故事đại cương】
${background.outline?.slice(0, 1500) || '无'}

【需要分析的角色】
${mainCharacters.map(c => `
角色：${c.name}
年龄：${c.age || '未知'}
身份：${c.role || '未知'}
外貌：${c.appearance || '未知'}
`).join('\n')}

请为每角色分析是否需要多阶段形象，并Tạo阶段变体数据。

返回JSON格式：
{
  "analyses": [
    {
      "characterName": "角色名",
      "needsMultiStage": true,
      "reason": "时间跨度25年，从青年到đang xử lý....",
      "stages": [
        {
          "name": "青年版",
          "episodeRange": [1, 15],
          "ageDescription": "25 tuổi",
          "stageDescription": "985毕业生，意气风发，白衬衫",
${promptLanguage !== 'en' ? '          "visualPromptZh": "25 tuổiđang xử lý...，干净利落的外表，白色衬衫，自信有抱负的神态"' : ''}${promptLanguage !== 'zh' ? `${promptLanguage === 'zh+en' ? ',' : ''}\n          "visualPromptEn": "25 year old Chinese male, clean-cut appearance, white dress shirt, confident and ambitious look"` : ''}
        },
        {
          "name": "đang xử lý...,
          "episodeRange": [16, 40],
          "ageDescription": "35-40 tuổi",
          "stageDescription": "事业有成的企业家，更加沉稳",
${promptLanguage !== 'en' ? '          "visualPromptZh": "35-40 tuổiđang xử lý...，成熟商人形象，剪裁合身的西装"' : ''}${promptLanguage !== 'zh' ? `${promptLanguage === 'zh+en' ? ',' : ''}\n          "visualPromptEn": "35-40 year old Chinese male, mature businessman look, tailored suit, commanding presence"` : ''}
        }
      ],
      "consistencyElements": {
        "facialFeatures": "sharp jawline, deep-set eyes, straight nose",
        "bodyType": "tall, athletic build, broad shoulders",
        "uniqueMarks": "scar on left wrist"
      }
    }
  ]
}`;

  try {
    // 统一从ánh xạ dịch vụ获取配置
    const result = await callFeatureAPI('script_analysis', systemPrompt, userPrompt);
    
    // Phân tíchJSONkết quả
    let cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }
    
    const parsed = JSON.parse(cleaned);
    return parsed.analyses || [];
  } catch (error) {
    console.error('[CharacterStageAnalyzer] AI分析thất bại:', error);
    return [];
  }
}

/**
 * 将阶段分析kết quả转换为 CharacterVariation 格式
 * 可Trực tiếp用于 addVariation()
 */
export function convertStagesToVariations(
  analysis: CharacterStageAnalysis
): Omit<CharacterVariation, 'id'>[] {
  if (!analysis.needsMultiStage || analysis.stages.length === 0) {
    return [];
  }
  
  return analysis.stages.map(stage => ({
    name: stage.name,
    visualPrompt: [
      analysis.consistencyElements.facialFeatures,
      analysis.consistencyElements.bodyType,
      analysis.consistencyElements.uniqueMarks,
      stage.visualPromptEn,
    ].filter(Boolean).join(', '),
    visualPromptZh: stage.visualPromptZh,
    isStageVariation: true,
    episodeRange: stage.episodeRange,
    ageDescription: stage.ageDescription,
    stageDescription: stage.stageDescription,
  }));
}

/**
 * 根据 tập数获取角色应Sử dụng的变体
 * 
 * @param variations 角色的变体列表
 * @param episodeIndex 当前 tập数
 * @returns Khớp的变体，如果没有阶段变体则返回 undefined
 */
export function getVariationForEpisode(
  variations: CharacterVariation[],
  episodeIndex: number
): CharacterVariation | undefined {
  // 只查找阶段变体
  const stageVariations = variations.filter(v => v.isStageVariation && v.episodeRange);
  
  if (stageVariations.length === 0) {
    return undefined;
  }
  
  // 找到Khớp tập数范围的变体
  return stageVariations.find(v => {
    const [start, end] = v.episodeRange!;
    return episodeIndex >= start && episodeIndex <= end;
  });
}

/**
 * nhanh检测đại cương是否包含多阶段线索
 * 用于在Nhập剧本时提示用户
 */
export function detectMultiStageHints(outline: string, totalEpisodes: number): {
  hasTimeSpan: boolean;
  hasAgeChange: boolean;
  suggestMultiStage: boolean;
  hints: string[];
} {
  const hints: string[] = [];
  
  // 检测时间跨度（多种格式）
  const yearPatterns = [
    /(\d{4})年.*?(\d{4})年/,           // 2000年...2020年
    /(\d{4})-(\d{4})/,                   // 2000-2020
    /从(\d{4})到(\d{4})/,              // 从2000到2020
  ];
  let hasTimeSpan = false;
  for (const pattern of yearPatterns) {
    const yearMatch = outline.match(pattern);
    if (yearMatch) {
      const span = parseInt(yearMatch[2]) - parseInt(yearMatch[1]);
      if (span >= 5) {
        hasTimeSpan = true;
        hints.push(`时间跨度${span}年（${yearMatch[1]}-${yearMatch[2]}）`);
        break;
      }
    }
  }
  
  // 检测年龄变化（多种格式）
  const agePatterns = [
    /(\d+) tuổi.*?(\d+) tuổi/,              // 25 tuổi...50 tuổi
    /(\d+)-(\d+) tuổi/,                   // 25-50 tuổi
    /从(\d+) tuổi到(\d+) tuổi/,             // 从25 tuổi到50 tuổi
    /(\d+)到(\d+) tuổi/,                  // 25到50 tuổi
  ];
  let hasAgeChange = false;
  for (const pattern of agePatterns) {
    const ageMatch = outline.match(pattern);
    if (ageMatch) {
      const ageSpan = parseInt(ageMatch[2]) - parseInt(ageMatch[1]);
      if (ageSpan >= 10) { // 年龄跨度至少10 tuổi
        hasAgeChange = true;
        hints.push(`年龄跨度${ageMatch[1]} tuổi到${ageMatch[2]} tuổi`);
        break;
      }
    }
  }
  
  // 检测阶段quan trọng词（扩展列表）
  const stageKeywords = [
    '青年', 'đang xử lý... '老年', '少年', '成年', '晚年', 
    '初期', '后期', '前期', '末期',
    '年轻', '年迈', '成长', ' tuổi月', '年华',
    '创业初', '事业巅峰', '事业有成', '功成名就',
  ];
  const foundKeywords = stageKeywords.filter(k => outline.includes(k));
  if (foundKeywords.length > 0) {
    hints.push(`包含阶段quan trọng词：${foundKeywords.join('、')}`);
  }
  
  // 综合判断 - 降低门槛
  // 1. 20 tập以上且有任何线索
  // 2. 或者40 tập以上的nhân vật chính剧默认需要多阶段
  const suggestMultiStage = (
    (totalEpisodes >= 20 && (hasTimeSpan || hasAgeChange || foundKeywords.length >= 1)) ||
    (totalEpisodes >= 40) // 40 tập以上的nhân vật chính剧默认需要
  );
  
  console.log('[detectMultiStageHints]', {
    totalEpisodes,
    hasTimeSpan,
    hasAgeChange,
    foundKeywords,
    suggestMultiStage,
    hints,
  });
  
  return {
    hasTimeSpan,
    hasAgeChange,
    suggestMultiStage,
    hints,
  };
}
