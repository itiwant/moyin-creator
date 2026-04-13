// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  IMAGE_HOST_PRESETS,
  type ImageHostProvider,
  type ImageHostPlatform,
} from "@/stores/api-config-store";

interface AddImageHostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (provider: Omit<ImageHostProvider, "id">) => void;
}

export function AddImageHostDialog({
  open,
  onOpenChange,
  onSubmit,
}: AddImageHostDialogProps) {
  const [platform, setPlatform] = useState<ImageHostPlatform>("scdn");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [uploadPath, setUploadPath] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [apiKeyParam, setApiKeyParam] = useState("");
  const [apiKeyHeader, setApiKeyHeader] = useState("");
  const [apiKeyFormField, setApiKeyFormField] = useState("");
  const [apiKeyOptional, setApiKeyOptional] = useState(false);
  const [expirationParam, setExpirationParam] = useState("");
  const [imageField, setImageField] = useState("");
  const [imagePayloadType, setImagePayloadType] = useState<ImageHostProvider["imagePayloadType"]>("base64");
  const [nameField, setNameField] = useState("");
  const [staticFormFields, setStaticFormFields] = useState<Record<string, string> | undefined>(undefined);
  const [responseUrlField, setResponseUrlField] = useState("");
  const [responseDeleteUrlField, setResponseDeleteUrlField] = useState("");

  const selectedPreset = IMAGE_HOST_PRESETS.find((p) => p.platform === platform);
  const apiKeyLabel = platform === "imgurl"
    ? "Tải lên Tokens"
    : platform === "scdn"
      ? "API Key (không cần điền)"
    : platform === "catbox"
      ? "Userhash(tùy chọn)"
      : "API Keys";
  const apiKeyRequiredMessage = platform === "imgurl" ? "NhậpTải lên Token" : "Nhập API Key";
  const apiKeyPlaceholder = platform === "imgurl"
    ? "Nhập Giá trị Token Tải lên / Authorization (mỗi dòng một; nếu cần Bearer, vui lòng điền thủ công giá trị đầy đủ)"
    : platform === "scdn"
      ? "Để trống, SCDN hỗ trợ tải lên trực tiếp"
    : platform === "catbox"
      ? "Có thể để trống để tải lên ẩn danh; nếu muốn liên kết với tài khoản Catbox, hãy điền userhash"
    : "Nhập API Keys (mỗi dòng một, hoặc ngăn cách bằng dấu phẩy)";

  useEffect(() => {
    if (open) {
      const defaultPreset = IMAGE_HOST_PRESETS.find((preset) => preset.platform === "scdn") || IMAGE_HOST_PRESETS[0];
      setPlatform(defaultPreset.platform as ImageHostPlatform);
      setName(defaultPreset.name || "");
      setBaseUrl(defaultPreset.baseUrl || "");
      setUploadPath(defaultPreset.uploadPath || "");
      setApiKey("");
      setEnabled(defaultPreset.enabled ?? true);
      setApiKeyParam(defaultPreset.apiKeyParam || "");
      setApiKeyHeader(defaultPreset.apiKeyHeader || "");
      setApiKeyFormField(defaultPreset.apiKeyFormField || "");
      setApiKeyOptional(defaultPreset.apiKeyOptional ?? false);
      setExpirationParam(defaultPreset.expirationParam || "");
      setImageField(defaultPreset.imageField || "");
      setImagePayloadType(defaultPreset.imagePayloadType || "base64");
      setNameField(defaultPreset.nameField || "");
      setStaticFormFields(defaultPreset.staticFormFields);
      setResponseUrlField(defaultPreset.responseUrlField || "");
      setResponseDeleteUrlField(defaultPreset.responseDeleteUrlField || "");
    }
  }, [open]);

  useEffect(() => {
    if (selectedPreset) {
      setName(selectedPreset.name || "");
      setBaseUrl(selectedPreset.baseUrl || "");
      setUploadPath(selectedPreset.uploadPath || "");
      setEnabled(selectedPreset.enabled ?? true);
      setApiKeyParam(selectedPreset.apiKeyParam || "");
      setApiKeyHeader(selectedPreset.apiKeyHeader || "");
      setApiKeyFormField(selectedPreset.apiKeyFormField || "");
      setApiKeyOptional(selectedPreset.apiKeyOptional ?? false);
      setExpirationParam(selectedPreset.expirationParam || "");
      setImageField(selectedPreset.imageField || "");
      setImagePayloadType(selectedPreset.imagePayloadType || "base64");
      setNameField(selectedPreset.nameField || "");
      setStaticFormFields(selectedPreset.staticFormFields);
      setResponseUrlField(selectedPreset.responseUrlField || "");
      setResponseDeleteUrlField(selectedPreset.responseDeleteUrlField || "");
    }
  }, [selectedPreset]);

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error("NhậpTên");
      return;
    }
    if (!baseUrl.trim() && !uploadPath.trim()) {
      toast.error("Vui lòng cấu hình Base URL hoặc Upload Path");
      return;
    }
    if (!apiKey.trim() && !apiKeyOptional) {
      toast.error(apiKeyRequiredMessage);
      return;
    }

    onSubmit({
      platform,
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      uploadPath: uploadPath.trim(),
      apiKey: apiKey.trim(),
      enabled,
      apiKeyParam: apiKeyParam.trim() || undefined,
      apiKeyHeader: apiKeyHeader.trim() || undefined,
      apiKeyFormField: apiKeyFormField.trim() || undefined,
      apiKeyOptional,
      expirationParam: expirationParam.trim() || undefined,
      imageField: imageField.trim() || undefined,
      imagePayloadType,
      nameField: nameField.trim() || undefined,
      staticFormFields,
      responseUrlField: responseUrlField.trim() || undefined,
      responseDeleteUrlField: responseDeleteUrlField.trim() || undefined,
    });

    onOpenChange(false);
    toast.success(`Đã thêm ${name}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>ThêmDịch vụ lưu trữ ảnh</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4 overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label>Nền tảng</Label>
            <Select value={platform} onValueChange={(v) => setPlatform(v as ImageHostPlatform)}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn nền tảng" />
              </SelectTrigger>
              <SelectContent>
                {IMAGE_HOST_PRESETS.map((preset) => (
                  <SelectItem key={preset.platform} value={preset.platform}>
                    {preset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tên</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lưu trữ ảnhTên" />
          </div>

          <div className="space-y-2">
            <Label>Base URL</Label>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com" />
          </div>

          <div className="space-y-2">
            <Label>Upload Path / URL</Label>
            <Input value={uploadPath} onChange={(e) => setUploadPath(e.target.value)} placeholder="/upload hoặc URL đầy đủ" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{apiKeyLabel}</Label>
            </div>
            <Textarea
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={apiKeyPlaceholder}
              className="font-mono text-sm min-h-[80px]"
            />
            {platform === "imgbb" && (
              <p className="text-xs text-red-500">
                ImgBB hiện có vấn đề về tính khả dụng, mặc định giữ đóng; khuyến nghị ưu tiên dùng Catbox.
              </p>
            )}
            {platform === "imgurl" && (
              <p className="text-xs text-muted-foreground">
                Sử dụng Token Tải lên (V3) trong giao diện mở của ImgURL/Zpic, hỗ trợ xoay vòng nhiều Token.
              </p>
            )}
            {platform === "scdn" && (
              <p className="text-xs text-muted-foreground">
                Dịch vụ lưu trữ ảnh SCDN hỗ trợ tải lên trực tiếp, hiện phù hợp hơn để dùng làm dịch vụ lưu trữ ảnh mặc định.
              </p>
            )}
            {platform === "catbox" && (
              <p className="text-xs text-muted-foreground">
                Catbox là dịch vụ lưu trữ ảnh nước ngoài; nếu mạng hiện tại không kết nối được, nên chuyển sang dùng SCDN hoặc Lưu trữ ảnh tùy chỉnh.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Label>Bật</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Cấu hình nâng cao (tùy chọn)</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tham số Query API Key</Label>
                <Input value={apiKeyParam} onChange={(e) => setApiKeyParam(e.target.value)} placeholder="key" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">API Key Header</Label>
                <Input value={apiKeyHeader} onChange={(e) => setApiKeyHeader(e.target.value)} placeholder="Authorization" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tham số hết hạn</Label>
                <Input value={expirationParam} onChange={(e) => setExpirationParam(e.target.value)} placeholder="expiration" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tên trường ảnh</Label>
                <Input value={imageField} onChange={(e) => setImageField(e.target.value)} placeholder="image" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tên trường tên</Label>
                <Input value={nameField} onChange={(e) => setNameField(e.target.value)} placeholder="name" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Trường URL quay về</Label>
                <Input value={responseUrlField} onChange={(e) => setResponseUrlField(e.target.value)} placeholder="data.url" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Trường URL xóa</Label>
                <Input value={responseDeleteUrlField} onChange={(e) => setResponseDeleteUrlField(e.target.value)} placeholder="data.delete_url" />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button onClick={handleSubmit}>Thêm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
