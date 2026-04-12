// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * ShotGroupCard — Hạng S分组容器组件
 *
 * Hiện一组Ống kính的聚合信息：
 * - Đầu nhóm：Tên nhóm + Ống kính数 + TổngThời lượng预算条
 * - 组级thao tác：Tạo video / Mở rộngthu gọn
 * - Mở rộng后渲染内部的 SceneCard  cột表
 * - 组级videokết quảHiện
 */

import React, { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Play,
  Loader2,
  Film,
  Clock,
  Layers,
  AlertCircle,
  CheckCircle2,
  Paperclip,
  Image as ImageIcon,
  Download,
  Copy,
  ZoomIn,
  Sparkles,
  Timer,
  Scissors,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SplitScene } from "@/stores/director-store";
import type { Character } from "@/stores/character-library-store";
import type { Scene } from "@/stores/scene-store";
import type { ShotGroup } from "@/stores/sclass-store";
import { recalcGroupDuration } from "./auto-grouping";
import { GroupRefManager } from "./group-ref-manager";

// ==================== Types ====================

export interface ShotGroupCardProps {
  group: ShotGroup;
  /** Dữ liệu SplitScene trong nhóm */
  scenes: SplitScene[];
  /** Tất cả SplitScene (dùng để tính Thời lượng) */
  allScenes: SplitScene[];
  /** Chỉ mục nhóm (0-based) */
  groupIndex: number;
  /** Có đang tạo toàn cục không */
  isGeneratingAny: boolean;
  /** Callback render thẻ cảnh quay đơn */
  renderSceneCard: (scene: SplitScene) => React.ReactNode;
  /** Callback tạo video cấp nhóm */
  onGenerateGroupVideo?: (groupId: string) => void;
  /** Callback hiệu chuẩn AI cấp nhóm */
  onCalibrateGroup?: (groupId: string) => void;
  /** Callback kéo dài video */
  onExtendGroup?: (groupId: string) => void;
  /** Callback chỉnh sửa video */
  onEditGroup?: (groupId: string) => void;
  /** Mặc địnhMở rộng */
  defaultExpanded?: boolean;
  /** Dữ liệu thư viện nhân vật (dùng để quản lý @tham chiếu) */
  characters?: Character[];
  /** Dữ liệu thư viện cảnh (dùng để quản lý @tham chiếu) */
  sceneLibrary?: Scene[];
}

// ==================== Component ====================

