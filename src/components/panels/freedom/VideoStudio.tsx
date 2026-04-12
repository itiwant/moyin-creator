"use client";

import { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { VideoIcon, Loader2, Download, Sparkles, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { useFreedomStore } from '@/stores/freedom-store';
import { useAPIConfigStore } from '@/stores/api-config-store';
import { ModelSelector } from './ModelSelector';
import { GenerationHistory } from './GenerationHistory';
import { generateFreedomVideo, type FreedomVideoUploadFile } from '@/lib/freedom/freedom-api';
import {
  getAspectRatiosForT2VModel,
  getDurationsForModel,
  getResolutionsForModel,
} from '@/lib/freedom/model-registry';
import { resolveVeoUploadCapability, type VeoUploadCapability } from '@/lib/freedom/veo-capability';

interface LocalUploadAsset {
  id: string;
  dataUrl: string;
  fileName: string;
  mimeType: string;
}

function resolveVideoCapabilityModelId(modelId: string): string {
  const lower = modelId.toLowerCase();
  // Kling Phiên bản化Model（kling-v* / kling-video-o1）沿用 kling-video 的能力定义
  if (/^kling-v/i.test(modelId) || modelId === 'kling-video-o1') {
    return 'kling-video';
  }
  // Veo Phiên bản化Model沿用家族Cơ bản能力定义，避免 components/frames biến thể丢失参数控件
  if (/^veo_3_1/i.test(modelId)) {
    return 'veo_3_1';
  }
  if (lower.startsWith('veo3.1')) {
    return 'veo3.1';
  }
  if (/^veo3/i.test(modelId)) {
    return 'veo3';
  }
  if (/^veo2/i.test(modelId)) {
    return 'veo2';
  }
  if (/^vidu/i.test(modelId) || modelId === 'aigc-video-vidu') {
    return 'vidu2.0';
  }
  if (/^doubao-seedance-/i.test(modelId)) {
    if (modelId.includes('pro-fast')) return 'seedance-pro-t2v-fast';
    if (modelId.includes('lite')) return 'seedance-lite-t2v';
    return 'seedance-pro-t2v';
  }
  if (lower.startsWith('minimax/video-01')) {
    return 'minimax-hailuo-02-standard-t2v';
  }
  return modelId;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Đọc file thất bại'));
    reader.readAsDataURL(file);
  });
}

function getVeoUploadValidationError(
  capability: VeoUploadCapability,
  singleUpload: LocalUploadAsset | null,
  firstFrameUpload: LocalUploadAsset | null,
  lastFrameUpload: LocalUploadAsset | null,
  referenceUploads: LocalUploadAsset[],
): string | null {
  if (!capability.isVeo || capability.mode === 'none') return null;

  if (capability.mode === 'single') {
    if (capability.minFiles > 0 && !singleUpload && !firstFrameUpload) {
      return 'Model hiện tại cần tải lên 1 ảnh';
    }
    return null;
  }

  if (capability.mode === 'first_last') {
    if (capability.minFiles > 0 && !firstFrameUpload) {
      return 'Model hiện tại cần tải lên ảnh khung hình đầu';
    }
    if (!firstFrameUpload && lastFrameUpload) {
      return 'Vui lòng tải lên ảnh khung hình đầu trước, rồi tải lên ảnh khung hình cuối';
    }
    return null;
  }

  if (capability.mode === 'multi') {
    if (referenceUploads.length < capability.minFiles) {
      return `Model hiện tại cần ít nhất ${capability.minFiles} ảnh tham chiếu`;
    }
    if (referenceUploads.length > capability.maxFiles) {
      return `Model hiện tại hỗ trợ tối đa ${capability.maxFiles} ảnh tham chiếu`;
    }
  }

  return null;
}

