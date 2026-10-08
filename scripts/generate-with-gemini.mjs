#!/usr/bin/env node
/**
 * Gemini 词条生成器（PsychPedia v2 架构）
 *
 * 与旧版的区别：直接读写 src/content/drugs/*.md，不再产生任何 JSON。
 * 重写正文时 frontmatter 逐字保留（写盘前自动备份到 v2/.backups/）。
 *
 * 用法：
 *   npm run generate -- <药物id> [<药物id> ...]     重写指定词条的正文（frontmatter 保留）
 *   npm run generate -- --all                        补齐正文缺失/不完整的词条（跳过完整的）
 *   npm run generate -- --all --force                全部重写
 *   npm run generate -- --new 中文名 [英文名]         AI 新建整条药物词条（frontmatter + 正文）
 *   npm run generate -- --new 名1 名2 名3             一次新建/覆盖多个词条（英文名由 AI 推断）
 *   npm run generate -- --new 阿立哌唑 --force        同名词条整体覆盖重写（frontmatter+正文，旧文件自动备份）
 *   npm run generate -- --receptor 受体名 [--id=xx]    AI 新建/覆盖受体词条（结构化 frontmatter + 自由正文）
 *                                                     关联药物自动从现有药物库校验回填（点击可跳转词条）
 *
 * 选项：
 *   --dry-run       只打印生成结果与校验结论，不写盘
 *   --mock[=变体]   不调用 API，用内置样例走完整流程（good|bad|short|latex；自测用）
 *   --lenient       校验不通过时仍然写盘（默认拒绝写盘）
 *   --yes           跳过确认（供批处理脚本调用）
 *   --force          --new 模式下：同名词条整体覆盖重写（旧文件备份到 .backups/）
 *   --delay=3000    每个词条之间的间隔毫秒数（默认 3000）
 *   --model=xxx     覆盖模型（也可用 .env 的 GEMINI_MODEL）
 *   --id=xxx        新建模式：显式指定词条 id
 *
 * .env 可配置项（词条生成相关）：
 *   GEMINI_API_KEY        密钥（只在本脚本进程内使用，任何 AI/第三方都接触不到）
 *   GEMINI_MODEL          生成模型（默认 gemini-3.8-flash）
 *   GEMINI_BASE_URL       可选，Gemini 兼容中转地址（SDK httpOptions.baseUrl）
 *   GEMINI_TEMPERATURE    可选，采样温度（默认 0.15；要更稳可设 0-0.1）
 *   GEMINI_REVIEW_MODEL   可选，审稿模型（双 AI 流水线：生成 → 审稿挑刺 → 回喂修复一轮）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { loadEnv } from './image-upload-lib.mjs';
import { drugSchema, principleSchema } from '../src/lib/content-schema.mjs';
import { DRUG_CATEGORY_ORDER } from '../src/lib/taxonomy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(ROOT);

const DRUGS_DIR = path.join(ROOT, 'src', 'content', 'drugs');
const PRINCIPLES_DIR = path.join(ROOT, 'src', 'content', 'principles');
const BACKUP_DIR = path.join(ROOT, '.backups');

const API_KEY = process.env.GEMINI_API_KEY || '';
// 默认用 flash：实测（阿米替林/托莫西汀对照 pro）结构、表格、行文风格已对齐现有词条，
// 单次约 40-50s（pro 约 68s），单价更低。需要更深内容时可用 --model=gemini-3.1-pro-preview 或改 .env。
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
// 可选：Gemini 兼容中转/代理地址（SDK 的 httpOptions.baseUrl）。留空 = 直连 Google 官方
const BASE_URL = process.env.GEMINI_BASE_URL || '';
// 采样温度（默认 0.15；追求更稳定的输出可在 .env 调到 0-0.1）
const TEMPERATURE = Number.isFinite(Number(process.env.GEMINI_TEMPERATURE))
  ? Number(process.env.GEMINI_TEMPERATURE)
  : 0.15;
// 可选：审稿模型（双 AI 流水线——生成模型写完后由它挑刺，问题回喂给生成模型修复一轮）。
// 留空 = 只用程序化校验（章节结构/字数/雷达图绑定等）。设置后审核模型也看不到任何密钥，密钥只在本脚本进程内使用
const REVIEW_MODEL = process.env.GEMINI_REVIEW_MODEL || '';
// 可选：审核阶段接入 Google Search Grounding（核实批准状态/指南新近性）。'1' = 审稿时启用搜索工具；
// CLI --search 等效。写作模型保持离线（写稿不需要检索，检索的判断交给审核）
const GROUNDING = process.env.GEMINI_GROUNDING === '1';

const SECTIONS = [
  '## 概况',
  '## 临床适应症',
  '## 药物代谢和服药方式',
  '## 药物机制',
  '## 代谢途径和药物相互作用',
  '## 不良反应',
  '## 指南定位',
  '## 理想病人',
  '## 患者教育',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 营销式用语（warning 级：不阻断出稿，打印并附进修复循环）。金标准/一线等在指南有据时
// 可保留，由人复核，所以不做 error。
const HYPE_RE = /卓越|完美|彻底改变|革命性|里程碑|划时代|强效逆转|独一无二|金标准|最佳拍档|绝对安全/g;

// 本次运行的 token 用量（用于对比不同模型的成本）
const usage = { calls: 0, prompt: 0, candidates: 0, thoughts: 0, ms: 0 };

/* ------------------------------------------------------------------ */
/* 参数解析                                                            */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const opts = {
    all: false,
    force: false,
    newEntry: false,
    receptorEntry: false,
    dryRun: false,
    dump: false,
    lenient: false,
    yes: false,
    delay: 3000,
    model: DEFAULT_MODEL,
    id: '',
    mock: null,
    search: false,
    testSearch: false,
    positional: [],
  };
  for (const arg of argv) {
    if (arg === '--all') opts.all = true;
    else if (arg === '--force') opts.force = true;
    else if (arg === '--new') opts.newEntry = true;
    else if (arg === '--receptor') opts.receptorEntry = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--dump') opts.dump = true;
    else if (arg === '--lenient') opts.lenient = true;
    else if (arg === '--yes') opts.yes = true;
    else if (arg === '--search') opts.search = true;
    else if (arg === '--test-search') opts.testSearch = true;
    else if (arg.startsWith('--mock')) {
      const variant = arg.includes('=') ? arg.split('=')[1] : 'good';
      opts.mock = variant || 'good';
    } else if (arg.startsWith('--delay=')) opts.delay = Number(arg.split('=')[1]) || 3000;
    else if (arg.startsWith('--model=')) opts.model = arg.split('=')[1] || DEFAULT_MODEL;
    else if (arg.startsWith('--id=')) opts.id = arg.split('=')[1] || '';
    else if (arg.startsWith('--')) console.warn(`⚠️  忽略未知参数：${arg}`);
    else opts.positional.push(arg);
  }
  return opts;
}

/* ------------------------------------------------------------------ */
/* 内容读写                                                            */
/* ------------------------------------------------------------------ */

const FM_RE = /^(---\r?\n[\s\S]*?\r?\n---)([\s\S]*)$/;

/** 解析 md：frontmatter 原文、正文、frontmatter 与正文之间的空白、行尾风格 */
function parseEntry(src) {
  const m = src.match(FM_RE);
  if (!m) throw new Error('缺少 frontmatter（--- 包裹的头部）');
  const frontmatterRaw = m[1];
  const after = m[2];
  const gap = (after.match(/^\s*/) || [''])[0];
  const data = matter(src).data;
  return {
    frontmatterRaw,
    gap,
    data,
    body: after.trim(),
    eol: src.includes('\r\n') ? '\r\n' : '\n',
    endsWithNewline: src.endsWith('\n'),
  };
}

/** 由 frontmatterRaw + 新正文重新拼出完整文件（保持原有空白与行尾风格） */
function rebuild(entry, newBody) {
  const body = newBody.trim().split(/\r?\n/).join(entry.eol);
  const tail = entry.endsWithNewline ? entry.eol : '';
  return entry.frontmatterRaw + entry.gap + body + tail;
}

