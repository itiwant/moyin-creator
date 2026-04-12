// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * AI Character Calibrator
 * 
 * Sử dụng AI thông minhHiệu chuẩn从剧本đang xử lý...角色列表
 * 
 * chức năng：
 * 1. 统计每角色的出场次数、Thoại条数、出场 tập数
 * 2. AI 分析识别真正角色 vs 非角色词
 * 3. AI 合并重复角色（王总 = 投资人王总）
 * 4. AI 分类nhân vật chính/nhân vật phụ/龙套（结合出场统计）
 * 5. AI 补充角色thông tin（Tuổi、Giới tính、关系）
 */

import type { ScriptCharacter, ProjectBackground, EpisodeRawScript, CharacterIdentityAnchors, CharacterNegativePrompt, PromptLanguage, CalibrationStrictness, FilteredCharacterRecord } from '@/types/script';
import { callFeatureAPI } from '@/lib/ai/feature-router';
import { processBatched } from '@/lib/ai/batch-processor';
import { estimateTokens, safeTruncate } from '@/lib/ai/model-registry';
import { useScriptStore } from '@/stores/script-store';
import { buildSeriesContextSummary } from './series-meta-sync';

// ==================== 类型定义 ====================

export interface CharacterCalibrationResult {
  /** Hiệu chuẩn后的角色列表 */
  characters: CalibratedCharacter[];
  /** bị lọc的词（非角色） */
  filteredWords: string[];
  /** bị lọc的角色（带原因，用于用户确认/恢复） */
  filteredCharacters: FilteredCharacterRecord[];
  /** 合并记录（哪些被合并到一起） */
  mergeRecords: MergeRecord[];
  /** AI 分析说明 */
  analysisNotes: string;
}

export interface CalibratedCharacter {
  id: string;
  name: string;
  /** 角色重要性：protagonist(nhân vật chính), supporting(重要nhân vật phụ), minor(次要角色), extra(龙套) */
  importance: 'protagonist' | 'supporting' | 'minor' | 'extra';
  /** 出场 tập数范围 */
  episodeRange?: [number, number];
  /** 出场次数 */
  appearanceCount: number;
  /** AI 补充的角色Mô tả */
  role?: string;
  /** AI 推断的Tuổi */
  age?: string;
  /** AI 推断的Giới tính */
  gender?: string;
  /** 与其他角色的关系 */
  relationships?: string;
  /** gốc提取的名字变体 */
  nameVariants: string[];
  // === chuyên nghiệp角色Thiết kếtrường ===
  /** 英文Thị giác提示词（用于AI图像Tạo） */
  visualPromptEn?: string;
  /** đang xử lý...提示词 */
  visualPromptZh?: string;
  /** Khuôn mặt特征Mô tả */
  facialFeatures?: string;
  /** 独特标记（疆痕、胎记等） */
  uniqueMarks?: string;
  /** trang phục风格 */
  clothingStyle?: string;
  
  // === 6层Danh tínhneo（角色一致性）===
  /** Neo danh tính - khóa 6 lớp đặc trưng */
  identityAnchors?: CharacterIdentityAnchors;
  /** 负面提示词 */
  negativePrompt?: CharacterNegativePrompt;
}

export interface MergeRecord {
  /** 最终Sử dụng的名字 */
  finalName: string;
  /** 被合并的变体 */
  variants: string[];
  /** 合并原因 */
  reason: string;
}

export interface CalibrationOptions {
  /** 上次Hiệu chuẩn的角色列表，用于合并确保角色不丢失 */
  previousCharacters?: CalibratedCharacter[];
  /** 提示词Ngôn ngữTùy chọn */
  promptLanguage?: PromptLanguage;
  /** Mức độ chặt chẽ hiệu chuẩn */
  strictness?: CalibrationStrictness;
}

// ==================== 从剧本重新提取角色 ====================

/**
 * 从 episodeRawScripts đang xử lý...取Tất cả角色
 * 这会遍历Tất cả tập的Tất cả场景，提取场景nhân vật和Thoại说话人
 */
export function extractAllCharactersFromEpisodes(
  episodeScripts: EpisodeRawScript[]
): ScriptCharacter[] {
  const characterSet = new Set<string>();
  
  if (!episodeScripts || !Array.isArray(episodeScripts)) {
    console.warn('[extractAllCharactersFromEpisodes] episodeScripts 无效');
    return [];
  }
  
  // 遍历Tất cả tập
  for (const ep of episodeScripts) {
    if (!ep || !ep.scenes) continue;
    
    for (const scene of ep.scenes) {
      if (!scene) continue;
      
      // 从场景nhân vật列表提取
      const sceneChars = scene.characters || [];
      for (const name of sceneChars) {
        if (name && name.trim()) {
          characterSet.add(name.trim());
        }
      }
      
      // 从Thoạiđang xử lý...话人
      const dialogues = scene.dialogues || [];
      for (const dialogue of dialogues) {
        if (dialogue && dialogue.character && dialogue.character.trim()) {
          characterSet.add(dialogue.character.trim());
        }
      }
    }
  }
  
  // 转换为 ScriptCharacter 数组
  const characters: ScriptCharacter[] = Array.from(characterSet).map((name, index) => ({
    id: `char_raw_${index + 1}`,
    name,
  }));
  
  console.log(`[extractAllCharactersFromEpisodes] 从 ${episodeScripts.length}  tập剧本đang xử lý... ${characters.length} 角色`);
  return characters;
}

// ==================== 出场统计 ====================

/** 角色出场统计 */
export interface CharacterStats {
  name: string;
  /** 场景出场次数 */
  sceneCount: number;
  /** Thoại条数 */
  dialogueCount: number;
  /** 出场的 tập数列表 */
  episodes: number[];
  /** 首次出场 tập数 */
  firstEpisode: number;
  /** 最后出场 tập数 */
  lastEpisode: number;
  /** Thoại样本（前3条） */
  dialogueSamples: string[];
  /** 出场场景样本 */
  sceneSamples: string[];
}

/**
 * 统计每角色的出场情况
 */
