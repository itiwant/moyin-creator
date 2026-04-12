// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * CustomStylesGrid - Tùy chỉnhPhong cách网格
 * 展示用户Tạo的Phong cách，Hỗ trợTạo mới/Chỉnh sửa/Xóa/Sao chép
 */

import { useCustomStyleStore } from "@/stores/custom-style-store";
import { StyleCard } from "./StyleCard";
import { StyleEditor } from "./StyleEditor";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Plus, Pencil, Trash2, Copy } from "lucide-react";

export function CustomStylesGrid() {
  const {
    styles,
    selectedStyleId,
    editingStyleId,
    selectStyle,
    setEditingStyle,
    deleteStyle,
    duplicateStyle,
  } = useCustomStyleStore();

  // 正在Chỉnh sửa → HiệnChỉnh sửa器
  if (editingStyleId !== null) {
    return (
      <StyleEditor
        styleId={editingStyleId}
        onClose={() => setEditingStyle(null)}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">我的Phong cách</h2>
          <span className="text-xs text-muted-foreground">{styles.length} 个</span>
        </div>
        <Button size="sm" onClick={() => setEditingStyle("new")}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Tạo mớiPhong cách
        </Button>
      </div>

      {/* Nội dung区域 */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {styles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <div className="text-sm mb-2">还没有Tùy chỉnhPhong cách</div>
              <div className="text-xs mb-4">Nhấp「Tạo mớiPhong cách」Tạo你的第一个Phong cách</div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingStyle("new")}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Tạo mớiPhong cách
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {styles.map((style) => (
                <ContextMenu key={style.id}>
                  <ContextMenuTrigger>
                    <StyleCard
                      name={style.name}
                      description={style.description}
                      referenceImages={style.referenceImages}
                      isCustom
                      isSelected={selectedStyleId === style.id}
                      onClick={() => selectStyle(style.id)}
                      onDoubleClick={() => setEditingStyle(style.id)}
                    />
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => setEditingStyle(style.id)}>
                      <Pencil className="w-3.5 h-3.5 mr-2" />
                      Chỉnh sửa
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => duplicateStyle(style.id)}>
                      <Copy className="w-3.5 h-3.5 mr-2" />
                      Sao chép
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      variant="destructive"
                      onClick={() => deleteStyle(style.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-2" />
                      Xóa
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
