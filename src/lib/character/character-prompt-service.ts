// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Character Prompt Generation Service
 * 
 * chuyên nghiệp角色Thiết kế服务，与hiện có角色库(character-library-store)对齐。
 * 
 * chức năng：
 * 1. 读取剧本元dữ liệu，理解角色成长cung
 * 2. 根据剧情阶段Tạo不同的角色形象
 * 3. Tạo的阶段可转换为角色库的 CharacterVariation
 * 4. Sử dụng世界级chuyên nghiệp人设提升 AI Tạo质量
 * 
 * 注意：这是一辅助服务，不修改hiện có角色库的任何chức năng。
 */

import { useScriptStore } from '@/stores/script-store';
import { callFeatureAPI } from '@/lib/ai/feature-router';
import type { CharacterVariation } from '@/stores/character-library-store';

// ==================== 类型定义 ====================

/**
 * 角色阶段形象
 * 一角色在不同剧情阶段可能有不同的ngoại hình/状态
 */
export interface CharacterStageAppearance {
  stageId: string;           // 阶段ID
  stageName: string;         // 阶段名称（如"少年时期"、"成为大亨后"）
  episodeRange: string;      //  tập数范围（如"1-5"、"10-20"）
  description: string;       // 该阶段的角色Mô tả
  visualPromptEn: string;    // 英文Thị giác提示词
  visualPromptZh: string;    // đang xử lý...提示词
  ageDescription?: string;   // TuổiMô tả
  clothingStyle?: string;    // trang phục风格
  keyChanges?: string;       // 与上一阶段的quan trọng变化
}

/**
 * đầy đủ角色Thiết kế
 */
export interface CharacterDesign {
  characterId: string;
  characterName: string;
  // Thông tin cơ bản
  baseDescription: string;      // 基础角色Mô tả
  baseVisualPromptEn: string;   // 基础英文提示词
  baseVisualPromptZh: string;   // 基础đang xử lý...词
  // 多阶段形象
  stages: CharacterStageAppearance[];
  // 一致性元素（Tất cả阶段共享）
  consistencyElements: {
    facialFeatures: string;     // Khuôn mặt特征（không thay đổi）
    bodyType: string;           // 体型
    uniqueMarks: string;        // 独特标记（胎记、疤痕等）
  };
  // 元dữ liệu
  generatedAt: number;
  sourceProjectId: string;
}

/** @deprecated 不再需要手动传递，Tự động从ánh xạ dịch vụ获取 */
export interface CharacterDesignOptions {
  apiKey?: string;
  provider?: string;
  baseUrl?: string;
  styleId?: string;
}

// ==================== AI 角色Thiết kế服务 ====================

/**
 * 为剧本角色Tạochuyên nghiệp的多阶段角色Thiết kế
 * 
 * @param characterId 剧本đang xử lý...ID
 * @param projectId 项目ID
 * @param options API配置
 */
export async function generateCharacterDesign(
  characterId: string,
  projectId: string,
  _options?: CharacterDesignOptions // 不再需要，保留以tương thích
): Promise<CharacterDesign> {
  const store = useScriptStore.getState();
  const project = store.projects[projectId];
  
  if (!project) {
    throw new Error('项目không tồn tại');
  }
  
  const scriptData = project.scriptData;
  if (!scriptData) {
    throw new Error('剧本dữ liệukhông tồn tại');
  }
  
  // 找到目标角色
  const character = scriptData.characters.find(c => c.id === characterId);
  if (!character) {
    throw new Error('角色không tồn tại');
  }
  
  // thu thập角色相关的上下文thông tin
  const context = buildCharacterContext(project, character);
  
  // gọi API AI Tạo角色Thiết kế
  const design = await callAIForCharacterDesign(
    character,
    context
  );
  
  return design;
}

/**
 * 构建角色上下文thông tin
 */