export function collectCharacterStats(
  characterNames: string[],
  episodeScripts: EpisodeRawScript[]
): Map<string, CharacterStats> {
  const stats = new Map<string, CharacterStats>();
  
  // 防御性检查
  if (!characterNames || !Array.isArray(characterNames)) {
    console.warn('[collectCharacterStats] characterNames 无效');
    return stats;
  }
  if (!episodeScripts || !Array.isArray(episodeScripts)) {
    console.warn('[collectCharacterStats] episodeScripts 无效');
    return stats;
  }
  
  // 初始化
  for (const name of characterNames) {
    if (!name) continue;
    stats.set(name, {
      name,
      sceneCount: 0,
      dialogueCount: 0,
      episodes: [],
      firstEpisode: Infinity,
      lastEpisode: 0,
      dialogueSamples: [],
      sceneSamples: [],
    });
  }
  
  // 遍历Tất cả剧本
  for (const ep of episodeScripts) {
    if (!ep || !ep.scenes) continue;
    const epIndex = ep.episodeIndex ?? 0;
    
    for (const scene of ep.scenes) {
      if (!scene) continue;
      
      // 检查场景nhân vật
      const sceneChars = scene.characters || [];
      for (const charName of sceneChars) {
        if (!charName) continue;
        // 精确Khớp或包含Khớp
        for (const name of characterNames) {
          if (!name) continue;
          if (charName === name || charName.includes(name) || name.includes(charName)) {
            const s = stats.get(name);
            if (!s) continue;
            s.sceneCount++;
            if (!s.episodes.includes(epIndex)) {
              s.episodes.push(epIndex);
            }
            s.firstEpisode = Math.min(s.firstEpisode, epIndex);
            s.lastEpisode = Math.max(s.lastEpisode, epIndex);
            if (s.sceneSamples.length < 3) {
              s.sceneSamples.push(`第${epIndex} tập: ${scene.sceneHeader || '未知场景'}`);
            }
          }
        }
      }
      
      // 检查Thoại
      const dialogues = scene.dialogues || [];
      for (const dialogue of dialogues) {
        if (!dialogue || !dialogue.character) continue;
        for (const name of characterNames) {
          if (!name) continue;
          if (dialogue.character === name || dialogue.character.includes(name)) {
            const s = stats.get(name);
            if (!s) continue;
            s.dialogueCount++;
            if (s.dialogueSamples.length < 3) {
              const line = dialogue.line || '';
              s.dialogueSamples.push(`${dialogue.character}: ${line.slice(0, 30)}...`);
            }
          }
        }
      }
    }
  }
  
  // 修正 Infinity
  for (const s of stats.values()) {
    if (s.firstEpisode === Infinity) s.firstEpisode = 0;
  }
  
  return stats;
}

// ==================== 核心函数 ====================

/**
 * Sử dụng AI Hiệu chuẩn角色列表
 * 
 * @param rawCharacters gốc提取的角色列表
 * @param background 项目背景（đại cương）
 * @param episodeScripts tập剧本（提供上下文）
 * @param options API 配置
 */
