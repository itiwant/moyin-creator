// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * sclass-prompt-builder.ts — Hạng S组级prompt构建
 *
 * 核心功能：
 * 1. Tự động从 character-library-store 提取Nhân vậtẢnh tham chiếu → @Image
 * 2. Tự động从 scene-store 提取CảnhẢnh tham chiếu → @Image
 * 3. Tự động从 splitScene.dialogue 提取Thoại → 唇形同步指令
 * 4. 合并组内各Ống kính的三层prompt为「Ống kính1→Ống kính2→Ống kính3」Cấu trúc
 * 5. 收 tập用户Tải lên的 @Video / @Audio tham chiếu
 * 6. 检查 Seedance 2.0 限制（≤9图 + ≤3video + ≤3âm thanh，Tổng≤12，prompt≤5000字符）
 */

import type { SplitScene } from '@/stores/director-store';
import type { Character } from '@/stores/character-library-store';
import type { Scene } from '@/stores/scene-store';
import type { ShotGroup, AssetRef, AssetPurpose, SClassAspectRatio, SClassResolution, SClassDuration, EditType } from '@/stores/sclass-store';

// ==================== Types ====================

/** @tham chiếu收 tậpkết quả */
export interface CollectedRefs {
  /** ảnhtham chiếu（Nhân vật图 + Cảnh图 + Khung hình đầu图），最多 9 张 */
  images: AssetRef[];
  /** videotham chiếu（用户Tải lên），最多 3  */
  videos: AssetRef[];
  /** âm thanhtham chiếu（用户Tải lên），最多 3  */
  audios: AssetRef[];
  /** Tổngfile数 */
  totalFiles: number;
  /** 是否超出限制 */
  overLimit: boolean;
  /** 超限详情 */
  limitWarnings: string[];
}

/** 组级 prompt 构建kết quả */
export interface GroupPromptResult {
  /** 最终组装的 prompt（发送给 API） */
  prompt: string;
  /** prompt 字符数 */
  charCount: number;
  /** 是否超出 5000 字符限制 */
  overCharLimit: boolean;
  /** 收 tập到的 @tham chiếu */
  refs: CollectedRefs;
  /** 各Ống kính的 prompt đoạn（用于 UI Xem trước） */
  shotSegments: ShotSegment[];
  /** Thoại唇形同步đoạn */
  dialogueSegments: DialogueSegment[];
}

/** 单Ống kính的 prompt đoạn */
export interface ShotSegment {
  sceneId: number;
  sceneName: string;
  /** 该Ống kính在组内的索引（1-based） */
  shotIndex: number;
  /** Ống kínhMô tả（Hành động + Ống kínhNgôn ngữ） */
  description: string;
  /** Thoại文本 */
  dialogue: string;
  /** Thời lượng（秒） */
  duration: number;
}

/** Thoại唇形同步đoạn */
export interface DialogueSegment {
  sceneId: number;
  characterName: string;
  text: string;
  /** 在videođang xử lý...Thời gian位置（秒） */
  timeOffset: number;
}

// ==================== Seedance 2.0 Limits ====================

export const SEEDANCE_LIMITS = {
  maxImages: 9,
  maxVideos: 3,
  maxAudios: 3,
  maxTotalFiles: 12,
  maxPromptChars: 5000,
  maxDuration: 15,
  minDuration: 4,
} as const;

// ==================== Grid Image Merge ====================

/**
 * 计算网格bố cục（N×N 策略）
 */
function calculateGridLayout(count: number): { cols: number; rows: number; paddedCount: number } {
  if (count <= 4) return { cols: 2, rows: 2, paddedCount: 4 };
  return { cols: 3, rows: 3, paddedCount: 9 };
}

/**
 * 将多张Khung hình đầuảnh合并为一张ô图（Canvas 拼接）
 *
 * bố cục规则（N×N 策略，与 handleMergedGenerate 一致）：
 * - 1-4 张 → 2×2，不足的ôĐể trống
 * - 5-9 张 → 3×3，不足的ôĐể trống
 * Tỷ lệ khung hình：N×N 网格下，整图Tỷ lệ khung hình = 单格Tỷ lệ khung hình = 目标画幅比
 *
 * @param imageUrls ảnh URL  cột表（base64 / http / local-image://）
 * @param aspectRatio 目标Tỷ lệ khung hình，如 '16:9' 或 '9:16'
 * @returns 合并后的 dataUrl (image/png)
 */