function buildVeoUploadFiles(
  capability: VeoUploadCapability,
  singleUpload: LocalUploadAsset | null,
  firstFrameUpload: LocalUploadAsset | null,
  lastFrameUpload: LocalUploadAsset | null,
  referenceUploads: LocalUploadAsset[],
): FreedomVideoUploadFile[] {
  if (!capability.isVeo || capability.mode === 'none') return [];

  if (capability.mode === 'single') {
    const file = singleUpload || firstFrameUpload;
    if (!file) return [];
    return [{
      role: 'single',
      dataUrl: file.dataUrl,
      fileName: file.fileName,
      mimeType: file.mimeType,
    }];
  }

  if (capability.mode === 'first_last') {
    const files: FreedomVideoUploadFile[] = [];
    if (firstFrameUpload) {
      files.push({
        role: 'first',
        dataUrl: firstFrameUpload.dataUrl,
        fileName: firstFrameUpload.fileName,
        mimeType: firstFrameUpload.mimeType,
      });
    }
    if (lastFrameUpload) {
      files.push({
        role: 'last',
        dataUrl: lastFrameUpload.dataUrl,
        fileName: lastFrameUpload.fileName,
        mimeType: lastFrameUpload.mimeType,
      });
    }
    return files;
  }

  if (capability.mode === 'multi') {
    return referenceUploads.slice(0, capability.maxFiles).map((file) => ({
      role: 'reference',
      dataUrl: file.dataUrl,
      fileName: file.fileName,
      mimeType: file.mimeType,
    }));
  }

  return [];
}

