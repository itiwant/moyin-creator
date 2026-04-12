// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
// hoàn thành状态
export type CompletionStatus = 'pending' | 'in_progress' | 'completed';

// 提示词Ngôn ngữTùy chọn
export type PromptLanguage = 'zh' | 'en' | 'zh+en';

// AI角色Mức độ chặt chẽ hiệu chuẩn
export type CalibrationStrictness = 'strict' | 'normal' | 'loose';

/** bị lọc的角色记录（用于恢复） */
export interface FilteredCharacterRecord {
  name: string;
  reason: string;
}

/**
 * 角色阶段thông tin
 * 用于nhãn角色在特定 tập数范围内的形象版本
 */
export interface CharacterStageInfo {
  stageName: string;              // 阶段名称："青年版"、"Phiên bản trung niên"、"Khởi nghiệp ban đầu"
  episodeRange: [number, number]; // 适用 tập数范围：[bắt đầu tập, kết thúc tập]
  ageDescription?: string;        // 该阶段TuổiMô tả："25 tuổi"、"50 tuổi"
}

/**
 * 角色一致性元素
 * 用于保持同一角色不同阶段的可识别性
 */
export interface CharacterConsistencyElements {
  facialFeatures?: string;  // Khuôn mặt特征（không thay đổi）：眼睛形状、五官Tỷ lệ
  bodyType?: string;        // 体型特征：身高、体格
  uniqueMarks?: string;     // 独特标记：胎记、疤痕、标志性特征
}

/**
 * 角色Neo danh tính - khóa 6 lớp đặc trưng系统
 * 用于确保AI生图đang xử lý...色在不同场景保持一致
 */
export interface CharacterIdentityAnchors {
  // ① Lớp xương mặt - Khuôn mặt骨骼Cấu trúc
  faceShape?: string;       // Hình mặt：oval/square/heart/round/diamond/oblong
  jawline?: string;         // Đường hàm：sharp angular/soft rounded/prominent
  cheekbones?: string;      // Xương gò má：high prominent/subtle/wide set
  
  // ② Lớp ngũ quan - 眼鼻唇精确Mô tả
  eyeShape?: string;        // Hình mắt：almond/round/hooded/monolid/upturned
  eyeDetails?: string;      // Chi tiết mắt：double eyelids, slight epicanthic fold
  noseShape?: string;       // Hình mũi：straight bridge, rounded tip, medium width
  lipShape?: string;        // Hình môi：full lips, defined cupid's bow
  
  // ③ Lớp dấu hiệu nhận dạng - 最强neo
  uniqueMarks: string[];    // 必填！胎记/疤痕/痣的精确位置："small mole 2cm below left eye"
  
  // ④ Lớp neo màu sắc - Hex色值
  colorAnchors?: {
    iris?: string;          // Con ngươi色：#3D2314 (dark brown)
    hair?: string;          // màu tóc：#1A1A1A (jet black)
    skin?: string;          // Màu da：#E8C4A0 (warm beige)
    lips?: string;          // Màu môi：#C4727E (dusty rose)
  };
  
  // ⑤ Lớp kết cấu da
  skinTexture?: string;     // visible pores on nose, light smile lines
  
  // ⑥ Lớp neo kiểu tóc
  hairStyle?: string;       // Kiểu tóc：shoulder-length, layered, side-parted
  hairlineDetails?: string; // Đường tóc：natural hairline, slight widow's peak
}

/**
 * 角色负面提示词
 * 用于排除不符合角色设定的Tạokết quả
 */
export interface CharacterNegativePrompt {
  avoid: string[];          // 要Tránh的特征：["blonde hair", "blue eyes", "beard"]
  styleExclusions?: string[]; // 风格排除：["anime style", "cartoon"]
}

export interface ScriptCharacter {
  id: string; // Script-level id
  name: string;
  gender?: string;
  age?: string;
  personality?: string; // Tính cách特点（详细Mô tả）
  role?: string; // Thân phận/bối cảnh（详细Mô tả）
  traits?: string; // Đặc trưng cốt lõi（详细Mô tả）
  skills?: string; // Kỹ năng/năng lực（如武功、魔法等）
  keyActions?: string; // quan trọng行为/事迹
  appearance?: string; // 外貌Mô tả
  relationships?: string; // 主要关系
  tags?: string[]; // 角色标签，如: #武侠 #男主 #剑客
  notes?: string; // 角色备注（ghi chú cốt truyện）
  status?: CompletionStatus; // 角色形象Trạng thái tạo
  characterLibraryId?: string; // 关联的角色库ID
  
