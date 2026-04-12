// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
"use client";

/**
 * Feature Binding Panel (Multi-Select Mode)
 * thương hiệuphân loạiChọn model — 仿 MemeFast pricing 页面
 * 一级：thương hiệu pill（带 SVG logo + Model数）
 * 二级：Model cột表（checkbox 多选）
 */

import { useMemo, useState } from "react";
import { useAPIConfigStore, type AIFeature } from "@/stores/api-config-store";
import { parseApiKeys, classifyModelByName, type ModelCapability } from "@/lib/api-key-manager";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FileText,
  Image,
  Video,
  ScanEye,
  Link2,
  Check,
  X,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  Search,
  Sparkles,
  Clapperboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { extractBrandFromModel, getBrandInfo } from "@/lib/brand-mapping";
import { getBrandIcon } from "./brand-icons";
import { getModelDisplayName } from "@/lib/freedom/model-display-names";

/**
 * Nhà cung cấpTùy chọn - 每功能可选的Nền tảng + Model
 */
interface ProviderOption {
  providerId: string;
  platform: string;
  name: string;
  model: string;
}

interface FeatureMeta {
  key: AIFeature;
  name: string;
  description: string;
  icon: ReactNode;
  requiredCapability?: ModelCapability;
  /** Đề xuấtModelGợi ý（蓝色高亮） */
  recommendation?: string;
}

const FEATURE_CONFIGS: FeatureMeta[] = [
  {
    key: "script_analysis",
    name: "Kịch bản分析 / Chat",
    description: "将故事文本分解为Cấu trúc化Kịch bản",
    icon: <FileText className="h-4 w-4" />,
    requiredCapability: "text",
  },
  {
    key: "character_generation",
    name: "Tạo ảnh",
    description: "TạoNhân vật和CảnhẢnh tham chiếu",
    icon: <Image className="h-4 w-4" />,
    requiredCapability: "image_generation",
    recommendation: "💎 Đề xuấtSử dụng Nano Banana Pro (Gemini 3 Pro)— 画质优秀、一致性好",
  },
  {
    key: "video_generation",
    name: "Tạo video",
    description: "将ảnh转换为video",
    icon: <Video className="h-4 w-4" />,
    requiredCapability: "video_generation",
    recommendation: "🧪 测试Đề xuất doubao-seedance-1-0-lite-t2v-250428 — 适合nhanh验证流程",
  },
  {
    key: "image_understanding",
    name: "Phân tích ảnh",
    description: "分析ảnhNội dungTạoMô tả",
    icon: <ScanEye className="h-4 w-4" />,
    requiredCapability: "vision",
  },
  {
    key: "freedom_image",
    name: "Tự dopanel-ảnh",
    description: "Tự dopanel独立的Tạo ảnh配置（Chưa cấu hình时回退到「Tạo ảnh」）",
    icon: <Sparkles className="h-4 w-4" />,
    requiredCapability: "image_generation",
    recommendation: "🎨 可独立配置Tự dopanelSử dụng的Tạo ảnhModel，不影响其他panel",
  },
  {
    key: "freedom_video",
    name: "Tự dopanel-video",
    description: "Tự dopanel独立的Tạo video配置（Chưa cấu hình时回退到「Tạo video」）",
    icon: <Clapperboard className="h-4 w-4" />,
    requiredCapability: "video_generation",
    recommendation: "🎬 可独立配置Tự dopanelSử dụng的Tạo videoModel，不影响其他panel",
  },
];

function getOptionKey(option: ProviderOption): string {
  return `${option.providerId}:${option.model}`;
}

function parseOptionKey(key: string): { providerIdOrPlatform: string; model: string } | null {
  const idx = key.indexOf(":");
  if (idx <= 0) return null;
  const providerIdOrPlatform = key.slice(0, idx);
  const model = key.slice(idx + 1);
  if (!providerIdOrPlatform || !model) return null;
  return { providerIdOrPlatform, model };
}

const DEFAULT_PLATFORM_CAPABILITIES: Record<string, ModelCapability[]> = {
  memefast: ["text", "vision", "image_generation", "video_generation"],
  // RunningHub is used for specialized tools; do not expose it as a default vision/chat provider.
  runninghub: ["image_generation"],
};

