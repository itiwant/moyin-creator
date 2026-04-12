// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Hạng S Store — Seedance 2.0 多模态Sáng tácpanelTrạng tháiQuản lý
 *
 * 核心概念：
 * - ShotGroup：将 director-store đang xử lý...plitScene 按组合并，用于多Ống kínhtự sựTạo video
 * - AssetRef：@tham chiếuTài sản（ảnh/video/âm thanh），在promptđang xử lý...Image1 @Video1 @Audio1 形式tham chiếu
 * - 双chế độ：Phân cảnhchế độ（从Kịch bản流水线Nhập）+ Tự dochế độ（纯Phương tiệnTải lên）
 *
 * Seedance 2.0 限制：
 * - 输入：≤9ảnh + ≤3video(≤15s) + ≤3âm thanh(MP3,≤15s) + 文本(5000字符) ，Tổngfile≤12
 * - 输出：4-15s，480p/720p/1080p，16:9/9:16/4:3/3:4/21:9/1:1
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createProjectScopedStorage } from '@/lib/project-storage';

// ==================== Types ====================

/** @tham chiếuTài sảnLoại */
export type AssetType = 'image' | 'video' | 'audio';

/** Phương tiện用途（Seedance 2.0 @Phương tiện用途精确标注） */
export type AssetPurpose =
  | 'character_ref'     // Nhân vậtTham chiếu
  | 'scene_ref'         // CảnhTham chiếu
  | 'first_frame'       // Khung hình đầu
  | 'grid_image'        // ô图
  | 'camera_replicate'  // 运镜复刻
  | 'action_replicate'  // Hành động复刻
  | 'effect_replicate'  // 特效复刻
  | 'beat_sync'         // 音乐卡点
  | 'bgm'              // 背景音乐
  | 'voice_ref'        // 语音Tham chiếu
  | 'prev_video'       // 前组kéo dài
  | 'video_extend'     // 被kéo dài的video
  | 'video_edit_src'   // 被Chỉnh sửa的源video
  | 'general'          // 通用Tham chiếu
;

/** Tạo videoTrạng thái */
export type VideoGenStatus = 'idle' | 'generating' | 'completed' | 'failed';

/** 输出video画幅比 */
export type SClassAspectRatio = '16:9' | '9:16' | '4:3' | '3:4' | '21:9' | '1:1';

/** 输出videoĐộ phân giải */
export type SClassResolution = '480p' | '720p' | '1080p';

/** 输出videoThời lượng（秒） */
export type SClassDuration = 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

/** Sáng tácchế độ */
export type SClassMode = 'storyboard' | 'free';

/** 组TạoLoại */
export type GroupGenerationType = 'new' | 'extend' | 'edit';

/** Hướng kéo dài */
export type ExtendDirection = 'forward' | 'backward';

/** Chỉnh sửaLoại */
export type EditType = 'plot_change' | 'character_swap' | 'attribute_modify' | 'element_add';

// ==================== Interfaces ====================

/**
 * @tham chiếuTài sản
 * 在promptđang xử lý...Image1, @Video1, @Audio1 方式tham chiếu
 */
export interface AssetRef {
  id: string;
  type: AssetType;
  /** Tài sảnThẻ，如 @Image1, @Video2 */
  tag: string;
  /** 本地file路径或 data URL */
  localUrl: string;
  /** HTTP URL（Tải lên到 API 后获得） */
  httpUrl: string | null;
  /** file名（用于Hiện） */
  fileName: string;
  /** file大小（字节） */
  fileSize: number;
  /** video/âm thanhThời lượng（秒），ảnh为 null */
  duration: number | null;
  /** Phương tiện用途（Seedance 2.0 @Phương tiện用途精确标注） */
  purpose?: AssetPurpose;
}

/**
 * TạoLịch sử
 */