export async function mergeToGridImage(
  imageUrls: string[],
  aspectRatio: string = '16:9',
): Promise<string> {
  if (imageUrls.length === 0) throw new Error('mergeToGridImage: 无ảnh可合并');
  if (imageUrls.length === 1) {
    // 单张Trực tiếpQuay lại，无需合并
    return imageUrls[0];
  }

  const { cols, rows } = calculateGridLayout(imageUrls.length);

  // Phân tíchTỷ lệ khung hình
  const [aw, ah] = aspectRatio.split(':').map(Number);
  const cellAspect = (aw || 16) / (ah || 9);

  // 每ô的像素尺寸（基于合理Độ phân giải）
  const cellWidth = cellAspect >= 1 ? 512 : Math.round(512 * cellAspect);
  const cellHeight = cellAspect >= 1 ? Math.round(512 / cellAspect) : 512;

  const totalWidth = cellWidth * cols;
  const totalHeight = cellHeight * rows;

  // 加载Tất cảảnh
  const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`加载ảnhThất bại: ${src.substring(0, 60)}...`));
      img.src = src;
    });

  const images = await Promise.all(imageUrls.map(loadImage));

  // Canvas 拼接
  const canvas = document.createElement('canvas');
  canvas.width = totalWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d')!;

  // 填充灰色背景（空ô）
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // 绘制每张ảnh到对应ô，居đang xử lý...持Tỷ lệ khung hình
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const dx = col * cellWidth;
    const dy = row * cellHeight;

    // 计算 cover 裁剪区域
    const imgAspect = img.width / img.height;
    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    if (imgAspect > cellAspect) {
      // ảnh太宽，裁宽度
      sw = Math.round(img.height * cellAspect);
      sx = Math.round((img.width - sw) / 2);
    } else {
      // ảnh太高，裁高度
      sh = Math.round(img.width / cellAspect);
      sy = Math.round((img.height - sh) / 2);
    }

    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, cellWidth, cellHeight);
  }

  return canvas.toDataURL('image/png');
}

// ==================== Reference Collection ====================

/**
 * 从 character-library-store 提取Nhân vậtẢnh tham chiếu
 * 每Nhân vật取第一张 view ảnh
 */
export function collectCharacterRefs(
  characterIds: string[],
  characters: Character[],
): AssetRef[] {
  const refs: AssetRef[] = [];
  const seen = new Set<string>();

  for (const charId of characterIds) {
    if (seen.has(charId)) continue;
    seen.add(charId);

    const char = characters.find(c => c.id === charId);
    if (!char) continue;

    // 优先Sử dụng base64（持久化），其次Sử dụng URL
    const view = char.views[0];
    const imageUrl = view?.imageBase64 || view?.imageUrl || char.thumbnailUrl;
    if (!imageUrl) continue;

    refs.push({
      id: `char_${charId}`,
      type: 'image',
      tag: `@ảnh`,  // tag 会在最终组装时重新编号
      localUrl: imageUrl,
      httpUrl: null,
      fileName: `${char.name}_ref.png`,
      fileSize: 0,
      duration: null,
      purpose: 'character_ref',
    });
  }

  return refs;
}

/**
 * 从 scene-store 提取CảnhẢnh tham chiếu
 * 通过 SplitScene.sceneLibraryId 关联
 */
export function collectSceneRefs(
  scenes: SplitScene[],
  sceneLibrary: Scene[],
): AssetRef[] {
  const refs: AssetRef[] = [];
  const seen = new Set<string>();

  for (const splitScene of scenes) {
    // 方式1: Trực tiếpSử dụngPhân cảnh上已关联的CảnhẢnh tham chiếu
    if (splitScene.sceneReferenceImage && !seen.has(splitScene.sceneReferenceImage)) {
      seen.add(splitScene.sceneReferenceImage);
      refs.push({
        id: `scene_ref_${splitScene.id}`,
        type: 'image',
        tag: '@ảnh',
        localUrl: splitScene.sceneReferenceImage,
        httpUrl: null,
        fileName: `scene_${splitScene.sceneName || splitScene.id}.png`,
        fileSize: 0,
        duration: null,
        purpose: 'scene_ref',
      });
      continue;
    }

    // 方式2: 通过 sceneLibraryId 从Thư viện cảnh查找
    if (splitScene.sceneLibraryId && !seen.has(splitScene.sceneLibraryId)) {
      seen.add(splitScene.sceneLibraryId);
      const sceneObj = sceneLibrary.find(s => s.id === splitScene.sceneLibraryId);
      const sceneImg = sceneObj?.referenceImageBase64 || sceneObj?.referenceImage;
      if (sceneImg) {
        refs.push({
          id: `scene_lib_${splitScene.sceneLibraryId}`,
          type: 'image',
          tag: '@ảnh',
          localUrl: sceneImg,
          httpUrl: null,
          fileName: `${sceneObj?.name || 'scene'}_ref.png`,
          fileSize: 0,
          duration: null,
          purpose: 'scene_ref',
        });
      }
    }
  }

  return refs;
}

