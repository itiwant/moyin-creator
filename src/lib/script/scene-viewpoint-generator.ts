// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * Scene Viewpoint Generator
 * 
 * 从场景Hiệu chuẩndữ liệu和分镜动作描写đang xử lý...角需求，
 * TạoẢnh ghép đa góc nhìn提示词，用于Tạo 6 格ảnh ghép。
 */

import type { ScriptScene, Shot } from '@/types/script';

// ==================== 类型定义 ====================

/**
 * 场景góc nhìn定义
 */
export interface SceneViewpoint {
  id: string;           // góc nhìnID，如 'dining', 'sofa', 'window'
  name: string;         // Tên tiếng Trung: khu bàn ăn, khu sofa、边
  nameEn: string;       // Tên tiếng Anh：Dining Area, Sofa Area, Window
  shotIds: string[];    // 关联的分镜ID列表
  keyProps: string[];   // 该góc nhìn需要的đạo cụ（中文）
  keyPropsEn: string[]; // 该góc nhìn需要的đạo cụ（英文）
  description: string;  // góc nhìnMô tả（中文）
  descriptionEn: string; // góc nhìnMô tả（英文）
  gridIndex: number;    // 在ảnh ghépđang xử lý... (0-5)
}

/**
 * ảnh ghépTạo配置
 */
export interface ContactSheetConfig {
  scene: ScriptScene;
  shots: Shot[];
  styleTokens: string[];
  aspectRatio: '16:9' | '9:16';
  maxViewpoints?: number; // 默认 6
}

/**
 * ảnh ghépTạokết quả
 */
export interface ContactSheetPromptResult {
  prompt: string;           // 英文提示词
  promptZh: string;         // đang xử lý...词
  viewpoints: SceneViewpoint[];
  gridLayout: {
    rows: number;
    cols: number;
  };
}

// ==================== 环境类型定义 ====================

/**
 * 场景环境类型
 */
export type SceneEnvironmentType = 
  | 'vehicle'        // 现代交通工具（大巴、xe hơi、火车、飞机等）
  | 'outdoor'        // 现代户外（公路、街道、公园等）
  | 'indoor_home'    // 现代室内家居
  | 'indoor_work'    // 现代室内办公/商业
  | 'indoor_public'  // 现代室内公共（医院、学校、餐厅等）
  | 'ancient_indoor' // 古代室内（宫殿、府邸、客栈、寺庙等）
  | 'ancient_outdoor'// 古代户外（官道、 tập市、城门等）
  | 'ancient_vehicle'// 古代交通（马车、轿子、船等）
  | 'unknown';       // 未知

/**
 * 环境类型quan trọng词检测
 * 用于从场景地点推断环境类型
 */
const ENVIRONMENT_KEYWORDS: Record<SceneEnvironmentType, string[]> = {
  // === 古代场景（优先检测） ===
  ancient_indoor: [
    // 宫廷/皇家
    '宫殿', '宫', '殿', '皇宫', '宫门', '内廷', '御书房', '御花园', '太和殿', '乾清宫',
    '坐厉宫', '冷宫', 'Đông宫', 'Tây宫', '后宫',
    // 府邸/民居
    '府邸', '府', '宅', '宅院', '大宅', '老宅', '内宅', '外宅',
    '堂屋', '正堂', '大堂', '厅堂', '厅',
    '闺房', '内室', '绣楼', '书馆', '花厅',
    // 公共建筑
    '客栈', '酒楼', '酒肃', '茶楼', '茶馆', '饭庄', '庙', '寺', '寺庙', '禅房',
    '道观', '尼姑庵', '龙门客栈', '悦来客栈',
    '祁堂', '调堆', '灵堂', '宗祠',
    '衙门', '公堂', '大理寺',
    // 古代具体房间
    '书房', '琴房', '内堂', '账房', '茶房', '库房',
  ],
  ancient_outdoor: [
    // 城市
    '城门', '城墙', '城楼', '城外', '城内', '皇城',
    ' tập市', ' tập', '市 tập', '庙会', '夜市', 'Đông市', 'Tây市',
    '街', '长街', '巷', '巷子', '巷sổ',
    '牌坊', '广场', '点将台', '校场',
    // 道路/旅途
    '官道', '驿站', '驿道', '山路', '山道', '古道', '商道', '街道',
    '模到', 'Nam道', 'Bắc道',
    // 自然/庭院
    '庭院', '庭', '院', '前院', '后院', '内院', '外院',
    '花园', '后花园', '御花园', '池塘', '荷塘', '亝子',
    '山野', '林间', '溓畔', '桥头', '渡sổ', '码头',
  ],
  ancient_vehicle: [
    '马车', '车', '轿子', '轿', '牛车', '马', '骑马',
    '船', '客船', '商船', '渔船', '画舷', '小船', '帆船', '舜',
    '车内', '轿内', '舱内', '船舱',
  ],
  
  // === 现代场景 ===
  vehicle: [
    '大巴', '巴士', '公交', 'xe hơi', '轿车', '出租车', '的士', 'uber',
    '火车', '高铁', '动车', '地铁', '列车',
    '飞机', '航班', '机舱',
    '游艇', '渡轮', '轮船', '游轮',
    '车内', '车上', '车厢',
  ],
  outdoor: [
    '公路', '马路', '街道', '街头', '路边', '十字路sổ',
    '公园', '广场', '操场', '球场',
    '乡村', '田野', '山', '河', '海边', '沙滩', '森林', '树林',
    '院子', '庭院', '花园', '天台', '楼顶', '屋顶',
    '停车场', '加油站',
  ],
  indoor_home: [
    '家', '住宅', '公寓', '别墅', '宿舍',
    '客厅', '卧室', '厨房', '餐厅', '书房', '卫生间', '浴室', '阳台',
    '房间', '屋内', '屋里',
  ],
  indoor_work: [
    '办公室', '公司', '写字楼', '会议室', '工厂', '车间', '仓库',
    '店', '商店', '超市', '商场',
  ],
  indoor_public: [
    '医院', '诊所', '病房', '手术室',
    '学校', '教室', '图书馆', '食堂',
    '餐厅', '酒店', '宾馆', '旅馆', '咖啡厅', '酒吧', 'KTV',
    '派出所', '警局', '法院', '监狱',
    '银行', '邮局', '机场', '车站', '码头',
  ],
  unknown: [],
};

/**
 * 清理场景地点ký tự串，移除nhân vậtthông tin等无关内容
 */
function cleanLocationString(location: string): string {
  // 移除 "nhân vật：XXX" 部分
  let cleaned = location.replace(/\s*nhân vật[：:].*/g, '');
  // 移除 "角色：XXX" 部分
  cleaned = cleaned.replace(/\s*角色[：:].*/g, '');
  // 移除 "时间：XXX" 部分
  cleaned = cleaned.replace(/\s*时间[：:].*/g, '');
  // 去除首尾空白
  return cleaned.trim();
}

/**
 * 从场景地点推断环境类型
 */
export function detectEnvironmentType(location: string): SceneEnvironmentType {
  // 先清理地点ký tự串
  const cleanedLocation = cleanLocationString(location);
  const normalizedLocation = cleanedLocation.toLowerCase();
  
  console.log(`[detectEnvironmentType] gốc: "${location}" -> 清理后: "${cleanedLocation}"`);
  
  // 按优先级检测：古代 > 现代交通 > 户外 > 室内公共 > 室内办公 > 室内家居
  const priorities: SceneEnvironmentType[] = [
    'ancient_vehicle', 'ancient_indoor', 'ancient_outdoor',  // 古代优先
    'vehicle', 'outdoor', 'indoor_public', 'indoor_work', 'indoor_home'
  ];
  
  for (const envType of priorities) {
    const keywords = ENVIRONMENT_KEYWORDS[envType];
    for (const keyword of keywords) {
      if (normalizedLocation.includes(keyword)) {
        console.log(`[detectEnvironmentType] Khớp到quan trọng词 "${keyword}" -> 环境类型: ${envType}`);
        return envType;
      }
    }
  }
  
  console.log(`[detectEnvironmentType] 未Khớp到任何quan trọng词 -> unknown`);
  return 'unknown';
}

// ==================== góc nhìnquan trọng词ánh xạ ====================

/**
 * góc nhìn配置（带环境tương thích性）
 */
interface ViewpointConfig {
  id: string;
  name: string;
  nameEn: string;
  propsZh: string[];
  propsEn: string[];
  /** tương thích的环境类型，空数组表示通用 */
  environments: SceneEnvironmentType[];
}

/**
 * 动作quan trọng词 -> góc nhìnánh xạ
 * 从分镜动作描写đang xử lý...要的góc nhìn
 * 扩展quan trọng词以Ghi đè更多场景
 * 
 * 【重要】environments trườngđiều khiển该góc nhìn适用于哪些环境类型
 * - 空数组 [] 表示通用góc nhìn，适用于Tất cả环境
 * - 指定环境类型列表表示仅在这些环境中Khớp
 */
