// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Property Panel Component
 * Cột phải: thuộc tính mục được chọn + thao tác chuyển hướng + chức năng chỉnh sửa
 */

import { useState, useEffect } from "react";
import type { ScriptCharacter, ScriptScene, Shot, CompletionStatus, Episode, EpisodeRawScript } from "@/types/script";
import { getShotCompletionStatus } from "@/lib/script/shot-utils";
import { useActiveScriptProject } from "@/stores/script-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CAMERA_MOVEMENT_PRESETS, SPECIAL_TECHNIQUE_PRESETS } from "@/stores/director-presets";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  User,
  MapPin,
  Film,
  ArrowRight,
  Circle,
  Clock,
  CheckCircle2,
  Camera,
  MessageSquare,
  Pencil,
  Save,
  X,
  Trash2,
  Volume2,
  Sparkles,
  Timer,
  BookOpen,
  ListChecks,
  Clapperboard,
  Copy,
  Check,
  Grid3X3,
  Loader2,
} from "lucide-react";
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
import { generateMultiPageContactSheetData } from "@/lib/script/scene-viewpoint-generator";
import type { PendingViewpointData, ContactSheetPromptSet } from "@/stores/media-panel-store";

// 状态徽章
function StatusBadge({ status }: { status?: CompletionStatus }) {
  const config = {
    pending: { label: "Chưa bắt đầu", className: "bg-muted text-muted-foreground" },
    in_progress: { label: "Đang thực hiện", className: "bg-yellow-500/10 text-yellow-600" },
    completed: { label: "Đã hoàn thành", className: "bg-green-500/10 text-green-600" },
  };
  const { label, className } = config[status || "pending"];
  return (
    <span className={`px-2 py-0.5 rounded text-xs ${className}`}>
      {label}
    </span>
  );
}

//  tập的详细信息
interface EpisodeDetail extends Episode {
  synopsis?: string;
  keyEvents?: string[];
  scenes: Array<{ sceneHeader: string; characters: string[] }>;
  shotGenerationStatus: 'idle' | 'generating' | 'completed' | 'error';
}

interface PropertyPanelProps {
  selectedItemId: string | null;
  selectedItemType: "character" | "scene" | "shot" | "episode" | null;
  character?: ScriptCharacter;
  scene?: ScriptScene;
  shot?: Shot;
  episode?: EpisodeDetail;  //  tập thông tin
  episodeShots?: Shot[];    // Tất cả phân cảnh của tập này
  sceneShots?: Shot[];      // Tất cả phân cảnh của cảnh này (dùng để phân tích đa góc nhìn)
  onGoToCharacterLibrary?: (characterId: string) => void;
  onGoToSceneLibrary?: (sceneId: string) => void;
  onGoToDirector?: (shotId: string) => void;
  onGoToDirectorFromScene?: (sceneId: string) => void; // Chuyển cấp độ cảnh
  onGenerateEpisodeShots?: (episodeIndex: number) => void; // Tạo phân cảnh
  onCalibrateShots?: (episodeIndex: number) => void;  // Hiệu chuẩn phân cảnh
  // Edit callbacks
  onUpdateCharacter?: (id: string, updates: Partial<ScriptCharacter>) => void;
  onUpdateScene?: (id: string, updates: Partial<ScriptScene>) => void;
  onUpdateShot?: (id: string, updates: Partial<Shot>) => void;
  onDeleteCharacter?: (id: string) => void;
  onDeleteScene?: (id: string) => void;
  onDeleteShot?: (id: string) => void;
  // Nhân vậtgiai đoạnphân tích
  onAnalyzeCharacterStages?: () => void;
  stageAnalysisStatus?: 'idle' | 'analyzing' | 'completed' | 'error';
  suggestMultiStage?: boolean;
  multiStageHints?: string[];
}