/**
 * 收 tập组内各Ống kính的Khung hình đầuảnh作为 @Image
 */
export function collectFirstFrameRefs(scenes: SplitScene[]): AssetRef[] {
  const refs: AssetRef[] = [];
  for (const scene of scenes) {
    const imageUrl = scene.imageDataUrl || scene.imageHttpUrl;
    if (!imageUrl) continue;
    refs.push({
      id: `firstframe_${scene.id}`,
      type: 'image',
      tag: '@ảnh',
      localUrl: imageUrl,
      httpUrl: scene.imageHttpUrl || null,
      fileName: `shot_${scene.id + 1}_frame.png`,
      fileSize: 0,
      duration: null,
      purpose: 'first_frame',
    });
  }
  return refs;
}

/**
 * 汇TổngTất cả @tham chiếu并执 hàng配额校验
 *
 * 新版优先级（ô图chế độ）：
 *   @Image1 = ô图（1张） > @Image2~9 = Nhân vậtẢnh tham chiếu（≤8张）
 * 旧版优先级（tương thích）：
 *   Khung hình đầu图 > Nhân vật图 > Cảnh图，合计≤9张
 *
 * @param gridImageRef 如果提供，则Sử dụngô图chế độ（不再逐张ThêmKhung hình đầu）
 */
export function collectAllRefs(
  group: ShotGroup,
  scenes: SplitScene[],
  characters: Character[],
  sceneLibrary: Scene[],
  gridImageRef?: AssetRef | null,
): CollectedRefs {
  // 1. 收 tậpNhân vậtẢnh tham chiếu（去重：组内Tất cảỐng kính的 characterIds 合并）
  const allCharIds = Array.from(
    new Set(scenes.flatMap(s => s.characterIds || []))
  );
  const charRefs = collectCharacterRefs(allCharIds, characters);

  // 2. 收 tậpCảnhẢnh tham chiếu
  const sceneRefs = collectSceneRefs(scenes, sceneLibrary);

  let images: AssetRef[];

  if (gridImageRef) {
    // ========== ô图chế độ ==========
    // ô图占 1 槽，剩余给Nhân vậttham chiếu + CảnhẢnh tham chiếu
    const remainingSlots = SEEDANCE_LIMITS.maxImages - 1;
    const charSlice = charRefs.slice(0, remainingSlots);
    images = [gridImageRef, ...charSlice];
    // 如果还有槽位，加入CảnhẢnh tham chiếu
    const usedSlots = images.length;
    if (usedSlots < SEEDANCE_LIMITS.maxImages) {
      images.push(...sceneRefs.slice(0, SEEDANCE_LIMITS.maxImages - usedSlots));
    }
  } else {
    // ========== 旧版tương thíchchế độ：逐张Khung hình đầu > Nhân vật > Cảnh ==========
    const frameRefs = collectFirstFrameRefs(scenes);
    const allImageRefs = [...frameRefs, ...charRefs, ...sceneRefs];
    images = allImageRefs.slice(0, SEEDANCE_LIMITS.maxImages);
  }

  // 5. 用户Tải lên的video/âm thanhtham chiếu（已在 group 中）
  const videoSlice = (group.videoRefs || []).slice(0, SEEDANCE_LIMITS.maxVideos);
  const audioSlice = (group.audioRefs || []).slice(0, SEEDANCE_LIMITS.maxAudios);

  // 6. 重新编号 tag（map Tạo新对象，消除副作用）
  const taggedImages = images.map((ref, i) => ({ ...ref, tag: `@ảnh${i + 1}` }));
  const taggedVideos = videoSlice.map((ref, i) => ({ ...ref, tag: `@video${i + 1}` }));
  const taggedAudios = audioSlice.map((ref, i) => ({ ...ref, tag: `@âm thanh${i + 1}` }));

  // 7. 配额校验
  const totalFiles = taggedImages.length + taggedVideos.length + taggedAudios.length;
  const warnings: string[] = [];
  if (taggedImages.length >= SEEDANCE_LIMITS.maxImages) {
    warnings.push(`ảnhtham chiếu已达上限 ${SEEDANCE_LIMITS.maxImages}`);
  }
  if (totalFiles > SEEDANCE_LIMITS.maxTotalFiles) {
    warnings.push(`Tổngfile数 ${totalFiles} 超出限制 ${SEEDANCE_LIMITS.maxTotalFiles}`);
  }

  return {
    images: taggedImages,
    videos: taggedVideos,
    audios: taggedAudios,
    totalFiles,
    overLimit: totalFiles > SEEDANCE_LIMITS.maxTotalFiles,
    limitWarnings: warnings,
  };
}

