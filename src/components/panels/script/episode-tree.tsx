// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Episode Tree Component
 * Cột giữa: xem trước cấu trúc phân cấp (tập→cảnh→phân cảnh) + theo dõi trạng thái + quản lý CRUD
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import type { ScriptData, ScriptCharacter, ScriptScene, Episode, Shot, CompletionStatus, ProjectBackground, EpisodeRawScript, CalibrationStrictness, FilteredCharacterRecord } from "@/types/script";
import { getShotCompletionStatus, calculateProgress } from "@/lib/script/shot-utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  Film,
  MapPin,
  User,
  Circle,
  Clock,
  CheckCircle2,
  Filter,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Wand2,
  RefreshCw,
  Search,
  Sparkles,
  Check,
  X,
  MessageSquare,
  Clapperboard,
  Play,
  Timer,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TrailerDuration, TrailerConfig } from "@/stores/director-store";
import { selectTrailerShots, convertShotsToSplitScenes, type TrailerGenerationOptions } from "@/lib/script/trailer-service";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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

type FilterType = "all" | "pending" | "completed";

// 计算完成状态图标
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

interface EpisodeTreeProps {
  scriptData: ScriptData | null;
  shots: Shot[];
  shotStatus?: "idle" | "generating" | "ready" | "error"; // Trạng thái tạo phân cảnh
  selectedItemId: string | null;
  selectedItemType: "character" | "scene" | "shot" | "episode" | null;
  onSelectItem: (id: string, type: "character" | "scene" | "shot" | "episode") => void;
  // CRUD callbacks (Bundle 版本，同步 episodeRawScripts)
  onAddEpisodeBundle?: (title: string, synopsis: string) => void;
  onUpdateEpisodeBundle?: (episodeIndex: number, updates: { title?: string; synopsis?: string }) => void;
  onDeleteEpisodeBundle?: (episodeIndex: number) => void;
  onAddScene?: (scene: ScriptScene, episodeId?: string) => void;
  onUpdateScene?: (id: string, updates: Partial<ScriptScene>) => void;
  onDeleteScene?: (id: string) => void;
  onAddCharacter?: (character: ScriptCharacter) => void;
  onUpdateCharacter?: (id: string, updates: Partial<ScriptCharacter>) => void;
  onDeleteCharacter?: (id: string) => void;
  onDeleteShot?: (id: string) => void;
  // Phân cảnhTạo callbacks
  onGenerateEpisodeShots?: (episodeIndex: number) => void;
  onRegenerateAllShots?: () => void;
  episodeGenerationStatus?: Record<number, 'idle' | 'generating' | 'completed' | 'error'>;
  // Phân cảnhHiệu chuẩn callback
  onCalibrateShots?: (episodeIndex: number) => void;
  onCalibrateScenesShots?: (sceneId: string) => void;
  // Nhân vậtHiệu chuẩn callback
  onCalibrateCharacters?: () => void;
  characterCalibrationStatus?: 'idle' | 'calibrating' | 'completed' | 'error';
  // AI Nhân vật查找相关
  projectBackground?: ProjectBackground;
  episodeRawScripts?: EpisodeRawScript[];
  onAIFindCharacter?: (query: string) => Promise<{
    found: boolean;
    name: string;
    message: string;
    character?: ScriptCharacter;
  }>;
  aiFindingStatus?: 'idle' | 'searching' | 'found' | 'not_found' | 'error';
  // AI Cảnh查找相关
  onAIFindScene?: (query: string) => Promise<{
    found: boolean;
    message: string;
    scene?: ScriptScene;
  }>;
  // CảnhHiệu chuẩn相关
  onCalibrateScenes?: () => void;  // Hiệu chuẩn toàn bộ cảnh
  onCalibrateEpisodeScenes?: (episodeIndex: number) => void;  // Hiệu chuẩn cảnh một tập
  sceneCalibrationStatus?: 'idle' | 'calibrating' | 'completed' | 'error';
  // Trailer相关
  trailerConfig?: TrailerConfig | null;
  onGenerateTrailer?: (duration: TrailerDuration) => void;
  onClearTrailer?: () => void;
  trailerApiOptions?: TrailerGenerationOptions | null;
  // 单Phân cảnhHiệu chuẩn callback
  onCalibrateSingleShot?: (shotId: string) => void;
  singleShotCalibrationStatus?: Record<string, 'idle' | 'calibrating' | 'completed' | 'error'>;
  // Mức độ chặt chẽ hiệu chuẩn相关
  calibrationStrictness?: CalibrationStrictness;
  onCalibrationStrictnessChange?: (strictness: CalibrationStrictness) => void;
  lastFilteredCharacters?: FilteredCharacterRecord[];
  onRestoreFilteredCharacter?: (characterName: string) => void;
  // Hiệu chuẩnXác nhậnPopup
  calibrationDialogOpen?: boolean;
  pendingCalibrationCharacters?: ScriptCharacter[] | null;
  pendingFilteredCharacters?: FilteredCharacterRecord[];
  onConfirmCalibration?: (kept: ScriptCharacter[], filtered: FilteredCharacterRecord[]) => void;
  onCancelCalibration?: () => void;
}