export interface GenerationRecord {
  id: string;
  timestamp: number;
  prompt: string;
  videoUrl: string | null;
  status: VideoGenStatus;
  error: string | null;
  /** Sử dụng的Tài sảntham chiếu快照 */
  assetRefs: AssetRef[];
  /** Tạo参数快照 */
  config: {
    aspectRatio: SClassAspectRatio;
    resolution: SClassResolution;
    duration: SClassDuration;
  };
}

/**
 * Ống kính组 — Hạng S核心数据Cấu trúc
 *
 * 将 director-store đang xử lý...SplitScene 编为一组，
 * 合并它们的Khung hình đầuảnh、prompt，Tạo一段多Ống kínhtự sựvideo。
 */
export interface ShotGroup {
  id: string;
  /** Tên nhóm（Tự độngTạo或用户Tùy chỉnh） */
  name: string;
  /** tham chiếu director-store đang xử lý...litScene.id  cột表 */
  sceneIds: number[];
  /** 组内TổngThời lượng限制（≤15s） */
  totalDuration: SClassDuration;
  /** @ảnhtham chiếu */
  imageRefs: AssetRef[];
  /** @videotham chiếu */
  videoRefs: AssetRef[];
  /** @âm thanhtham chiếu */
  audioRefs: AssetRef[];
  /** 合并后的prompt（用户可Chỉnh sửa） */
  mergedPrompt: string;
  /** Tạo的video URL */
  videoUrl: string | null;
  /** videothư viện phương tiện ID（用于拖拽到Thời gian线） */
  videoMediaId: string | null;
  /** Tạo videoTrạng thái */
  videoStatus: VideoGenStatus;
  /** Tạo进度 0-100 */
  videoProgress: number;
  /** 错误信息 */
  videoError: string | null;
  /** Tạo历史 */
  history: GenerationRecord[];
  /** 排序索引 */
  sortIndex: number;
  /** 合并ô图 dataUrl（Tạo video时构建，用于Xem trước/Tải xuống） */
  gridImageUrl: string | null;
  /** 最近一次TạoSử dụng的đầy đủ prompt（用于Sao chép核对） */
  lastPrompt: string | null;

  // ---- 组级 AI Hiệu chuẩn ----
  /** 组级tự sự弧线（AI Hiệu chuẩn产物） */
  narrativeArc?: string;
  /** Ống kính间过渡指令，长度 = sceneIds.length - 1 */
  transitions?: string[];
  /** 组级âm thanhThiết kế（整段 15s 规划） */
  groupAudioDesign?: string;
  /** AI Hiệu chuẩn后的组级 prompt（优先级：mergedPrompt > calibratedPrompt > Tự động拼接） */
  calibratedPrompt?: string;
  /** Hiệu chuẩnTrạng thái */
  calibrationStatus?: 'idle' | 'calibrating' | 'done' | 'failed';
  /** Hiệu chuẩn错误信息 */
  calibrationError?: string | null;

  // ---- videokéo dài & videoChỉnh sửa ----
  /** 组TạoLoại：new=全新Tạo, extend=kéo dài, edit=Chỉnh sửa */
  generationType?: GroupGenerationType;
  /** Hướng kéo dài（仅 extend 时有效） */
  extendDirection?: ExtendDirection;
  /** Chỉnh sửaLoại（仅 edit 时有效） */
  editType?: EditType;
  /** 来源组 ID（kéo dài/Chỉnh sửa的gốcvideo组） */
  sourceGroupId?: string;
  /** 来源video URL（冗余存储，避免原组被删后找不到） */
  sourceVideoUrl?: string;
}

/**
 * 单镜Tạo记录（保留单Ống kính独立Tạo能力）
 */
export interface SingleShotOverride {
  sceneId: number;
  /** 单Ống kính独立prompt（Ghi đèPhân cảnhgốcprompt） */
  prompt: string;
  /** @tham chiếuTài sản */
  assetRefs: AssetRef[];
  /** Tạo的video URL */
  videoUrl: string | null;
  videoMediaId: string | null;
  videoStatus: VideoGenStatus;
  videoProgress: number;
  videoError: string | null;
  history: GenerationRecord[];
}

