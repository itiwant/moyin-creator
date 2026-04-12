// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * StylePicker - 统一的Thị giác风格Chọn器
 * 
 * chức năng：
 * - 左侧：phân loại小图列表，可滚动
 * - bên phải：悬停/đã chọn时显示大图预览 + Mô tả
 * - 支持下拉popup出chế độ和内嵌chế độ
 */

import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  STYLE_CATEGORIES,
  VISUAL_STYLE_PRESETS,
  getStyleById,
  type StylePreset,
  type VisualStyleId,
} from "@/lib/constants/visual-styles";
import { useCustomStyleStore } from "@/stores/custom-style-store";

// 风格phân loại对应的背景色（ảnh已xóa，Sử dụng色块Placeholder）
const CATEGORY_COLORS: Record<string, string> = {
  '3d': 'bg-blue-500/20 text-blue-600',
  '2d': 'bg-green-500/20 text-green-600',
  'real': 'bg-amber-500/20 text-amber-600',
  'stop_motion': 'bg-purple-500/20 text-purple-600',
};

interface StylePickerProps {
  /** ID phong cách đang chọn */
  value: string;
  /** Callback khi chọn thay đổi */
  onChange: (styleId: VisualStyleId) => void;
  /** Có dùng chế độ popup thả xuống (mặc định true) */
  popover?: boolean;
  /** Trigger tùy chỉnh (chỉ chế độ popover) */
  trigger?: React.ReactNode;
  /** Tên class tùy chỉnh */
  className?: string;
  /** Trạng thái vô hiệu */
  disabled?: boolean;
  /** Văn bản Placeholder khi chưa chọn */
  placeholder?: string;
}

/**
 * 风格Chọn器组件
 */