  // === 多阶段角色支持 ===
  baseCharacterId?: string;        // gốc角色ID（阶段角色指向基础角色，如"张明青年版"指向"张明"）
  stageInfo?: CharacterStageInfo;  // 阶段thông tin（仅阶段角色有此trường）
  stageCharacterIds?: string[];    // 派生的阶段角色ID列表（仅基础角色有此trường）
  consistencyElements?: CharacterConsistencyElements; // 一致性元素（基础角色定义，阶段角色kế thừa）
  visualPromptEn?: string;         // 英文视觉提示词（用于AITạo ảnh）
  visualPromptZh?: string;         // đang xử lý...提示词
  
  // === 6层Danh tínhneo（AIHiệu chuẩn时填充）===
  identityAnchors?: CharacterIdentityAnchors;  // Danh tínhneo（用于角色一致性）
  negativePrompt?: CharacterNegativePrompt;    // 负面提示词（排除不符合的特征）
}

export interface ScriptScene {
  id: string; // Script-level id
  name?: string;
  location: string;
  time: string;
  atmosphere: string;
  visualPrompt?: string; // đang xử lý...Mô tả thị giác（用于场景概念图Tạo）
  tags?: string[]; // 场景标签，如: #木柱 #棂 #古建筑
  notes?: string; // 地点备注（ghi chú cốt truyện）
  status?: CompletionStatus; // 场景Trạng thái tạo
  sceneLibraryId?: string; // 关联的场景库ID
  
  // === chuyên nghiệp场景Thiết kếtrường（AIHiệu chuẩn时填充）===
  visualPromptEn?: string;      // 英文视觉提示词（用于AITạo ảnh）
  architectureStyle?: string;   // Phong cách kiến trúc（现代简约/đang xử lý.../工业风/欧式等）
  lightingDesign?: string;      // 光影Thiết kế（自然光/灯光/昏暗/明亮等）
  colorPalette?: string;        // 色彩基调（暖色调/冷色调/đang xử lý...）
  keyProps?: string[];          // quan trọng道具列表
  spatialLayout?: string;       // Bố cục không gianMô tả
  eraDetails?: string;          // thời đại特征（如2000thập niên的装修风格）
  
  // === 出场统计（AIHiệu chuẩn时填充）===
  episodeNumbers?: number[];    // 出现在哪些 tập
  appearanceCount?: number;     // 出场次数
  importance?: 'main' | 'secondary' | 'transition';  // 场景重要性
  
  // === 多góc nhìn联合图（场景背景一致性）===
  contactSheetImage?: string;   // 联合图Ảnh gốc（base64 或 URL）
  contactSheetImageUrl?: string; // 联合图 HTTP URL
  viewpoints?: SceneViewpointData[]; // góc nhìn列表
  viewpointImages?: Record<string, {
    imageUrl: string;           // 切割后的ảnh（base64 或 URL）
    imageBase64?: string;       // 持久化用 base64
    gridIndex: number;          // 在联合图đang xử lý... (0-5)
  }>;
}

/**
 * 场景góc nhìndữ liệu（简化版，存储在 ScriptScene 中）
 */
export interface SceneViewpointData {
  id: string;           // góc nhìnID，如 'dining', 'sofa', 'window'
  name: string;         // Tên tiếng Trung: khu bàn ăn, khu sofa、边
  nameEn: string;       // Tên tiếng Anh
  shotIds: string[];    // 关联的分镜ID列表
  keyProps: string[];   // 该góc nhìn需要的道具
  gridIndex: number;    // 在联合图đang xử lý... (0-5)
}

export interface ScriptParagraph {
  id: number;
  text: string;
  sceneRefId: string;
}

// 场景gốcNội dung（保留đầy đủThoại和动作）
export interface SceneRawContent {
  sceneHeader: string;        // 场景头：如 "1-1日 内 沪上 张家"
  characters: string[];       // 出场nhân vật
  content: string;            // đầy đủ场景Nội dung（Thoại+动作+字幕等）
  dialogues: DialogueLine[];  // Phân tích后的Thoại列表
  actions: string[];          // 动作描写列表（△开头的）
  subtitles: string[];        // 字幕【】
  weather?: string;           // 天气（晴/雨/雪/雾/阴等，从场景Nội dung检测）
  timeOfDay?: string;         // 时间（日/夜/晨/暮等，从场景头提取）
}

