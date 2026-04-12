// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * API Config Store v2
 * Manages API providers and keys with localStorage persistence
 * Supports multi-key rotation and IProvider interface (AionUi pattern)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProviderId, ServiceType } from '@opencut/ai-core';
import { 
  type IProvider, 
  DEFAULT_PROVIDERS, 
  generateId, 
  parseApiKeys,
  maskApiKey as maskKey,
  updateProviderKeys,
  classifyModelByName,
} from '@/lib/api-key-manager';
import { injectDiscoveryCache, type DiscoveredModelLimits } from '@/lib/ai/model-registry';

// Re-export IProvider for convenience
export type { IProvider } from '@/lib/api-key-manager';

// ==================== AI Feature Types ====================

/**
 * AI chức năng模块Loại
 * 每chức năng可以绑定一 Nhà cung cấp API
 */
export type AIFeature = 
  | 'script_analysis'       // Kịch bản分析
  | 'character_generation'  // Nhân vậtTạo ảnh
  | 'scene_generation'      // CảnhTạo ảnh
  | 'video_generation'      // Tạo video
  | 'image_understanding'   // Phân tích ảnh/分析
  | 'chat'                  // 通用Chat
  | 'freedom_image'         // Tự dopanel-Tạo ảnh
  | 'freedom_video';        // Tự dopanel-Tạo video

/**
 * Liên kết tính năngcấu hình
 * 每chức năng可绑定多Nhà cung cấp/Model（多选）
 * định dạng: platform:model 数组，如 ['memefast:deepseek-v3.2', 'memefast:gemini-3-pro-image-preview']
 */
export type FeatureBindings = Record<AIFeature, string[] | null>;

/**
 * chức năngthông tin定义
 */
export const AI_FEATURES: Array<{
  key: AIFeature;
  name: string;
  description: string;
}> = [
  { key: 'script_analysis', name: 'Kịch bản分析', description: '将故事文本分解为Cấu trúc化Kịch bản' },
  { key: 'character_generation', name: 'Nhân vậtTạo', description: 'TạoNhân vậtẢnh tham chiếu和biến thểtrang phục' },
  { key: 'scene_generation', name: 'CTạo ảnh', description: 'TạoCảnhmôi trườngẢnh tham chiếu' },
  { key: 'video_generation', name: 'Tạo video', description: '将ảnhchuyển đổi thànhvideo' },
  { key: 'image_understanding', name: 'Phân tích ảnh', description: '分析ảnhNội dung' },
  { key: 'chat', name: '通用Chat', description: 'AI Chat和文本Tạo' },
  { key: 'freedom_image', name: 'Tự dopanel-ảnh', description: 'Tự dopanelđộc lập的Tạo ảnhcấu hình' },
  { key: 'freedom_video', name: 'Tự dopanel-video', description: 'Tự dopanelđộc lập的Tạo videocấu hình' },
];


// ==================== Types ====================

/**
 * Nâng caoTạoTùy chọn
 * điều khiểnTạo video的Nâng cao hàng为
 */
export interface AdvancedGenerationOptions {
  /** BậtThị giác连续性：Tự động将上一Phân cảnhKhung hình cuối传递给下一Phân cảnh作为Tham chiếu */
  enableVisualContinuity: boolean;
  /** Bật断点续传：Tạo hàng loạtđang xử lý...从上次位置Tiếp tục */
  enableResumeGeneration: boolean;
  /** BậtNội dungkiểm duyệt容错：遇到nhạy cảmNội dungTự độngBỏ qua，Tiếp tụcTạo其他Phân cảnh */
  enableContentModeration: boolean;
  /** Bật多ModelTự độngchuyển sang：首Phân cảnhSử dụng t2v，后续Sử dụng i2v */
  enableAutoModelSwitch: boolean;
}


/** Nâng caoTùy chọnMặc định值 */
export const DEFAULT_ADVANCED_OPTIONS: AdvancedGenerationOptions = {
  enableVisualContinuity: true,
  enableResumeGeneration: true,
  enableContentModeration: true,
  enableAutoModelSwitch: false,
};

// ==================== Image Host Types ====================

/**
 * Lưu trữ ảnhNền tảng
 */
export type ImageHostPlatform = 'imgbb' | 'imgurl' | 'scdn' | 'catbox' | 'cloudflare_r2' | 'custom';

/**
 * Lưu trữ ảnhNhà cung cấpcấu hình（độc lậpánh xạ）
 */
export interface ImageHostProvider {
  id: string;
  platform: ImageHostPlatform;
  name: string;
  baseUrl: string;
  uploadPath: string; // 可为đầy đủ URL hoặc路径
  apiKey: string; // Hỗ trợ多 Key（逗号/换 hàng），允许游客Tải lên的Nền tảng可Để trống
  enabled: boolean;
  apiKeyParam?: string; // Query tham số名（如 key）
  apiKeyHeader?: string; // Header Tên(tùy chọn)
  apiKeyFormField?: string; // 表单trườngđang xử lý...ey Tên（如 userhash）
  apiKeyOptional?: boolean; // 是否允许不填 Key（游客Tải lên）
  expirationParam?: string; // Tham số hết hạn名（如 expiration）
  imageField?: string; // 表单trường名（Mặc định image）
  imagePayloadType?: 'base64' | 'file'; // ảnhtrường传输chế độ
  nameField?: string; // 表单trường名（Mặc định name）
  staticFormFields?: Record<string, string>; // Cố định附加表单trường
  responseUrlField?: string; // 响应đang xử lý...L trường路径（如 data.url）
  responseDeleteUrlField?: string; // 响应đang xử lý...ờng URL xóa路径
}

/** Lưu trữ ảnhNhà cung cấp预设（仅保留当前在用范围内的Nền tảng） */
export const IMAGE_HOST_PRESETS: Omit<ImageHostProvider, 'id' | 'apiKey'>[] = [
  {
    platform: 'scdn',
    name: 'SCDN Lưu trữ ảnh',
    baseUrl: 'https://img.scdn.io',
    uploadPath: '/api/v1.php',
    enabled: true,
    apiKeyOptional: true,
    imageField: 'image',
    imagePayloadType: 'file',
    responseUrlField: 'url',
  },
  {
    platform: 'catbox',
    name: 'Catbox',
    baseUrl: 'https://catbox.moe',
    uploadPath: '/user/api.php',
    enabled: false,
    apiKeyFormField: 'userhash',
    apiKeyOptional: true,
    imageField: 'fileToUpload',
    imagePayloadType: 'file',
    staticFormFields: {
      reqtype: 'fileupload',
    },
  },
  {
    platform: 'imgbb',
    name: 'imgbb',
    baseUrl: 'https://api.imgbb.com',
    uploadPath: '/1/upload',
    enabled: false,
    apiKeyParam: 'key',
    expirationParam: 'expiration',
    imageField: 'image',
    nameField: 'name',
    responseUrlField: 'data.url',
    responseDeleteUrlField: 'data.delete_url',
  },
  {
    platform: 'imgurl',
    name: 'ImgURL',
    baseUrl: 'https://www.imgurl.org',
    uploadPath: '/api/v3/upload',
    enabled: false,
    apiKeyHeader: 'Authorization',
    imageField: 'file',
    responseUrlField: 'data.url',
  },
  {
    platform: 'custom',
    name: 'Tùy chỉnhLưu trữ ảnh',
    baseUrl: '',
    uploadPath: '',
    enabled: false,
  },
  {
    platform: 'cloudflare_r2',
    name: 'Cloudflare R2',
    baseUrl: '',
    uploadPath: '',
    enabled: false,
  },
];