/** 扫描 src/content/drugs，返回 { id -> {file, raw, entry} } */
function loadDrugEntries() {
  const map = new Map();
  for (const file of fs.readdirSync(DRUGS_DIR)) {
    if (!file.endsWith('.md')) continue;
    const full = path.join(DRUGS_DIR, file);
    const raw = fs.readFileSync(full, 'utf-8');
    try {
      const entry = parseEntry(raw);
      const id = String(entry.data.id ?? '').trim();
      if (id) map.set(id, { file: full, fileName: file, raw, entry });
    } catch (error) {
      console.warn(`⚠️  跳过无法解析的文件 ${file}：${error.message}`);
    }
  }
  return map;
}

const loadPrincipleIds = () => {
  const ids = new Set();
  for (const file of fs.readdirSync(PRINCIPLES_DIR)) {
    if (!file.endsWith('.md')) continue;
    try {
      const data = matter(fs.readFileSync(path.join(PRINCIPLES_DIR, file), 'utf-8')).data;
      if (data.id) ids.add(String(data.id));
    } catch {
      /* 忽略解析失败 */
    }
  }
  return ids;
};

const sectionCount = (body) =>
  SECTIONS.filter((s) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(body)).length;

const isIncomplete = (body) => sectionCount(body) < SECTIONS.length || body.length < 1500;

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */

const buildBodyPrompt = ({ data, existingBody, reference }) => `你是一位精神药理学专家，为精神科药物百科撰写高质量、医学严谨的条目。

**任务**: 为药物 **${data.name_cn}（${data.name_en}）** 撰写完整的词条正文。

**药物基本信息**:
- 中文名: ${data.name_cn}
- 英文名: ${data.name_en}
- 分类: ${(data.categories || (data.category ? [data.category] : [])).join('、')}
- 标签: ${(data.tags || []).join('、')}
- 药代动力学: ${JSON.stringify(data.pk_data ?? {}, null, 2)}
- 市场信息: ${JSON.stringify(data.market_info ?? {}, null, 2)}
${existingBody ? `\n**现有内容（供参考，可保留其中准确的部分，但需补全为完整 9 章节）**:\n${existingBody.slice(0, 800)}...\n` : ''}
**必须包含的 9 个章节**（严格按此顺序、标题逐字一致）：

## 概况
药物开发历史、上市时间、临床地位与里程碑、当前使用现状。（约 300-400 字）

## 临床适应症
用 Markdown 表格呈现（批准情况用 ✅/❌）：

| 适应症 | NMPA批准 | FDA批准 | EMA批准 | 证据等级 | 备注 |
|--------|----------|---------|---------|----------|------|

包括：批准的适应症、常见超说明书用法、特殊人群适应症。

**批准列的硬规则（极易出错，务必遵守）**：
- 三列必须分别以各自官方说明书为准：NMPA 列 = NMPA 批准的中文说明书；FDA 列 = 美国说明书；EMA 列 = 欧盟 SmPC。
- **中国说明书通常比 FDA 保守得多，绝不要把 FDA 的适应症默认当作中国也已批准**。典型错误：舍曲林在中国只获批抑郁症和强迫症，却被标成惊恐障碍、PTSD 也已批准。
- 吃不准的批准状态**用 ❔ 并加 [需核实]**，宁缺毋滥——把未批准的写成 ✅ 是严重错误。
- 某适应症在某地区未获批但在中国属公认超说明书用法（尤其被《广东省药学会超药品说明书用药目录》等权威目录收录）时：该列填 ❌，备注写明"超说明书用法"及目录来源。

## 药物代谢和服药方式

### 表1: 剂型与用法用量

| 剂型 | 规格 | 起始剂量 | 目标剂量 | 最大剂量 | 服用时间 | 特殊说明 |
|------|------|----------|----------|----------|----------|----------|

### 表2: 药代动力学参数

| 参数 | 数值 | 临床意义 |
|------|------|----------|
| 生物利用度 | ... | ... |
| 达峰时间 | ... | ... |
| 半衰期 | ... | ... |
| 蛋白结合率 | ... | ... |
| 分布容积 | ... | ... |
| 稳态时间 | ... | ... |

## 药物机制
受体结合谱（受体名用 HTML 下标：5-HT<sub>2A</sub>、D<sub>2</sub>、H<sub>1</sub> 等）、作用机制、与疗效/副作用的关联。

**本章节开头先放「受体结合谱 Ki 表格」，再写机制叙述**。表格必须**受体做列头、指标做行**（只占 3 行，紧凑优先）：

### 受体结合谱（Ki）

| 受体 | D<sub>2</sub> | 5-HT<sub>2A</sub> | 5-HT<sub>7</sub> | … |
|------|------|------|------|------|
| Ki (nM) | 0.34 | 26 | 39 | … |
| 作用类型 | 部分激动 | 拮抗 | 弱拮抗 | … |

- 覆盖正文与雷达图讨论到的**全部受体**，按临床意义从左到右排序，**最多 10 个**（其余受体在叙述文字中补充，不要把表格挤得过宽）；
- Ki 采用体外受体结合实验的公开文献值（如 PDSP 数据库、药品说明书），保留 1-2 位有效数字，单位 nM；
- 无可靠公开数据的受体**必须照样列出**：Ki 填「无数据」，作用类型按已知药理学填写或「无数据」，**严禁编造数值**；
- 把握不足的数值加 [需核实]。

表格下方**紧跟**这一行灰色小字注释（HTML 逐字照用，分级阈值不得改动）：

<p class="ki-note">注：K<sub>i</sub> 为解离常数，数值越小亲和力越强——小于 1 nM 为极高亲和力，1–10 nM 为高，10–100 nM 为中等，100–1000 nM 为低，大于 1000 nM 通常无实际结合意义；「无数据」表示暂无可靠的实验室公开数据。作用类型指药物在受体的内在活性：完全激动、部分激动、拮抗、反向激动等。</p>

然后是机制叙述（约 300-500 字）：受体结合谱如何转化为疗效与副作用、各受体的激动/拮抗与临床表现的关联。

## 代谢途径和药物相互作用

### 代谢途径表

| CYP酶 | 作用类型 | 临床意义 |
|-------|----------|----------|
| CYP2D6 | 主要/次要代谢 | ... |

### 重要药物相互作用

| 联合用药 | 相互作用机制 | 临床后果 | 处理建议 |
|----------|--------------|----------|----------|

## 不良反应

### ⚠️ 黑框警告
（如有；无则写明"无黑框警告"并简述原因）

### 常见不良反应 (>10%)
（逐条列出：反应名称 (发生率%) — 机制 — 处理建议）

### 偶见不良反应 (1-10%)

### 罕见但严重不良反应 (<1%)

### 监测要求表

| 监测项目 | 基线 | 随访频率 | 异常处理 |
|----------|------|----------|----------|

## 指南定位
该药在中国指南、NICE、APA 等中的推荐地位（一线/二线/三线、特定人群、更新历史）。（约 200-300 字）

## 理想病人

| 维度 | 理想特征 |
|------|----------|
| 诊断特征 | ... |
| 症状特征 | ... |
| 代谢特征 | ... |
| 合并症 | ... |
| 既往治疗 | ... |
| 用药依从性 | ... |

## 患者教育
以 FAQ 形式给出 6-10 个患者常见问题：**Q1: ...** 换行 A: 详细回答（起效时间、疗程、能否骤停、副作用、合并用药、饮食要求等，按药物特点调整）。

---

**写作要求与防幻觉指令（CRITICAL）**：

1. **零幻觉**：必须基于 Stahl's Essential Psychopharmacology、Maudsley 处方指南、FDA/NMPA 说明书、《中国精神分裂症/抑郁障碍/双相障碍防治指南》。严禁捏造精确数值（如生物利用度百分比、半衰期小时数）；无法确证的数据必须用区间值或标注 [需核实]。严禁发明不存在的适应症或相互作用。
2. **格式**：纯 Markdown；受体名用 HTML 下标；**绝对禁止任何 LaTeX（$ 或 $$）**；不要输出代码块（\`\`\`）；不要写一级标题（# 标题由站点生成）；正文中**不要**手工添加词条链接——受体与酶名称由站点自动识别并链接。
3. **结构（重要）**：正文只允许出现上面列出的那些 \`##\` 与 \`###\` 标题，**不要自行添加额外的 Markdown 标题**——像「### 1. 机制概述」这类编号小标题一律不要（站点的左侧目录会收录所有 Markdown 标题，多出来的层级会与其他词条不一致）。章节内部请沿用站内既有写法：用**加粗小标题**（例如 \`**1. 核心抗抑郁机制：单胺再摄取抑制**\`）配合要点列表来组织内容，而不是新增标题层级。
4. **段落风格**：与站内现有词条保持一致——每个章节写成 2-4 个简短自然段（每段约 100-180 字），避免动辄 300 字以上的长段落；干货优先，不要注水凑字数。
5. **列表紧凑**：有序/无序列表条目内部不要换行分段、条目之间不要留空行（站点渲染会把空行分隔的列表变成松散列表，导致序号错行）。
6. **长度**：总字数 2500-3500 字，每章节充实、纯干货。
7. **语言**：专业客观的医学中文；药物名与受体名保留英文；避免"可能""也许"等模棱两可表述，除非医学上确实未定论。
8. **循证措辞**：机制推导出的临床获益必须写"理论上/有望/厂商宣称"，不得写成既成临床事实；禁用"卓越/完美/彻底改变/革命性/金标准"等营销式形容词——临床试验数据能说话的地方让数据说话，没有数据就别拔高。

**参考示例**（已完成的高质量条目节选）：

${reference}

---

现在请为 ${data.name_cn}（${data.name_en}）输出完整的 9 章节正文（纯 Markdown，不要任何前言、结语或代码块标记）。`;