// Thoại行
export interface DialogueLine {
  character: string;          // 角色名
  parenthetical?: string;     // 括号内动作/情绪，如（喝酒）
  line: string;               // 台词Nội dung
}

//  tập的gốc剧本Nội dung
export interface EpisodeRawScript {
  episodeIndex: number;       // 第几 tập
  title: string;              //  tập标题
  synopsis?: string;          //  tậpđại cương/摘要（AITạo或手动chỉnh sửa）
  keyEvents?: string[];       // Tập nàySự kiện quan trọng
  rawContent: string;         // gốcđầy đủNội dung
  scenes: SceneRawContent[];  // Phân tích后的场景列表
  shotGenerationStatus: 'idle' | 'generating' | 'completed' | 'error';  // 分镜Trạng thái tạo
  lastGeneratedAt?: number;   // 上次Tạo时间
  synopsisGeneratedAt?: number; // đại cươngTạo时间
  season?: string;            // 季节（春/夏/秋/冬，从字幕提取）
}

// mục目背景thông tin
export interface ProjectBackground {
  title: string;              // tên phim
  genre?: string;             // 类型（商战/武侠/爱情等）
  era?: string;               // thời đại背景（民国/现代/古代等）
  timelineSetting?: string;   // 精确时间线设定（如"2022年夏天"、"1990-2020年"）
  storyStartYear?: number;    // 故事开始年份（用于推算角色Tuổi）
  storyEndYear?: number;      // 故事kết thúc年份
  totalEpisodes?: number;     // Tổng tập数
  outline: string;            // 故事đại cương
  characterBios: string;      // nhân vật小传
  worldSetting?: string;      // Bối cảnh thế giới/风格设定
  themes?: string[];          // Chủ đềquan trọng词
}

// ==================== 剧级dữ liệu（SeriesMeta）— 跨 tập共享 ====================

/** đặt tên实体：địa lý/vật phẩm/phe phái等 */
export interface NamedEntity {
  name: string;
  desc: string;
}

/** phe phái/势力 */
export interface Faction {
  name: string;
  members: string[];
}

/** 角色关系 */
export interface CharacterRelationship {
  from: string;
  to: string;
  type: string;
}

/**
 * 剧级元dữ liệu — mục目主页Hiển thị，Tất cả tập共享
 * 首次Nhập时由 AI + 正则Tự động填充，Hiệu chuẩn后回写丰富
 */
export interface SeriesMeta {
  // === 故事核心 ===
  title: string;
  logline?: string;                   // 一句话概括
  outline?: string;                   // 100-500字đầy đủ故事线
  centralConflict?: string;           // chính tuyếnmâu thuẫn
  themes?: string[];                  // [复仇, 权谋, 友情]

  // === Bối cảnh thế giới ===
  era?: string;                       // 古代/现代/未来
  genre?: string;                     // 武侠/商战/爱情
  timelineSetting?: string;           // 精确时间线
  geography?: NamedEntity[];          // Cài đặt địa lý
  socialSystem?: string;              // xã hộihệ thống
  powerSystem?: string;               // 力量hệ thống
  keyItems?: NamedEntity[];           // Vật phẩm quan trọng
  worldNotes?: string;                // Bối cảnh thế giới补充（自由文本）

  // === 角色hệ thống ===
  characters: ScriptCharacter[];      // 从 scriptData.characters 提升
  factions?: Faction[];               // phe phái/势力
  relationships?: CharacterRelationship[];  // 角色关系

  // === 视觉系统 ===
  styleId?: string;
  recurringLocations?: ScriptScene[]; // 常驻场景库（≥2 tập出现的）
  colorPalette?: string;              // Toàn bộ主色调

  // === Cài đặt sản xuất ===
  language?: string;
  promptLanguage?: PromptLanguage;
  calibrationStrictness?: CalibrationStrictness;
  metadataMarkdown?: string;          // AI 知识库 MD
  metadataGeneratedAt?: number;
}

//  tập（Episode）
export interface Episode {
  id: string;
  index: number;
  title: string;
  description?: string;
  sceneIds: string[]; // 该 tập包含的场景ID
}

export interface ScriptData {
  title: string;
  genre?: string;
  logline?: string;
  language: string;
  targetDuration?: string;
  characters: ScriptCharacter[];
  scenes: ScriptScene[];
  episodes: Episode[]; //  tập列表
  storyParagraphs: ScriptParagraph[];
}

