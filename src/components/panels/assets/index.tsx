// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * AssetsView - Tài sản面板主入口
 * Điều hướng trái树 + Khu vực nội dung phải
 */

import { useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { AssetSidebar, type AssetSection } from "./AssetSidebar";
import { DefaultStylesGrid } from "./DefaultStylesGrid";
import { CustomStylesGrid } from "./CustomStylesGrid";
import { PropsLibrary } from "./PropsLibrary";

export function AssetsView() {
  const [activeSection, setActiveSection] = useState<AssetSection>("style-default");

  const renderContent = () => {
    switch (activeSection) {
      case "style-default":
        return <DefaultStylesGrid />;
      case "style-custom":
        return <CustomStylesGrid />;
      case "props-library":
        return <PropsLibrary />;
      default:
        return <DefaultStylesGrid />;
    }
  };

  return (
    <div className="h-full">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        {/* Điều hướng trái */}
        <ResizablePanel defaultSize={15} minSize={12} maxSize={25}>
          <AssetSidebar
            activeSection={activeSection}
            onSectionChange={setActiveSection}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Khu vực nội dung phải */}
        <ResizablePanel defaultSize={85} minSize={60}>
          <div className="h-full overflow-hidden">
            {renderContent()}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