const buildFrontmatterPrompt = ({ nameCn, nameEn, principleIds }) => `你是精神药理学专家。请为药物 **${nameCn}${nameEn ? `（${nameEn}）` : ''}** 输出**严格的 JSON**（不要 Markdown、不要代码块），用于本站词条的 frontmatter。

字段与约束：
{
  "name_en": "英文通用名（小写首字母大写风格，如 Olanzapine）",
  "categories": ["从下面【分类清单】中逐字选取 1-3 个"],
  "tags": ["3-5 个中文短标签，如 镇静、低EPS、代谢友好"],
  "stahl_radar": {
    "labels": ["4-8 个药理靶点——只纳入临床意义明确的靶点（亲和力显著且对该药的安全性或疗效有实际影响）；亲和力弱、临床意义不明确的靶点不要勉强凑数，雷达图宁精勿杂"],
    "values": [与 labels 一一对应的 0-10 数字（10 = 亲和力最高）],
    "link_ids": [与 labels 一一对应的受体 id，只能取下面的【受体 id 清单】]
  },
  "pearls": [
    { "title": "短标题", "type": "danger|warning|success|info", "content": "60-120 字的临床实战要点" }
  ],
  "pk_data": {
    "half_life": "如 30-33h（不确定则 [需核实]）",
    "protein_binding": "如 93%",
    "metabolism": "如 CYP1A2（主）, CYP2D6",
    "peak_time": "如 6h"
  },
  "market_info": {
    "price": "用 $ / $$ / $$$ 表示，可加注（如：$ (集采品种)）",
    "insurance": "甲类医保 / 乙类医保 / 自费",
    "pregnancy": "A类 / B类 / C类 / D类，可加注（如：C类 (慎用)）"
  }
}

【分类清单】（categories 只能逐字取自这里）：
${DRUG_CATEGORY_ORDER.map((c) => `- ${c}`).join('\n')}

【受体 id 清单】（link_ids 只能取自这里，共 ${principleIds.size} 个）：
${Array.from(principleIds).sort().join(', ')}

要求：
- pearls 3-4 条，类型分布合理（至少 1 条 danger 或 warning）。
- 靶点选择以 Stahl 受体结合谱为准：凡亲和力或临床意义显著的受体都应纳入，包括 α1、5HT7 这类常被忽略的靶点（上限 8 个，按临床意义排序）。
- 靶点亲和力请依据 Stahl 受体结合谱；把握不大的数值给 0-10 的合理估计，不要留空。
- 任何无法确证的精确数值用 "[需核实]" 标注，不要编造。
- 只输出 JSON 本身。`;

/** 校验未通过时的修复提示：把具体问题回喂给模型，要求完整重出 */
const buildRepairPrompt = ({ data, previous, errors, kind = 'drug' }) => {
  const isDrug = kind !== 'receptor';
  const name = isDrug
    ? `药物 **${data.name_cn}（${data.name_en}）**`
    : `受体词条 **${data.title}（${data.subtitle ?? ''}）**`;
  const hardRules = isDrug
    ? `- 必须包含且仅包含以下 9 个章节，标题逐字一致、顺序一致：${SECTIONS.join(' / ')}
- 药物机制章节开头的受体 Ki 表格，与其下方 <p class="ki-note"> 注释行必须保留（若上一稿包含）
- 纯 Markdown；禁止 LaTeX（$ 或 $$）；禁止代码围栏（\`\`\`）；禁止一级标题（# ）
- 受体名用 HTML 下标（如 5-HT<sub>2A</sub>）
- 总字数 2500-3500 字`
    : `- 保持受体的自由百科结构（### 小节可保留）；禁止一级标题（# ）、代码围栏（\`\`\`）、LaTeX（$）
- 受体名用 HTML 下标（如 5-HT<sub>2A</sub>）
- 总字数 800-2500 字`;
  return `你上一次为${name}输出的词条正文未通过自动校验/审稿。

**必须修正的问题**：
${errors.map((e) => `- ${e}`).join('\n')}

**硬性要求（再强调）**：
${hardRules}

请**重新输出完整正文**（不要解释、不要道歉、不要代码块标记）。

上一次的输出如下（在此基础上修正，不要把已经正确的内容改坏）：

${previous.slice(0, 6000)}`;
};

/* ------------------------------------------------------------------ */
/* 模型调用（含重试与 mock）                                           */
/* ------------------------------------------------------------------ */

async function callGemini(prompt, { json = false, model, search = false } = {}) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({
    apiKey: API_KEY,
    ...(BASE_URL ? { httpOptions: { baseUrl: BASE_URL } } : {}),
  });
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const started = Date.now();
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: TEMPERATURE,
          topP: 0.8,
          maxOutputTokens: 24000,
          // grounding 与 responseMimeType 不兼容：搜索模式靠宽容解析提取 JSON
          ...(json && !search ? { responseMimeType: 'application/json' } : {}),
          ...(search ? { tools: [{ googleSearch: {} }] } : {}),
        },
      });
      const text = (typeof res.text === 'string' ? res.text : '') || '';
      if (!text.trim()) throw new Error('模型返回了空内容');
      if (search) {
        const queries = res.candidates?.[0]?.groundingMetadata?.webSearchQueries ?? [];
        if (queries.length) console.log(`   🔎 审稿检索：${queries.slice(0, 4).join('；')}`);
      }
      const u = res.usageMetadata ?? {};
      usage.calls += 1;
      usage.prompt += u.promptTokenCount ?? 0;
      usage.candidates += u.candidatesTokenCount ?? 0;
      usage.thoughts += u.thoughtsTokenCount ?? 0;
      usage.ms += Date.now() - started;
      return text;
    } catch (error) {
      lastError = error;
      const retriable = /429|500|502|503|504|rate|quota|overload|timeout|ETIMEDOUT|fetch failed|ECONNRESET/i.test(
        String(error?.message ?? error)
      );
      if (!retriable || attempt === 3) break;
      const wait = attempt === 1 ? 3000 : 8000;
      console.log(`   ⏳ 调用失败（${String(error?.message ?? error).slice(0, 70)}），${wait / 1000}s 后重试…`);
      await sleep(wait);
    }
  }
  throw lastError;
}

