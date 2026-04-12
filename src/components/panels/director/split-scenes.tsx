// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Phân cảnh组件 (Split Scenes Component)
 * HiệnPhân cảnhcắtkết quả，Hỗ trợChỉnh sửaprompt、Tải lênKhung hình cuối、ChọnThư viện nhân vật、Thêm情绪Thẻ
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
import { useCharacterLibraryStore, type Character, type CharacterVariation } from "@/stores/character-library-store";
import { useScriptStore } from "@/stores/script-store";
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
  Plus,
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
import { callVideoGenerationApi, extractLastFrameFromVideo, isContentModerationError } from './use-video-generation';
import { persistSceneImage } from '@/lib/utils/image-persist';
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
import { SplitSceneCard } from "./split-scene-card";
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

// SceneCard 已移至 split-scene-card.tsx，此处Sử dụng SplitSceneCard
const SceneCard = SplitSceneCard;

const isHttpImageUrl = (value?: string | null): boolean => {
  return typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'));
};

const isLocalImageSource = (value?: string | null): value is string => {
  return typeof value === 'string' && value.length > 0 && !isHttpImageUrl(value);
};

const isDiscouragedExternalImageUrl = (value?: string | null): boolean => {
  if (!isHttpImageUrl(value)) return false;
  try {
    const hostname = new URL(value ?? '').hostname.toLowerCase();
    return hostname === 'bmp.ovh' || hostname.endsWith('.bmp.ovh');
  } catch {
    return false;
  }
};

const shouldRefreshImageViaCurrentHost = (localUrl?: string | null): boolean => {
  return isLocalImageSource(localUrl) && useAPIConfigStore.getState().isImageHostConfigured();
};

type ReferenceBucketKind = 'anchor' | 'character' | 'scene' | 'style';

type ReferenceBucket = {
  kind: ReferenceBucketKind;
  images: string[];
};

type SceneCharacterContext = {
  characterId: string;
  name: string;
  identityNotes: string[];
  referenceImages: string[];
};

const MAX_REFERENCE_IMAGES = 14;
const MAX_NANO_BANANA_REFERENCE_IMAGES = 6;
const NANO_BANANA_IDENTITY_MODELS = new Set([
  'nano-banana-pro',
  'gemini-3-pro-image-preview',
  'nano-banana-2',
  'gemini-3.1-pro-image-preview',
]);
const REFERENCE_BUCKET_PRIORITY: Record<ReferenceBucketKind, number> = {
  anchor: 0,
  character: 1,
  scene: 2,
  style: 3,
};

const normalizeCharacterIdentityText = (value?: string | null, maxLength = 96): string => {
  if (!value) return '';
  const normalized = value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-*•·]+/, '')
    .replace(/[;,，；。]+$/g, '')
    .trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
};

const isNanoBananaProModel = (model?: string | null): boolean => {
  const normalized = (model || '').trim().toLowerCase();
  return NANO_BANANA_IDENTITY_MODELS.has(normalized);
};

const optimizeReferenceImagesForModel = (
  model: string | undefined,
  buckets: ReferenceBucket[],
): string[] => {
  const orderedBuckets = isNanoBananaProModel(model)
    ? [...buckets].sort((left, right) => REFERENCE_BUCKET_PRIORITY[left.kind] - REFERENCE_BUCKET_PRIORITY[right.kind])
    : buckets;
  const limit = isNanoBananaProModel(model) ? MAX_NANO_BANANA_REFERENCE_IMAGES : MAX_REFERENCE_IMAGES;
  const refs: string[] = [];
  const seen = new Set<string>();

  for (const bucket of orderedBuckets) {
    for (const image of bucket.images) {
      if (!image || seen.has(image)) continue;
      seen.add(image);
      refs.push(image);
      if (refs.length >= limit) return refs;
    }
  }

  return refs;
};

const buildReferencePriorityHint = (model: string | undefined, hasCharacterReferences: boolean): string => {
  if (!isNanoBananaProModel(model) || !hasCharacterReferences) return '';
  return [
    'Reference priority:',
    'the earliest character references are canonical identity anchors;',
    'later references are only for scene, lighting, framing, and mood;',
    'later references must never override face-name-body identity.',
  ].join(' ');
};

const buildCharacterIdentityNotes = (
  character: Character,
  selectedVariation?: CharacterVariation,
): string[] => {
  const notes: string[] = [];
  const push = (value?: string | null, maxLength = 96) => {
    const normalized = normalizeCharacterIdentityText(value, maxLength);
    if (!normalized || notes.includes(normalized)) return;
    notes.push(normalized);
  };

  const anchors = character.identityAnchors;
  if (anchors) {
    const boneStructure = [anchors.faceShape, anchors.jawline, anchors.cheekbones].filter(Boolean).join(', ');
    const facialFeatures = [anchors.eyeShape, anchors.eyeDetails, anchors.noseShape, anchors.lipShape].filter(Boolean).join(', ');
    const hairDetails = [anchors.hairStyle, anchors.hairlineDetails].filter(Boolean).join(', ');
    const colorDetails = [
      anchors.colorAnchors?.iris ? `iris ${anchors.colorAnchors.iris}` : '',
      anchors.colorAnchors?.hair ? `hair ${anchors.colorAnchors.hair}` : '',
      anchors.colorAnchors?.skin ? `skin ${anchors.colorAnchors.skin}` : '',
      anchors.colorAnchors?.lips ? `lips ${anchors.colorAnchors.lips}` : '',
    ].filter(Boolean).join(', ');

    if (boneStructure) push(`bone structure ${boneStructure}`);
    if (facialFeatures) push(`facial features ${facialFeatures}`);
    if (anchors.uniqueMarks?.length) push(`unique marks ${anchors.uniqueMarks.slice(0, 2).join(', ')}`);
    if (hairDetails) push(`hair ${hairDetails}`);
    if (colorDetails) push(`color anchors ${colorDetails}`);
    if (anchors.skinTexture) push(`skin texture ${anchors.skinTexture}`);
  }

  if (notes.length < 4) push(character.appearance);
  if (notes.length < 4) push(character.visualTraits);
  if (notes.length < 4) push(character.description);
  if (notes.length < 4) push(character.role);

  if (selectedVariation) {
    const variationPrompt = selectedVariation.visualPromptZh || selectedVariation.visualPrompt || selectedVariation.name;
    push(`current outfit/state ${variationPrompt}`, 84);
  }

  return notes.slice(0, 4);
};

const buildCharacterIdentityBlock = (contexts: SceneCharacterContext[]): string => {
  if (contexts.length === 0) return '';

  const lines = ['Character identity lock:'];
  contexts.forEach((context) => {
    const summary = context.identityNotes.length > 0
      ? context.identityNotes.join('; ')
      : 'use the canonical earliest reference as the exact face/body identity anchor';
    lines.push(`- ${context.name}: ${summary}.`);
  });

  if (contexts.length > 1) {
    lines.push('Do not swap face identity, body identity, speaking ownership, or action ownership between named characters.');
  } else {
    lines.push('The named character must remain the exact same person in every output.');
  }

  return lines.join('\n');
};

const buildSceneCharacterCastLine = (contexts: SceneCharacterContext[]): string => {
  if (contexts.length === 0) return '';

  const names = contexts.map((context) => context.name).join(', ');
  if (contexts.length === 1) {
    return `Exact scene cast: ${names} only. Do not add any other person.`;
  }

  return `Exact scene cast: ${names}. Keep the face-name-body mapping exact for each named character and do not swap who performs or receives the action.`;
};

