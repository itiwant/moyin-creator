// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { fileStorage } from "@/lib/indexed-db-storage";
import { generateUUID } from "@/lib/utils";

export const DEFAULT_FPS = 30;

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

interface ProjectStore {
  projects: Project[];
  activeProjectId: string | null;
  activeProject: Project | null;
  createProject: (name?: string) => Project;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  setActiveProject: (id: string | null) => void;
  ensureDefaultProject: () => void;
}

// Default project for desktop app
const DEFAULT_PROJECT: Project = {
  id: "default-project",
  name: "Dự án Moyin Creator",
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      projects: [DEFAULT_PROJECT],
      activeProjectId: DEFAULT_PROJECT.id,
      activeProject: DEFAULT_PROJECT,

      ensureDefaultProject: () => {
        const { projects, activeProjectId } = get();
        if (projects.length === 0) {
          set({
            projects: [DEFAULT_PROJECT],
            activeProjectId: DEFAULT_PROJECT.id,
            activeProject: DEFAULT_PROJECT,
          });
          return;
        }
        if (!activeProjectId) {
          set({
            activeProjectId: projects[0].id,
            activeProject: projects[0],
          });
        }
      },

      createProject: (name) => {
        const newProject: Project = {
          id: generateUUID(),
          name: name?.trim() || `Dự án mới ${new Date().toLocaleDateString('vi-VN')}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({
          projects: [newProject, ...state.projects],
          // 不在这里Cài đặt activeProjectId —— 由 switchProject() 统一处理
          // Tránh switchProject 因 ID 已相同而跳过 rehydration
        }));
        return newProject;
      },

      renameProject: (id, name) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, name, updatedAt: Date.now() } : p
          ),
          activeProject:
            state.activeProject?.id === id
              ? { ...state.activeProject, name, updatedAt: Date.now() }
              : state.activeProject,
        }));
      },

      deleteProject: (id) => {
        set((state) => {
          const remaining = state.projects.filter((p) => p.id !== id);
          const nextActive =
            state.activeProjectId === id ? remaining[0] || null : state.activeProject;
          return {
            projects: remaining,
            activeProjectId: nextActive?.id || null,
            activeProject: nextActive,
          };
        });
        // Clean up per-project storage directory
        if (window.fileStorage?.removeDir) {
          window.fileStorage.removeDir(`_p/${id}`).catch((err: any) =>
            console.warn(`[ProjectStore] Failed to remove project dir _p/${id}:`, err)
          );
        }
      },

      setActiveProject: (id) => {
        set((state) => {
          const project = state.projects.find((p) => p.id === id) || null;
          return {
            activeProjectId: project?.id || null,
            activeProject: project,
          };
        });
      },
    }),
    {
      name: "moyin-project-store",
      storage: createJSONStorage(() => fileStorage),
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
      }),
      migrate: (persisted: any) => {
        if (persisted?.projects && persisted.projects.length > 0) {
          return persisted;
        }
        return {
          projects: [DEFAULT_PROJECT],
          activeProjectId: DEFAULT_PROJECT.id,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const project =
          state.projects.find((p) => p.id === state.activeProjectId) ||
          state.projects[0] ||
          null;
        state.activeProjectId = project?.id || null;
        state.activeProject = project;

        // 异步扫描磁盘上 _p/ thư mục，将bỏ sót的项目恢复到 cột表中
        // 解决路径切换/Nhập/迁移后项目 cột表为trống问题
        discoverProjectsFromDisk().catch((err) =>
          console.warn('[ProjectStore] Disk discovery failed:', err)
        );
      },
    }
  )
);

/**
 * 扫描磁盘上 _p/ thư mục下的实际项目Thư mục，
 * 将未在 projects  cột表đang xử lý...项目Tự động恢复。
 * 
 * 解决以下Cảnh：
 * - thay đổi存储路径并迁移dữ liệu后，前端 store 未 reload，或 moyin-project-store.json
 *   đang xử lý...rojects  cột表不đầy đủ（旧Phiên bản、Thủ côngSao chép等）
 * - Nhậpdữ liệu后 moyin-project-store.json thiếu或不含Dự án mới
 * - 换电脑后指向旧dữ liệuthư mục，projects  cột表为空
 */
async function discoverProjectsFromDisk(): Promise<void> {
  if (!window.fileStorage?.listDirs) return;

  try {
    //  cột出 _p/ 下Tất cảconthư mục名（每conthư mục名就是一 projectId）
    const diskProjectIds = await window.fileStorage.listDirs('_p');
    if (!diskProjectIds || diskProjectIds.length === 0) return;

    const { projects } = useProjectStore.getState();
    const knownIds = new Set(projects.map((p) => p.id));

    const missingIds = diskProjectIds.filter((id) => !knownIds.has(id));
    if (missingIds.length === 0) return;

    console.log(
      `[ProjectStore] Found ${missingIds.length} projects on disk not in store:`,
      missingIds.map((id) => id.substring(0, 8))
    );

    // 尝试从每bỏ sót项mục đích director / script store fileđang xử lý...目名
    const recoveredProjects: Project[] = [];
    for (const pid of missingIds) {
      let name = `Dự án khôi phục (${pid.substring(0, 8)})`;
      const createdAt = Date.now();

      // 尝试从 script store 获取Tên
      try {
        const scriptRaw = await window.fileStorage.getItem(`_p/${pid}/script-store`);
        if (scriptRaw) {
          const parsed = JSON.parse(scriptRaw);
          const state = parsed?.state ?? parsed;
          // script-store 的 projects trườngđang xử lý...项目thông tin
          if (state?.projects?.[pid]?.title) {
            name = state.projects[pid].title;
          }
        }
      } catch { /* ignore */ }

      // 尝试从 director store 获取TạoThời gian等thông tin
      try {
        const directorRaw = await window.fileStorage.getItem(`_p/${pid}/director-store`);
        if (directorRaw) {
          const parsed = JSON.parse(directorRaw);
          const state = parsed?.state ?? parsed;
          if (state?.projects?.[pid]?.screenplay) {
            // 有Kịch bảnNội dung，说明确实是有效项目
            const screenplay = state.projects[pid].screenplay;
            if (!name.includes('Dự án khôi phục')) {
              // 已经有Tên了，不Ghi đè
            } else if (screenplay) {
              // 用Kịch bản前几字做临时Tên
              const preview = screenplay.substring(0, 20).replace(/\n/g, ' ').trim();
              if (preview) name = preview + '...';
            }
          }
        }
      } catch { /* ignore */ }

      recoveredProjects.push({
        id: pid,
        name,
        createdAt,
        updatedAt: Date.now(),
      });
    }

    if (recoveredProjects.length > 0) {
      useProjectStore.setState((state) => ({
        projects: [...state.projects, ...recoveredProjects],
      }));
      console.log(
        `[ProjectStore] Recovered ${recoveredProjects.length} projects from disk:`,
        recoveredProjects.map((p) => `${p.id.substring(0, 8)}:${p.name}`)
      );
    }
  } catch (err) {
    console.error('[ProjectStore] discoverProjectsFromDisk error:', err);
  }
}