/** mock 模式：不调用 API，用现有词条内容走完整管线（自测用） */
function mockBody(variant, referenceBody) {
  if (variant === 'short') return '## 概况\n\n测试用短文本，故意不足长度。';
  if (variant === 'latex') return `${referenceBody}\n\n补充公式 $E = mc^2$ 用于测试。`;
  if (variant === 'bad') {
    return `## 概况\n\n${'这是一段故意缺少其它章节的测试文本。'.repeat(120)}`;
  }
  return referenceBody;
}

const parseJsonBlock = (text) => {
  const cleaned = text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // grounding 模式下没有 responseMimeType，模型可能混入叙述文字：提取首个 {...} 块
    const m = String(text).match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('返回内容中找不到 JSON');
  }
};

/* ------------------------------------------------------------------ */
/* 校验                                                                */
/* ------------------------------------------------------------------ */

/** 审稿提示（双 AI 流水线）：由审稿模型挑出真问题，回喂给生成模型修复。
 *  药物 data 传 name_cn/name_en/pk_data，受体 data 传 title/subtitle，两者兼容。 */
const buildReviewPrompt = ({ data, body }) => {
  const cn = data.name_cn ?? data.title ?? '';
  const en = data.name_en ?? data.subtitle ?? '';
  const fm = data.name_cn
    ? JSON.stringify({ tags: data.tags, pearls: data.pearls?.map((p) => p.title) }, null, 1)
    : JSON.stringify({ description: data.description }, null, 1);
  return `你是精神科临床药师兼循证医学审稿人，正在审阅本站词条《${cn}（${en}）》的草稿。这是给临床医生看的药理学速查百科，立场是循证、中立、去营销化。

frontmatter 摘要（${fm}）

只挑真问题，不吹毛求疵，但以下四类必须逐条对照检查：

**A.【硬伤】**
1. 内部矛盾：正文与关键参数${data.pk_data ? `（半衰期 ${data.pk_data.half_life ?? '—'}、蛋白结合率 ${data.pk_data.protein_binding ?? '—'}）` : ''}互相打架；
2. 剂量红线：超过该药已知最大剂量的推荐、明显错误的给药途径；
3. 受体/机制描述与该靶点已知药理学明显冲突。

**B.【循证】**
4. 地位断言：出现"首选/一线/金标准/最佳/标准治疗"时，必须有指南推荐或头对头 RCT/荟萃分析支撑。同类药物之间（各 SSRI 之间、各 SGA 之间）没有优效证据时，不得写谁优于谁——典型错误示例：说某 SSRI 是强迫症"首选"，但指南并未首选推荐它，Meta 分析也不显示它比其他 SSRI 更强；
5. 机制当事实：把受体药理推论写成既成临床结局。典型错误示例："拮抗 5-HT3 因而对冲了胃肠道反应、消化道不良反应极轻微"——伏硫西汀的恶心发生率实际约 20%，并不低于普通 SSRI。机制推论必须用"理论上/有望/厂商宣称"措辞；已知试验数据与理论预期相反时必须如实指出。

**C.【hype】**
6. 营销式用语："卓越/完美/彻底改变/革命性/里程碑/强效逆转/独一无二/金标准"等——药企发布会语言不许出现在医生查的词条里，要求改为具体数据或中性表述（有指南/文献确凿支持的金标准除外，如氯氮平之于难治性精神分裂症、锂盐之于双相维持）。

**D.【过时与批准状态】**
7. **「临床适应症」表格的三列（NMPA/FDA/EMA）逐行核对**：中国列以 NMPA 中文说明书为准，FDA 列以美国说明书为准，EMA 列以欧盟 SmPC 为准。**中国说明书通常比 FDA 保守，误把 FDA 已批准的适应症标成中国也批准，是本库最高频的错误**——典型错误示例：舍曲林在中国只获批抑郁症和强迫症，却被标成惊恐障碍、PTSD 也已批准。吃不准的应改为 ❔ 并标注 [需核实]，而不是打 ✅；某适应症在中国属超说明书用法（尤其被《广东省药学会超药品说明书用药目录》收录）时，中国列填 ❌、备注写明超说明书与目录来源；
8. 其他批准状态/指南推荐的表述：凡写"已获/尚未获 XX 批准""指南推荐为"的句子，若无法确认为最新状态，指出并建议加 [需核实]。

**本站正确范式**（审稿对照）：
- "对强迫思维和行为有较好的疗效。但 Meta 分析并不认为氟伏沙明治强迫症比其他 SSRI 更好，指南也并未首选推荐氟伏沙明。"
- "理论上可××，但缺乏 RCT 证据支持。"

输出**严格的 JSON**（不要代码块、不要叙述）：{"issues": ["[硬伤|循证|hype|过时] 位置 + 问题 + 建议改法", ...]}
没有问题就输出 {"issues": []}。最多 10 条，按严重程度排序。

--- 正文开始 ---
${body.slice(0, 12000)}
--- 正文结束 ---`;
};

/**
 * 规整模型输出：拆掉整篇代码围栏包装、剔除一级标题（站点的词条名标题单独渲染，
 * 正文里的 h1 会被渲染管线丢弃，这里直接清理，避免白白浪费一次生成）。
 */
function normalizeBody(text) {
  let out = String(text ?? '').trim();
  const notes = [];
  const fenced = out.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n?```$/i);
  if (fenced) {
    out = fenced[1].trim();
    notes.push('已拆掉整篇代码围栏');
  }
  const h1s = out.match(/^#\s+\S.*$/gm);
  if (h1s) {
    out = out
      .replace(/^#\s+\S.*(?:\r?\n)?/gm, '')
      .replace(/^\s*\n/, '')
      .trim();
    notes.push(`已移除 ${h1s.length} 处一级标题`);
  }
  return { text: out, notes };
}

/** 收集正文里的营销式用语命中（warning 级） */
function collectHype(text) {
  HYPE_RE.lastIndex = 0;
  return text.match(HYPE_RE) ?? [];
}

function validateBody(text) {
  const errors = [];
  const warnings = [];
  const missing = SECTIONS.filter(
    (s) => !new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(text)
  );
  if (missing.length) errors.push(`缺少章节：${missing.join('、')}`);
  if (text.length < 2000) errors.push(`正文过短（${text.length} 字，要求 ≥2000）`);
  if (/\$\$?|\\\(|\\\[|\\begin\{/.test(text)) errors.push('包含 LaTeX 语法（$ / $$ / \\begin 等）');
  if (/```/.test(text)) errors.push('包含代码围栏（```）');
  if (/^# /m.test(text)) errors.push('包含一级标题（# ），应与站点标题重复');
  // 编号式子标题（如「### 1. 机制概述」）是模型自行发挥的产物：站点的左侧目录会收录所有标题，
  // 这类层级既不属于既有词条风格，也不在约定结构内。
  const numbered = text.match(/^#{2,3}\s*\d+\s*[.、)]\s*\S.*$/m);
  if (numbered) errors.push(`包含自行添加的编号式子标题（「${numbered[0].trim().slice(0, 24)}」），请去掉编号与额外子标题`);
  // 章节顺序
  const positions = SECTIONS.map((s) => text.indexOf(s)).filter((p) => p >= 0);
  const sorted = [...positions].sort((a, b) => a - b);
  if (positions.join() !== sorted.join()) warnings.push('章节顺序与要求不一致');
  const hypeHits = collectHype(text);
  if (hypeHits.length) warnings.push(`营销式用语 ${hypeHits.length} 处（${[...new Set(hypeHits)].join('/')}），请改为中性或数据表述`);
  return { errors, warnings, ok: errors.length === 0 };
}

function validateNewEntry(data, { principleIds, existingIds, id, allowExisting = false }) {
  const issues = [];
  if (!data || typeof data !== 'object') return ['模型返回的不是 JSON 对象'];
  const radar = data.stahl_radar ?? {};
  const labels = Array.isArray(radar.labels) ? radar.labels : [];
  const values = Array.isArray(radar.values) ? radar.values : [];
  const linkIds = Array.isArray(radar.link_ids) ? radar.link_ids : [];
  if (labels.length < 4 || labels.length > 8) issues.push(`靶点数量应为 4-8 个（实际 ${labels.length}）`);
  if (values.length !== labels.length) issues.push('values 与 labels 数量不一致');
  if (linkIds.length !== labels.length) issues.push('link_ids 与 labels 数量不一致');
  values.forEach((v, i) => {
    if (typeof v !== 'number' || Number.isNaN(v) || v < 0 || v > 10) issues.push(`values[${i}] 不是 0-10 的数字`);
  });
  linkIds.forEach((v) => {
    if (!principleIds.has(String(v))) issues.push(`link_id "${v}" 不在受体清单中`);
  });
  const cats = Array.isArray(data.categories) ? data.categories : [];
  if (!cats.length) issues.push('categories 不能为空');
  cats.forEach((c) => {
    if (!DRUG_CATEGORY_ORDER.includes(c)) issues.push(`分类 "${c}" 不在分类白名单中`);
  });
  const pearls = Array.isArray(data.pearls) ? data.pearls : [];
  if (pearls.length < 2) issues.push('pearls 至少需要 2 条');
  pearls.forEach((p, i) => {
    if (!p?.title || !p?.content) issues.push(`pearls[${i}] 缺少 title 或 content`);
    if (!['danger', 'warning', 'success', 'info'].includes(p?.type)) issues.push(`pearls[${i}].type 非法（${p?.type}）`);
  });
  if (!data.pk_data || typeof data.pk_data !== 'object') issues.push('缺少 pk_data');
  if (!data.name_en) issues.push('缺少 name_en');
  if (!allowExisting && existingIds.has(id)) issues.push(`词条 id "${id}" 已存在（与现有词条或受体重名）`);
  return issues;
}

/* ------------------------------------------------------------------ */
/* 写盘                                                                */
/* ------------------------------------------------------------------ */

function backup(file) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dest = path.join(BACKUP_DIR, `${path.basename(file, '.md')}-${stamp}.md`);
  fs.copyFileSync(file, dest);
  return path.relative(ROOT, dest);
}