// ==================== Project Data ====================

/** Hạng S项目级数据 */
export interface SClassProjectData {
  /** Ống kính组 cột表 */
  shotGroups: ShotGroup[];
  /** 单镜TạoGhi đè表 (sceneId -> override) */
  singleShotOverrides: Record<number, SingleShotOverride>;
  /** 全局 @tham chiếuTài sản（Tự dochế độ下Sử dụng） */
  globalAssetRefs: AssetRef[];
  /** Tạo配置 */
  config: SClassConfig;
  /** 当前chế độ */
  mode: SClassMode;
  /** 是否已从 director 数据Tự động分组过 */
  hasAutoGrouped: boolean;
  /** 最近一次lưới 9 ôTạo的gốc大图 URL（用于Tạo video时复用，避免重新合并） */
  lastGridImageUrl: string | null;
  /** lastGridImageUrl 对应的Phân cảnh ID  cột表（用于判断是否可复用） */
  lastGridSceneIds: number[] | null;
  editorPrefs: SClassEditorPrefs;
}

/** Hạng STạo配置（共享配置 aspectRatio/resolution 已统一由 director-store Quản lý） */
export interface SClassConfig {
  defaultDuration: SClassDuration;
  /** Tạo并发数 */
  concurrency: number;
}

export interface SClassEditorPrefs {
  imageGenMode: 'single' | 'merged';
  frameMode: 'first' | 'last' | 'both';
  refStrategy: 'cluster' | 'minimal' | 'none';
  useExemplar: boolean;
  activeTab: 'editing' | 'trailer';
  episodeViewScope: 'all' | 'episode';
}

// ==================== Store ====================

interface SClassState {
  activeProjectId: string | null;
  projects: Record<string, SClassProjectData>;
  /** Đang chọn的组 ID */
  selectedGroupId: string | null;
  /** Tạochế độ：组Tạo / 单镜Tạo */
  generationMode: 'group' | 'single';
}

interface SClassActions {
  // mục目Quản lý
  setActiveProjectId: (projectId: string | null) => void;
  ensureProject: (projectId: string) => void;
  getProjectData: (projectId: string) => SClassProjectData;

  // Ống kính组 CRUD
  addShotGroup: (group: ShotGroup) => void;
  updateShotGroup: (groupId: string, updates: Partial<ShotGroup>) => void;
  removeShotGroup: (groupId: string) => void;
  setShotGroups: (groups: ShotGroup[]) => void;
  reorderShotGroups: (groupIds: string[]) => void;

  // Ống kính组内CảnhQuản lý
  addSceneToGroup: (groupId: string, sceneId: number) => void;
  removeSceneFromGroup: (groupId: string, sceneId: number) => void;
  moveSceneBetweenGroups: (fromGroupId: string, toGroupId: string, sceneId: number) => void;

  // Ống kính组Tạo video
  updateGroupVideoStatus: (groupId: string, updates: Partial<Pick<ShotGroup, 'videoStatus' | 'videoProgress' | 'videoUrl' | 'videoError' | 'videoMediaId'>>) => void;
  addGroupHistory: (groupId: string, record: GenerationRecord) => void;

  // 单镜Tạo
  setSingleShotOverride: (sceneId: number, override: SingleShotOverride) => void;
  updateSingleShotVideo: (sceneId: number, updates: Partial<Pick<SingleShotOverride, 'videoStatus' | 'videoProgress' | 'videoUrl' | 'videoError' | 'videoMediaId'>>) => void;
  removeSingleShotOverride: (sceneId: number) => void;

  // @tham chiếuTài sản
  addAssetRef: (groupId: string | null, asset: AssetRef) => void;
  removeAssetRef: (groupId: string | null, assetId: string) => void;

  // 配置
  updateConfig: (config: Partial<SClassConfig>) => void;
  setEditorPrefs: (prefs: Partial<SClassEditorPrefs>) => void;