export function StylePicker({
  value,
  onChange,
  popover = true,
  trigger,
  className,
  disabled = false,
  placeholder = "Chọn phong cách",
}: StylePickerProps) {
  const [hoveredStyle, setHoveredStyle] = useState<StylePreset | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // 用户Tùy chỉnh风格（用户dữ liệu，存储在 localStorage）
  const customStyles = useCustomStyleStore((s) => s.styles);
  const customAsPresets: StylePreset[] = useMemo(() =>
    customStyles.map((s) => ({
      id: s.id,
      name: s.name,
      category: '2d' as const,
      mediaType: 'animation' as const,
      prompt: s.prompt || '',
      negativePrompt: s.negativePrompt || '',
      description: s.description || '',
      thumbnail: '',
    })),
    [customStyles]
  );

  // 获取Đang chọn的风格（内置 + Tùy chỉnh）
  const selectedStyle = useMemo(() => getStyleById(value), [value]);

  // 预览的风格（悬停优先，否则显示đã chọn的）
  const previewStyle = hoveredStyle || selectedStyle || VISUAL_STYLE_PRESETS[0];

  // 处理Chọn
  const handleSelect = (style: StylePreset) => {
    onChange(style.id as VisualStyleId);
    if (popover) {
      setIsOpen(false);
    }
  };

  // Nội dungpanel
  const pickerContent = (
    <div className={cn("flex", popover ? "w-[520px] h-[400px]" : "w-full h-full", className)}>
      {/* Bên trái: danh sách phong cách */}
      <ScrollArea className="w-[240px] border-r border-border">
        <div className="p-2">
          {STYLE_CATEGORIES.map((category) => (
            <div key={category.id} className="mb-4">
              {/* Tiêu đề phân loại */}
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b border-border/50 mb-2">
                {category.name}
              </div>
              {/* Danh sách phong cách */}
              <div className="space-y-1">
                {category.styles.map((style) => (
                  <StyleItem
                    key={style.id}
                    style={style}
                    isSelected={value === style.id}
                    onSelect={() => handleSelect(style)}
                    onHover={() => setHoveredStyle(style)}
                    onLeave={() => setHoveredStyle(null)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Phong cách tùy chỉnh của người dùng (tài sản người dùng) */}
          {customAsPresets.length > 0 && (
            <div className="mb-4">
              <div className="px-2 py-1.5 text-xs font-medium text-primary border-b border-primary/30 mb-2">
                Phong cách của tôi
              </div>
              <div className="space-y-1">
                {customAsPresets.map((style) => (
                  <StyleItem
                    key={style.id}
                    style={style}
                    isSelected={value === style.id}
                    isCustom
                    onSelect={() => handleSelect(style)}
                    onHover={() => setHoveredStyle(style)}
                    onLeave={() => setHoveredStyle(null)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Bên phải: Thông tin xem trước */}
      <div className="flex-1 p-4 flex flex-col">
        {/* Màu sắc Placeholder + Tên phong cách */}
        <div className={cn(
          "flex-1 flex flex-col items-center justify-center rounded-lg mb-3",
          CATEGORY_COLORS[previewStyle.category] || 'bg-muted/30'
        )}>
          <div className="text-2xl font-bold mb-2">{previewStyle.name}</div>
          <div className="text-xs opacity-70">{previewStyle.category.toUpperCase()} · {previewStyle.mediaType}</div>
        </div>
        {/* Thông tin phong cách */}
        <div className="text-center">
          <div className="font-medium text-sm mb-1">{previewStyle.name}</div>
          <div className="text-xs text-muted-foreground line-clamp-2">
            {previewStyle.description}
          </div>
        </div>
      </div>
    </div>
  );

  // 下拉chế độ
  if (popover) {
    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild disabled={disabled}>
          {trigger || (
            <button
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background",
                "hover:bg-accent hover:text-accent-foreground",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "text-sm w-full justify-between"
              )}
              disabled={disabled}
            >
              <div className="flex items-center gap-2">
                {selectedStyle && (
                  <span className={cn(
                    "w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold",
                    selectedStyle.id.startsWith('custom_style_')
                      ? 'bg-primary/20 text-primary'
                      : CATEGORY_COLORS[selectedStyle.category] || 'bg-muted'
                  )}>
                    {selectedStyle.id.startsWith('custom_style_') ? '★' : selectedStyle.category === '3d' ? '3D' : selectedStyle.category === '2d' ? '2D' : selectedStyle.category === 'real' ? 'Thực' : 'Tùy'}
                  </span>
                )}
                <span className={!selectedStyle ? "text-muted-foreground" : ""}>
                  {selectedStyle?.name || placeholder}
                </span>
              </div>
              <svg
                className="w-4 h-4 opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-auto"
          align="start"
          sideOffset={4}
        >
          {pickerContent}
        </PopoverContent>
      </Popover>
    );
  }

  // 内嵌chế độ
  return pickerContent;
}

/**
 * 单风格项
 */
interface StyleItemProps {
  style: StylePreset;
  isSelected: boolean;
  isCustom?: boolean;
  onSelect: () => void;
  onHover: () => void;
  onLeave: () => void;
}

function StyleItem({ style, isSelected, isCustom, onSelect, onHover, onLeave }: StyleItemProps) {
  return (
    <button
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors",
        "hover:bg-accent",
        isSelected && "bg-accent"
      )}
      onClick={onSelect}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      {/* Màu sắc Placeholder */}
      <span className={cn(
        "w-10 h-10 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0",
        isCustom ? 'bg-primary/20 text-primary' : CATEGORY_COLORS[style.category] || 'bg-muted'
      )}>
        {isCustom ? '★' : style.category === '3d' ? '3D' : style.category === '2d' ? '2D' : style.category === 'real' ? 'Thực' : 'Tùy'}
      </span>
      {/* Tên */}
      <span className="flex-1 text-left text-sm truncate">{style.name}</span>
      {/* Dấu đã chọn */}
      {isSelected && (
        <Check className="w-4 h-4 text-primary flex-shrink-0" />
      )}
    </button>
  );
}

export default StylePicker;
