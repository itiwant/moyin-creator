// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Angle Switch Result Dialog
 * Chuyển góc nhìnkết quảXem trướcChat框
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, X, RotateCw, Download } from "lucide-react";

export interface AngleSwitchResult {
  originalImage: string;
  newImage: string;
  angleLabel: string;
}

export interface AngleSwitchHistoryItem {
  imageUrl: string;
  angleLabel: string;
  timestamp: number;
}

export interface AngleSwitchResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: AngleSwitchResult | null;
  history?: AngleSwitchHistoryItem[];
  selectedHistoryIndex?: number;
  onSelectHistory?: (index: number) => void;
  onApply: () => void;
  onRegenerate: () => void;
  onPreviewInCenter?: (imageUrl: string, label: string) => void;
}

export function AngleSwitchResultDialog({
  open,
  onOpenChange,
  result,
  history = [],
  selectedHistoryIndex = -1,
  onSelectHistory,
  onApply,
  onRegenerate,
  onPreviewInCenter,
}: AngleSwitchResultDialogProps) {
  if (!result) return null;

  const currentImage = selectedHistoryIndex >= 0 && history[selectedHistoryIndex]
    ? history[selectedHistoryIndex].imageUrl
    : result.newImage;
  const currentLabel = selectedHistoryIndex >= 0 && history[selectedHistoryIndex]
    ? history[selectedHistoryIndex].angleLabel
    : result.angleLabel;

  const handleImageClick = (imageUrl: string, label: string) => {
    if (onPreviewInCenter) {
      onPreviewInCenter(imageUrl, label);
    }
  };

  const handleDownload = async (imageUrl: string, filename: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-sm">Chuyển góc nhìn - Chọn kết quả</DialogTitle>
          <DialogDescription className="sr-only">
            So sánh ảnh gốc và kết quả tạo, chọn và áp dụng góc nhìn mới
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* So sánh hiện tại */}
          <div className="grid grid-cols-2 gap-3">
            {/* Ảnh gốc */}
            <div>
              <div className="text-xs text-muted-foreground mb-1">Ảnh gốc</div>
              <div className="aspect-video bg-muted rounded overflow-hidden border-2 border-border">
                <img
                  src={result.originalImage}
                  alt="Ảnh gốc"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Đang chọn */}
            <div>
              <div className="text-xs text-primary mb-1">Đang chọn</div>
              <div className="aspect-video bg-muted rounded overflow-hidden border-2 border-primary">
                <img
                  src={currentImage}
                  alt="Đang chọn"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="text-xs text-center mt-1 text-muted-foreground">{currentLabel}</div>
            </div>
          </div>

          {/* Lịch sử */}
          {history.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-2">Lịch sử ({history.length}张)</div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {history.map((item, index) => (
                  <button
                    key={item.timestamp}
                    onClick={() => onSelectHistory?.(index)}
                    className={`shrink-0 w-32 aspect-video rounded overflow-hidden border-2 transition-all ${
                      selectedHistoryIndex === index
                        ? "border-primary ring-2 ring-primary ring-offset-1"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.angleLabel}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => handleDownload(result.newImage, `angle-switch-${Date.now()}.png`)}
          >
            <Download className="h-4 w-4 mr-2" />
            Tải xuống
          </Button>
          <Button variant="outline" onClick={onRegenerate}>
            <RotateCw className="h-4 w-4 mr-2" />
            Tạo lại
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />
            Hủy
          </Button>
          <Button onClick={onApply}>
            <Check className="h-4 w-4 mr-2" />
            Áp dụng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