/**
 * Model级别能力映射
 * 精确控制每Model在ánh xạ dịch vụđang xử lý...范围
 * 未 cột出的Model将 fallback 到Nền tảng级别能力
 */
const MODEL_CAPABILITIES: Record<string, ModelCapability[]> = {
  // ---- Chat/文本Model ----
  'glm-4.7': ['text', 'function_calling'],
  'glm-4.6v': ['text', 'vision'],
  'deepseek-v3': ['text'],
  'deepseek-v3.2': ['text'],
  'deepseek-r1': ['text', 'reasoning'],
  'kimi-k2': ['text'],
  'MiniMax-M2.1': ['text'],
  'qwen3-max': ['text'],
  'qwen3-max-preview': ['text'],
  'gemini-2.0-flash': ['text'],
  'gemini-3-flash-preview': ['text'],
  'gemini-3-pro-preview': ['text'],
  'claude-haiku-4-5-20251001': ['text', 'vision'],

  // ---- Tạo ảnhModel ----
  'cogview-3-plus': ['image_generation'],
  'gemini-imagen': ['image_generation'],
  'gemini-3-pro-image-preview': ['image_generation'],
  'gpt-image-1.5': ['image_generation'],

  // ---- Tạo videoModel ----
  'cogvideox': ['video_generation'],
  'gemini-veo': ['video_generation'],
  'doubao-seedance-1-5-pro': ['video_generation'],
  'doubao-seedance-1-5-pro-251215': ['video_generation'],
  'doubao-seedream-4-5-251128': ['image_generation'],
  'veo3.1': ['video_generation'],
  'sora-2-all': ['video_generation'],
  'wan2.6-i2v': ['video_generation'],
  'grok-video-3': ['video_generation'],
  'grok-video-3-10s': ['video_generation'],
  'grok-video-3-15s': ['video_generation'],

  // ---- Phân tích ảnh/视觉Model ----
  'doubao-vision': ['vision'],

  // ---- RunningHub 特殊Model ----
  '2009613632530812930': ['image_generation'],
};

function providerSupportsCapability(
  provider: { platform: string; capabilities?: ModelCapability[] },
  required?: ModelCapability
): boolean {
  if (!required) return true;

  const explicitCaps = provider.capabilities && provider.capabilities.length > 0
    ? provider.capabilities
    : undefined;

  const caps = explicitCaps || DEFAULT_PLATFORM_CAPABILITIES[provider.platform];

  // If we still don't know, treat as "unknown" and allow selection.
  if (!caps || caps.length === 0) return true;

  return caps.includes(required);
}

/**
 * 检查特定Model是否Hỗ trợ所需能力
 * 优先级：硬编码映射 → Nền tảng元数据(model_type/tags) → ModelTên推断 → Nền tảng级别 fallback
 */
function modelSupportsCapability(
  modelName: string,
  provider: { platform: string; capabilities?: ModelCapability[] },
  required?: ModelCapability,
  modelType?: string,     // "文本" | "图像" | "音video" | "检索"
  modelTagsList?: string[] // ["Chat","识图","工具"]
): boolean {
  if (!required) return true;

  // 1. 硬编码映射（精确控制少量预设Model）
  const modelCaps = MODEL_CAPABILITIES[modelName];
  if (modelCaps) {
    return modelCaps.includes(required);
  }

  // 2. Nền tảng元数据（来自 /api/pricing_new 的 model_type + tags）
  if (modelType) {
    switch (required) {
      case 'text':
        return modelType === '文本';
      case 'image_generation':
        return modelType === 'ảnh';
      case 'video_generation':
        // 音video类đang xử lý...带“video”Thẻ的（排除纯âm thanh/TTS/Nhạc）
        return modelType === '音video' && (modelTagsList?.some(t => t.includes('video')) ?? false);
      case 'vision':
        // 识图能力跨 model_type，只看 tags 是否含“识图”或“多模态”
        return modelTagsList?.some(t => t.includes('识图') || t.includes('多模态')) ?? false;
      case 'embedding':
        return modelType === '检索';
      default:
        break;
    }
  }

  // 3. ModelTênchế độ推断（非 MemeFast 的其他Nhà cung cấp）
  const inferred = classifyModelByName(modelName);
  if (inferred.length > 0) {
    return inferred.includes(required);
  }

  // 4. Nền tảng级别 fallback
  return providerSupportsCapability(provider, required);
}