/** 首次启动Mặc địnhTạo的Lưu trữ ảnh（仅 SCDN Mặc định开启，ImgBB Mặc địnhĐóng） */
export const DEFAULT_IMAGE_HOST_PROVIDERS: Omit<ImageHostProvider, 'id' | 'apiKey'>[] =
  IMAGE_HOST_PRESETS.filter((preset) => preset.platform === 'scdn' || preset.platform === 'imgbb');

const ACTIVE_IMAGE_HOST_PLATFORMS = new Set<ImageHostPlatform>(['imgbb', 'imgurl', 'scdn', 'catbox', 'cloudflare_r2', 'custom']);

export function isVisibleImageHostPlatform(platform: string): platform is ImageHostPlatform {
  return ACTIVE_IMAGE_HOST_PLATFORMS.has(platform as ImageHostPlatform);
}

export function isVisibleImageHostProvider(
  provider: Pick<ImageHostProvider, 'platform'>,
): boolean {
  return isVisibleImageHostPlatform(provider.platform);
}

export function findImageHostPreset(
  platform: ImageHostPlatform,
): Omit<ImageHostProvider, 'id' | 'apiKey'> | undefined {
  return IMAGE_HOST_PRESETS.find((preset) => preset.platform === platform);
}

function createDefaultImageHostProviders(): ImageHostProvider[] {
  return DEFAULT_IMAGE_HOST_PROVIDERS.map((provider) => ({
    ...provider,
    id: generateId(),
    apiKey: '',
  }));
}

function isUnconfiguredDefaultImgBBProvider(provider: ImageHostProvider): boolean {
  const imgbbPreset = findImageHostPreset('imgbb');
  if (!imgbbPreset || provider.platform !== 'imgbb') {
    return false;
  }

  return (provider.apiKey || '').trim().length === 0
    && provider.name === imgbbPreset.name
    && (provider.baseUrl || '') === imgbbPreset.baseUrl
    && (provider.uploadPath || '') === imgbbPreset.uploadPath;
}

type ImageHostProviderDefaults = Partial<Omit<ImageHostProvider, 'id' | 'name' | 'apiKey' | 'enabled'>>;

function isUnconfiguredDefaultCatboxProvider(provider: ImageHostProvider): boolean {
  const catboxPreset = findImageHostPreset('catbox');
  if (!catboxPreset || provider.platform !== 'catbox') {
    return false;
  }

  return (provider.apiKey || '').trim().length === 0
    && provider.name === catboxPreset.name
    && (provider.baseUrl || '') === catboxPreset.baseUrl
    && (provider.uploadPath || '') === catboxPreset.uploadPath;
}
const IMAGE_HOST_PLATFORM_DEFAULTS: Partial<Record<ImageHostPlatform, ImageHostProviderDefaults>> = {
  imgbb: {
    baseUrl: 'https://api.imgbb.com',
    uploadPath: '/1/upload',
    apiKeyParam: 'key',
    expirationParam: 'expiration',
    imageField: 'image',
    nameField: 'name',
    responseUrlField: 'data.url',
    responseDeleteUrlField: 'data.delete_url',
  },
  imgurl: {
    baseUrl: 'https://www.imgurl.org',
    uploadPath: '/api/v3/upload',
    apiKeyHeader: 'Authorization',
    imageField: 'file',
  },
  scdn: {
    baseUrl: 'https://img.scdn.io',
    uploadPath: '/api/v1.php',
    apiKeyOptional: true,
    imageField: 'image',
    imagePayloadType: 'file',
    responseUrlField: 'url',
  },
  catbox: {
    baseUrl: 'https://catbox.moe',
    uploadPath: '/user/api.php',
    apiKeyFormField: 'userhash',
    apiKeyOptional: true,
    imageField: 'fileToUpload',
    imagePayloadType: 'file',
    staticFormFields: {
      reqtype: 'fileupload',
    },
  },
};

function normalizeImageHostProvider(provider: ImageHostProvider): ImageHostProvider {
  const defaults = IMAGE_HOST_PLATFORM_DEFAULTS[provider.platform];
  if (!defaults) {
    return provider;
  }

  if (provider.platform === 'catbox') {
    return {
      ...provider,
      baseUrl: provider.baseUrl || defaults.baseUrl || '',
      uploadPath: provider.uploadPath || defaults.uploadPath || '',
      apiKeyFormField: 'userhash',
      apiKeyOptional: true,
      imageField: 'fileToUpload',
      imagePayloadType: 'file',
      staticFormFields: {
        ...(provider.staticFormFields || {}),
        reqtype: 'fileupload',
      },
      responseUrlField: undefined,
      responseDeleteUrlField: undefined,
    };
  }

  if (provider.platform === 'scdn') {
    return {
      ...provider,
      baseUrl: provider.baseUrl || defaults.baseUrl || '',
      uploadPath: provider.uploadPath || defaults.uploadPath || '',
      apiKeyOptional: true,
      imageField: 'image',
      imagePayloadType: 'file',
      responseUrlField: 'url',
      responseDeleteUrlField: undefined,
    };
  }


  if (provider.platform === 'imgbb') {
    return {
      ...provider,
      baseUrl: provider.baseUrl || defaults.baseUrl || '',
      uploadPath: provider.uploadPath || defaults.uploadPath || '',
      apiKeyParam: defaults.apiKeyParam,
      expirationParam: defaults.expirationParam,
      imageField: defaults.imageField,
      nameField: defaults.nameField,
      responseUrlField: defaults.responseUrlField,
      responseDeleteUrlField: defaults.responseDeleteUrlField,
    };
  }

  if (provider.platform === 'imgurl') {
    return {
      ...provider,
      baseUrl: provider.baseUrl || defaults.baseUrl || '',
      uploadPath: provider.uploadPath || defaults.uploadPath || '',
      apiKeyHeader: defaults.apiKeyHeader,
      imageField: provider.imageField || defaults.imageField,
    };
  }

  return provider;
}

