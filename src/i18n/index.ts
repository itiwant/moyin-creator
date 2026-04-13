// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.

/**
 * Lightweight i18n engine - no external dependencies required.
 * Supports namespaced keys, interpolation, and language switching.
 *
 * Usage:
 *   import { useTranslation } from '@/i18n';
 *   const { t } = useTranslation('common');
 *   t('save')              // → "Lưu"
 *   t('nav:settings')      // → "Cài đặt"
 *   t('update.new_version', { version: '1.2.3' }) // → "Có phiên bản mới: 1.2.3"
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import vi from "./locales/vi";
import zh from "./locales/zh";

// ─── Types ───────────────────────────────────────────────────────────────────

export type Language = "vi" | "zh";

type NestedRecord = { [key: string]: string | NestedRecord };
type Locales = Record<Language, Record<string, NestedRecord>>;

// ─── Locale registry ─────────────────────────────────────────────────────────

const LOCALES: Locales = {
  vi: vi as Record<string, NestedRecord>,
  zh: zh as Record<string, NestedRecord>,
};

export const LANGUAGE_LABELS: Record<Language, string> = {
  vi: "Tiếng Việt",
  zh: "đang xử lý...
};

// ─── Language Zustand store (persisted) ──────────────────────────────────────

interface LanguageState {
  language: Language;
  setLanguage: (lang: Language) => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: "vi" as Language,
      setLanguage: (language) => set({ language }),
    }),
    { name: "moyin-language" }
  )
);

// ─── Core translation resolver ────────────────────────────────────────────────

/**
 * Resolve a dot-path key (e.g. "common.save") inside a locale namespace object.
 */
function resolvePath(obj: NestedRecord | undefined, path: string): string | undefined {
  if (!obj) return undefined;
  const parts = path.split(".");
  let current: string | NestedRecord | undefined = obj;
  for (const part of parts) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as NestedRecord)[part];
  }
  return typeof current === "string" ? current : undefined;
}

/**
 * Apply interpolation: replace {{key}} placeholders with values.
 */
function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    params[key] !== undefined ? String(params[key]) : `{{${key}}}`
  );
}

/**
 * Core translate function.
 * key format: "key" | "key.subkey" | "namespace:key" | "namespace:key.subkey"
 */
export function translate(
  language: Language,
  defaultNamespace: string,
  key: string,
  params?: Record<string, string | number>
): string {
  let ns = defaultNamespace;
  let resolvedKey = key;

  if (key.includes(":")) {
    [ns, resolvedKey] = key.split(":", 2);
  }

  const locale = LOCALES[language] ?? LOCALES.vi;
  const fallback = LOCALES.vi;

  const nsObj = locale[ns] as NestedRecord | undefined;
  const fallbackNsObj = fallback[ns] as NestedRecord | undefined;

  const value =
    resolvePath(nsObj, resolvedKey) ??
    resolvePath(fallbackNsObj, resolvedKey) ??
    key; // last-resort: return the key itself

  return interpolate(value, params);
}

// ─── React Context ────────────────────────────────────────────────────────────

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

interface I18nProviderProps {
  children: ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  const { language, setLanguage } = useLanguageStore();

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translate(language, "common", key, params),
    [language]
  );

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * useTranslation - returns a `t()` function scoped to the given namespace.
 *
 * @example
 *   const { t } = useTranslation('director');
 *   t('first_frame')              // → "Khung hình đầu"
 *   t('common:save')              // → "Lưu"   (cross-namespace)
 *   t('episode', { num: 3 })      // → "Tập 3"
 */
export function useTranslation(namespace = "common") {
  const ctx = useContext(I18nContext);
  const { language, setLanguage } = useLanguageStore();

  // When used outside provider, fall back to store-based language
  const lang = ctx?.language ?? language;

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translate(lang, namespace, key, params),
    [lang, namespace]
  );

  return {
    t,
    language: lang,
    setLanguage: ctx?.setLanguage ?? setLanguage,
  };
}

/**
 * Standalone translate helper for use in non-React contexts (stores, utils).
 *
 * @example
 *   import { t } from '@/i18n';
 *   t('director', 'generation_failed')  // → "Tạo thất bại"
 */
export function t(
  namespace: string,
  key: string,
  params?: Record<string, string | number>
): string {
  const lang = useLanguageStore.getState().language;
  return translate(lang, namespace, key, params);
}