// ==================== Dialogue / Lip-Sync ====================

/**
 * 从组内Ống kính提取Thoại，Tạo唇形同步đoạn
 */
export function extractDialogueSegments(
  scenes: SplitScene[],
  characters: Character[],
): DialogueSegment[] {
  const segments: DialogueSegment[] = [];
  let timeOffset = 0;

  for (const scene of scenes) {
    const dur = scene.duration > 0 ? scene.duration : 5;

    if (scene.dialogue && scene.dialogue.trim()) {
      const dialogueText = scene.dialogue.trim();

      // 检测Thoại文本是否已包含说话人格式（如 "村民：妹con" 或 "村民（操着方言）：妹con"）
      const speakerMatch = dialogueText.match(/^([^\uff1a:]{1,20})[\uff1a:](.+)$/s);

      let characterName: string;
      let text: string;

      if (speakerMatch) {
        // Thoại自带说话人，Trực tiếpSử dụng
        characterName = speakerMatch[1].trim();
        text = speakerMatch[2].trim();
      } else {
        // 回退到 characterIds 查找Nhân vật名
        characterName = scene.characterIds?.[0]
          ? characters.find(c => c.id === scene.characterIds[0])?.name || 'Nhân vật'
          : 'Nhân vật';
        text = dialogueText;
      }

      segments.push({
        sceneId: scene.id,
        characterName,
        text,
        timeOffset,
      });
    }

    timeOffset += dur;
  }

  return segments;
}

/**
 * 将Thoạiđoạn转为唇形同步指令文本
 */
function buildDialoguePromptPart(segments: DialogueSegment[]): string {
  if (segments.length === 0) return '';

  const lines = segments.map(s =>
    `[约${s.timeOffset}s处] ${s.characterName}：「${s.text}」— sổ型同步，自然sổ部Hành động`
  );

  return `\n\nThoại与sổ型同步：\n${lines.join('\n')}`;
}

// ==================== Shot Segment Building ====================

/**
 * 为单Ống kính构建Mô tảđoạn（đầy đủ版 — 涵盖Phân cảnh卡片上Tất cả可用trường）
 */