  // lưới 9 ô缓存
  setLastGridImage: (url: string | null, sceneIds: number[] | null) => void;

  // UI
  setSelectedGroupId: (groupId: string | null) => void;
  setGenerationMode: (mode: 'group' | 'single') => void;
  setMode: (mode: SClassMode) => void;
  setHasAutoGrouped: (value: boolean) => void;

  // Đặt lại
  reset: () => void;
}

type SClassStore = SClassState & SClassActions;

// ==================== Defaults ====================

const defaultConfig: SClassConfig = {
  defaultDuration: 10,
  concurrency: 1,
};

const defaultEditorPrefs: SClassEditorPrefs = {
  imageGenMode: 'merged',
  frameMode: 'first',
  refStrategy: 'cluster',
  useExemplar: true,
  activeTab: 'editing',
  episodeViewScope: 'episode',
};

const defaultProjectData = (): SClassProjectData => ({
  shotGroups: [],
  singleShotOverrides: {},
  globalAssetRefs: [],
  config: { ...defaultConfig },
  mode: 'storyboard',
  hasAutoGrouped: false,
  lastGridImageUrl: null,
  lastGridSceneIds: null,
  editorPrefs: { ...defaultEditorPrefs },
});

const initialState: SClassState = {
  activeProjectId: null,
  projects: {},
  selectedGroupId: null,
  generationMode: 'group',
};

// ==================== Helpers ====================

/** 获取当前项目数据 */
const getCurrentProject = (state: SClassState): SClassProjectData | null => {
  if (!state.activeProjectId) return null;
  return state.projects[state.activeProjectId] || null;
};

const normalizeProjectData = (project: any): SClassProjectData => {
  const defaults = defaultProjectData();
  return {
    ...defaults,
    ...project,
    config: {
      ...defaults.config,
      ...(project?.config || {}),
    },
    editorPrefs: {
      ...defaultEditorPrefs,
      ...(project?.editorPrefs || {}),
    },
  };
};

// ==================== Store ====================