export function SplitScenes({ onBack, onGenerateVideos }: SplitScenesProps) {
  // ========== Tạo hợp nhất（lưới 9 ô）cục bộ UI Trạng thái ==========
  const [imageGenMode, setImageGenMode] = useState<'single' | 'merged'>('merged');
  const [frameMode, setFrameMode] = useState<'first' | 'last' | 'both'>('first');
  const [isMergedRunning, setIsMergedRunning] = useState(false);
  const [refStrategy, setRefStrategy] = useState<'cluster'|'minimal'|'none'>('cluster');
  const [useExemplar, setUseExemplar] = useState(true);
  const PAGE_CONCURRENCY = 2; // per-page concurrency cluster limit
  // Tạo hợp nhấtDừngđiều khiển
  const mergedAbortRef = useRef(false);
  // Khung hình đầu/video/Khung hình cuốiTạo的 AbortController（用于真正Hủy底层 fetch 和luân phiên）
  const imageAbortRef = useRef<AbortController | null>(null);
  const videoAbortRef = useRef<AbortController | null>(null);
  const endFrameAbortRef = useRef<AbortController | null>(null);
  // Tạo hợp nhất控件将在 JSX đang xử lý...染，Tránh闭包tham chiếu问题
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
  const [currentGeneratingId, setCurrentGeneratingId] = useState<number | null>(null);
  // Tab Trạng thái: Phân cảnhChỉnh sửa vs Trailer
  const [activeTab, setActiveTab] = useState<"editing" | "trailer">("editing");

  // 角度chuyển sangTrạng thái
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

  // 获取当前项mục đíchpromptNgôn ngữCài đặt（来自Kịch bảnpanel）
  const promptLanguage = useScriptStore(state => {
    const pid = state.activeProjectId;
    return pid ? state.projects[pid]?.promptLanguage : undefined;
  }) || 'vi';

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
  // Trailerdữ liệu - Trực tiếp从 splitScenes 筛选，保证chức nănggiống
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
  
  // 筛选TrailerPhân cảnh：通过 sceneName chứa "Trailer" quan trọng字来识别
  const trailerScenes = useMemo(() => {
    // 通过 sceneName chứa "Trailer" 来筛选
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
    addBlankSplitScene,
    resetStoryboard,
    // Trailerchức năng
    clearTrailer,
    // Phong cách quay phim档案
    setCinematographyProfileId,
  } = useDirectorStore();
  const mediaProjectId = activeProjectId || undefined;

  // Get current style from config
  // 优先Sử dụngTrực tiếp存储的 visualStyleId，回退到 styleTokens 反推（tương thích旧项目）
  // 未Cài đặt时为 null（不施加任何Phong cách），TránhMặc định强制 2D 吉卜力
  const currentStyleId = useMemo(() => {
    if (storyboardConfig.visualStyleId) {
      return storyboardConfig.visualStyleId;
    }
    // về sautương thích：将 styleTokens 合并后Khớp prompt 前缀
    if (storyboardConfig.styleTokens && storyboardConfig.styleTokens.length > 0) {
      const joinedTokens = storyboardConfig.styleTokens.join(', ');
      const found = VISUAL_STYLE_PRESETS.find(s => s.prompt.startsWith(joinedTokens));
      return found?.id || null;
    }
    return null;
  }, [storyboardConfig.visualStyleId, storyboardConfig.styleTokens]);

  // 读取当前Phong cách quay phim档案（未Cài đặt时Sử dụngMặc địnhCổ điển电影Phong cách quay phim）
  const currentCinProfileId = projectData?.cinematographyProfileId || DEFAULT_CINEMATOGRAPHY_PROFILE_ID;

  // chuyển sangPhong cách quay phim档案
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
      toast.success(`Đã áp dụng phong cách ${style.name}`);
    }
  }, [setStoryboardConfig]);

  // Update aspect ratio
  const handleAspectRatioChange = useCallback((ratio: '16:9' | '9:16') => {
    setStoryboardConfig({ aspectRatio: ratio });
    toast.success(`Đã chuyển sang chế độ ${ratio === '16:9' ? 'màn hình ngang' : 'màn hình dọc'}`);
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
      name: `Phân cảnh ${sceneId + 1} - AI Video`,
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
      name: `Phân cảnh ${sceneId + 1} - AI Ảnh`,
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
    toast.success(`Đã xóa phân cảnh ${sceneId + 1}`);
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

    // kiểm tra是否有下一Phân cảnh
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
      
      // 持久化到cục bộ + Lưu trữ ảnh
      const persistResult = await persistSceneImage(lastFrameBase64, nextScene.id, 'first');
      
      // 插入到下一Phân cảnh的Khung hình đầu
      updateSplitSceneImage(nextScene.id, persistResult.localPath, nextScene.width, nextScene.height, persistResult.httpUrl || undefined);
      toast.success(`Đã chèn khung hình cuối phân cảnh ${sceneId + 1} vào khung hình đầu phân cảnh ${nextScene.id + 1}`);
      
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
    imageAbortRef.current?.abort();
    imageAbortRef.current = null;
    updateSplitSceneImageStatus(sceneId, {
      imageStatus: 'idle',
      imageProgress: 0,
      imageError: 'Người dùng đã hủy',
    });
    setIsGenerating(false);
    setCurrentGeneratingId(null);
    toast.info(`Đã dừng tạo khung hình đầu phân cảnh ${sceneId + 1}`);
  }, [updateSplitSceneImageStatus]);

  // DừngTạo video
  const handleStopVideoGeneration = useCallback((sceneId: number) => {
    videoAbortRef.current?.abort();
    videoAbortRef.current = null;
    updateSplitSceneVideo(sceneId, {
      videoStatus: 'idle',
      videoProgress: 0,
      videoError: 'Người dùng đã hủy',
    });
    setIsGenerating(false);
    setCurrentGeneratingId(null);
    toast.info(`Đã dừng tạo video phân cảnh ${sceneId + 1}`);
  }, [updateSplitSceneVideo]);

  // DừngKhung hình cuốiTạo ảnh
  const handleStopEndFrameGeneration = useCallback((sceneId: number) => {
    endFrameAbortRef.current?.abort();
    endFrameAbortRef.current = null;
    updateSplitSceneEndFrameStatus(sceneId, {
      endFrameStatus: 'idle',
      endFrameProgress: 0,
      endFrameError: 'Người dùng đã hủy',
    });
    setIsGenerating(false);
    toast.info(`Đã dừng tạo khung hình cuối phân cảnh ${sceneId + 1}`);
  }, [updateSplitSceneEndFrameStatus]);

  // DừngTạo hợp nhất
  const handleStopMergedGeneration = useCallback(() => {
    mergedAbortRef.current = true;
    setIsMergedRunning(false);
    toast.info('Đã dừng tạo gộp');
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

      // 从 store 实时读取最新Trạng thái，Tránh闭包đang xử lý...litScenes chưa更新导致chỉ mục偏差
      const { activeProjectId, projects } = useDirectorStore.getState();
      const latestScenes = activeProjectId ? (projects[activeProjectId]?.splitScenes || []) : [];
      const updatedScene = latestScenes.find(s => s.id === angleSwitchTarget.sceneId);
      const history = angleSwitchTarget.type === "start"
        ? (updatedScene?.startFrameAngleSwitchHistory || [])
        : (updatedScene?.endFrameAngleSwitchHistory || []);
      setSelectedHistoryIndex(history.length - 1); // select the latest

      setAngleSwitchResult({
        originalImage,
        newImage: newImageUrl,
        angleLabel,
      });

      setAngleSwitchOpen(false);
      setAngleSwitchResultOpen(true);

      toast.success("Tạo chuyển góc nhìn hoàn tất");
    } catch (error) {
      toast.error(`Chuyển góc nhìn thất bại: ${(error as Error).message}`);
    } finally {
      setIsAngleSwitching(false);
    }
  }, [angleSwitchTarget, splitScenes, getProviderByPlatform, addAngleSwitchHistory]);

  // 根据情绪ThẻTạoBầu không khíMô tả - Sử dụng统一 prompt-builder 模块
  const buildEmotionDescription = useCallback((emotionTags: EmotionTag[]): string => {
    return buildEmotionDesc(emotionTags);
  }, []);

  const getSceneCharacterContexts = useCallback((
    characterIds: string[],
    variationMap?: Record<string, string>,
  ): SceneCharacterContext[] => {
    if (!characterIds?.length) return [];

    const { characters } = useCharacterLibraryStore.getState();

    return characterIds.flatMap((characterId) => {
      const character = characters.find((item) => item.id === characterId);
      if (!character) return [];

      const variationId = variationMap?.[characterId];
      const selectedVariation = variationId
        ? character.variations?.find((variation) => variation.id === variationId)
        : undefined;

      const referenceImages: string[] = [];
      const seen = new Set<string>();
      const pushRef = (value?: string | null) => {
        if (!value || seen.has(value)) return;
        seen.add(value);
        referenceImages.push(value);
      };

      pushRef(character.thumbnailUrl);
      pushRef(selectedVariation?.referenceImage);

      for (const view of character.views || []) {
        pushRef(view.imageBase64 || view.imageUrl);
      }

      for (const image of character.referenceImages || []) {
        pushRef(image);
      }

      for (const image of selectedVariation?.clothingReferenceImages || []) {
        pushRef(image);
      }

      return [{
        characterId,
        name: character.name || 'Unnamed character',
        identityNotes: buildCharacterIdentityNotes(character, selectedVariation),
        referenceImages: referenceImages.slice(0, MAX_REFERENCE_IMAGES),
      }];
    });
  }, []);

  // thu thậpNhân vậtẢnh tham chiếu - 必须在 handleQuadGridGenerate 之前定义
  const getCharacterReferenceImages = useCallback((
    characterIds: string[],
    variationMap?: Record<string, string>,
  ): string[] => {
    const contexts = getSceneCharacterContexts(characterIds, variationMap);
    if (contexts.length === 0) return [];

    const refs: string[] = [];
    const seen = new Set<string>();

    const maxDepth = contexts.reduce((depth, context) => Math.max(depth, context.referenceImages.length), 0);

    for (let index = 0; index < maxDepth; index += 1) {
      for (const context of contexts) {
        const image = context.referenceImages[index];
        if (!image || seen.has(image)) continue;
        seen.add(image);
        refs.push(image);
        if (refs.length >= MAX_REFERENCE_IMAGES) {
          return refs;
        }
      }
    }

    return refs.slice(0, MAX_REFERENCE_IMAGES);
  }, [getSceneCharacterContexts]);

  const getSceneIdentityLockLines = useCallback((
    scene: SplitScene,
    model?: string,
    hasCharacterRefs?: boolean,
  ): string[] => {
    const contexts = getSceneCharacterContexts(scene.characterIds || [], scene.characterVariationMap);
    if (contexts.length === 0) return [];

    const lines: string[] = [];
    const castLine = buildSceneCharacterCastLine(contexts);
    const resolvedHasCharacterRefs = hasCharacterRefs ?? contexts.some((context) => context.referenceImages.length > 0);

    if (castLine) {
      lines.push(castLine);
    }

    const identityBlock = buildCharacterIdentityBlock(contexts);
    if (identityBlock) {
      lines.push(...identityBlock.split('\n'));
    }

    const priorityHint = buildReferencePriorityHint(model, resolvedHasCharacterRefs);
    if (priorityHint) {
      lines.push(priorityHint);
    }

    return lines;
  }, [getSceneCharacterContexts]);

  const buildPromptWithIdentityLock = useCallback((
    basePrompt: string,
    scene: SplitScene,
    model?: string,
    hasCharacterRefs?: boolean,
  ): string => {
    const prompt = basePrompt.trim();
    const identityLines = getSceneIdentityLockLines(scene, model, hasCharacterRefs);
    if (identityLines.length === 0) return prompt;

    return [prompt, identityLines.join('\n')].filter(Boolean).join('\n\n');
  }, [getSceneIdentityLockLines]);

  const processReferenceImagesForApi = useCallback(async (
    referenceImages: string[],
    logPrefix: string,
  ): Promise<string[]> => {
    const processedRefs: string[] = [];

    for (const url of referenceImages) {
      if (!url) continue;

      if (url.startsWith('http://') || url.startsWith('https://')) {
        processedRefs.push(url);
      } else if (url.startsWith('data:image/') && url.includes(';base64,')) {
        processedRefs.push(url);
      } else if (url.startsWith('local-image://')) {
        try {
          const base64 = await readImageAsBase64(url);
          if (base64 && base64.startsWith('data:image/') && base64.includes(';base64,')) {
            processedRefs.push(base64);
          }
        } catch (error) {
          console.warn(`${logPrefix} Failed to read local image:`, url, error);
        }
      }
    }

    return processedRefs;
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
      toast.error('Vui lòng cấu hình API tạo ảnh trong Cài đặt trước');
      setQuadGridOpen(false);
      return;
    }
    
    const keyManager = featureConfig.keyManager;
    const apiKey = keyManager.getCurrentKey() || '';
    if (!apiKey) {
      toast.error('Vui lòng cấu hình ánh xạ dịch vụ tạo ảnh trong Cài đặt trước');
      setQuadGridOpen(false);
      return;
    }
    const platform = featureConfig.platform;
    const model = featureConfig.models?.[0];
    if (!model) {
      toast.error('Vui lòng cấu hình model tạo ảnh trong Cài đặt trước');
      setQuadGridOpen(false);
      return;
    }
    const imageBaseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
    if (!imageBaseUrl) {
      toast.error('Vui lòng cấu hình ánh xạ dịch vụ tạo ảnh trong Cài đặt trước');
      setQuadGridOpen(false);
      return;
    }
    
    console.log('[QuadGrid] Using image config:', { platform, model, imageBaseUrl });

    setIsQuadGridGenerating(true);
    // 不在这里ĐóngChat框，giữMởHiệnTiến độ
    // setQuadGridOpen(false) 移到Tạo thành công后

    try {
      // Build variation labels based on type
      const variationLabels = variationType === 'angle'
        ? ['Hơi trái', 'Hơi phải', 'Cận mặt', 'Toàn cảnh từ trên']
        : variationType === 'composition'
          ? ['Toàn thân xa', 'Nửa người', 'Cận mặt', 'Giới thiệu môi trường']
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
      const sceneCharacterContexts = getSceneCharacterContexts(scene.characterIds || [], scene.characterVariationMap);
      const sceneCharacterRefs = useCharacterRef
        ? getCharacterReferenceImages(scene.characterIds || [], scene.characterVariationMap)
        : [];
      const hasCharacterRefs = sceneCharacterContexts.some((context) => context.referenceImages.length > 0);

      // === nhân vậtsố lượng约束 ===
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

      // === Dọcbố cục约束（与lưới 9 ôgiống） ===
      const verticalConstraint = aspect === '9:16' ? 'vertical composition, tighter framing, avoid letterboxing, ' : '';

      // === Hành độngMô tả（对时刻biến thể重要） ===
      const actionDesc = scene.actionSummary?.trim() || '';
      const actionContext = (variationType === 'moment' && actionDesc) 
        ? `Action sequence context: ${actionDesc}. ` 
        : '';

      // === 情绪Bầu không khí（giữgiống性） ===
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
      
      // 每panel的Mô tả（chứanhân vậtsố lượng约束）
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
      
      // === giống性键字组（与 buildAnchorPhrase giống） ===
      gridPromptParts.push('Keep character appearance, wardrobe and facial features consistent across all 4 panels.');
      gridPromptParts.push('Keep lighting and color grading consistent across all 4 panels.');
      gridPromptParts.push('IMPORTANT: NO TEXT, NO WORDS, NO LETTERS, NO CAPTIONS, NO SPEECH BUBBLES, NO DIALOGUE BOXES, NO SUBTITLES, NO WRITING of any kind in any panel.');

      const gridPrompt = buildPromptWithIdentityLock(gridPromptParts.join(' '), scene, model, hasCharacterRefs);
      console.log('[QuadGrid] Grid prompt:', gridPrompt.substring(0, 200) + '...');

      const optimizedRefs = optimizeReferenceImagesForModel(model, [
        { kind: 'anchor', images: [sourceImage] },
        { kind: 'character', images: sceneCharacterRefs },
        { kind: 'scene', images: scene.sceneReferenceImage ? [scene.sceneReferenceImage] : [] },
      ]);
      const apiReferenceImages = await processReferenceImagesForApi(optimizedRefs, '[QuadGrid]');

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

      // Parse result helper（用于luân phiênGiai đoạn）
      const normalizeUrl = (url: any): string | undefined => {
        if (!url) return undefined;
        if (Array.isArray(url)) return url[0] || undefined;
        if (typeof url === 'string') return url;
        return undefined;
      };

      // gọi API API - Sử dụngthông minh路由（Tự độngChọn chat completions hoặc images/generations）
      console.log('[QuadGrid] Calling API, model:', model);
      const apiResult = await submitGridImageRequest({
        model,
        prompt: gridPrompt,
        apiKey,
        baseUrl: imageBaseUrl,
        aspectRatio: aspect,
        resolution: storyboardConfig.resolution || '2K',
        referenceImages: apiReferenceImages.length > 0
          ? apiReferenceImages
          : (processedRefs.length > 0 ? processedRefs : undefined),
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
          
          if (!statusResp.ok) throw new Error(`Truy vấn tác vụ thất bại: ${statusResp.status}`);
          
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
        variationType: variationType === 'angle' ? 'Góc nhìn biến thể' : variationType === 'composition' ? 'Biến thể bố cục' : 'Biến thể khoảnh khắc',
        variationLabels,
      });
      
      // Tự độngLưuTất cảLưới 4 ôảnh到Thư viện phương tiện
      const folderId = getImageFolderId();
      const variationTypeLabel = variationType === 'angle' ? 'Góc nhìn biến thể' : variationType === 'composition' ? 'Biến thể bố cục' : 'Biến thể khoảnh khắc';
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
      toast.success('Tạo lưới 4 ô hoàn tất, đã tự động lưu vào thư viện');

    } catch (error) {
      const err = error as Error;
      console.error('[QuadGrid] Failed:', err);
      toast.error(`Tạo lưới 4 ô thất bại: ${err.message}`);
    } finally {
      setIsQuadGridGenerating(false);
    }
  }, [
    quadGridTarget,
    splitScenes,
    storyboardConfig,
    buildEmotionDescription,
    getSceneCharacterContexts,
    getCharacterReferenceImages,
    buildPromptWithIdentityLock,
    processReferenceImagesForApi,
    getImageFolderId,
    addMediaFromUrl,
    mediaProjectId,
  ]);

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
    toast.success(`Đã áp dụng vào ${quadGridTarget.type === "start" ? "khung hình đầu" : "khung hình cuối"}`);
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

    toast.success(`Đã sao chép vào ${targetFrameType === "start" ? "khung hình đầu" : "khung hình cuối"} phân cảnh ${targetSceneId + 1}`);
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
      toast.error("Không thể tạo gợi ý: thiếu storyboard hoặc phân cảnh");
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
    toast.info("Đang tạo gợi ý dựa trên nội dung phân cảnh...");

    try {
      // Get story prompt from storyboard config
      const storyPrompt = storyboardConfig.storyPrompt || "Phân cảnh video";

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

      toast.success(`Đã tạo thành công gợi ý cho ${updatedCount} phân cảnh (${endFrameCount} cần khung hình cuối)`);
    } catch (error) {
      const err = error as Error;
      console.error("[SplitScenes] Prompt generation failed:", err);
      toast.error(`Tạo thất bại: ${err.message}`);
    } finally {
      setIsGeneratingPrompts(false);
    }
  }, [storyboardImage, splitScenes, storyboardConfig, getApiKey, updateSplitSceneImagePrompt, updateSplitSceneVideoPrompt, updateSplitSceneEndFramePrompt, updateSplitSceneNeedsEndFrame]);


  // Generate video for a single scene - directly calls API with key rotation
  const handleGenerateSingleVideo = useCallback(async (sceneId: number) => {
    const scene = splitScenes.find(s => s.id === sceneId);
    if (!scene) return;

    // Debug: Check API store state
    const apiStore = useAPIConfigStore.getState();
    if (process.env.NODE_ENV === 'development') {
      console.log('[SplitScenes] API Store state:', {
        providers: apiStore.providers.length,
        apiKeys: Object.keys(apiStore.apiKeys),
        memefastKey: apiStore.apiKeys['memefast'] ? 'set' : 'not set',
        getApiKey_memefast: apiStore.getApiKey('memefast') ? 'set' : 'not set',
      });
    }

    // Use feature router with key rotation support
    const featureConfig = getFeatureConfig('video_generation');
    if (process.env.NODE_ENV === 'development') {
      console.log('[SplitScenes] Feature config for video_generation:', featureConfig ? {
        platform: featureConfig.platform,
        model: featureConfig.models?.[0],
        apiKey: featureConfig.apiKey ? `${featureConfig.apiKey.substring(0, 8)}...` : 'empty',
        providerId: featureConfig.provider?.id,
      } : 'null');
    }
    
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('video_generation'));
      return;
    }
    
    // 从ánh xạ dịch vụ获取 platform 和 model
    const platform = featureConfig.platform;
    const model = featureConfig.models?.[0];
    if (!model) {
      toast.error('Vui lòng cấu hình model tạo video trong Cài đặt trước');
      return;
    }
    const videoBaseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
    if (!videoBaseUrl) {
      toast.error('Vui lòng cấu hình ánh xạ dịch vụ tạo video trong Cài đặt trước');
      return;
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[SplitScenes] Using video config:', { platform, model, videoBaseUrl });
    }
    
    // Get rotating key from manager
    const keyManager = featureConfig.keyManager;
    const apiKey = keyManager.getCurrentKey() || '';
    if (!apiKey) {
      toast.error(`Vui lòng cấu hình trước ${platform} API Key`);
      return;
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[SplitScenes] Using API key ${keyManager.getTotalKeyCount()} keys, current index available: ${keyManager.getAvailableKeyCount()}`);
    }

    setIsGenerating(true);
    setCurrentGeneratingId(sceneId);

    // Tạo本次Tạo video的 AbortController，Dừngnút可通过 videoAbortRef.current.abort() Hủy
    const videoController = new AbortController();
    videoAbortRef.current = videoController;

    try {
      // Reset and start
      updateSplitSceneVideo(sceneId, {
        videoStatus: 'uploading',
        videoProgress: 0,
        videoError: null,
        videoUrl: null,
      });

      // Khung hình đầuảnhChọn逻辑：
      // 1. 如果cục bộ持久化ảnh存在且Đã cấu hìnhLưu trữ ảnh，luôn优先Sử dụngcục bộ图lạiTải lên到当前Lưu trữ ảnh
      // 2. 否则仅在 imageSource === 'ai-generated' 且hiện cóKhả dụng HTTP URL 时复用该 URL
      // 3. 其余情况Sử dụng imageDataUrl，并在后续chuyển đổi thành HTTP URL
      let firstFrameUrl = scene.imageDataUrl || (isHttpImageUrl(scene.imageHttpUrl) ? scene.imageHttpUrl : '');
      const hasValidHttpUrl = isHttpImageUrl(scene.imageHttpUrl);
      const shouldRefreshFirstFrame = shouldRefreshImageViaCurrentHost(scene.imageDataUrl);

      if (isLocalImageSource(scene.imageDataUrl)) {
        if (shouldRefreshFirstFrame) {
          if (hasValidHttpUrl) {
            console.log(
              `[SplitScenes] Using local first frame and refreshing via configured image host${isDiscouragedExternalImageUrl(scene.imageHttpUrl) ? ' (skipping discouraged external URL)' : ''}:`,
              scene.imageHttpUrl!.substring(0, 60)
            );
          } else {
            console.log('[SplitScenes] Using local first frame and uploading to configured image host');
          }
          firstFrameUrl = scene.imageDataUrl;
        } else if (hasValidHttpUrl && scene.imageSource === 'ai-generated') {
          // 没有可用Lưu trữ ảnh时，才回退到hiện có的 HTTP URL
          console.log('[SplitScenes] Using imageHttpUrl for AI-generated image:', scene.imageHttpUrl!.substring(0, 60));
          firstFrameUrl = scene.imageHttpUrl!;
        } else {
          console.log(
            '[SplitScenes] Using imageDataUrl (will upload to image host):',
            hasValidHttpUrl ? 'has old httpUrl but imageSource=' + scene.imageSource : 'no valid httpUrl'
          );
        }
      }
      
      if (!firstFrameUrl) {
        toast.error(`Phân cảnh ${sceneId + 1} chưa có ảnh khung hình đầu, vui lòng tạo ảnh trước`);
        setIsGenerating(false);
        setCurrentGeneratingId(null);
        return;
      }
      console.log('[SplitScenes] First frame source:', firstFrameUrl.startsWith('http') ? 'HTTP URL' : 'local/base64');
      
      // 仅当 needsEndFrame 为 true 时才Sử dụngKhung hình cuối
      // 如果người dùngđã xóaKhung hình cuốihoặcĐóng了Khung hình cuối开关，则不Sử dụngKhung hình cuối作为Tạo video的Tham chiếu
      let lastFrameUrl: string | null | undefined = null;
      if (scene.needsEndFrame && (scene.endFrameImageUrl || scene.endFrameHttpUrl)) {
        const shouldRefreshEndFrame = shouldRefreshImageViaCurrentHost(scene.endFrameImageUrl);
        if (shouldRefreshEndFrame && scene.endFrameImageUrl) {
          lastFrameUrl = scene.endFrameImageUrl;
          console.log(
            `[SplitScenes] Using local end frame and refreshing via configured image host${isDiscouragedExternalImageUrl(scene.endFrameHttpUrl) ? ' (skipping discouraged external URL)' : ''}`
          );
        } else {
          lastFrameUrl = scene.endFrameImageUrl || scene.endFrameHttpUrl;
          console.log('[SplitScenes] Using end frame for video generation');
        }
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

      // Convert local/base64 image to HTTP URL for API
      // Video API requires HTTP URLs, not base64
      const convertToHttpUrl = async (
        rawUrl: any,
        options?: { localFallback?: string | null; frameLabel?: string }
      ): Promise<string> => {
        const url = normalizeUrl(rawUrl);
        const localFallback = normalizeUrl(options?.localFallback);
        const frameLabel = options?.frameLabel || 'Frame';
        if (!url) {
          console.warn('[SplitScenes] convertToHttpUrl received invalid url:', rawUrl);
          return '';
        }
        
        // Already HTTP URL - use directly
        if (isHttpImageUrl(url)) {
          if (shouldRefreshImageViaCurrentHost(localFallback)) {
            console.log(
              `[SplitScenes] ${frameLabel}: refreshing via configured image host instead of reusing existing HTTP URL${isDiscouragedExternalImageUrl(url) ? ' (discouraged external host)' : ''}:`,
              url.substring(0, 60)
            );
            return convertToHttpUrl(localFallback, { frameLabel });
          }
          if (isDiscouragedExternalImageUrl(url)) {
            console.warn(`[SplitScenes] ${frameLabel}: using discouraged external URL because no local fallback is available:`, url.substring(0, 60));
          } else {
            console.log('[SplitScenes] Using existing HTTP URL:', url.substring(0, 60));
          }
          return url;
        }
        
        // For base64 or local images, we need to upload to image host
        try {
          // Check if image host is configured
          if (!isImageHostConfigured()) {
            console.warn('[SplitScenes] Image host not configured. Please configure an image host in settings.');
            throw new Error('Lưu trữ ảnh chưa được cấu hình, vui lòng cài đặt Catbox hoặc dịch vụ lưu trữ ảnh khả dụng trong Cài đặt');
          }
          
          let imageData = url;
          
          // For local-image:// protocol, read the image first
          if (url.startsWith('local-image://')) {
            const fullBase64 = await readImageAsBase64(url);
            if (!fullBase64) {
              console.warn('[SplitScenes] Failed to read local image:', url);
              return '';
            }
            imageData = fullBase64;
          }
          
          // Upload to configured image host
          console.log('[SplitScenes] Uploading image to image host...');
          const uploadResult = await uploadToImageHost(imageData, {
            name: `scene_${sceneId}_frame_${Date.now()}`,
            expiration: 15552000, // 180 days
          });
          
          if (uploadResult.success && uploadResult.url) {
            console.log('[SplitScenes] Uploaded image to image host:', uploadResult.url.substring(0, 60));
            return uploadResult.url;
          } else {
            console.warn('[SplitScenes] Image upload failed:', uploadResult.error);
            throw new Error(uploadResult.error || 'Tải ảnh thất bại');
          }
        } catch (e) {
          console.warn('[SplitScenes] Failed to upload image:', e);
          throw e;
        }
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
      
      const firstFrameConverted = await convertToHttpUrl(normalizedFirstFrame, {
        localFallback: scene.imageDataUrl,
        frameLabel: 'First frame',
      });
      if (!firstFrameConverted) {
        throw new Error('Không thể lấy HTTP URL của ảnh Khung hình đầu, vui lòng Tạo lại ảnh');
      }
      imageWithRoles.push({ url: firstFrameConverted, role: 'first_frame' });
      console.log('[SplitScenes] First frame HTTP URL:', firstFrameConverted.substring(0, 60));

      // Last frame (optional)
      if (lastFrameUrl) {
        const lastFrameConverted = await convertToHttpUrl(lastFrameUrl, {
          localFallback: scene.endFrameImageUrl,
          frameLabel: 'Last frame',
        });
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
        undefined,  // videoRefs
        undefined,  // audioRefs
        undefined,  // enableAudio
        undefined,  // cameraFixed
        videoController.signal,
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
            
            // 持久化到cục bộfile系统（local-image://），Tránh base64 被 partialize 清除
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

      // người dùng主动Hủy：abort() 触发的 AbortError hoặcTùy chỉnh 'Người dùng đã hủy'
      if (err.name === 'AbortError' || err.message === 'Người dùng đã hủy') {
        console.log(`[SplitScenes] Scene ${sceneId} video generation cancelled by user`);
        setIsGenerating(false);
        setCurrentGeneratingId(null);
        return;
      }

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
        toast.warning(`Phân cảnh ${sceneId + 1} bị bỏ qua do kiểm duyệt nội dung`);
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

  // Handle generate videos - serial processing based on concurrency
  // 复用 handleGenerateSingleVideo 的统一 API gọi API逻辑，TránhSử dụngkhông tồn tại的 /api/ai/video 端点
  const handleGenerateVideos = useCallback(async () => {
    if (splitScenes.length === 0) {
      toast.error("Không có phân cảnh nào để Tạo");
      return;
    }

    const featureConfig = getFeatureConfig('video_generation');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('video_generation'));
      return;
    }

    // Check if all scenes have prompts
    const scenesWithoutPrompts = splitScenes.filter(
      s => !(s.videoPromptZh?.trim() || s.videoPrompt?.trim())
    );
    if (scenesWithoutPrompts.length > 0) {
      toast.warning(`Còn ${scenesWithoutPrompts.length} phân cảnh chưa có gợi ý, sẽ dùng gợi ý mặc định`);
    }

    // Filter scenes that need generation (idle or failed)
    const scenesToGenerate = splitScenes.filter(
      s => s.videoStatus === 'idle' || s.videoStatus === 'failed'
    );

    if (scenesToGenerate.length === 0) {
      toast.info("Tất cả phân cảnh đã tạo hoặc đang tạo...
      return;
    }

    setIsGenerating(true);
    toast.info(`Bắt đầu tạo tuần tự ${scenesToGenerate.length} video... mỗi lần xử lý ${concurrency}`);

    let successCount = 0;
    const totalCount = scenesToGenerate.length;

    // Process scenes sequentially (serial) or with limited concurrency
    // 逐gọi API handleGenerateSingleVideo，复用其đầy đủ的 API gọi API逻辑
    for (let i = 0; i < scenesToGenerate.length; i += concurrency) {
      const batch = scenesToGenerate.slice(i, i + concurrency);
      
      await Promise.all(batch.map(async (scene) => {
        try {
          await handleGenerateSingleVideo(scene.id);
          successCount++;
        } catch (error) {
          // handleGenerateSingleVideo 内部已处理lỗi和 toast，这里仅做计数
          console.error(`[SplitScenes] Batch: Scene ${scene.id} video generation failed:`, error);
        }
      }));
    }

    setIsGenerating(false);
    setCurrentGeneratingId(null);
    
    if (successCount === totalCount) {
      toast.success("Tất cả video đã tạo xong!");
    } else if (successCount > 0) {
      toast.info(`${successCount}/${totalCount} Tạo video hoàn tất，${totalCount - successCount} Thất bại`);
    }
  }, [splitScenes, concurrency, handleGenerateSingleVideo]);

  // Generate image for a single scene using image API
  const handleGenerateSingleImage = useCallback(async (sceneId: number) => {
    const scene = splitScenes.find(s => s.id === sceneId);
    if (!scene) return;

    // Sử dụngánh xạ dịch vụ配置 - 不再 fallback 到硬编码
    const featureConfig = getFeatureConfig('character_generation');
    if (!featureConfig) {
      toast.error('Vui lòng cấu hình ánh xạ dịch vụ tạo ảnh trong Cài đặt trước');
      return;
    }
    
    const keyManager = featureConfig.keyManager;
    const apiKey = keyManager.getCurrentKey() || '';
    if (!apiKey) {
      toast.error('Vui lòng cấu hình ánh xạ dịch vụ tạo ảnh trong Cài đặt trước');
      return;
    }
    const platform = featureConfig.platform;
    const model = featureConfig.models?.[0];
    if (!model) {
      toast.error('Vui lòng cấu hình model tạo ảnh trong Cài đặt trước');
      return;
    }
    
    const imageBaseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
    if (!imageBaseUrl) {
      toast.error('Vui lòng cấu hình ánh xạ dịch vụ tạo ảnh trong Cài đặt trước');
      return;
    }
    
    console.log('[SingleImage] Using config:', { platform, model, imageBaseUrl });

    // Need a prompt to generate - prefer imagePromptZh (first frame static), fallback to videoPromptZh
    const promptToUse = scene.imagePromptZh?.trim() || scene.imagePrompt?.trim() 
      || scene.videoPromptZh?.trim() || scene.videoPrompt?.trim() || '';
    if (!promptToUse) {
      toast.warning("Vui lòng điền Gợi ý Khung hình đầu trước khi Tạo ảnh");
      return;
    }

    setIsGenerating(true);
    // Tạo本次Tạo的 AbortController，Dừngnút可通过 imageAbortRef.current.abort() Hủy
    const imageController = new AbortController();
    imageAbortRef.current = imageController;
    const imageSignal = imageController.signal;

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
      const sceneCharacterContexts = getSceneCharacterContexts(scene.characterIds || [], scene.characterVariationMap);
      const sceneCharacterRefs = getCharacterReferenceImages(scene.characterIds || [], scene.characterVariationMap);
      const fallbackCharacterRefs = sceneCharacterContexts.length === 0
        ? (storyboardConfig.characterReferenceImages || [])
        : [];
      const hasCharacterRefs = sceneCharacterRefs.length > 0;
      enhancedPrompt = buildPromptWithIdentityLock(enhancedPrompt, scene, model, hasCharacterRefs);

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

      const optimizedReferenceImages = optimizeReferenceImagesForModel(model, [
        { kind: 'scene', images: scene.sceneReferenceImage ? [scene.sceneReferenceImage] : [] },
        { kind: 'character', images: sceneCharacterRefs.length > 0 ? sceneCharacterRefs : fallbackCharacterRefs },
        { kind: 'style', images: storyboardImage ? [storyboardImage] : [] },
      ]);
      const apiReferenceImages = await processReferenceImagesForApi(optimizedReferenceImages, '[SingleImage]');

      console.log('[SplitScenes] Generating image:', {
        sceneId,
        prompt: enhancedPrompt.substring(0, 100),
        characterRefCount: optimizedReferenceImages.length,
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
        referenceImages: apiReferenceImages.length > 0
          ? apiReferenceImages
          : (processedRefs.length > 0 ? processedRefs : undefined),
        keyManager,
        signal: imageSignal,
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
        updateSplitSceneImage(sceneId, persistResult.localPath, scene.width, scene.height, persistResult.httpUrl || undefined);
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
            signal: imageSignal,
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
            
            // 持久化到cục bộ + Lưu trữ ảnh
            const persistResult = await persistSceneImage(imageUrl, sceneId, 'first');
            updateSplitSceneImage(sceneId, persistResult.localPath, scene.width, scene.height, persistResult.httpUrl || undefined);
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

          await new Promise<void>((resolve, reject) => {
            const tid = setTimeout(resolve, pollInterval);
            imageSignal.addEventListener('abort', () => { clearTimeout(tid); reject(new Error('Người dùng đã hủy')); }, { once: true });
          });
        }
        throw new Error('Tạo ảnh quá thời gian chờ');
      }

      throw new Error('Invalid API response: no image URL or task ID');
    } catch (error) {
      const err = error as Error;

      // người dùng主动Hủy：abort() 触发的 AbortError hoặcTùy chỉnh 'Người dùng đã hủy'
      if (err.name === 'AbortError' || err.message === 'Người dùng đã hủy') {
        console.log(`[SplitScenes] Scene ${sceneId} image generation cancelled by user`);
        setIsGenerating(false);
        return;
      }

      console.error(`[SplitScenes] Scene ${sceneId} image generation failed:`, err);
      updateSplitSceneImageStatus(sceneId, {
        imageStatus: 'failed',
        imageProgress: 0,
        imageError: err.message,
      });
      toast.error(`Phân cảnh ${sceneId + 1} Tạo ảnh thất bại: ${err.message}`);
    }

    setIsGenerating(false);
  }, [
    splitScenes,
    storyboardConfig,
    storyboardImage,
    currentStyleId,
    updateSplitSceneImage,
    updateSplitSceneImageStatus,
    autoSaveImageToLibrary,
    getSceneCharacterContexts,
    getCharacterReferenceImages,
    buildPromptWithIdentityLock,
    processReferenceImagesForApi,
  ]);

  // ===== Utilities for Tạo hợp nhất（lưới 9 ô） =====
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
    
    // nhân vậtsố lượng约束：根据 characterIds số lượng明确指定，防止ModelTạo多余nhân vật
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
      toast.error('Vui lòng cấu hình ánh xạ dịch vụ tạo ảnh trong Cài đặt trước');
      return;
    }
    
    const keyManager = featureConfig.keyManager;
    const apiKey = keyManager.getCurrentKey() || '';
    if (!apiKey) {
      toast.error('Vui lòng cấu hình ánh xạ dịch vụ tạo ảnh trong Cài đặt trước');
      return;
    }
    const platform = featureConfig.platform;
    const model = featureConfig.models?.[0];
    if (!model) {
      toast.error('Vui lòng cấu hình model tạo ảnh trong Cài đặt trước');
      return;
    }
    const imageBaseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
    if (!imageBaseUrl) {
      toast.error('Vui lòng cấu hình ánh xạ dịch vụ tạo ảnh trong Cài đặt trước');
      return;
    }
    
    console.log('[MergedGen] Using config:', { platform, model, imageBaseUrl });

    setIsMergedRunning(true);
    mergedAbortRef.current = false; // Đặt lại cờ Dừng
    console.log('[MergedGen] Bắt đầu Tạo gộp lưới 9 ô, chế độ:', mode, 'strategy:', strategy, 'exemplar:', exemplar);

    const aspect = storyboardConfig.aspectRatio || '9:16';
    const styleTokens = storyboardConfig.styleTokens || [];
    // luônSử dụng getStylePrompt 获取đầy đủPhong cáchprompt（保证有Mặc định值，即使 styleTokens 为空）
    const fullStylePrompt = getStylePrompt(currentStyleId);
    const fullStyleNegative = getStyleNegativePrompt(currentStyleId);
    const dedup = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));

    // === 统一nhiệm vụ cột表方案：Hỗ trợ混合lưới 9 ô ===
    // nhiệm vụLoại定义
    type GridTask = { scene: SplitScene; type: 'first' | 'end' };
    
    // Quan trọng:videođã tạo的Phân cảnh视为hoàn thành，不需要再TạoKhung hình đầuhoặcKhung hình cuối
    const isSceneCompleted = (s: SplitScene) => s.videoUrl || s.videoStatus === 'completed';

    // 构建nhiệm vụ cột表（根据người dùngChọn的 mode）
    const tasks: GridTask[] = [];
    for (const scene of splitScenes) {
      if (isSceneCompleted(scene)) continue; // Video đã hoàn thành, bỏ qua
      
      // 仅Khung hình đầu hoặc 首+尾：kiểm tra是否需要Khung hình đầu
      if ((mode === 'first' || mode === 'both') && !scene.imageDataUrl) {
        tasks.push({ scene, type: 'first' });
      }
      
      // 仅Khung hình cuối hoặc 首+尾：kiểm tra是否Bắt buộc Khung hình cuối
      if ((mode === 'last' || mode === 'both') && scene.needsEndFrame && !scene.endFrameImageUrl) {
        tasks.push({ scene, type: 'end' });
      }
    }

    // kiểm tra是否有需要Tạo的
    if (tasks.length === 0) {
      toast.info('Tất cả phân cảnh đã tạo hoàn tất, không cần tạo lại');
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

    // nhiệm vụphân trang（每9nhiệm vụ一页，混合Khung hình đầu和Khung hình cuối）
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
      // khử trùng并限制số lượng（API 限制 14 张）
      return dedup(refs).slice(0, strategy === 'minimal' ? 2 : 14);
    };

    // 根据Phân cảnhsố lượng计算最优lướibố cục（强制 N x N 以保证Tỷ lệgiống性）
    const collectOptimizedRefsFromTasks = (pageTasks: GridTask[]): string[] => {
      if (strategy === 'none') return [];

      const sceneRefs: string[] = [];
      const characterRefs: string[] = [];
      const anchorRefs: string[] = [];
      const seenScenes = new Set<number>();

      for (const task of pageTasks) {
        if (seenScenes.has(task.scene.id)) continue;
        seenScenes.add(task.scene.id);

        const sceneRef = task.type === 'end'
          ? (task.scene.endFrameSceneReferenceImage || task.scene.sceneReferenceImage)
          : task.scene.sceneReferenceImage;
        if (sceneRef) {
          sceneRefs.push(sceneRef);
        }

        if (task.scene.characterIds?.length) {
          characterRefs.push(...getCharacterReferenceImages(task.scene.characterIds, task.scene.characterVariationMap));
        }

        if (exemplar) {
          const anchorImage = task.type === 'end'
            ? (task.scene.imageDataUrl || task.scene.imageHttpUrl || undefined)
            : (task.scene.endFrameImageUrl || task.scene.endFrameHttpUrl || undefined);
          if (anchorImage) {
            anchorRefs.push(anchorImage);
          }
        }
      }

      const optimizedRefs = optimizeReferenceImagesForModel(model, [
        { kind: 'anchor', images: dedup(anchorRefs) },
        { kind: 'character', images: dedup(characterRefs) },
        { kind: 'scene', images: dedup(sceneRefs) },
      ]);

      return strategy === 'minimal' ? optimizedRefs.slice(0, 2) : optimizedRefs;
    };

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

    // cắt大图为 N 小图（根据bố cục的 hàng数和 cột数）
    // quan trọng改进：cắt时cắt每ô到目标Tỷ lệ khung hình，防止因大图Tỷ lệ khung hình不精确导致的变形
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
            // Ảnh gốcô太宽，需要cắt宽度
            cropW = Math.floor(rawTileH * targetRatio);
            cropX = Math.floor((rawTileW - cropW) / 2); // Cắt giữa
            outputW = cropW;
            outputH = rawTileH;
          } else {
            // Ảnh gốcô太高，需要cắt高度
            cropH = Math.floor(rawTileW / targetRatio);
            cropY = Math.floor((rawTileH - cropH) / 2); // Cắt giữa
            outputW = rawTileW;
            outputH = cropH;
          }
          
          // an toàn边距：向内收缩 0.5%，防止切到可能的分割线hoặccạnh瑕疵
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
          
          // 只cắt实际需要的ôsố lượng，Bỏ qua空白Placeholder格
          for (let i = 0; i < actualCount; i++) {
            const tileRow = Math.floor(i / cols);
            const tileCol = i % cols;
            const canvas = document.createElement('canvas');
            canvas.width = outputW;
            canvas.height = outputH;
            const ctx = canvas.getContext('2d')!;
            
            // 从Ảnh gốcđang xử lý...定区域，并Áp dụngan toàn边距
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

    // Tạolưới 9 ôảnh并cắt（Hỗ trợ混合Khung hình đầu+Khung hình cuốinhiệm vụ）
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
      const pageHasCharacterRefs = pageTasks.some((task) =>
        getSceneCharacterContexts(task.scene.characterIds || [], task.scene.characterVariationMap)
          .some((context) => context.referenceImages.length > 0)
      );
      const referencePriorityHint = buildReferencePriorityHint(model, pageHasCharacterRefs);
      if (referencePriorityHint) {
        gridPromptParts.push(referencePriorityHint);
      }
      
      gridPromptParts.push('Structure: No borders between panels, no text, no watermarks, no speech bubbles.');
      gridPromptParts.push('Consistency: Maintain consistent character appearance, lighting, color grading, and visual style across ALL panels.');
      gridPromptParts.push('</instruction>');
      
      // 2. bố cụcMô tả (Layout)
      gridPromptParts.push(`Layout: ${rows} rows, ${cols} columns, reading order left-to-right, top-to-bottom.`);
      
      // 3. 每ô的Nội dungMô tả（根据nhiệm vụLoạiChọnKhung hình đầuhoặcKhung hình cuốiprompt）
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
        const sceneCharacterContexts = getSceneCharacterContexts(s.characterIds || [], s.characterVariationMap);
        const identityInline = getSceneIdentityLockLines(
          s,
          model,
          sceneCharacterContexts.some((context) => context.referenceImages.length > 0),
        )
          .map((line) => line.replace(/^- /, '').trim())
          .join(' ');
        
        // nhân vậtsố lượng约束
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
        const identitySuffix = identityInline ? ` Identity lock: ${identityInline}` : '';
        gridPromptParts.push(`Panel [row ${row}, col ${col}] ${frameLabel} ${charConstraint}: ${desc}${styleAnchor}${identitySuffix}`);
      });
      
      // 4. 空白Placeholder格Mô tả
      for (let i = actualCount; i < paddedCount; i++) {
        const row = Math.floor(i / cols) + 1;
        const col = (i % cols) + 1;
        gridPromptParts.push(`Panel [row ${row}, col ${col}]: empty placeholder, solid gray background`);
      }
      
      // 5. 全局Phong cách（尾部再次强调，首尾夹击确保Phong cáchgiống性）
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
      const apiReferenceImages = await processReferenceImagesForApi(refs, '[MergedGen]');
      
      // 构建Ảnh tham chiếu cột表
      const finalRefs = refs.slice(0, 14);
      
      // 处理Ảnh tham chiếu为 API 可用định dạng
      // API Hỗ trợ: 1) HTTP/HTTPS URL  2) Base64 Data URI (必须chứa data:image/xxx;base64, 前缀)
      const processedRefs: string[] = [];
      for (const url of finalRefs) {
        if (!url) continue;
        // HTTP/HTTPS URL - Trực tiếpSử dụng
        if (url.startsWith('http://') || url.startsWith('https://')) {
          processedRefs.push(url);
        }
        // Base64 Data URI - 必须是đầy đủđịnh dạng data:image/xxx;base64,...
        else if (url.startsWith('data:image/') && url.includes(';base64,')) {
          processedRefs.push(url);
        }
        // local-image:// 需要先chuyển đổi thành base64
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
      // gỡ lỗi：打印Ảnh tham chiếuđịnh dạng
      processedRefs.forEach((ref, i) => {
        const prefix = ref.substring(0, 50);
        console.log(`[MergedGen] Ref[${i}] format:`, prefix + '...');
      });
      
      // Phân tíchkết quả辅助函数（用于luân phiênGiai đoạn）
      const normalizeUrl = (url: any): string | undefined => {
        if (!url) return undefined;
        if (Array.isArray(url)) return url[0] || undefined;
        if (typeof url === 'string') return url;
        return undefined;
      };
      
      // gọi API API Tạolưới 9 ôảnh - Sử dụngthông minh路由（Tự độngChọn chat completions hoặc images/generations）
      console.log('[MergedGen] Calling API with', apiReferenceImages.length, 'reference images, model:', model);
      const apiResult = await submitGridImageRequest({
        model,
        prompt: gridPrompt,
        apiKey,
        baseUrl: imageBaseUrl,
        aspectRatio: gridAspect,
        resolution: storyboardConfig.resolution || '2K',
        referenceImages: apiReferenceImages.length > 0
          ? apiReferenceImages
          : (processedRefs.length > 0 ? processedRefs : undefined),
        keyManager,
      });
      
      let gridImageUrl = apiResult.imageUrl;
      let taskId = apiResult.taskId;
      console.log('[MergedGen] API result: gridImageUrl=', gridImageUrl?.substring(0, 50), 'taskId=', taskId);
      
      // 如果是异步nhiệm vụ，luân phiên
      if (!gridImageUrl && taskId) {
        console.log('[MergedGen] Polling task:', taskId);
        const pollInterval = 2000;
        const maxAttempts = 90; // 3 phút
        
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
          
          if (!statusResp.ok) throw new Error(`Truy vấn tác vụ thất bại: ${statusResp.status}`);
          
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
          throw new Error(`Tạo lưới 9 ô quá thời gian (nhiệm vụ ${taskId} chưa hoàn thành trong 3 phút), API có thể đang bận, vui lòng Thử lại sau`);
        }
        throw new Error('Không lấy được ảnh URL lưới 9 ô, vui lòng kiểm tra phản hồi API');
      }
      
      console.log('[MergedGen] Grid image URL:', gridImageUrl.substring(0, 80));
      
      // cắtlưới 9 ôảnh（传入bố cụctham số和目标Tỷ lệ khung hình）
      const slicedImages = await sliceGridImage(gridImageUrl, actualCount, cols, rows, aspect);
      console.log('[MergedGen] Sliced into', slicedImages.length, 'images (from', paddedCount, 'grid cells, target aspect:', aspect, ')');
      
      // 回填到各Phân cảnh并Tự độngLưu到Thư viện phương tiện
      // 同时Tải lêncắt后的ảnh到Lưu trữ ảnh，TránhTạo video时再次Tải lên
      const folderId = getImageFolderId();
      const imageHostConfigured = isImageHostConfigured();
      
      // 回填：根据nhiệm vụLoại决定更新Khung hình đầu还是Khung hình cuối
      // 先持久化到cục bộfile系统（local-image://），Tránh base64 被 partialize 清除导致Nhập后ảnh丢失
      for (let i = 0; i < pageTasks.length; i++) {
        const task = pageTasks[i];
        const s = task.scene;
        const slicedImage = slicedImages[i];
        if (slicedImage) {
          // 持久化到cục bộ + Lưu trữ ảnh（与Đơn ảnhTạogiống）
          const frameType = task.type === 'end' ? 'end' as const : 'first' as const;
          const persistResultLoop = await persistSceneImage(slicedImage, s.id, frameType);
          const httpUrl = persistResultLoop.httpUrl || undefined;
          const localPath = persistResultLoop.localPath;
          
          if (httpUrl) {
            console.log(`[MergedGen] Phân cảnh ${s.id + 1} ${task.type === 'end' ? 'Khung hình cuối' : 'Khung hình đầu'} đã tải lênLưu trữ ảnh:`, httpUrl.substring(0, 60));
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

    // 第一轮：逐页尝试，Thất bại的页面记录下来Tiếp tụcTrang sau
    const failedPages: { index: number; pageTasks: GridTask[]; refs: string[]; error: string }[] = [];
    let succeededCount = 0;

    for (let p = 0; p < taskPages.length; p++) {
      if (mergedAbortRef.current) {
        console.log('[MergedGen] Người dùng Dừng Tạo gộp');
        toast.info('Đã dừng tạo gộp');
        setIsMergedRunning(false);
        return;
      }
      
      const pageTasks = taskPages[p];
      const refs = collectOptimizedRefsFromTasks(pageTasks);
      
      // 统计trang hiện tại的Khung hình đầu/Khung hình cuốisố lượng
      const pageFirstCount = pageTasks.filter(t => t.type === 'first').length;
      const pageEndCount = pageTasks.filter(t => t.type === 'end').length;
      const pageInfo = [pageFirstCount > 0 ? `${pageFirstCount}Khung hình đầu` : '', pageEndCount > 0 ? `${pageEndCount}Khung hình cuối` : ''].filter(Boolean).join('+');
      
      console.log(`[MergedGen] Trang ${p + 1}/${taskPages.length}, ${pageTasks.length} nhiệm vụ (${pageInfo}), ${refs.length} Ảnh tham chiếu`);
      
      try {
        await generateGridAndSlice(pageTasks, refs);
        succeededCount++;
        if (!mergedAbortRef.current) {
          toast.success(`Trang ${p + 1}/${taskPages.length} hoàn thành (${pageInfo})`);
        }
      } catch (e: any) {
        const errorMsg = e.message || String(e);
        console.error(`[MergedGen] Trang ${p + 1} thất bại:`, errorMsg);
        // Đặt lại该页Phân cảnhTrạng thái为 error，不让它们卡在 'generating'
        resetPageTasksToError(pageTasks, errorMsg);
        failedPages.push({ index: p, pageTasks, refs, error: errorMsg });
        toast.warning(`Trang ${p + 1}/${taskPages.length} thất bại, sẽ tự động thử lại: ${errorMsg.substring(0, 60)}`);
        // Tiếp tụcTrang sau，不中断
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
          // lạithu thậpẢnh tham chiếu（可能在其他页Thành công后有新的图可用）
          const freshRefs = collectOptimizedRefsFromTasks(fp.pageTasks);
          await generateGridAndSlice(fp.pageTasks, freshRefs);
          succeededCount++;
          toast.success(`Trang ${fp.index + 1} thử lại thành công (${pageInfo})`);
        } catch (retryErr: any) {
          const retryMsg = retryErr.message || String(retryErr);
          console.error(`[MergedGen] Trang ${fp.index + 1} Thử lại vẫn Thất bại:`, retryMsg);
          // 再次Đặt lại为 error Trạng thái
          resetPageTasksToError(fp.pageTasks, `Thử lạiThất bại: ${retryMsg}`);
          toast.error(`Trang ${fp.index + 1} Thử lại Thất bại: ${retryMsg.substring(0, 80)}`);
        }
      }
    }

    // 最终汇报
    const totalPages = taskPages.length;
    if (!mergedAbortRef.current) {
      if (succeededCount === totalPages) {
        toast.success('Tất cả ảnh lưới 9 ô hợp nhất Tạo Hoàn thành!');
      } else if (succeededCount > 0) {
        toast.warning(`Hợp nhất Tạo một phần Hoàn thành: ${succeededCount}/${totalPages} trang Thành công, ${totalPages - succeededCount} trang Thất bại`);
      } else {
        toast.error(`Hợp nhất Tạo Tất cả Thất bại (${totalPages} trang), vui lòng kiểm tra dịch vụ API rồi Thử lại`);
      }
    }
    setIsMergedRunning(false);
  }, [
    splitScenes,
    storyboardConfig,
    currentStyleId,
    updateSplitSceneImage,
    updateSplitSceneImageStatus,
    updateSplitSceneEndFrame,
    updateSplitSceneEndFrameStatus,
    getSceneCharacterContexts,
    getSceneIdentityLockLines,
    getCharacterReferenceImages,
    processReferenceImagesForApi,
    getImageFolderId,
    addMediaFromUrl,
    mediaProjectId,
  ]);

  // 复用Đơn ảnhTạo的 API 路径，封装为通用函数（Hỗ trợKhung hình đầu/Khung hình cuối）
  // Tạo hợp nhất专用：Sử dụngước tính算Tham chiếu cột表；不降级到Đơn ảnh通道
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
      // 对非常规响应：尝试一次"无Tham chiếu"Thử lại（giữ合并chế độ，不降级到Đơn ảnh通道）
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
        // kiểm traTạo hợp nhất是否已被người dùngDừng
        if (mergedAbortRef.current) {
          console.log(`[MergedGen] Scene ${sceneId} polling cancelled by user`);
          return;
        }
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
      updateSplitSceneEndFrame(sceneId, persistResult.localPath, 'ai-generated', persistResult.httpUrl);
    } else {
      const sceneObj = splitScenes.find(s => s.id === sceneId)!;
      updateSplitSceneImage(sceneId, persistResult.localPath, sceneObj.width, sceneObj.height, persistResult.httpUrl || undefined);
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
      toast.warning("Vui lòng điền Gợi ý khung hình cuối trước khi Tạo");
      return;
    }

    // Sử dụngánh xạ dịch vụ配置
    const featureConfig = getFeatureConfig('character_generation');
    if (!featureConfig) {
      toast.error('Vui lòng cấu hình ánh xạ dịch vụ tạo ảnh trong Cài đặt trước');
      return;
    }
    const keyManager = featureConfig.keyManager;
    const apiKey = keyManager.getCurrentKey() || '';
    if (!apiKey) {
      toast.error('Vui lòng cấu hình ánh xạ dịch vụ tạo ảnh trong Cài đặt trước');
      return;
    }
    const platform = featureConfig.platform;
    const model = featureConfig.models?.[0];
    if (!model) {
      toast.error('Vui lòng cấu hình model tạo ảnh trong Cài đặt trước');
      return;
    }
    const imageBaseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
    if (!imageBaseUrl) {
      toast.error('Vui lòng cấu hình ánh xạ dịch vụ tạo ảnh trong Cài đặt trước');
      return;
    }
    
    console.log('[EndFrame] Using config:', { platform, model, imageBaseUrl });

    setIsGenerating(true);

    // Tạo本次Khung hình cuốiTạo的 AbortController，Dừngnút可通过 endFrameAbortRef.current.abort() Hủy
    const endFrameController = new AbortController();
    endFrameAbortRef.current = endFrameController;
    const endFrameSignal = endFrameController.signal;

    try {
      // Update end frame status
      updateSplitSceneEndFrameStatus(sceneId, {
        endFrameStatus: 'generating',
        endFrameProgress: 0,
        endFrameError: null,
      });

      // Build enhanced prompt with full style prompt
      let enhancedPrompt = promptToUse;
      const fullStylePrompt = getStylePrompt(currentStyleId);
      if (fullStylePrompt) {
        enhancedPrompt = `${promptToUse}. Style: ${fullStylePrompt}`;
      }
      const sceneCharacterRefs = getCharacterReferenceImages(scene.characterIds || [], scene.characterVariationMap);
      const hasCharacterRefs = sceneCharacterRefs.length > 0;
      enhancedPrompt = buildPromptWithIdentityLock(enhancedPrompt, scene, model, hasCharacterRefs);

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
      
      // 2. Khung hình đầuảnh作为Phong cáchgiống性Tham chiếu
      if (scene.imageDataUrl) {
        referenceImages.push(scene.imageDataUrl);
      }
      
      // 3. Nhân vậtẢnh tham chiếu
      if (scene.characterIds && scene.characterIds.length > 0) {
        const sceneCharRefs = getCharacterReferenceImages(scene.characterIds, scene.characterVariationMap);
        referenceImages.push(...sceneCharRefs);
      }

      const startFrameAnchor = scene.imageDataUrl || scene.imageHttpUrl || undefined;
      const endFrameSceneRef = scene.endFrameSceneReferenceImage || scene.sceneReferenceImage || undefined;
      const optimizedReferenceImages = optimizeReferenceImagesForModel(model, [
        { kind: 'scene', images: endFrameSceneRef ? [endFrameSceneRef] : [] },
        { kind: 'anchor', images: startFrameAnchor ? [startFrameAnchor] : [] },
        { kind: 'character', images: sceneCharacterRefs },
      ]);
      const apiReferenceImages = await processReferenceImagesForApi(optimizedReferenceImages, '[EndFrame]');

      console.log('[SplitScenes] Generating end frame:', {
        sceneId,
        prompt: enhancedPrompt.substring(0, 100),
        referenceCount: optimizedReferenceImages.length,
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
        referenceImages: apiReferenceImages.length > 0
          ? apiReferenceImages
          : (processedRefs.length > 0 ? processedRefs : undefined),
        keyManager,
        signal: endFrameSignal,
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
        updateSplitSceneEndFrame(sceneId, persistResult.localPath, 'ai-generated', persistResult.httpUrl);
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
        toast.success(`Phân cảnh ${sceneId + 1} Khung hình cuối Tạo Hoàn thành, đã lưu vào Thư viện phương tiện`);
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
            signal: endFrameSignal,
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
            
            // 持久化到cục bộ + Lưu trữ ảnh
            const persistResult = await persistSceneImage(imageUrl, sceneId, 'end');
            updateSplitSceneEndFrame(sceneId, persistResult.localPath, 'ai-generated', persistResult.httpUrl);
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
            toast.success(`Phân cảnh ${sceneId + 1} Khung hình cuối Tạo Hoàn thành, đã lưu vào Thư viện phương tiện`);
            setIsGenerating(false);
            return;
          }

          if (status === 'failed' || status === 'error') {
            const errorMsg = statusData.error || statusData.message || 'Khung hình cuốiTạo thất bại';
            throw new Error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
          }

          await new Promise<void>((resolve, reject) => {
            const tid = setTimeout(resolve, pollInterval);
            endFrameSignal.addEventListener('abort', () => { clearTimeout(tid); reject(new Error('Người dùng đã hủy')); }, { once: true });
          });
        }
        throw new Error('Khung hình cuốiTạohết thời gian');
      }

      throw new Error('Invalid API response');
    } catch (error) {
      const err = error as Error;

      // người dùng主动Hủy：abort() 触发的 AbortError hoặcTùy chỉnh 'Người dùng đã hủy'
      if (err.name === 'AbortError' || err.message === 'Người dùng đã hủy') {
        console.log(`[SplitScenes] Scene ${sceneId} end frame generation cancelled by user`);
        setIsGenerating(false);
        return;
      }

      console.error(`[SplitScenes] Scene ${sceneId} end frame generation failed:`, err);
      updateSplitSceneEndFrameStatus(sceneId, {
        endFrameStatus: 'failed',
        endFrameProgress: 0,
        endFrameError: err.message,
      });
      toast.error(`Phân cảnh ${sceneId + 1} Khung hình cuốiTạo thất bại: ${err.message}`);
    }

    setIsGenerating(false);
  }, [
    splitScenes,
    storyboardConfig,
    currentStyleId,
    updateSplitSceneEndFrame,
    updateSplitSceneEndFrameStatus,
    getImageFolderId,
    addMediaFromUrl,
    mediaProjectId,
    getCharacterReferenceImages,
    buildPromptWithIdentityLock,
    processReferenceImagesForApi,
  ]);

  // Save to media library (image or video) - uses system category folders
  const handleSaveToLibrary = useCallback(async (scene: SplitScene, type: 'image' | 'video') => {
    try {
      if (type === 'video') {
        if (!scene.videoUrl) {
          toast.error("Không có video để Lưu");
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
        toast.success(`Video Phân cảnh ${scene.id + 1} đã lưu vào Thư viện phương tiện`);
      } else {
        if (!scene.imageDataUrl) {
          toast.error("Không có ảnh để Lưu");
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
        toast.success(`Ảnh Phân cảnh ${scene.id + 1} đã lưu vào Thư viện phương tiện`);
      }
    } catch (error) {
      const err = error as Error;
      toast.error(`LưuThất bại: ${err.message}`);
    }
  }, [addMediaFromUrl, getImageFolderId, getVideoFolderId, mediaProjectId]);

  // Show empty state
  if (splitScenes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Chưa có Phân cảnh được cắt</p>
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

      {/* Nội dung Tab Trailer - tái sử dụng hoàn toàn chức năng Chỉnh sửa Phân cảnh */}
      {activeTab === "trailer" && (
        <>
          {trailerScenes.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-8">
              <Clapperboard className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Trailerchức năng</p>
              <p className="text-xs mt-1">Vui lòng đến Tab「Trailer」của panel「Kịch bản」ở bên trái để Tạo Trailer</p>
              <p className="text-xs mt-1">Phân cảnh đã chọn sẽ hiện ở đây và có thể thực hiện Tạo ảnh/video</p>
            </div>
          ) : (
            <>
              {/* Header - giống với Phân cảnh Chỉnh sửa */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">TrailerPhân cảnh</span>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {trailerScenes.length} Phân cảnh
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ước tính {trailerScenes.reduce((sum, s) => sum + (s.duration || 5), 0)} giây
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAutoGeneratePrompts}
                    disabled={isGeneratingPrompts || isGenerating}
                    className="hidden h-7 px-2 text-xs"
                  >
                    {isGeneratingPrompts ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3 mr-1 text-yellow-500" />
                    )}
                    AI Tự động điền Gợi ý
                  </Button>
                  {/* Xóa tất cả Trailer Phân cảnh một lần */}
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
                          Thao tác này sẽ Xóa Tất cả {trailerScenes.length} Trailer Phân cảnh (bao gồm ảnh và video Đã tạo). Hành động này không thể hoàn tác.
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
                            toast.success(`Đã Xóa tất cả ${trailerScenes.length} Trailer Phân cảnh`);
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

              {/* Cấu hình phong cách và tỉ lệ khung hình toàn cục - giống với Phân cảnh Chỉnh sửa */}
              <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-muted/30 border">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Phong cách hình ảnh:</span>
                  <StylePicker
                    value={currentStyleId || ''}
                    onChange={handleStyleChange}
                    disabled={isGenerating}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Tỷ lệ khung hình:</span>
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
                      Màn hình ngang
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
                      Màn hình dọc
                    </button>
                  </div>
                </div>
                {/* Image Resolution Selector */}
                <Select
                  value={storyboardConfig.resolution || '2K'}
                  onValueChange={(v: '1K' | '2K' | '4K') => {
                    setStoryboardConfig({ resolution: v });
                    toast.success(`Độ phân giải ảnh đã chuyển sang ${v}`);
                  }}
                >
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1K" className="text-xs">Tiêu chuẩn (1K)</SelectItem>
                    <SelectItem value="2K" className="text-xs">Độ nét cao (2K)</SelectItem>
                    <SelectItem value="4K" className="text-xs">Siêu nét (4K)</SelectItem>
                  </SelectContent>
                </Select>

                {/* Video Resolution Selector */}
                <Select
                  value={storyboardConfig.videoResolution || '480p'}
                  onValueChange={(v: '480p' | '720p' | '1080p') => {
                    setStoryboardConfig({ videoResolution: v });
                    toast.success(`Độ phân giải video đã chuyển sang ${v}`);
                  }}
                >
                  <SelectTrigger className="w-[140px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="480p" className="text-xs">Tiêu chuẩn (480P)</SelectItem>
                    <SelectItem value="720p" className="text-xs">Độ nét cao (720P)</SelectItem>
                    <SelectItem value="1080p" className="text-xs">Chất lượng cao (1080P)</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex-1 text-xs text-muted-foreground/70 truncate">
                  {storyboardConfig.styleTokens?.slice(0, 2).join(', ')}...
                </div>
              </div>

              {/* Danh sách Cảnh - tái sử dụng hoàn toàn SceneCard của Phân cảnh Chỉnh sửa */}
              <div className="flex flex-col gap-3">
                {trailerScenes.map((scene) => (
                  <SceneCard
                    key={scene.id}
                    scene={scene}
                    promptLanguage={promptLanguage}
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

              {/* Nút hành động - giống với Phân cảnh Chỉnh sửa */}
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
                      <p>Tạo ảnh và video cho Trailer Phân cảnh</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* Tips */}
              <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                <p>💡 Trailer Phân cảnh chia sẻ dữ liệu với Phân cảnh chính, sửa đổi sẽ đồng bộ. Nhấp vào vùng văn bản dưới mỗi Phân cảnh để Chỉnh sửa Gợi ý.</p>
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
            variant="outline"
            size="sm"
            onClick={handleAutoGeneratePrompts}
            disabled={isGeneratingPrompts || isGenerating}
            className="hidden h-7 px-2 text-xs"
          >
            {isGeneratingPrompts ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3 mr-1 text-yellow-500" />
            )}
            AI Tự động điền Gợi ý
          </Button>
          <Button
            variant="text"
            size="sm"
            onClick={handleBack}
            className="hidden h-7 px-2 text-xs"
          >
            <ArrowLeft className="h-3 w-3 mr-1" />
            Tạo lại
          </Button>
        </div>
      </div>

      {/* Hàng 1: Cấu hình Cơ bản - Phong cách hình ảnh / Tỷ lệ khung hình / Phương thức Tạo */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-muted/30 border">
        {/* Visual Style Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Phong cách hình ảnh:</span>
          <StylePicker
            value={currentStyleId || ''}
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
            styleId={currentStyleId || undefined}
          />
        </div>

        {/* Aspect Ratio Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Tỷ lệ khung hình:</span>
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
              Màn hình ngang
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
              Màn hình dọc
            </button>
          </div>
        </div>

        {/* Image Resolution Selector */}
        <Select
          value={storyboardConfig.resolution || '2K'}
          onValueChange={(v: '1K' | '2K' | '4K') => {
            setStoryboardConfig({ resolution: v });
            toast.success(`Độ phân giải ảnh đã chuyển sang ${v}`);
          }}
        >
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1K" className="text-xs">Tiêu chuẩn (1K)</SelectItem>
            <SelectItem value="2K" className="text-xs">Độ nét cao (2K)</SelectItem>
            <SelectItem value="4K" className="text-xs">Siêu nét (4K)</SelectItem>
          </SelectContent>
        </Select>

        {/* Video Resolution Selector */}
        <Select
          value={storyboardConfig.videoResolution || '480p'}
          onValueChange={(v: '480p' | '720p' | '1080p') => {
            setStoryboardConfig({ videoResolution: v });
            toast.success(`Độ phân giải video đã chuyển sang ${v}`);
          }}
        >
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="480p" className="text-xs">Tiêu chuẩn (480P)</SelectItem>
            <SelectItem value="720p" className="text-xs">Độ nét cao (720P)</SelectItem>
            <SelectItem value="1080p" className="text-xs">Chất lượng cao (1080P)</SelectItem>
          </SelectContent>
        </Select>

        {/* Image generation mode toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Phương thức Tạo ảnh:</span>
          <div className="flex rounded-md border overflow-hidden">
            <button
              onClick={() => setImageGenMode('single')}
              className={cn(
                "px-3 py-1.5 text-xs",
                imageGenMode === 'single' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
              )}
            >Tạo đơn ảnh</button>
            <button
              onClick={() => setImageGenMode('merged')}
              className={cn(
                "px-3 py-1.5 text-xs border-l",
                imageGenMode === 'merged' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
              )}
            >Tạo hợp nhất</button>
          </div>
        </div>

        {/* Current style tokens hint */}
        <div className="flex-1 text-xs text-muted-foreground/70 truncate">
          {storyboardConfig.styleTokens?.slice(0, 2).join(', ')}...
        </div>
      </div>

      {/* Hàng 2: Tùy chọn Tạo hợp nhất (chỉ hiện trong chế độ hợp nhất) */}
      {imageGenMode === 'merged' && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
          {/* Chế độ Khung hình đầu/cuối */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Khung đầu/cuối:</span>
            <div className="flex rounded-md border overflow-hidden">
              <button
                onClick={() => setFrameMode('first')}
                className={cn(
                  "px-3 py-1.5 text-xs",
                  frameMode === 'first' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                )}
              >Chỉ Khung hình đầu</button>
              <button
                onClick={() => setFrameMode('last')}
                className={cn(
                  "px-3 py-1.5 text-xs border-l",
                  frameMode === 'last' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                )}
              >Chỉ Khung hình cuối</button>
              <button
                onClick={() => setFrameMode('both')}
                className={cn(
                  "px-3 py-1.5 text-xs border-l",
                  frameMode === 'both' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                )}
              >Đầu+Cuối</button>
            </div>
          </div>

          {/* Chiến lược Ảnh tham chiếu */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Chiến lược Ảnh tham chiếu:</span>
            <Select value={refStrategy} onValueChange={v => setRefStrategy(v as any)}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue placeholder="Chọn chiến lược" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cluster" className="text-xs">Cluster (phân cụm khử trùng)</SelectItem>
                <SelectItem value="minimal" className="text-xs">Minimal (một Tham chiếu)</SelectItem>
                <SelectItem value="none" className="text-xs">None (không Tham chiếu)</SelectItem>
              </SelectContent>
            </Select>
            <button
              onClick={() => setUseExemplar(!useExemplar)}
              className={cn("px-2 py-1 text-xs rounded border", useExemplar ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}
              title="Sử dụng ảnh mẫu đã tạo cùng nhóm làm neo tham chiếu"
            >Ảnh neo mẫu {useExemplar ? 'Bật' : 'Tắt'}</button>
          </div>

          {/* Thực hiện Tạo hợp nhất - nổi bật */}
          <div className="ml-auto flex items-center gap-2">
            <Button
              className="h-8 px-4 text-xs font-medium"
              disabled={isGenerating || isMergedRunning || splitScenes.length === 0}
              onClick={() => {
                console.log('[MergedGenControls] Nhấp nút Tạo hợp nhất, frameMode:', frameMode, 'refStrategy:', refStrategy, 'useExemplar:', useExemplar);
                handleMergedGenerate(frameMode, refStrategy, useExemplar);
              }}
            >
              {isMergedRunning ? (<><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Đang tạo hợp nhất...</>) : (<><Sparkles className="h-3.5 w-3.5 mr-1.5" />Thực hiện Tạo hợp nhất</>)}
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
      {splitScenes.some(s => !(s.videoPromptZh?.trim() || s.videoPrompt?.trim())) && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-yellow-500/10 border border-yellow-500/20">
          <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
          <div className="text-xs text-yellow-600 dark:text-yellow-400">
            <p>Một số Phân cảnh thiếu Gợi ý, Nhấp vào vùng văn bản bên dưới Phân cảnh để Chỉnh sửa.</p>
          </div>
        </div>
      )}

      {/* Scene list */}
      <div className="flex flex-col gap-3">
        {splitScenes.map((scene) => (
          <SceneCard
            key={scene.id}
            scene={scene}
            promptLanguage={promptLanguage}
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

        {/* Nút Thêm Phân cảnh trống */}
        <button
          type="button"
          onClick={addBlankSplitScene}
          disabled={isGenerating}
          className={cn(
            "w-full rounded-lg border-2 border-dashed border-muted-foreground/25",
            "flex items-center justify-center gap-2 py-6",
            "text-sm text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5",
            "transition-colors cursor-pointer",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          <Plus className="h-5 w-5" />
          <span>Thêm Phân cảnh trống</span>
        </button>
      </div>

      {/* Action buttons */}
      {(() => {
        const scenesWithImages = splitScenes.filter(s => s.imageDataUrl).length;
        const scenesNeedVideo = splitScenes.filter(s => s.imageDataUrl && (s.videoStatus === 'idle' || s.videoStatus === 'failed')).length;
        const noImages = scenesWithImages === 0;
        return (
          <div className="flex gap-2 pt-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleGenerateVideos}
                    disabled={isGenerating || splitScenes.length === 0 || noImages}
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
                        Tạovideo ({scenesNeedVideo}/{splitScenes.length})
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {noImages ? (
                    <p>Vui lòng Tạo ảnh cho Phân cảnh trước, rồi mới Tạo video</p>
                  ) : (
                    <p>{scenesWithImages} Phân cảnh đã có ảnh, {scenesNeedVideo} đang chờ Tạo video</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      })()}

      {/* Tips */}
      <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
        <p>💡 Nhấp vào vùng văn bản bên dưới mỗi Phân cảnh để Chỉnh sửa Gợi ý Tạo video. Di chuột lên Phân cảnh để Xóa Phân cảnh không Cần.</p>
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
    </div>
  );
}