function normalizeImageHostProviders(providers: ImageHostProvider[] | undefined | null): ImageHostProvider[] {
  return (providers || []).filter(isVisibleImageHostProvider).map(normalizeImageHostProvider);
}

/** Legacy Lưu trữ ảnhcấu hình（仅用于迁移） */
export interface LegacyImageHostConfig {
  type: ImageHostPlatform;
  imgbbApiKey: string;
  cloudflareR2?: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
  };
  custom?: {
    uploadUrl: string;
    apiKey: string;
  };
}

interface APIConfigState {
  // Provider-based storage (v2)
  providers: IProvider[];
  
  // Feature bindings - which provider to use for each feature
  featureBindings: FeatureBindings;
  
  // Legacy: API Keys (v1, for migration)
  apiKeys: Partial<Record<ProviderId, string>>;
  
  // Concurrency control
  concurrency: number;
  
  // Aspect ratio preference
  aspectRatio: '16:9' | '9:16';
  orientation: 'landscape' | 'portrait';
  
  // Advanced generation options
  advancedOptions: AdvancedGenerationOptions;
  
  // Image host providers (independent mapping)
  imageHostProviders: ImageHostProvider[];
  
  // Model endpoint types from API sync (model ID -> supported_endpoint_types)
  modelEndpointTypes: Record<string, string[]>;
  
  // Model metadata from /api/pricing_new (MemeFast platform classification)
  // model_name -> model_type: "文本" | "图像" | "音video" | "tìm kiếm"
  modelTypes: Record<string, string>;
  // model_name -> tags: ["Chat","nhận dạng ảnh","工具"] etc.
  modelTags: Record<string, string[]>;
  // model_name -> enable_groups: ["官转","纯AZ","default"] (MemeFast only)
  modelEnableGroups: Record<string, string[]>;
  
  // Discovered model limits (Error-driven Discovery)
  // model_name -> { maxOutput?, contextWindow?, discoveredAt }
  discoveredModelLimits: Record<string, DiscoveredModelLimits>;
}

interface APIConfigActions {
  // Provider management (v2)
  addProvider: (provider: Omit<IProvider, 'id'>) => IProvider;
  updateProvider: (provider: IProvider) => void;
  removeProvider: (id: string) => void;
  getProviderByPlatform: (platform: string) => IProvider | undefined;
  getProviderById: (id: string) => IProvider | undefined;
  syncProviderModels: (providerId: string) => Promise<{ success: boolean; count: number; error?: string }>;
  
  // Feature binding management (multi-select)
  setFeatureBindings: (feature: AIFeature, bindings: string[] | null) => void;
  toggleFeatureBinding: (feature: AIFeature, binding: string) => void;
  getFeatureBindings: (feature: AIFeature) => string[];
  getProvidersForFeature: (feature: AIFeature) => Array<{ provider: IProvider; model: string }>;
  isFeatureConfigured: (feature: AIFeature) => boolean;
  // Legacy single-select compat (deprecated)
  setFeatureBinding: (feature: AIFeature, providerId: string | null) => void;
  getFeatureBinding: (feature: AIFeature) => string | null;
  getProviderForFeature: (feature: AIFeature) => IProvider | undefined;
  
  // Legacy API Key management (v1 compat)
  setApiKey: (provider: ProviderId, key: string) => void;
  getApiKey: (provider: ProviderId) => string;
  clearApiKey: (provider: ProviderId) => void;
  clearAllApiKeys: () => void;
  
  // Concurrency
  setConcurrency: (n: number) => void;
  
  // Aspect ratio
  setAspectRatio: (ratio: '16:9' | '9:16') => void;
  toggleOrientation: () => void;
  
  // Advanced generation options
  setAdvancedOption: <K extends keyof AdvancedGenerationOptions>(key: K, value: AdvancedGenerationOptions[K]) => void;
  resetAdvancedOptions: () => void;
  
  // Image host provider management
  addImageHostProvider: (provider: Omit<ImageHostProvider, 'id'>) => ImageHostProvider;
  updateImageHostProvider: (provider: ImageHostProvider) => void;
  removeImageHostProvider: (id: string) => void;
  getImageHostProviderById: (id: string) => ImageHostProvider | undefined;
  getEnabledImageHostProviders: () => ImageHostProvider[];
  isImageHostConfigured: () => boolean;
  
  // Validation
  isConfigured: (provider: ProviderId) => boolean;
  isPlatformConfigured: (platform: string) => boolean;
  checkRequiredKeys: (services: ServiceType[]) => APIConfigStatus;
  checkChatKeys: () => APIConfigStatus;
  checkVideoGenerationKeys: () => APIConfigStatus;
  
  // Display helpers
  maskApiKey: (key: string) => string;
  getAllConfigs: () => { provider: ProviderId; configured: boolean; masked: string }[];
  
  // Model limits discovery
  getDiscoveredModelLimits: (model: string) => DiscoveredModelLimits | undefined;
  setDiscoveredModelLimits: (model: string, limits: Partial<DiscoveredModelLimits>) => void;
}

type APIConfigStore = APIConfigState & APIConfigActions;

// ==================== Status Type ====================

export interface APIConfigStatus {
  isAllConfigured: boolean;
  missingKeys: string[];
  friendlyMessage: string;
}

// ==================== Provider Info ====================

/**
 * Nhà cung cấpthông tinánh xạ
 * 1. memefast - MemeFast API，全chức năng AI trung gian（Đề xuất）
 * 2. runninghub - RunningHub，Chuyển góc nhìn/đa góc độTạo
 */
const PROVIDER_INFO: Record<ProviderId, { name: string; services: ServiceType[] }> = {
  memefast: { name: 'MemeFast API', services: ['chat', 'image', 'video', 'vision'] },
  runninghub: { name: 'RunningHub', services: ['image', 'vision'] },
  openai: { name: 'OpenAI', services: [] },
  custom: { name: 'Custom', services: [] },
};

// ==================== Initial State ====================

// Default feature bindings (all null)
const defaultFeatureBindings: FeatureBindings = {
  script_analysis: null,
  character_generation: null,
  scene_generation: null,
  video_generation: null,
  image_understanding: null,
  chat: null,
  freedom_image: null,
  freedom_video: null,
};
const defaultImageHostProviders: ImageHostProvider[] = createDefaultImageHostProviders();

// Pre-fill MemeFast for new users (no API Key, just the provider entry)
const memefastTemplate = DEFAULT_PROVIDERS.find(p => p.platform === 'memefast');

function omitRecordKeys<T>(record: Record<string, T>, keys: Iterable<string>): Record<string, T> {
  const next = { ...record };
  for (const key of keys) {
    delete next[key];
  }
  return next;
}