export function EpisodeTree({
  scriptData,
  shots,
  shotStatus,
  selectedItemId,
  selectedItemType,
  onSelectItem,
  onAddEpisodeBundle,
  onUpdateEpisodeBundle,
  onDeleteEpisodeBundle,
  onAddScene,
  onUpdateScene,
  onDeleteScene,
  onAddCharacter,
  onUpdateCharacter,
  onDeleteCharacter,
  onDeleteShot,
  onGenerateEpisodeShots,
  onRegenerateAllShots,
  episodeGenerationStatus,
  onCalibrateShots,
  onCalibrateScenesShots,
  onCalibrateCharacters,
  characterCalibrationStatus,
  // AI Nhân vật查找相关
  projectBackground,
  episodeRawScripts,
  onAIFindCharacter,
  aiFindingStatus,
  // AI Cảnh查找相关
  onAIFindScene,
  // CảnhHiệu chuẩn相关
  onCalibrateScenes,
  onCalibrateEpisodeScenes,
  sceneCalibrationStatus,
  // Trailer相关
  trailerConfig,
  onGenerateTrailer,
  onClearTrailer,
  trailerApiOptions,
  // 单Phân cảnhHiệu chuẩn
  onCalibrateSingleShot,
  singleShotCalibrationStatus,
  // Mức độ chặt chẽ hiệu chuẩn相关
  calibrationStrictness,
  onCalibrationStrictnessChange,
  lastFilteredCharacters,
  onRestoreFilteredCharacter,
  // Hiệu chuẩnXác nhậnPopup
  calibrationDialogOpen,
  pendingCalibrationCharacters,
  pendingFilteredCharacters,
  onConfirmCalibration,
  onCancelCalibration,
}: EpisodeTreeProps) {
  const [expandedEpisodes, setExpandedEpisodes] = useState<Set<string>>(new Set(["default"]));
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterType>("all");
  // Nhân vật分组折叠状态
  const [extrasExpanded, setExtrasExpanded] = useState(false);
  // Tab 状态: Cấu trúc tập phim vs Trailer
  const [activeTab, setActiveTab] = useState<"structure" | "trailer">("structure");
  // Trailer时长Chọn
  const [selectedTrailerDuration, setSelectedTrailerDuration] = useState<TrailerDuration>(30);
  // TrailerTrạng thái tạo
  const [trailerGenerating, setTrailerGenerating] = useState(false);

  // Dialog states
  const [episodeDialogOpen, setEpisodeDialogOpen] = useState(false);
  const [sceneDialogOpen, setSceneDialogOpen] = useState(false);
  const [characterDialogOpen, setCharacterDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Edit states
  const [editingItem, setEditingItem] = useState<{ type: "episode" | "scene" | "character" | "shot"; id: string } | null>(null);
  const [deleteItem, setDeleteItem] = useState<{ type: "episode" | "scene" | "character" | "shot"; id: string; name: string } | null>(null);
  const [targetEpisodeId, setTargetEpisodeId] = useState<string | null>(null);

  // Form states
  const [formData, setFormData] = useState<Record<string, string>>({});
  
  // AI Nhân vật查找状态
  const [aiQuery, setAiQuery] = useState("");
  const [aiSearching, setAiSearching] = useState(false);
  const [aiResult, setAiResult] = useState<{
    found: boolean;
    name: string;
    message: string;
    character?: ScriptCharacter;
  } | null>(null);
  
  // AI Cảnh查找状态
  const [sceneAiQuery, setSceneAiQuery] = useState("");
  const [sceneAiSearching, setSceneAiSearching] = useState(false);
  const [sceneAiResult, setSceneAiResult] = useState<{
    found: boolean;
    message: string;
    scene?: ScriptScene;
  } | null>(null);

  // 被lọcNhân vật查看Popup
  const [filteredCharsDialogOpen, setFilteredCharsDialogOpen] = useState(false);
  
  // Hiệu chuẩnXác nhậnPopup的本地chỉnh sửa状态
  const [localKeptCharacters, setLocalKeptCharacters] = useState<ScriptCharacter[]>([]);
  const [localFilteredCharacters, setLocalFilteredCharacters] = useState<FilteredCharacterRecord[]>([]);
  // 缓存Người dùng thủ công xóa的Nhân vậtđầy đủ数据，便于恢复时不丢失 AI Tạo的trường
  const [removedCharactersCache, setRemovedCharactersCache] = useState<Map<string, ScriptCharacter>>(new Map());
  
  // 当Xác nhậnPopup打开时，从 props 同步
  useEffect(() => {
    if (calibrationDialogOpen && pendingCalibrationCharacters) {
      setLocalKeptCharacters([...pendingCalibrationCharacters]);
      setLocalFilteredCharacters([...(pendingFilteredCharacters || [])]);
      setRemovedCharactersCache(new Map());
    }
  }, [calibrationDialogOpen, pendingCalibrationCharacters, pendingFilteredCharacters]);
  
  // 从保留 cột表xóaNhân vật（缓存đầy đủ数据以便恢复）
  const handleRemoveKeptCharacter = useCallback((charId: string) => {
    const char = localKeptCharacters.find(c => c.id === charId);
    if (!char) return;
    setRemovedCharactersCache(prev => {
      const next = new Map(prev);
      next.set(char.name, char);
      return next;
    });
    setLocalKeptCharacters(prev => prev.filter(c => c.id !== charId));
    setLocalFilteredCharacters(prev => [...prev, { name: char.name, reason: 'Người dùng thủ công xóa' }]);
  }, [localKeptCharacters]);
  
  // 从lọc cột表恢复Nhân vật到保留 cột表
  const handleRestoreToKept = useCallback((characterName: string) => {
    setLocalFilteredCharacters(prev => prev.filter(fc => fc.name !== characterName));
    // 优先从缓存恢复đầy đủNhân vật数据，避免丢失 AI Tạo的trường
    const cachedChar = removedCharactersCache.get(characterName);
    if (cachedChar) {
      setLocalKeptCharacters(prev => [...prev, cachedChar]);
      setRemovedCharactersCache(prev => {
        const next = new Map(prev);
        next.delete(characterName);
        return next;
      });
    } else {
      setLocalKeptCharacters(prev => [...prev, {
        id: `char_restored_${Date.now()}`,
        name: characterName,
        tags: ['extra', 'restored'],
      }]);
    }
  }, [removedCharactersCache]);
  
  // Xác nhậnKết quả hiệu chỉnh
  const handleConfirmCalibrationLocal = useCallback(() => {
    onConfirmCalibration?.(localKeptCharacters, localFilteredCharacters);
  }, [localKeptCharacters, localFilteredCharacters, onConfirmCalibration]);
  
  // Tất cả保留（恢复Tất cả被lọc的Nhân vật并Xác nhận）
  const handleRestoreAllAndConfirm = useCallback(() => {
    const restored: ScriptCharacter[] = localFilteredCharacters.map((fc, i) => ({
      id: `char_restored_${Date.now()}_${i}`,
      name: fc.name,
      tags: ['extra', 'restored'],
    }));
    onConfirmCalibration?.([...localKeptCharacters, ...restored], []);
  }, [localKeptCharacters, localFilteredCharacters, onConfirmCalibration]);

  // 如果没有episodes，创建一默认的
  const episodes = useMemo(() => {
    if (!scriptData) return [];
    if (scriptData.episodes && scriptData.episodes.length > 0) {
      return scriptData.episodes;
    }
    // 默认单 tập
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

  // 筛选后的shots
  const filteredShots = useMemo(() => {
    if (filter === "all") return shots;
    return shots.filter((shot) => {
      const status = getShotCompletionStatus(shot);
      if (filter === "completed") return status === "completed";
      if (filter === "pending") return status !== "completed";
      return true;
    });
  }, [shots, filter]);

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

  // CRUD handlers
  const handleAddEpisode = () => {
    setEditingItem(null);
    setFormData({ title: `Tập ${episodes.length + 1}`, description: "" });
    setEpisodeDialogOpen(true);
  };

  const handleEditEpisode = (ep: Episode) => {
    setEditingItem({ type: "episode", id: ep.id });
    setFormData({ title: ep.title, description: ep.description || "" });
    setEpisodeDialogOpen(true);
  };

  const handleSaveEpisode = () => {
    if (editingItem?.type === "episode") {
      const ep = episodes.find(e => e.id === editingItem.id);
      if (ep) {
        onUpdateEpisodeBundle?.(ep.index, { title: formData.title, synopsis: formData.description });
      }
    } else {
      onAddEpisodeBundle?.(formData.title || `Tập ${episodes.length + 1}`, formData.description || '');
    }
    setEpisodeDialogOpen(false);
    setFormData({});
  };

  const handleAddScene = (episodeId: string) => {
    setEditingItem(null);
    setTargetEpisodeId(episodeId);
    // 重置 AI 查找状态
    setSceneAiQuery("");
    setSceneAiResult(null);
    setSceneAiSearching(false);
    setFormData({ name: "", location: "", time: "ban ngày", atmosphere: "" });
    setSceneDialogOpen(true);
  };

  const handleEditScene = (scene: ScriptScene) => {
    setEditingItem({ type: "scene", id: scene.id });
    setFormData({ name: scene.name || "", location: scene.location, time: scene.time || "ban ngày", atmosphere: scene.atmosphere || "" });
    setSceneDialogOpen(true);
  };

  // AI Cảnh查找
  const handleSceneAISearch = useCallback(async () => {
    if (!sceneAiQuery.trim() || !onAIFindScene) return;
    
    setSceneAiSearching(true);
    setSceneAiResult(null);
    
    try {
      const result = await onAIFindScene(sceneAiQuery);
      setSceneAiResult(result);
      
      // 如果找到Cảnh，Tự động填充表单
      if (result.scene) {
        setFormData({
          name: result.scene.name || "",
          location: result.scene.location || "",
          time: result.scene.time || "ban ngày",
          atmosphere: result.scene.atmosphere || "",
        });
      }
    } catch (error) {
      console.error('[handleSceneAISearch] Lỗi:', error);
      setSceneAiResult({
        found: false,
        message: 'Tìm kiếm thất bại, vui lòng thử lại',
      });
    } finally {
      setSceneAiSearching(false);
    }
  }, [sceneAiQuery, onAIFindScene]);

  // Xác nhận添加 AI 查找到的Cảnh
  const handleConfirmAIScene = useCallback(() => {
    if (!sceneAiResult?.scene) return;
    onAddScene?.(sceneAiResult.scene, targetEpisodeId || undefined);
    setSceneDialogOpen(false);
    setSceneAiQuery("");
    setSceneAiResult(null);
    setFormData({});
    setTargetEpisodeId(null);
  }, [sceneAiResult, onAddScene, targetEpisodeId]);

  const handleSaveScene = () => {
    if (editingItem?.type === "scene") {
      onUpdateScene?.(editingItem.id, { name: formData.name, location: formData.location, time: formData.time, atmosphere: formData.atmosphere });
    } else {
      // 如果有 AI 结果，使用 AI Tạo的đầy đủCảnh数据
      if (sceneAiResult?.scene) {
        onAddScene?.(sceneAiResult.scene, targetEpisodeId || undefined);
      } else {
        const newScene: ScriptScene = {
          id: `scene_${Date.now()}`,
          name: formData.name || "Cảnh mới",
          location: formData.location || "Địa điểm chưa xác định",
          time: formData.time || "ban ngày",
          atmosphere: formData.atmosphere,
        };
        onAddScene?.(newScene, targetEpisodeId || undefined);
      }
    }
    setSceneDialogOpen(false);
    setFormData({});
    setSceneAiQuery("");
    setSceneAiResult(null);
    setTargetEpisodeId(null);
  };

  const handleAddCharacter = () => {
    setEditingItem(null);
    // 重置 AI 查找状态
    setAiQuery("");
    setAiResult(null);
    setAiSearching(false);
    setFormData({ name: "", gender: "", age: "", personality: "" });
    setCharacterDialogOpen(true);
  };

  const handleEditCharacter = (char: ScriptCharacter) => {
    setEditingItem({ type: "character", id: char.id });
    setFormData({ name: char.name, gender: char.gender || "", age: char.age || "", personality: char.personality || "" });
    setCharacterDialogOpen(true);
  };

  // AI Nhân vật查找
  const handleAISearch = useCallback(async () => {
    if (!aiQuery.trim() || !onAIFindCharacter) return;
    
    setAiSearching(true);
    setAiResult(null);
    
    try {
      const result = await onAIFindCharacter(aiQuery);
      setAiResult(result);
      
      // 如果找到Nhân vật，Tự động填充表单
      if (result.character) {
        setFormData({
          name: result.character.name || "",
          gender: result.character.gender || "",
          age: result.character.age || "",
          personality: result.character.personality || "",
          role: result.character.role || "",
        });
      }
    } catch (error) {
      console.error('[handleAISearch] Lỗi:', error);
      setAiResult({
        found: false,
        name: "",
        message: 'Tìm kiếm thất bại, vui lòng thử lại',
      });
    } finally {
      setAiSearching(false);
    }
  }, [aiQuery, onAIFindCharacter]);

  // Xác nhận添加 AI 查找到的Nhân vật
  const handleConfirmAICharacter = useCallback(() => {
    if (!aiResult?.character) return;
    onAddCharacter?.(aiResult.character);
    setCharacterDialogOpen(false);
    setAiQuery("");
    setAiResult(null);
    setFormData({});
  }, [aiResult, onAddCharacter]);

  const handleSaveCharacter = () => {
    if (editingItem?.type === "character") {
      onUpdateCharacter?.(editingItem.id, { name: formData.name, gender: formData.gender, age: formData.age, personality: formData.personality });
    } else {
      // 如果有 AI 结果，使用 AI Tạo的đầy đủNhân vật数据
      if (aiResult?.character) {
        onAddCharacter?.(aiResult.character);
      } else {
        const newChar: ScriptCharacter = {
          id: `char_${Date.now()}`,
          name: formData.name || "Nhân vật mới",
          gender: formData.gender,
          age: formData.age,
          personality: formData.personality,
        };
        onAddCharacter?.(newChar);
      }
    }
    setCharacterDialogOpen(false);
    setFormData({});
    setAiQuery("");
    setAiResult(null);
  };

  const handleDelete = (type: "episode" | "scene" | "character" | "shot", id: string, name: string) => {
    setDeleteItem({ type, id, name });
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (!deleteItem) return;
    switch (deleteItem.type) {
      case "episode": {
        const ep = episodes.find(e => e.id === deleteItem.id);
        if (ep) onDeleteEpisodeBundle?.(ep.index);
        break;
      }
      case "scene":
        onDeleteScene?.(deleteItem.id);
        break;
      case "character":
        onDeleteCharacter?.(deleteItem.id);
        break;
      case "shot":
        onDeleteShot?.(deleteItem.id);
        break;
    }
    setDeleteDialogOpen(false);
    setDeleteItem(null);
  };

  // 计算整体进度
  const overallProgress = useMemo(() => {
    if (!scriptData) return '0/0';
    return calculateProgress(
      shots.map((s) => ({ status: getShotCompletionStatus(s) }))
    );
  }, [shots, scriptData]);

  // 处理TrailerTạo
  const handleGenerateTrailer = useCallback(async () => {
    if (!trailerApiOptions || trailerGenerating) return;
    
    setTrailerGenerating(true);
    try {
      onGenerateTrailer?.(selectedTrailerDuration);
    } finally {
      setTrailerGenerating(false);
    }
  }, [trailerApiOptions, trailerGenerating, selectedTrailerDuration, onGenerateTrailer]);

  // 获取Trailerđang xử lý...nh sách phân cảnh
  const trailerShots = useMemo(() => {
    if (!trailerConfig?.shotIds || !shots.length) return [];
    return trailerConfig.shotIds
      .map(id => shots.find(s => s.id === id))
      .filter((s): s is Shot => !!s);
  }, [trailerConfig?.shotIds, shots]);

  if (!scriptData) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        Phân tích kịch bản xong sẽ hiển thị cấu trúc
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Chuyển Tab đầu trang */}
      <div className="border-b">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "structure" | "trailer")} className="w-full">
          <TabsList className="w-full justify-start h-9 rounded-none bg-transparent border-b-0 p-0">
            <TabsTrigger 
              value="structure" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent h-9 px-4"
            >
              <Film className="h-3 w-3 mr-1" />
              Cấu trúc tập phim
            </TabsTrigger>
            <TabsTrigger 
              value="trailer" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent h-9 px-4"
            >
              <Clapperboard className="h-3 w-3 mr-1" />
              Trailer
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Tiêu đề và tiến độ - chỉ hiển thị trong Tab Cấu trúc tập phim */}
      {activeTab === "structure" && (
        <div className="p-3 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-sm">{scriptData.title}</h3>
              {scriptData.genre && (
                <span className="text-xs text-muted-foreground">{scriptData.genre}</span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              Tiến độ: {overallProgress}
            </span>
          </div>
        </div>
      )}

      {/* Lọc + nút Tạo mới - chỉ hiển thị trong Tab Cấu trúc tập phim */}
      {activeTab === "structure" && (
        <div className="px-3 py-2 border-b flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Filter className="h-3 w-3 text-muted-foreground" />
            <div className="flex gap-1">
              {(["all", "pending", "completed"] as FilterType[]).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? "default" : "ghost"}
                  className="h-6 text-xs px-2"
                  onClick={() => setFilter(f)}
                >
                  {f === "all" ? "Tất cả" : f === "pending" ? "Chưa hoàn thành" : "Đã hoàn thành"}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex gap-1">
            {onCalibrateScenes && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs px-2"
                onClick={onCalibrateScenes}
                disabled={sceneCalibrationStatus === 'calibrating'}
              >
                {sceneCalibrationStatus === 'calibrating' ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Hiệu chuẩnđang xử lý...</>
                ) : (
                  <><Wand2 className="h-3 w-3 mr-1" />Hiệu chuẩn cảnh AI</>
                )}
              </Button>
            )}
            {onRegenerateAllShots && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs px-2"
                onClick={onRegenerateAllShots}
              >
                <RefreshCw className="h-3 w-3 mr-1" />更新Tất cả
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={handleAddEpisode}>
              <Plus className="h-3 w-3 mr-1" />新建 tập
            </Button>
          </div>
        </div>
      )}

      {/* Trailer Tab Nội dung */}
      {activeTab === "trailer" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Khu vực cài đặt Trailer */}
          <div className="p-3 border-b space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Thời lượng Trailer</Label>
              <div className="flex gap-1">
                {([10, 30, 60] as TrailerDuration[]).map((d) => (
                  <Button
                    key={d}
                    size="sm"
                    variant={selectedTrailerDuration === d ? "default" : "outline"}
                    className="h-7 text-xs px-2"
                    onClick={() => setSelectedTrailerDuration(d)}
                  >
                    <Timer className="h-3 w-3 mr-1" />
                    {d === 60 ? "1 phút" : `${d} giây`}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="flex-1 h-8"
                onClick={handleGenerateTrailer}
                disabled={!trailerApiOptions || trailerGenerating || shots.length === 0 || trailerConfig?.status === 'generating'}
              >
                {trailerGenerating || trailerConfig?.status === 'generating' ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />AI phân tíchđang xử lý...</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" />AI Chọn thông minh Phân cảnh</>
                )}
              </Button>
              {trailerConfig?.shotIds && trailerConfig.shotIds.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={onClearTrailer}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {!trailerApiOptions && (
              <p className="text-xs text-amber-500">Vui lòng cài đặt API key AI trong cài đặt</p>
            )}
            {shots.length === 0 && (
              <p className="text-xs text-amber-500">Vui lòng Tạo phân cảnh trước</p>
            )}
          </div>

          {/* TrailerDanh sách phân cảnh */}
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {trailerConfig?.error && (
                <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                  {trailerConfig.error}
                </div>
              )}
              {trailerShots.length > 0 ? (
                <>
                  <div className="text-xs text-muted-foreground mb-2">
                    Đã chọn {trailerShots.length} phân cảnh, ước tính thời lượng {trailerShots.reduce((sum, s) => sum + (s.duration || 5), 0)} giây
                  </div>
                  {trailerShots.map((shot, index) => {
                    const calibrationStatus = singleShotCalibrationStatus?.[shot.id] || 'idle';
                    return (
                      <div
                        key={shot.id}
                        className={cn(
                          "p-2 rounded border cursor-pointer hover:bg-muted/50 transition-colors",
                          selectedItemId === shot.id && selectedItemType === "shot" && "bg-primary/10 border-primary"
                        )}
                        onClick={() => onSelectItem(shot.id, "shot")}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground w-5">
                            #{index + 1}
                          </span>
                          <Play className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs flex-1 truncate">
                            {shot.shotSize || "Phân cảnh"} - {shot.actionSummary?.slice(0, 30)}...
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {shot.duration || 5}s
                          </span>
                          {/* AI Hiệu chuẩnnút */}
                          {onCalibrateSingleShot && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0 shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                onCalibrateSingleShot(shot.id);
                              }}
                              disabled={calibrationStatus === 'calibrating'}
                              title="AI Hiệu chuẩn phân cảnh"
                            >
                              {calibrationStatus === 'calibrating' ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : calibrationStatus === 'completed' ? (
                                <Check className="h-3 w-3 text-green-500" />
                              ) : calibrationStatus === 'error' ? (
                                <X className="h-3 w-3 text-destructive" />
                              ) : (
                                <Wand2 className="h-3 w-3" />
                              )}
                            </Button>
                          )}
                        </div>
                        {shot.dialogue && (
                          <p className="text-xs text-muted-foreground mt-1 pl-7 truncate">
                            「{shot.dialogue.slice(0, 40)}...」
                          </p>
                        )}
                      </div>
                    );
                  })}
                </>
              ) : trailerConfig?.status === 'completed' ? (
                <div className="text-center text-muted-foreground text-sm py-8">
                  Chưa có phân cảnh nào được chọn
                </div>
              ) : (
                <div className="text-center text-muted-foreground text-sm py-8">
                  <Clapperboard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Chọn thời lượng rồi Nhấp「AI Chọn thông minh Phân cảnh」</p>
                  <p className="text-xs mt-1">AI sẽ tự động chọn dựa trên chức năng tự sự và sức mạnh cảm xúc</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Nội dung Tab Cấu trúc tập phim - Cấu trúc dạng cây */}
      {activeTab === "structure" && (
      <ScrollArea className="flex-1">
        <div className="p-2 pb-20 space-y-1">
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
                <div className="flex items-center group">
                  <button
                    onClick={() => toggleEpisode(episode.id)}
                    className={cn(
                      "flex-1 min-w-0 flex items-center gap-1 px-2 py-1.5 rounded hover:bg-muted text-left overflow-hidden",
                      selectedItemId === `episode_${episode.index}` &&
                        selectedItemType === "episode" &&
                        "bg-primary/10"
                    )}
                  >
                    {expandedEpisodes.has(episode.id) ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    <Film className="h-3 w-3 text-primary" />
                    <span 
                      className="text-sm font-medium flex-1 truncate"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectItem(`episode_${episode.index}`, "episode");
                      }}
                    >
                      {episode.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {episodeProgress}
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100">
                        <MoreHorizontal className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {onGenerateEpisodeShots && (
                        <DropdownMenuItem
                          onClick={() => onGenerateEpisodeShots(episode.index)}
                          disabled={episodeGenerationStatus?.[episode.index] === 'generating'}
                        >
                          {episodeGenerationStatus?.[episode.index] === 'generating' ? (
                            <><Loader2 className="h-3 w-3 mr-2 animate-spin" />Đang tạo...</>
                          ) : episodeGenerationStatus?.[episode.index] === 'completed' ? (
                            <><RefreshCw className="h-3 w-3 mr-2" />Cập nhật phân cảnh</>
                          ) : (
                            <><Wand2 className="h-3 w-3 mr-2" />Tạo phân cảnh</>
                          )}
                        </DropdownMenuItem>
                      )}
                      {onCalibrateShots && episodeGenerationStatus?.[episode.index] === 'completed' && (
                        <DropdownMenuItem
                          onClick={() => onCalibrateShots(episode.index)}
                        >
                          <Wand2 className="h-3 w-3 mr-2" />Hiệu chuẩn phân cảnh AI
                        </DropdownMenuItem>
                      )}
                      {onCalibrateEpisodeScenes && (
                        <DropdownMenuItem
                          onClick={() => onCalibrateEpisodeScenes(episode.index)}
                          disabled={sceneCalibrationStatus === 'calibrating'}
                        >
                          {sceneCalibrationStatus === 'calibrating' ? (
                            <><Loader2 className="h-3 w-3 mr-2 animate-spin" />Hiệu chuẩnđang xử lý...</>
                          ) : (
                            <><MapPin className="h-3 w-3 mr-2" />Hiệu chuẩnTập nàyCảnh</>
                          )}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => handleAddScene(episode.id)}>
                        <Plus className="h-3 w-3 mr-2" />新建Cảnh
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleEditEpisode(episode)}>
                        <Pencil className="h-3 w-3 mr-2" />chỉnh sửa
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => handleDelete("episode", episode.id, episode.title)}>
                        <Trash2 className="h-3 w-3 mr-2" />Xóa
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Danh sách cảnh */}
                {expandedEpisodes.has(episode.id) && (
                  <div className="ml-4 space-y-0.5">
                    {episodeScenes.map((scene) => {
                      const sceneShots = shotsByScene[scene.id] || [];
                      const sceneProgress = calculateProgress(
                        sceneShots.map((s) => ({ status: getShotCompletionStatus(s) }))
                      );

                      return (
                        <div key={scene.id} className="space-y-0.5">
                          {/* Cảnhtiêu đề */}
                          <div className="flex items-center group">
                            <button
                              onClick={() => toggleScene(scene.id)}
                              className={cn(
                                "flex-1 flex items-center gap-1 px-2 py-1 rounded hover:bg-muted text-left",
                                selectedItemId === scene.id &&
                                  selectedItemType === "scene" &&
                                  "bg-primary/10"
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
                              {/* Chỉ thị trạng thái tạo phân cảnh */}
                              {shotStatus === "generating" && sceneShots.length === 0 ? (
                                <Loader2 className="h-3 w-3 text-primary animate-spin" />
                              ) : (
                                <MapPin className="h-3 w-3 text-blue-500" />
                              )}
                              <span
                                className="text-xs flex-1 truncate"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectItem(scene.id, "scene");
                                }}
                              >
                                {scene.name || scene.location}
                              </span>
                              <StatusIcon status={scene.status} />
                              <span className="text-xs text-muted-foreground">
                                {sceneProgress}
                              </span>
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100">
                                  <MoreHorizontal className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {onCalibrateScenesShots && sceneShots.length > 0 && (
                                  <DropdownMenuItem
                                    onClick={() => onCalibrateScenesShots(scene.id)}
                                  >
                                    <Wand2 className="h-3 w-3 mr-2" />Hiệu chuẩn phân cảnh AI
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => handleEditScene(scene)}>
                                  <Pencil className="h-3 w-3 mr-2" />chỉnh sửa
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive" onClick={() => handleDelete("scene", scene.id, scene.name || scene.location)}>
                                  <Trash2 className="h-3 w-3 mr-2" />Xóa
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          {/* Danh sách phân cảnh */}
                          {expandedScenes.has(scene.id) && sceneShots.length > 0 && (
                            <div className="ml-4 space-y-0.5">
                              {sceneShots
                                .filter((shot) => {
                                  if (filter === "all") return true;
                                  const status = getShotCompletionStatus(shot);
                                  if (filter === "completed")
                                    return status === "completed";
                                  return status !== "completed";
                                })
                                .map((shot) => (
                                  <div key={shot.id} className="flex items-center group">
                                    <button
                                      onClick={() => onSelectItem(shot.id, "shot")}
                                      className={cn(
                                        "flex-1 flex items-center gap-2 px-2 py-1 rounded hover:bg-muted text-left",
                                        selectedItemId === shot.id &&
                                          selectedItemType === "shot" &&
                                          "bg-primary/10"
                                      )}
                                    >
                                      <span className="text-xs font-mono text-muted-foreground w-5">
                                        {String(shot.index).padStart(2, "0")}
                                      </span>
                                      <span className="text-xs flex-1 truncate">
                                        {shot.shotSize || "Phân cảnh"} - {shot.actionSummary?.slice(0, 20)}...
                                      </span>
                                      <StatusIcon
                                        status={getShotCompletionStatus(shot)}
                                      />
                                    </button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-destructive"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete("shot", shot.id, `Phân cảnh ${shot.index}`);
                                      }}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}
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

          {/* Danh sách nhân vật - chia thành nhóm nhân vật chính và nhóm quần chúng nhân vật phụ */}
          {(() => {
            // lọc掉Nhân vật cha，并去重
            const seenIds = new Set<string>();
            const allCharacters = scriptData.characters
              .filter(c => !c.stageCharacterIds || c.stageCharacterIds.length === 0)
              .filter(c => {
                if (seenIds.has(c.id)) return false;
                seenIds.add(c.id);
                return true;
              });
            
            // 分组：Nhóm nhân vật chính (protagonist, supporting) 和 群演nhân vật phụ组 (minor, extra)
            const mainCharacters = allCharacters.filter(c => {
              const tags = c.tags || [];
              return tags.includes('protagonist') || tags.includes('supporting');
            });
            const extraCharacters = allCharacters.filter(c => {
              const tags = c.tags || [];
              return !tags.includes('protagonist') && !tags.includes('supporting');
            });
            
            const renderCharacterItem = (char: ScriptCharacter) => (
              <div key={char.id} className="flex items-center group">
                <button
                  onClick={() => onSelectItem(char.id, "character")}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-muted",
                    selectedItemId === char.id &&
                      selectedItemType === "character" &&
                      "bg-primary/10"
                  )}
                >
                  <StatusIcon status={char.status} />
                  {char.name}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100">
                      <MoreHorizontal className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEditCharacter(char)}>
                      <Pencil className="h-3 w-3 mr-2" />chỉnh sửa
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => handleDelete("character", char.id, char.name)}>
                      <Trash2 className="h-3 w-3 mr-2" />Xóa
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
            
            return (
              <>
                {/* Nhóm nhân vật chính */}
                <div className="mt-4 pt-4 border-t">
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      Nhân vật ({mainCharacters.length})
                    </div>
                    <div className="flex items-center gap-1">
                      {onCalibrateCharacters && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-5 text-xs px-1"
                              disabled={characterCalibrationStatus === 'calibrating'}
                            >
                              {characterCalibrationStatus === 'calibrating' ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <MoreHorizontal className="h-3 w-3" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={onCalibrateCharacters}>
                              <Wand2 className="h-3 w-3 mr-2" />Hiệu chuẩn nhân vật AI
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger className="text-xs">
                                <Wand2 className="h-3 w-3 mr-2" />Mức độ chặt chẽ hiệu chuẩn
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                <DropdownMenuRadioGroup
                                  value={calibrationStrictness || 'normal'}
                                  onValueChange={(v) => onCalibrationStrictnessChange?.(v as CalibrationStrictness)}
                                >
                                  <DropdownMenuRadioItem value="strict" className="text-xs">Chặt chẽ</DropdownMenuRadioItem>
                                  <DropdownMenuRadioItem value="normal" className="text-xs">Tiêu chuẩn</DropdownMenuRadioItem>
                                  <DropdownMenuRadioItem value="loose" className="text-xs">宽松</DropdownMenuRadioItem>
                                </DropdownMenuRadioGroup>
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuItem onClick={() => setFilteredCharsDialogOpen(true)}>
                              <Filter className="h-3 w-3 mr-2" />查看被lọcNhân vật
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      <Button size="sm" variant="ghost" className="h-5 text-xs px-1" onClick={handleAddCharacter}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 px-2 mt-1">
                    {mainCharacters.map(renderCharacterItem)}
                  </div>
                </div>
                
                {/* 群演nhân vật phụ组 - 可折叠 */}
                {extraCharacters.length > 0 && (
                  <div className="mt-2 border-t border-dashed pt-2">
                    <button
                      onClick={() => setExtrasExpanded(!extrasExpanded)}
                      className="w-full px-2 py-1 text-xs text-muted-foreground flex items-center justify-between hover:bg-muted/50 rounded"
                    >
                      <div className="flex items-center gap-1">
                        {extrasExpanded ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        <span>群演nhân vật phụ ({extraCharacters.length})</span>
                      </div>
                    </button>
                    {extrasExpanded && (
                      <div className="flex flex-wrap gap-1 px-2 mt-1">
                        {extraCharacters.map(renderCharacterItem)}
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </ScrollArea>
      )}

      {/* Episode Dialog */}
      <Dialog open={episodeDialogOpen} onOpenChange={setEpisodeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem?.type === "episode" ? "chỉnh sửa tập" : "新建 tập"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>tiêu đề</Label>
              <Input value={formData.title || ""} onChange={(e) => setFormData({ ...formData, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Input value={formData.description || ""} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEpisodeDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleSaveEpisode}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scene Dialog - AI Chatchế độ */}
      <Dialog open={sceneDialogOpen} onOpenChange={(open) => {
        setSceneDialogOpen(open);
        if (!open) {
          setSceneAiQuery("");
          setSceneAiResult(null);
          setSceneAiSearching(false);
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingItem?.type === "scene" ? (
                <><Pencil className="h-4 w-4" />chỉnh sửaCảnh</>
              ) : (
                <><Sparkles className="h-4 w-4 text-primary" />AI thông minh添加Cảnh</>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {/* chỉnh sửachế độ：显示普通表单 */}
          {editingItem?.type === "scene" ? (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Tên cảnh</Label>
                <Input value={formData.name || ""} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Địa điểm</Label>
                <Input value={formData.location || ""} onChange={(e) => setFormData({ ...formData, location: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Thời gian</Label>
                <Input value={formData.time || ""} onChange={(e) => setFormData({ ...formData, time: e.target.value })} placeholder="如：ban ngày、ban đêm、Hoàng hôn" />
              </div>
              <div className="space-y-2">
                <Label>Bầu không khí</Label>
                <Input value={formData.atmosphere || ""} onChange={(e) => setFormData({ ...formData, atmosphere: e.target.value })} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSceneDialogOpen(false)}>Hủy</Button>
                <Button onClick={handleSaveScene}>Lưu</Button>
              </DialogFooter>
            </div>
          ) : (
            /* 新建chế độ：AI Chat界面 */
            <div className="space-y-4 py-2">
              {/* AI 输入区 */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  描述你需要的Cảnh，例如：
                </Label>
                <div className="text-xs text-muted-foreground space-y-1 pl-2">
                  <p>• “缺第5 tập的张家客厅这Cảnh”</p>
                  <p>• “添加医院走廊这Địa điểm”</p>
                  <p>• “需要公司会议室”</p>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="输入Cảnh名或描述..."
                    value={sceneAiQuery}
                    onChange={(e) => setSceneAiQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSceneAISearch();
                      }
                    }}
                    disabled={sceneAiSearching}
                  />
                  <Button
                    onClick={handleSceneAISearch}
                    disabled={!sceneAiQuery.trim() || sceneAiSearching || !onAIFindScene}
                    className="shrink-0"
                  >
                    {sceneAiSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {!onAIFindScene && (
                  <p className="text-xs text-amber-500">请先Nhập kịch bản以启用 AI 查找</p>
                )}
              </div>

              {/* AI 结果显示 */}
              {sceneAiResult && (
                <div className={cn(
                  "rounded-lg border p-3 space-y-3",
                  sceneAiResult.found ? "border-green-500/50 bg-green-50 dark:bg-green-950/20" : "border-amber-500/50 bg-amber-50 dark:bg-amber-950/20"
                )}>
                  <div className="flex items-start gap-2">
                    {sceneAiResult.found ? (
                      <Check className="h-4 w-4 text-green-500 mt-0.5" />
                    ) : (
                      <MessageSquare className="h-4 w-4 text-amber-500 mt-0.5" />
                    )}
                    <p className="text-sm">{sceneAiResult.message}</p>
                  </div>
                  
                  {/* 找到Cảnh时显示Thông tin cảnh */}
                  {sceneAiResult.scene && (
                    <div className="space-y-2 pl-6">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Cảnh名：</span>
                          <span className="font-medium">{sceneAiResult.scene.name || sceneAiResult.scene.location}</span>
                        </div>
                        {sceneAiResult.scene.time && (
                          <div>
                            <span className="text-muted-foreground">Thời gian：</span>
                            <span>{sceneAiResult.scene.time}</span>
                          </div>
                        )}
                        {sceneAiResult.scene.atmosphere && (
                          <div className="col-span-2">
                            <span className="text-muted-foreground">Bầu không khí：</span>
                            <span>{sceneAiResult.scene.atmosphere}</span>
                          </div>
                        )}
                      </div>
                      {sceneAiResult.scene.location && sceneAiResult.scene.location !== sceneAiResult.scene.name && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Địa điểm详情：</span>
                          <p className="text-xs mt-1 text-muted-foreground">{sceneAiResult.scene.location}</p>
                        </div>
                      )}
                      {sceneAiResult.scene.visualPrompt && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">视觉描述：</span>
                          <p className="text-xs mt-1 text-muted-foreground">{sceneAiResult.scene.visualPrompt}</p>
                        </div>
                      )}
                      {sceneAiResult.scene.tags && sceneAiResult.scene.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {sceneAiResult.scene.tags.map((tag, i) => (
                            <span key={i} className="text-xs bg-muted px-1.5 py-0.5 rounded">#{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* thao tácnút */}
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setSceneDialogOpen(false)}>
                  Hủy
                </Button>
                {sceneAiResult?.scene ? (
                  <Button onClick={handleConfirmAIScene} className="gap-1">
                    <Check className="h-4 w-4" />
                    Xác nhận添加
                  </Button>
                ) : sceneAiResult && !sceneAiResult.found ? (
                  <Button onClick={handleSaveScene} variant="secondary" className="gap-1">
                    <Plus className="h-4 w-4" />
                    仍然创建
                  </Button>
                ) : null}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Character Dialog - AI Chatchế độ */}
      <Dialog open={characterDialogOpen} onOpenChange={(open) => {
        setCharacterDialogOpen(open);
        if (!open) {
          setAiQuery("");
          setAiResult(null);
          setAiSearching(false);
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingItem?.type === "character" ? (
                <><Pencil className="h-4 w-4" />chỉnh sửaNhân vật</>
              ) : (
                <><Sparkles className="h-4 w-4 text-primary" />AI thông minh添加Nhân vật</>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {/* chỉnh sửachế độ：显示普通表单 */}
          {editingItem?.type === "character" ? (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nhân vật名</Label>
                <Input value={formData.name || ""} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Giới tính</Label>
                <Input value={formData.gender || ""} onChange={(e) => setFormData({ ...formData, gender: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>年龄</Label>
                <Input value={formData.age || ""} onChange={(e) => setFormData({ ...formData, age: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>性格</Label>
                <Input value={formData.personality || ""} onChange={(e) => setFormData({ ...formData, personality: e.target.value })} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCharacterDialogOpen(false)}>Hủy</Button>
                <Button onClick={handleSaveCharacter}>Lưu</Button>
              </DialogFooter>
            </div>
          ) : (
            /* 新建chế độ：AI Chat界面 */
            <div className="space-y-4 py-2">
              {/* AI 输入区 */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  描述你需要的Nhân vật，例如：
                </Label>
                <div className="text-xs text-muted-foreground space-y-1 pl-2">
                  <p>• “缺第10 tập的王大哥这Nhân vật”</p>
                  <p>• “添加张小宝这人”</p>
                  <p>• “需要刀疑哥”</p>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="输入Nhân vật名或描述..."
                    value={aiQuery}
                    onChange={(e) => setAiQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAISearch();
                      }
                    }}
                    disabled={aiSearching}
                  />
                  <Button
                    onClick={handleAISearch}
                    disabled={!aiQuery.trim() || aiSearching || !onAIFindCharacter}
                    className="shrink-0"
                  >
                    {aiSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {!onAIFindCharacter && (
                  <p className="text-xs text-amber-500">请先Nhập kịch bản以启用 AI 查找</p>
                )}
              </div>

              {/* AI 结果显示 */}
              {aiResult && (
                <div className={cn(
                  "rounded-lg border p-3 space-y-3",
                  aiResult.found ? "border-green-500/50 bg-green-50 dark:bg-green-950/20" : "border-amber-500/50 bg-amber-50 dark:bg-amber-950/20"
                )}>
                  <div className="flex items-start gap-2">
                    {aiResult.found ? (
                      <Check className="h-4 w-4 text-green-500 mt-0.5" />
                    ) : (
                      <MessageSquare className="h-4 w-4 text-amber-500 mt-0.5" />
                    )}
                    <p className="text-sm">{aiResult.message}</p>
                  </div>
                  
                  {/* 找到Nhân vật时显示Thông tin nhân vật */}
                  {aiResult.character && (
                    <div className="space-y-2 pl-6">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Nhân vật名：</span>
                          <span className="font-medium">{aiResult.character.name}</span>
                        </div>
                        {aiResult.character.gender && (
                          <div>
                            <span className="text-muted-foreground">Giới tính：</span>
                            <span>{aiResult.character.gender}</span>
                          </div>
                        )}
                        {aiResult.character.age && (
                          <div>
                            <span className="text-muted-foreground">年龄：</span>
                            <span>{aiResult.character.age}</span>
                          </div>
                        )}
                        {aiResult.character.personality && (
                          <div>
                            <span className="text-muted-foreground">性格：</span>
                            <span>{aiResult.character.personality}</span>
                          </div>
                        )}
                      </div>
                      {aiResult.character.role && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Nhân vật简介：</span>
                          <p className="text-xs mt-1 text-muted-foreground">{aiResult.character.role}</p>
                        </div>
                      )}
                      {aiResult.character.visualPromptZh && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">视觉描述：</span>
                          <p className="text-xs mt-1 text-muted-foreground">{aiResult.character.visualPromptZh}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* thao tácnút */}
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setCharacterDialogOpen(false)}>
                  Hủy
                </Button>
                {aiResult?.character ? (
                  <Button onClick={handleConfirmAICharacter} className="gap-1">
                    <Check className="h-4 w-4" />
                    Xác nhận添加
                  </Button>
                ) : aiResult && !aiResult.found ? (
                  <Button onClick={handleSaveCharacter} variant="secondary" className="gap-1">
                    <Plus className="h-4 w-4" />
                    仍然创建
                  </Button>
                ) : null}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhậnXóa</AlertDialogTitle>
            <AlertDialogDescription>
              Xác nhận要Xóa「{deleteItem?.name}」?此thao tác不可撤销。
              {deleteItem?.type === "episode" && "\nXóa tập将同时Xóa其下Tất cảCảnh和Phân cảnh。"}
              {deleteItem?.type === "scene" && "\nXóaCảnh将同时Xóa其下Tất cảPhân cảnh。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">Xóa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Nhân vậtHiệu chuẩnXác nhậnPopup */}
      <Dialog open={calibrationDialogOpen} onOpenChange={(open) => { if (!open) onCancelCalibration?.(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-4 w-4" />
              Nhân vậtKết quả hiệu chỉnhXác nhận
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {/* 保留Danh sách nhân vật */}
            <div>
              <h4 className="text-sm font-medium mb-2">保留Nhân vật ({localKeptCharacters.length})</h4>
              <div className="space-y-1 max-h-48 overflow-y-auto border rounded-md p-2">
                {localKeptCharacters.map(char => {
                  const importance = char.tags?.find(t => ['protagonist', 'supporting', 'minor', 'extra'].includes(t));
                  const labels: Record<string, string> = { protagonist: 'nhân vật chính', supporting: 'nhân vật phụ', minor: '次要', extra: '群演' }; // TODO: extract to module constant
                  return (
                    <div key={char.id} className="flex items-center justify-between px-2 py-1 rounded hover:bg-muted text-xs">
                      <div className="flex items-center gap-2">
                        <span>{char.name}</span>
                        {importance && (
                          <span className="text-muted-foreground text-[10px]">({labels[importance] || importance})</span>
                        )}
                      </div>
                      <Button
                        variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleRemoveKeptCharacter(char.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* 被lọcDanh sách nhân vật */}
            {localFilteredCharacters.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">被lọcNhân vật ({localFilteredCharacters.length})</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto border rounded-md p-2">
                  {localFilteredCharacters.map((fc, i) => (
                    <div key={`${fc.name}_${i}`} className="flex items-center justify-between px-2 py-1 rounded hover:bg-muted text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground line-through">{fc.name}</span>
                        <span className="text-muted-foreground text-[10px]">({fc.reason})</span>
                      </div>
                      <Button
                        variant="ghost" size="sm" className="h-5 w-5 p-0 text-green-600 hover:text-green-700"
                        onClick={() => handleRestoreToKept(fc.name)}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onCancelCalibration}>Hủy</Button>
            {localFilteredCharacters.length > 0 && (
              <Button variant="secondary" onClick={handleRestoreAllAndConfirm}>Tất cả保留</Button>
            )}
            <Button onClick={handleConfirmCalibrationLocal}>Xác nhận</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 查看被lọcNhân vậtPopup */}
      <Dialog open={filteredCharsDialogOpen} onOpenChange={setFilteredCharsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>被lọc的Nhân vật</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {(lastFilteredCharacters && lastFilteredCharacters.length > 0) ? (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {lastFilteredCharacters.map((fc, i) => (
                  <div key={`${fc.name}_${i}`} className="flex items-center justify-between px-2 py-1 rounded hover:bg-muted text-xs">
                    <div>
                      <span>{fc.name}</span>
                      <span className="text-muted-foreground ml-2">({fc.reason})</span>
                    </div>
                    <Button
                      variant="ghost" size="sm" className="h-5 text-xs px-1 text-green-600"
                      onClick={() => {
                        onRestoreFilteredCharacter?.(fc.name);
                      }}
                    >
                      恢复
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">没有被lọc的Nhân vật</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFilteredCharsDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
