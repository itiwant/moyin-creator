// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Phân cảnh组件 (Split Scenes Component)
 * HiệnPhân cảnh切割kết quả，Hỗ trợChỉnh sửaprompt、Tải lênKhung hình cuối、ChọnThư viện nhân vật、Thêm情绪Thẻ
 */

import React, { useState, useCallback, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { 
  useDirectorStore, 
  useActiveDirectorProject,
  type SplitScene, 
  type EmotionTag,
  type ShotSizeType,
  type DurationType,
  type SoundEffectTag,
  EMOTION_PRESETS,
  SHOT_SIZE_PRESETS,
  SOUND_EFFECT_PRESETS,
} from "@/stores/director-store";
import { useCharacterLibraryStore } from "@/stores/character-library-store";
import { 
  ArrowLeft, 
  Trash2, 
  Play,
  ImageIcon,
  AlertCircle,
  Loader2,
  Sparkles,
  Clapperboard,
  Film,
  Square,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMediaStore } from "@/stores/media-store";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { generateScenePrompts } from "@/lib/storyboard/scene-prompt-generator";
import { useAPIConfigStore } from "@/stores/api-config-store";
import { parseApiKeys } from "@/lib/api-key-manager";
import { getFeatureConfig, getFeatureNotConfiguredMessage } from "@/lib/ai/feature-router";
import { submitGridImageRequest } from "@/lib/ai/image-generator";
import { uploadToImageHost, isImageHostConfigured } from "@/lib/image-host";
import { saveVideoToLocal, readImageAsBase64 } from '@/lib/image-storage';
import { persistSceneImage } from '@/lib/utils/image-persist';
import { callVideoGenerationApi, convertToHttpUrl, extractLastFrameFromVideo, isContentModerationError } from '../director/use-video-generation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { Monitor, Smartphone } from "lucide-react";
import { AngleSwitchDialog, AngleSwitchResultDialog, type AngleSwitchResult } from "@/components/angle-switch";
import { generateAngleSwitch } from "@/lib/ai/runninghub-client";
import { getAngleLabel, type HorizontalDirection, type ElevationAngle, type ShotSize } from "@/lib/ai/runninghub-angles";
import { SClassSceneCard } from "./sclass-scene-card";
import { ShotGroupCard } from "./shot-group";
import { useSClassStore, useShotGroups, type SClassAspectRatio, type ShotGroup } from "@/stores/sclass-store";
import { autoGroupScenes, generateGroupName } from "./auto-grouping";
import { useSClassGeneration, type BatchGenerationProgress } from "./use-sclass-generation";
import { ExtendEditDialog, type ExtendEditMode } from "./extend-edit-dialog";
import { runCalibration, runBatchCalibration } from "./sclass-calibrator";
import { useSceneStore } from "@/stores/scene-store";
import { Music } from "lucide-react";
import { QuadGridDialog, QuadGridResultDialog, type QuadVariationType, type QuadGridResult } from "@/components/quad-grid";
import { 
  VISUAL_STYLE_PRESETS, 
  STYLE_CATEGORIES,
  getStyleById, 
  getStylePrompt,
  getStyleNegativePrompt,
  getMediaType,
  DEFAULT_STYLE_ID 
} from "@/lib/constants/visual-styles";
import { getCinematographyProfile, DEFAULT_CINEMATOGRAPHY_PROFILE_ID } from "@/lib/constants/cinematography-profiles";
import { buildVideoPrompt, buildEmotionDescription as buildEmotionDesc } from "@/lib/generation/prompt-builder";
import { StylePicker } from "@/components/ui/style-picker";
import { CinematographyProfilePicker } from "@/components/ui/cinematography-profile-picker";

interface SplitScenesProps {
  onBack?: () => void;
  onGenerateVideos?: () => void;
}

// SceneCard Sử dụng Hạng S专属Phiên bản SClassSceneCard
const SceneCard = SClassSceneCard;

export function SClassScenes({ onBack, onGenerateVideos }: SplitScenesProps) {
  // ========== 合并Tạo（lưới 9 ô）本地 UI Trạng thái ==========
  const [imageGenMode, setImageGenMode] = useState<'single' | 'merged'>('single');
  const [frameMode, setFrameMode] = useState<'first' | 'last' | 'both'>('first');
  const [isMergedRunning, setIsMergedRunning] = useState(false);
  const [refStrategy, setRefStrategy] = useState<'cluster'|'minimal'|'none'>('cluster');
  const [useExemplar, setUseExemplar] = useState(true);
  const PAGE_CONCURRENCY = 2; // giới hạn số nhóm xử lý đồng thời mỗi trang
  // 合并TạoDừng控制
  const mergedAbortRef = useRef(false);
  // 合并Tạo控件将在 JSX đang xử lý...染，Tránh闭包tham chiếu问题
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
  const [currentGeneratingId, setCurrentGeneratingId] = useState<number | null>(null);
  // Tab Trạng thái: Phân cảnhChỉnh sửa vs Trailer
  const [activeTab, setActiveTab] = useState<"editing" | "trailer">("editing");

  // 角度切换Trạng thái
  const [angleSwitchOpen, setAngleSwitchOpen] = useState(false);
  const [angleSwitchResultOpen, setAngleSwitchResultOpen] = useState(false);
  const [angleSwitchTarget, setAngleSwitchTarget] = useState<{ sceneId: number; type: "start" | "end" } | null>(null);
  const [angleSwitchResult, setAngleSwitchResult] = useState<AngleSwitchResult | null>(null);
  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState(-1);
  const [isAngleSwitching, setIsAngleSwitching] = useState(false);
  
  // 提取videokhung cuối cùngTrạng thái
  const [isExtractingFrame, setIsExtractingFrame] = useState(false);

  // Lưới 4 ôTrạng thái
  const [quadGridOpen, setQuadGridOpen] = useState(false);
  const [quadGridResultOpen, setQuadGridResultOpen] = useState(false);
  const [quadGridTarget, setQuadGridTarget] = useState<{ sceneId: number; type: "start" | "end" } | null>(null);
  const [quadGridResult, setQuadGridResult] = useState<QuadGridResult | null>(null);
  const [isQuadGridGenerating, setIsQuadGridGenerating] = useState(false);

  // Get current project data
  const projectData = useActiveDirectorProject();
  
  // Read from project data (with defaults)
  const splitScenes = projectData?.splitScenes || [];
  const storyboardStatus = projectData?.storyboardStatus || 'idle';
  const storyboardImage = projectData?.storyboardImage || null;
  const storyboardConfig = projectData?.storyboardConfig || {
    aspectRatio: '9:16' as const,
    resolution: '2K' as const,
    videoResolution: '480p' as const,
    sceneCount: 5,
    storyPrompt: '',
  };
  const projectFolderId = projectData?.projectFolderId || null;
  // Trailerdữ liệu - Trực tiếp从 splitScenes 筛选，保证chức năng一致
  const trailerConfig = projectData?.trailerConfig || null;
  const trailerShotIds = trailerConfig?.shotIds || [];
  
  // Debug: log raw data on every render (dev only)
  if (process.env.NODE_ENV === 'development') {
    console.log('[SplitScenes] Raw data:', {
      storyboardStatus,
      splitScenesLength: splitScenes.length,
      splitScenesIds: splitScenes.map(s => s.id),
      trailerConfigStatus: trailerConfig?.status,
      trailerShotIds,
      styleTokens: storyboardConfig.styleTokens,
      aspectRatio: storyboardConfig.aspectRatio,
      sceneCount: storyboardConfig.sceneCount,
    });
  }
  
  // 筛选TrailerPhân cảnh：通过 sceneName 包含 "Trailer" quan trọng字来识别
  const trailerScenes = useMemo(() => {
    // 通过 sceneName 包含 "Trailer" 来筛选
    const filtered = splitScenes.filter(scene => {
      const sceneName = scene.sceneName || '';
      return sceneName.includes('Trailer');
    });
    console.log('[SplitScenes] Trailer filter by sceneName:', {
      totalScenes: splitScenes.length,
      filteredCount: filtered.length,
      filteredNames: filtered.map(s => s.sceneName),
    });
    return filtered;
  }, [splitScenes]);

  const {
    activeProjectId,
    setStoryboardConfig,
    // Three-tier prompt methods
    updateSplitSceneImagePrompt,
    updateSplitSceneVideoPrompt,
    updateSplitSceneEndFramePrompt,
    updateSplitSceneNeedsEndFrame,
    // Other scene update methods
    updateSplitSceneImage,
    updateSplitSceneImageStatus,
    updateSplitSceneVideo,
    updateSplitSceneEndFrame,
    updateSplitSceneEndFrameStatus,
    updateSplitSceneCharacters,
    updateSplitSceneCharacterVariationMap,
    updateSplitSceneEmotions,
    updateSplitSceneShotSize,
    updateSplitSceneDuration,
    updateSplitSceneAmbientSound,
    updateSplitSceneSoundEffects,
    // Thư viện cảnh关联更新方法
    updateSplitSceneReference,
    updateSplitSceneEndFrameReference,
    // 通用trường更新方法（用于双击Chỉnh sửa）
    updateSplitSceneField,
    // Chuyển góc nhìn历史
    addAngleSwitchHistory,
    deleteSplitScene,
    resetStoryboard,
    // Trailerchức năng
    clearTrailer,
    // Phong cách quay phim档案
    setCinematographyProfileId,
  } = useDirectorStore();
  const mediaProjectId = activeProjectId || undefined;

  // ========== Hạng SnhómTrạng thái ==========
  const {
    generationMode: sclassGenMode,
    setGenerationMode: setSclassGenMode,
    setShotGroups,
    setHasAutoGrouped,
    setLastGridImage,
  } = useSClassStore();
  const shotGroups = useShotGroups();
  const sclassProjectData = useSClassStore((s) => {
    if (!s.activeProjectId) return null;
    return s.projects[s.activeProjectId] || null;
  });
  const hasAutoGrouped = sclassProjectData?.hasAutoGrouped || false;
  const { updateShotGroup } = useSClassStore();

  // Hạng S Seedance 2.0 Tạo hook
  const {
    generateGroupVideo,
    generateAllGroups,
    generateSingleShot,
    abortGeneration: abortSClassGeneration,
    retryGroup,
    generateChainExtension,
  } = useSClassGeneration();
  const [batchProgress, setBatchProgress] = useState<BatchGenerationProgress | null>(null);

  // kéo dài/Chỉnh sửaChat框Trạng thái
  const [extendEditOpen, setExtendEditOpen] = useState(false);
  const [extendEditMode, setExtendEditMode] = useState<ExtendEditMode>('extend');
  const [extendEditSourceGroup, setExtendEditSourceGroup] = useState<ShotGroup | null>(null);

  // 场普库
  const sceneLibrary = useSceneStore((s) => s.scenes);
  const allCharacters = useCharacterLibraryStore((s) => s.characters);

  // Tự độngnhóm：首次全量nhóm + 后续增量nhóm（Cột phải新增Phân cảnhTự động追加到组）
  React.useEffect(() => {
    if (splitScenes.length === 0) return;

    if (!hasAutoGrouped) {
      // 首次：对Tất cảPhân cảnh执 hàngTự độngnhóm
      const groups = autoGroupScenes(splitScenes);
      const named = groups.map((g, idx) => ({
        ...g,
        name: generateGroupName(g, splitScenes, idx),
      }));
      setShotGroups(named);
      setHasAutoGrouped(true);
      console.log('[SClassScenes] Auto-grouped:', named.length, 'groups from', splitScenes.length, 'scenes');
      return;
    }

    // 已nhóm后：检测新增的未分配Phân cảnh，增量追加nhóm
    const assignedIds = new Set(shotGroups.flatMap(g => g.sceneIds));
    const unassigned = splitScenes.filter(s => !assignedIds.has(s.id));
    if (unassigned.length > 0) {
      const newGroups = autoGroupScenes(unassigned);
      const existingCount = shotGroups.length;
      const namedNew = newGroups.map((g, idx) => ({
        ...g,
        name: generateGroupName(g, unassigned, existingCount + idx),
      }));
      setShotGroups([...shotGroups, ...namedNew]);
      console.log('[SClassScenes] Incremental grouping:', newGroups.length, 'new groups for', unassigned.length, 'new scenes');
    }
  }, [splitScenes, hasAutoGrouped, shotGroups, setShotGroups, setHasAutoGrouped]);


  // 构建 sceneId -> SplitScene nhanh查找表
  const sceneMap = useMemo(() => new Map(splitScenes.map(s => [s.id, s])), [splitScenes]);

  // Get current style from config
  // 优先Sử dụngTrực tiếp存储的 visualStyleId，回退到 styleTokens 反推（tương thích旧项目）
  const currentStyleId = useMemo(() => {
    if (storyboardConfig.visualStyleId) {
      return storyboardConfig.visualStyleId;
    }
    // về sautương thích：将 styleTokens 合并后Khớp prompt 前缀
    if (storyboardConfig.styleTokens && storyboardConfig.styleTokens.length > 0) {
      const joinedTokens = storyboardConfig.styleTokens.join(', ');
      const found = VISUAL_STYLE_PRESETS.find(s => s.prompt.startsWith(joinedTokens));
      return found?.id || DEFAULT_STYLE_ID;
    }
    return DEFAULT_STYLE_ID;
  }, [storyboardConfig.visualStyleId, storyboardConfig.styleTokens]);

  // 读取当前Phong cách quay phim档案（未Cài đặt时Sử dụngMặc địnhCổ điển电影Phong cách quay phim）
  const currentCinProfileId = projectData?.cinematographyProfileId || DEFAULT_CINEMATOGRAPHY_PROFILE_ID;

  // 切换Phong cách quay phim档案
  const handleCinProfileChange = useCallback((profileId: string) => {
    setCinematographyProfileId(profileId || undefined);
    toast.success('Phong cách quay phim đã được cập nhật');
  }, [setCinematographyProfileId]);

  // Update style
  const handleStyleChange = useCallback((styleId: string) => {
    const style = getStyleById(styleId);
    if (style) {
      // Trực tiếp存储Phong cách ID，同时保留 styleTokens（đầy đủ prompt）tương thích旧逻辑
      setStoryboardConfig({ visualStyleId: styleId, styleTokens: [style.prompt] });
      toast.success(`Đã chuyển sang phong cách ${style.name}`);
    }
  }, [setStoryboardConfig]);

  // Update aspect ratio (Hạng S: 6 种Tỉ lệ khung hình比)
  const SCLASS_ASPECT_RATIOS: { value: SClassAspectRatio; label: string; icon?: string }[] = [
    { value: '16:9', label: 'Ngang 16:9' },
    { value: '9:16', label: 'Dọc 9:16' },
    { value: '4:3', label: 'Cổ điển 4:3' },
    { value: '3:4', label: 'Chân dung 3:4' },
    { value: '21:9', label: 'Rộng 21:9' },
    { value: '1:1', label: 'Vuông 1:1' },
  ];

  const handleAspectRatioChange = useCallback((ratio: SClassAspectRatio) => {
    setStoryboardConfig({ aspectRatio: ratio as '16:9' | '9:16' });
    toast.success(`Tỷ lệ khung hình đã chuyển sang ${ratio}`);
  }, [setStoryboardConfig]);

  const { getApiKey, getProviderByPlatform, concurrency } = useAPIConfigStore();
  const { addMediaFromUrl, getOrCreateCategoryFolder } = useMediaStore();
  
  // Get system category folder IDs for auto-saving (images → Ảnh AI, videos → Video AI)
  const getImageFolderId = useCallback(() => getOrCreateCategoryFolder('ai-image'), [getOrCreateCategoryFolder]);
  const getVideoFolderId = useCallback(() => getOrCreateCategoryFolder('ai-video'), [getOrCreateCategoryFolder]);

  // Auto-save video to media library and return mediaId
  const autoSaveVideoToLibrary = useCallback((sceneId: number, videoUrl: string, thumbnailUrl?: string, duration?: number): string => {
    const folderId = getVideoFolderId();
    
    const mediaId = addMediaFromUrl({
      url: videoUrl,
      name: `Phân cảnh ${sceneId + 1} - Video AI`,
      type: 'video',
      source: 'ai-video',
      thumbnailUrl,
      duration: duration || 5,
      folderId,
      projectId: mediaProjectId,
    });
    
    console.log('[SplitScenes] Auto-saved video to Video AI folder:', mediaId);
    return mediaId;
  }, [addMediaFromUrl, getVideoFolderId, mediaProjectId]);

  // Auto-save image to media library
  const autoSaveImageToLibrary = useCallback((sceneId: number, imageUrl: string): string => {
    const folderId = getImageFolderId();
    
    const mediaId = addMediaFromUrl({
      url: imageUrl,
      name: `Phân cảnh ${sceneId + 1} - Ảnh AI`,
      type: 'image',
      source: 'ai-image',
      folderId,
      projectId: mediaProjectId,
    });
    
    console.log('[SplitScenes] Auto-saved image to Ảnh AI folder:', mediaId);
    return mediaId;
  }, [addMediaFromUrl, getImageFolderId, mediaProjectId]);

  // Handle update end frame
  const handleUpdateEndFrame = useCallback((sceneId: number, imageUrl: string | null) => {
    updateSplitSceneEndFrame(sceneId, imageUrl);
  }, [updateSplitSceneEndFrame]);

  // Handle update characters
  const handleUpdateCharacters = useCallback((sceneId: number, characterIds: string[]) => {
    updateSplitSceneCharacters(sceneId, characterIds);
    const currentScene = splitScenes.find((s) => s.id === sceneId);
    const currentMap = currentScene?.characterVariationMap;
    if (!currentMap) return;

    const selectedSet = new Set(characterIds);
    const prunedMap: Record<string, string> = {};
    Object.entries(currentMap).forEach(([charId, variationId]) => {
      if (selectedSet.has(charId) && variationId) {
        prunedMap[charId] = variationId;
      }
    });

    const hasChanged =
      Object.keys(prunedMap).length !== Object.keys(currentMap).length ||
      Object.entries(prunedMap).some(([charId, variationId]) => currentMap[charId] !== variationId);
    if (hasChanged) {
      updateSplitSceneCharacterVariationMap(sceneId, prunedMap);
    }
  }, [splitScenes, updateSplitSceneCharacters, updateSplitSceneCharacterVariationMap]);

  const handleUpdateCharacterVariationMap = useCallback((sceneId: number, characterVariationMap: Record<string, string>) => {
    updateSplitSceneCharacterVariationMap(sceneId, characterVariationMap);
  }, [updateSplitSceneCharacterVariationMap]);

  // Handle update emotions
  const handleUpdateEmotions = useCallback((sceneId: number, emotionTags: EmotionTag[]) => {
    updateSplitSceneEmotions(sceneId, emotionTags);
  }, [updateSplitSceneEmotions]);

  // Handle update shot size
  const handleUpdateShotSize = useCallback((sceneId: number, shotSize: ShotSizeType | null) => {
    updateSplitSceneShotSize(sceneId, shotSize);
  }, [updateSplitSceneShotSize]);

  // Handle update duration
  const handleUpdateDuration = useCallback((sceneId: number, duration: DurationType) => {
    updateSplitSceneDuration(sceneId, duration);
  }, [updateSplitSceneDuration]);

  // Handle update ambient sound
  const handleUpdateAmbientSound = useCallback((sceneId: number, ambientSound: string) => {
    updateSplitSceneAmbientSound(sceneId, ambientSound);
  }, [updateSplitSceneAmbientSound]);

  // Handle update sound effects
  const handleUpdateSoundEffects = useCallback((sceneId: number, soundEffects: SoundEffectTag[]) => {
    updateSplitSceneSoundEffects(sceneId, soundEffects);
  }, [updateSplitSceneSoundEffects]);

  // Handle delete scene
  const handleDeleteScene = useCallback((sceneId: number) => {
    deleteSplitScene(sceneId);
    toast.success(`Phân cảnh ${sceneId} đã bị xóa`);
  }, [deleteSplitScene]);

  // Handle remove first frame image
  const handleRemoveImage = useCallback((sceneId: number) => {
    // Reset image to empty and clear status
    updateSplitSceneImage(sceneId, '', undefined, undefined, undefined);
    updateSplitSceneImageStatus(sceneId, {
      imageStatus: 'idle',
      imageProgress: 0,
      imageError: null,
    });
  }, [updateSplitSceneImage, updateSplitSceneImageStatus]);

  // Handle upload first frame image
  const handleUploadImage = useCallback(async (sceneId: number, imageDataUrl: string) => {
    const { localPath, httpUrl } = await persistSceneImage(imageDataUrl, sceneId, 'first');
    updateSplitSceneImage(sceneId, localPath, undefined, undefined, httpUrl || undefined);
  }, [updateSplitSceneImage]);

  // Handle go back
  const handleBack = useCallback(() => {
    resetStoryboard();
    onBack?.();
  }, [resetStoryboard, onBack]);

  // Handle extract video last frame -> insert to next scene's first frame
  const handleExtractVideoLastFrame = useCallback(async (sceneId: number) => {
    const sceneIndex = splitScenes.findIndex(s => s.id === sceneId);
    const scene = splitScenes[sceneIndex];
    if (!scene || !scene.videoUrl) {
      toast.error('Vui lòng tạo video trước');
      return;
    }

    // 检查是否有下一Phân cảnh
    const nextScene = splitScenes[sceneIndex + 1];
    if (!nextScene) {
      toast.error('Đây là phân cảnh cuối cùng, không thể chèn vào phân cảnh tiếp theo');
      return;
    }

    setIsExtractingFrame(true);
    
    try {
      // 提取khung cuối cùng
      const lastFrameBase64 = await extractLastFrameFromVideo(scene.videoUrl, 0.1);
      if (!lastFrameBase64) {
        toast.error('Trích xuất khung hình thất bại');
        return;
      }
      
      // 持久化到本地 + Lưu trữ ảnh
      const persistResult = await persistSceneImage(lastFrameBase64, nextScene.id, 'first');
      
      // 插入到下一Phân cảnh的Khung hình đầu
      updateSplitSceneImage(nextScene.id, persistResult.localPath, nextScene.width, nextScene.height, persistResult.httpUrl || undefined);
      toast.success(`Khung hình cuối phân cảnh ${sceneId + 1} đã chèn vào khung hình đầu phân cảnh ${nextScene.id + 1}`);
      
    } catch (e) {
      console.error('[SplitScenes] Extract last frame error:', e);
      toast.error('Trích xuất khung hình thất bại');
    } finally {
      setIsExtractingFrame(false);
    }
  }, [splitScenes, updateSplitSceneImage]);

  // ========== Dừng tạo处理函数 ==========
  // DừngKhung hình đầuTạo ảnh
  const handleStopImageGeneration = useCallback((sceneId: number) => {
    updateSplitSceneImageStatus(sceneId, {
      imageStatus: 'idle',
      imageProgress: 0,
      imageError: 'Người dùng đã hủy',
    });
    setIsGenerating(false);
    setCurrentGeneratingId(null);
    toast.info(`Phân cảnh ${sceneId + 1} Tạo khung hình đầu đã dừng`);
  }, [updateSplitSceneImageStatus]);

  // DừngTạo video
  const handleStopVideoGeneration = useCallback((sceneId: number) => {
    updateSplitSceneVideo(sceneId, {
      videoStatus: 'idle',
      videoProgress: 0,
      videoError: 'Người dùng đã hủy',
    });
    setIsGenerating(false);
    setCurrentGeneratingId(null);
    toast.info(`Phân cảnh ${sceneId + 1} Tạo video đã dừng`);
  }, [updateSplitSceneVideo]);

  // DừngKhung hình cuốiTạo ảnh
  const handleStopEndFrameGeneration = useCallback((sceneId: number) => {
    updateSplitSceneEndFrameStatus(sceneId, {
      endFrameStatus: 'idle',
      endFrameProgress: 0,
      endFrameError: 'Người dùng đã hủy',
    });
    setIsGenerating(false);
    toast.info(`Phân cảnh ${sceneId + 1} Tạo khung hình cuối đã dừng`);
  }, [updateSplitSceneEndFrameStatus]);

  // Dừng合并Tạo
  const handleStopMergedGeneration = useCallback(() => {
    mergedAbortRef.current = true;
    setIsMergedRunning(false);
    toast.info('Tạo gộp đã dừng');
  }, []);

  // Handle angle switch click
  const handleAngleSwitchClick = useCallback((sceneId: number, type: "start" | "end") => {
    const scene = splitScenes.find(s => s.id === sceneId);
    if (!scene) return;

    const imageUrl = type === "start" 
      ? (scene.imageDataUrl || scene.imageHttpUrl) 
      : (scene.endFrameImageUrl || scene.endFrameHttpUrl);
    if (!imageUrl) {
      toast.error(`Vui lòng tạo trước${type === "start" ? "Khung hình đầu" : "Khung hình cuối"}`);
      return;
    }

    // Đặt lạiđã chọnchỉ mục（历史从 store đang xử lý...
    setSelectedHistoryIndex(-1);
    setAngleSwitchTarget({ sceneId, type });
    setAngleSwitchOpen(true);
  }, [splitScenes]);

  // Handle angle switch generation
  const handleAngleSwitchGenerate = useCallback(async (params: {
    direction: HorizontalDirection;
    elevation: ElevationAngle;
    shotSize: ShotSize;
    applyToSameScene: boolean;
    applyToAll: boolean;
  }) => {
    if (!angleSwitchTarget) return;
    const { direction, elevation, shotSize } = params;

    // Get RunningHub provider config
    const runninghubProvider = getProviderByPlatform('runninghub');
    const runninghubKey = parseApiKeys(runninghubProvider?.apiKey || '')[0];
    const runninghubBaseUrl = runninghubProvider?.baseUrl?.trim();
    const runninghubAppId = runninghubProvider?.model?.[0];
    if (!runninghubKey || !runninghubBaseUrl || !runninghubAppId) {
      toast.error("Vui lòng cấu hình RunningHub (API Key / Base URL / Model AppId) trong Cài đặt trước");
      setAngleSwitchOpen(false);
      return;
    }

    const scene = splitScenes.find(s => s.id === angleSwitchTarget.sceneId);
    if (!scene) return;

    const originalImage = angleSwitchTarget.type === "start" 
      ? (scene.imageDataUrl || scene.imageHttpUrl) 
      : (scene.endFrameImageUrl || scene.endFrameHttpUrl);
    if (!originalImage) {
      toast.error("Không tìm thấy ảnh gốc");
      return;
    }

    setIsAngleSwitching(true);

    try {
      const newImageUrl = await generateAngleSwitch({
        referenceImage: originalImage,
        direction,
        elevation,
        shotSize,
        apiKey: runninghubKey,
        baseUrl: runninghubBaseUrl,
        appId: runninghubAppId,
        onProgress: (progress, status) => {
          console.log(`[AngleSwitch] Progress: ${progress}%, Status: ${status}`);
        },
      });

      const angleLabel = getAngleLabel(direction, elevation, shotSize);

      // Save to store history
      const newHistoryItem = {
        imageUrl: newImageUrl,
        angleLabel,
        timestamp: Date.now(),
      };
      addAngleSwitchHistory(angleSwitchTarget.sceneId, angleSwitchTarget.type, newHistoryItem);

      // 获取更新后的历史（从 scene đang xử lý...
      const updatedScene = splitScenes.find(s => s.id === angleSwitchTarget.sceneId);
      const history = angleSwitchTarget.type === "start" 
        ? (updatedScene?.startFrameAngleSwitchHistory || [])
        : (updatedScene?.endFrameAngleSwitchHistory || []);
      setSelectedHistoryIndex(history.length - 1); // đã chọn mới nhất

      setAngleSwitchResult({
        originalImage,
        newImage: newImageUrl,
        angleLabel,
      });

      setAngleSwitchOpen(false);
      setAngleSwitchResultOpen(true);

      toast.success("Tạo chuyển góc nhìn hoàn tất");
    } catch (error) {
      toast.error(`Chuyển góc nhìnThất bại: ${(error as Error).message}`);
    } finally {
      setIsAngleSwitching(false);
    }
  }, [angleSwitchTarget, splitScenes, getProviderByPlatform, addAngleSwitchHistory]);

  // 根据情绪ThẻTạoBầu không khíMô tả - Sử dụng统一 prompt-builder 模块
  const buildEmotionDescription = useCallback((emotionTags: EmotionTag[]): string => {
    return buildEmotionDesc(emotionTags);
  }, []);

  // thu thậpNhân vậtẢnh tham chiếu - 必须在 handleQuadGridGenerate 之前定义
  const getCharacterReferenceImages = useCallback((
    characterIds: string[],
    variationMap?: Record<string, string>,
  ): string[] => {
    const { characters } = useCharacterLibraryStore.getState();
    const refs: string[] = [];
    const seen = new Set<string>();
    const MAX_REFS = 14;

    const pushRef = (value?: string) => {
      if (!value || seen.has(value)) return;
      seen.add(value);
      refs.push(value);
    };

    for (const charId of characterIds) {
      const char = characters.find((c) => c.id === charId);
      if (!char) continue;

      const variationId = variationMap?.[charId];
      const selectedVariation = variationId
        ? char.variations?.find((v) => v.id === variationId)
        : undefined;

      pushRef(selectedVariation?.referenceImage);

      for (const view of char.views || []) {
        pushRef(view.imageBase64 || view.imageUrl);
        if (refs.length >= MAX_REFS) return refs;
      }

      for (const image of char.referenceImages || []) {
        pushRef(image);
        if (refs.length >= MAX_REFS) return refs;
      }

      for (const image of selectedVariation?.clothingReferenceImages || []) {
        pushRef(image);
        if (refs.length >= MAX_REFS) return refs;
      }
    }

    return refs.slice(0, MAX_REFS);
  }, []);
  // Handle quad grid click
  const handleQuadGridClick = useCallback((sceneId: number, type: "start" | "end") => {
    const scene = splitScenes.find(s => s.id === sceneId);
    if (!scene) return;

    const imageUrl = type === "start"
      ? (scene.imageDataUrl || scene.imageHttpUrl)
      : (scene.endFrameImageUrl || scene.endFrameHttpUrl);
    if (!imageUrl) {
      toast.error(`Vui lòng tạo trước${type === "start" ? "Khung hình đầu" : "Khung hình cuối"}`);
      return;
    }

    setQuadGridTarget({ sceneId, type });
    setQuadGridOpen(true);
  }, [splitScenes]);

  // Handle quad grid generation
  const handleQuadGridGenerate = useCallback(async (variationType: QuadVariationType, useCharacterRef: boolean = false) => {
    if (!quadGridTarget) return;

    const scene = splitScenes.find(s => s.id === quadGridTarget.sceneId);
    if (!scene) return;

    const sourceImage = quadGridTarget.type === "start" 
      ? (scene.imageDataUrl || scene.imageHttpUrl) 
      : (scene.endFrameImageUrl || scene.endFrameHttpUrl);
    if (!sourceImage) {
      toast.error("Không tìm thấy ảnh gốc");
      return;
    }

    // Get API key - Sử dụngánh xạ dịch vụ配置
    const featureConfig = getFeatureConfig('character_generation');
    if (!featureConfig) {
      toast.error('Vui lòng cấu hình API Tạo ảnh trong Cài đặt trước');
      setQuadGridOpen(false);
      return;
    }
    
    const keyManager = featureConfig.keyManager;
    const apiKey = keyManager.getCurrentKey() || '';
    if (!apiKey) {
      toast.error('Vui lòng cấu hình ánh xạ dịch vụ Tạo ảnh trong Cài đặt');
      setQuadGridOpen(false);
      return;
    }
    const platform = featureConfig.platform;
    const model = featureConfig.models?.[0];
    if (!model) {
      toast.error('Vui lòng chọn Model Tạo ảnh trong Cài đặt');
      setQuadGridOpen(false);
      return;
    }
    const imageBaseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
    if (!imageBaseUrl) {
      toast.error('Vui lòng cấu hình ánh xạ dịch vụ Tạo ảnh trong Cài đặt');
      setQuadGridOpen(false);
      return;
    }
    
    console.log('[QuadGrid] Using image config:', { platform, model, imageBaseUrl });

    setIsQuadGridGenerating(true);
    // 不在这里ĐóngChat框，保持MởHiệnTiến độ
    // setQuadGridOpen(false) 移到Tạo thành công后

    try {
      // Build variation labels based on type
      const variationLabels = variationType === 'angle'
        ? ['Chính diện lệch trái', 'Chính diện lệch phải', 'Cận cảnh bên', 'Toàn cảnh từ trên']
        : variationType === 'composition'
          ? ['Toàn thân xa', 'Nửa thân trung cảnh', 'Cận cảnh khuôn mặt', 'Giới thiệu môi trường']
          : ['Bắt đầu hành động', 'Quá trình hành động', 'Cao trào hành động', 'Kết thúc hành động'];

      const variationPrompts = variationType === 'angle'
        ? ['slight left angle view', 'slight right angle view', 'side profile close-up', 'wide aerial overview']
        : variationType === 'composition'
          ? ['full body wide shot', 'medium shot waist up', 'close-up face', 'establishing shot with environment']
          : ['action beginning', 'action in progress', 'action climax', 'action ending'];

      // Build base prompt from scene
      const basePrompt = scene.imagePromptZh?.trim() || scene.imagePrompt?.trim() || scene.videoPromptZh?.trim() || scene.videoPrompt?.trim() || '';
      const styleTokens = storyboardConfig.styleTokens || [];
      const aspect = storyboardConfig.aspectRatio || '9:16';

      // === nhân vật数量约束 ===
      const charCount = scene.characterIds?.length || 0;
      let charCountPhrase = '';
      
      if (!useCharacterRef) {
        // 方案A (Mặc định): 信任Ảnh gốc，xóa干扰
        charCountPhrase = 'Keep the EXACT same number of characters and their positions as the reference image. Do NOT add or remove characters. Maintain the original character composition.';
      } else {
        // 方案B (勾选): Sử dụngThư viện nhân vậtTham chiếu，保留硬性人数限制
        charCountPhrase = charCount === 0 
          ? 'NO human figures in any panel, empty scene or environment only.' 
          : charCount === 1 
            ? 'EXACTLY ONE person in each panel, single character only, do NOT duplicate the character.'
            : `EXACTLY ${charCount} distinct people in each panel, no more no less, each person appears only ONCE.`;
      }

      // === Dọcbố cục约束（与lưới 9 ô一致） ===
      const verticalConstraint = aspect === '9:16' ? 'vertical composition, tighter framing, avoid letterboxing, ' : '';

      // === Hành độngMô tả（对时刻biến thể重要） ===
      const actionDesc = scene.actionSummary?.trim() || '';
      const actionContext = (variationType === 'moment' && actionDesc) 
        ? `Action sequence context: ${actionDesc}. ` 
        : '';

      // === 情绪Bầu không khí（保持一致性） ===
      const emotionDesc = buildEmotionDescription(scene.emotionTags || []);
      const moodContext = emotionDesc ? `Mood across all panels: ${emotionDesc} ` : '';

      // === Cảnh上下文 ===
      const sceneContext = [scene.sceneName, scene.sceneLocation].filter(Boolean).join(' - ');
      const settingContext = sceneContext ? `Setting: ${sceneContext}. ` : '';

      // === Phong cách键字组 ===
      const styleStr = styleTokens.length > 0 ? `Artistic style consistent: ${styleTokens.join(', ')}. ` : '';

      // Build 2x2 grid prompt
      const gridPromptParts: string[] = [];
      gridPromptParts.push('Generate a 2x2 grid image with 4 panels, each panel separated by thin white lines.');
      gridPromptParts.push('Layout: 2 rows, 2 columns, reading order left-to-right, top-to-bottom.');
      
      // 每panel的Mô tả（包含nhân vật数量约束）
      variationPrompts.forEach((v, idx) => {
        const row = Math.floor(idx / 2) + 1;
        const col = (idx % 2) + 1;
        gridPromptParts.push(`Panel [row ${row}, col ${col}]: ${verticalConstraint}${charCountPhrase} ${basePrompt}, ${v}`);
      });
      
      // 全局约束
      if (settingContext) gridPromptParts.push(settingContext);
      if (actionContext) gridPromptParts.push(actionContext);
      if (moodContext) gridPromptParts.push(moodContext);
      if (styleStr) gridPromptParts.push(styleStr);
      
      // === 一致性键字组（与 buildAnchorPhrase 一致） ===
      gridPromptParts.push('Keep character appearance, wardrobe and facial features consistent across all 4 panels.');
      gridPromptParts.push('Keep lighting and color grading consistent across all 4 panels.');
      gridPromptParts.push('IMPORTANT: NO TEXT, NO WORDS, NO LETTERS, NO CAPTIONS, NO SPEECH BUBBLES, NO DIALOGUE BOXES, NO SUBTITLES, NO WRITING of any kind in any panel.');

      const gridPrompt = gridPromptParts.join(' ');
      console.log('[QuadGrid] Grid prompt:', gridPrompt.substring(0, 200) + '...');

      // Collect reference images
      const refs: string[] = [sourceImage];
      // 只有在勾选了"Tham chiếuThư viện nhân vật形象"时，才ThêmNhân vậtẢnh tham chiếu
      if (useCharacterRef && scene.characterIds?.length) {
        refs.push(...getCharacterReferenceImages(scene.characterIds, scene.characterVariationMap));
      }
      if (scene.sceneReferenceImage) {
        refs.push(scene.sceneReferenceImage);
      }

      // Process refs for API
      const processedRefs: string[] = [];
      for (const url of refs.slice(0, 14)) {
        if (!url) continue;
        if (url.startsWith('http://') || url.startsWith('https://')) {
          processedRefs.push(url);
        } else if (url.startsWith('data:image/') && url.includes(';base64,')) {
          processedRefs.push(url);
        } else if (url.startsWith('local-image://')) {
          try {
            const base64 = await readImageAsBase64(url);
            if (base64) processedRefs.push(base64);
          } catch (e) {
            console.warn('[QuadGrid] Failed to read local image:', url);
          }
        }
      }

      // Parse result helper（用于luân phiên阶段）
      const normalizeUrl = (url: any): string | undefined => {
        if (!url) return undefined;
        if (Array.isArray(url)) return url[0] || undefined;
        if (typeof url === 'string') return url;
        return undefined;
      };

      // gọi API API - Sử dụngthông minh路由（Tự độngChọn chat completions 或 images/generations）
      console.log('[QuadGrid] Calling API, model:', model);
      const apiResult = await submitGridImageRequest({
        model,
        prompt: gridPrompt,
        apiKey,
        baseUrl: imageBaseUrl,
        aspectRatio: aspect,
        resolution: storyboardConfig.resolution || '2K',
        referenceImages: processedRefs.length > 0 ? processedRefs : undefined,
        keyManager,
      });

      let gridImageUrl = apiResult.imageUrl;
      let taskId = apiResult.taskId;

      // Poll if async
      if (!gridImageUrl && taskId) {
        console.log('[QuadGrid] Polling task:', taskId);
        const pollInterval = 2000;
        const maxAttempts = 60;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const statusUrl = new URL(`${imageBaseUrl}/v1/tasks/${taskId}`);
          statusUrl.searchParams.set('_ts', Date.now().toString());
          
          const statusResp = await fetch(statusUrl.toString(), {
            headers: { 'Authorization': `Bearer ${apiKey}` },
          });
          
          if (!statusResp.ok) throw new Error(`Truy vấn nhiệm vụ thất bại: ${statusResp.status}`);
          
          const statusData = await statusResp.json();
          const status = (statusData.status ?? statusData.data?.status ?? '').toString().toLowerCase();
          
          if (status === 'completed' || status === 'succeeded' || status === 'success') {
            const images = statusData.result?.images ?? statusData.data?.result?.images;
            if (images?.[0]) {
              gridImageUrl = normalizeUrl(images[0].url || images[0]);
            }
            gridImageUrl = gridImageUrl || normalizeUrl(statusData.output_url) || normalizeUrl(statusData.url);
            break;
          }
          
          if (status === 'failed' || status === 'error') {
            throw new Error(statusData.error || 'Tạo ảnh thất bại');
          }
          
          await new Promise(r => setTimeout(r, pollInterval));
        }
      }

      if (!gridImageUrl) {
        throw new Error('Không lấy được URL ảnh lưới 4 ô');
      }

      console.log('[QuadGrid] Grid image URL:', gridImageUrl.substring(0, 80));

      // Slice 2x2 grid into 4 images
      const slicedImages = await new Promise<string[]>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const tileW = Math.floor(img.width / 2);
          const tileH = Math.floor(img.height / 2);
          const results: string[] = [];
          
          for (let i = 0; i < 4; i++) {
            const row = Math.floor(i / 2);
            const col = i % 2;
            const canvas = document.createElement('canvas');
            canvas.width = tileW;
            canvas.height = tileH;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, col * tileW, row * tileH, tileW, tileH, 0, 0, tileW, tileH);
            results.push(canvas.toDataURL('image/png'));
          }
          resolve(results);
        };
        img.onerror = () => reject(new Error('Tải ảnh lưới 4 ô thất bại'));
        img.src = gridImageUrl!;
      });

      console.log('[QuadGrid] Sliced into', slicedImages.length, 'images');

      // Set result
      setQuadGridResult({
        originalImage: sourceImage,
        images: slicedImages,
        variationType: variationType === 'angle' ? 'Biến thể góc nhìn' : variationType === 'composition' ? 'Biến thể bố cục' : 'Biến thể thời khắc',
        variationLabels,
      });
      
      // Tự độngLưuTất cảLưới 4 ôảnh到Thư viện phương tiện
      const folderId = getImageFolderId();
      const variationTypeLabel = variationType === 'angle' ? 'Biến thể góc nhìn' : variationType === 'composition' ? 'Biến thể bố cục' : 'Biến thể thời khắc';
      slicedImages.forEach((img, idx) => {
        addMediaFromUrl({
          url: img,
          name: `Lưới 4 ô-${variationTypeLabel}-${variationLabels[idx]}`,
          type: 'image',
          source: 'ai-image',
          folderId,
          projectId: mediaProjectId,
        });
      });
      
      // Tạo thành công后才ĐóngChọnChat框，Mởkết quảChat框
      setQuadGridOpen(false);
      setQuadGridResultOpen(true);
      toast.success('Tạo lưới 4 ô hoàn tất, đã tự động lưu vào thư viện phương tiện');

    } catch (error) {
      const err = error as Error;
      console.error('[QuadGrid] Failed:', err);
      toast.error(`Lưới 4 ôTạo thất bại: ${err.message}`);
    } finally {
      setIsQuadGridGenerating(false);
    }
  }, [quadGridTarget, splitScenes, storyboardConfig, getApiKey, getCharacterReferenceImages]);

  // Apply quad grid result
  const handleApplyQuadGrid = useCallback(async (imageIndex: number) => {
    if (!quadGridResult || !quadGridTarget) return;

    const imageToApply = quadGridResult.images[imageIndex];
    if (!imageToApply) return;

    const frameType = quadGridTarget.type === "start" ? 'first' as const : 'end' as const;
    const { localPath, httpUrl } = await persistSceneImage(imageToApply, quadGridTarget.sceneId, frameType);

    if (quadGridTarget.type === "start") {
      updateSplitSceneImage(quadGridTarget.sceneId, localPath, undefined, undefined, httpUrl || undefined);
    } else {
      updateSplitSceneEndFrame(quadGridTarget.sceneId, localPath, undefined, httpUrl || undefined);
    }

    setQuadGridResultOpen(false);
    setQuadGridResult(null);
    setQuadGridTarget(null);
    toast.success(`Đã áp dụng vào ${quadGridTarget.type === "start" ? "Khung hình đầu" : "Khung hình cuối"}`);
  }, [quadGridResult, quadGridTarget, updateSplitSceneImage, updateSplitSceneEndFrame]);

  // Copy quad grid image to another scene
  const handleCopyQuadGridToScene = useCallback(async (imageIndex: number, targetSceneId: number, targetFrameType: "start" | "end") => {
    if (!quadGridResult) return;

    const imageToApply = quadGridResult.images[imageIndex];
    if (!imageToApply) return;

    const frameType = targetFrameType === "start" ? 'first' as const : 'end' as const;
    const { localPath, httpUrl } = await persistSceneImage(imageToApply, targetSceneId, frameType);

    if (targetFrameType === "start") {
      updateSplitSceneImage(targetSceneId, localPath, undefined, undefined, httpUrl || undefined);
    } else {
      updateSplitSceneEndFrame(targetSceneId, localPath, undefined, httpUrl || undefined);
    }

    toast.success(`Đã sao chép vào ${targetFrameType === "start" ? "Khung hình đầu" : "Khung hình cuối"} của Phân cảnh ${targetSceneId + 1}`);
  }, [quadGridResult, updateSplitSceneImage, updateSplitSceneEndFrame]);

  // Save quad grid image to library
  const handleSaveQuadGridToLibrary = useCallback((imageIndex: number) => {
    if (!quadGridResult || !quadGridTarget) return;

    const imageToSave = quadGridResult.images[imageIndex];
    if (!imageToSave) return;

    const folderId = getImageFolderId();
    addMediaFromUrl({
      url: imageToSave,
      name: `Lưới 4 ô-${quadGridResult.variationType}-${imageIndex + 1}`,
      type: 'image',
      source: 'ai-image',
      folderId,
      projectId: mediaProjectId,
    });

    toast.success('Đã lưu vào thư viện phương tiện');
  }, [quadGridResult, quadGridTarget, getImageFolderId, addMediaFromUrl]);

  // Save all quad grid images to library
  const handleSaveAllQuadGridToLibrary = useCallback(() => {
    if (!quadGridResult) return;

    const folderId = getImageFolderId();
    quadGridResult.images.forEach((img, idx) => {
      addMediaFromUrl({
        url: img,
        name: `Lưới 4 ô-${quadGridResult.variationType}-${idx + 1}`,
        type: 'image',
        source: 'ai-image',
        folderId,
        projectId: mediaProjectId,
      });
    });

    toast.success(`Đã lưu ${quadGridResult.images.length} ảnh vào thư viện phương tiện`);
  }, [quadGridResult, getImageFolderId, addMediaFromUrl]);

  // Apply angle switch result
  const handleApplyAngleSwitch = useCallback(async () => {
    if (!angleSwitchResult || !angleSwitchTarget) return;

    // 从 store đang xử lý...史
    const scene = splitScenes.find(s => s.id === angleSwitchTarget.sceneId);
    const history = angleSwitchTarget.type === "start"
      ? (scene?.startFrameAngleSwitchHistory || [])
      : (scene?.endFrameAngleSwitchHistory || []);

    // Use selected history item if available, otherwise use current result
    const imageToApply = selectedHistoryIndex >= 0 && history[selectedHistoryIndex]
      ? history[selectedHistoryIndex].imageUrl
      : angleSwitchResult.newImage;

    const frameType = angleSwitchTarget.type === "start" ? 'first' as const : 'end' as const;
    const { localPath, httpUrl } = await persistSceneImage(imageToApply, angleSwitchTarget.sceneId, frameType);

    if (angleSwitchTarget.type === "start") {
      updateSplitSceneImage(angleSwitchTarget.sceneId, localPath, undefined, undefined, httpUrl || undefined);
    } else {
      updateSplitSceneEndFrame(angleSwitchTarget.sceneId, localPath, undefined, httpUrl || undefined);
    }

    setAngleSwitchResultOpen(false);
    setAngleSwitchResult(null);
    setAngleSwitchTarget(null);
    setSelectedHistoryIndex(-1);
    toast.success("Đã áp dụng góc nhìn");
  }, [angleSwitchResult, angleSwitchTarget, splitScenes, selectedHistoryIndex, updateSplitSceneImage, updateSplitSceneEndFrame]);

  // Handle auto-generate prompts using Gemini Vision
  const handleAutoGeneratePrompts = useCallback(async () => {
    if (!storyboardImage || splitScenes.length === 0) {
      toast.error("Không thể tạo prompt: thiếu storyboard hoặc phân cảnh");
      return;
    }

    // 尝试获取Phân tích ảnh配置（仅当部分Phân cảnh缺少văn bảnMô tả时才需要）
    const featureConfig = getFeatureConfig('image_understanding');
    const apiKey = featureConfig?.apiKey || '';
    const provider = featureConfig?.platform || '';
    const model = featureConfig?.models?.[0] || '';
    const baseUrl = featureConfig?.baseUrl?.replace(/\/+$/, '') || '';
    // Note: API config is optional - if scenes have text descriptions, no API is needed

    setIsGeneratingPrompts(true);
    toast.info("Đang tạo prompt dựa trên nội dung phân cảnh...");

    try {
      // Get story prompt from storyboard config
      const storyPrompt = storyboardConfig.storyPrompt || "videoPhân cảnh";

      const prompts = await generateScenePrompts({
        storyboardImage,
        storyPrompt,
        scenes: splitScenes.map(s => ({
          id: s.id,
          row: s.row,
          col: s.col,
          // Pass existing script data for better context
          actionSummary: s.actionSummary,
          cameraMovement: s.cameraMovement,
          dialogue: s.dialogue,
          // Additional fields for text-based generation
          sceneName: s.sceneName,
          sceneDescription: s.sceneLocation,
        })),
        apiKey,
        provider: provider as any,
        baseUrl,
        model,
      });

      // Update store with generated three-tier prompts
      let updatedCount = 0;
      let endFrameCount = 0;
      
      prompts.forEach(p => {
        if (p.videoPrompt || p.imagePrompt) {
          // Update first frame prompt (static)
          updateSplitSceneImagePrompt(p.id, p.imagePrompt, p.imagePromptZh);
          
          // Update video prompt (dynamic action)
          updateSplitSceneVideoPrompt(p.id, p.videoPrompt, p.videoPromptZh);
          
          // Update end frame settings
          updateSplitSceneNeedsEndFrame(p.id, p.needsEndFrame);
          if (p.needsEndFrame && p.endFramePrompt) {
            updateSplitSceneEndFramePrompt(p.id, p.endFramePrompt, p.endFramePromptZh);
            endFrameCount++;
          }
          
          updatedCount++;
        }
      });

      toast.success(`Đã tạo prompt thành công cho ${updatedCount} phân cảnh (${endFrameCount} cần Khung hình cuối)`);
    } catch (error) {
      const err = error as Error;
      console.error("[SplitScenes] Prompt generation failed:", err);
      toast.error(`Tạo thất bại: ${err.message}`);
    } finally {
      setIsGeneratingPrompts(false);
    }
  }, [storyboardImage, splitScenes, storyboardConfig, getApiKey, updateSplitSceneImagePrompt, updateSplitSceneVideoPrompt, updateSplitSceneEndFramePrompt, updateSplitSceneNeedsEndFrame]);

  /** @deprecated Sử dụng generateAllGroups hoặc handleGenerateSingleVideo của Hạng S thay thế */
  const handleGenerateVideos = useCallback(async () => {
    console.warn('[DEPRECATED] handleGenerateVideos đã lỗi thời, vui lòng dùng Tạo hàng loạt Hạng S');
    if (splitScenes.length === 0) {
      toast.error("Không có phân cảnh nào để Tạo");
      return;
    }

    const featureConfig = getFeatureConfig('video_generation');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('video_generation'));
      return;
    }
    const keyManager = featureConfig.keyManager;
    const apiKey = keyManager.getCurrentKey() || '';
    if (!apiKey) {
      toast.error('Vui lòng cấu hình ánh xạ dịch vụ Tạo ảnh trong Cài đặt');
      return;
    }
    const provider = featureConfig.platform;

    // Check if all scenes have prompts
    const scenesWithoutPrompts = splitScenes.filter(s => !s.videoPrompt.trim());
    if (scenesWithoutPrompts.length > 0) {
      toast.warning(`Còn ${scenesWithoutPrompts.length} phân cảnh chưa có prompt, sẽ dùng prompt mặc định`);
    }

    // Filter scenes that need generation (idle or failed)
    const scenesToGenerate = splitScenes.filter(
      s => s.videoStatus === 'idle' || s.videoStatus === 'failed'
    );

    if (scenesToGenerate.length === 0) {
      toast.info("Tất cả phân cảnh đã tạo hoặc đang tạo");
      return;
    }

    setIsGenerating(true);
    toast.info(`Bắt đầu tạo tuần tự ${scenesToGenerate.length} video... mỗi lần xử lý ${concurrency}`);

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

    // Process scenes sequentially (serial) or with limited concurrency
    for (let i = 0; i < scenesToGenerate.length; i += concurrency) {
      const batch = scenesToGenerate.slice(i, i + concurrency);
      
      await Promise.all(batch.map(async (scene) => {
        setCurrentGeneratingId(scene.id);
        
        try {
          // Update status to generating
          updateSplitSceneVideo(scene.id, {
            videoStatus: 'uploading',
            videoProgress: 0,
            videoError: null,
          });

          // Real API call - upload image first if needed
          let imageUrl = scene.imageDataUrl;
          if (scene.imageDataUrl.startsWith('data:')) {
            const response = await fetch(scene.imageDataUrl);
            const blob = await response.blob();
            const formData = new FormData();
            formData.append('file', blob, `scene-${scene.id}.png`);
            
            const uploadResponse = await fetch(`${baseUrl}/api/upload`, {
              method: 'POST',
              body: formData,
            });

            if (uploadResponse.ok) {
              const uploadData = await uploadResponse.json();
              imageUrl = uploadData.url || scene.imageDataUrl;
            }
          }

          updateSplitSceneVideo(scene.id, {
            videoStatus: 'generating',
            videoProgress: 20,
          });

          // Submit video generation
          // Sử dụng统一 prompt-builder 构建prompt（与 handleGenerateSingleVideo 保持一致）
          const cinProfile = projectData?.cinematographyProfileId
            ? getCinematographyProfile(projectData.cinematographyProfileId)
            : undefined;
          const fullPrompt = buildVideoPrompt(scene, cinProfile, {
            styleTokens: [getStylePrompt(currentStyleId)],
            aspectRatio: storyboardConfig.aspectRatio,
            mediaType: getMediaType(currentStyleId),
          });
          const videoDuration = Math.max(4, Math.min(12, scene.duration || 5));
          
          const submitResponse = await fetch(`${baseUrl}/api/ai/video`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageUrl,
              prompt: fullPrompt || scene.videoPrompt || `Phân cảnh ${scene.id + 1} hiệu ứng động`,
              aspectRatio: storyboardConfig.aspectRatio,
              duration: videoDuration,
              apiKey,
              provider,
            }),
          });

          if (!submitResponse.ok) {
            const errorData = await submitResponse.json().catch(() => ({}));
            throw new Error(errorData.error || `Video API failed: ${submitResponse.status}`);
          }

          const submitData = await submitResponse.json();

          // If direct video URL returned
          if (submitData.videoUrl && submitData.status === 'completed') {
            updateSplitSceneVideo(scene.id, {
              videoStatus: 'completed',
              videoProgress: 100,
              videoUrl: submitData.videoUrl,
            });
            toast.success(`Phân cảnh ${scene.id + 1} Tạo video hoàn tất`);
            return;
          }

          // Poll for completion
          if (submitData.taskId) {
            const pollInterval = 3000;
            const maxAttempts = 120; // 6 minutes max
            
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
              const progress = Math.min(20 + Math.floor((attempt / maxAttempts) * 80), 99);
              updateSplitSceneVideo(scene.id, { videoProgress: progress });

              const statusResponse = await fetch(
                `${baseUrl}/api/ai/task/${submitData.taskId}?apiKey=${encodeURIComponent(apiKey)}&provider=${provider}&type=video`
              );

              if (!statusResponse.ok) {
                throw new Error(`Failed to check task status: ${statusResponse.status}`);
              }

              const statusData = await statusResponse.json();
              const status = statusData.status?.toLowerCase();

              if (status === 'completed' || status === 'success') {
                const videoUrl = statusData.videoUrl || statusData.url || statusData.resultUrl;
                if (!videoUrl) throw new Error('Task completed but no video URL');
                
                updateSplitSceneVideo(scene.id, {
                  videoStatus: 'completed',
                  videoProgress: 100,
                  videoUrl,
                });
                toast.success(`Phân cảnh ${scene.id + 1} Tạo video hoàn tất`);
                return;
              }

              if (status === 'failed' || status === 'error') {
                throw new Error(statusData.error || 'Video generation failed');
              }

              await new Promise(r => setTimeout(r, pollInterval));
            }

            throw new Error('Tạo video quá thời gian chờ');
          }

          throw new Error('Invalid API response');

        } catch (error) {
          const err = error as Error;
          console.error(`[SplitScenes] Scene ${scene.id} video generation failed:`, err);
          updateSplitSceneVideo(scene.id, {
            videoStatus: 'failed',
            videoProgress: 0,
            videoError: err.message,
          });
          toast.error(`Phân cảnh ${scene.id + 1} Tạo thất bại: ${err.message}`);
        }
      }));
    }

    setIsGenerating(false);
    setCurrentGeneratingId(null);
    
    const completedCount = splitScenes.filter(s => s.videoStatus === 'completed').length;
    if (completedCount === splitScenes.length) {
      toast.success("Tất cả video đã tạo xong!");
    }
  }, [splitScenes, storyboardConfig, getApiKey, concurrency, updateSplitSceneVideo]);


  // Generate video for a single scene - directly calls API with key rotation
  const handleGenerateSingleVideo = useCallback(async (sceneId: number) => {
    const scene = splitScenes.find(s => s.id === sceneId);
    if (!scene) return;

    // Debug: Check API store state
    const apiStore = useAPIConfigStore.getState();
    console.log('[SplitScenes] API Store state:', {
      providers: apiStore.providers.length,
      apiKeys: Object.keys(apiStore.apiKeys),
      memefastKey: apiStore.apiKeys['memefast'] ? 'set' : 'not set',
      getApiKey_memefast: apiStore.getApiKey('memefast') ? 'set' : 'not set',
    });

    // Use feature router with key rotation support
    const featureConfig = getFeatureConfig('video_generation');
    console.log('[SplitScenes] Feature config for video_generation:', featureConfig ? {
      platform: featureConfig.platform,
      model: featureConfig.models?.[0],
      apiKey: featureConfig.apiKey ? `${featureConfig.apiKey.substring(0, 8)}...` : 'empty',
      providerId: featureConfig.provider?.id,
    } : 'null');
    
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('video_generation'));
      return;
    }
    
    // 从ánh xạ dịch vụ获取 platform 和 model
    const platform = featureConfig.platform;
    const model = featureConfig.models?.[0];
    if (!model) {
      toast.error('请先在Cài đặtđang xử lý...ạo videoModel');
      return;
    }
    const videoBaseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
    if (!videoBaseUrl) {
      toast.error('请先在Cài đặtđang xử lý...ạo videoánh xạ dịch vụ');
      return;
    }
    
    console.log('[SplitScenes] Using video config:', { platform, model, videoBaseUrl });
    
    // Get rotating key from manager
    const keyManager = featureConfig.keyManager;
    const apiKey = keyManager.getCurrentKey() || '';
    if (!apiKey) {
      toast.error(`Vui lòng cấu hình trước ${platform} API Key`);
      return;
    }
    
    console.log(`[SplitScenes] Using API key ${keyManager.getTotalKeyCount()} keys, current index available: ${keyManager.getAvailableKeyCount()}`);

    setIsGenerating(true);
    setCurrentGeneratingId(sceneId);

    try {
      // Reset and start
      updateSplitSceneVideo(sceneId, {
        videoStatus: 'uploading',
        videoProgress: 0,
        videoError: null,
        videoUrl: null,
      });

      // Khung hình đầuảnhChọn逻辑：
      // 1. 优先Sử dụng imageDataUrl（người dùng最新Chọn/Tải lên的ảnh）
      // 2. 只有当 imageSource === 'ai-generated' 且 imageHttpUrl 是有效 URL 时才Sử dụng imageHttpUrl
      // 3. 否则Sử dụng imageDataUrl 并通过Lưu trữ ảnhTải lên转换为 HTTP URL
      // quan trọng：合并Tạo的ảnh没有 imageHttpUrl（被清除为 null），必须重新Tải lên
      let firstFrameUrl = scene.imageDataUrl;
      
      // 检查 imageHttpUrl 是否是有效的 HTTP URL（非 null、非 undefined、非空ký tự串）
      const hasValidHttpUrl = scene.imageHttpUrl && 
                              typeof scene.imageHttpUrl === 'string' && 
                              scene.imageHttpUrl.startsWith('http');
      
      // 如果 imageDataUrl 不是 HTTP URL，检查是否有对应的 imageHttpUrl
      if (firstFrameUrl && !firstFrameUrl.startsWith('http://') && !firstFrameUrl.startsWith('https://')) {
        // imageDataUrl 是本地格式（base64 或 local-image://）
        if (hasValidHttpUrl && scene.imageSource === 'ai-generated') {
          // 只有当 imageSource 明确标记为 'ai-generated' 且有有效的 HTTP URL 时才Sử dụng
          // 这意味着这是单张 AI Tạo的ảnh，不是合并Tạo切割的ảnh
          console.log('[SplitScenes] Using imageHttpUrl for AI-generated image:', scene.imageHttpUrl!.substring(0, 60));
          firstFrameUrl = scene.imageHttpUrl!;
        } else {
          // 否则Sử dụng imageDataUrl（合并Tạo切割的ảnh、Thư viện phương tiệnChọn的ảnh等）
          // 将通过Lưu trữ ảnhTải lên转换为 HTTP URL
          console.log('[SplitScenes] Using imageDataUrl (will upload to image host):', 
            hasValidHttpUrl ? 'has old httpUrl but imageSource=' + scene.imageSource : 'no valid httpUrl');
        }
      }
      
      if (!firstFrameUrl) {
        toast.error(`Phân cảnh ${sceneId + 1} 没有Khung hình đầuảnh，Vui lòng tạo ảnh trước`);
        setIsGenerating(false);
        setCurrentGeneratingId(null);
        return;
      }
      console.log('[SplitScenes] First frame source:', firstFrameUrl.startsWith('http') ? 'HTTP URL' : 'local/base64');
      
      // 仅当 needsEndFrame 为 true 时才Sử dụngKhung hình cuối
      // 如果người dùngđã xóaKhung hình cuối或Đóng了Khung hình cuối开关，则不Sử dụngKhung hình cuối作为Tạo video的Tham chiếu
      let lastFrameUrl: string | null | undefined = null;
      if (scene.needsEndFrame && scene.endFrameImageUrl) {
        // 优先Sử dụng endFrameHttpUrl（gốc HTTP URL）
        // 如果没有，尝试Sử dụng endFrameImageUrl（可能需要Tải lênLưu trữ ảnh）
        lastFrameUrl = scene.endFrameHttpUrl || scene.endFrameImageUrl;
        console.log('[SplitScenes] Using end frame for video generation');
      } else {
        console.log('[SplitScenes] Skipping end frame: needsEndFrame=', scene.needsEndFrame, 'hasEndFrame=', !!scene.endFrameImageUrl);
      }

      // Collect character reference images
      const characterRefs = scene.characterIds?.length 
        ? getCharacterReferenceImages(scene.characterIds, scene.characterVariationMap)
        : [];

      updateSplitSceneVideo(sceneId, {
        videoStatus: 'generating',
        videoProgress: 20,
      });

      // ========== 构建videoprompt（Sử dụng统一 prompt-builder 模块） ==========
      const cinProfile = projectData?.cinematographyProfileId
        ? getCinematographyProfile(projectData.cinematographyProfileId)
        : undefined;
      
      const fullPrompt = buildVideoPrompt(scene, cinProfile, {
        styleTokens: [getStylePrompt(currentStyleId)],
        aspectRatio: storyboardConfig.aspectRatio,
        mediaType: getMediaType(currentStyleId),
      });
      
      // Sử dụngngười dùngCài đặt的Thời lượng，Mặc định 5 秒
      // Seedance 1.5 Pro 要求 4-12 秒，强制限制范围
      const rawDuration = scene.duration || 5;
      const videoDuration = Math.max(4, Math.min(12, rawDuration));

      console.log('[SplitScenes] Video generation params:', {
        sceneId,
        hasFirstFrame: !!firstFrameUrl,
        hasLastFrame: !!lastFrameUrl,
        characterRefCount: characterRefs.length,
        shotSize: scene.shotSize,
        duration: videoDuration,
        ambientSound: scene.ambientSound,
        soundEffects: scene.soundEffects,
        emotionTags: scene.emotionTags,
        fullPrompt,
      });

      // Normalize URL - handle array format ['url'] and extract string
      const normalizeUrl = (url: any): string => {
        if (!url) return '';
        // Handle array format: ['url'] -> 'url'
        if (Array.isArray(url)) {
          return url[0] || '';
        }
        if (typeof url === 'string') {
          return url;
        }
        return '';
      };


      // Build image_with_roles array
      interface ImageWithRole {
        url: string;
        role: 'first_frame' | 'last_frame';
      }
      const imageWithRoles: ImageWithRole[] = [];

      // First frame (REQUIRED for i2v mode) - must have valid HTTP URL
      const normalizedFirstFrame = normalizeUrl(firstFrameUrl);
      console.log('[SplitScenes] First frame URL (normalized):', normalizedFirstFrame?.substring(0, 80));
      
      const firstFrameConverted = await convertToHttpUrl(normalizedFirstFrame);
      if (!firstFrameConverted) {
        throw new Error('无法获取Khung hình đầuảnh的 HTTP URL，请重新Tạo ảnh');
      }
      imageWithRoles.push({ url: firstFrameConverted, role: 'first_frame' });
      console.log('[SplitScenes] First frame HTTP URL:', firstFrameConverted.substring(0, 60));

      // Last frame (optional)
      if (lastFrameUrl) {
        const lastFrameConverted = await convertToHttpUrl(lastFrameUrl);
        if (lastFrameConverted) {
          imageWithRoles.push({ url: lastFrameConverted, role: 'last_frame' });
          console.log('[SplitScenes] Last frame HTTP URL:', lastFrameConverted.substring(0, 60));
        }
      }

      // NOTE: Some providers cannot mix reference_image with first_frame/last_frame
      // So we only use first_frame + optional last_frame for i2v mode
      // Character references are NOT supported in this mode
      if (characterRefs.length > 0) {
        console.log('[SplitScenes] Skipping', characterRefs.length, 'character refs - cannot mix with first_frame');
      }

      console.log('[SplitScenes] image_with_roles:', imageWithRoles.length, 'images', imageWithRoles.map(i => i.role));

      // gọi API统一Tạo video API（Tự động路由到正确的 MemeFast 端点）
      const videoUrl = await callVideoGenerationApi(
        apiKey,
        fullPrompt,
        videoDuration,
        storyboardConfig.aspectRatio,
        imageWithRoles,
        (progress) => {
          updateSplitSceneVideo(sceneId, { videoProgress: progress });
        },
        keyManager,
        platform,
        storyboardConfig.videoResolution as '480p' | '720p' | '1080p' | undefined,
      );

      // Save video to local file system (Electron) for persistence
      let finalVideoUrl = videoUrl;
      try {
        const filename = `scene_${sceneId + 1}_${Date.now()}.mp4`;
        finalVideoUrl = await saveVideoToLocal(videoUrl, filename);
        console.log('[SplitScenes] Video saved locally:', finalVideoUrl);
      } catch (e) {
        console.warn('[SplitScenes] Failed to save video locally, using URL:', e);
      }
      
      // Auto-save to library (use first frame as thumbnail, pass duration)
      const mediaId = autoSaveVideoToLibrary(sceneId, finalVideoUrl, scene.imageDataUrl, videoDuration);
      updateSplitSceneVideo(sceneId, {
        videoStatus: 'completed',
        videoProgress: 100,
        videoUrl: finalVideoUrl,
        videoMediaId: mediaId,
      });
      toast.success(`Phân cảnh ${sceneId + 1} Tạo video hoàn tất, đã lưu vào thư viện phương tiện`);
      
      // Thị giác连续性：仅当Phân cảnhBắt buộc Khung hình cuối时，提取videokhung cuối cùng
      const currentScene = splitScenes.find(s => s.id === sceneId);
      const shouldExtractEndFrame = currentScene?.needsEndFrame && !currentScene?.endFrameImageUrl;
      
      if (shouldExtractEndFrame) {
        (async () => {
          try {
            const lastFrameBase64 = await extractLastFrameFromVideo(finalVideoUrl, 0.1);
            if (!lastFrameBase64) {
              console.warn('[SplitScenes] Failed to extract last frame from video');
              return;
            }
            
            // 持久化到本地file系统（local-image://），Tránh base64 被 partialize 清除
            const persistResult = await persistSceneImage(lastFrameBase64, sceneId, 'end');
            updateSplitSceneEndFrame(sceneId, persistResult.localPath, 'video-extracted', persistResult.httpUrl || undefined);
            console.log('[SplitScenes] Saved video last frame locally:', persistResult.localPath);
          } catch (e) {
            console.warn('[SplitScenes] Error during frame extraction:', e);
          }
        })();
      } else {
        console.log('[SplitScenes] Skipping end frame extraction: needsEndFrame=', currentScene?.needsEndFrame, 'hasEndFrame=', !!currentScene?.endFrameImageUrl);
      }
      
      setIsGenerating(false);
      setCurrentGeneratingId(null);

    } catch (error) {
      const err = error as Error;
      console.error(`[SplitScenes] Scene ${sceneId} video generation failed:`, err);
      
      // 检测是否为Nội dungkiểm duyệtlỗi
      const isModerationError = isContentModerationError(err);
      
      if (isModerationError) {
        // Nội dungkiểm duyệtlỗi，用 MODERATION_SKIPPED: 前缀标记
        updateSplitSceneVideo(sceneId, {
          videoStatus: 'failed',
          videoProgress: 0,
          videoError: `MODERATION_SKIPPED:${err.message}`,
        });
        toast.warning(`Phân cảnh ${sceneId + 1} 因Nội dungkiểm duyệt跳过`);
        console.log(`[SplitScenes] Scene ${sceneId} skipped due to content moderation`);
      } else {
        // 普通lỗi
        updateSplitSceneVideo(sceneId, {
          videoStatus: 'failed',
          videoProgress: 0,
          videoError: err.message,
        });
        toast.error(`Phân cảnh ${sceneId + 1} Tạo thất bại: ${err.message}`);
      }
    }

    setIsGenerating(false);
    setCurrentGeneratingId(null);
  }, [splitScenes, storyboardConfig, getApiKey, updateSplitSceneVideo, autoSaveVideoToLibrary, buildEmotionDescription, getCharacterReferenceImages]);

  // Generate image for a single scene using image API
  const handleGenerateSingleImage = useCallback(async (sceneId: number) => {
    const scene = splitScenes.find(s => s.id === sceneId);
    if (!scene) return;

    // Sử dụngánh xạ dịch vụ配置 - 不再 fallback 到硬编码
    const featureConfig = getFeatureConfig('character_generation');
    if (!featureConfig) {
      toast.error('Vui lòng cấu hình ánh xạ dịch vụ Tạo ảnh trong Cài đặt');
      return;
    }
    
    const keyManager = featureConfig.keyManager;
    const apiKey = keyManager.getCurrentKey() || '';
    if (!apiKey) {
      toast.error('Vui lòng cấu hình ánh xạ dịch vụ Tạo ảnh trong Cài đặt');
      return;
    }
    const platform = featureConfig.platform;
    const model = featureConfig.models?.[0];
    if (!model) {
      toast.error('Vui lòng chọn Model Tạo ảnh trong Cài đặt');
      return;
    }
    
    const imageBaseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
    if (!imageBaseUrl) {
      toast.error('Vui lòng cấu hình ánh xạ dịch vụ Tạo ảnh trong Cài đặt');
      return;
    }
    
    console.log('[SingleImage] Using config:', { platform, model, imageBaseUrl });

    // Need a prompt to generate - prefer imagePromptZh (first frame static), fallback to videoPromptZh
    const promptToUse = scene.imagePromptZh?.trim() || scene.imagePrompt?.trim() 
      || scene.videoPromptZh?.trim() || scene.videoPrompt?.trim() || '';
    if (!promptToUse) {
      toast.warning("请先填写Khung hình đầuprompt后再Tạo ảnh");
      return;
    }

    setIsGenerating(true);

    try {
      // Update status
      updateSplitSceneImageStatus(sceneId, {
        imageStatus: 'generating',
        imageProgress: 0,
        imageError: null,
      });

      // Build enhanced prompt with full style prompt for consistency
      let enhancedPrompt = promptToUse;
      const fullStylePrompt = getStylePrompt(currentStyleId);
      if (fullStylePrompt) {
        enhancedPrompt = `${promptToUse}. Style: ${fullStylePrompt}`;
      }

      // Collect reference images: scene background > characters > storyboard style
      const referenceImages: string[] = [];
      
      // 1. 首先ThêmCảnh背景Ảnh tham chiếu（最重要）
      if (scene.sceneReferenceImage) {
        referenceImages.push(scene.sceneReferenceImage);
        console.log('[SplitScenes] Using scene background reference');
      }
      
      // 2. ThêmNhân vậtẢnh tham chiếu
      if (scene.characterIds && scene.characterIds.length > 0) {
        const sceneCharRefs = getCharacterReferenceImages(scene.characterIds, scene.characterVariationMap);
        referenceImages.push(...sceneCharRefs);
      } else if (storyboardConfig.characterReferenceImages && storyboardConfig.characterReferenceImages.length > 0) {
        // Fallback to storyboardConfig characters
        referenceImages.push(...storyboardConfig.characterReferenceImages);
      }
      
      // 3. ThêmgốcPhân cảnh图作为Phong cáchTham chiếu
      if (storyboardImage) {
        referenceImages.push(storyboardImage);
      }

      console.log('[SplitScenes] Generating image:', {
        sceneId,
        prompt: enhancedPrompt.substring(0, 100),
        characterRefCount: referenceImages.length,
        platform,
        model,
        imageBaseUrl,
      });

      // Collect reference images for API
      // Supports: HTTP URLs, base64 Data URI, local-image:// (converted to base64)
      const processedRefs: string[] = [];
      for (const url of referenceImages.slice(0, 14)) {
        if (!url) continue;
        if (url.startsWith('http://') || url.startsWith('https://')) {
          processedRefs.push(url);
        } else if (url.startsWith('data:image/') && url.includes(';base64,')) {
          processedRefs.push(url);
        } else if (url.startsWith('local-image://')) {
          try {
            const base64 = await readImageAsBase64(url);
            if (base64) processedRefs.push(base64);
          } catch (e) {
            console.warn('[SplitScenes] Failed to read local image:', url, e);
          }
        }
      }

      // Call image generation API with smart routing (auto-selects chat/completions or images/generations)
      const apiResult = await submitGridImageRequest({
        model,
        prompt: enhancedPrompt,
        apiKey,
        baseUrl: imageBaseUrl,
        aspectRatio: storyboardConfig.aspectRatio || '9:16',
        resolution: storyboardConfig.resolution || '2K',
        referenceImages: processedRefs.length > 0 ? processedRefs : undefined,
        keyManager,
      });

      // Helper to normalize URL (handle array format) - used in poll responses
      const normalizeUrlValue = (url: any): string | undefined => {
        if (!url) return undefined;
        if (Array.isArray(url)) return url[0] || undefined;
        if (typeof url === 'string') return url;
        return undefined;
      };

      // Direct URL result
      if (apiResult.imageUrl) {
        const persistResult = await persistSceneImage(apiResult.imageUrl, sceneId, 'first');
        updateSplitSceneImage(sceneId, persistResult.localPath, scene.width, scene.height, persistResult.httpUrl || apiResult.imageUrl);
        autoSaveImageToLibrary(sceneId, persistResult.localPath);
        toast.success(`Phân cảnh ${sceneId + 1} Tạo ảnh hoàn tất, đã lưu vào thư viện phương tiện`);
        setIsGenerating(false);
        return;
      }

      // Async task - poll for completion
      let taskId: string | undefined = apiResult.taskId;
      console.log('[SplitScenes] Async task:', taskId);

      // Poll for completion if we have a task ID
      if (taskId) {
        const pollInterval = 2000;
        const maxAttempts = 60; // 2 minutes max
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const progress = Math.min(Math.floor((attempt / maxAttempts) * 100), 99);
          updateSplitSceneImageStatus(sceneId, { imageProgress: progress });

          const url = new URL(`${imageBaseUrl}/v1/tasks/${taskId}`);
          url.searchParams.set('_ts', Date.now().toString());

          const statusResponse = await fetch(url.toString(), {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Cache-Control': 'no-cache',
            },
          });

          if (!statusResponse.ok) {
            if (statusResponse.status === 404) {
              throw new Error('Nhiệm vụ không tồn tại');
            }
            throw new Error(`Failed to check task status: ${statusResponse.status}`);
          }

          const statusData = await statusResponse.json();
          const status = (statusData.status ?? statusData.data?.status ?? 'unknown').toString().toLowerCase();

          if (status === 'completed' || status === 'succeeded' || status === 'success') {
            // Extract image URL (normalize array format)
            const images = statusData.result?.images ?? statusData.data?.result?.images;
            let imageUrl: string | undefined;
            if (images?.[0]) {
              const rawUrl = images[0].url || images[0];
              imageUrl = normalizeUrlValue(rawUrl);
            }
            imageUrl = imageUrl || normalizeUrlValue(statusData.output_url) || normalizeUrlValue(statusData.result_url) || normalizeUrlValue(statusData.url);

            if (!imageUrl) throw new Error('Nhiệm vụ hoàn thành nhưng không có ảnh URL');
            
            // 持久化到本地 + Lưu trữ ảnh
            const persistResult = await persistSceneImage(imageUrl, sceneId, 'first');
            updateSplitSceneImage(sceneId, persistResult.localPath, scene.width, scene.height, persistResult.httpUrl || imageUrl);
            autoSaveImageToLibrary(sceneId, persistResult.localPath);
            toast.success(`Phân cảnh ${sceneId + 1} Tạo ảnh hoàn tất, đã lưu vào thư viện phương tiện`);
            setIsGenerating(false);
            return;
          }

          if (status === 'failed' || status === 'error') {
            const errorMsg = statusData.error || statusData.message || statusData.data?.error || 'Tạo ảnh thất bại';
            console.error('[SplitScenes] Task failed:', statusData);
            throw new Error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
          }

          await new Promise(r => setTimeout(r, pollInterval));
        }
        throw new Error('Tạo ảnh quá thời gian chờ');
      }

      throw new Error('Invalid API response: no image URL or task ID');
    } catch (error) {
      const err = error as Error;
      console.error(`[SplitScenes] Scene ${sceneId} image generation failed:`, err);
      updateSplitSceneImageStatus(sceneId, {
        imageStatus: 'failed',
        imageProgress: 0,
        imageError: err.message,
      });
      toast.error(`Phân cảnh ${sceneId + 1} Tạo ảnh thất bại: ${err.message}`);
    }

    setIsGenerating(false);
  }, [splitScenes, storyboardConfig, storyboardImage, getApiKey, updateSplitSceneImage, updateSplitSceneImageStatus, autoSaveImageToLibrary, getCharacterReferenceImages]);

  // ===== Utilities for 合并Tạo（lưới 9 ô） =====
  type Angle = 'Back View' | 'Over-the-Shoulder (OTS)' | 'POV' | 'Low Angle (Heroic)' | 'High Angle (Vulnerable)' | 'Dutch Angle (Tilted)';

  const allowedShotFromSize = (shot?: ShotSizeType | null): string => {
    switch (shot) {
      case 'ecu': return 'Extreme Close-up (ECU)';
      case 'cu':
      case 'mcu':
      case 'ms':
      case 'mls': return 'Upper Body Shot (Chest-up)';
      case 'ls': return 'Full Body Shot';
      case 'ws': return 'Wide Angle Full Shot';
      default: return 'Upper Body Shot (Chest-up)';
    }
  };

  const allocateAngles = (count: number, preselected: (string | undefined)[]): Angle[] => {
    const result: Angle[] = new Array(count);
    // Desired quotas
    let quotas: Record<Angle, number> = {
      'Back View': 2,
      'Over-the-Shoulder (OTS)': 3,
      'POV': 2,
      'Low Angle (Heroic)': 1,
      'High Angle (Vulnerable)': 1,
      'Dutch Angle (Tilted)': 0,
    };
    // Place user-specified cameraPosition if matches
    const normalize = (s?: string) => (s || '').toLowerCase();
    for (let i = 0; i < count; i++) {
      const u = normalize(preselected[i]);
      let matched: Angle | undefined;
      if (u.includes('over') && u.includes('shoulder')) matched = 'Over-the-Shoulder (OTS)';
      else if (u.includes('pov') || u.includes('point of view')) matched = 'POV';
      else if (u.includes('back')) matched = 'Back View';
      else if (u.includes('low angle')) matched = 'Low Angle (Heroic)';
      else if (u.includes('high angle')) matched = 'High Angle (Vulnerable)';
      else if (u.includes('dutch')) matched = 'Dutch Angle (Tilted)';
      if (matched) {
        result[i] = matched;
        quotas[matched] = Math.max(0, (quotas[matched] || 0) - 1);
      }
    }
    // Fill remaining with quotas
    const fillOrder: Angle[] = [
      'Over-the-Shoulder (OTS)', 'POV', 'Back View',
      'Low Angle (Heroic)', 'High Angle (Vulnerable)', 'Dutch Angle (Tilted)'
    ];
    for (let i = 0; i < count; i++) {
      if (result[i]) continue;
      for (const angle of fillOrder) {
        if ((quotas[angle] || 0) > 0) {
          result[i] = angle;
          quotas[angle]!--;
          break;
        }
      }
      if (!result[i]) result[i] = 'Over-the-Shoulder (OTS)';
    }
    return result;
  };

  const buildAnchorPhrase = (styleTokens?: string[]) => {
    const style = styleTokens && styleTokens.length > 0 ? `Artistic style consistent: ${styleTokens.join(', ')}. ` : '';
    // 强制bị cấmTạovăn bản，防止出现Chat气泡、字幕等
    const noTextConstraint = 'IMPORTANT: NO TEXT, NO WORDS, NO LETTERS, NO CAPTIONS, NO SPEECH BUBBLES, NO DIALOGUE BOXES, NO SUBTITLES, NO WRITING of any kind.';
    return `${style}Keep character appearance, wardrobe and facial features consistent. Keep lighting and color grading consistent. ${noTextConstraint}`;
  };

  const composeTilePrompt = (scene: SplitScene, angle: Angle, aspect: '16:9'|'9:16', styleTokens?: string[]) => {
    const base = scene.imagePromptZh?.trim() || scene.imagePrompt?.trim() || scene.videoPromptZh?.trim() || scene.videoPrompt?.trim() || '';
    const shot = allowedShotFromSize(scene.shotSize);
    const vertical = aspect === '9:16' ? 'vertical composition, tighter framing, avoid letterboxing, ' : '';
    // Tắt相机运动与Nhịp điệu，仅保留Góc nhìn/Kích thước cảnh/bố cục
    const cameraPart = `${angle}, ${shot}`;
    const anchor = buildAnchorPhrase(styleTokens);
    const style = styleTokens && styleTokens.length > 0 ? ` Style: ${styleTokens.join(', ')}` : '';
    
    // nhân vật数量约束：根据 characterIds 数量明确指定，防止ModelTạo多余nhân vật
    const charCount = scene.characterIds?.length || 0;
    const charCountPhrase = charCount === 0 
      ? 'NO human figures in this frame, empty scene or environment only.' 
      : charCount === 1 
        ? 'EXACTLY ONE person in frame, single character only, do NOT duplicate the character.'
        : `EXACTLY ${charCount} distinct people in frame, no more no less, each person appears only ONCE.`;
    
    const prompt = `${cameraPart}, ${vertical}${charCountPhrase} ${base}. ${anchor}.${style}`.replace(/\s+/g, ' ').trim();
    return prompt;
  };

  const handleMergedGenerate = useCallback(async (mode: 'first'|'last'|'both', strategy: 'cluster'|'minimal'|'none' = 'cluster', exemplar: boolean = true) => {
    if (splitScenes.length === 0) {
      toast.error('Không có phân cảnh nào để Tạo');
      return;
    }

    // 获取图像Tạo能力 - Sử dụngánh xạ dịch vụ配置
    const featureConfig = getFeatureConfig('character_generation');
    if (!featureConfig) {
      toast.error('Vui lòng cấu hình ánh xạ dịch vụ Tạo ảnh trong Cài đặt');
      return;
    }
    
    const keyManager = featureConfig.keyManager;
    const apiKey = keyManager.getCurrentKey() || '';
    if (!apiKey) {
      toast.error('Vui lòng cấu hình ánh xạ dịch vụ Tạo ảnh trong Cài đặt');
      return;
    }
    const platform = featureConfig.platform;
    const model = featureConfig.models?.[0];
    if (!model) {
      toast.error('Vui lòng chọn Model Tạo ảnh trong Cài đặt');
      return;
    }
    const imageBaseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
    if (!imageBaseUrl) {
      toast.error('Vui lòng cấu hình ánh xạ dịch vụ Tạo ảnh trong Cài đặt');
      return;
    }
    
    console.log('[MergedGen] Using config:', { platform, model, imageBaseUrl });

    setIsMergedRunning(true);
    mergedAbortRef.current = false; // Đặt lại cờ Dừng
    console.log('[MergedGen] Bắt đầu Tạo gộp lưới 9 ô, chế độ:', mode, 'strategy:', strategy, 'exemplar:', exemplar);

    const aspect = storyboardConfig.aspectRatio || '9:16';
    const styleTokens = storyboardConfig.styleTokens || [];
    // 始终Sử dụng getStylePrompt 获取đầy đủPhong cáchprompt（保证有Mặc định值，即使 styleTokens 为空）
    const fullStylePrompt = getStylePrompt(currentStyleId);
    const fullStyleNegative = getStyleNegativePrompt(currentStyleId);
    const dedup = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));

    // === 统一nhiệm vụ cột表方案：Hỗ trợ混合lưới 9 ô ===
    // nhiệm vụLoại定义
    type GridTask = { scene: SplitScene; type: 'first' | 'end' };
    
    // Quan trọng:videođã tạo的Phân cảnh视为hoàn thành，不需要再TạoKhung hình đầu或Khung hình cuối
    const isSceneCompleted = (s: SplitScene) => s.videoUrl || s.videoStatus === 'completed';

    // 构建nhiệm vụ cột表（根据người dùngChọn的 mode）
    const tasks: GridTask[] = [];
    for (const scene of splitScenes) {
      if (isSceneCompleted(scene)) continue; // Video đã hoàn thành, bỏ qua
      
      // 仅Khung hình đầu 或 首+尾：检查是否需要Khung hình đầu
      if ((mode === 'first' || mode === 'both') && !scene.imageDataUrl) {
        tasks.push({ scene, type: 'first' });
      }
      
      // 仅Khung hình cuối 或 首+尾：检查是否Bắt buộc Khung hình cuối
      if ((mode === 'last' || mode === 'both') && scene.needsEndFrame && !scene.endFrameImageUrl) {
        tasks.push({ scene, type: 'end' });
      }
    }

    // 检查是否有需要Tạo的
    if (tasks.length === 0) {
      toast.info('Tất cảPhân cảnhđã tạohoàn thành，无需重复Tạo');
      setIsMergedRunning(false);
      return;
    }

    // 统计thông tin
    const firstCount = tasks.filter(t => t.type === 'first').length;
    const endCount = tasks.filter(t => t.type === 'end').length;
    const parts: string[] = [];
    if (firstCount > 0) parts.push(`${firstCount}Khung hình đầu`);
    if (endCount > 0) parts.push(`${endCount}Khung hình cuối`);
    const completedCount = splitScenes.filter(isSceneCompleted).length;
    const skipInfo = completedCount > 0 ? `(bỏ qua ${completedCount} video đã hoàn thành)` : '';
    toast.info(`Bắt đầu Tạo gộp lưới 9 ô: ${parts.join(', ')}${skipInfo}`);

    // nhiệm vụ分页（每9nhiệm vụ一页，混合Khung hình đầu和Khung hình cuối）
    const taskPages: GridTask[][] = [];
    for (let i = 0; i < tasks.length; i += 9) {
      taskPages.push(tasks.slice(i, i + 9));
    }

    // 建立Ảnh tham chiếu池（按策略thu thập，从nhiệm vụ cột表đang xử lý...ảnh）
    const collectRefsFromTasks = (pageTasks: GridTask[]): string[] => {
      if (strategy === 'none') return [];
      const refs: string[] = [];
      const seenScenes = new Set<number>(); // Tránh thu thập trùng lặp cùng một cảnh
      for (const task of pageTasks) {
        if (seenScenes.has(task.scene.id)) continue;
        seenScenes.add(task.scene.id);
        if (task.scene.sceneReferenceImage) refs.push(task.scene.sceneReferenceImage);
        if (task.scene.characterIds?.length) {
          refs.push(...getCharacterReferenceImages(task.scene.characterIds, task.scene.characterVariationMap));
        }
      }
      // 去重并限制数量（API 限制 14 张）
      return dedup(refs).slice(0, strategy === 'minimal' ? 2 : 14);
    };

    // 根据Phân cảnh数量计算最优网格bố cục（强制 N x N 以保证Tỷ lệ一致性）
    const calculateGridLayout = (sceneCount: number): { cols: number; rows: number; paddedCount: number } => {
      // 策略：为了保证每ô大小绝对均匀，强制Sử dụng N x N bố cục
      // 这样整张大图的Tỷ lệ khung hình = 单ô的Tỷ lệ khung hình
      // 例如：3x3 bố cục，每ô 16:9，整图也是 16:9
      
      if (sceneCount <= 4) {
        return { cols: 2, rows: 2, paddedCount: 4 }; // 1-4 ảnh -> Lưới 4 ô
      }
      return { cols: 3, rows: 3, paddedCount: 9 }; // 5-9 ảnh -> Lưới 9 ô
    };
    
    // 计算整张大图应该请求的Tỷ lệ khung hình
    // 在 N x N bố cục下，整图Tỷ lệ khung hìnhTrực tiếp等于目标Tỷ lệ khung hình
    const calculateGridAspectRatio = (targetAspect: '16:9' | '9:16'): string => {
      return targetAspect;
    };

    // 切割大图为 N 小图（根据bố cục的 hàng数和 cột数）
    // quan trọng改进：切割时裁剪每ô到目标Tỷ lệ khung hình，防止因大图Tỷ lệ khung hình不精确导致的变形
    const sliceGridImage = async (
      gridImageUrl: string, 
      actualCount: number, 
      cols: number, 
      rows: number,
      targetAspect: '16:9' | '9:16'
    ): Promise<string[]> => {
      const targetAspectW = targetAspect === '16:9' ? 16 : 9;
      const targetAspectH = targetAspect === '16:9' ? 9 : 16;
      const targetRatio = targetAspectW / targetAspectH;
      
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          // 计算每ô在Ảnh gốcđang xử lý...
          const rawTileW = Math.floor(img.width / cols);
          const rawTileH = Math.floor(img.height / rows);
          const rawRatio = rawTileW / rawTileH;
          
          // 计算最终输出的ô尺寸（保证目标Tỷ lệ khung hình）
          let outputW: number, outputH: number;
          let cropX = 0, cropY = 0, cropW = rawTileW, cropH = rawTileH;
          
          if (Math.abs(rawRatio - targetRatio) < 0.01) {
            // Tỷ lệ khung hình已经接近目标，Trực tiếpSử dụng
            outputW = rawTileW;
            outputH = rawTileH;
          } else if (rawRatio > targetRatio) {
            // Ảnh gốcô太宽，需要裁剪宽度
            cropW = Math.floor(rawTileH * targetRatio);
            cropX = Math.floor((rawTileW - cropW) / 2); // Cắt giữa
            outputW = cropW;
            outputH = rawTileH;
          } else {
            // Ảnh gốcô太高，需要裁剪高度
            cropH = Math.floor(rawTileW / targetRatio);
            cropY = Math.floor((rawTileH - cropH) / 2); // Cắt giữa
            outputW = rawTileW;
            outputH = cropH;
          }
          
          // 安全边距：向内收缩 0.5%，防止切到可能的分割线或边缘瑕疵
          const safetyMargin = 0.005; 
          const marginW = Math.floor(cropW * safetyMargin);
          const marginH = Math.floor(cropH * safetyMargin);
          
          // 双重保险：强制输出尺寸严格符合目标Tỷ lệ khung hình
          // Tránh因 Math.floor 导致的微小Tỷ lệ偏差
          if (targetAspect === '16:9') {
            outputH = Math.round(outputW * 9 / 16);
          } else {
            // 9:16
            outputW = Math.round(outputH * 9 / 16);
          }
          
          console.log(`[MergedGen] Slice: raw ${rawTileW}×${rawTileH} → crop ${cropW}×${cropH} (margin ${marginW}px) → output ${outputW}×${outputH} (Strict ${targetAspect})`);
          
          const results: string[] = [];
          
          // 只切割实际需要的ô数量，跳过空白Placeholder格
          for (let i = 0; i < actualCount; i++) {
            const tileRow = Math.floor(i / cols);
            const tileCol = i % cols;
            const canvas = document.createElement('canvas');
            canvas.width = outputW;
            canvas.height = outputH;
            const ctx = canvas.getContext('2d')!;
            
            // 从Ảnh gốcđang xử lý...定区域，并Áp dụng安全边距
            const srcX = tileCol * rawTileW + cropX + marginW;
            const srcY = tileRow * rawTileH + cropY + marginH;
            const srcW = cropW - (marginW * 2);
            const srcH = cropH - (marginH * 2);
            
            ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outputW, outputH);
            results.push(canvas.toDataURL('image/png'));
          }
          resolve(results);
        };
        img.onerror = (e) => reject(new Error('Tải ảnh lưới 9 ô thất bại'));
        img.src = gridImageUrl;
      });
    };

    // Tạolưới 9 ôảnh并切割（Hỗ trợ混合Khung hình đầu+Khung hình cuốinhiệm vụ）
    const generateGridAndSlice = async (
      pageTasks: GridTask[],
      refs: string[]
    ): Promise<string[]> => {
      const actualCount = pageTasks.length;
      // Sử dụng新的bố cục计算函数 (强制 N x N)
      const { cols, rows, paddedCount } = calculateGridLayout(actualCount);
      const emptySlots = paddedCount - actualCount;
      
      // 在 N x N bố cục下，整图Tỷ lệ khung hìnhTrực tiếp等于目标Tỷ lệ khung hình
      const gridAspect = aspect;
      
      console.log(`[MergedGen] Grid: ${actualCount} scenes → ${paddedCount} cells (${rows}×${cols}), ${emptySlots} empty slots, grid aspect: ${gridAspect}`);
      
      // 构建增强版prompt (Tham chiếungười dùng提供的Cấu trúc化 Prompt)
      const gridPromptParts: string[] = [];
      
      // 1. 核心指令区 (Instruction Block) — Phong cách在此处前置，确保全局生效
      gridPromptParts.push('<instruction>');
      gridPromptParts.push(`Generate a clean ${rows}x${cols} storyboard grid with exactly ${paddedCount} equal-sized panels.`);
      gridPromptParts.push(`Overall Image Aspect Ratio: ${aspect}.`);
      
      // 明确指定单ô的Tỷ lệ khung hình，防止 AI 混淆
      const panelAspect = aspect === '16:9' ? '16:9 (horizontal landscape)' : '9:16 (vertical portrait)';
      gridPromptParts.push(`Each individual panel must have a ${panelAspect} aspect ratio.`);
      
      // 全局Phong cách thị giác（前置到指令区，权重最高）
      if (fullStylePrompt) {
        gridPromptParts.push(`MANDATORY Visual Style for ALL panels: ${fullStylePrompt}`);
      }
      
      gridPromptParts.push('Structure: No borders between panels, no text, no watermarks, no speech bubbles.');
      gridPromptParts.push('Consistency: Maintain consistent character appearance, lighting, color grading, and visual style across ALL panels.');
      gridPromptParts.push('</instruction>');
      
      // 2. bố cụcMô tả (Layout)
      gridPromptParts.push(`Layout: ${rows} rows, ${cols} columns, reading order left-to-right, top-to-bottom.`);
      
      // 3. 每ô的Nội dungMô tả（根据nhiệm vụLoạiChọnKhung hình đầu或Khung hình cuốiprompt）
      pageTasks.forEach((task, idx) => {
        const s = task.scene;
        const row = Math.floor(idx / cols) + 1;
        const col = (idx % cols) + 1;
        let desc = '';
        if (task.type === 'end') {
          desc = s.endFramePromptZh?.trim() || s.endFramePrompt?.trim() || (s.imagePromptZh || s.imagePrompt || '') + ' end state';
        } else {
          desc = s.imagePromptZh?.trim() || s.imagePrompt?.trim() || s.videoPromptZh?.trim() || s.videoPrompt?.trim() || `scene ${idx + 1}`;
        }
        
        // nhân vật数量约束
        const charCount = s.characterIds?.length || 0;
        const charConstraint = charCount === 0 
          ? '(no people)' 
          : charCount === 1 
            ? '(1 person)' 
            : `(${charCount} people)`;
        
        // 标记是Khung hình đầu还是Khung hình cuối
        const frameLabel = task.type === 'end' ? '[END FRAME]' : '[FIRST FRAME]';
        // 每格附带Phong cách锚定，防止多panel时Model遗忘全局Phong cách
        const styleAnchor = fullStylePrompt ? ` [same style]` : '';
        gridPromptParts.push(`Panel [row ${row}, col ${col}] ${frameLabel} ${charConstraint}: ${desc}${styleAnchor}`);
      });
      
      // 4. 空白Placeholder格Mô tả
      for (let i = actualCount; i < paddedCount; i++) {
        const row = Math.floor(i / cols) + 1;
        const col = (i % cols) + 1;
        gridPromptParts.push(`Panel [row ${row}, col ${col}]: empty placeholder, solid gray background`);
      }
      
      // 5. 全局Phong cách（尾部再次强调，首尾夹击确保Phong cách一致性）
      if (fullStylePrompt) {
        gridPromptParts.push(`IMPORTANT - Apply this EXACT style uniformly to every panel: ${fullStylePrompt}`);
      }
      
      // 6. Prompt phủ định (Negative Constraints) — 合并Phong cách专属负面Gợi ý
      const baseNegative = 'text, watermark, split screen borders, speech bubbles, blur, distortion, bad anatomy';
      const styleNeg = fullStyleNegative ? `, ${fullStyleNegative}` : '';
      gridPromptParts.push(`Negative constraints: ${baseNegative}${styleNeg}`);
      
      const gridPrompt = gridPromptParts.join('\n'); // Dùng ký tự xuống dòng để ngăn cách rõ hơn
      console.log('[MergedGen] Grid prompt:', gridPrompt.substring(0, 200) + '...');
      
      // 标记Tất cảnhiệm vụ对应的Phân cảnh为Đang tạo
      pageTasks.forEach(task => {
        if (task.type === 'end') {
          updateSplitSceneEndFrameStatus(task.scene.id, { endFrameStatus: 'generating', endFrameProgress: 10 });
        } else {
          updateSplitSceneImageStatus(task.scene.id, { imageStatus: 'generating', imageProgress: 10 });
        }
      });
      
      // 构建Ảnh tham chiếu cột表
      const finalRefs = refs.slice(0, 14);
      
      // 处理Ảnh tham chiếu为 API 可用格式
      // API Hỗ trợ: 1) HTTP/HTTPS URL  2) Base64 Data URI (必须包含 data:image/xxx;base64, 前缀)
      const processedRefs: string[] = [];
      for (const url of finalRefs) {
        if (!url) continue;
        // HTTP/HTTPS URL - Trực tiếpSử dụng
        if (url.startsWith('http://') || url.startsWith('https://')) {
          processedRefs.push(url);
        }
        // Base64 Data URI - 必须是đầy đủ格式 data:image/xxx;base64,...
        else if (url.startsWith('data:image/') && url.includes(';base64,')) {
          processedRefs.push(url);
        }
        // local-image:// 需要先转换为 base64
        else if (url.startsWith('local-image://')) {
          try {
            const base64 = await readImageAsBase64(url);
            if (base64 && base64.startsWith('data:image/') && base64.includes(';base64,')) {
              processedRefs.push(base64);
            }
          } catch (e) {
            console.warn('[MergedGen] Failed to read local image:', url);
          }
        }
      }
      console.log('[MergedGen] Processed refs:', processedRefs.length, 'valid from', finalRefs.length, 'total');
      // gỡ lỗi：打印Ảnh tham chiếu格式
      processedRefs.forEach((ref, i) => {
        const prefix = ref.substring(0, 50);
        console.log(`[MergedGen] Ref[${i}] format:`, prefix + '...');
      });
      
      // Phân tíchkết quả辅助函数（用于luân phiên阶段）
      const normalizeUrl = (url: any): string | undefined => {
        if (!url) return undefined;
        if (Array.isArray(url)) return url[0] || undefined;
        if (typeof url === 'string') return url;
        return undefined;
      };
      
      // gọi API API Tạolưới 9 ôảnh - Sử dụngthông minh路由（Tự độngChọn chat completions 或 images/generations）
      console.log('[MergedGen] Calling API with', processedRefs.length, 'reference images, model:', model);
      const apiResult = await submitGridImageRequest({
        model,
        prompt: gridPrompt,
        apiKey,
        baseUrl: imageBaseUrl,
        aspectRatio: gridAspect,
        resolution: storyboardConfig.resolution || '2K',
        referenceImages: processedRefs.length > 0 ? processedRefs : undefined,
        keyManager,
      });
      
      let gridImageUrl = apiResult.imageUrl;
      let taskId = apiResult.taskId;
      console.log('[MergedGen] API result: gridImageUrl=', gridImageUrl?.substring(0, 50), 'taskId=', taskId);
      
      // 如果是异步nhiệm vụ，luân phiên
      if (!gridImageUrl && taskId) {
        console.log('[MergedGen] Polling task:', taskId);
        const pollInterval = 2000;
        const maxAttempts = 90; // 3  phút
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const progress = Math.min(10 + Math.floor((attempt / maxAttempts) * 80), 90);
          // 根据nhiệm vụLoại更新各自的Tiến độ
          pageTasks.forEach(task => {
            if (task.type === 'end') {
              updateSplitSceneEndFrameStatus(task.scene.id, { endFrameProgress: progress });
            } else {
              updateSplitSceneImageStatus(task.scene.id, { imageProgress: progress });
            }
          });
          
          const statusUrl = new URL(`${imageBaseUrl}/v1/tasks/${taskId}`);
          statusUrl.searchParams.set('_ts', Date.now().toString());
          
          const statusResp = await fetch(statusUrl.toString(), {
            headers: { 'Authorization': `Bearer ${apiKey}` },
          });
          
          if (!statusResp.ok) throw new Error(`Truy vấn nhiệm vụ thất bại: ${statusResp.status}`);
          
          const statusData = await statusResp.json();
          console.log(`[MergedGen] Task ${taskId} poll #${attempt}:`, JSON.stringify(statusData, null, 2).substring(0, 500));
          
          const status = (statusData.status ?? statusData.data?.status ?? '').toString().toLowerCase();
          
          if (status === 'completed' || status === 'succeeded' || status === 'success') {
            // 尝试从多种路径获取ảnh URL
            const images = statusData.result?.images ?? statusData.data?.result?.images ?? statusData.images;
            if (images?.[0]) {
              gridImageUrl = normalizeUrl(images[0].url || images[0]);
            }
            gridImageUrl = gridImageUrl 
              || normalizeUrl(statusData.output_url) 
              || normalizeUrl(statusData.result_url)
              || normalizeUrl(statusData.url)
              || normalizeUrl(statusData.data?.url)
              || normalizeUrl(statusData.result?.url);
            console.log('[MergedGen] Task completed, gridImageUrl=', gridImageUrl?.substring(0, 80));
            break;
          }
          
          if (status === 'failed' || status === 'error') {
            const errMsg = statusData.error || statusData.message || statusData.data?.error || 'Tạo ảnh thất bại';
            throw new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
          }
          
          await new Promise(r => setTimeout(r, pollInterval));
        }
      }
      
      if (!gridImageUrl) {
        console.error('[MergedGen] Không lấy được ảnh URL, apiResult:', apiResult);
        if (taskId) {
          throw new Error(`lưới 9 ôTạohết thời gian（nhiệm vụ ${taskId} 在 3  phút内未hoàn thành），API 服务可能繁忙，请稍后Thử lại`);
        }
        throw new Error('Không lấy được ảnh URL lưới 9 ô, vui lòng kiểm tra phản hồi API');
      }
      
      console.log('[MergedGen] Grid image URL:', gridImageUrl.substring(0, 80));
      
      // Lưugốclưới 9 ô大图 URL 到 sclass-store（供Tạo video时复用）
      const pageSceneIds = pageTasks.filter(t => t.type === 'first').map(t => t.scene.id);
      if (pageSceneIds.length > 0) {
        setLastGridImage(gridImageUrl, pageSceneIds);
        console.log('[MergedGen] 已缓存lưới 9 ô大图 URL，sceneIds:', pageSceneIds);
      }
      
      // 切割lưới 9 ôảnh（传入bố cục参数和目标Tỷ lệ khung hình）
      const slicedImages = await sliceGridImage(gridImageUrl, actualCount, cols, rows, aspect);
      console.log('[MergedGen] Sliced into', slicedImages.length, 'images (from', paddedCount, 'grid cells, target aspect:', aspect, ')');
      
      // 回填到各Phân cảnh并Tự độngLưu到Thư viện phương tiện
      // 同时Tải lên切割后的ảnh到Lưu trữ ảnh，TránhTạo video时再次Tải lên
      const folderId = getImageFolderId();
      const imageHostConfigured = isImageHostConfigured();
      
      // 回填：根据nhiệm vụLoại决定更新Khung hình đầu还是Khung hình cuối
      // 先持久化到本地file系统（local-image://），Tránh base64 被 partialize 清除导致Nhập后ảnh丢失
      for (let i = 0; i < pageTasks.length; i++) {
        const task = pageTasks[i];
        const s = task.scene;
        const slicedImage = slicedImages[i];
        if (slicedImage) {
          // 持久化到本地 + Lưu trữ ảnh（与单图Tạo一致）
          const frameType = task.type === 'end' ? 'end' as const : 'first' as const;
          const persistResultLoop = await persistSceneImage(slicedImage, s.id, frameType);
          const httpUrl = persistResultLoop.httpUrl || undefined;
          const localPath = persistResultLoop.localPath;
          
          if (httpUrl) {
            console.log(`[MergedGen] Phân cảnh ${s.id + 1} ${task.type === 'end' ? 'Khung hình cuối' : 'Khung hình đầu'} đã tải lên到Lưu trữ ảnh:`, httpUrl.substring(0, 60));
          }
          
          if (task.type === 'end') {
            updateSplitSceneEndFrame(s.id, localPath, 'ai-generated', httpUrl || undefined);
            // Tự độngLưuKhung hình cuối到Thư viện phương tiện
            addMediaFromUrl({
              url: localPath,
              name: `Phân cảnh ${s.id + 1} - Khung hình cuối`,
              type: 'image',
              source: 'ai-image',
              folderId,
              projectId: mediaProjectId,
            });
          } else {
            // 传递 httpUrl，这样Tạo video时可以Trực tiếpSử dụng，不用再Tải lên
            updateSplitSceneImage(s.id, localPath, s.width, s.height, httpUrl);
            // Tự độngLưuKhung hình đầu到Thư viện phương tiện
            addMediaFromUrl({
              url: localPath,
              name: `Phân cảnh ${s.id + 1} - Khung hình đầu`,
              type: 'image',
              source: 'ai-image',
              folderId,
              projectId: mediaProjectId,
            });
          }
        }
      }
      
      return slicedImages;
    };

    // 辅助：Đặt lại一页đang xử lý... cảnhiệm vụ的Trạng thái为 failed
    const resetPageTasksToError = (pageTasks: GridTask[], errorMsg: string) => {
      for (const task of pageTasks) {
        if (task.type === 'end') {
          updateSplitSceneEndFrameStatus(task.scene.id, { endFrameStatus: 'failed', endFrameProgress: 0, endFrameError: errorMsg });
        } else {
          updateSplitSceneImageStatus(task.scene.id, { imageStatus: 'failed', imageProgress: 0, imageError: errorMsg });
        }
      }
    };

    // 第一轮：逐页尝试，Thất bại的页面记录下来Tiếp tục下一页
    const failedPages: { index: number; pageTasks: GridTask[]; refs: string[]; error: string }[] = [];
    let succeededCount = 0;

    for (let p = 0; p < taskPages.length; p++) {
      if (mergedAbortRef.current) {
        console.log('[MergedGen] Người dùng Dừng Tạo gộp');
        toast.info('Tạo gộp đã dừng');
        setIsMergedRunning(false);
        return;
      }
      
      const pageTasks = taskPages[p];
      const refs = collectRefsFromTasks(pageTasks);
      
      // 统计当前页的Khung hình đầu/Khung hình cuối数量
      const pageFirstCount = pageTasks.filter(t => t.type === 'first').length;
      const pageEndCount = pageTasks.filter(t => t.type === 'end').length;
      const pageInfo = [pageFirstCount > 0 ? `${pageFirstCount}Khung hình đầu` : '', pageEndCount > 0 ? `${pageEndCount}Khung hình cuối` : ''].filter(Boolean).join('+');
      
      console.log(`[MergedGen] Trang ${p + 1}/${taskPages.length}, ${pageTasks.length} nhiệm vụ (${pageInfo}), ${refs.length} Ảnh tham chiếu`);
      
      try {
        await generateGridAndSlice(pageTasks, refs);
        succeededCount++;
        if (!mergedAbortRef.current) {
          toast.success(`第 ${p + 1}/${taskPages.length} 页hoàn thành（${pageInfo}）`);
        }
      } catch (e: any) {
        const errorMsg = e.message || String(e);
        console.error(`[MergedGen] Trang ${p + 1} thất bại:`, errorMsg);
        // Đặt lại该页Phân cảnhTrạng thái为 error，不让它们卡在 'generating'
        resetPageTasksToError(pageTasks, errorMsg);
        failedPages.push({ index: p, pageTasks, refs, error: errorMsg });
        toast.warning(`Trang ${p + 1}/${taskPages.length} thất bại, sẽ tự động thử lại: ${errorMsg.substring(0, 60)}`);
        // Tiếp tục下一页，不中断
      }
    }

    // 第二轮：Tự độngThử lạiThất bại的页面（延迟 5 秒后Thử lại，给 API 恢复Thời gian）
    if (failedPages.length > 0 && !mergedAbortRef.current) {
      console.log(`[MergedGen] ${failedPages.length} trang thất bại, tự động thử lại sau 5 giây...`);
      toast.info(`${failedPages.length} trang tạo thất bại, tự động thử lại sau 5 giây...`);
      await new Promise(r => setTimeout(r, 5000));

      for (const fp of failedPages) {
        if (mergedAbortRef.current) break;

        const pageFirstCount = fp.pageTasks.filter(t => t.type === 'first').length;
        const pageEndCount = fp.pageTasks.filter(t => t.type === 'end').length;
        const pageInfo = [pageFirstCount > 0 ? `${pageFirstCount}Khung hình đầu` : '', pageEndCount > 0 ? `${pageEndCount}Khung hình cuối` : ''].filter(Boolean).join('+');

        console.log(`[MergedGen] Tự động thử lại trang ${fp.index + 1} (${pageInfo})`);
        try {
          // 重新thu thậpẢnh tham chiếu（可能在其他页Thành công后有新的图可用）
          const freshRefs = collectRefsFromTasks(fp.pageTasks);
          await generateGridAndSlice(fp.pageTasks, freshRefs);
          succeededCount++;
          toast.success(`Trang ${fp.index + 1} thử lại thành công (${pageInfo})`);
        } catch (retryErr: any) {
          const retryMsg = retryErr.message || String(retryErr);
          console.error(`[MergedGen] 第 ${fp.index + 1} 页Thử lạivẫnThất bại:`, retryMsg);
          // 再次Đặt lại为 error Trạng thái
          resetPageTasksToError(fp.pageTasks, `Thử lạiThất bại: ${retryMsg}`);
          toast.error(`第 ${fp.index + 1} 页Thử lạiThất bại: ${retryMsg.substring(0, 80)}`);
        }
      }
    }

    // 最终汇报
    const totalPages = taskPages.length;
    if (!mergedAbortRef.current) {
      if (succeededCount === totalPages) {
        toast.success('lưới 9 ô合并Tạo tất cảhoàn thành！');
      } else if (succeededCount > 0) {
        toast.warning(`合并Tạo部分hoàn thành：${succeededCount}/${totalPages} 页Thành công，${totalPages - succeededCount} 页Thất bại`);
      } else {
        toast.error(`合并Tạo tất cảThất bại（${totalPages} 页），请检查 API 服务后Thử lại`);
      }
    }
    setIsMergedRunning(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitScenes, storyboardConfig, getApiKey, updateSplitSceneImage, updateSplitSceneImageStatus, updateSplitSceneEndFrame, updateSplitSceneEndFrameStatus]);

  // 复用单图Tạo的 API 路径，封装为通用函数（Hỗ trợKhung hình đầu/Khung hình cuối）
  // 合并Tạo专用：Sử dụngước tính算Tham chiếu cột表；不降级到单图通道
  const generateImageForSceneMerged = async (
    sceneId: number,
    prompt: string,
    apiKey: string,
    aspect: '16:9'|'9:16',
    isEndFrame: boolean,
    refUrls: string[],
    strategy: 'cluster'|'minimal'|'none'
  ): Promise<{ finalBase64?: string; directUrl?: string } | void> => {
    if (isEndFrame) {
      updateSplitSceneEndFrameStatus(sceneId, { endFrameStatus: 'generating', endFrameProgress: 0, endFrameError: null });
    } else {
      updateSplitSceneImageStatus(sceneId, { imageStatus: 'generating', imageProgress: 0, imageError: null });
    }
    // Sử dụngánh xạ dịch vụ配置
    const featureConfig = getFeatureConfig('character_generation');
    if (!featureConfig) {
      throw new Error('Vui lòng cấu hình ánh xạ dịch vụ Tạo ảnh trong Cài đặt');
    }
    const platform = featureConfig.platform;
    const model = featureConfig.models?.[0];
    if (!model) {
      throw new Error('Vui lòng chọn Model Tạo ảnh trong Cài đặt');
    }
    const apiKeyToUse = apiKey || featureConfig.keyManager.getCurrentKey() || '';
    if (!apiKeyToUse) {
      throw new Error('Vui lòng cấu hình ánh xạ dịch vụ Tạo ảnh trong Cài đặt');
    }
    const imageBaseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
    if (!imageBaseUrl) {
      throw new Error('Vui lòng cấu hình ánh xạ dịch vụ Tạo ảnh trong Cài đặt');
    }

    // Call image generation API with smart routing
    const mergedKeyManager = featureConfig.keyManager;
    const apiResult = await submitGridImageRequest({
      model,
      prompt,
      apiKey: apiKeyToUse,
      baseUrl: imageBaseUrl,
      aspectRatio: aspect,
      resolution: storyboardConfig.resolution || '2K',
      referenceImages: refUrls && refUrls.length > 0 ? refUrls.slice(0, 14) : undefined,
      keyManager: mergedKeyManager,
    });

    const normalizeUrlValue = (url: any): string | undefined => Array.isArray(url) ? (url[0] || undefined) : (typeof url === 'string' ? url : undefined);
    let directUrl = apiResult.imageUrl;
    let taskId: string | undefined = apiResult.taskId;

    if (!taskId && !directUrl) {
      // 对非常规响应：尝试一次"无Tham chiếu"Thử lại（保持合并chế độ，不降级到单图通道）
      if (refUrls.length > 0 && strategy !== 'none') {
        const retryResult = await submitGridImageRequest({
          model,
          prompt,
          apiKey: apiKeyToUse,
          baseUrl: imageBaseUrl,
          aspectRatio: aspect,
          keyManager: mergedKeyManager,
        });
        directUrl = retryResult.imageUrl;
        taskId = retryResult.taskId;
      }
      if (!taskId && !directUrl) throw new Error('Invalid image task response');
    }

    if (!directUrl && taskId) {
      const pollInterval = 2000, maxAttempts = 60;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const progress = Math.min(Math.floor((attempt / maxAttempts) * 100), 99);
        if (isEndFrame) updateSplitSceneEndFrameStatus(sceneId, { endFrameProgress: progress });
        else updateSplitSceneImageStatus(sceneId, { imageProgress: progress });
        const url = new URL(`${imageBaseUrl}/v1/tasks/${taskId}`);
        url.searchParams.set('_ts', Date.now().toString());
        const statusResp = await fetch(url.toString(), { method: 'GET', headers: { 'Authorization': `Bearer ${apiKeyToUse}`, 'Cache-Control': 'no-cache' } });
        if (!statusResp.ok) throw new Error(`Failed to check task status: ${statusResp.status}`);
        const statusData = await statusResp.json();
        const status = (statusData.status ?? statusData.data?.status ?? 'unknown').toString().toLowerCase();
        if (status === 'completed' || status === 'succeeded' || status === 'success') {
          const images = statusData.result?.images ?? statusData.data?.result?.images;
          if (images?.[0]) directUrl = normalizeUrlValue(images[0].url || images[0]);
          directUrl = directUrl || normalizeUrlValue(statusData.output_url) || normalizeUrlValue(statusData.result_url) || normalizeUrlValue(statusData.url);
          break;
        }
        if (status === 'failed' || status === 'error') throw new Error((statusData.error || statusData.message || 'image generation failed').toString());
        await new Promise(r => setTimeout(r, pollInterval));
      }
    }

    if (!directUrl) throw new Error('Nhiệm vụ hoàn thành nhưng không có ảnh URL');

    const frameType = isEndFrame ? 'end' as const : 'first' as const;
    const persistResult = await persistSceneImage(directUrl, sceneId, frameType);

    if (isEndFrame) {
      updateSplitSceneEndFrame(sceneId, persistResult.localPath, 'ai-generated', persistResult.httpUrl || directUrl);
    } else {
      const sceneObj = splitScenes.find(s => s.id === sceneId)!;
      updateSplitSceneImage(sceneId, persistResult.localPath, sceneObj.width, sceneObj.height, persistResult.httpUrl || directUrl);
    }
    return { finalBase64: persistResult.localPath, directUrl };
  };

  // Generate end frame image for a single scene using image API
  // Reuses the same API config as first frame generation
  const handleGenerateEndFrameImage = useCallback(async (sceneId: number) => {
    const scene = splitScenes.find(s => s.id === sceneId);
    if (!scene) return;

    // Must have end frame prompt
    const promptToUse = scene.endFramePromptZh?.trim() || scene.endFramePrompt?.trim() || '';
    if (!promptToUse) {
      toast.warning("请先填写Khung hình cuốiprompt后再Tạo");
      return;
    }

    // Sử dụngánh xạ dịch vụ配置
    const featureConfig = getFeatureConfig('character_generation');
    if (!featureConfig) {
      toast.error('Vui lòng cấu hình ánh xạ dịch vụ Tạo ảnh trong Cài đặt');
      return;
    }
    const keyManager = featureConfig.keyManager;
    const apiKey = keyManager.getCurrentKey() || '';
    if (!apiKey) {
      toast.error('Vui lòng cấu hình ánh xạ dịch vụ Tạo ảnh trong Cài đặt');
      return;
    }
    const platform = featureConfig.platform;
    const model = featureConfig.models?.[0];
    if (!model) {
      toast.error('Vui lòng chọn Model Tạo ảnh trong Cài đặt');
      return;
    }
    const imageBaseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
    if (!imageBaseUrl) {
      toast.error('Vui lòng cấu hình ánh xạ dịch vụ Tạo ảnh trong Cài đặt');
      return;
    }
    
    console.log('[EndFrame] Using config:', { platform, model, imageBaseUrl });

    setIsGenerating(true);

    try {
      // Update end frame status
      updateSplitSceneEndFrameStatus(sceneId, {
        endFrameStatus: 'generating',
        endFrameProgress: 0,
        endFrameError: null,
      });

      // Build enhanced prompt with full style prompt
      let enhancedPrompt = promptToUse;
      const endFrameStylePrompt = getStylePrompt(currentStyleId);
      if (endFrameStylePrompt) {
        enhancedPrompt = `${promptToUse}. Style: ${endFrameStylePrompt}`;
      }

      // Collect reference images - include scene background and first frame for consistency
      const referenceImages: string[] = [];
      
      // 1. Khung hình cuốiCảnh背景Ảnh tham chiếu（可能与Khung hình đầu不同，如“张明从沙发走向餐桌”）
      if (scene.endFrameSceneReferenceImage) {
        referenceImages.push(scene.endFrameSceneReferenceImage);
        console.log('[SplitScenes] Using end frame scene background reference');
      } else if (scene.sceneReferenceImage) {
        // 回退到Khung hình đầuCảnh背景
        referenceImages.push(scene.sceneReferenceImage);
        console.log('[SplitScenes] Using first frame scene background for end frame');
      }
      
      // 2. Khung hình đầuảnh作为Phong cách一致性Tham chiếu
      if (scene.imageDataUrl) {
        referenceImages.push(scene.imageDataUrl);
      }
      
      // 3. Nhân vậtẢnh tham chiếu
      if (scene.characterIds && scene.characterIds.length > 0) {
        const sceneCharRefs = getCharacterReferenceImages(scene.characterIds, scene.characterVariationMap);
        referenceImages.push(...sceneCharRefs);
      }

      console.log('[SplitScenes] Generating end frame:', {
        sceneId,
        prompt: enhancedPrompt.substring(0, 100),
        referenceCount: referenceImages.length,
      });

      // Process reference images for API
      const processedRefs: string[] = [];
      for (const url of referenceImages.slice(0, 14)) {
        if (!url) continue;
        if (url.startsWith('http://') || url.startsWith('https://')) {
          processedRefs.push(url);
        } else if (url.startsWith('data:image/') && url.includes(';base64,')) {
          processedRefs.push(url);
        } else if (url.startsWith('local-image://')) {
          try {
            const base64 = await readImageAsBase64(url);
            if (base64) processedRefs.push(base64);
          } catch (e) {
            console.warn('[SplitScenes] Failed to read local image:', url, e);
          }
        }
      }

      // Call image generation API with smart routing
      const apiResult = await submitGridImageRequest({
        model,
        prompt: enhancedPrompt,
        apiKey,
        baseUrl: imageBaseUrl,
        aspectRatio: storyboardConfig.aspectRatio || '9:16',
        resolution: storyboardConfig.resolution || '2K',
        referenceImages: processedRefs.length > 0 ? processedRefs : undefined,
        keyManager,
      });

      // Helper to normalize URL (handle array format) - used in poll responses
      const normalizeUrlValue = (url: any): string | undefined => {
        if (!url) return undefined;
        if (Array.isArray(url)) return url[0] || undefined;
        if (typeof url === 'string') return url;
        return undefined;
      };

      // Direct URL result
      if (apiResult.imageUrl) {
        const persistResult = await persistSceneImage(apiResult.imageUrl, sceneId, 'end');
        updateSplitSceneEndFrame(sceneId, persistResult.localPath, 'ai-generated', persistResult.httpUrl || apiResult.imageUrl);
        // Tự độngLưuKhung hình cuối到Thư viện phương tiện
        const folderId = getImageFolderId();
        addMediaFromUrl({
          url: persistResult.localPath,
          name: `Phân cảnh ${sceneId + 1} - Khung hình cuối`,
          type: 'image',
          source: 'ai-image',
          folderId,
          projectId: mediaProjectId,
        });
        toast.success(`Phân cảnh ${sceneId + 1} Khung hình cuốiTạohoàn thành，đã lưu到Thư viện phương tiện`);
        setIsGenerating(false);
        return;
      }

      // Async task - poll for completion
      let taskId: string | undefined = apiResult.taskId;
      
      if (taskId) {
        const pollInterval = 2000;
        const maxAttempts = 60;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const progress = Math.min(Math.floor((attempt / maxAttempts) * 100), 99);
          updateSplitSceneEndFrameStatus(sceneId, { endFrameProgress: progress });

          const url = new URL(`${imageBaseUrl}/v1/tasks/${taskId}`);
          url.searchParams.set('_ts', Date.now().toString());

          const statusResponse = await fetch(url.toString(), {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Cache-Control': 'no-cache',
            },
          });

          if (!statusResponse.ok) {
            if (statusResponse.status === 404) throw new Error('Nhiệm vụ không tồn tại');
            throw new Error(`Failed to check task status: ${statusResponse.status}`);
          }

          const statusData = await statusResponse.json();
          const status = (statusData.status ?? statusData.data?.status ?? 'unknown').toString().toLowerCase();

          if (status === 'completed' || status === 'succeeded' || status === 'success') {
            const images = statusData.result?.images ?? statusData.data?.result?.images;
            let imageUrl: string | undefined;
            if (images?.[0]) {
              const rawUrl = images[0].url || images[0];
              imageUrl = normalizeUrlValue(rawUrl);
            }
            imageUrl = imageUrl || normalizeUrlValue(statusData.output_url) || normalizeUrlValue(statusData.url);

            if (!imageUrl) throw new Error('Nhiệm vụ hoàn thành nhưng không có ảnh URL');
            
            // 持久化到本地 + Lưu trữ ảnh
            const persistResult = await persistSceneImage(imageUrl, sceneId, 'end');
            updateSplitSceneEndFrame(sceneId, persistResult.localPath, 'ai-generated', persistResult.httpUrl || imageUrl);
            // Tự độngLưuKhung hình cuối到Thư viện phương tiện
            const folderId = getImageFolderId();
            addMediaFromUrl({
              url: persistResult.localPath,
              name: `Phân cảnh ${sceneId + 1} - Khung hình cuối`,
              type: 'image',
              source: 'ai-image',
              folderId,
              projectId: mediaProjectId,
            });
            toast.success(`Phân cảnh ${sceneId + 1} Khung hình cuốiTạohoàn thành，đã lưu到Thư viện phương tiện`);
            setIsGenerating(false);
            return;
          }

          if (status === 'failed' || status === 'error') {
            const errorMsg = statusData.error || statusData.message || 'Khung hình cuốiTạo thất bại';
            throw new Error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
          }

          await new Promise(r => setTimeout(r, pollInterval));
        }
        throw new Error('Khung hình cuốiTạohết thời gian');
      }

      throw new Error('Invalid API response');
    } catch (error) {
      const err = error as Error;
      console.error(`[SplitScenes] Scene ${sceneId} end frame generation failed:`, err);
      updateSplitSceneEndFrameStatus(sceneId, {
        endFrameStatus: 'failed',
        endFrameProgress: 0,
        endFrameError: err.message,
      });
      toast.error(`Phân cảnh ${sceneId + 1} Khung hình cuốiTạo thất bại: ${err.message}`);
    }

    setIsGenerating(false);
  }, [splitScenes, storyboardConfig, getApiKey, updateSplitSceneEndFrame, updateSplitSceneEndFrameStatus, getCharacterReferenceImages]);

  // Save to media library (image or video) - uses system category folders
  const handleSaveToLibrary = useCallback(async (scene: SplitScene, type: 'image' | 'video') => {
    try {
      if (type === 'video') {
        if (!scene.videoUrl) {
          toast.error("没有可Lưu的video");
          return;
        }
        const folderId = getVideoFolderId();
        addMediaFromUrl({
          url: scene.videoUrl,
          name: `Phân cảnh ${scene.id + 1} - Video AI`,
          type: 'video',
          source: 'ai-video',
          thumbnailUrl: scene.imageDataUrl,
          duration: scene.duration || 5,
          folderId,
          projectId: mediaProjectId,
        });
        toast.success(`Phân cảnh ${scene.id + 1} Video đã được lưu到Thư viện phương tiện`);
      } else {
        if (!scene.imageDataUrl) {
          toast.error("没有可Lưu的ảnh");
          return;
        }
        const folderId = getImageFolderId();
        addMediaFromUrl({
          url: scene.imageDataUrl,
          name: `Phân cảnh ${scene.id + 1} - Ảnh AI`,
          type: 'image',
          source: 'ai-image',
          folderId,
          projectId: mediaProjectId,
        });
        toast.success(`Phân cảnh ${scene.id + 1} Ảnh đã được lưu到Thư viện phương tiện`);
      }
    } catch (error) {
      const err = error as Error;
      toast.error(`LưuThất bại: ${err.message}`);
    }
  }, [addMediaFromUrl, getImageFolderId, getVideoFolderId, mediaProjectId]);

  // Show empty state
  if (storyboardStatus !== 'editing' || splitScenes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Chưa có切割的Phân cảnh</p>
        {onBack && (
          <Button variant="outline" onClick={onBack} className="mt-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Quay lại
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Chuyển Tab đầu trang */}
      <div className="border-b -mx-4 px-4 -mt-4 pt-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "editing" | "trailer")} className="w-full">
          <TabsList className="w-full justify-start h-9 rounded-none bg-transparent border-b-0 p-0">
            <TabsTrigger 
              value="editing" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent h-9 px-4"
            >
              <Film className="h-3 w-3 mr-1" />
              Phân cảnhChỉnh sửa
            </TabsTrigger>
            <TabsTrigger 
              value="trailer" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent h-9 px-4"
            >
              <Clapperboard className="h-3 w-3 mr-1" />
              Trailer {trailerScenes.length > 0 ? `(${trailerScenes.length})` : ''}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Trailer Tab Nội dung - 完全复用Phân cảnhChỉnh sửa的chức năng */}
      {activeTab === "trailer" && (
        <>
          {trailerScenes.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-8">
              <Clapperboard className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Trailerchức năng</p>
              <p className="text-xs mt-1">请在左侧「Kịch bản」panelđang xử lý...railer」Thẻ页TạoTrailer</p>
              <p className="text-xs mt-1">chọn的Phân cảnh将在此Hiện并可thực hiệnảnh/Tạo video</p>
            </div>
          ) : (
            <>
              {/* Header - 与Phân cảnhChỉnh sửa一致 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">TrailerPhân cảnh</span>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {trailerScenes.length} Phân cảnh
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ước tính {trailerScenes.reduce((sum, s) => sum + (s.duration || 5), 0)} 秒
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* 一键Xóa tất cảTrailerPhân cảnh */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        disabled={isGenerating}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Xóa tất cảPhân cảnh
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Xác nhậnXóa tất cảTrailerPhân cảnh</AlertDialogTitle>
                        <AlertDialogDescription>
                          这将XóaTất cả {trailerScenes.length} TrailerPhân cảnh（包括đã tạo的ảnh和video）。Hành động này không thể hoàn tác。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Hủy</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            // XóaTất cảTrailerPhân cảnh
                            trailerScenes.forEach(scene => {
                              deleteSplitScene(scene.id);
                            });
                            // Xóa tất cảTrailer配置
                            clearTrailer();
                            toast.success(`已Xóa tất cả ${trailerScenes.length} TrailerPhân cảnh`);
                          }}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Xác nhậnXóa tất cả
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              {/* Global style and aspect ratio config - 与Phân cảnhChỉnh sửa一致 */}
              <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-muted/30 border">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Phong cách thị giác:</span>
                  <StylePicker
                    value={currentStyleId}
                    onChange={handleStyleChange}
                    disabled={isGenerating}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">hình ảnhTỷ lệ:</span>
                  <div className="flex rounded-md border overflow-hidden">
                    <button
                      onClick={() => handleAspectRatioChange('16:9')}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors",
                        storyboardConfig.aspectRatio === '16:9'
                          ? "bg-primary text-primary-foreground"
                          : "bg-background hover:bg-muted"
                      )}
                    >
                      <Monitor className="h-3.5 w-3.5" />
                      Ngang
                    </button>
                    <button
                      onClick={() => handleAspectRatioChange('9:16')}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors border-l",
                        storyboardConfig.aspectRatio === '9:16'
                          ? "bg-primary text-primary-foreground"
                          : "bg-background hover:bg-muted"
                      )}
                    >
                      <Smartphone className="h-3.5 w-3.5" />
                      Dọc
                    </button>
                  </div>
                </div>
                {/* Image Resolution Selector */}
                <Select
                  value={storyboardConfig.resolution || '2K'}
                  onValueChange={(v: '1K' | '2K' | '4K') => {
                    setStoryboardConfig({ resolution: v });
                    toast.success(`ảnhĐộ phân giải已切换为 ${v}`);
                  }}
                >
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1K" className="text-xs">标准 (1K)</SelectItem>
                    <SelectItem value="2K" className="text-xs">高清 (2K)</SelectItem>
                    <SelectItem value="4K" className="text-xs">超清 (4K)</SelectItem>
                  </SelectContent>
                </Select>

                {/* Video Resolution Selector */}
                <Select
                  value={storyboardConfig.videoResolution || '480p'}
                  onValueChange={(v: '480p' | '720p' | '1080p') => {
                    setStoryboardConfig({ videoResolution: v });
                    toast.success(`videoĐộ phân giải已切换为 ${v}`);
                  }}
                >
                  <SelectTrigger className="w-[140px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="480p" className="text-xs">标准 (480P)</SelectItem>
                    <SelectItem value="720p" className="text-xs">高清 (720P)</SelectItem>
                    <SelectItem value="1080p" className="text-xs">高品质 (1080P)</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex-1 text-xs text-muted-foreground/70 truncate">
                  {storyboardConfig.styleTokens?.slice(0, 2).join(', ')}...
                </div>
              </div>

              {/* Scene list - 完全复用Phân cảnhChỉnh sửa的 SceneCard */}
              <div className="flex flex-col gap-3">
                {trailerScenes.map((scene) => (
                  <SceneCard
                    key={scene.id}
                    scene={scene}
                    onUpdateImagePrompt={(id, prompt, promptZh) => updateSplitSceneImagePrompt(id, prompt, promptZh)}
                    onUpdateVideoPrompt={(id, prompt, promptZh) => updateSplitSceneVideoPrompt(id, prompt, promptZh)}
                    onUpdateEndFramePrompt={(id, prompt, promptZh) => updateSplitSceneEndFramePrompt(id, prompt, promptZh)}
                    onUpdateNeedsEndFrame={(id, needsEndFrame) => updateSplitSceneNeedsEndFrame(id, needsEndFrame)}
                    onUpdateEndFrame={handleUpdateEndFrame}
                    onUpdateCharacters={handleUpdateCharacters}
                    onUpdateCharacterVariationMap={handleUpdateCharacterVariationMap}
                    onUpdateEmotions={handleUpdateEmotions}
                    onUpdateShotSize={handleUpdateShotSize}
                    onUpdateDuration={handleUpdateDuration}
                    onUpdateAmbientSound={handleUpdateAmbientSound}
                    onUpdateSoundEffects={handleUpdateSoundEffects}
            onUpdateSceneReference={(id, sceneLibId, viewpointId, refImage, subViewId) => updateSplitSceneReference(id, sceneLibId, viewpointId, refImage, subViewId)}
            onUpdateEndFrameSceneReference={(id, sceneLibId, viewpointId, refImage, subViewId) => updateSplitSceneEndFrameReference(id, sceneLibId, viewpointId, refImage, subViewId)}
            onDelete={handleDeleteScene}
            onSaveToLibrary={handleSaveToLibrary}
            onGenerateImage={handleGenerateSingleImage}
            onGenerateVideo={handleGenerateSingleVideo}
            onGenerateEndFrame={handleGenerateEndFrameImage}
            onRemoveImage={handleRemoveImage}
            onUploadImage={handleUploadImage}
            onUpdateField={(id, field, value) => updateSplitSceneField(id, field, value)}
            onAngleSwitch={handleAngleSwitchClick}
            onQuadGrid={handleQuadGridClick}
            onExtractVideoLastFrame={handleExtractVideoLastFrame}
            onStopImageGeneration={handleStopImageGeneration}
            onStopVideoGeneration={handleStopVideoGeneration}
            onStopEndFrameGeneration={handleStopEndFrameGeneration}
            isExtractingFrame={isExtractingFrame}
            isAngleSwitching={isAngleSwitching}
            isQuadGridGenerating={isQuadGridGenerating}
            isGeneratingAny={isGenerating}
          />
                ))}
              </div>

              {/* Action buttons - 与Phân cảnhChỉnh sửa一致 */}
              <div className="flex gap-2 pt-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => {
                          // 仅为TrailerPhân cTạo ảnh video
                          toast.info(`Bắt đầuTạo ${trailerScenes.length} Trailervideo...`);
                          // 循环gọi API单Tạo
                          trailerScenes.forEach(scene => {
                            if (scene.imageDataUrl && scene.videoStatus !== 'completed') {
                              handleGenerateSingleVideo(scene.id);
                            }
                          });
                        }}
                        disabled={isGenerating || trailerScenes.length === 0}
                        className="flex-1"
                        size="lg"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Đang tạo...
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-2" />
                            TạoTrailervideo ({trailerScenes.length})
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>为TrailerPhân cTạo ảnh video</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* Tips */}
              <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                <p>💡 TrailerPhân cảnh与主Phân cảnh共享dữ liệu，修改会同步。Nhấp每Phân cảnh下方的văn bản区域可Chỉnh sửaprompt。</p>
              </div>
            </>
          )}
        </>
      )}

      {/* Phân cảnhChỉnh sửa Tab Nội dung */}
      {activeTab === "editing" && (
      <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Phân cảnhChỉnh sửa</span>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {splitScenes.length} phân cảnh
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="text"
            size="sm"
            onClick={handleBack}
            className="h-7 px-2 text-xs"
          >
            <ArrowLeft className="h-3 w-3 mr-1" />
            Tạo lại
          </Button>
        </div>
      </div>

      {/* Row 1: Cơ bản配置 - Phong cách thị giác / hình ảnhTỷ lệ / Tạo方式 */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-muted/30 border">
        {/* Visual Style Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Phong cách thị giác:</span>
          <StylePicker
            value={currentStyleId}
            onChange={handleStyleChange}
            disabled={isGenerating}
          />
        </div>

        {/* Cinematography Profile Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Phong cách quay phim:</span>
          <CinematographyProfilePicker
            value={currentCinProfileId}
            onChange={handleCinProfileChange}
            disabled={isGenerating}
            styleId={currentStyleId}
          />
        </div>

        {/* Aspect Ratio Selector — Hạng S 6 种Tỉ lệ khung hình比 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Tỉ lệ khung hình比:</span>
          <Select
            value={storyboardConfig.aspectRatio || '16:9'}
            onValueChange={(v: string) => handleAspectRatioChange(v as SClassAspectRatio)}
          >
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCLASS_ASPECT_RATIOS.map(ar => (
                <SelectItem key={ar.value} value={ar.value} className="text-xs">
                  {ar.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Image Resolution Selector */}
        <Select
          value={storyboardConfig.resolution || '2K'}
          onValueChange={(v: '1K' | '2K' | '4K') => {
            setStoryboardConfig({ resolution: v });
            toast.success(`ảnhĐộ phân giải已切换为 ${v}`);
          }}
        >
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1K" className="text-xs">标准 (1K)</SelectItem>
            <SelectItem value="2K" className="text-xs">高清 (2K)</SelectItem>
            <SelectItem value="4K" className="text-xs">超清 (4K)</SelectItem>
          </SelectContent>
        </Select>

        {/* Video Resolution Selector */}
        <Select
          value={storyboardConfig.videoResolution || '480p'}
          onValueChange={(v: '480p' | '720p' | '1080p') => {
            setStoryboardConfig({ videoResolution: v });
            toast.success(`videoĐộ phân giải已切换为 ${v}`);
          }}
        >
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="480p" className="text-xs">标准 (480P)</SelectItem>
            <SelectItem value="720p" className="text-xs">高清 (720P)</SelectItem>
            <SelectItem value="1080p" className="text-xs">高品质 (1080P)</SelectItem>
          </SelectContent>
        </Select>

        {/* Image generation mode toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Tạo ảnh方式:</span>
          <div className="flex rounded-md border overflow-hidden">
            <button
              onClick={() => setImageGenMode('single')}
              className={cn(
                "px-3 py-1.5 text-xs",
                imageGenMode === 'single' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
              )}
            >单图Tạo</button>
            <button
              onClick={() => setImageGenMode('merged')}
              className={cn(
                "px-3 py-1.5 text-xs border-l",
                imageGenMode === 'merged' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
              )}
            >合并Tạo</button>
          </div>
        </div>

        {/* Current style tokens hint */}
        <div className="flex-1 text-xs text-muted-foreground/70 truncate">
          {storyboardConfig.styleTokens?.slice(0, 2).join(', ')}...
        </div>
      </div>

      {/* Row 1.5: Seedance 2.0 âm thanh/chuyển động máyGợi ý（实际控制复用每Phân cảnh的 per-scene âm thanh开关） */}
      <div className="flex flex-wrap items-center gap-3 p-2 rounded-lg bg-muted/20 border">
        <Music className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">âm thanh/chuyển động máy: 复用每Phân cảnh的独立开关（Thoại / Hiệu ứng âm thanh / môi trường声 / chuyển động máy）Tự động聚合</span>
        <span className="text-xs text-muted-foreground/60">Thời lượng上限 15s · Seedance 2.0</span>
      </div>

      {/* Row 2: 合并TạoTùy chọn（仅在合并chế độ下Hiện） */}
      {imageGenMode === 'merged' && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
          {/* 首/Khung hình cuốichế độ */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">首/Khung hình cuối:</span>
            <div className="flex rounded-md border overflow-hidden">
              <button
                onClick={() => setFrameMode('first')}
                className={cn(
                  "px-3 py-1.5 text-xs",
                  frameMode === 'first' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                )}
              >仅Khung hình đầu</button>
              <button
                onClick={() => setFrameMode('last')}
                className={cn(
                  "px-3 py-1.5 text-xs border-l",
                  frameMode === 'last' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                )}
              >仅Khung hình cuối</button>
              <button
                onClick={() => setFrameMode('both')}
                className={cn(
                  "px-3 py-1.5 text-xs border-l",
                  frameMode === 'both' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                )}
              >首+尾</button>
            </div>
          </div>

          {/* Ảnh tham chiếu策略 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Ảnh tham chiếu策略:</span>
            <Select value={refStrategy} onValueChange={v => setRefStrategy(v as any)}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue placeholder="Chọn策略" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cluster" className="text-xs">Cluster（聚类去重）</SelectItem>
                <SelectItem value="minimal" className="text-xs">Minimal（单Tham chiếu）</SelectItem>
                <SelectItem value="none" className="text-xs">None（无Tham chiếu）</SelectItem>
              </SelectContent>
            </Select>
            <button
              onClick={() => setUseExemplar(!useExemplar)}
              className={cn("px-2 py-1 text-xs rounded border", useExemplar ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}
              title="同组格tham chiếuđã tạo的范例成片作为neo"
            >范例锚图 {useExemplar ? '开' : '关'}</button>
          </div>

          {/* 执 hàng合并Tạo - 突出Hiện */}
          <div className="ml-auto flex items-center gap-2">
            <Button
              className="h-8 px-4 text-xs font-medium"
              disabled={isGenerating || isMergedRunning || splitScenes.length === 0}
              onClick={() => {
                console.log('[MergedGenControls] 执 hàng合并TạonútNhấp, frameMode:', frameMode, 'refStrategy:', refStrategy, 'useExemplar:', useExemplar);
                handleMergedGenerate(frameMode, refStrategy, useExemplar);
              }}
            >
              {isMergedRunning ? (<><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />合并Đang tạo...</>) : (<><Sparkles className="h-3.5 w-3.5 mr-1.5" />执 hàng合并Tạo</>)}
            </Button>
            {isMergedRunning && (
              <Button
                variant="destructive"
                className="h-8 px-3 text-xs"
                onClick={handleStopMergedGeneration}
              >
                <Square className="h-3.5 w-3.5 mr-1" />Dừng
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Warning if no prompts */}
      {splitScenes.some(s => !s.videoPrompt.trim()) && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-yellow-500/10 border border-yellow-500/20">
          <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
          <div className="text-xs text-yellow-600 dark:text-yellow-400">
            <p>部分Phân cảnh缺少prompt，NhấpPhân cảnh下方的văn bản区域可Chỉnh sửa。</p>
          </div>
        </div>
      )}

      {/* ========== Hạng STạo videoChuyển chế độ ========== */}
      <div className="flex items-center gap-2 pb-2">
        <span className="text-xs text-muted-foreground">Tạo videochế độ:</span>
        <div className="flex rounded-md border overflow-hidden">
          <button
            onClick={() => setSclassGenMode('group')}
            className={cn(
              "px-3 py-1.5 text-xs",
              sclassGenMode === 'group' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
            )}
          >nhómTạo ({shotGroups.length} 组)</button>
          <button
            onClick={() => setSclassGenMode('single')}
            className={cn(
              "px-3 py-1.5 text-xs border-l",
              sclassGenMode === 'single' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
            )}
          >ống kính đơnTạo ({splitScenes.length} 镜)</button>
        </div>
        {sclassGenMode === 'group' && (
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={shotGroups.length === 0 || shotGroups.some(g => g.calibrationStatus === 'calibrating')}
              onClick={async () => {
                toast.info('Bắt đầu批量 AI Hiệu chuẩn...');
                const { success, total } = await runBatchCalibration(splitScenes, allCharacters, sceneLibrary);
                if (total === 0) {
                  toast.info('没有需要Hiệu chuẩn的组');
                } else {
                  toast.success(`批量Hiệu chuẩnhoàn thành：${success}/${total} 组Thành công`);
                }
              }}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              批量Hiệu chuẩn
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                const groups = autoGroupScenes(splitScenes);
                const named = groups.map((g, idx) => ({ ...g, name: generateGroupName(g, splitScenes, idx) }));
                setShotGroups(named);
                toast.success(`已重新nhóm：${named.length} 组`);
              }}
            >重新nhóm</Button>
          </div>
        )}
      </div>

      {/* ========== nhómchế độ: ShotGroupCard ========== */}
      {sclassGenMode === 'group' ? (
        <div className="flex flex-col gap-3">
          {shotGroups.map((group, groupIdx) => {
            const groupScenes = group.sceneIds
              .map(id => sceneMap.get(id))
              .filter(Boolean) as SplitScene[];
            return (
              <ShotGroupCard
                key={group.id}
                group={group}
                scenes={groupScenes}
                allScenes={splitScenes}
                groupIndex={groupIdx}
                isGeneratingAny={isGenerating}
                characters={allCharacters}
                sceneLibrary={sceneLibrary}
                onCalibrateGroup={(groupId) => {
                  const groupScenes = shotGroups.find(sg => sg.id === groupId)
                    ?.sceneIds.map(id => sceneMap.get(id)).filter(Boolean) as SplitScene[] || [];
                  runCalibration(groupId, groupScenes, allCharacters, sceneLibrary)
                    .then(ok => {
                      if (ok) toast.success('AI Hiệu chuẩnhoàn thành');
                      else toast.error('AI Hiệu chuẩnThất bại');
                    });
                }}
                onGenerateGroupVideo={(groupId) => {
                  const g = shotGroups.find(sg => sg.id === groupId);
                  if (g) {
                    setIsGenerating(true);
                    generateGroupVideo(g, {
                      confirmBeforeGenerate: () => new Promise((resolve) => {
                        resolve(window.confirm(
                          'ô图和prompt已准备hoàn tất，可在nhóm卡片đang xử lý... trước和Tải xuống。\n\n是否Tiếp tụcgọi API API Tạo video？'
                        ));
                      }),
                    }).finally(() => setIsGenerating(false));
                  }
                }}
                onExtendGroup={(groupId) => {
                  const g = shotGroups.find(sg => sg.id === groupId);
                  if (g) {
                    setExtendEditMode('extend');
                    setExtendEditSourceGroup(g);
                    setExtendEditOpen(true);
                  }
                }}
                onEditGroup={(groupId) => {
                  const g = shotGroups.find(sg => sg.id === groupId);
                  if (g) {
                    setExtendEditMode('edit');
                    setExtendEditSourceGroup(g);
                    setExtendEditOpen(true);
                  }
                }}
                renderSceneCard={(scene) => (
                  <SceneCard
                    scene={scene}
                    onUpdateImagePrompt={(id, prompt, promptZh) => updateSplitSceneImagePrompt(id, prompt, promptZh)}
                    onUpdateVideoPrompt={(id, prompt, promptZh) => updateSplitSceneVideoPrompt(id, prompt, promptZh)}
                    onUpdateEndFramePrompt={(id, prompt, promptZh) => updateSplitSceneEndFramePrompt(id, prompt, promptZh)}
                    onUpdateNeedsEndFrame={(id, needsEndFrame) => updateSplitSceneNeedsEndFrame(id, needsEndFrame)}
                    onUpdateEndFrame={handleUpdateEndFrame}
                    onUpdateCharacters={handleUpdateCharacters}
                    onUpdateCharacterVariationMap={handleUpdateCharacterVariationMap}
                    onUpdateEmotions={handleUpdateEmotions}
                    onUpdateShotSize={handleUpdateShotSize}
                    onUpdateDuration={handleUpdateDuration}
                    onUpdateAmbientSound={handleUpdateAmbientSound}
                    onUpdateSoundEffects={handleUpdateSoundEffects}
                    onUpdateSceneReference={(id, sceneLibId, viewpointId, refImage, subViewId) => updateSplitSceneReference(id, sceneLibId, viewpointId, refImage, subViewId)}
                    onUpdateEndFrameSceneReference={(id, sceneLibId, viewpointId, refImage, subViewId) => updateSplitSceneEndFrameReference(id, sceneLibId, viewpointId, refImage, subViewId)}
                    onDelete={handleDeleteScene}
                    onSaveToLibrary={handleSaveToLibrary}
                    onGenerateImage={handleGenerateSingleImage}
                    onGenerateVideo={handleGenerateSingleVideo}
                    onGenerateEndFrame={handleGenerateEndFrameImage}
                    onRemoveImage={handleRemoveImage}
                    onUploadImage={handleUploadImage}
                    onUpdateField={(id, field, value) => updateSplitSceneField(id, field, value)}
                    onAngleSwitch={handleAngleSwitchClick}
                    onQuadGrid={handleQuadGridClick}
                    onExtractVideoLastFrame={handleExtractVideoLastFrame}
                    onStopImageGeneration={handleStopImageGeneration}
                    onStopVideoGeneration={handleStopVideoGeneration}
                    onStopEndFrameGeneration={handleStopEndFrameGeneration}
                    isExtractingFrame={isExtractingFrame}
                    isAngleSwitching={isAngleSwitching}
                    isQuadGridGenerating={isQuadGridGenerating}
                    isGeneratingAny={isGenerating}
                  />
                )}
              />
            );
          })}
        </div>
      ) : (
        /* ========== ống kính đơnchế độ: 平铺 SceneCard ========== */
        <div className="flex flex-col gap-3">
          {splitScenes.map((scene) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              onUpdateImagePrompt={(id, prompt, promptZh) => updateSplitSceneImagePrompt(id, prompt, promptZh)}
              onUpdateVideoPrompt={(id, prompt, promptZh) => updateSplitSceneVideoPrompt(id, prompt, promptZh)}
              onUpdateEndFramePrompt={(id, prompt, promptZh) => updateSplitSceneEndFramePrompt(id, prompt, promptZh)}
              onUpdateNeedsEndFrame={(id, needsEndFrame) => updateSplitSceneNeedsEndFrame(id, needsEndFrame)}
              onUpdateEndFrame={handleUpdateEndFrame}
              onUpdateCharacters={handleUpdateCharacters}
              onUpdateCharacterVariationMap={handleUpdateCharacterVariationMap}
              onUpdateEmotions={handleUpdateEmotions}
              onUpdateShotSize={handleUpdateShotSize}
              onUpdateDuration={handleUpdateDuration}
              onUpdateAmbientSound={handleUpdateAmbientSound}
              onUpdateSoundEffects={handleUpdateSoundEffects}
              onUpdateSceneReference={(id, sceneLibId, viewpointId, refImage, subViewId) => updateSplitSceneReference(id, sceneLibId, viewpointId, refImage, subViewId)}
              onUpdateEndFrameSceneReference={(id, sceneLibId, viewpointId, refImage, subViewId) => updateSplitSceneEndFrameReference(id, sceneLibId, viewpointId, refImage, subViewId)}
              onDelete={handleDeleteScene}
              onSaveToLibrary={handleSaveToLibrary}
              onGenerateImage={handleGenerateSingleImage}
              onGenerateVideo={handleGenerateSingleVideo}
              onGenerateEndFrame={handleGenerateEndFrameImage}
              onRemoveImage={handleRemoveImage}
              onUploadImage={handleUploadImage}
              onUpdateField={(id, field, value) => updateSplitSceneField(id, field, value)}
              onAngleSwitch={handleAngleSwitchClick}
              onQuadGrid={handleQuadGridClick}
              onExtractVideoLastFrame={handleExtractVideoLastFrame}
              onStopImageGeneration={handleStopImageGeneration}
              onStopVideoGeneration={handleStopVideoGeneration}
              onStopEndFrameGeneration={handleStopEndFrameGeneration}
              isExtractingFrame={isExtractingFrame}
              isAngleSwitching={isAngleSwitching}
              isQuadGridGenerating={isQuadGridGenerating}
              isGeneratingAny={isGenerating}
            />
          ))}
        </div>
      )}

      {/* Action buttons — Hạng Scấp nhómTạo video */}
      {(() => {
        const scenesWithImages = splitScenes.filter(s => s.imageDataUrl).length;
        const scenesNeedVideo = splitScenes.filter(s => s.imageDataUrl && (s.videoStatus === 'idle' || s.videoStatus === 'failed')).length;
        const groupsNeedGen = shotGroups.filter(g => g.videoStatus === 'idle' || g.videoStatus === 'failed').length;
        const noImages = scenesWithImages === 0;
        return (
          <div className="flex gap-2 pt-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => {
                      if (sclassGenMode === 'group') {
                        // Hạng Scấp nhómTạo: gọi API Seedance 2.0 API 逐组Tạo
                        setIsGenerating(true);
                        setBatchProgress(null);
                        generateAllGroups((progress) => setBatchProgress(progress))
                          .finally(() => {
                            setIsGenerating(false);
                            setBatchProgress(null);
                          });
                      } else {
                        // ống kính đơnchế độ: Sử dụngĐạo diễnpanel原有逻辑
                        handleGenerateVideos();
                      }
                    }}
                    disabled={isGenerating || splitScenes.length === 0 || noImages}
                    className="flex-1"
                    size="lg"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {batchProgress
                          ? `Đang tạo (${batchProgress.completed}/${batchProgress.total})...`
                          : 'Đang tạo...'
                        }
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        {sclassGenMode === 'group'
                          ? `Seedance 2.0 cấp nhómTạo (${groupsNeedGen}/${shotGroups.length} 组)`
                          : `Tạo video (${scenesNeedVideo}/${splitScenes.length})`
                        }
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {noImages ? (
                    <p>请先为Phân cTạo ảnh ảnh，再Tạo video</p>
                  ) : sclassGenMode === 'group' ? (
                    <p>{groupsNeedGen} 组待Tạo，每组合并多Ống kính + @tham chiếu gọi API Seedance 2.0，逐组Khung hình cuối传递</p>
                  ) : (
                    <p>{scenesWithImages} Phân cảnhhiện cóảnh，{scenesNeedVideo} 待Tạo video</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {isGenerating && sclassGenMode === 'group' && (
              <Button
                variant="destructive"
                size="lg"
                onClick={abortSClassGeneration}
              >
                <Square className="h-4 w-4 mr-2" />
                Dừng
              </Button>
            )}
          </div>
        );
      })()}

      {/* Tips */}
      <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
        {sclassGenMode === 'group' ? (
          <p>💡 nhómchế độ：每组 2~4 Ống kính合并为一 video，TổngThời lượng ≤15s。Nhấp「重新nhóm」可重新Tự động分配。</p>
        ) : (
          <p>💡 ống kính đơnchế độ：每Ống kính独立Tạo一 video。NhấpPhân cảnh下方的văn bản区域可Chỉnh sửaprompt。</p>
        )}
      </div>
      </>
      )}

      {/* Angle Switch Dialog */}
      <AngleSwitchDialog
        open={angleSwitchOpen}
        onOpenChange={setAngleSwitchOpen}
        onGenerate={handleAngleSwitchGenerate}
        isGenerating={isAngleSwitching}
        frameType={angleSwitchTarget?.type || "start"}
        previewUrl={(() => {
          if (!angleSwitchTarget) return undefined;
          const scene = splitScenes.find(s => s.id === angleSwitchTarget.sceneId);
          return angleSwitchTarget.type === "start"
            ? scene?.imageDataUrl || undefined
            : scene?.endFrameImageUrl || undefined;
        })()}
        sameSceneShotsCount={0}
      />

      {/* Angle Switch Result Dialog */}
      <AngleSwitchResultDialog
        open={angleSwitchResultOpen}
        onOpenChange={setAngleSwitchResultOpen}
        result={angleSwitchResult}
        history={(() => {
          if (!angleSwitchTarget) return [];
          const scene = splitScenes.find(s => s.id === angleSwitchTarget.sceneId);
          return angleSwitchTarget.type === "start"
            ? (scene?.startFrameAngleSwitchHistory || [])
            : (scene?.endFrameAngleSwitchHistory || []);
        })()}
        selectedHistoryIndex={selectedHistoryIndex}
        onSelectHistory={setSelectedHistoryIndex}
        onApply={handleApplyAngleSwitch}
        onRegenerate={() => {
          setAngleSwitchResultOpen(false);
          setAngleSwitchOpen(true);
        }}
      />

      {/* Quad Grid Dialog */}
      <QuadGridDialog
        open={quadGridOpen}
        onOpenChange={setQuadGridOpen}
        onGenerate={handleQuadGridGenerate}
        isGenerating={isQuadGridGenerating}
        frameType={quadGridTarget?.type || "start"}
        previewUrl={(() => {
          if (!quadGridTarget) return undefined;
          const scene = splitScenes.find(s => s.id === quadGridTarget.sceneId);
          return quadGridTarget.type === "start"
            ? scene?.imageDataUrl || undefined
            : scene?.endFrameImageUrl || undefined;
        })()}
      />

      {/* Quad Grid Result Dialog */}
      <QuadGridResultDialog
        open={quadGridResultOpen}
        onOpenChange={setQuadGridResultOpen}
        result={quadGridResult}
        frameType={quadGridTarget?.type || "start"}
        currentSceneId={quadGridTarget?.sceneId ?? 0}
        availableScenes={splitScenes.map(s => ({ id: s.id, label: `Phân cảnh ${s.id + 1}` }))}
        onApply={handleApplyQuadGrid}
        onCopyToScene={handleCopyQuadGridToScene}
      />

      {/* videokéo dài/Chỉnh sửaChat框 */}
      <ExtendEditDialog
        open={extendEditOpen}
        onOpenChange={setExtendEditOpen}
        mode={extendEditMode}
        sourceGroup={extendEditSourceGroup}
        isGenerating={isGenerating}
        onConfirm={(childGroup) => {
          setIsGenerating(true);
          generateGroupVideo(childGroup).finally(() => setIsGenerating(false));
        }}
      />
    </div>
  );
}

