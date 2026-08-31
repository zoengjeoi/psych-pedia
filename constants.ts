import { Drug, Principle } from './types';

// ==========================================
// 0. DRUG CATEGORY ORDER (Top-down curated)
// 主流分类的展示顺序,侧栏与首页按此排序
// ==========================================
export const DRUG_CATEGORY_ORDER: string[] = [
  // 抗精神病药
  'FGA（典型抗精神病药）',
  'SGA（非典型抗精神病药）',
  '新型抗精神病药',
  // 抗抑郁药
  'SSRI（选择性5-羟色胺再摄取抑制剂）',
  'SNRI（5-羟色胺和去甲肾上腺素再摄取抑制剂）',
  'NDRI（去甲肾上腺素和多巴胺再摄取抑制剂）',
  'NRI（选择性去甲肾上腺素再摄取抑制剂）',
  'NaSSA（去甲肾上腺素和特异性5-羟色胺能抗抑郁药）',
  'SARI（5-HT2A拮抗/再摄取抑制剂）',
  'TCA（三环类抗抑郁药）',
  'SMS（5-羟色胺调制剂）',
  'SPARI（5-HT1A部分激动/再摄取抑制剂）',
  'SSRE（选择性5-羟色胺再摄取增强剂）',
  '褪黑素受体激动剂',
  // 抗焦虑与镇静催眠
  'BZD（苯二氮䓬类）',
  'Z-Drug（非苯二氮䓬类催眠药）',
  '抗焦虑药（5-HT1A受体部分激动剂）',
  'β受体阻滞剂',
  'α2受体激动剂',
  // 心境与抗癫痫
  '心境稳定剂',
  '抗癫痫药（心境辅助）',
  // ADHD
  'ADHD 中枢兴奋剂',
  'ADHD 非兴奋剂',
  // 认知与疼痛
  '促认知药（抗痴呆）',
  '慢性疼痛辅助药',
  // 复方
  '复方制剂（抗抑郁+抗精神病）'
];

// ==========================================
// A. GENERAL PRINCIPLES DB (The Encyclopedia)
// ==========================================
// NOTE: PRINCIPLES are now loaded dynamically from public/principles.json
// This empty array is kept for type compatibility
export const PRINCIPLES: Principle[] = [];

