// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Scene Generation Panel - Left column
 * Scene creation controls: name, location, time, atmosphere, style, generate
 */

import { useState, useEffect } from "react";
import {
  useSceneStore,
  type Scene,
  TIME_PRESETS,
  ATMOSPHERE_PRESETS,
} from "@/stores/scene-store";
import { useMediaPanelStore } from "@/stores/media-panel-store";
import { useScriptStore, useActiveScriptProject } from "@/stores/script-store";
import type { PromptLanguage } from "@/types/script";
import { useProjectStore } from "@/stores/project-store";
import { useMediaStore } from "@/stores/media-store";
import { getFeatureConfig, getFeatureNotConfiguredMessage } from "@/lib/ai/feature-router";
import { generateSceneImage as generateSceneImageAPI, submitGridImageRequest } from "@/lib/ai/image-generator";
import { generateContactSheetPrompt, generateMultiPageContactSheetData, type SceneViewpoint } from "@/lib/script/scene-viewpoint-generator";
import type { PendingViewpointData, ContactSheetPromptSet } from "@/stores/media-panel-store";
import { splitStoryboardImage } from "@/lib/storyboard/image-splitter";
import { saveImageToLocal, readImageAsBase64 } from "@/lib/image-storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { 
  Loader2,
  MapPin,
  Plus,
  Check,
  RotateCcw,
  Grid3X3,
  Upload,
  Scissors,
  Copy,
  Image as ImageIcon,
  Box,
  LayoutGrid,
  ImagePlus,
  X,
} from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";
import { StylePicker } from "@/components/ui/style-picker";
import { 
  VISUAL_STYLE_PRESETS, 
  STYLE_CATEGORIES,
  getStyleById, 
  getStylePrompt, 
  DEFAULT_STYLE_ID,
  type VisualStyleId 
} from "@/lib/constants/visual-styles";

interface GenerationPanelProps {
  selectedScene: Scene | null;
  onSceneCreated?: (id: string) => void;
}