const initialState: APIConfigState = {
  providers: memefastTemplate
    ? [{ id: generateId(), ...memefastTemplate, apiKey: '' }]
    : [],
  featureBindings: defaultFeatureBindings,
  apiKeys: {},
  concurrency: 1,  // Default to serial execution (single key rate limit)
  aspectRatio: '16:9',
  orientation: 'landscape',
  advancedOptions: { ...DEFAULT_ADVANCED_OPTIONS },
  imageHostProviders: defaultImageHostProviders,
  modelEndpointTypes: {},
  modelTypes: {},
  modelTags: {},
  modelEnableGroups: {},
  discoveredModelLimits: {},
};

// ==================== Store ====================

export const useAPIConfigStore = create<APIConfigStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ==================== Provider Management (v2) ====================
      
      addProvider: (providerData) => {
        const newProvider: IProvider = {
          ...providerData,
          id: generateId(),
        };
        set((state) => ({
          providers: [...state.providers, newProvider],
        }));
        // Update key manager
        updateProviderKeys(newProvider.id, newProvider.apiKey);
        console.log(`[APIConfig] Added provider: ${newProvider.name}`);
        return newProvider;
      },

      updateProvider: (provider) => {
        set((state) => ({
          providers: state.providers.map(p => p.id === provider.id ? provider : p),
        }));
        // Update key manager
        updateProviderKeys(provider.id, provider.apiKey);
        console.log(`[APIConfig] Updated provider: ${provider.name}`);
      },

      removeProvider: (id) => {
        const provider = get().providers.find(p => p.id === id);
        set((state) => ({
          providers: state.providers.filter(p => p.id !== id),
        }));
        if (provider) {
          console.log(`[APIConfig] Removed provider: ${provider.name}`);
        }
      },

      getProviderByPlatform: (platform) => {
        return get().providers.find(p => p.platform === platform);
      },

      getProviderById: (id) => {
        return get().providers.find(p => p.id === id);
      },

      syncProviderModels: async (providerId) => {
        const provider = get().providers.find(p => p.id === providerId);
        if (!provider) return { success: false, count: 0, error: 'Nhà cung cấpkhông tồn tại' };

        const keys = parseApiKeys(provider.apiKey);
        if (keys.length === 0) return { success: false, count: 0, error: 'Vui lòng cấu hình API Key trước' };

        const baseUrl = provider.baseUrl?.replace(/\/+$/, '');
        if (!baseUrl) return { success: false, count: 0, error: 'Base URL Chưa cấu hình' };

        try {
          // 用 Set thu thậpTất cả key 的Model，Tự độngkhử trùng
          const allModelIds = new Set<string>();
          const isMemefast = provider.platform === 'memefast';
          const memefastTypes: Record<string, string> = {};
          const memefastTags: Record<string, string[]> = {};
          const memefastEndpoints: Record<string, string[]> = {};
          const memefastEnableGroups: Record<string, string[]> = {};

          if (isMemefast) {
            // MemeFast: /api/pricing_new 获取全量元dữ liệu（公开giao diện）
            const domain = baseUrl.replace(/\/v\d+$/, '');
            const pricingUrl = `${domain}/api/pricing_new`;

            const response = await fetch(pricingUrl);
            if (!response.ok) {
              return { success: false, count: 0, error: `pricing_new API Quay lại ${response.status}` };
            }

            const json = await response.json();
            const data: Array<{ model_name: string; model_type?: string; tags?: string; supported_endpoint_types?: string[]; enable_groups?: string[] }> = json.data;
            if (!Array.isArray(data) || data.length === 0) {
              return { success: false, count: 0, error: '响应định dạng异常' };
            }

            console.log(`[APIConfig] Fetched ${data.length} models from pricing_new`);

            // Collect fresh MemeFast metadata first.
            // After sync completes we remove only this provider's stale entries,
            // then merge these fresh values into the latest store state.
            for (const m of data) {
              const name = m.model_name;
              if (!name) continue;
              if (m.model_type) memefastTypes[name] = m.model_type;
              if (m.tags) {
                memefastTags[name] = typeof m.tags === 'string'
                  ? m.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
                  : m.tags;
              }
              if (Array.isArray(m.supported_endpoint_types)) {
                memefastEndpoints[name] = m.supported_endpoint_types;
              }
              if (Array.isArray(m.enable_groups) && m.enable_groups.length > 0) {
                memefastEnableGroups[name] = m.enable_groups;
              }
            }

            // pricing_new Quay lại全量（公开 cột表），先收入
            for (const m of data) {
              if (typeof m.model_name === 'string' && m.model_name.length > 0) {
                allModelIds.add(m.model_name);
              }
            }

            // 再遍历每 key 查 /v1/models 补充该 key 独有Model
            const modelsUrl = /\/v\d+$/.test(baseUrl)
              ? `${baseUrl}/models`
              : `${baseUrl}/v1/models`;

            for (let ki = 0; ki < keys.length; ki++) {
              try {
                const resp = await fetch(modelsUrl, {
                  headers: { 'Authorization': `Bearer ${keys[ki]}` },
                });
                if (!resp.ok) {
                  console.warn(`[APIConfig] MemeFast key#${ki + 1} /v1/models returned ${resp.status}, skip`);
                  continue;
                }
                const j = await resp.json();
                const arr: Array<{ id: string; supported_endpoint_types?: string[] } | string> = j.data || j;
                if (!Array.isArray(arr)) continue;
                for (const m of arr) {
                  const id = typeof m === 'string' ? m : m.id;
                  if (typeof id === 'string' && id.length > 0) allModelIds.add(id);
                  // 补充 endpoint_types
                  if (typeof m !== 'string' && m.id && Array.isArray(m.supported_endpoint_types)) {
                    memefastEndpoints[m.id] = m.supported_endpoint_types as string[];
                  }
                }
                console.log(`[APIConfig] MemeFast key#${ki + 1} contributed models, total so far: ${allModelIds.size}`);
              } catch (e) {
                console.warn(`[APIConfig] MemeFast key#${ki + 1} /v1/models failed:`, e);
              }
            }
          } else {
            // Standard OpenAI-compatible: 遍历每 key 查 /v1/models，合并khử trùng
            const modelsUrl = /\/v\d+$/.test(baseUrl)
              ? `${baseUrl}/models`
              : `${baseUrl}/v1/models`;

            const endpointUpdates: Record<string, string[]> = {};
            let anySuccess = false;
            let lastError = '';

            for (let ki = 0; ki < keys.length; ki++) {
              try {
                const response = await fetch(modelsUrl, {
                  headers: { 'Authorization': `Bearer ${keys[ki]}` },
                });

                if (!response.ok) {
                  lastError = `key#${ki + 1} API Quay lại ${response.status}`;
                  console.warn(`[APIConfig] ${lastError}`);
                  continue;
                }

                const json = await response.json();
                const data: Array<{ id: string; [key: string]: unknown }> = json.data || json;
                if (!Array.isArray(data) || data.length === 0) {
                  console.warn(`[APIConfig] key#${ki + 1} returned empty model list`);
                  continue;
                }

                anySuccess = true;
                for (const m of data) {
                  const id = typeof m === 'string' ? m : m.id;
                  if (typeof id === 'string' && id.length > 0) allModelIds.add(id);
                  // Capture endpoint_types
                  if (typeof m !== 'string' && m.id && Array.isArray(m.supported_endpoint_types)) {
                    endpointUpdates[m.id] = m.supported_endpoint_types as string[];
                  }
                }
                console.log(`[APIConfig] key#${ki + 1} contributed models, total so far: ${allModelIds.size}`);
              } catch (e) {
                lastError = `key#${ki + 1} 网络请求Thất bại`;
                console.warn(`[APIConfig] ${lastError}:`, e);
              }
            }

            if (Object.keys(endpointUpdates).length > 0) {
              set((state) => ({
                modelEndpointTypes: {
                  ...state.modelEndpointTypes,
                  ...endpointUpdates,
                },
              }));
            }

            if (!anySuccess) {
              return { success: false, count: 0, error: lastError || 'API Quay lại异常' };
            }
          }

          const modelIds = Array.from(allModelIds);
          if (modelIds.length === 0) {
            return { success: false, count: 0, error: '未获取到任何Model' };
          }

          if (isMemefast) {
            const providerOwnedModels = new Set([...(provider.model || []), ...modelIds]);
            set((state) => ({
              modelTypes: {
                ...omitRecordKeys(state.modelTypes, providerOwnedModels),
                ...memefastTypes,
              },
              modelTags: {
                ...omitRecordKeys(state.modelTags, providerOwnedModels),
                ...memefastTags,
              },
              modelEndpointTypes: {
                ...omitRecordKeys(state.modelEndpointTypes, providerOwnedModels),
                ...memefastEndpoints,
              },
              modelEnableGroups: {
                ...omitRecordKeys(state.modelEnableGroups, providerOwnedModels),
                ...memefastEnableGroups,
              },
            }));
            console.log(`[APIConfig] Stored MemeFast metadata: ${Object.keys(memefastTypes).length} types, ${Object.keys(memefastTags).length} tags`);
          }

          // Replace provider model list with merged & deduped data
          get().updateProvider({ ...provider, model: modelIds });

          console.log(`[APIConfig] Synced ${modelIds.length} models for ${provider.name} (from ${keys.length} keys)`);
          return { success: true, count: modelIds.length };
        } catch (error) {
          console.error('[APIConfig] Model sync failed:', error);
          return { success: false, count: 0, error: '网络请求Thất bại，请kiểm tra网络' };
        }
      },

      // ==================== Feature Binding Management (Multi-Select) ====================
      
      // Cài đặtchức năng的Tất cả绑定（替换）
      setFeatureBindings: (feature, bindings) => {
        set((state) => ({
          featureBindings: { ...state.featureBindings, [feature]: bindings },
        }));
        console.log(`[APIConfig] Set ${feature} -> [${bindings?.join(', ') || '无'}]`);
      },
      
      // chuyển sang单绑定（Thêm/xóa）
      toggleFeatureBinding: (feature, binding) => {
        const current = get().featureBindings[feature] || [];
        const exists = current.includes(binding);
        
        // 同时kiểm tra legacy định dạng（platform:model）是否存在
        // 例如 binding = "{id}:deepseek-v3" 但 current 里可能有 "memefast:deepseek-v3"
        let legacyMatch: string | null = null;
        const idx = binding.indexOf(':');
        if (idx > 0) {
          const providerId = binding.slice(0, idx);
          const model = binding.slice(idx + 1);
          const provider = get().providers.find(p => p.id === providerId);
          if (provider) {
            const legacyKey = `${provider.platform}:${model}`;
            if (legacyKey !== binding && current.includes(legacyKey)) {
              legacyMatch = legacyKey;
            }
          }
        }
        
        if (exists || legacyMatch) {
          // Xóa：同时xóa精确Khớp和 legacy định dạng
          const newBindings = current.filter(b => b !== binding && b !== legacyMatch);
          set((state) => ({
            featureBindings: { ...state.featureBindings, [feature]: newBindings.length > 0 ? newBindings : null },
          }));
          console.log(`[APIConfig] Toggle ${feature}: ${binding} -> removed${legacyMatch ? ` (also removed legacy: ${legacyMatch})` : ''}`);
        } else {
          // Thêm
          const newBindings = [...current, binding];
          set((state) => ({
            featureBindings: { ...state.featureBindings, [feature]: newBindings.length > 0 ? newBindings : null },
          }));
          console.log(`[APIConfig] Toggle ${feature}: ${binding} -> added`);
        }
      },

      // 获取chức năng的Tất cả绑定
      getFeatureBindings: (feature) => {
        const bindings = get().featureBindings;
        const value = bindings?.[feature];
        // tương thích旧dữ liệu：如果是ký tự串，转为数组
        if (typeof value === 'string') return [value];
        return value || [];
      },

      // 获取chức năng对应的Tất cả provider + model
      getProvidersForFeature: (feature) => {
        const bindings = get().getFeatureBindings(feature);
        const results: Array<{ provider: IProvider; model: string }> = [];
        
        for (const binding of bindings) {
          const idx = binding.indexOf(':');
          if (idx <= 0) continue;
          const platformOrId = binding.slice(0, idx);
          const model = binding.slice(idx + 1);
          // 1. 优先按 provider.id 精确Khớp（luônan toàn）
          let provider = get().providers.find(p => p.id === platformOrId);
          // 2. Fallback: 按 platform Khớp，但仅当该 platform 下只有一Nhà cung cấp时
          //    （防止多 custom Nhà cung cấp时误选第一）
          if (!provider) {
            const platformMatches = get().providers.filter(p => p.platform === platformOrId);
            if (platformMatches.length === 1) {
              provider = platformMatches[0];
            } else if (platformMatches.length > 1) {
              console.warn(`[APIConfig] Ambiguous platform binding "${binding}" matches ${platformMatches.length} providers, skipping`);
            }
          }
          if (!provider || parseApiKeys(provider.apiKey).length === 0) {
            continue;
          }

          // Skip stale hidden bindings that no longer exist in the provider's synced model list.
          // This prevents runtime from executing models that the service-mapping UI can no longer display.
          if (provider.model.length > 0 && !provider.model.includes(model)) {
            console.warn(
              `[APIConfig] Skipping stale binding "${binding}" for ${feature}: model "${model}" is not in provider "${provider.name}" model list`
            );
            continue;
          }

          results.push({ provider, model });
        }
        return results;
      },

      isFeatureConfigured: (feature) => {
        return get().getProvidersForFeature(feature).length > 0;
      },
      
      // Legacy single-select compat (deprecated, for backward compat)
      setFeatureBinding: (feature, providerId) => {
        // 单选tương thích：Cài đặt为单元素数组
        get().setFeatureBindings(feature, providerId ? [providerId] : null);
      },

      getFeatureBinding: (feature) => {
        const bindings = get().getFeatureBindings(feature);
        return bindings[0] || null;
      },

      getProviderForFeature: (feature) => {
        const providers = get().getProvidersForFeature(feature);
        return providers[0]?.provider;
      },

      // ==================== Legacy API Key management (v1 compat) ====================
      
      setApiKey: (provider, key) => {
        // Update legacy apiKeys
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: key },
        }));
        
        // Also update provider if exists
        const existingProvider = get().getProviderByPlatform(provider);
        if (existingProvider) {
          get().updateProvider({ ...existingProvider, apiKey: key });
        }
        
        console.log(`[APIConfig] Updated ${provider} API key: ${get().maskApiKey(key)}`);
      },

      getApiKey: (provider) => {
        // First check providers (v2)
        const prov = get().getProviderByPlatform(provider);
        if (prov?.apiKey) {
          // Return first key for compatibility
          const keys = parseApiKeys(prov.apiKey);
          return keys[0] || '';
        }
        // Fallback to legacy apiKeys
        return get().apiKeys[provider] || '';
      },

      clearApiKey: (provider) => {
        // Clear from legacy
        set((state) => {
          const newKeys = { ...state.apiKeys };
          delete newKeys[provider];
          return { apiKeys: newKeys };
        });
        
        // Also clear from provider if exists
        const existingProvider = get().getProviderByPlatform(provider);
        if (existingProvider) {
          get().updateProvider({ ...existingProvider, apiKey: '' });
        }
        
        console.log(`[APIConfig] Cleared ${provider} API key`);
      },

      clearAllApiKeys: () => {
        // Clear legacy
        set({ apiKeys: {} });
        
        // Clear all provider keys
        const { providers, updateProvider } = get();
        providers.forEach(p => {
          updateProvider({ ...p, apiKey: '' });
        });
        
        console.log('[APIConfig] Cleared all API keys');
      },

      // ==================== Concurrency ====================
      
      setConcurrency: (n) => {
        const value = Math.max(1, n); // 最小为1，无上限
        set({ concurrency: value });
        console.log(`[APIConfig] Set concurrency to ${value}`);
      },

      // ==================== Aspect ratio ====================
      
      setAspectRatio: (ratio) => {
        set({
          aspectRatio: ratio,
          orientation: ratio === '16:9' ? 'landscape' : 'portrait',
        });
        console.log(`[APIConfig] Set aspect ratio to ${ratio}`);
      },

      toggleOrientation: () => {
        const { aspectRatio } = get();
        const newRatio = aspectRatio === '16:9' ? '9:16' : '16:9';
        get().setAspectRatio(newRatio);
      },

      // ==================== Advanced Generation Options ====================
      
      setAdvancedOption: (key, value) => {
        set((state) => ({
          advancedOptions: { ...state.advancedOptions, [key]: value },
        }));
        console.log(`[APIConfig] Set advanced option ${key} = ${value}`);
      },

      resetAdvancedOptions: () => {
        set({ advancedOptions: { ...DEFAULT_ADVANCED_OPTIONS } });
        console.log('[APIConfig] Reset advanced options to defaults');
      },

      // ==================== Image Host Providers (independent) ====================

      addImageHostProvider: (providerData) => {
        const newProvider = normalizeImageHostProvider({
          ...providerData,
          id: generateId(),
        });
        set((state) => ({
          imageHostProviders: [...state.imageHostProviders, newProvider],
        }));
        console.log(`[APIConfig] Added image host: ${newProvider.name}`);
        return newProvider;
      },

      updateImageHostProvider: (provider) => {
        const normalizedProvider = normalizeImageHostProvider(provider);
        set((state) => ({
          imageHostProviders: state.imageHostProviders.map(p => p.id === normalizedProvider.id ? normalizedProvider : p),
        }));
        console.log(`[APIConfig] Updated image host: ${normalizedProvider.name}`);
      },

      removeImageHostProvider: (id) => {
        const provider = get().imageHostProviders.find(p => p.id === id);
        set((state) => ({
          imageHostProviders: state.imageHostProviders.filter(p => p.id !== id),
        }));
        if (provider) {
          console.log(`[APIConfig] Removed image host: ${provider.name}`);
        }
      },

      getImageHostProviderById: (id) => {
        const provider = get().imageHostProviders.find(p => p.id === id);
        return provider && isVisibleImageHostProvider(provider)
          ? normalizeImageHostProvider(provider)
          : undefined;
      },

      getEnabledImageHostProviders: () => {
        return normalizeImageHostProviders(get().imageHostProviders).filter(p => p.enabled);
      },

      isImageHostConfigured: () => {
        const providers = normalizeImageHostProviders(get().imageHostProviders);
        return providers.some(p => {
          const hasKey = parseApiKeys(p.apiKey).length > 0;
          const hasUrl = !!(p.baseUrl || p.uploadPath);
          return p.enabled && hasUrl && (p.apiKeyOptional || hasKey);
        });
      },

      // ==================== Validation ====================
      
      isConfigured: (provider) => {
        // Check v2 providers first
        const prov = get().getProviderByPlatform(provider);
        if (prov) {
          return parseApiKeys(prov.apiKey).length > 0;
        }
        // Fallback to legacy
        const key = get().apiKeys[provider];
        return !!key && key.length > 0;
      },

      isPlatformConfigured: (platform) => {
        const provider = get().getProviderByPlatform(platform);
        return !!provider && parseApiKeys(provider.apiKey).length > 0;
      },

      checkRequiredKeys: (services) => {
        const missing: string[] = [];
        const { isConfigured } = get();

        for (const service of services) {
          // Find provider for this service
          for (const [providerId, info] of Object.entries(PROVIDER_INFO)) {
            if (info.services.includes(service) && !isConfigured(providerId as ProviderId)) {
              if (!missing.includes(info.name)) {
                missing.push(info.name);
              }
            }
          }
        }

        return {
          isAllConfigured: missing.length === 0,
          missingKeys: missing,
          friendlyMessage: missing.length === 0
            ? 'Tất cả API Key Đã cấu hình'
            : `缺少以下 API Key：${missing.join('、')}`,
        };
      },

      checkChatKeys: () => {
        return get().checkRequiredKeys(['chat']);
      },

      checkVideoGenerationKeys: () => {
        return get().checkRequiredKeys(['chat', 'image', 'video']);
      },

      // ==================== Display helpers ====================
      
      maskApiKey: (key) => {
        return maskKey(key);
      },

      getAllConfigs: () => {
        const { apiKeys, maskApiKey, isConfigured } = get();
        return (Object.keys(PROVIDER_INFO) as ProviderId[]).map((provider) => ({
          provider,
          configured: isConfigured(provider),
          masked: maskApiKey(apiKeys[provider] || ''),
        }));
      },

      // ==================== Model limits discovery ====================

      getDiscoveredModelLimits: (model) => {
        return get().discoveredModelLimits[model];
      },

      setDiscoveredModelLimits: (model, limits) => {
        set((state) => ({
          discoveredModelLimits: {
            ...state.discoveredModelLimits,
            [model]: {
              ...state.discoveredModelLimits[model],
              ...limits,
              discoveredAt: Date.now(),
            } as DiscoveredModelLimits,
          },
        }));
        console.log(`[APIConfig] Discovered model limits for ${model}:`, limits);
      },
    }),
    {
      name: 'opencut-api-config',  // localStorage key
      version: 13,  // v13: clear stale metadata caches on upgrade + fix chained migration
      migrate: (persistedState: unknown, version: number) => {
        // Use mutable result object for chained migration
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = { ...(persistedState as any) } as Partial<APIConfigState> & { imageHostConfig?: LegacyImageHostConfig };
        console.log(`[APIConfig] Chained migration: v${version} → v13`);
        
        // Default feature bindings for migration
        const defaultBindings: FeatureBindings = {
          script_analysis: null,
          character_generation: null,
          scene_generation: null,
          video_generation: null,
          image_understanding: null,
          chat: null,
          freedom_image: null,
          freedom_video: null,
        };
        const resolveImageHostProviders = (): ImageHostProvider[] => {
          const legacyConfig = result?.imageHostConfig;
          let imageHostProviders: ImageHostProvider[] = normalizeImageHostProviders(result?.imageHostProviders || []);

          if (
            imageHostProviders.length > 0
            && !imageHostProviders.some((provider) => provider.platform === 'catbox')
            && imageHostProviders.every(isUnconfiguredDefaultImgBBProvider)
          ) {
            imageHostProviders = createDefaultImageHostProviders();
          }

          if (
            imageHostProviders.length > 0
            && !imageHostProviders.some((provider) => provider.platform === 'scdn')
            && imageHostProviders.every((provider) => (
              isUnconfiguredDefaultImgBBProvider(provider) || isUnconfiguredDefaultCatboxProvider(provider)
            ))
          ) {
            imageHostProviders = createDefaultImageHostProviders();
          }

          if (!imageHostProviders || imageHostProviders.length === 0) {
            if (legacyConfig) {
              const imgbbPreset = findImageHostPreset('imgbb');
              if (legacyConfig.type === 'imgbb' && imgbbPreset) {
                imageHostProviders = [
                  {
                    ...imgbbPreset,
                    id: generateId(),
                    apiKey: legacyConfig.imgbbApiKey || '',
                    enabled: true,
                  },
                ];
              } else if (legacyConfig.type === 'custom' && legacyConfig.custom) {
                imageHostProviders = [
                  {
                    id: generateId(),
                    platform: 'custom',
                    name: 'Tùy chỉnhLưu trữ ảnh',
                    baseUrl: legacyConfig.custom.uploadUrl || '',
                    uploadPath: '',
                    apiKey: legacyConfig.custom.apiKey || '',
                    enabled: true,
                  },
                ];
              } else if (legacyConfig.type === 'cloudflare_r2') {
                imageHostProviders = [
                  {
                    id: generateId(),
                    platform: 'cloudflare_r2',
                    name: 'Cloudflare R2',
                    baseUrl: '',
                    uploadPath: '',
                    apiKey: '',
                    enabled: false,
                  },
                ];
              }
            }

            if (!imageHostProviders || imageHostProviders.length === 0) {
              imageHostProviders = createDefaultImageHostProviders();
            }
          }

          return normalizeImageHostProviders(imageHostProviders);
        };

        // ========== Chained migration: each step mutates `result` and falls through ==========
        
        // v0/v1 → v2: Migrate apiKeys to providers
        if (version <= 1) {
          const oldApiKeys = result?.apiKeys || {};
          const providers: IProvider[] = [];
          
          for (const template of DEFAULT_PROVIDERS) {
            const existingKey = oldApiKeys[template.platform as ProviderId] || '';
            providers.push({
              id: generateId(),
              ...template,
              apiKey: existingKey,
            });
          }
          
          console.log(`[APIConfig] v0/v1→v2: Migrated ${providers.length} providers from apiKeys`);
          result.providers = providers;
          result.featureBindings = defaultBindings;
          result.apiKeys = oldApiKeys;
          version = 2; // continue to next step
        }

        // v2 → v3: Ensure providers and featureBindings exist
        if (version <= 2) {
          result.providers = result.providers || [];
          result.featureBindings = { ...defaultBindings, ...(result.featureBindings || {}) };
          version = 3;
        }

        // v3 → v4: Ensure RunningHub model uses AppId
        if (version <= 3) {
          result.providers = (result.providers || []).map((p: IProvider) => {
            if (p.platform === 'runninghub') {
              const hasOldModel = p.model?.includes('qwen-image-edit-angles');
              const hasAppId = p.model?.includes('2009613632530812930');
              if (!p.model || p.model.length === 0 || hasOldModel || !hasAppId) {
                return { ...p, model: ['2009613632530812930'] };
              }
            }
            return p;
          });
          result.featureBindings = { ...defaultBindings, ...(result.featureBindings || {}) };
          version = 4;
        }

        // v4/v5 → v6: Convert featureBindings from string to string[] (multi-select)
        if (version <= 5) {
          const oldBindings = result.featureBindings || {};
          const newBindings: FeatureBindings = { ...defaultBindings };
          
          for (const [key, value] of Object.entries(oldBindings)) {
            const feature = key as AIFeature;
            if (typeof value === 'string' && value) {
              newBindings[feature] = [value];
              console.log(`[APIConfig] v5→v6: Migrated ${feature}: "${value}" -> ["${value}"]`);
            } else if (Array.isArray(value)) {
              newBindings[feature] = value;
            } else {
              newBindings[feature] = null;
            }
          }
          
          result.featureBindings = newBindings;
          console.log(`[APIConfig] v5→v6: Migrated featureBindings to multi-select format`);
          version = 6;
        }

        // v6 → v7: Remove deprecated providers (dik3, nanohajimi, apimart, viipu)
        if (version <= 6) {
          const DEPRECATED_PLATFORMS = ['dik3', 'nanohajimi', 'apimart', 'viipu'];
          const oldProviders: IProvider[] = result.providers || [];
          const cleanedProviders = oldProviders.filter(
            (p: IProvider) => !DEPRECATED_PLATFORMS.includes(p.platform)
          );
          const removedCount = oldProviders.length - cleanedProviders.length;
          if (removedCount > 0) {
            console.log(`[APIConfig] v6→v7: Removed ${removedCount} deprecated providers`);
          }
          
          const oldBindings = result.featureBindings || {};
          const cleanedBindings: FeatureBindings = { ...defaultBindings };
          for (const [key, value] of Object.entries(oldBindings)) {
            const feature = key as AIFeature;
            if (Array.isArray(value)) {
              const filtered = value.filter(
                (b: string) => !DEPRECATED_PLATFORMS.some((dp) => b.startsWith(dp + ':'))
              );
              cleanedBindings[feature] = filtered.length > 0 ? filtered : null;
            } else {
              cleanedBindings[feature] = null;
            }
          }
          
          result.providers = cleanedProviders;
          result.featureBindings = cleanedBindings;
          version = 7;
        }

        // v7 → v8: (no-op, pass through)
        if (version <= 7) {
          version = 8;
        }

        // v8 → v9: Convert platform:model bindings to id:model format
        if (version <= 8) {
          const providers: IProvider[] = result.providers || [];
          const oldBindings = result.featureBindings || {};
          const newBindings: FeatureBindings = { ...defaultBindings };
          let convertedCount = 0;
          let removedCount = 0;
          
          for (const [key, value] of Object.entries(oldBindings)) {
            const feature = key as AIFeature;
            if (!Array.isArray(value)) {
              newBindings[feature] = value ? [value as unknown as string] : null;
              continue;
            }
            const converted: string[] = [];
            for (const binding of value) {
              const idx = binding.indexOf(':');
              if (idx <= 0) { converted.push(binding); continue; }
              const platformOrId = binding.slice(0, idx);
              const model = binding.slice(idx + 1);
              
              if (providers.some(p => p.id === platformOrId)) {
                converted.push(binding);
                continue;
              }
              
              const matches = providers.filter(p => p.platform === platformOrId);
              if (matches.length === 1) {
                const newBinding = `${matches[0].id}:${model}`;
                converted.push(newBinding);
                convertedCount++;
                console.log(`[APIConfig] v8→v9: Converted binding "${binding}" -> "${newBinding}"`);
              } else if (matches.length > 1) {
                removedCount++;
                console.warn(`[APIConfig] v8→v9: Removed ambiguous binding "${binding}" (${matches.length} providers with platform "${platformOrId}")`);
              } else {
                converted.push(binding);
              }
            }
            newBindings[feature] = converted.length > 0 ? converted : null;
          }
          
          if (convertedCount > 0 || removedCount > 0) {
            console.log(`[APIConfig] v8→v9: Converted ${convertedCount} bindings, removed ${removedCount} ambiguous`);
          }
          
          result.featureBindings = newBindings;
          version = 9;
        }

        // v9 → v10: normalize image-host provider fields (pass through to resolveImageHostProviders at end)
        if (version <= 9) {
          version = 10;
        }

        // v10 → v11: switch defaults to Catbox/ImgBB (pass through to resolveImageHostProviders at end)
        if (version <= 10) {
          version = 11;
        }

        // v11 → v12: switch defaults to SCDN (pass through to resolveImageHostProviders at end)
        if (version <= 11) {
          version = 12;
        }

        // v12 → v13: Clear stale API metadata caches to force fresh sync on startup
        // This fixes the issue where cached modelEndpointTypes / modelEnableGroups / modelTypes / modelTags
        // from an old version cause incorrect API routing after an in-place upgrade (Ghi đè安装)
        if (version <= 12) {
          console.log(`[APIConfig] v12→v13: Clearing stale API metadata caches (modelEndpointTypes, modelTypes, modelTags, modelEnableGroups, discoveredModelLimits)`);
          result.modelEndpointTypes = {};
          result.modelTypes = {};
          result.modelTags = {};
          result.modelEnableGroups = {};
          result.discoveredModelLimits = {};
          
          // Backfill missing provider defaults without overwriting user-edited values.
          if (Array.isArray(result.providers)) {
            result.providers = result.providers.map((p: IProvider) => {
              const template = DEFAULT_PROVIDERS.find(t => t.platform === p.platform);
              if (template) {
                const updated = {
                  ...p,
                  baseUrl: p.baseUrl?.trim() ? p.baseUrl : template.baseUrl,
                  name: p.name?.trim() ? p.name : template.name,
                };
                if (updated.baseUrl !== p.baseUrl || updated.name !== p.name) {
                  console.log(`[APIConfig] v12→v13: Updated ${p.platform} baseUrl: "${p.baseUrl}" -> "${template.baseUrl}"`);
                }
                return updated;
              }
              return p;
            });
          }
          
          version = 13;
        }

        // ========== Final normalization (always runs) ==========

        // Ensure all feature binding keys exist and normalize string → string[]
        const finalBindings: FeatureBindings = { ...defaultBindings };
        if (result.featureBindings) {
          for (const [key, value] of Object.entries(result.featureBindings)) {
            const feature = key as AIFeature;
            if (typeof value === 'string' && value) {
              finalBindings[feature] = [value];
            } else if (Array.isArray(value)) {
              finalBindings[feature] = value;
            } else {
              finalBindings[feature] = null;
            }
          }
        }
        result.featureBindings = finalBindings;

        // Resolve image host providers (handles all legacy formats)
        result.imageHostProviders = resolveImageHostProviders();

        console.log(`[APIConfig] Migration complete: v${version}`);
        return result;
      },
      partialize: (state) => ({
        // Persist these fields
        providers: state.providers,
        featureBindings: state.featureBindings,
        apiKeys: state.apiKeys, // Keep for backward compat
        concurrency: state.concurrency,
        aspectRatio: state.aspectRatio,
        orientation: state.orientation,
        advancedOptions: state.advancedOptions,
        imageHostProviders: state.imageHostProviders,
        modelEndpointTypes: state.modelEndpointTypes,
        modelTypes: state.modelTypes,
        modelTags: state.modelTags,
        modelEnableGroups: state.modelEnableGroups,
        discoveredModelLimits: state.discoveredModelLimits,
      }),
    }
  )
);

// ==================== Selectors ====================

/**
 * Check if all required APIs for video generation are configured
 */
export const useIsVideoGenerationReady = (): boolean => {
  return useAPIConfigStore((state) => {
    const status = state.checkVideoGenerationKeys();
    return status.isAllConfigured;
  });
};

/**
 * Get the current concurrency setting
 */
export const useConcurrency = (): number => {
  return useAPIConfigStore((state) => state.concurrency);
};

// ==================== Model Registry Cache Injection ====================

// Inject discovery cache into model-registry (avoids circular dependency)
// This runs once when the module is loaded
injectDiscoveryCache(
  (model: string) => useAPIConfigStore.getState().getDiscoveredModelLimits(model),
  (model: string, limits: Partial<DiscoveredModelLimits>) => useAPIConfigStore.getState().setDiscoveredModelLimits(model, limits),
);