export async function calibrateCharacters(
  rawCharacters: ScriptCharacter[],
  background: ProjectBackground,
  episodeScripts: EpisodeRawScript[],
  options?: CalibrationOptions
): Promise<CharacterCalibrationResult> {
  const previousCharacters = options?.previousCharacters;
  const promptLanguage = options?.promptLanguage || 'zh+en';
  const strictness = options?.strictness || 'normal';
  
  // 1. 先统计每角色的出场情况
  const characterNames = rawCharacters.map(c => c.name);
  const stats = collectCharacterStats(characterNames, episodeScripts);
  
  // 2. 构建带统计thông tin的角色列表，按thông minh优先级排序
  const charsWithStats = rawCharacters.map(c => {
    const s = stats.get(c.name);
    const name = c.name;
    
    // 判断是否是Quần chúng（纯职业称呿、数字编号、群体Mô tả）
    // loose chế độ下不标记Quần chúng，Tất cả保留给 AI 判断
    const isGroupExtra = strictness === 'loose' ? false : [
      '保安', '警察', '员工', '护士', '医生', '记者', 
      '律师', '路人', '众人', '若干', '群众', '大妈',
    ].some(keyword => 
      name === keyword || 
      name === keyword + '1' || 
      name === keyword + '2' ||
      name.startsWith('几名') ||
      name.startsWith('两') ||
      name.startsWith('若干')
    );
    
    // 判断是否有具体名字（đang xử lý...2-4字，或有昵称后缀）
    const hasSpecificName = (
      (name.length >= 2 && name.length <= 4 && /[\u4e00-\u9fa5]/.test(name)) || // đang xử lý...
      name.includes('哥') || name.includes('姐') || name.includes('董') || // 有称呼
      name.includes('总') || name.includes('老') || name.includes('小') || // 有称呼
      /^[A-Z][a-z]+$/.test(name) // Tên tiếng Anh
    );
    
    return {
      name: c.name,
      sceneCount: s?.sceneCount || 0,
      dialogueCount: s?.dialogueCount || 0,
      episodeCount: s?.episodes.length || 0,
      isGroupExtra,
      hasSpecificName,
      // thông minh优先级：有名字的优先，rồi按出场排序
      priority: isGroupExtra ? -1000 : // Quần chúng最低
                hasSpecificName ? 1000 + (s?.sceneCount || 0) + (s?.dialogueCount || 0) : // 有名字优先
                (s?.sceneCount || 0) + (s?.dialogueCount || 0), // 没名字按出场
    };
  }).sort((a, b) => b.priority - a.priority);
  
  // 限制发送给 AI 的角色数量，Tránh输出cắt ngắn
  // 优先保留有名字的角色
  const maxCharsToSend = 150;
  const charsToProcess = charsWithStats.slice(0, maxCharsToSend);
  const skippedCount = charsWithStats.length - charsToProcess.length;
  
  // 3. 准备批处理 items（每角色带上统计thông tin和Thoại样本）
  const batchItems = charsToProcess.map(c => ({
    name: c.name,
    sceneCount: c.sceneCount,
    dialogueCount: c.dialogueCount,
    episodeCount: c.episodeCount,
    dialogueSamples: stats.get(c.name)?.dialogueSamples || [],
  }));
  
  // 计算总场次数用于判断核心nhân vật chính的 10% 阈值
  let totalSceneCount = 0;
  for (const ep of episodeScripts) {
    if (ep?.scenes) totalSceneCount += ep.scenes.length;
  }
  const coreThreshold = Math.max(Math.floor(totalSceneCount * 0.1), 10);
  
  // === 根据严格度Tạo不同的筛选指令段 ===
  const strictnessInstructions = strictness === 'strict'
    ? `【筛选chế độ：严格】
- 只保留明确的nhân vật chính、重要nhân vật phụ、和有具体名字的次要角色
- 出场 ≤1 且无Thoại的角色lọc
- 纯称呼没有具体名字的角色lọc（如"学习委员"、"戴眼镜的男生"）
- Quần chúngTất cảlọc`
    : strictness === 'loose'
    ? `【筛选chế độ：Lỏng lẻo】
- 几乎不lọc，保留Tất cả能识别的角色
- 包括Quần chúng、低频角色、只有称呼的角色（如"学习委员"、"戴眼镜的男生"）
- 只lọc纯Mô tả词（如"眼框微湿"、"干练优雅"）和非nhân vật词（如"全体员工"、"核心团队"）`
    : `【筛选chế độ：标准】
- 有名字或称呼的角色Tất cả保留
- 只lọc纯Quần chúng、群体、非角色词`;
  
  // 注入剧级上下文
  const store = useScriptStore.getState();
  const activeProjectId = store.activeProjectId;
  const seriesMeta = activeProjectId ? store.projects[activeProjectId]?.seriesMeta : null;
  const seriesCtx = buildSeriesContextSummary(seriesMeta || null);
  const seriesCtxBlock = seriesCtx ? `\n\n${seriesCtx}\n` : '';

  const systemPrompt = `你是chuyên nghiệp的影视剧本分析师，擅长从剧本dữ liệuđang xử lý...Hiệu chuẩn角色。${seriesCtxBlock}
【核心目标】
Hiệu chuẩn后的角色列表将用于Tạo角色三góc nhìn。

${strictnessInstructions}

【严格执行 - 保留规则】

**1. 核心nhân vật chính (protagonist)** - 必须保留
   - 名字明确，出场多，贯穿全剧
   - 例：张明、老周、苏晴

**2. 重要nhân vật phụ (supporting)** - 必须保留
   - 有具体名字或昵称：刀疑哥、龙哥、李强、王艳、小乐、阿强
   - 有Cố định称呼：赖董、王总、周总、李医生
   - 出场 ≥1 且有Thoại、或出场 ≥2

**3. 次要角色 (minor)** - 必须保留
   - 有具体名字，偶尔出场
   - 对剧情有一定作用
   - **只出场1次但有名字的也要保留！**

**4. Quần chúng/nhân vật phụ (extra)** - ${strictness === 'strict' ? '可以lọc' : strictness === 'loose' ? '必须保留' : '尽量保留'}
   - 有称呼但出场极少的，标记为 extra
   - 例：李老头、小刘、王大妈

${strictness !== 'strict' ? `【极其重要 - Lỏng lẻo筛选原则】
- **有名字的Tất cả保留！**（即使只出场1次）
- **有称呼的Tất cả保留！**（如老X、小X、X哥、X姐、X总、X董）
- **不确定的保留！**（宁可多保留，不要bỏ sót）
` : ''}【lọc规则】

**必须lọc的（无名字的纯Quần chúng）：**
- 纯职业词：保安、警察、护士、医生、记者、员工、律师、服务员、司机
- 数字编号：保安1、警察2、护士3、员工A
- 群体词：若干人、众人、几名保安、两大妈、一群人
- 非角色词：全体员工、保安部、核心团队
- Mô tả词：眼框微湿、干练优雅、眼神沉静

**绝对不能lọc的：**
- 任何有姓名的：张明、李强、王艳、林风、马克
- 任何有昵称的：刀疑哥、龙哥、小乐、阿强、老李、小刘
- 有姓氏+职业：赖董、王总、周总、李医生、张秘书、林师傅
- 有姓氏+称谓：李老头、王大妈、周妹

【合并规则】
只合并明确是同一人的不同称呼：
- 例："王总" 和 "投资人王总" → 合并为 "王总"
- 例："刀疑哥" 和 "李强" 如果剧情明确是同一人 → 合并

【数量约束】
- nhân vật chính：1-3 
- nhân vật phụ：5-30 （有名字的Tất cả保留，不要限制）
- 总角色数：gợi ý 15-40 ，宁多勿少

【重要】每bị lọc的角色请在 filteredCharacters đang xử lý...滤原因。

请以JSON格式返回分析kết quả。`;

  // 共享的背景上下文（每批都带，用 safeTruncate cắt ngắn）
  const outlineContext = safeTruncate(background.outline || '', 1500);
  const biosContext = safeTruncate(background.characterBios || '', 1000);

  // === 第一步：AI 角色分析（Tự động分批）===
  let parsed: any;
  try {
    console.log('[CharacterCalibrator] 开始 AI 角色分析...');
    
    // 闭包收 tập跨批次的聚合trường
    const allFilteredWords: string[] = [];
    const allFilteredCharacters: FilteredCharacterRecord[] = [];
    const allMergeRecords: MergeRecord[] = [];
    const allAnalysisNotes: string[] = [];
    
    const { results: charResults, failedBatches } = await processBatched<
      typeof batchItems[number],
      any
    >({
      items: batchItems,
      feature: 'script_analysis',
      buildPrompts: (batch) => {
        // 每批构建独立的角色列表和Thoại样本
        const charList = batch.map((c, i) => {
          if (c.sceneCount === 0 && c.dialogueCount === 0) {
            return `${i + 1}. ${c.name} [未统计到出场]`;
          }
          return `${i + 1}. ${c.name} [出场${c.sceneCount}场, Thoại${c.dialogueCount}条,  tập数${c.episodeCount}]`;
        }).join('\n');
        
        const batchDialogues: string[] = [];
        for (const c of batch) {
          if (c.dialogueSamples.length > 0) {
            batchDialogues.push(`【${c.name}】`);
            batchDialogues.push(...c.dialogueSamples);
          }
        }
        
        const user = `【剧本thông tin】
tên phim：《${background.title}》
${background.genre ? `类型：${background.genre}` : ''}
${background.era ? `thời đại背景：${background.era}` : ''}
${background.timelineSetting ? `时间线：${background.timelineSetting}` : ''}
总 tập数：${episodeScripts.length} tập
总场次数：${totalSceneCount}场
核心nhân vật chính阈值：出场 ≥ ${coreThreshold} 场

【故事đại cương】
${outlineContext || '无'}

【nhân vật小传】
${biosContext || '无'}

【待Hiệu chuẩn的角色列表 + 出场统计】（共${batch.length}）
${charList}

【角色Thoại样本】
${batchDialogues.slice(0, 100).join('\n')}

请按照分级规则Hiệu chuẩn角色，返回JSON格式：
{
  "characters": [
    {
      "name": "角色名",
      "importance": "protagonist/supporting/minor/extra",
      "appearanceCount": 150,
      "dialogueCount": 200,
      "episodeSpan": [1, 60],
      "role": "角色Mô tả",
      "age": "Tuổi",
      "gender": "Giới tính",
      "relationships": "关系"
    }
  ],
  "filteredWords": ["bị lọc的非角色词"],
  "filteredCharacters": [
    { "name": "bị lọc的角色名", "reason": "lọc原因" }
  ],
  "mergeRecords": [
    { "finalName": "最终名", "variants": ["变体1", "变体2"], "reason": "原因" }
  ],
  "analysisNotes": "分析说明"
}

【极其重要！请特别注意】
1. ${strictness === 'strict' ? '严格lọc低频无名角色' : strictness === 'loose' ? '尽可能保留Tất cả角色，包括Quần chúng' : '有名字的Tất cả保留！有称呼的Tất cả保留！不确定的保留！'}
2. 每bị lọc的角色必须在 filteredCharacters đang xử lý...因
3. 不要TạoQuần chúngXX组标签`;
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
        
        let batchParsed: any;
        try {
          batchParsed = JSON.parse(cleaned);
        } catch (jsonErr) {
          console.warn('[CharacterCalibrator] 批次JSONPhân tích thất bại，尝试修复...');
          const lastCompleteChar = cleaned.lastIndexOf('},');
          if (lastCompleteChar > 0) {
            const truncated = cleaned.slice(0, lastCompleteChar + 1);
            const fixedJson = truncated + '],"filteredWords":[],"mergeRecords":[],"analysisNotes":"部分kết quả"}';
            try {
              batchParsed = JSON.parse(fixedJson);
            } catch {
              const charsMatch = cleaned.match(/"characters"\s*:\s*\[(.*?)\]/s);
              if (charsMatch) {
                try {
                  const charsArray = JSON.parse('[' + charsMatch[1] + ']');
                  batchParsed = { characters: charsArray, filteredWords: [], mergeRecords: [], analysisNotes: '部分kết quả' };
                } catch {
                  throw jsonErr;
                }
              } else {
                throw jsonErr;
              }
            }
          } else {
            throw jsonErr;
          }
        }
        
        // 收 tập聚合trường
        allFilteredWords.push(...(batchParsed.filteredWords || []));
        if (batchParsed.filteredCharacters) {
          allFilteredCharacters.push(...batchParsed.filteredCharacters.map((fc: any) => ({
            name: fc.name || '',
            reason: fc.reason || '未说明',
          })));
        }
        allMergeRecords.push(...(batchParsed.mergeRecords || []));
        if (batchParsed.analysisNotes) allAnalysisNotes.push(batchParsed.analysisNotes);
        
        // 返回 Map<角色名, 角色dữ liệu>
        const map = new Map<string, any>();
        for (const c of (batchParsed.characters || [])) {
          if (c.name) map.set(c.name, c);
        }
        return map;
      },
      estimateItemTokens: (item) => estimateTokens(
        `${item.name} [出场${item.sceneCount}场, Thoại${item.dialogueCount}条] ` +
        item.dialogueSamples.join(' ')
      ),
      estimateItemOutputTokens: () => 200,
      apiOptions: {
        temperature: 0,
        maxTokens: 16384,
      },
    });
    
    if (failedBatches > 0) {
      console.warn(`[CharacterCalibrator] ${failedBatches} 批次thất bại，Sử dụng部分kết quả`);
    }
    
    parsed = {
      characters: Array.from(charResults.values()),
      filteredWords: [...new Set(allFilteredWords)],
      filteredCharacters: allFilteredCharacters,
      mergeRecords: allMergeRecords,
      analysisNotes: allAnalysisNotes.join('; ') || '批处理hoàn thành',
    };
    
    console.log('[CharacterCalibrator] AI 角色分析成功，Phân tích到', parsed.characters.length, '角色');
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[CharacterCalibrator] AI角色分析thất bại:', err.message);
    console.error('[CharacterCalibrator] lỗi堆栈:', err.stack);
    // 返回gốcdữ liệu作为降级方案，但带上统计thông tin
    return {
      characters: rawCharacters.map((c, i) => {
        const s = stats.get(c.name);
        return {
          id: c.id || `char_${i + 1}`,
          name: c.name,
          importance: (s && s.sceneCount > 20 ? 'supporting' : 
                       s && s.sceneCount > 5 ? 'minor' : 'extra') as any,
          appearanceCount: s?.sceneCount || 1,
          role: c.role,
          nameVariants: [c.name],
        };
      }),
      filteredWords: [],
      filteredCharacters: [],
      mergeRecords: [],
      analysisNotes: `AI角色分析thất bại(${err.message})，返回基于统计的kết quả`,
    };
  }
    
  // === 第二步：转换为标准格式并ThêmID ===
  const characters: CalibratedCharacter[] = (parsed.characters || []).map((c: any, i: number) => ({
    id: `char_${i + 1}`,
    name: c.name,
    importance: c.importance || 'minor',
    appearanceCount: c.appearanceCount || c.dialogueCount || 1,
    role: c.role,
    age: c.age,
    gender: c.gender,
    relationships: c.relationships,
    nameVariants: c.nameVariants || [c.name],
    episodeRange: c.episodeSpan,
  }));
    
  // === 第三步：为nhân vật chính和重要nhân vật phụTạochuyên nghiệpThị giác提示词（独立 try/catch，thất bại不影响Hiệu chuẩnkết quả）===
  let enrichedCharacters = characters;
  try {
    enrichedCharacters = await enrichCharactersWithVisualPrompts(
      characters,
      background,
      episodeScripts,
      promptLanguage
    );
    console.log('[CharacterCalibrator] Thị giác提示词Tạohoàn thành');
  } catch (enrichError) {
    const err = enrichError instanceof Error ? enrichError : new Error(String(enrichError));
    console.warn('[CharacterCalibrator] Thị giác提示词Tạothất bại（不影响角色Hiệu chuẩnkết quả）:', err.message);
    // enrichment thất bại不影响主要Hiệu chuẩnkết quả，继续Sử dụng characters
  }
    
  // === 第四步：合并上次Hiệu chuẩnkết quả，防止角色丢失 ===
  let finalCharacters = enrichedCharacters;
  if (previousCharacters && previousCharacters.length > 0) {
    const currentNames = new Set(enrichedCharacters.map(c => c.name));
    
    // 找出上次有但这次没有的角色
    const missingCharacters = previousCharacters.filter(pc => {
      if (currentNames.has(pc.name)) return false;
      // loose chế độ下保留Tất cả上次的角色
      if (strictness === 'loose') return true;
      // 只保留有具体名字的角色
      const isGroupExtra = [
        '保安', '警察', '员工', '护士', '医生', '记者', 
        '律师', '路人', '众人', '若干', '群众', '大妈',
      ].some(keyword => 
        pc.name === keyword || 
        pc.name === keyword + '1' || 
        pc.name === keyword + '2' ||
        pc.name.startsWith('几名') ||
        pc.name.startsWith('两') ||
        pc.name.startsWith('若干')
      );
      return !isGroupExtra && pc.importance !== 'extra';
    });
    
    if (missingCharacters.length > 0) {
      console.log(`[CharacterCalibrator] 合并上次Hiệu chuẩn丢失的 ${missingCharacters.length} 角色:`, 
        missingCharacters.map(c => c.name));
      
      // 为丢失的角色重新分配 ID
      const maxId = Math.max(...finalCharacters.map(c => {
        const match = c.id.match(/char_(\d+)/);
        return match ? parseInt(match[1]) : 0;
      }));
      
      const recoveredChars = missingCharacters.map((c, i) => ({
        ...c,
        id: `char_${maxId + i + 1}`,
      }));
      
      finalCharacters = [...finalCharacters, ...recoveredChars];
    }
  }
  
  // 合并 filteredWords 和 filteredCharacters，确保 filteredWords đang xử lý...现在 filteredCharacters
  const filteredCharacters: FilteredCharacterRecord[] = [
    ...(parsed.filteredCharacters || []),
  ];
  // 将 filteredWords đang xử lý... filteredCharacters đang xử lý...进去
  const filteredCharNames = new Set(filteredCharacters.map(fc => fc.name));
  for (const word of (parsed.filteredWords || [])) {
    if (!filteredCharNames.has(word)) {
      filteredCharacters.push({ name: word, reason: '非角色词' });
    }
  }
  
  return {
    characters: finalCharacters,
    filteredWords: parsed.filteredWords || [],
    filteredCharacters,
    mergeRecords: parsed.mergeRecords || [],
    analysisNotes: parsed.analysisNotes || '',
  };
}