const VIEWPOINT_KEYWORDS: Record<string, ViewpointConfig> = {
  // ========== 古代室内góc nhìn (ancient_indoor) ==========
  // 堂屋/正厅
  '堂屋': { id: 'ancient_hall', name: '堂屋', nameEn: 'Main Hall', propsZh: ['太师椅', '案几', '寿屏'], propsEn: ['taishi chair', 'table', 'screen'], environments: ['ancient_indoor'] },
  '正堂': { id: 'ancient_hall', name: '正堂', nameEn: 'Main Hall', propsZh: ['寿屏', '上座'], propsEn: ['screen', 'main seat'], environments: ['ancient_indoor'] },
  '大堂': { id: 'ancient_hall', name: '大堂', nameEn: 'Grand Hall', propsZh: ['案几', '纱帐'], propsEn: ['table', 'gauze curtain'], environments: ['ancient_indoor'] },
  '厅堂': { id: 'ancient_hall', name: '厅堂', nameEn: 'Reception Hall', propsZh: ['案几', '寛椅'], propsEn: ['table', 'armchair'], environments: ['ancient_indoor'] },
  // 案几/坐具
  '案几': { id: 'ancient_table', name: '案几', nameEn: 'Ancient Table', propsZh: ['案几', '茶具', '笔墨'], propsEn: ['table', 'tea set', 'brush and ink'], environments: ['ancient_indoor'] },
  '书案': { id: 'ancient_table', name: '书案', nameEn: 'Writing Desk', propsZh: ['书案', '笔墨纸砚'], propsEn: ['writing desk', 'brush, ink, paper, inkstone'], environments: ['ancient_indoor'] },
  '坐在案前': { id: 'ancient_table', name: '案几', nameEn: 'At the Table', propsZh: ['案几'], propsEn: ['table'], environments: ['ancient_indoor'] },
  '跑堂': { id: 'ancient_table', name: '酒楼大堂', nameEn: 'Tavern Hall', propsZh: ['方桌', '酒壶', '菜肴'], propsEn: ['square table', 'wine pot', 'dishes'], environments: ['ancient_indoor'] },
  // 屏风/蜗帐
  '屏风': { id: 'ancient_screen', name: '屏风', nameEn: 'Screen View', propsZh: ['屏风', '帐幔'], propsEn: ['screen', 'curtain'], environments: ['ancient_indoor'] },
  '纱帐': { id: 'ancient_screen', name: '纱帐', nameEn: 'Gauze Curtain', propsZh: ['纱帐', '垂帐'], propsEn: ['gauze curtain', 'hanging drape'], environments: ['ancient_indoor'] },
  '帐后': { id: 'ancient_screen', name: '帐后', nameEn: 'Behind the Curtain', propsZh: ['帐幔'], propsEn: ['curtain'], environments: ['ancient_indoor'] },
  // 闺房/内室
  '闺房': { id: 'ancient_boudoir', name: '闺房', nameEn: 'Boudoir', propsZh: ['妆台', '铜镜', '梳妆盒'], propsEn: ['dressing table', 'bronze mirror', 'makeup box'], environments: ['ancient_indoor'] },
  '梳妆': { id: 'ancient_boudoir', name: '妆台', nameEn: 'Dressing Table', propsZh: ['妆台', '铜镜'], propsEn: ['dressing table', 'bronze mirror'], environments: ['ancient_indoor'] },
  '绣楼': { id: 'ancient_boudoir', name: '绣楼', nameEn: 'Embroidery Chamber', propsZh: ['绣架', '绣线'], propsEn: ['embroidery frame', 'silk thread'], environments: ['ancient_indoor'] },
  // 榻/床
  '榻': { id: 'ancient_couch', name: '榻', nameEn: 'Ancient Couch', propsZh: ['榻', '软垫'], propsEn: ['daybed', 'cushion'], environments: ['ancient_indoor'] },
  '罗汉床': { id: 'ancient_couch', name: '罗汉床', nameEn: 'Arhat Bed', propsZh: ['罗汉床', '青瓷茶具'], propsEn: ['arhat bed', 'celadon tea set'], environments: ['ancient_indoor'] },
  '床榻': { id: 'ancient_couch', name: '床榻', nameEn: 'Bed', propsZh: ['床', '床帐'], propsEn: ['bed', 'bed curtain'], environments: ['ancient_indoor'] },
  '厂房': { id: 'ancient_couch', name: '卢室', nameEn: 'Bedroom', propsZh: ['床', '帐子'], propsEn: ['bed', 'canopy'], environments: ['ancient_indoor'] },
  // 书房古代
  '挥毫': { id: 'ancient_study', name: '书房', nameEn: 'Study', propsZh: ['笔墨纸砚', '书架'], propsEn: ['four treasures of study', 'bookshelf'], environments: ['ancient_indoor'] },
  '提笔': { id: 'ancient_study', name: '书房', nameEn: 'Study', propsZh: ['毛笔', '砕台'], propsEn: ['brush', 'inkstone'], environments: ['ancient_indoor'] },
  '读书': { id: 'ancient_study', name: '书房', nameEn: 'Study', propsZh: ['书卷', '烛灯'], propsEn: ['books', 'candle'], environments: ['ancient_indoor'] },
  // 佛堂/祁堂
  '佛堂': { id: 'ancient_shrine', name: '佛堂', nameEn: 'Buddha Hall', propsZh: ['佛像', '香炉', '蒲团'], propsEn: ['Buddha statue', 'incense burner', 'cushion'], environments: ['ancient_indoor'] },
  '上香': { id: 'ancient_shrine', name: '佛堂', nameEn: 'Offering Incense', propsZh: ['香炉', '香'], propsEn: ['incense burner', 'incense'], environments: ['ancient_indoor'] },
  '跨拜': { id: 'ancient_shrine', name: '祁堂', nameEn: 'Ancestral Hall', propsZh: ['牠位', '跨垫'], propsEn: ['memorial tablet', 'kneeling cushion'], environments: ['ancient_indoor'] },
  
  // ========== 古代户外góc nhìn (ancient_outdoor) ==========
  // 庭院
  '庭院': { id: 'ancient_courtyard', name: '庭院', nameEn: 'Courtyard', propsZh: ['假山', '水池', '花丛'], propsEn: ['rockery', 'pond', 'flower bed'], environments: ['ancient_outdoor'] },
  '前院': { id: 'ancient_courtyard', name: '前院', nameEn: 'Front Yard', propsZh: ['石阶', '垂花'], propsEn: ['stone steps', 'hanging flowers'], environments: ['ancient_outdoor'] },
  '后院': { id: 'ancient_courtyard', name: '后院', nameEn: 'Back Yard', propsZh: ['花丛', '竹林'], propsEn: ['flower bed', 'bamboo grove'], environments: ['ancient_outdoor'] },
  // 池塘/亝子
  '池塘': { id: 'ancient_pond', name: '池塘', nameEn: 'Pond View', propsZh: ['荷塘', '木桥', '亝'], propsEn: ['lotus pond', 'wooden bridge', 'pavilion'], environments: ['ancient_outdoor'] },
  '荷塘': { id: 'ancient_pond', name: '荷塘', nameEn: 'Lotus Pond', propsZh: ['荷叶', '荷花', '莲蓬'], propsEn: ['lotus leaves', 'lotus flowers', 'lotus seedpod'], environments: ['ancient_outdoor'] },
  '亝子': { id: 'ancient_pavilion', name: '亝子', nameEn: 'Pavilion', propsZh: ['亝', '石凳', '栏杆'], propsEn: ['pavilion', 'stone bench', 'railing'], environments: ['ancient_outdoor'] },
  '流水': { id: 'ancient_pond', name: '水景', nameEn: 'Water View', propsZh: ['小桥', '流水'], propsEn: ['bridge', 'stream'], environments: ['ancient_outdoor'] },
  // 官道/街道
  '官道': { id: 'ancient_road', name: '官道', nameEn: 'Official Road', propsZh: ['官道', '松柏'], propsEn: ['road', 'pine trees'], environments: ['ancient_outdoor'] },
  '驿站': { id: 'ancient_road', name: '驿站', nameEn: 'Post Station', propsZh: ['驿站', '马棚'], propsEn: ['post station', 'stable'], environments: ['ancient_outdoor'] },
  '赶路': { id: 'ancient_road', name: '道路', nameEn: 'Road', propsZh: ['道路'], propsEn: ['road'], environments: ['ancient_outdoor'] },
  //  tập市/城门
  ' tập市': { id: 'ancient_market', name: ' tập市', nameEn: 'Market', propsZh: ['市 tập', '摆', '人群'], propsEn: ['market', 'stalls', 'crowd'], environments: ['ancient_outdoor'] },
  '城门': { id: 'ancient_gate', name: '城门', nameEn: 'City Gate', propsZh: ['城门', '城墙', '士兵'], propsEn: ['city gate', 'city wall', 'soldiers'], environments: ['ancient_outdoor'] },
  '城楼': { id: 'ancient_gate', name: '城楼', nameEn: 'City Tower', propsZh: ['城楼', '城墙'], propsEn: ['city tower', 'city wall'], environments: ['ancient_outdoor'] },
  // 码头/渡sổ
  '码头': { id: 'ancient_dock', name: '码头', nameEn: 'Dock', propsZh: ['木栅', '船只', '缆绳'], propsEn: ['wooden pier', 'boats', 'mooring rope'], environments: ['ancient_outdoor'] },
  '渡sổ': { id: 'ancient_dock', name: '渡sổ', nameEn: 'Ferry Crossing', propsZh: ['渡船', '河水'], propsEn: ['ferry boat', 'river'], environments: ['ancient_outdoor'] },
  
  // ========== 古代交通góc nhìn (ancient_vehicle) ==========
  // 马车/轿子
  '轿子': { id: 'ancient_sedan', name: '轿内', nameEn: 'Sedan Chair', propsZh: ['轿帘', '轿内'], propsEn: ['sedan curtain', 'sedan interior'], environments: ['ancient_vehicle'] },
  '轿内': { id: 'ancient_sedan', name: '轿内', nameEn: 'Inside Sedan', propsZh: ['轿帘', '坐垫'], propsEn: ['sedan curtain', 'cushion'], environments: ['ancient_vehicle'] },
  '上轿': { id: 'ancient_sedan', name: '轿门', nameEn: 'Entering Sedan', propsZh: ['轿门', '轿帘'], propsEn: ['sedan door', 'curtain'], environments: ['ancient_vehicle'] },
  '下轿': { id: 'ancient_sedan', name: '轿门', nameEn: 'Exiting Sedan', propsZh: ['轿门'], propsEn: ['sedan door'], environments: ['ancient_vehicle'] },
  '马车': { id: 'ancient_carriage', name: '车内', nameEn: 'Carriage', propsZh: ['车篾', '坐垫'], propsEn: ['carriage canopy', 'cushion'], environments: ['ancient_vehicle'] },
  '车内': { id: 'ancient_carriage', name: '车内', nameEn: 'Inside Carriage', propsZh: ['车篾', '帘'], propsEn: ['canopy', 'window curtain'], environments: ['ancient_vehicle'] },
  // 船只
  '船舱': { id: 'ancient_boat', name: '船舱', nameEn: 'Boat Cabin', propsZh: ['船舱', '子'], propsEn: ['cabin', 'window'], environments: ['ancient_vehicle'] },
  '舱内': { id: 'ancient_boat', name: '船舱', nameEn: 'Inside Cabin', propsZh: ['船舱', '子', '木方'], propsEn: ['cabin', 'window', 'wooden table'], environments: ['ancient_vehicle'] },
  '甲板': { id: 'ancient_deck', name: '甲板', nameEn: 'Ship Deck', propsZh: ['甲板', '桶杆', '风帆'], propsEn: ['deck', 'mast', 'sail'], environments: ['ancient_vehicle'] },
  '船头': { id: 'ancient_deck', name: '船头', nameEn: 'Bow', propsZh: ['船头', '桶杆'], propsEn: ['bow', 'mast'], environments: ['ancient_vehicle'] },
  '船尾': { id: 'ancient_deck', name: '船尾', nameEn: 'Stern', propsZh: ['船尾', '艰'], propsEn: ['stern', 'rudder'], environments: ['ancient_vehicle'] },
  // 骑马
  '骑马': { id: 'ancient_horse', name: '马背', nameEn: 'On Horseback', propsZh: ['马', '缰绳', '马鞍'], propsEn: ['horse', 'reins', 'saddle'], environments: ['ancient_vehicle'] },
  '上马': { id: 'ancient_horse', name: '马背', nameEn: 'Mounting', propsZh: ['马蹬', '马鞍'], propsEn: ['stirrup', 'saddle'], environments: ['ancient_vehicle'] },
  '下马': { id: 'ancient_horse', name: '马背', nameEn: 'Dismounting', propsZh: ['马'], propsEn: ['horse'], environments: ['ancient_vehicle'] },
  '驰骋': { id: 'ancient_horse', name: '马背', nameEn: 'Galloping', propsZh: ['马', '缰绳'], propsEn: ['horse', 'reins'], environments: ['ancient_vehicle'] },
  
  // ========== 现代交通工具góc nhìn (vehicle) ==========
  // 车góc nhìn
  '车': { id: 'vehicle_window', name: '车', nameEn: 'Vehicle Window View', propsZh: ['车', '外风景'], propsEn: ['vehicle window', 'outside scenery'], environments: ['vehicle'] },
  '外风景': { id: 'vehicle_window', name: '车', nameEn: 'Vehicle Window View', propsZh: ['车', '风景'], propsEn: ['vehicle window', 'scenery'], environments: ['vehicle'] },
  // 车内座位góc nhìn
  '座位': { id: 'vehicle_seat', name: '座位区', nameEn: 'Seat Area', propsZh: ['座位', '扁手'], propsEn: ['seat', 'armrest'], environments: ['vehicle'] },
  '车座': { id: 'vehicle_seat', name: '座位区', nameEn: 'Seat Area', propsZh: ['车座'], propsEn: ['vehicle seat'], environments: ['vehicle'] },
  '坐在': { id: 'vehicle_seat', name: '座位区', nameEn: 'Seat Area', propsZh: ['座位'], propsEn: ['seat'], environments: ['vehicle'] },
  // 车内过道góc nhìn
  '过道': { id: 'vehicle_aisle', name: '过道', nameEn: 'Aisle View', propsZh: ['过道', '扶手'], propsEn: ['aisle', 'handrail'], environments: ['vehicle'] },
  '走道': { id: 'vehicle_aisle', name: '过道', nameEn: 'Aisle View', propsZh: ['过道'], propsEn: ['aisle'], environments: ['vehicle'] },
  // 驾驶位góc nhìn
  '驾驶': { id: 'vehicle_driver', name: '驾驶位', nameEn: 'Driver Area', propsZh: ['方向盘', '仪表盘'], propsEn: ['steering wheel', 'dashboard'], environments: ['vehicle'] },
  '司机': { id: 'vehicle_driver', name: '驾驶位', nameEn: 'Driver Area', propsZh: ['方向盘'], propsEn: ['steering wheel'], environments: ['vehicle'] },
  '开车': { id: 'vehicle_driver', name: '驾驶位', nameEn: 'Driver Area', propsZh: ['方向盘', '仪表盘'], propsEn: ['steering wheel', 'dashboard'], environments: ['vehicle'] },
  // 车门góc nhìn
  '车门': { id: 'vehicle_door', name: '车门', nameEn: 'Vehicle Door', propsZh: ['车门', '台阶'], propsEn: ['vehicle door', 'steps'], environments: ['vehicle'] },
  '上车': { id: 'vehicle_door', name: '车门', nameEn: 'Vehicle Door', propsZh: ['车门', '台阶'], propsEn: ['vehicle door', 'steps'], environments: ['vehicle'] },
  '下车': { id: 'vehicle_door', name: '车门', nameEn: 'Vehicle Door', propsZh: ['车门', '台阶'], propsEn: ['vehicle door', 'steps'], environments: ['vehicle'] },
  
  // ========== 户外góc nhìn (outdoor) ==========
  // 道路góc nhìn
  '路边': { id: 'roadside', name: '路边', nameEn: 'Roadside View', propsZh: ['道路', '路牙'], propsEn: ['road', 'curb'], environments: ['outdoor'] },
  '马路': { id: 'roadside', name: '道路', nameEn: 'Road View', propsZh: ['道路', '树木'], propsEn: ['road', 'trees'], environments: ['outdoor'] },
  '街道': { id: 'street', name: '街景', nameEn: 'Street View', propsZh: ['街道', '路灯', '店铺'], propsEn: ['street', 'streetlight', 'shops'], environments: ['outdoor'] },
  '街头': { id: 'street', name: '街景', nameEn: 'Street View', propsZh: ['街道', '行人'], propsEn: ['street', 'pedestrians'], environments: ['outdoor'] },
  // 自然风景góc nhìn
  '田野': { id: 'nature', name: '自然风景', nameEn: 'Nature View', propsZh: ['田野', '庄稼'], propsEn: ['field', 'crops'], environments: ['outdoor'] },
  '山': { id: 'nature', name: '自然风景', nameEn: 'Nature View', propsZh: ['山峦'], propsEn: ['mountains'], environments: ['outdoor'] },
  '河': { id: 'nature', name: '自然风景', nameEn: 'Nature View', propsZh: ['河流'], propsEn: ['river'], environments: ['outdoor'] },
  '树': { id: 'nature', name: '自然风景', nameEn: 'Nature View', propsZh: ['树木', '树叶'], propsEn: ['trees', 'leaves'], environments: ['outdoor'] },
  // 庭院góc nhìn
  '院子': { id: 'yard', name: '庭院', nameEn: 'Yard View', propsZh: ['院子', '围墙'], propsEn: ['yard', 'wall'], environments: ['outdoor'] },
  '花园': { id: 'garden', name: '花园', nameEn: 'Garden View', propsZh: ['花卉', '植物'], propsEn: ['flowers', 'plants'], environments: ['outdoor'] },
  
  // ========== 室内家居góc nhìn (indoor_home) ==========
  // 餐桌/用餐相关
  '吃饭': { id: 'dining', name: '餐桌区', nameEn: 'Dining Area', propsZh: ['餐桌', '碗筷', '菜肴'], propsEn: ['dining table', 'bowls and chopsticks', 'dishes'], environments: ['indoor_home', 'indoor_public'] },
  '饭桌': { id: 'dining', name: '餐桌区', nameEn: 'Dining Area', propsZh: ['餐桌', '碗筷', '菜肴'], propsEn: ['dining table', 'bowls and chopsticks', 'dishes'], environments: ['indoor_home', 'indoor_public'] },
  '餐桌': { id: 'dining', name: '餐桌区', nameEn: 'Dining Area', propsZh: ['餐桌', '碗筷'], propsEn: ['dining table', 'bowls and chopsticks'], environments: ['indoor_home', 'indoor_public'] },
  '用餐': { id: 'dining', name: '餐桌区', nameEn: 'Dining Area', propsZh: ['餐桌', '碗筷', '菜肴'], propsEn: ['dining table', 'bowls and chopsticks', 'dishes'], environments: ['indoor_home', 'indoor_public'] },
  '端菜': { id: 'dining', name: '餐桌区', nameEn: 'Dining Area', propsZh: ['餐桌', '菜肴'], propsEn: ['dining table', 'dishes'], environments: ['indoor_home', 'indoor_public'] },
  '夹菜': { id: 'dining', name: '餐桌区', nameEn: 'Dining Area', propsZh: ['餐桌', '碗筷'], propsEn: ['dining table', 'chopsticks'], environments: ['indoor_home', 'indoor_public'] },
  '喝酒': { id: 'dining', name: '餐桌区', nameEn: 'Dining Area', propsZh: ['餐桌', '酒杯'], propsEn: ['dining table', 'wine glass'], environments: ['indoor_home', 'indoor_public'] },
  '碰杯': { id: 'dining', name: '餐桌区', nameEn: 'Dining Area', propsZh: ['餐桌', '酒杯'], propsEn: ['dining table', 'glasses'], environments: ['indoor_home', 'indoor_public'] },
  '举杯': { id: 'dining', name: '餐桌区', nameEn: 'Dining Area', propsZh: ['餐桌', '酒杯'], propsEn: ['dining table', 'glasses'], environments: ['indoor_home', 'indoor_public'] },
  
  // 沙发/客厅相关 - 仅室内家居
  '沙发': { id: 'sofa', name: '沙发区', nameEn: 'Sofa Area', propsZh: ['沙发', '茶几', '电视'], propsEn: ['sofa', 'coffee table', 'TV'], environments: ['indoor_home'] },
  '看电视': { id: 'sofa', name: '沙发区', nameEn: 'Sofa Area', propsZh: ['沙发', '电视'], propsEn: ['sofa', 'television'], environments: ['indoor_home'] },
  '茶几': { id: 'sofa', name: '沙发区', nameEn: 'Sofa Area', propsZh: ['沙发', '茶几'], propsEn: ['sofa', 'coffee table'], environments: ['indoor_home'] },
  '倒茶': { id: 'sofa', name: '沙发区', nameEn: 'Sofa Area', propsZh: ['沙发', '茶几', '茶壶'], propsEn: ['sofa', 'coffee table', 'teapot'], environments: ['indoor_home', 'indoor_work'] },
  '喝茶': { id: 'sofa', name: '沙发区', nameEn: 'Sofa Area', propsZh: ['沙发', '茶几', '茶杯'], propsEn: ['sofa', 'coffee table', 'teacup'], environments: ['indoor_home', 'indoor_work'] },
  
  // 边相关 - 室内用
  '': { id: 'window', name: '边', nameEn: 'Window View', propsZh: ['户', '帘'], propsEn: ['window', 'curtains'], environments: ['indoor_home', 'indoor_work', 'indoor_public'] },
  '外': { id: 'window', name: '边', nameEn: 'Window View', propsZh: ['户', '帘', '自然光'], propsEn: ['window', 'curtains', 'natural light'], environments: ['indoor_home', 'indoor_work', 'indoor_public'] },
  '边': { id: 'window', name: '边', nameEn: 'Window View', propsZh: ['户', '帘'], propsEn: ['window', 'curtains'], environments: ['indoor_home', 'indoor_work', 'indoor_public'] },
  '阳台': { id: 'window', name: '边/阳台', nameEn: 'Balcony View', propsZh: ['阳台', '栏杆'], propsEn: ['balcony', 'railing'], environments: ['indoor_home'] },
  '帘': { id: 'window', name: '边', nameEn: 'Window View', propsZh: ['户', '帘'], propsEn: ['window', 'curtains'], environments: ['indoor_home', 'indoor_work'] },
  
  // 入sổ/门相关 - 室内用
  '门sổ': { id: 'entrance', name: '入sổ', nameEn: 'Entrance View', propsZh: ['门', '玄关'], propsEn: ['door', 'entrance'], environments: ['indoor_home', 'indoor_work', 'indoor_public'] },
  '门': { id: 'entrance', name: '入sổ', nameEn: 'Entrance View', propsZh: ['门', '玄关'], propsEn: ['door', 'entrance'], environments: ['indoor_home', 'indoor_work', 'indoor_public'] },
  '进门': { id: 'entrance', name: '入sổ', nameEn: 'Entrance View', propsZh: ['门', '玄关'], propsEn: ['door', 'entrance'], environments: ['indoor_home', 'indoor_work', 'indoor_public'] },
  '出门': { id: 'entrance', name: '入sổ', nameEn: 'Entrance View', propsZh: ['门'], propsEn: ['door'], environments: ['indoor_home', 'indoor_work', 'indoor_public'] },
  '回家': { id: 'entrance', name: '入sổ', nameEn: 'Entrance View', propsZh: ['门', '玄关'], propsEn: ['door', 'entrance'], environments: ['indoor_home'] },
  '进来': { id: 'entrance', name: '入sổ', nameEn: 'Entrance View', propsZh: ['门'], propsEn: ['door'], environments: ['indoor_home', 'indoor_work', 'indoor_public'] },
  '走进': { id: 'entrance', name: '入sổ', nameEn: 'Entrance View', propsZh: ['门'], propsEn: ['door'], environments: ['indoor_home', 'indoor_work', 'indoor_public'] },
  '离开': { id: 'entrance', name: '入sổ', nameEn: 'Entrance View', propsZh: ['门'], propsEn: ['door'], environments: ['indoor_home', 'indoor_work', 'indoor_public'] },
  '玄关': { id: 'entrance', name: '入sổ', nameEn: 'Entrance View', propsZh: ['门', '玄关', '鞋柜'], propsEn: ['door', 'entrance', 'shoe cabinet'], environments: ['indoor_home'] },
  '换鞋': { id: 'entrance', name: '入sổ', nameEn: 'Entrance View', propsZh: ['玄关', '鞋柜'], propsEn: ['entrance', 'shoe cabinet'], environments: ['indoor_home'] },
  
  // 厨房相关 - 仅室内家居
  '厨房': { id: 'kitchen', name: '厨房', nameEn: 'Kitchen', propsZh: ['灶台', '橱柜'], propsEn: ['stove', 'cabinets'], environments: ['indoor_home'] },
  '做饭': { id: 'kitchen', name: '厨房', nameEn: 'Kitchen', propsZh: ['灶台', '锅具'], propsEn: ['stove', 'cookware'], environments: ['indoor_home'] },
  '烧菜': { id: 'kitchen', name: '厨房', nameEn: 'Kitchen', propsZh: ['灶台', '锅具'], propsEn: ['stove', 'cookware'], environments: ['indoor_home'] },
  '炒菜': { id: 'kitchen', name: '厨房', nameEn: 'Kitchen', propsZh: ['灶台', '锅具'], propsEn: ['stove', 'wok'], environments: ['indoor_home'] },
  '洗碗': { id: 'kitchen', name: '厨房', nameEn: 'Kitchen', propsZh: ['水槽', '碗碟'], propsEn: ['sink', 'dishes'], environments: ['indoor_home'] },
  '切菜': { id: 'kitchen', name: '厨房', nameEn: 'Kitchen', propsZh: ['砧板', '菜刀'], propsEn: ['cutting board', 'knife'], environments: ['indoor_home'] },
  '冰箱': { id: 'kitchen', name: '厨房', nameEn: 'Kitchen', propsZh: ['冰箱'], propsEn: ['refrigerator'], environments: ['indoor_home'] },
  
  // 书房/工作相关 - 室内家居+办公
  '书桌': { id: 'study', name: '书房/书桌', nameEn: 'Study Area', propsZh: ['书桌', '台灯', '书架'], propsEn: ['desk', 'lamp', 'bookshelf'], environments: ['indoor_home', 'indoor_work'] },
  '电脑': { id: 'study', name: '书房/书桌', nameEn: 'Study Area', propsZh: ['书桌', '电脑'], propsEn: ['desk', 'computer'], environments: ['indoor_home', 'indoor_work'] },
  '看书': { id: 'study', name: '书房/书桌', nameEn: 'Study Area', propsZh: ['书桌', '台灯'], propsEn: ['desk', 'lamp'], environments: ['indoor_home', 'indoor_public'] },
  '写字': { id: 'study', name: '书房/书桌', nameEn: 'Study Area', propsZh: ['书桌', '台灯'], propsEn: ['desk', 'lamp'], environments: ['indoor_home', 'indoor_work'] },
  '办公': { id: 'study', name: '书房/书桌', nameEn: 'Study Area', propsZh: ['书桌', '电脑'], propsEn: ['desk', 'computer'], environments: ['indoor_work'] },
  '文件': { id: 'study', name: '书房/书桌', nameEn: 'Study Area', propsZh: ['书桌', '文件'], propsEn: ['desk', 'documents'], environments: ['indoor_home', 'indoor_work'] },
  '书架': { id: 'study', name: '书房/书桌', nameEn: 'Study Area', propsZh: ['书架', '书籍'], propsEn: ['bookshelf', 'books'], environments: ['indoor_home', 'indoor_work', 'indoor_public'] },
  
  // 卧室相关 - 必须明确提到床hoặc卧室
  '卧室': { id: 'bedroom', name: '卧室', nameEn: 'Bedroom', propsZh: ['床', '床头柜'], propsEn: ['bed', 'nightstand'], environments: ['indoor_home'] },
  '床上': { id: 'bedroom', name: '卧室', nameEn: 'Bedroom', propsZh: ['床'], propsEn: ['bed'], environments: ['indoor_home'] },
  '起床': { id: 'bedroom', name: '卧室', nameEn: 'Bedroom', propsZh: ['床', '床头柜'], propsEn: ['bed', 'nightstand'], environments: ['indoor_home'] },
  '床头': { id: 'bedroom', name: '卧室', nameEn: 'Bedroom', propsZh: ['床', '床头柜', '台灯'], propsEn: ['bed', 'nightstand', 'lamp'], environments: ['indoor_home'] },
  '被窝': { id: 'bedroom', name: '卧室', nameEn: 'Bedroom', propsZh: ['床', '被子'], propsEn: ['bed', 'blanket'], environments: ['indoor_home'] },
  
  // ========== 通用góc nhìn（适用于Tất cả环境） ==========
  // Chat/情感场景 - 通用
  '交谈': { id: 'conversation', name: 'Chat区', nameEn: 'Conversation Area', propsZh: [], propsEn: [], environments: [] },
  '聊天': { id: 'conversation', name: 'Chat区', nameEn: 'Conversation Area', propsZh: [], propsEn: [], environments: [] },
  '说话': { id: 'conversation', name: 'Chat区', nameEn: 'Conversation Area', propsZh: [], propsEn: [], environments: [] },
  '争吵': { id: 'conversation', name: 'Chat区', nameEn: 'Conversation Area', propsZh: [], propsEn: [], environments: [] },
  '吵架': { id: 'conversation', name: 'Chat区', nameEn: 'Conversation Area', propsZh: [], propsEn: [], environments: [] },
  '哭泣': { id: 'emotion', name: '情感Cực cận cảnh', nameEn: 'Emotional Close-up', propsZh: [], propsEn: [], environments: [] },
  '流泪': { id: 'emotion', name: '情感Cực cận cảnh', nameEn: 'Emotional Close-up', propsZh: [], propsEn: [], environments: [] },
  '微笑': { id: 'emotion', name: '情感Cực cận cảnh', nameEn: 'Emotional Close-up', propsZh: [], propsEn: [], environments: [] },
  '拥抱': { id: 'emotion', name: '情感Cực cận cảnh', nameEn: 'Emotional Close-up', propsZh: [], propsEn: [], environments: [] },
  
  // Cực cận cảnh镜头 - 通用
  '手': { id: 'detail', name: '细节Cực cận cảnh', nameEn: 'Detail Close-up', propsZh: [], propsEn: [], environments: [] },
  '握着': { id: 'detail', name: '细节Cực cận cảnh', nameEn: 'Detail Close-up', propsZh: [], propsEn: [], environments: [] },
  '拿起': { id: 'detail', name: '细节Cực cận cảnh', nameEn: 'Detail Close-up', propsZh: [], propsEn: [], environments: [] },
  '放下': { id: 'detail', name: '细节Cực cận cảnh', nameEn: 'Detail Close-up', propsZh: [], propsEn: [], environments: [] },
  'Cực cận cảnh': { id: 'detail', name: '细节Cực cận cảnh', nameEn: 'Detail Close-up', propsZh: [], propsEn: [], environments: [] },
  'Cận cảnh': { id: 'detail', name: '细节Cực cận cảnh', nameEn: 'Detail Close-up', propsZh: [], propsEn: [], environments: [] },
  
  // 观看/类泛用动作 - 通用
  '望向': { id: 'looking', name: '观看góc nhìn', nameEn: 'Looking View', propsZh: [], propsEn: [], environments: [] },
  '眰望': { id: 'looking', name: '观看góc nhìn', nameEn: 'Looking View', propsZh: [], propsEn: [], environments: [] },
  '注视': { id: 'looking', name: '观看góc nhìn', nameEn: 'Looking View', propsZh: [], propsEn: [], environments: [] },
  
  // 坐下/起身 - 根据环境动态适应
  '坐下': { id: 'seating', name: '坐席区', nameEn: 'Seating Area', propsZh: [], propsEn: [], environments: [] },
  '落座': { id: 'seating', name: '坐席区', nameEn: 'Seating Area', propsZh: [], propsEn: [], environments: [] },
  '起身': { id: 'seating', name: '坐席区', nameEn: 'Seating Area', propsZh: [], propsEn: [], environments: [] },
};

