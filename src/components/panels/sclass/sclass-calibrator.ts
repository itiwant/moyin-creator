// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.

/**
 * Hạng S「组级 AI 校准」核心模块
 *
 * 功能：
 * 1. 读取组内各 SplitScene 数据（只读，不修改 director-store）
 * 2. 调用 LLM Tạo组级叙事弧线、Ống kính过渡、âm thanh设计、优化 prompt
 * 3. 写入 sclass-store 的 ShotGroup 校准trường
 *
 * 数据安全：
 * - 只读 director-store，零污染原始Kịch bản数据
 * - 产物只写 sclass-store.ShotGroup 的校准trường
 */

import type { SplitScene } from '@/stores/director-store';
import type { ShotGroup } from '@/stores/sclass-store';
import type { Character } from '@/stores/character-library-store';
import type { Scene } from '@/stores/scene-store';
import { callFeatureAPI } from '@/lib/ai/feature-router';
import { useSClassStore } from '@/stores/sclass-store';

// ==================== Loại定义 ====================

/** 校准产物（AI 输出的 4 mục组级优化数据） */
export interface CalibrationResult {
  /** 组级叙事弧线Mô tả */
  narrativeArc: string;
  /** Ống kính间过渡指令（长度 = scenes.length - 1） */
  transitions: string[];
  /** 组级âm thanh设计（整段 15s 规划） */
  groupAudioDesign: string;
  /** AI 优化后的组级 prompt */
  calibratedPrompt: string;
}

// ==================== 内部工具 ====================

/**
 * 从 SplitScene 提取摘要信息（用于构建 AI 输入，不泄漏多余trường）
 */
function summarizeScene(scene: SplitScene, characters: Character[]): string {
  const charNames = (scene.characterIds || [])
    .map(id => characters.find(c => c.id === id)?.name)
    .filter(Boolean)
    .join('、');

  const parts: string[] = [];
  parts.push(`Cảnh：${scene.sceneName || 'Chưa đặt tên'}`);
  if (scene.sceneLocation) parts.push(`Địa điểm：${scene.sceneLocation}`);
  parts.push(`Thời lượng：${scene.duration || 5}s`);
  if (charNames) parts.push(`Nhân vật：${charNames}`);
  if (scene.actionSummary) parts.push(`Hành động：${scene.actionSummary}`);
  if (scene.cameraMovement) parts.push(`运镜：${scene.cameraMovement}`);
  if (scene.dialogue) parts.push(`对白：${scene.dialogue}`);
  if (scene.ambientSound) parts.push(`môi trường音：${scene.ambientSound}`);
  if (scene.soundEffectText) parts.push(`音效：${scene.soundEffectText}`);
  if (scene.emotionTags?.length) parts.push(`情绪：${scene.emotionTags.join('、')}`);
  if (scene.narrativeFunction) parts.push(`叙事功能：${scene.narrativeFunction}`);

  return parts.join('\n  ');
}

// ==================== 核心函数 ====================

/**
 * 校准单组
 *
 * @param group       目标组（只读 sceneIds）
 * @param scenes      组内 SplitScene[]（只读，来自 director-store）
 * @param characters  Thư viện nhân vật（用于Tên映射）
 * @param sceneLibrary Thư viện cảnh（备用上下文）
 * @returns CalibrationResult
 */
