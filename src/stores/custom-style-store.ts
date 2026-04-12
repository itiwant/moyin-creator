// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Custom Style Store
 * 用户Tùy chỉnhPhong cáchTài sảnQuản lý，独立于内置预设
 * Sử dụng localStorage 持久化（全局Tài sản，不按项目分割）
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { registerCustomStyleLookup, type StylePreset } from '@/lib/constants/visual-styles';

// ==================== Types ====================

export interface CustomStyle {
  id: string;
  name: string;                 // Phong cáchTên（必填）
  prompt: string;               // 用户gốcprompt（可能混合了Phong cách+Mô tả cảnh）
  negativePrompt: string;       // Prompt phủ định
  description: string;          // Mô tả
  referenceImages: string[];    // Ảnh tham chiếu路径 (local-image://styles/...)
  tags: string[];               // Thẻ
  folderId: string | null;      // 所属Thư mục
  // === AI 提取的Cấu trúc化Phong cách词（优先级高于 prompt） ===
  styleTokens?: string;         // 纯Phong cách thị giácquan trọng词（画风/光线/色彩/材质）→ Nhân vật/Cảnhảnh thiết kếSử dụng
  sceneTokens?: string;         // Cảnh/bố cục/Đạo cụMô tả → Đạo diễn台/Phân cảnhSử dụng
  createdAt: number;
  updatedAt: number;
}

export interface CustomStyleFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}

interface CustomStyleState {
  styles: CustomStyle[];
  folders: CustomStyleFolder[];
  selectedStyleId: string | null;
  editingStyleId: string | null;    // null = 不在Chỉnh sửa, 'new' = Tạo mới, 其他 = Chỉnh sửahiện có
}