// ==========================================
// B. DRUGS DB (Content)
// ==========================================
export const DRUGS: Drug[] = [
  {
    id: "aripiprazole",
    name_cn: "阿立哌唑",
    name_en: "Aripiprazole",
    category: "SGA - 部分激动剂",
    tags: ["D2部分激动剂", "不镇静", "代谢友好"],
    stahl_radar: {
      labels: ["D2", "5HT1A", "5HT2A", "H1", "M1"],
      values: [9.5, 8.0, 8.5, 2.0, 0.5],
      link_ids: ["d2", "5ht1a", "5ht2a", "h1", "m1"]
    },
    pearls: [
      {
        title: "激越风险 (Akathisia)",
        type: "danger",
        content: "启动初期或加量过快时，约10-15%患者出现静坐不能。常被误诊为病情恶化或激越。建议联用普萘洛尔或苯二氮卓类。"
      },
      {
        title: "激活效应",
        type: "info",
        content: "由于5HT1A和D2部分激动作用，具有振奋效果，建议早晨服用。特别适合伴有嗜睡、精神运动性迟滞的患者。"
      },
      {
        title: "代谢安全",
        type: "success",
        content: "在SGA中体重增加和血脂异常风险最低。适合年轻女性或关注体重的患者。"
      },
       {
        title: "高泌乳素解药",
        type: "success",
        content: "由于其D2部分激动特性，可用于逆转利培酮或氨磺必利引起的高泌乳素血症。"
      }
    ],
    pk_data: {
      half_life: "75h (脱氢活性代谢物94h)",
      protein_binding: ">99%",
      metabolism: "CYP2D6, CYP3A4",
      peak_time: "3-5h"
    },
    market_info: {
      price: "$$ (国产/进口均有)",
      insurance: "甲类医保",
      pregnancy: "C类 (权衡利弊)"
    }
  },
  {
    id: "olanzapine",
    name_cn: "奥氮平",
    name_en: "Olanzapine",
    category: "SGA - 多受体阻断剂",
    tags: ["强效", "镇静", "代谢高危"],
    stahl_radar: {
      labels: ["D2", "5HT2A", "H1", "M1", "5HT2C"],
      values: [8.0, 9.8, 9.5, 8.5, 9.0],
      link_ids: ["d2", "5ht2a", "h1", "m1", "5ht2c"]
    },
    pearls: [
      {
        title: "代谢综合征红灯",
        type: "danger",
        content: "SGA中致肥胖、糖尿病风险最高。阻断H1和5HT2C导致食欲大增。必须监测腰围、血糖、血脂。"
      },
      {
        title: "急性期金标准",
        type: "success",
        content: "起效快，镇静作用强，控制急性躁狂和严重精神病性症状效果显著。难治性精神分裂症的二线选择(仅次于氯氮平)。"
      },
      {
        title: "吸烟相互作用",
        type: "warning",
        content: "主要经CYP1A2代谢。吸烟诱导该酶，可使血药浓度降低约50%。住院患者(强制戒烟)出院后(复吸)需调整剂量。"
      }
    ],
    pk_data: {
      half_life: "30-33h",
      protein_binding: "93%",
      metabolism: "CYP1A2 (主), CYP2D6",
      peak_time: "6h"
    },
    market_info: {
      price: "$ (集采品种)",
      insurance: "甲类医保",
      pregnancy: "C类 (慎用)"
    }
  },
  {
    id: "quetiapine",
    name_cn: "喹硫平",
    name_en: "Quetiapine",
    category: "SGA - 多受体阻断剂",
    tags: ["镇静", "低EPS", "抗焦虑"],
    stahl_radar: {
      labels: ["D2", "5HT2A", "H1", "Alpha1", "M1"],
      values: [3.0, 6.0, 9.0, 7.5, 2.0],
      link_ids: ["d2", "5ht2a", "h1", "alpha1", "m1"]
    },
    pearls: [
      {
        title: "剂量依赖效应",
        type: "warning",
        content: "小剂量(<100mg)主要阻断H1，仅助眠；中剂量(300mg+)抗抑郁；大剂量(600-800mg)才具有抗精神病D2阻断作用。"
      },
      {
        title: "帕金森友好",
        type: "success",
        content: "与D2受体结合疏松(快解离)，几乎不引起EPS。是帕金森病精神病症状的首选药物。"
      },
       {
        title: "体位性低血压",
        type: "danger",
        content: "强效阻断Alpha1受体。老年患者需缓慢加量，防止晕厥跌倒。"
      }
    ],
    pk_data: {
      half_life: "6-7h (需缓释剂型)",
      protein_binding: "83%",
      metabolism: "CYP3A4",
      peak_time: "1.5h (IR)"
    },
    market_info: {
      price: "$",
      insurance: "甲类医保",
      pregnancy: "C类"
    }
  },
  {
    id: "flupentixol",
    name_cn: "氟哌啶醇",
    name_en: "Flupentixol",
    category: "FGA - 高亲和性D2受体阻断剂",
    tags: ["强效", "抗幻觉", "EPS"],
    stahl_radar: {
      labels: ["D2", "5HT2A", "H1", "M1", "5HT2C"],
      values: [8.0, 0, 0, 0, 0],
      link_ids: ["d2", "5ht2a", "h1", "m1", "5ht2c"]
    },
    pearls: [
      {
        title: "椎体外系反应高发",
        type: "danger",
        content: "高亲和性D2阻断剂，EPS发生率高达30-40%。预防首选抗胆碱能药物，如苯海索。"
      },
      {
        title: "泌乳素升高",
        type: "warning",
        content: "阻断结节漏斗通路D2受体，易引起高泌乳素血症。女性患者需定期监测月经异常和乳溢。"
      },
      {
        title: "恶性综合征",
        type: "danger",
        content: "高D2阻断作用可能诱发神经阻滞剂恶性综合征(NMS)。出现高热、肌强直、意识障碍时需紧急处理。给予溴隐亭、丹曲林和物理降温"
      }
    ],
    pk_data: {
      half_life: "18-35h",
      protein_binding: "99%",
      metabolism: "CYP3A4, CYP2D6",
      peak_time: "2-6h"
    },
    market_info: {
      price: "$ (集采品种)",
      insurance: "甲类医保",
      pregnancy: "C类 (慎用)"
    }
  },
];