// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Script Parser Service
 * Uses AI chat APIs to parse screenplay text and extract structured data
 * Based on CineGen-AI geminiService.ts patterns
 */

import type { ScriptData, ScriptCharacter, ScriptScene, ScriptParagraph, Shot } from "@/types/script";
import { retryOperation } from "@/lib/utils/retry";
import { cleanJsonString, safeParseJson, normalizeIds } from "@/lib/utils/json-cleaner";
import { delay, RATE_LIMITS } from "@/lib/utils/rate-limiter";
import { ApiKeyManager } from "@/lib/api-key-manager";
import { getModelLimits, parseModelLimitsFromError, cacheDiscoveredLimits, estimateTokens } from "@/lib/ai/model-registry";
import { corsFetch } from "@/lib/cors-fetch";

/**
 * Normalize time value to match scene-store TIME_PRESETS
 * Maps Chinese time descriptions to standard time IDs
 */
function normalizeTimeValue(time: string | undefined): string {
  if (!time) return 'day';
  
  const timeMap: Record<string, string> = {
    // Chinese mappings
    'ban ngày': 'day',
    '日间': 'day',
    '上午': 'day',
    '下午': 'day',
    'ban đêm': 'night',
    '夜间': 'night',
    '深夜': 'midnight',
    '半夜': 'midnight',
    'Hoàng hôn': 'dusk',
    '日落': 'dusk',
    '働晚': 'dusk',
    'Bình minh': 'dawn',
    '早晨': 'dawn',
    '清晨': 'dawn',
    '日出': 'dawn',
    'đang xử lý... 'noon',
    '正午': 'noon',
    // English mappings (pass through)
    'day': 'day',
    'night': 'night',
    'dawn': 'dawn',
    'dusk': 'dusk',
    'noon': 'noon',
    'midnight': 'midnight',
  };
  
  const normalized = time.toLowerCase().trim();
  return timeMap[normalized] || timeMap[time] || 'day';
}

const PARSE_SYSTEM_PROMPT = `你是一chuyên nghiệp的剧本分析师。分析用户提供的剧本/故事文本，提取Cấu trúc化信息。

请严格按照以下JSON格式返回kết quả（不要包含任何其他文字）：
{
  "title": "故事标题",
  "genre": "类型（如：爱情、悬疑、喜剧等）",
  "logline": "一句话概述",
  "characters": [
    {
      "id": "char_1",
      "name": "角色名",
      "gender": "Giới tính",
      "age": "Tuổi",
      "role": "详细的Danh tính背景Mô tả，包括职业、地位、背景故事等",
      "personality": "详细的Tính cách特点Mô tả，包括处事方式、价值观等",
      "traits": "Đặc trưng cốt lõi的详细Mô tả，包括突出能力、特点等",
      "skills": "Kỹ năng/năng lựcMô tả（如武功招式、魔法、chuyên nghiệp技能等）",
      "keyActions": "quan trọng行为/事迹Mô tả，重要的历史行动",
      "appearance": "Đặc điểm ngoại hình（如有）",
      "relationships": "与其他角色的关系",
      "tags": ["角色标签，如: 武侠, 男主, 剑客, 反派, 女将军"],
      "notes": "角色备注（剧情说明，如: 本剧nhân vật chính，在第三幕触发激烈冲突）"
    }
  ],
  "episodes": [
    {
      "id": "ep_1",
      "index": 1,
      "title": "第1 tập标题",
      "description": "本 tập概要",
      "sceneIds": ["scene_1", "scene_2"]
    }
  ],
  "scenes": [
    {
      "id": "scene_1",
      "episodeId": "ep_1",
      "name": "场景名称（如：雁城大街、荒野古庙、宫庭内院）",
      "location": "详细地点Mô tả（包括建筑特征、环境元素、địa lý特点等）",
      "time": "时间设定（day/night/dawn/dusk/noon/midnight）",
      "atmosphere": "详细氛围Mô tả（如：căng thẳng压抑、ấm cúng宁静、bí ẩn阴森、悲壮肇杀）",
      "visualPrompt": "场景的详细Mô tả thị giác，用于Tạo场景概念图（包括光线、天气、Phong cách kiến trúc、特殊元素等，用英文）",
      "tags": ["场景quan trọng元素标签，如: 木柱, 棱, 古建筑, 废墟, 深林"],
      "notes": "地点备注（剧情说明，如: 决战发生的古老殿堂）"
    }
  ],
  "storyParagraphs": [
    {
      "id": 1,
      "text": "段落内容",
      "sceneRefId": "scene_1"
    }
  ]
}

重要要求：
1. 【角色信息必须详细】：不要简化角色信息！保留原文đang xử lý...t cả细节：
   - role: đầy đủ的Danh tính背景（如"北疆侠义之士，惊鸿剑持有者，曾镇守雁城..."）
   - personality: đầy đủ的Tính cáchMô tả（如"重侠义、护苍生、轻权位、有原则，面对构陷不屑辩解..."）
   - traits: đầy đủ的Đặc trưng cốt lõi（如"武功卓绝，心怀苍生，淡泊名利"）
   - skills: 技能Mô tả（如"擅惊鸿剑法、朝阳心法，以未出鞘之剑可压制强敌"）
   - keyActions: Sự kiện quan trọng（如"镇守雁城十二月斩幽冒阁十三坛主..."）
   - tags: 角色标签，3-5，Mô tả角色类型和特征（如: 武侠, 男主, 剑客, 守护者）
   - notes: 角色备注，说明这角色在剧情đang xử lý...（如: "本剧nhân vật chính，第三幕触发冲突"）
2. 【场景Thiết kế必须详细】：不要简化场景信息！场景是视觉Tạo的基础：
   - name: 场景名称要具体有辨识度（不要只写"室内""室外"）
   - location: 详细地点Mô tả，包括建筑特征、环境元素
   - time: Sử dụng英文时间词（day/night/dawn/dusk/noon/midnight）
   - atmosphere: 详细氛围，不要只写一字
   - visualPrompt: 用英文写出场景的Mô tả thị giác（光线、天气、风格、建筑特征等），例如：
     "Ancient Chinese city street at dawn, misty atmosphere, traditional wooden buildings with curved roofs, lanterns hanging, cobblestone path, golden morning light, dramatic clouds"
   - tags: 场景quan trọng元素标签，3-6，Mô tả环境特征（如: 木柱, 棱, 古建筑, 烟雾, 残垣断壁）
   - notes: 地点备注，说明这场景在剧情đang xử lý...（如: "决战发生的古老殿堂"）
3. 识别多 tậpCấu trúc。如果剧本包含"第X tập"、"Episode X"、"第X章"等标记，要拆分成多 episode
4. 如果没有明确的 tập标记，tạo单 episode 包含Tất cả场景
5. 角色IDSử dụng char_1, char_2 格式
6. 场景IDSử dụng scene_1, scene_2 格式
7.  tậpIDSử dụng ep_1, ep_2 格式`;

