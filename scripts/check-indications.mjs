#!/usr/bin/env node
/**
 * 批准适应症核查（INDICATION AUDIT）
 *
 * 逐词条核对「临床适应症」表格里的 NMPA / FDA / EMA 批准列与官方说明书是否一致。
 * 背景：该表格由 AI 凭记忆生成，存在系统性偏差——最常见的错误是把 FDA 的适应症
 * 默认当成中国 NMPA 也批准（中国说明书通常更保守），例如舍曲林被误标 NMPA 已批
 * 惊恐障碍与 PTSD。
 *
 * 用法：
 *   node scripts/check-indications.mjs                 # 全库核对（串行，flash + 搜索）
 *   node scripts/check-indications.mjs --limit=3       # 只跑前 3 个（试跑）
 *   node scripts/check-indications.mjs --only=sertraline,escitalopram
 *   node scripts/check-indications.mjs --no-search     # 不联网（仅现场模型知识，质量下降）
 *
 * 输出：
 *   .astro/indications-report.json  完整结构化结果（供程序化应用修正）
 *   .astro/indications-report.md    人工可读报告（按差异数排序）
 *
 * 定位：advisory + 人工复核。脚本不自动改词条——修正由人工确认后应用到 md。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRUGS_DIR = path.join(ROOT, 'src', 'content', 'drugs');
const OUT_DIR = path.join(ROOT, '.astro');

// ---- .env 读取（与 generate-with-gemini.mjs 同口径） ----
function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

const API_KEY = process.env.GEMINI_API_KEY || '';
const BASE_URL = process.env.GEMINI_BASE_URL || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : dflt;
};
const LIMIT = Number(opt('limit', 0)) || 0;
const ONLY = (opt('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const NO_SEARCH = args.includes('--no-search');
const DELAY = Number(opt('delay', 2500)) || 2500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 解析词条 md：frontmatter + 适应症表 ----
function parseDrug(file) {
  const src = fs.readFileSync(file, 'utf-8');
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const name_cn = (fm?.[1].match(/^name_cn:\s*"?([^"\n]+)"?/m) || [])[1]?.trim() ?? '';
  const name_en = (fm?.[1].match(/^name_en:\s*"?([^"\n]+)"?/m) || [])[1]?.trim() ?? '';
  const id = (fm?.[1].match(/^id:\s*"?([^"\n]+)"?/m) || [])[1]?.trim() ?? path.basename(file, '.md');
  // 适应症表：| 适应症 | NMPA批准 | FDA批准 | EMA批准 | ... | 位于「## 临床适应症」之后
  const section = src.split('## 临床适应症')[1]?.split(/\n## /)[0] ?? '';
  const rows = [];
  for (const line of section.split(/\r?\n/)) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 5) continue;
    if (cells[1] === '适应症' || /^-+$/.test(cells[2] ?? '')) continue;
    const [, indication, nmpa, fda, ema] = cells;
    if (!indication || !/(✅|❌|❔)/.test(nmpa ?? '')) continue;
    rows.push({ indication, nmpa, fda, ema });
  }
  return { id, name_cn, name_en, rows };
}

const buildPrompt = ({ name_cn, name_en, rows }) => `你是药品监管信息核查员，正在核对精神科药物词条「批准适应症」表格与官方说明书是否一致。请**联网搜索**核实后再回答。

药物：${name_cn || name_en}（${name_en}）

当前表格（列：适应症 | NMPA批准 | FDA批准 | EMA批准）：
${rows.map((r) => `- ${r.indication}：NMPA ${r.nmpa}，FDA ${r.fda}，EMA ${r.ema}`).join('\n')}

核查规则（重要）：
1. 中国列以 NMPA 批准的**中文说明书**为准。中国说明书通常比 FDA 保守——**绝不要把 FDA 的适应症默认当成中国也已批准**（典型错误：舍曲林在中国只获批抑郁症和强迫症，却被标成惊恐障碍、PTSD 也已批准）。
2. 美国列以 FDA 现行说明书为准；欧盟列以 EMA 为准。
3. 只报告与表格**不一致**的地方；无法确证的写 "unknown" 并简述原因，不要猜。
4. 若某适应症在中国属超说明书使用、但被《广东省药学会超药品说明书用药目录》等权威目录收录，请在 reason 中注明"超说明书用法/目录收录"。

输出**严格 JSON**（不要代码块、不要叙述）：
{"nmpa_approved":["该药在中国实际获批的全部适应症"],"corrections":[{"indication":"","region":"NMPA|FDA|EMA","current":"","correct":"✅|❌|unknown","reason":""}],"confidence":"high|medium|low","notes":""}
表格全部正确时 corrections 为空数组。`;

async function callGemini(prompt, { search }) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({
    apiKey: API_KEY,
    ...(BASE_URL ? { httpOptions: { baseUrl: BASE_URL } } : {}),
  });
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await Promise.race([
        ai.models.generateContent({
          model: MODEL,
          contents: prompt,
          config: {
            temperature: 0.1,
            topP: 0.8,
            maxOutputTokens: 24000,
            ...(search ? { tools: [{ googleSearch: {} }] } : {}),
          },
        }),
        // SDK 无默认超时：卡死的请求会永久挂起，这里强制 120s 上限
        new Promise((_, reject) => setTimeout(() => reject(new Error('请求超时（120s）')), 120000)),
      ]);
      const text = (typeof res.text === 'string' ? res.text : '') || '';
      if (!text.trim()) throw new Error('模型返回空内容');
      return text;
    } catch (error) {
      lastError = error;
      const retriable = /429|500|502|503|504|rate|quota|overload|timeout|超时|ETIMEDOUT|fetch failed|ECONNRESET/i.test(
        String(error?.message ?? error)
      );
      if (!retriable || attempt === 3) break;
      await sleep(attempt === 1 ? 4000 : 10000);
    }
  }
  throw lastError;
}

function parseJson(text) {
  const cleaned = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const attempts = [cleaned];
  // 模型偶尔在字符串里夹裸换行/制表符 → 一律替换为空格再试
  attempts.push(cleaned.replace(/[\u0000-\u001f]/g, ' '));
  const block = cleaned.match(/\{[\s\S]*\}/);
  if (block) {
    attempts.push(block[0]);
    attempts.push(block[0].replace(/[\u0000-\u001f]/g, ' '));
  }
  for (const t of attempts) {
    try {
      return JSON.parse(t);
    } catch {
      /* 继续尝试下一种 */
    }
  }
  throw new Error('JSON 解析失败：' + cleaned.slice(0, 120));
}