export function FeatureBindingPanel() {
  const {
    providers,
    modelTypes,
    modelTags,
    modelEnableGroups,
    setFeatureBindings,
    toggleFeatureBinding,
    getFeatureBindings,
  } = useAPIConfigStore();
  
  // 跟踪Mở rộng/thu gọnTrạng thái
  const [expandedFeatures, setExpandedFeatures] = useState<Set<AIFeature>>(new Set());

  const configuredProviderIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of providers) {
      if (parseApiKeys(p.apiKey).length > 0) {
        set.add(p.id);
        // 也把 platform 加进去，以tương thích旧数据检查
        set.add(p.platform);
      }
    }
    return set;
  }, [providers]);

  const isProviderConfigured = (providerIdOrPlatform: string): boolean => {
    return configuredProviderIds.has(providerIdOrPlatform);
  };

  const optionsByFeature = useMemo(() => {
    const map: Partial<Record<AIFeature, ProviderOption[]>> = {};

    for (const feature of FEATURE_CONFIGS) {
      const opts: ProviderOption[] = [];

      for (const provider of providers) {
        const models = (provider.model || [])
          .map((m) => m.trim())
          .filter((m) => m.length > 0);

        for (const model of models) {
          // Sử dụngNền tảng元数据 (model_type/tags) thực hiện精确phân loại
          const mType = modelTypes[model];
          const mTags = modelTags[model];
          if (!modelSupportsCapability(model, provider, feature.requiredCapability, mType, mTags)) continue;
          opts.push({
            providerId: provider.id,
            platform: provider.platform,
            name: provider.name,
            model,
          });
        }
      }

      // Prefer configured providers first for better UX.
      opts.sort((a, b) => {
        const aConfigured = isProviderConfigured(a.providerId);
        const bConfigured = isProviderConfigured(b.providerId);
        if (aConfigured !== bConfigured) return aConfigured ? -1 : 1;
        if (a.name !== b.name) return a.name.localeCompare(b.name);
        return a.model.localeCompare(b.model);
      });

      map[feature.key] = opts;
    }

    return map;
  }, [providers, configuredProviderIds, modelTypes, modelTags]);

  // 计算Đã cấu hình的功能数（至少有一有效绑定）
  const configuredCount = useMemo(() => {
    return FEATURE_CONFIGS.filter((feature) => {
      const bindings = getFeatureBindings(feature.key);
      if (bindings.length === 0) return false;
      
      // 检查是否至少有一有效的绑定
      const options = optionsByFeature[feature.key] || [];
      return bindings.some(binding => {
        const parsed = parseOptionKey(binding);
        if (!parsed) return false;
        const existsInOptions = options.some((o) => getOptionKey(o) === binding || (`${o.platform}:${o.model}` === binding));
        return existsInOptions && isProviderConfigured(parsed.providerIdOrPlatform);
      });
    }).length;
  }, [optionsByFeature, configuredProviderIds, getFeatureBindings]);

  // 切换单Model的đã chọnTrạng thái
  const handleToggleBinding = (feature: FeatureMeta, optionKey: string) => {
    const parsed = parseOptionKey(optionKey);
    if (!parsed) return;
    toggleFeatureBinding(feature.key, optionKey);
  };
  
  // 切换Mở rộng/thu gọn
  const toggleExpanded = (feature: AIFeature) => {
    setExpandedFeatures(prev => {
      const newSet = new Set(prev);
      if (newSet.has(feature)) {
        newSet.delete(feature);
      } else {
        newSet.add(feature);
      }
      return newSet;
    });
  };

  // 按thương hiệunhóm（thương hiệuphân loại UI）
  const brandGroupsByFeature = useMemo(() => {
    const result: Partial<Record<AIFeature, Array<{ brandId: string; options: ProviderOption[] }>>> = {};

    for (const feature of FEATURE_CONFIGS) {
      const opts = optionsByFeature[feature.key] || [];
      const brandMap = new Map<string, ProviderOption[]>();

      for (const opt of opts) {
        const brandId = extractBrandFromModel(opt.model);
        if (!brandMap.has(brandId)) brandMap.set(brandId, []);
        brandMap.get(brandId)!.push(opt);
      }

      // 排序：Model数多的thương hiệu在前
      const sorted = [...brandMap.entries()]
        .map(([brandId, options]) => ({ brandId, options }))
        .sort((a, b) => b.options.length - a.options.length);

      result[feature.key] = sorted;
    }

    return result;
  }, [optionsByFeature]);

  // 每 feature đã chọn的thương hiệulọc器
  const [selectedBrand, setSelectedBrand] = useState<Record<string, string | null>>({});
  // 每 feature 的Tìm kiếmquan trọng词
  const [searchQuery, setSearchQuery] = useState<Record<string, string>>({});

  // MemeFast Nhà cung cấp ID  tập合（用于nhómGợi ý）
  const memefastProviderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of providers) {
      if (p.platform === 'memefast') ids.add(p.id);
    }
    return ids;
  }, [providers]);

  return (
    <div className="p-6 border border-border rounded-xl bg-card space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          ánh xạ dịch vụ
        </h3>
        <span className="text-xs text-muted-foreground">
          Đã cấu hình: {configuredCount}/{FEATURE_CONFIGS.length}
        </span>
      </div>

      {/* Service Mapping Table - Multi-Select */}
      <div className="grid gap-3">
        {FEATURE_CONFIGS.map((feature) => {
          const options = optionsByFeature[feature.key] || [];
          const currentBindings = getFeatureBindings(feature.key);
          const isExpanded = expandedFeatures.has(feature.key);
          const selectableOptionKeys = options
            .filter((o) => isProviderConfigured(o.providerId))
            .map((o) => getOptionKey(o));
          const selectedSelectableCount = selectableOptionKeys.filter((k) => currentBindings.includes(k) || currentBindings.includes(`${options.find(o => getOptionKey(o) === k)?.platform}:${options.find(o => getOptionKey(o) === k)?.model}`)).length;
          const isAllSelected =
            selectableOptionKeys.length > 0 && selectedSelectableCount === selectableOptionKeys.length;
          const isPartiallySelected = selectedSelectableCount > 0 && !isAllSelected;
          const isFreedomFeature = feature.key === 'freedom_image' || feature.key === 'freedom_video';
          const handleToggleSelectAll = (checked: boolean | 'indeterminate') => {
            if (checked === true) {
              setFeatureBindings(
                feature.key,
                selectableOptionKeys.length > 0 ? selectableOptionKeys : null
              );
              return;
            }
            setFeatureBindings(feature.key, null);
          };
          
          // 检查有效/失效绑定（失效=Modelbị lọc、ngừng hoạt động，或Nền tảngChưa cấu hình）
          const validBindings: string[] = [];
          const invalidBindings: string[] = [];
          for (const binding of currentBindings) {
            const parsed = parseOptionKey(binding);
            if (!parsed) {
              invalidBindings.push(binding);
              continue;
            }
            const existsInOptions = options.some((o) => getOptionKey(o) === binding || (`${o.platform}:${o.model}` === binding));
            if (existsInOptions && isProviderConfigured(parsed.providerIdOrPlatform)) {
              validBindings.push(binding);
            } else {
              invalidBindings.push(binding);
            }
          }
          const configured = validBindings.length > 0;

          return (
            <div
              key={feature.key}
              className={cn(
                "rounded-lg border transition-all",
                configured
                  ? "bg-primary/5 border-primary/30"
                  : "bg-destructive/5 border-destructive/30"
              )}
            >
              {/* Header - Click to expand */}
              <div 
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => toggleExpanded(feature.key)}
              >
                {/* Service Info */}
                <div className="flex items-center gap-3 flex-1">
                  <div
                    className={cn(
                      "p-2 rounded-lg",
                      configured
                        ? "bg-primary/10 text-primary"
                        : "bg-destructive/10 text-destructive"
                    )}
                  >
                    {feature.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Label className="font-medium text-foreground cursor-pointer">
                        {feature.name}
                      </Label>
                      {configured ? (
                        <Check className="h-3 w-3 text-primary shrink-0" />
                      ) : (
                        <X className="h-3 w-3 text-destructive shrink-0" />
                      )}
                      {validBindings.length > 0 && (
                        <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                          {validBindings.length} Model
                        </span>
                      )}
                      {isFreedomFeature && (
                        <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                          Khả dụng {selectableOptionKeys.length}
                        </span>
                      )}
                      {isFreedomFeature && invalidBindings.length > 0 && (
                        <span className="text-xs bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">
                          暂不Khả dụng {invalidBindings.length}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {feature.description}
                    </p>
                  </div>
                </div>

                {/* Expand/Collapse Icon */}
                <div className="shrink-0">
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>
              
              {/* Expanded: Brand-categorized model selection */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-0 border-t border-border/50">
                  {options.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">
                      Chưa có可选Model（请先在 API 服务商里配置Model cột表）
                    </p>
                  ) : (
                    <div className="space-y-3 pt-3">
                      <p className="text-xs text-muted-foreground">
                        可多选，请求将按轮询分配到各Model（间隔 3 秒）
                      </p>

                      {/* Đề xuấtModelGợi ý */}
                      {feature.recommendation && (
                        <div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-red-500/10 border border-red-500/30">
                          <span className="text-sm font-bold text-red-600 dark:text-red-400 leading-relaxed">
                            {feature.recommendation}
                          </span>
                        </div>
                      )}

                      {/* MemeFast nhómGợi ý横幅 */}
                      {(() => {
                        const groups = new Set<string>();
                        for (const binding of currentBindings) {
                          const parsed = parseOptionKey(binding);
                          if (!parsed) continue;
                          const isMemefast = memefastProviderIds.has(parsed.providerIdOrPlatform)
                            || parsed.providerIdOrPlatform === 'memefast';
                          if (!isMemefast) continue;
                          const mg = modelEnableGroups[parsed.model];
                          if (mg) for (const g of mg) groups.add(g);
                        }
                        const sortedGroups = [...groups].sort();
                        if (sortedGroups.length === 0) return null;
                        return (
                          <div className="flex flex-col gap-1.5 px-3 py-2.5 rounded-md bg-blue-500/10 border border-blue-500/30">
                            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                              已选的 MemeFast ModelHỗ trợ以下nhóm：
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {sortedGroups.map(g => (
                                <span key={g} className="text-xs bg-blue-500/20 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                                  {g}
                                </span>
                              ))}
                            </div>
                            <span className="text-[11px] text-blue-600/80 dark:text-blue-400/80">
                              gợi ý在 memefast.top 后台为以上nhóm都Thêm Key，Key 越多可用性越高。
                            </span>
                          </div>
                        );
                      })()}
                      {isFreedomFeature && invalidBindings.length > 0 && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-300">
                          检测到暂不可用绑定：系统不会Tự động清理，Model恢复后会Tự độngTiếp tục可用。
                        </p>
                      )}

                      {/* Tự dopanel一键Chọn tất cả（勾选=Chọn tất cả；Hủy=Tất cả不选） */}
                      {isFreedomFeature && (
                        <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                          <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                            <Checkbox
                              checked={isAllSelected ? true : isPartiallySelected ? 'indeterminate' : false}
                              onCheckedChange={handleToggleSelectAll}
                              disabled={selectableOptionKeys.length === 0}
                            />
                            Chọn tất cảModel（Hủy即Tất cả不选）
                          </label>
                          <span className="text-[11px] text-muted-foreground">
                            {selectedSelectableCount}/{selectableOptionKeys.length}
                          </span>
                        </div>
                      )}

                      {/* Search */}
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Tìm kiếmModelTên..."
                          value={searchQuery[feature.key] || ''}
                          onChange={(e) => setSearchQuery(prev => ({ ...prev, [feature.key]: e.target.value }))}
                          className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                      </div>

                      {/* Brand Pills */}
                      {(() => {
                        const brands = brandGroupsByFeature[feature.key] || [];
                        const activeBrand = selectedBrand[feature.key] || null;
                        const query = (searchQuery[feature.key] || '').toLowerCase();

                        // lọc后的Model cột表
                        const filteredOptions = options.filter(o => {
                          if (query && !o.model.toLowerCase().includes(query) && !getModelDisplayName(o.model).toLowerCase().includes(query)) return false;
                          if (activeBrand && extractBrandFromModel(o.model) !== activeBrand) return false;
                          return true;
                        });

                        return (
                          <>
                            <div className="flex flex-wrap gap-1.5">
                              {/* Tất cảthương hiệu */}
                              <button
                                type="button"
                                onClick={() => setSelectedBrand(prev => ({ ...prev, [feature.key]: null }))}
                                className={cn(
                                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                                  !activeBrand
                                    ? "bg-primary/10 border-primary/40 text-primary"
                                    : "bg-muted/30 border-border hover:bg-accent/50 text-muted-foreground"
                                )}
                              >
                                Tất cảthương hiệu
                                <span className={cn(
                                  "text-[10px] px-1 py-0.5 rounded-full min-w-[18px] text-center",
                                  !activeBrand ? "bg-primary/20" : "bg-muted"
                                )}>
                                  {options.length}
                                </span>
                              </button>

                              {brands.map(({ brandId, options: brandOpts }) => {
                                const info = getBrandInfo(brandId);
                                const isActive = activeBrand === brandId;
                                return (
                                  <button
                                    key={brandId}
                                    type="button"
                                    onClick={() => setSelectedBrand(prev => ({
                                      ...prev,
                                      [feature.key]: isActive ? null : brandId,
                                    }))}
                                    className={cn(
                                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                                      isActive
                                        ? "bg-primary/10 border-primary/40 text-primary"
                                        : "bg-muted/30 border-border hover:bg-accent/50 text-muted-foreground"
                                    )}
                                  >
                                    <span className="shrink-0">{getBrandIcon(brandId, 14)}</span>
                                    {info.displayName}
                                    <span className={cn(
                                      "text-[10px] px-1 py-0.5 rounded-full min-w-[18px] text-center",
                                      isActive ? "bg-primary/20" : "bg-muted"
                                    )}>
                                      {brandOpts.length}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>

                            {/* Model List */}
                            <div className="space-y-1 max-h-[280px] overflow-y-auto">
                              {filteredOptions.length === 0 ? (
                                <p className="text-xs text-muted-foreground py-2 text-center">
                                  无匹配Model
                                </p>
                              ) : (
                                filteredOptions.map((option) => {
                                  const optionKey = getOptionKey(option);
                                  const optionConfigured = isProviderConfigured(option.providerId);
                                  const legacyKey = `${option.platform}:${option.model}`;
                                  const isSelected = currentBindings.includes(optionKey) || currentBindings.includes(legacyKey);
                                  const brandId = extractBrandFromModel(option.model);

                                  return (
                                    <label
                                      key={optionKey}
                                      className={cn(
                                        "flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors",
                                        isSelected
                                          ? "bg-primary/10 border border-primary/30"
                                          : "hover:bg-accent/50 border border-transparent",
                                        !optionConfigured && "opacity-50"
                                      )}
                                    >
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={() => handleToggleBinding(feature, optionKey)}
                                        disabled={!optionConfigured}
                                      />
                                      <span className="shrink-0">{getBrandIcon(brandId, 14)}</span>
                                      <span className="text-xs font-mono text-foreground">
                                        {getModelDisplayName(option.model)}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground ml-auto">
                                        {option.name}
                                      </span>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Status Summary */}
      {configuredCount < FEATURE_CONFIGS.length && (
        <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="text-xs">
            <p className="font-medium text-destructive">
              部分服务Chưa cấu hình
            </p>
            <p className="text-muted-foreground mt-1">
              请在上方为每功能Chọn「Nhà cung cấp/Model」，并确保对应Nhà cung cấp已填写 API Key。
            </p>
          </div>
        </div>
      )}

      {/* Help text */}
      <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg space-y-2">
        <p>
          <strong>💡 多Model轮询：</strong>
          每功能可Chọn多Model，请求将按thứ tự分配到各Model（每次间隔 3 秒），避免单一 API 限流。
        </p>
        <p>
          <strong>📌 说明：</strong>
          可Tùy chọn来自「API 服务商」里配置的Model cột表，NhấpMở rộng后可多选。
        </p>
      </div>
    </div>
  );
}
