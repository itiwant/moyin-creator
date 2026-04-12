// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Director Context Panel Component
 * 全局右栏 - AIĐạo diễnchế độ：HiệnKịch bản层级树，让用户Chọn要Tạo的Nội dung
 */

import { useState, useMemo, useCallback } from "react";
import { useMediaPanelStore } from "@/stores/media-panel-store";
import { useActiveScriptProject } from "@/stores/script-store";
import { getShotCompletionStatus, calculateProgress, SHOT_SIZE_MAP } from "@/lib/script/shot-utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  Film,
  MapPin,
  Circle,
  Clock,
  CheckCircle2,
  ArrowLeft,
  Send,
  FileVideo,
  Plus,
} from "lucide-react";
import type { Shot, CompletionStatus, ScriptScene } from "@/types/script";
import { DEFAULT_STYLE_ID, getStyleById } from "@/lib/constants/visual-styles";
import { useDirectorStore, useActiveDirectorProject, type SoundEffectTag } from '@/stores/director-store';
import { useCharacterLibraryStore } from '@/stores/character-library-store';
import { useSceneStore } from '@/stores/scene-store';
import { useAppSettingsStore } from '@/stores/app-settings-store';
import { useProjectStore } from '@/stores/project-store';
import { toast } from "sonner";
import { matchSceneAndViewpoint, matchSceneAndViewpointSync, type ViewpointMatchResult } from '@/lib/scene/viewpoint-matcher';

// Trạng thái图标
function StatusIcon({ status }: { status?: CompletionStatus }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-3 w-3 text-green-500" />;
    case "in_progress":
      return <Clock className="h-3 w-3 text-yellow-500" />;
    default:
      return <Circle className="h-3 w-3 text-muted-foreground" />;
  }
}

