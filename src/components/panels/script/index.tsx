// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Script View
 * 剧本panel - 三栏bố cục
 * Cột trái: nhập kịch bản (nhập/sáng tác)
 * Cột giữa: cấu trúc phân cấp (tập→cảnh→phân cảnh)
 * Cột phải：thuộc tínhpanel和跳转thao tác
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  useScriptStore,
  useActiveScriptProject,
  type ScriptCalibrationStatus,
  type ScriptViewpointStatus,
  type ScriptStructureStatus,
} from "@/stores/script-store";
import { useProjectStore } from "@/stores/project-store";
import { useAPIConfigStore } from "@/stores/api-config-store";
import { getFeatureConfig, getFeatureNotConfiguredMessage } from "@/lib/ai/feature-router";
import { useCharacterLibraryStore } from "@/stores/character-library-store";
import { useMediaPanelStore } from "@/stores/media-panel-store";
import { parseScript, generateShotList, generateScriptFromIdea } from "@/lib/script/script-parser";
import { 
  importFullScript, 
  importSingleEpisodeContent,
  generateEpisodeShots, 
  regenerateAllEpisodeShots,
  calibrateEpisodeTitles,
  getMissingTitleEpisodes,
  calibrateEpisodeShots,
  calibrateSingleShot,
  generateEpisodeSynopses,
  getMissingSynopsisEpisodes,
} from "@/lib/script/full-script-service";
import {
  analyzeCharacterStages,
  convertStagesToVariations,
  detectMultiStageHints,
} from "@/lib/script/character-stage-analyzer";
import { generateMultiPageContactSheetData, buildContactSheetDataFromViewpoints } from "@/lib/script/scene-viewpoint-generator";
import {
  calibrateCharacters,
  convertToScriptCharacters,
  sortByImportance,
  extractAllCharactersFromEpisodes,
  resolveSafeScriptCharacters,
} from "@/lib/script/character-calibrator";
import { findCharacterByDescription } from "@/lib/script/ai-character-finder";
import { findSceneByDescription } from "@/lib/script/ai-scene-finder";
import {
  calibrateScenes,
  calibrateEpisodeScenes,
  convertToScriptScenes,
  sortByImportance as sortScenesByImportance,
} from "@/lib/script/scene-calibrator";
import { syncToSeriesMeta } from "@/lib/script/series-meta-sync";
import { exportProjectMetadata } from "@/lib/script/full-script-service";
import {
  selectTrailerShots,
  convertShotsToSplitScenes,
  type TrailerGenerationOptions,
} from "@/lib/script/trailer-service";
import { useDirectorStore, useActiveDirectorProject, type TrailerDuration } from "@/stores/director-store";
import { DEFAULT_CINEMATOGRAPHY_PROFILE_ID } from "@/lib/constants/cinematography-profiles";
import { ScriptInput } from "./script-input";
import { EpisodeTree } from "./episode-tree";
import { PropertyPanel } from "./property-panel";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { getStyleTokens, DEFAULT_STYLE_ID } from "@/lib/constants/visual-styles";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { CalibrationStrictness, FilteredCharacterRecord } from "@/types/script";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function ScriptView() {
  const { activeProjectId } = useProjectStore();
  const scriptProject = useActiveScriptProject();
  const {
    setActiveProjectId,
    ensureProject,
    setRawScript,
    setLanguage,
    setTargetDuration,
    setStyleId,
    setSceneCount,
    setShotCount,
    setScriptData,
    setParseStatus,
    setShots,
    setShotStatus,
    // CRUD operations
    addEpisode,
    updateEpisode,
    deleteEpisode,
    // Bundle thao tác（同步 episodeRawScripts）
    addEpisodeBundle,
    updateEpisodeBundle,
    deleteEpisodeBundle,
    addScene,
    updateScene,
    deleteScene,
    addCharacter,
    updateCharacter,
    deleteCharacter,
    updateShot,
    deleteShot,
    // đầy đủ剧本管理
    setProjectBackground,
    setEpisodeRawScripts,
    updateEpisodeRawScript,
    setPromptLanguage,
    setCalibrationState: setScriptCalibrationState,
    setSingleShotCalibrationStatus: setSingleShotCalibrationStatusInStore,
    setCalibrationStrictness,
    setLastFilteredCharacters,
  } = useScriptStore();

  const { getApiKey, checkChatKeys, isFeatureConfigured } = useAPIConfigStore();
  const { 
    characters: allCharacters, 
    selectCharacter: selectLibraryCharacter,
  } = useCharacterLibraryStore();
  const { setActiveTab, goToDirectorWithData, goToCharacterWithData, goToSceneWithData, activeEpisodeIndex, enterEpisode } = useMediaPanelStore();

  // đã chọn状态
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemType, setSelectedItemType] = useState<
    "character" | "scene" | "shot" | "episode" | null
  >(null);
  
  // đầy đủ剧本Nhập状态
  const [importError, setImportError] = useState<string | undefined>();

  // AIHiệu chuẩn状态
  const calibrationState = scriptProject?.calibrationState;
  const calibrationStatus = calibrationState?.titleCalibrationStatus || 'idle';
  const [missingTitleCount, setMissingTitleCount] = useState(0);

  // Nhập/Tạo đại cương状态持久化到 store，panel切换后可恢复
  const importStatus = calibrationState?.importStatus || 'idle';
  const setImportStatus = useCallback((status: 'idle' | 'importing' | 'ready' | 'error') => {
    if (!activeProjectId) return;
    setScriptCalibrationState(activeProjectId, { importStatus: status });
  }, [activeProjectId, setScriptCalibrationState]);

  const synopsisStatus = calibrationState?.synopsisStatus || 'idle';
  const setSynopsisStatus = useCallback((status: 'idle' | 'generating' | 'completed' | 'error') => {
    if (!activeProjectId) return;
    setScriptCalibrationState(activeProjectId, { synopsisStatus: status });
  }, [activeProjectId, setScriptCalibrationState]);

  // Tạo đại cương状态
  const [missingSynopsisCount, setMissingSynopsisCount] = useState(0);
  
  // Nhân vậtgiai đoạnphân tích状态
  const [stageAnalysisStatus, setStageAnalysisStatus] = useState<'idle' | 'analyzing' | 'completed' | 'error'>('idle');
  const [multiStageHints, setMultiStageHints] = useState<string[]>([]);
  const [suggestMultiStage, setSuggestMultiStage] = useState(false);
  
  // Nhân vậtHiệu chuẩn状态
  const characterCalibrationStatus = calibrationState?.characterCalibrationStatus || 'idle';
  const [characterCalibrationResult, setCharacterCalibrationResult] = useState<{
    filteredCount: number;
    mergedCount: number;
    finalCount: number;
  } | null>(null);
  
  // Nhân vậtHiệu chuẩnXác nhậnPopup状态
  const pendingCalibrationCharacters = calibrationState?.pendingCalibrationCharacters || null;
  const pendingFilteredCharacters = calibrationState?.pendingFilteredCharacters || [];
  const calibrationDialogOpen = calibrationState?.calibrationDialogOpen || false;
  
  // CảnhHiệu chuẩn状态
  const sceneCalibrationStatus = calibrationState?.sceneCalibrationStatus || 'idle';
  // góc nhìnphân tích状态（强制工作流）
  const viewpointAnalysisStatus = calibrationState?.viewpointAnalysisStatus || 'idle';
  
  // phân cảnh đơnHiệu chuẩn状态
  const singleShotCalibrationStatus = calibrationState?.singleShotCalibrationStatus || {};
  
  // 单 tậpCấu trúcbổ sung状态
  const structureCompletionStatus = calibrationState?.structureCompletionStatus || 'idle';
  const [structureOverwriteConfirmOpen, setStructureOverwriteConfirmOpen] = useState(false);
  const prevEpisodeRef = useRef<{ index: number | null; rawLen: number }>({ index: null, rawLen: 0 });

  // 二次Hiệu chuẩn追踪（đang xử lý...nút触发时标记，用于进度panel区分首次/二次）
  const [secondPassTypes, setSecondPassTypes] = useState<Set<string>>(new Set());
  const addSecondPass = useCallback((type: string) => {
    setSecondPassTypes(prev => new Set(prev).add(type));
  }, []);
  const removeSecondPass = useCallback((type: string) => {
    setSecondPassTypes(prev => { const next = new Set(prev); next.delete(type); return next; });
  }, []);
  
  // Trailer状态
  const { 
    setTrailerConfig, 
    setTrailerScenes, 
    clearTrailer,
    addScenesFromScript,
  } = useDirectorStore();
  const directorProject = useActiveDirectorProject();
  const trailerConfig = directorProject?.trailerConfig || null;
  const currentSplitScenes = directorProject?.splitScenes || [];

  // Sync activeProjectId from project-store to script-store
  useEffect(() => {
    if (activeProjectId) {
      setActiveProjectId(activeProjectId);
      ensureProject(activeProjectId);
    }
  }, [activeProjectId, setActiveProjectId, ensureProject]);

  // panel重新挂载时，将"Đang thực hiện"的瞬态状态重置为 idle，避免显示虚假的 loading 状态
  useEffect(() => {
    if (!activeProjectId) return;
    const state = useScriptStore.getState().projects[activeProjectId]?.calibrationState;
    if (!state) return;
    const fixes: Record<string, string> = {};
    if (state.importStatus === 'importing') fixes.importStatus = 'idle';
    if (state.synopsisStatus === 'generating') fixes.synopsisStatus = 'idle';
    if (Object.keys(fixes).length > 0) {
      setScriptCalibrationState(activeProjectId, fixes as never);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  // Keep last stable project id during transient null windows (e.g. duplicate flow)
  // to avoid creating phantom project keys like "default".
  const stableProjectIdRef = useRef<string>("default-project");
  useEffect(() => {
    if (activeProjectId) {
      stableProjectIdRef.current = activeProjectId;
    }
  }, [activeProjectId]);

  const projectId = activeProjectId || stableProjectIdRef.current;

  const setCalibrationStatus = useCallback((status: ScriptCalibrationStatus) => {
    setScriptCalibrationState(projectId, { titleCalibrationStatus: status });
  }, [projectId, setScriptCalibrationState]);

  const setCharacterCalibrationStatus = useCallback((status: ScriptCalibrationStatus) => {
    setScriptCalibrationState(projectId, { characterCalibrationStatus: status });
  }, [projectId, setScriptCalibrationState]);

  const setSceneCalibrationStatus = useCallback((status: ScriptCalibrationStatus) => {
    setScriptCalibrationState(projectId, { sceneCalibrationStatus: status });
  }, [projectId, setScriptCalibrationState]);

  const setViewpointAnalysisStatus = useCallback((status: ScriptViewpointStatus) => {
    setScriptCalibrationState(projectId, { viewpointAnalysisStatus: status });
  }, [projectId, setScriptCalibrationState]);

  const setStructureCompletionStatus = useCallback((status: ScriptStructureStatus) => {
    setScriptCalibrationState(projectId, { structureCompletionStatus: status });
  }, [projectId, setScriptCalibrationState]);

  // Local state fallbacks
  const rawScript = scriptProject?.rawScript || "";
  const language = scriptProject?.language || "Tiếng Trung";
  const targetDuration = scriptProject?.targetDuration || "60s";
  const styleId = scriptProject?.styleId || DEFAULT_STYLE_ID;
  const sceneCount = scriptProject?.sceneCount;
  const shotCount = scriptProject?.shotCount;
  const scriptData = scriptProject?.scriptData || null;
  const parseStatus = scriptProject?.parseStatus || "idle";
  const parseError = scriptProject?.parseError;
  const shots = scriptProject?.shots || [];
  const promptLanguage = scriptProject?.promptLanguage || 'zh';

  // 当前 tập作用域：从 activeEpisodeIndex 映射到 episodeId
  const activeEpisodeId = activeEpisodeIndex != null
    ? scriptData?.episodes.find(ep => ep.index === activeEpisodeIndex)?.id ?? undefined
    : undefined;

  // 进入 tập时Tự động聚焦到对应 episode
  useEffect(() => {
    if (activeEpisodeIndex != null && scriptData?.episodes) {
      const ep = scriptData.episodes.find(e => e.index === activeEpisodeIndex);
      if (ep) {
        setSelectedItemId(`episode_${activeEpisodeIndex}`);
        setSelectedItemType("episode");
      }
    }
  }, [activeEpisodeIndex, scriptData?.episodes]);

  // 优先检查新的ánh xạ dịch vụ
  const chatConfigured = isFeatureConfigured('script_analysis') || checkChatKeys().isAllConfigured;
  const episodeRawScripts = scriptProject?.episodeRawScripts || [];

  //  tập作用域下显示该 tậpgốcNội dung，Toàn bộgóc nhìn显示đầy đủ rawScript
  const effectiveRawScript = activeEpisodeIndex != null
    ? episodeRawScripts.find(ep => ep.episodeIndex === activeEpisodeIndex)?.rawContent ?? ""
    : rawScript;
  
  // === 单 tậpCấu trúcbổ sung: rawContent 从空→非空 Tự động触发 ===
  const handleStructureCompletion = useCallback(async () => {
    if (activeEpisodeIndex == null || !scriptData) return;
    setStructureCompletionStatus('processing');
    try {
      const result = await importSingleEpisodeContent(
        effectiveRawScript,
        activeEpisodeIndex,
        projectId,
      );
      if (result.success) {
        setStructureCompletionStatus('completed');
        if (result.sceneCount > 0) {
          toast.success(`Hoàn tất bổ sung cấu trúc: phân tích được ${result.sceneCount} cảnh`);
        }
      } else {
        setStructureCompletionStatus('error');
        toast.error(result.error || 'Bổ sung cấu trúc thất bại');
      }
    } catch (e) {
      setStructureCompletionStatus('error');
      console.error('[handleStructureCompletion]', e);
    }
    // 3秒后重置为 idle，允许再次触发
    setTimeout(() => setStructureCompletionStatus('idle'), 3000);
  }, [activeEpisodeIndex, effectiveRawScript, projectId, scriptData]);

  useEffect(() => {
    const prev = prevEpisodeRef.current;
    const currentLen = effectiveRawScript.length;

    //  tập切换 → 只更新 ref
    if (prev.index !== (activeEpisodeIndex ?? null)) {
      prevEpisodeRef.current = { index: activeEpisodeIndex ?? null, rawLen: currentLen };
      return;
    }

    prevEpisodeRef.current = { index: activeEpisodeIndex ?? null, rawLen: currentLen };

    // 只在 tập作用域 + idle 状态下触发
    if (activeEpisodeIndex == null) return;
    if (structureCompletionStatus !== 'idle') return;

    // 检测粘贴：从短Nội dung跳变到大量Nội dung
    if (prev.rawLen < 20 && currentLen > 50) {
      const ep = scriptData?.episodes?.find(e => e.index === activeEpisodeIndex);
      const hasScenes = ep && ep.sceneIds.length > 0;

      if (hasScenes) {
        setStructureOverwriteConfirmOpen(true);
      } else {
        handleStructureCompletion();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRawScript, activeEpisodeIndex, structureCompletionStatus]);

  // 计算各 tập的Trạng thái tạo phân cảnh
  const episodeGenerationStatus = episodeRawScripts.reduce((acc, ep) => {
    acc[ep.episodeIndex] = ep.shotGenerationStatus;
    return acc;
  }, {} as Record<number, 'idle' | 'generating' | 'completed' | 'error'>);

  // 处理đã chọn
  const handleSelectItem = useCallback(
    (id: string, type: "character" | "scene" | "shot" | "episode") => {
      setSelectedItemId(id);
      setSelectedItemType(type);

      // đã chọn tập时进入 tập作用域（设置 activeEpisodeIndex，激活 P4C Tự độngCấu trúcbổ sung）
      if (type === "episode" && id.startsWith("episode_")) {
        const epIndex = parseInt(id.replace("episode_", ""), 10);
        if (!Number.isNaN(epIndex)) {
          enterEpisode(epIndex, projectId);
        }
      }
    },
    [enterEpisode, projectId]
  );

  // 获取đã chọn的数据
  const selectedCharacter =
    selectedItemType === "character"
      ? scriptData?.characters.find((c) => c.id === selectedItemId)
      : undefined;
  const selectedScene =
    selectedItemType === "scene"
      ? scriptData?.scenes.find((s) => s.id === selectedItemId)
      : undefined;
  const selectedShot =
    selectedItemType === "shot"
      ? shots.find((s) => s.id === selectedItemId)
      : undefined;
  
  // 获取đã chọn的 tập数据（包含đại cương）
  const selectedEpisode = selectedItemType === "episode" && selectedItemId
    ? (() => {
        const epIndex = parseInt(selectedItemId.replace('episode_', ''));
        const rawScript = episodeRawScripts.find(ep => ep.episodeIndex === epIndex);
        const epData = scriptData?.episodes.find(ep => ep.index === epIndex);
        return rawScript && epData ? { ...epData, ...rawScript } : undefined;
      })()
    : undefined;
  
  // 获取đã chọnCảnh的Tất cảPhân cảnh（用于多góc nhìnphân tích）
  const selectedSceneShots = selectedItemType === "scene" && selectedItemId
    ? shots.filter(s => s.sceneRefId === selectedItemId || s.sceneId === selectedItemId)
    : undefined;
  
  // 获取đã chọn tập的Tất cảPhân cảnh（Phân cảnhTrực tiếp有 episodeId trường）
  const selectedEpisodeShots = selectedItemType === "episode" && selectedEpisode
    ? shots.filter(shot => (shot as any).episodeId === selectedEpisode.id)
    : [];

  // 为单 tậpTạo phân cảnh（需要先定义，因为 handleImportFullScript 依赖它）
  const handleGenerateEpisodeShots = useCallback(async (episodeIndex: number) => {
    // Sử dụng feature router 获取 API 配置
    const featureConfig = getFeatureConfig('script_analysis');
    
    console.log('[handleGenerateEpisodeShots] featureConfig:', featureConfig ? 'Đã cấu hình' : 'Chưa cấu hình');
    console.log('[handleGenerateEpisodeShots] allApiKeys:', featureConfig?.allApiKeys?.length || 0);
    
    if (!featureConfig) {
      toast.warning('Chưa cấu hình API Zhipu, phân tích góc nhìn AI sẽ bị bỏ qua');
    }
    
    try {
      toast.info(`Đang tạo phân cảnh cho tập ${episodeIndex}...`);
      setViewpointAnalysisStatus('analyzing');
      
      const apiKey = featureConfig?.allApiKeys?.join(',') || '';
      // Sử dụng配置的 provider，不再硬编码
      const provider = (featureConfig?.platform === 'zhipu' ? 'zhipu' : 'openai') as string;
      
      console.log('[handleGenerateEpisodeShots] apiKey length:', apiKey.length);
      console.log('[handleGenerateEpisodeShots] provider:', provider, '(from config:', featureConfig?.platform, ')');
      
      const options = {
        apiKey,
        provider,
        baseUrl: featureConfig?.baseUrl,
        styleId,
        targetDuration,
        promptLanguage,
      };
      
      const result = await generateEpisodeShots(
        episodeIndex,
        projectId,
        options,
        (msg) => console.log(`[ScriptView] ${msg}`)
      );
      
      if (result.viewpointAnalyzed) {
        setViewpointAnalysisStatus('completed');
      } else {
        setViewpointAnalysisStatus('error');
        toast.error(`AI phân tích góc nhìn chưa thực hiện: ${result.viewpointSkippedReason || 'Lý do không rõ'}`);
      }
      
      toast.success(`Tạo phân cảnh tập ${episodeIndex} hoàn tất! Tổng cộng ${result.shots.length} phân cảnh`);
      return result;
    } catch (error) {
      const err = error as Error;
      console.error("[ScriptView] Episode shot generation failed:", err);
      toast.error(`Phân cTạo ảnh thất bại: ${err.message}`);
      setViewpointAnalysisStatus('error');
      return { shots: [], viewpointAnalyzed: false, viewpointSkippedReason: err.message };
    }
  }, [projectId, styleId, targetDuration, promptLanguage]);

  // đầy đủ剧本Nhập
  const handleImportFullScript = useCallback(async (text: string) => {
    if (!text.trim()) {
      toast.error("Vui lòng nhập nội dung kịch bản");
      return;
    }

    const featureConfig = getFeatureConfig('script_analysis');
    const hasAI = !!featureConfig;

    setImportStatus('importing');
    setImportError(undefined);

    try {
      // 1. 规则Phân tíchNhập（把用户选的风格和Ngôn ngữ一起传进去）
      const result = await importFullScript(text, projectId, { styleId, promptLanguage });
      
      if (!result.success) {
        throw new Error(result.error || "Nhập thất bại");
      }

      setImportStatus('ready');
      const rawCharacterCount = result.scriptData?.characters.length || 0;
      toast.success(
        `Nhập thành công: ${result.episodes.length} tập, ${rawCharacterCount} nhân vật (chờ hiệu chỉnh), ${result.scriptData?.scenes.length || 0} Cảnh`
      );
      
      // 2. Hiệu chuẩn（缺tiêu đề的 tập）
      const missingTitles = getMissingTitleEpisodes(projectId);
      if (missingTitles.length > 0 && hasAI) {
        setMissingTitleCount(missingTitles.length);
        toast.info(`Đang tự động tạo tiêu đề cho ${missingTitles.length} tập...`);
        setCalibrationStatus('calibrating');
        
        try {
          const calibResult = await calibrateEpisodeTitles(
            projectId,
            {
              apiKey: featureConfig.allApiKeys.join(','),
              provider: featureConfig.platform,
              baseUrl: featureConfig.baseUrl,
              model: featureConfig.models?.[0],
            },
            (current, total, msg) => console.log(`[ScriptView] Hiệu chỉnh tiêu đề: ${msg}`)
          );
          
          if (calibResult.success) {
            setCalibrationStatus('completed');
            setMissingTitleCount(0);
            toast.success(`Đã tạo tiêu đề cho ${calibResult.calibratedCount} tập`);
          }
        } catch (e) {
          console.error('[ScriptView] Auto calibration failed:', e);
          setCalibrationStatus('error');
        }
      }
      
      // 3. Tạo（每 tậpđại cương）
      if (hasAI && result.episodes.length > 0) {
        toast.info(`Đang tạo đại cương cho ${result.episodes.length} tập...`);
        setSynopsisStatus('generating');
        
        try {
          const synopsisResult = await generateEpisodeSynopses(
            projectId,
            {
              apiKey: featureConfig.allApiKeys.join(','),
              provider: featureConfig.platform,
              baseUrl: featureConfig.baseUrl,
              model: featureConfig.models?.[0],
            },
            (current, total, msg) => console.log(`[ScriptView] Tạo đại cương: ${msg}`)
          );
          
          if (synopsisResult.success) {
            setSynopsisStatus('completed');
            setMissingSynopsisCount(0);
            toast.success(`Đã tạo đại cương cho ${synopsisResult.generatedCount} tập`);
          }
        } catch (e) {
          console.error('[ScriptView] Auto synopsis generation failed:', e);
          setSynopsisStatus('error');
        }
      }
      
      // 4. Tạo（第1 tậpPhân cảnh）——此时元数据与đại cương已就绪
      let viewpointResult: { viewpointAnalyzed: boolean; viewpointSkippedReason?: string } | null = null;
      if (result.episodes.length > 0) {
        toast.info("Đang tự động tạo phân cảnh tập 1...");
        await new Promise(resolve => setTimeout(resolve, 500));
        viewpointResult = await handleGenerateEpisodeShots(1);
      }
      
      // 5. Hiệu chuẩn（Nhân vật）
      if (hasAI && rawCharacterCount > 0 && result.scriptData && result.projectBackground) {
        // 强制工作流：AI góc nhìnphân tích未执 hàng，不进入Nhân vậtHiệu chuẩn
        if (!viewpointResult?.viewpointAnalyzed) {
          toast.error(`AI phân tích góc nhìn chưa thực hiện, đã chặn hiệu chỉnh nhân vật: ${viewpointResult?.viewpointSkippedReason || 'Lý do không rõ'}`);
          return;
        }
        toast.info(`Đang AI hiệu chỉnh ${rawCharacterCount} nhân vật...`);
        setCharacterCalibrationStatus('calibrating');
        
        try {
          // 统一从ánh xạ dịch vụ获取配置，不需要手动传参
          const calibResult = await calibrateCharacters(
            result.scriptData.characters,
            result.projectBackground,
            result.episodes,
            { promptLanguage }
          );
          
          // 转换并更新Danh sách nhân vật
          const sortedChars = sortByImportance(calibResult.characters);
          const currentProject = useScriptStore.getState().projects[projectId];
          const currentScriptData = currentProject?.scriptData;
          const existingCharacters = currentScriptData?.characters || result.scriptData.characters;
          const resolvedCharacters = resolveSafeScriptCharacters(
            convertToScriptCharacters(sortedChars, existingCharacters, promptLanguage),
            {
              existingCharacters,
              seriesMetaCharacters: currentProject?.seriesMeta?.characters,
              rawCharacters: result.scriptData.characters,
            },
          );
          const newCharacters = resolvedCharacters.characters;
          
          // 从 store 获取最新的 scriptData（避免Ghi đèPhân cảnhTạo的 AI góc nhìn数据）
          if (currentScriptData) {
            setScriptData(projectId, {
              ...currentScriptData,  // Sử dụng dữ liệu mới nhất, giữ scenes.viewpoints
              characters: newCharacters,
            });
          }
          if (resolvedCharacters.source !== 'calibrated') {
            console.warn(`[ScriptView] AI character calibration returned empty result, recovered characters from ${resolvedCharacters.source}.`);
            toast.warning('AI hiệu chỉnh nhân vật trả về kết quả rỗng, đã giữ nhân vật hiện có, tránh xóa dữ liệu chính kịch bản');
          }
          
          setCharacterCalibrationStatus('completed');
          setCharacterCalibrationResult({
            filteredCount: calibResult.filteredWords.length,
            mergedCount: calibResult.mergeRecords.length,
            finalCount: newCharacters.length,
          });
          
          toast.success(
            `Hiệu chỉnh nhân vật hoàn tất: ${newCharacters.length} nhân vật hợp lệ, lọc ${calibResult.filteredWords.length} từ không phải nhân vật, hợp nhất ${calibResult.mergeRecords.length} nhóm trùng lặp`
          );
          
          console.log('[ScriptView] Nhân vậtKết quả hiệu chỉnh:', calibResult.analysisNotes);
          if (calibResult.filteredWords.length > 0) {
            console.log('[ScriptView] Từ không phải nhân vật đã lọc:', calibResult.filteredWords);
          }
          if (calibResult.mergeRecords.length > 0) {
            console.log('[ScriptView] Bản ghi hợp nhất:', calibResult.mergeRecords);
          }
        } catch (e) {
          console.error('[ScriptView] Nhân vậtHiệu chỉnh thất bại:', e);
          setCharacterCalibrationStatus('error');
          toast.error(`Hiệu chỉnh nhân vật thất bại, sử dụng danh sách nhân vật gốc`);
        }
      }
      
    } catch (error) {
      const err = error as Error;
      console.error("[ScriptView] Import failed:", err);
      setImportStatus('error');
      setImportError(err.message);
      toast.error(`Nhập thất bại: ${err.message}`);
    }
  }, [projectId, handleGenerateEpisodeShots, promptLanguage]);

  // 更新Tất cảPhân cảnh
  const handleRegenerateAllShots = useCallback(async () => {
    const featureConfig = getFeatureConfig('script_analysis');
    
    if (episodeRawScripts.length === 0) {
      toast.error("Không có tập nào để tạo");
      return;
    }
    
    try {
      toast.info(`Đang tạo phân cảnh cho tất cả ${episodeRawScripts.length} tập... (có thể mất nhiều thời gian)`);
      
      const options = {
        apiKey: featureConfig?.allApiKeys.join(',') || '',
        provider: (featureConfig?.platform === 'zhipu' ? 'zhipu' : 'openai') as string,
        styleId,
        targetDuration,
        promptLanguage,
      };
      
      await regenerateAllEpisodeShots(
        projectId,
        options,
        (current, total, msg) => {
          console.log(`[ScriptView] ${msg} (${current}/${total})`);
        }
      );
      
      toast.success(`Tạo phân cảnh tất cả ${episodeRawScripts.length} tập hoàn tất!`);
    } catch (error) {
      const err = error as Error;
      console.error("[ScriptView] All episodes shot generation failed:", err);
      toast.error(`Phân cTạo ảnh thất bại: ${err.message}`);
    }
  }, [projectId, styleId, targetDuration, promptLanguage, episodeRawScripts.length]);

  // 计算缺失tiêu đề和đại cương的 tập数
  useEffect(() => {
    if (importStatus === 'ready' && projectId) {
      const missingTitles = getMissingTitleEpisodes(projectId);
      setMissingTitleCount(missingTitles.length);
      
      const missingSynopses = getMissingSynopsisEpisodes(projectId);
      setMissingSynopsisCount(missingSynopses.length);
    }
  }, [importStatus, projectId, episodeRawScripts]);

  // AIHiệu chuẩn：为缺失tiêu đề的 tập数Tạotiêu đề
  const handleCalibrate = useCallback(async () => {
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('script_analysis'));
      return;
    }
    
    const missing = getMissingTitleEpisodes(projectId);
    if (missing.length === 0) {
      toast.info("Tất cả các tập đều đã có tiêu đề");
      return;
    }
    
    setCalibrationStatus('calibrating');
    toast.info(`Đang tạo tiêu đề cho ${missing.length} tập...`);
    
    try {
      const result = await calibrateEpisodeTitles(
        projectId,
        {
          apiKey: featureConfig.allApiKeys.join(','),
          provider: featureConfig.platform,  // Dùng platform trong cài đặt
          baseUrl: featureConfig.baseUrl,
          model: featureConfig.models?.[0],  // Sử dụng model đầu tiên được cấu hình
        },
        (current, total, msg) => {
          console.log(`[ScriptView] Calibration: ${msg}`);
        }
      );
      
      if (result.success) {
        setCalibrationStatus('completed');
        setMissingTitleCount(result.totalMissing - result.calibratedCount);
        toast.success(`Hiệu chỉnh hoàn tất! Đã tạo tiêu đề cho ${result.calibratedCount} tập`);
      } else {
        throw new Error(result.error || 'Hiệu chỉnh thất bại');
      }
    } catch (error) {
      const err = error as Error;
      console.error("[ScriptView] Calibration failed:", err);
      setCalibrationStatus('error');
      toast.error(`Hiệu chỉnh thất bại: ${err.message}`);
    }
  }, [projectId]);

  // Hiệu chuẩn phân cảnh AI：tối ưuTiếng TrungMô tả、Tạo英文visualPrompt、tối ưuPhân cảnhThiết kế
  const handleCalibrateShots = useCallback(async (episodeIndex: number) => {
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('script_analysis'));
      return;
    }
    
    addSecondPass('shots');
    setViewpointAnalysisStatus('analyzing');
    toast.info(`Đang hiệu chỉnh phân cảnh tập ${episodeIndex}...`);
    
    try {
      const result = await calibrateEpisodeShots(
        episodeIndex,
        projectId,
        {
          apiKey: featureConfig.allApiKeys.join(','),
          provider: featureConfig.platform,  // Dùng platform trong cài đặt
          baseUrl: featureConfig.baseUrl,
          model: featureConfig.models?.[0],  // Sử dụng model đầu tiên được cấu hình
          styleId,
          cinematographyProfileId: directorProject?.cinematographyProfileId || DEFAULT_CINEMATOGRAPHY_PROFILE_ID,
          promptLanguage,
        },
        (current, total, msg) => {
          console.log(`[ScriptView] Shot Calibration: ${msg}`);
        }
      );
      
      if (result.success) {
        setViewpointAnalysisStatus('completed');
        removeSecondPass('shots');
        toast.success(`Hiệu chỉnh phân cảnh hoàn tất! Đã tối ưu ${result.calibratedCount}/${result.totalShots} Phân cảnh`);
        
        // P2b: Phân cảnhHiệu chuẩn回写 SeriesMeta
        try {
          const store = useScriptStore.getState();
          const meta = store.projects[projectId]?.seriesMeta;
          if (meta) {
            const updates = syncToSeriesMeta(meta, 'shot', {});
            if (Object.keys(updates).length > 0) {
              store.updateSeriesMeta(projectId, updates);
              console.log('[handleCalibrateShots] SeriesMeta Phân cảnhGhi lại hoàn tất');
            }
            const mdContent = exportProjectMetadata(projectId);
            store.setMetadataMarkdown(projectId, mdContent);
          }
        } catch (e) {
          console.warn('[handleCalibrateShots] SeriesMeta Ghi lại thất bại:', e);
        }
      } else {
        throw new Error(result.error || 'Phân cảnhHiệu chỉnh thất bại');
      }
    } catch (error) {
      const err = error as Error;
      console.error("[ScriptView] Shot calibration failed:", err);
      setViewpointAnalysisStatus('error');
      removeSecondPass('shots');
      toast.error(`Phân cảnhHiệu chỉnh thất bại: ${err.message}`);
    }
  }, [projectId, styleId, promptLanguage, directorProject?.cinematographyProfileId, addSecondPass, removeSecondPass]);

  // AIHiệu chuẩnCảnhPhân cảnh：只Hiệu chuẩn指定Cảnh下的Phân cảnh
  const handleCalibrateScenesShots = useCallback(async (sceneId: string) => {
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('script_analysis'));
      return;
    }

    // 找到Cảnh所属的 tập
    const episode = scriptData?.episodes.find(ep => ep.sceneIds.includes(sceneId));
    if (!episode) {
      toast.error('Không tìm thấy tập của cảnh');
      return;
    }

    const scene = scriptData?.scenes.find(s => s.id === sceneId);
    const sceneName = scene?.name || scene?.location || 'Cảnh';

    addSecondPass('shots');
    setViewpointAnalysisStatus('analyzing');
    toast.info(`Đang hiệu chỉnh phân cảnh của「${sceneName}」...`);

    try {
      const result = await calibrateEpisodeShots(
        episode.index,
        projectId,
        {
          apiKey: featureConfig.allApiKeys.join(','),
          provider: featureConfig.platform,
          baseUrl: featureConfig.baseUrl,
          model: featureConfig.models?.[0],
          styleId,
          cinematographyProfileId: directorProject?.cinematographyProfileId || DEFAULT_CINEMATOGRAPHY_PROFILE_ID,
          promptLanguage,
        },
        (current, total, msg) => {
          console.log(`[ScriptView] Scene Shot Calibration: ${msg}`);
        },
        sceneId,
      );

      if (result.success) {
        setViewpointAnalysisStatus('completed');
        removeSecondPass('shots');
        toast.success(`「${sceneName}」Hiệu chỉnh phân cảnh hoàn tất! Đã tối ưu ${result.calibratedCount}/${result.totalShots} Phân cảnh`);
      } else {
        throw new Error(result.error || 'Phân cảnhHiệu chỉnh thất bại');
      }
    } catch (error) {
      const err = error as Error;
      console.error("[ScriptView] Scene shot calibration failed:", err);
      setViewpointAnalysisStatus('error');
      removeSecondPass('shots');
      toast.error(`Phân cảnhHiệu chỉnh thất bại: ${err.message}`);
    }
  }, [projectId, scriptData, styleId, promptLanguage, directorProject?.cinematographyProfileId, addSecondPass, removeSecondPass]);

  // AIHiệu chuẩnphân cảnh đơn（用于TrailerPhân cảnh）
  const handleCalibrateSingleShot = useCallback(async (shotId: string) => {
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('script_analysis'));
      return;
    }
    
    // 设置状态为 calibrating
    setSingleShotCalibrationStatusInStore(projectId, shotId, 'calibrating');
    
    const shot = shots.find(s => s.id === shotId);
    if (!shot) {
      toast.error('Không tìm thấy phân cảnh');
      setSingleShotCalibrationStatusInStore(projectId, shotId, 'error');
      return;
    }
    
    toast.info(`Đang hiệu chỉnh phân cảnh: ${shot.actionSummary?.slice(0, 20)}...`);
    
    try {
      const result = await calibrateSingleShot(
        shotId,
        projectId,
        {
          apiKey: featureConfig.allApiKeys.join(','),
          provider: featureConfig.platform,
          baseUrl: featureConfig.baseUrl,
          model: featureConfig.models?.[0],
          styleId,
          cinematographyProfileId: directorProject?.cinematographyProfileId || DEFAULT_CINEMATOGRAPHY_PROFILE_ID,
          promptLanguage,
        },
        (msg: string) => {
          console.log(`[ScriptView] Single Shot Calibration: ${msg}`);
        }
      );
      
      if (result.success) {
        setSingleShotCalibrationStatusInStore(projectId, shotId, 'completed');
        toast.success(`Hiệu chỉnh phân cảnh hoàn tất!`);
      } else {
        throw new Error(result.error || 'Phân cảnhHiệu chỉnh thất bại');
      }
    } catch (error) {
      const err = error as Error;
      console.error("[ScriptView] Single shot calibration failed:", err);
      setSingleShotCalibrationStatusInStore(projectId, shotId, 'error');
      toast.error(`Phân cảnhHiệu chỉnh thất bại: ${err.message}`);
    }
  }, [projectId, styleId, promptLanguage, shots, directorProject?.cinematographyProfileId, setSingleShotCalibrationStatusInStore]);

  // AITạo每 tậpđại cương
  const handleGenerateSynopses = useCallback(async () => {
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('script_analysis'));
      return;
    }
    
    setSynopsisStatus('generating');
    toast.info(`Đang tạo đại cương cho ${episodeRawScripts.length} tập...`);
    
    try {
      const result = await generateEpisodeSynopses(
        projectId,
        {
          apiKey: featureConfig.allApiKeys.join(','),
          provider: featureConfig.platform,
          baseUrl: featureConfig.baseUrl,
          model: featureConfig.models?.[0],
        },
        (current, total, msg) => {
          console.log(`[ScriptView] Synopsis: ${msg}`);
        }
      );
      
      if (result.success) {
        setSynopsisStatus('completed');
        setMissingSynopsisCount(0);
        toast.success(`Tạo đại cương hoàn tất! Đã tạo đại cương cho ${result.generatedCount} tập`);
      } else {
        throw new Error(result.error || 'Tạo đại cương thất bại');
      }
    } catch (error) {
      const err = error as Error;
      console.error("[ScriptView] Synopsis generation failed:", err);
      setSynopsisStatus('error');
      toast.error(`Tạo đại cương thất bại: ${err.message}`);
    }
  }, [projectId, episodeRawScripts.length]);

  // 手动触发 AI Nhân vậtHiệu chuẩn（包含多giai đoạnbiến thểTự độngTạo）
  // 注意：Nhân vậtHiệu chuẩn是独立步骤，不依赖góc nhìnphân tích，可随时根据最新数据执 hàng
  const handleCalibrateCharacters = useCallback(async () => {
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('script_analysis'));
      return;
    }
    
    const background = scriptProject?.projectBackground;
    
    if (!background) {
      toast.error('Thiếu thông tin nền kịch bản');
      return;
    }
    
    // 检查 episodeRawScripts 是否存在
    if (!episodeRawScripts || episodeRawScripts.length === 0) {
      toast.error('Thiếu dữ liệu kịch bản phân tập, vui lòng nhập lại kịch bản hoặc sử dụng tính năng nhập phiên bản mới');
      console.error('[handleCalibrateCharacters] episodeRawScripts trống hoặc không tồn tại');
      return;
    }
    
    // 从tập剧本đang xử lý...取Tất cảNhân vật（而不是Sử dụng当前 scriptData.characters）
    const rawCharacters = extractAllCharactersFromEpisodes(episodeRawScripts);
    
    if (rawCharacters.length === 0) {
      toast.error('Không thể trích xuất nhân vật từ kịch bản');
      return;
    }
    
    console.log('[handleCalibrateCharacters] Bắt đầu hiệu chỉnh:', {
      rawCharacterCount: rawCharacters.length,
      episodeCount: episodeRawScripts.length,
      hasBackground: !!background,
    });
    
    addSecondPass('characters');
    setScriptCalibrationState(projectId, {
      characterCalibrationStatus: 'calibrating',
      calibrationDialogOpen: false,
      pendingCalibrationCharacters: null,
      pendingFilteredCharacters: [],
    });
    toast.info(`Đang AI hiệu chỉnh ${rawCharacters.length} nhân vật gốc...`);
    
    try {
      // === 第一步：AI Hiệu chuẩnNhân vật ===
      // 保留上次Hiệu chuẩn的Nhân vật，防止 AI 每次kết quả不一致导致Nhân vật丢失
      const existingCalibrated = scriptData?.characters?.map(c => ({
        id: c.id,
        name: c.name,
        importance: (c.tags?.includes('protagonist') ? 'protagonist' :
                     c.tags?.includes('supporting') ? 'supporting' :
                     c.tags?.includes('minor') ? 'minor' : 'extra') as 'protagonist' | 'supporting' | 'minor' | 'extra',
        appearanceCount: 1,
        role: c.role,
        age: c.age,
        gender: c.gender,
        relationships: c.relationships,
        nameVariants: [c.name],
        visualPromptEn: c.visualPromptEn,
        visualPromptZh: c.visualPromptZh,
        identityAnchors: c.identityAnchors,
        negativePrompt: c.negativePrompt,
      })) || [];
      
      // 统一从ánh xạ dịch vụ获取配置，不需要手动传参
      const calibResult = await calibrateCharacters(
        rawCharacters,
        background,
        episodeRawScripts,
        { previousCharacters: existingCalibrated, promptLanguage, strictness: scriptProject?.calibrationStrictness || 'normal' }
      );
      
      // 转换并更新Danh sách nhân vật（保留gốc数据）
      const sortedChars = sortByImportance(calibResult.characters);
      
      // 不再硬编码lọc，由 calibrator 根据严格度统一处理
      let newCharacters = convertToScriptCharacters(sortedChars, rawCharacters, promptLanguage);
      if (newCharacters.length === 0) {
        const currentProject = useScriptStore.getState().projects[projectId];
        const resolvedCalibrationCharacters = resolveSafeScriptCharacters([], {
          existingCharacters: currentProject?.scriptData?.characters,
          seriesMetaCharacters: currentProject?.seriesMeta?.characters,
          rawCharacters,
        });
        newCharacters = resolvedCalibrationCharacters.characters;
        console.warn(`[handleCalibrateCharacters] AI character calibration returned empty result, recovered characters from ${resolvedCalibrationCharacters.source}.`);
        toast.warning('AI hiệu chỉnh nhân vật trả về kết quả rỗng, đã quay lại danh sách nhân vật hiện có, vui lòng xác nhận rồi lưu');
      }
      
      console.log('[ScriptView] Nhân vậtKết quả hiệu chỉnh:', calibResult.analysisNotes);
      
      // === 第二步：Tự động检测并Tạo多Nhân vật giai đoạn ===
      const totalEpisodes = episodeRawScripts.length;
      const multiStageHint = detectMultiStageHints(background.outline || '', totalEpisodes);
      
      console.log('[handleCalibrateCharacters] Kết quả phát hiện đa giai đoạn:', multiStageHint);
      
      if (multiStageHint.suggestMultiStage) {
        toast.info('Phát hiện manh mối nhân vật đa giai đoạn, đang phân tích sự thay đổi giai đoạn nhân vật chính...');
        setStageAnalysisStatus('analyzing');
        
        try {
          console.log('[handleCalibrateCharacters] Bắt đầu AI phân tích giai đoạn nhân vật...');
          // 统一从ánh xạ dịch vụ获取配置，不需要手动传参
          const analyses = await analyzeCharacterStages(
            background,
            newCharacters,
            totalEpisodes,
            promptLanguage
          );
          
          console.log('[handleCalibrateCharacters] Kết quả phân tích AI:', analyses);
          
          // 统计Nhân vật cần đa giai đoạn
          const multiStageChars = analyses.filter(a => a.needsMultiStage);
          console.log('[handleCalibrateCharacters] Nhân vật cần đa giai đoạn:', multiStageChars.map(c => c.characterName));
          
          if (multiStageChars.length > 0) {
            // 为每Nhân vật cần đa giai đoạntạoNhân vật giai đoạn
            const newStageCharacters: import("@/types/script").ScriptCharacter[] = [];
            let stageCount = 0;
            
            for (const analysis of multiStageChars) {
              // 查找基础Nhân vật
              const baseCharIndex = newCharacters.findIndex(c => c.name === analysis.characterName);
              if (baseCharIndex === -1) {
                console.log(`[StageAnalysis] Không tìm thấy nhân vật ${analysis.characterName}, bỏ qua`);
                continue;
              }
              const baseChar = newCharacters[baseCharIndex];
              
              // 为每giai đoạntạo独立的 ScriptCharacter
              const stageCharIds: string[] = [];
              for (let stageIdx = 0; stageIdx < analysis.stages.length; stageIdx++) {
                const stage = analysis.stages[stageIdx];
                // Sử dụngchỉ mục确保 ID 唯一，避免不同Nhân vật的相同giai đoạn名导致重复 key
                const stageCharId = `${baseChar.id}_stage_${stageIdx}_${stage.name.replace(/\s+/g, '_')}`;
                stageCharIds.push(stageCharId);
                
                // tạoNhân vật giai đoạn
                const stageChar: import("@/types/script").ScriptCharacter = {
                  id: stageCharId,
                  name: `${baseChar.name}（${stage.name}）`,
                  gender: baseChar.gender,
                  age: stage.ageDescription,
                  personality: baseChar.personality,
                  role: `${stage.stageDescription}\n\nNền nhân vật gốc: ${baseChar.role || ''}`,
                  traits: baseChar.traits,
                  appearance: baseChar.appearance,
                  relationships: baseChar.relationships,
                  tags: [...(baseChar.tags || []), stage.name, 'Nhân vật giai đoạn'],
                  // 多giai đoạn关联
                  baseCharacterId: baseChar.id,
                  stageInfo: {
                    stageName: stage.name,
                    episodeRange: stage.episodeRange,
                    ageDescription: stage.ageDescription,
                  },
                  consistencyElements: analysis.consistencyElements,
                  // 专业Prompt thị giác
                  visualPromptEn: promptLanguage === 'zh' ? undefined : [
                    analysis.consistencyElements.facialFeatures,
                    analysis.consistencyElements.bodyType,
                    analysis.consistencyElements.uniqueMarks,
                    stage.visualPromptEn,
                  ].filter(Boolean).join(', '),
                  visualPromptZh: promptLanguage === 'en' ? undefined : stage.visualPromptZh,
                  // === kế thừa基础Nhân vật的6层身份neo ===
                  identityAnchors: baseChar.identityAnchors,
                  negativePrompt: baseChar.negativePrompt,
                };
                
                newStageCharacters.push(stageChar);
                stageCount++;
              }
              
              // 更新基础Nhân vật的 stageCharacterIds，并标记为chỉ mụcNhân vật（不需要单独Tạo形象）
              newCharacters[baseCharIndex] = {
                ...baseChar,
                stageCharacterIds: stageCharIds,
                consistencyElements: analysis.consistencyElements,
                // 标记Cho nhân vật cha，不需要单独Tạo形象，只作Cho nhân vật giai đoạn的nhóm
                tags: [...(baseChar.tags || []).filter(t => t !== 'protagonist'), 'Nhân vật cha'],
                notes: `Nhân vật này có ${stageCharIds.length} phiên bản giai đoạn, vui lòng tạo hình ảnh cho từng phiên bản`,
              };
              
              console.log(`[StageAnalysis] Đã tạo ${analysis. cho nhân vật ${analysis.characterName}stages.length} Nhân vật giai đoạn`);
            }
            
            // hợp nhấtNhân vật giai đoạn到Danh sách nhân vật，Nhân vật giai đoạn紧跟在其Nhân vật cha后面
            const sortedCharacters: import("@/types/script").ScriptCharacter[] = [];
            for (const char of newCharacters) {
              sortedCharacters.push(char);
              // 如果这Nhân vật有Nhân vật giai đoạn，紧跟在后面Thêm
              if (char.stageCharacterIds && char.stageCharacterIds.length > 0) {
                const stageChars = newStageCharacters.filter(sc => sc.baseCharacterId === char.id);
                sortedCharacters.push(...stageChars);
              }
            }
            newCharacters = sortedCharacters;
            
            setStageAnalysisStatus('completed');
            setMultiStageHints(multiStageHint.hints);
            setSuggestMultiStage(false); // Đã hoàn thành, không gợi ý nữa
            
            toast.success(`Tạo giai đoạn đa nhân vật hoàn tất! Đã tạo ${stageCount} giai đoạn nhân vật cho ${multiStageChars.length} nhân vật`);
          } else {
            setStageAnalysisStatus('completed');
            console.log('[StageAnalysis] Không có nhân vật cần hình ảnh đa giai đoạn');
          }
        } catch (stageErr) {
          console.error('[ScriptView] Phân tích đa giai đoạn thất bại:', stageErr);
          setStageAnalysisStatus('error');
          // 不阻止主流程，继续Lưu基础Nhân vật
        }
      }
      
      // === 第三步：Lưu到临时状态，打开Xác nhậnPopup ===
      setScriptCalibrationState(projectId, {
        pendingCalibrationCharacters: newCharacters,
        pendingFilteredCharacters: calibResult.filteredCharacters || [],
        calibrationDialogOpen: true,
      });
      
      setCharacterCalibrationStatus('completed');
      removeSecondPass('characters');
      setCharacterCalibrationResult({
        filteredCount: calibResult.filteredCharacters.length,
        mergedCount: calibResult.mergeRecords.length,
        finalCount: newCharacters.length,
      });
      
      toast.info(`Hiệu chuẩn nhân vật hoàn tất, tổng ${newCharacters.length} nhân vật, vui lòng Xác nhận kết quả`);
      
      if (calibResult.filteredWords.length > 0) {
        console.log('[ScriptView] Từ không phải nhân vật đã lọc:', calibResult.filteredWords);
      }
      if (calibResult.mergeRecords.length > 0) {
        console.log('[ScriptView] Bản ghi hợp nhất:', calibResult.mergeRecords);
      }
    } catch (error) {
      const err = error as Error;
      console.error('[ScriptView] Nhân vậtHiệu chỉnh thất bại:', err);
      setCharacterCalibrationStatus('error');
      removeSecondPass('characters');
      toast.error(`Nhân vậtHiệu chỉnh thất bại: ${err.message}`);
    }
  }, [scriptData, scriptProject, episodeRawScripts, projectId, promptLanguage, setScriptData, viewpointAnalysisStatus, addSecondPass, removeSecondPass, setScriptCalibrationState]);

  // Xác nhậnNhân vậtKết quả hiệu chỉnh
  const handleConfirmCalibration = useCallback((
    keptCharacters: import("@/types/script").ScriptCharacter[],
    filteredCharacters: FilteredCharacterRecord[]
  ) => {
    const currentProject = useScriptStore.getState().projects[projectId];
    const currentScriptData = currentProject?.scriptData;
    const safeCharacters = keptCharacters.length > 0
      ? keptCharacters
      : resolveSafeScriptCharacters([], {
          existingCharacters: currentProject?.scriptData?.characters,
          seriesMetaCharacters: currentProject?.seriesMeta?.characters,
        }).characters;
    if (currentScriptData) {
      setScriptData(projectId, {
        ...currentScriptData,
        characters: safeCharacters,
      });
      console.log('[handleConfirmCalibration] Đã lưu vào store, số nhân vật:', safeCharacters.length);
    }
    setLastFilteredCharacters(projectId, filteredCharacters);
    setScriptCalibrationState(projectId, {
      calibrationDialogOpen: false,
      pendingCalibrationCharacters: null,
      pendingFilteredCharacters: [],
    });
    toast.success(`Nhân vậtHiệu chuẩnXác nhận: ${safeCharacters.length} Nhân vậtđã lưu`);
    
    // P2b: Hiệu chuẩn回写 SeriesMeta
    try {
      const store = useScriptStore.getState();
      const meta = store.projects[projectId]?.seriesMeta;
      if (meta) {
        const updates = syncToSeriesMeta(meta, 'character', { characters: safeCharacters });
        if (Object.keys(updates).length > 0) {
          store.updateSeriesMeta(projectId, updates);
          console.log('[handleConfirmCalibration] SeriesMeta Nhân vậtGhi lại hoàn tất');
        }
        // Tạo lại元数据 MD
        const mdContent = exportProjectMetadata(projectId);
        store.setMetadataMarkdown(projectId, mdContent);
      }
    } catch (e) {
      console.warn('[handleConfirmCalibration] SeriesMeta Ghi lại thất bại:', e);
    }
  }, [projectId, setScriptData, setLastFilteredCharacters, setScriptCalibrationState]);

  // HủyNhân vậtHiệu chuẩn
  const handleCancelCalibration = useCallback(() => {
    setScriptCalibrationState(projectId, {
      calibrationDialogOpen: false,
      pendingCalibrationCharacters: null,
      pendingFilteredCharacters: [],
    });
    toast.info('Đã hủy Hiệu chuẩn nhân vật');
  }, [projectId, setScriptCalibrationState]);

  // Mức độ chặt chẽ hiệu chuẩn变更
  const handleCalibrationStrictnessChange = useCallback((strictness: CalibrationStrictness) => {
    setCalibrationStrictness(projectId, strictness);
  }, [projectId, setCalibrationStrictness]);

  // 从bị lọc cột表恢复Nhân vật
  const handleRestoreFilteredCharacter = useCallback((characterName: string) => {
    const currentScriptData = useScriptStore.getState().projects[projectId]?.scriptData;
    if (!currentScriptData) return;
    
    const newChar: import("@/types/script").ScriptCharacter = {
      id: `char_restored_${Date.now()}`,
      name: characterName,
      tags: ['extra', 'restored'],
    };
    
    setScriptData(projectId, {
      ...currentScriptData,
      characters: [...currentScriptData.characters, newChar],
    });
    
    const current = useScriptStore.getState().projects[projectId]?.lastFilteredCharacters || [];
    setLastFilteredCharacters(projectId, current.filter(fc => fc.name !== characterName));
    toast.success(`Đã khôi phục nhân vật: ${characterName}`);
  }, [projectId, setScriptData, setLastFilteredCharacters]);

  // Nhập kịch bản后检测是否需要多Nhân vật giai đoạn（仅用于显示Gợi ý）
  const handleAnalyzeCharacterStages = useCallback(async () => {
    // 已整合到 handleCalibrateCharacters đang xử lý...gọi API即可
    await handleCalibrateCharacters();
  }, [handleCalibrateCharacters]);

  // Nhập kịch bản后检测是否需要多Nhân vật giai đoạn
  useEffect(() => {
    if (importStatus === 'ready' && scriptProject?.projectBackground?.outline) {
      const result = detectMultiStageHints(
        scriptProject.projectBackground.outline,
        episodeRawScripts.length
      );
      setMultiStageHints(result.hints);
      setSuggestMultiStage(result.suggestMultiStage);
      
      if (result.suggestMultiStage) {
        console.log('[ScriptView] Phát hiện tín hiệu đa giai đoạn nhân vật:', result.hints);
      }
    }
  }, [importStatus, scriptProject?.projectBackground?.outline, episodeRawScripts.length]);

  // Generate script from idea (Sáng tácchế độ)
  // AIphân tích用户输入，Tạo标准格式剧本，rồi走Nhập流程
  const handleGenerateFromIdea = useCallback(async (idea: string) => {
    if (!idea.trim()) {
      toast.error("Vui lòng Nhập ý tưởng câu chuyện");
      return;
    }

    // Use feature router to get script_analysis config
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('script_analysis'));
      return;
    }

    setParseStatus(projectId, "parsing");
    toast.info("Đang tạo kịch bản từ ý tưởng...");

    try {
      const allKeysString = featureConfig.allApiKeys.join(',');
      const provider = featureConfig.platform === 'zhipu' ? 'zhipu' : 'openai';
      const baseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
      const model = featureConfig.models?.[0];
      
      if (!baseUrl || !model) {
        toast.error('Vui lòng cài đặt Base URL và mô hình cho phân tích kịch bản trong cài đặt');
        setParseStatus(projectId, "error", "Thiếu Base URL hoặc cấu hình model");
        return;
      }

      console.log(`[ScriptView] Generating script from idea with ${featureConfig.allApiKeys.length} API keys`);

      // 第一步：AI Tạo kịch bản文本（符合Nhập格式）
      const generatedScript = await generateScriptFromIdea(idea, {
        apiKey: allKeysString,
        provider: provider as string,
        baseUrl,
        model,
        language,
        targetDuration,
        sceneCount: sceneCount ? parseInt(sceneCount) : undefined,
        shotCount: shotCount ? parseInt(shotCount) : undefined,
        styleId,
      });

      // LưuTạo的剧本到 rawScript（方便用户Xem/chỉnh sửa）
      setRawScript(projectId, generatedScript);
      setParseStatus(projectId, "idle");
      toast.success('Tạo kịch bản thành công! Đang tự động nhập...');

      // 第二步：Tự độnggọi APINhập流程（复用Nhập的Tất cả后续逻辑）
      await handleImportFullScript(generatedScript);
      
    } catch (error) {
      const err = error as Error;
      console.error("[ScriptView] Script generation failed:", err);
      setParseStatus(projectId, "error", err.message);
      toast.error(`Tạo kịch bản thất bại: ${err.message}`);
    }
  }, [projectId, language, targetDuration, sceneCount, shotCount, styleId, setRawScript, setParseStatus, handleImportFullScript]);

  // Parse screenplay (AIPhân tích)
  const handleParse = useCallback(async () => {
    if (!rawScript.trim()) {
      toast.error("Vui lòng nhập nội dung kịch bản");
      return;
    }

    // Use feature router to get script_analysis config (with multi-key support)
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('script_analysis'));
      return;
    }

    setParseStatus(projectId, "parsing");

    try {
      // Pass all API keys (comma-separated) for rotation
      const allKeysString = featureConfig.allApiKeys.join(',');
      const provider = featureConfig.platform === 'zhipu' ? 'zhipu' : 'openai';
      
      console.log(`[ScriptView] Parsing with ${featureConfig.allApiKeys.length} API keys`);

      const baseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
      const model = featureConfig.models?.[0];
      if (!baseUrl || !model) {
        toast.error('Vui lòng cài đặt Base URL và mô hình cho phân tích kịch bản trong cài đặt');
        setParseStatus(projectId, "error", "Thiếu Base URL hoặc cấu hình model");
        return;
      }

      const result = await parseScript(rawScript, {
        apiKey: allKeysString, // Pass all keys for rotation
        provider: provider as string,
        baseUrl,
        model,
        language,
        sceneCount: sceneCount ? parseInt(sceneCount) : undefined,
        shotCount: shotCount ? parseInt(shotCount) : undefined,
      });

      // 确保有episodestrường
      if (!result.episodes || result.episodes.length === 0) {
        result.episodes = [{
          id: "default",
          index: 1,
          title: result.title || "Tập 1",
          sceneIds: result.scenes.map((s) => s.id),
        }];
      }

      setScriptData(projectId, result);
      setParseStatus(projectId, "ready");
      toast.success(
        `Phân tích hoàn tất: ${result.characters.length} nhân vật, ${result.scenes.length} cảnh`
      );

      // Tự độngTạo phân cảnh
      await handleGenerateShots(result);
    } catch (error) {
      const err = error as Error;
      console.error("[ScriptView] Parse failed:", err);
      setParseStatus(projectId, "error", err.message);
      toast.error(`Phân tích thất bại: ${err.message}`);
    }
  }, [
    rawScript,
    language,
    sceneCount,
    shotCount,
    projectId,
    setParseStatus,
    setScriptData,
  ]);

  // Generate shot list with streaming updates
  const handleGenerateShots = useCallback(
    async (data?: typeof scriptData) => {
      const targetData = data || scriptData;
      if (!targetData) {
        return;
      }

      // Use feature router for script_analysis (shot generation uses same API)
      const featureConfig = getFeatureConfig('script_analysis');
      if (!featureConfig) {
        return;
      }

      setShotStatus(projectId, "generating");
      
      // Clear existing shots and prepare for streaming updates
      setShots(projectId, []);
      let accumulatedShots: import("@/types/script").Shot[] = [];

      try {
        // Pass all API keys for rotation
        const allKeysString = featureConfig.allApiKeys.join(',');
        const provider = featureConfig.platform === 'zhipu' ? 'zhipu' : 'openai';
        
        console.log(`[ScriptView] Generating shots with ${featureConfig.allApiKeys.length} API keys`);

        // Build character descriptions from library if available
        const characterDescriptions: Record<string, string> = {};
        targetData.characters.forEach((char) => {
          const libChar = allCharacters.find(
            (c) => c.name === char.name || c.name.includes(char.name)
          );
          if (libChar) {
            characterDescriptions[char.id] =
              libChar.visualTraits || libChar.description || "";
          }
        });

        // Streaming callback: update UI immediately when each scene completes
        const onShotsGenerated = (newShots: import("@/types/script").Shot[], sceneIndex: number) => {
          // Re-index new shots to be sequential
          const reindexedShots = newShots.map((shot, idx) => ({
            ...shot,
            id: `shot-${accumulatedShots.length + idx + 1}`,
            index: accumulatedShots.length + idx + 1,
          }));
          
          accumulatedShots = [...accumulatedShots, ...reindexedShots];
          
          // Update UI immediately
          setShots(projectId, [...accumulatedShots]);
          
          console.log(`[ScriptView] Cảnh ${sceneIndex + 1} hoàn tất, đã tạo ${accumulatedShots.length} phân cảnh`);
        };

        // Progress callback
        const onProgress = (completed: number, total: number) => {
          console.log(`[ScriptView] Tiến độ: ${completed}/${total} cảnh`);
        };

        const baseUrl = featureConfig.baseUrl?.replace(/\/+$/, '');
        const model = featureConfig.models?.[0];
        if (!baseUrl || !model) {
          toast.error('Vui lòng cài đặt Base URL và mô hình cho phân tích kịch bản trong cài đặt');
          setShotStatus(projectId, "error", "Thiếu Base URL hoặc cấu hình model");
          return;
        }

        const result = await generateShotList(
          targetData,
          {
            apiKey: allKeysString,
            provider: provider as string,
            baseUrl,
            model,
            targetDuration,
            styleId,
            characterDescriptions,
            shotCount: shotCount ? parseInt(shotCount) : undefined,
          },
          onProgress,
          onShotsGenerated // callback streaming
        );

        // Final update with all shots (in case streaming missed any)
        setShots(projectId, result);
        setShotStatus(projectId, "ready");
        toast.success(`Tạo hoàn tất: ${result.length} phân cảnh`);
      } catch (error) {
        const err = error as Error;
        console.error("[ScriptView] Shot generation failed:", err);
        setShotStatus(projectId, "error", err.message);
        toast.error(`Phân cTạo ảnh thất bại: ${err.message}`);
      }
    },
    [
      scriptData,
      targetDuration,
      styleId,
      shotCount,
      projectId,
      allCharacters,
      setShotStatus,
      setShots,
    ]
  );

  // 跳转到Thư viện nhân vật（传递数据到Tạoconsole）
  const handleGoToCharacterLibrary = useCallback(
    (characterId: string) => {
      // 查找Nhân vật数据
      const character = scriptData?.characters.find((c) => c.id === characterId);
      if (!character) {
        setActiveTab("characters");
        toast.info("Đã chuyển đến Thư viện nhân vật");
        return;
      }

      // 检查是否已关联Thư viện nhân vật
      if (character.characterLibraryId) {
        // 已关联，Trực tiếp跳转并đã chọn
        selectLibraryCharacter(character.characterLibraryId);
        setActiveTab("characters");
        toast.info(`Đã chuyển đến Thư viện nhân vật, đã chọn「${character.name}」`);
        return;
      }

      // 传递Nhân vật数据到Thư viện nhân vậtTạoconsole（包含世界级大师Tạo的Prompt thị giác）
      // 获取剧本元数据đang xử lý...信息
      const background = scriptProject?.projectBackground;
      
      goToCharacterWithData({
        name: character.name,
        gender: character.gender,
        age: character.age,
        personality: character.personality,
        role: character.role,
        traits: character.traits,
        skills: character.skills,
        keyActions: character.keyActions,
        appearance: character.appearance,
        relationships: character.relationships,
        tags: character.tags,
        notes: character.notes,
        styleId,
        // === promptNgôn ngữ偏好 ===
        promptLanguage: scriptProject?.promptLanguage || 'zh',
        // === 专业Nhân vậtThiết kếtrường（世界级大师Tạo）===
        visualPromptEn: character.visualPromptEn,
        visualPromptZh: character.visualPromptZh,
        // === 6层身份neo（Nhân vật一致性）===
        identityAnchors: character.identityAnchors,
        negativePrompt: character.negativePrompt,
        // === 多Nhân vật giai đoạn支持 ===
        stageInfo: character.stageInfo,
        consistencyElements: character.consistencyElements,
        // === 年代信息（从剧本元数据传递）===
        storyYear: background?.storyStartYear,
        era: background?.era || background?.timelineSetting,
        // ===  tập作用域透传 ===
        sourceEpisodeIndex: activeEpisodeIndex ?? undefined,
        sourceEpisodeId: activeEpisodeId,
      });

      toast.success(`Đã chuyển đến Thư viện nhân vật, thông tin Nhân vật「${character.name}」đã điền vào bảng điều khiển tạo`);
    },
    [scriptData, styleId, setActiveTab, selectLibraryCharacter, goToCharacterWithData, activeEpisodeIndex, activeEpisodeId]
  );

  // 获取当前风格的 tokens（从统一风格库Nhập）
  const getStyleTokensLocal = useCallback((currentStyleId: string) => {
    return getStyleTokens(currentStyleId);
  }, []);

  // 跳转到Cảnh库（Sử dụng AI phân tích的đầy đủ数据，或基础Thông tin cảnh）
  const handleGoToSceneLibrary = useCallback(
    (sceneId: string) => {
      // 查找Cảnh数据
      const scene = scriptData?.scenes.find((s) => s.id === sceneId);
      if (!scene) {
        setActiveTab("scenes");
        toast.info("Đã chuyển đến Thư viện cảnh");
        return;
      }

      const hasViewpoints = scene.viewpoints && scene.viewpoints.length > 0;
      const hasCalibrationData = scene.architectureStyle || scene.keyProps?.length || scene.lightingDesign;

      if (hasViewpoints) {
        // 【đầy đủ路径】有 AI góc nhìnphân tíchkết quả，构建联合图数据
        const invalidViewpoints = scene.viewpoints!.filter(vp => !vp.name || !vp.id);
        if (invalidViewpoints.length > 0) {
          console.warn('[handleGoToSceneLibrary] Phát hiện viewpoints không đầy đủ:', invalidViewpoints);
          toast.warning('Dữ liệu góc nhìn không đầy đủ, vui lòng thực hiện lại "AI phân tích góc nhìn cảnh"');
          return;
        }

        const styleTokens = getStyleTokens(styleId);
        const contactSheetData = buildContactSheetDataFromViewpoints(
          scene.viewpoints!,
          scene,
          shots,
          styleTokens,
          '16:9'
        );

        console.log('[handleGoToSceneLibrary] Dùng dữ liệu AI phân tích để Tạo ảnh kết hợp:', {
          sceneId: scene.id,
          viewpointsCount: scene.viewpoints!.length,
          pendingViewpointsCount: contactSheetData.viewpoints.length,
          contactSheetPromptsCount: contactSheetData.contactSheetPrompts.length,
        });

        goToSceneWithData({
          name: scene.name || scene.location,
          location: scene.location,
          time: scene.time,
          atmosphere: scene.atmosphere,
          styleId,
          tags: scene.tags,
          notes: scene.notes,
          visualPrompt: scene.visualPrompt,
          visualPromptEn: scene.visualPromptEn,
          architectureStyle: scene.architectureStyle,
          lightingDesign: scene.lightingDesign,
          colorPalette: scene.colorPalette,
          eraDetails: scene.eraDetails,
          keyProps: scene.keyProps,
          spatialLayout: scene.spatialLayout,
          viewpoints: contactSheetData.viewpoints,
          contactSheetPrompts: contactSheetData.contactSheetPrompts,
          // ===  tập作用域透传 ===
          sourceEpisodeIndex: activeEpisodeIndex ?? undefined,
          sourceEpisodeId: activeEpisodeId,
          // === promptNgôn ngữ偏好 ===
          promptLanguage: scriptProject?.promptLanguage || 'zh',
        });

        const viewpointCount = scene.viewpoints!.length;
        toast.success(
          `Đã chuyển đến Thư viện cảnh, Cảnh「${scene.name || scene.location}」đã điền\n` +
          `✔ ${viewpointCount} góc nhìn AI phân tích đã tải`
        );
      } else {
        // 【简单路径】无góc nhìnphân tích（Sáng tácchế độ或未Hiệu chuẩn），传递基础Thông tin cảnh
        goToSceneWithData({
          name: scene.name || scene.location,
          location: scene.location,
          time: scene.time,
          atmosphere: scene.atmosphere,
          styleId,
          tags: scene.tags,
          notes: scene.notes,
          ...(hasCalibrationData && {
            visualPrompt: scene.visualPrompt,
            visualPromptEn: scene.visualPromptEn,
            architectureStyle: scene.architectureStyle,
            lightingDesign: scene.lightingDesign,
            colorPalette: scene.colorPalette,
            eraDetails: scene.eraDetails,
            keyProps: scene.keyProps,
            spatialLayout: scene.spatialLayout,
          }),
          // ===  tập作用域透传 ===
          sourceEpisodeIndex: activeEpisodeIndex ?? undefined,
          sourceEpisodeId: activeEpisodeId,
          // === promptNgôn ngữ偏好 ===
          promptLanguage: scriptProject?.promptLanguage || 'zh',
        });

        toast.success(
          `Đã chuyển đến Thư viện cảnh, đã điền thông tin cơ bản Cảnh「${scene.name || scene.location}」`
        );
      }
    },
    [scriptData, styleId, setActiveTab, goToSceneWithData, shots, activeEpisodeIndex, activeEpisodeId]
  );

  // 跳转到AIĐạo diễn
  const handleGoToDirector = useCallback(
    (shotId: string) => {
      // 查找Phân cảnh数据
      const shot = shots.find((s) => s.id === shotId);
      if (!shot) {
        setActiveTab("director");
        toast.info("Đã chuyển đến AI Đạo diễn");
        return;
      }

      // 查找Thông tin cảnh
      const scene = scriptData?.scenes.find((s) => s.id === shot.sceneRefId);

      // 组合故事prompt: Cảnh + Hành động + Thoại
      const promptParts: string[] = [];
      if (scene) {
        promptParts.push(`Cảnh：${scene.location || scene.name}`);
        if (scene.time) promptParts.push(`Thời gian：${scene.time}`);
        if (scene.atmosphere) promptParts.push(`Bầu không khí：${scene.atmosphere}`);
      }
      if (shot.actionSummary) {
        promptParts.push(`\nHành động：${shot.actionSummary}`);
      }
      if (shot.dialogue) {
        promptParts.push(`Thoại: 「${shot.dialogue}」`);
      }

      const storyPrompt = promptParts.join("\n");

      // 传递数据并跳转 - phân cảnh đơn sceneCount=1
      goToDirectorWithData({
        storyPrompt,
        characterNames: shot.characterNames,
        sceneLocation: scene?.location,
        sceneTime: scene?.time,
        shotId,
        sceneCount: 1, // Phân cảnh đơn
        styleId, // kế thừa phong cách kịch bản
        sourceType: 'shot',
        // ===  tập作用域透传 ===
        sourceEpisodeIndex: activeEpisodeIndex ?? undefined,
        sourceEpisodeId: activeEpisodeId,
      });

      toast.success("Đã chuyển đến AI Đạo diễn, đã điền Nội dung phân cảnh");
    },
    [shots, scriptData, styleId, goToDirectorWithData, setActiveTab, activeEpisodeIndex, activeEpisodeId]
  );

  // 从Cảnh跳转到AIĐạo diễn（整Cảnh的Tất cảPhân cảnh）
  const handleGoToDirectorFromScene = useCallback(
    (sceneId: string) => {
      // 查找Cảnh数据
      const scene = scriptData?.scenes.find((s) => s.id === sceneId);
      if (!scene) {
        setActiveTab("director");
        toast.info("Đã chuyển đến AI Đạo diễn");
        return;
      }

      // 查找该Cảnh下的Tất cảPhân cảnh
      const sceneShots = shots.filter((s) => s.sceneRefId === sceneId);
      const shotCount = sceneShots.length || 1;

      // 组合故事prompt: Thông tin cảnh + Tất cảPhân cảnhNội dung
      const promptParts: string[] = [];
      promptParts.push(`Cảnh：${scene.location || scene.name}`);
      if (scene.time) promptParts.push(`Thời gian：${scene.time}`);
      if (scene.atmosphere) promptParts.push(`Bầu không khí：${scene.atmosphere}`);

      if (sceneShots.length > 0) {
        promptParts.push(`\n--- Danh sách phân cảnh (${sceneShots.length}) ---`);
        sceneShots.forEach((shot, idx) => {
          const shotDesc = [
            `\n[Phân cảnh${idx + 1}]`,
            shot.actionSummary ? `Hành động：${shot.actionSummary}` : null,
            shot.dialogue ? `Thoại: 「${shot.dialogue}」` : null,
          ].filter(Boolean).join(" ");
          promptParts.push(shotDesc);
        });
      }

      const storyPrompt = promptParts.join("\n");

      // 收 tậpTất cảPhân cảnh的Nhân vật
      const allCharacterNames = new Set<string>();
      sceneShots.forEach((shot) => {
        shot.characterNames?.forEach((name) => allCharacterNames.add(name));
      });

      // 传递数据并跳转 - Cảnh级别 sceneCount=Phân cảnh数
      goToDirectorWithData({
        storyPrompt,
        characterNames: Array.from(allCharacterNames),
        sceneLocation: scene.location,
        sceneTime: scene.time,
        sceneCount: shotCount,
        styleId,
        sourceType: 'scene',
        // ===  tập作用域透传 ===
        sourceEpisodeIndex: activeEpisodeIndex ?? undefined,
        sourceEpisodeId: activeEpisodeId,
      });

      toast.success(`Đã chuyển đến AI Đạo diễn, đã điền Cảnh「${scene.name || scene.location}」(${shotCount} phân cảnh)`);
    },
    [shots, scriptData, styleId, goToDirectorWithData, setActiveTab, activeEpisodeIndex, activeEpisodeId]
  );

  // CRUD handlers - 封装projectId
  // Episode Sử dụng Bundle 版本（同步 episodeRawScripts）
  const handleAddEpisodeBundle = useCallback((title: string, synopsis: string) => {
    addEpisodeBundle(projectId, title, synopsis);
  }, [projectId, addEpisodeBundle]);

  const handleUpdateEpisodeBundle = useCallback((episodeIndex: number, updates: { title?: string; synopsis?: string }) => {
    updateEpisodeBundle(projectId, episodeIndex, updates);
  }, [projectId, updateEpisodeBundle]);

  const handleDeleteEpisodeBundle = useCallback((episodeIndex: number) => {
    deleteEpisodeBundle(projectId, episodeIndex);
    // 清除đã chọn状态（如果Xóa的是Đang chọn tập）
    const ep = scriptData?.episodes?.find(e => e.index === episodeIndex);
    if (ep && selectedItemId === ep.id) {
      setSelectedItemId(null);
      setSelectedItemType(null);
    }
  }, [projectId, deleteEpisodeBundle, scriptData?.episodes, selectedItemId]);

  const handleAddScene = useCallback((scene: import("@/types/script").ScriptScene, episodeId?: string) => {
    addScene(projectId, scene, episodeId);
  }, [projectId, addScene]);

  const handleUpdateScene = useCallback((id: string, updates: Partial<import("@/types/script").ScriptScene>) => {
    updateScene(projectId, id, updates);
  }, [projectId, updateScene]);

  const handleDeleteScene = useCallback((id: string) => {
    deleteScene(projectId, id);
    if (selectedItemId === id) {
      setSelectedItemId(null);
      setSelectedItemType(null);
    }
  }, [projectId, deleteScene, selectedItemId]);

  const handleAddCharacter = useCallback((character: import("@/types/script").ScriptCharacter) => {
    addCharacter(projectId, character);
  }, [projectId, addCharacter]);

  const handleUpdateCharacter = useCallback((id: string, updates: Partial<import("@/types/script").ScriptCharacter>) => {
    updateCharacter(projectId, id, updates);
  }, [projectId, updateCharacter]);

  const handleDeleteCharacter = useCallback((id: string) => {
    deleteCharacter(projectId, id);
    if (selectedItemId === id) {
      setSelectedItemId(null);
      setSelectedItemType(null);
    }
  }, [projectId, deleteCharacter, selectedItemId]);

  const handleUpdateShot = useCallback((id: string, updates: Partial<import("@/types/script").Shot>) => {
    updateShot(projectId, id, updates);
  }, [projectId, updateShot]);

  const handleDeleteShot = useCallback((id: string) => {
    deleteShot(projectId, id);
    if (selectedItemId === id) {
      setSelectedItemId(null);
      setSelectedItemType(null);
    }
  }, [projectId, deleteShot, selectedItemId]);

  // AI Nhân vật查找回调
  const handleAIFindCharacter = useCallback(async (query: string) => {
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      return {
        found: false,
        name: '',
        message: 'Vui lòng cấu hình giao diện AI trước',
      };
    }
    
    const background = scriptProject?.projectBackground;
    if (!background) {
      return {
        found: false,
        name: '',
        message: 'Vui lòng Nhập kịch bản trước',
      };
    }
    
    const existingCharacters = scriptData?.characters || [];
    
    try {
      const result = await findCharacterByDescription(
        query,
        background,
        episodeRawScripts,
        existingCharacters,
        {
          apiKey: featureConfig.allApiKeys.join(','),
          provider: featureConfig.platform as string,
          baseUrl: featureConfig.baseUrl,
        }
      );
      
      return {
        found: result.found,
        name: result.name,
        message: result.message,
        character: result.character,
      };
    } catch (error) {
      console.error('[handleAIFindCharacter] Lỗi:', error);
      return {
        found: false,
        name: '',
        message: 'Tìm kiếm thất bại, vui lòng thử lại',
      };
    }
  }, [scriptProject?.projectBackground, episodeRawScripts, scriptData?.characters]);

  // AI Cảnh查找回调
  const handleAIFindScene = useCallback(async (query: string) => {
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      return {
        found: false,
        message: 'Vui lòng cấu hình giao diện AI trước',
      };
    }
    
    const background = scriptProject?.projectBackground;
    if (!background) {
      return {
        found: false,
        message: 'Vui lòng Nhập kịch bản trước',
      };
    }
    
    const existingScenes = scriptData?.scenes || [];
    
    try {
      const result = await findSceneByDescription(
        query,
        background,
        episodeRawScripts,
        existingScenes,
        {
          apiKey: featureConfig.allApiKeys.join(','),
          provider: featureConfig.platform as string,
          baseUrl: featureConfig.baseUrl,
        }
      );
      
      return {
        found: result.found,
        message: result.message,
        scene: result.scene,
      };
    } catch (error) {
      console.error('[handleAIFindScene] Lỗi:', error);
      return {
        found: false,
        message: 'Tìm kiếm thất bại, vui lòng thử lại',
      };
    }
  }, [scriptProject?.projectBackground, episodeRawScripts, scriptData?.scenes]);

  // AI CảnhHiệu chuẩn（全局）
  const handleCalibrateScenes = useCallback(async () => {
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('script_analysis'));
      return;
    }
    
    const background = scriptProject?.projectBackground;
    if (!background) {
      toast.error('Vui lòng Nhập kịch bản trước');
      return;
    }
    
    if (!episodeRawScripts || episodeRawScripts.length === 0) {
      toast.error('Thiếu dữ liệu kịch bản tập');
      return;
    }
    
    const currentScenes = scriptData?.scenes || [];
    
    addSecondPass('scenes');
    setSceneCalibrationStatus('calibrating');
    toast.info(`Đang AI Hiệu chuẩn ${currentScenes.length} cảnh...`);
    
    try {
      const result = await calibrateScenes(
        currentScenes,
        background,
        episodeRawScripts,
        {
          apiKey: featureConfig.allApiKeys.join(','),
          provider: featureConfig.platform as string,
          baseUrl: featureConfig.baseUrl,
          promptLanguage,
        }
      );
      
      // 【nhẹchế độ】只更新美术Thiết kếtrường
      // calibrateScenes 已经按 currentScenes 的thứ tự返回，只需hợp nhất美术trường
      const newScenes = currentScenes.map((orig, i) => {
        // 找到Kết quả hiệu chỉnhđang xử lý...Cảnh
        const calibrated = result.scenes.find(cs => cs.id === orig.id);
        
        if (!calibrated) {
          console.log(`[handleCalibrateScenes] Cảnh #${i + 1} "${orig.name}" không tìm thấy kết quả hiệu chỉnh, giữ nguyên`);
          return orig;
        }
        
        // 【quan trọng】只更新美术Thiết kếtrường，保留Tất cả原有数据（包括 viewpoints）
        const nextVisualPromptZh = calibrated.visualPromptZh || orig.visualPrompt;
        const nextVisualPromptEn = calibrated.visualPromptEn || orig.visualPromptEn;
        return {
          ...orig,  // Giữ lại tất cả trường ban đầu (id, name, location, viewpoints, sceneIds, ...)
          // 只更新美术Thiết kếtrường
          architectureStyle: calibrated.architectureStyle || orig.architectureStyle,
          lightingDesign: calibrated.lightingDesign || orig.lightingDesign,
          colorPalette: calibrated.colorPalette || orig.colorPalette,
          keyProps: calibrated.keyProps || orig.keyProps,
          spatialLayout: calibrated.spatialLayout || orig.spatialLayout,
          eraDetails: calibrated.eraDetails || orig.eraDetails,
          atmosphere: calibrated.atmosphere || orig.atmosphere,
          importance: calibrated.importance || (orig as any).importance || 'secondary',
          // Prompt thị giác
          visualPrompt: promptLanguage === 'en' ? undefined : nextVisualPromptZh,
          visualPromptEn: promptLanguage === 'zh' ? undefined : nextVisualPromptEn,
          // viewpoints 保持không thay đổi（已通过 ...orig 保留）
        };
      });
      
      console.log('[handleCalibrateScenes] Hiệu chuẩn nhẹ hoàn tất: số cảnh giữ', newScenes.length, ', thứ tự không thay đổi');
      
      // 更新 scriptData（不需要更新 episodes 和 shots，因为 sceneId không thay đổi）
      if (scriptData) {
        setScriptData(projectId, {
          ...scriptData,
          scenes: newScenes,
        });
      }
      
      setSceneCalibrationStatus('completed');
      removeSecondPass('scenes');
      toast.success(`Hiệu chuẩn cảnh hoàn tất! ${result.analysisNotes}`);
      
      // P2b: CảnhHiệu chuẩn回写 SeriesMeta
      try {
        const store = useScriptStore.getState();
        const meta = store.projects[projectId]?.seriesMeta;
        if (meta) {
          const updates = syncToSeriesMeta(meta, 'scene', { scenes: newScenes });
          if (Object.keys(updates).length > 0) {
            store.updateSeriesMeta(projectId, updates);
            console.log('[handleCalibrateScenes] SeriesMeta CảnhGhi lại hoàn tất');
          }
          const mdContent = exportProjectMetadata(projectId);
          store.setMetadataMarkdown(projectId, mdContent);
        }
      } catch (e) {
        console.warn('[handleCalibrateScenes] SeriesMeta Ghi lại thất bại:', e);
      }
      
      // 显示hợp nhấtgợi ý（不Tự động执 hàng）
      if (result.mergeRecords.length > 0) {
        console.log('[handleCalibrateScenes] Gợi ý hợp nhất:', result.mergeRecords);
        toast.info(`Phát hiện ${result.mergeRecords.length} gợi ý hợp nhất, vui lòng Xem trong console`);
      }
    } catch (error) {
      const err = error as Error;
      console.error('[handleCalibrateScenes] Hiệu chỉnh thất bại:', err);
      setSceneCalibrationStatus('error');
      removeSecondPass('scenes');
      toast.error(`CảnhHiệu chỉnh thất bại: ${err.message}`);
    }
  }, [scriptProject?.projectBackground, episodeRawScripts, scriptData, projectId, promptLanguage, setScriptData, addSecondPass, removeSecondPass]);

  // AI CảnhHiệu chuẩn（单 tập）
  const handleCalibrateEpisodeScenes = useCallback(async (episodeIndex: number) => {
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('script_analysis'));
      return;
    }
    
    const background = scriptProject?.projectBackground;
    if (!background) {
      toast.error('Vui lòng Nhập kịch bản trước');
      return;
    }
    
    const currentScenes = scriptData?.scenes || [];
    
    addSecondPass('scenes');
    setSceneCalibrationStatus('calibrating');
    toast.info(`Đang AI Hiệu chuẩn cảnh của tập ${episodeIndex}...`);
    
    try {
      const result = await calibrateEpisodeScenes(
        episodeIndex,
        currentScenes,
        background,
        episodeRawScripts,
        {
          apiKey: featureConfig.allApiKeys.join(','),
          provider: featureConfig.platform as string,
          baseUrl: featureConfig.baseUrl,
          promptLanguage,
        }
      );
      
      // 转换并更新Danh sách cảnh
      const newCalibratedScenes = convertToScriptScenes(result.scenes, currentScenes, promptLanguage);
      
      // hợp nhất：保留其他 tập的Cảnh，替换该 tập的Cảnh
      const calibratedIds = new Set(newCalibratedScenes.map(s => s.id));
      const otherScenes = currentScenes.filter(s => !calibratedIds.has(s.id));
      const mergedScenes = [...otherScenes, ...newCalibratedScenes];
      
      if (scriptData) {
        setScriptData(projectId, {
          ...scriptData,
          scenes: mergedScenes,
        });
      }
      
      setSceneCalibrationStatus('completed');
      removeSecondPass('scenes');
      toast.success(`Hiệu chuẩn cảnh tập ${episodeIndex} hoàn tất!`);
    } catch (error) {
      const err = error as Error;
      console.error('[handleCalibrateEpisodeScenes] Hiệu chỉnh thất bại:', err);
      setSceneCalibrationStatus('error');
      removeSecondPass('scenes');
      toast.error(`CảnhHiệu chỉnh thất bại: ${err.message}`);
    }
  }, [scriptProject?.projectBackground, episodeRawScripts, scriptData, projectId, promptLanguage, setScriptData, addSecondPass, removeSecondPass]);

  // TrailerTạo
  const handleGenerateTrailer = useCallback(async (duration: TrailerDuration) => {
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('script_analysis'));
      return;
    }
    
    if (shots.length === 0) {
      toast.error('Vui lòng Tạo phân cảnh trước');
      return;
    }
    
    const background = scriptProject?.projectBackground || null;
    
    // 设置Trạng thái tạo
    setTrailerConfig({
      duration,
      shotIds: [],
      status: 'generating',
      generatedAt: undefined,
      error: undefined,
    });
    
    toast.info(`Đang AI chọn phân cảnh Trailer ${duration} giây...`);
    
    try {
      const result = await selectTrailerShots(
        shots,
        background,
        duration,
        {
          apiKey: featureConfig.allApiKeys.join(','),
          provider: featureConfig.platform as string,
          baseUrl: featureConfig.baseUrl,
        }
      );
      
      if (result.success) {
        // 计算新Phân cảnh的bắt đầu ID
        // Quan trọng:必须Sử dụng directorProject 的最新快照，而不是 useCallback 缓存的值
        const latestSplitScenes = directorProject?.splitScenes || [];
        const startId = latestSplitScenes.length > 0 
          ? Math.max(...latestSplitScenes.map(s => s.id)) + 1 
          : 1;
        
        console.log('[handleGenerateTrailer] startId calculation:', {
          latestSplitScenesLength: latestSplitScenes.length,
          latestIds: latestSplitScenes.map(s => s.id),
          calculatedStartId: startId,
        });
        
        // 将chọn的 Shot 转换为 addScenesFromScript 需要的格式，并追加到 splitScenes
        const scenesToAdd = result.selectedShots.map((shot, idx) => ({
          promptZh: shot.visualDescription || shot.actionSummary || `TrailerPhân cảnh`,
          promptEn: shot.imagePrompt || shot.visualPrompt || '',
          imagePrompt: shot.imagePrompt || shot.visualPrompt || '',
          imagePromptZh: shot.imagePromptZh || shot.visualDescription || '',
          videoPrompt: shot.videoPrompt || '',
          videoPromptZh: shot.videoPromptZh || shot.actionSummary || '',
          endFramePrompt: shot.endFramePrompt || '',
          endFramePromptZh: shot.endFramePromptZh || '',
          needsEndFrame: shot.needsEndFrame || false,
          shotSize: shot.shotSize as any || null,
          duration: shot.duration || 5,
          ambientSound: shot.ambientSound || '',
          soundEffectText: shot.soundEffect || '',
          dialogue: shot.dialogue || '',
          actionSummary: shot.actionSummary || '',
          cameraMovement: shot.cameraMovement || '',
          sceneName: `Trailer #${idx + 1}`,
          sceneLocation: '',
          // tự sự驱动trường
          narrativeFunction: (shot as any).narrativeFunction || '',
          shotPurpose: (shot as any).shotPurpose || '',
          visualFocus: (shot as any).visualFocus || '',
          cameraPosition: (shot as any).cameraPosition || '',
          characterBlocking: (shot as any).characterBlocking || '',
          rhythm: (shot as any).rhythm || '',
          visualDescription: shot.visualDescription || '',
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
        }));
        
        // 追加到 splitScenes
        addScenesFromScript(scenesToAdd);
        
        // Lưugốc Shot 的 ID（用于剧本panel显示）
        const originalShotIds = result.selectedShots.map(s => s.id);
        
        console.log('[handleGenerateTrailer] originalShotIds:', originalShotIds);
        
        // 更新 trailerConfig，Lưugốc Shot ID
        setTrailerConfig({
          duration,
          shotIds: originalShotIds,
          status: 'completed',
          generatedAt: Date.now(),
          error: result.error,
        });
        
        toast.success(`Đã chọn ${result.selectedShots.length} phân cảnh cho Trailer, có thể chỉnh sửa trong panel AI Đạo diễn`);
        if (result.error) {
          toast.warning(result.error);
        }
      } else {
        setTrailerConfig({
          duration,
          shotIds: [],
          status: 'error',
          generatedAt: undefined,
          error: result.error || 'Chọn thất bại',
        });
        toast.error(result.error || 'TrailerTạo thất bại');
      }
    } catch (error) {
      const err = error as Error;
      console.error('[handleGenerateTrailer] Thất bại:', err);
      setTrailerConfig({
        duration,
        shotIds: [],
        status: 'error',
        generatedAt: undefined,
        error: err.message,
      });
      toast.error(`TrailerTạo thất bại: ${err.message}`);
    }
  }, [shots, scriptProject?.projectBackground, setTrailerConfig, addScenesFromScript, directorProject]);
  
  // 清除Trailer
  const handleClearTrailer = useCallback(() => {
    clearTrailer();
    toast.success('Trailer đã xóa');
  }, [clearTrailer]);
  
  // 获取Trailer API 配置
  const trailerApiOptions = useCallback((): TrailerGenerationOptions | null => {
    const featureConfig = getFeatureConfig('script_analysis');
    if (!featureConfig) return null;
    return {
      apiKey: featureConfig.allApiKeys.join(','),
      provider: featureConfig.platform as string,
      baseUrl: featureConfig.baseUrl,
    };
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-3 pb-2 bg-panel border-b">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Chỉnh sửa kịch bản
          </h2>
          <span className="text-xs text-muted-foreground">
            {parseStatus === "parsing"
              ? "Đang phân tích..."
              : scriptProject?.shotStatus === "generating"
              ? "Phân cảnhĐang tạo..."
              : parseStatus === "ready" && scriptData
              ? `${scriptData.title}`
              : ""}
          </span>
        </div>
      </div>

      {/* Bố cục ba cột */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Cột trái: nhập kịch bản */}
        <ResizablePanel defaultSize={30} minSize={20}>
          <ScriptInput
            rawScript={effectiveRawScript}
            language={language}
            targetDuration={targetDuration}
            styleId={styleId}
            sceneCount={sceneCount}
            shotCount={shotCount}
            parseStatus={parseStatus}
            parseError={parseError}
            chatConfigured={chatConfigured}
            onRawScriptChange={activeEpisodeIndex != null
              ? (v) => updateEpisodeRawScript(projectId, activeEpisodeIndex, { rawContent: v })
              : (v) => setRawScript(projectId, v)}
            onLanguageChange={(v) => setLanguage(projectId, v)}
            onDurationChange={(v) => setTargetDuration(projectId, v)}
            onStyleChange={(v) => setStyleId(projectId, v)}
            onSceneCountChange={(v) => setSceneCount(projectId, v === "auto" ? undefined : v)}
            onShotCountChange={(v) => setShotCount(projectId, v === "auto" ? undefined : v)}
            onParse={handleParse}
            onGenerateFromIdea={handleGenerateFromIdea}
            onImportFullScript={handleImportFullScript}
            importStatus={importStatus}
            importError={importError}
            onCalibrate={handleCalibrate}
            calibrationStatus={calibrationStatus}
            missingTitleCount={missingTitleCount}
            onGenerateSynopses={handleGenerateSynopses}
            synopsisStatus={synopsisStatus}
            missingSynopsisCount={missingSynopsisCount}
            viewpointAnalysisStatus={viewpointAnalysisStatus}
            characterCalibrationStatus={characterCalibrationStatus}
            sceneCalibrationStatus={sceneCalibrationStatus}
            secondPassTypes={secondPassTypes}
            promptLanguage={promptLanguage}
            onPromptLanguageChange={(v) => setPromptLanguage(projectId, v)}
          />
        </ResizablePanel>

        <ResizableHandle />

        {/* Cấu trúc phân cấp */}
        <ResizablePanel defaultSize={40} minSize={25}>
          <EpisodeTree
            scriptData={scriptData}
            shots={shots}
            shotStatus={scriptProject?.shotStatus}
            selectedItemId={selectedItemId}
            selectedItemType={selectedItemType}
            onSelectItem={handleSelectItem}
            onAddEpisodeBundle={handleAddEpisodeBundle}
            onUpdateEpisodeBundle={handleUpdateEpisodeBundle}
            onDeleteEpisodeBundle={handleDeleteEpisodeBundle}
            onAddScene={handleAddScene}
            onUpdateScene={handleUpdateScene}
            onDeleteScene={handleDeleteScene}
            onAddCharacter={handleAddCharacter}
            onUpdateCharacter={handleUpdateCharacter}
            onDeleteCharacter={handleDeleteCharacter}
            onDeleteShot={handleDeleteShot}
            onGenerateEpisodeShots={handleGenerateEpisodeShots}
            onRegenerateAllShots={handleRegenerateAllShots}
            episodeGenerationStatus={episodeGenerationStatus}
            onCalibrateShots={handleCalibrateShots}
            onCalibrateScenesShots={handleCalibrateScenesShots}
            onCalibrateCharacters={handleCalibrateCharacters}
            characterCalibrationStatus={characterCalibrationStatus}
            // AI Nhân vật查找相关
            projectBackground={scriptProject?.projectBackground ?? undefined}
            episodeRawScripts={episodeRawScripts}
            onAIFindCharacter={scriptProject?.projectBackground ? handleAIFindCharacter : undefined}
            // AI Cảnh查找相关
            onAIFindScene={scriptProject?.projectBackground ? handleAIFindScene : undefined}
            // CảnhHiệu chuẩn相关
            onCalibrateScenes={scriptProject?.projectBackground ? handleCalibrateScenes : undefined}
            onCalibrateEpisodeScenes={scriptProject?.projectBackground ? handleCalibrateEpisodeScenes : undefined}
            sceneCalibrationStatus={sceneCalibrationStatus}
            // Trailer相关
            trailerConfig={trailerConfig}
            onGenerateTrailer={handleGenerateTrailer}
            onClearTrailer={handleClearTrailer}
            trailerApiOptions={trailerApiOptions()}
            // phân cảnh đơnHiệu chuẩn
            onCalibrateSingleShot={handleCalibrateSingleShot}
            singleShotCalibrationStatus={singleShotCalibrationStatus}
            // Mức độ chặt chẽ hiệu chuẩn相关
            calibrationStrictness={scriptProject?.calibrationStrictness || 'normal'}
            onCalibrationStrictnessChange={handleCalibrationStrictnessChange}
            lastFilteredCharacters={scriptProject?.lastFilteredCharacters || []}
            onRestoreFilteredCharacter={handleRestoreFilteredCharacter}
            // Hiệu chuẩnXác nhậnPopup
            calibrationDialogOpen={calibrationDialogOpen}
            pendingCalibrationCharacters={pendingCalibrationCharacters}
            pendingFilteredCharacters={pendingFilteredCharacters}
            onConfirmCalibration={handleConfirmCalibration}
            onCancelCalibration={handleCancelCalibration}
          />
        </ResizablePanel>

        <ResizableHandle />

        {/* Cột phải: panel thuộc tính */}
        <ResizablePanel defaultSize={30} minSize={20}>
          <PropertyPanel
            selectedItemId={selectedItemId}
            selectedItemType={selectedItemType}
            character={selectedCharacter}
            scene={selectedScene}
            shot={selectedShot}
            episode={selectedEpisode}
            episodeShots={selectedEpisodeShots}
            sceneShots={selectedSceneShots}
            onGoToCharacterLibrary={handleGoToCharacterLibrary}
            onGoToSceneLibrary={handleGoToSceneLibrary}
            onGoToDirector={handleGoToDirector}
            onGoToDirectorFromScene={handleGoToDirectorFromScene}
            onGenerateEpisodeShots={handleGenerateEpisodeShots}
            onCalibrateShots={handleCalibrateShots}
            onUpdateCharacter={handleUpdateCharacter}
            onUpdateScene={handleUpdateScene}
            onUpdateShot={handleUpdateShot}
            onDeleteCharacter={handleDeleteCharacter}
            onDeleteScene={handleDeleteScene}
            onDeleteShot={handleDeleteShot}
            // Nhân vậtgiai đoạnphân tích
            onAnalyzeCharacterStages={handleAnalyzeCharacterStages}
            stageAnalysisStatus={stageAnalysisStatus}
            suggestMultiStage={suggestMultiStage}
            multiStageHints={multiStageHints}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Popup Xác nhận ghi đè bổ sung cấu trúc */}
      <AlertDialog open={structureOverwriteConfirmOpen} onOpenChange={setStructureOverwriteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ghi đè Cấu trúc Cảnh hiện có?</AlertDialogTitle>
            <AlertDialogDescription>
              Tập này đã có dữ liệu Cảnh, Phân tích lại sẽ thay thế Cảnh hiện có và xóa Phân cảnh tương ứng. Xác nhận tiếp tục?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleStructureCompletion()}>
              Xác nhậnGhi đè
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