// ==================== 核心函数 ====================

/**
 * 从分镜动作描写đang xử lý...角需求
 */
export function extractViewpointsFromShots(
  shots: Shot[],
  maxViewpoints: number = 6
): SceneViewpoint[] {
  const viewpointMap = new Map<string, SceneViewpoint>();
  
  for (const shot of shots) {
    const actionText = shot.actionSummary || '';
    
    // kiểm tra每quan trọng词
    for (const [keyword, config] of Object.entries(VIEWPOINT_KEYWORDS)) {
      if (actionText.includes(keyword)) {
        if (!viewpointMap.has(config.id)) {
          viewpointMap.set(config.id, {
            id: config.id,
            name: config.name,
            nameEn: config.nameEn,
            shotIds: [shot.id],
            keyProps: [...config.propsZh],
            keyPropsEn: [...config.propsEn],
            description: '',
            descriptionEn: '',
            gridIndex: viewpointMap.size,
          });
        } else {
          const existing = viewpointMap.get(config.id)!;
          if (!existing.shotIds.includes(shot.id)) {
            existing.shotIds.push(shot.id);
          }
          // 合并đạo cụ
          for (const prop of config.propsZh) {
            if (!existing.keyProps.includes(prop)) {
              existing.keyProps.push(prop);
            }
          }
          for (const prop of config.propsEn) {
            if (!existing.keyPropsEn.includes(prop)) {
              existing.keyPropsEn.push(prop);
            }
          }
        }
      }
    }
  }
  
  // 按关联分镜数排序（常用góc nhìn优先）
  const viewpoints = Array.from(viewpointMap.values())
    .sort((a, b) => b.shotIds.length - a.shotIds.length)
    .slice(0, maxViewpoints);
  
  // lạiphân bổ gridIndex
  viewpoints.forEach((v, i) => { v.gridIndex = i; });
  
  // 如果góc nhìn不足 6 ，补充默认góc nhìn
  const defaultViewpoints: Array<Omit<SceneViewpoint, 'shotIds' | 'gridIndex'>> = [
    { id: 'overview', name: '全景', nameEn: 'Overview', keyProps: [], keyPropsEn: [], description: '整体Bố cục không gian', descriptionEn: 'Overall spatial layout' },
    { id: 'detail', name: '细节', nameEn: 'Detail View', keyProps: [], keyPropsEn: [], description: '装饰细节Cực cận cảnh', descriptionEn: 'Decorative details close-up' },
  ];
  
  while (viewpoints.length < maxViewpoints && defaultViewpoints.length > 0) {
    const def = defaultViewpoints.shift()!;
    if (!viewpoints.some(v => v.id === def.id)) {
      viewpoints.push({
        ...def,
        shotIds: [],
        gridIndex: viewpoints.length,
      });
    }
  }
  
  return viewpoints;
}

