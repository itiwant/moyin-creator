// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * CORS-safe fetch wrapper
 *
 * Tự động检测运行môi trường：
 * - Electron 桌面chế độ → Trực tiếp使用原生 fetch()（无 CORS 限制）
 * - 浏览器开发chế độ   → 通过 Vite 开发服务器 /__api_proxy?url=... 代理转发
 * - 浏览器生产chế độ   → Trực tiếp fetch()（需后端/Nginx 提供反向代理）
 */

/** 检测是否在 Electron môi trườngđang xử lý...*/
function isElectron(): boolean {
  return !!(
    typeof window !== 'undefined' &&
    (window as any).electron
  );
}

/** 检测是否在 Vite 开发服务器đang xử lý...*/
function isViteDev(): boolean {
  return import.meta.env?.DEV === true;
}

/**
 * CORS 安全的 fetch 封装
 *
 * 在浏览器开发chế độ下，Tự động将请求代理到 Vite 开发服务器的
 * `/__api_proxy` đang xử lý...由服务端转发请求以绕过 CORS 限制。
 *
 * @param url    目标 URL（与原生 fetch 参数相同）
 * @param init   请求Tùy chọn（与原生 fetch 参数相同）
 * @returns      Response（与原生 fetch 返回值相同）
 */
export async function corsFetch(
  url: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const targetUrl = url.toString();

  // Electron 或非开发môi trường：直连
  if (isElectron() || !isViteDev()) {
    return fetch(targetUrl, init);
  }

  // 浏览器开发chế độ：走 Vite 代理
  const proxyUrl = `/__api_proxy?url=${encodeURIComponent(targetUrl)}`;

  // 将gốc headers 序列化到 x-proxy-headers 头中
  // 这样代理đang xử lý...以把它们转发给目标服务器
  const proxyHeaders = new Headers(init?.headers);

  // 把gốc headers 打包进一特殊头，代理端负责解包
  const originalHeaders: Record<string, string> = {};
  proxyHeaders.forEach((value, key) => {
    originalHeaders[key] = value;
  });

  const proxyInit: RequestInit = {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-proxy-headers': JSON.stringify(originalHeaders),
    },
  };

  return fetch(proxyUrl, proxyInit);
}
