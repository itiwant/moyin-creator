// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * auto-grouping.ts — Hạng Sthông minhnhóm算法
 *
 * 将 director-store đang xử lý...plitScene[] Tự động分为 ShotGroup[]。
 * 策略：
 *   1. 按thứ tự贪心填装，每组TổngThời lượng ≤ maxDuration（Mặc định15s）
 *   2. Cảnhchuyển sang优先断开（不同 sceneName 的Ống kính优先不在同一组）
 *   3. Nhân vật重叠度高的Ống kính优先同组（characterIds 交 tập）
 *   4. 每组 2~maxPerGroup Ống kính
 */

import type { SplitScene } from '@/stores/director-store';
import type { ShotGroup, SClassDuration } from '@/stores/sclass-store';

// ==================== Config ====================

export interface GroupingConfig {
  /** Thời lượng tối đa mỗi nhóm (giây), mặc định 15 */
  maxDuration: number;
  /** Số ống kính tối đa mỗi nhóm, mặc định 4 */
  maxPerGroup: number;
  /** Số ống kính tối thiểu mỗi nhóm, mặc định 1 (nhóm cuối có thể là 1) */
  minPerGroup: number;
  /** Thời lượng ống kính đơn mặc định (khi scene.duration chưa cài đặt), mặc định 5 */
  defaultSceneDuration: number;
}

const DEFAULT_CONFIG: GroupingConfig = {
  maxDuration: 15,
  maxPerGroup: 4,
  minPerGroup: 1,
  defaultSceneDuration: 5,
};

// ==================== Helpers ====================

/** Lấy thời lượng hiệu lực của phân cảnh đơn */
function getSceneDuration(scene: SplitScene, defaultDuration: number): number {
  return scene.duration > 0 ? scene.duration : defaultDuration;
}

/** Tính độ trùng lặp nhân vật giữa hai ống kính (0~1) */
function characterOverlap(a: SplitScene, b: SplitScene): number {
  if (!a.characterIds?.length || !b.characterIds?.length) return 0;
  const setA = new Set(a.characterIds);
  const intersection = b.characterIds.filter((id) => setA.has(id));
  const union = new Set([...a.characterIds, ...b.characterIds]);
  return union.size > 0 ? intersection.length / union.size : 0;
}

/** Kiểm tra hai ống kính có cùng cảnh không */
function isSameScene(a: SplitScene, b: SplitScene): boolean {
  // Sử dụng sceneName 判断，空值视为同Cảnh
  if (!a.sceneName && !b.sceneName) return true;
  return a.sceneName === b.sceneName;
}

/** Tạo ID duy nhất */
function genId(): string {
  return `grp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ==================== Core Algorithm ====================

/**
 * 对 SplitScene[] 执 hàngTự độngnhóm
 *
 * @returns ShotGroup[] — 每组chứa sceneIds、totalDuration 等
 */
export function autoGroupScenes(
  scenes: SplitScene[],
  config: Partial<GroupingConfig> = {},
): ShotGroup[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (scenes.length === 0) return [];

  const groups: ShotGroup[] = [];
  let currentSceneIds: number[] = [];
  let currentDuration = 0;

  const flush = () => {
    if (currentSceneIds.length === 0) return;
    const dur = Math.round(Math.min(Math.max(currentDuration, 4), 15)) as SClassDuration;
    groups.push({
      id: genId(),
      name: `Nhóm ${groups.length + 1}`,
      sceneIds: [...currentSceneIds],
      totalDuration: dur,
      imageRefs: [],
      videoRefs: [],
      audioRefs: [],
      mergedPrompt: '',
      videoUrl: null,
      videoMediaId: null,
      videoStatus: 'idle',
      videoProgress: 0,
      videoError: null,
      history: [],
      sortIndex: groups.length,
      gridImageUrl: null,
      lastPrompt: null,
    });
    currentSceneIds = [];
    currentDuration = 0;
  };

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const dur = getSceneDuration(scene, cfg.defaultSceneDuration);

    // 决定是否需要在此处断开新组
    let shouldBreak = false;

    if (currentSceneIds.length >= cfg.maxPerGroup) {
      // 已满
      shouldBreak = true;
    } else if (currentDuration + dur > cfg.maxDuration && currentSceneIds.length > 0) {
      // 加入后超Thời lượng上限
      shouldBreak = true;
    } else if (currentSceneIds.length > 0) {
      // Cảnhchuyển sang检测：不同Cảnh优先断开
      const prevScene = scenes[i - 1];
      if (prevScene && !isSameScene(prevScene, scene)) {
        // 不同Cảnh —— 如果当nhóm trướchiện có ≥ minPerGroup Ống kính，断开
        if (currentSceneIds.length >= cfg.minPerGroup) {
          // 但若Nhân vật高度重叠，可以容忍（跨Cảnh但同Nhân vật）
          const overlap = characterOverlap(prevScene, scene);
          if (overlap < 0.5) {
            shouldBreak = true;
          }
        }
      }
    }

    if (shouldBreak) {
      flush();
    }

    currentSceneIds.push(scene.id);
    currentDuration += dur;
  }

  // 最后一组
  flush();

  return groups;
}

/**
 * lại计算组的TổngThời lượng
 */
export function recalcGroupDuration(
  group: ShotGroup,
  scenes: SplitScene[],
  defaultDuration = 5,
): number {
  const sceneMap = new Map(scenes.map((s) => [s.id, s]));
  let total = 0;
  for (const id of group.sceneIds) {
    const s = sceneMap.get(id);
    total += s ? getSceneDuration(s, defaultDuration) : defaultDuration;
  }
  return total;
}

/**
 * 为组TạoMặc địnhTên
 */
export function generateGroupName(
  group: ShotGroup,
  scenes: SplitScene[],
  groupIndex: number,
): string {
  if (group.sceneIds.length === 0) return `Nhóm ${groupIndex + 1}`;

  // 尝试Sử dụngCảnh名
  const sceneMap = new Map(scenes.map((s) => [s.id, s]));
  const firstScene = sceneMap.get(group.sceneIds[0]);

  // Sử dụngtrong nhómthứ tự编号（而非 scene.id），Tránh 1-based ID 导致偏移
  const allIds = scenes.map(s => s.id);
  const firstIdx = allIds.indexOf(group.sceneIds[0]);
  const lastIdx = allIds.indexOf(group.sceneIds[group.sceneIds.length - 1]);
  const firstNum = firstIdx >= 0 ? firstIdx + 1 : 1;
  const lastNum = lastIdx >= 0 ? lastIdx + 1 : firstNum + group.sceneIds.length - 1;

  if (firstScene?.sceneName) {
    return `${firstScene.sceneName} (Ống kính${firstNum}-${lastNum})`;
  }

  return `Nhóm ${groupIndex + 1}: Ống kính ${firstNum}-${lastNum}`;
}