// Per-scene shot generation prompt (based on CineGen-AI)
const SHOT_GENERATION_SYSTEM_PROMPT = `你是一chuyên nghiệp的分镜师/摄影指导。为单场景Tạo电影级别的详细镜头列表（Camera Blocking）。

请严格按照以下JSON数组格式返回kết quả（不要包含任何其他文字）：
[
  {
    "sceneId": "scene_1",
    "shotSize": "Kích thước cảnh（WS/MS/CU/ECU）",
    "duration": 4.0,
    "visualDescription": "详细的đang xử lý...Mô tả，包括场景、光线、角色动作、Biểu cảm等",
    "actionSummary": "简短的动作概述",
    "cameraMovement": "镜头运动",
    "dialogue": "Thoại内容（包含说话者和语气）",
    "ambientSound": "环境声Mô tả",
    "soundEffect": "Hiệu ứng âm thanhMô tả",
    "characters": ["角色名"],
    "keyframes": [
      {
        "id": "kf-1-start",
        "type": "start",
        "visualPrompt": "详细的英文Mô tả thị giác（用于图片Tạo）"
      }
    ]
  }
]

分镜原则：
1. 【重要】每场景最多6-8镜头，TránhJSONcắt ngắn
2. 【Kích thước cảnh缩写】WS=Viễn cảnh, MS=đang xử lý...CU=Cận cảnh, ECU=Cực cận cảnh, FS=全景
3. 【镜头运动】Sử dụngchuyên nghiệp术语：
   - Static(Cố định), Dolly In(推进), Dolly Out(拉远), Pan Left/Right(摇), Tilt Up/Down(仰/俯)
   - Tracking(跟随), Crane(Nâng hạ), Handheld(Cầm tay), Zoom In/Out(Zoom)
4. 【Mô tả thị giác】visualDescription 要像写电影文学剧本，详细Mô tả：
   - 场景光影（如"黑暗đang xử lý...芒笼罩"）
   - 角色状态（如"身穿明vàng八卦袝，身姿矫健"）
   - 气氛营造（如"căng thẳng的对峰气氛"）
   - 具体动作（如"镜头缓缓推进"）
5. 【音频Thiết kế】每镜头都要考虑：
   - ambientSound: 环境音（风声、雨声、人声鼎沸、寢静等）
   - soundEffect: Hiệu ứng âm thanh（脚步声、剑鸣、门响、爆炸等）
   - dialogue: Thoại要包含说话人和语气（如"天师（低沉肇立）：天地大无边..."）
6. 【thời lượng】duration 估算每镜头秒数（2-8秒，根据内容复杂度）
7. 【visualPrompt】英文Mô tả，40词内，用于图片Tạo，格式：
   "[Scene setting], [lighting], [character appearance and action], [mood], [camera angle], [style keywords]"
   示例："Ancient altar in darkness, dim candlelight, Taoist priest in yellow robe standing solemnly, mysterious atmosphere, wide shot, cinematic, dramatic lighting"`;

interface ParseOptions {
  apiKey: string; // Supports comma-separated multiple keys
  provider: string;
  baseUrl: string;
  model: string;
  language?: string;
  sceneCount?: number; // 限制场景数量（用于预告片等）
  shotCount?: number; // 每场景分镜数提示（传递给后续 shot generation）
  keyManager?: ApiKeyManager; // Optional: use existing key manager for rotation
  temperature?: number; // Tùy chỉnh温度，默认 0.7
  maxTokens?: number; // Tùy chỉnh最大输出 token 数，默认 4096
  /** 关闭推理模型深度思考（智谱 GLM-4.7/4.5 等），Tránh reasoning 耗尽 token */
  disableThinking?: boolean;
}

interface ShotGenerationOptions extends ParseOptions {
  targetDuration: string;
  styleId: string;
  characterDescriptions?: Record<string, string>;
  shotCount?: number; // 限制总分镜数量（用于预告片等）
  concurrency?: number; // 并行处理场景数（默认1，多 key 时可设置更高）
}

// Use imported cleanJsonString from json-cleaner.ts

/**
 * Call chat API (Zhipu or OpenAI compatible) with multi-key rotation support
 */