export function VideoStudio() {
  const {
    videoPrompt, setVideoPrompt,
    selectedVideoModel, setSelectedVideoModel,
    videoAspectRatio, setVideoAspectRatio,
    videoDuration, setVideoDuration,
    videoResolution, setVideoResolution,
    videoResult, setVideoResult,
    videoGenerating, setVideoGenerating,
    addHistoryEntry,
  } = useFreedomStore();

  const modelEndpointTypes = useAPIConfigStore((s) => s.modelEndpointTypes);
  const endpointTypes = useMemo(
    () => modelEndpointTypes[selectedVideoModel] || [],
    [modelEndpointTypes, selectedVideoModel],
  );

  const capabilityModelId = useMemo(
    () => resolveVideoCapabilityModelId(selectedVideoModel),
    [selectedVideoModel],
  );

  const aspectRatios = useMemo(() => getAspectRatiosForT2VModel(capabilityModelId), [capabilityModelId]);
  const durations = useMemo(() => getDurationsForModel(capabilityModelId), [capabilityModelId]);
  const resolutions = useMemo(() => getResolutionsForModel(capabilityModelId), [capabilityModelId]);
  const veoCapability = useMemo(
    () => resolveVeoUploadCapability(selectedVideoModel, endpointTypes),
    [selectedVideoModel, endpointTypes],
  );

  const [singleUpload, setSingleUpload] = useState<LocalUploadAsset | null>(null);
  const [firstFrameUpload, setFirstFrameUpload] = useState<LocalUploadAsset | null>(null);
  const [lastFrameUpload, setLastFrameUpload] = useState<LocalUploadAsset | null>(null);
  const [referenceUploads, setReferenceUploads] = useState<LocalUploadAsset[]>([]);

  const singleInputRef = useRef<HTMLInputElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const lastInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSingleUpload(null);
    setFirstFrameUpload(null);
    setLastFrameUpload(null);
    setReferenceUploads([]);
  }, [selectedVideoModel]);

  const toAsset = useCallback(async (file: File): Promise<LocalUploadAsset> => {
    const dataUrl = await fileToDataUrl(file);
    return {
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      dataUrl,
      fileName: file.name,
      mimeType: file.type || 'image/png',
    };
  }, []);

  const handleSingleUploadChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setSingleUpload(await toAsset(file));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Đọc file thất bại';
      toast.error(message);
    }
  }, [toAsset]);

  const handleFirstFrameChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setFirstFrameUpload(await toAsset(file));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Đọc file thất bại';
      toast.error(message);
    }
  }, [toAsset]);

  const handleLastFrameChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setLastFrameUpload(await toAsset(file));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Đọc file thất bại';
      toast.error(message);
    }
  }, [toAsset]);

  const handleReferenceChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (referenceUploads.length >= Math.max(veoCapability.maxFiles, 1)) {
      toast.error(`Model hiện tại hỗ trợ tối đa ${veoCapability.maxFiles} ảnh tham chiếu`);
      return;
    }
    try {
      const asset = await toAsset(file);
      setReferenceUploads((prev) => [...prev, asset]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Đọc file thất bại';
      toast.error(message);
    }
  }, [referenceUploads.length, toAsset, veoCapability.maxFiles]);

  const removeReference = useCallback((id: string) => {
    setReferenceUploads((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const veoUploadFiles = useMemo(
    () => buildVeoUploadFiles(
      veoCapability,
      singleUpload,
      firstFrameUpload,
      lastFrameUpload,
      referenceUploads,
    ),
    [veoCapability, singleUpload, firstFrameUpload, lastFrameUpload, referenceUploads],
  );

  const renderUploadSlot = (
    label: string,
    asset: LocalUploadAsset | null,
    onPick: () => void,
    onClear: () => void,
    required = false,
  ) => (
    <div className="rounded-md border p-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">
          {label}{required ? ' *' : ''}
        </span>
        {asset && (
          <button
            type="button"
            onClick={onClear}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {asset ? (
        <img
          src={asset.dataUrl}
          alt={label}
          className="h-24 w-full rounded object-cover"
        />
      ) : (
        <button
          type="button"
          onClick={onPick}
          className="h-24 w-full rounded border border-dashed flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground hover:border-primary/40"
        >
          <Upload className="h-4 w-4" />
          <span className="text-xs">Tải lên ảnh</span>
        </button>
      )}
      {asset && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full h-7 text-xs"
          onClick={onPick}
          disabled={videoGenerating}
        >
          Thay đổi
        </Button>
      )}
    </div>
  );

  const handleGenerate = useCallback(async () => {
    if (!videoPrompt.trim()) {
      toast.error('Nhập mô tả văn bản');
      return;
    }

    const uploadError = getVeoUploadValidationError(
      veoCapability,
      singleUpload,
      firstFrameUpload,
      lastFrameUpload,
      referenceUploads,
    );
    if (uploadError) {
      toast.error(uploadError);
      return;
    }

    setVideoGenerating(true);
    setVideoResult(null);

    try {
      const result = await generateFreedomVideo({
        prompt: videoPrompt,
        model: selectedVideoModel,
        aspectRatio: videoAspectRatio,
        duration: videoDuration,
        resolution: videoResolution || undefined,
        uploadFiles: veoUploadFiles.length > 0 ? veoUploadFiles : undefined,
      });

      setVideoResult(result.url);

      addHistoryEntry({
        id: `vid_${Date.now()}`,
        prompt: videoPrompt,
        model: selectedVideoModel,
        resultUrl: result.url,
        params: {
          aspectRatio: videoAspectRatio,
          duration: videoDuration,
          resolution: videoResolution,
          uploadCount: veoUploadFiles.length,
        },
        createdAt: Date.now(),
        mediaId: result.mediaId,
        type: 'video',
      });

      toast.success('Tạo video thành công! Đã lưu vào Thư viện phương tiện');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi không xác định';
      toast.error(`Tạo thất bại: ${message}`);
    } finally {
      setVideoGenerating(false);
    }
  }, [
    videoPrompt,
    veoCapability,
    singleUpload,
    firstFrameUpload,
    lastFrameUpload,
    referenceUploads,
    setVideoGenerating,
    setVideoResult,
    videoAspectRatio,
    videoDuration,
    videoResolution,
    selectedVideoModel,
    veoUploadFiles,
    addHistoryEntry,
  ]);

  return (
    <div className="flex h-full">
      {/* Left: Controls */}
      <div className="w-[340px] border-r flex flex-col">
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-5">
            {/* Model Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Chọn model</Label>
              <ModelSelector
                type="video"
                value={selectedVideoModel}
                onChange={setSelectedVideoModel}
              />
              {selectedVideoModel && (
                <p className="text-xs text-muted-foreground">ID: {selectedVideoModel}</p>
              )}
            </div>

            {/* Aspect Ratio */}
            {aspectRatios.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Tỷ lệ khung hình</Label>
                <div className="flex flex-wrap gap-1.5">
                  {aspectRatios.map((ratio) => (
                    <Button
                      key={ratio}
                      variant={videoAspectRatio === ratio ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs px-2.5"
                      onClick={() => setVideoAspectRatio(ratio)}
                    >
                      {ratio}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Duration */}
            {durations.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Thời lượng (giây)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {durations.map((d) => (
                    <Button
                      key={d}
                      variant={videoDuration === d ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs px-2.5"
                      onClick={() => setVideoDuration(d)}
                    >
                      {d}s
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Resolution */}
            {resolutions.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Độ phân giải</Label>
                <Select value={videoResolution} onValueChange={setVideoResolution}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="选择Độ phân giải" />
                  </SelectTrigger>
                  <SelectContent>
                    {resolutions.map((r) => (
                      <SelectItem key={r} value={String(r)}>{String(r)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Veo Dynamic Uploads */}
            {veoCapability.isVeo && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Tải lênPhương tiện（Veo）</Label>
                {veoCapability.mode === 'none' ? (
                  <p className="text-xs text-muted-foreground rounded-md border px-2 py-2">
                    当前Model仅Tạo video từ văn bản，不需要Tải lên ảnh。
                  </p>
                ) : (
                  <div className="space-y-2">
                    {veoCapability.mode === 'single' && renderUploadSlot(
                      'Ảnh tham chiếu',
                      singleUpload || firstFrameUpload,
                      () => singleInputRef.current?.click(),
                      () => {
                        setSingleUpload(null);
                        setFirstFrameUpload(null);
                      },
                      veoCapability.minFiles > 0,
                    )}

                    {veoCapability.mode === 'first_last' && (
                      <div className="grid grid-cols-2 gap-2">
                        {renderUploadSlot(
                          'Khung hình đầu图',
                          firstFrameUpload,
                          () => firstInputRef.current?.click(),
                          () => setFirstFrameUpload(null),
                          veoCapability.minFiles > 0,
                        )}
                        {renderUploadSlot(
                          'Khung hình cuối图',
                          lastFrameUpload,
                          () => lastInputRef.current?.click(),
                          () => setLastFrameUpload(null),
                          false,
                        )}
                      </div>
                    )}

                    {veoCapability.mode === 'multi' && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                          {referenceUploads.map((asset, index) => (
                            <div key={asset.id} className="relative rounded border overflow-hidden">
                              <img
                                src={asset.dataUrl}
                                alt={`Ảnh tham chiếu ${index + 1}`}
                                className="h-20 w-full object-cover"
                              />
                              <button
                                type="button"
                                className="absolute top-1 right-1 p-1 rounded bg-black/60 text-white"
                                onClick={() => removeReference(asset.id)}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                          {referenceUploads.length < veoCapability.maxFiles && (
                            <button
                              type="button"
                              onClick={() => referenceInputRef.current?.click()}
                              className="h-20 rounded border border-dashed flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground hover:border-primary/40"
                            >
                              <Upload className="h-4 w-4" />
                              <span className="text-[11px]">Thêm</span>
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          đã tải lên {referenceUploads.length}/{veoCapability.maxFiles} 张Ảnh tham chiếu
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Prompt */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Mô tả văn bản</Label>
              <Textarea
                placeholder="Mô tả你想Tạo的video..."
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
                className="min-h-[120px] resize-none"
              />
            </div>

            <input
              ref={singleInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleSingleUploadChange}
            />
            <input
              ref={firstInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFirstFrameChange}
            />
            <input
              ref={lastInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLastFrameChange}
            />
            <input
              ref={referenceInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleReferenceChange}
            />

            {/* Generate Button */}
            <Button
              className="w-full h-11"
              onClick={handleGenerate}
              disabled={videoGenerating || !videoPrompt.trim()}
            >
              {videoGenerating ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang tạo...</>
              ) : (
                <><Sparkles className="mr-2 h-4 w-4" /> Tạo video</>
              )}
            </Button>
          </div>
        </ScrollArea>
      </div>

      {/* Center: Result */}
      <div className="flex-1 flex items-center justify-center p-8 bg-muted/30">
        {videoGenerating ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">videoĐang tạo，请稍候（可能需要 1-4 分钟）...</p>
          </div>
        ) : videoResult ? (
          <div className="max-w-full max-h-full relative group">
            <video
              src={videoResult}
              controls
              autoPlay
              loop
              className="max-w-full max-h-[calc(100vh-200px)] rounded-lg shadow-lg"
            />
            <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
              <Button size="sm" variant="secondary" asChild>
                <a href={videoResult} download target="_blank" rel="noopener">
                  <Download className="h-4 w-4 mr-1" /> Tải xuống
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <VideoIcon className="h-16 w-16 opacity-20" />
            <p className="text-lg font-medium">Studio video</p>
            <p className="text-sm">选择Model，输入Mô tả，Tạo你想要的video</p>
          </div>
        )}
      </div>

      {/* Right: History */}
      <div className="w-[240px] border-l">
        <GenerationHistory type="video" onSelect={(entry) => {
          setVideoPrompt(entry.prompt);
          setSelectedVideoModel(entry.model);
          setVideoResult(entry.resultUrl);
        }} />
      </div>
    </div>
  );
}