// ==================== video拍摄控制类型（灯光/焦点/器材/特效/Tốc độ） ====================

// 灯光师 (Gaffer)
export type LightingStyle = 
  | 'high-key'      // 高调：明亮、低对比，适合喜剧/日常
  | 'low-key'       // 低调：暗沉、高对比，适合悬疑/noir
  | 'silhouette'    // 剪影：逆光全黑轮廓
  | 'chiaroscuro'   // 明暗法：伦勃朗式强烈明暗
  | 'natural'       // 自然光：真实日光感
  | 'neon'          // 霓虹：赛博朋克/夜店
  | 'candlelight'   // 烛光：暖黄微弱光
  | 'moonlight';    // 月光：冷蓝柔和

export type LightingDirection = 
  | 'front'         // chính diện光：平坦、无阴影
  | 'side'          // 侧光：强调轮廓和纹理
  | 'back'          // 逆光：轮廓光/剪影
  | 'top'           // 顶光：审讯感/戏剧性
  | 'bottom'        // 底光：恐怖/不自然
  | 'rim'           // 轮廓光：边缘发光，与背景分离
  | 'three-point';  // 三点布光：标准影视照明

export type ColorTemperature = 
  | 'warm'          // 暖色 3200K：烛光/钨丝灯
  | 'neutral'       // đang xử lý...500K：日光
  | 'cool'          // 冷色 7000K：阴天/月光
  | 'golden-hour'   // 黄金时段：日出日落
  | 'blue-hour'     // 蓝调时分：日落后
  | 'mixed';        // 混合色温：冷暖交织

// 跟焦员 (Focus Puller / 1st AC)
export type DepthOfField = 
  | 'ultra-shallow' // f/1.4 极浅：只有眼睛清晰，强烈虚化
  | 'shallow'       // f/2.8 浅：nhân vật清晰，背景虚化
  | 'medium'        // f/5.6 đang xử lý...景到đang xử lý...
  | 'deep'          // f/11 深：全hình ảnh清晰
  | 'split-diopter';// 分屈光镜：前后都清晰但中间虚

export type FocusTransition = 
  | 'rack-to-fg'    // 转焦到前景
  | 'rack-to-bg'    // 转焦到背景
  | 'rack-between'  // nhân vật间转焦
  | 'pull-focus'    // 跟焦（跟随运动主体）
  | 'none';         // Cố định焦点

// 器材组 (Camera Rig)
export type CameraRig = 
  | 'tripod'        // 三脚架：绝对稳定
  | 'handheld'      // Cầm tay：呼吸感/纪实/căng thẳng
  | 'steadicam'     // 斯坦尼康：丝滑跟随
  | 'dolly'         // 轨道车：匀速直线推拉
  | 'crane'         // 摇臂：垂直Nâng hạ/大幅cung
  | 'drone'         // 航拍：nhìn từ trên/大范围运动
  | 'shoulder'      // 肩扛：轻微晃动/新闻纪实
  | 'slider';       // 滑轨：短距离平滑移动

export type MovementSpeed = 'very-slow' | 'slow' | 'normal' | 'fast' | 'very-fast';

// 特效师 (On-set SFX)
export type AtmosphericEffect = 
  | 'rain'          | 'heavy-rain'     // 雨 / 暴雨
  | 'snow'          | 'blizzard'       // 雪 / 暴风雪
  | 'fog'           | 'mist'           // 浓雾 / 薄雾
  | 'dust'          | 'sandstorm'      // 尘土 / 沙暴
  | 'smoke'         | 'haze'           // 烟雾 / 薄霾
  | 'fire'          | 'sparks'         // 火焰 / 火花
  | 'lens-flare'    | 'light-rays'     // 镜头光晕 / 丁达尔效应
  | 'falling-leaves'| 'cherry-blossom' // 落叶 / 樱花
  | 'fireflies'     | 'particles';     // 萤火虫 / 粒con

export type EffectIntensity = 'subtle' | 'moderate' | 'heavy';

// Tốc độ控制 (Speed Ramping)
export type PlaybackSpeed = 
  | 'slow-motion-4x'  // 0.25x 超慢：conpopup时间
  | 'slow-motion-2x'  // 0.5x 慢动作：动作cao trào
  | 'normal'           // 1x
  | 'fast-2x'          // 2x 快进：时间流逝
  | 'timelapse';       // 延时摄影