/**
 * Tạoảnh ghép提示词
 * 优先Sử dụng AI 分析的góc nhìn，如果没有则回退到quan trọng词提取
 */
export function generateContactSheetPrompt(config: ContactSheetConfig): ContactSheetPromptResult {
  const { scene, shots, styleTokens, aspectRatio, maxViewpoints = 6 } = config;
  
  // 优先Sử dụng AI 分析的góc nhìn（来自 scene.viewpoints）
  let viewpoints: SceneViewpoint[];
  let isAIAnalyzed = false;
  
  if (scene.viewpoints && scene.viewpoints.length > 0) {
    // Sử dụng AI 分析的góc nhìn
    console.log(`[generateContactSheetPrompt] Sử dụng AI 分析góc nhìn: ${scene.viewpoints.length} `);
    viewpoints = scene.viewpoints.slice(0, maxViewpoints).map((v: any, idx: number) => ({
      id: v.id || `viewpoint_${idx}`,
      name: v.name || '未命名góc nhìn',
      nameEn: v.nameEn || 'Unnamed Viewpoint',
      shotIds: v.shotIds || [],
      keyProps: v.keyProps || [],
      keyPropsEn: v.keyPropsEn || [],
      description: v.description || '',
      descriptionEn: v.descriptionEn || '',
      gridIndex: idx,
    }));
    isAIAnalyzed = true;
  } else {
    // 回退到quan trọng词提取
    console.log('[generateContactSheetPrompt] 没有 AI góc nhìn，回退到quan trọng词提取');
    viewpoints = extractViewpointsFromShots(shots, maxViewpoints);
  }
  
  // 确定lướibố cục - 强制Sử dụng NxN bố cục (2x2 hoặc 3x3)
  const vpCount = viewpoints.length;
  const gridLayout = vpCount <= 4 
    ? { rows: 2, cols: 2 }
    : { rows: 3, cols: 3 };
  
  // 构建场景基础Mô tả
  const sceneDescZh = [
    scene.architectureStyle && `Phong cách kiến trúc: ${scene.architectureStyle}`,
    scene.colorPalette && `色彩基调：${scene.colorPalette}`,
    scene.eraDetails && `thời đại特征：${scene.eraDetails}`,
    scene.lightingDesign && `光影Thiết kế：${scene.lightingDesign}`,
  ].filter(Boolean).join('，');
  
  const sceneDescEn = [
    scene.architectureStyle && `Architecture: ${scene.architectureStyle}`,
    scene.colorPalette && `Color palette: ${scene.colorPalette}`,
    scene.eraDetails && `Era: ${scene.eraDetails}`,
    scene.lightingDesign && `Lighting: ${scene.lightingDesign}`,
  ].filter(Boolean).join('. ');
  
  // 为每góc nhìnTạoMô tả
  viewpoints.forEach((vp, index) => {
    const propsZh = vp.keyProps.length > 0 ? `，chứa${vp.keyProps.join('、')}` : '';
    const propsEn = vp.keyPropsEn.length > 0 ? ` with ${vp.keyPropsEn.join(', ')}` : '';
    
    vp.description = `${vp.name}góc nhìn${propsZh}`;
    vp.descriptionEn = `${vp.nameEn} angle${propsEn}`;
  });
  
  const styleStr = styleTokens.length > 0 
    ? styleTokens.join(', ') 
    : 'anime style, soft colors, detailed background';
  
  const totalCells = gridLayout.rows * gridLayout.cols;
  const paddedCount = totalCells;
  
  // 构建增强版提示词 — 对齐Đạo diễnpanel generateGridAndSlice 的3 lớp风格夹击Cấu trúc
  const promptParts: string[] = [];
  
  // 1. 核心指令区 (Instruction Block) — Sử dụng与Đạo diễnpanelgiống的 storyboard grid 术语
  promptParts.push('<instruction>');
  promptParts.push(`Generate a clean ${gridLayout.rows}x${gridLayout.cols} storyboard grid with exactly ${paddedCount} equal-sized panels.`);
  promptParts.push(`Overall Image Aspect Ratio: ${aspectRatio}.`);
  // 明确指定单格子的宽高比，防止 AI 混淆（Đạo diễnpanel核心差异点）
  const panelAspect = aspectRatio === '16:9' ? '16:9 (horizontal landscape)' : '9:16 (vertical portrait)';
  promptParts.push(`Each individual panel must have a ${panelAspect} aspect ratio.`);
  // 全局Thị giác风格（前置到指令区，权重最高 — 3 lớp夹击第一层）
  if (styleStr) {
    promptParts.push(`MANDATORY Visual Style for ALL panels: ${styleStr}`);
  }
  promptParts.push('Structure: No borders between panels, no text, no watermarks, no speech bubbles.');
  promptParts.push('Consistency: Maintain consistent perspective, lighting, color grading, and visual style across ALL panels.');
  promptParts.push('Subject: Interior design and architectural details only, NO people.');
  promptParts.push('</instruction>');
  
  // 2. bố cụcMô tả
  promptParts.push(`Layout: ${gridLayout.rows} rows, ${gridLayout.cols} columns, reading order left-to-right, top-to-bottom.`);
  
  // 3. 场景thông tin
  if (sceneDescEn) {
    promptParts.push(`Scene Context: ${sceneDescEn}`);
  }
  
  // 4. 每格子的内容Mô tả — 每格附带 [same style] 锚定（3 lớp夹击第二层）
  const styleAnchor = styleStr ? ' [same style]' : '';
  viewpoints.forEach((vp, idx) => {
    const row = Math.floor(idx / gridLayout.cols) + 1;
    const col = (idx % gridLayout.cols) + 1;
    
    promptParts.push(`Panel [row ${row}, col ${col}] (no people): ${vp.nameEn.toUpperCase()}: ${vp.descriptionEn}${styleAnchor}`);
  });
  
  // 5. 空白Placeholder格Mô tả
  for (let i = viewpoints.length; i < paddedCount; i++) {
    const row = Math.floor(i / gridLayout.cols) + 1;
    const col = (i % gridLayout.cols) + 1;
    promptParts.push(`Panel [row ${row}, col ${col}]: empty placeholder, solid gray background`);
  }
  
    // 6. 全局风格尾部再次强调（3 lớp夹击第3 lớp）
    if (styleStr) {
      promptParts.push(`IMPORTANT - Apply this EXACT style uniformly to every panel: ${styleStr}`);
    }
  
    // 7. 负面提示词
    promptParts.push('Negative constraints: text, watermark, split screen borders, speech bubbles, blur, distortion, bad anatomy, people, characters, distorted grid, uneven panels.');
    
    const prompt = promptParts.join('\n');

    // đang xử lý...词
    const gridItemsZh = viewpoints.map((vp, i) => 
      `[${i + 1}] ${vp.name}：${vp.description || vp.name + 'góc nhìn'}`
    ).join('\n');
    
    const viewpointSource = isAIAnalyzed ? '（AI 分析）' : '（quan trọng词提取）';
  
  const promptZh = `一张${gridLayout.rows}x${gridLayout.cols}lướiảnh ghép，Hiển thị同一「${scene.name || scene.location}」场景的${viewpoints.length}不同vị trí cameragóc nhìn${viewpointSource}。
${sceneDescZh}

lướibố cục（从左到右，从上到下）：
${gridItemsZh}

风格：${styleTokens.length > 0 ? styleTokens.join('、') : '动画风格，柔和色彩，细节丰富'}，${viewpoints.length}格子giữgiống的透视和光照。每格子用细白线ngăn cách。只有背景，没有nhân vật。`;

  return {
    prompt,
    promptZh,
    viewpoints,
    gridLayout,
  };
}