function buildCharacterContext(project: any, character: any): {
  projectTitle: string;
  genre: string;
  era: string;
  outline: string;
  totalEpisodes: number;
  characterBio: string;
  characterAppearances: Array<{
    episodeIndex: number;
    episodeTitle: string;
    scenes: string[];
    actions: string[];
    dialogues: string[];
  }>;
} {
  const background = project.projectBackground;
  const episodes = project.episodeRawScripts || [];
  const shots = project.shots || [];
  
  // thu thập角色在各 tậpđang xử lý...thông tin
  const characterAppearances: Array<{
    episodeIndex: number;
    episodeTitle: string;
    scenes: string[];
    actions: string[];
    dialogues: string[];
  }> = [];
  
  for (const ep of episodes) {
    const epShots = shots.filter((s: any) => 
      s.characterNames?.includes(character.name)
    );
    
    if (epShots.length > 0) {
      const sceneIds: string[] = Array.from(
        new Set<string>(
          epShots
            .map((s: any) => s.sceneRefId)
            .filter((id: unknown): id is string | number => id !== null && id !== undefined)
            .map((id): string => String(id))
        )
      );

      characterAppearances.push({
        episodeIndex: ep.episodeIndex,
        episodeTitle: ep.title,
        scenes: sceneIds,
        actions: epShots.map((s: any) => s.actionSummary).filter(Boolean).slice(0, 5),
        dialogues: epShots.map((s: any) => s.dialogue).filter(Boolean).slice(0, 5),
      });
    }
  }
  
  // 构建角色传记
  const characterBio = [
    character.name,
    character.gender ? `Giới tính：${character.gender}` : '',
    character.age ? `Tuổi: ${character.age}` : '',
    character.personality ? `Tính cách：${character.personality}` : '',
    character.role ? `Danh tính：${character.role}` : '',
    character.traits ? `特质：${character.traits}` : '',
    character.appearance ? `外貌：${character.appearance}` : '',
    character.relationships ? `关系：${character.relationships}` : '',
    character.keyActions ? `Sự kiện quan trọng：${character.keyActions}` : '',
  ].filter(Boolean).join('\n');
  
  return {
    projectTitle: background?.title || project.scriptData?.title || '未命名剧本',
    genre: background?.genre || '',
    era: background?.era || '',
    outline: background?.outline || '',
    totalEpisodes: episodes.length,
    characterBio,
    characterAppearances,
  };
}

/**
 * gọi API AI Tạo角色Thiết kế
 */
async function callAIForCharacterDesign(
  character: any,
  context: any
): Promise<CharacterDesign> {
  
  const systemPrompt = `你是好莱坞顶级角色Thiết kế大师，曾为漫威、迪士尼、皮克斯Thiết kế过无数经典角色。

你的chuyên nghiệp能力：
- **角色Thị giácThiết kế**：能准确捕捉角色的外在形象、trang phục风格、肢体Ngôn ngữ
- **角色成长cung**：理解角色在不同剧情阶段的形象变化（从少年到成年、从普通人到英雄等）
- **AI图像Tạo经验**：深谙 Midjourney、DALL-E、Stable Diffusion 等 AI 绘图模型的工作原理，能写出高质量的提示词
- **一致性保持**：知道如何Mô tảKhuôn mặt特征、体型等không thay đổi元素，确保角色在不同阶段仍可辨认

你的任务是根据剧本thông tin，为角色Thiết kế**多阶段Thị giác形象**。

【剧本thông tin】
tên phim：《${context.projectTitle}》
类型：${context.genre || '未知'}
thời đại：${context.era || '现代'}
总 tập数：${context.totalEpisodes} tập

【故事đại cương】
${context.outline?.slice(0, 800) || '无'}

【角色thông tin】
${context.characterBio}

【角色出场统计】
${context.characterAppearances.length > 0 
  ? context.characterAppearances.map((a: any) => 
      `第${a.episodeIndex} tập「${a.episodeTitle}」: 出场${a.actions.length}次`
    ).join('\n')
  : '暂无出场dữ liệu'
}

【任务要求】
1. **分析角色成长cung**：根据剧情判断角色是否有明显的阶段变化
   - Tuổi变化：小孩→少年→成年→老年
   - Danh tính变化：普通人→商业大亨、学徒→武林高手
   - 状态变化：健康→受伤、普通→修仙后形态
   
2. **Thiết kế多阶段形象**：为每阶段Tạo独立的Thị giác提示词
   - 如果角色没有明显阶段变化，只需Thiết kế1阶段
   - 如果有变化，Thiết kế2-4阶段

3. **保持一致性元素**：识别角色的không thay đổi特征
   - Khuôn mặt特征（眼睛形状、五官Tỷ lệ）
   - 体型特征（身高、体格）
   - 独特标记（胎记、疤痕、标志性特征）

4. **提示词要求**：
   - 英文提示词：40-60词，适合AI图像Tạo
   - đang xử lý...词：详细Mô tả，包含细节

请以JSON格式返回：
{
  "characterName": "角色名",
  "baseDescription": "角色基础Mô tả（一句话）",
  "baseVisualPromptEn": "基础英文提示词",
  "baseVisualPromptZh": "基础đang xử lý...词",
  "consistencyElements": {
    "facialFeatures": "Khuôn mặt特征Mô tả（英文）",
    "bodyType": "体型Mô tả（英文）",
    "uniqueMarks": "独特标记Mô tả（英文，如无则为空）"
  },
  "stages": [
    {
      "stageId": "stage_1",
      "stageName": "阶段名称（如：少年时期）",
      "episodeRange": "1-5",
      "description": "该阶段角色状态Mô tả",
      "visualPromptEn": "该阶段英文Thị giác提示词",
      "visualPromptZh": "该阶段đang xử lý...提示词",
      "ageDescription": "TuổiMô tả",
      "clothingStyle": "trang phục风格",
      "keyChanges": "与上一阶段的变化（第一阶段为空）"
    }
  ]
}`;

  const userPrompt = `请为角色「${character.name}」Thiết kế多阶段Thị giác形象。`;
  
  // 统一从ánh xạ dịch vụ获取配置
  const result = await callFeatureAPI('script_analysis', systemPrompt, userPrompt);
  
  // Phân tíchkết quả
  try {
    let cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }
    
    const parsed = JSON.parse(cleaned);
    
    return {
      characterId: character.id,
      characterName: parsed.characterName || character.name,
      baseDescription: parsed.baseDescription || '',
      baseVisualPromptEn: parsed.baseVisualPromptEn || '',
      baseVisualPromptZh: parsed.baseVisualPromptZh || '',
      stages: parsed.stages || [],
      consistencyElements: parsed.consistencyElements || {
        facialFeatures: '',
        bodyType: '',
        uniqueMarks: '',
      },
      generatedAt: Date.now(),
      sourceProjectId: context.projectTitle,
    };
  } catch (e) {
    console.error('[CharacterDesign] Failed to parse AI response:', result);
    throw new Error('Phân tích角色Thiết kếthất bại');
  }
}