function buildShotSegment(
  scene: SplitScene,
  shotIndex: number,
  refs: CollectedRefs,
): ShotSegment {
  const parts: string[] = [];

  // lọc无效值的辅助函数
  const isValid = (v?: string | null): v is string =>
    !!v && !['none', 'null', '无', '无技法', 'Mặc định'].includes(v.toLowerCase().trim());

  // ===== Ống kínhNgôn ngữ（运镜 + 景别 + 角度 + Tiêu cự + 摄影技法） =====
  if (isValid(scene.cameraMovement)) parts.push(scene.cameraMovement);
  if (isValid(scene.shotSize)) parts.push(scene.shotSize);
  if (isValid(scene.cameraAngle)) parts.push(scene.cameraAngle);
  if (isValid(scene.focalLength)) parts.push(scene.focalLength);
  if (isValid(scene.photographyTechnique)) parts.push(scene.photographyTechnique);
  if (isValid(scene.specialTechnique)) parts.push(scene.specialTechnique);

  // ===== 机位Mô tả =====
  if (scene.cameraPosition?.trim()) parts.push(`camera: ${scene.cameraPosition.trim()}`);

  // ===== Hành độngMô tả（优先videoprompt，其次Hành động摘要） =====
  const action = scene.videoPromptZh?.trim() || scene.videoPrompt?.trim()
    || scene.actionSummary?.trim() || '';
  if (action) parts.push(action);

  // ===== 灯光 =====
  const lightParts: string[] = [];
  if (isValid(scene.lightingStyle)) lightParts.push(scene.lightingStyle);
  if (isValid(scene.lightingDirection)) lightParts.push(scene.lightingDirection);
  if (isValid(scene.colorTemperature)) lightParts.push(scene.colorTemperature);
  if (scene.lightingNotes?.trim()) lightParts.push(scene.lightingNotes.trim());
  if (lightParts.length > 0) parts.push(`lighting: ${lightParts.join(', ')}`);

  // ===== Độ sâu trường ảnh + 焦点 =====
  if (isValid(scene.depthOfField)) parts.push(`DoF: ${scene.depthOfField}`);
  if (scene.focusTarget?.trim()) parts.push(`focus: ${scene.focusTarget.trim()}`);
  if (isValid(scene.focusTransition)) parts.push(`focus-transition: ${scene.focusTransition}`);

  // ===== 器材 + 运动Tốc độ =====
  if (isValid(scene.cameraRig)) parts.push(`rig: ${scene.cameraRig}`);
  if (isValid(scene.movementSpeed) && !['normal', 'static'].includes(scene.movementSpeed!)) parts.push(`speed: ${scene.movementSpeed}`);

  // ===== Bầu không khí特效 =====
  if (scene.atmosphericEffects && scene.atmosphericEffects.length > 0) {
    parts.push(`atmosphere: ${scene.atmosphericEffects.join(', ')}`);
  }

  // ===== 播放Tốc độ =====
  if (scene.playbackSpeed && scene.playbackSpeed !== 'normal') {
    parts.push(`playback: ${scene.playbackSpeed}`);
  }

  // ===== 情绪Bầu không khí =====
  if (scene.emotionTags && scene.emotionTags.length > 0) {
    parts.push(`mood: ${scene.emotionTags.join(' → ')}`);
  }

  // ===== @Image tham chiếu（该Ống kính的Khung hình đầu） =====
  const frameRef = refs.images.find(r => r.id === `firstframe_${scene.id}`);
  if (frameRef) parts.push(`reference: ${frameRef.tag}`);

  return {
    sceneId: scene.id,
    sceneName: scene.sceneName || `Ống kính${scene.id + 1}`,
    shotIndex,
    description: parts.join(', '),
    dialogue: scene.dialogue || '',
    duration: scene.duration > 0 ? scene.duration : 5,
  };
}

// ==================== Main Builder ====================

export interface BuildGroupPromptOptions {
  group: ShotGroup;
  scenes: SplitScene[];
  characters: Character[];
  sceneLibrary: Scene[];
  /** Phong cách token（从 storyboardConfig） */
  styleTokens?: string[];
  /** Tỷ lệ khung hình */
  aspectRatio?: SClassAspectRatio;
  /** 是否包含Thoại唇形同步 */
  enableLipSync?: boolean;
  /** ô图tham chiếu（如果提供，Sử dụngô图chế độ收 tậptham chiếu） */
  gridImageRef?: AssetRef | null;
}

/** purpose → đang xử lý...i ý语映射 */
const PURPOSE_PROMPT_MAP: Record<AssetPurpose, string> = {
  character_ref: '保持Nhân vậtngoại hình一致',
  scene_ref: '作为CảnhTham chiếu',
  first_frame: '作为Khung hình đầu',
  grid_image: '为Nhân vậtTham chiếuô图，保持Nhân vật一致性',
  camera_replicate: '精准复刻Ống kính运动轨迹和Tốc độ',
  action_replicate: '复刻Hành động节奏和幅度',
  effect_replicate: '复刻视觉特效和转场效果',
  beat_sync: '作为背景Nhạc，video节奏严格匹配Nhạc节拍',
  bgm: '作为背景NhạcTham chiếu',
  voice_ref: '作为语音Tham chiếu',
  prev_video: '接续前段video，保持Nhân vật和Cảnh一致',
  video_extend: '作为被kéo dài的video，平滑衔接',
  video_edit_src: '作为被Chỉnh sửa的源video',
  general: '作为Tham chiếu',
};

/** Chỉnh sửaLoại → prompt 模板前缀 */
const EDIT_TYPE_TEMPLATE: Record<EditType, string> = {
  plot_change: '颠覆@video1里的cốt truyện，',
  character_swap: 'video1đang xử lý...ân vật换成ảnhđang xử lý...ân vật，Hành động完全模仿原video，',
  attribute_modify: '将video1中',
  element_add: '在video1的hình ảnhđang xử lý...m',
};

