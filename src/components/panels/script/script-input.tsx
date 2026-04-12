// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Script Input Component
 * Cột trái: nhập kịch bản (hai chế độ nhập/sáng tác)
 */

import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  FileText,
  Wand2,
  Sparkles,
  Loader2,
  AlertCircle,
  RefreshCw,
  BookOpen,
  Palette,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { StylePicker } from "@/components/ui/style-picker";
import type { VisualStyleId } from "@/lib/constants/visual-styles";
import type { PromptLanguage } from "@/types/script";
import { useScriptStore } from "@/stores/script-store";

const PROMPT_LANGUAGE_OPTIONS = [
  { value: "zh", label: "Chỉ tiếng Trung" },
  { value: "en", label: "Chỉ tiếng Anh" },
  { value: "zh+en", label: "Trung-Anh" },
];

const DURATION_OPTIONS = [
  { value: "auto", label: "自动" },
  { value: "10s", label: "10 giây" },
  { value: "15s", label: "15秒" },
  { value: "20s", label: "20秒" },
  { value: "30s", label: "30 giây" },
  { value: "60s", label: "1分钟" },
  { value: "90s", label: "1分30 giây" },
  { value: "120s", label: "2分钟" },
  { value: "180s", label: "3分钟" },
];

const SCENE_COUNT_OPTIONS = [
  { value: "1", label: "1个Cảnh" },
  { value: "2", label: "2个Cảnh" },
  { value: "3", label: "3个Cảnh" },
  { value: "4", label: "4个Cảnh" },
  { value: "5", label: "5个Cảnh" },
  { value: "6", label: "6个Cảnh" },
  { value: "8", label: "8个Cảnh" },
  { value: "10", label: "10个Cảnh" },
];

const SHOT_COUNT_OPTIONS = [
  { value: "3", label: "3个Phân cảnh" },
  { value: "4", label: "4个Phân cảnh" },
  { value: "5", label: "5个Phân cảnh" },
  { value: "6", label: "6个Phân cảnh" },
  { value: "8", label: "8个Phân cảnh" },
  { value: "10", label: "10个Phân cảnh" },
  { value: "12", label: "12个Phân cảnh" },
  { value: "custom", label: "自定义..." },
];

interface ScriptInputProps {
  rawScript: string;
  language: string;
  targetDuration: string;
  styleId: string;
  sceneCount?: string;
  shotCount?: string;
  parseStatus: "idle" | "parsing" | "ready" | "error";
  parseError?: string;
  chatConfigured: boolean;
  onRawScriptChange: (value: string) => void;
  onLanguageChange: (value: string) => void;
  onDurationChange: (value: string) => void;
  onStyleChange: (value: string) => void;
  onSceneCountChange?: (value: string) => void;
  onShotCountChange?: (value: string) => void;
  onParse: () => void;
  onGenerateFromIdea?: (idea: string) => void;
  // 完整剧本导入
  onImportFullScript?: (text: string) => Promise<void>;
  importStatus?: 'idle' | 'importing' | 'ready' | 'error';
  importError?: string;
  // AI校准
  onCalibrate?: () => Promise<void>;
  calibrationStatus?: 'idle' | 'calibrating' | 'completed' | 'error';
  missingTitleCount?: number;
  // Tạo đại cương
  onGenerateSynopses?: () => Promise<void>;
  synopsisStatus?: 'idle' | 'generating' | 'completed' | 'error';
  missingSynopsisCount?: number;
  // Phân cảnh生成状态
  viewpointAnalysisStatus?: 'idle' | 'analyzing' | 'completed' | 'error';
  // Nhân vật校准状态
  characterCalibrationStatus?: 'idle' | 'calibrating' | 'completed' | 'error';
  // Cảnh校准状态
  sceneCalibrationStatus?: 'idle' | 'calibrating' | 'completed' | 'error';
  // 二次校准追踪（中栏独立按钮触发）
  secondPassTypes?: Set<string>;
  // 提示词语言
  promptLanguage?: PromptLanguage;
  onPromptLanguageChange?: (value: PromptLanguage) => void;
}

