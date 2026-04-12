// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Generation Panel - Left column
 * Character generation controls: style, views, description, reference images
 */

import { useState, useEffect } from "react";
import { useCharacterLibraryStore, type Character } from "@/stores/character-library-store";
import { useProjectStore } from "@/stores/project-store";
import type { CharacterIdentityAnchors, CharacterNegativePrompt, PromptLanguage } from "@/types/script";
import { useActiveScriptProject } from "@/stores/script-store";
import { useMediaPanelStore } from "@/stores/media-panel-store";
import { useMediaStore } from "@/stores/media-store";
import { generateCharacterImage as generateCharacterImageAPI } from "@/lib/ai/image-generator";
import { saveImageToLocal } from "@/lib/image-storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  ImagePlus,
  X,
  Shuffle,
  FileImage,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { StylePicker } from "@/components/ui/style-picker";
import { getStyleById, getStylePrompt, type VisualStyleId, DEFAULT_STYLE_ID } from "@/lib/constants/visual-styles";

// Gender presets
const GENDER_PRESETS = [
  { id: "male", label: "Nam" },
  { id: "female", label: "Nữ" },
  { id: "other", label: "Khác" },
] as const;

// Age presets
const AGE_PRESETS = [
  { id: "child", label: "Trẻ em", range: "5-12 tuổi" },
  { id: "teen", label: "Thanh thiếu niên", range: "13-18 tuổi" },
  { id: "young-adult", label: "Thanh niên", range: "19-30 tuổi" },
  { id: "adult", label: "Trung niên", range: "31-50 tuổi" },
  { id: "senior", label: "Cao niên", range: "Trên 50 tuổi" },
] as const;

// Sheet elements
const SHEET_ELEMENTS = [
  { id: 'three-view', label: 'Ba góc nhìn', prompt: 'front view, side view, back view, turnaround', default: true },
  { id: 'expressions', label: 'Biểu cảm', prompt: 'expression sheet, multiple facial expressions, happy, sad, angry, surprised', default: true },
  { id: 'proportions', label: 'Tỷ lệ cơ thể', prompt: 'height chart, body proportions, head-to-body ratio reference', default: false },
  { id: 'poses', label: 'Tư thế hành động', prompt: 'pose sheet, various action poses, standing, sitting, running', default: false },
] as const;

type SheetElementId = typeof SHEET_ELEMENTS[number]['id'];

interface GenerationPanelProps {
  selectedCharacter: Character | null;
  onCharacterCreated?: (id: string) => void;
}