/**
 * 根据cắtkết quả关联góc nhìn
 * 将cắt后的图片phân bổ给对应的góc nhìn
 */
export function assignViewpointImages(
  viewpoints: SceneViewpoint[],
  splitResults: Array<{
    id: number;
    dataUrl: string;
    row: number;
    col: number;
  }>,
  gridLayout: { rows: number; cols: number }
): Map<string, { imageUrl: string; gridIndex: number }> {
  const result = new Map<string, { imageUrl: string; gridIndex: number }>();
  
  for (const vp of viewpoints) {
    // 计算该góc nhìn在cắtkết quảđang xử lý...
    const gridIndex = vp.gridIndex;
    const row = Math.floor(gridIndex / gridLayout.cols);
    const col = gridIndex % gridLayout.cols;
    
    // 查找Khớp的cắtkết quả
    const splitResult = splitResults.find(sr => sr.row === row && sr.col === col);
    
    if (splitResult) {
      result.set(vp.id, {
        imageUrl: splitResult.dataUrl,
        gridIndex: gridIndex,
      });
    }
  }
  
  return result;
}

/**
 * 根据分镜动作Tự độngKhớp最佳góc nhìn
 */
export function matchShotToViewpoint(
  shot: Shot,
  viewpoints: SceneViewpoint[]
): string | null {
  const actionText = shot.actionSummary || '';
  
  // kiểm tra分镜是否已关联到某góc nhìn
  for (const vp of viewpoints) {
    if (vp.shotIds.includes(shot.id)) {
      return vp.id;
    }
  }
  
  // 尝试根据动作quan trọng词Khớp
  for (const [keyword, config] of Object.entries(VIEWPOINT_KEYWORDS)) {
    if (actionText.includes(keyword)) {
      const matchedVp = viewpoints.find(vp => vp.id === config.id);
      if (matchedVp) {
        return matchedVp.id;
      }
    }
  }
  
  // 默认返回全景góc nhìn
  const overviewVp = viewpoints.find(vp => vp.id === 'overview');
  return overviewVp?.id || viewpoints[0]?.id || null;
}

// ==================== 动态góc nhìn和phân trang支持 ====================

import type { 
  PendingViewpointData, 
  ContactSheetPromptSet 
} from '@/stores/media-panel-store';

/**
 * 从分镜文本đang xử lý...ất cả可搜索的内容
 * 包括：动作Mô tả、Thoại、Mô tả thị giác等
 */
function getShotSearchableText(shot: Shot): string {
  const parts = [
    shot.actionSummary || '',
    shot.dialogue || '',
    shot.visualDescription || '',
    shot.characterBlocking || '',
  ];
  return parts.join(' ');
}

