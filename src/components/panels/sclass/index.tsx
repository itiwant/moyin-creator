// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Hạng Spanel — Seedance 2.0 多模态Sáng tácpanel
 * 
 * 复用 director-store 的Phân cảnhdữ liệu（SplitScene[]），
 * 以「nhóm」为核心thực hiện多Ống kính合并tự sựTạo video。
 * 
 * 两种chế độ：
 * - Phân cảnhchế độ：从Kịch bản流水线Nhập的Phân cảnh，按组Tạo video
 * - Tự dochế độ：纯Phương tiệnTải lên + prompt（后续实现）
 */

import { useEffect } from "react";
import { useDirectorStore, useActiveDirectorProject } from "@/stores/director-store";
import { useProjectStore } from "@/stores/project-store";
import { useMediaPanelStore } from "@/stores/media-panel-store";
import { useSClassStore } from "@/stores/sclass-store";
import { SClassScenes } from "./sclass-scenes";
import { Button } from "@/components/ui/button";
import { Settings, Sparkles } from "lucide-react";

export function SClassView() {
  // Sync active project ID from project-store
  const { activeProjectId } = useProjectStore();
  const { setActiveProjectId, ensureProject } = useDirectorStore();
  const { setActiveProjectId: setSClassProjectId, ensureProject: ensureSClassProject } = useSClassStore();
  
  useEffect(() => {
    if (activeProjectId) {
      setActiveProjectId(activeProjectId);
      ensureProject(activeProjectId);
      // Sync sclass-store project as well
      setSClassProjectId(activeProjectId);
      ensureSClassProject(activeProjectId);
    }
  }, [activeProjectId, setActiveProjectId, ensureProject, setSClassProjectId, ensureSClassProject]);
  
  // Get current project data
  const projectData = useActiveDirectorProject();
  const splitScenes = projectData?.splitScenes || [];
  const storyboardStatus = projectData?.storyboardStatus || 'idle';
  
  const { setActiveTab } = useMediaPanelStore();

  // 判断是否有Phân cảnhdữ liệu可用
  const hasSplitScenes = splitScenes.length > 0;
  
  // Render empty state when no split scenes available
  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
      <Sparkles className="h-12 w-12 text-muted-foreground/30" />
      <div>
        <h3 className="font-medium text-sm mb-1">Hạng S · Seedance 2.0 Sáng tạo đa phương thức</h3>
        <p className="text-xs text-muted-foreground max-w-[280px]">
          Vui lòng nhấp <span className="text-green-500 font-medium">+</span> Thêm phân cảnh vào panel này, hệ thống sẽ tự động phân nhóm ống kính, hợp nhất tự sự và Tạo video.
        </p>
        <p className="text-xs text-muted-foreground/60 mt-2 max-w-[280px]">
          Nếu chưa thấy cấu trúc kịch bản ở bên phải, vui lòng nhập và phân tích kịch bản trong panel "Kịch bản" trước.
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setActiveTab('script')}
        >
          Đến panel Kịch bản
        </Button>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-3 pb-2 bg-panel">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Hạng S</h2>
            <span className="text-xs text-muted-foreground">Seedance 2.0</span>
          </div>
          <div className="flex items-center gap-2">
            {hasSplitScenes && (
              <span className="text-xs text-muted-foreground">
                {splitScenes.length} phân cảnh
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setActiveTab('settings')}
            >
              <Settings className="h-3 w-3 mr-1" />
              API
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 pt-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {hasSplitScenes || storyboardStatus === 'editing' ? (
          <SClassScenes />
        ) : (
          renderEmptyState()
        )}
      </div>
    </div>
  );
}