export async function calibrateGroup(
  group: ShotGroup,
  scenes: SplitScene[],
  characters: Character[],
  _sceneLibrary: Scene[],
): Promise<CalibrationResult> {
  if (scenes.length === 0) {
    throw new Error('组内无Ống kính，无法校准');
  }

  const totalDuration = scenes.reduce((sum, s) => sum + (s.duration || 5), 0);

  // ---- 构建输入 ----
  const sceneSummaries = scenes.map((s, i) =>
    `【Ống kính${i + 1}】\n  ${summarizeScene(s, characters)}`
  ).join('\n\n');

  const systemPrompt = `你是一位资深电影Đạo diễn兼剪辑师，擅长多Ống kính叙事video的节奏把控和叙事连贯性优化。

【核心约束 — 严格执 hàng】
1. 严格基于以下Ống kính数据，不得ThêmKịch bảnđang xử lý...的Nhân vật、Cảnh或对白。
2. 只做叙事连贯优化和过渡设计，不改变各Ống kính的核心Nội dung和情绪基调。
3. 保留每Ống kính的原有运镜和Hành động设计，只在Ống kính衔接处增加过渡指令。
4. âm thanh设计必须基于各Ống kính已有的môi trường音/音效信息，不凭空创造新音源。
5. calibratedPrompt 是对Tất cảỐng kính的整合重写，必须包含每Ống kính的核心信息，不遗漏。

请以 JSON 格式Quay lại，Không有任何解释文字。`;

  const userPrompt = `【组信息】
Tên nhóm：${group.name}
Ống kính数：${scenes.length}
TổngThời lượng：${totalDuration}s

${sceneSummaries}

请输出以下 JSON：
{
  "narrativeArc": "用一句话Mô tả这组Ống kính的叙事弧线（起承转合）",
  "transitions": [
    "Ống kính1→Ống kính2 的过渡指令（如：hình ảnh溶解、硬切、声桥过渡等）"
  ],
  "groupAudioDesign": "整段 ${totalDuration}s 的âm thanh设计规划（môi trường音层次、音效时机、情绪曲线）",
  "calibratedPrompt": "整合优化后的đầy đủ组级prompt，đang xử lý...于 Seedance 2.0 多Ống kính叙事Tạo video"
}

transitions 数组长度必须为 ${scenes.length - 1}（每两相邻Ống kính之间一条）。
calibratedPrompt 必须覆盖Tất cả ${scenes.length} Ống kính，保持Ống kính编号和Thời gian轴。`;

  // ---- 调用 LLM ----
  const raw = await callFeatureAPI('script_analysis', systemPrompt, userPrompt, {
    temperature: 0.3, // 低温度确保稳定输出
    maxTokens: 4096,
  });

  // ---- 解析 JSON ----
  let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('AI Quay lại的 JSON 解析Thất bại，请Thử lại');
  }

  // ---- 校验 & 容错 ----
  const result: CalibrationResult = {
    narrativeArc: typeof parsed.narrativeArc === 'string' ? parsed.narrativeArc : '',
    transitions: Array.isArray(parsed.transitions) ? parsed.transitions.map(String) : [],
    groupAudioDesign: typeof parsed.groupAudioDesign === 'string' ? parsed.groupAudioDesign : '',
    calibratedPrompt: typeof parsed.calibratedPrompt === 'string' ? parsed.calibratedPrompt : '',
  };

  // transitions 长度修正
  const expectedLen = Math.max(scenes.length - 1, 0);
  if (result.transitions.length > expectedLen) {
    result.transitions = result.transitions.slice(0, expectedLen);
  }
  while (result.transitions.length < expectedLen) {
    result.transitions.push('自然过渡');
  }

  if (!result.calibratedPrompt) {
    throw new Error('AI 未Quay lại有效的 calibratedPrompt');
  }

  return result;
}

// ==================== Store 写入 ====================

/**
 * 执 hàng校准并写入 store
 *
 * 这是 UI 层应该调用的入口。处理Trạng thái更新和错误。
 */
export async function runCalibration(
  groupId: string,
  scenes: SplitScene[],
  characters: Character[],
  sceneLibrary: Scene[],
): Promise<boolean> {
  const store = useSClassStore.getState();
  const projectData = store.activeProjectId
    ? store.getProjectData(store.activeProjectId)
    : null;
  const group = projectData?.shotGroups.find(g => g.id === groupId);
  if (!group) {
    console.error('[SClassCalibrator] 找不到组:', groupId);
    return false;
  }

  // 标记校准中
  store.updateShotGroup(groupId, {
    calibrationStatus: 'calibrating',
    calibrationError: null,
  });

  try {
    const result = await calibrateGroup(group, scenes, characters, sceneLibrary);

    // 写入校准产物
    store.updateShotGroup(groupId, {
      narrativeArc: result.narrativeArc,
      transitions: result.transitions,
      groupAudioDesign: result.groupAudioDesign,
      calibratedPrompt: result.calibratedPrompt,
      calibrationStatus: 'done',
      calibrationError: null,
    });

    console.log(`[SClassCalibrator] ✅ 组「${group.name}」校准完成`);
    return true;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[SClassCalibrator] ❌ 组「${group.name}」校准Thất bại:`, errMsg);

    store.updateShotGroup(groupId, {
      calibrationStatus: 'failed',
      calibrationError: errMsg,
    });

    return false;
  }
}

/**
 * 批量校准Tất cả未校准的组
 *
 * @returns Thành công数 / Tổng数
 */
export async function runBatchCalibration(
  scenes: SplitScene[],
  characters: Character[],
  sceneLibrary: Scene[],
): Promise<{ success: number; total: number }> {
  const store = useSClassStore.getState();
  const projectData = store.activeProjectId
    ? store.getProjectData(store.activeProjectId)
    : null;

  if (!projectData) return { success: 0, total: 0 };

  // 筛选需要校准的组（未校准 或 校准Thất bại）
  const groups = projectData.shotGroups.filter(g =>
    !g.calibrationStatus || g.calibrationStatus === 'idle' || g.calibrationStatus === 'failed'
  );

  let success = 0;
  for (const group of groups) {
    const groupScenes = scenes.filter(s => group.sceneIds.includes(s.id));
    if (groupScenes.length === 0) continue;

    const ok = await runCalibration(group.id, groupScenes, characters, sceneLibrary);
    if (ok) success++;
  }

  return { success, total: groups.length };
}