// 拍摄角度 (Camera Angle)
export type CameraAngle =
  | 'eye-level'      // 平视：自然góc nhìn
  | 'high-angle'     // 俯拍：居高临下
  | 'low-angle'      // 仰拍：英雄感
  | 'birds-eye'      // 鸟瞰：俄视俄视
  | 'worms-eye'      // 虫视：极端低角
  | 'over-shoulder'  // 过肩：Chat场景
  | 'side-angle'     // 侧拍：bên cạnhgóc nhìn
  | 'dutch-angle'    // 荷兰角：倾斜不安感
  | 'third-person';  // 第三人称：游戏góc nhìn

// 镜头焦距 (Focal Length)
export type FocalLength =
  | '8mm'    // 鱼眼：极端桶形畸变
  | '14mm'   // 超广角：强烈透视感
  | '24mm'   // 广角：môi trường上下文
  | '35mm'   // 标准广角：街拍/纪实感
  | '50mm'   // 标准：接近人眼góc nhìn
  | '85mm'   // Chân dung：脸部Tỷ lệ舒适
  | '105mm'  // đang xử lý...和背景压缩
  | '135mm'  // 长焦：强背景压缩
  | '200mm'  // 远摄：极端压缩
  | '400mm'; // 超长焦：最强压缩

// 摄影技法 (Photography Technique)
export type PhotographyTechnique =
  | 'long-exposure'        // 长曝光：运动模糊/光迹
  | 'double-exposure'      // 多重曝光：叠加透明效果
  | 'macro'                // 微距：极近细节
  | 'tilt-shift'           // 移轴：微缩效果
  | 'high-speed'           // 高速快门：冻结动作
  | 'bokeh'                // 浅景深虚化：梦幻光斑
  | 'reflection'           // 反射/镜面拍摄
  | 'silhouette-technique';// 剪影拍摄

// 场记/连戏 (Script Supervisor / Continuity)
export interface ContinuityCharacterState {
  position: string;      // "hình ảnh左侧站立"
  clothing: string;      // "蓝色西装，领带松开"
  expression: string;    // "眉头紧皱"
  props: string[];       // ["Cầm tay信封", "左手插兜"]
}

export interface ContinuityRef {
  prevShotId: string | null;         // 上一镜头 ID
  nextShotId: string | null;         // 下一镜头 ID
  prevEndFrameUrl: string | null;    // 上一镜头khung cuối（Tự động填充）
  characterStates: Record<string, ContinuityCharacterState>;  // charName -> 状态快照
  lightingContinuity: string;        // "与上一镜头保持同一侧光方向"
  flaggedIssues: string[];           // AI Tự động检测的穿帮风险
}

export type ShotStatus = 'idle' | 'generating' | 'completed' | 'failed';
export type KeyframeStatus = 'pending' | 'generating' | 'completed' | 'failed';
export type KeyframeType = 'start' | 'end';

/**
 * Keyframe for shot generation (start/end frames for video)
 * Based on CineGen-AI types.ts
 */
export interface Keyframe {
  id: string;
  type: KeyframeType;
  visualPrompt: string;
  imageUrl?: string;
  status: KeyframeStatus;
}

/**
 * Video interval data
 */
export interface VideoInterval {
  videoUrl?: string;
  duration?: number;
  status: ShotStatus;
}

export interface Shot {
  id: string;
  index: number;
  episodeId?: string;        // 所属 tậpID
  sceneRefId: string;        // Script scene id
  sceneId?: string;          // Scene store id
  sceneViewpointId?: string; // 关联的场景góc nhìnID（联合图切割后的góc nhìn）
  
  // === 分镜核心thông tin ===
  actionSummary: string;     // 动作Mô tả（用户Ngôn ngữ）
  visualDescription?: string; // 详细的hình ảnhMô tả（用户Ngôn ngữ，如：“法坛全景，黑暗đang xử lý...芒笼罩...”）
  completionStatus?: CompletionStatus;
  
  // === 镜头Ngôn ngữ ===
  cameraMovement?: string;   // 鎡头运动（Dolly In, Pan Right, Static, Tracking等）
  specialTechnique?: string; // Kỹ thuật quay đặc biệt手法（希区柯克Zoom、conpopup时间、FPV穿梭等）
  shotSize?: string;         // Kích thước cảnh（Wide Shot, Medium Shot, Close-up, ECU等）
  duration?: number;         // 预估thời lượng（秒）
  