const slugifyId = (nameEn) =>
  String(nameEn)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

async function generateBody({ entry, reference, referenceFull, opts }) {
  if (opts.mock) return mockBody(opts.mock, referenceFull || reference);
  const prompt = buildBodyPrompt({
    data: entry.data,
    existingBody: entry.body,
    reference,
  });
  return callGemini(prompt, { model: opts.model });
}

/** 双 AI 审稿循环（药物/受体共用）：审稿模型挑问题 → 回喂生成模型修复一轮 → 修复稿再过程序校验。
 *  kind 决定修复 prompt 的硬性要求（药物 9 章节 / 受体自由结构）。 */
async function runReviewLoop({ data, body, verdict, validate, opts, kind = 'drug' }) {
  const result = { text: body, verdict, reviewed: false };
  if (!verdict.ok || !REVIEW_MODEL || opts.mock) return result;
  try {
    const search = opts.search || GROUNDING;
    console.log(`   🔍 审稿模型（${REVIEW_MODEL}${REVIEW_MODEL === opts.model ? '，与生成同款' : ''}${search ? ' + 搜索 grounding' : ''}）复核中…`);
    const reviewRaw = await callGemini(buildReviewPrompt({ data, body }), {
      json: true,
      model: REVIEW_MODEL,
      search,
    });
    const review = parseJsonBlock(reviewRaw);
    const issues = Array.isArray(review?.issues) ? review.issues.filter((s) => typeof s === 'string' && s.trim()) : [];
    if (!issues.length) {
      console.log('   ✅ 审稿通过，无需修改');
      return { ...result, reviewed: true };
    }
    issues.forEach((it, i) => console.log(`   💬 审稿意见 ${i + 1}：${it}`));
    console.log('   ↻ 按审稿意见发起修复…');
    const fixedRaw = await callGemini(
      buildRepairPrompt({ data, previous: body, errors: issues, kind }),
      { model: opts.model }
    );
    const fixed = normalizeBody(fixedRaw);
    const fixedVerdict = validate(fixed.text);
    if (fixedVerdict.ok || fixedVerdict.errors.length <= verdict.errors.length) {
      console.log(`   ↻ 审稿修复后：${fixedVerdict.ok ? '已通过校验' : '仍有问题 → ' + fixedVerdict.errors.join('；')}`);
      return { text: fixed.text, verdict: fixedVerdict, reviewed: true };
    }
    console.log('   ↻ 审稿修复未改善，保留审稿前版本');
    return { ...result, reviewed: true };
  } catch (error) {
    console.log(`   ⚠️ 审稿环节失败（不影响出稿）：${String(error?.message ?? error).slice(0, 70)}`);
    return result;
  }
}

/**
 * 生成正文 + 校验；未通过时发起一次修复请求（把具体错误回喂给模型）。
 * 返回 { text, notes, verdict }
 */
async function generateBodyChecked({ entry, reference, referenceFull, opts }) {
  const raw = await generateBody({ entry, reference, referenceFull, opts });
  let normalized = normalizeBody(raw);
  let verdict = validateBody(normalized.text);

  if (!verdict.ok && !opts.mock) {
    console.log(`   ↻ 首次输出未通过校验，发起一次修复请求：${verdict.errors.join('；')}`);
    const repairedRaw = await callGemini(
      buildRepairPrompt({ data: entry.data, previous: normalized.text, errors: verdict.errors }),
      { model: opts.model }
    );
    const second = normalizeBody(repairedRaw);
    const secondVerdict = validateBody(second.text);
    if (secondVerdict.ok || secondVerdict.errors.length < verdict.errors.length) {
      normalized = second;
      verdict = secondVerdict;
      console.log(`   ↻ 修复后：${secondVerdict.ok ? '已通过校验' : '仍有问题 → ' + secondVerdict.errors.join('；')}`);
    } else {
      console.log('   ↻ 修复未改善，保留首次输出');
    }
  }

  // 双 AI 审稿（可选，.env 设 GEMINI_REVIEW_MODEL 启用；GEMINI_GROUNDING=1 / --search 加检索）
  const reviewed = await runReviewLoop({
    data: entry.data,
    body: normalized.text,
    verdict,
    validate: validateBody,
    opts,
  });
  return { text: reviewed.text, notes: normalized.notes, verdict: reviewed.verdict };
}

async function runRewrite(targets, entries, reference, referenceFull, opts) {
  const results = [];
  for (let i = 0; i < targets.length; i++) {
    const id = targets[i];
    console.log(`\n📄 [${i + 1}/${targets.length}] ${id}`);
    const found = entries.get(id);
    if (!found) {
      console.log(`   ❌ 未找到词条 src/content/drugs 下 id 为 "${id}" 的 md（如需新建请用 --new）`);
      results.push({ id, ok: false, error: '未找到词条' });
      continue;
    }
    try {
      const { text, notes, verdict } = await generateBodyChecked({
        entry: found.entry,
        reference,
        referenceFull,
        opts,
      });
      notes.forEach((n) => console.log(`   ℹ️  ${n}`));
      const oldLen = found.entry.body.length;
      if (!verdict.ok && !opts.lenient) {
        console.log(`   ❌ 校验未通过，已拒绝写盘：${verdict.errors.join('；')}`);
        results.push({ id, ok: false, error: verdict.errors.join('；') });
      } else {
        if (!verdict.ok) console.log(`   ⚠️  校验问题（lenient 放行）：${verdict.errors.join('；')}`);
        verdict.warnings.forEach((w) => console.log(`   ⚠️  ${w}`));
        if (opts.dryRun) {
          console.log(`   🔎 dry-run：未写盘（原 ${oldLen} 字 → 新 ${text.length} 字）`);
          if (opts.dump) {
            fs.mkdirSync(path.join(ROOT, '.astro'), { recursive: true });
            const safeModel = opts.model.replace(/[^\w.-]+/g, '_');
            const dumpPath = path.join(ROOT, '.astro', `dry-run-${id}-${safeModel}.md`);
            fs.writeFileSync(dumpPath, text, 'utf-8');
            console.log(`   📄 生成内容已导出：${path.relative(ROOT, dumpPath)}`);
          }
        } else {
          const backupPath = backup(found.file);
          fs.writeFileSync(found.file, rebuild(found.entry, text), 'utf-8');
          console.log(`   ✅ 已写入 ${path.basename(found.file)}（${oldLen} 字 → ${text.length} 字；备份 ${backupPath}）`);
        }
        results.push({ id, ok: true, length: text.length });
      }
    } catch (error) {
      console.log(`   ❌ 生成失败：${error.message}`);
      results.push({ id, ok: false, error: error.message });
    }
    if (i < targets.length - 1) await sleep(opts.delay);
  }
  return results;
}