/**
 * 根据环境类型获取默认góc nhìn列表
 * 用于在提取的góc nhìn不足时补充
 */
function getDefaultViewpointsForEnvironment(
  envType: SceneEnvironmentType
): Array<Omit<SceneViewpoint, 'shotIds' | 'gridIndex'>> {
  // 通用默认góc nhìn
  const commonDefaults: Array<Omit<SceneViewpoint, 'shotIds' | 'gridIndex'>> = [
    { id: 'overview', name: '全景', nameEn: 'Overview', keyProps: [], keyPropsEn: [], description: '整体Bố cục không gian', descriptionEn: 'Overall spatial layout' },
    { id: 'detail', name: '细节', nameEn: 'Detail View', keyProps: [], keyPropsEn: [], description: '细节Cực cận cảnh', descriptionEn: 'Detail close-up' },
  ];
  
  // 根据环境类型返回特定默认góc nhìn
  switch (envType) {
    case 'vehicle':
      return [
        { id: 'vehicle_window', name: '车', nameEn: 'Vehicle Window View', keyProps: ['车', '外风景'], keyPropsEn: ['vehicle window', 'outside scenery'], description: '车góc nhìn', descriptionEn: 'Vehicle window view' },
        { id: 'vehicle_seat', name: '座位区', nameEn: 'Seat Area', keyProps: ['座位'], keyPropsEn: ['seat'], description: '座位区域', descriptionEn: 'Seating area' },
        { id: 'vehicle_aisle', name: '过道', nameEn: 'Aisle View', keyProps: ['过道', '扶手'], keyPropsEn: ['aisle', 'handrail'], description: '过道góc nhìn', descriptionEn: 'Aisle view' },
        { id: 'vehicle_driver', name: '驾驶位', nameEn: 'Driver Area', keyProps: ['方向盘'], keyPropsEn: ['steering wheel'], description: '驾驶区域', descriptionEn: 'Driver area' },
        ...commonDefaults,
      ];
      
    case 'outdoor':
      return [
        { id: 'nature', name: '自然风景', nameEn: 'Nature View', keyProps: [], keyPropsEn: [], description: '自然风景góc nhìn', descriptionEn: 'Nature scenery view' },
        { id: 'roadside', name: '路边', nameEn: 'Roadside View', keyProps: ['道路'], keyPropsEn: ['road'], description: '路边góc nhìn', descriptionEn: 'Roadside view' },
        { id: 'street', name: '街景', nameEn: 'Street View', keyProps: ['街道'], keyPropsEn: ['street'], description: '街景góc nhìn', descriptionEn: 'Street view' },
        ...commonDefaults,
      ];
      
    case 'indoor_home':
      return [
        { id: 'sofa', name: '沙发区', nameEn: 'Sofa Area', keyProps: ['沙发', '茶几'], keyPropsEn: ['sofa', 'coffee table'], description: '沙发区域', descriptionEn: 'Sofa area' },
        { id: 'window', name: '边', nameEn: 'Window View', keyProps: ['户', '帘'], keyPropsEn: ['window', 'curtains'], description: '边góc nhìn', descriptionEn: 'Window view' },
        { id: 'entrance', name: '入sổ', nameEn: 'Entrance View', keyProps: ['门', '玄关'], keyPropsEn: ['door', 'entrance'], description: '入sổgóc nhìn', descriptionEn: 'Entrance view' },
        ...commonDefaults,
      ];
      
    case 'indoor_work':
      return [
        { id: 'study', name: '办公区', nameEn: 'Work Area', keyProps: ['书桌', '电脑'], keyPropsEn: ['desk', 'computer'], description: '办公区域', descriptionEn: 'Work area' },
        { id: 'window', name: '边', nameEn: 'Window View', keyProps: ['户'], keyPropsEn: ['window'], description: '边góc nhìn', descriptionEn: 'Window view' },
        { id: 'entrance', name: '入sổ', nameEn: 'Entrance View', keyProps: ['门'], keyPropsEn: ['door'], description: '入sổgóc nhìn', descriptionEn: 'Entrance view' },
        ...commonDefaults,
      ];
      
    case 'indoor_public':
      return [
        { id: 'seating', name: '坐席区', nameEn: 'Seating Area', keyProps: [], keyPropsEn: [], description: '坐席区域', descriptionEn: 'Seating area' },
        { id: 'entrance', name: '入sổ', nameEn: 'Entrance View', keyProps: ['门'], keyPropsEn: ['door'], description: '入sổgóc nhìn', descriptionEn: 'Entrance view' },
        ...commonDefaults,
      ];
    
    // === 古代场景 ===
    case 'ancient_indoor':
      return [
        { id: 'ancient_hall', name: '堂屋', nameEn: 'Main Hall', keyProps: ['太师椅', '案几'], keyPropsEn: ['taishi chair', 'table'], description: '堂屋góc nhìn', descriptionEn: 'Main hall view' },
        { id: 'ancient_table', name: '案几', nameEn: 'Ancient Table', keyProps: ['案几', '茶具'], keyPropsEn: ['table', 'tea set'], description: '案几góc nhìn', descriptionEn: 'Table view' },
        { id: 'ancient_screen', name: '屏风', nameEn: 'Screen View', keyProps: ['屏风', '帐幔'], keyPropsEn: ['screen', 'curtain'], description: '屏风góc nhìn', descriptionEn: 'Screen view' },
        { id: 'ancient_couch', name: '榻', nameEn: 'Ancient Couch', keyProps: ['榻', '软垫'], keyPropsEn: ['daybed', 'cushion'], description: '榻góc nhìn', descriptionEn: 'Couch view' },
        ...commonDefaults,
      ];
      
    case 'ancient_outdoor':
      return [
        { id: 'ancient_courtyard', name: '庭院', nameEn: 'Courtyard', keyProps: ['假山', '水池'], keyPropsEn: ['rockery', 'pond'], description: '庭院góc nhìn', descriptionEn: 'Courtyard view' },
        { id: 'ancient_pavilion', name: '亝子', nameEn: 'Pavilion', keyProps: ['亝', '石凳'], keyPropsEn: ['pavilion', 'stone bench'], description: '亝子góc nhìn', descriptionEn: 'Pavilion view' },
        { id: 'ancient_road', name: '官道', nameEn: 'Official Road', keyProps: ['官道'], keyPropsEn: ['road'], description: '官道góc nhìn', descriptionEn: 'Road view' },
        { id: 'ancient_gate', name: '城门', nameEn: 'City Gate', keyProps: ['城门', '城墙'], keyPropsEn: ['city gate', 'wall'], description: '城门góc nhìn', descriptionEn: 'City gate view' },
        ...commonDefaults,
      ];
      
    case 'ancient_vehicle':
      return [
        { id: 'ancient_sedan', name: '轿内', nameEn: 'Inside Sedan', keyProps: ['轿帘', '坐垫'], keyPropsEn: ['sedan curtain', 'cushion'], description: '轿内góc nhìn', descriptionEn: 'Inside sedan view' },
        { id: 'ancient_carriage', name: '车内', nameEn: 'Inside Carriage', keyProps: ['车篾', '坐垫'], keyPropsEn: ['canopy', 'cushion'], description: '车内góc nhìn', descriptionEn: 'Inside carriage view' },
        { id: 'ancient_boat', name: '船舱', nameEn: 'Boat Cabin', keyProps: ['船舱', '子'], keyPropsEn: ['cabin', 'window'], description: '船舱góc nhìn', descriptionEn: 'Boat cabin view' },
        { id: 'ancient_deck', name: '甲板', nameEn: 'Ship Deck', keyProps: ['甲板', '风帆'], keyPropsEn: ['deck', 'sail'], description: '甲板góc nhìn', descriptionEn: 'Deck view' },
        { id: 'ancient_horse', name: '马背', nameEn: 'On Horseback', keyProps: ['马', '马鞍'], keyPropsEn: ['horse', 'saddle'], description: '马背góc nhìn', descriptionEn: 'Horseback view' },
        ...commonDefaults,
      ];
      
    default:
      return commonDefaults;
  }
}

/**
 * kiểm tragóc nhìn配置是否与环境类型tương thích
 */
function isViewpointCompatibleWithEnvironment(
  config: ViewpointConfig,
  envType: SceneEnvironmentType
): boolean {
  // 空数组表示通用góc nhìn，适用于Tất cả环境
  if (config.environments.length === 0) {
    return true;
  }
  // unknown 环境不做lọc，允许Tất cảgóc nhìn
  if (envType === 'unknown') {
    return true;
  }
  // kiểm tra环境是否在tương thích列表中
  return config.environments.includes(envType);
}

/**
 * 提取góc nhìn（不限số lượng）
 * 返回Tất cả识别到的góc nhìn，不再限制为6
 * 
 * góc nhìn是从分镜内容đang xử lý...，不做环境lọc
 * 
 * @param shots 分镜列表
 * @param sceneLocation 场景地点（仅用于补充默认góc nhìn）
 */
export function extractAllViewpointsFromShots(
  shots: Shot[],
  sceneLocation?: string
): SceneViewpoint[] {
  const viewpointMap = new Map<string, SceneViewpoint>();
  const matchedShotIds = new Set<string>();
  
  // 第一遍：根据quan trọng词Khớp分镜到góc nhìn
  for (const shot of shots) {
    const searchText = getShotSearchableText(shot);
    let shotMatched = false;
    
    for (const [keyword, config] of Object.entries(VIEWPOINT_KEYWORDS)) {
      if (searchText.includes(keyword)) {
        shotMatched = true;
        
        if (!viewpointMap.has(config.id)) {
          viewpointMap.set(config.id, {
            id: config.id,
            name: config.name,
            nameEn: config.nameEn,
            shotIds: [shot.id],
            keyProps: [...config.propsZh],
            keyPropsEn: [...config.propsEn],
            description: '',
            descriptionEn: '',
            gridIndex: viewpointMap.size,
          });
        } else {
          const existing = viewpointMap.get(config.id)!;
          if (!existing.shotIds.includes(shot.id)) {
            existing.shotIds.push(shot.id);
          }
          for (const prop of config.propsZh) {
            if (!existing.keyProps.includes(prop)) {
              existing.keyProps.push(prop);
            }
          }
          for (const prop of config.propsEn) {
            if (!existing.keyPropsEn.includes(prop)) {
              existing.keyPropsEn.push(prop);
            }
          }
        }
      }
    }
    
    if (shotMatched) {
      matchedShotIds.add(shot.id);
    }
  }
  
  // 第二遍：将未Khớp的分镜归入「全景」góc nhìn
  const unmatchedShots = shots.filter(s => !matchedShotIds.has(s.id));
  if (unmatchedShots.length > 0) {
    if (!viewpointMap.has('overview')) {
      viewpointMap.set('overview', {
        id: 'overview',
        name: '全景',
        nameEn: 'Overview',
        shotIds: unmatchedShots.map(s => s.id),
        keyProps: [],
        keyPropsEn: [],
        description: '整体Bố cục không gian',
        descriptionEn: 'Overall spatial layout',
        gridIndex: viewpointMap.size,
      });
    } else {
      const overview = viewpointMap.get('overview')!;
      for (const shot of unmatchedShots) {
        if (!overview.shotIds.includes(shot.id)) {
          overview.shotIds.push(shot.id);
        }
      }
    }
  }
  
  // 按关联分镜数排序
  const viewpoints = Array.from(viewpointMap.values())
    .sort((a, b) => b.shotIds.length - a.shotIds.length);
  
  // 补充默认góc nhìn（全景和细节）
  const defaultViewpoints = [
    { id: 'overview', name: '全景', nameEn: 'Overview', keyProps: [] as string[], keyPropsEn: [] as string[], description: '整体Bố cục không gian', descriptionEn: 'Overall spatial layout' },
    { id: 'detail', name: '细节', nameEn: 'Detail View', keyProps: [] as string[], keyPropsEn: [] as string[], description: '细节Cực cận cảnh', descriptionEn: 'Detail close-up' },
  ];
  
  while (viewpoints.length < 6 && defaultViewpoints.length > 0) {
    const def = defaultViewpoints.shift()!;
    if (!viewpoints.some(v => v.id === def.id)) {
      viewpoints.push({
        ...def,
        shotIds: [],
        gridIndex: viewpoints.length,
      });
    }
  }
  
  viewpoints.forEach((v, i) => { v.gridIndex = i; });
  
  return viewpoints;
}