  // === 视觉Tạo ===
  visualPrompt?: string;     // 英文Mô tả thị giác（用于ảnhTạo，tương thích旧版）
  
  // === 3 lớp提示词系统 (Seedance 1.5 Pro) ===
  imagePrompt?: string;      // khung đầu提示词（英文，静态Mô tả）
  imagePromptZh?: string;    // khung đầu提示词（中文）
  videoPrompt?: string;      // video提示词（英文，动态动作）
  videoPromptZh?: string;    // video提示词（中文）
  endFramePrompt?: string;   // khung cuối提示词（英文，静态Mô tả）
  endFramePromptZh?: string; // khung cuối提示词（中文）
  needsEndFrame?: boolean;   // 是否需要khung cuối
  
  // === âm thanhThiết kế ===
  dialogue?: string;         // Thoại/台词
  ambientSound?: string;     // môi trường声（如：“沉重的风声伴随空旷堂内回响”）
  soundEffect?: string;      // Hiệu ứng âm thanh（如：“远处悠长的钟声”）
  
  // === 角色thông tin ===
  characterNames?: string[];
  characterIds: string[];
  characterVariations: Record<string, string>; // charId -> variationId
  
  // === 情绪标签 ===
  emotionTags?: string[];  // 情绪标签 ID 数组，如 ['sad', 'tense', 'serious']
  
  // === tự sựdẫn dắttrường（基于《电影Ngôn ngữ的语法》） ===
  narrativeFunction?: string;   // tự sựchức năng：铺垫/升级/cao trào/转折/chuyển tiếp/尾声
  conflictStage?: string;       // 冲突阶段：引入/激化/对抗/转折/解决/余波/辅助
  shotPurpose?: string;         // 镜头mục đích：此镜头如何服务于故事核心
  storyAlignment?: string;      // 与Bối cảnh thế giới/故事核心的一致性：aligned/minor-deviation/needs-review
  visualFocus?: string;         // Tiêu điểm thị giác：观众应该看什么（按thứ tự）
  cameraPosition?: string;      // 机位Mô tả：摄影机相对于nhân vật的位置
  characterBlocking?: string;   // nhân vậtbố cục：nhân vật在hình ảnhđang xử lý...关系
  rhythm?: string;              // Nhịp điệuMô tả：这镜头的Nhịp điệu感

  // === 灯光师 (Gaffer) ===
  lightingStyle?: LightingStyle;           // 灯光风格预设
  lightingDirection?: LightingDirection;   // 主光源方向
  colorTemperature?: ColorTemperature;     // 色温
  lightingNotes?: string;                  // 灯光自由Mô tả（补充）

  // === 跟焦员 (Focus Puller) ===
  depthOfField?: DepthOfField;             // 景深
  focusTarget?: string;                    // 焦点目标: "nhân vậtKhuôn mặt" / "桌上的信封"
  focusTransition?: FocusTransition;       // 转焦动作

  // === 器材组 (Camera Rig) ===
  cameraRig?: CameraRig;                   // 拍摄器材
  movementSpeed?: MovementSpeed;           // 运动Tốc độ

  // === 特效师 (On-set SFX) ===
  atmosphericEffects?: AtmosphericEffect[]; // 氛围特效（可多选）
  effectIntensity?: EffectIntensity;       // 特效强度

  // === Tốc độ控制 (Speed Ramping) ===
  playbackSpeed?: PlaybackSpeed;           // 播放Tốc độ

  // === 拍摄角度 / 焦距 / 技法 ===
  cameraAngle?: CameraAngle;               // 拍摄角度
  focalLength?: FocalLength;               // 镜头焦距
  photographyTechnique?: PhotographyTechnique; // 摄影技法

  // === 场记/连戏 (Continuity) ===
  continuityRef?: ContinuityRef;           // 连戏Tham chiếu

  // Keyframes for start/end frame generation (CineGen-AI pattern)
  keyframes?: Keyframe[];

  // Generation (legacy single-image mode)
  imageStatus: ShotStatus;
  imageProgress: number;
  imageError?: string;
  imageUrl?: string;
  imageMediaId?: string;

  // Video generation
  videoStatus: ShotStatus;
  videoProgress: number;
  videoError?: string;
  videoUrl?: string;
  videoMediaId?: string;
  
  // Video interval (CineGen-AI pattern)
  interval?: VideoInterval;
}
