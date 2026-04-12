// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * StyleEditor - Tùy chỉnhPhong cáchChỉnh sửa器
 * Tạo mới/Chỉnh sửaTùy chỉnhPhong cách，Hỗ trợẢnh tham chiếuTải lên
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useCustomStyleStore, type CustomStyle } from "@/stores/custom-style-store";
import { saveImageToLocal } from "@/lib/image-storage";
import { extractStyleTokens } from "@/lib/ai/style-extractor";
import { LocalImage } from "@/components/ui/local-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, ImagePlus, Save, ArrowLeft, Trash2, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface StyleEditorProps {
  styleId: string | null; // null = Tạo mới, 'new' = Tạo mới, khác = Chỉnh sửa
  onClose: () => void;
}

interface FormData {
  name: string;
  prompt: string;
  negativePrompt: string;
  description: string;
  referenceImages: string[];
  tags: string[];
  styleTokens: string;
  sceneTokens: string;
}

const emptyForm: FormData = {
  name: "",
  prompt: "",
  negativePrompt: "",
  description: "",
  referenceImages: [],
  tags: [],
  styleTokens: "",
  sceneTokens: "",
};

export function StyleEditor({ styleId, onClose }: StyleEditorProps) {
  const { styles, addStyle, updateStyle } = useCustomStyleStore();
  const isNew = !styleId || styleId === "new";
  const existing = isNew ? null : styles.find((s) => s.id === styleId);

  const [form, setForm] = useState<FormData>(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载已有数据
  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name,
        prompt: existing.prompt,
        negativePrompt: existing.negativePrompt,
        description: existing.description,
        referenceImages: [...existing.referenceImages],
        tags: [...existing.tags],
        styleTokens: existing.styleTokens || "",
        sceneTokens: existing.sceneTokens || "",
      });
    } else {
      setForm(emptyForm);
    }
  }, [existing]);

  const updateField = useCallback(
    <K extends keyof FormData>(key: K, value: FormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  // 将 File 转为 data URL
  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Tải lênẢnh tham chiếu
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const newImages: string[] = [];
      for (const file of Array.from(files)) {
        // 转为 data URL 再Lưu（避免 blob: 协议不被 Electron Hỗ trợ）
        const dataUrl = await fileToDataUrl(file);
        const filename = `style_ref_${Date.now()}_${file.name}`;
        const localPath = await saveImageToLocal(dataUrl, "styles", filename);
        newImages.push(localPath);
      }
      setForm((prev) => ({
        ...prev,
        referenceImages: [...prev.referenceImages, ...newImages],
      }));
    } catch (err) {
      console.error("Failed to upload images:", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // xóaẢnh tham chiếu
  const removeImage = (index: number) => {
    setForm((prev) => ({
      ...prev,
      referenceImages: prev.referenceImages.filter((_, i) => i !== index),
    }));
  };

  // AI trích xuất từ khóa phong cách
  const handleExtractStyle = async () => {
    if (!form.prompt.trim() && form.referenceImages.length === 0) {
      toast.warning("Vui lòng nhập Mô tả phong cách hoặc Tải lên ảnh tham chiếu trước");
      return;
    }
    setExtracting(true);
    try {
      const result = await extractStyleTokens(form.prompt, form.referenceImages);
      setForm((prev) => ({
        ...prev,
        styleTokens: result.styleTokens,
        sceneTokens: result.sceneTokens,
        description: prev.description || result.summaryZh,
      }));
      toast.success("Trích xuất phong cách hoàn tất");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Trích xuất thất bại";
      toast.error(msg);
    } finally {
      setExtracting(false);
    }
  };

  // Lưu
  const handleSave = () => {
    if (!form.name.trim()) return;

    const styleData = {
      name: form.name.trim(),
      prompt: form.prompt,
      negativePrompt: form.negativePrompt,
      description: form.description,
      referenceImages: form.referenceImages,
      tags: form.tags,
      styleTokens: form.styleTokens || undefined,
      sceneTokens: form.sceneTokens || undefined,
    };

    if (isNew) {
      addStyle({ ...styleData, folderId: null });
    } else if (existing) {
      updateStyle(existing.id, styleData);
    }
    onClose();
  };

  return (
    <div className="h-full flex flex-col">
      {/* Thanh trên */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h2 className="text-sm font-semibold flex-1">
          {isNew ? "Tạo mớiPhong cách" : "Chỉnh sửaPhong cách"}
        </h2>
        <Button size="sm" onClick={handleSave} disabled={!form.name.trim()}>
          <Save className="w-3.5 h-3.5 mr-1.5" />
          Lưu
        </Button>
      </div>

      {/* Khu vực biểu mẫu */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* Phong cáchTên */}
          <div className="space-y-1.5">
            <Label className="text-xs">
              Phong cáchTên <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="Đặt tên phong cách"
              className="h-8 text-sm"
            />
          </div>

          {/* Phong cáchprompt */}
          <div className="space-y-1.5">
            <Label className="text-xs">Phong cáchprompt</Label>
            <textarea
              value={form.prompt}
              onChange={(e) => updateField("prompt", e.target.value)}
              placeholder="Nhập từ khóa phong cách, có thể dùng tiếng Anh hoặc tiếng Việt, ví dụ: anime style, soft lighting, pastel colors"
              className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            />
          </div>

          {/* Nút AI trích xuất */}
          <div className="pt-1">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-9 text-xs border-primary/30 hover:border-primary/60"
              onClick={handleExtractStyle}
              disabled={extracting || (!form.prompt.trim() && form.referenceImages.length === 0)}
            >
              {extracting ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Đang trích xuất...</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5 mr-1.5" />AI trích xuất từ khóa phong cách</>
              )}
            </Button>
            <p className="text-[10px] text-muted-foreground mt-1">
              从上方Mô tả + Ảnh tham chiếuđang xử lý...离"Phong cách thị giác"和"CảnhNội dung"，使用「Phân tích ảnh」服务
            </p>
          </div>

          {/* Kết quả trích xuất: styleTokens */}
          {form.styleTokens && (
            <div className="space-y-1.5">
              <Label className="text-xs text-primary">✨ Phong cách thị giác词（Nhân vật/Cảnh设定图使用）</Label>
              <textarea
                value={form.styleTokens}
                onChange={(e) => updateField("styleTokens", e.target.value)}
                className="w-full min-h-[60px] rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary resize-y"
              />
            </div>
          )}

          {/* 提取结果：sceneTokens */}
          {form.sceneTokens && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">🎬 Cảnh/bố cục词（Đạo diễn台/Phân cảnh使用）</Label>
              <textarea
                value={form.sceneTokens}
                onChange={(e) => updateField("sceneTokens", e.target.value)}
                className="w-full min-h-[60px] rounded-md border border-border bg-muted/30 px-3 py-2 text-xs font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
              />
            </div>
          )}

          {/* Prompt phủ định */}
          <div className="space-y-1.5">
            <Label className="text-xs">Prompt phủ định</Label>
            <textarea
              value={form.negativePrompt}
              onChange={(e) => updateField("negativePrompt", e.target.value)}
              placeholder="不希望出现的元素，如：blurry, low quality, watermark"
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            />
          </div>

          {/* Mô tả */}
          <div className="space-y-1.5">
            <Label className="text-xs">Mô tả</Label>
            <textarea
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="简单Mô tả这Phong cách的特点，方便以后查找"
              className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            />
          </div>

          {/* Ảnh tham chiếuTải lên */}
          <div className="space-y-1.5">
            <Label className="text-xs">Ảnh tham chiếu</Label>
            <div className="space-y-2">
              {/* đã tải lênảnh */}
              {form.referenceImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {form.referenceImages.map((img, i) => (
                    <div key={i} className="relative aspect-square rounded-md overflow-hidden border border-border group">
                      <LocalImage
                        src={img}
                        alt={`Ảnh tham chiếu ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        className="absolute top-1 right-1 p-0.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeImage(i)}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Tải lênnút */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImageUpload}
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <ImagePlus className="w-3.5 h-3.5 mr-1.5" />
                {uploading ? "Tải lênđang xử lý..." : "ThêmẢnh tham chiếu"}
              </Button>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