/** 解析 --new 的名字列表。
 *  支持两种写法（可混用不了——按顺序扫描）：
 *    --new 名1 名2 名3                一次新建多个词条，英文名由 AI 推断
 *    --new 中文名 英文名              成对传入（第二个参数为纯拉丁字母时视为英文名）
 *  旧版把第二个位置参数无条件当英文名，用户输入「名1 名2 名3」时会把名2 吞成英文名，
 *  而中文无法 slugify 出合法 id，最终写出了隐藏文件 drugs/.md（Astro 忽略点文件，词条永不见效）。
 */
function parseNewNames(positional) {
  const jobs = [];
  for (let i = 0; i < positional.length; i++) {
    const cur = positional[i];
    const next = positional[i + 1];
    if (next && /^[A-Za-z][A-Za-z0-9 .-]*$/.test(next)) {
      jobs.push({ nameCn: cur, nameEn: next });
      i += 1;
    } else {
      jobs.push({ nameCn: cur, nameEn: '' });
    }
  }
  return jobs;
}

async function generateNewEntry({ nameCn, nameEn }, opts, principleIds, existingIds, reference, referenceFull) {
  console.log(`\n🆕 新建词条：${nameCn}${nameEn ? ` / ${nameEn}` : ''}`);

  // 1) frontmatter（结构化 JSON）
  let fm;
  if (opts.mock) {
    fm = JSON.parse(JSON.stringify(matter(fs.readFileSync(path.join(DRUGS_DIR, 'clozapine.md'), 'utf-8')).data));
    fm.name_en = nameEn || fm.name_en;
    fm.id = undefined;
  } else {
    const raw = await callGemini(
      buildFrontmatterPrompt({ nameCn, nameEn, principleIds }),
      { json: true, model: opts.model }
    );
    try {
      fm = parseJsonBlock(raw);
    } catch (error) {
      console.error(`   ❌ frontmatter JSON 解析失败：${error.message}`);
      return [{ id: nameCn, ok: false, error: 'JSON 解析失败' }];
    }
  }

  // id 推导优先级：显式 --id > 模型返回的英文名 > 命令行英文名。
  // 千万不能用中文名兜底——中文 slugify 后为空，会写出隐藏文件 drugs/.md。
  const id = opts.id || slugifyId(fm.name_en || nameEn || '');
  if (!id) {
    console.error(`   ❌ 无法为「${nameCn}」推导出合法词条 id（需要英文名）。`);
    console.error(`      请改用：npm run generate -- --new ${nameCn} 英文名  或  --id=自定义id`);
    return [{ id: nameCn, ok: false, error: '无法推导词条 id（缺英文名）' }];
  }
  // 注意展开顺序：id / name_cn 必须由我们决定，不能被模型返回的同名字段覆盖
  const data = { ...fm, id, name_cn: nameCn };

  // 2) 校验
  const issues = validateNewEntry(data, { principleIds, existingIds, id, allowExisting: opts.force });
  const parsed = drugSchema.safeParse(data);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push(`schema: ${issue.path.join('.') || '(root)'} — ${issue.message}`);
    }
  }
  if (issues.length) {
    console.error('   ❌ frontmatter 校验未通过：');
    issues.forEach((it) => console.error(`      - ${it}`));
    return [{ id, ok: false, error: `frontmatter 校验失败（${issues.length} 项）` }];
  }

  // 3) 正文
  const target = { data: parsed.data, body: '' };
  const { text, notes, verdict } = await generateBodyChecked({
    entry: target,
    reference,
    referenceFull,
    opts,
  });
  notes.forEach((n) => console.log(`   ℹ️  ${n}`));
  if (!verdict.ok && !opts.lenient) {
    console.error(`   ❌ 正文校验未通过，已拒绝写盘：${verdict.errors.join('；')}`);
    return [{ id, ok: false, error: verdict.errors.join('；') }];
  }
  verdict.warnings.forEach((w) => console.warn(`   ⚠️  ${w}`));

  const content = matter.stringify(`${text.trim()}\n`, parsed.data);
  if (opts.dryRun) {
    console.log(`   🔎 dry-run：未写盘。frontmatter 预览：\n${content.split('\n').slice(0, 24).join('\n')}\n   …`);
    return [{ id, ok: true, length: text.length, dryRun: true }];
  }
  const file = path.join(DRUGS_DIR, `${id}.md`);
  if (fs.existsSync(file)) {
    if (!opts.force) {
      console.error(`   ❌ 文件已存在：${path.relative(ROOT, file)}（整体覆盖重写请加 --force，正文-only 重写请用：npm run generate -- ${id}）`);
      return [{ id, ok: false, error: '文件已存在' }];
    }
    const backupPath = backup(file);
    fs.writeFileSync(file, content, 'utf-8');
    console.log(`   ♻️  已覆盖重写 src/content/drugs/${id}.md（正文 ${text.length} 字；旧文件备份 ${backupPath}）`);
    return [{ id, ok: true, length: text.length, overwritten: true }];
  }
  fs.writeFileSync(file, content, 'utf-8');
  console.log(`   ✅ 已创建 src/content/drugs/${id}.md（正文 ${text.length} 字）`);
  return [{ id, ok: true, length: text.length }];
}

async function runNew(opts, principleIds, existingIds, reference, referenceFull) {
  const jobs = parseNewNames(opts.positional);
  if (!jobs.length) {
    console.error('❌ --new 模式需要提供中文名：npm run generate -- --new 中文名 [英文名]');
    console.error('   也支持一次新建多个（空格分隔）：npm run generate -- --new 名1 名2 名3');
    return [{ id: '(new)', ok: false, error: '缺少中文名' }];
  }

  const results = [];
  for (let i = 0; i < jobs.length; i++) {
    try {
      const r = await generateNewEntry(jobs[i], opts, principleIds, existingIds, reference, referenceFull);
      results.push(...r);
    } catch (error) {
      console.log(`   ❌ 生成失败：${error.message}`);
      results.push({ id: jobs[i].nameCn, ok: false, error: error.message });
    }
    if (i < jobs.length - 1) await sleep(opts.delay);
  }
  return results;
}

/* ------------------------------------------------------------------ */
/* 受体词条（--receptor）：结构化 frontmatter + 自由正文                  */
/* ------------------------------------------------------------------ */