/**
 * 根据 tập数获取角色当前阶段的提示词
 * 
 * @param design 角色Thiết kế
 * @param episodeIndex 当前 tập数
 */
export function getCharacterPromptForEpisode(
  design: CharacterDesign,
  episodeIndex: number
): { promptEn: string; promptZh: string; stageName: string } {
  // 找到对应阶段
  for (const stage of design.stages) {
    const [start, end] = stage.episodeRange.split('-').map(Number);
    if (episodeIndex >= start && episodeIndex <= end) {
      // 组合一致性元素和阶段提示词
      const consistencyPrefix = [
        design.consistencyElements.facialFeatures,
        design.consistencyElements.bodyType,
        design.consistencyElements.uniqueMarks,
      ].filter(Boolean).join(', ');
      
      return {
        promptEn: consistencyPrefix 
          ? `${consistencyPrefix}, ${stage.visualPromptEn}`
          : stage.visualPromptEn,
        promptZh: stage.visualPromptZh,
        stageName: stage.stageName,
      };
    }
  }
  
  // 默认返回基础提示词
  return {
    promptEn: design.baseVisualPromptEn,
    promptZh: design.baseVisualPromptZh,
    stageName: '默认',
  };
}

/**
 * 将角色Thiết kế转换为角色库的变体格式 (CharacterVariation)
 * 可Trực tiếp用于 addVariation() 方法
 * 
 * @param design 角色Thiết kế
 * @returns 可Trực tiếpThêm到角色库的变体数组
 */
export function convertDesignToVariations(design: CharacterDesign): Array<Omit<CharacterVariation, 'id'>> {
  return design.stages.map(stage => ({
    name: stage.stageName,
    // 组合一致性元素 + 阶段提示词
    visualPrompt: [
      design.consistencyElements.facialFeatures,
      design.consistencyElements.bodyType,
      design.consistencyElements.uniqueMarks,
      stage.visualPromptEn,
    ].filter(Boolean).join(', '),
    // referenceImage Để trống，等待người dùngTạo
    referenceImage: undefined,
    generatedAt: undefined,
  }));
}

/**
 * 为角色库đang xử lý...Tạo变体（Wardrobe System）
 * 基于角色Thiết kế的不同阶段
 * 
 * @deprecated Sử dụng convertDesignToVariations 代替
 */
export function generateVariationsFromDesign(design: CharacterDesign): Array<{
  name: string;
  visualPrompt: string;
}> {
  return design.stages.map(stage => ({
    name: stage.stageName,
    visualPrompt: `${design.consistencyElements.facialFeatures}, ${stage.visualPromptEn}`,
  }));
}

/**
 * 为角色库的角色更新基础Mô tả和Đặc điểm thị giác
 * 
 * @param design 角色Thiết kế
 * @returns 可用于 updateCharacter() 的更新对象
 */
export function getCharacterUpdatesFromDesign(design: CharacterDesign): {
  description: string;
  visualTraits: string;
} {
  return {
    description: design.baseVisualPromptZh,
    visualTraits: design.baseVisualPromptEn,
  };
}
