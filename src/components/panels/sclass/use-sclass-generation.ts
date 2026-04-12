// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * use-sclass-generation.ts — Hạng S Seedance 2.0 Tạo video Hook
 *
 * 核心chức năng：
 * 1. generateGroupVideo(group) — mỗi nhómTạo：收 tập @tham chiếu → 构建多模态请求 → gọi API API → 轮询
 * 2. generateAllGroups() — Tạo hàng loạt：逐组串 hàng，各组独立Tạo
 * 3. generateSingleShot(sceneId) — ống kính đơnTạo（tương thíchchế độ）
 * 4. Tự độngTải lên base64/local ảnh到 HTTP URL
 * 5. TạoTrạng thái实时同步到 sclass-store
 */

import { useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  useSClassStore,
  type ShotGroup,
  type AssetRef,
  type GenerationRecord,
  type SClassAspectRatio,
  type SClassResolution,
  type SClassDuration,
  type VideoGenStatus,
} from "@/stores/sclass-store";
import { useDirectorStore, useActiveDirectorProject, type SplitScene } from "@/stores/director-store";
import { useCharacterLibraryStore } from "@/stores/character-library-store";
import { useSceneStore } from "@/stores/scene-store";
import {
  getFeatureConfig,
  getFeatureNotConfiguredMessage,
} from "@/lib/ai/feature-router";
import {
  callVideoGenerationApi,
  buildImageWithRoles,
  convertToHttpUrl,
  saveVideoLocally,
  isContentModerationError,
} from "../director/use-video-generation";
import {
  buildGroupPrompt,
  collectAllRefs,
  mergeToGridImage,
  SEEDANCE_LIMITS,
  type GroupPromptResult,
} from "./sclass-prompt-builder";

// ==================== Types ====================

export interface GroupGenerationResult {
  groupId: string;
  success: boolean;
  videoUrl: string | null;
  error: string | null;
}

export interface BatchGenerationProgress {
  total: number;
  completed: number;
  current: string | null;
  results: GroupGenerationResult[];
}

// ==================== Hook ====================