/**
 * 收 tập角色出场上下文（用于AI分析）
 */
function collectCharacterContexts(
  characters: ScriptCharacter[],
  episodeScripts: EpisodeRawScript[]
): string {
  const contexts: string[] = [];
  const characterNames = new Set(characters.map(c => c.name));
  
  // 遍历剧本，收 tập角色出现的场景和Thoại
  for (const ep of episodeScripts.slice(0, 5)) { // 只取前5 tập作为样本
    for (const scene of ep.scenes.slice(0, 10)) { // 每 tập最多10场景
      // 检查场景đang xử lý...我们关注的角色
      const relevantChars = scene.characters.filter(c => 
        characterNames.has(c) || characters.some(char => c.includes(char.name))
      );
      
      if (relevantChars.length > 0) {
        contexts.push(`[第${ep.episodeIndex} tập-${scene.sceneHeader}]`);
        contexts.push(`nhân vật: ${relevantChars.join(', ')}`);
        
        // 收 tập相关Thoại（前3条）
        const relevantDialogues = scene.dialogues
          .filter(d => characterNames.has(d.character) || characters.some(c => d.character.includes(c.name)))
          .slice(0, 3);
        
        for (const d of relevantDialogues) {
          contexts.push(`${d.character}: ${d.line.slice(0, 50)}...`);
        }
        contexts.push('');
      }
    }
  }
  
  return contexts.join('\n');
}