/**
 * 将góc nhìnnhóm为ảnh ghép页
 * 每页最多 6 góc nhìn
 */
export function groupViewpointsIntoPages(
  viewpoints: SceneViewpoint[],
  viewpointsPerPage: number = 6
): SceneViewpoint[][] {
  const pages: SceneViewpoint[][] = [];
  
  for (let i = 0; i < viewpoints.length; i += viewpointsPerPage) {
    const page = viewpoints.slice(i, i + viewpointsPerPage);
    // lạiphân bổ页内 gridIndex (0-5)
    page.forEach((v, idx) => { v.gridIndex = idx; });
    pages.push(page);
  }
  
  return pages;
}

/**
 * Tạoảnh ghép的提示词
 * 返回 PendingViewpointData 和 ContactSheetPromptSet 用于传递给场景库
 * 
 * bố cụcChọn逻辑：
 * - góc nhìn ≤ 6：Sử dụng 2x3 hoặc 3x2（1 张图）
 * - góc nhìn 7-9：Sử dụng 3x3（1 张图）
 * - góc nhìn > 9：分多张图
 */
export function generateMultiPageContactSheetData(
  config: ContactSheetConfig,
  shots: Shot[] // 用于获取分镜số thứ tự
): {
  viewpoints: PendingViewpointData[];
  contactSheetPrompts: ContactSheetPromptSet[];
} {
  const { scene, styleTokens, aspectRatio } = config;
  
  // 提取Tất cảgóc nhìn（传入场景地点进行环境lọc）
  const sceneLocation = scene.location || scene.name || '';
  const allViewpoints = extractAllViewpointsFromShots(config.shots, sceneLocation);
  
  // 根据góc nhìnsố lượng和宽高比Tự độngChọn最优bố cục
  // 强制Sử dụng NxN bố cục (2x2 hoặc 3x3) 以保证宽高比giống性，与 Director panelgiữgiống
  let gridLayout: { rows: number; cols: number };
  let viewpointsPerPage: number;
  
  const vpCount = allViewpoints.length;
  
  if (vpCount <= 4) {
    // 4 以内：Sử dụng 2x2
    gridLayout = { rows: 2, cols: 2 };
    viewpointsPerPage = 4;
  } else {
    // 超过 4 ：Sử dụng 3x3 (最多 9 一页)
    gridLayout = { rows: 3, cols: 3 };
    viewpointsPerPage = 9;
  }
  
  console.log('[ContactSheet] bố cụcChọn:', { vpCount, aspectRatio, gridLayout, viewpointsPerPage });
  
  // phân trang
  const pages = groupViewpointsIntoPages(allViewpoints, viewpointsPerPage);
  
  // 构建场景基础Mô tả
  const sceneDescEn = [
    scene.architectureStyle && `Architecture: ${scene.architectureStyle}`,
    scene.colorPalette && `Color palette: ${scene.colorPalette}`,
    scene.eraDetails && `Era: ${scene.eraDetails}`,
    scene.lightingDesign && `Lighting: ${scene.lightingDesign}`,
  ].filter(Boolean).join('. ');
  
  const sceneDescZh = [
    scene.architectureStyle && `Phong cách kiến trúc: ${scene.architectureStyle}`,
    scene.colorPalette && `色彩基调：${scene.colorPalette}`,
    scene.eraDetails && `thời đại特征：${scene.eraDetails}`,
    scene.lightingDesign && `光影Thiết kế：${scene.lightingDesign}`,
  ].filter(Boolean).join('，');
  
  const styleStr = styleTokens.length > 0 
    ? styleTokens.join(', ') 
    : 'anime style, soft colors, detailed background';
  
  // 构建分镜 ID 到số thứ tự的ánh xạ
  const shotIdToIndex = new Map<string, number>();
  shots.forEach(shot => {
    shotIdToIndex.set(shot.id, shot.index);
  });
  
  // Tạo PendingViewpointData
  const pendingViewpoints: PendingViewpointData[] = [];
  
  pages.forEach((pageViewpoints, pageIndex) => {
    pageViewpoints.forEach((vp, idx) => {
      // Tạogóc nhìnMô tả
      const propsZh = vp.keyProps.length > 0 ? `，chứa${vp.keyProps.join('、')}` : '';
      const propsEn = vp.keyPropsEn.length > 0 ? ` with ${vp.keyPropsEn.join(', ')}` : '';
      vp.description = `${vp.name}góc nhìn${propsZh}`;
      vp.descriptionEn = `${vp.nameEn} angle${propsEn}`;
      
      // 更新 gridIndex
      vp.gridIndex = idx;
      
      // 获取关联分镜的số thứ tự
      const shotIndexes = vp.shotIds
        .map(id => shotIdToIndex.get(id))
        .filter((idx): idx is number => idx !== undefined)
        .sort((a, b) => a - b);
      
      pendingViewpoints.push({
        id: vp.id,
        name: vp.name,
        nameEn: vp.nameEn,
        shotIds: vp.shotIds,
        shotIndexes,
        keyProps: vp.keyProps,
        keyPropsEn: vp.keyPropsEn,
        gridIndex: vp.gridIndex,
        pageIndex,
      });
    });
  });
  
  // Tạo每页的 ContactSheetPromptSet
  const contactSheetPrompts: ContactSheetPromptSet[] = pages.map((pageViewpoints, pageIndex) => {
    const totalCells = gridLayout.rows * gridLayout.cols;
    const paddedCount = totalCells;
    const actualCount = pageViewpoints.length;
    
    // 构建增强版提示词 — 对齐Đạo diễnpanel generateGridAndSlice 的3 lớp风格夹击Cấu trúc
    const promptParts: string[] = [];
    
    // 1. 核心指令区 (Instruction Block) — Sử dụng与Đạo diễnpanelgiống的 storyboard grid 术语
    promptParts.push('<instruction>');
    promptParts.push(`Generate a clean ${gridLayout.rows}x${gridLayout.cols} storyboard grid with exactly ${paddedCount} equal-sized panels.`);
    promptParts.push(`Overall Image Aspect Ratio: ${aspectRatio}.`);
    
    // 明确指定单格子的宽高比，防止 AI 混淆
    const panelAspect = aspectRatio === '16:9' ? '16:9 (horizontal landscape)' : '9:16 (vertical portrait)';
    promptParts.push(`Each individual panel must have a ${panelAspect} aspect ratio.`);
    
    // 全局Thị giác风格（前置到指令区，权重最高 — 3 lớp夹击第一层）
    if (styleStr) {
      promptParts.push(`MANDATORY Visual Style for ALL panels: ${styleStr}`);
    }
    
    promptParts.push('Structure: No borders between panels, no text, no watermarks, no speech bubbles.');
    promptParts.push('Consistency: Maintain consistent perspective, lighting, color grading, and visual style across ALL panels.');
    promptParts.push('Subject: Interior design and architectural details only, NO people.');
    promptParts.push('</instruction>');
    
    // 2. bố cụcMô tả
    promptParts.push(`Layout: ${gridLayout.rows} rows, ${gridLayout.cols} columns, reading order left-to-right, top-to-bottom.`);
    
    // 3. 场景thông tin
    if (sceneDescEn) {
      promptParts.push(`Scene Context: ${sceneDescEn}`);
    }
    
    // 4. 每格子的内容Mô tả — 每格附带 [same style] 锚定（3 lớp夹击第二层）
    const styleAnchor = styleStr ? ' [same style]' : '';
    pageViewpoints.forEach((vp, idx) => {
      const row = Math.floor(idx / gridLayout.cols) + 1;
      const col = (idx % gridLayout.cols) + 1;
      
      const content = vp.keyPropsEn.length > 0 
        ? `showing ${vp.keyPropsEn.join(', ')}` 
        : (vp.nameEn === 'Overview' ? 'wide shot showing the entire room layout' : `${vp.nameEn} angle of the room`);
      
      promptParts.push(`Panel [row ${row}, col ${col}] (no people): ${content}${styleAnchor}`);
    });
    
    // 5. 空白Placeholder格Mô tả
    for (let i = actualCount; i < paddedCount; i++) {
      const row = Math.floor(i / gridLayout.cols) + 1;
      const col = (i % gridLayout.cols) + 1;
      promptParts.push(`Panel [row ${row}, col ${col}]: empty placeholder, solid gray background`);
    }
    
    // 6. 全局风格尾部再次强调（3 lớp夹击第3 lớp）
    if (styleStr) {
      promptParts.push(`IMPORTANT - Apply this EXACT style uniformly to every panel: ${styleStr}`);
    }
    
    // 7. 负面提示词
    promptParts.push('Negative constraints: text, watermark, split screen borders, speech bubbles, blur, distortion, bad anatomy, people, characters, distorted grid, uneven panels.');
    
    const prompt = promptParts.join('\n');

    // đang xử lý...词
    const gridItemsZh = pageViewpoints.map((vp, i) => 
      `[${i + 1}] ${vp.name}：${vp.description}`
    ).join('\n');
    
    const promptZh = `一张精确的 ${gridLayout.rows}行${gridLayout.cols}列 lưới图（共 ${totalCells} 格子），Hiển thị同一「${scene.name || scene.location}」场景的不同góc nhìn。
${sceneDescZh}

${totalCells} 格子分别Hiển thị：${gridItemsZh}。

Quan trọng:
- 必须精确Tạo ${gridLayout.rows} 行 ${gridLayout.cols} 列，不能多也不能少。
- 这是一张干净的Tham chiếu图，图片上不要Thêm任何văn bảnGhi đè。
- 不要Thêm标签、标题、说明văn bản、hình mờhoặc任何类型的văn bản。

风格：${styleTokens.length > 0 ? styleTokens.join('、') : '动画风格，柔和色彩，细节丰富'}，Tất cả格子光照giống，格子之间用细白边框ngăn cách，只有背景，没有nhân vật。`;
    
    return {
      pageIndex,
      prompt,
      promptZh,
      viewpointIds: pageViewpoints.map(vp => vp.id),
      gridLayout,
    };
  });
  
  return {
    viewpoints: pendingViewpoints,
    contactSheetPrompts,
  };
}