export function useSClassGeneration() {
  const abortRef = useRef(false);

  // ========== Store access ==========

  const {
    activeProjectId,
    getProjectData,
    updateGroupVideoStatus,
    addGroupHistory,
    updateSingleShotVideo,
    updateConfig,
    updateShotGroup,
    addShotGroup,
  } = useSClassStore();

  const projectData = useActiveDirectorProject();
  const splitScenes = projectData?.splitScenes || [];
  const characters = useCharacterLibraryStore((s) => s.characters);
  const scenes = useSceneStore((s) => s.scenes);

  // ========== Helpers ==========

  /** Lấy Danh sách cảnh trong nhóm */
  const getGroupScenes = useCallback(
    (group: ShotGroup): SplitScene[] => {
      return group.sceneIds
        .map((id: number) => splitScenes.find((s: SplitScene) => s.id === id))
        .filter(Boolean) as SplitScene[];
    },
    [splitScenes]
  );

  /** Chuyển đổi ảnh URL @tham chiếu thành HTTP URL */
  const prepareImageUrls = useCallback(
    async (
      refs: AssetRef[]
    ): Promise<Array<{ url: string; role: "first_frame" | "last_frame" }>> => {
      const imageWithRoles: Array<{
        url: string;
        role: "first_frame" | "last_frame";
      }> = [];

      for (let i = 0; i < refs.length; i++) {
        const ref = refs[i];
        const httpUrl = await convertToHttpUrl(ref.localUrl, {
          fallbackHttpUrl: ref.httpUrl,
          uploadName: ref.fileName,
        });
        if (httpUrl) {
          // 第一张图作为 first_frame，其余作为 last_frame
          imageWithRoles.push({
            url: httpUrl,
            role: i === 0 ? "first_frame" : "last_frame",
          });
        }
      }

      return imageWithRoles;
    },
    []
  );

  // ========== mỗi nhómTạo ==========

  const generateGroupVideo = useCallback(
    async (
      group: ShotGroup,
      options?: {
        /** Callback tiến độ */
        onProgress?: (progress: number) => void;
        /** Sau khi tạo xong ảnh lưới + prompt, hỏi người dùng có muốn Tiếp tục Tạo video không; Quay lại false thì dừng */
        confirmBeforeGenerate?: () => Promise<boolean>;
        /** URL video nhóm trước (truyền vào khi Thử lại theo chuỗi, dùng để nối video trước/sau) */
        prevVideoUrl?: string;
      }
    ): Promise<GroupGenerationResult> => {
      const projectId = activeProjectId;
      if (!projectId) {
        return {
          groupId: group.id,
          success: false,
          videoUrl: null,
          error: "Không có dự án đang hoạt động",
        };
      }

      // 1. 获取 API 配置
      const featureConfig = getFeatureConfig("video_generation");
      if (!featureConfig) {
        const msg = getFeatureNotConfiguredMessage("video_generation");
        return {
          groupId: group.id,
          success: false,
          videoUrl: null,
          error: msg,
        };
      }

      const keyManager = featureConfig.keyManager;
      if (!keyManager.getCurrentKey()) {
        return {
          groupId: group.id,
          success: false,
          videoUrl: null,
          error: "Vui lòng cấu hình API Tạo video trong Cài đặt trước Key",
        };
      }
      const sclassProjectData = getProjectData(projectId);
      const sclassConfig = sclassProjectData.config;

      // 1b. 从 director-store 直读共享配置（单一dữ liệu源，Tránh双 store 同步问题）
      const directorState = useDirectorStore.getState();
      const directorProject = directorState.projects[directorState.activeProjectId || ''];
      const storyboardConfig = directorProject?.storyboardConfig;
      const aspectRatio = (storyboardConfig?.aspectRatio || '16:9') as SClassAspectRatio;
      const videoResolution = (storyboardConfig?.videoResolution || '720p') as SClassResolution;
      const styleTokens = storyboardConfig?.styleTokens;

      // 2. 获取trong nhómCảnh
      const groupScenes = getGroupScenes(group);
      if (groupScenes.length === 0) {
        return {
          groupId: group.id,
          success: false,
          videoUrl: null,
          error: "Không có Cảnh trong nhóm",
        };
      }

      // 3. Cài đặtĐang tạoTrạng thái
      updateGroupVideoStatus(group.id, {
        videoStatus: "generating",
        videoProgress: 0,
        videoError: null,
      });

      try {
      // 4. 从trong nhómPhân cảnh聚合âm thanh/chuyển động máyCài đặt
        const isExtendOrEdit = group.generationType === 'extend' || group.generationType === 'edit';
        const hasAnyDialogue = groupScenes.some(s => s.audioDialogueEnabled !== false && s.dialogue?.trim());
        const hasAnyAmbient = groupScenes.some(s => s.audioAmbientEnabled !== false);
        const hasAnySfx = groupScenes.some(s => s.audioSfxEnabled !== false);
        const enableAudio = hasAnyDialogue || hasAnyAmbient || hasAnySfx;
        const enableLipSync = hasAnyDialogue;

        // camerafixed: Tất cảPhân cảnhchuyển động máy为 Static 或为空 → 锁定chuyển động máy
        const allStaticCamera = groupScenes.every(s => {
          const cm = (s.cameraMovement || '').toLowerCase().trim();
          return !cm || cm === 'static' || cm === 'Cố định' || cm === 'tĩnh';
        });

        // 4b. 构建ô图（合并Khung hình đầu 或 复用缓存）
        // kéo dài/Chỉnh sửa组跳过ô图 — 它们的Khung hình đầuTham chiếu来自 sourceVideoUrl
        let gridImageRef: AssetRef | null = null;

        if (!isExtendOrEdit) {
          const sceneIds = group.sceneIds;

          // 检查是否可复用缓存的lưới 9 ô图
          const cachedGridUrl = sclassProjectData.lastGridImageUrl;
          const cachedSceneIds = sclassProjectData.lastGridSceneIds;
          const canReuseGrid = cachedGridUrl &&
            cachedSceneIds &&
            sceneIds.length === cachedSceneIds.length &&
            sceneIds.every((id, i) => id === cachedSceneIds[i]);

          // 收 tậptrong nhómPhân cảnh的Khung hình đầuảnh
          const firstFrameUrls = groupScenes
            .map(s => s.imageDataUrl || s.imageHttpUrl || '')
            .filter(Boolean);

          if (firstFrameUrls.length > 0) {
            let gridDataUrl: string;
            if (canReuseGrid) {
              // 复用步骤③Lưu的gốclưới 9 ô图
              gridDataUrl = cachedGridUrl!;
              console.log('[SClassGen] Tái sử dụng ảnh lưới 9 ô từ cache:', gridDataUrl.substring(0, 60));
            } else {
              // 重新合并Khung hình đầu为ô图
              gridDataUrl = await mergeToGridImage(firstFrameUrls, aspectRatio);
              console.log('[SClassGen] Đã hợp nhất', firstFrameUrls.length, 'Khung hình đầu thành ảnh lưới');
            }

            gridImageRef = {
              id: 'grid_image',
              type: 'image',
              tag: '@ảnh1',
              localUrl: gridDataUrl,
              httpUrl: gridDataUrl.startsWith('http') ? gridDataUrl : null,
              fileName: 'grid_image.png',
              fileSize: 0,
              duration: null,
              purpose: 'grid_image',
            };
          }
        }

        // 4c. 构建 prompt（传入ô图tham chiếu + Phong cách tokens）
        const promptResult: GroupPromptResult = buildGroupPrompt({
          group,
          scenes: groupScenes,
          characters,
          sceneLibrary: scenes,
          styleTokens: styleTokens || undefined,
          aspectRatio,
          enableLipSync,
          gridImageRef,
        });

        if (promptResult.refs.overLimit) {
          console.warn(
            "[SClassGen] Phương tiệnvượt giới hạn:",
            promptResult.refs.limitWarnings
          );
        }

        // 4d. Lưuô图 + prompt 到 group（用于 UI Xem trước/Sao chép）
        updateShotGroup(group.id, {
          gridImageUrl: gridImageRef?.localUrl || null,
          lastPrompt: promptResult.prompt || null,
        });

        // 4e. Xác nhận是否Tiếp tụcTạo video（用户可在此处仅Xem trướcô图/prompt 后中止）
        if (options?.confirmBeforeGenerate) {
          const proceed = await options.confirmBeforeGenerate();
          if (!proceed) {
            // 用户Hủy，Đặt lạiTrạng thái但保留 gridImageUrl + lastPrompt
            updateGroupVideoStatus(group.id, {
              videoStatus: 'idle',
              videoProgress: 0,
            });
            return {
              groupId: group.id,
              success: false,
              videoUrl: null,
              error: null,
            };
          }
        }

        // 5. 收 tậpảnhtham chiếu → 转 HTTP URL
        const imageRefs = promptResult.refs.images;
        const imageWithRoles = await prepareImageUrls(imageRefs);

        // 5b. 收 tậpvideo/âm thanhtham chiếu → 转 HTTP URL（Seedance 2.0 多模态输入）
        const videoRefUrls: string[] = [];
        // nhóm trướcvideonối kết（链式Thử lại时传入）— kéo dài/Chỉnh sửa组已在 refs.videos đang xử lý...sourceVideoUrl，跳过
        if (!isExtendOrEdit && options?.prevVideoUrl) {
          const prevHttpUrl = await convertToHttpUrl(options.prevVideoUrl).catch(() => "");
          if (prevHttpUrl) videoRefUrls.push(prevHttpUrl);
        }
        for (const vRef of promptResult.refs.videos) {
          const httpUrl = vRef.httpUrl || (await convertToHttpUrl(vRef.localUrl).catch(() => ""));
          if (httpUrl) videoRefUrls.push(httpUrl);
        }
        const audioRefUrls: string[] = [];
        for (const aRef of promptResult.refs.audios) {
          const httpUrl = aRef.httpUrl || (await convertToHttpUrl(aRef.localUrl).catch(() => ""));
          if (httpUrl) audioRefUrls.push(httpUrl);
        }

        updateGroupVideoStatus(group.id, { videoProgress: 10 });

        // 6. gọi APITạo video API
        const prompt =
          promptResult.prompt || `Multi-shot video: ${group.name}`;
        const duration = Math.max(
          SEEDANCE_LIMITS.minDuration,
          Math.min(SEEDANCE_LIMITS.maxDuration, group.totalDuration || sclassConfig.defaultDuration)
        );

        console.log("[SClassGen] Generating group video:", {
          groupId: group.id,
          groupName: group.name,
          scenesCount: groupScenes.length,
          promptLength: prompt.length,
          imagesCount: imageWithRoles.length,
          videoRefsCount: videoRefUrls.length,
          audioRefsCount: audioRefUrls.length,
          duration,
          aspectRatio,
          videoResolution,
        });

        const maxVideoAttempts = Math.max(1, Math.min(keyManager.getTotalKeyCount(), 6));
        let videoUrl: string | null = null;
        let lastVideoError: Error | null = null;

        for (let attempt = 0; attempt < maxVideoAttempts; attempt++) {
          const currentApiKey = keyManager.getCurrentKey() || "";
          if (!currentApiKey) break;

          try {
            videoUrl = await callVideoGenerationApi(
              currentApiKey,
              prompt,
              duration,
              aspectRatio,
              imageWithRoles,
              (progress) => {
                const mappedProgress = 10 + Math.floor(progress * 0.85);
                updateGroupVideoStatus(group.id, {
                  videoProgress: mappedProgress,
                });
                options?.onProgress?.(mappedProgress);
              },
              keyManager,
              featureConfig.platform,
              videoResolution,
              videoRefUrls.length > 0 ? videoRefUrls : undefined,
              audioRefUrls.length > 0 ? audioRefUrls : undefined,
              enableAudio,
              allStaticCamera,
            );
            lastVideoError = null;
            break;
          } catch (error) {
            const err = error as Error & { status?: number };
            lastVideoError = err;
            const message = err.message || "";
            const statusMatch = message.match(/\b(4\d\d|5\d\d)\b/);
            const parsedStatus = typeof err.status === "number"
              ? err.status
              : (statusMatch ? Number(statusMatch[1]) : undefined);
            const alreadyRotatedByInner = typeof err.status === "number"
              && [400, 401, 403, 429, 500, 502, 503, 529].includes(err.status);
            const fallbackStatus = /model|Model/i.test(message)
              && /not support|unsupported|không có quyền|quyền không đủ|chưa mở|không khả dụng/i.test(message)
              ? 400
              : undefined;
            const statusForHandle = parsedStatus ?? fallbackStatus;
            const rotated = alreadyRotatedByInner
              ? true
              : (typeof statusForHandle === "number" ? keyManager.handleError(statusForHandle, message) : false);
            const retryableByMessage = /429|500|502|503|529|too many requests|rate|quota|service unavailable|overloaded|internal server error|server error|上游负载|上游服务|饱和|暂时không khả dụng|服务暂时không khả dụng|api key|无效|hết hạn|model|Model|不Hỗ trợ|权限|chưa mở/.test(message.toLowerCase());
            const canRetry = attempt < maxVideoAttempts - 1 && (rotated || retryableByMessage);

            if (canRetry) {
              console.warn(`[SClassGen] Group video retry with next key (${attempt + 1}/${maxVideoAttempts})`, {
                groupId: group.id,
                status: statusForHandle,
                message: message.substring(0, 160),
              });
              continue;
            }
            throw err;
          }
        }

        if (!videoUrl) {
          throw lastVideoError || new Error("Tạo video thất bại: Không có API Key khả dụng");
        }

        // 7. Lưuvideo到本地
        const localUrl = await saveVideoLocally(
          videoUrl,
          group.sceneIds[0] || 0
        );

        // 8. 更新Trạng thái → hoàn thành
        updateGroupVideoStatus(group.id, {
          videoStatus: "completed",
          videoProgress: 100,
          videoUrl: localUrl,
          videoError: null,
        });

        // 9. 记录历史
        const record: GenerationRecord = {
          id: `gen_${Date.now()}_${group.id}`,
          timestamp: Date.now(),
          prompt,
          videoUrl: localUrl,
          status: "completed",
          error: null,
          assetRefs: [
            ...promptResult.refs.images,
            ...promptResult.refs.videos,
            ...promptResult.refs.audios,
          ],
          config: {
            aspectRatio,
            resolution: videoResolution,
            duration: duration as SClassDuration,
          },
        };
        addGroupHistory(group.id, record);

        return {
          groupId: group.id,
          success: true,
          videoUrl: localUrl,
          error: null,
        };
      } catch (error) {
        const err = error as Error;
        const errorMsg = err.message || "Tạo video thất bại";
        const isModeration = isContentModerationError(err);

        console.error("[SClassGen] Group generation failed:", err);

        updateGroupVideoStatus(group.id, {
          videoStatus: "failed",
          videoProgress: 0,
          videoError: isModeration ? `Nội dungkiểm duyệt未通过: ${errorMsg}` : errorMsg,
        });

        return {
          groupId: group.id,
          success: false,
          videoUrl: null,
          error: errorMsg,
        };
      }
    },
    [
      activeProjectId,
      getProjectData,
      getGroupScenes,
      characters,
      scenes,
      updateGroupVideoStatus,
      addGroupHistory,
      prepareImageUrls,
      updateShotGroup,
      addShotGroup,
    ]
  );

  // ========== Tạo hàng loạt（逐组串 hàng + Khung hình cuối传递） ==========

  const generateAllGroups = useCallback(
    async (
      onBatchProgress?: (progress: BatchGenerationProgress) => void
    ): Promise<GroupGenerationResult[]> => {
      const projectId = activeProjectId;
      if (!projectId) {
        toast.error("Không có dự án đang hoạt động");
        return [];
      }

      const projectData = getProjectData(projectId);
      const groups = projectData.shotGroups;

      if (groups.length === 0) {
        toast.error("Không có nhóm Ống kính");
        return [];
      }

      // lọc需要Tạo的组（idle 或 failed）
      const groupsToGenerate = groups.filter(
        (g) => g.videoStatus === "idle" || g.videoStatus === "failed"
      );

      if (groupsToGenerate.length === 0) {
        toast.info("Tất cả nhóm Ống kính đã tạo hoặc đang tạo");
        return [];
      }

      abortRef.current = false;
      const results: GroupGenerationResult[] = [];

      toast.info(
        `Bắt đầu Tạo video ${groupsToGenerate.length} nhóm Ống kính từng nhóm một...`
      );

      for (let i = 0; i < groupsToGenerate.length; i++) {
        if (abortRef.current) {
          toast.warning("Đã đang xử lý tạo hàng loạt");
          break;
        }

        const group = groupsToGenerate[i];

        onBatchProgress?.({
          total: groupsToGenerate.length,
          completed: i,
          current: group.id,
          results,
        });

        const result = await generateGroupVideo(group, {
          onProgress: (progress) => {
            onBatchProgress?.({
              total: groupsToGenerate.length,
              completed: i,
              current: group.id,
              results,
            });
          },
        });

        results.push(result);

        if (result.success) {
          toast.success(
            `Nhóm ${i + 1}/${groupsToGenerate.length} 「${group.name}」Tạo hoàn thành`
          );
        } else {
          toast.error(
            `Nhóm ${i + 1}/${groupsToGenerate.length} 「${group.name}」Thất bại: ${result.error}`
          );
        }
      }

      onBatchProgress?.({
        total: groupsToGenerate.length,
        completed: groupsToGenerate.length,
        current: null,
        results,
      });

      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;
      if (failCount === 0) {
        toast.success(`Tất cả ${successCount} nhóm Ống kính Tạo hoàn thành 🎬`);
      } else {
        toast.warning(
          `Tạohoàn tất：${successCount} Thành công，${failCount} Thất bại`
        );
      }

      return results;
    },
    [activeProjectId, getProjectData, generateGroupVideo]
  );

  // ========== ống kính đơnTạo（tương thíchchế độ） ==========

  const generateSingleShot = useCallback(
    async (sceneId: number): Promise<boolean> => {
      const scene = splitScenes.find((s: SplitScene) => s.id === sceneId);
      if (!scene) {
        toast.error("Không tìm thấy Phân cảnh");
        return false;
      }

      const featureConfig = getFeatureConfig("video_generation");
      if (!featureConfig) {
        toast.error(getFeatureNotConfiguredMessage("video_generation"));
        return false;
      }

      const keyManager = featureConfig.keyManager;
      if (!keyManager.getCurrentKey()) {
        toast.error("Vui lòng cấu hình API Tạo video trong Cài đặt trước Key");
        return false;
      }
      const projectId = activeProjectId;
      if (!projectId) return false;

      // 从 director-store 直读共享配置（与 generateGroupVideo 保持一致）
      const dirState = useDirectorStore.getState();
      const dirProj = dirState.projects[dirState.activeProjectId || ''];
      const sbConfig = dirProj?.storyboardConfig;
      const singleAspectRatio = (sbConfig?.aspectRatio || '16:9') as SClassAspectRatio;
      const singleVideoRes = (sbConfig?.videoResolution || '720p') as SClassResolution;

      updateSingleShotVideo(sceneId, {
        videoStatus: "generating",
        videoProgress: 0,
        videoError: null,
      });

      try {
        // 构建 imageWithRoles
        const firstFrameUrl = scene.imageDataUrl || scene.imageHttpUrl || undefined;
        const imageWithRoles = await buildImageWithRoles(
          firstFrameUrl,
          undefined
        );

        const prompt =
          scene.videoPrompt ||
          scene.videoPromptZh ||
          `Video phân cảnh ${scene.id + 1}`;
        const duration = Math.max(4, Math.min(15, scene.duration || 5));

        const maxVideoAttempts = Math.max(1, Math.min(keyManager.getTotalKeyCount(), 6));
        let videoUrl: string | null = null;
        let lastVideoError: Error | null = null;

        for (let attempt = 0; attempt < maxVideoAttempts; attempt++) {
          const currentApiKey = keyManager.getCurrentKey() || "";
          if (!currentApiKey) break;

          try {
            videoUrl = await callVideoGenerationApi(
              currentApiKey,
              prompt,
              duration,
              singleAspectRatio,
              imageWithRoles,
              (progress) => {
                updateSingleShotVideo(sceneId, { videoProgress: progress });
              },
              keyManager,
              featureConfig.platform,
              singleVideoRes
            );
            lastVideoError = null;
            break;
          } catch (error) {
            const err = error as Error & { status?: number };
            lastVideoError = err;
            const message = err.message || "";
            const statusMatch = message.match(/\b(4\d\d|5\d\d)\b/);
            const parsedStatus = typeof err.status === "number"
              ? err.status
              : (statusMatch ? Number(statusMatch[1]) : undefined);
            const alreadyRotatedByInner = typeof err.status === "number"
              && [400, 401, 403, 429, 500, 502, 503, 529].includes(err.status);
            const fallbackStatus = /model|Model/i.test(message)
              && /not support|unsupported|không có quyền|quyền không đủ|chưa mở|không khả dụng/i.test(message)
              ? 400
              : undefined;
            const statusForHandle = parsedStatus ?? fallbackStatus;
            const rotated = alreadyRotatedByInner
              ? true
              : (typeof statusForHandle === "number" ? keyManager.handleError(statusForHandle, message) : false);
            const retryableByMessage = /429|500|502|503|529|too many requests|rate|quota|service unavailable|overloaded|internal server error|server error|上游负载|上游服务|饱和|暂时không khả dụng|服务暂时không khả dụng|api key|无效|hết hạn|model|Model|不Hỗ trợ|权限|chưa mở/.test(message.toLowerCase());
            const canRetry = attempt < maxVideoAttempts - 1 && (rotated || retryableByMessage);

            if (canRetry) {
              console.warn(`[SClassGen] Single shot retry with next key (${attempt + 1}/${maxVideoAttempts})`, {
                sceneId,
                status: statusForHandle,
                message: message.substring(0, 160),
              });
              continue;
            }
            throw err;
          }
        }

        if (!videoUrl) {
          throw lastVideoError || new Error("Tạo video thất bại: Không có API Key khả dụng");
        }

        const localUrl = await saveVideoLocally(videoUrl, sceneId);

        updateSingleShotVideo(sceneId, {
          videoStatus: "completed",
          videoProgress: 100,
          videoUrl: localUrl,
          videoError: null,
        });

        toast.success(`Phân cảnh ${sceneId + 1} Tạohoàn thành`);
        return true;
      } catch (error) {
        const err = error as Error;
        updateSingleShotVideo(sceneId, {
          videoStatus: "failed",
          videoProgress: 0,
          videoError: err.message,
        });
        toast.error(`Phân cảnh ${sceneId + 1} Tạo thất bại: ${err.message}`);
        return false;
      }
    },
    [
      splitScenes,
      activeProjectId,
      getProjectData,
      updateSingleShotVideo,
    ]
  );

  // ========== đang xử lý...=========

  const abortGeneration = useCallback(() => {
    abortRef.current = true;
    toast.info("正在đang xử lý...o...");
  }, []);

  // ========== Thử lạimỗi nhóm ==========

  const retryGroup = useCallback(
    async (groupId: string): Promise<GroupGenerationResult | null> => {
      const projectId = activeProjectId;
      if (!projectId) return null;

      const projectData = getProjectData(projectId);
      const group = projectData.shotGroups.find((g) => g.id === groupId);
      if (!group) return null;

      // Đặt lạiTrạng thái
      updateGroupVideoStatus(groupId, {
        videoStatus: "idle",
        videoProgress: 0,
        videoError: null,
      });

      // 查找nhóm trước的 videoUrl（链式nối kết）
      let prevVideoUrl: string | undefined;
      const allGroups = projectData.shotGroups;
      const idx = allGroups.findIndex(g => g.id === groupId);
      if (idx > 0 && allGroups[idx - 1].videoUrl) {
        prevVideoUrl = allGroups[idx - 1].videoUrl!;
      }

      return generateGroupVideo(group, { prevVideoUrl });
    },
    [activeProjectId, getProjectData, updateGroupVideoStatus, generateGroupVideo]
  );

  // ========== 链式kéo dài ==========

  /**
   * 基于Đã hoàn thành组Tạokéo dàicon组并Tạo video
   *
   * @param sourceGroupId 来源组 ID（必须Đã hoàn thành且有 videoUrl）
   * @param extendDuration kéo dàiThời lượng (4-15s)
   * @param direction Hướng kéo dài
   * @param description 用户Mô tả bổ sung(tùy chọn)
   */
  const generateChainExtension = useCallback(
    async (
      sourceGroupId: string,
      extendDuration: number = 10,
      direction: 'backward' | 'forward' = 'backward',
      description?: string,
    ): Promise<GroupGenerationResult | null> => {
      const projectId = activeProjectId;
      if (!projectId) {
        toast.error('无đang hoạt động项目');
        return null;
      }

      const pd = getProjectData(projectId);
      const sourceGroup = pd.shotGroups.find(g => g.id === sourceGroupId);
      if (!sourceGroup || !sourceGroup.videoUrl) {
        toast.error('源组无Đã hoàn thànhvideo，无法kéo dài');
        return null;
      }

      // Tạokéo dàicon组
      const childId = `extend_${Date.now()}_${sourceGroupId.substring(0, 8)}`;
      const childGroup: ShotGroup = {
        id: childId,
        name: `${sourceGroup.name} - kéo dài`,
        sceneIds: [...sourceGroup.sceneIds],
        sortIndex: sourceGroup.sortIndex + 0.5,
        totalDuration: Math.max(4, Math.min(15, extendDuration)) as ShotGroup["totalDuration"],
        videoStatus: 'idle',
        videoProgress: 0,
        videoUrl: null,
        videoMediaId: null,
        videoError: null,
        gridImageUrl: null,
        lastPrompt: null,
        mergedPrompt: description || sourceGroup.mergedPrompt || "",
        history: [],
        imageRefs: [],
        videoRefs: [],
        audioRefs: [],
        generationType: 'extend',
        extendDirection: direction,
        sourceGroupId,
        sourceVideoUrl: sourceGroup.videoUrl || undefined,
      };

      addShotGroup(childGroup);
      toast.info(`đã tạokéo dàicon组「${childGroup.name}」`);

      return generateGroupVideo(childGroup);
    },
    [activeProjectId, getProjectData, addShotGroup, generateGroupVideo]
  );

  return {
    generateGroupVideo,
    generateAllGroups,
    generateSingleShot,
    abortGeneration,
    retryGroup,
    generateChainExtension,
  };
}