export function GenerationPanel({ selectedScene, onSceneCreated }: GenerationPanelProps) {
  const {
    addScene,
    updateScene,
    selectScene,
    generationStatus,
    generatingSceneId,
    setGenerationStatus,
    setGeneratingScene,
    generationPrefs,
    setGenerationPrefs,
    currentFolderId,
    setContactSheetTask,
  } = useSceneStore();

  const { pendingSceneData, setPendingSceneData } = useMediaPanelStore();
  const { addMediaFromUrl, getOrCreateCategoryFolder } = useMediaStore();
  
  // 获取当前项mục đíchPhân cảnhdữ liệu，用于提取CảnhĐạo cụ
  const { activeProjectId: scriptProjectId, projects } = useScriptStore();
  const { activeProjectId: resourceProjectId } = useProjectStore();
  const scriptProject = useActiveScriptProject();
  const currentProject = scriptProjectId ? projects[scriptProjectId] : null;
  const allShots = currentProject?.shots || [];

  // promptNgôn ngữ偏好（从Kịch bảnCài đặt同步）
  const [promptLanguage, setPromptLanguage] = useState<PromptLanguage>('vi');

  // Form state
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [time, setTime] = useState("day");
  const [atmosphere, setAtmosphere] = useState("peaceful");
  const [visualPrompt, setVisualPrompt] = useState(""); // Mô tả thị giác cảnh
  const [tags, setTags] = useState<string[]>([]);       // CảnhThẻ
  const [notes, setNotes] = useState("");               // CảnhGhi chú
  const [styleId, setStyleId] = useState<string>(DEFAULT_STYLE_ID);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);

  // Preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewSceneId, setPreviewSceneId] = useState<string | null>(null);

  // Generation mode: single (Đơn ảnh), contact-sheet (ảnh ghép/多Góc nhìn), orthographic (4góc nhìn)
  type GenerationMode = 'single' | 'contact-sheet' | 'orthographic';
  const [generationMode, setGenerationMode] = useState<GenerationMode>(generationPrefs.generationMode);

  // Contact sheet state
  const [contactSheetPrompt, setContactSheetPrompt] = useState<string | null>(null);
  const [contactSheetPromptZh, setContactSheetPromptZh] = useState<string | null>(null);
  const [extractedViewpoints, setExtractedViewpoints] = useState<SceneViewpoint[]>([]);
  const [contactSheetImage, setContactSheetImage] = useState<string | null>(null);
  const [splitViewpointImages, setSplitViewpointImages] = useState<Record<string, { imageUrl: string; gridIndex: number }>>({});
  const [isSplitting, setIsSplitting] = useState(false);
  const [isGeneratingContactSheet, setIsGeneratingContactSheet] = useState(false);
  const [contactSheetProgress, setContactSheetProgress] = useState(0);
  // ảnh ghépbố cụcTùy chọn: 2x2(4格), 3x3(9格)
  type ContactSheetLayout = '2x2' | '3x3';
  const [contactSheetLayout, setContactSheetLayout] = useState<ContactSheetLayout>(generationPrefs.contactSheetLayout);

  // Orthographic (4góc nhìn) state
  const [orthographicPrompt, setOrthographicPrompt] = useState<string | null>(null);
  const [orthographicPromptZh, setOrthographicPromptZh] = useState<string | null>(null);
  const [orthographicImage, setOrthographicImage] = useState<string | null>(null);
  const [isGeneratingOrthographic, setIsGeneratingOrthographic] = useState(false);
  const [orthographicProgress, setOrthographicProgress] = useState(0);
  // 4góc nhìnTỷ lệ khung hìnhChọn
  const [orthographicAspectRatio, setOrthographicAspectRatio] = useState<'16:9' | '9:16'>(generationPrefs.orthographicAspectRatio);
  // 4góc nhìncắtkết quả
  const [orthographicViews, setOrthographicViews] = useState<{
    front: string | null;
    back: string | null;
    left: string | null;
    right: string | null;
  }>({ front: null, back: null, left: null, right: null });
  
  // 从Kịch bản传递过来的多Góc nhìndữ liệu
  const [pendingViewpoints, setPendingViewpoints] = useState<PendingViewpointData[]>([]);
  const [pendingContactSheetPrompts, setPendingContactSheetPrompts] = useState<ContactSheetPromptSet[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [contactSheetAspectRatio, setContactSheetAspectRatio] = useState<'16:9' | '9:16'>(generationPrefs.contactSheetAspectRatio);
  // hàng loạt4góc nhìnTrạng thái
  const [savedChildSceneIds, setSavedChildSceneIds] = useState<string[]>([]); // ID cảnh con vừa lưu

  const isGenerating = generationStatus === 'generating';

  // Keep local UI state in sync with persisted preferences (project switch / rehydrate)
  useEffect(() => {
    setGenerationMode(generationPrefs.generationMode);
    setContactSheetLayout(generationPrefs.contactSheetLayout);
    setContactSheetAspectRatio(generationPrefs.contactSheetAspectRatio);
    setOrthographicAspectRatio(generationPrefs.orthographicAspectRatio);
  }, [
    generationPrefs.generationMode,
    generationPrefs.contactSheetLayout,
    generationPrefs.contactSheetAspectRatio,
    generationPrefs.orthographicAspectRatio,
  ]);

  // Persist key mode/layout/aspect preferences to avoid panel-switch state loss
  useEffect(() => {
    setGenerationPrefs({
      generationMode,
      contactSheetLayout,
      contactSheetAspectRatio,
      orthographicAspectRatio,
    });
  }, [
    generationMode,
    contactSheetLayout,
    contactSheetAspectRatio,
    orthographicAspectRatio,
    setGenerationPrefs,
  ]);

  // Reference image handlers
  const handleRefImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newImages: string[] = [];
    for (const file of Array.from(files)) {
      if (referenceImages.length + newImages.length >= 3) break;
      try {
        const base64 = await fileToBase64(file);
        newImages.push(base64);
      } catch (err) {
        console.error("Failed to convert image:", err);
      }
    }

    if (newImages.length > 0) {
      setReferenceImages([...referenceImages, ...newImages].slice(0, 3));
    }
    e.target.value = "";
  };

  const removeRefImage = (index: number) => {
    setReferenceImages(referenceImages.filter((_, i) => i !== index));
  };

  // Fill form when scene selected
  useEffect(() => {
    if (selectedScene) {
      setName(selectedScene.name);
      setLocation(selectedScene.location);
      setTime(selectedScene.time || "day");
      setAtmosphere(selectedScene.atmosphere || "peaceful");
      setVisualPrompt(selectedScene.visualPrompt || "");
      setTags(selectedScene.tags || []);
      setNotes(selectedScene.notes || "");
      setStyleId(selectedScene.styleId || DEFAULT_STYLE_ID);
    }
  }, [selectedScene]);

  // Handle pending data from script panel
  // 当从Kịch bản跳转过来时，Tự độngTạoCảnh并进入ảnh ghépTạochế độ
  useEffect(() => {
    if (!pendingSceneData) return;
    
    // 立即捕获dữ liệu并清除，防止 React 严格chế độ下重复执 hàng
    const data = pendingSceneData;
    setPendingSceneData(null);
    
    // 同步promptNgôn ngữ偏好
    if (data.promptLanguage) {
      setPromptLanguage(data.promptLanguage);
    } else if (scriptProject?.promptLanguage) {
      setPromptLanguage(scriptProject.promptLanguage);
    }
    
    // 如果有Tên和Địa điểm，Tự độngTạo新Cảnh
    if (data.name && data.location) {
      // Phân tíchThời gian和Bầu không khí
      let timeId = "day";
      if (data.time) {
        const timePreset = TIME_PRESETS.find(
          t => t.label === data.time || t.id === data.time
        );
        timeId = timePreset?.id || "day";
      }

      let atmosphereId = "peaceful";
      if (data.atmosphere) {
        const atmospherePreset = ATMOSPHERE_PRESETS.find(
          a => a.label === data.atmosphere || a.id === data.atmosphere
        );
        atmosphereId = atmospherePreset?.id || "peaceful";
      }

      let parsedStyleId = DEFAULT_STYLE_ID;
      if (data.styleId) {
        const validStyle = getStyleById(data.styleId);
        if (validStyle) {
          parsedStyleId = validStyle.id;
        }
      }
      
      // 同步表单Trạng thái，确保 UI Hiện正确的Phong cách
      setStyleId(parsedStyleId);

      // Tự độngTạoCảnh（chứachuyên nghiệpThiết kếtrường）
      const newId = addScene({
        name: data.name.trim(),
        location: data.location.trim(),
        time: timeId,
        atmosphere: atmosphereId,
        visualPrompt: data.visualPrompt?.trim() || undefined,
        tags: data.tags?.length ? data.tags : undefined,
        notes: data.notes?.trim() || undefined,
        styleId: parsedStyleId,
        folderId: currentFolderId,
        projectId: resourceProjectId || undefined,
      // chuyên nghiệpCảnhThiết kếtrường
        architectureStyle: data.architectureStyle,
        lightingDesign: data.lightingDesign,
        colorPalette: data.colorPalette,
        eraDetails: data.eraDetails,
        keyProps: data.keyProps,
        spatialLayout: data.spatialLayout,
        //  tập作用域
        linkedEpisodeId: data.sourceEpisodeId,
      } as any);

      // đã chọn新Tạo的Cảnh
      selectScene(newId);
      onSceneCreated?.(newId);
      
      // 如果有多Góc nhìndữ liệu，Trực tiếp进入ảnh ghépTạochế độ
      if (data.viewpoints && data.viewpoints.length > 0 &&
          data.contactSheetPrompts && data.contactSheetPrompts.length > 0) {
        setPendingViewpoints(data.viewpoints);
        setPendingContactSheetPrompts(data.contactSheetPrompts);
        setCurrentPageIndex(0);
        
        // Cài đặt第一页的prompt
        const firstPage = data.contactSheetPrompts[0];
        setContactSheetPrompt(firstPage.prompt);
        setContactSheetPromptZh(firstPage.promptZh);
        
        // 同步bố cụcCài đặt，确保cắt时Sử dụng正确的 hàng cột数
        if (firstPage.gridLayout) {
          const { rows, cols } = firstPage.gridLayout;
          const totalCells = rows * cols;
          
          // 根据Tổng格数判断是 2x2 还是 3x3
          if (totalCells <= 4) {
            setContactSheetLayout('2x2');
          } else {
            setContactSheetLayout('3x3');
          }
          
          // 根据Tỷ lệ khung hìnhCài đặt方向：正Vuônglưới（3x3, 2x2）Mặc địnhNgang
          if (cols >= rows) {
             setContactSheetAspectRatio('16:9');
          } else {
             setContactSheetAspectRatio('9:16');
          }
        }
        
        // chuyển đổiGóc nhìndữ liệuđịnh dạng
        const firstPageViewpoints = data.viewpoints
          .filter(v => v.pageIndex === 0)
          .map(v => ({
            id: v.id,
            name: v.name,
            nameEn: v.nameEn,
            shotIds: v.shotIds,
            keyProps: v.keyProps,
            keyPropsEn: v.keyPropsEn,
            description: '',
            descriptionEn: '',
            gridIndex: v.gridIndex,
          }));
        setExtractedViewpoints(firstPageViewpoints);
        
        const pageCount = data.contactSheetPrompts.length;
        toast.success(
          `Cảnh「${data.name}」đã được tạo\n` +
          `✔ ${data.viewpoints.length}  góc nhìn đã được tải${pageCount > 1 ? `（${pageCount} ảnh tổng hợp)` : ''}`
        );
      } else {
        toast.success(`Cảnh「${data.name}」đã được tự động tạo`);
      }
    } else {
      // 只有部分dữ liệu，仅填充表单
      setName(data.name || "");
      setLocation(data.location || "");
      
      if (data.time) {
        const timePreset = TIME_PRESETS.find(
          t => t.label === data.time || t.id === data.time
        );
        setTime(timePreset?.id || "day");
      }

      if (data.atmosphere) {
        const atmospherePreset = ATMOSPHERE_PRESETS.find(
          a => a.label === data.atmosphere || a.id === data.atmosphere
        );
        setAtmosphere(atmospherePreset?.id || "peaceful");
      }

      if (data.styleId) {
        const validStyle = getStyleById(data.styleId);
        if (validStyle) {
          setStyleId(validStyle.id);
        }
      }

      if (data.visualPrompt) {
        setVisualPrompt(data.visualPrompt);
      }
      if (data.tags) {
        setTags(data.tags);
      }
      if (data.notes) {
        setNotes(data.notes);
      }
    }
  }, [pendingSceneData, setPendingSceneData, addScene, selectScene, onSceneCreated, currentFolderId]);

  // 当người dùngthay đổiTỷ lệ khung hình时，根据Góc nhìnsố lượnglại计算最优bố cục
  // 注意：不lại提取Góc nhìn，只更新bố cục和prompt
  useEffect(() => {
    // 只在有 pendingViewpoints 时处理
    if (pendingViewpoints.length === 0) return;
    // Tránh首次加载时重复处理
    if (pendingContactSheetPrompts.length === 0) return;
    
    const vpCount = pendingViewpoints.length;
    const isLandscape = contactSheetAspectRatio === '16:9';
    
    // 根据Góc nhìnsố lượng和Tỷ lệ khung hình计算最优bố cục
    // 强制Sử dụng N x N bố cục以保证Tỷ lệ khung hìnhgiống性
    let newLayout: { rows: number; cols: number };
    
    // 如果Góc nhìnsố lượng <= 4，Sử dụng 2x2
    // 如果Góc nhìnsố lượng > 4，Sử dụng 3x3
    if (vpCount <= 4) {
      newLayout = { rows: 2, cols: 2 };
    } else {
      newLayout = { rows: 3, cols: 3 };
    }
    
    // 更新bố cụcChọn器
    const layoutKey = `${newLayout.rows}x${newLayout.cols}` as ContactSheetLayout;
    // 更新 UI Trạng thái
    if (['2x2', '3x3'].includes(layoutKey)) {
      setContactSheetLayout(layoutKey);
    }
    
    // 更新 pendingContactSheetPrompts đang xử lý...ridLayout
    const updatedPrompts = pendingContactSheetPrompts.map(p => ({
      ...p,
      gridLayout: newLayout,
    }));
    setPendingContactSheetPrompts(updatedPrompts);
    
    // Tạo lạitrang hiện tại的prompt（替换 hàng cột数）
    const currentPage = updatedPrompts[currentPageIndex] || updatedPrompts[0];
    if (currentPage && contactSheetPrompt) {
      const totalCells = newLayout.rows * newLayout.cols;
      const paddedCount = totalCells;
      const sceneName = selectedScene?.name || selectedScene?.location || 'scene';
      
      // 获取Phong cáchthông tin
      const stylePreset = getStyleById(styleId);
      const styleStr = stylePreset?.prompt || 'anime style, soft colors';
      
      // 获取Góc nhìnMô tả
      const currentPageVps = pendingViewpoints.filter(v => v.pageIndex === currentPageIndex);
      const actualCount = currentPageVps.length;
      
      // 构建增强版prompt (Structured Prompt)
      const promptParts: string[] = [];
      
      // 1. 核心指令区 (Instruction Block)
      promptParts.push('<instruction>');
      promptParts.push(`Generate a clean ${newLayout.rows}x${newLayout.cols} architectural concept grid with exactly ${paddedCount} equal-sized panels.`);
      promptParts.push(`Overall Image Aspect Ratio: ${isLandscape ? '16:9' : '9:16'}.`);
      
      // 明确指定单ô的Tỷ lệ khung hình，防止 AI 混淆
      const panelAspect = isLandscape ? '16:9 (horizontal landscape)' : '9:16 (vertical portrait)';
      promptParts.push(`Each individual panel must have a ${panelAspect} aspect ratio.`);
      
      promptParts.push('Structure: No borders between panels, no text, no watermarks.');
      promptParts.push('Consistency: Maintain consistent perspective, lighting, and style across all panels.');
      promptParts.push('Subject: Interior design and architectural details only, NO people.');
      promptParts.push('</instruction>');
      
      // 2. bố cụcMô tả
      promptParts.push(`Layout: ${newLayout.rows} rows, ${newLayout.cols} columns, reading order left-to-right, top-to-bottom.`);
      
      // 2.5 从gốcPrompt tiếng Anhđang xử lý...Scene Context 和 Visual Description
      const originalPromptEn = currentPage.prompt || '';
      const sceneContextMatch = originalPromptEn.match(/Scene Context: ([^\n]+)/);
      if (sceneContextMatch && sceneContextMatch[1]) {
        promptParts.push(`Scene Context: ${sceneContextMatch[1]}`);
      }
      const visualDescMatch = originalPromptEn.match(/Visual Description: ([^\n]+)/);
      if (visualDescMatch && visualDescMatch[1]) {
        promptParts.push(`Visual Description: ${visualDescMatch[1]}`);
      }
      
      // 3. 每ô的Nội dungMô tả
      currentPageVps.forEach((vp, idx) => {
        const row = Math.floor(idx / newLayout.cols) + 1;
        const col = (idx % newLayout.cols) + 1;
        
        const content = vp.keyPropsEn && vp.keyPropsEn.length > 0 
          ? `showing ${vp.keyPropsEn.join(', ')}` 
          : (vp.nameEn === 'Overview' ? 'wide shot showing the entire room layout' : `${vp.nameEn || vp.name} angle of the room`);
          
        promptParts.push(`Panel [row ${row}, col ${col}] (no people): ${content}`);
      });
      
      // 4. 空白Placeholder格Mô tả
      for (let i = actualCount; i < paddedCount; i++) {
        const row = Math.floor(i / newLayout.cols) + 1;
        const col = (i % newLayout.cols) + 1;
        promptParts.push(`Panel [row ${row}, col ${col}]: empty placeholder, solid gray background`);
      }
      
      // 5. Phong cách与负面Gợi ý
      promptParts.push(`Style: ${styleStr}`);
      promptParts.push('Negative constraints: text, watermark, split screen borders, speech bubbles, blur, distortion, bad anatomy, people, characters.');
      
      const newPrompt = promptParts.join('\n');
      
      // lạiĐang tạo文prompt
      const gridItemsZh = currentPageVps.map((vp, idx) => {
        const content = vp.keyProps && vp.keyProps.length > 0 
          ? `Hiển thị ${vp.keyProps.join('、')}` 
          : (vp.name === 'Toàn cảnh' ? 'Toàn cảnh rộng hiển thị toàn bộ bố cục phòng' : `${vp.name}Góc nhìn`);
        return `[${idx + 1}] ${vp.name}：${content}`;
      }).join('\n');
      
      // 从gốcprompt tiếng Trungđang xử lý...ô tả cảnh（Phong cách kiến trúc、Bảng màu sắc、Đặc trưng thời đại、Thiết kế ánh sáng）
      // 这样即使 selectedScene 还没更新，也能保留正确的Mô tả cảnh
      let sceneDescZh = '';
      let visualPromptZh = '';
      const originalPromptZh = currentPage.promptZh || '';
      
      // Mô tả cảnh在第一 hàng和"CảnhBầu không khí"hoặc"X ô分别Hiển thị"之间
      const sceneDescMatch = originalPromptZh.match(/Góc nhìn khác nhau.\n([^\n]*(?:Phong cách kiến trúc|Bảng màu sắc|Đặc trưng thời đại|Thiết kế ánh sáng)[^\n]*)/);
      if (sceneDescMatch && sceneDescMatch[1]) {
        sceneDescZh = sceneDescMatch[1].trim();
      } else {
        // 回退到从 selectedScene 构建（用于非跳转Cảnh）
        const sceneDescParts: string[] = [];
        if (selectedScene?.architectureStyle) {
          sceneDescParts.push(`Phong cách kiến trúc：${selectedScene.architectureStyle}`);
        }
        if (selectedScene?.colorPalette) {
          sceneDescParts.push(`Bảng màu sắc：${selectedScene.colorPalette}`);
        }
        if (selectedScene?.eraDetails) {
          sceneDescParts.push(`Đặc trưng thời đại：${selectedScene.eraDetails}`);
        }
        if (selectedScene?.lightingDesign) {
          sceneDescParts.push(`Thiết kế ánh sáng：${selectedScene.lightingDesign}`);
        }
        sceneDescZh = sceneDescParts.length > 0 ? sceneDescParts.join('，') : '';
      }
      
      // 提取Prompt thị giác（CảnhBầu không khí）
      const visualPromptMatch = originalPromptZh.match(/CảnhBầu không khí：([^\n]+)/);
      if (visualPromptMatch && visualPromptMatch[1]) {
        visualPromptZh = visualPromptMatch[1].trim();
      } else if (selectedScene?.visualPrompt) {
        visualPromptZh = selectedScene.visualPrompt;
      }
      
      const newPromptZh = `Một ảnh lưới chính xác ${newLayout.rows} hàng x ${newLayout.cols} cột (tổng ${totalCells} ô), hiển thị các đặc điểm khác nhau của cùng một Cảnh「${sceneName}」, c góc nhìn khác nhau.
${sceneDescZh}${visualPromptZh ? `\nCảnhBầu không khí：${visualPromptZh}` : ''}

${totalCells} ô lần lượt hiển thị:
${gridItemsZh}

Quan trọng:
- Phải tạo chính xác ${newLayout.rows} hàng x ${newLayout.cols} cột, không nhiều hơn cũng không ít hơn.
- Đây là ảnh tham chiếu sạch,Ảnh tham chiếu， không thêmThêmbất kỳ văn bản nào。
- Không thêm nhãn, tiêu đề, văn bản mô tả, hình mờ hoặc bất kỳ loại chữ nào.

Phong cách: ${stylePreset?.name || 'Phong cách hoạt hình'}, ánh sáng các ô đồng nhất, các ô ngăn cách bằng viền trắng mỏng, chỉ có nền, không có nhân vật.`;
      
      setContactSheetPrompt(newPrompt);
      setContactSheetPromptZh(newPromptZh);
    }
    
    console.log('[ContactSheet] Tỷ lệ khung hình thay đổi, cập nhật bố cục:', {
      aspectRatio: contactSheetAspectRatio,
      vpCount,
      newLayout,
      sceneDescExtracted: currentPage ? (currentPage.promptZh?.includes('Phong cách kiến trúc') || currentPage.promptZh?.includes('Thiết kế ánh sáng')) : false,
      selectedSceneId: selectedScene?.id,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactSheetAspectRatio]); // Chỉ theo dõi thay đổi tỷ lệ khung hình

  const handleCreateScene = () => {
    if (!name.trim()) {
      toast.error("NhậpTên cảnh");
      return;
    }
    if (!location.trim()) {
      toast.error("NhậpĐịa điểmMô tả");
      return;
    }

    // 获取当前 tập作用域
    const { activeEpisodeIndex } = useMediaPanelStore.getState();
    const scriptState = useScriptStore.getState();
    const activeScriptProject = scriptState.activeProjectId ? scriptState.projects[scriptState.activeProjectId] : null;
    const manualEpisodeId = activeEpisodeIndex != null
      ? activeScriptProject?.scriptData?.episodes.find(ep => ep.index === activeEpisodeIndex)?.id
      : undefined;

    const id = addScene({
      name: name.trim(),
      location: location.trim(),
      time,
      atmosphere,
      visualPrompt: visualPrompt.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
      notes: notes.trim() || undefined,
      styleId,
      folderId: currentFolderId,
      projectId: resourceProjectId || undefined,
      linkedEpisodeId: manualEpisodeId,
    });

    toast.success("Cảnh đã được tạo");
    selectScene(id);
    onSceneCreated?.(id);
  };

  const handleGenerate = async () => {
    const targetId = selectedScene?.id;
    if (!targetId) {
      toast.error("Vui lòng Chọn hoặc Tạo Cảnh trước");
      return;
    }
    if (!location.trim()) {
      toast.error("NhậpĐịa điểmMô tả");
      return;
    }

    const featureConfig = getFeatureConfig('character_generation');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('character_generation'));
      return;
    }

    // Update scene if changed
    if (location.trim() !== selectedScene.location || 
        time !== selectedScene.time ||
        atmosphere !== selectedScene.atmosphere ||
        visualPrompt.trim() !== (selectedScene.visualPrompt || '') ||
        notes.trim() !== (selectedScene.notes || '')) {
      updateScene(targetId, { 
        location: location.trim(),
        time,
        atmosphere,
        visualPrompt: visualPrompt.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        notes: notes.trim() || undefined,
      });
    }

    setGenerationStatus('generating');
    setGeneratingScene(targetId);

    try {
      // 获取该Cảnh下Tất cảPhân cảnh的Hành động描写，提取Đạo cụ quan trọng
      const sceneShots = allShots.filter(shot => 
        shot.sceneRefId === selectedScene?.id ||
        shot.sceneId === selectedScene?.id
      );
      const actionDescriptions = sceneShots
        .map(shot => shot.actionSummary)
        .filter(Boolean)
        .slice(0, 10); // Lấy tối đa 10 phân cảnh
      
      console.log('[SceneGeneration] Tìm thấy', sceneShots.length, 'phân cảnh cho cảnh:', selectedScene?.name);
      console.log('[SceneGeneration] Mô tả hành động:', actionDescriptions);
      
      const prompt = buildScenePrompt({ ...selectedScene, location, time, atmosphere, styleId }, actionDescriptions);
      const stylePreset = styleId ? getStyleById(styleId) : null;
      const isRealistic = stylePreset?.category === 'real';
      const negativePrompt = isRealistic
        ? 'blurry, low quality, watermark, text, people, characters, anime, cartoon'
        : 'blurry, low quality, watermark, text, people, characters';

      const result = await generateSceneImageAPI({
        prompt,
        negativePrompt,
        aspectRatio: '16:9',
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        styleId,
      });

      setPreviewUrl(result.imageUrl);
      setPreviewSceneId(targetId);
      setGenerationStatus('completed');
      toast.success("Tạo ảnh concept cảnh hoàn tất, vui lòng Xem trước và Xác nhận");
    } catch (error) {
      const err = error as Error;
      setGenerationStatus('error', err.message);
      toast.error(`Tạo thất bại: ${err.message}`);
    } finally {
      setGeneratingScene(null);
    }
  };

  const handleSavePreview = async () => {
    if (!previewUrl || !previewSceneId) return;

    toast.loading("Đang lưu ảnh vào máy...", { id: 'saving-scene-preview' });

    try {
      const sceneName = (name || selectedScene?.name || 'scene').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
      const localPath = await saveImageToLocal(
        previewUrl,
        'scenes',
        `${sceneName}_${Date.now()}.png`
      );

      updateScene(previewSceneId, {
        referenceImage: localPath,
        visualPrompt: buildScenePrompt({ 
          ...selectedScene!, 
          location, 
          time, 
          atmosphere, 
          styleId 
        }),
      });

      // 同步归档到Thư viện phương tiện Ảnh AI Thư mục
      const aiFolderId = getOrCreateCategoryFolder('ai-image');
      addMediaFromUrl({
        url: localPath,
        name: `Cảnh-${name || selectedScene?.name || 'Chưa đặt tên'}`,
        type: 'image',
        source: 'ai-image',
        folderId: aiFolderId,
        projectId: resourceProjectId || undefined,
      });

      setPreviewUrl(null);
      setPreviewSceneId(null);
      toast.success("Ảnh concept cảnh đã lưu vào máy!", { id: 'saving-scene-preview' });
    } catch (error) {
      console.error('Failed to save scene preview:', error);
      toast.error("LưuThất bại", { id: 'saving-scene-preview' });
    }
  };

  const handleDiscardPreview = () => {
    setPreviewUrl(null);
    setPreviewSceneId(null);
    setGenerationStatus('idle');
  };

  // ========== 多Góc nhìnảnh ghépchức năng ==========

  /**
   * Tạo多Góc nhìnảnh ghépprompt
   */
  const handleGenerateContactSheetPrompt = () => {
    if (!selectedScene) {
      toast.error("Vui lòng Chọn Cảnh trước");
      return;
    }

    // 获取该Cảnh的Phân cảnh
    const sceneShots = allShots.filter(shot => 
      shot.sceneRefId === selectedScene.id ||
      shot.sceneId === selectedScene.id
    );

    if (sceneShots.length === 0) {
      toast.warning("Cảnh này không có phân cảnh liên kết, sẽ dùng Góc nhìn mặc định");
    }

    // 获取Đang chọn的Phong cách
    const stylePreset = getStyleById(styleId);
    const styleTokens = stylePreset?.prompt ? [stylePreset.prompt] : ['anime style', 'soft colors'];

    // 构建Cảnhdữ liệu（合并当前表单Nội dung）
    const sceneData = {
      ...selectedScene,
      name: name || selectedScene.name,
      location: location || selectedScene.location,
    };

    // Tạoprompt
    const result = generateContactSheetPrompt({
      scene: sceneData as any,
      shots: sceneShots,
      styleTokens,
      aspectRatio: '16:9',
    });

    setContactSheetPrompt(result.prompt);
    setContactSheetPromptZh(result.promptZh);
    setExtractedViewpoints(result.viewpoints);

    // kiểm tra是否Sử dụng了 AI 分析的Góc nhìn
    // viewpoints thuộc tính可能来自Kịch bản的 scriptData.scenes，通过 pendingSceneData 传递
    const sceneViewpoints = (selectedScene as any)?.viewpoints || (sceneData as any)?.viewpoints;
    const hasAIViewpoints = sceneViewpoints && sceneViewpoints.length > 0;
    const sourceText = hasAIViewpoints ? 'AI phân tích' : 'Trích xuất từ khóa';
    toast.success(`${sourceText} ${result.viewpoints.length} Góc nhìn，promptđã tạo`);
  };

  /**
   * Sao chépprompt（chứaPhong cách thị giác和Tỷ lệ khung hìnhthông tin）
   */
  const handleCopyPrompt = (isEnglish: boolean) => {
    const prompt = isEnglish ? contactSheetPrompt : contactSheetPromptZh;
    if (!prompt) return;
    
    // 获取Phong cách thị giácthông tin
    const stylePreset = getStyleById(styleId);
    const styleName = stylePreset?.name || styleId;
    const styleTokens = stylePreset?.prompt || '';
    
    // 根据Tỷ lệ khung hìnhXác nhậnbố cụcMô tả
    const isLandscape = contactSheetAspectRatio === '16:9';
      const layoutDesc = `${contactSheetLayout} (${contactSheetLayout === '2x2' ? '4 ô' : '9 ô'})`;
    const layoutDescEn = `${contactSheetLayout === '2x2' ? '2 rows x 2 cols' : '3 rows x 3 cols'} (${contactSheetLayout})`;
    
    // 组合đầy đủprompt
    let fullPrompt: string;
    if (isEnglish) {
      fullPrompt = [
        `=== Contact Sheet Settings ===${`\n`}`,
        `Style: ${styleName}`,
        `Style Tokens: ${styleTokens}`,
        `Aspect Ratio: ${contactSheetAspectRatio}`,
        `Grid Layout: ${layoutDescEn}`,
        ``,
        `=== Prompt ===${`\n`}`,
        prompt,
      ].join('\n');
    } else {
      fullPrompt = [
        `=== Cài đặt ảnh ghép ===${`\n`}`,
        `Phong cách thị giác: ${styleName}`,
        `Từ khóa phong cách: ${styleTokens}`,
        `Tỷ lệ khung hình: ${contactSheetAspectRatio}`,
        `Bố cục lưới: ${layoutDesc}`,
        ``,
        `=== prompt ===${`\n`}`,
        prompt,
      ].join('\n');
    }
    
    navigator.clipboard.writeText(fullPrompt);
    toast.success(isEnglish ? "Đã sao chép Prompt tiếng Anh (bao gồm phong cách và tỷ lệ khung hình)" : "Đã sao chép prompt tiếng Trung (bao gồm Phong cách và Tỷ lệ khung hình)");
  };

  /**
   * Trực tiếpTạoảnh ghép（gọi API内部 AI Tạo ảnh API）
   * Sử dụng submitGridImageRequest 对齐Đạo diễnpanel，确保lướiđịnh dạng正确
   */
  const handleGenerateContactSheetImage = async () => {
    if (!contactSheetPrompt) {
      toast.error("Vui lòng tạo trướcprompt");
      return;
    }

    const featureConfig = getFeatureConfig('character_generation');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('character_generation'));
      return;
    }

    const apiKey = featureConfig.apiKey;
    const baseUrl = featureConfig.baseUrl?.replace(/\/+$/, '') || '';
    const model = featureConfig.models?.[0] || '';
    const keyManager = featureConfig.keyManager;

    if (!apiKey || !baseUrl || !model) {
      toast.error('Tạo ảnh API Chưa cấu hình');
      return;
    }

    setIsGeneratingContactSheet(true);
    setContactSheetProgress(0);

    try {
      const stylePreset = getStyleById(styleId);
      const isRealistic = stylePreset?.category === 'real';
      const negativePrompt = isRealistic
        ? 'blurry, low quality, watermark, text, labels, titles, captions, words, letters, numbers, annotations, subtitles, typography, font, writing, people, characters, anime, cartoon, distorted grid, uneven panels'
        : 'blurry, low quality, watermark, text, labels, titles, captions, words, letters, numbers, annotations, subtitles, typography, font, writing, people, characters, distorted grid, uneven panels';

      // 增强prompt：如果người dùngChỉnh sửa的是prompt tiếng Trung，在前面包裹英文Cấu trúc化lưới指令
      let finalPrompt = contactSheetPrompt;
      const isChinese = /[\u4e00-\u9fa5]/.test(finalPrompt) && !finalPrompt.includes('<instruction>');
      if (isChinese) {
        const layoutDims = (() => {
          switch (contactSheetLayout) {
            case '2x2': return { rows: 2, cols: 2 };
            case '3x3': return { rows: 3, cols: 3 };
            default: return { rows: 3, cols: 3 };
          }
        })();
        const totalCells = layoutDims.rows * layoutDims.cols;
        const panelAspect = contactSheetAspectRatio === '16:9' ? '16:9 (horizontal landscape)' : '9:16 (vertical portrait)';
        const styleTokens = stylePreset?.prompt || '';
        
        finalPrompt = [
          '<instruction>',
          `Generate a clean ${layoutDims.rows}x${layoutDims.cols} storyboard grid with exactly ${totalCells} equal-sized panels.`,
          `Overall Image Aspect Ratio: ${contactSheetAspectRatio}.`,
          `Each individual panel must have a ${panelAspect} aspect ratio.`,
          styleTokens ? `MANDATORY Visual Style for ALL panels: ${styleTokens}` : '',
          'Structure: No borders between panels, no text, no watermarks, no speech bubbles.',
          'Consistency: Maintain consistent perspective, lighting, color grading, and visual style across ALL panels.',
          '</instruction>',
          '',
          contactSheetPrompt,
          '',
          `Negative constraints: ${negativePrompt}`,
        ].filter(Boolean).join('\n');
      } else if (!finalPrompt.includes('Negative constraints:')) {
        finalPrompt += `\nNegative constraints: ${negativePrompt}`;
      }

      setContactSheetProgress(20);

      const result = await submitGridImageRequest({
        model,
        prompt: finalPrompt,
        apiKey,
        baseUrl,
        aspectRatio: contactSheetAspectRatio,
        resolution: '2K',
        keyManager,
      });

      setContactSheetProgress(100);
      if (!result.imageUrl) {
        throw new Error('Tạo ảnh thất bại: Không trả về URL ảnh');
      }
      
      // 如果Quay lại的是 HTTP URL，转为 base64 — Tránh后续cắt时 CORS 问题
      let finalImageUrl = result.imageUrl;
      if (finalImageUrl.startsWith('http://') || finalImageUrl.startsWith('https://')) {
        try {
          const resp = await fetch(finalImageUrl);
          const blob = await resp.blob();
          finalImageUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          console.log('[ContactSheet] HTTP→base64 chuyển đổi Thành công');
        } catch (e) {
          console.warn('[ContactSheet] HTTP→base64 chuyển đổi Thất bại, Sử dụng URL gốc');
        }
      }
      
      setContactSheetImage(finalImageUrl);
      toast.success("Ảnh ghép Tạo thành công, có thể thực hiện cắt");
    } catch (error) {
      const err = error as Error;
      console.error('[ContactSheet] Tạo thất bại:', err);
      toast.error(`Tạo thất bại: ${err.message}`);
    } finally {
      setIsGeneratingContactSheet(false);
      setContactSheetProgress(0);
    }
  };

  /**
   * 根据bố cục获取 hàng cột数
   * - 3x3: Cố định 3 hàng3 cột
   * - 2x2: Cố định 2 hàng2 cột
   */
  const getLayoutDimensions = (layout: ContactSheetLayout, aspectRatio: '16:9' | '9:16') => {
    switch (layout) {
      case '2x2':
        return { rows: 2, cols: 2 };
      case '3x3':
        return { rows: 3, cols: 3 };
      default:
        // 后备：Mặc định 3x3
        return { rows: 3, cols: 3 };
    }
  };

  /**
   * Tải lênảnh ghép（备用，用于Thủ côngTải lên外部Tạo的ảnh）
   */
  const handleUploadContactSheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setContactSheetImage(dataUrl);
      toast.success("Ảnh ghép đã tải lên, có thể thực hiện cắt");
    };
    reader.readAsDataURL(file);
  };

  /**
   * độc lậpTải lênảnh ghép入sổ（不需要先Tạoprompt）
   * 根据người dùngChọn的lướibố cụcTự độngTạoMặc địnhGóc nhìn
   * Quan trọng:HủyĐang chọn的Cảnh，确保Lưu时Tạo新Cảnh
   */
  const handleDirectUploadContactSheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Quan trọng:HủyĐang chọn的Cảnh，确保Lưu时会Tạo新Cảnh
    selectScene(null);
    
    // Xóa tất cả表单，chuẩn bịTự độngđặt tên
    const timestamp = new Date().toLocaleString('vi-VN', { 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    }).replace(/[\/:]/g, '-');
    const autoSceneName = `Cảnh ảnh ghép-${timestamp}`;
    setName(autoSceneName);
    setLocation(autoSceneName);

    // 获取người dùngChọn的bố cục
    const dims = getLayoutDimensions(contactSheetLayout, contactSheetAspectRatio);
    const totalCells = dims.rows * dims.cols;

    // Tự độngTạoMặc địnhGóc nhìn（Góc nhìn1, Góc nhìn2, ..., Góc nhìnN）
    const defaultViewpoints: SceneViewpoint[] = [];
    for (let i = 0; i < totalCells; i++) {
      defaultViewpoints.push({
        id: `viewpoint-${i + 1}`,
        name: `Góc nhìn${i + 1}`,
        nameEn: `Viewpoint ${i + 1}`,
        shotIds: [],
        keyProps: [],
        keyPropsEn: [],
        description: '',
        descriptionEn: '',
        gridIndex: i,
      });
    }

    // Cài đặtGóc nhìndữ liệu
    setExtractedViewpoints(defaultViewpoints);
    
    // TạoMặc định的prompt页面dữ liệu（用于cắt时获取bố cụcthông tin）
    const defaultPromptPage: ContactSheetPromptSet = {
      pageIndex: 0,
      prompt: '',
      promptZh: '',
      viewpointIds: defaultViewpoints.map(v => v.id),
      gridLayout: { rows: dims.rows, cols: dims.cols },
    };
    setPendingContactSheetPrompts([defaultPromptPage]);
    setPendingViewpoints(defaultViewpoints.map((vp) => ({
      ...vp,
      pageIndex: 0,
      shotIndexes: [],
    })));
    setCurrentPageIndex(0);
    
    // Cài đặt一Placeholderprompt，触发进入ảnh ghép界面
    setContactSheetPrompt('[Tải lên trực tiếp - không có prompt]');
    setContactSheetPromptZh('[Tải lên trực tiếp - không có prompt]');

    // 读取并HiệnTải lên的ảnh
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setContactSheetImage(dataUrl);
      toast.success(`Ảnh ghép đã tải lên (${dims.rows}×${dims.cols} = ${totalCells} ô), sau khi cắt sẽ Tự động Tạo Cảnh mới`);
    };
    reader.readAsDataURL(file);
  };

  /**
   * 在ảnh ghép界面đang xử lý...局变化（仅对Trực tiếpTải lênchế độ生效）
   * 更新Góc nhìnsố lượng以Khớp新bố cục
   */
  const handleContactSheetLayoutChange = (newLayout: ContactSheetLayout) => {
    setContactSheetLayout(newLayout);
    
    // 如果是Trực tiếpTải lênchế độ（没有真正的prompt），需要更新Góc nhìndữ liệu
    if (contactSheetPrompt === '[Tải lên trực tiếp - không có prompt]') {
      const dims = getLayoutDimensions(newLayout, contactSheetAspectRatio);
      const totalCells = dims.rows * dims.cols;
      
      // lạiTạoMặc địnhGóc nhìn
      const newDefaultViewpoints: SceneViewpoint[] = [];
      for (let i = 0; i < totalCells; i++) {
        newDefaultViewpoints.push({
          id: `viewpoint-${i + 1}`,
          name: `Góc nhìn${i + 1}`,
          nameEn: `Viewpoint ${i + 1}`,
          shotIds: [],
          keyProps: [],
          keyPropsEn: [],
          description: '',
          descriptionEn: '',
          gridIndex: i,
        });
      }
      
      setExtractedViewpoints(newDefaultViewpoints);
      setPendingViewpoints(newDefaultViewpoints.map((vp) => ({
        ...vp,
        pageIndex: 0,
        shotIndexes: [],
      })));
      
      // 更新bố cụcthông tin
      const updatedPromptPage: ContactSheetPromptSet = {
        pageIndex: 0,
        prompt: '',
        promptZh: '',
        viewpointIds: newDefaultViewpoints.map(v => v.id),
        gridLayout: { rows: dims.rows, cols: dims.cols },
      };
      setPendingContactSheetPrompts([updatedPromptPage]);
      
      // 清除hiện có的cắtkết quả
      setSplitViewpointImages({});
    }
  };

  /**
   * cắtảnh ghép
   */
  const handleSplitContactSheet = async () => {
    // 优先Sử dụng pendingViewpoints（从Kịch bản传来的），否则用 extractedViewpoints
    const currentPageVps = pendingViewpoints.filter(v => v.pageIndex === currentPageIndex);
    const viewpointsToUse = currentPageVps.length > 0 ? currentPageVps : extractedViewpoints;
    
    if (!contactSheetImage || viewpointsToUse.length === 0) {
      toast.error("Vui lòng Tải lên ảnh ghép và Tạo prompt trước");
      return;
    }

    setIsSplitting(true);
    try {
      // 优先从 pendingContactSheetPrompts 获取bố cục（这是Tạoprompt时Xác nhận的真实bố cục）
      // 如果没有，才Sử dụngngười dùngChọn的 contactSheetLayout
      let expectedRows: number;
      let expectedCols: number;
      
      const currentPagePrompt = pendingContactSheetPrompts[currentPageIndex];
      if (currentPagePrompt?.gridLayout) {
        // Sử dụngTạoprompt时Xác nhận的bố cục
        expectedRows = currentPagePrompt.gridLayout.rows;
        expectedCols = currentPagePrompt.gridLayout.cols;
        console.log('[Split] Sử dụng pendingContactSheetPrompts đang xử lý...:', { expectedRows, expectedCols });
      } else {
        // 后备：Sử dụngngười dùngChọn的bố cục
        const dims = getLayoutDimensions(contactSheetLayout, contactSheetAspectRatio);
        expectedRows = dims.rows;
        expectedCols = dims.cols;
        console.log('[Split] Sử dụng bố cục người dùng Chọn:', { expectedRows, expectedCols, contactSheetLayout });
      }
      
      const expectedCount = expectedRows * expectedCols;
      
      // 如果ảnh是 HTTP URL，先转为 base64 Tránh CORS 导致 canvas 被污染
      let imageForSplit = contactSheetImage;
      if (contactSheetImage.startsWith('http://') || contactSheetImage.startsWith('https://')) {
        console.log('[Split] Phát hiện HTTP URL, chuyển đổi thành base64...');
        try {
          const resp = await fetch(contactSheetImage);
          const blob = await resp.blob();
          imageForSplit = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          console.log('[Split] HTTP→base64 chuyển đổi Thành công');
        } catch (convertErr) {
          console.warn('[Split] HTTP→base64 chuyển đổi Thất bại, Sử dụng URL gốc:', convertErr);
        }
      }
      
      const splitResults = await splitStoryboardImage(imageForSplit, {
        aspectRatio: contactSheetAspectRatio,
        resolution: '2K',
        sceneCount: expectedCount,
        options: {
          expectedRows,
          expectedCols,
          filterEmpty: false, // Giữ lại tất cả ô
          edgeMarginPercent: 0.02, // Cắt 2% cạnh
        },
      });
      
      // 将cắtkết quảánh xạ到Góc nhìn
      const viewpointImagesMap: Record<string, { imageUrl: string; gridIndex: number }> = {};
      
      for (const vp of viewpointsToUse) {
        const gridIndex = vp.gridIndex;
        // 根据Tỷ lệ khung hình计算 hàng cột
        const row = Math.floor(gridIndex / expectedCols);
        const col = gridIndex % expectedCols;
        
        // splitResults 按 row/col Khớp
        const splitResult = splitResults.find(sr => sr.row === row && sr.col === col);
        
        if (splitResult) {
          viewpointImagesMap[vp.id] = {
            imageUrl: splitResult.dataUrl,
            gridIndex: gridIndex,
          };
        }
      }
      
      // 同步更新 extractedViewpoints，确保Lưu时有dữ liệu
      if (currentPageVps.length > 0 && extractedViewpoints.length === 0) {
        setExtractedViewpoints(currentPageVps.map(vp => ({
          id: vp.id,
          name: vp.name,
          nameEn: vp.nameEn,
          shotIds: vp.shotIds,
          keyProps: vp.keyProps,
          keyPropsEn: vp.keyPropsEn,
          description: '',
          descriptionEn: '',
          gridIndex: vp.gridIndex,
        })));
      }
      
      setSplitViewpointImages(viewpointImagesMap);
      toast.success(`Đã cắt thành ${Object.keys(viewpointImagesMap).length} ảnh Góc nhìn`);
    } catch (error) {
      console.error('[ContactSheet] Cắt Thất bại:', error);
      toast.error("Cắt Thất bại, vui lòng kiểm tra định dạng ảnh");
    } finally {
      setIsSplitting(false);
    }
  };

  /**
   * LưuGóc nhìnảnh - 为每Góc nhìnTạođộc lập的conCảnh
   * 例如：“张家客厅” → TạoThư mục“张家客厅-Góc nhìn” → LưuconCảnh到Thư mục
   * 如果没有đã chọnCảnh，会Tự độngTạo一Cảnh cha
   */
  const handleSaveViewpointImages = async () => {
    if (Object.keys(splitViewpointImages).length === 0) {
      toast.error("Không có ảnh Góc nhìn để Lưu");
      return;
    }
    
    // 如果没有đã chọnCảnh，先Tự độngTạo一Cảnh cha
    let parentScene = selectedScene;
    if (!parentScene) {
      // kiểm tra表单dữ liệu
      const sceneName = name.trim() || 'Chưa đặt tênCảnh';
      const sceneLocation = location.trim() || sceneName;
      
      // TạoCảnh cha
      const newParentId = addScene({
        name: sceneName,
        location: sceneLocation,
        time: time || 'day',
        atmosphere: atmosphere || 'peaceful',
        styleId: styleId || DEFAULT_STYLE_ID,
        folderId: currentFolderId,
        projectId: resourceProjectId ?? undefined,
      });
      
      // 获取刚Tạo的Cảnh
      const { scenes } = useSceneStore.getState();
      parentScene = scenes.find(s => s.id === newParentId) || null;
      
      if (!parentScene) {
        toast.error("Tạo Cảnh cha Thất bại");
        return;
      }
      
      // đã chọn新Tạo的Cảnh
      selectScene(newParentId);
      toast.success(`Đã Tự động Tạo Cảnh「${sceneName}」`);
    }

    // 优先Sử dụng pendingViewpoints（从Kịch bản传来的），否则用 extractedViewpoints
    const currentPageVps = pendingViewpoints.filter(v => v.pageIndex === currentPageIndex);
    let viewpointsToUse = currentPageVps.length > 0 ? currentPageVps : extractedViewpoints;
    
    if (viewpointsToUse.length === 0) {
      toast.error("Không có dữ liệu Góc nhìn");
      return;
    }
    
    // === bổ sungchưa phân bổ的Phân cảnh shotIds ===
    // Tìm thấy当前Cảnh的Tất cảPhân cảnh
    const sceneName = parentScene.name || parentScene.location || '';
    const sceneShots = allShots.filter(shot => {
      // 通过 sceneRefId hoặcTên cảnhKhớp
      const scriptScenes = currentProject?.scriptData?.scenes || [];
      const matchedScene = scriptScenes.find(s => 
        s.name === sceneName || s.location === sceneName ||
        (s.name && sceneName.includes(s.name)) || (s.location && sceneName.includes(s.location))
      );
      return matchedScene && shot.sceneRefId === matchedScene.id;
    });
    
    if (sceneShots.length > 0) {
      // thu thập已phân bổ的Phân cảnh ID
      const assignedShotIds = new Set(viewpointsToUse.flatMap(vp => vp.shotIds || []));
      
      // 找出chưa phân bổ的Phân cảnh
      const unassignedShots = sceneShots.filter(shot => !assignedShotIds.has(shot.id));
      
      if (unassignedShots.length > 0) {
        console.log(`[ContactSheet] Phát hiện ${unassignedShots.length} Phân cảnh chưa phân bổ, phân bổ theo số thứ tự vào Góc nhìn`);
        
        // 按Phân cảnhsố thứ tựphân bổ到Góc nhìn（Phân cảnh1->Góc nhìn1，Phân cảnh2->Góc nhìn2，...）
        // Sao chép viewpointsToUse 以便修改
        viewpointsToUse = viewpointsToUse.map((vp) => ({
          ...vp,
          shotIds: [...(vp.shotIds || [])],
        })) as typeof viewpointsToUse;
        
        // 将chưa phân bổ的Phân cảnh按số thứ tựphân bổ
        for (const shot of unassignedShots) {
          // 根据Phân cảnh在Cảnh内的số thứ tựXác nhận对应的Góc nhìn
          const shotIndexInScene = sceneShots.findIndex(s => s.id === shot.id);
          const vpIndex = shotIndexInScene % viewpointsToUse.length;
          viewpointsToUse[vpIndex].shotIds.push(shot.id);
          console.log(`  - Phân cảnh ${shot.id} (số thứ tự${shotIndexInScene + 1}) -> Góc nhìn ${vpIndex + 1}: ${viewpointsToUse[vpIndex].name}`);
        }
      }
    }

    const parentSceneName = parentScene.name || parentScene.location;
    const createdVariantIds: string[] = [];
    
    // conCảnhLưu在和Cảnh cha相同的Thư mụcđang xử lý... parentSceneId 关联
    const targetFolderId = parentScene.folderId;
    
    console.log('[ContactSheet] Lưu ảnh Góc nhìn (luôn Tạo mới):', {
      parentSceneId: parentScene.id,
      parentSceneName,
      viewpointsToSave: viewpointsToUse.map(v => v.name),
    });
    
    // 为每Góc nhìnluônTạo新conCảnh（ảnh先存cục bộ）
    for (const vp of viewpointsToUse) {
      const imgData = splitViewpointImages[vp.id];
      if (!imgData) continue;
      
      const variantName = `${parentSceneName}-${vp.name}`;
      // 将 data URL Lưu到cục bộfile
      const safeName = variantName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
      const localPath = await saveImageToLocal(
        imgData.imageUrl,
        'scenes',
        `${safeName}_${Date.now()}.png`
      );
      // 验证cục bộLưu是否Thành công（Thất bại时 saveImageToLocal Quay lạigốc data: URL）
      if (!localPath.startsWith('local-image://')) {
        console.warn(`[ContactSheet] Lưu cục bộ ảnh Góc nhìn Thất bại: ${vp.name}, sẽ Sử dụng URL gốc`);
      }
      const variantId = addScene({
        name: variantName,
        location: parentScene.location,
        time: parentScene.time || 'day',
        atmosphere: parentScene.atmosphere || 'peaceful',
        visualPrompt: parentScene.visualPrompt,
        referenceImage: localPath,
        styleId: parentScene.styleId || styleId,
        folderId: targetFolderId,
        projectId: parentScene.projectId ?? resourceProjectId ?? undefined,
        tags: parentScene.tags,
        // Góc nhìnbiến thể特有trường
        parentSceneId: parentScene.id,
        viewpointId: vp.id,
        viewpointName: vp.name,
        shotIds: vp.shotIds,
        isViewpointVariant: true,
      } as any);
      createdVariantIds.push(variantId);

      // 同步归档到Thư viện phương tiện Ảnh AI Thư mục
      const aiFolder = getOrCreateCategoryFolder('ai-image');
      addMediaFromUrl({
        url: localPath,
        name: `Cảnh-${variantName}`,
        type: 'image',
        source: 'ai-image',
        folderId: aiFolder,
        projectId: parentScene.projectId ?? resourceProjectId ?? undefined,
      });
    }

    // 更新Cảnh cha：仅记录本次ảnh ghép（不Ghi đè其它conCảnh）
    const viewpointsData = viewpointsToUse.map(vp => ({
      id: vp.id,
      name: vp.name,
      nameEn: vp.nameEn,
      shotIds: vp.shotIds,
      keyProps: vp.keyProps,
      gridIndex: vp.gridIndex,
    }));
    // ảnh ghép也Lưu到cục bộ（Tránh base64 持久化膨胀）
    let localContactSheet: string | null = contactSheetImage;
    if (contactSheetImage && contactSheetImage.startsWith('data:')) {
      const csPath = await saveImageToLocal(
        contactSheetImage,
        'scenes',
        `contact-sheet-${parentScene.id}_${Date.now()}.png`
      );
      if (csPath.startsWith('local-image://')) {
        localContactSheet = csPath;
        // ảnh ghép同步归档到Thư viện phương tiện
        const csAiFolder = getOrCreateCategoryFolder('ai-image');
        addMediaFromUrl({
          url: csPath,
          name: `Ảnh ghép-${parentSceneName}`,
          type: 'image',
          source: 'ai-image',
          folderId: csAiFolder,
          projectId: parentScene.projectId ?? resourceProjectId ?? undefined,
        });
      }
    }
    updateScene(parentScene.id, {
      contactSheetImage: localContactSheet,
      viewpoints: viewpointsData,
    } as any);

    console.log('[ContactSheet] Lưu hoàn thành (luôn Tạo mới):', {
      parentSceneId: parentScene.id,
      created: createdVariantIds.length,
    });

    // 仅Lưu新Tạo的conCảnh ID，用于hàng loạt4góc nhìn
    setSavedChildSceneIds(createdVariantIds);
    
    toast.success(`đã tạo ${createdVariantIds.length} Góc nhìnbiến thểCảnh`);
    
    // Xóa tất cả临时Trạng thái（保留 savedChildSceneIds）
    setContactSheetPrompt(null);
    setContactSheetPromptZh(null);
    setContactSheetImage(null);
    setSplitViewpointImages({});
    setExtractedViewpoints([]);
    setPendingViewpoints([]);
    setPendingContactSheetPrompts([]);
  };

  /**
   * Hủy多Góc nhìnthao tác
   */
  const handleCancelContactSheet = () => {
    setContactSheetPrompt(null);
    setContactSheetPromptZh(null);
    setContactSheetImage(null);
    setSplitViewpointImages({});
    setExtractedViewpoints([]);
  };

  /**
   * 一键Tự độngquy trình：Tạoảnh ghép → cắt → LưuconCảnh
   * nhiệm vụ在trang quản trị运 hàng，người dùng可以Tiếp tụcCài đặt下一Tạonhiệm vụ
   */
  const handleAutoGenerateContactSheet = async () => {
    if (!contactSheetPrompt) {
      toast.error("Vui lòng tạo trướcprompt");
      return;
    }

    const featureConfig = getFeatureConfig('character_generation');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('character_generation'));
      return;
    }

    // nhanh当前Tất cả必要的Trạng thái（确保trang quản trị运 hàng时不受 UI Trạng thái变化影响）
    const snapshotPrompt = contactSheetPrompt;
    const snapshotStyleId = styleId;
    const snapshotAspectRatio = contactSheetAspectRatio;
    const snapshotLayout = contactSheetLayout;
    const snapshotViewpoints = [...(pendingViewpoints.length > 0 ? pendingViewpoints.filter(v => v.pageIndex === currentPageIndex) : extractedViewpoints)];
    const snapshotAllPendingViewpoints = [...pendingViewpoints];
    const snapshotCurrentPageIndex = currentPageIndex;
    const snapshotPendingPrompts = [...pendingContactSheetPrompts];

    console.log('[AutoContactSheet] Trạng thái nhanh:', {
      promptLength: contactSheetPrompt?.length,
      aspectRatio: snapshotAspectRatio,
      layout: snapshotLayout,
      viewpointsCount: snapshotViewpoints.length,
      pendingViewpointsTotal: pendingViewpoints.length,
      extractedViewpointsCount: extractedViewpoints.length,
      currentPageIndex,
    });

    const snapshotName = name.trim() || selectedScene?.name || 'Chưa đặt tênCảnh';
    const snapshotLocation = location.trim() || selectedScene?.location || snapshotName;
    const snapshotTime = time || selectedScene?.time || 'day';
    const snapshotAtmosphere = atmosphere || selectedScene?.atmosphere || 'peaceful';
    const snapshotVisualPrompt = visualPrompt || selectedScene?.visualPrompt;
    const snapshotTags = [...tags];
    const snapshotNotes = notes;
    const snapshotFolderId = currentFolderId;
    const snapshotProjectId = resourceProjectId;

    // 立即Tạohoặc复用Cảnh cha
    let parentSceneId: string;
    if (selectedScene) {
      parentSceneId = selectedScene.id;
    } else {
      parentSceneId = addScene({
        name: snapshotName,
        location: snapshotLocation,
        time: snapshotTime,
        atmosphere: snapshotAtmosphere,
        styleId: snapshotStyleId || DEFAULT_STYLE_ID,
        folderId: snapshotFolderId,
        projectId: snapshotProjectId ?? undefined,
        visualPrompt: snapshotVisualPrompt,
        tags: snapshotTags.length > 0 ? snapshotTags : undefined,
        notes: snapshotNotes?.trim() || undefined,
      });
      selectScene(parentSceneId);
      onSceneCreated?.(parentSceneId);
    }

    // Cài đặtĐang tạoTrạng thái — đang xử lý...Hiện spinner
    setContactSheetTask(parentSceneId, { status: 'generating', progress: 10, message: 'Đang tạo ảnh ghép...' });
    toast.info(`Ảnh ghép Cảnh「${snapshotName}」Bắt đầu Tạo...`);

    // 立即Xóa tất cảCột tráiTrạng thái，允许người dùngCài đặt下一nhiệm vụ
    setContactSheetPrompt(null);
    setContactSheetPromptZh(null);
    setContactSheetImage(null);
    setSplitViewpointImages({});
    setIsGeneratingContactSheet(false);

    // trang quản trị异步执 hàng整quy trình
    (async () => {
      try {
        // ==================== Giai đoạn 1: Tạoảnh ghép ====================
        // 获取 API 配置 — 与Đạo diễnpanelgiốngSử dụng submitGridImageRequest
        const autoFeatureConfig = getFeatureConfig('character_generation');
        if (!autoFeatureConfig) {
          throw new Error(getFeatureNotConfiguredMessage('character_generation'));
        }
        const apiKey = autoFeatureConfig.apiKey;
        const baseUrl = autoFeatureConfig.baseUrl?.replace(/\/+$/, '') || '';
        const model = autoFeatureConfig.models?.[0] || '';
        const keyManager = autoFeatureConfig.keyManager;

        if (!apiKey || !baseUrl || !model) {
          throw new Error('Tạo ảnh API Chưa cấu hình');
        }

        // Prompt phủ định — 增加 distorted grid / uneven panels
        const stylePreset = getStyleById(snapshotStyleId);
        const isRealistic = stylePreset?.category === 'real';
        const negativePrompt = isRealistic
          ? 'blurry, low quality, watermark, text, labels, titles, captions, words, letters, numbers, annotations, subtitles, typography, font, writing, people, characters, anime, cartoon, distorted grid, uneven panels'
          : 'blurry, low quality, watermark, text, labels, titles, captions, words, letters, numbers, annotations, subtitles, typography, font, writing, people, characters, distorted grid, uneven panels';

        // 增强prompt：如果người dùngChỉnh sửa的是prompt tiếng Trung，在前面包裹英文Cấu trúc化lưới指令
        let finalPrompt = snapshotPrompt;
        const isChinese = /[\u4e00-\u9fa5]/.test(finalPrompt) && !finalPrompt.includes('<instruction>');
        if (isChinese) {
          // người dùng提供了prompt tiếng Trung但没有Cấu trúc化指令 → 包裹英文 grid 指令
          const currentPagePromptForLayout = snapshotPendingPrompts[snapshotCurrentPageIndex];
          const layoutForPrompt = currentPagePromptForLayout?.gridLayout || 
            (() => {
              switch (snapshotLayout) {
                case '2x2': return { rows: 2, cols: 2 };
                case '3x3': return { rows: 3, cols: 3 };
                default: return { rows: 3, cols: 3 };
              }
            })();
          const totalCells = layoutForPrompt.rows * layoutForPrompt.cols;
          const panelAspect = snapshotAspectRatio === '16:9' ? '16:9 (horizontal landscape)' : '9:16 (vertical portrait)';
          const styleTokens = stylePreset?.prompt || '';
          
          finalPrompt = [
            '<instruction>',
            `Generate a clean ${layoutForPrompt.rows}x${layoutForPrompt.cols} storyboard grid with exactly ${totalCells} equal-sized panels.`,
            `Overall Image Aspect Ratio: ${snapshotAspectRatio}.`,
            `Each individual panel must have a ${panelAspect} aspect ratio.`,
            styleTokens ? `MANDATORY Visual Style for ALL panels: ${styleTokens}` : '',
            'Structure: No borders between panels, no text, no watermarks, no speech bubbles.',
            'Consistency: Maintain consistent perspective, lighting, color grading, and visual style across ALL panels.',
            '</instruction>',
            '',
            snapshotPrompt,
            '',
            `Negative constraints: ${negativePrompt}`,
          ].filter(Boolean).join('\n');
        } else {
          // hiện có英文Cấu trúc化prompt，追加Prompt phủ định
          if (!finalPrompt.includes('Negative constraints:')) {
            finalPrompt += `\nNegative constraints: ${negativePrompt}`;
          }
        }

        setContactSheetTask(parentSceneId, { status: 'generating', progress: 30, message: 'Đang gọi API AI để Tạo...' });

        // Sử dụng submitGridImageRequest — 与Đạo diễnpanelgiữgiống
        const result = await submitGridImageRequest({
          model,
          prompt: finalPrompt,
          apiKey,
          baseUrl,
          aspectRatio: snapshotAspectRatio,
          resolution: '2K',
          keyManager,
        });

        const generatedImageUrl = result.imageUrl;
        if (!generatedImageUrl) {
          throw new Error('Tạo ảnh thất bại: Không trả về URL ảnh');
        }

        console.log('[AutoContactSheet] Giai đoạn 1 hoàn thành, loại URL ảnh:', 
          generatedImageUrl.startsWith('data:') ? 'base64' : 'HTTP URL',
          'độ dài:', generatedImageUrl.length
        );

        // ==================== Giai đoạn 2: cắt ====================
        setContactSheetTask(parentSceneId, { status: 'splitting', progress: 60, message: 'Đang cắt Góc nhìn...' });

        const currentPagePrompt = snapshotPendingPrompts[snapshotCurrentPageIndex];
        let expectedRows: number, expectedCols: number;
        if (currentPagePrompt?.gridLayout) {
          expectedRows = currentPagePrompt.gridLayout.rows;
          expectedCols = currentPagePrompt.gridLayout.cols;
        } else {
          const layoutDims = (() => {
            switch (snapshotLayout) {
              case '2x2': return { rows: 2, cols: 2 };
              case '3x3': return { rows: 3, cols: 3 };
              default: return { rows: 3, cols: 3 };
            }
          })();
          expectedRows = layoutDims.rows;
          expectedCols = layoutDims.cols;
        }
        const expectedCount = expectedRows * expectedCols;

        // 如果ảnh是 HTTP URL，先转为 base64 Tránh CORS 导致 canvas 被污染
        let imageForSplit = generatedImageUrl;
        if (generatedImageUrl.startsWith('http://') || generatedImageUrl.startsWith('https://')) {
          console.log('[AutoContactSheet] Phát hiện HTTP URL, chuyển đổi thành base64...');
          try {
            const resp = await fetch(generatedImageUrl);
            const blob = await resp.blob();
            imageForSplit = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            console.log('[AutoContactSheet] HTTP→base64 chuyển đổi Thành công, độ dài:', imageForSplit.length);
          } catch (convertErr) {
            console.warn('[AutoContactSheet] HTTP→base64 chuyển đổi Thất bại, Sử dụng URL gốc:', convertErr);
          }
        }

        console.log('[AutoContactSheet] Tham số cắt:', { expectedRows, expectedCols, expectedCount, aspectRatio: snapshotAspectRatio });

        const splitResults = await splitStoryboardImage(imageForSplit, {
          aspectRatio: snapshotAspectRatio,
          resolution: '2K',
          sceneCount: expectedCount,
          options: {
            expectedRows,
            expectedCols,
            filterEmpty: false,
            edgeMarginPercent: 0.02,
          },
        });

        console.log('[AutoContactSheet] Cắt hoàn thành, số lượng kết quả:', splitResults.length);

        // 如果 snapshotViewpoints 为空（người dùngThủ côngChỉnh sửaprompt，未走Góc nhìnTạo流程），
        // Tự độngTạo fallback Góc nhìn以Khớpcắtkết quả
        let effectiveViewpoints = snapshotViewpoints;
        if (effectiveViewpoints.length === 0 && splitResults.length > 0) {
          console.log('[AutoContactSheet] Góc nhìn trống, Tự động Tạo fallback Góc nhìn, số lượng:', splitResults.length);
          effectiveViewpoints = splitResults.map((sr, idx) => ({
            id: `auto-vp-${idx}-${Date.now()}`,
            name: `Góc nhìn-${idx + 1}`,
            nameEn: `Viewpoint-${idx + 1}`,
            shotIds: [] as string[],
            shotIndexes: [] as number[],
            keyProps: [] as string[],
            keyPropsEn: [] as string[],
            gridIndex: idx,
            pageIndex: 0,
          }));
        }

        console.log('[AutoContactSheet] Số lượng Góc nhìn hợp lệ:', effectiveViewpoints.length);
        // gỡ lỗi：输出每Góc nhìn的 gridIndex
        effectiveViewpoints.forEach((vp, i) => {
          console.log(`[AutoContactSheet] Góc nhìn[${i}]: id=${vp.id}, name=${vp.name}, gridIndex=${vp.gridIndex}`);
        });

        // 将cắtkết quảánh xạ到Góc nhìn — 双重ánh xạ策略：优先Trực tiếpchỉ mục，回退到 row/col 查找
        const viewpointImagesMap: Record<string, { imageUrl: string; gridIndex: number }> = {};
        for (const vp of effectiveViewpoints) {
          const gridIdx = vp.gridIndex;
          // 策略 1: Trực tiếpchỉ mục — splitResults 按 hàng优先排 cột，gridIndex Trực tiếp对应
          let splitResult = (gridIdx >= 0 && gridIdx < splitResults.length) ? splitResults[gridIdx] : undefined;
          // 验证：Trực tiếpchỉ mục的 row/col 应该 = gridIndex 整除和取模
          if (splitResult) {
            const expectRow = Math.floor(gridIdx / expectedCols);
            const expectCol = gridIdx % expectedCols;
            if (splitResult.row !== expectRow || splitResult.col !== expectCol) {
              console.warn(`[AutoContactSheet] Chỉ mục trực tiếp không Khớp: gridIndex=${gridIdx}, split[row=${splitResult.row},col=${splitResult.col}] vs expected[row=${expectRow},col=${expectCol}]`);
              splitResult = undefined; // Không Khớp, quay lại tìm kiếm
            }
          }
          // 策略 2: row/col 查找
          if (!splitResult) {
            const row = Math.floor(gridIdx / expectedCols);
            const col = gridIdx % expectedCols;
            splitResult = splitResults.find(sr => sr.row === row && sr.col === col);
          }
          if (splitResult) {
            viewpointImagesMap[vp.id] = { imageUrl: splitResult.dataUrl, gridIndex: vp.gridIndex };
          } else {
            console.warn(`[AutoContactSheet] Góc nhìn ${vp.name}(gridIndex=${gridIdx}) chưa Tìm thấy kết quả cắt tương ứng`);
          }
        }

        const mappedCount = Object.keys(viewpointImagesMap).length;
        console.log('[AutoContactSheet] Số lượng kết quả ánh xạ:', mappedCount, '/', effectiveViewpoints.length);

        // ===== an toàn回退：如果ánh xạTất cảThất bại但cắt有kết quả，Trực tiếpSử dụngcắtkết quảTạoconCảnh =====
        if (mappedCount === 0 && splitResults.length > 0) {
          console.warn('[AutoContactSheet] ⚠ Tất cả ánh xạ Thất bại! Bật dự phòng an toàn: Trực tiếp Sử dụng kết quả cắt để Tạo Cảnh con');
          // 重建 effectiveViewpoints 和 viewpointImagesMap
          effectiveViewpoints = splitResults.map((sr, idx) => ({
            id: `fallback-vp-${idx}-${Date.now()}`,
            name: `Góc nhìn-${idx + 1}`,
            nameEn: `Viewpoint-${idx + 1}`,
            shotIds: [] as string[],
            shotIndexes: [] as number[],
            keyProps: [] as string[],
            keyPropsEn: [] as string[],
            gridIndex: idx,
            pageIndex: 0,
          }));
          effectiveViewpoints.forEach((vp, idx) => {
            viewpointImagesMap[vp.id] = { imageUrl: splitResults[idx].dataUrl, gridIndex: idx };
          });
          console.log('[AutoContactSheet] Số lượng ánh xạ sau dự phòng:', Object.keys(viewpointImagesMap).length);
        }

        // ==================== Giai đoạn 3: LưuconCảnh ====================
        setContactSheetTask(parentSceneId, { status: 'saving', progress: 80, message: 'Đang Lưu Góc nhìn...' });

        const { scenes: currentScenes } = useSceneStore.getState();
        const parentScene = currentScenes.find(s => s.id === parentSceneId);
        if (!parentScene) {
          throw new Error('Cảnh cha đã bị Xóa');
        }
        const parentSceneName = parentScene.name || parentScene.location;
        const targetFolderId = parentScene.folderId;
        const createdVariantIds: string[] = [];

        // bổ sungPhân cảnh shotIds — Sử dụng effectiveViewpoints（含 fallback）
        let viewpointsToSave = effectiveViewpoints.map((vp) => ({
          ...vp,
          shotIds: [...(vp.shotIds || [])],
        }));

        const sceneShots = allShots.filter(shot => {
          const scriptScenes = currentProject?.scriptData?.scenes || [];
          const matchedScene = scriptScenes.find(s => 
            s.name === parentSceneName || s.location === parentSceneName ||
            (s.name && parentSceneName.includes(s.name)) || (s.location && parentSceneName.includes(s.location))
          );
          return matchedScene && shot.sceneRefId === matchedScene.id;
        });

        if (sceneShots.length > 0) {
          const assignedShotIds = new Set(viewpointsToSave.flatMap(vp => vp.shotIds || []));
          const unassignedShots = sceneShots.filter(shot => !assignedShotIds.has(shot.id));
          for (const shot of unassignedShots) {
            const shotIndexInScene = sceneShots.findIndex(s => s.id === shot.id);
            const vpIndex = shotIndexInScene % viewpointsToSave.length;
            viewpointsToSave[vpIndex].shotIds.push(shot.id);
          }
        }

        console.log('[AutoContactSheet] Giai đoạn 3: chuẩn bị Lưu Cảnh con, viewpointsToSave:', viewpointsToSave.length, 'viewpointImagesMap mục:', Object.keys(viewpointImagesMap).length);

        for (const vp of viewpointsToSave) {
          const imgData = viewpointImagesMap[vp.id];
          if (!imgData) {
            console.warn(`[AutoContactSheet] Bỏ qua Góc nhìn ${vp.name}: viewpointImagesMap không có dữ liệu (id=${vp.id})`);
            continue;
          }

          const variantName = `${parentSceneName}-${vp.name}`;
          const safeName = variantName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
          const localPath = await saveImageToLocal(
            imgData.imageUrl,
            'scenes',
            `${safeName}_${Date.now()}.png`
          );

          const variantId = addScene({
            name: variantName,
            location: parentScene.location,
            time: parentScene.time || 'day',
            atmosphere: parentScene.atmosphere || 'peaceful',
            visualPrompt: parentScene.visualPrompt,
            referenceImage: localPath,
            styleId: parentScene.styleId || snapshotStyleId,
            folderId: targetFolderId,
            projectId: parentScene.projectId ?? snapshotProjectId ?? undefined,
            tags: parentScene.tags,
            parentSceneId: parentScene.id,
            viewpointId: vp.id,
            viewpointName: vp.name,
            shotIds: vp.shotIds,
            isViewpointVariant: true,
          } as any);
          createdVariantIds.push(variantId);

          const aiFolder = getOrCreateCategoryFolder('ai-image');
          addMediaFromUrl({
            url: localPath,
            name: `Cảnh-${variantName}`,
            type: 'image',
            source: 'ai-image',
            folderId: aiFolder,
            projectId: parentScene.projectId ?? snapshotProjectId ?? undefined,
          });
        }

        // Lưuảnh ghép到Cảnh cha（同时tương thích base64 和 imageForSplit 已chuyển đổi过的）
        let localContactSheet: string | null = imageForSplit || generatedImageUrl;
        const imageToSave = imageForSplit || generatedImageUrl;
        if (imageToSave && (imageToSave.startsWith('data:') || imageToSave.startsWith('http'))) {
          const csPath = await saveImageToLocal(
            imageToSave,
            'scenes',
            `contact-sheet-${parentScene.id}_${Date.now()}.png`
          );
          if (csPath.startsWith('local-image://')) {
            localContactSheet = csPath;
            const csAiFolder = getOrCreateCategoryFolder('ai-image');
            addMediaFromUrl({
              url: csPath,
              name: `Ảnh ghép-${parentSceneName}`,
              type: 'image',
              source: 'ai-image',
              folderId: csAiFolder,
              projectId: parentScene.projectId ?? snapshotProjectId ?? undefined,
            });
          }
        }

        const viewpointsData = viewpointsToSave.map(vp => ({
          id: vp.id,
          name: vp.name,
          nameEn: vp.nameEn,
          shotIds: vp.shotIds,
          keyProps: vp.keyProps,
          gridIndex: vp.gridIndex,
        }));
        updateScene(parentScene.id, {
          contactSheetImage: localContactSheet,
          viewpoints: viewpointsData,
        } as any);

        // ==================== hoàn thành ====================
        console.log('[AutoContactSheet] ✅ Quy trình hoàn thành:', {
          parentSceneId,
          childScenesCreated: createdVariantIds.length,
          splitResultsCount: splitResults.length,
          viewpointsMapped: Object.keys(viewpointImagesMap).length,
        });
        setContactSheetTask(parentSceneId, { status: 'done', progress: 100, message: `hoàn thành，đã tạo ${createdVariantIds.length} conCảnh` });
        if (createdVariantIds.length > 0) {
          toast.success(`Cảnh「${parentSceneName}」ảnh ghép đã cắt và Lưu, tổng ${createdVariantIds.length} Cảnh con Góc nhìn (Nhấp để Mở rộng Xem)`);
        } else {
          toast.warning(`Cảnh「${parentSceneName}」ảnh ghép đã lưu, nhưng không thể Tạo Cảnh con (kết quả cắt: ${splitResults.length})`);
        }

        // 3秒后清除hoàn thànhTrạng thái
        setTimeout(() => {
          setContactSheetTask(parentSceneId, null);
        }, 3000);

      } catch (error) {
        const err = error as Error;
        console.error('[AutoContactSheet] Quy trình Tự động Thất bại:', err);
        setContactSheetTask(parentSceneId, { status: 'error', progress: 0, message: err.message });
        toast.error(`Cảnhảnh ghépTự độngTạo thất bại: ${err.message}`);
        // 10秒后清除lỗiTrạng thái
        setTimeout(() => {
          setContactSheetTask(parentSceneId, null);
        }, 10000);
      }
    })();
  };

  /**
   * 清除hàng loạt4góc nhìnTrạng thái
   */
  const handleClearBatchOrthographic = () => {
    setSavedChildSceneIds([]);
  };

  /**
   * Tạo hàng loạt4góc nhìn（为Tất cảconCảnh）
   */
  const handleBatchGenerateOrthographic = async () => {
    if (savedChildSceneIds.length === 0) {
      toast.error("Không có Cảnh con có thể xử lý");
      return;
    }

    const featureConfig = getFeatureConfig('character_generation');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('character_generation'));
      return;
    }

    const { scenes, getSceneById } = useSceneStore.getState();
    const childScenes = savedChildSceneIds
      .map(id => scenes.find(s => s.id === id))
      .filter(Boolean) as Scene[];

    if (childScenes.length === 0) {
      toast.error("Không tìm thấy Cảnh con");
      return;
    }

    toast.info(`Bắt đầu Tạo ảnh 4 góc nhìn cho ${childScenes.length} Cảnh con...`);

    let successCount = 0;
    let failCount = 0;

    for (const childScene of childScenes) {
      try {
        // Tạo bốn góc nhìnprompt
        const { anchor, walls } = extractSpatialAssets(childScene);
        const sceneName = childScene.name || childScene.location || 'the scene';
        const stylePreset = getStyleById(childScene.styleId || styleId);
        const styleTokens = stylePreset?.prompt || 'anime style';

        const promptEn = `A professional orthographic concept sheet arranged in a precise 2x2 grid, depicting ${sceneName} from four cardinal angles with perfect spatial continuity. ${styleTokens}, detailed environment concept art.

**Top-Left (Front View):** A direct front-facing shot of ${anchor}. Background: ${walls.south}.
**Top-Right (Back View):** A direct back-facing shot of ${anchor}. Background: ${walls.north}.
**Bottom-Left (Left Profile):** Side profile shot from the left. Background: ${walls.east}.
**Bottom-Right (Right Profile):** Side profile shot from the right. Background: ${walls.west}.

No characters, empty environment.`;

        const isRealistic = stylePreset?.category === 'real';
        const negativePrompt = isRealistic
          ? 'blurry, low quality, watermark, text, people, characters, anime, cartoon, distorted grid'
          : 'blurry, low quality, watermark, text, people, characters, distorted grid';

        // thu thậpẢnh tham chiếu：优先用「Toàn cảnh」conCảnh + 当前conCảnhảnh
        const rawReferenceImages: string[] = [];
        
        // 1. 获取同一Cảnh cha下的「Toàn cảnh」conCảnh
        let overviewImage: string | null = null;
        if (childScene.parentSceneId) {
          const overviewScene = scenes.find(s => 
            s.parentSceneId === childScene.parentSceneId && 
            (s as any).viewpointId === 'overview'
          );
          if (overviewScene?.referenceImage) {
            overviewImage = overviewScene.referenceImage;
          }
          if (!overviewImage) {
            const overviewByName = scenes.find(s => 
              s.parentSceneId === childScene.parentSceneId && 
              (s.name?.includes('Toàn cảnh') || (s as any).viewpointName === 'Toàn cảnh')
            );
            if (overviewByName?.referenceImage) {
              overviewImage = overviewByName.referenceImage;
            }
          }
        }
        
        if (overviewImage) {
          rawReferenceImages.push(overviewImage);
          console.log(`[hàng loạt 4 góc nhìn] ${childScene.name} Sử dụng Cảnh con Toàn cảnh làm Tham chiếu`);
        }
        
        // 2. ThêmconCảnh自身的ảnh
        if (childScene.referenceImage && childScene.referenceImage !== overviewImage) {
          rawReferenceImages.push(childScene.referenceImage);
        }

        // 将 local-image:// chuyển đổi thành base64 以传给 API
        const referenceImages: string[] = [];
        for (const ref of rawReferenceImages) {
          if (ref.startsWith('local-image://')) {
            const base64 = await readImageAsBase64(ref);
            if (base64) referenceImages.push(base64);
          } else {
            referenceImages.push(ref);
          }
        }

        // Tạo ảnh
        const result = await generateSceneImageAPI({
          prompt: promptEn,
          negativePrompt,
          aspectRatio: orthographicAspectRatio,
          styleId: childScene.styleId || styleId,
          referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        });

        // cắt
        const splitResults = await splitStoryboardImage(result.imageUrl, {
          aspectRatio: orthographicAspectRatio,
          resolution: '2K',
          sceneCount: 4,
          options: { expectedRows: 2, expectedCols: 2, filterEmpty: false, edgeMarginPercent: 0.02 },
        });

        // Lưu 4 Góc nhìnconCảnh
        const viewLabels = [
          { key: 'front', name: 'chính diện', row: 0, col: 0 },
          { key: 'back', name: 'Mặt sau', row: 0, col: 1 },
          { key: 'left', name: 'Bên trái', row: 1, col: 0 },
          { key: 'right', name: 'bên phải', row: 1, col: 1 },
        ];

        for (const view of viewLabels) {
          const sr = splitResults.find(r => r.row === view.row && r.col === view.col);
          if (sr) {
            const safeName = `${childScene.name}-${view.name}`.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
            const localPath = await saveImageToLocal(
              sr.dataUrl,
              'scenes',
              `${safeName}_${Date.now()}.png`
            );
            addScene({
              name: `${childScene.name}-${view.name}`,
              location: childScene.location,
              time: childScene.time || 'day',
              atmosphere: childScene.atmosphere || 'peaceful',
              referenceImage: localPath,
              styleId: childScene.styleId || styleId,
              folderId: childScene.folderId,
              projectId: childScene.projectId ?? resourceProjectId ?? undefined,
              parentSceneId: childScene.id,
              viewpointId: view.key,
              viewpointName: view.name,
              isViewpointVariant: true,
            } as any);

            // 同步归档到Thư viện phương tiện
            const batchAiFolder = getOrCreateCategoryFolder('ai-image');
            addMediaFromUrl({
              url: localPath,
              name: `Cảnh-${childScene.name}-${view.name}`,
              type: 'image',
              source: 'ai-image',
              folderId: batchAiFolder,
              projectId: childScene.projectId ?? resourceProjectId ?? undefined,
            });
          }
        }

        successCount++;
        console.log(`[hàng loạt 4 góc nhìn] ${childScene.name} hoàn thành`);
      } catch (err) {
        failCount++;
        console.error(`[hàng loạt 4 góc nhìn] ${childScene.name} Thất bại:`, err);
      }
    }

    setSavedChildSceneIds([]);
    toast.success(`Hàng loạt 4 góc nhìn hoàn thành! Thành công ${successCount}, Thất bại ${failCount}`);
  };

  // ========== 4góc nhìn（trực giaogóc nhìn）chức năng ==========

  /**
   * 从Mô tả cảnhđang xử lý...间Tài sản
   */
  const extractSpatialAssets = (scene: Scene) => {
    const locationParts = (scene.location || '').split(/[,，、。；;\n]/).filter(Boolean);
    const visualParts = (scene.visualPrompt || '').split(/[,，、。；;\n]/).filter(Boolean);
    
    // 尝试识别Cảnhđang xử lý...物体作为 ANCHOR
    const commonAnchors = ['bàn', 'ghế', 'giường', 'sofa', 'tủ', 'mặt bàn', 'giá', 'đèn', 'cửa', ''];
    let anchor = locationParts[0] || scene.name || 'the central object';
    for (const part of [...locationParts, ...visualParts]) {
      for (const keyword of commonAnchors) {
        if (part.includes(keyword)) {
          anchor = part.trim();
          break;
        }
      }
    }

    // Tạo4面墙的Mô tả
    const wallDescriptions = {
      north: 'cửa sổ và ánh sáng tự nhiên',
      south: 'cửa vào',
      west: 'tường trang trí hoặc giá sách',
      east: 'đồ nội thất hoặc trang trí',
    };

    // 从Thị giácMô tảđang xử lý...取墙面thông tin
    const wallKeywords = {
      window: ['cửa sổ', 'window', 'ánh sáng', 'sunlight'],
      door: ['cửa', 'door', 'lối vào', 'entrance'],
      shelf: ['giá', 'shelf', 'tủ', 'cabinet', 'sách'],
      decoration: ['tranh', 'trang trí', 'decoration', 'art'],
    };

    for (const part of [...locationParts, ...visualParts]) {
      if (wallKeywords.window.some(k => part.includes(k))) {
        wallDescriptions.north = part.trim();
      } else if (wallKeywords.door.some(k => part.includes(k))) {
        wallDescriptions.south = part.trim();
      } else if (wallKeywords.shelf.some(k => part.includes(k))) {
        wallDescriptions.west = part.trim();
      } else if (wallKeywords.decoration.some(k => part.includes(k))) {
        wallDescriptions.east = part.trim();
      }
    }

    return { anchor, walls: wallDescriptions };
  };

  /**
   * Tạo bốn góc nhìn（trực giaogóc nhìn）prompt
   */
  const handleGenerateOrthographicPrompt = () => {
    if (!selectedScene) {
      toast.error("Vui lòng Chọn Cảnh trước");
      return;
    }

    const { anchor, walls } = extractSpatialAssets(selectedScene);
    const sceneName = selectedScene.name || selectedScene.location || 'the scene';
    
    // 获取Phong cách tokens
    const stylePreset = getStyleById(styleId);
    const styleTokens = stylePreset?.prompt || 'anime style';

    // Prompt tiếng Anh
    const promptEn = `A professional orthographic concept sheet arranged in a precise 2x2 grid, depicting ${sceneName} from four cardinal angles with perfect spatial continuity. ${styleTokens}, detailed environment concept art.

**Top-Left (Front View):**
A direct front-facing shot of ${anchor}. We see the front details clearly. The background is the wall behind it, featuring ${walls.south}.

**Top-Right (Back View):**
A direct back-facing shot of ${anchor}. We see the rear structure. The background is the wall the object is facing, featuring ${walls.north}.

**Bottom-Left (Left Profile):**
A side profile shot of ${anchor} from the left. The background is the opposite wall, strictly featuring ${walls.east}.

**Bottom-Right (Right Profile):**
A side profile shot of ${anchor} from the right. The background is the opposite wall, strictly featuring ${walls.west}.

Unified by flat, neutral cinematic lighting to ensure texture visibility. No characters, empty environment.`;

    // prompt tiếng Trung
    const promptZh = `Ảnh khái niệm trực giao chuyên nghiệp, lưới 2x2 chính xác, Hiển thị 4 Góc nhìn cơ bản của「${sceneName}」, giữ tính liên tục không gian hoàn hảo. ${stylePreset?.name || 'Phong cách hoạt hình'},

**左上（chính diệngóc nhìn）：**
Ống kính trực diện nhìn thẳng vào ${anchor}. Hiển thị rõ chi tiết mặt trước. Nền là tường phía sau, chứa ${walls.south}.

**右上（mặt saugóc nhìn）：**
Ống kính trực tiếp nhìn vào mặt sau của ${anchor}. Hiển thị Cấu trúc phía sau. Nền là tường mặt đối diện, chứa ${walls.north}.

**左下（Bên tráigóc nhìn）：**
Ống kính bên cạnh ${anchor} chụp từ bên trái. Nền là tường đối diện, nghiêm ngặt chứa ${walls.east}.

**右下（bên phảigóc nhìn）：**
Ống kính bên cạnh ${anchor} chụp từ bên phải. Nền là tường đối diện, nghiêm ngặt chứa ${walls.west}.

Sử dụng ánh sáng phẳng, đồng đều để đảm bảo kết cấu hiển thị rõ. Không có Nhân vật, Cảnh trống.`;

    setOrthographicPrompt(promptEn);
    setOrthographicPromptZh(promptZh);
    toast.success("Prompt 4 góc nhìn đã tạo");
  };

  /**
   * Tạo bốn góc nhìnảnh
   */
  const handleGenerateOrthographicImage = async () => {
    if (!orthographicPrompt) {
      toast.error("Vui lòng tạo trướcprompt");
      return;
    }

    const featureConfig = getFeatureConfig('character_generation');
    if (!featureConfig) {
      toast.error(getFeatureNotConfiguredMessage('character_generation'));
      return;
    }

    setIsGeneratingOrthographic(true);
    setOrthographicProgress(0);

    try {
      const stylePreset = getStyleById(styleId);
      const isRealistic = stylePreset?.category === 'real';
      const negativePrompt = isRealistic
        ? 'blurry, low quality, watermark, text, people, characters, anime, cartoon, distorted grid, uneven panels, asymmetric'
        : 'blurry, low quality, watermark, text, people, characters, distorted grid, uneven panels, asymmetric';

      setOrthographicProgress(20);

      // thu thậpẢnh tham chiếu：优先Sử dụng「Toàn cảnh」conCảnh，而不是整张ảnh ghép
      const rawRefs: string[] = [];
      
      // 1. 尝试获取「Toàn cảnh」conCảnh的ảnh（最高优先级）
      let overviewImage: string | null = null;
      
      if (selectedScene?.parentSceneId) {
        const { scenes } = useSceneStore.getState();
        const overviewScene = scenes.find(s => 
          s.parentSceneId === selectedScene.parentSceneId && 
          (s as any).viewpointId === 'overview'
        );
        if (overviewScene?.referenceImage) {
          overviewImage = overviewScene.referenceImage;
          console.log('[Orthographic] Tìm thấy Cảnh con Toàn cảnh làm Tham chiếu');
        }
        
        if (!overviewImage) {
          const overviewByName = scenes.find(s => 
            s.parentSceneId === selectedScene.parentSceneId && 
            (s.name?.includes('Toàn cảnh') || (s as any).viewpointName === 'Toàn cảnh')
          );
          if (overviewByName?.referenceImage) {
            overviewImage = overviewByName.referenceImage;
            console.log('[Orthographic] Tìm thấy Cảnh con Toàn cảnh theo Tên');
          }
        }
      }
      
      if (overviewImage) {
        rawRefs.push(overviewImage);
        console.log('[Orthographic] Sử dụng Cảnh con Toàn cảnh làm Tham chiếu chính');
      }
      
      // 2. ThêmĐang chọnCảnh的Ảnh tham chiếu
      if (selectedScene?.referenceImage && selectedScene.referenceImage !== overviewImage) {
        rawRefs.push(selectedScene.referenceImage);
        console.log('[Orthographic] Thêm ảnh Cảnh con làm Tham chiếu phụ');
      }

      // 将 local-image:// chuyển đổi thành base64 以传给 API
      const referenceImages: string[] = [];
      for (const ref of rawRefs) {
        if (ref.startsWith('local-image://')) {
          const base64 = await readImageAsBase64(ref);
          if (base64) referenceImages.push(base64);
        } else {
          referenceImages.push(ref);
        }
      }

      const result = await generateSceneImageAPI({
        prompt: orthographicPrompt,
        negativePrompt,
        aspectRatio: orthographicAspectRatio,
        styleId,
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      });

      setOrthographicProgress(100);
      setOrthographicImage(result.imageUrl);
      toast.success("4 góc nhìn Tạo thành công, có thể thực hiện cắt");
    } catch (error) {
      const err = error as Error;
      console.error('[Orthographic] Tạo thất bại:', err);
      toast.error(`Tạo thất bại: ${err.message}`);
    } finally {
      setIsGeneratingOrthographic(false);
      setOrthographicProgress(0);
    }
  };

  /**
   * Tải lên4góc nhìn（备用）
   */
  const handleUploadOrthographic = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setOrthographicImage(dataUrl);
      toast.success("4 góc nhìn đã tải lên, có thể thực hiện cắt");
    };
    reader.readAsDataURL(file);
  };

  /**
   * cắt4góc nhìn (2x2)
   */
  const handleSplitOrthographic = async () => {
    if (!orthographicImage) {
      toast.error("Vui lòng tạo trước hoặc Tải lên 4 góc nhìn");
      return;
    }

    setIsSplitting(true);
    try {
      // 2x2 cắt，Hỗ trợ 16:9 hoặc 9:16
      const splitResults = await splitStoryboardImage(orthographicImage, {
        aspectRatio: orthographicAspectRatio, // Sử dụng Tỷ lệ khung hình người dùng Chọn
        resolution: '2K',
        sceneCount: 4,
        options: {
          expectedRows: 2,
          expectedCols: 2,
          filterEmpty: false,
          edgeMarginPercent: 0.02,
        },
      });

      // ánh xạ到4Góc nhìn: 左上=chính diện, 右上=mặt sau, 左下=Bên trái, 右下=bên phải
      const viewMap: { front: string | null; back: string | null; left: string | null; right: string | null } = {
        front: null,
        back: null,
        left: null,
        right: null,
      };

      for (const sr of splitResults) {
        if (sr.row === 0 && sr.col === 0) viewMap.front = sr.dataUrl;
        if (sr.row === 0 && sr.col === 1) viewMap.back = sr.dataUrl;
        if (sr.row === 1 && sr.col === 0) viewMap.left = sr.dataUrl;
        if (sr.row === 1 && sr.col === 1) viewMap.right = sr.dataUrl;
      }

      setOrthographicViews(viewMap);
      toast.success("Đã cắt thành 4 ảnh Góc nhìn");
    } catch (error) {
      console.error('[Orthographic] cắtThất bại:', error);
      toast.error("Cắt Thất bại, vui lòng kiểm tra định dạng ảnh");
    } finally {
      setIsSplitting(false);
    }
  };

  /**
   * Lưu4góc nhìn到Cảnh
   */
  const handleSaveOrthographicViews = async () => {
    if (!selectedScene) {
      toast.error("Vui lòng Chọn Cảnh trước");
      return;
    }

    const { front, back, left, right } = orthographicViews;
    if (!front && !back && !left && !right) {
      toast.error("Không có ảnh Góc nhìn để Lưu");
      return;
    }

    const parentSceneName = selectedScene.name || selectedScene.location;
    const createdIds: string[] = [];
    const viewLabels = [
      { key: 'front', name: 'chính diện', nameEn: 'Front View', image: front },
      { key: 'back', name: 'Mặt sau', nameEn: 'Back View', image: back },
      { key: 'left', name: 'Bên trái', nameEn: 'Left View', image: left },
      { key: 'right', name: 'bên phải', nameEn: 'Right View', image: right },
    ];

    for (const view of viewLabels) {
      if (!view.image) continue;
      
      const variantName = `${parentSceneName}-${view.name}`;
      const safeName = variantName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
      const localPath = await saveImageToLocal(
        view.image,
        'scenes',
        `${safeName}_${Date.now()}.png`
      );
      const variantId = addScene({
        name: variantName,
        location: selectedScene.location,
        time: selectedScene.time || 'day',
        atmosphere: selectedScene.atmosphere || 'peaceful',
        visualPrompt: selectedScene.visualPrompt,
        referenceImage: localPath,
        styleId: selectedScene.styleId || styleId,
        folderId: selectedScene.folderId,
        projectId: selectedScene.projectId ?? resourceProjectId ?? undefined,
        tags: selectedScene.tags,
        parentSceneId: selectedScene.id,
        viewpointId: view.key,
        viewpointName: view.name,
        isViewpointVariant: true,
      } as any);
      
      // 同步归档到Thư viện phương tiện
      const orthoAiFolder = getOrCreateCategoryFolder('ai-image');
      addMediaFromUrl({
        url: localPath,
        name: `Cảnh-${variantName}`,
        type: 'image',
        source: 'ai-image',
        folderId: orthoAiFolder,
        projectId: selectedScene.projectId ?? resourceProjectId ?? undefined,
      });

      createdIds.push(variantId);
    }

    // Lưu4góc nhìnẢnh gốc到Cảnh cha
    updateScene(selectedScene.id, {
      orthographicImage,
    } as any);

    toast.success(`Đã tạo ${createdIds.length} Cảnh Góc nhìn trực giao`);
    
    // Xóa tất cảTrạng thái
    setOrthographicPrompt(null);
    setOrthographicPromptZh(null);
    setOrthographicImage(null);
    setOrthographicViews({ front: null, back: null, left: null, right: null });
  };

  /**
   * Hủy4góc nhìnthao tác
   */
  const handleCancelOrthographic = () => {
    setOrthographicPrompt(null);
    setOrthographicPromptZh(null);
    setOrthographicImage(null);
    setOrthographicViews({ front: null, back: null, left: null, right: null });
  };

  /**
   * Sao chép4góc nhìnprompt
   */
  const handleCopyOrthographicPrompt = (isEnglish: boolean) => {
    const prompt = isEnglish ? orthographicPrompt : orthographicPromptZh;
    if (!prompt) return;
    
    const stylePreset = getStyleById(styleId);
    const styleName = stylePreset?.name || styleId;
    
    const fullPrompt = isEnglish
      ? `=== Orthographic View Settings ===\nStyle: ${styleName}\nAspect Ratio: ${orthographicAspectRatio}\nGrid Layout: 2x2\n\n=== Prompt ===\n${prompt}`
      : `=== 4góc nhìnCài đặt ===\nPhong cách thị giác: ${styleName}\nTỷ lệ khung hình: ${orthographicAspectRatio}\nlướibố cục: 2x2\n\n=== prompt ===\n${prompt}`;
    
    navigator.clipboard.writeText(fullPrompt);
    toast.success(isEnglish ? "Đã Sao chép Prompt tiếng Anh" : "Đã Sao chép prompt tiếng Trung");
  };

  // ========== 4góc nhìn UI ==========
  if (orthographicPrompt) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-3 pb-2 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Box className="h-4 w-4" />
            <h3 className="font-medium text-sm">4 góc nhìn (góc nhìn trực giao)</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={handleCancelOrthographic}>
            Hủy
          </Button>
        </div>
        
        <ScrollArea className="flex-1 p-3">
          <div className="space-y-4">
            {/* Phong cách thị giác + Tỷ lệ khung hình */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label className="text-xs">Phong cách thị giác</Label>
                <StylePicker
                  value={styleId}
                  onChange={(id) => setStyleId(id)}
                  disabled={isGeneratingOrthographic}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Tỷ lệ khung hình</Label>
                <Select value={orthographicAspectRatio} onValueChange={(v) => setOrthographicAspectRatio(v as '16:9' | '9:16')} disabled={isGeneratingOrthographic}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="16:9">16:9 Ngang</SelectItem>
                    <SelectItem value="9:16">9:16 Dọc</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Giải thích Góc nhìn */}
            <div className="space-y-2">
              <Label className="text-xs">Góc nhìnbố cục (2x2)</Label>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <div className="p-2 rounded border bg-muted/50 text-center">
                  <span className="font-medium">chính diện</span>
                  <span className="text-muted-foreground block">Front View</span>
                </div>
                <div className="p-2 rounded border bg-muted/50 text-center">
                  <span className="font-medium">mặt sau</span>
                  <span className="text-muted-foreground block">Back View</span>
                </div>
                <div className="p-2 rounded border bg-muted/50 text-center">
                  <span className="font-medium">Bên trái</span>
                  <span className="text-muted-foreground block">Left Profile</span>
                </div>
                <div className="p-2 rounded border bg-muted/50 text-center">
                  <span className="font-medium">bên phải</span>
                  <span className="text-muted-foreground block">Right Profile</span>
                </div>
              </div>
            </div>

            {/* Xem trước Ảnh tham chiếu (Tự động lấy) */}
            {(() => {
              // 计算Ảnh tham chiếu：优先用「Toàn cảnh」conCảnh
              const referenceImages: { label: string; src: string }[] = [];
              
              // 1. 查找「Toàn cảnh」conCảnh（最高优先级）
              let overviewImage: string | null = null;
              if (selectedScene?.parentSceneId) {
                const { scenes } = useSceneStore.getState();
                // 查找同一Cảnh cha的Tất cảconCảnh，找 viewpointId='overview' 的那
                const overviewScene = scenes.find(s => 
                  s.parentSceneId === selectedScene.parentSceneId && 
                  (s as any).viewpointId === 'overview'
                );
                if (overviewScene?.referenceImage) {
                  overviewImage = overviewScene.referenceImage;
                } else if (overviewScene?.referenceImageBase64) {
                  overviewImage = overviewScene.referenceImageBase64;
                }
                // 如果找不到，尝试按TênKhớp
                if (!overviewImage) {
                  const overviewByName = scenes.find(s => 
                    s.parentSceneId === selectedScene.parentSceneId && 
                    (s.name?.includes('Toàn cảnh') || (s as any).viewpointName === 'Toàn cảnh')
                  );
                  if (overviewByName?.referenceImage) {
                    overviewImage = overviewByName.referenceImage;
                  }
                }
              }
              if (overviewImage) {
                referenceImages.push({ label: 'Toàn cảnhTham chiếu', src: overviewImage });
              }
              
              // 2. 当前conCảnhảnh
              if (selectedScene?.referenceImage && selectedScene.referenceImage !== overviewImage) {
                referenceImages.push({ label: 'Góc nhìn hiện tại', src: selectedScene.referenceImage });
              } else if (selectedScene?.referenceImageBase64 && selectedScene.referenceImageBase64 !== overviewImage) {
                referenceImages.push({ label: 'Góc nhìn hiện tại', src: selectedScene.referenceImageBase64 });
              }
              
              if (referenceImages.length === 0) return null;
              
              return (
                <div className="space-y-2">
                  <Label className="text-xs">Ảnh tham chiếu (Tự động lấy)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {referenceImages.map((ref, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="relative rounded overflow-hidden border bg-muted aspect-video">
                          <img 
                            src={ref.src} 
                            alt={ref.label}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1.5 py-0.5 text-center">
                            {ref.label}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    💡 Sử dụng Cảnh con「Toàn cảnh」làm Tham chiếu chính, đảm bảo Phong cách 4 góc nhìn nhất quán
                  </p>
                </div>
              );
            })()}

            {/* Tạonút */}
            {!orthographicImage && (
              <div className="space-y-2">
                <Button 
                  onClick={handleGenerateOrthographicImage} 
                  className="w-full"
                  disabled={isGeneratingOrthographic}
                >
                  {isGeneratingOrthographic ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Đang tạo... {orthographicProgress}%
                    </>
                  ) : (
                    <>
                      <Box className="h-4 w-4 mr-2" />
                      Tạo bốn góc nhìn
                    </>
                  )}
                </Button>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">hoặc</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUploadOrthographic}
                    className="hidden"
                    disabled={isGeneratingOrthographic}
                  />
                  <div className="flex items-center justify-center gap-2 p-2 border border-dashed rounded-lg cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors">
                    <Upload className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Tải lênhiện cóảnh</span>
                  </div>
                </label>
              </div>
            )}

            {/* prompt (Mặc định Mở rộng, có thể Chỉnh sửa, chỉ hiện một loại theo Ngôn ngữ ưa thích) */}
            <details className="group" open>
              <summary className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                <span className="group-open:rotate-90 transition-transform">▶</span>
                Prompt 4 góc nhìn (có thể Chỉnh sửa, sau khi sửa dùng Trực tiếp để Tạo)
              </summary>
              <div className="mt-2 space-y-2">
                {(() => {
                  const effectiveLang = promptLanguage || scriptProject?.promptLanguage || 'vi';
                  const isZh = effectiveLang === 'vi' || effectiveLang === 'vi+en';
                  const langLabel = isZh ? 'đang xử lý...: 'English';
                  const currentValue = isZh
                    ? (orthographicPromptZh || orthographicPrompt || '')
                    : (orthographicPrompt || orthographicPromptZh || '');
                  return (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Prompt Tạo ({langLabel}, sau khi sửa dùng Trực tiếp để Tạo)</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-2 text-xs"
                          onClick={() => handleCopyOrthographicPrompt(isZh ? false : true)}
                        >
                          <Copy className="h-3 w-3 mr-1" />Sao chép
                        </Button>
                      </div>
                      <Textarea
                        value={currentValue}
                        onChange={(e) => {
                          if (isZh) {
                            setOrthographicPromptZh(e.target.value);
                            // 同步更新实际发送的prompt
                            setOrthographicPrompt(e.target.value);
                          } else {
                            setOrthographicPrompt(e.target.value);
                          }
                        }}
                        className="min-h-[200px] text-xs resize-y"
                      />
                    </div>
                  );
                })()}
              </div>
            </details>

            {/* 4góc nhìnXem trước */}
            {orthographicImage && (
              <div className="space-y-2">
                <Label className="text-xs">4góc nhìnXem trước ({orthographicAspectRatio})</Label>
                <div className={`relative rounded-lg overflow-hidden border bg-muted ${orthographicAspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'}`}>
                  <img 
                    src={orthographicImage} 
                    alt="4góc nhìnXem trước"
                    className="w-full h-full object-contain"
                  />
                </div>
                <Button 
                  onClick={handleSplitOrthographic} 
                  className="w-full" 
                  disabled={isSplitting}
                >
                  {isSplitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      cắtđang xử lý...
                    </>
                  ) : (
                    <>
                      <Scissors className="h-4 w-4 mr-2" />
                      Cắt thành 4 Góc nhìn
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* cắtkết quảXem trước */}
            {(orthographicViews.front || orthographicViews.back || orthographicViews.left || orthographicViews.right) && (
              <div className="space-y-2">
                <Label className="text-xs">cắtkết quả</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'front', name: 'chính diện', image: orthographicViews.front },
                    { key: 'back', name: 'Mặt sau', image: orthographicViews.back },
                    { key: 'left', name: 'Bên trái', image: orthographicViews.left },
                    { key: 'right', name: 'bên phải', image: orthographicViews.right },
                  ].map((view) => (
                    <div key={view.key} className="space-y-1">
                      <div className={`relative rounded overflow-hidden border bg-muted ${orthographicAspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'}`}>
                        {view.image ? (
                          <img 
                            src={view.image} 
                            alt={view.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="text-[10px] text-center text-muted-foreground">
                        {view.name}
                      </div>
                    </div>
                  ))}
                </div>
                <Button onClick={handleSaveOrthographicViews} className="w-full">
                  <Check className="h-4 w-4 mr-2" />
                  Lưu ảnh Góc nhìn vào Cảnh
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-3 border-t">
          <p className="text-xs text-muted-foreground text-center">
            💡 4 góc nhìn có thể đảm bảo tính nhất quán không gian của Cảnh ở các vị trí camera khác nhau
          </p>
        </div>
      </div>
    );
  }

  // If showing contact sheet mode
  if (contactSheetPrompt) {
    const totalPages = pendingContactSheetPrompts.length;
    const hasMultiplePages = totalPages > 1;
    
    // 获取trang hiện tại的Góc nhìndữ liệu（带Phân cảnhsố thứ tự）
    const currentPageViewpointsWithIndexes = pendingViewpoints
      .filter(v => v.pageIndex === currentPageIndex)
      .sort((a, b) => a.gridIndex - b.gridIndex);
    
    return (
      <div className="h-full flex flex-col">
        <div className="p-3 pb-2 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-sm">Ảnh ghép đa Góc nhìn</h3>
            {hasMultiplePages && (
              <span className="text-xs text-muted-foreground">
                ({currentPageIndex + 1}/{totalPages})
              </span>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={handleCancelContactSheet}>
            Hủy
          </Button>
        </div>
        
        <ScrollArea className="flex-1 p-3">
          <div className="space-y-4">
            {/* Điều khiển phân trang */}
            {hasMultiplePages && (
              <div className="flex items-center justify-between p-2 rounded bg-muted/50">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentPageIndex === 0}
                  onClick={() => {
                    const newIndex = currentPageIndex - 1;
                    setCurrentPageIndex(newIndex);
                    const page = pendingContactSheetPrompts[newIndex];
                    setContactSheetPrompt(page.prompt);
                    setContactSheetPromptZh(page.promptZh);
                    setContactSheetImage(null);
                    setSplitViewpointImages({});
                  }}
                >
                  Trang trước
                </Button>
                <span className="text-xs">
                  ảnh ghép {currentPageIndex + 1} / {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentPageIndex >= totalPages - 1}
                  onClick={() => {
                    const newIndex = currentPageIndex + 1;
                    setCurrentPageIndex(newIndex);
                    const page = pendingContactSheetPrompts[newIndex];
                    setContactSheetPrompt(page.prompt);
                    setContactSheetPromptZh(page.promptZh);
                    setContactSheetImage(null);
                    setSplitViewpointImages({});
                  }}
                >
                  Trang sau
                </Button>
              </div>
            )}
            
            {/* Phong cách thị giác + Tỷ lệ khung hình + bố cụcChọn */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label className="text-xs">Phong cách thị giác</Label>
                  <StylePicker
                    value={styleId}
                    onChange={(id) => setStyleId(id)}
                    disabled={isGeneratingContactSheet}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Tỷ lệ khung hình</Label>
                  <Select value={contactSheetAspectRatio} onValueChange={(v) => setContactSheetAspectRatio(v as '16:9' | '9:16')} disabled={isGeneratingContactSheet}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="16:9">16:9 Ngang</SelectItem>
                      <SelectItem value="9:16">9:16 Dọc</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* bố cụcChọn */}
              <div className="space-y-2">
                <Label className="text-xs">lướibố cục</Label>
                <Select value={contactSheetLayout} onValueChange={(v) => handleContactSheetLayoutChange(v as ContactSheetLayout)} disabled={isGeneratingContactSheet}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2x2">2×2 (4 ô)</SelectItem>
                    <SelectItem value="3x3">3×3 (9 ô)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  {(() => {
                    const dims = getLayoutDimensions(contactSheetLayout, contactSheetAspectRatio);
                    return `${dims.rows} hàng × ${dims.cols} cột = ${dims.rows * dims.cols} ô`;
                  })()}
                </p>
              </div>
            </div>
            
            {/* Danh sách góc nhìn (hiện số thứ tự Phân cảnh liên quan) */}
            <div className="space-y-2">
              <Label className="text-xs">
                trang hiện tạiGóc nhìn ({currentPageViewpointsWithIndexes.length > 0 ? currentPageViewpointsWithIndexes.length : extractedViewpoints.length})
              </Label>
              <div className="space-y-1.5">
                {(currentPageViewpointsWithIndexes.length > 0 ? currentPageViewpointsWithIndexes : extractedViewpoints).map((vp, idx) => {
                  const vpWithIndexes = vp as PendingViewpointData;
                  const shotIndexes = vpWithIndexes.shotIndexes || [];
                  
                  return (
                    <div 
                      key={vp.id} 
                      className="flex items-center gap-2 p-2 rounded border bg-muted/50 text-xs"
                    >
                      <span className="w-6 h-6 rounded bg-primary/10 text-primary flex items-center justify-center font-medium shrink-0">
                        {('gridIndex' in vp ? vp.gridIndex : idx) + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{vp.name}</div>
                        <div className="text-muted-foreground truncate">
                          {vp.keyProps.join('、') || 'Mặc địnhGóc nhìn'}
                        </div>
                      </div>
                      {shotIndexes.length > 0 && (
                        <div className="text-muted-foreground text-right shrink-0">
                          <div className="text-[10px]">Phân cảnh</div>
                          <div>#{shotIndexes.map(i => String(i).padStart(2, '0')).join(',#')}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tạo ảnh ghép một lần (Tự động Tạo → cắt → Lưu) */}
            {!contactSheetImage && (
              <div className="space-y-2">
                <Button 
                  onClick={handleAutoGenerateContactSheet} 
                  className="w-full"
                  disabled={isGeneratingContactSheet}
                >
                  {isGeneratingContactSheet ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Đang tạo... {contactSheetProgress}%
                    </>
                  ) : (
                    <>
                      <Grid3X3 className="h-4 w-4 mr-2" />
                      Tạo ảnh ghép (Tự động cắt và Lưu)
                    </>
                  )}
                </Button>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">hoặc</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUploadContactSheet}
                    className="hidden"
                    disabled={isGeneratingContactSheet}
                  />
                  <div className="flex items-center justify-center gap-2 p-2 border border-dashed rounded-lg cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors">
                    <Upload className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Tải lênhiện cóảnh</span>
                  </div>
                </label>
              </div>
            )}

            {/* prompt (Mặc định Mở rộng, có thể Chỉnh sửa, chỉ hiện một loại theo Ngôn ngữ ưa thích) */}
            <details className="group" open>
              <summary className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                <span className="group-open:rotate-90 transition-transform">▶</span>
                Prompt ảnh ghép (có thể Chỉnh sửa, sau khi sửa dùng Trực tiếp để Tạo)
              </summary>
              <div className="mt-2 space-y-2">
                {(() => {
                  const effectiveLang = promptLanguage || scriptProject?.promptLanguage || 'vi';
                  const isZh = effectiveLang === 'vi' || effectiveLang === 'vi+en';
                  const langLabel = isZh ? 'đang xử lý...: 'English';
                  const currentValue = isZh
                    ? (contactSheetPromptZh || contactSheetPrompt || '')
                    : (contactSheetPrompt || contactSheetPromptZh || '');
                  return (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Prompt Tạo ({langLabel}, sau khi sửa dùng Trực tiếp để Tạo)</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-2 text-xs"
                          onClick={() => handleCopyPrompt(isZh ? false : true)}
                        >
                          <Copy className="h-3 w-3 mr-1" />Sao chép
                        </Button>
                      </div>
                      <Textarea
                        value={currentValue}
                        onChange={(e) => {
                          if (isZh) {
                            setContactSheetPromptZh(e.target.value);
                            // 同步更新实际发送的prompt
                            setContactSheetPrompt(e.target.value);
                          } else {
                            setContactSheetPrompt(e.target.value);
                          }
                        }}
                        className="min-h-[200px] text-xs resize-y"
                      />
                    </div>
                  );
                })()}
              </div>
            </details>

            {/* ảnh ghépXem trước */}
            {contactSheetImage && (
              <div className="space-y-2">
                <Label className="text-xs">ảnh ghépXem trước</Label>
                <div className="relative rounded-lg overflow-hidden border bg-muted">
                  <img 
                    src={contactSheetImage} 
                    alt="ảnh ghépXem trước"
                    className="w-full h-auto"
                  />
                </div>
                <Button 
                  onClick={handleSplitContactSheet} 
                  className="w-full" 
                  disabled={isSplitting}
                >
                  {isSplitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      cắtđang xử lý...
                    </>
                  ) : (
                    <>
                      <Scissors className="h-4 w-4 mr-2" />
                      Cắt thành {(() => {
                        const currentPageVps = pendingViewpoints.filter(v => v.pageIndex === currentPageIndex);
                        return currentPageVps.length > 0 ? currentPageVps.length : extractedViewpoints.length || 6;
                      })()} Góc nhìn
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* cắtkết quảXem trước */}
            {Object.keys(splitViewpointImages).length > 0 && (() => {
              // 优先Sử dụng pendingViewpoints，否则用 extractedViewpoints
              const currentPageVps = pendingViewpoints.filter(v => v.pageIndex === currentPageIndex);
              const viewpointsToDisplay = currentPageVps.length > 0 ? currentPageVps : extractedViewpoints;
              
              // 根据Tỷ lệ khung hình决定cắtkết quả的HiệnTỷ lệ
              const aspectClass = contactSheetAspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-video';
              // 9:16 Dọc时用 2  cột，16:9 Ngang时用 3  cột
              const gridCols = contactSheetAspectRatio === '9:16' ? 'grid-cols-2' : 'grid-cols-3';
              
              return (
                <div className="space-y-2">
                  <Label className="text-xs">cắtkết quả ({contactSheetAspectRatio})</Label>
                  <div className={`grid ${gridCols} gap-2`}>
                    {viewpointsToDisplay.map((vp) => {
                      const imgData = splitViewpointImages[vp.id];
                      return (
                        <div key={vp.id} className="space-y-1">
                          <div className={`relative ${aspectClass} rounded overflow-hidden border bg-muted`}>
                            {imgData ? (
                              <img 
                                src={imgData.imageUrl} 
                                alt={vp.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div className="text-[10px] text-center text-muted-foreground truncate">
                            {vp.name}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Button onClick={handleSaveViewpointImages} className="w-full">
                    <Check className="h-4 w-4 mr-2" />
                    Lưu ảnh Góc nhìn vào Cảnh
                  </Button>
                </div>
              );
            })()}
          </div>
        </ScrollArea>

        <div className="p-3 border-t">
          <p className="text-xs text-muted-foreground text-center">
            💡 Nhấp「Tạo ảnh ghép」để Tự động hoàn thành cắt và Lưu, có thể liên tục khởi động nhiều nhiệm vụ
          </p>
        </div>
      </div>
    );
  }

  // If showing preview
  if (previewUrl) {
    return (
      <div className="h-full flex flex-col p-3">
        <h3 className="font-medium text-sm mb-3">Xem trước ảnh khái niệm Cảnh</h3>
        <ScrollArea className="flex-1">
          <div className="space-y-4">
            <div className="relative rounded-lg overflow-hidden border-2 border-amber-500/50 bg-muted">
              <img 
                src={previewUrl} 
                alt="Cảnhảnh khái niệmXem trước"
                className="w-full h-auto"
              />
              <div className="absolute top-2 left-2 bg-amber-500 text-white text-xs px-2 py-1 rounded">
                Xem trước
              </div>
            </div>
            <Button onClick={handleSavePreview} className="w-full">
              <Check className="h-4 w-4 mr-2" />
              Lưuảnh khái niệm
            </Button>
            <Button onClick={handleGenerate} variant="outline" className="w-full" disabled={isGenerating}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Tạo lại
            </Button>
            <Button onClick={handleDiscardPreview} variant="ghost" className="w-full text-muted-foreground" size="sm">
              Bỏ và Quay lại
            </Button>
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 pb-2 border-b space-y-2">
        <h3 className="font-medium text-sm">Bảng điều khiển tạo</h3>
        {/* TạoChuyển chế độ */}
        <ToggleGroup 
          type="single" 
          value={generationMode} 
          onValueChange={(v) => v && setGenerationMode(v as GenerationMode)}
          className="justify-start"
        >
          <ToggleGroupItem value="single" aria-label="Đơn ảnh" className="text-xs px-2.5 h-7 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            <ImageIcon className="h-3 w-3 mr-1" />
            Đơn ảnh
          </ToggleGroupItem>
          <ToggleGroupItem value="contact-sheet" aria-label="ảnh ghép" className="text-xs px-2.5 h-7 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            <Grid3X3 className="h-3 w-3 mr-1" />
            ảnh ghép
          </ToggleGroupItem>
          <ToggleGroupItem value="orthographic" aria-label="4góc nhìn" className="text-xs px-2.5 h-7 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            <Box className="h-3 w-3 mr-1" />
            4góc nhìn
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-4">
          {/* Scene name */}
          <div className="space-y-2">
            <Label className="text-xs">Tên cảnh</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: đường phố thành phố, túp lều rừng"
              disabled={isGenerating}
            />
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label className="text-xs">Địa điểmMô tả</Label>
            <Textarea
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Mô tả chi tiết môi trường Cảnh, ví dụ: ngã tư Shibuya sôi động ở Tokyo, đèn neon nhấp nháy..."
              className="min-h-[100px] text-sm resize-none"
              disabled={isGenerating}
            />
          </div>

          {/* Time and Atmosphere */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label className="text-xs">Thời gian</Label>
              <Select value={time} onValueChange={setTime} disabled={isGenerating}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_PRESETS.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Bầu không khí</Label>
              <Select value={atmosphere} onValueChange={setAtmosphere} disabled={isGenerating}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn" />
                </SelectTrigger>
                <SelectContent>
                  {ATMOSPHERE_PRESETS.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Style */}
          <div className="space-y-2">
            <Label className="text-xs">Phong cách thị giác</Label>
            <StylePicker
              value={styleId}
              onChange={(id) => setStyleId(id)}
              disabled={isGenerating}
            />
          </div>

          {/* Reference images */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Ảnh tham chiếu</Label>
              <span className="text-xs text-muted-foreground">{referenceImages.length}/3</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {referenceImages.map((img, i) => (
                <div key={i} className="relative group">
                  <img
                    src={img}
                    alt={`Ảnh tham chiếu ${i + 1}`}
                    className="w-14 h-14 object-cover rounded-md border"
                  />
                  <button
                    type="button"
                    onClick={() => removeRefImage(i)}
                    className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {referenceImages.length < 3 && (
                <>
                  <input
                    id="scene-gen-ref-image"
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleRefImageChange}
                  />
                  <div
                    className="w-14 h-14 border-2 border-dashed rounded-md flex flex-col items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/50 transition-colors gap-1 cursor-pointer"
                    onClick={() => document.getElementById('scene-gen-ref-image')?.click()}
                  >
                    <ImagePlus className="h-4 w-4" />
                    <span className="text-[10px]">Tải lên</span>
                  </div>
                </>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              AI sẽ Tham chiếu những ảnh này để Tạo ảnh khái niệm Cảnh
            </p>
          </div>
        </div>
      </ScrollArea>

      {/* Action buttons */}
      <div className="p-3 border-t space-y-2">
        {/* Nút 4 góc nhìn hàng loạt (hiện sau khi Lưu ảnh ghép Góc nhìn) */}
        {savedChildSceneIds.length > 0 && (
          <div className="p-3 rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 space-y-2">
            <div className="text-xs text-center">
              <span className="font-medium">đã lưu {savedChildSceneIds.length} conCảnh</span>
              <p className="text-muted-foreground">Có thể Tạo ảnh 4 góc nhìn cho mỗi Cảnh con (tổng {savedChildSceneIds.length * 4} ảnh)</p>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handleBatchGenerateOrthographic} 
                className="flex-1"
                size="sm"
              >
                <Box className="h-3 w-3 mr-1" />
                Tạo hàng loạt4góc nhìn
              </Button>
              <Button 
                onClick={handleClearBatchOrthographic} 
                variant="ghost"
                size="sm"
              >
                Bỏ qua
              </Button>
            </div>
          </div>
        )}
        
        {/* Đơn ảnhchế độ */}
        {generationMode === 'single' && (
          !selectedScene ? (
            <Button onClick={handleCreateScene} className="w-full" disabled={!name.trim() || !location.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              TạoCảnh
            </Button>
          ) : (
            <Button 
              onClick={handleGenerate} 
              className="w-full"
              disabled={isGenerating || !location.trim()}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Đang tạo...
                </>
              ) : (
                <>
                  <MapPin className="h-4 w-4 mr-2" />
                  {selectedScene.referenceImage ? 'Tạo lạiảnh khái niệm' : 'TạoCảnhảnh khái niệm'}
                </>
              )}
            </Button>
          )
        )}
        
        {/* Chế độ ảnh ghép - dù Cảnh có được chọn hay không đều hiện Tùy chọn Tải lên */}
        {generationMode === 'contact-sheet' && (
          <div className="space-y-2">
            {/* Bộ chọn bố cục */}
            <div className="flex items-center gap-2">
              <Label className="text-xs shrink-0">lướibố cục</Label>
              <Select value={contactSheetLayout} onValueChange={(v) => setContactSheetLayout(v as ContactSheetLayout)} disabled={isGenerating}>
                <SelectTrigger className="h-8 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2x2">2×2 (4 ô)</SelectItem>
                  <SelectItem value="3x3">3×3 (9 ô)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {selectedScene ? (
              <Button 
                onClick={handleGenerateContactSheetPrompt} 
                className="w-full"
                disabled={isGenerating}
              >
                <Grid3X3 className="h-4 w-4 mr-2" />
                Tạo ảnh ghép đa Góc nhìn
              </Button>
            ) : (
              <Button onClick={handleCreateScene} className="w-full" disabled={!name.trim() || !location.trim()}>
                <Plus className="h-4 w-4 mr-2" />
                TạoCảnh
              </Button>
            )}
            {/* hoặcTrực tiếpTải lên */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">hoặc</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <label className="block">
              <input
                type="file"
                accept="image/*"
                onChange={handleDirectUploadContactSheet}
                className="hidden"
                disabled={isGenerating}
              />
              <div className="flex items-center justify-center gap-2 p-2 border border-dashed rounded-lg cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors">
                <Upload className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Trực tiếpTải lênảnh ghépcắt</span>
              </div>
            </label>
          </div>
        )}
        
        {/* 4góc nhìnchế độ */}
        {generationMode === 'orthographic' && (
          !selectedScene ? (
            <Button onClick={handleCreateScene} className="w-full" disabled={!name.trim() || !location.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              TạoCảnh
            </Button>
          ) : (
            <Button 
              onClick={handleGenerateOrthographicPrompt} 
              className="w-full"
              disabled={isGenerating}
            >
              <Box className="h-4 w-4 mr-2" />
              Tạo bốn góc nhìn
            </Button>
          )
        )}
        <p className="text-xs text-muted-foreground text-center">
          {generationMode === 'single' && '💡 Chế độ Đơn ảnh: Tạo ảnh khái niệm Cảnh từ một Góc nhìn'}
          {generationMode === 'contact-sheet' && '💡 Chế độ ảnh ghép: Tạo lưới 2x3 đa Góc nhìn cho Cảnh'}
          {generationMode === 'orthographic' && '💡 Chế độ 4 góc nhìn: Tạo Góc nhìn trực giao trước/sau/trái/phải'}
        </p>
      </div>
    </div>
  );
}

// Helper functions
function buildScenePrompt(
  scene: Partial<Scene> & { styleId?: string },
  actionDescriptions?: string[]
): string {
  const stylePreset = scene.styleId ? getStyleById(scene.styleId) : null;
  const styleTokens = stylePreset?.prompt || 'anime style';

  const timePreset = TIME_PRESETS.find(t => t.id === scene.time);
  const timePrompt = timePreset?.prompt || 'daytime';

  const atmospherePreset = ATMOSPHERE_PRESETS.find(a => a.id === scene.atmosphere);
  const atmospherePrompt = atmospherePreset?.prompt || '';

  // 从Phân cảnhHành động描写đang xử lý...ạo cụ quan trọng
  let propsPrompt = '';
  if (actionDescriptions && actionDescriptions.length > 0) {
    // 合并Tất cảHành động描写，提取quan trọng元素
    const allActions = actionDescriptions.join(' ');
    const extractedProps = extractPropsFromActions(allActions);
    if (extractedProps.length > 0) {
      propsPrompt = `, with ${extractedProps.join(', ')}`;
      console.log('[buildScenePrompt] Đạo cụ đã trích xuất:', extractedProps);
    }
  }

  return `${scene.location}${propsPrompt}, ${timePrompt}, ${atmospherePrompt}, ${styleTokens}, detailed background, environment concept art, establishing shot, cinematic composition, no characters`;
}

/**
 * 从Hành động描写đang xử lý...ạo cụ quan trọng
 */
function extractPropsFromActions(actions: string): string[] {
  const props: string[] = [];
  
  // 常见Đạo cụquan trọng词ánh xạ（đang xử lý...> 英文）
  const propMappings: Record<string, string> = {
    // 家具/用具
    'bàn ăn': 'dining table',
    'bàn ăn dài': 'dining table',
    'bát đũa': 'bowls and chopsticks',
    'món ăn': 'dishes of food',
    'ăn cơm': 'dining table with food',
    'ghế sofa': 'sofa',
    'bàn trà': 'coffee table',
    'tivi': 'television',
    'tủ tivi': 'TV cabinet',
    'bàn học': 'desk',
    'giá sách': 'bookshelf',
    'giường': 'bed',
    'tủ quần áo': 'wardrobe',
    'cửa sổ': 'window',
    '': 'window',
    'cửa': 'door',
    // vật phẩm
    'bằng tốt nghiệp': 'graduation certificate',
    'chứng chỉ': 'certificate',
    'ảnh chụp': 'photo frame',
    'ảnh gia đình': 'family photo',
    'điện thoại': 'smartphone',
    'máy tính': 'computer',
    'file': 'documents',
    'thư': 'letter',
    // 植物
    'hoa dành dành': 'gardenia flowers',
    'hoa': 'flowers',
    'cây cảnh': 'potted plant',
    'cây xanh': 'green plants',
    // 食物
    'rượu': 'wine/alcohol',
    'ly rượu': 'wine glasses',
    'cà phê': 'coffee',
    'trà': 'tea',
    // Cảnh元素
    'ban công': 'balcony',
    'bên ngoài': 'view outside window',
    'đèn': 'lamp',
    'đèn bàn': 'table lamp',
    'quạt điện': 'electric fan',
    'điều hòa': 'air conditioner',
  };
  
  // kiểm tra每quan trọng词是否出现在Hành động描写中
  for (const [chinese, english] of Object.entries(propMappings)) {
    if (actions.includes(chinese) && !props.includes(english)) {
      props.push(english);
    }
  }
  
  return props.slice(0, 8); // tối đaQuay lại 8 Đạo cụ
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// Note: generateSceneImage is now imported from @/lib/ai/image-generator