/**
 * 从hiện có的 viewpoints dữ liệu构建ảnh ghépdữ liệu
 * 用于从剧本panel跳转到场景库时，Trực tiếpSử dụng AI 分析的góc nhìn
 * 
 * @param viewpoints - 来自 ScriptScene.viewpoints 的góc nhìndữ liệu
 * @param scene - 场景thông tin（用于Tạo提示词）
 * @param shots - 分镜列表（用于获取分镜số thứ tự）
 * @param styleTokens - 风格标记
 * @param aspectRatio - 宽高比
 */
export function buildContactSheetDataFromViewpoints(
  viewpoints: Array<{
    id: string;
    name: string;
    nameEn?: string;
    shotIds: string[];
    keyProps: string[];
    gridIndex: number;
  }>,
  scene: Pick<ScriptScene, 'name' | 'location' | 'architectureStyle' | 'lightingDesign' | 'colorPalette' | 'eraDetails' | 'visualPrompt' | 'visualPromptEn'>,
  shots: Shot[],
  styleTokens: string[],
  aspectRatio: '16:9' | '9:16' = '16:9'
): {
  viewpoints: PendingViewpointData[];
  contactSheetPrompts: ContactSheetPromptSet[];
} {
  // 根据góc nhìnsố lượngChọnbố cục
  const vpCount = viewpoints.length;
  let gridLayout: { rows: number; cols: number };
  let viewpointsPerPage: number;
  
  if (vpCount <= 4) {
    gridLayout = { rows: 2, cols: 2 };
    viewpointsPerPage = 4;
  } else {
    gridLayout = { rows: 3, cols: 3 };
    viewpointsPerPage = 9;
  }
  
  console.log('[buildContactSheetDataFromViewpoints] Sử dụng AI góc nhìn构建ảnh ghépdữ liệu:', {
    vpCount,
    gridLayout,
    viewpointsPerPage,
    // gỡ lỗi：场景美术Thiết kếtrường
    sceneFields: {
      name: scene.name,
      location: scene.location,
      architectureStyle: scene.architectureStyle,
      lightingDesign: scene.lightingDesign,
      colorPalette: scene.colorPalette,
      eraDetails: scene.eraDetails,
    },
  });
  
  // phân trang
  const pages: typeof viewpoints[] = [];
  for (let i = 0; i < viewpoints.length; i += viewpointsPerPage) {
    const page = viewpoints.slice(i, i + viewpointsPerPage);
    // lạiphân bổ页内 gridIndex (0-based)
    page.forEach((v, idx) => { (v as any).gridIndex = idx; });
    pages.push(page);
  }
  
  // 构建场景Mô tả（美术Thiết kếtrường）
  const sceneDescEn = [
    scene.architectureStyle && `Architecture: ${scene.architectureStyle}`,
    scene.colorPalette && `Color palette: ${scene.colorPalette}`,
    scene.eraDetails && `Era: ${scene.eraDetails}`,
    scene.lightingDesign && `Lighting: ${scene.lightingDesign}`,
  ].filter(Boolean).join('. ');
  
  const sceneDescZh = [
    scene.architectureStyle && `Phong cách kiến trúc: ${scene.architectureStyle}`,
    scene.colorPalette && `色彩基调：${scene.colorPalette}`,
    scene.eraDetails && `thời đại特征：${scene.eraDetails}`,
    scene.lightingDesign && `光影Thiết kế：${scene.lightingDesign}`,
  ].filter(Boolean).join('，');
  
  // Thị giác提示词（AI 场景Hiệu chuẩnTạo的详细场景Mô tả）
  const visualPromptZh = scene.visualPrompt || '';
  const visualPromptEn = scene.visualPromptEn || '';
  
  console.log('[buildContactSheetDataFromViewpoints] 场景Mô tả:', {
    sceneDescZh,
    sceneDescEn,
    visualPromptZh: visualPromptZh ? visualPromptZh.substring(0, 50) + '...' : '(无)',
    visualPromptEn: visualPromptEn ? visualPromptEn.substring(0, 50) + '...' : '(无)',
  });
  
  const styleStr = styleTokens.length > 0 
    ? styleTokens.join(', ') 
    : 'anime style, soft colors, detailed background';
  
  // 构建分镜 ID 到số thứ tự的ánh xạ
  const shotIdToIndex = new Map<string, number>();
  shots.forEach(shot => {
    shotIdToIndex.set(shot.id, shot.index);
  });
  
  // Tạo PendingViewpointData
  const pendingViewpoints: PendingViewpointData[] = [];
  
  pages.forEach((pageViewpoints, pageIndex) => {
    pageViewpoints.forEach((vp, idx) => {
      // 获取关联分镜的số thứ tự
      const shotIndexes = vp.shotIds
        .map(id => shotIdToIndex.get(id))
        .filter((idx): idx is number => idx !== undefined)
        .sort((a, b) => a - b);
      
      pendingViewpoints.push({
        id: vp.id,
        name: vp.name,
        nameEn: vp.nameEn || vp.name, // 如果没有Tên tiếng Anh，Sử dụng中文名
        shotIds: vp.shotIds,
        shotIndexes,
        keyProps: vp.keyProps,
        keyPropsEn: [], // 可能没有英文đạo cụ名，Để trống
        gridIndex: idx,
        pageIndex,
      });
    });
  });
  
  // Tạo每页的 ContactSheetPromptSet
  const contactSheetPrompts: ContactSheetPromptSet[] = pages.map((pageViewpoints, pageIndex) => {
    const totalCells = gridLayout.rows * gridLayout.cols;
    const paddedCount = totalCells;
    const actualCount = pageViewpoints.length;
    
    // 构建英文提示词 — 对齐Đạo diễnpanel3 lớp风格注入
    const promptParts: string[] = [];
    
    // 计算每格的宽高比Mô tả
    const panelAspect = aspectRatio === '16:9' ? '16:9 (horizontal landscape)' : '9:16 (vertical portrait)';
    
    promptParts.push('<instruction>');
    promptParts.push(`Generate a clean ${gridLayout.rows}x${gridLayout.cols} storyboard grid with exactly ${paddedCount} equal-sized panels.`);
    promptParts.push(`Overall Image Aspect Ratio: ${aspectRatio}.`);
    promptParts.push(`Each individual panel must have a ${panelAspect} aspect ratio.`);
    // Layer 1: MANDATORY 风格前置（instruction 区内，最高优先级）
    promptParts.push(`MANDATORY Visual Style for ALL panels: ${styleStr}`);
    promptParts.push('Structure: No borders between panels, no text, no watermarks, no speech bubbles.');
    promptParts.push('Consistency: Maintain consistent perspective, lighting, color grading, and visual style across ALL panels.');
    promptParts.push('Subject: Interior design and architectural details only, NO people.');
    promptParts.push('</instruction>');
    
    promptParts.push(`Layout: ${gridLayout.rows} rows, ${gridLayout.cols} columns, reading order left-to-right, top-to-bottom.`);
    
    if (sceneDescEn) {
      promptParts.push(`Scene Context: ${sceneDescEn}`);
    }
    
    // ThêmThị giác提示词（英文）
    if (visualPromptEn) {
      promptParts.push(`Visual Description: ${visualPromptEn}`);
    }
    
    // 每格子的内容Mô tả + Layer 2: 每格风格锚定
    pageViewpoints.forEach((vp, idx) => {
      const row = Math.floor(idx / gridLayout.cols) + 1;
      const col = (idx % gridLayout.cols) + 1;
      const vpNameEn = vp.nameEn || vp.name;
      const content = vp.keyProps.length > 0 
        ? `showing ${vp.keyProps.join(', ')}` 
        : (vpNameEn === 'Overview' || vp.name === '全景' ? 'wide shot showing the entire room layout' : `${vpNameEn} angle of the room`);
      
      promptParts.push(`Panel [row ${row}, col ${col}] (no people): ${content} [same style]`);
    });
    
    // 空白Placeholder格
    for (let i = actualCount; i < paddedCount; i++) {
      const row = Math.floor(i / gridLayout.cols) + 1;
      const col = (i % gridLayout.cols) + 1;
      promptParts.push(`Panel [row ${row}, col ${col}]: empty placeholder, solid gray background`);
    }
    
    // Layer 3: 尾部风格强调（首尾夹击）
    promptParts.push(`IMPORTANT - Apply this EXACT style uniformly to every panel: ${styleStr}`);
    promptParts.push('Negative constraints: text, watermark, split screen borders, speech bubbles, blur, distortion, bad anatomy, people, characters, distorted grid, uneven panels.');
    
    const prompt = promptParts.join('\n');
    
    // đang xử lý...词
    const gridItemsZh = pageViewpoints.map((vp, i) => {
      const content = vp.keyProps.length > 0 
        ? `Hiển thị${vp.keyProps.join('、')}` 
        : (vp.name === '全景' ? 'Hiển thị整Bố cục không gian的宽角度全景' : `${vp.name}góc nhìn`);
      return `[${i + 1}] ${vp.name}：${content}`;
    }).join('\n');
    
    const promptZh = `一张精确的 ${gridLayout.rows}行${gridLayout.cols}列 lưới图（共 ${totalCells} 格子），Hiển thị同一「${scene.name || scene.location}」场景的不同góc nhìn。
${sceneDescZh}${visualPromptZh ? `\n场景氛围：${visualPromptZh}` : ''}

${totalCells} 格子分别Hiển thị：
${gridItemsZh}

Quan trọng:
- 必须精确Tạo ${gridLayout.rows} 行 ${gridLayout.cols} 列，不能多也不能少。
- 这是一张干净的Tham chiếu图，图片上不要Thêm任何văn bảnGhi đè。
- 不要Thêm标签、标题、说明văn bản、hình mờhoặc任何类型的văn bản。

风格：${styleTokens.length > 0 ? styleTokens.join('、') : '动画风格，柔和色彩，细节丰富'}，Tất cả格子光照giống，格子之间用细白边框ngăn cách，只有背景，没有nhân vật。`;
    
    return {
      pageIndex,
      prompt,
      promptZh,
      viewpointIds: pageViewpoints.map(vp => vp.id),
      gridLayout,
    };
  });
  
  return {
    viewpoints: pendingViewpoints,
    contactSheetPrompts,
  };
}