/**
 * 将Hiệu chuẩnkết quả转换回 ScriptCharacter 格式
 * 注意：保留gốc角色的Tất cảtrường，只补充/更新 AI Hiệu chuẩn的trường
 */
export function convertToScriptCharacters(
  calibrated: CalibratedCharacter[],
  originalCharacters?: ScriptCharacter[],
  promptLanguage: PromptLanguage = 'zh+en',
): ScriptCharacter[] {
  return calibrated.map(c => {
    // 查找gốc角色dữ liệu
    const original = originalCharacters?.find(orig => orig.name === c.name);
    
    const nextVisualPromptEn = c.visualPromptEn || original?.visualPromptEn;
    const nextVisualPromptZh = c.visualPromptZh || original?.visualPromptZh;
    // 合并：保留gốcdữ liệu，只补充/更新 AI Tạo的trường
    return {
      // 保留gốctrường
      ...original,
      // 更新/补充 AI Hiệu chuẩn的trường
      id: c.id,
      name: c.name,
      role: c.role || original?.role,
      age: c.age || original?.age,
      gender: c.gender || original?.gender,
      relationships: c.relationships || original?.relationships,
      // === chuyên nghiệp角色Thiết kếtrường（世界级大师Tạo）===
      visualPromptEn: promptLanguage === 'zh' ? undefined : nextVisualPromptEn,
      visualPromptZh: promptLanguage === 'en' ? undefined : nextVisualPromptZh,
      appearance: c.facialFeatures || c.uniqueMarks || c.clothingStyle 
        ? [c.facialFeatures, c.uniqueMarks, c.clothingStyle].filter(Boolean).join(', ')
        : original?.appearance,
      // === 6层Danh tínhneo（角色一致性）===
      identityAnchors: c.identityAnchors || original?.identityAnchors,
      negativePrompt: c.negativePrompt || original?.negativePrompt,
      // 标记重要性，便于UIHiển thị
      tags: [c.importance, `出场${c.appearanceCount}次`, ...(original?.tags || [])],
    };
  });
}

/**
 * 角色恢复兜底：优先保留带名字的角色，并去重
 */
function cloneScriptCharactersForRecovery(
  characters: ScriptCharacter[] | undefined,
  source: 'calibrated' | 'existing' | 'series-meta' | 'raw',
): ScriptCharacter[] {
  if (!Array.isArray(characters) || characters.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const recovered: ScriptCharacter[] = [];

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    const name = character?.name?.trim();
    if (!name) continue;

    const key = (character.id && character.id.trim()) || name;
    if (seen.has(key)) continue;
    seen.add(key);

    recovered.push({
      ...character,
      id: character.id || `char_recovered_${index + 1}`,
      name,
      tags: Array.isArray(character.tags) && character.tags.length > 0
        ? [...new Set(character.tags.filter(Boolean))]
        : source === 'raw'
          ? ['minor', 'recovered']
          : character.tags,
    });
  }

  return recovered;
}

export function resolveSafeScriptCharacters(
  preferredCharacters: ScriptCharacter[],
  options?: {
    existingCharacters?: ScriptCharacter[];
    seriesMetaCharacters?: ScriptCharacter[];
    rawCharacters?: ScriptCharacter[];
  },
): {
  characters: ScriptCharacter[];
  source: 'calibrated' | 'existing' | 'series-meta' | 'raw' | 'empty';
} {
  const candidates: Array<{
    source: 'calibrated' | 'existing' | 'series-meta' | 'raw';
    characters?: ScriptCharacter[];
  }> = [
    { source: 'calibrated', characters: preferredCharacters },
    { source: 'existing', characters: options?.existingCharacters },
    { source: 'series-meta', characters: options?.seriesMetaCharacters },
    { source: 'raw', characters: options?.rawCharacters },
  ];

  for (const candidate of candidates) {
    const characters = cloneScriptCharactersForRecovery(candidate.characters, candidate.source);
    if (characters.length > 0) {
      return {
        characters,
        source: candidate.source,
      };
    }
  }

  return {
    characters: [],
    source: 'empty',
  };
}

