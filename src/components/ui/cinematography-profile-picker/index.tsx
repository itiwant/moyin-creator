// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * CinematographyProfilePicker — 摄影风格档案Chọn器
 *
 * 功能：
 * - 左侧：按phân loại显示档案列表（emoji + 名称）
 * - 右侧：悬停/đã chọn时显示详细Mô tả、摄影参数、Tham chiếu影片
 * - 支持 Popover popup出chế độ和内嵌chế độ
 */

import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, Camera } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CINEMATOGRAPHY_PROFILE_CATEGORIES,
  CINEMATOGRAPHY_PROFILES,
  getCinematographyProfile,
  type CinematographyProfile,
} from "@/lib/constants/cinematography-profiles";
import { getMediaType, MEDIA_TYPE_LABELS, type MediaType } from "@/lib/constants/visual-styles";
import { isFieldSkipped } from "@/lib/generation/media-type-tokens";

interface CinematographyProfilePickerProps {
  /** ID hồ sơ đang chọn */
  value: string;
  /** Callback khi chọn thay đổi */
  onChange: (profileId: string) => void;
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
  /** ID phong cách thị giác hiện tại (để hiển thị gợi ý thích nghi phương tiện) */
  styleId?: string;
}

/**
 * 摄影风格档案Chọn器
 */
export function CinematographyProfilePicker({
  value,
  onChange,
  popover = true,
  trigger,
  className,
  disabled = false,
  placeholder = "Chọn phong cách nhiếp ảnh",
  styleId,
}: CinematographyProfilePickerProps) {
  const [hoveredProfile, setHoveredProfile] = useState<CinematographyProfile | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // 获取Đang chọn的档案
  const selectedProfile = useMemo(() => getCinematographyProfile(value), [value]);

  // 预览的档案（悬停优先，否则显示đã chọn的，兆底第一）
  const previewProfile = hoveredProfile || selectedProfile || CINEMATOGRAPHY_PROFILES[0];

  // 媒介类型适配提示
  const mediaType: MediaType | undefined = styleId ? getMediaType(styleId) : undefined;
  const showAdaptHint = mediaType && mediaType !== 'cinematic';

  // 处理Chọn
  const handleSelect = (profile: CinematographyProfile) => {
    onChange(profile.id);
    if (popover) {
      setIsOpen(false);
    }
  };

  // Nội dungpanel
  const pickerContent = (
    <div className={cn("flex", popover ? "w-[560px] h-[420px]" : "w-full h-full", className)}>
      {/* Bên trái: danh sách hồ sơ */}
      <ScrollArea className="w-[220px] border-r border-border">
        <div className="p-2">
          {CINEMATOGRAPHY_PROFILE_CATEGORIES.map((category) => (
            <div key={category.id} className="mb-4">
              {/* Tiêu đề phân loại */}
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b border-border/50 mb-2">
                {category.emoji} {category.name}
              </div>
              {/* Danh sách hồ sơ */}
              <div className="space-y-1">
                {category.profiles.map((profile) => (
                  <ProfileItem
                    key={profile.id}
                    profile={profile}
                    isSelected={value === profile.id}
                    onSelect={() => handleSelect(profile)}
                    onHover={() => setHoveredProfile(profile)}
                    onLeave={() => setHoveredProfile(null)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Bên phải: Xem trước */}
      <div className="flex-1 p-4 flex flex-col overflow-hidden">
        {/* Tiêu đề hồ sơ */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">{previewProfile.emoji}</span>
          <div>
            <div className="font-medium text-sm">{previewProfile.name}</div>
            <div className="text-xs text-muted-foreground">{previewProfile.nameEn}</div>
          </div>
        </div>

        {/* Mô tả */}
        <div className="text-xs text-muted-foreground mb-3 leading-relaxed">
          {previewProfile.description}
        </div>

        {/* Gợi ý thích nghi phương tiện */}
        {showAdaptHint && (
          <div className="text-xs mb-3 px-2 py-1.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            ⓘ Phong cách thị giác hiện tại là phương tiện「{MEDIA_TYPE_LABELS[mediaType]}」, tham số nhiếp ảnh sẽ tự động thích nghi
            {isFieldSkipped(mediaType, 'cameraRig') && '(Thiết bị/Độ sâu/Chuyển tiêu sẽ bị bỏ qua)'}
          </div>
        )}

        {/* Tổng quan tham số nhiếp ảnh */}
        <ScrollArea className="flex-1 mb-3">
          <div className="space-y-2 text-xs">
            <ParamRow
              label="💡 Ánh sáng"
              value={`${previewProfile.defaultLighting.style} · ${previewProfile.defaultLighting.direction} · ${previewProfile.defaultLighting.colorTemperature}`}
            />
            <ParamRow
              label="🔭 Tiêu điểm"
              value={`${previewProfile.defaultFocus.depthOfField} · ${previewProfile.defaultFocus.focusTransition}`}
            />
            <ParamRow
              label="🎥 Thiết bị"
              value={`${previewProfile.defaultRig.cameraRig} · ${previewProfile.defaultRig.movementSpeed}`}
            />
            {previewProfile.defaultAtmosphere.effects.length > 0 && (
              <ParamRow
                label="🌫️ 氛围"
                value={`${previewProfile.defaultAtmosphere.effects.join(" + ")} (${previewProfile.defaultAtmosphere.intensity})`}
              />
            )}
            <ParamRow
              label="⏱️ Tốc độ"
              value={previewProfile.defaultSpeed.playbackSpeed}
            />
          </div>
        </ScrollArea>

        {/* Tham chiếu影片 */}
        <div className="border-t border-border/50 pt-2">
          <div className="text-xs text-muted-foreground mb-1">🎞️ Tham chiếu影片</div>
          <div className="flex flex-wrap gap-1">
            {previewProfile.referenceFilms.map((film) => (
              <span
                key={film}
                className="inline-block px-1.5 py-0.5 text-xs bg-muted rounded"
              >
                {film}
              </span>
            ))}
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
                {selectedProfile ? (
                  <>
                    <span>{selectedProfile.emoji}</span>
                    <span>{selectedProfile.name}</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{placeholder}</span>
                  </>
                )}
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
 * 单档案项
 */
interface ProfileItemProps {
  profile: CinematographyProfile;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
  onLeave: () => void;
}

function ProfileItem({ profile, isSelected, onSelect, onHover, onLeave }: ProfileItemProps) {
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
      {/* Emoji */}
      <span className="text-base flex-shrink-0">{profile.emoji}</span>
      {/* Tên */}
      <span className="flex-1 text-left text-sm truncate">{profile.name}</span>
      {/* đã chọn标记 */}
      {isSelected && (
        <Check className="w-4 h-4 text-primary flex-shrink-0" />
      )}
    </button>
  );
}

/**
 * 参数行
 */
function ParamRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground whitespace-nowrap">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

export default CinematographyProfilePicker;