export const useSClassStore = create<SClassStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ========== mục目Quản lý ==========

      setActiveProjectId: (projectId) => {
        set({ activeProjectId: projectId });
        if (projectId) {
          get().ensureProject(projectId);
        }
      },

      ensureProject: (projectId) => {
        const { projects } = get();
        if (projects[projectId]) return;
        set({
          projects: { ...projects, [projectId]: defaultProjectData() },
        });
      },

      getProjectData: (projectId) => {
        const { projects } = get();
        return projects[projectId] || defaultProjectData();
      },

      // ========== Ống kính组 CRUD ==========

      addShotGroup: (group) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              shotGroups: [...project.shotGroups, group],
            },
          },
        });
      },

      updateShotGroup: (groupId, updates) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              shotGroups: project.shotGroups.map((g) =>
                g.id === groupId ? { ...g, ...updates } : g
              ),
            },
          },
        });
      },

      removeShotGroup: (groupId) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              shotGroups: project.shotGroups.filter((g) => g.id !== groupId),
            },
          },
        });
      },

      setShotGroups: (groups) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              shotGroups: groups,
            },
          },
        });
      },

      reorderShotGroups: (groupIds) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        const groupMap = new Map<string, ShotGroup>(project.shotGroups.map((g) => [g.id, g]));
        const reordered = groupIds
          .map((id, idx) => {
            const g = groupMap.get(id);
            return g ? { ...(g as ShotGroup), sortIndex: idx } : null;
          })
          .filter(Boolean) as ShotGroup[];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              shotGroups: reordered,
            },
          },
        });
      },

      // ========== Ống kính组内CảnhQuản lý ==========

      addSceneToGroup: (groupId, sceneId) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              shotGroups: project.shotGroups.map((g) =>
                g.id === groupId && !g.sceneIds.includes(sceneId)
                  ? { ...g, sceneIds: [...g.sceneIds, sceneId] }
                  : g
              ),
            },
          },
        });
      },

      removeSceneFromGroup: (groupId, sceneId) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              shotGroups: project.shotGroups.map((g) =>
                g.id === groupId
                  ? { ...g, sceneIds: g.sceneIds.filter((id) => id !== sceneId) }
                  : g
              ),
            },
          },
        });
      },

      moveSceneBetweenGroups: (fromGroupId, toGroupId, sceneId) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              shotGroups: project.shotGroups.map((g) => {
                if (g.id === fromGroupId) {
                  return { ...g, sceneIds: g.sceneIds.filter((id) => id !== sceneId) };
                }
                if (g.id === toGroupId && !g.sceneIds.includes(sceneId)) {
                  return { ...g, sceneIds: [...g.sceneIds, sceneId] };
                }
                return g;
              }),
            },
          },
        });
      },

      // ========== Ống kính组Tạo video ==========

      updateGroupVideoStatus: (groupId, updates) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              shotGroups: project.shotGroups.map((g) =>
                g.id === groupId ? { ...g, ...updates } : g
              ),
            },
          },
        });
      },

      addGroupHistory: (groupId, record) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              shotGroups: project.shotGroups.map((g) =>
                g.id === groupId
                  ? { ...g, history: [...g.history, record] }
                  : g
              ),
            },
          },
        });
      },

      // ========== 单镜Tạo ==========

      setSingleShotOverride: (sceneId, override) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              singleShotOverrides: {
                ...project.singleShotOverrides,
                [sceneId]: override,
              },
            },
          },
        });
      },

      updateSingleShotVideo: (sceneId, updates) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        const existing = project.singleShotOverrides[sceneId];
        if (!existing) return;
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              singleShotOverrides: {
                ...project.singleShotOverrides,
                [sceneId]: { ...existing, ...updates },
              },
            },
          },
        });
      },

      removeSingleShotOverride: (sceneId) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        const { [sceneId]: _, ...rest } = project.singleShotOverrides;
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              singleShotOverrides: rest,
            },
          },
        });
      },

      // ========== @tham chiếuTài sản ==========

      addAssetRef: (groupId, asset) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];

        if (groupId) {
          // Thêm到指定组
          set({
            projects: {
              ...projects,
              [activeProjectId]: {
                ...project,
                shotGroups: project.shotGroups.map((g) =>
                  g.id === groupId
                    ? {
                        ...g,
                        ...(asset.type === 'image'
                          ? { imageRefs: [...(g.imageRefs || []), asset] }
                          : asset.type === 'video'
                            ? { videoRefs: [...g.videoRefs, asset] }
                            : asset.type === 'audio'
                              ? { audioRefs: [...g.audioRefs, asset] }
                              : g),
                      }
                    : g
                ),
              },
            },
          });
        } else {
          // Thêm到全局（Tự dochế độ）
          set({
            projects: {
              ...projects,
              [activeProjectId]: {
                ...project,
                globalAssetRefs: [...project.globalAssetRefs, asset],
              },
            },
          });
        }
      },

      removeAssetRef: (groupId, assetId) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];

        if (groupId) {
          set({
            projects: {
              ...projects,
              [activeProjectId]: {
                ...project,
                shotGroups: project.shotGroups.map((g) =>
                  g.id === groupId
                    ? {
                        ...g,
                        imageRefs: (g.imageRefs || []).filter((r) => r.id !== assetId),
                        videoRefs: g.videoRefs.filter((r) => r.id !== assetId),
                        audioRefs: g.audioRefs.filter((r) => r.id !== assetId),
                      }
                    : g
                ),
              },
            },
          });
        } else {
          set({
            projects: {
              ...projects,
              [activeProjectId]: {
                ...project,
                globalAssetRefs: project.globalAssetRefs.filter((r) => r.id !== assetId),
              },
            },
          });
        }
      },

      // ========== 配置 ==========

      updateConfig: (configUpdates) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              config: { ...project.config, ...configUpdates },
            },
          },
        });
      },

      setEditorPrefs: (prefs) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              editorPrefs: {
                ...(project?.editorPrefs || defaultEditorPrefs),
                ...prefs,
              },
            },
          },
        });
      },

      // ========== UI ==========

      setSelectedGroupId: (groupId) => set({ selectedGroupId: groupId }),

      setGenerationMode: (mode) => set({ generationMode: mode }),

      setMode: (mode) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: { ...project, mode },
          },
        });
      },

      setHasAutoGrouped: (value) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: { ...project, hasAutoGrouped: value },
          },
        });
      },

      // ========== lưới 9 ô缓存 ==========

      setLastGridImage: (url, sceneIds) => {
        const { activeProjectId, projects } = get();
        if (!activeProjectId) return;
        const project = projects[activeProjectId];
        set({
          projects: {
            ...projects,
            [activeProjectId]: {
              ...project,
              lastGridImageUrl: url,
              lastGridSceneIds: sceneIds,
            },
          },
        });
      },

      // ========== Đặt lại ==========

      reset: () => set(initialState),
    }),
    {
      name: 'moyin-sclass-store',
      storage: createJSONStorage(() => createProjectScopedStorage('sclass')),
      partialize: (state) => {
        const pid = state.activeProjectId;
        let projectData = null;
        if (pid && state.projects[pid]) {
          projectData = state.projects[pid];
        }
        return {
          activeProjectId: pid,
          projectData,
          generationMode: state.generationMode,
          // Don't persist: selectedGroupId (transient UI state)
        };
      },
      merge: (persisted: any, current: any) => {
        if (!persisted) return current;

        // 迁移辅助：清理 SClassConfig đang xử lý...a的冗余trường（aspectRatio/resolution 已由 director-store Quản lý）
        const migrateConfig = (config: any) => {
          if (!config) return config;
          const { aspectRatio, resolution, ...clean } = config;
          return clean;
        };
        const migrateProjectData = (pd: any) => {
          if (!pd) return normalizeProjectData(pd);
          const normalized = normalizeProjectData(pd);
          return {
            ...normalized,
            config: migrateConfig(normalized.config),
            editorPrefs: {
              ...defaultEditorPrefs,
              ...(normalized.editorPrefs || {}),
            },
          };
        };

        // Legacy format
        if (persisted.projects && typeof persisted.projects === 'object') {
          const migratedProjects: any = {};
          for (const [k, v] of Object.entries(persisted.projects)) {
            migratedProjects[k] = migrateProjectData(v);
          }
          return { ...current, ...persisted, projects: migratedProjects };
        }

        // Per-project format
        const { activeProjectId: pid, projectData, generationMode } = persisted;
        const updates: any = { ...current };
        if (generationMode) updates.generationMode = generationMode;
        if (pid) updates.activeProjectId = pid;
        if (pid && projectData) {
          updates.projects = { ...current.projects, [pid]: migrateProjectData(projectData) };
        }
        return updates;
      },
    }
  )
);

// ==================== Selectors ====================

/** 获取当前活跃项目的 Hạng S数据 */
export const useActiveSClassProject = (): SClassProjectData | null => {
  return useSClassStore((state) => {
    if (!state.activeProjectId) return null;
    return state.projects[state.activeProjectId] || null;
  });
};

/** 获取当前项目的Ống kính组 cột表 */
export const useShotGroups = (): ShotGroup[] => {
  return useSClassStore((state) => {
    if (!state.activeProjectId) return [];
    const project = state.projects[state.activeProjectId];
    return project?.shotGroups || [];
  });
};

/** 获取指定Ống kính组 */
export const useShotGroup = (groupId: string): ShotGroup | null => {
  return useSClassStore((state) => {
    if (!state.activeProjectId) return null;
    const project = state.projects[state.activeProjectId];
    return project?.shotGroups.find((g) => g.id === groupId) || null;
  });
};