export function ShotGroupCard({
  group,
  scenes,
  allScenes,
  groupIndex,
  isGeneratingAny,
  renderSceneCard,
  onGenerateGroupVideo,
  onCalibrateGroup,
  onExtendGroup,
  onEditGroup,
  defaultExpanded = false,
  characters = [],
  sceneLibrary = [],
}: ShotGroupCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showRefManager, setShowRefManager] = useState(false);
  const [gridPreviewOpen, setGridPreviewOpen] = useState(false);

  /** Tải xuống ảnh lưới */
  const handleDownloadGrid = useCallback(() => {
    if (!group.gridImageUrl) return;
    const a = document.createElement('a');
    a.href = group.gridImageUrl;
    a.download = `${group.name}_grid.png`;
    a.click();
  }, [group.gridImageUrl, group.name]);

  /** Sao chép prompt */
  const handleCopyPrompt = useCallback(() => {
    if (!group.lastPrompt) return;
    navigator.clipboard.writeText(group.lastPrompt).then(() => {
      toast.success('promptĐã sao chép vào clipboard');
    }).catch(() => {
      toast.error('Sao chép thất bại');
    });
  }, [group.lastPrompt]);

  // 重新计算实际Thời lượng
  const actualDuration = useMemo(
    () => recalcGroupDuration(group, allScenes),
    [group, allScenes],
  );

  const isOverBudget = actualDuration > 15;
  const budgetPercent = Math.min((actualDuration / 15) * 100, 100);
  const isGenerating = group.videoStatus === "generating";
  const isCompleted = group.videoStatus === "completed";
  const isFailed = group.videoStatus === "failed";
  const hasImages = scenes.some((s) => s.imageDataUrl || s.imageHttpUrl);
  const isCalibrating = group.calibrationStatus === 'calibrating';
  const isCalibrated = group.calibrationStatus === 'done';
  const isCalibrationFailed = group.calibrationStatus === 'failed';
  const isExtendChild = group.generationType === 'extend';
  const isEditChild = group.generationType === 'edit';
  const isChildGroup = isExtendChild || isEditChild;

  // trong nhóm各Ống kính的Thời lượng段
  const durationSegments = useMemo(() => {
    return scenes.map((s, idx) => ({
      id: s.id,
      duration: s.duration > 0 ? s.duration : 5,
      label: `Ống kính${idx + 1}`,
    }));
  }, [scenes]);

  return (
    <div
      className={cn(
        "border rounded-lg overflow-hidden",
        isOverBudget && "border-red-500/50",
        isCompleted && "border-green-500/30",
        isFailed && "border-red-500/30",
        isExtendChild && "border-l-4 border-l-purple-500",
        isEditChild && "border-l-4 border-l-orange-500",
      )}
    >
      {/* ========== Đầu nhóm ========== */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 cursor-pointer select-none",
          "bg-muted/30 hover:bg-muted/50 transition-colors",
        )}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Biểu tượng thu gọn */}
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}

        {/* Tên nhóm */}
        <div className="flex items-center gap-1.5 min-w-0">
          <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-sm font-medium truncate">{group.name}</span>
          {isExtendChild && (
            <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-full shrink-0">kéo dài</span>
          )}
          {isEditChild && (
            <span className="text-[10px] px-1.5 py-0.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded-full shrink-0">Chỉnh sửa</span>
          )}
        </div>

        {/* Số ống kính */}
        <span className="text-xs text-muted-foreground shrink-0">
          {group.sceneIds.length} Ống kính
        </span>

        {/* Thời lượngThẻ */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex items-center gap-1 text-xs px-1.5 py-0.5 rounded shrink-0",
                  isOverBudget
                    ? "bg-red-500/10 text-red-500"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Clock className="h-3 w-3" />
                <span>
                  {actualDuration}s / 15s
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {isOverBudget ? (
                <p>Tổng Thời lượng vượt giới hạn 15 giây! Vui lòng giảm Ống kính hoặc rút ngắn Thời lượng từng ống kính.</p>
              ) : (
                <p>
                  Nhóm có {group.sceneIds.length} Ống kính, Tổng Thời lượng {actualDuration}
                  s
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Dấu trạng thái */}
        {isCompleted && (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
        )}
        {isFailed && (
          <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
        )}

        {/* Dấu số lượng @tham chiếu */}
        {((group.videoRefs?.length || 0) + (group.audioRefs?.length || 0)) > 0 && (
          <div className="flex items-center gap-0.5 text-xs text-muted-foreground shrink-0">
            <Paperclip className="h-3 w-3" />
            <span>{(group.videoRefs?.length || 0) + (group.audioRefs?.length || 0)}</span>
          </div>
        )}

        {/* Vùng thao tác bên phải */}
        <div className="ml-auto flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {/* @tham chiếuQuản lýnút */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setShowRefManager(!showRefManager)}
          >
            <Paperclip className="h-3 w-3 mr-1" />
            @tham chiếu
          </Button>
          {/* AI Hiệu chuẩnnút */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isCalibrated ? "outline" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-7 px-2 text-xs",
                    isCalibrated && "border-purple-500/50 text-purple-600 dark:text-purple-400",
                  )}
                  disabled={isCalibrating || isGenerating}
                  onClick={() => onCalibrateGroup?.(group.id)}
                >
                  {isCalibrating ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3 mr-1" />
                  )}
                  {isCalibrating ? 'Hiệu chuẩnđang xử lý... isCalibrated ? '已Hiệu chuẩn' : 'AIHiệu chuẩn'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isCalibrated
                  ? <p>Đã hoàn thành AI Hiệu chuẩn，Nhấp重新Hiệu chuẩn</p>
                  : <p>AI 分析trong nhómỐng kính，Tạotự sự弧线、过渡Thiết kế、优化 prompt</p>
                }
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {/* Tạonút */}
          <Button
            variant={isCompleted ? "outline" : "default"}
            size="sm"
            className="h-7 px-2.5 text-xs"
            disabled={isGeneratingAny || (!hasImages && !isChildGroup) || isOverBudget}
            onClick={() => onGenerateGroupVideo?.(group.id)}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Đang tạo
              </>
            ) : isCompleted ? (
              <>
                <Film className="h-3 w-3 mr-1" />
                Tạo lại
              </>
            ) : (
              <>
                <Play className="h-3 w-3 mr-1" />
                Tạo video
              </>
            )}
          </Button>
          {/* kéo dài/Chỉnh sửanút（仅Đã hoàn thành的普通组Hiện） */}
          {isCompleted && !isChildGroup && (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs border-purple-500/50 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
                      disabled={isGeneratingAny}
                      onClick={() => onExtendGroup?.(group.id)}
                    >
                      <Timer className="h-3 w-3 mr-1" />
                      kéo dài
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>基于当前videoTiếp tụckéo dài，可về sau或về trước拓展</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs border-orange-500/50 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10"
                      disabled={isGeneratingAny}
                      onClick={() => onEditGroup?.(group.id)}
                    >
                      <Scissors className="h-3 w-3 mr-1" />
                      Chỉnh sửa
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>对当前videothực hiệncốt truyệnChỉnh sửa、Thay thế nhân vật、thuộc tính修改等</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
        </div>
      </div>

      {/* ========== Thời lượng预算条 ========== */}
      <div className="px-3 py-1 bg-muted/10">
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden flex">
          {durationSegments.map((seg, idx) => {
            const segPercent = (seg.duration / 15) * 100;
            const colors = [
              "bg-blue-500",
              "bg-cyan-500",
              "bg-teal-500",
              "bg-emerald-500",
              "bg-violet-500",
              "bg-pink-500",
            ];
            return (
              <TooltipProvider key={seg.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "h-full transition-all",
                        colors[idx % colors.length],
                        idx > 0 && "border-l border-background",
                      )}
                      style={{ width: `${segPercent}%` }}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {seg.label}: {seg.duration}s
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
          {/* 剩余空间 */}
          {budgetPercent < 100 && (
            <div
              className="h-full bg-muted/50"
              style={{ width: `${100 - budgetPercent}%` }}
            />
          )}
        </div>
        <div className="flex justify-between mt-0.5">
          <span className="text-[10px] text-muted-foreground">
            {durationSegments.map((s) => `${s.duration}s`).join(" + ")} ={" "}
            {actualDuration}s
          </span>
          {isOverBudget && (
            <span className="text-[10px] text-red-500 font-medium">
              vượt quá {actualDuration - 15}s
            </span>
          )}
        </div>
      </div>

      {/* ========== AI Hiệu chuẩnkết quảXem trước ========== */}
      {(isCalibrated || isCalibrationFailed) && (
        <div className="px-3 py-2 border-t bg-purple-500/5 space-y-1.5">
          {isCalibrated && group.narrativeArc && (
            <div className="flex items-start gap-1.5">
              <Sparkles className="h-3 w-3 text-purple-500 mt-0.5 shrink-0" />
              <div>
                <span className="text-[10px] font-medium text-purple-600 dark:text-purple-400">tự sự弧线</span>
                <p className="text-xs text-muted-foreground mt-0.5">{group.narrativeArc}</p>
              </div>
            </div>
          )}
          {isCalibrated && group.transitions && group.transitions.length > 0 && (
            <div className="flex items-start gap-1.5">
              <ChevronRight className="h-3 w-3 text-purple-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-[10px] font-medium text-purple-600 dark:text-purple-400">过渡Thiết kế</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {group.transitions.map((t, i) => `${i + 1}→${i + 2}: ${t}`).join('；')}
                </p>
              </div>
            </div>
          )}
          {isCalibrationFailed && group.calibrationError && (
            <div className="flex items-start gap-1.5">
              <AlertCircle className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
              <span className="text-xs text-red-500">Hiệu chuẩnThất bại：{group.calibrationError}</span>
            </div>
          )}
        </div>
      )}

      {/* ========== Tạokết quả区（ô图 + Prompt + video） ========== */}
      {(group.gridImageUrl || group.lastPrompt || group.videoUrl) && (
        <div className="px-3 py-2 border-t bg-muted/5 space-y-2">
          {/* ô图Xem trước + Tải xuống */}
          {group.gridImageUrl && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ImageIcon className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs text-blue-600 dark:text-blue-400">ô图</span>
                <div className="ml-auto flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setGridPreviewOpen(!gridPreviewOpen)}>
                    <ZoomIn className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleDownloadGrid}>
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {/* 缩略图（始终Hiện） */}
              <img
                src={group.gridImageUrl}
                alt="Grid preview"
                className={cn(
                  "rounded cursor-pointer transition-all",
                  gridPreviewOpen ? "w-full" : "w-32 h-20 object-cover",
                )}
                onClick={() => setGridPreviewOpen(!gridPreviewOpen)}
              />
            </div>
          )}

          {/* Prompt Sao chép */}
          {group.lastPrompt && (
            <div>
              <div className="flex items-center gap-2">
                <Copy className="h-3.5 w-3.5 text-orange-500" />
                <span className="text-xs text-orange-600 dark:text-orange-400">Tạo Prompt</span>
                <Button variant="ghost" size="sm" className="h-6 px-2 ml-auto text-xs" onClick={handleCopyPrompt}>
                  <Copy className="h-3 w-3 mr-1" />
                  Sao chép
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-3 whitespace-pre-wrap break-all">
                {group.lastPrompt}
              </p>
            </div>
          )}

          {/* videoXem trước */}
          {group.videoUrl && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Film className="h-3.5 w-3.5 text-green-500" />
                <span className="text-xs text-green-600 dark:text-green-400">videođã tạo</span>
              </div>
              <video
                src={group.videoUrl}
                controls
                className="w-full max-h-48 rounded"
                preload="metadata"
              />
            </div>
          )}
        </div>
      )}

      {/* 错误信息 */}
      {isFailed && group.videoError && (
        <div className="px-3 py-1.5 border-t bg-red-500/5">
          <div className="flex items-start gap-1.5">
            <AlertCircle className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
            <span className="text-xs text-red-500">{group.videoError}</span>
          </div>
        </div>
      )}

      {/* ========== @tham chiếuQuản lýpanel ========== */}
      {showRefManager && (
        <GroupRefManager
          group={group}
          scenes={scenes}
          characters={characters}
          sceneLibrary={sceneLibrary}
          readOnly={isGenerating}
        />
      )}

      {/* ========== Mở rộng的Ống kính卡片 cột表 ========== */}
      {expanded && (
        <div className="border-t">
          <div className="flex flex-col gap-2 p-2">
            {scenes.map((scene) => (
              <div key={scene.id}>{renderSceneCard(scene)}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