interface CustomStyleActions {
  // Style CRUD
  addStyle: (style: Omit<CustomStyle, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateStyle: (id: string, updates: Partial<Omit<CustomStyle, 'id' | 'createdAt'>>) => void;
  deleteStyle: (id: string) => void;
  duplicateStyle: (id: string) => string | null;

  // Folder CRUD
  addFolder: (name: string, parentId?: string | null) => string;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;

  // Selection
  selectStyle: (id: string | null) => void;
  setEditingStyle: (id: string | null) => void;

  // Queries
  getStyleById: (id: string) => CustomStyle | undefined;
  getStylesByFolder: (folderId: string | null) => CustomStyle[];
  getAllStyles: () => CustomStyle[];

  // Reset
  reset: () => void;
}

type CustomStyleStore = CustomStyleState & CustomStyleActions;

// ==================== Initial State ====================

const initialState: CustomStyleState = {
  styles: [],
  folders: [],
  selectedStyleId: null,
  editingStyleId: null,
};

// ==================== Store ====================

export const useCustomStyleStore = create<CustomStyleStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Style CRUD
      addStyle: (styleData) => {
        const id = `custom_style_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const now = Date.now();
        const newStyle: CustomStyle = {
          ...styleData,
          id,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          styles: [...state.styles, newStyle],
        }));
        return id;
      },

      updateStyle: (id, updates) => {
        set((state) => ({
          styles: state.styles.map((s) =>
            s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s
          ),
        }));
      },

      deleteStyle: (id) => {
        set((state) => ({
          styles: state.styles.filter((s) => s.id !== id),
          selectedStyleId: state.selectedStyleId === id ? null : state.selectedStyleId,
          editingStyleId: state.editingStyleId === id ? null : state.editingStyleId,
        }));
      },

      duplicateStyle: (id) => {
        const source = get().styles.find((s) => s.id === id);
        if (!source) return null;
        const newId = `custom_style_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const now = Date.now();
        const copy: CustomStyle = {
          ...source,
          id: newId,
          name: `${source.name} (副本)`,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          styles: [...state.styles, copy],
        }));
        return newId;
      },

      // Folder CRUD
      addFolder: (name, parentId = null) => {
        const id = `stylefolder_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const newFolder: CustomStyleFolder = {
          id,
          name,
          parentId: parentId || null,
          createdAt: Date.now(),
        };
        set((state) => ({
          folders: [...state.folders, newFolder],
        }));
        return id;
      },

      renameFolder: (id, name) => {
        set((state) => ({
          folders: state.folders.map((f) =>
            f.id === id ? { ...f, name } : f
          ),
        }));
      },

      deleteFolder: (id) => {
        set((state) => ({
          folders: state.folders.filter((f) => f.id !== id),
          // 移到Thư mục gốc
          styles: state.styles.map((s) =>
            s.folderId === id ? { ...s, folderId: null, updatedAt: Date.now() } : s
          ),
        }));
      },

      // Selection
      selectStyle: (id) => set({ selectedStyleId: id }),
      setEditingStyle: (id) => set({ editingStyleId: id }),

      // Queries
      getStyleById: (id) => get().styles.find((s) => s.id === id),
      getStylesByFolder: (folderId) => get().styles.filter((s) => s.folderId === folderId),
      getAllStyles: () => get().styles,

      // Reset
      reset: () => set(initialState),
    }),
    {
      name: 'moyin-custom-styles',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        styles: state.styles,
        folders: state.folders,
      }),
    }
  )
);

// ==================== 注册Tùy chỉnhPhong cách查找回调 ====================
// 让 visual-styles.ts 的工具函数（getStyleById/getStylePrompt 等）
// 能查找到用户Tùy chỉnhPhong cách（存储在 localStorage 的用户数据）

/**
 * 从promptđang xử lý...hong cáchphân loại（Hỗ trợTrung-Anhquan trọng词）
 * quan trọng词Khớp：
 *   real → realistic/photorealistic/photography/写实/真人/实景/电影级/实拍/胶片
 *   3d   → 3d/render/unreal/c4d/三维/渲染/虚幻引擎
 *   stop_motion → stop motion/claymation/定格/黏土
 *   其余 → '2d'
 */
function inferCategoryFromPrompt(prompt: string): import('@/lib/constants/visual-styles').StyleCategory {
  const lower = prompt.toLowerCase();
  // 英文quan trọng词
  if (/\b(realistic|photorealistic|real\s?person|photography|real\s?life|cinematic\s?lighting.*skin)/.test(lower)) {
    return 'real';
  }
  // đang xử lý...an trọng词：写实/真人/实景/电影级写实/实拍/胶片/剧照
  if (/(写实|真人|实景|电影级|实拍|胶片|剧照|无\s?CGI|Kết cấu da|毛孔)/.test(prompt)) {
    return 'real';
  }
  // 英文 3D quan trọng词
  if (/\b(3d|render|unreal\s?engine|c4d|blender|voxel|low\s?poly)/.test(lower)) {
    return '3d';
  }
  // đang xử lý...D quan trọng词
  if (/(三维|3D|渲染|虚幻引擎|建模)/.test(prompt)) {
    return '3d';
  }
  // 定格动画
  if (/\b(stop.?motion|claymation|puppet)/.test(lower) || /(定格|黏土|木偶)/.test(prompt)) {
    return 'stop_motion';
  }
  return '2d';
}

/** 从phân loại推断媒介Loại */
function inferMediaType(category: import('@/lib/constants/visual-styles').StyleCategory): import('@/lib/constants/visual-styles').MediaType {
  switch (category) {
    case 'real': return 'cinematic';
    case '3d': return 'cinematic';
    case 'stop_motion': return 'stop-motion';
    default: return 'animation';
  }
}

registerCustomStyleLookup((id: string): StylePreset | undefined => {
  const style = useCustomStyleStore.getState().styles.find(s => s.id === id);
  if (!style) return undefined;

  // thông minh推断 category/mediaType（用户Chỉnh sửa器目前无这两trường）
  const effectivePrompt = style.prompt || '';
  const category = inferCategoryFromPrompt(effectivePrompt);
  const mediaType = inferMediaType(category);

  // 优先Sử dụng AI 提取的 styleTokens（纯Phong cách thị giác），否则回退到gốc prompt
  const prompt = style.styleTokens
    || effectivePrompt
    || `${style.name} style, professional quality`;

  return {
    id: style.id,
    name: style.name,
    category,
    mediaType,
    prompt,
    negativePrompt: style.negativePrompt || '',
    description: style.description || '',
    thumbnail: '',
  };
});