const buildReceptorFmPrompt = ({ nameCn, nameEn, drugList }) => `你是精神药理学专家。请为受体词条 **${nameCn}${nameEn ? `（${nameEn}）` : ''}** 输出**严格的 JSON**（不要代码块），用于本站 frontmatter。

字段与约束：
{
  "name_en": "英文通用名（如 Serotonin 2A Receptor）",
  "description": "一句话机制定性（40-80 字：该受体是什么、被哪些药物干预、核心临床意义；不要用比喻修辞）",
  "receptor_info": {
    "receptor_type": "受体类型，如 GPCR · Gq/11 偶联 / 配体门控离子通道",
    "type_note": "一句话补充（如 激活 IP3/DAG 信号通路）",
    "synapse": "突触定位（突触后膜 / 突触前膜 / 突触前后膜兼有）",
    "synapse_note": "一句话补充（如 主要作为异源受体接收信号）",
    "ligand": "内源性配体（HTML 下标格式，如 5-羟色胺 (5-HT)）",
    "ligand_note": "一句话补充（如 亲和力约中等水平）",
    "brain_regions": "核心分布脑区（最主要的一个，HTML 下标格式）",
    "regions_note": "其他分布（如 纹状体、血小板、胃肠道）",
    "interventions": [
      { "mode": "干预模式（完全激动/部分激动/拮抗/反向激动等）", "effect": "细胞与环路效应", "clinic": "核心临床表现", "drugs": ["代表药物中文名，**必须逐字取自下面的药物清单**；无对应药物则留空数组"] }
    ],
    "target_drugs": [
      { "name": "靶向该受体的代表药物中文名（**必须逐字取自下面的药物清单**）", "ki": "Ki(nM) 公开文献值，保留 1-2 位有效数字；无可靠数据填「无数据」", "note": "一句话备注（如 SGA · 强效拮抗）" }
    ],
    "qa": [
      { "q": "临床实战问题（HTML 下标格式书写受体名）", "a": "解答（100-200 字，有机制依据，HTML 下标格式）" }
    ]
  }
}

【药物清单】（interventions 与 target_drugs 里的药物名必须逐字取自这里，共 ${drugList.length} 个）：
${drugList.map((d) => `- ${d.name}`).join('\n')}

要求：
- interventions 2-4 行；target_drugs 3-5 个按 Ki 亲和力从强到弱排序；qa 2-3 个；
- 靶向药物**只允许选清单里真实存在的药**，严禁编造清单外药名；
- Ki 依据 PDSP 数据库/文献；不确定加 [需核实]；
- 只输出 JSON 本身。`;

const buildReceptorBodyPrompt = ({ data }) => `你是精神药理学专家。为受体词条 **${data.title}**（${data.subtitle ?? ''}）撰写自由书写的百科正文（Markdown）。

frontmatter 已包含的信息（不要重复表面内容，往深处写）：${JSON.stringify(
  { description: data.description, receptor_info: data.receptor_info },
  null, 1
).slice(0, 1600)}

内容建议（按该受体特点取舍组织，用 ### 小节）：
- 信号通路与亚型差异
- 生理功能与脑区分布的深层机制
- 与疾病、药物研发的关联
- 临床视角的使用注意与前沿进展

要求：
- 纯 Markdown；允许 ### 小节与表格；禁止一级标题（# ）、禁止代码围栏（\`\`\`）、禁止 LaTeX（$）；
- 受体名用 HTML 下标（如 5-HT<sub>2A</sub>）；
- 总字数 800-2500 字；
- 严谨的医学中文，不确定处加 [需核实]；
- 机制推导的临床获益写"理论上/厂商宣称"，不得写成既成事实；禁用"卓越/完美/彻底改变"等营销式形容词；
- 不要任何前言或结语。`;