export async function callChatAPI(
  systemPrompt: string,
  userPrompt: string,
  options: ParseOptions
): Promise<string> {
  const { apiKey, provider, baseUrl, model } = options;
  
  console.log('\n[callChatAPI] ==================== API gọi API开始 ====================');
  console.log('[callChatAPI] provider:', provider);
  console.log('[callChatAPI] apiKey 长度:', apiKey?.length || 0);
  console.log('[callChatAPI] apiKey 是否为空:', !apiKey);
  console.log('[callChatAPI] baseUrl:', baseUrl);
  console.log('[callChatAPI] systemPrompt 长度:', systemPrompt.length);
  console.log('[callChatAPI] userPrompt 长度:', userPrompt.length);
  
  if (!apiKey) {
    console.error('[callChatAPI] ❌ API Key 为空！');
    throw new Error('API Key 未配置');
  }
  
  // Create or use existing key manager for rotation
  const keyManager = options.keyManager || new ApiKeyManager(apiKey);
  
  const totalKeys = keyManager.getTotalKeyCount();
  console.log(`[callChatAPI] Sử dụng ${provider}，共 ${totalKeys}  API keys`);

  if (!baseUrl) {
    throw new Error('Base URL 未配置');
  }
  if (!model) {
    throw new Error('模型未配置');
  }
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const url = /\/v\d+$/.test(normalizedBaseUrl)
    ? `${normalizedBaseUrl}/chat/completions`
    : `${normalizedBaseUrl}/v1/chat/completions`;
  
  // 从 Model Registry 查询模型限制（3 lớp查找：缓存→静态→default）
  const modelLimits = getModelLimits(model);
  const requestedMaxTokens = options.maxTokens ?? 4096;
  const effectiveMaxTokens = Math.min(requestedMaxTokens, modelLimits.maxOutput);
  if (effectiveMaxTokens < requestedMaxTokens) {
    console.log(`[callChatAPI] max_tokens Tự động clamp: ${requestedMaxTokens} -> ${effectiveMaxTokens} (${model} maxOutput=${modelLimits.maxOutput})`);
  }
  
  // === Token Budget Calculator ===
  const inputTokens = estimateTokens(systemPrompt + userPrompt);
  const safetyMargin = Math.ceil(modelLimits.contextWindow * 0.1);
  const availableForOutput = modelLimits.contextWindow - inputTokens - safetyMargin;
  const utilization = Math.round((inputTokens / modelLimits.contextWindow) * 100);
  
  console.log(
    `[Dispatch] ${model}: input≈${inputTokens} / ctx=${modelLimits.contextWindow}, ` +
    `output=${effectiveMaxTokens} (余量${100 - utilization}%)`
  );
  
  // 输入已超过 context window 的 90% → 抛出lỗi（不发请求，省钱）
  if (inputTokens > modelLimits.contextWindow * 0.9) {
    const err = new Error(
      `[TokenBudget] 输入 token (≈${inputTokens}) vượt quá ${model} 的 context window ` +
      `(${modelLimits.contextWindow}) 的 90%，请缩减输入或Sử dụng更大上下文的模型`
    );
    (err as any).code = 'TOKEN_BUDGET_EXCEEDED';
    (err as any).inputTokens = inputTokens;
    (err as any).contextWindow = modelLimits.contextWindow;
    throw err;
  }
  
  // 输出空间不到请求的 50% → 打印 warning
  if (availableForOutput < requestedMaxTokens * 0.5) {
    console.warn(
      `[Dispatch] ⚠️ ${model}: 输出空间căng thẳng！可用≈${availableForOutput} tokens，` +
      `请求=${requestedMaxTokens}，可能导致输出被cắt ngắn`
    );
  }
  
  console.log('[callChatAPI] 请求 URL:', url);

  // Use retryOperation with key rotation on rate limit
  return await retryOperation(async () => {
    // Get current key from rotation
    const currentKey = keyManager.getCurrentKey();
    if (!currentKey) {
      throw new Error('No API keys available');
    }
    
    console.log(`[callChatAPI] Using key index, available: ${keyManager.getAvailableKeyCount()}/${totalKeys}`);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${currentKey}`,
    };
    
    // 模型Chọn逻辑：必须Sử dụng配置 model
    const modelName = model;
    console.log('[callChatAPI] Sử dụng模型:', modelName);
    
    const body: Record<string, any> = {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: options.temperature ?? 0.7,
      max_tokens: effectiveMaxTokens,
    };

    // 智谱推理模型 (GLM-4.7/4.5 , v.v.) 支持通过 thinking.type 关闭深度思考
    if (options.disableThinking) {
      body.thinking = { type: 'disabled' };
      console.log('[callChatAPI] 已关闭深度思考 (thinking: disabled)');
    }

    const response = await corsFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      // Handle rate limit or auth error with key rotation
      if (keyManager.handleError(response.status, errorText)) {
        console.log(`[callChatAPI] Rotated to next API key due to error ${response.status}, available: ${keyManager.getAvailableKeyCount()}/${totalKeys}`);
      }
      
      // === Error-driven Discovery: 400 lỗiTự độngPhát hiện模型限制并Thử lại ===
      if (response.status === 400) {
        const discovered = parseModelLimitsFromError(errorText);
        if (discovered) {
          cacheDiscoveredLimits(model, discovered);
          
          // 如果Phát hiện了 maxOutput 限制且当前请求vượt quá，立即用正确值Thử lại
          if (discovered.maxOutput && effectiveMaxTokens > discovered.maxOutput) {
            const correctedMaxTokens = Math.min(requestedMaxTokens, discovered.maxOutput);
            console.warn(
              `[callChatAPI] 🧠 Phát hiện ${model} maxOutput=${discovered.maxOutput}，` +
              `以 max_tokens=${correctedMaxTokens} Tự độngThử lại...`
            );
            const retryBody = { ...body, max_tokens: correctedMaxTokens };
            const retryResp = await corsFetch(url, {
              method: 'POST',
              headers,
              body: JSON.stringify(retryBody),
            });
            if (retryResp.ok) {
              const retryData = await retryResp.json();
              const retryContent = retryData.choices?.[0]?.message?.content;
              if (retryContent) {
                if (totalKeys > 1) keyManager.rotateKey();
                return retryContent;
              }
            } else {
              console.warn('[callChatAPI] Phát hiệnThử lại仍thất bại:', retryResp.status);
            }
          }
        }
      }
      
      const error = new Error(`API request failed: ${response.status} - ${errorText}`);
      (error as any).status = response.status;
      throw error;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      // 诊断日志：记录 API 实际返回的Cấu trúc
      const finishReason = data.choices?.[0]?.finish_reason;
      const usage = data.usage;
      const reasoningContent = data.choices?.[0]?.message?.reasoning_content;
      console.error('[callChatAPI] ⚠️ API 返回空内容！诊断信息:');
      console.error('[callChatAPI]   finish_reason:', finishReason);
      console.error('[callChatAPI]   usage:', JSON.stringify(usage));
      console.error('[callChatAPI]   choices length:', data.choices?.length);
      console.error('[callChatAPI]   message keys:', data.choices?.[0]?.message ? Object.keys(data.choices[0].message) : 'N/A');
      console.error('[callChatAPI]   reasoning_content 长度:', reasoningContent?.length || 0);
      console.error('[callChatAPI]   raw response (前500字):', JSON.stringify(data).slice(0, 500));
      
      // 智谱 API 的 sensitive lọc：尝试xoay vòng key Thử lại
      if (finishReason === 'sensitive' || finishReason === 'content_filter') {
        if (keyManager.handleError(403)) {
          console.warn(`[callChatAPI] 内容被安全lọc(${finishReason})，xoay vòng key Thử lại`);
        }
        throw new Error(`内容被安全lọc(finish_reason: ${finishReason})`);
      }
      
      // 推理模型回退：如果有 reasoning_content 但 content 为空，说明模型耗尽 token 在思考上
      if (finishReason === 'length' && reasoningContent) {
        // 先尝试从 reasoning_content 提取 JSON（少数情况下思考đang xử lý...kết quả）
        const jsonMatch = reasoningContent.match(/```json\s*([\s\S]*?)```/) ||
                          reasoningContent.match(/(\{[\s\S]*"characters"[\s\S]*\})/);
        if (jsonMatch) {
          console.log('[callChatAPI] ✅ 从 reasoning_content đang xử lý... JSON');
          return jsonMatch[1] || jsonMatch[0];
        }
        
        // 检测推理 token 占比 — 如果 reasoning 占了 >80% 的 completion tokens，
        // 说明模型在「思考」上花了太多预算，以双倍 max_tokens Tự độngThử lại一次
        const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens || 0;
        const completionTokens = usage?.completion_tokens || 0;
        const currentMaxTokens = body.max_tokens;
        const newMaxTokens = Math.min(currentMaxTokens * 2, modelLimits.maxOutput);
        
        if (reasoningTokens > 0 && completionTokens > 0 &&
            reasoningTokens / completionTokens > 0.8 &&
            newMaxTokens > currentMaxTokens) {
          console.warn(
            `[callChatAPI] 推理模型 token 耗尽 (reasoning: ${reasoningTokens}/${completionTokens})，` +
            `以 max_tokens=${newMaxTokens} Tự độngThử lại...`
          );
          
          const retryBody = { ...body, max_tokens: newMaxTokens };
          const retryResp = await corsFetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(retryBody),
          });
          
          if (retryResp.ok) {
            const retryData = await retryResp.json();
            const retryContent = retryData.choices?.[0]?.message?.content;
            const retryUsage = retryData.usage;
            console.log(
              `[callChatAPI] Thử lạikết quả: content=${retryContent?.length || 0}字, ` +
              `reasoning=${retryUsage?.completion_tokens_details?.reasoning_tokens || '?'}, ` +
              `completion=${retryUsage?.completion_tokens || '?'}`
            );
            if (retryContent) {
              if (totalKeys > 1) keyManager.rotateKey();
              return retryContent;
            }
          } else {
            console.warn('[callChatAPI] Thử lại请求thất bại:', retryResp.status);
          }
        } else {
          console.warn(
            `[callChatAPI] 推理模型 token 耗尽：reasoning ${reasoningContent.length} 字，content 为空。` +
            `(reasoning_tokens=${reasoningTokens}, completion_tokens=${completionTokens}, max_tokens=${currentMaxTokens})`
          );
        }
      }
      
      throw new Error(`Empty response from API (finish_reason: ${finishReason || 'unknown'})`);
    }

    // Rotate key after successful request to distribute load
    if (totalKeys > 1) {
      keyManager.rotateKey();
    }

    return content;
  }, { maxRetries: 3, baseDelay: 2000 });
}

/**
 * Parse screenplay text into structured data
 */
export async function parseScript(
  rawScript: string,
  options: ParseOptions
): Promise<ScriptData> {
  // 构建场景数量限制提示
  const sceneCountHint = options.sceneCount 
    ? `\n\n【重要】请仅提取最重要的 ${options.sceneCount} 场景，chọn剧情đang xử lý...表性和视觉冲击力的场景。`
    : '';

  const userPrompt = `请分析以下剧本/故事内容：

${rawScript}

Ngôn ngữ：${options.language || 'đang xử lý...${sceneCountHint}`;

  const response = await callChatAPI(PARSE_SYSTEM_PROMPT, userPrompt, options);
  const cleaned = cleanJsonString(response);

  try {
    const parsed = JSON.parse(cleaned);

    // Validate and transform scenes with detailed visual design
    const scenes = (parsed.scenes || []).map((s: any, i: number) => ({
      id: s.id || `scene_${i + 1}`,
      name: s.name || s.location || `场景${i + 1}`,
      location: s.location || '未知地点',
      time: normalizeTimeValue(s.time),
      atmosphere: s.atmosphere || '',
      visualPrompt: s.visualPrompt || '', // 用于场景概念图Tạo
      tags: s.tags || [],        // 场景标签
      notes: s.notes || '',      // 场景备注
      episodeId: s.episodeId,
    }));

    // Validate and transform characters with ALL extended fields
    const characters = (parsed.characters || []).map((c: any, i: number) => ({
      id: c.id || `char_${i + 1}`,
      name: c.name || `角色${i + 1}`,
      gender: c.gender,
      age: c.age,
      personality: c.personality,
      role: c.role,
      traits: c.traits,
      skills: c.skills,           // 保留技能trường
      keyActions: c.keyActions,   // 保留Sự kiện quan trọng
      appearance: c.appearance,   // 保留外貌Mô tả
      relationships: c.relationships, // 保留nhân vật关系
      tags: c.tags || [],         // 角色标签
      notes: c.notes || '',       // 角色备注
    }));

    // Parse episodes - use AI-generated if available, otherwise create default
    let episodes = (parsed.episodes || []).map((e: any, i: number) => ({
      id: e.id || `ep_${i + 1}`,
      index: e.index || i + 1,
      title: e.title || `第${i + 1} tập`,
      description: e.description,
      sceneIds: e.sceneIds || [],
    }));

    // If no episodes from AI, create default episode with all scenes
    if (episodes.length === 0) {
      episodes = [{
        id: 'ep_1',
        index: 1,
        title: parsed.title || '第1 tập',
        description: parsed.logline,
        sceneIds: scenes.map((s: any) => s.id),
      }];
    } else {
      // Ensure all scenes are assigned to an episode
      const assignedSceneIds = new Set(episodes.flatMap((e: any) => e.sceneIds));
      const unassignedScenes = scenes.filter((s: any) => !assignedSceneIds.has(s.id));
      if (unassignedScenes.length > 0 && episodes.length > 0) {
        // Add unassigned scenes to the last episode
        episodes[episodes.length - 1].sceneIds.push(...unassignedScenes.map((s: any) => s.id));
      }
    }

    const scriptData: ScriptData = {
      title: parsed.title || '未命名剧本',
      genre: parsed.genre,
      logline: parsed.logline,
      language: options.language || 'đang xử lý...
      characters,
      scenes,
      episodes,
      storyParagraphs: (parsed.storyParagraphs || []).map((p: any, i: number) => ({
        id: p.id || i + 1,
        text: p.text || '',
        sceneRefId: p.sceneRefId || 'scene_1',
      })),
    };

    return scriptData;
  } catch (e) {
    console.error('[parseScript] Failed to parse JSON:', cleaned);
    throw new Error('无法Phân tíchAI返回的剧本dữ liệu');
  }
}

/**
 * Generate shot list from parsed script data
 * Uses per-scene generation with parallel processing support for multi-key
 */
export async function generateShotList(
  scriptData: ScriptData,
  options: ShotGenerationOptions,
  onSceneProgress?: (sceneIndex: number, total: number) => void,
  onShotsGenerated?: (newShots: Shot[], sceneIndex: number) => void // callback streaming，每场景完成后立即通知
): Promise<Shot[]> {
  if (!scriptData.scenes || scriptData.scenes.length === 0) {
    return [];
  }

  const lang = options.language || scriptData.language || 'đang xử lý...
  const allShots: Shot[] = [];
  
  // 计算每场景应该Tạo的分镜数
  const totalScenes = scriptData.scenes.length;
  const targetShotCount = options.shotCount;
  const durationSec = options.targetDuration && options.targetDuration !== 'auto'
    ? (parseInt(options.targetDuration) || 0)
    : 0;

  // 确定每场景的分镜数
  let shotsPerScene: number | undefined;
  let shotsPerSceneHint = '6-8';
  if (targetShotCount) {
    // 用户明确指定了总分镜数
    shotsPerScene = Math.max(1, Math.ceil(targetShotCount / totalScenes));
  } else if (durationSec > 0) {
    // 根据thời lượng计算合理的每场景分镜数（Tham chiếu：每镜头约2-5秒）
    const totalBudget = Math.max(2, Math.ceil(durationSec / 3));
    shotsPerScene = Math.max(1, Math.ceil(totalBudget / totalScenes));
    shotsPerSceneHint = `${shotsPerScene}（目标thời lượng ${durationSec}秒，总计约 ${totalBudget} 分镜）`;
  }

  if (targetShotCount) {
    console.log(`[generateShotList] Target: ${targetShotCount} shots total, ${shotsPerScene} per scene (${totalScenes} scenes)`);
  } else if (durationSec > 0) {
    console.log(`[generateShotList] Duration-based: ~${shotsPerScene} shots/scene for ${durationSec}s (${totalScenes} scenes)`);
  }

  // Determine concurrency based on available keys
  const keyManager = new ApiKeyManager(options.apiKey);
  const keyCount = keyManager.getTotalKeyCount();
  const concurrency = options.concurrency || Math.min(keyCount, 4); // Max 4 parallel
  
  console.log(`[generateShotList] Processing ${totalScenes} scenes with concurrency ${concurrency} (${keyCount} keys)`);

  // Helper function to process a single scene
  const processScene = async (sceneIndex: number): Promise<Shot[]> => {
    const scene = scriptData.scenes[sceneIndex];
    const sceneShots: Shot[] = [];
    
    // Get paragraphs for this scene
    const paragraphs = scriptData.storyParagraphs
      .filter(p => String(p.sceneRefId) === String(scene.id))
      .map(p => p.text)
      .join('\n');

    const sceneContent = paragraphs.trim() 
      ? paragraphs 
      : `场景${sceneIndex + 1}: ${scene.name || scene.location}，${scene.atmosphere || ''}环境`;

    const userPrompt = `为场景 ${sceneIndex + 1} Tạo电影级别的详细分镜。
输出Ngôn ngữ: ${lang}

=== 场景信息 ===
场景名: ${scene.name || scene.location}
地点: ${scene.location}
时间: ${scene.time}
氛围: ${scene.atmosphere}
${(scene as any).visualPrompt ? `场景视觉Tham chiếu: ${(scene as any).visualPrompt}` : ''}

=== 场景内容 ===
"${sceneContent.slice(0, 5000)}"

=== 项目信息 ===
类型: ${scriptData.genre || '通用'}
目标thời lượng: ${options.targetDuration}
视觉风格: ${options.styleId}

=== 角色信息 ===
${scriptData.characters.map(c => `- ${c.name}: ${c.personality || ''} ${c.appearance || ''}`).join('\n')}

=== 分镜要求 ===
1. 为该场景Tạo${shotsPerScene ? `恰好 ${shotsPerScene} ` : shotsPerSceneHint}镜头，chọn最具视觉冲击力的画面
2. 每镜头必须包含：
   - shotSize: Kích thước cảnh（WS/MS/CU/ECU）
   - duration: thời lượng（秒）
   - visualDescription: 详细đang xử lý...Mô tả（像写电影剧本那样详细）
   - actionSummary: 简短动作概述
   - cameraMovement: 镜头运动
   - ambientSound: 环境声
   - soundEffect: Hiệu ứng âm thanh
   - dialogue: Thoại（包含说话人和语气）
   - characters: 出场角色名列表
   - keyframes: 包含startquan trọng帧的visualPrompt（英文，40词内）
3. visualDescription 要详细，包括光影、角色状态、气氛、镜头运动
4. 音频Thiết kế要具体，能复现场景氛围`;

    try {
      const response = await callChatAPI(SHOT_GENERATION_SYSTEM_PROMPT, userPrompt, options);
      const cleaned = cleanJsonString(response);
      const shots = safeParseJson<any[]>(cleaned, []);

      // Validate and transform shots - FORCE TRUNCATE to shotsPerScene
      let validShots = Array.isArray(shots) ? shots : [];
      
      // 强制截取到每场景限制数量（AI可能返回更多）
      if (shotsPerScene && validShots.length > shotsPerScene) {
        console.log(`[generateShotList] Scene ${sceneIndex + 1}: truncating ${validShots.length} shots to ${shotsPerScene}`);
        validShots = validShots.slice(0, shotsPerScene);
      }
      
      for (const s of validShots) {
        const characterIds = (s.characters || s.characterNames || [])
          .map((nameOrId: string) => {
            const char = scriptData.characters.find(
              c => c.name === nameOrId || c.id === nameOrId
            );
            return char?.id;
          })
          .filter(Boolean) as string[];

        const keyframes: NonNullable<Shot['keyframes']> = [];
        if (s.keyframes && Array.isArray(s.keyframes)) {
          keyframes.push(...s.keyframes.map((k: any) => ({
            ...k,
            status: 'pending' as const,
          })));
        } else if (s.visualPrompt) {
          keyframes.push({
            id: `kf-${sceneIndex}-${sceneShots.length}-start`,
            type: 'start' as const,
            visualPrompt: s.visualPrompt,
            status: 'pending' as const,
          });
        }

        sceneShots.push({
          id: `shot_${sceneIndex}_${sceneShots.length}`,
          index: sceneShots.length + 1,
          sceneRefId: String(scene.id),
          actionSummary: s.actionSummary || '',
          visualDescription: s.visualDescription || '',
          cameraMovement: s.cameraMovement,
          shotSize: s.shotSize,
          duration: s.duration || 4,
          visualPrompt: s.visualPrompt || keyframes[0]?.visualPrompt || '',
          videoPrompt: s.videoPrompt || '',
          dialogue: s.dialogue,
          ambientSound: s.ambientSound || '',
          soundEffect: s.soundEffect || '',
          characterNames: s.characters || s.characterNames || [],
          characterIds,
          characterVariations: {},
          keyframes,
          imageStatus: 'idle' as const,
          imageProgress: 0,
          videoStatus: 'idle' as const,
          videoProgress: 0,
        });
      }
      
      console.log(`[generateShotList] Scene ${sceneIndex + 1} generated ${sceneShots.length} shots`);
      
      // callback streaming：立即通知新Tạo的分镜
      if (onShotsGenerated && sceneShots.length > 0) {
        onShotsGenerated(sceneShots, sceneIndex);
      }
    } catch (e) {
      console.error(`[generateShotList] Failed for scene ${sceneIndex + 1}:`, e);
    }
    
    return sceneShots;
  };

  // Process scenes in parallel batches
  let completedCount = 0;
  for (let i = 0; i < scriptData.scenes.length; i += concurrency) {
    const batch = scriptData.scenes.slice(i, i + concurrency);
    const batchIndices = batch.map((_, idx) => i + idx);
    
    console.log(`[generateShotList] Processing batch ${Math.floor(i / concurrency) + 1}: scenes ${batchIndices.map(x => x + 1).join(', ')}`);
    
    // Process batch in parallel
    const batchResults = await Promise.all(
      batchIndices.map(idx => processScene(idx))
    );
    
    // Collect results
    batchResults.forEach(shots => allShots.push(...shots));
    
    // Update progress
    completedCount += batch.length;
    if (onSceneProgress) {
      onSceneProgress(completedCount, scriptData.scenes.length);
    }
    
    // Small delay between batches to avoid overwhelming the API
    if (i + concurrency < scriptData.scenes.length) {
      await delay(500);
    }
  }

  // Re-index shots to be sequential
  let finalShots = allShots.map((s, idx) => ({
    ...s,
    id: `shot-${idx + 1}`,
    index: idx + 1,
  }));

  // 如果设置了分镜数量限制，截取到指定数量
  if (targetShotCount && finalShots.length > targetShotCount) {
    // 从每场景均匀chọn，而不是简单截取前 N 
    const sceneShotMap = new Map<string, Shot[]>();
    for (const shot of finalShots) {
      const sceneId = shot.sceneRefId;
      if (!sceneShotMap.has(sceneId)) {
        sceneShotMap.set(sceneId, []);
      }
      sceneShotMap.get(sceneId)!.push(shot);
    }

    // 从每场景按Tỷ lệchọn
    const selectedShots: Shot[] = [];
    const sceneIds = Array.from(sceneShotMap.keys());
    const shotsNeededPerScene = Math.ceil(targetShotCount / sceneIds.length);
    
    for (const sceneId of sceneIds) {
      const sceneShots = sceneShotMap.get(sceneId)!;
      // 取前 N （最重要的）
      selectedShots.push(...sceneShots.slice(0, shotsNeededPerScene));
    }

    // 截取到目标数量并重新编号
    finalShots = selectedShots.slice(0, targetShotCount).map((s, idx) => ({
      ...s,
      id: `shot-${idx + 1}`,
      index: idx + 1,
    }));
  }

  return finalShots;
}

/**
 * Generate a screenplay from creative input (idea, MV concept, ad brief, or storyboard script)
 * Output format is compatible with importFullScript() for seamless integration
 * 
 * Supports:
 * - One-liner ideas: "A love story in a coffee shop"
 * - MV concepts: "A music video about summer youth"
 * - Ad briefs: "30-second energy drink commercial"
 * - Detailed storyboard scripts: Scripts with shot descriptions
 */
// 基础 prompt（用于无分镜Cấu trúc的创意输入：MV、广告、一句话创意等）
const CREATIVE_SCRIPT_BASE_PROMPT = `你是一位chuyên nghiệp的影视编剧和分镜师。根据用户的创意输入，Tạođầy đủ的剧本。

用户可能输入：
- 一句话创意："咖啡店的爱情故事"
- MV概念："夏日青春的Nhạc视频"
- 广告简报："30秒运动饮料广告"

输出格式必须严格遵循（这是Nhập系统的标准格式）：

---
《剧本标题》

**đại cương：**
[简短Mô tả整体故事/Chủ đề/概念]

**nhân vật小传：**
角色A：[XX tuổi]，[Danh tính/职业]，[Tính cách特点]，[Đặc điểm ngoại hình]
角色B：[XX tuổi]，[Danh tính/职业]，[Tính cách特点]，[Đặc điểm ngoại hình]

**第1 tập**

**1-1 日 内 地点名称**
nhân vật：角色A、角色B

△[场景描写，包括环境、光线、氛围]

角色A：（动作/Biểu cảm）台词内容

角色B：（动作/Biểu cảm）台词内容

**1-2 夜 外 另一地点**
...
---

重要要求：
1. 必须包含《标题》、**đại cương：**、**nhân vật小传：**、**第X tập**
2. 场景头格式：**编号 日/夜 内/外 地点**
3. 每场景必须有"nhân vật："行
4. 动作描写用 △ 开头
5. Thoại格式：角色tên:（动作）台词
6. MV/广告也要拆分成场景和分镜，只是内容侧重画面和Hiệu ứng âm thanh
7. Ngôn ngữ与用户输入保持一致（đang xử lý...用đang xử lý...）
8. **thời đại一致性**：đại cươngđang xử lý...确thời đại背景；nhân vật小传đang xử lý...、Kiểu tóc、道具必须严格符合该thời đại（如古代剧不得出现现代trang phục/电子产品；现代剧不得出现古代服饰）
9. **Bối cảnh thế giới一致性**：场景地点、Phong cách kiến trúc、xã hội规则必须符合剧本设定的Bối cảnh thế giới，不得出现mâu thuẫn元素`;

// 针对hiện có分镜Cấu trúc输入的额外指令（如【镜头1】到【镜夷12】）
const STORYBOARD_STRUCTURE_PROMPT = `

**★★★ 检测到hiện có分镜Cấu trúc，必须遵守以下规则 ★★★**

1. 保留原有的每一镜头/场景，一都不能少
2. 用户输入有12镜头，输出必须有12场景
3. 每gốc镜头转换为一 **X-X 日/夜 内/外 地点** 格式的场景
4. 绝对禁止合并、省略、压缩镜头数量

**★★★ 场景内容格式（极其重要）★★★**

每场景内只能有：
1. nhân vật行：nhân vật：角色A、角色B
2. 一动作行：△[将该镜头Tất cả画面、动作、Thoại、Hiệu ứng âm thanh等压缩为一句đầy đủ的Mô tả thị giác]

禁止在场景内写多行！禁止分别列出Thoại、Hiệu ứng âm thanh！Tất cả内容必须压缩到一 △ 行中。

示例：
用户输入【镜头1】包含画面Mô tả+Thoại+Hiệu ứng âm thanh，你的输出应该是：
**1-1 日 内 篮球馆**
nhân vật：马一花、沈星晴
△记分牌Cực cận cảnh显示68:70，马一花带球被包夹Biểu cảm焦躁，全场屏息，心跳声逐渐响起

而不是：
**1-1 日 内 篮球馆**
nhân vật：马一花、沈星晴
△记分牌Cực cận cảnh
马一花：（焦躁）...
【Hiệu ứng âm thanh】心跳声

后者是lỗi的！会导致Tạo多分镜！`;

export interface ScriptGenerationOptions {
  apiKey: string;
  provider: string;
  baseUrl: string;
  model: string;
  language?: string;
  targetDuration?: string;
  sceneCount?: number;
  shotCount?: number;
  styleId?: string;
}

/**
 * Generate screenplay from creative input
 * Returns script text in import-compatible format
 */
export async function generateScriptFromIdea(
  idea: string,
  options: ScriptGenerationOptions
): Promise<string> {
  const { language = 'đang xử lý... targetDuration = '60s', sceneCount, shotCount, styleId } = options;
  
  // 根据thời lượngTạoTham chiếu范围（不是硬限制，是给 AI 的Tham chiếu）
  const durationSeconds = targetDuration === 'auto' ? 0 : (parseInt(targetDuration) || 60);
  let durationGuidance = '';
  if (durationSeconds > 0 && !sceneCount && !shotCount) {
    // Tham chiếu：每镜头约2-5秒
    const minShots = Math.max(2, Math.ceil(durationSeconds / 5));
    const maxShots = Math.max(3, Math.ceil(durationSeconds / 2));
    durationGuidance = `\n- thời lượngTham chiếu：${durationSeconds}秒视频通常包含 ${minShots}-${maxShots} 分镜，请根据内容需要自行把握Nhịp điệu`;
  }

  // 检测输入类型
  const inputType = detectInputType(idea);
  
  // 统计gốc输入đang xử lý.../场景数量
  // 支持多种格式：【镜头1】、**【镜头1：...】**、镜头1、场景1 等
  const shotMatches = idea.match(/\*?\*?[\[\u3010]\s*镜头\s*\d+/g) || [];
  const sceneMatches = idea.match(/场景\s*\d+/g) || [];
  const originalShotCount = Math.max(shotMatches.length, sceneMatches.length);
  
  console.log('[generateScriptFromIdea] 镜头Khớp:', shotMatches);
  console.log('[generateScriptFromIdea] 场景Khớp:', sceneMatches);
  
  // 如果检测到hiện có分镜Cấu trúc，强调保留
  const preserveStructureNote = originalShotCount > 0 
    ? `\n\n**★★★ 特别注意 ★★★**
用户输入包含 ${originalShotCount} 镜头/场景，你的输出必须有对应的 ${originalShotCount} 场景（**1-1** 到 **1-${originalShotCount}**）。

Quan trọng:每场景内只能有一 △ 动作行！将该镜头的Tất cả画面、Thoại、Hiệu ứng âm thanh压缩成一句话。
禁止分别列出多行Thoại或Hiệu ứng âm thanh，否则会Tạo多分镜！`
    : '';
  
  const userPrompt = `请根据以下创意输入Tạođầy đủ剧本：

[输入类型] ${inputType}

[创意内容]
${idea}

[要求]
- Ngôn ngữ：${language}
- 目标thời lượng：${targetDuration === 'auto' ? '根据内容自行决定' : `约 ${targetDuration}`}${durationGuidance}
${originalShotCount > 0 ? `- 场景数量：必须有 ${originalShotCount} （与gốc镜头一一对应）` : sceneCount ? `- 场景数量：约 ${sceneCount} ` : '- 场景数量：根据内容和thời lượng自行决定'}
${originalShotCount > 0 ? '' : shotCount ? `- 分镜数量：约 ${shotCount} ` : '- 分镜数量：根据内容和thời lượng自行决定'}
${styleId ? `- 视觉风格：${styleId}` : ''}

请Tạo符合标准格式的đầy đủ剧本，包含：
1. 剧本标题
2. đại cương（简述Chủ đề/故事）
3. nhân vật小传（每角色的基本信息）
4. đầy đủ的场景和Thoại${preserveStructureNote}`;

  console.log('[generateScriptFromIdea] 输入类型:', inputType);
  console.log('[generateScriptFromIdea] 创意内容:', idea.substring(0, 100));
  console.log('[generateScriptFromIdea] 检测到gốc镜头数:', originalShotCount);
  
  // 根据是否有分镜Cấu trúcChọn不同的 system prompt
  // - 有分镜Cấu trúc：Sử dụng基础 + 分镜Cấu trúc特殊指令（每场景只能有一动作行）
  // - 无分镜Cấu trúc：Sử dụng基础 prompt（允许正常展开多动作/Thoại）
  const systemPrompt = originalShotCount > 0
    ? CREATIVE_SCRIPT_BASE_PROMPT + STORYBOARD_STRUCTURE_PROMPT
    : CREATIVE_SCRIPT_BASE_PROMPT;
  
  console.log('[generateScriptFromIdea] Sử dụng prompt 类型:', originalShotCount > 0 ? '分镜Cấu trúcchế độ' : '普通创意chế độ');
  
  // 对于详细分镜脚本，需要更高的 max_tokens
  const extendedOptions = {
    ...options,
    maxTokens: originalShotCount > 5 ? 8192 : 4096, // 多镜头时增加输出长度
  };
  
  const response = await callChatAPI(systemPrompt, userPrompt, extendedOptions);
  
  console.log('[generateScriptFromIdea] Tạo剧本长度:', response.length);
  
  return response;
}

/**
 * Detect the type of creative input
 */
function detectInputType(input: string): string {
  const trimmed = input.trim();
  const lineCount = trimmed.split('\n').filter(l => l.trim()).length;
  
  // 检测hiện có分镜Cấu trúc：【镜头X】或 **【镜头X】**
  if (/[【\[]\s*镜头\s*\d+/i.test(trimmed) || /\*\*.*镜头.*\*\*/i.test(trimmed)) {
    return '详细分镜脚本';
  }
  
  // 检测MV概念
  if (/MV|[Nhạc][视音][频像]|music\s*video/i.test(trimmed)) {
    return 'MV概念';
  }
  
  // 检测广告简报
  if (/广告|宣传[片视频]|commercial|ad\s*brief|thương hiệu/i.test(trimmed)) {
    return '广告简报';
  }
  
  // 检测预告片
  if (/预告[片视频]|trailer|宣传片/i.test(trimmed)) {
    return '预告片脚本';
  }
  
  // 检测短视频
  if (/短视频|抹音|tiktok|快手|reels/i.test(trimmed)) {
    return '短视频创意';
  }
  
  // 根据长度判断
  if (lineCount <= 3 && trimmed.length < 100) {
    return '一句话创意';
  } else if (lineCount <= 10) {
    return '故事đại cương';
  } else {
    return '详细故事Mô tả';
  }
}

export type { ParseOptions, ShotGenerationOptions };
