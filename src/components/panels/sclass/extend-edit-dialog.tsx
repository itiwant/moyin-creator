// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * ExtendEditDialog — videokéo dài / videoChỉnh sửaChat框
 *
 * kéo dàichế độ：Chọn方向 + Thời lượng + Mô tả bổ sung → Tạo extend con组
 * Chỉnh sửachế độ：ChọnChỉnh sửaLoại + Mô tả bổ sung → Tạo edit con组
 */

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Timer, Scissors, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useSClassStore,
  type ShotGroup,
  type ExtendDirection,
  type EditType,
} from "@/stores/sclass-store";

// ==================== Types ====================

export type ExtendEditMode = "extend" | "edit";

export interface ExtendEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ExtendEditMode;
  /** Nhóm nguồn (nhóm đã hoàn thành video) */
  sourceGroup: ShotGroup | null;
  /** Callback sau khi xác nhận: tạo nhóm con và tạo */
  onConfirm: (childGroup: ShotGroup) => void;
  isGenerating?: boolean;
}

// ==================== Constants ====================

const EDIT_TYPE_OPTIONS: { value: EditType; label: string; desc: string }[] = [
  { value: "plot_change", label: "Đảo lộn cốt truyện", desc: "Giữ nguyên phong cách hình ảnh, thay đổi hướng câu chuyện" },
  { value: "character_swap", label: "Thay thế nhân vật", desc: "Thay thế nhân vật trong video bằng nhân vật từ ảnh tham chiếu" },
  { value: "attribute_modify", label: "Chỉnh sửa thuộc tính", desc: "Thay đổi trang phục, màu tóc, ánh sáng môi trường của nhân vật" },
  { value: "element_add", label: "Thêm phần tử", desc: "Chồng lên hình ảnh hiện tại các phần tử thị giác mới" },
];

// ==================== Component ====================

export function ExtendEditDialog({
  open,
  onOpenChange,
  mode,
  sourceGroup,
  onConfirm,
  isGenerating = false,
}: ExtendEditDialogProps) {
  // --- kéo dài参数 ---
  const [direction, setDirection] = useState<ExtendDirection>("backward");
  const [duration, setDuration] = useState(10);

  // --- Chỉnh sửa参数 ---
  const [editType, setEditType] = useState<EditType>("plot_change");

  // --- 共用 ---
  const [description, setDescription] = useState("");

  const { addShotGroup } = useSClassStore();

  const handleConfirm = useCallback(() => {
    if (!sourceGroup || !sourceGroup.videoUrl) return;

    const childId = `${mode}_${Date.now()}_${sourceGroup.id.substring(0, 8)}`;
    const childGroup: ShotGroup = {
      id: childId,
      name: `${sourceGroup.name} - ${mode === "extend" ? "Kéo dài" : "Chỉnh sửa"}`,
      sceneIds: [...sourceGroup.sceneIds],
      sortIndex: sourceGroup.sortIndex + 0.5,
      totalDuration: (mode === "extend"
        ? Math.max(4, Math.min(15, duration))
        : (sourceGroup.totalDuration || 10)) as ShotGroup["totalDuration"],
      videoStatus: "idle",
      videoProgress: 0,
      videoUrl: null,
      videoMediaId: null,
      videoError: null,
      gridImageUrl: null,
      lastPrompt: null,
      mergedPrompt: description.trim() || sourceGroup.mergedPrompt || "",
      history: [],
      imageRefs: [],
      videoRefs: [],
      audioRefs: [],
      generationType: mode,
      extendDirection: mode === "extend" ? direction : undefined,
      editType: mode === "edit" ? editType : undefined,
      sourceGroupId: sourceGroup.id,
      sourceVideoUrl: sourceGroup.videoUrl || undefined,
    };

    addShotGroup(childGroup);
    onConfirm(childGroup);
    onOpenChange(false);

    // Reset form
    setDescription("");
    setDuration(10);
    setDirection("backward");
    setEditType("plot_change");
  }, [sourceGroup, mode, direction, duration, editType, description, addShotGroup, onConfirm, onOpenChange]);

  const isExtend = mode === "extend";
  const title = isExtend ? "videokéo dài" : "videoChỉnh sửa";
  const Icon = isExtend ? Timer : Scissors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={cn("h-4 w-4", isExtend ? "text-purple-500" : "text-orange-500")} />
            {title}
          </DialogTitle>
          <DialogDescription>
            {isExtend
              ? "Tiếp tục kéo dài từ video đã tạo, hỗ trợ mở rộng về sau hoặc về trước"
              : "Thực hiện chỉnh sửa cốt truyện, thay thế nhân vật... trên video đã tạo"
            }
          </DialogDescription>
        </DialogHeader>

        {/* Xem trước video nguồn */}
        {sourceGroup?.videoUrl && (
          <div className="rounded-md overflow-hidden border">
            <video
              src={sourceGroup.videoUrl}
              className="w-full max-h-32 object-cover"
              preload="metadata"
              muted
            />
            <div className="px-2 py-1 bg-muted/30 text-xs text-muted-foreground">
              Nguồn:{sourceGroup.name}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {/* ========== Tham số chế độ kéo dài ========== */}
          {isExtend && (
            <>
              {/* Hướng kéo dài */}
              <div className="space-y-1.5">
                <Label className="text-xs">Hướng kéo dài</Label>
                <Select value={direction} onValueChange={(v) => setDirection(v as ExtendDirection)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="backward">về saukéo dài（Mặc định）</SelectItem>
                    <SelectItem value="forward">Về trước (nội dung trước đó)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* kéo dàiThời lượng */}
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <Label className="text-xs">kéo dàiThời lượng</Label>
                  <span className="text-xs text-muted-foreground">{duration}s</span>
                </div>
                <Slider
                  value={[duration]}
                  onValueChange={(v) => setDuration(v[0])}
                  min={4}
                  max={15}
                  step={1}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>4s</span>
                  <span>15s</span>
                </div>
              </div>
            </>
          )}

          {/* ========== Tham số chế độ chỉnh sửa ========== */}
          {!isExtend && (
            <div className="space-y-1.5">
              <Label className="text-xs">Chỉnh sửaLoại</Label>
              <Select value={editType} onValueChange={(v) => setEditType(v as EditType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EDIT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex flex-col">
                        <span>{opt.label}</span>
                        <span className="text-[10px] text-muted-foreground">{opt.desc}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ========== Mô tả bổ sung ========== */}
          <div className="space-y-1.5">
            <Label className="text-xs">
              Mô tả bổ sung
              <span className="text-muted-foreground ml-1">(tùy chọn)</span>
            </Label>
            <textarea
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              rows={3}
              placeholder={isExtend
                ? "Mô tả nội dung hình ảnh phần kéo dài, ví dụ: Ống kính từ từ lùi ra xa, nhân vật dần khuất..."
                : "Mô tả mục tiêu chỉnh sửa, ví dụ: Đổi cảnh ban ngày thành ban đêm, giữ nguyên nhân vật..."
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
          >
            Hủy
          </Button>
          <Button
            size="sm"
            className={cn(
              isExtend
                ? "bg-purple-600 hover:bg-purple-700 text-white"
                : "bg-orange-600 hover:bg-orange-700 text-white",
            )}
            disabled={isGenerating || !sourceGroup?.videoUrl}
            onClick={handleConfirm}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Đang xử lý
              </>
            ) : (
              <>
                <Icon className="h-3 w-3 mr-1" />
                Xác nhận{isExtend ? "Kéo dài" : "Chỉnh sửa"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