async function main() {
  if (!API_KEY) {
    console.error('缺少 GEMINI_API_KEY（.env）');
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const PROGRESS = path.join(OUT_DIR, 'indications-progress.jsonl');

  // 续跑：已完成（progress 里已有）的词条跳过；--fresh 清空重跑
  const done = new Map();
  if (!args.includes('--fresh') && fs.existsSync(PROGRESS)) {
    for (const line of fs.readFileSync(PROGRESS, 'utf-8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (r?.id && !r.error) done.set(r.id, r);
      } catch { /* 忽略坏行 */ }
    }
  } else if (args.includes('--fresh') && fs.existsSync(PROGRESS)) {
    fs.unlinkSync(PROGRESS);
  }

  let drugs = fs.readdirSync(DRUGS_DIR).filter((f) => f.endsWith('.md')).map((f) => parseDrug(path.join(DRUGS_DIR, f)));
  drugs = drugs.filter((d) => d.rows.length); // 跳过没有适应症表的
  if (ONLY.length) drugs = drugs.filter((d) => ONLY.includes(d.id));
  if (LIMIT) drugs = drugs.slice(0, LIMIT);

  console.log(`🔎 批准适应症核查：${drugs.length} 个词条（已完成 ${done.size}）| 模型 ${MODEL} | 搜索 ${NO_SEARCH ? '关' : '开'}`);
  for (let i = 0; i < drugs.length; i++) {
    const d = drugs[i];
    if (done.has(d.id)) continue;
    process.stdout.write(`[${i + 1}/${drugs.length}] ${d.id} … `);
    let record;
    try {
      const raw = await callGemini(buildPrompt(d), { search: !NO_SEARCH });
      const data = parseJson(raw);
      const corrections = Array.isArray(data?.corrections) ? data.corrections : [];
      record = { id: d.id, name_cn: d.name_cn, rows: d.rows, ...data, corrections };
      const n = corrections.length;
      console.log(n ? `⚠️ ${n} 处需修正` : '✅ 一致');
      corrections.forEach((c) => console.log(`      ${c.region} ${c.indication}: ${c.current} → ${c.correct}（${String(c.reason).slice(0, 60)}）`));
    } catch (error) {
      console.log(`❌ 失败：${String(error?.message ?? error).slice(0, 80)}`);
      record = { id: d.id, name_cn: d.name_cn, rows: d.rows, error: String(error?.message ?? error) };
    }
    // 增量落盘：即使中途被杀也有进度（失败记录不写入，下次续跑会重试）
    if (!record.error) {
      fs.appendFileSync(PROGRESS, JSON.stringify(record) + '\n', 'utf-8');
      done.set(d.id, record);
    }
    if (i < drugs.length - 1) await sleep(DELAY);
  }

  const results = [...done.values()];
  fs.writeFileSync(path.join(OUT_DIR, 'indications-report.json'), JSON.stringify(results, null, 1), 'utf-8');

  const withIssues = results.filter((r) => r.corrections?.length).sort((a, b) => b.corrections.length - a.corrections.length);
  const md = [
    '# 批准适应症核查报告',
    '',
    `模型：${MODEL}｜搜索：${NO_SEARCH ? '关' : '开'}｜词条：${results.length}｜有问题：${withIssues.length}`,
    '',
    ...withIssues.flatMap((r) => [
      `## ${r.name_cn || r.id}（${r.id}）— ${r.corrections.length} 处`,
      '',
      ...r.corrections.map((c) => `- **${c.region}** ｜ ${c.indication}：${c.current} → ${c.correct} ｜ ${c.reason}`),
      r.notes ? `- 备注：${r.notes}` : '',
      '',
    ]),
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'indications-report.md'), md, 'utf-8');

  console.log(`\n📊 完成：${withIssues.length}/${results.length} 个词条存在待修正项`);
  console.log('   报告：.astro/indications-report.md（json 同目录）');
  console.log('   ⚠️ AI 核查结果需人工复核后再应用到 md（尤其 NMPA 列）。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