/**
 * 按重要性排序角色
 */
export function sortByImportance(characters: CalibratedCharacter[]): CalibratedCharacter[] {
  const order = { protagonist: 0, supporting: 1, minor: 2, extra: 3 };
  return [...characters].sort((a, b) => {
    // 先按重要性
    const importanceOrder = order[a.importance] - order[b.importance];
    if (importanceOrder !== 0) return importanceOrder;
    // 再按出场次数
    return b.appearanceCount - a.appearanceCount;
  });
}

// ==================== chuyên nghiệp角色Thiết kế ====================

/**
 * 为nhân vật chính和重要nhân vật phụTạochuyên nghiệp的Thị giác提示词
 * gọi API世界级角色Thiết kế大师 AI
 */
async function enrichCharactersWithVisualPrompts(
  characters: CalibratedCharacter[],
  background: ProjectBackground,
  episodeScripts: EpisodeRawScript[],
  promptLanguage: PromptLanguage = 'zh+en'
): Promise<CalibratedCharacter[]> {
  // 只为nhân vật chính和重要nhân vật phụTạo详细提示词
  const keyCharacters = characters.filter(c => 
    c.importance === 'protagonist' || c.importance === 'supporting'
  );
  
  if (keyCharacters.length === 0) {
    return characters;
  }
  
  console.log(`[enrichCharactersWithVisualPrompts] 为 ${keyCharacters.length} quan trọng角色Tạochuyên nghiệp提示词...`);
  
  // 构建thời đạitrang phục指导
  const getEraFashionGuidance = () => {
    const startYear = background.storyStartYear;
    const timeline = background.timelineSetting || background.era || '现代';
    
    if (startYear) {
      if (startYear >= 2020) {
        return `【${startYear}thập niêntrang phục指导】
- 年轻人：休闲时尚、运动风、潮牌元素，常穿卫衣、牢仔裤、运动鞋
- đang xử lý...商务休闲、简约现代，常穿Polo衫、休闲西装、卡其裤
- 老年人：舒适休闲，常穿开衫、孖子衫、布鞋或运动鞋`;
      } else if (startYear >= 2010) {
        return `【${startYear}thập niêntrang phục指导】
- 年轻人：韩系时尚、小清新风格，常穿T恤、牢仔裤、帆布鞋
- đang xử lý...商务正装或商务休闲，常穿西装、衬衫、皮鞋
- 老年人：传统休闲，常穿开衫、布鞋`;
      } else if (startYear >= 2000) {
        return `【${startYear}thập niêntrang phục指导】
- 年轻人：千禅年时尚，常穿紧身裤、Lỏng lẻo外套、板鞋
- đang xử lý...正式商务装，常穿西装套装、领带、皮鞋
- 老年人：đang xử lý...简单开衫、布鞋`;
      } else if (startYear >= 1990) {
        return `【${startYear}thập niêntrang phục指导】
- 年轻人：喝叭裤、确良外套、大肩垫西装、特宾球鞋
- đang xử lý...đang xử lý...西装，常穿解放鞋或简单皮鞋
- 老年人：đang xử lý...棉袄、布鞋`;
      } else {
        return `【${startYear}thập niêntrang phục指导】
请根据该thập niên的đang xử lý...trang phục风格Thiết kế，Tránh古装或不符合thời đại的trang phục`;
      }
    }
    
    // 如果没有精确年份，根据 era 判断
    if (timeline.includes('现代') || timeline.includes('当代')) {
      return `【现代trang phục指导】
请Thiết kế符合当代đang xử lý...装风格，年轻人穿时尚休闲装，đang xử lý...商务休闲装，老年人穿舒适传统trang phục。
绝对不要Thiết kế成古装、汉服、或古代服饰。`;
    }

    // 民国时期
    if (timeline.includes('民国') || timeline.includes('近代') || timeline.includes('清末')) {
      return `【${timeline}trang phục指导】
- 男性：长衫马褂、đang xử lý...西装礼帽（上层xã hội）、布衣长衫（平民）
- 女性：旗袍、女学生装（上衣下裙）、短发或盘发
- 禁止出现T恤、牛仔裤、运动鞋等现代服饰
- 禁止出现手机、电脑等现代电子产品`;
    }

    // 古代各朝代
    if (/唐朝|唐代/.test(timeline)) {
      return `【唐朝trang phục指导】
- 男性：圆领袍、幞头、革带；武将可穿铠甲
- 女性：高腰襟裙、披帛、发髀簪起、花钗装饰
- 绝对禁止任何现代trang phục（西装/T恤/牵仔裤/运动鞋）`;
    }
    if (/宋朝|宋代/.test(timeline)) {
      return `【宋朝trang phục指导】
- 男性：直裰、交领袖衫、乌纱帽；文人偏素雅
- 女性：褒子、裙、披帛，Kiểu tóc简约典雅
- 绝对禁止任何现代trang phục`;
    }
    if (/明朝|明代/.test(timeline)) {
      return `【明朝trang phục指导】
- 男性：曳服、直裰、网巾或乌纱帽
- 女性：交领衫、马面裙、披风，Kiểu tóc丰富多变
- 绝对禁止任何现代trang phục`;
    }
    if (/清朝|清代/.test(timeline)) {
      return `【清朝trang phục指导】
- 男性：长袍马褂、瓜皮帽、辨子；官员穿补服
- 女性：旗装（溜肩、立领、Lỏng lẻo）、旗头或两把头
- 绝对禁止任何现代trang phục`;
    }

    // 泛古代/武侠/仙侠/宫斗/玄幻等
    if (/古代|武侠|仙侠|玄幻|宫斗|宅斗|战国|春秋|汉朝|三国|历史/.test(timeline)) {
      return `【${timeline}trang phục指导】
- Tất cả角色必须穿着đang xử lý...服饰（长袍、袖衫、披风、带子等）
- Kiểu tóc必须是古代式样（簪发、发髀、束发、发笪等）
- 武侠/仙侠可加入飘逸江湖风格元素（剑、披风、护腕等）
- 绝对禁止任何现代trang phục（西装/T恤/牛仔裤/运动鞋/手机/眼镜等）`;
    }

    // 科幻/未来
    if (/科幻|未来|星际|太空/.test(timeline)) {
      return `【${timeline}trang phục指导】
- 可以Thiết kế未来感/科技感trang phục，但需保持内部一致性
- 禁止出现与Bối cảnh thế giới不符的trang phục元素`;
    }

    // 其他未识别的thời đại — 用通用约束而非返回空
    return `【${timeline}trang phục指导】
请根据「${timeline}」thời đại背景Thiết kế角色trang phục，trang phục、Kiểu tóc、配饰必须严格符合该thời đại特征。
绝对禁止出现与该thời đại不符的trang phục元素。`;
  };
  
  const eraFashionGuidance = getEraFashionGuidance();
  
  // 系统提示词：角色Thiết kế大师 + 背景thông tin + 输出格式（不含具体角色）
  const systemPrompt = `你是好莱坞顶级角色Thiết kế大师，曾为漫威、迪士尼、皮克斯Thiết kế过无数经典角色。

你的chuyên nghiệp能力：
- **角色Thị giácThiết kế**：能准确捕捉角色的外在形象、trang phục风格、肢体Ngôn ngữ
- **thập niêntrang phục专家**：精通不同thập niên的đang xử lý...潮流，能准确还原历史时期的trang phục特征
- **AI图像Tạo专家**：深谙 Midjourney、DALL-E、Stable Diffusion 等 AI 绘图模型
- **角色一致性专家**：掌握"6层特征锁定"技术，确保同一角色在不同场景保持一致

【剧本thông tin】
tên phim：《${background.title}》
类型：${background.genre || '未知类型'}
thời đại背景：${background.era || '现代'}
精确时间线：${background.timelineSetting || '未指定'}
Năm câu chuyện：${background.storyStartYear ? `${background.storyStartYear}年` : '未指定'}${background.storyEndYear && background.storyEndYear !== background.storyStartYear ? ` - ${background.storyEndYear}年` : ''}
总 tập数：${episodeScripts.length} tập

${eraFashionGuidance}

【故事đại cương】
${background.outline?.slice(0, 1200) || '无'}

【nhân vật小传】
${background.characterBios?.slice(0, 1200) || '无'}

${promptLanguage === 'zh' ? `【核心输出：6层Danh tínhneo】
这是AI生图đang xử lý...色一致性的quan trọng技术，必须用đang xử lý...填写：

① Lớp xương mặt（Khuôn mặt骨骼Cấu trúc）
   - faceShape: Hình mặt（鹅蛋形/方形/心形/tròn/菱形/长tròn）
   - jawline: Đường hàm（棱角分明/柔和圆润/突出方正）
   - cheekbones: Xương gò má（高Xương gò má/不明显/宽Xương gò má）

② Lớp ngũ quan（精确Mô tả）
   - eyeShape: Hình mắt（杏仁形/圆眼/内双/单眼皮/上挑形）
   - eyeDetails: Chi tiết mắt（双眼皮、轻微内眦褶、深邃眼窝）
   - noseShape: Hình mũi（高鼻梁、圆鼻头、小巧挺鼻）
   - lipShape: Hình môi（丰唇、薄唇、明显的唇珠）

③ Lớp dấu hiệu nhận dạng（最强neo！）
   - uniqueMarks: 必填数组！至少2-3独特标记，用đang xử lý...
   - 示例：["左眼下方2cm处小痣", "右眉尾处淡疤", "左脸颊酒窝"]
   - 这是最强的角色识别特征，必须精确到位置

④ Lớp neo màu sắc（Hex色值）
   - colorAnchors.iris: Con ngươi色（如 #3D2314 深棕色）
   - colorAnchors.hair: 发色（如 #1A1A1A 乌黑）
   - colorAnchors.skin: Màu da（如 #E8C4A0 暖米色）
   - colorAnchors.lips: Màu môi（如 #C4727E 豆沙粉）

⑤ Lớp kết cấu da
   - skinTexture: 皮肤质感，用đang xử lý...（毛孔清晰、淡雀斑、笑纹明显）

⑥ Lớp neo kiểu tóc
   - hairStyle: Kiểu tóc，用đang xử lý...（齐肩cấp độ剪、寸头、波波头）
   - hairlineDetails: Đường tóc，用đang xử lý...（自然Đường tóc、美人尖、额角后退）

【负面提示词】
为角色TạonegativePrompt，排除不符合设定的特征，用đang xử lý...：
- avoid: 要Tránh的特征（如đang xử lý...色应Tránh 金色头发、蓝色眼睛）
- styleExclusions: 风格排除（如 动漫风、卡通风、油画风）` : `【核心输出：6层Danh tínhneo】
这是AI生图đang xử lý...色一致性的quan trọng技术，必须详细填写：

① Lớp xương mặt（Khuôn mặt骨骼Cấu trúc）
   - faceShape: Hình mặt（oval/square/heart/round/diamond/oblong）
   - jawline: Đường hàm（sharp angular/soft rounded/prominent）
   - cheekbones: Xương gò má（high prominent/subtle/wide set）

② Lớp ngũ quan（精确Mô tả）
   - eyeShape: Hình mắt（almond/round/hooded/monolid/upturned）
   - eyeDetails: Chi tiết mắt（double eyelids, slight epicanthic fold, deep-set）
   - noseShape: Hình mũi（straight bridge, rounded tip, button nose）
   - lipShape: Hình môi（full lips, thin lips, defined cupid's bow）

③ Lớp dấu hiệu nhận dạng（最强neo！）
   - uniqueMarks: 必填数组！至少2-3独特标记
   - 示例：["small mole 2cm below left eye", "faint scar on right eyebrow", "dimple on left cheek"]
   - 这是最强的角色识别特征，必须精确到位置

④ Lớp neo màu sắc（Hex色值）
   - colorAnchors.iris: Con ngươi色（如 #3D2314 dark brown）
   - colorAnchors.hair: 发色（如 #1A1A1A jet black）
   - colorAnchors.skin: Màu da（如 #E8C4A0 warm beige）
   - colorAnchors.lips: Màu môi（如 #C4727E dusty rose）

⑤ Lớp kết cấu da
   - skinTexture: 皮肤质感（visible pores, light freckles, smile lines）

⑥ Lớp neo kiểu tóc
   - hairStyle: Kiểu tóc（shoulder-length layered, buzz cut, bob）
   - hairlineDetails: Đường tóc（natural, widow's peak, receding）

【负面提示词】
为角色TạonegativePrompt，排除不符合设定的特征：
- avoid: 要Tránh的特征（如đang xử lý...色应Tránh blonde hair, blue eyes）
- styleExclusions: 风格排除（如 anime style, cartoon, painting）`}

【trang phục要求】
- trang phục必须严格符合故事设定的thời đại背景（${background.era || '现代'}）
- 根据角色Tuổi和Danh tínhThiết kế合适的trang phục
- 绝对不要Thiết kế与剧本thời đại不符的服饰（如古装剧禁止现代trang phục，现代剧禁止古代服饰）

请返回JSON格式（注意：只返回单角色对象，不要数组包裹）：
{
  "name": "角色名",
  "detailedDescription": "详细的đang xử lý...Mô tả（100-200字）",
${promptLanguage === 'zh' ? '  "visualPromptZh": "đang xử lý...提示词",' : promptLanguage === 'en' ? '  "visualPromptEn": "English visual prompt, 40-60 words",' : '  "visualPromptEn": "English visual prompt, 40-60 words",\n  "visualPromptZh": "đang xử lý...提示词",'}
  "clothingStyle": "符合thập niên的trang phục风格",
  "identityAnchors": {
${promptLanguage === 'zh' ? `    "faceShape": "长tròn",
    "jawline": "柔和圆润，略带宽度",
    "cheekbones": "不明显",
    "eyeShape": "杏仁形，略下垂",
    "eyeDetails": "双眼皮，眼神温和",
    "noseShape": "高鼻梁，圆鼻头",
    "lipShape": "丰唇",
    "uniqueMarks": ["左眼下方小痣", "右脸颊酒窝"],` : `    "faceShape": "oval",
    "jawline": "soft rounded",
    "cheekbones": "subtle",
    "eyeShape": "almond",
    "eyeDetails": "double eyelids, warm gaze",
    "noseShape": "straight bridge, rounded tip",
    "lipShape": "full lips",
    "uniqueMarks": ["small mole below left eye", "dimple on right cheek"],`}
    "colorAnchors": {
      "iris": "#3D2314",
      "hair": "#1A1A1A",
      "skin": "#E8C4A0",
      "lips": "#C4727E"
    },
${promptLanguage === 'zh' ? `    "skinTexture": "皮肤光滑，有轻微笑纹",
    "hairStyle": "短发整齐商务剪",
    "hairlineDetails": "自然Đường tóc"` : `    "skinTexture": "smooth with light smile lines",
    "hairStyle": "short neat business cut",
    "hairlineDetails": "natural hairline"`}
  },
  "negativePrompt": {
${promptLanguage === 'zh' ? `    "avoid": ["金色头发", "蓝色眼睛", "胡须", "纹身"],
    "styleExclusions": ["动漫风", "卡通风", "油画风", "素描风"]` : `    "avoid": ["blonde hair", "blue eyes", "beard", "tattoos"],
    "styleExclusions": ["anime", "cartoon", "painting", "sketch"]`}
  }
}`;

  // 逐角色gọi API AI，Tránh一次性输出过多 JSON 导致推理模型 token 耗尽
  const designMap = new Map<string, any>();
  
  for (let i = 0; i < keyCharacters.length; i++) {
    const c = keyCharacters[i];
    const charLabel = `${c.name}（${c.importance === 'protagonist' ? 'nhân vật chính' : '重要nhân vật phụ'}）`;
    console.log(`[enrichCharactersWithVisualPrompts] [${i + 1}/${keyCharacters.length}] Tạo: ${charLabel}`);
    
    const userPrompt = `请为以下角色Tạochuyên nghiệpThị giác提示词和6层Danh tínhneo：

${c.name}（${c.importance === 'protagonist' ? 'nhân vật chính' : '重要nhân vật phụ'}）
- Danh tính：${c.role || '未知'}
- Tuổi：${c.age || '未知'}
- Giới tính：${c.gender || '未知'}
- 出场：${c.appearanceCount}次`;
    
    try {
      const result = await callFeatureAPI('script_analysis', systemPrompt, userPrompt, {
        maxTokens: 4096, // 单角色输出 4096 足够
      });
      
      // Phân tích单角色 JSON
      let cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const jsonStart = cleaned.indexOf('{');
      const jsonEnd = cleaned.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
      }
      
      const parsed = JSON.parse(cleaned);
      // tương thích：AI 可能返回 { characters: [...] } 或Trực tiếp返回单角色对象
      const design = parsed.characters ? parsed.characters[0] : parsed;
      if (design) {
        designMap.set(design.name || c.name, design);
        console.log(`[enrichCharactersWithVisualPrompts] ✅ ${c.name} Tạo成功`);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.warn(`[enrichCharactersWithVisualPrompts] ⚠️ ${c.name} Tạothất bại（不影响其他角色）:`, err.message);
      // 单角色thất bại不影响整体，继续处理下一
    }
  }
  
  console.log(`[enrichCharactersWithVisualPrompts] hoàn thành: ${designMap.size}/${keyCharacters.length} 角色Tạo成功`);
  
  // 合并到角色dữ liệu
  return characters.map(c => {
    const design = designMap.get(c.name);
    if (design) {
      // 提取 identityAnchors
      const anchors = design.identityAnchors;
      
      // 从新的 identityAnchors đang xử lý...ương thíchtrường（根据neo值Ngôn ngữTự động适配标签）
      const isChinese = /[\u4e00-\u9fff]/.test(anchors?.faceShape || anchors?.eyeShape || '');
      const facialFeatures = anchors ? [
        anchors.faceShape && (isChinese ? `Hình mặt：${anchors.faceShape}` : `Face: ${anchors.faceShape}`),
        anchors.eyeShape && (isChinese ? `Hình mắt：${anchors.eyeShape}` : `Eyes: ${anchors.eyeShape}`),
        anchors.eyeDetails,
        anchors.noseShape && (isChinese ? `Hình mũi：${anchors.noseShape}` : `Nose: ${anchors.noseShape}`),
        anchors.lipShape && (isChinese ? `Hình môi：${anchors.lipShape}` : `Lips: ${anchors.lipShape}`),
      ].filter(Boolean).join(', ') : design.facialFeatures;
      
      // uniqueMarks 从 anchors.uniqueMarks 数组转换为字符串（向后tương thích）
      const uniqueMarks = anchors?.uniqueMarks 
        ? (Array.isArray(anchors.uniqueMarks) ? anchors.uniqueMarks.join('; ') : anchors.uniqueMarks)
        : design.uniqueMarks;
      
      return {
        ...c,
        role: design.detailedDescription || c.role,
        visualPromptEn: design.visualPromptEn,
        visualPromptZh: design.visualPromptZh,
        facialFeatures,
        uniqueMarks,
        clothingStyle: design.clothingStyle,
        // 新增：6层Danh tínhneo
        identityAnchors: anchors,
        // 新增：负面提示词
        negativePrompt: design.negativePrompt,
      };
    }
    return c;
  });
}
