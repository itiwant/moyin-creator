// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Quad Grid Dialog - Lưới 4 ôTạo对话框
 * 基于锚点图Tạo2x2一致性biến thể
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Grid2X2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type QuadVariationType = "angle" | "composition" | "moment";

export interface QuadGridDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (variationType: QuadVariationType, useCharacterRef: boolean) => void | Promise<void>;
  frameType?: "start" | "end";
  previewUrl?: string;
  isGenerating?: boolean;
}

const VARIATION_OPTIONS: {
  type: QuadVariationType;
  label: string;
  description: string;
  variations: string[];
}[] = [
  {
    type: "angle",
    label: "Góc nhìnbiến thể",
    description: "同一Cảnh的4个不同Góc nhìn",
    variations: ["正面偏左", "正面偏右", "侧面Cận cảnh", "Toàn cảnh俯瞰"],
  },
  {
    type: "composition",
    label: "构图biến thể",
    description: "同一Cảnh的4种不同构图",
    variations: ["全身Toàn cảnh xa", "半身Cảnh trung", "面部Cận cảnh", "môi trường交代"],
  },
  {
    type: "moment",
    label: "时刻biến thể",
    description: "Hành động的4个Thời gian节点",
    variations: ["Hành động起始", "Hành động过程", "Hành động高潮", "Hành động结束"],
  },
];

export function QuadGridDialog({
  open,
  onOpenChange,
  onGenerate,
  frameType = "start",
  previewUrl,
  isGenerating = false,
}: QuadGridDialogProps) {
  const [selectedType, setSelectedType] = useState<QuadVariationType>("angle");
  const [useCharacterRef, setUseCharacterRef] = useState(false);

  const selectedOption = VARIATION_OPTIONS.find((o) => o.type === selectedType);

  const handleGenerate = () => {
    onGenerate(selectedType, useCharacterRef);
  };

  // Tạo期间禁止Đóng对话框
  const handleOpenChange = (newOpen: boolean) => {
    if (isGenerating && !newOpen) return; // Đang tạo不允许Đóng
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="max-w-md p-4 bg-zinc-900 border-zinc-800"
        onEscapeKeyDown={(e) => isGenerating && e.preventDefault()}
        onPointerDownOutside={(e) => isGenerating && e.preventDefault()}
      >
        <DialogHeader className="pb-2">
          <DialogTitle className="text-sm text-white flex items-center gap-2">
            <Grid2X2 className="h-4 w-4 text-cyan-400" />
            Lưới 4 ôTạo - {frameType === "start" ? "Khung hình đầu" : "Khung hình cuối"}
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            基于当前ảnhTạo4张一致性biến thể，继承人物/Cảnh/光色
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Xem trước图 */}
          {previewUrl && (
            <div className="flex justify-center">
              <div className="relative w-40 aspect-video rounded overflow-hidden border border-zinc-700">
                <img
                  src={previewUrl}
                  alt="锚点图"
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-1 left-1 text-[10px] bg-cyan-500/80 text-white px-1.5 py-0.5 rounded">
                  锚点图
                </span>
              </div>
            </div>
          )}

          {/* biến thểLoại选择 */}
          <div className="space-y-2">
            <Label className="text-xs text-zinc-400">选择biến thểLoại</Label>
            <div className="grid grid-cols-3 gap-2">
              {VARIATION_OPTIONS.map((option) => (
                <button
                  key={option.type}
                  onClick={() => setSelectedType(option.type)}
                  disabled={isGenerating}
                  className={cn(
                    "p-2 rounded border text-left transition-all",
                    selectedType === option.type
                      ? "border-cyan-500 bg-cyan-500/10"
                      : "border-zinc-700 hover:border-zinc-600 bg-zinc-800/50"
                  )}
                >
                  <div className="text-xs font-medium text-white">
                    {option.label}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    {option.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Xem trước4格Nội dung */}
          {selectedOption && (
            <div className="p-3 rounded bg-zinc-800/50 border border-zinc-700">
              <div className="text-[10px] text-zinc-500 mb-2">
                将Tạo 2×2 Lưới 4 ô：
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {selectedOption.variations.map((v, i) => (
                  <div
                    key={i}
                    className="text-[10px] text-zinc-300 bg-zinc-700/50 px-2 py-1 rounded"
                  >
                    {i + 1}. {v}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 选项 */}
          <div className="flex items-center space-x-2 px-1">
            <Checkbox 
              id="use-char-ref" 
              checked={useCharacterRef}
              onCheckedChange={(checked) => setUseCharacterRef(checked === true)}
              className="border-zinc-600 data-[state=checked]:bg-cyan-500 data-[state=checked]:border-cyan-500"
            />
            <Label 
              htmlFor="use-char-ref" 
              className="text-xs text-zinc-400 font-normal cursor-pointer select-none leading-none"
            >
              参考Nhân vật库形象（若hình ảnh人物混乱请Đóng此项）
            </Label>
          </div>

          {/* nút */}
          <div className="flex gap-2 pt-2">
            {isGenerating ? (
              <div className="flex-1 flex items-center justify-center gap-2 h-8 bg-cyan-500/20 rounded border border-cyan-500/50">
                <Loader2 className="h-4 w-4 text-cyan-400 animate-spin" />
                <span className="text-sm text-cyan-400">Đang tạoLưới 4 ô，请稍候...</span>
              </div>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  className="flex-1 h-8 text-xs bg-transparent border-zinc-700 hover:bg-zinc-800 text-white"
                >
                  Hủy
                </Button>
                <Button
                  size="sm"
                  onClick={handleGenerate}
                  className="flex-1 h-8 text-xs bg-cyan-500 hover:bg-cyan-600 text-black"
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  TạoLưới 4 ô
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