/**
 * 构建组级 prompt — Hạng S核心函数
 *
 * 输出格式（đang xử lý...）：
 * ```
 * 多Ống kínhtự sựvideo（共3Ống kính，TổngThời lượng14s）：
 *
 * Ống kính1 [0s-5s]「Cảnh名」：[运镜], [Hành động]
 * Ống kính2 [5s-9s]「Cảnh名」：[运镜], [Hành động]
 *
 * Nhân vậtTham chiếu：@ảnh4（Nhân vậtA）保持Nhân vậtngoại hình一致
 * CảnhTham chiếu：@ảnh6 作为CảnhTham chiếu
 *
 * Thoại与sổ型同步：
 * [约2s处] Nhân vậtA：「Hội thoại」— sổ型同步，自然sổ部Hành động
 *
 * Phong cách：电影感, 暖色调...
 * ```
 */
export function buildGroupPrompt(options: BuildGroupPromptOptions): GroupPromptResult {
  const {
    group,
    scenes,
    characters,
    sceneLibrary,
    styleTokens,
    aspectRatio,
    enableLipSync = true,
    gridImageRef,
  } = options;

  // 0. kéo dài/Chỉnh sửachế độ — 走独立分支
  const genType = group.generationType || 'new';
  if (genType === 'extend' || genType === 'edit') {
    return buildExtendEditPrompt(group, scenes, characters, sceneLibrary, styleTokens);
  }

  // 1. 收 tậpTất cả @tham chiếu（ô图chế độ或旧版chế độ）
  const refs = collectAllRefs(group, scenes, characters, sceneLibrary, gridImageRef);

  // 2. 构建各Ống kínhđoạn
  const shotSegments = scenes.map((scene, idx) =>
    buildShotSegment(scene, idx + 1, refs)
  );

  // 3. 计算Thời gian轴
  let timeOffset = 0;
  const totalDuration = shotSegments.reduce((sum, s) => sum + s.duration, 0);

  // 4. 如果用户已Thủ côngChỉnh sửa过 mergedPrompt，优先Sử dụng
  if (group.mergedPrompt && group.mergedPrompt.trim()) {
    const dialogueSegs = enableLipSync ? extractDialogueSegments(scenes, characters) : [];
    return {
      prompt: group.mergedPrompt,
      charCount: group.mergedPrompt.length,
      overCharLimit: group.mergedPrompt.length > SEEDANCE_LIMITS.maxPromptChars,
      refs,
      shotSegments,
      dialogueSegments: dialogueSegs,
    };
  }

  // 4.5 AI Hiệu chuẩn后的 prompt 优先级在Thủ côngChỉnh sửa之下、Tự động拼接之上
  if (group.calibratedPrompt && group.calibrationStatus === 'done') {
    const dialogueSegs = enableLipSync ? extractDialogueSegments(scenes, characters) : [];
    return {
      prompt: group.calibratedPrompt,
      charCount: group.calibratedPrompt.length,
      overCharLimit: group.calibratedPrompt.length > SEEDANCE_LIMITS.maxPromptChars,
      refs,
      shotSegments,
      dialogueSegments: dialogueSegs,
    };
  }

  // 5. Tự động组装 prompt（đang xử lý...）
  const promptParts: string[] = [];

  // tiêu đề hàng
  if (gridImageRef) {
    promptParts.push(
      `多Ống kínhtự sựvideo，Tham chiếu @ảnh1 ô图（共${scenes.length}Ống kính，TổngThời lượng${totalDuration}s）：`
    );
  } else {
    promptParts.push(
      `多Ống kínhtự sựvideo（共${scenes.length}Ống kính，TổngThời lượng${totalDuration}s）：`
    );
  }
  promptParts.push('');

  // 各Ống kínhMô tả
  for (const seg of shotSegments) {
    const endTime = timeOffset + seg.duration;
    promptParts.push(
      `Ống kính${seg.shotIndex} [${timeOffset}s-${endTime}s]「${seg.sceneName}」：${seg.description}`
    );
    timeOffset = endTime;
  }

  // Nhân vậttham chiếu（基于 purpose Tạo精确指令）
  const charRefLines = refs.images
    .filter(r => r.id.startsWith('char_'))
    .map(r => {
      const charId = r.id.replace('char_', '');
      const char = characters.find(c => c.id === charId);
      const hint = PURPOSE_PROMPT_MAP[r.purpose || 'character_ref'];
      return `${r.tag}（${char?.name || 'Nhân vật'}）${hint}`;
    });
  if (charRefLines.length > 0) {
    promptParts.push('');
    promptParts.push(`Nhân vậtTham chiếu：${charRefLines.join('；')}`);
  }

  // Cảnhtham chiếu
  const sceneRefLines = refs.images
    .filter(r => r.id.startsWith('scene_'))
    .map(r => {
      const hint = PURPOSE_PROMPT_MAP[r.purpose || 'scene_ref'];
      return `${r.tag} ${hint}`;
    });
  if (sceneRefLines.length > 0) {
    promptParts.push(`CảnhTham chiếu：${sceneRefLines.join('；')}`);
  }

  // videotham chiếu
  if (refs.videos.length > 0) {
    const videoLines = refs.videos.map(r => {
      const hint = PURPOSE_PROMPT_MAP[r.purpose || 'camera_replicate'];
      return `${r.tag}（${r.fileName}）${hint}`;
    });
    promptParts.push(`videoTham chiếu：${videoLines.join('；')}`);
  }

  // âm thanhtham chiếu
  if (refs.audios.length > 0) {
    const audioRefLines = refs.audios.map(r => {
      const hint = PURPOSE_PROMPT_MAP[r.purpose || 'bgm'];
      return `${r.tag}（${r.fileName}）${hint}`;
    });
    promptParts.push(`âm thanhTham chiếu：${audioRefLines.join('；')}`);
  }

  // âm thanhThiết kế（Âm thanh môi trường + Hiệu ứng âm thanh，按Ống kính cột出）
  const audioDesignLines: string[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const aParts: string[] = [];
    if (s.audioAmbientEnabled !== false && s.ambientSound?.trim()) {
      aParts.push(`Âm thanh môi trường：${s.ambientSound.trim()}`);
    }
    const sfxText = s.soundEffectText?.trim();
    const sfxTags = s.soundEffects?.length ? s.soundEffects.join('、') : '';
    if (s.audioSfxEnabled !== false && (sfxText || sfxTags)) {
      aParts.push(`Hiệu ứng âm thanh：${sfxText || sfxTags}`);
    }
    if (aParts.length > 0) {
      audioDesignLines.push(`Ống kính${i + 1}：${aParts.join('；')}`);
    }
  }
  if (audioDesignLines.length > 0) {
    promptParts.push('');
    promptParts.push('âm thanhThiết kế：');
    promptParts.push(...audioDesignLines);
  }

  // Thoại唇形同步
  const dialogueSegments = enableLipSync
    ? extractDialogueSegments(scenes, characters)
    : [];
  const dialoguePart = buildDialoguePromptPart(dialogueSegments);
  if (dialoguePart) {
    promptParts.push(dialoguePart);
  }

  // Phong cách（不再注入：Hiệu chuẩn后的各Ống kính prompt 已包含Phong cáchMô tả）

  // Tỷ lệ khung hìnhGợi ý
  if (aspectRatio) {
    promptParts.push(`画幅：${aspectRatio}`);
  }

  // 一致性约束
  promptParts.push('');
  promptParts.push('Tất cảỐng kính保持Nhân vậtngoại hình一致，Ống kính间平滑过渡，不出现文字或hình mờ。');

  const prompt = promptParts.join('\n');

  return {
    prompt,
    charCount: prompt.length,
    overCharLimit: prompt.length > SEEDANCE_LIMITS.maxPromptChars,
    refs,
    shotSegments,
    dialogueSegments,
  };
}