export function ScriptInput({
  rawScript,
  language,
  targetDuration,
  styleId,
  sceneCount,
  shotCount,
  parseStatus,
  parseError,
  chatConfigured,
  onRawScriptChange,
  onLanguageChange,
  onDurationChange,
  onStyleChange,
  onSceneCountChange,
  onShotCountChange,
  onParse,
  onGenerateFromIdea,
  onImportFullScript,
  importStatus,
  importError,
  onCalibrate,
  calibrationStatus,
  missingTitleCount,
  onGenerateSynopses,
  synopsisStatus,
  missingSynopsisCount,
  viewpointAnalysisStatus,
  characterCalibrationStatus,
  sceneCalibrationStatus,
  secondPassTypes,
  promptLanguage,
  onPromptLanguageChange,
}: ScriptInputProps) {
  const scriptActiveProjectId = useScriptStore((state) => state.activeProjectId);
  const inputDraft = useScriptStore((state) => {
    if (!state.activeProjectId) return null;
    return state.projects[state.activeProjectId]?.inputDraft || null;
  });
  const setInputDraft = useScriptStore((state) => state.setInputDraft);

  const [mode, setMode] = useState<"import" | "create">(inputDraft?.mode || "import");
  const [idea, setIdea] = useState(inputDraft?.idea || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCustomShotInput, setShowCustomShotInput] = useState(false);
  const [customShotValue, setCustomShotValue] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [isGeneratingSynopsis, setIsGeneratingSynopsis] = useState(false);

  // Reload persisted draft when project switches
  useEffect(() => {
    setMode(inputDraft?.mode || "import");
    setIdea(inputDraft?.idea || "");
  }, [scriptActiveProjectId, inputDraft?.mode, inputDraft?.idea]);

  // Persist mode/idea draft to survive panel switching
  useEffect(() => {
    if (!scriptActiveProjectId) return;
    const timer = window.setTimeout(() => {
      setInputDraft(scriptActiveProjectId, { mode, idea });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [scriptActiveProjectId, mode, idea, setInputDraft]);

  const handleGenerate = async () => {
    if (!idea.trim() || !onGenerateFromIdea) return;
    setIsGenerating(true);
    try {
      await onGenerateFromIdea(idea);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImportFullScript = async () => {
    if (!rawScript.trim() || !onImportFullScript) return;
    setIsImporting(true);
    try {
      await onImportFullScript(rawScript);
    } finally {
      setIsImporting(false);
    }
  };

  const handleCalibrate = async () => {
    if (!onCalibrate) return;
    setIsCalibrating(true);
    try {
      await onCalibrate();
    } finally {
      setIsCalibrating(false);
    }
  };

  const handleGenerateSynopses = async () => {
    if (!onGenerateSynopses) return;
    setIsGeneratingSynopsis(true);
    try {
      await onGenerateSynopses();
    } finally {
      setIsGeneratingSynopsis(false);
    }
  };

  return (
    <div className="h-full flex flex-col p-3 space-y-3">
      {/* 模式切换 */}
      <Tabs value={mode} onValueChange={(v) => setMode(v as "import" | "create")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="import" className="text-xs">
            <FileText className="h-3 w-3 mr-1" />
            导入
          </TabsTrigger>
          <TabsTrigger value="create" className="text-xs">
            <Sparkles className="h-3 w-3 mr-1" />
            创作
          </TabsTrigger>
        </TabsList>

        {/* 导入模式 */}
        <TabsContent value="import" className="flex-1 mt-3 overflow-y-auto">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Dán kịch bản đầy đủ（包含大纲、人物小传、各集内容）
            </Label>
            <Textarea
              placeholder="支持的格式：\n• 第X集（集标记）\n• **1-1日 内 Địa điểm**（Cảnh头）\n• 人物：Nhân vậtA、Nhân vậtB\n• Nhân vật名：（Hành động）Hội thoại\n• △Hành động描写\n• 【字幕】【闪回】等"
              value={rawScript}
              onChange={(e) => onRawScriptChange(e.target.value)}
              className="min-h-[200px] max-h-[40vh] resize-none text-sm overflow-y-auto"
              disabled={parseStatus === "parsing" || isImporting}
            />
            {/* 导入状态提示 */}
            {importStatus === "ready" && (
              <div className="space-y-1">
                <p className="text-xs text-green-600">✓ 导入成功！可在右侧点击集名生成Phân cảnh</p>
                {(missingTitleCount ?? 0) > 0 && (
                  <p className="text-xs text-amber-600">
                    ⚠ {missingTitleCount} 集缺少标题，可使用AI校准生成
                  </p>
                )}
              </div>
            )}
            {importStatus === "error" && importError && (
              <p className="text-xs text-destructive">Nhập thất bại：{importError}</p>
            )}
            
            {/* 持久进度状态显示 - 在执行过程中始终可见 */}
            {(importStatus === 'importing' || 
              calibrationStatus === 'calibrating' || 
              synopsisStatus === 'generating' || 
              viewpointAnalysisStatus === 'analyzing' || 
              characterCalibrationStatus === 'calibrating' ||
              sceneCalibrationStatus === 'calibrating') && (
              <div className="p-4 rounded-xl bg-primary/10 border-2 border-primary/30 space-y-3 shadow-lg">
                {/* 标题：根据是否二次校准显示不同文案 */}
                <div className="flex items-center gap-3 text-primary">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-lg font-bold">
                    {secondPassTypes && secondPassTypes.size > 0 ? '🔄 二次校准中...' : '正在处理中...'}
                  </span>
                </div>
                <div className="space-y-2">
                  {/* === 二次校准模式：只显示相关步骤 === */}
                  {secondPassTypes && secondPassTypes.size > 0 ? (
                    <>
                      {/* Phân cảnh校准（二次） */}
                      {secondPassTypes.has('shots') && (
                        <div className={`flex items-center gap-3 py-1 ${viewpointAnalysisStatus === 'analyzing' ? 'text-primary font-bold' : viewpointAnalysisStatus === 'completed' ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                          {viewpointAnalysisStatus === 'analyzing' ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : viewpointAnalysisStatus === 'completed' ? (
                            <span className="text-lg">✓</span>
                          ) : (
                            <span className="w-5 h-5 rounded-full border-2 border-current" />
                          )}
                          <span className="text-base">AI 校准Phân cảnh</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">二次</span>
                        </div>
                      )}
                      
                      {/* Nhân vật校准（二次） */}
                      {secondPassTypes.has('characters') && (
                        <div className={`flex items-center gap-3 py-1 ${characterCalibrationStatus === 'calibrating' ? 'text-primary font-bold' : characterCalibrationStatus === 'completed' ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                          {characterCalibrationStatus === 'calibrating' ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : characterCalibrationStatus === 'completed' ? (
                            <span className="text-lg">✓</span>
                          ) : (
                            <span className="w-5 h-5 rounded-full border-2 border-current" />
                          )}
                          <span className="text-base">AI Nhân vật校准</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">二次</span>
                        </div>
                      )}
                      
                      {/* Cảnh校准（二次） */}
                      {secondPassTypes.has('scenes') && (
                        <div className={`flex items-center gap-3 py-1 ${sceneCalibrationStatus === 'calibrating' ? 'text-primary font-bold' : sceneCalibrationStatus === 'completed' ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                          {sceneCalibrationStatus === 'calibrating' ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : sceneCalibrationStatus === 'completed' ? (
                            <span className="text-lg">✓</span>
                          ) : (
                            <span className="w-5 h-5 rounded-full border-2 border-current" />
                          )}
                          <span className="text-base">AI Cảnh校准</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">二次</span>
                        </div>
                      )}
                    </>
                  ) : (
                    /* === 首次 pipeline 模式：完整 6 步骤 === */
                    <>
                      {/* Nhập kịch bản */}
                      <div className={`flex items-center gap-3 py-1 ${importStatus === 'importing' ? 'text-primary font-bold' : importStatus === 'ready' ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                        {importStatus === 'importing' ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : importStatus === 'ready' ? (
                          <span className="text-lg">✓</span>
                        ) : (
                          <span className="w-5 h-5 rounded-full border-2 border-current" />
                        )}
                        <span className="text-base">Nhập kịch bản</span>
                      </div>
                      
                      {/* Hiệu chỉnh tiêu đề */}
                      <div className={`flex items-center gap-3 py-1 ${calibrationStatus === 'calibrating' ? 'text-primary font-bold' : calibrationStatus === 'completed' ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                        {calibrationStatus === 'calibrating' ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : calibrationStatus === 'completed' ? (
                          <span className="text-lg">✓</span>
                        ) : (
                          <span className="w-5 h-5 rounded-full border-2 border-current" />
                        )}
                        <span className="text-base">AI Hiệu chỉnh tiêu đề</span>
                      </div>
                      
                      {/* Tạo đại cương */}
                      <div className={`flex items-center gap-3 py-1 ${synopsisStatus === 'generating' ? 'text-primary font-bold' : synopsisStatus === 'completed' ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                        {synopsisStatus === 'generating' ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : synopsisStatus === 'completed' ? (
                          <span className="text-lg">✓</span>
                        ) : (
                          <span className="w-5 h-5 rounded-full border-2 border-current" />
                        )}
                        <span className="text-base">AI Tạo đại cương</span>
                      </div>
                      
                      {/* Phân cảnh校准 */}
                      <div className={`flex items-center gap-3 py-1 ${viewpointAnalysisStatus === 'analyzing' ? 'text-primary font-bold' : viewpointAnalysisStatus === 'completed' ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                        {viewpointAnalysisStatus === 'analyzing' ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : viewpointAnalysisStatus === 'completed' ? (
                          <span className="text-lg">✓</span>
                        ) : (
                          <span className="w-5 h-5 rounded-full border-2 border-current" />
                        )}
                        <span className="text-base">AI Phân cảnh校准</span>
                      </div>
                      
                      {/* Nhân vật校准 */}
                      <div className={`flex items-center gap-3 py-1 ${characterCalibrationStatus === 'calibrating' ? 'text-primary font-bold' : characterCalibrationStatus === 'completed' ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                        {characterCalibrationStatus === 'calibrating' ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : characterCalibrationStatus === 'completed' ? (
                          <span className="text-lg">✓</span>
                        ) : (
                          <span className="w-5 h-5 rounded-full border-2 border-current" />
                        )}
                        <span className="text-base">AI Nhân vật校准</span>
                      </div>
                      
                      {/* Cảnh校准 */}
                      <div className={`flex items-center gap-3 py-1 ${sceneCalibrationStatus === 'calibrating' ? 'text-primary font-bold' : sceneCalibrationStatus === 'completed' ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                        {sceneCalibrationStatus === 'calibrating' ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : sceneCalibrationStatus === 'completed' ? (
                          <span className="text-lg">✓</span>
                        ) : (
                          <span className="w-5 h-5 rounded-full border-2 border-current" />
                        )}
                        <span className="text-base">AI Cảnh校准</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* 创作模式 */}
        <TabsContent value="create" className="flex-1 mt-3">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                输入故事创意，AI帮你Tạo kịch bản
              </Label>
              <Textarea
                placeholder="例如：一个内向程序员在咖啡店邂逅开朗女孩的温暖故事..."
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                className="min-h-[100px] resize-none text-sm"
                disabled={isGenerating}
              />
            </div>
            <Button
              onClick={handleGenerate}
              disabled={!idea.trim() || isGenerating || !chatConfigured}
              className="w-full"
              variant="outline"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Đang tạo...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  AITạo kịch bản
                </>
              )}
            </Button>

            {/* 生成后的剧本预览 */}
            {rawScript && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  生成的剧本（可编辑）
                </Label>
                <Textarea
                  value={rawScript}
                  onChange={(e) => onRawScriptChange(e.target.value)}
                  className="min-h-[100px] resize-none text-sm"
                  disabled={parseStatus === "parsing"}
                />
              </div>
            )}

            {/* 创作模式工作流引导 */}
            {parseStatus === "ready" && (
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
                <div className="text-xs font-medium text-primary">✨ 剧本已生成，下一步</div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">1</span>
                    <span>在中栏选择Cảnh → 右栏点「去Cảnh库生成nền」</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">2</span>
                    <span>选择Nhân vật → 右栏点「去Nhân vật库生成形象」</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">3</span>
                    <span>选择Phân cảnh → 右栏点「去AI导演Tạo video」</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* 设置区域 - 根据模式显示不同选项 */}
      <div className="space-y-3 pt-2 border-t">
        {/* 导入模式：显示语言、Cảnh数量、Phân cảnh数量 */}
        {mode === "import" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">剧本语言</Label>
              <Select
                value={language}
                onValueChange={onLanguageChange}
                disabled={parseStatus === "parsing"}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Tiếng Trung">Tiếng Trung</SelectItem>
                  <SelectItem value="English">English</SelectItem>
                  <SelectItem value="日本語">日本語</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">提示词语言</Label>
              <Select
                value={promptLanguage || "zh"}
                onValueChange={(v) => onPromptLanguageChange?.(v as PromptLanguage)}
                disabled={parseStatus === "parsing"}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROMPT_LANGUAGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                控制AI校准生成中/英文提示词，默认Chỉ tiếng Trung可减少生成压力
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Cảnh数量（可选）</Label>
                <Select
                  value={sceneCount || ""}
                  onValueChange={(v) => onSceneCountChange?.(v)}
                  disabled={parseStatus === "parsing"}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="自动" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">自动</SelectItem>
                    {SCENE_COUNT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Phân cảnh数量（可选）</Label>
                {showCustomShotInput ? (
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      placeholder="输入数量"
                      value={customShotValue}
                      onChange={(e) => setCustomShotValue(e.target.value)}
                      onBlur={() => {
                        if (customShotValue && parseInt(customShotValue) > 0) {
                          onShotCountChange?.(customShotValue);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && customShotValue && parseInt(customShotValue) > 0) {
                          onShotCountChange?.(customShotValue);
                        }
                      }}
                      className="h-8 text-xs flex-1"
                      disabled={parseStatus === "parsing"}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => {
                        setShowCustomShotInput(false);
                        setCustomShotValue("");
                        onShotCountChange?.("auto");
                      }}
                    >
                      Hủy
                    </Button>
                  </div>
                ) : (
                  <Select
                    value={shotCount || ""}
                    onValueChange={(v) => {
                      if (v === "custom") {
                        setShowCustomShotInput(true);
                      } else {
                        onShotCountChange?.(v);
                      }
                    }}
                    disabled={parseStatus === "parsing"}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="自动" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">自动</SelectItem>
                      {SHOT_COUNT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Phong cách thị giác - 导入模式也可以选择 */}
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Palette className="h-3 w-3" />
                Phong cách thị giác
              </Label>
              <StylePicker
                value={styleId}
                onChange={(id) => onStyleChange(id)}
                disabled={parseStatus === "parsing"}
              />
              <p className="text-[10px] text-muted-foreground">
                此风格将用于AI校准Phân cảnh时生成视觉描述
              </p>
            </div>
          </div>
        )}

        {/* 创作模式：显示语言、时长、风格、Cảnh数量、Phân cảnh数量 */}
        {mode === "create" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">提示词语言</Label>
              <Select
                value={promptLanguage || "zh"}
                onValueChange={(v) => onPromptLanguageChange?.(v as PromptLanguage)}
                disabled={parseStatus === "parsing"}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROMPT_LANGUAGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                控制AI生成中/英文提示词，默认Chỉ tiếng Trung可减少生成压力
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">语言</Label>
                <Select
                  value={language}
                  onValueChange={onLanguageChange}
                  disabled={parseStatus === "parsing"}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Tiếng Trung">Tiếng Trung</SelectItem>
                    <SelectItem value="English">English</SelectItem>
                    <SelectItem value="日本語">日本語</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">时长</Label>
                <Select
                  value={targetDuration}
                  onValueChange={onDurationChange}
                  disabled={parseStatus === "parsing"}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">风格</Label>
                <StylePicker
                  value={styleId}
                  onChange={(id) => onStyleChange(id)}
                  disabled={parseStatus === "parsing"}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Cảnh数量（可选）</Label>
                <Select
                  value={sceneCount || ""}
                  onValueChange={(v) => onSceneCountChange?.(v)}
                  disabled={parseStatus === "parsing"}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="自动" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">自动</SelectItem>
                    {SCENE_COUNT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Phân cảnh数量（可选）</Label>
                {showCustomShotInput ? (
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      placeholder="输入数量"
                      value={customShotValue}
                      onChange={(e) => setCustomShotValue(e.target.value)}
                      onBlur={() => {
                        if (customShotValue && parseInt(customShotValue) > 0) {
                          onShotCountChange?.(customShotValue);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && customShotValue && parseInt(customShotValue) > 0) {
                          onShotCountChange?.(customShotValue);
                        }
                      }}
                      className="h-8 text-xs flex-1"
                      disabled={parseStatus === "parsing"}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => {
                        setShowCustomShotInput(false);
                        setCustomShotValue("");
                        onShotCountChange?.("auto");
                      }}
                    >
                      Hủy
                    </Button>
                  </div>
                ) : (
                  <Select
                    value={shotCount || ""}
                    onValueChange={(v) => {
                      if (v === "custom") {
                        setShowCustomShotInput(true);
                      } else {
                        onShotCountChange?.(v);
                      }
                    }}
                    disabled={parseStatus === "parsing"}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="自动" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">自动</SelectItem>
                      {SHOT_COUNT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>
        )}

        {/* API 警告 */}
        {!chatConfigured && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-yellow-500/10 border border-yellow-500/20">
            <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
            <div className="text-xs text-yellow-600 dark:text-yellow-400">
              <p className="font-medium">API Chưa cấu hình</p>
              <p className="opacity-80">请在设置中配置API密钥</p>
            </div>
          </div>
        )}

        {/* 导入/解析按钮 */}
        <div className="space-y-2">
          {/* 完整剧本导入按钮（不需要AI，用规则解析） */}
          {mode === "import" && onImportFullScript && (
            <Button
              onClick={handleImportFullScript}
              disabled={!rawScript.trim() || isImporting}
              className="w-full"
              variant="default"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  导入中...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  导入完整剧本
                </>
              )}
            </Button>
          )}
          
          {/* AI校准按钮 - 导入成功且有缺失标题时显示 */}
          {mode === "import" && importStatus === "ready" && (missingTitleCount ?? 0) > 0 && onCalibrate && (
            <Button
              onClick={handleCalibrate}
              disabled={isCalibrating || calibrationStatus === 'calibrating'}
              className="w-full"
              variant="outline"
            >
              {isCalibrating || calibrationStatus === 'calibrating' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  AI校准中...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  AI校准（生成{missingTitleCount}集标题）
                </>
              )}
            </Button>
          )}
          
          {/* 生成大纲按钮 - 导入成功后显示 */}
          {mode === "import" && importStatus === "ready" && onGenerateSynopses && (
            <Button
              onClick={handleGenerateSynopses}
              disabled={isGeneratingSynopsis || synopsisStatus === 'generating'}
              className="w-full"
              variant="outline"
            >
              {isGeneratingSynopsis || synopsisStatus === 'generating' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  生成大纲中...
                </>
              ) : (
                <>
                  <BookOpen className="h-4 w-4 mr-2" />
                  {(missingSynopsisCount ?? 0) > 0 
                    ? `生成大纲（${missingSynopsisCount}集缺失）`
                    : 'Tạo lại大纲'
                  }
                </>
              )}
            </Button>
          )}
          
          {/* AI解析按钮 - 仅在导入模式显示 */}
          {mode === "import" && (
            <Button
              onClick={onParse}
              disabled={!rawScript.trim() || parseStatus === "parsing" || !chatConfigured}
              className="w-full"
              variant={onImportFullScript ? "outline" : "default"}
            >
              {parseStatus === "parsing" ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  解析中...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  AIPhân tích kịch bản
                </>
              )}
            </Button>
          )}
        </div>

        {/* 解析错误 */}
        {parseStatus === "error" && parseError && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <p className="text-xs text-destructive">{parseError}</p>
          </div>
        )}
      </div>
    </div>
  );
}
