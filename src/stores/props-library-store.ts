// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.

/**
 * PropsLibraryStore - Thư viện đạo cụTrạng tháiQuản lý
 * Hỗ trợTùy chỉnhthư mụcphân loại，持久化到 localStorage
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Đạo cụ项
export interface PropItem {
  id: string;
  name: string;           // Đạo cụTên（可Chỉnh sửa）
  imageUrl: string;       // local-image://props/... 或远程URL
  prompt: string;         // Tạo时的prompt（供参考）
  folderId: string | null; // 所属thư mục，null = Thư mục gốc
  createdAt: number;
}

// Tùy chỉnhthư mục
export interface PropFolder {
  id: string;
  name: string;           // thư mụcTên
  parentId: string | null; // 预留嵌套扩展（当前UI仅用一级）
  createdAt: number;
}

interface PropsLibraryState {
  items: PropItem[];
  folders: PropFolder[];
  // 当前选中thư mục（null = 全部）
  selectedFolderId: string | null | 'all';
}

interface PropsLibraryActions {
  // Đạo cụthao tác
  addProp: (prop: Omit<PropItem, 'id' | 'createdAt'>) => PropItem;
  renameProp: (id: string, name: string) => void;
  deleteProp: (id: string) => void;
  moveProp: (propId: string, folderId: string | null) => void;

  // thư mụcthao tác
  addFolder: (name: string, parentId?: string | null) => PropFolder;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void; // Xóa时conĐạo cụ移至Thư mục gốc

  // UI Trạng thái
  setSelectedFolderId: (folderId: string | null | 'all') => void;

  // 查询
  getPropsByFolder: (folderId: string | null | 'all') => PropItem[];
  getPropById: (id: string) => PropItem | undefined;
}

type PropsLibraryStore = PropsLibraryState & PropsLibraryActions;

export const usePropsLibraryStore = create<PropsLibraryStore>()(
  persist(
    (set, get) => ({
      items: [],
      folders: [],
      selectedFolderId: 'all',

      // ── Đạo cụthao tác ──────────────────────────────────────────────────────────

      addProp: (prop) => {
        const newProp: PropItem = {
          ...prop,
          id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          createdAt: Date.now(),
        };
        set((s) => ({ items: [newProp, ...s.items] }));
        return newProp;
      },

      renameProp: (id, name) => {
        set((s) => ({
          items: s.items.map((item) =>
            item.id === id ? { ...item, name } : item
          ),
        }));
      },

      deleteProp: (id) => {
        set((s) => ({ items: s.items.filter((item) => item.id !== id) }));
      },

      moveProp: (propId, folderId) => {
        set((s) => ({
          items: s.items.map((item) =>
            item.id === propId ? { ...item, folderId } : item
          ),
        }));
      },

      // ── thư mụcthao tác ──────────────────────────────────────────────────────────

      addFolder: (name, parentId = null) => {
        const newFolder: PropFolder = {
          id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name,
          parentId,
          createdAt: Date.now(),
        };
        set((s) => ({ folders: [...s.folders, newFolder] }));
        return newFolder;
      },

      renameFolder: (id, name) => {
        set((s) => ({
          folders: s.folders.map((f) =>
            f.id === id ? { ...f, name } : f
          ),
        }));
      },

      deleteFolder: (id) => {
        set((s) => ({
          folders: s.folders.filter((f) => f.id !== id),
          // 该thư mục下的Đạo cụ移至Thư mục gốc
          items: s.items.map((item) =>
            item.folderId === id ? { ...item, folderId: null } : item
          ),
          // 如果当前选中了该thư mục，切回"全部"
          selectedFolderId:
            s.selectedFolderId === id ? 'all' : s.selectedFolderId,
        }));
      },

      // ── UI Trạng thái ───────────────────────────────────────────────────────────

      setSelectedFolderId: (folderId) => {
        set({ selectedFolderId: folderId });
      },

      // ── 查询 ─────────────────────────────────────────────────────────────

      getPropsByFolder: (folderId) => {
        const { items } = get();
        if (folderId === 'all') return items;
        return items.filter((item) => item.folderId === folderId);
      },

      getPropById: (id) => {
        return get().items.find((item) => item.id === id);
      },
    }),
    {
      name: 'moyin-props-library',
      partialize: (state) => ({
        items: state.items,
        folders: state.folders,
      }),
    }
  )
);