function validateReceptorBody(text) {
  const errors = [];
  const warnings = [];
  if (/^# /m.test(text)) errors.push('包含一级标题（# ）');
  if (/```/.test(text)) errors.push('包含代码围栏');
  if (/\$[^$\n]+\$/.test(text)) errors.push('包含 LaTeX（$）');
  if (text.replace(/\s/g, '').length < 400) errors.push('正文太短（<400 字）');
  const hypeHits = collectHype(text);
  if (hypeHits.length) warnings.push(`营销式用语 ${hypeHits.length} 处（${[...new Set(hypeHits)].join('/')}），请改为中性或数据表述`);
  return { errors, warnings, ok: errors.length === 0 };
}

async function generateReceptorEntry({ nameCn, nameEn }, opts, drugEntries, principlesDir) {
  console.log(`\n🧬 新建受体词条：${nameCn}${nameEn ? ` / ${nameEn}` : ''}`);

  // 药物清单（供关联校验）
  const drugList = [...drugEntries.values()].map((e) => ({ id: e.entry.data.id, name: e.entry.data.name_cn }));
  const nameToId = new Map(drugList.map((d) => [d.name, d.id]));

  // 1) frontmatter JSON
  let fm;
  {
    const raw = await callGemini(buildReceptorFmPrompt({ nameCn, nameEn, drugList }), { json: true, model: opts.model });
    try {
      fm = parseJsonBlock(raw);
    } catch (error) {
      console.error(`   ❌ frontmatter JSON 解析失败：${error.message}`);
      return [{ id: nameCn, ok: false, error: 'JSON 解析失败' }];
    }
  }

  const id = opts.id || slugifyId(fm.name_en || nameEn || '');
  if (!id) {
    console.error(`   ❌ 无法为「${nameCn}」推导出合法词条 id（需要英文名）。可用 --id=xxx 显式指定。`);
    return [{ id: nameCn, ok: false, error: '无法推导词条 id（缺英文名）' }];
  }

  // 2) 关联药物校验：剔除清单外药名（防编造）；兼容字符串/对象两种 AI 输出形状
  const info = fm.receptor_info ?? {};
  let dropped = 0;
  const drugNameOk = (name) => {
    if (nameToId.has(name)) return true;
    dropped += 1;
    console.log(`   ⚠️  剔除清单外药物：${name ?? '(无名行)'}（药物库中不存在，无法建立跳转）`);
    return false;
  };
  const normalizeDrugNames = (list) =>
    (Array.isArray(list) ? list : [])
      .map((row) => (typeof row === 'string' ? row : row?.name))
      .filter((name) => drugNameOk(name));
  const normalizeTargetDrugs = (list) =>
    (Array.isArray(list) ? list : [])
      .map((row) => (typeof row === 'string' ? { name: row } : row))
      .filter((row) => drugNameOk(row?.name));
  if (Array.isArray(info.interventions)) info.interventions = info.interventions.map((row) => ({ ...row, drugs: normalizeDrugNames(row.drugs) }));
  if (Array.isArray(info.target_drugs)) info.target_drugs = normalizeTargetDrugs(info.target_drugs);

  const data = {
    id,
    type: 'receptor',
    title: nameCn,
    subtitle: fm.name_en || nameEn || '',
    description: fm.description || '',
    receptor_info: info,
  };

  // 3) schema 校验
  const parsed = principleSchema.safeParse(data);
  if (!parsed.success) {
    console.error('   ❌ frontmatter 校验未通过：');
    for (const issue of parsed.error.issues) console.error(`      - ${issue.path.join('.') || '(root)'} — ${issue.message}`);
    return [{ id, ok: false, error: 'frontmatter 校验失败' }];
  }

  // 4) 自由正文
  const raw = await callGemini(buildReceptorBodyPrompt({ data: parsed.data }), { model: opts.model });
  let normalized = normalizeBody(raw);
  let verdict = validateReceptorBody(normalized.text);
  if (!verdict.ok) {
    console.log(`   ↻ 正文未通过校验，发起一次修复：${verdict.errors.join('；')}`);
    const fixedRaw = await callGemini(
      buildRepairPrompt({ data: parsed.data, previous: normalized.text, errors: verdict.errors, kind: 'receptor' }),
      { model: opts.model }
    );
    const fixed = normalizeBody(fixedRaw);
    const fixedVerdict = validateReceptorBody(fixed.text);
    if (fixedVerdict.ok || fixedVerdict.errors.length < verdict.errors.length) {
      normalized = fixed;
      verdict = fixedVerdict;
      console.log(`   ↻ 修复后：${fixedVerdict.ok ? '已通过校验' : '仍有问题 → ' + fixedVerdict.errors.join('；')}`);
    }
  }
  // 双 AI 审稿：受体流程同样接入（GEMINI_REVIEW_MODEL；GEMINI_GROUNDING=1 / --search 加检索）
  const reviewed = await runReviewLoop({
    data: parsed.data,
    body: normalized.text,
    verdict,
    validate: validateReceptorBody,
    opts,
    kind: 'receptor',
  });
  normalized = { text: reviewed.text };
  verdict = reviewed.verdict;
  if (!verdict.ok && !opts.lenient) {
    console.error(`   ❌ 正文校验未通过，已拒绝写盘：${verdict.errors.join('；')}`);
    return [{ id, ok: false, error: verdict.errors.join('；') }];
  }

  const content = matter.stringify(`${normalized.text.trim()}\n`, parsed.data);
  const file = path.join(principlesDir, `${id}.md`);
  if (fs.existsSync(file)) {
    if (!opts.force) {
      console.error(`   ❌ 文件已存在：${path.relative(ROOT, file)}（整体覆盖重写请加 --force）`);
      return [{ id, ok: false, error: '文件已存在' }];
    }
    const backupPath = backup(file);
    fs.writeFileSync(file, content, 'utf-8');
    console.log(`   ♻️  已覆盖重写 ${path.relative(ROOT, file)}（正文 ${normalized.text.length} 字；旧文件备份 ${backupPath}）`);
    return [{ id, ok: true, length: normalized.text.length, overwritten: true }];
  }
  fs.writeFileSync(file, content, 'utf-8');
  console.log(`   ✅ 已创建 ${path.relative(ROOT, file)}（正文 ${normalized.text.length} 字）`);
  return [{ id, ok: true, length: normalized.text.length }];
}

async function runReceptorNew(opts, drugEntries, principlesDir) {
  const jobs = parseNewNames(opts.positional);
  if (!jobs.length) {
    console.error('❌ --receptor 模式需要提供受体名：npm run generate -- --receptor 受体名 [--id=xx]');
    return [{ id: '(new)', ok: false, error: '缺少受体名' }];
  }
  const results = [];
  for (let i = 0; i < jobs.length; i++) {
    try {
      results.push(
        ...(await generateReceptorEntry(jobs[i], opts, drugEntries, principlesDir))
      );
    } catch (error) {
      console.log(`   ❌ 生成失败：${error.message}`);
      results.push({ id: jobs[i].nameCn, ok: false, error: error.message });
    }
    if (i < jobs.length - 1) await sleep(opts.delay);
  }
  return results;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const entries = loadDrugEntries();
  const principleIds = loadPrincipleIds();
  const existingIds = new Set([...entries.keys(), ...principleIds]);

  // 参考样例：优先氯氮平，否则挑一个章节齐全的
  let referenceBody = '';
  let referenceFull = '';
  const refEntry = entries.get('clozapine') ?? [...entries.values()].find((e) => !isIncomplete(e.entry.body));
  if (refEntry) {
    referenceFull = refEntry.entry.body;
    referenceBody = referenceFull.slice(0, 1500);
  }

  console.log('🚀 PsychPedia 词条生成器（v2）');
  console.log(`   模型：${opts.model}${opts.mock ? `（mock=${opts.mock}，不调用 API）` : ''}${BASE_URL ? `（经 ${BASE_URL} 中转）` : ''}`);
  if (REVIEW_MODEL) console.log(`   审稿：${REVIEW_MODEL}（双 AI 流水线）`);
  console.log(`   词条库：${entries.size} 个药物词条 / ${principleIds.size} 个受体词条`);

  if (!opts.mock && !API_KEY) {
    console.error('\n❌ 缺少 GEMINI_API_KEY。请在 .env 中配置（可参考 .env.example），或先用 --mock 自测。');
    process.exit(1);
  }

  // grounding 连通性自测：一次最小搜索调用，验证 google_search 工具是否可用
  if (opts.testSearch) {
    const testModel = REVIEW_MODEL || opts.model;
    console.log(`🔌 Google Search Grounding 连通性测试（${testModel}）…`);
    try {
      const answer = await callGemini('用一句话回答：伏硫西汀最常见的不良反应是什么？', {
        search: true,
        model: testModel,
      });
      console.log(`   ✅ 通道可用。模型回答：${answer.trim().slice(0, 120)}`);
      console.log('   可以在 .env 设 GEMINI_GROUNDING=1（或生成时加 --search）启用审稿检索。');
    } catch (error) {
      console.log(`   ❌ grounding 调用失败：${String(error?.message ?? error).slice(0, 200)}`);
      console.log('   当前通道大概率不支持 google_search 工具，请保持离线审稿（不要设 GEMINI_GROUNDING）。');
      process.exitCode = 1;
    }
    return;
  }

  // 目标选择
  let targets = [];
  if (opts.newEntry) {
    const results = await runNew(opts, principleIds, existingIds, referenceBody, referenceFull);
    report(results);
    return;
  }
  if (opts.receptorEntry) {
    const results = await runReceptorNew(opts, entries, PRINCIPLES_DIR);
    report(results);
    return;
  }
  if (opts.all) {
    targets = [...entries.entries()]
      .filter(([, e]) => opts.force || isIncomplete(e.entry.body))
      .map(([id]) => id);
    if (!targets.length) {
      console.log('\n✅ 所有词条正文都完整，无需生成（用 --force 可全部重写）。');
      return;
    }
    console.log(`\n📋 待生成 ${targets.length} 个词条${opts.force ? '（--force 全部重写）' : '（正文缺失/不完整）'}：`);
    console.log(`   ${targets.join(', ')}`);
  } else if (opts.positional.length) {
    targets = opts.positional;
  } else {
    console.log(`
用法：
  npm run generate -- <药物id> [<药物id> ...]     重写指定词条正文
  npm run generate -- --all                        补齐缺失/不完整的词条
  npm run generate -- --all --force                全部重写
  npm run generate -- --new 中文名 [英文名]        AI 新建整条词条
  npm run generate -- --test-search                自测审稿搜索 grounding 通道

选项：--dry-run  --mock[=good|bad|short|latex]  --lenient  --yes  --search  --delay=3000  --model=xxx`);
    return;
  }

  if (!opts.yes && !opts.dryRun) {
    console.log('\n按 Ctrl+C 取消，或回车开始…');
    await new Promise((resolve) => {
      process.stdin.once('data', resolve);
      process.stdin.resume();
    });
  }

  const started = Date.now();
  const results = await runRewrite(targets, entries, referenceBody, referenceFull, opts);
  console.log(`\n⏱️  耗时 ${((Date.now() - started) / 1000 / 60).toFixed(1)} 分钟`);
  report(results);
}

function report(results) {
  const ok = results.filter((r) => r.ok);
  const bad = results.filter((r) => !r.ok);
  console.log('\n' + '='.repeat(56));
  console.log(`📊 完成：成功 ${ok.length} / ${results.length}${bad.length ? `，失败 ${bad.length}` : ''}`);
  ok.forEach((r) => console.log(`   ✅ ${r.id}${r.length ? `（${r.length} 字）` : ''}`));
  bad.forEach((r) => console.log(`   ❌ ${r.id}：${r.error}`));
  if (usage.calls) {
    const avgSec = (usage.ms / usage.calls / 1000).toFixed(1);
    console.log(
      `\n🧮 用量：${usage.calls} 次调用 · 输入 ${usage.prompt} · 输出 ${usage.candidates} · 思考 ${usage.thoughts} tokens` +
        `（平均 ${avgSec}s/次）`
    );
  }
  if (ok.length) {
    console.log('\n💡 请人工复核：PK 数值、适应症批准情况、雷达图分值；搜索正文中的 [需核实] 标记。');
    if (!REVIEW_MODEL) console.log('   提示：.env 设 GEMINI_REVIEW_MODEL 可启用双 AI 循证审稿（hype/过时/地位断言）。');
    console.log('   预览：npm run dev（或双击 tools/启动网站.bat）');
  }
  if (bad.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`\n❌ 运行失败：${error?.stack ?? error}`);
    process.exit(1);
  });
}

// 供测试脚本复用（被 import 时不自动执行）
export {
  parseEntry,
  rebuild,
  normalizeBody,
  validateBody,
  validateNewEntry,
  sectionCount,
  isIncomplete,
  SECTIONS,
  parseArgs,
};