// Xuất组件
export function DirectorContextPanel() {
  const { setActiveTab, goToDirectorWithData } = useMediaPanelStore();
  const scriptProject = useActiveScriptProject();
  const { addScenesFromScript, setStoryboardConfig } = useDirectorStore();
  const { resourceSharing } = useAppSettingsStore();
  const { activeProjectId } = useProjectStore();
  
  // Get current project data
  const projectData = useActiveDirectorProject();
  const splitScenes = projectData?.splitScenes || [];
  const storyboardStatus = projectData?.storyboardStatus || 'idle';
  
  // 获取Thư viện cảnh数据
  const { scenes } = useSceneStore();
  const sceneLibraryScenes = useMemo(() => {
    if (resourceSharing.shareScenes) return scenes;
    if (!activeProjectId) return [];
    return scenes.filter((s) => s.projectId === activeProjectId);
  }, [scenes, resourceSharing.shareScenes, activeProjectId]);

  const [expandedEpisodes, setExpandedEpisodes] = useState<Set<string>>(new Set(["default", "ep_1"]));
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);

  const scriptData = scriptProject?.scriptData || null;
  const shots = scriptProject?.shots || [];
  const styleId = scriptProject?.styleId || DEFAULT_STYLE_ID;

  // 从Kịch bảnThêm phân cảnh时，同步Kịch bảnPhong cách到Đạo diễn面板的 storyboardConfig
  const addScenesAndSyncStyle: typeof addScenesFromScript = useCallback((scenes) => {
    addScenesFromScript(scenes);
    // 如果Đạo diễn面板尚未Cài đặt visualStyleId，从Kịch bản项目继承
    const directorStyleId = projectData?.storyboardConfig?.visualStyleId;
    if (!directorStyleId && scriptProject?.styleId) {
      const style = getStyleById(scriptProject.styleId);
      if (style) {
        setStoryboardConfig({ visualStyleId: style.id, styleTokens: [style.prompt] });
        console.log('[ContextPanel] Synced script styleId to director:', style.id);
      }
    }
  }, [addScenesFromScript, setStoryboardConfig, projectData?.storyboardConfig?.visualStyleId, scriptProject?.styleId]);

  // 如果没有episodes，Tạo一Mặc định的
  const episodes = useMemo(() => {
    if (!scriptData) return [];
    if (scriptData.episodes && scriptData.episodes.length > 0) {
      return scriptData.episodes;
    }
    // Mặc định单 tập
    return [{
      id: "default",
      index: 1,
      title: scriptData.title || "Tập 1",
      sceneIds: scriptData.scenes.map((s) => s.id),
    }];
  }, [scriptData]);

  // 按Cảnh分组的shots
  const shotsByScene = useMemo(() => {
    const map: Record<string, Shot[]> = {};
    shots.forEach((shot) => {
      const sceneId = shot.sceneRefId;
      if (!map[sceneId]) map[sceneId] = [];
      map[sceneId].push(shot);
    });
    return map;
  }, [shots]);

  const handleBackToScript = () => {
    setActiveTab("script");
  };

  const toggleEpisode = (id: string) => {
    setExpandedEpisodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleScene = (id: string) => {
    setExpandedScenes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 获取Thư viện nhân vậtđang xử lý...t cảNhân vật
  const { characters } = useCharacterLibraryStore();
  const libraryCharacters = useMemo(() => {
    if (resourceSharing.shareCharacters) return characters;
    if (!activeProjectId) return [];
    return characters.filter((c) => c.projectId === activeProjectId);
  }, [characters, resourceSharing.shareCharacters, activeProjectId]);
  
  // 将Kịch bảnNhân vậtID或Tên nhân vật映射到Thư viện nhân vậtID
  const mapScriptCharacterIdsToLibraryIds = (scriptCharIds: string[], characterNames?: string[]): string[] => {
    const libraryIds: string[] = [];
    const addedIds = new Set<string>(); // tránh trùng lặp
    
    // 1. 先通过 characterIds 匹配
    if (scriptCharIds && scriptCharIds.length > 0 && scriptData) {
      for (const scriptCharId of scriptCharIds) {
        // 查找Kịch bảnNhân vật
        const scriptChar = scriptData.characters.find(c => c.id === scriptCharId);
        if (!scriptChar) continue;
        
        // 优先Sử dụng已关联的Thư viện nhân vậtID（需校验该ID在当前可见Thư viện nhân vậtđang xử lý...）
        if (scriptChar.characterLibraryId && !addedIds.has(scriptChar.characterLibraryId)) {
          const linkedLibraryChar = libraryCharacters.find(c => c.id === scriptChar.characterLibraryId);
          if (linkedLibraryChar) {
            libraryIds.push(linkedLibraryChar.id);
            addedIds.add(linkedLibraryChar.id);
            continue;
          }
          console.warn(`[ContextPanel] Invalid characterLibraryId "${scriptChar.characterLibraryId}" for script character "${scriptChar.name}", fallback to name matching`);
        }
        
        // 否则通过名字匹配Thư viện nhân vậtđang xử lý...ân vật
        const libraryChar = libraryCharacters.find(c => c.name === scriptChar.name);
        if (libraryChar && !addedIds.has(libraryChar.id)) {
          libraryIds.push(libraryChar.id);
          addedIds.add(libraryChar.id);
        }
      }
    }
    
    // 2. 再通过 characterNames 补充匹配（AIHiệu chuẩn的Phân cảnh可能只有Tên）
    if (characterNames && characterNames.length > 0) {
      for (const charName of characterNames) {
        if (!charName) continue;
        
        // 精确匹配
        let libraryChar = libraryCharacters.find(c => c.name === charName);
        
        // 模糊匹配：Thư viện nhân vậtTên包含Phân cảnhNhân vật名，或Phân cảnhNhân vật名包含Thư viện nhân vậtTên
        if (!libraryChar) {
          libraryChar = libraryCharacters.find(c => 
            c.name.includes(charName) || charName.includes(c.name)
          );
        }
        
        if (libraryChar && !addedIds.has(libraryChar.id)) {
          libraryIds.push(libraryChar.id);
          addedIds.add(libraryChar.id);
          console.log(`[ContextPanel] Matched character "${charName}" to library "${libraryChar.name}"`);
        }
      }
    }
    
    return libraryIds;
  };
  
  // 根据Phân cảnh和Thông tin cảnh查找匹配的Thư viện cảnhGóc nhìn
  // 优先Sử dụngAI分析的shotIds关联，保底用Phân cảnh序号对应Góc nhìn序号
  const findMatchingSceneAndViewpointQuick = (shot: Shot, scene: ScriptScene, shotIndexInScene?: number): ViewpointMatchResult | null => {
    const sceneName = scene.name || '';
    
    // 找到Thư viện cảnhđang xử lý...父Cảnh
    const parentScene = sceneLibraryScenes.find(s => 
      !s.parentSceneId && !s.isViewpointVariant &&
      (s.name.includes(sceneName) || sceneName.includes(s.name))
    );
    
    if (!parentScene) {
      console.log(`[findMatchingSceneAndViewpointQuick] 未找到匹配的父Cảnh: "${sceneName}"`);
      return null;
    }
    
    // 获取该父Cảnh的Tất cảGóc nhìnbiến thể，按TạoThời gian排序
    const variants = sceneLibraryScenes
      .filter(s => s.parentSceneId === parentScene.id)
      .sort((a, b) => a.createdAt - b.createdAt);
    
    console.log(`[findMatchingSceneAndViewpointQuick] Cảnh "${sceneName}" 有 ${variants.length} Góc nhìnbiến thể`);
    
    if (variants.length === 0) {
      // 没有Góc nhìnbiến thể，Quay lại父Cảnh
      return {
        sceneLibraryId: parentScene.id,
        viewpointId: undefined,
        sceneReferenceImage: parentScene.referenceImage || parentScene.referenceImageBase64,
        matchedSceneName: parentScene.name,
        matchMethod: 'fallback' as const,
        confidence: 0.5,
      };
    }
    
    // 方案一：优先检查Thư viện cảnhGóc nhìnbiến thể的shotIds（切割时Lưu的）
    const variantWithShot = variants.find(v => v.shotIds?.includes(shot.id));
    if (variantWithShot) {
      console.log(`[findMatchingSceneAndViewpointQuick] 通过Thư viện cảnhshotIds匹配: Phân cảnh${shot.id} -> Góc nhìn "${variantWithShot.viewpointName || variantWithShot.name}"`);
      return {
        sceneLibraryId: variantWithShot.id,
        viewpointId: variantWithShot.viewpointId,
        sceneReferenceImage: variantWithShot.referenceImage || variantWithShot.referenceImageBase64,
        matchedSceneName: variantWithShot.viewpointName || variantWithShot.name,
        matchMethod: 'keyword' as const,
        confidence: 0.98,
      };
    }
    
    // 方案二：检查Kịch bảnscene.viewpoints的shotIds（AI分析时Lưu的）
    if (scene.viewpoints && scene.viewpoints.length > 0) {
      const matchedViewpoint = scene.viewpoints.find(v => v.shotIds?.includes(shot.id));
      if (matchedViewpoint) {
        // 在Thư viện cảnhGóc nhìnbiến thểđang xử lý...名的
        const matchedVariant = variants.find(v => {
          const variantName = v.viewpointName || v.name || '';
          return variantName.includes(matchedViewpoint.name) || matchedViewpoint.name.includes(variantName);
        });
        if (matchedVariant) {
          console.log(`[findMatchingSceneAndViewpointQuick] 通过Kịch bảnshotIds匹配: Phân cảnh${shot.id} -> Góc nhìn "${matchedVariant.viewpointName || matchedVariant.name}"`);
          return {
            sceneLibraryId: matchedVariant.id,
            viewpointId: matchedVariant.viewpointId,
            sceneReferenceImage: matchedVariant.referenceImage || matchedVariant.referenceImageBase64,
            matchedSceneName: matchedVariant.viewpointName || matchedVariant.name,
            matchMethod: 'keyword' as const,
            confidence: 0.95,
          };
        }
      }
    }
    
    // 方案三：保底 - 按Phân cảnh序号对应Góc nhìnbiến thể序号
    // Phân cảnh1 -> Góc nhìn1，Phân cảnh2 -> Góc nhìn2，...
    // 如果Phân cảnh数超过Góc nhìn数，循环Sử dụng
    const variantIndex = shotIndexInScene !== undefined 
      ? shotIndexInScene % variants.length 
      : 0;
    
    const matchedVariant = variants[variantIndex];
    
    console.log(`[findMatchingSceneAndViewpointQuick] 通过序号匹配: Phân cảnh序号 ${(shotIndexInScene ?? 0) + 1} -> Góc nhìnbiến thể ${variantIndex + 1}: "${matchedVariant.viewpointName || matchedVariant.name}"`);
    
    return {
      sceneLibraryId: matchedVariant.id,
      viewpointId: matchedVariant.viewpointId,
      sceneReferenceImage: matchedVariant.referenceImage || matchedVariant.referenceImageBase64,
      matchedSceneName: matchedVariant.viewpointName || matchedVariant.name,
      matchMethod: 'keyword' as const,
      confidence: 0.9,
    };
  };
  
  // 在Thư viện cảnhđang xử lý...配的Góc nhìn
  const findViewpointInLibrary = (sceneName: string, viewpointName: string): ViewpointMatchResult | null => {
    console.log(`[findViewpointInLibrary] 查找Cảnh: "${sceneName}", Góc nhìn: "${viewpointName}"`);
    console.log(`[findViewpointInLibrary] Thư viện cảnhTổng数: ${sceneLibraryScenes.length}`);
    
    // 找到匹配的父Cảnh
    const parentScenes = sceneLibraryScenes.filter(s => 
      !s.parentSceneId && !s.isViewpointVariant &&
      (s.name.includes(sceneName) || sceneName.includes(s.name))
    );
    
    console.log(`[findViewpointInLibrary] 匹配的父Cảnh数: ${parentScenes.length}`, parentScenes.map(s => s.name));
    
    if (parentScenes.length === 0) return null;
    
    // 在父Cảnh的Góc nhìnbiến thểđang xử lý...配的Góc nhìn
    for (const parent of parentScenes) {
      const variants = sceneLibraryScenes.filter(s => s.parentSceneId === parent.id);
      console.log(`[findViewpointInLibrary] 父Cảnh "${parent.name}" 的Góc nhìnbiến thể数: ${variants.length}`, 
        variants.map(v => ({ name: v.name, viewpointName: v.viewpointName, id: v.id })));
      
      // 模糊匹配Góc nhìnTên
      const matchedVariant = variants.find(v => {
        const variantName = v.viewpointName || v.name || '';
        const isMatch = variantName.includes(viewpointName) || viewpointName.includes(variantName);
        console.log(`[findViewpointInLibrary] 对比: "${variantName}" vs "${viewpointName}" => ${isMatch}`);
        return isMatch;
      });
      
      if (matchedVariant) {
        console.log(`[findViewpointInLibrary] ✅ 匹配Thành công: ${matchedVariant.viewpointName || matchedVariant.name}`);
        console.log(`[findViewpointInLibrary] ảnhtrường:`, {
          id: matchedVariant.id,
          referenceImage: matchedVariant.referenceImage ? `有(${matchedVariant.referenceImage.substring(0, 50)}...)` : '无',
          referenceImageBase64: matchedVariant.referenceImageBase64 ? `有(${matchedVariant.referenceImageBase64.substring(0, 50)}...)` : '无',
        });
        return {
          sceneLibraryId: matchedVariant.id,
          viewpointId: matchedVariant.viewpointId,
          sceneReferenceImage: matchedVariant.referenceImage || matchedVariant.referenceImageBase64,
          matchedSceneName: matchedVariant.viewpointName || matchedVariant.name,
          matchMethod: 'keyword' as const,
          confidence: 0.95,
        };
      }
    }
    
    console.log(`[findViewpointInLibrary] ❌ 未找到Góc nhìn，Quay lại父Cảnh`);
    // 没找到Góc nhìn，Quay lại父Cảnh
    const bestParent = parentScenes[0];
    return {
      sceneLibraryId: bestParent.id,
      viewpointId: undefined,
      sceneReferenceImage: bestParent.referenceImage || bestParent.referenceImageBase64,
      matchedSceneName: bestParent.name,
      matchMethod: 'fallback' as const,
      confidence: 0.5,
    };
  };
  
  // 异步Phiên bản：quan trọng词 + AI 匹配（用于批量Thêm）
  const findMatchingSceneAndViewpointWithAI = async (sceneName: string, actionSummary: string): Promise<ViewpointMatchResult | null> => {
    return matchSceneAndViewpoint(sceneName, actionSummary, sceneLibraryScenes, true);
  };

  // Thêm单Phân cảnh到Phân cảnhChỉnh sửa（chế độ二）
  const handleAddShotToSplitScenes = (shot: Shot, scene: ScriptScene) => {
    // Debug: 检查 Shot đang xử lý...prompt数据
    console.log('[ContextPanel] Adding shot to split scenes:', {
      shotId: shot.id,
      imagePrompt: shot.imagePrompt?.substring(0, 50),
      imagePromptZh: shot.imagePromptZh?.substring(0, 50),
      videoPrompt: shot.videoPrompt?.substring(0, 50),
      videoPromptZh: shot.videoPromptZh?.substring(0, 50),
      endFramePrompt: shot.endFramePrompt?.substring(0, 50),
      needsEndFrame: shot.needsEndFrame,
      narrativeFunction: (shot as any).narrativeFunction,
      shotPurpose: (shot as any).shotPurpose,
    });
    // Sử dụng详细的视觉Mô tả作为prompt（优先）
    let promptZh = shot.visualDescription || '';
    if (!promptZh) {
      const parts: string[] = [];
      if (scene.location) parts.push(scene.location);
      if (shot.actionSummary) parts.push(shot.actionSummary);
      promptZh = parts.join(' - ');
    }
    
    // 将Kịch bảnNhân vậtID/Tên映射到Thư viện nhân vậtID
    const characterLibraryIds = mapScriptCharacterIdsToLibraryIds(shot.characterIds || [], shot.characterNames);
    
    // 获取Phân cảnh在Cảnh内的序号
    const sceneShots = shotsByScene[scene.id] || [];
    const shotIndexInScene = sceneShots.findIndex(s => s.id === shot.id);
    
    // Tự động匹配Thư viện cảnhđang xử lý...nh和Góc nhìn（优先Sử dụng已有的Góc nhìn关联）
    const sceneMatch = findMatchingSceneAndViewpointQuick(shot, scene, shotIndexInScene >= 0 ? shotIndexInScene : undefined);
    
    addScenesAndSyncStyle([{
      // Thông tin cảnh
      sceneName: sceneMatch?.matchedSceneName || scene.name || '',
      sceneLocation: scene.location || '',
      // 旧prompt（tương thích）
      promptZh,
      promptEn: shot.visualPrompt || shot.videoPrompt || '',
      // 三层prompt系统 (Seedance 1.5 Pro)
      imagePrompt: shot.imagePrompt || '',
      imagePromptZh: shot.imagePromptZh || '',
      videoPrompt: shot.videoPrompt || '',
      videoPromptZh: shot.videoPromptZh || '',
      endFramePrompt: shot.endFramePrompt || '',
      endFramePromptZh: shot.endFramePromptZh || '',
      needsEndFrame: shot.needsEndFrame || false,
      // Nhân vật（Sử dụngThư viện nhân vậtID）
      characterIds: characterLibraryIds,
      // 情绪Thẻ（AIHiệu chuẩn产出）
      emotionTags: (shot.emotionTags || []) as any,
      // 景别
      shotSize: shot.shotSize ? (SHOT_SIZE_MAP[shot.shotSize] || null) as any : null,
      // Thời lượng
      duration: shot.duration || 5,
      // âm thanh
      ambientSound: shot.ambientSound || '',
      soundEffects: [] as SoundEffectTag[],
      soundEffectText: shot.soundEffect || '',
      // 对白
      dialogue: shot.dialogue || '',
      // Hành độngMô tả
      actionSummary: shot.actionSummary || '',
      // Ống kính运动
      cameraMovement: shot.cameraMovement || '',
      // 特殊拍摄手法
      specialTechnique: shot.specialTechnique || '',
      // Thư viện cảnh关联（Tự động匹配）
      sceneLibraryId: sceneMatch?.sceneLibraryId,
      viewpointId: sceneMatch?.viewpointId,
      sceneReferenceImage: sceneMatch?.sceneReferenceImage,
      // tự sự驱动Thiết kế（基于《电影Ngôn ngữ的语法》）
      narrativeFunction: (shot as any).narrativeFunction || '',
      shotPurpose: (shot as any).shotPurpose || '',
      visualFocus: (shot as any).visualFocus || '',
      cameraPosition: (shot as any).cameraPosition || '',
      characterBlocking: (shot as any).characterBlocking || '',
      rhythm: (shot as any).rhythm || '',
      visualDescription: (shot as any).visualDescription || '',
      // 拍摄控制（灯光/焦点/器材/特效/Tốc độ）
      lightingStyle: shot.lightingStyle,
      lightingDirection: shot.lightingDirection,
      colorTemperature: shot.colorTemperature,
      lightingNotes: shot.lightingNotes,
      depthOfField: shot.depthOfField,
      focusTarget: shot.focusTarget,
      focusTransition: shot.focusTransition,
      cameraRig: shot.cameraRig,
      movementSpeed: shot.movementSpeed,
      atmosphericEffects: shot.atmosphericEffects,
      effectIntensity: shot.effectIntensity,
      playbackSpeed: shot.playbackSpeed,
      cameraAngle: shot.cameraAngle,
      focalLength: shot.focalLength,
      photographyTechnique: shot.photographyTechnique,
    }]);
    
    const matchInfo = sceneMatch ? ` (Khớp: ${sceneMatch.matchedSceneName})` : '';
    toast.success(`Đã thêm phân cảnh vào danh sách chỉnh sửa${matchInfo}`);
  };

  // Thêm整Cảnh的Tất cảPhân cảnh到Phân cảnhChỉnh sửa（chế độ二）
  const handleAddSceneToSplitScenes = (scene: ScriptScene) => {
    const sceneShots = shotsByScene[scene.id] || [];
    
    if (sceneShots.length === 0) {
      const fallbackPromptZh = scene.visualPrompt?.trim()
        || [scene.location, scene.atmosphere].filter(Boolean).join(' - ')
        || scene.name
        || 'Mô tả cảnh';
      const fallbackPromptEn = scene.visualPromptEn?.trim() || '';
      const matchedScene = sceneLibraryScenes.find((s) =>
        !s.parentSceneId &&
        !s.isViewpointVariant &&
        (
          (!!scene.name && (s.name.includes(scene.name) || scene.name.includes(s.name)))
          || (!!scene.location && (s.name.includes(scene.location) || scene.location.includes(s.name)))
        )
      );

      addScenesAndSyncStyle([{
        sceneName: scene.name || scene.location || 'Cảnh chưa đặt tên',
        sceneLocation: scene.location || '',
        promptZh: fallbackPromptZh,
        promptEn: fallbackPromptEn,
        imagePrompt: fallbackPromptEn,
        imagePromptZh: fallbackPromptZh,
        videoPrompt: fallbackPromptEn,
        videoPromptZh: fallbackPromptZh,
        endFramePrompt: '',
        endFramePromptZh: '',
        needsEndFrame: false,
        characterIds: [],
        emotionTags: [],
        shotSize: null,
        duration: 5,
        ambientSound: scene.atmosphere || '',
        soundEffects: [] as SoundEffectTag[],
        soundEffectText: '',
        dialogue: '',
        actionSummary: scene.atmosphere || '',
        cameraMovement: '',
        specialTechnique: '',
        sceneLibraryId: matchedScene?.id,
        viewpointId: undefined,
        sceneReferenceImage: matchedScene?.referenceImage || matchedScene?.referenceImageBase64,
      }]);

      const matchInfo = matchedScene ? `（Đã khớp Thư viện cảnh: ${matchedScene.name}）` : '';
      toast.success(`Cảnh này chưa có phân cảnh, đã tạo 1 phân cảnh${matchInfo}`);
      return;
    }
    
    let matchedCount = 0;
    const scenesToAdd = sceneShots.map((shot, shotIndexInScene) => {
      // Sử dụng详细的视觉Mô tả作为prompt（优先）
      let promptZh = shot.visualDescription || '';
      if (!promptZh) {
        const parts: string[] = [];
        if (scene.location) parts.push(scene.location);
        if (shot.actionSummary) parts.push(shot.actionSummary);
        promptZh = parts.join(' - ');
      }
      
      // 将Kịch bảnNhân vậtID/Tên映射到Thư viện nhân vậtID
      const characterLibraryIds = mapScriptCharacterIdsToLibraryIds(shot.characterIds || [], shot.characterNames);
      
      // Tự động匹配Thư viện cảnhđang xử lý...nh和Góc nhìn（优先Sử dụng已有的Góc nhìn关联，保底用序号）
      const sceneMatch = findMatchingSceneAndViewpointQuick(shot, scene, shotIndexInScene);
      if (sceneMatch) matchedCount++;
      
      return {
        // Thông tin cảnh
        sceneName: sceneMatch?.matchedSceneName || scene.name || '',
        sceneLocation: scene.location || '',
        // 旧prompt（tương thích）
        promptZh,
        promptEn: shot.visualPrompt || shot.videoPrompt || '',
        // 三层prompt系统 (Seedance 1.5 Pro)
        imagePrompt: shot.imagePrompt || '',
        imagePromptZh: shot.imagePromptZh || '',
        videoPrompt: shot.videoPrompt || '',
        videoPromptZh: shot.videoPromptZh || '',
        endFramePrompt: shot.endFramePrompt || '',
        endFramePromptZh: shot.endFramePromptZh || '',
        needsEndFrame: shot.needsEndFrame || false,
        // Nhân vật（Sử dụngThư viện nhân vậtID）
        characterIds: characterLibraryIds,
        // 情绪Thẻ（AIHiệu chuẩn产出）
        emotionTags: (shot.emotionTags || []) as any,
        // 景别
        shotSize: shot.shotSize ? (SHOT_SIZE_MAP[shot.shotSize] || null) as any : null,
        // Thời lượng
        duration: shot.duration || 5,
        // âm thanh
        ambientSound: shot.ambientSound || '',
        soundEffects: [] as SoundEffectTag[],
        soundEffectText: shot.soundEffect || '',
        // 对白
        dialogue: shot.dialogue || '',
        // Hành độngMô tả
        actionSummary: shot.actionSummary || '',
        // Ống kính运动
        cameraMovement: shot.cameraMovement || '',
        // 特殊拍摄手法
        specialTechnique: shot.specialTechnique || '',
        // Thư viện cảnh关联（Tự động匹配）
        sceneLibraryId: sceneMatch?.sceneLibraryId,
        viewpointId: sceneMatch?.viewpointId,
        sceneReferenceImage: sceneMatch?.sceneReferenceImage,
        // tự sự驱动Thiết kế（基于《电影Ngôn ngữ的语法》）
        narrativeFunction: (shot as any).narrativeFunction || '',
        shotPurpose: (shot as any).shotPurpose || '',
        visualFocus: (shot as any).visualFocus || '',
        cameraPosition: (shot as any).cameraPosition || '',
        characterBlocking: (shot as any).characterBlocking || '',
        rhythm: (shot as any).rhythm || '',
        visualDescription: (shot as any).visualDescription || '',
        // 拍摄控制（灯光/焦点/器材/特效/Tốc độ）
        lightingStyle: shot.lightingStyle,
        lightingDirection: shot.lightingDirection,
        colorTemperature: shot.colorTemperature,
        lightingNotes: shot.lightingNotes,
        depthOfField: shot.depthOfField,
        focusTarget: shot.focusTarget,
        focusTransition: shot.focusTransition,
        cameraRig: shot.cameraRig,
        movementSpeed: shot.movementSpeed,
        atmosphericEffects: shot.atmosphericEffects,
        effectIntensity: shot.effectIntensity,
        playbackSpeed: shot.playbackSpeed,
        cameraAngle: shot.cameraAngle,
        focalLength: shot.focalLength,
        photographyTechnique: shot.photographyTechnique,
      };
    });
    
    addScenesAndSyncStyle(scenesToAdd);
    const matchInfo = matchedCount > 0 ? ` (${matchedCount} cảnh khớp thư viện)` : '';
    toast.success(`Đã thêm ${scenesToAdd.length} phân cảnh vào danh sách chỉnh sửa${matchInfo}`);
  };

  // 发送单Phân cảnh到AIĐạo diễn输入（chế độ一）
  const handleSendShot = (shot: Shot, scene: ScriptScene) => {
    // 构建故事Gợi ý
    const parts: string[] = [];
    if (scene.location) parts.push(`Cảnh：${scene.location}`);
    if (scene.time) parts.push(`Thời gian: ${scene.time}`);
    if (shot.actionSummary) parts.push(`Hành động: ${shot.actionSummary}`);
    if (shot.dialogue) parts.push(`Hội thoại: ${shot.dialogue}`);

    const storyPrompt = parts.join("\n");

    // 提取Nhân vật名
    const characterNames: string[] = [];
    if (shot.characterIds && scriptData) {
      shot.characterIds.forEach((charId) => {
        const char = scriptData.characters.find((c) => c.id === charId);
        if (char) characterNames.push(char.name);
      });
    }

    goToDirectorWithData({
      storyPrompt,
      characterNames,
      sceneLocation: scene.location,
      sceneTime: scene.time,
      shotId: shot.id,
      sceneCount: 1,
      styleId,
      sourceType: "shot",
    });

    setSelectedShotId(shot.id);
    setSelectedSceneId(null);
  };

  // 发送整Cảnh到AIĐạo diễn输入
  const handleSendScene = (scene: ScriptScene) => {
    const sceneShots = shotsByScene[scene.id] || [];

    // 构建故事Gợi ý - 合并Cảnh下Tất cảPhân cảnh
    const parts: string[] = [];
    if (scene.location) parts.push(`Cảnh：${scene.location}`);
    if (scene.time) parts.push(`Thời gian: ${scene.time}`);
    if (scene.atmosphere) parts.push(`Không khí: ${scene.atmosphere}`);

    // ThêmTất cảPhân cảnh的Hành động和对白
    sceneShots.forEach((shot, idx) => {
      const shotParts: string[] = [];
      if (shot.actionSummary) shotParts.push(shot.actionSummary);
      if (shot.dialogue) shotParts.push(`"${shot.dialogue}"`);
      if (shotParts.length > 0) {
        parts.push(`[Cảnh quay${idx + 1}] ${shotParts.join(" - ")}`);
      }
    });

    const storyPrompt = parts.join("\n");

    // 收 tậpCảnhđang xử lý... cảNhân vật
    const characterNames: string[] = [];
    if (scriptData) {
      const charIds = new Set<string>();
      sceneShots.forEach((shot) => {
        shot.characterIds?.forEach((id) => charIds.add(id));
      });
      charIds.forEach((charId) => {
        const char = scriptData.characters.find((c) => c.id === charId);
        if (char) characterNames.push(char.name);
      });
    }

    goToDirectorWithData({
      storyPrompt,
      characterNames,
      sceneLocation: scene.location,
      sceneTime: scene.time,
      sceneCount: sceneShots.length || 1,
      styleId,
      sourceType: "scene",
    });

    setSelectedSceneId(scene.id);
    setSelectedShotId(null);
  };

  // 没有Kịch bản数据时HiệnGợi ý
  if (!scriptData) {
    return (
      <div className="h-full min-w-0 flex flex-col overflow-x-hidden">
        <div className="p-3 border-b">
          <h3 className="font-medium text-sm flex items-center gap-2">
            <FileVideo className="h-4 w-4" />
            Cấu trúc kịch bản
          </h3>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center text-muted-foreground text-sm">
            <p>Chưa có dữ liệu kịch bản</p>
            <p className="mt-1">Vui lòng phân tích kịch bản trong bảng kịch bản trước</p>
          </div>
        </div>
        <div className="p-3 border-t">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleBackToScript}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Đến bảng kịch bản
          </Button>
        </div>
      </div>
    );
  }

  // 计算整体进度
  const overallProgress = calculateProgress(
    shots.map((s) => ({ status: getShotCompletionStatus(s) }))
  );

  return (
    <div className="h-full min-w-0 flex flex-col overflow-x-hidden">
      {/* tiêu đề和Tiến trình */}
      <div className="p-3 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-sm">{scriptData.title}</h3>
            {scriptData.genre && (
              <span className="text-xs text-muted-foreground">{scriptData.genre}</span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            Tiến trình: {overallProgress}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Nhấp vào cảnh/phân cảnh để gửi đến đầu vào AI đạo diễn
        </p>
        {/* Phân cảnhChỉnh sửa计数 */}
        {splitScenes.length > 0 && (
          <div className="mt-2 px-2 py-1 bg-green-500/10 rounded text-xs text-green-600 flex items-center gap-1">
            <Plus className="h-3 w-3" />
            <span>Đã thêm {splitScenes.length} phân cảnh vào danh sách chỉnh sửa</span>
          </div>
        )}
      </div>

      {/* Dạng câyCấu trúc */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {/*  Danh sách tập */}
          {episodes.map((episode) => {
            const episodeScenes = scriptData.scenes.filter((s) =>
              episode.sceneIds.includes(s.id)
            );
            const episodeShots = shots.filter((shot) =>
              episodeScenes.some((s) => s.id === shot.sceneRefId)
            );
            const episodeProgress = calculateProgress(
              episodeShots.map((s) => ({ status: getShotCompletionStatus(s) }))
            );

            return (
              <div key={episode.id} className="space-y-0.5">
                {/*  tậptiêu đề */}
                <button
                  onClick={() => toggleEpisode(episode.id)}
                  className="w-full flex items-center gap-1 px-2 py-1.5 rounded hover:bg-muted text-left"
                >
                  {expandedEpisodes.has(episode.id) ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  <Film className="h-3 w-3 text-primary" />
                  <span className="text-sm font-medium flex-1 truncate">
                    {episode.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {episodeProgress}
                  </span>
                </button>

                {/* Danh sách cảnh */}
                {expandedEpisodes.has(episode.id) && (
                  <div className="ml-4 space-y-0.5">
                    {episodeScenes.map((scene) => {
                      const sceneShots = shotsByScene[scene.id] || [];
                      const sceneProgress = calculateProgress(
                        sceneShots.map((s) => ({ status: getShotCompletionStatus(s) }))
                      );
                      const isSceneSelected = selectedSceneId === scene.id;

                      return (
                        <div key={scene.id} className="space-y-0.5">
                          {/* Cảnhtiêu đề */}
                          <div className="flex items-center group">
                            <button
                              onClick={() => toggleScene(scene.id)}
                              className={cn(
                                "flex-1 flex items-center gap-1 px-2 py-1 rounded hover:bg-muted text-left",
                                isSceneSelected && "bg-primary/10 ring-1 ring-primary/30"
                              )}
                            >
                              {sceneShots.length > 0 ? (
                                expandedScenes.has(scene.id) ? (
                                  <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronRight className="h-3 w-3" />
                                )
                              ) : (
                                <span className="w-3" />
                              )}
                              <MapPin className="h-3 w-3 text-blue-500" />
                              <span className="text-xs flex-1 truncate">
                                {scene.name || scene.location}
                              </span>
                              <StatusIcon status={scene.status} />
                              <span className="text-xs text-muted-foreground">
                                {sceneProgress}
                              </span>
                            </button>
                            {/* ThêmCảnhTất cảPhân cảnh到Phân cảnhChỉnh sửa */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 shrink-0 opacity-0 group-hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddSceneToSplitScenes(scene);
                              }}
                              title="Thêm tất cả phân cảnh vào chỉnh sửa"
                            >
                              <Plus className="h-3 w-3 text-green-500" />
                            </Button>
                            {/* 发送Cảnhnút */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 shrink-0 opacity-0 group-hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSendScene(scene);
                              }}
                              title="Gửi toàn bộ cảnh đến AI đạo diễn để tạo ảnh"
                            >
                              <Send className="h-3 w-3 text-primary" />
                            </Button>
                          </div>

                          {/* Danh sách phân cảnh */}
                          {expandedScenes.has(scene.id) && sceneShots.length > 0 && (
                            <div className="ml-4 space-y-0.5">
                              {sceneShots.map((shot) => {
                                const isShotSelected = selectedShotId === shot.id;

                                return (
                                  <div key={shot.id} className="flex items-center group">
                                    <button
                                      onClick={() => handleSendShot(shot, scene)}
                                      onDoubleClick={() => handleAddShotToSplitScenes(shot, scene)}
                                      className={cn(
                                        "flex-1 flex items-center gap-2 px-2 py-1 rounded hover:bg-muted text-left",
                                        isShotSelected && "bg-primary/10 ring-1 ring-primary/30"
                                      )}
                                      title="Nhấp: Gửi đến đầu vào AI đạo diễn | Nhấp đúp: Thêm trực tiếp vào phân cảnh"
                                    >
                                      <span className="text-xs font-mono text-muted-foreground w-5">
                                        {String(shot.index).padStart(2, "0")}
                                      </span>
                                      <span className="text-xs flex-1 truncate">
                                        {shot.shotSize || "Cảnh quay"} - {shot.actionSummary?.slice(0, 20)}...
                                      </span>
                                      <StatusIcon
                                        status={getShotCompletionStatus(shot)}
                                      />
                                    </button>
                                    {/* Thêm到Phân cảnhnút */}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 shrink-0 opacity-0 group-hover:opacity-100"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleAddShotToSplitScenes(shot, scene);
                                      }}
                                      title="Thêm vào chỉnh sửa phân cảnh"
                                    >
                                      <Plus className="h-3 w-3 text-green-500" />
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* phía dướithao tác */}
      <div className="p-3 border-t space-y-2">
        {/* chế độ说明 */}
        <div className="text-[10px] text-muted-foreground space-y-1">
          <p><span className="text-green-500">+</span> Thêm vào phân cảnh (tạo ảnh riêng)</p>
          <p><span className="text-primary">→</span> Gửi đến đầu vào (tạo hàng loạt tiết kiệm)</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleBackToScript}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Quay lại kịch bản
        </Button>
      </div>
    </div>
  );
}