export function PropertyPanel({
  selectedItemId,
  selectedItemType,
  character,
  scene,
  shot,
  episode,
  episodeShots = [],
  sceneShots = [],
  onGoToCharacterLibrary,
  onGoToSceneLibrary,
  onGoToDirector,
  onGoToDirectorFromScene,
  onGenerateEpisodeShots,
  onCalibrateShots,
  onUpdateCharacter,
  onUpdateScene,
  onUpdateShot,
  onDeleteCharacter,
  onDeleteScene,
  onDeleteShot,
  onAnalyzeCharacterStages,
  stageAnalysisStatus,
  suggestMultiStage,
  multiStageHints,
}: PropertyPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [copiedCharacter, setCopiedCharacter] = useState(false);
  const [copiedShotPrompts, setCopiedShotPrompts] = useState(false);
  const [copiedScene, setCopiedScene] = useState(false);
  const scriptProject = useActiveScriptProject();
  const promptLanguage = scriptProject?.promptLanguage || 'zh';

  // 复制Cảnh数据
  const handleCopySceneData = async () => {
    if (!scene) return;
    
    const lines: string[] = [];
    lines.push(`# Cài đặt cảnh: ${scene.name || scene.location}`);
    lines.push('');
    
    // Thông tin cơ bản
    lines.push(`## Thông tin cơ bản`);
    lines.push(`Địa điểm：${scene.location}`);
    if (scene.time) lines.push(`Thời gian：${scene.time}`);
    if (scene.atmosphere) lines.push(`Bầu không khí：${scene.atmosphere}`);
    lines.push('');
    
    // CảnhThiết kế（AIHiệu chuẩn后）
    if (scene.architectureStyle || scene.lightingDesign || scene.colorPalette || scene.eraDetails) {
      lines.push(`## Thiết kế cảnh`);
      if (scene.architectureStyle) lines.push(`Phong cách kiến trúc: ${scene.architectureStyle}`);
      if (scene.lightingDesign) lines.push(`Thiết kế ánh sáng：${scene.lightingDesign}`);
      if (scene.colorPalette) lines.push(`Bảng màu sắc：${scene.colorPalette}`);
      if (scene.eraDetails) lines.push(`Đặc trưng thời đại：${scene.eraDetails}`);
      if (scene.keyProps && scene.keyProps.length > 0) lines.push(`Đạo cụ quan trọng: ${scene.keyProps.join('、')}`);
      if (scene.spatialLayout) lines.push(`Bố cục không gian：${scene.spatialLayout}`);
      lines.push('');
    }
    
    // Prompt thị giác（按promptNgôn ngữ显示）
    const includeZhScenePrompt = promptLanguage !== 'en';
    const includeEnScenePrompt = promptLanguage !== 'zh';
    if ((includeZhScenePrompt && scene.visualPrompt) || (includeEnScenePrompt && scene.visualPromptEn)) {
      lines.push(`## Prompt thị giác`);
      if (includeZhScenePrompt && scene.visualPrompt) lines.push(`Tiếng Trung：${scene.visualPrompt}`);
      if (includeEnScenePrompt && scene.visualPromptEn) lines.push(`English: ${scene.visualPromptEn}`);
      lines.push('');
    }
    
    // 多视角联合图（AI视角phân tích的产出）
    if (scene.viewpoints && scene.viewpoints.length > 0) {
      lines.push(`## Ảnh kết hợp đa góc nhìn (AI phân tích)`);
      lines.push(`Số góc nhìn: ${scene.viewpoints.length}`);
      lines.push('');
      scene.viewpoints.forEach((vp, idx) => {
        lines.push(`### Góc nhìn ${idx + 1}: ${vp.name}`);
        lines.push(`- ID: ${vp.id}`);
        if (vp.nameEn) lines.push(`- Tên tiếng Anh: ${vp.nameEn}`);
        if (vp.keyProps && vp.keyProps.length > 0) lines.push(`- Đạo cụ quan trọng: ${vp.keyProps.join('、')}`);
        if (vp.shotIds && vp.shotIds.length > 0) lines.push(`- ID Phân cảnh liên kết: ${vp.shotIds.join(', ')}`);
        lines.push(`- Vị trí lưới: ${vp.gridIndex}`);
        lines.push('');
      });
    }
    
    // 出Thống kê cảnh
    if (scene.importance || scene.appearanceCount || scene.episodeNumbers?.length) {
      lines.push(`## Thống kê cảnh`);
      if (scene.importance) {
        const importanceLabel = scene.importance === 'main' ? 'Cảnh chính' : 
                               scene.importance === 'secondary' ? 'Cảnh phụ' : 'Cảnh chuyển tiếp';
        lines.push(`Mức độ quan trọng: ${importanceLabel}`);
      }
      if (scene.appearanceCount) lines.push(`Số lần xuất hiện: ${scene.appearanceCount} lần`);
      if (scene.episodeNumbers && scene.episodeNumbers.length > 0) {
        lines.push(`Xuất hiện trong tập: ${scene.episodeNumbers.join(', ')}`);
      }
      lines.push('');
    }
    
    const text = lines.join('\n');
    
    try {
      await navigator.clipboard.writeText(text);
      setCopiedScene(true);
      setTimeout(() => setCopiedScene(false), 2000);
    } catch (e) {
      console.error('Copy scene failed:', e);
    }
  };

  // 复制Nhân vật数据
  const handleCopyCharacterData = async () => {
    if (!character) return;
    
    // 格式化Nhân vật数据
    const lines: string[] = [];
    lines.push(`# Ảnh thiết kế nhân vật: ${character.name}`);
    lines.push('');
    
    // 基本信息（优先显示）
    if (character.gender || character.age) {
      lines.push(`## Thông tin cơ bản`);
      const basicInfo: string[] = [];
      if (character.gender) basicInfo.push(`Giới tính：${character.gender}`);
      if (character.age) basicInfo.push(`Tuổi: ${character.age}`);
      lines.push(basicInfo.join(' | '));
      lines.push('');
    }
    
    // 身份/nền（主要描述）
    if (character.role) {
      lines.push(`## Danh tính/Nền`);
      lines.push(character.role);
      lines.push('');
    }
    
    // Đặc điểm tính cách
    if (character.personality) {
      lines.push(`## Đặc điểm tính cách`);
      lines.push(character.personality);
      lines.push('');
    }
    
    // Đặc trưng cốt lõi
    if (character.traits) {
      lines.push(`## Đặc trưng cốt lõi`);
      lines.push(character.traits);
      lines.push('');
    }
    
    // Đặc điểm ngoại hình
    if (character.appearance) {
      lines.push(`## Đặc điểm ngoại hình`);
      lines.push(character.appearance);
      lines.push('');
    }
    
    // Kỹ năng/năng lực
    if (character.skills) {
      lines.push(`## Kỹ năng/năng lực`);
      lines.push(character.skills);
      lines.push('');
    }
    
    // quan trọng hàng为/事迹
    if (character.keyActions) {
      lines.push(`## Hành động/Sự tích quan trọng`);
      lines.push(character.keyActions);
      lines.push('');
    }
    
    // mối quan hệ nhân vật
    if (character.relationships) {
      lines.push(`## mối quan hệ nhân vật`);
      lines.push(character.relationships);
      lines.push('');
    }
    
    // === 6层身份neo（Nhân vật一致性）===
    if (character.identityAnchors) {
      const anchors = character.identityAnchors;
      lines.push(`## 6层身份neo`);
      
      // ① 骨相层
      const boneFeatures: string[] = [];
      if (anchors.faceShape) boneFeatures.push(`脸型: ${anchors.faceShape}`);
      if (anchors.jawline) boneFeatures.push(`下颌线: ${anchors.jawline}`);
      if (anchors.cheekbones) boneFeatures.push(`颧骨: ${anchors.cheekbones}`);
      if (boneFeatures.length > 0) {
        lines.push(`① 骨相层：${boneFeatures.join(', ')}`);
      }
      
      // ② 五官层
      const facialFeatures: string[] = [];
      if (anchors.eyeShape) facialFeatures.push(`眼型: ${anchors.eyeShape}`);
      if (anchors.eyeDetails) facialFeatures.push(`眼部细节: ${anchors.eyeDetails}`);
      if (anchors.noseShape) facialFeatures.push(`鼻型: ${anchors.noseShape}`);
      if (anchors.lipShape) facialFeatures.push(`唇型: ${anchors.lipShape}`);
      if (facialFeatures.length > 0) {
        lines.push(`② 五官层：${facialFeatures.join(', ')}`);
      }
      
      // ③ 辨识标记层（最强neo）
      if (anchors.uniqueMarks && anchors.uniqueMarks.length > 0) {
        lines.push(`③ 辨识标记层（最强neo）：${anchors.uniqueMarks.join('; ')}`);
      }
      
      // ④ 色彩neo层
      if (anchors.colorAnchors) {
        const colors: string[] = [];
        if (anchors.colorAnchors.iris) colors.push(`虹膜: ${anchors.colorAnchors.iris}`);
        if (anchors.colorAnchors.hair) colors.push(`màu tóc: ${anchors.colorAnchors.hair}`);
        if (anchors.colorAnchors.skin) colors.push(`肤色: ${anchors.colorAnchors.skin}`);
        if (anchors.colorAnchors.lips) colors.push(`唇色: ${anchors.colorAnchors.lips}`);
        if (colors.length > 0) {
          lines.push(`④ 色彩neo层（Hex）：${colors.join(', ')}`);
        }
      }
      
      // ⑤ 皮肤纹理层
      if (anchors.skinTexture) {
        lines.push(`⑤ 皮肤纹理层：${anchors.skinTexture}`);
      }
      
      // ⑥ 发型neo层
      const hairFeatures: string[] = [];
      if (anchors.hairStyle) hairFeatures.push(`发型: ${anchors.hairStyle}`);
      if (anchors.hairlineDetails) hairFeatures.push(`发际线: ${anchors.hairlineDetails}`);
      if (hairFeatures.length > 0) {
        lines.push(`⑥ 发型neo层：${hairFeatures.join(', ')}`);
      }
      
      lines.push('');
    }
    
    // === Prompt phủ định ===
    if (character.negativePrompt) {
      lines.push(`## Prompt phủ định`);
      if (character.negativePrompt.avoid && character.negativePrompt.avoid.length > 0) {
        lines.push(`要避免：${character.negativePrompt.avoid.join(', ')}`);
      }
      if (character.negativePrompt.styleExclusions && character.negativePrompt.styleExclusions.length > 0) {
        lines.push(`风格排除：${character.negativePrompt.styleExclusions.join(', ')}`);
      }
      lines.push('');
    }
    
    // Thẻ nhân vật
    if (character.tags && character.tags.length > 0) {
      lines.push(`## Thẻ nhân vật`);
      lines.push(character.tags.map(t => `#${t}`).join(' '));
      lines.push('');
    }
    
    // Ghi chú nhân vật
    if (character.notes) {
      lines.push(`## Ghi chú nhân vật`);
      lines.push(character.notes);
      lines.push('');
    }
    
    const text = lines.join('\n');
    
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCharacter(true);
      setTimeout(() => setCopiedCharacter(false), 2000);
    } catch (e) {
      console.error('Copy character failed:', e);
    }
  };

  // 复制 tậpPhân cảnh数据
  const handleCopyEpisodeShots = async () => {
    if (!episode || episodeShots.length === 0) return;
    
    // 情绪ThẻTiếng Trung映射
    const emotionLabels: Record<string, string> = {
      happy: 'Vui vẻ', sad: 'Buồn bã', angry: 'Tức giận', surprised: 'Ngạc nhiên', fearful: 'Sợ hãi', calm: 'Bình tĩnh',
      tense: 'căng thẳng', excited: 'Hứng khởi', mysterious: 'bí ẩn', romantic: 'Lãng mạn', funny: 'Hài hước', touching: 'Cảm động',
      serious: 'Nghiêm túc', relaxed: 'Nhẹ nhàng', playful: 'Châm biếm', gentle: 'Dịu dàng', passionate: 'Sôi nổi', low: 'Trầm lắng'
    };
    
    // 格式化Phân cảnh数据
    const lines: string[] = [];
    lines.push(`# 第${episode.index} tập：${episode.title.replace(/^第\d+ tập[：:]?/, '')}`);
    lines.push('');
    if (episode.synopsis) {
      lines.push(`## Tập nàyđại cương`);
      lines.push(episode.synopsis);
      lines.push('');
    }
    lines.push(`## Danh sách phân cảnh (共 ${episodeShots.length} )`);
    lines.push('');
    
    episodeShots.forEach((s, idx) => {
      lines.push(`### Phân cảnh ${String(idx + 1).padStart(2, '0')}`);
      if (s.shotSize || s.cameraMovement) {
        lines.push(`**Phân cảnh**: ${[s.shotSize, s.cameraMovement].filter(Boolean).join(' | ')}`);
      }
      if ((s as any).visualDescription) {
        lines.push(`**视觉描述**: ${(s as any).visualDescription}`);
      }
      if (s.actionSummary) {
        lines.push(`**Hành động**: ${s.actionSummary}`);
      }
      if (s.dialogue) {
        lines.push(`**对白**: 「${s.dialogue}」`);
      }
      if (s.characterNames && s.characterNames.length > 0) {
        lines.push(`**出CảnhNhân vật**: ${s.characterNames.join('、')}`);
      }
      if (s.emotionTags && s.emotionTags.length > 0) {
        const tags = s.emotionTags.map(t => emotionLabels[t] || t).join('、');
        lines.push(`**情绪**: ${tags}`);
      }
      if (promptLanguage !== 'zh' && (s as any).visualPrompt) {
        lines.push(`**英文Prompt**: ${(s as any).visualPrompt}`);
      }
      // 三层prompt系统
      if (s.imagePromptZh || s.imagePrompt) {
        if (promptLanguage === 'zh') {
          lines.push(`**首帧prompt**: ${s.imagePromptZh || ''}`);
        } else if (promptLanguage === 'en') {
          lines.push(`**首帧prompt**: ${s.imagePrompt || ''}`);
        } else {
          lines.push(`**首帧prompt**: ${s.imagePromptZh || ''} ${s.imagePrompt ? `(EN: ${s.imagePrompt})` : ''}`);
        }
      }
      if (s.videoPromptZh || s.videoPrompt) {
        if (promptLanguage === 'zh') {
          lines.push(`**Videoprompt**: ${s.videoPromptZh || ''}`);
        } else if (promptLanguage === 'en') {
          lines.push(`**Videoprompt**: ${s.videoPrompt || ''}`);
        } else {
          lines.push(`**Videoprompt**: ${s.videoPromptZh || ''} ${s.videoPrompt ? `(EN: ${s.videoPrompt})` : ''}`);
        }
      }
      if (s.needsEndFrame) {
        lines.push(`**需要尾帧**: 是`);
        if (s.endFramePromptZh || s.endFramePrompt) {
          if (promptLanguage === 'zh') {
            lines.push(`**尾帧prompt**: ${s.endFramePromptZh || ''}`);
          } else if (promptLanguage === 'en') {
            lines.push(`**尾帧prompt**: ${s.endFramePrompt || ''}`);
          } else {
            lines.push(`**尾帧prompt**: ${s.endFramePromptZh || ''} ${s.endFramePrompt ? `(EN: ${s.endFramePrompt})` : ''}`);
          }
        }
      }
      lines.push('');
    });
    
    const text = lines.join('\n');
    
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  // 复制当前Phân cảnh的三层prompt
  const handleCopyShotTriPrompts = async () => {
    if (!shot) return;

    const hasTri = !!(
      shot.imagePrompt || shot.imagePromptZh ||
      shot.videoPrompt || shot.videoPromptZh ||
      shot.endFramePrompt || shot.endFramePromptZh
    );

    // 景别Tiếng Trung映射
    const shotSizeLabels: Record<string, string> = {
      'ECU': 'Cực cận cảnh', 'CU': 'Cận cảnh', 'MCU': 'đang xử lý..., 'MS': 'đang xử lý...
      'MLS': 'đang xử lý..., 'LS': 'Viễn cảnh', 'ELS': 'Đại viễn cảnh', 'POV': 'Góc nhìn chủ quan'
    };
    // Phân cảnh运动Tiếng Trung映射（tương thích旧值+新预设ID）
    const cameraLabelsLegacy: Record<string, string> = {
      'Static': 'Cố định', 'Pan': 'Xoay ngang', 'Tilt': 'Nghiêng', 'Dolly': 'Kéo/đẩy',
      'Zoom': 'Zoom', 'Tracking': 'Theo dõi', 'Crane': 'Nâng hạ', 'Handheld': 'Cầm tay'
    };
    const cameraLabels = (id: string) => {
      const preset = CAMERA_MOVEMENT_PRESETS.find(p => p.id === id);
      return preset ? preset.label : (cameraLabelsLegacy[id] || id);
    };
    const specialTechniqueLabel = (id: string) => {
      const preset = SPECIAL_TECHNIQUE_PRESETS.find(p => p.id === id);
      return preset ? preset.label : id;
    };

    const lines: string[] = [];
    lines.push('═══════════════════════════════════════');
    lines.push(`Phân cảnh ${shot.index} - 三层prompt数据`);
    lines.push('═══════════════════════════════════════');
    lines.push('');

    // Thông tin cơ bản
    lines.push('【Thông tin cơ bản】');
    if (shot.shotSize) {
      lines.push(`景别: ${shotSizeLabels[shot.shotSize] || shot.shotSize} (${shot.shotSize})`);
    }
    if (shot.cameraMovement) {
      lines.push(`Phân cảnh运动: ${cameraLabels(shot.cameraMovement)}`);
    }
    if (shot.specialTechnique && shot.specialTechnique !== 'none') {
      lines.push(`特殊拍摄: ${specialTechniqueLabel(shot.specialTechnique)}`);
    }
    if (shot.duration) {
      lines.push(`时长: ${shot.duration}秒`);
    }
    if (shot.characterNames && shot.characterNames.length > 0) {
      lines.push(`出CảnhNhân vật: ${shot.characterNames.join('、')}`);
    }
    // 对白trường始终显示，无对白时明确标注“无”，防止AIVideo模型幻觉
    lines.push(`对白: ${shot.dialogue ? `「${shot.dialogue}」` : '无'}`);
    if (shot.actionSummary) {
      lines.push(`Hành động描述: ${shot.actionSummary}`);
    }
    lines.push('');

    // 视觉描述
    if ((shot as any).visualDescription) {
      lines.push('【视觉描述】');
      lines.push((shot as any).visualDescription);
      lines.push('');
    }

    // âm thanhThiết kế
    if (shot.ambientSound || shot.soundEffect) {
      lines.push('【âm thanhThiết kế】');
      if (shot.ambientSound) {
        lines.push(`môi trường音: ${shot.ambientSound}`);
      }
      if (shot.soundEffect) {
        lines.push(`音效: ${shot.soundEffect}`);
      }
      lines.push('');
    }

    // tự sự驱动Thiết kế（基于《电影Ngôn ngữ的语法》）
    const hasNarrative = (shot as any).narrativeFunction || (shot as any).shotPurpose || 
                         (shot as any).visualFocus || (shot as any).cameraPosition || 
                         (shot as any).characterBlocking || (shot as any).rhythm;
    if (hasNarrative) {
      lines.push('【tự sự驱动Thiết kế】基于《电影Ngôn ngữ的语法》');
      if ((shot as any).narrativeFunction) {
        lines.push(`tự sự功能: ${(shot as any).narrativeFunction}`);
      }
      if ((shot as any).shotPurpose) {
        lines.push(`Phân cảnh目的: ${(shot as any).shotPurpose}`);
      }
      if ((shot as any).visualFocus) {
        lines.push(`视觉焦点: ${(shot as any).visualFocus}`);
      }
      if ((shot as any).cameraPosition) {
        lines.push(`机位描述: ${(shot as any).cameraPosition}`);
      }
      if ((shot as any).characterBlocking) {
        lines.push(`nhân vật布局: ${(shot as any).characterBlocking}`);
      }
      if ((shot as any).rhythm) {
        lines.push(`节奏: ${(shot as any).rhythm}`);
      }
      lines.push('');
    }

    if (!hasTri) {
      lines.push('⚠️ 该Phân cảnh尚未Tạo三层prompt，请先执 hàng"Hiệu chuẩn phân cảnh AI"。');
    } else {
      // ===== 首帧prompt =====
      lines.push('───────────────────────────────────────');
      lines.push('【首帧prompt】用于Tạo video的第一帧Hình ảnh');
      lines.push('───────────────────────────────────────');
      if (promptLanguage !== 'en' && shot.imagePromptZh) {
        lines.push(`Tiếng Trung: ${shot.imagePromptZh}`);
      }
      if (promptLanguage !== 'zh' && shot.imagePrompt) {
        lines.push(`English: ${shot.imagePrompt}`);
      }
      if (
        (promptLanguage === 'zh' && !shot.imagePromptZh) ||
        (promptLanguage === 'en' && !shot.imagePrompt) ||
        (promptLanguage === 'zh+en' && !shot.imagePrompt && !shot.imagePromptZh)
      ) {
        lines.push('(未Tạo)');
      }
      lines.push('');

      // ===== Videoprompt =====
      lines.push('───────────────────────────────────────');
      lines.push('【Videoprompt】用于图生Video，描述Hành động和运动');
      lines.push('───────────────────────────────────────');
      if (promptLanguage !== 'en' && shot.videoPromptZh) {
        lines.push(`Tiếng Trung: ${shot.videoPromptZh}`);
      }
      if (promptLanguage !== 'zh' && shot.videoPrompt) {
        lines.push(`English: ${shot.videoPrompt}`);
      }
      if (
        (promptLanguage === 'zh' && !shot.videoPromptZh) ||
        (promptLanguage === 'en' && !shot.videoPrompt) ||
        (promptLanguage === 'zh+en' && !shot.videoPrompt && !shot.videoPromptZh)
      ) {
        lines.push('(未Tạo)');
      }
      lines.push('');

      // ===== 尾帧prompt =====
      lines.push('───────────────────────────────────────');
      lines.push('【尾帧prompt】用于Tạo video的最后一帧（如需要）');
      lines.push('───────────────────────────────────────');
      if (shot.needsEndFrame) {
        lines.push('需要尾帧: ✓ 是');
        if (promptLanguage !== 'en' && shot.endFramePromptZh) {
          lines.push(`Tiếng Trung: ${shot.endFramePromptZh}`);
        }
        if (promptLanguage !== 'zh' && shot.endFramePrompt) {
          lines.push(`English: ${shot.endFramePrompt}`);
        }
        if (
          (promptLanguage === 'zh' && !shot.endFramePromptZh) ||
          (promptLanguage === 'en' && !shot.endFramePrompt) ||
          (promptLanguage === 'zh+en' && !shot.endFramePrompt && !shot.endFramePromptZh)
        ) {
          lines.push('(未Tạo)');
        }
      } else {
        lines.push('需要尾帧: ✗ 否（此Phân cảnh不需要单独的尾帧）');
      }
    }

    lines.push('');
    lines.push('═══════════════════════════════════════');

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedShotPrompts(true);
      setTimeout(() => setCopiedShotPrompts(false), 2000);
    } catch (e) {
      console.error('Copy tri-layer prompts failed:', e);
    }
  };

  // Reset edit state when selection changes
  useEffect(() => {
    setIsEditing(false);
    setEditData({});
  }, [selectedItemId, selectedItemType]);

  // Initialize edit data
  const startEditing = () => {
    if (selectedItemType === "character" && character) {
      setEditData({
        name: character.name || "",
        gender: character.gender || "",
        age: character.age || "",
        personality: character.personality || "",
        role: character.role || "",
        traits: character.traits || "",
        skills: character.skills || "",
        keyActions: character.keyActions || "",
        appearance: character.appearance || "",
        relationships: character.relationships || "",
      });
    } else if (selectedItemType === "scene" && scene) {
      setEditData({
        name: scene.name || "",
        location: scene.location || "",
        time: scene.time || "",
        atmosphere: scene.atmosphere || "",
      });
    } else if (selectedItemType === "shot" && shot) {
      setEditData({
        actionSummary: shot.actionSummary || "",
        dialogue: shot.dialogue || "",
        shotSize: shot.shotSize || "",
        cameraMovement: shot.cameraMovement || "none",
        specialTechnique: shot.specialTechnique || "none",
      });
    }
    setIsEditing(true);
  };

  const handleSave = () => {
    if (selectedItemType === "character" && character) {
      onUpdateCharacter?.(character.id, editData);
    } else if (selectedItemType === "scene" && scene) {
      onUpdateScene?.(scene.id, editData);
    } else if (selectedItemType === "shot" && shot) {
      onUpdateShot?.(shot.id, editData as any);
    }
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (selectedItemType === "character" && character) {
      onDeleteCharacter?.(character.id);
    } else if (selectedItemType === "scene" && scene) {
      onDeleteScene?.(scene.id);
    } else if (selectedItemType === "shot" && shot) {
      onDeleteShot?.(shot.id);
    }
    setDeleteDialogOpen(false);
  };

  if (!selectedItemId || !selectedItemType) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm p-4 text-center">
        Chọn tập, nhân vật, cảnh hoặc phân cảnh
        <br />
        Xem chi tiết
      </div>
    );
  }

  //  tập详情
  if (selectedItemType === "episode" && episode) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4 space-y-4 pb-32">
          {/* Đầu */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center">
              <Clapperboard className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium">Tập {episode.index}</h3>
              <p className="text-sm text-muted-foreground">{episode.title.replace(/^第\d+ tập[：:]？/, '')}</p>
            </div>
          </div>

          <Separator />

          {/* đại cương */}
          {episode.synopsis ? (
            <div className="bg-gradient-to-r from-primary/5 to-transparent p-3 rounded-lg border-l-2 border-primary/30">
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <BookOpen className="h-3 w-3" />
                Tập nàyđại cương
              </div>
              <div className="text-sm leading-relaxed whitespace-pre-wrap">{episode.synopsis}</div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">
              Chưa tạo đại cương, Nhấp nút bên dưới để tạo
            </div>
          )}

          {/* Sự kiện quan trọng */}
          {episode.keyEvents && episode.keyEvents.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <ListChecks className="h-3 w-3" />
                Sự kiện quan trọng
              </div>
              <div className="space-y-1">
                {episode.keyEvents.map((event, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-primary font-medium">{i + 1}.</span>
                    <span>{event}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Thống kê cảnh */}
          <div className="bg-muted/30 p-3 rounded-lg">
            <div className="text-xs text-muted-foreground mb-2">Thống kê cảnh</div>
            <div className="text-sm">
              Tập này có <span className="font-medium text-primary">{episode.scenes?.length || 0}</span> cảnh
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Phân cảnh状态：{episode.shotGenerationStatus === 'completed' ? '✅ 已Tạo' : 
                episode.shotGenerationStatus === 'generating' ? '⏳ Đang tạo...' : '⏹ 未Tạo'}
            </div>
          </div>

          <Separator />

          {/* thao tác */}
          <div className="space-y-2">
            {episode.shotGenerationStatus !== 'completed' && (
              <Button
                className="w-full"
                onClick={() => onGenerateEpisodeShots?.(episode.index)}
                disabled={episode.shotGenerationStatus === 'generating'}
              >
                <Film className="h-4 w-4 mr-2" />
                Tạo phân cảnh
              </Button>
            )}
            {episode.shotGenerationStatus === 'completed' && (
              <>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => onCalibrateShots?.(episode.index)}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Hiệu chuẩn phân cảnh AI
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleCopyEpisodeShots}
                  disabled={episodeShots.length === 0}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-2 text-green-500" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      复制Phân cảnh数据 ({episodeShots.length})
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </ScrollArea>
    );
  }

  // Nhân vật详情
  if (selectedItemType === "character" && character) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4 space-y-4 pb-32">
          {/* Đầu */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <User className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              {isEditing ? (
                <Input
                  value={editData.name || ""}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  className="h-7 text-sm font-medium"
                />
              ) : (
                <h3 className="font-medium">{character.name}</h3>
              )}
              <StatusBadge status={character.status} />
            </div>
            {!isEditing ? (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={startEditing}>
                <Pencil className="h-3 w-3" />
              </Button>
            ) : (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleSave}>
                  <Save className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setIsEditing(false)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          <Separator />

          {/* 属性 */}
          {isEditing ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">身份/nền</Label>
                <Textarea value={editData.role || ""} onChange={(e) => setEditData({ ...editData, role: e.target.value })} className="min-h-[60px]" placeholder="详细的身份nền描述" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Giới tính</Label>
                  <Input value={editData.gender || ""} onChange={(e) => setEditData({ ...editData, gender: e.target.value })} className="h-8" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">年龄</Label>
                  <Input value={editData.age || ""} onChange={(e) => setEditData({ ...editData, age: e.target.value })} className="h-8" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">性格</Label>
                <Textarea value={editData.personality || ""} onChange={(e) => setEditData({ ...editData, personality: e.target.value })} className="min-h-[60px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Đặc trưng cốt lõi</Label>
                <Textarea value={editData.traits || ""} onChange={(e) => setEditData({ ...editData, traits: e.target.value })} className="min-h-[60px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Kỹ năng/năng lực</Label>
                <Textarea value={editData.skills || ""} onChange={(e) => setEditData({ ...editData, skills: e.target.value })} className="min-h-[60px]" placeholder="武功、魔法、专业技能等" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">quan trọng hàng为/事迹</Label>
                <Textarea value={editData.keyActions || ""} onChange={(e) => setEditData({ ...editData, keyActions: e.target.value })} className="min-h-[60px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Đặc điểm ngoại hình</Label>
                <Textarea value={editData.appearance || ""} onChange={(e) => setEditData({ ...editData, appearance: e.target.value })} className="min-h-[40px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">mối quan hệ nhân vật</Label>
                <Textarea value={editData.relationships || ""} onChange={(e) => setEditData({ ...editData, relationships: e.target.value })} className="min-h-[40px]" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Nhân vật giai đoạn特殊信息 */}
              {character.stageInfo && (
                <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-1">
                  <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                    🎭 Nhân vật giai đoạn：{character.stageInfo.stageName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    适用 tập数：第{character.stageInfo.episodeRange[0]}-{character.stageInfo.episodeRange[1]} tập
                  </div>
                  {character.stageInfo.ageDescription && (
                    <div className="text-xs text-muted-foreground">
                      年龄：{character.stageInfo.ageDescription}
                    </div>
                  )}
                </div>
              )}
              
              {/* Prompt thị giác（世界级大师Tạo） */}
              {((promptLanguage !== 'en' && character.visualPromptZh) || (promptLanguage !== 'zh' && character.visualPromptEn)) && (
                <div className="bg-gradient-to-r from-purple-500/10 to-transparent p-2 rounded-lg border-l-2 border-purple-500/30">
                  <div className="text-xs text-purple-600 dark:text-purple-400 mb-1">🎨 Prompt thị giác</div>
                  {promptLanguage !== 'en' && character.visualPromptZh && (
                    <div className="text-xs text-muted-foreground mb-1">{character.visualPromptZh}</div>
                  )}
                  {promptLanguage !== 'zh' && character.visualPromptEn && (
                    <div className="text-xs text-muted-foreground/70 italic">{character.visualPromptEn}</div>
                  )}
                </div>
              )}
              
              {character.role && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">身份/nền</div>
                  <div className="text-sm whitespace-pre-wrap">{character.role}</div>
                </div>
              )}
              {(character.gender || character.age) && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">基本信息</div>
                  <div className="text-sm">
                    {[character.gender, character.age].filter(Boolean).join(" · ")}
                  </div>
                </div>
              )}
              {character.personality && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">性格</div>
                  <div className="text-sm whitespace-pre-wrap">{character.personality}</div>
                </div>
              )}
              {character.traits && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Đặc trưng cốt lõi</div>
                  <div className="text-sm whitespace-pre-wrap">{character.traits}</div>
                </div>
              )}
              {character.skills && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Kỹ năng/năng lực</div>
                  <div className="text-sm whitespace-pre-wrap">{character.skills}</div>
                </div>
              )}
              {character.keyActions && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">quan trọng hàng为/事迹</div>
                  <div className="text-sm whitespace-pre-wrap">{character.keyActions}</div>
                </div>
              )}
              {character.appearance && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Đặc điểm ngoại hình</div>
                  <div className="text-sm whitespace-pre-wrap">{character.appearance}</div>
                </div>
              )}
              {character.relationships && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">mối quan hệ nhân vật</div>
                  <div className="text-sm whitespace-pre-wrap">{character.relationships}</div>
                </div>
              )}
              {character.tags && character.tags.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Thẻ nhân vật</div>
                  <div className="flex flex-wrap gap-1">
                    {character.tags.map((tag, i) => (
                      <span key={i} className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {character.notes && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Ghi chú nhân vật</div>
                  <div className="text-sm text-muted-foreground italic whitespace-pre-wrap">{character.notes}</div>
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* thao tác */}
          <div className="space-y-2">
            {/* Nhân vật cha（有Nhân vật giai đoạn）：显示Gợi ý，不显示Tạonút */}
            {character.stageCharacterIds && character.stageCharacterIds.length > 0 ? (
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-2">
                <div className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="h-3 w-3" />
                  已创建 {character.stageCharacterIds.length} giai đoạn版本
                </div>
                <div className="text-xs text-muted-foreground">
                  请在đang xử lý...ấp各giai đoạn版本（如「{character.name}（青年版）」），rồi去Thư viện nhân vậtTạo形象
                </div>
              </div>
            ) : (
              /* 普通Nhân vật或Nhân vật giai đoạn：显示Tạonút */
              <Button
                className="w-full"
                onClick={() => onGoToCharacterLibrary?.(character.id)}
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                {character.characterLibraryId ? 'XemThư viện nhân vật形象' : '去Thư viện nhân vậtTạo形象'}
              </Button>
            )}
            
            <Button
              variant="outline"
              className="w-full"
              onClick={handleCopyCharacterData}
            >
              {copiedCharacter ? (
                <>
                  <Check className="h-4 w-4 mr-2 text-green-500" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  复制Nhân vật数据
                </>
              )}
            </Button>
            <Button
              variant="outline"
              className="w-full text-destructive hover:text-destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              XóaNhân vật
            </Button>
          </div>
        </div>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xác nhậnXóa</AlertDialogTitle>
              <AlertDialogDescription>Xác nhận要XóaNhân vật「{character.name}」?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Hủy</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Xóa</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ScrollArea>
    );
  }

  // Cảnh详情
  if (selectedItemType === "scene" && scene) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4 space-y-4 pb-32">
          {/* Đầu */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
              <MapPin className="h-5 w-5 text-blue-500" />
            </div>
            <div className="flex-1">
              {isEditing ? (
                <Input
                  value={editData.name || ""}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  className="h-7 text-sm font-medium"
                />
              ) : (
                <h3 className="font-medium">{scene.name || scene.location}</h3>
              )}
              <StatusBadge status={scene.status} />
            </div>
            {!isEditing ? (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={startEditing}>
                <Pencil className="h-3 w-3" />
              </Button>
            ) : (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleSave}>
                  <Save className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setIsEditing(false)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          <Separator />

          {/* 属性 */}
          {isEditing ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Địa điểm</Label>
                <Input value={editData.location || ""} onChange={(e) => setEditData({ ...editData, location: e.target.value })} className="h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Thời gian</Label>
                <Input value={editData.time || ""} onChange={(e) => setEditData({ ...editData, time: e.target.value })} className="h-8" placeholder="Ví dụ: ban ngày, buổin đêm、Hoàng hôn" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Bầu không khí</Label>
                <Textarea value={editData.atmosphere || ""} onChange={(e) => setEditData({ ...editData, atmosphere: e.target.value })} className="min-h-[60px]" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Thông tin cơ bản */}
              <div>
                <div className="text-xs text-muted-foreground mb-1">Địa điểm</div>
                <div className="text-sm">{scene.location}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Thời gian</div>
                <div className="text-sm">{scene.time}</div>
              </div>
              {scene.atmosphere && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Bầu không khí</div>
                  <div className="text-sm">{scene.atmosphere}</div>
                </div>
              )}
              
              {/* 专业CảnhThiết kếtrường（AIHiệu chuẩn后显示） */}
              {(scene.architectureStyle || scene.lightingDesign || scene.colorPalette || scene.eraDetails) && (
                <>
                  <Separator className="my-2" />
                  <div className="text-xs font-medium text-primary mb-2">CảnhThiết kế</div>
                  
                  {scene.architectureStyle && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Phong cách kiến trúc</div>
                      <div className="text-sm">{scene.architectureStyle}</div>
                    </div>
                  )}
                  {scene.lightingDesign && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Thiết kế ánh sáng</div>
                      <div className="text-sm">{scene.lightingDesign}</div>
                    </div>
                  )}
                  {scene.colorPalette && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Bảng màu sắc</div>
                      <div className="text-sm">{scene.colorPalette}</div>
                    </div>
                  )}
                  {scene.eraDetails && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Đặc trưng thời đại</div>
                      <div className="text-sm">{scene.eraDetails}</div>
                    </div>
                  )}
                  {scene.keyProps && scene.keyProps.length > 0 && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">quan trọng道具</div>
                      <div className="text-sm">{scene.keyProps.join('、')}</div>
                    </div>
                  )}
                  {scene.spatialLayout && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Bố cục không gian</div>
                      <div className="text-sm">{scene.spatialLayout}</div>
                    </div>
                  )}
                </>
              )}
              
              {/* Prompt thị giác（AIHiệu chuẩn后显示） */}
              {((promptLanguage !== 'en' && scene.visualPrompt) || (promptLanguage !== 'zh' && scene.visualPromptEn)) && (
                <>
                  <Separator className="my-2" />
                  <div className="text-xs font-medium text-primary mb-2">Prompt thị giác</div>
                  
                  {promptLanguage !== 'en' && scene.visualPrompt && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Tiếng Trung</div>
                      <div className="text-sm text-muted-foreground">{scene.visualPrompt}</div>
                    </div>
                  )}
                  {promptLanguage !== 'zh' && scene.visualPromptEn && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">English</div>
                      <div className="text-sm text-muted-foreground italic">{scene.visualPromptEn}</div>
                    </div>
                  )}
                </>
              )}
              
              {/* 多视角联合图预览 - 仅显示 AI phân tích的视角 */}
              {sceneShots.length > 0 && (() => {
                // 只Sử dụng AI phân tích的视角
                if (!scene.viewpoints || scene.viewpoints.length === 0) {
                  return (
                    <>
                      <Separator className="my-2" />
                      <div className="text-xs font-medium text-primary mb-2">
                        <Grid3X3 className="h-3 w-3 inline mr-1" />
                        多视角联合图
                      </div>
                      <div className="text-xs text-muted-foreground">
                        未phân tích视角（可选，Hiệu chuẩn phân cảnh AI后Tự độngTạo）
                      </div>
                    </>
                  );
                }
                
                const viewpoints = scene.viewpoints.map(v => ({
                  ...v,
                  shotIndexes: v.shotIds?.map(id => {
                    const shot = sceneShots.find(s => s.id === id);
                    return shot?.index || 0;
                  }).filter(i => i > 0) || [],
                }));
                
                return (
                  <>
                    <Separator className="my-2" />
                    <div className="text-xs font-medium text-primary mb-2">
                      <Grid3X3 className="h-3 w-3 inline mr-1" />
                      多视角联合图
                    </div>
                    
                    <div className="text-xs text-muted-foreground mb-2">
                      AI phân tích {viewpoints.length} 视角
                    </div>
                    
                    {/* 视角 cột表 */}
                    <div className="space-y-1.5">
                      {viewpoints.slice(0, 6).map((vp, idx) => (
                        <div 
                          key={vp.id} 
                          className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/50"
                        >
                          <span className="w-5 h-5 rounded bg-primary/10 text-primary flex items-center justify-center font-medium">
                            {idx + 1}
                          </span>
                          <span className="flex-1 truncate">{vp.name}</span>
                          {vp.shotIndexes && vp.shotIndexes.length > 0 && (
                            <span className="text-muted-foreground">
                              Phân cảnh #{vp.shotIndexes.map(i => String(i).padStart(2, '0')).join(',#')}
                            </span>
                          )}
                        </div>
                      ))}
                      {viewpoints.length > 6 && (
                        <div className="text-xs text-muted-foreground text-center py-1">
                          还有 {viewpoints.length - 6} 视角...
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
              
              {/* 出Thống kê cảnh */}
              {(scene.appearanceCount || scene.episodeNumbers?.length) && (
                <>
                  <Separator className="my-2" />
                  <div className="flex items-center gap-2 flex-wrap">
                    {scene.importance && (
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        scene.importance === 'main' ? 'bg-primary/10 text-primary' :
                        scene.importance === 'secondary' ? 'bg-yellow-500/10 text-yellow-600' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {scene.importance === 'main' ? 'Cảnh chính' : scene.importance === 'secondary' ? 'Cảnh phụ' : 'Cảnh chuyển tiếp'}
                      </span>
                    )}
                    {scene.appearanceCount && (
                      <span className="text-xs text-muted-foreground">出Cảnh {scene.appearanceCount} 次</span>
                    )}
                    {scene.episodeNumbers && scene.episodeNumbers.length > 0 && (
                      <span className="text-xs text-muted-foreground">第 {scene.episodeNumbers.join(', ')}  tập</span>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          <Separator />

          {/* thao tác */}
          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={() => onGoToSceneLibrary?.(scene.id)}
            >
              <ArrowRight className="h-4 w-4 mr-2" />
              去Cảnh库Tạonền
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleCopySceneData}
            >
              {copiedScene ? (
                <Check className="h-4 w-4 mr-2 text-green-500" />
              ) : (
                <Copy className="h-4 w-4 mr-2" />
              )}
              {copiedScene ? '已复制' : '复制Cảnh数据'}
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => onGoToDirectorFromScene?.(scene.id)}
            >
              <Film className="h-4 w-4 mr-2" />
              去AI导演Tạo video
            </Button>
            <Button
              variant="outline"
              className="w-full text-destructive hover:text-destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              XóaCảnh
            </Button>
          </div>
        </div>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xác nhậnXóa</AlertDialogTitle>
              <AlertDialogDescription>Xác nhận要XóaCảnh「{scene.name || scene.location}」?其下Tất cảPhân cảnh也将被Xóa。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Hủy</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Xóa</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ScrollArea>
    );
  }

  // Phân cảnh详情
  if (selectedItemType === "shot" && shot) {
    const shotStatus = getShotCompletionStatus(shot);
    return (
      <ScrollArea className="h-full">
        <div className="p-4 space-y-4 pb-32">
          {/* Đầu */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
              <Film className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium">Phân cảnh {String(shot.index).padStart(2, "0")}</h3>
              <StatusBadge status={shotStatus} />
            </div>
            {!isEditing ? (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={startEditing}>
                <Pencil className="h-3 w-3" />
              </Button>
            ) : (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleSave}>
                  <Save className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setIsEditing(false)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          {/* 预览图 */}
          {shot.imageUrl && (
            <div className="rounded-lg overflow-hidden">
              <img
                src={shot.imageUrl}
                alt={`Shot ${shot.index}`}
                className="w-full h-auto"
              />
            </div>
          )}

          <Separator />

          {/* 属性 */}
          {isEditing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">景别</Label>
                  <Input value={editData.shotSize || ""} onChange={(e) => setEditData({ ...editData, shotSize: e.target.value })} className="h-8" placeholder="如：WS/MS/CU/ECU" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Phân cảnh运动</Label>
                  <Select value={editData.cameraMovement || 'none'} onValueChange={(v) => setEditData({ ...editData, cameraMovement: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CAMERA_MOVEMENT_PRESETS.map(p => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">特殊拍摄手法</Label>
                <Select value={editData.specialTechnique || 'none'} onValueChange={(v) => setEditData({ ...editData, specialTechnique: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SPECIAL_TECHNIQUE_PRESETS.map(p => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hành động描述</Label>
                <Textarea value={editData.actionSummary || ""} onChange={(e) => setEditData({ ...editData, actionSummary: e.target.value })} className="min-h-[80px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">对白</Label>
                <Textarea value={editData.dialogue || ""} onChange={(e) => setEditData({ ...editData, dialogue: e.target.value })} className="min-h-[60px]" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Phân cảnh信息：景别 + 运动 + 时长 */}
              <div className="flex items-center gap-2 flex-wrap">
                {shot.shotSize && (
                  <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-medium">
                    {shot.shotSize}
                  </span>
                )}
                {shot.cameraMovement && shot.cameraMovement !== 'none' && (
                  <span className="px-2 py-0.5 bg-muted rounded text-xs">
                    {CAMERA_MOVEMENT_PRESETS.find(p => p.id === shot.cameraMovement)?.label || shot.cameraMovement}
                  </span>
                )}
                {shot.specialTechnique && shot.specialTechnique !== 'none' && (
                  <span className="px-2 py-0.5 bg-purple-500/10 text-purple-600 rounded text-xs">
                    {SPECIAL_TECHNIQUE_PRESETS.find(p => p.id === shot.specialTechnique)?.label || shot.specialTechnique}
                  </span>
                )}
                {(shot as any).duration && (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-muted rounded text-xs">
                    <Timer className="h-3 w-3" />
                    {(shot as any).duration}s
                  </span>
                )}
              </div>

              {/* 详细视觉描述 */}
              {(shot as any).visualDescription && (
                <div className="bg-gradient-to-r from-primary/5 to-transparent p-3 rounded-lg border-l-2 border-primary/30">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    视觉
                  </div>
                  <div className="text-sm leading-relaxed">{(shot as any).visualDescription}</div>
                </div>
              )}

              {/* Hành động描述 */}
              <div>
                <div className="text-xs text-muted-foreground mb-1">Hành động描述</div>
                <div className="text-sm">{shot.actionSummary}</div>
              </div>

              {/* âm thanhThiết kế */}
              {((shot as any).ambientSound || (shot as any).soundEffect || shot.dialogue) && (
                <div className="bg-muted/30 p-3 rounded-lg space-y-2">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Volume2 className="h-3 w-3" />
                    âm thanh
                  </div>
                  {(shot as any).ambientSound && (
                    <div>
                      <span className="text-xs text-muted-foreground">môi trường声: </span>
                      <span className="text-xs italic">{(shot as any).ambientSound}</span>
                    </div>
                  )}
                  {(shot as any).soundEffect && (
                    <div>
                      <span className="text-xs text-muted-foreground">音效: </span>
                      <span className="text-xs italic">{(shot as any).soundEffect}</span>
                    </div>
                  )}
                  {shot.dialogue && (
                    <div>
                      <span className="text-xs text-muted-foreground">对白: </span>
                      <span className="text-xs italic">"{shot.dialogue}"</span>
                    </div>
                  )}
                </div>
              )}

              {/* 出CảnhNhân vật */}
              {shot.characterNames && shot.characterNames.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">出CảnhNhân vật</div>
                  <div className="flex flex-wrap gap-1">
                    {shot.characterNames.map((name, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-muted rounded text-xs"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 情绪Thẻ */}
              {shot.emotionTags && shot.emotionTags.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">情绪</div>
                  <div className="flex flex-wrap gap-1">
                    {shot.emotionTags.map((tag, i) => {
                      const emotionLabels: Record<string, string> = {
                        happy: 'Vui vẻ', sad: 'Buồn bã', angry: 'Tức giận', surprised: 'Ngạc nhiên', fearful: 'Sợ hãi', calm: 'Bình tĩnh',
                        tense: 'căng thẳng', excited: 'Hứng khởi', mysterious: 'bí ẩn', romantic: 'Lãng mạn', funny: 'Hài hước', touching: 'Cảm động',
                        serious: 'Nghiêm túc', relaxed: 'Nhẹ nhàng', playful: 'Châm biếm', gentle: 'Dịu dàng', passionate: 'Sôi nổi', low: 'Trầm lắng'
                      };
                      return (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded text-xs"
                        >
                          {emotionLabels[tag] || tag}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Trạng thái tạo */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Hình ảnh</span>
              <StatusBadge
                status={
                  shot.imageStatus === "completed"
                    ? "completed"
                    : shot.imageStatus === "generating"
                    ? "in_progress"
                    : "pending"
                }
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Video</span>
              <StatusBadge
                status={
                  shot.videoStatus === "completed"
                    ? "completed"
                    : shot.videoStatus === "generating"
                    ? "in_progress"
                    : "pending"
                }
              />
            </div>
          </div>

          <Separator />

          {/* thao tác */}
          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={() => onGoToDirector?.(shot.id)}
            >
              <ArrowRight className="h-4 w-4 mr-2" />
              去AI导演Tạo
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleCopyShotTriPrompts}
            >
              {copiedShotPrompts ? (
                <>
                  <Check className="h-4 w-4 mr-2 text-green-500" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  复制三层prompt数据
                </>
              )}
            </Button>
            <Button
              variant="outline"
              className="w-full text-destructive hover:text-destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              XóaPhân cảnh
            </Button>
          </div>
        </div>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xác nhậnXóa</AlertDialogTitle>
              <AlertDialogDescription>Xác nhận要XóaPhân cảnh {shot.index} ?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Hủy</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Xóa</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ScrollArea>
    );
  }

  return null;
}