// ==================== Extend / Edit Prompt Builder ====================

/**
 * kéo dài/Chỉnh sửachế độ的 prompt 构建器
 *
 * 与常规多Ống kínhtự sự不同：
 * - 不建ô图
 * - source video Tự động占据 @video1 位
 * - prompt Sử dụngkéo dài/Chỉnh sửa专用模板
 */
function buildExtendEditPrompt(
  group: ShotGroup,
  scenes: SplitScene[],
  characters: Character[],
  sceneLibrary: Scene[],
  styleTokens?: string[],
): GroupPromptResult {
  // --- 收 tậptham chiếu（不建ô图） ---
  // source video 占 @video1，用户Tải lên的 videoRefs 从 @video2 Bắt đầu
  const sourceVideoRef: AssetRef | null = group.sourceVideoUrl ? {
    id: 'source_video',
    type: 'video',
    tag: '@video1',
    localUrl: group.sourceVideoUrl,
    httpUrl: group.sourceVideoUrl.startsWith('http') ? group.sourceVideoUrl : null,
    fileName: '源video',
    fileSize: 0,
    duration: null,
    purpose: group.generationType === 'extend' ? 'video_extend' : 'video_edit_src',
  } : null;

  // 用户额外Tải lên的video/âm thanh
  const userVideoRefs = (group.videoRefs || []).slice(0, sourceVideoRef ? SEEDANCE_LIMITS.maxVideos - 1 : SEEDANCE_LIMITS.maxVideos);
  const allVideoRefs = sourceVideoRef ? [sourceVideoRef, ...userVideoRefs] : userVideoRefs;
  const taggedVideos = allVideoRefs.map((ref, i) => ({ ...ref, tag: `@video${i + 1}` }));

  const audioSlice = (group.audioRefs || []).slice(0, SEEDANCE_LIMITS.maxAudios);
  const taggedAudios = audioSlice.map((ref, i) => ({ ...ref, tag: `@âm thanh${i + 1}` }));

  // ảnhtham chiếu（Nhân vậtẢnh tham chiếu + 用户额外Tải lên）
  const allCharIds = Array.from(new Set(scenes.flatMap(s => s.characterIds || [])));
  const charRefs = collectCharacterRefs(allCharIds, characters);
  const taggedImages = charRefs.slice(0, SEEDANCE_LIMITS.maxImages).map((ref, i) => ({ ...ref, tag: `@ảnh${i + 1}` }));

  const totalFiles = taggedImages.length + taggedVideos.length + taggedAudios.length;
  const refs: CollectedRefs = {
    images: taggedImages,
    videos: taggedVideos,
    audios: taggedAudios,
    totalFiles,
    overLimit: totalFiles > SEEDANCE_LIMITS.maxTotalFiles,
    limitWarnings: totalFiles > SEEDANCE_LIMITS.maxTotalFiles ? [`Tổngfile数 ${totalFiles} 超出限制 ${SEEDANCE_LIMITS.maxTotalFiles}`] : [],
  };

  // --- 构建 prompt ---
  // 用户Thủ côngChỉnh sửa优先
  if (group.mergedPrompt && group.mergedPrompt.trim()) {
    return {
      prompt: group.mergedPrompt,
      charCount: group.mergedPrompt.length,
      overCharLimit: group.mergedPrompt.length > SEEDANCE_LIMITS.maxPromptChars,
      refs,
      shotSegments: [],
      dialogueSegments: [],
    };
  }

  const promptParts: string[] = [];
  const genType = group.generationType || 'new';

  if (genType === 'extend') {
    // --- kéo dàichế độ ---
    const direction = group.extendDirection === 'forward' ? 'về trước' : 'về sau';
    const dur = group.totalDuration || 10;
    promptParts.push(`${direction}kéo dài${dur}svideo。`);
  } else {
    // --- Chỉnh sửachế độ ---
    const editType = group.editType || 'plot_change';
    promptParts.push(EDIT_TYPE_TEMPLATE[editType]);
  }

  // Nhân vậtTham chiếu指令
  if (taggedImages.length > 0) {
    const charRefHints = taggedImages
      .filter(r => r.id.startsWith('char_'))
      .map(r => {
        const charId = r.id.replace('char_', '');
        const char = characters.find(c => c.id === charId);
        return `Tham chiếu${r.tag}（${char?.name || 'Nhân vật'}）保持Nhân vậtngoại hình一致`;
      });
    if (charRefHints.length > 0) {
      promptParts.push(charRefHints.join('；'));
    }
  }

  // Phong cách（不再注入：Hiệu chuẩn后的各Ống kính prompt 已包含Phong cáchMô tả）

  const prompt = promptParts.join('\n');

  return {
    prompt,
    charCount: prompt.length,
    overCharLimit: prompt.length > SEEDANCE_LIMITS.maxPromptChars,
    refs,
    shotSegments: [],
    dialogueSegments: [],
  };
}

/**
 * 快速预估一组的 @tham chiếu数量（不执 hàngđầy đủ构建）
 */
export function estimateGroupRefs(
  group: ShotGroup,
  scenes: SplitScene[],
): { images: number; videos: number; audios: number; total: number } {
  const charIds = new Set(scenes.flatMap(s => s.characterIds || []));
  const sceneRefCount = scenes.filter(s => s.sceneReferenceImage || s.sceneLibraryId).length;
  const frameCount = scenes.filter(s => s.imageDataUrl || s.imageHttpUrl).length;

  const images = Math.min(frameCount + charIds.size + sceneRefCount, SEEDANCE_LIMITS.maxImages);
  const videos = Math.min((group.videoRefs || []).length, SEEDANCE_LIMITS.maxVideos);
  const audios = Math.min((group.audioRefs || []).length, SEEDANCE_LIMITS.maxAudios);

  return { images, videos, audios, total: images + videos + audios };
}
