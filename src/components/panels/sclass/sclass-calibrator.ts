// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.

/**
 * Hạng S「cấp nhóm AI Hiệu chuẩn」核心模块
 *
 * 功能：
 * 1. 读取trong nhóm各 SplitScene 数据（只读，不修改 director-store）
 * 2. gọi API LLM Tạocấp nhómtự sựcung、Ống kínhchuyển tiếp、âm thanhThiết kế、tối ưu prompt
 * 3. 写入 sclass-store 的 ShotGroup Hiệu chuẩntrường
 *
 * 数据安全：
 * - 只读 director-store，零污染gốcKịch bản数据
 * - 产物只写 sclass-store.ShotGroup 的Hiệu chuẩntrường
 */

import type { SplitScene } from '@/stores/director-store';
import type { ShotGroup } from '@/stores/sclass-store';
import type { Character } from '@/stores/character-library-store';
import type { Scene } from '@/stores/scene-store';
import { callFeatureAPI } from '@/lib/ai/feature-router';
import { useSClassStore } from '@/stores/sclass-store';

// ==================== Loại定义 ====================

/** Hiệu chuẩn产物（AI 输出的 4 mụccấp nhómtối ưu数据） */
export interface CalibrationResult {
  /** cấp nhómtự sựcungMô tả */
  narrativeArc: string;
  /** Ống kính间chuyển tiếp指令（长度 = scenes.length - 1） */
  transitions: string[];
  /** cấp nhómâm thanhThiết kế（整段 15s 规划） */
  groupAudioDesign: string;
  /** AI tối ưu后的cấp nhóm prompt */
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
  if (scene.dialogue) parts.push(`Thoại：${scene.dialogue}`);
  if (scene.ambientSound) parts.push(`Âm thanh môi trường：${scene.ambientSound}`);
  if (scene.soundEffectText) parts.push(`Hiệu ứng âm thanh：${scene.soundEffectText}`);
  if (scene.emotionTags?.length) parts.push(`情绪：${scene.emotionTags.join('、')}`);
  if (scene.narrativeFunction) parts.push(`tự sự功能：${scene.narrativeFunction}`);

  return parts.join('\n  ');
}

// ==================== 核心函数 ====================

/**
 * Hiệu chuẩnmỗi nhóm
 *
 * @param group       目标组（只读 sceneIds）
 * @param scenes      trong nhóm SplitScene[]（只读，来自 director-store）
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
    throw new Error('trong nhóm无Ống kính，无法Hiệu chuẩn');
  }

  const totalDuration = scenes.reduce((sum, s) => sum + (s.duration || 5), 0);

  // ---- 构建输入 ----
  const sceneSummaries = scenes.map((s, i) =>
    `【Ống kính${i + 1}】\n  ${summarizeScene(s, characters)}`
  ).join('\n\n');

  const systemPrompt = `你是一位资深电影Đạo diễn兼剪辑师，擅长多Ống kínhtự sựvideo的节奏把控和tự sự连贯性tối ưu。

【核心约束 — 严格执 hàng】
1. 严格基于以下Ống kính数据，不得ThêmKịch bảnđang xử lý...的Nhân vật、Cảnh或Thoại。
2. 只做tự sự连贯tối ưu和chuyển tiếpThiết kế，不改变各Ống kính的核心Nội dung和情绪基调。
3. 保留每Ống kính的原有运镜和Hành độngThiết kế，只在Ống kính衔接处增加chuyển tiếp指令。
4. âm thanhThiết kế必须基于各Ống kínhhiện có的Âm thanh môi trường/Hiệu ứng âm thanh信息，不凭空创造新音源。
5. calibratedPrompt 是对Tất cảỐng kính的整合重写，必须包含每Ống kính的核心信息，不遗漏。

请以 JSON 格式Quay lại，Không有任何解释文字。`;

  const userPrompt = `【组信息】
Tên nhóm：${group.name}
Ống kính数：${scenes.length}
TổngThời lượng：${totalDuration}s

${sceneSummaries}

请输出以下 JSON：
{
  "narrativeArc": "用一句话Mô tả这组Ống kính的tự sựcung（起承转合）",
  "transitions": [
    "Ống kính1→Ống kính2 的chuyển tiếp指令（如：hình ảnh溶解、硬切、声桥chuyển tiếp等）"
  ],
  "groupAudioDesign": "整段 ${totalDuration}s 的âm thanhThiết kế规划（Âm thanh môi trường层次、Hiệu ứng âm thanh时机、情绪曲线）",
  "calibratedPrompt": "整合tối ưu后的đầy đủcấp nhómprompt，đang xử lý...于 Seedance 2.0 多Ống kínhtự sựTạo video"
}

transitions 数组长度必须为 ${scenes.length - 1}（每两相邻Ống kính之间一条）。
calibratedPrompt 必须Ghi đèTất cả ${scenes.length} Ống kính，保持Ống kính编号和Thời gian轴。`;

  // ---- gọi API LLM ----
  const raw = await callFeatureAPI('script_analysis', systemPrompt, userPrompt, {
    temperature: 0.3, // 低温度确保稳定输出
    maxTokens: 4096,
  });

  // ---- Phân tích JSON ----
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
    throw new Error('AI Quay lại的 JSON Phân tíchThất bại，请Thử lại');
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
    result.transitions.push('自然chuyển tiếp');
  }

  if (!result.calibratedPrompt) {
    throw new Error('AI 未Quay lại有效的 calibratedPrompt');
  }

  return result;
}

// ==================== Store 写入 ====================

/**
 * 执 hàngHiệu chuẩn并写入 store
 *
 * 这是 UI 层应该gọi API的入sổ。处理Trạng thái更新和错误。
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

  // 标记Hiệu chuẩn中
  store.updateShotGroup(groupId, {
    calibrationStatus: 'calibrating',
    calibrationError: null,
  });

  try {
    const result = await calibrateGroup(group, scenes, characters, sceneLibrary);

    // 写入Hiệu chuẩn产物
    store.updateShotGroup(groupId, {
      narrativeArc: result.narrativeArc,
      transitions: result.transitions,
      groupAudioDesign: result.groupAudioDesign,
      calibratedPrompt: result.calibratedPrompt,
      calibrationStatus: 'done',
      calibrationError: null,
    });

    console.log(`[SClassCalibrator] ✅ 组「${group.name}」Hiệu chuẩn完成`);
    return true;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[SClassCalibrator] ❌ 组「${group.name}」Hiệu chuẩnThất bại:`, errMsg);

    store.updateShotGroup(groupId, {
      calibrationStatus: 'failed',
      calibrationError: errMsg,
    });

    return false;
  }
}

/**
 * 批量Hiệu chuẩnTất cả未Hiệu chuẩn的组
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

  // 筛选需要Hiệu chuẩn的组（未Hiệu chuẩn 或 Hiệu chuẩnThất bại）
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
