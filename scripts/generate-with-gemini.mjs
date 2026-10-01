#!/usr/bin/env node
/**
 * Gemini 词条生成器（PsychPedia v2 架构）
 *
 * 与旧版的区别：直接读写 src/content/drugs/*.md，不再产生任何 JSON。
 * 重写正文时 frontmatter 逐字保留（写盘前自动备份到 v2/.backups/）。
 *
 * 用法：
 *   npm run generate -- <药物id> [<药物id> ...]     重写指定词条的正文
 *   npm run generate -- --all                        补齐正文缺失/不完整的词条（跳过完整的）
 *   npm run generate -- --all --force                全部重写
 *   npm run generate -- --new 中文名 [英文名]         AI 新建整条词条（frontmatter + 正文）
 *
 * 选项：
 *   --dry-run       只打印生成结果与校验结论，不写盘
 *   --mock[=变体]   不调用 API，用内置样例走完整流程（good|bad|short|latex；自测用）
 *   --lenient       校验不通过时仍然写盘（默认拒绝写盘）
 *   --yes           跳过确认（供批处理脚本调用）
 *   --delay=3000    每个词条之间的间隔毫秒数（默认 3000）
 *   --model=xxx     覆盖模型（也可用 .env 的 GEMINI_MODEL）
 *   --id=xxx        新建模式：显式指定词条 id
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { loadEnv } from './image-upload-lib.mjs';
import { drugSchema } from '../src/lib/content-schema.mjs';
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
    dryRun: false,
    dump: false,
    lenient: false,
    yes: false,
    delay: 3000,
    model: DEFAULT_MODEL,
    id: '',
    mock: null,
    positional: [],
  };
  for (const arg of argv) {
    if (arg === '--all') opts.all = true;
    else if (arg === '--force') opts.force = true;
    else if (arg === '--new') opts.newEntry = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--dump') opts.dump = true;
    else if (arg === '--lenient') opts.lenient = true;
    else if (arg === '--yes') opts.yes = true;
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
受体结合谱（受体名用 HTML 下标：5-HT<sub>2A</sub>、D<sub>2</sub>、H<sub>1</sub> 等）、作用机制、与疗效/副作用的关联。（约 300-500 字）

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
5. **长度**：总字数 2500-3500 字，每章节充实、纯干货。
6. **语言**：专业客观的医学中文；药物名与受体名保留英文；避免"可能""也许"等模棱两可表述，除非医学上确实未定论。

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
    "labels": ["5-7 个药理靶点，如 D2、5HT2A、H1、NET"],
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
- 靶点亲和力请依据 Stahl 受体结合谱；把握不大的数值给 0-10 的合理估计，不要留空。
- 任何无法确证的精确数值用 "[需核实]" 标注，不要编造。
- 只输出 JSON 本身。`;

/** 校验未通过时的修复提示：把具体问题回喂给模型，要求完整重出 */
const buildRepairPrompt = ({ data, previous, errors }) => `你上一次为药物 **${data.name_cn}（${data.name_en}）** 输出的词条正文未通过自动校验。

**必须修正的问题**：
${errors.map((e) => `- ${e}`).join('\n')}

**硬性要求（再强调）**：
- 必须包含且仅包含以下 9 个章节，标题逐字一致、顺序一致：${SECTIONS.join(' / ')}
- 纯 Markdown；禁止 LaTeX（$ 或 $$）；禁止代码围栏（\`\`\`）；禁止一级标题（# ）
- 受体名用 HTML 下标（如 5-HT<sub>2A</sub>）
- 总字数 2500-3500 字

请**重新输出完整正文**（不要解释、不要道歉、不要代码块标记）。

上一次的输出如下（在此基础上修正，不要把已经正确的内容改坏）：

${previous.slice(0, 6000)}`;

/* ------------------------------------------------------------------ */
/* 模型调用（含重试与 mock）                                           */
/* ------------------------------------------------------------------ */

async function callGemini(prompt, { json = false, model } = {}) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const started = Date.now();
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.15,
          topP: 0.8,
          maxOutputTokens: 24000,
          ...(json ? { responseMimeType: 'application/json' } : {}),
        },
      });
      const text = (typeof res.text === 'string' ? res.text : '') || '';
      if (!text.trim()) throw new Error('模型返回了空内容');
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
  return JSON.parse(cleaned);
};

/* ------------------------------------------------------------------ */
/* 校验                                                                */
/* ------------------------------------------------------------------ */

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
  return { errors, warnings, ok: errors.length === 0 };
}

function validateNewEntry(data, { principleIds, existingIds, id }) {
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
  if (existingIds.has(id)) issues.push(`词条 id "${id}" 已存在（与现有词条或受体重名）`);
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
  return { ...normalized, verdict };
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

async function runNew(opts, principleIds, existingIds, reference, referenceFull) {
  const [nameCn, nameEnArg] = opts.positional;
  if (!nameCn) {
    console.error('❌ --new 模式需要提供中文名：npm run generate -- --new 中文名 [英文名]');
    return [{ id: '(new)', ok: false, error: '缺少中文名' }];
  }
  console.log(`\n🆕 新建词条：${nameCn}${nameEnArg ? ` / ${nameEnArg}` : ''}`);

  // 1) frontmatter（结构化 JSON）
  let fm;
  if (opts.mock) {
    fm = JSON.parse(JSON.stringify(matter(fs.readFileSync(path.join(DRUGS_DIR, 'clozapine.md'), 'utf-8')).data));
    fm.name_en = nameEnArg || fm.name_en;
    fm.id = undefined;
  } else {
    const raw = await callGemini(
      buildFrontmatterPrompt({ nameCn, nameEn: nameEnArg, principleIds }),
      { json: true, model: opts.model }
    );
    try {
      fm = parseJsonBlock(raw);
    } catch (error) {
      console.error(`   ❌ frontmatter JSON 解析失败：${error.message}`);
      return [{ id: nameCn, ok: false, error: 'JSON 解析失败' }];
    }
  }

  const id = opts.id || slugifyId(nameEnArg || fm.name_en || nameCn);
  // 注意展开顺序：id / name_cn 必须由我们决定，不能被模型返回的同名字段覆盖
  const data = { ...fm, id, name_cn: nameCn };

  // 2) 校验
  const issues = validateNewEntry(data, { principleIds, existingIds, id });
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
    console.error(`   ❌ 文件已存在：${path.relative(ROOT, file)}（如需重写正文请用：npm run generate -- ${id}）`);
    return [{ id, ok: false, error: '文件已存在' }];
  }
  fs.writeFileSync(file, content, 'utf-8');
  console.log(`   ✅ 已创建 src/content/drugs/${id}.md（正文 ${text.length} 字）`);
  return [{ id, ok: true, length: text.length }];
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
  console.log(`   模型：${opts.model}${opts.mock ? `（mock=${opts.mock}，不调用 API）` : ''}`);
  console.log(`   词条库：${entries.size} 个药物词条 / ${principleIds.size} 个受体词条`);

  if (!opts.mock && !API_KEY) {
    console.error('\n❌ 缺少 GEMINI_API_KEY。请在 v2/.env 中配置（可参考 v2/.env.example），或先用 --mock 自测。');
    process.exit(1);
  }

  // 目标选择
  let targets = [];
  if (opts.newEntry) {
    const results = await runNew(opts, principleIds, existingIds, referenceBody, referenceFull);
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

选项：--dry-run  --mock[=good|bad|short|latex]  --lenient  --yes  --delay=3000  --model=xxx`);
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
