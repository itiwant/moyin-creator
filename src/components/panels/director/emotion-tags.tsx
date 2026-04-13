// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * cảm xúcThẻChọn组件
 * Hỗ trợ多选、有序排 cột，用于điều khiểnTạo video的Bầu không khí和语气
 */

import { useState } from "react";
import { EMOTION_PRESETS, type EmotionTag } from "@/stores/director-store";
import { Button } from "@/components/ui/button";
import { X, Plus, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface EmotionTagsProps {
  value: EmotionTag[];
  onChange: (tags: EmotionTag[]) => void;
  disabled?: boolean;
}

// 获取Thẻthông tin
function getTagInfo(tagId: EmotionTag) {
  const allTags = [
    ...EMOTION_PRESETS.basic,
    ...EMOTION_PRESETS.atmosphere,
    ...EMOTION_PRESETS.tone,
  ];
  return allTags.find(t => t.id === tagId);
}

export function EmotionTags({ value, onChange, disabled }: EmotionTagsProps) {
  const [isOpen, setIsOpen] = useState(false);

  // ThêmThẻ
  const addTag = (tagId: EmotionTag) => {
    if (!value.includes(tagId)) {
      onChange([...value, tagId]);
    }
  };

  // xóaThẻ
  const removeTag = (tagId: EmotionTag) => {
    onChange(value.filter(t => t !== tagId));
  };

  // kiểm tra是否Đã chọn
  const isSelected = (tagId: EmotionTag) => value.includes(tagId);

  // 渲染Thẻphân loại
  const renderTagGroup = (
    title: string, 
    tags: readonly { id: string; label: string; emoji: string }[]
  ) => (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground px-1">{title}</p>
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => {
          const selected = isSelected(tag.id as EmotionTag);
          return (
            <button
              key={tag.id}
              onClick={() => {
                if (selected) {
                  removeTag(tag.id as EmotionTag);
                } else {
                  addTag(tag.id as EmotionTag);
                }
              }}
              disabled={disabled}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors",
                selected
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-foreground",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <span>{tag.emoji}</span>
              <span>{tag.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      {/* Thẻ đã chọn (hiển thị có thứ tự) */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          {value.map((tagId, index) => {
            const tagInfo = getTagInfo(tagId);
            if (!tagInfo) return null;
            return (
              <div
                key={tagId}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs"
              >
                <span className="text-muted-foreground text-[10px]">{index + 1}.</span>
                <span>{tagInfo.emoji}</span>
                <span>{tagInfo.label}</span>
                {!disabled && (
                  <button
                    onClick={() => removeTag(tagId)}
                    className="ml-0.5 hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ThêmThẻnút */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className="h-7 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Thêm thẻ cảm xúc
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="start">
          <div className="space-y-3">
            <p className="text-sm font-medium">Chọn thẻ cảm xúc</p>
            <p className="text-xs text-muted-foreground">
              Thêm thẻ theo thứ tự, video sẽ thể hiện sự thay đổi cảm xúc theo thứ tự này
            </p>
            {renderTagGroup("Cảm xúc cơ bản", EMOTION_PRESETS.basic)}
            {renderTagGroup("Cảm xúc không khí", EMOTION_PRESETS.atmosphere)}
            {renderTagGroup("Cảm xúc giọng điệu", EMOTION_PRESETS.tone)}
          </div>
        </PopoverContent>
      </Popover>

      {/* Văn bản gợi ý */}
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Thêm thẻ cảm xúc để kiểm soát không khí và giọng điệu video
        </p>
      )}
      {value.length > 1 && (
        <p className="text-xs text-muted-foreground">
          Cảm xúc sẽ theo thứ tự {value.map((t, i) => getTagInfo(t)?.label).filter(Boolean).join(" → ")} thay đổi
        </p>
      )}
    </div>
  );
}
