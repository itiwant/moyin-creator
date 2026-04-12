// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Edit Provider Dialog
 * For editing existing API providers
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { IProvider } from "@/lib/api-key-manager";
import { getApiKeyCount } from "@/lib/api-key-manager";

interface EditProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: IProvider | null;
  onSave: (provider: IProvider) => void;
}

export function EditProviderDialog({
  open,
  onOpenChange,
  provider,
  onSave,
}: EditProviderDialogProps) {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");

  // Initialize form when provider changes
  useEffect(() => {
    if (provider) {
      setName(provider.name);
      setBaseUrl(provider.baseUrl);
      setApiKey(provider.apiKey);
      // 加载hiện cóModel
      setModel(provider.model?.join(', ') || '');
    }
  }, [provider]);

  const handleSave = () => {
    if (!provider) return;

    if (!name.trim()) {
      toast.error("NhậpTên");
      return;
    }

    // Phân tíchModel cột表（Hỗ trợ逗号hoặc换 hàngngăn cách）
    const models = model
      .split(/[,\n]/)
      .map(m => m.trim())
      .filter(m => m.length > 0);

    onSave({
      ...provider,
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: models,
    });

    onOpenChange(false);
    toast.success("Đã lưu thay đổi");
  };

  const keyCount = getApiKeyCount(apiKey);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Chỉnh sửaNhà cung cấp</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {/* Platform (read-only) */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Nền tảng</Label>
            <Input value={provider?.platform || ""} disabled className="bg-muted" />
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label>Tên</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nhà cung cấpTên"
            />
          </div>

          {/* Base URL */}
          <div className="space-y-2">
            <Label>Base URL</Label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
            />
          </div>

          {/* API Keys */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>API Keys</Label>
              <span className="text-xs text-muted-foreground">
                {keyCount} Key
              </span>
            </div>
            <Textarea
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Nhập API Keys (mỗi dòng một, hoặc ngăn cách bằng dấu phẩy)"
              className="font-mono text-sm min-h-[100px]"
            />
            <p className="text-xs text-muted-foreground">
              💡 Hỗ trợ xoay vòng nhiều Key, khi Thất bại tự động chuyển sang key tiếp theo
            </p>
          </div>

          {/* Model */}
          <div className="space-y-2">
            <Label>Model</Label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Nhập tên Model, ví dụ deepseek-v3"
            />
            <p className="text-xs text-muted-foreground">
              Nhiều Model ngăn cách bằng dấu phẩy, cái đầu tiên là Model mặc định
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={handleSave}>Lưu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
