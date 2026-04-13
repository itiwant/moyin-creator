// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * 错开启动的并发điều khiển执行器
 *
 * 行为：
 * - 每新nhiệm vụ在前一nhiệm vụ启动后至少等待 staggerMs 才启动
 * - 同时tối đa运行 maxConcurrent nhiệm vụ
 * - 当đang hoạt độngnhiệm vụ数达到上限时，等待有nhiệm vụhoàn thành后才启动下一（仍giữ staggerMs 间隔）
 *
 * 例如 maxConcurrent=3, staggerMs=5000, 每nhiệm vụ耗时20秒：
 *   t=0s:  启动nhiệm vụ1
 *   t=5s:  启动nhiệm vụ2
 *   t=10s: 启动nhiệm vụ3（达到并发上限）
 *   t=15s: nhiệm vụ4的 stagger 到期，但并发已满，排队等待
 *   t=20s: nhiệm vụ1hoàn thành → nhiệm vụ4立即启动
 *   t=25s: nhiệm vụ2hoàn thành → nhiệm vụ5立即启动
 *
 * 例如 maxConcurrent=1, staggerMs=5000, 每nhiệm vụ耗时2秒：
 *   t=0s:  启动nhiệm vụ1
 *   t=2s:  nhiệm vụ1hoàn thành
 *   t=5s:  stagger 到期 → 启动nhiệm vụ2（严格giữ5秒间隔）
 *   t=7s:  nhiệm vụ2hoàn thành
 *   t=10s: 启动nhiệm vụ3
 */
export async function runStaggered<T>(
  tasks: (() => Promise<T>)[],
  maxConcurrent: number,
  staggerMs: number = 5000
): Promise<PromiseSettledResult<T>[]> {
  if (tasks.length === 0) return [];

  const results: PromiseSettledResult<T>[] = new Array(tasks.length);

  // 信号量：điều khiển最大并发数
  let activeCount = 0;
  const waiters: (() => void)[] = [];

  const acquire = async (): Promise<void> => {
    if (activeCount < maxConcurrent) {
      activeCount++;
      return;
    }
    // 并发已满，排队等待
    await new Promise<void>((resolve) => waiters.push(resolve));
  };

  const release = (): void => {
    activeCount--;
    if (waiters.length > 0) {
      // 唤醒队列đang xử lý...等待者
      activeCount++;
      const next = waiters.shift()!;
      next();
    }
  };

  // 逐启动nhiệm vụ，每间隔 staggerMs
  // 第Nnhiệm vụ在 N * staggerMs 后才被允许启动（stagger 保底间隔）
  // 同时受信号量限制（并发保底）
  const taskPromises = tasks.map(async (task, idx) => {
    // 错开启动：第Nnhiệm vụ至少在 N * staggerMs 后才启动
    if (idx > 0) {
      await new Promise<void>((r) => setTimeout(r, idx * staggerMs));
    }

    // 获取并发槽位（如果已满则等待有nhiệm vụhoàn thành）
    await acquire();

    try {
      const value = await task();
      results[idx] = { status: 'fulfilled', value };
    } catch (reason) {
      results[idx] = { status: 'rejected', reason: reason as any };
    } finally {
      release();
    }
  });

  await Promise.all(taskPromises);
  return results;
}
