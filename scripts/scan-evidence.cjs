#!/usr/bin/env node
/**
 * 循证体检扫描（Evidence scan）：扫 src/content 下的词条 md，找出
 *   1) 营销式用语（卓越/完美/彻底改变/革命性/里程碑/划时代/强效逆转/独一无二/绝对安全/天才般）
 *   2) frontmatter tags 里的地位断言（首选/金标准/最佳/最优）—— 与已修正的氟伏沙明同类问题
 *   3) 正文里的地位断言抽样（金标准/首选 等，正文量大，按文件汇总）
 *   4) "机制当事实"句式（对冲/逆转 + 胃肠|认知|恶心|性功能）——需人工判断
 *   5) [需核实] 标记统计
 *
 * 用法：
 *   node scripts/scan-evidence.cjs            # 汇总 + 明细
 *   node scripts/scan-evidence.cjs --brief    # 只看汇总
 *   node scripts/scan-evidence.cjs --hype     # 只列营销词命中
 *
 * 定位：advisory（提示性），不阻断。生成管线里的硬校验见 generate-with-gemini.mjs。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIRS = [path.join(ROOT, 'src', 'content', 'drugs'), path.join(ROOT, 'src', 'content', 'principles')];

const PATTERNS = {
  hype: {
    label: '营销式用语',
    re: /卓越|完美|彻底改变|革命性|里程碑|划时代|强效逆转|独一无二|绝对安全|天才般|历史性突破|重大突破/g,
  },
  assertion: {
    label: '地位断言（金标准/首选）',
    re: /金标准|首选|最佳拍档|黄金标准/g,
  },
  mechFact: {
    label: '机制当事实（需人工判断）',
    re: /对冲[^。\n]{0,24}(胃肠|恶心|消化道|性功能|认知)|(胃肠|恶心|消化道|认知)[^。\n]{0,24}对冲|强效逆转[^。\n]{0,20}(认知|缺损)/g,
  },
  verify: { label: '[需核实] 标记', re: /\[需核实[^\]]*\]/g },
};

const files = [];
for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.md')) files.push(path.join(dir, f));
  }
}

const args = process.argv.slice(2);
const brief = args.includes('--brief');
const only = args.includes('--hype') ? 'hype' : null;

const hits = { hype: [], assertion: [], mechFact: [], verify: [] };
const byFile = { hype: new Map(), assertion: new Map(), mechFact: new Map(), verify: new Map() };

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/);
  const inFrontmatterEnd = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  lines.forEach((line, idx) => {
    for (const [key, { re }] of Object.entries(PATTERNS)) {
      re.lastIndex = 0;
      const matches = line.match(re);
      if (!matches) continue;
      const inFm = inFrontmatterEnd > 0 && idx < inFrontmatterEnd;
      // 标题断言只在 frontmatter（tags 等）里单独高亮；正文断言量大，仅汇总计数
      const tag = key === 'assertion' && inFm ? 'assertion' : key;
      if (only && tag !== only) continue;
      hits[key] = hits[key] || [];
      const record = { file: rel, line: idx + 1, text: line.trim().slice(0, 110), fm: inFm };
      hits[key].push(record);
      byFile[key].set(rel, (byFile[key].get(rel) || 0) + matches.length);
    }
  });
}

const total = (k) => hits[k].length;

console.log('🔬 PsychPedia 循证体检（advisory）');
console.log(`   扫描 ${files.length} 个词条文件\n`);

if (!only) {
  console.log('── 汇总 ──────────────────────────────');
  for (const [k, { label }] of Object.entries(PATTERNS)) {
    console.log(`   ${label}：${total(k)} 处 / ${byFile[k].size} 个文件`);
  }
  console.log('');
}

const showFmAssertions = () => {
  const fm = hits.assertion.filter((h) => h.fm);
  if (!fm.length) return;
  console.log(`── frontmatter 断言（${fm.length} 处，优先修正） ──`);
  for (const h of fm) console.log(`   ${h.file}:${h.line}  ${h.text}`);
  console.log('');
};

if (only === 'hype' || !brief) {
  if (only === 'hype' || total('hype')) {
    console.log(`── 营销式用语明细（${total('hype')} 处） ──`);
    for (const h of hits.hype) console.log(`   ${h.file}:${h.line}  ${h.text}`);
    console.log('');
  }
}

if (!only) {
  showFmAssertions();
  if (!brief) {
    console.log(`── 机制当事实（${total('mechFact')} 处，需人工判断） ──`);
    for (const h of hits.mechFact) console.log(`   ${h.file}:${h.line}  ${h.text}`);
    console.log('');
    // 正文断言只给文件分布 top
    const bodyAssert = new Map();
    for (const h of hits.assertion) if (!h.fm) bodyAssert.set(h.file, (bodyAssert.get(h.file) || 0) + 1);
    const top = [...bodyAssert.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    console.log(`── 正文地位断言分布（共 ${hits.assertion.filter((h) => !h.fm).length} 处，全库）──`);
    for (const [f, n] of top) console.log(`   ${n} 处  ${f}`);
    console.log('   （正文一行量最大，多数合法；优先复核营销词与 frontmatter 命中的文件）');
    console.log('');
  }
}

console.log('💡 hype/assertion/mechFact 命中需人工复核；修正范式见 CLAUDE.md 循证规范。');