export function GenerationPanel({ selectedCharacter, onCharacterCreated }: GenerationPanelProps) {
  const { 
    addCharacter, 
    updateCharacter,
    addCharacterView,
    selectCharacter,
    generationStatus,
    generatingCharacterId,
    setGenerationStatus,
    setGeneratingCharacter,
    currentFolderId,
  } = useCharacterLibraryStore();
  const { activeProjectId } = useProjectStore();
  const scriptProject = useActiveScriptProject();
  
  const { pendingCharacterData, setPendingCharacterData } = useMediaPanelStore();
  const { addMediaFromUrl, getOrCreateCategoryFolder } = useMediaStore();
  
  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [gender, setGender] = useState<string>("");
  const [age, setAge] = useState<string>("");
  const [personality, setPersonality] = useState("");
  // Extended character fields (from script panel)
  const [role, setRole] = useState("");
  const [traits, setTraits] = useState("");
  const [skills, setSkills] = useState("");
  const [keyActions, setKeyActions] = useState("");
  const [appearance, setAppearance] = useState("");
  const [relationships, setRelationships] = useState(""); // mối quan hệ nhân vật
  const [tags, setTags] = useState<string[]>([]);  // Thẻ nhân vật
  const [notes, setNotes] = useState("");           // Ghi chú nhân vật
  // === 专业Nhân vậtThiết kếtrường（世界级大师Tạo）===
  const [visualPromptEn, setVisualPromptEn] = useState(""); // Prompt thị giác tiếng Anh
  const [visualPromptZh, setVisualPromptZh] = useState(""); // đang xử lý...ompt thị giác
  // === 6层身份neo ===
  const [identityAnchors, setIdentityAnchors] = useState<CharacterIdentityAnchors | undefined>();
  const [charNegativePrompt, setCharNegativePrompt] = useState<CharacterNegativePrompt | undefined>();
  // === promptNgôn ngữ偏好 ===
  const [promptLanguage, setPromptLanguage] = useState<PromptLanguage>('vi');
  // === 年代信息（从Kịch bản元数据传递）===
  const [storyYear, setStoryYear] = useState<number | undefined>();
  const [era, setEra] = useState<string | undefined>();
  // ===  tập作用域（从 pending 数据透传）===
  const [sourceEpisodeId, setSourceEpisodeId] = useState<string | undefined>();
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [styleId, setStyleId] = useState<string>(DEFAULT_STYLE_ID);
  const [selectedElements, setSelectedElements] = useState<SheetElementId[]>(
    SHEET_ELEMENTS.filter(e => e.default).map(e => e.id)
  );
  
  // Preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewCharacterId, setPreviewCharacterId] = useState<string | null>(null);
  
  // Khu vực thu gọn thông tin Hiệu chuẩn AITrạng thái：有数据时Mặc địnhMở rộng
  const [calibrationExpanded, setCalibrationExpanded] = useState(true);
  const [isManuallyModified, setIsManuallyModified] = useState(false);

  const isGenerating = generationStatus === 'generating';
  
  // 检查是否有 AI Hiệu chuẩn数据
  const hasCalibrationData = !!(identityAnchors || charNegativePrompt || visualPromptEn || visualPromptZh);

  // 注意：thanh trái始终用于Tạo mớiNhân vật，不响应đang xử lý...ư viện nhân vật的Chọn
  // thanh phải用于查看/Chỉnh sửa已有Nhân vật的详情

  // Handle pending data from script panel
  useEffect(() => {
    if (pendingCharacterData) {
      setName(pendingCharacterData.name || "");
      
      // 映射Giới tính："Nam" -> "male", "Nữ" -> "female"
      const genderMap: Record<string, string> = {
        'Nam': 'male', 'Nam': 'male', 'male': 'male', 'Male': 'male',
        'Nữ': 'female', 'Nữ': 'female', 'female': 'female', 'Female': 'female',
      };
      const mappedGender = genderMap[pendingCharacterData.gender || ''] || '';
      setGender(mappedGender);
      
      // 映射年龄：根据数字范围Tự độngChọn年龄段
      const ageStr = pendingCharacterData.age || '';
      let mappedAge = '';
      if (ageStr.includes('5') && ageStr.includes('12') || ageStr.includes('Trẻ em')) {
        mappedAge = 'child';
      } else if (ageStr.includes('13') || ageStr.includes('18') || ageStr.includes('Thanh thiếu niên')) {
        mappedAge = 'teen';
      } else if (ageStr.includes('19') || ageStr.includes('20') || ageStr.includes('25') || ageStr.includes('30') || ageStr.includes('青年')) {
        mappedAge = 'young-adult';
      } else if (ageStr.includes('35') || ageStr.includes('40') || ageStr.includes('45') || ageStr.includes('50') || ageStr.includes('đang xử lý...) {
        mappedAge = 'adult';
      } else if (ageStr.includes('55') || ageStr.includes('60') || ageStr.includes('70') || ageStr.includes('Cao niên')) {
        mappedAge = 'senior';
      } else if (ageStr.match(/\d+.*\d+/)) {
        // 跨年龄段如 "25-50 tuổi"，Chọn中年
        mappedAge = 'adult';
      }
      setAge(mappedAge);
      
      setPersonality(pendingCharacterData.personality || "");
      
      // Store extended fields independently
      setRole(pendingCharacterData.role || "");
      setTraits(pendingCharacterData.traits || "");
      setSkills(pendingCharacterData.skills || "");
      setKeyActions(pendingCharacterData.keyActions || "");
      setAppearance(pendingCharacterData.appearance || "");
      setRelationships(pendingCharacterData.relationships || "");
      
      // Also build description for display/generation prompt
      const descParts: string[] = [];
      if (pendingCharacterData.role) descParts.push(`【Thân phận/bối cảnh】\n${pendingCharacterData.role}`);
      if (pendingCharacterData.traits) descParts.push(`【Đặc trưng cốt lõi】\n${pendingCharacterData.traits}`);
      if (pendingCharacterData.skills) descParts.push(`【Kỹ năng/năng lực】\n${pendingCharacterData.skills}`);
      if (pendingCharacterData.keyActions) descParts.push(`【Sự kiện quan trọng】\n${pendingCharacterData.keyActions}`);
      if (pendingCharacterData.appearance) descParts.push(`【Đặc điểm ngoại hình】\n${pendingCharacterData.appearance}`);
      if (pendingCharacterData.relationships) descParts.push(`【mối quan hệ nhân vật】\n${pendingCharacterData.relationships}`);
      if (descParts.length > 0) {
        setDescription(descParts.join("\n\n"));
      }

      // 处理Thẻ和Ghi chú
      if (pendingCharacterData.tags) {
        setTags(pendingCharacterData.tags);
      }
      if (pendingCharacterData.notes) {
        setNotes(pendingCharacterData.notes);
      }
      
      // === 处理promptNgôn ngữ偏好 ===
      if (pendingCharacterData.promptLanguage) {
        setPromptLanguage(pendingCharacterData.promptLanguage);
      }
      // === 处理专业Prompt thị giác（世界级大师Tạo）===
      if (pendingCharacterData.visualPromptEn) {
        setVisualPromptEn(pendingCharacterData.visualPromptEn);
      }
      if (pendingCharacterData.visualPromptZh) {
        setVisualPromptZh(pendingCharacterData.visualPromptZh);
      }
      
      // === 处理6层身份neo ===
      if (pendingCharacterData.identityAnchors) {
        setIdentityAnchors(pendingCharacterData.identityAnchors);
      }
      if (pendingCharacterData.negativePrompt) {
        setCharNegativePrompt(pendingCharacterData.negativePrompt);
      }
      
      // === 处理年代信息 ===
      if (pendingCharacterData.storyYear) {
        setStoryYear(pendingCharacterData.storyYear);
      }
      if (pendingCharacterData.era) {
        setEra(pendingCharacterData.era);
      }
      // ===  tập作用域透传 ===
      setSourceEpisodeId(pendingCharacterData.sourceEpisodeId);

      if (pendingCharacterData.styleId) {
        const validStyle = getStyleById(pendingCharacterData.styleId);
        if (validStyle) {
          setStyleId(validStyle.id);
        }
      }
      
      // TODO: 处理多阶段Nhân vậtbiến thể
      // 如果有 stageInfo 或 consistencyElements，应该：
      // 1. 在Mô tả nhân vậtđang xử lý... ý用户这是多阶段Nhân vật
      // 2. TạoNhân vật后Tự động为其Thêm variations
      // 注：这部分逻辑应该在 handleCreateAndGenerate 后执 hàng

      setPendingCharacterData(null);
    }
  }, [pendingCharacterData, setPendingCharacterData]);

  const toggleElement = (elementId: SheetElementId) => {
    setSelectedElements(prev => 
      prev.includes(elementId) 
        ? prev.filter(e => e !== elementId)
        : [...prev, elementId]
    );
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const removeImage = (index: number) => {
    setReferenceImages(referenceImages.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setGender("");
    setAge("");
    setPersonality("");
    setRole("");
    setTraits("");
    setSkills("");
    setKeyActions("");
    setAppearance("");
    setRelationships("");
    setTags([]);
    setNotes("");
    // === Đặt lại专业Prompt thị giác ===
    setVisualPromptEn("");
    setVisualPromptZh("");
    // === Đặt lại6层身份neo ===
    setIdentityAnchors(undefined);
    setCharNegativePrompt(undefined);
    // === Đặt lại年代信息 ===
    setStoryYear(undefined);
    setEra(undefined);
    // === Đặt lại tập作用域 ===
    setSourceEpisodeId(undefined);
    setReferenceImages([]);
    setStyleId(DEFAULT_STYLE_ID);
    setSelectedElements(SHEET_ELEMENTS.filter(e => e.default).map(e => e.id));
    setPreviewUrl(null);
    setPreviewCharacterId(null);
    // === Đặt lại AI Hiệu chuẩnTrạng thái ===
    setCalibrationExpanded(false);
    setIsManuallyModified(false);
  };

  // Tạo新Nhân vật并Tạo ảnh（始终Tạo mới，不会覆盖已有Nhân vật）
  const handleCreateAndGenerate = async () => {
    if (!name.trim()) {
      toast.error("NhậpTên nhân vật");
      return;
    }
    if (!description.trim()) {
      toast.error("Nhập mô tả nhân vật");
      return;
    }
    if (selectedElements.length === 0) {
      toast.error("请至少Chọn一TạoNội dung");
      return;
    }

    // 始终Tạo新Nhân vật
    const targetId = addCharacter({
      name: name.trim(),
      description: description.trim(),
      visualTraits: "",
      gender: gender || undefined,
      age: age || undefined,
      personality: personality.trim() || undefined,
      role: role.trim() || undefined,
      traits: traits.trim() || undefined,
      skills: skills.trim() || undefined,
      keyActions: keyActions.trim() || undefined,
      appearance: appearance.trim() || undefined,
      relationships: relationships.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
      notes: notes.trim() || undefined,
      referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      styleId: styleId === "random" ? undefined : styleId,
      views: [],
      folderId: currentFolderId,
      projectId: activeProjectId || undefined,
      // === 6层身份neo（Nhân vật一致性）===
      identityAnchors: identityAnchors,
      negativePrompt: charNegativePrompt,
      // ===  tập作用域 ===
      linkedEpisodeId: sourceEpisodeId,
    });
    selectCharacter(targetId);
    onCharacterCreated?.(targetId);

    // Bắt đầuTạo ảnh
    setGenerationStatus('generating');
    setGeneratingCharacter(targetId);

    try {
      // 构建prompt：根据Ngôn ngữ偏好Chọnprompt + 6层身份neo + Ảnh tham chiếu优先级逻辑 + 年代信息
      // 获取实时的Ngôn ngữ偏好（优先使用 pending 传来的，其次从 scriptProject 读取）
      const effectiveLang = promptLanguage || scriptProject?.promptLanguage || 'vi';
      const prompt = buildCharacterSheetPrompt(
        description, 
        name, 
        selectedElements, 
        styleId, 
        visualPromptEn,
        visualPromptZh,
        effectiveLang,
        identityAnchors,
        referenceImages.length > 0,  // Đơn giản hóa mô tả khi có Ảnh tham chiếu
        storyYear,
        era
      );
      const stylePreset = styleId && styleId !== 'random' 
        ? getStyleById(styleId) 
        : null;
      const isRealistic = stylePreset?.category === 'real';
      
      // 构建Prompt phủ định：合并Nhân vật特定的Prompt phủ định
      let negativePrompt = isRealistic
        ? 'blurry, low quality, watermark, text, cropped, anime, cartoon, illustration'
        : 'blurry, low quality, watermark, text, cropped';
      
      // 如果有Nhân vật特定的Prompt phủ định，追加到后面
      if (charNegativePrompt) {
        const avoidList = charNegativePrompt.avoid || [];
        const styleExclusions = charNegativePrompt.styleExclusions || [];
        const charNegatives = [...avoidList, ...styleExclusions].join(', ');
        if (charNegatives) {
          negativePrompt = `${negativePrompt}, ${charNegatives}`;
        }
      }

      const result = await generateCharacterImageAPI({
        prompt,
        negativePrompt,
        aspectRatio: '1:1',
        referenceImages,
        styleId,
      });
      
      setPreviewUrl(result.imageUrl);
      setPreviewCharacterId(targetId);
      setGenerationStatus('completed');
      toast.success("Tạo ảnh hoàn tất, vui lòng Xem trước và Xác nhận");
    } catch (error) {
      const err = error as Error;
      setGenerationStatus('error', err.message);
      toast.error(`Tạo thất bại: ${err.message}`);
    } finally {
      setGeneratingCharacter(null);
    }
  };

  const handleSavePreview = async () => {
    if (!previewUrl || !previewCharacterId) return;

    toast.loading("Đang lưu ảnh vào máy...", { id: 'saving-preview' });
    
    try {
      // Save image to local storage
      const localPath = await saveImageToLocal(
        previewUrl, 
        'characters', 
        `${name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}.png`
      );

      // Save view with local path
      addCharacterView(previewCharacterId, {
        viewType: 'front',
        imageUrl: localPath,
      });

      const visualTraits = `${name} character, ${description.substring(0, 200)}`;
      updateCharacter(previewCharacterId, { visualTraits });

      // 同步归档到Thư viện phương tiện Ảnh AI Thư mục
      const aiFolderId = getOrCreateCategoryFolder('ai-image');
      addMediaFromUrl({
        url: localPath,
        name: `Nhân vật-${name || 'Chưa đặt tên'}`,
        type: 'image',
        source: 'ai-image',
        folderId: aiFolderId,
        projectId: activeProjectId || undefined,
      });

      setPreviewUrl(null);
      setPreviewCharacterId(null);
      toast.success("Ảnh thiết kế nhân vật đã được lưu!", { id: 'saving-preview' });
    } catch (error) {
      console.error('Failed to save preview:', error);
      toast.error("LưuThất bại", { id: 'saving-preview' });
    }
  };

  const handleDiscardPreview = () => {
    setPreviewUrl(null);
    setPreviewCharacterId(null);
  };

  // If showing preview
  if (previewUrl) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="p-3 pb-2 border-b shrink-0">
          <h3 className="font-medium text-sm">Xem trước ảnh thiết kế nhân vật</h3>
        </div>
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 space-y-4 pb-32">
            <div className="relative rounded-lg overflow-hidden border-2 border-amber-500/50 bg-muted">
              <img 
                src={previewUrl} 
                alt="Xem trước ảnh thiết kế nhân vật"
                className="w-full h-auto"
              />
              <div className="absolute top-2 left-2 bg-amber-500 text-white text-xs px-2 py-1 rounded">
                Xem trước
              </div>
            </div>
          </div>
        </ScrollArea>
        <div className="p-3 border-t space-y-2 shrink-0">
          <Button onClick={handleSavePreview} className="w-full">
            Lưu ảnh thiết kế
          </Button>
          <Button onClick={handleCreateAndGenerate} variant="outline" className="w-full" disabled={isGenerating}>
            Tạo lại
          </Button>
          <Button onClick={handleDiscardPreview} variant="ghost" className="w-full text-muted-foreground" size="sm">
            Bỏ và Quay lại
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-3 pb-2 border-b shrink-0">
        <h3 className="font-medium text-sm">Bảng điều khiển tạo</h3>
      </div>
      
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-3 space-y-4">
          {/* Character name */}
          <div className="space-y-2">
            <Label className="text-xs">Tên nhân vật</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: Tiểu Minh, Mèo máy"
              disabled={isGenerating}
            />
          </div>

          {/* Gender and Age */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label className="text-xs">Giới tính</Label>
              <Select value={gender} onValueChange={setGender} disabled={isGenerating}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn" />
                </SelectTrigger>
                <SelectContent>
                  {GENDER_PRESETS.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Độ tuổi</Label>
              <Select value={age} onValueChange={setAge} disabled={isGenerating}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn" />
                </SelectTrigger>
                <SelectContent>
                  {AGE_PRESETS.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Personality */}
          <div className="space-y-2">
            <Label className="text-xs">Đặc điểm tính cách</Label>
            <Input
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              placeholder="Vui vẻ, dũng cảm..."
              disabled={isGenerating}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-xs">Mô tả nhân vật</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả chi tiết ngoại hình nhân vật..."
              className="min-h-[80px] text-sm resize-none"
              disabled={isGenerating}
            />
          </div>

          {/* Khu vực thu gọn thông tin Hiệu chuẩn AI */}
          {hasCalibrationData && (
            <div className="border rounded-lg overflow-hidden">
              {/* Đầu khu vực thu gọn */}
              <button
                type="button"
                className="w-full flex items-center justify-between p-2 hover:bg-muted/50 transition-colors"
                onClick={() => setCalibrationExpanded(!calibrationExpanded)}
                disabled={isGenerating}
              >
                <div className="flex items-center gap-2">
                  {calibrationExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-xs font-medium">Thông tin Hiệu chuẩn AI</span>
                </div>
                <div className="flex items-center gap-1">
                  {isManuallyModified ? (
                    <>
                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                      <span className="text-[10px] text-amber-500">Đã sửa</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      <span className="text-[10px] text-green-500">Đã hiệu chuẩn</span>
                    </>
                  )}
                </div>
              </button>
              
              {/* 折叠区Nội dung */}
              {calibrationExpanded && (
                <div className="border-t p-2 space-y-3 bg-muted/20">
                  {/* 6层身份neo */}
                  {identityAnchors && (
                    <div className="space-y-2">
                      <Label className="text-[10px] text-muted-foreground">① 骨相层</Label>
                      <div className="grid grid-cols-3 gap-1">
                        <Input
                          value={identityAnchors.faceShape || ''}
                          onChange={(e) => {
                            setIdentityAnchors({ ...identityAnchors, faceShape: e.target.value || undefined });
                            setIsManuallyModified(true);
                          }}
                          placeholder="脸型"
                          className="h-7 text-[10px]"
                          disabled={isGenerating}
                        />
                        <Input
                          value={identityAnchors.jawline || ''}
                          onChange={(e) => {
                            setIdentityAnchors({ ...identityAnchors, jawline: e.target.value || undefined });
                            setIsManuallyModified(true);
                          }}
                          placeholder="下颂"
                          className="h-7 text-[10px]"
                          disabled={isGenerating}
                        />
                        <Input
                          value={identityAnchors.cheekbones || ''}
                          onChange={(e) => {
                            setIdentityAnchors({ ...identityAnchors, cheekbones: e.target.value || undefined });
                            setIsManuallyModified(true);
                          }}
                          placeholder="颚骨"
                          className="h-7 text-[10px]"
                          disabled={isGenerating}
                        />
                      </div>
                      
                      <Label className="text-[10px] text-muted-foreground">② 五官层</Label>
                      <div className="grid grid-cols-2 gap-1">
                        <Input
                          value={identityAnchors.eyeShape || ''}
                          onChange={(e) => {
                            setIdentityAnchors({ ...identityAnchors, eyeShape: e.target.value || undefined });
                            setIsManuallyModified(true);
                          }}
                          placeholder="眼型"
                          className="h-7 text-[10px]"
                          disabled={isGenerating}
                        />
                        <Input
                          value={identityAnchors.noseShape || ''}
                          onChange={(e) => {
                            setIdentityAnchors({ ...identityAnchors, noseShape: e.target.value || undefined });
                            setIsManuallyModified(true);
                          }}
                          placeholder="鼻型"
                          className="h-7 text-[10px]"
                          disabled={isGenerating}
                        />
                        <Input
                          value={identityAnchors.lipShape || ''}
                          onChange={(e) => {
                            setIdentityAnchors({ ...identityAnchors, lipShape: e.target.value || undefined });
                            setIsManuallyModified(true);
                          }}
                          placeholder="唇型"
                          className="h-7 text-[10px]"
                          disabled={isGenerating}
                        />
                        <Input
                          value={identityAnchors.eyeDetails || ''}
                          onChange={(e) => {
                            setIdentityAnchors({ ...identityAnchors, eyeDetails: e.target.value || undefined });
                            setIsManuallyModified(true);
                          }}
                          placeholder="眼部细节"
                          className="h-7 text-[10px]"
                          disabled={isGenerating}
                        />
                      </div>
                      
                      <Label className="text-[10px] text-muted-foreground">③ 辨识标记层（最强neo）</Label>
                      <Input
                        value={identityAnchors.uniqueMarks?.join(', ') || ''}
                        onChange={(e) => {
                          const marks = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                          setIdentityAnchors({ ...identityAnchors, uniqueMarks: marks.length > 0 ? marks : [] });
                          setIsManuallyModified(true);
                        }}
                        placeholder="特征标记，用逗号ngăn cách"
                        className="h-7 text-[10px]"
                        disabled={isGenerating}
                      />
                      
                      <Label className="text-[10px] text-muted-foreground">④ 色彩neo层（Hex色值）</Label>
                      <div className="grid grid-cols-4 gap-1">
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={identityAnchors.colorAnchors?.iris || '#000000'}
                            onChange={(e) => {
                              setIdentityAnchors({
                                ...identityAnchors,
                                colorAnchors: { ...identityAnchors.colorAnchors, iris: e.target.value }
                              });
                              setIsManuallyModified(true);
                            }}
                            className="w-6 h-6 rounded cursor-pointer"
                            disabled={isGenerating}
                          />
                          <span className="text-[9px] text-muted-foreground">瞳</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={identityAnchors.colorAnchors?.hair || '#000000'}
                            onChange={(e) => {
                              setIdentityAnchors({
                                ...identityAnchors,
                                colorAnchors: { ...identityAnchors.colorAnchors, hair: e.target.value }
                              });
                              setIsManuallyModified(true);
                            }}
                            className="w-6 h-6 rounded cursor-pointer"
                            disabled={isGenerating}
                          />
                          <span className="text-[9px] text-muted-foreground">发</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={identityAnchors.colorAnchors?.skin || '#000000'}
                            onChange={(e) => {
                              setIdentityAnchors({
                                ...identityAnchors,
                                colorAnchors: { ...identityAnchors.colorAnchors, skin: e.target.value }
                              });
                              setIsManuallyModified(true);
                            }}
                            className="w-6 h-6 rounded cursor-pointer"
                            disabled={isGenerating}
                          />
                          <span className="text-[9px] text-muted-foreground">肤</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={identityAnchors.colorAnchors?.lips || '#000000'}
                            onChange={(e) => {
                              setIdentityAnchors({
                                ...identityAnchors,
                                colorAnchors: { ...identityAnchors.colorAnchors, lips: e.target.value }
                              });
                              setIsManuallyModified(true);
                            }}
                            className="w-6 h-6 rounded cursor-pointer"
                            disabled={isGenerating}
                          />
                          <span className="text-[9px] text-muted-foreground">唇</span>
                        </div>
                      </div>
                      
                      <Label className="text-[10px] text-muted-foreground">⑤ 皮肤纹理层</Label>
                      <Input
                        value={identityAnchors.skinTexture || ''}
                        onChange={(e) => {
                          setIdentityAnchors({ ...identityAnchors, skinTexture: e.target.value || undefined });
                          setIsManuallyModified(true);
                        }}
                        placeholder="皮肤纹理Mô tả"
                        className="h-7 text-[10px]"
                        disabled={isGenerating}
                      />
                      
                      <Label className="text-[10px] text-muted-foreground">⑥ 发型neo层</Label>
                      <div className="grid grid-cols-2 gap-1">
                        <Input
                          value={identityAnchors.hairStyle || ''}
                          onChange={(e) => {
                            setIdentityAnchors({ ...identityAnchors, hairStyle: e.target.value || undefined });
                            setIsManuallyModified(true);
                          }}
                          placeholder="发型"
                          className="h-7 text-[10px]"
                          disabled={isGenerating}
                        />
                        <Input
                          value={identityAnchors.hairlineDetails || ''}
                          onChange={(e) => {
                            setIdentityAnchors({ ...identityAnchors, hairlineDetails: e.target.value || undefined });
                            setIsManuallyModified(true);
                          }}
                          placeholder="发际线细节"
                          className="h-7 text-[10px]"
                          disabled={isGenerating}
                        />
                      </div>
                    </div>
                  )}
                  
                  {/* Prompt phủ định */}
                  {charNegativePrompt && (
                    <div className="space-y-2 pt-2 border-t">
                      <Label className="text-[10px] text-muted-foreground">Prompt phủ định</Label>
                      <Input
                        value={charNegativePrompt.avoid?.join(', ') || ''}
                        onChange={(e) => {
                          const avoidList = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                          setCharNegativePrompt({ ...charNegativePrompt, avoid: avoidList });
                          setIsManuallyModified(true);
                        }}
                        placeholder="避免元素，用逗号ngăn cách"
                        className="h-7 text-[10px]"
                        disabled={isGenerating}
                      />
                      <Input
                        value={charNegativePrompt.styleExclusions?.join(', ') || ''}
                        onChange={(e) => {
                          const exclusions = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                          setCharNegativePrompt({ ...charNegativePrompt, styleExclusions: exclusions.length > 0 ? exclusions : undefined });
                          setIsManuallyModified(true);
                        }}
                        placeholder="Phong cách排除，用逗号ngăn cách"
                        className="h-7 text-[10px]"
                        disabled={isGenerating}
                      />
                    </div>
                  )}
                  
                  {/* 专业Prompt thị giác：根据Ngôn ngữ偏好只Hiển thị一种，Chỉnh sửa后Trực tiếp用于Tạo */}
                  {(() => {
                    const effectiveLang = promptLanguage || scriptProject?.promptLanguage || 'vi';
                    const showZh = effectiveLang === 'vi' || effectiveLang === 'vi+en';
                    const activePrompt = showZh ? visualPromptZh : visualPromptEn;
                    const setActivePrompt = showZh ? setVisualPromptZh : setVisualPromptEn;
                    const langLabel = showZh ? 'đang xử lý...: '英文';
                    if (!activePrompt) return null;
                    return (
                      <div className="space-y-2 pt-2 border-t">
                        <Label className="text-[10px] text-muted-foreground">
                          Prompt thị giác（{langLabel}，修改后Trực tiếp用于Tạo）
                        </Label>
                        <Textarea
                          value={activePrompt}
                          onChange={(e) => {
                            setActivePrompt(e.target.value);
                            setIsManuallyModified(true);
                          }}
                          placeholder={`${langLabel}prompt`}
                          className="min-h-[120px] text-xs resize-y"
                          disabled={isGenerating}
                        />
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

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
                    onClick={() => removeImage(i)}
                    className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {referenceImages.length < 3 && (
                <>
                  <input
                    id="gen-panel-ref-image"
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageChange}
                  />
                  <div
                    className="w-14 h-14 border-2 border-dashed rounded-md flex flex-col items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/50 transition-colors gap-1 cursor-pointer"
                    onClick={() => document.getElementById('gen-panel-ref-image')?.click()}
                  >
                    <ImagePlus className="h-4 w-4" />
                    <span className="text-[10px]">Tải lên</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Sheet elements */}
          <div className="space-y-2">
            <Label className="text-xs">TạoNội dung</Label>
            <div className="space-y-1.5">
              {SHEET_ELEMENTS.map((element) => (
                <div
                  key={element.id}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded border text-sm cursor-pointer transition-all",
                    "hover:border-foreground/20",
                    selectedElements.includes(element.id) && "border-primary bg-primary/5",
                    isGenerating && "opacity-50 cursor-not-allowed"
                  )}
                  onClick={() => !isGenerating && toggleElement(element.id)}
                >
                  <Checkbox
                    checked={selectedElements.includes(element.id)}
                    disabled={isGenerating}
                  />
                  <span>{element.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Action button - inside scroll area */}
          <div className="pt-2 pb-4 space-y-2">
            <Button 
              onClick={handleCreateAndGenerate} 
              className="w-full"
              disabled={isGenerating || !name.trim() || !description.trim() || selectedElements.length === 0}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Đang tạo...
                </>
              ) : (
                <>
                  <FileImage className="h-4 w-4 mr-2" />
                  Tạoảnh thiết kế
                </>
              )}
            </Button>
            
            {/* Sao chépNhân vật数据nút */}
            <Button 
              variant="outline"
              onClick={() => {
                // 构建Nhân vật数据文本
                const lines: string[] = [];
                
                // 基本信息
                lines.push(`Tên nhân vật: ${name || '(未填写)'}`);
                const genderLabel = GENDER_PRESETS.find(g => g.id === gender)?.label;
                if (genderLabel) lines.push(`Giới tính: ${genderLabel}`);
                const ageLabel = AGE_PRESETS.find(a => a.id === age)?.label;
                if (ageLabel) lines.push(`年龄段: ${ageLabel}`);
                if (personality) lines.push(`Đặc điểm tính cách: ${personality}`);
                
                // Mô tả nhân vật
                if (description) {
                  lines.push('');
                  lines.push(`Mô tả nhân vật:`);
                  lines.push(description);
                }
                
                // AI Hiệu chuẩn信息
                if (hasCalibrationData) {
                  lines.push('');
                  lines.push(`AI Hiệu chuẩn信息: ${isManuallyModified ? 'Đã sửa' : '已Hiệu chuẩn'}`);
                  
                  // 6层身份neo
                  if (identityAnchors) {
                    lines.push('');
                    lines.push('--- 6层身份neo ---');
                    
                    // ① 骨相层
                    const boneFeatures = [identityAnchors.faceShape, identityAnchors.jawline, identityAnchors.cheekbones].filter(Boolean);
                    if (boneFeatures.length > 0) {
                      lines.push(`① 骨相层: ${boneFeatures.join(', ')}`);
                    }
                    
                    // ② 五官层
                    const facialFeatures = [identityAnchors.eyeShape, identityAnchors.eyeDetails, identityAnchors.noseShape, identityAnchors.lipShape].filter(Boolean);
                    if (facialFeatures.length > 0) {
                      lines.push(`② 五官层: ${facialFeatures.join(', ')}`);
                    }
                    
                    // ③ 辨识标记层
                    if (identityAnchors.uniqueMarks && identityAnchors.uniqueMarks.length > 0) {
                      lines.push(`③ 辨识标记层: ${identityAnchors.uniqueMarks.join(', ')}`);
                    }
                    
                    // ④ 色彩neo层
                    if (identityAnchors.colorAnchors) {
                      const colors: string[] = [];
                      if (identityAnchors.colorAnchors.iris) colors.push(`瞳色:${identityAnchors.colorAnchors.iris}`);
                      if (identityAnchors.colorAnchors.hair) colors.push(`màu tóc:${identityAnchors.colorAnchors.hair}`);
                      if (identityAnchors.colorAnchors.skin) colors.push(`肤色:${identityAnchors.colorAnchors.skin}`);
                      if (identityAnchors.colorAnchors.lips) colors.push(`唇色:${identityAnchors.colorAnchors.lips}`);
                      if (colors.length > 0) {
                        lines.push(`④ 色彩neo层: ${colors.join(', ')}`);
                      }
                    }
                    
                    // ⑤ 皮肤纹理层
                    if (identityAnchors.skinTexture) {
                      lines.push(`⑤ 皮肤纹理层: ${identityAnchors.skinTexture}`);
                    }
                    
                    // ⑥ 发型neo层
                    const hairFeatures = [identityAnchors.hairStyle, identityAnchors.hairlineDetails].filter(Boolean);
                    if (hairFeatures.length > 0) {
                      lines.push(`⑥ 发型neo层: ${hairFeatures.join(', ')}`);
                    }
                  }
                  
                  // Prompt phủ định
                  if (charNegativePrompt) {
                    lines.push('');
                    lines.push('--- Prompt phủ định ---');
                    if (charNegativePrompt.avoid && charNegativePrompt.avoid.length > 0) {
                      lines.push(`避免: ${charNegativePrompt.avoid.join(', ')}`);
                    }
                    if (charNegativePrompt.styleExclusions && charNegativePrompt.styleExclusions.length > 0) {
                      lines.push(`Phong cách排除: ${charNegativePrompt.styleExclusions.join(', ')}`);
                    }
                  }
                  
                  // 专业Prompt thị giác
                  if (visualPromptEn || visualPromptZh) {
                    lines.push('');
                    lines.push('--- 专业Prompt thị giác ---');
                    if (visualPromptEn) lines.push(`EN: ${visualPromptEn}`);
                    if (visualPromptZh) lines.push(`ZH: ${visualPromptZh}`);
                  }
                }
                
                // 年代信息
                if (storyYear || era) {
                  lines.push('');
                  lines.push('--- 年代信息 ---');
                  if (storyYear) lines.push(`故事年份: ${storyYear}年`);
                  if (era) lines.push(`thời đại背景: ${era}`);
                }
                
                // Phong cách thị giác
                const stylePreset = getStyleById(styleId);
                const styleLabel = stylePreset?.name || styleId;
                lines.push('');
                lines.push(`Phong cách thị giác: ${styleLabel}`);
                if (stylePreset?.prompt) {
                  lines.push(`Phong cáchprompt: ${stylePreset.prompt.substring(0, 100)}...`);
                }
                
                // Ảnh tham chiếu
                if (referenceImages.length > 0) {
                  lines.push(`Ảnh tham chiếu: ${referenceImages.length} 张`);
                }
                
                // TạoNội dung
                const selectedSheetElements = selectedElements.map(id => SHEET_ELEMENTS.find(e => e.id === id)).filter(Boolean);
                if (selectedSheetElements.length > 0) {
                  const labels = selectedSheetElements.map(e => e?.label).join(', ');
                  const prompts = selectedSheetElements.map(e => e?.prompt).join(', ');
                  lines.push(`TạoNội dung: ${labels}`);
                  lines.push(`Nội dungprompt: ${prompts}`);
                }
                
                const text = lines.join('\n');
                navigator.clipboard.writeText(text);
                toast.success('Nhân vật数据Đã sao chép vào clipboard');
              }}
              className="w-full"
              disabled={isGenerating}
            >
              <Copy className="h-4 w-4 mr-2" />
              Sao chépNhân vật数据
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper functions
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * 从6层身份neo构建prompt
 * 
 * @param anchors - 6层身份neo
 * @param hasReferenceImages - 是否有Ảnh tham chiếu
 * @returns 构建的prompt字符串
 * 
 * Ảnh tham chiếu优先级逻辑：
 * - 有Ảnh tham chiếu时：只使用最强neo（uniqueMarks + colorAnchors），其他特征由Ảnh tham chiếu引导
 * - 无Ảnh tham chiếu时：使用đầy đủ的6层特征锁定
 */
function buildPromptFromAnchors(
  anchors: CharacterIdentityAnchors | undefined,
  hasReferenceImages: boolean,
  promptLanguage?: PromptLanguage
): string {
  if (!anchors) return '';

  // 根据neo值Nội dungTự động检测Ngôn ngữ（đang xử lý...o值 → đang xử lý...词）
  const isZh = promptLanguage === 'vi' || /[\u4e00-\u9fff]/.test(anchors.faceShape || anchors.eyeShape || '');

  const parts: string[] = [];

  if (hasReferenceImages) {
    // === 有Ảnh tham chiếu：只使用最强neo ===
    if (anchors.uniqueMarks && anchors.uniqueMarks.length > 0) {
      parts.push(isZh ? `辨识标记：${anchors.uniqueMarks.join('、')}` : `distinctive marks: ${anchors.uniqueMarks.join(', ')}`);
    }

    if (anchors.colorAnchors) {
      const colors: string[] = [];
      if (anchors.colorAnchors.iris) colors.push(isZh ? `瞳色${anchors.colorAnchors.iris}` : `iris color ${anchors.colorAnchors.iris}`);
      if (anchors.colorAnchors.hair) colors.push(isZh ? `màu tóc${anchors.colorAnchors.hair}` : `hair color ${anchors.colorAnchors.hair}`);
      if (anchors.colorAnchors.skin) colors.push(isZh ? `肤色${anchors.colorAnchors.skin}` : `skin tone ${anchors.colorAnchors.skin}`);
      if (colors.length > 0) {
        parts.push(colors.join(isZh ? '，' : ', '));
      }
    }
  } else {
    // === 无Ảnh tham chiếu：đầy đủ6层特征锁定 ===

    // ① 骨相层
    const boneFeatures: string[] = [];
    if (anchors.faceShape) boneFeatures.push(isZh ? `${anchors.faceShape}脸` : `${anchors.faceShape} face`);
    if (anchors.jawline) boneFeatures.push(isZh ? `${anchors.jawline}下颌` : `${anchors.jawline} jawline`);
    if (anchors.cheekbones) boneFeatures.push(isZh ? `${anchors.cheekbones}颧骨` : `${anchors.cheekbones} cheekbones`);
    if (boneFeatures.length > 0) {
      parts.push(boneFeatures.join(isZh ? '，' : ', '));
    }

    // ② 五官层
    const facialFeatures: string[] = [];
    if (anchors.eyeShape) facialFeatures.push(isZh ? `${anchors.eyeShape}眼` : `${anchors.eyeShape} eyes`);
    if (anchors.eyeDetails) facialFeatures.push(anchors.eyeDetails);
    if (anchors.noseShape) facialFeatures.push(anchors.noseShape);
    if (anchors.lipShape) facialFeatures.push(anchors.lipShape);
    if (facialFeatures.length > 0) {
      parts.push(facialFeatures.join(isZh ? '，' : ', '));
    }

    // ③ 辨识标记层
    if (anchors.uniqueMarks && anchors.uniqueMarks.length > 0) {
      parts.push(isZh ? `辨识标记：${anchors.uniqueMarks.join('、')}` : `distinctive marks: ${anchors.uniqueMarks.join(', ')}`);
    }

    // ④ 色彩neo层
    if (anchors.colorAnchors) {
      const colors: string[] = [];
      if (anchors.colorAnchors.iris) colors.push(isZh ? `瞳色${anchors.colorAnchors.iris}` : `iris ${anchors.colorAnchors.iris}`);
      if (anchors.colorAnchors.hair) colors.push(isZh ? `màu tóc${anchors.colorAnchors.hair}` : `hair ${anchors.colorAnchors.hair}`);
      if (anchors.colorAnchors.skin) colors.push(isZh ? `肤色${anchors.colorAnchors.skin}` : `skin ${anchors.colorAnchors.skin}`);
      if (anchors.colorAnchors.lips) colors.push(isZh ? `唇色${anchors.colorAnchors.lips}` : `lips ${anchors.colorAnchors.lips}`);
      if (colors.length > 0) {
        parts.push(isZh ? `色彩neo：${colors.join('，')}` : `color anchors: ${colors.join(', ')}`);
      }
    }

    // ⑤ 皮肤纹理层
    if (anchors.skinTexture) {
      parts.push(isZh ? `皮肤纹理：${anchors.skinTexture}` : `skin texture: ${anchors.skinTexture}`);
    }

    // ⑥ 发型neo层
    const hairFeatures: string[] = [];
    if (anchors.hairStyle) hairFeatures.push(anchors.hairStyle);
    if (anchors.hairlineDetails) hairFeatures.push(anchors.hairlineDetails);
    if (hairFeatures.length > 0) {
      parts.push(isZh ? `发型：${hairFeatures.join('，')}` : `hair: ${hairFeatures.join(', ')}`);
    }
  }

  return parts.join(isZh ? '，' : ', ');
}

/**
 * 构建Nhân vậtảnh thiết kếprompt
 * 
 * 优先级：
 * 1. 根据 promptLanguage Chọn主prompt：vi→visualPromptZh, en→visualPromptEn, vi+en→两者合并
 * 2. 有Ảnh tham chiếu + 有neo：简化Mô tả + 最强neo
 * 3. 无Ảnh tham chiếu + 有neo：đầy đủ6层锁定
 * 4. 有Prompt thị giác：使用AI大师Tạo的prompt
 * 5. 只有description：使用Cơ bảnMô tả
 * 6. 年代信息：加入服装Phong cáchneo
 */
function buildCharacterSheetPrompt(
  description: string, 
  name: string, 
  selectedElements: SheetElementId[],
  styleId?: string,
  visualPromptEn?: string,
  visualPromptZh?: string,
  promptLanguage?: PromptLanguage,
  identityAnchors?: CharacterIdentityAnchors,
  hasReferenceImages?: boolean,
  storyYear?: number,
  era?: string
): string {
  const stylePreset = styleId && styleId !== 'random' 
    ? getStyleById(styleId) 
    : null;
  // 修复：Tùy chỉnhPhong cách prompt 为空时用Phong cáchTên兜底，而不是回退到 anime
  const styleTokens = stylePreset
    ? (stylePreset.prompt || `${stylePreset.name} style, professional quality`)
    : 'anime style, professional quality';
  const isRealistic = stylePreset?.category === 'real';
  
  // 根据Ngôn ngữ偏好Chọn主Prompt thị giác
  const lang = promptLanguage || 'vi';

  // 构建年代服装prompt（根据Ngôn ngữ偏好）
  let eraPrompt = '';
  if (storyYear) {
    if (lang === 'vi') {
      if (storyYear >= 2020) eraPrompt = `${storyYear}年代当代đang xử lý...，现代休闲风`;
      else if (storyYear >= 2010) eraPrompt = `${storyYear}年代đang xử lý...，韩风影响`;
      else if (storyYear >= 2000) eraPrompt = `2000年代初期đang xử lý...，千禧年trang phục`;
      else if (storyYear >= 1990) eraPrompt = `1990年代đang xử lý...，转型期trang phục`;
      else if (storyYear >= 1980) eraPrompt = `1980年代đang xử lý...，改革开放时期trang phục`;
      else eraPrompt = `${storyYear}年代đang xử lý...ang phụcPhong cách`;
    } else {
      if (storyYear >= 2020) eraPrompt = `${storyYear}s contemporary Chinese fashion, modern casual style`;
      else if (storyYear >= 2010) eraPrompt = `${storyYear}s Chinese fashion, Korean-influenced style`;
      else if (storyYear >= 2000) eraPrompt = `early 2000s Chinese fashion, millennium era clothing style`;
      else if (storyYear >= 1990) eraPrompt = `1990s Chinese fashion, transitional era clothing`;
      else if (storyYear >= 1980) eraPrompt = `1980s Chinese fashion, reform era clothing style`;
      else eraPrompt = `${storyYear}s era-appropriate Chinese clothing`;
    }
  } else if (era) {
    eraPrompt = lang === 'vi' ? `${era}时期trang phụcPhong cách` : `${era} era clothing style`;
  }
  let primaryVisualPrompt: string | undefined;
  if (lang === 'vi' || lang === 'vi+en') {
    // đang xử lý...（vi+en 只是让用户同时看到两种，Tạo时用中文）
    primaryVisualPrompt = visualPromptZh || visualPromptEn;
  } else {
    // en：英文优先
    primaryVisualPrompt = visualPromptEn || visualPromptZh;
  }
  
  // 构建Mô tả nhân vật：根据有无Ảnh tham chiếu决定使用đầy đủneo还是简化neo
  let characterDescription = '';
  
  // 构建身份neoprompt
  const anchorPrompt = buildPromptFromAnchors(identityAnchors, hasReferenceImages || false, promptLanguage);
  
  if (hasReferenceImages) {
    // 有Ảnh tham chiếu：简化Mô tả，让Ảnh tham chiếu引导主要特征
    const basicDesc = primaryVisualPrompt ? primaryVisualPrompt.split(/[,，]/).slice(0, 3).join(',') : description.substring(0, 100);
    characterDescription = anchorPrompt 
      ? `${basicDesc}, ${anchorPrompt}` 
      : basicDesc;
  } else if (anchorPrompt) {
    // 无Ảnh tham chiếu + 有neo：đầy đủ6层锁定
    const baseDesc = primaryVisualPrompt || description;
    characterDescription = `${baseDesc}, ${anchorPrompt}`;
  } else if (primaryVisualPrompt) {
    // 使用AI大师prompt（已根据Ngôn ngữ偏好Chọn）
    characterDescription = primaryVisualPrompt;
  } else {
    // 只有Cơ bảnMô tả
    characterDescription = description;
  }
  
  // 加入年代服装prompt
  if (eraPrompt) {
    characterDescription = `${characterDescription}, ${eraPrompt}`;
  }

  const isZh = lang === 'vi';

  const basePrompt = isRealistic
    ? (isZh
        ? `专业Nhân vậtẢnh tham chiếu，"${name}"，${characterDescription}，真人写实`
        : `professional character reference for "${name}", ${characterDescription}, real person`)
    : (isZh
        ? `专业Nhân vậtThiết kếẢnh tham chiếu，"${name}"，${characterDescription}`
        : `professional character design sheet for "${name}", ${characterDescription}`);
  
  // 使用 SHEET_ELEMENTS 定义的 prompt，如果是真人Phong cách则转换成写实/摄影表述
  const contentParts = selectedElements
    .map(id => {
      const element = SHEET_ELEMENTS.find(e => e.id === id);
      if (!element) return null;
      if (isRealistic) {
        switch (id) {
          case 'three-view': return 'multiple photographic angles: front portrait, side profile, full body shot';
          case 'expressions': return 'collage of different facial expressions: smiling, frowning, angry, surprised';
          case 'proportions': return 'full body photography, standing straight';
          case 'poses': return 'various action poses, action photography collage';
          default: return element.prompt;
        }
      }
      return element.prompt;
    })
    .filter(Boolean);
  
  const contentPrompt = contentParts.join(', ');
  
  // 统一强化纯白背景，避免背景颜色被Phong cách词带偏
  const whiteBackgroundPrompt = "pure solid white background, isolated character on white background, absolutely no background scenery";
  
  if (isRealistic) {
    return isZh
      ? `${basePrompt}, ${contentPrompt}, 摄影Nhân vậtẢnh tham chiếu版式, 拼贴格式, ${whiteBackgroundPrompt}, ${styleTokens}, 电影级灯光, 高细节皮肤纹理, 照片写实`
      : `${basePrompt}, ${contentPrompt}, photographic character reference layout, collage format, ${whiteBackgroundPrompt}, ${styleTokens}, cinematic lighting, highly detailed skin texture, photorealistic`;
  } else {
    return isZh
      ? `${basePrompt}, ${contentPrompt}, Nhân vậtẢnh tham chiếu版式, ${whiteBackgroundPrompt}, ${styleTokens}, 精细插画`
      : `${basePrompt}, ${contentPrompt}, character reference sheet layout, ${whiteBackgroundPrompt}, ${styleTokens}, detailed illustration`;
  }
}

// Note: generateCharacterImage and imageUrlToBase64 are now imported from @/lib/ai/image-generator
