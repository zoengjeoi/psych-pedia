/**
 * 站点 QA 回归检查（构建后运行）：node qa-check.cjs
 *  1. 全站内链完整性（AI 生成的正文/雷达偶发硬编码不存在的条目 id）
 *  2. PWA 预缓存清单完整性（条目数/体积/缺失）
 *  3. 页面重量 Top 榜
 */
const fs = require('fs');
const path = require('path');

function walk(d, o = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p, o);
    else o.push(p);
  }
  return o;
}

const exists = (p) => {
  const clean = decodeURIComponent(p.split('#')[0].split('?')[0]);
  if (!clean) return true;
  const full = path.join('dist', clean);
  if (fs.existsSync(full) && fs.statSync(full).isFile()) return true;
  return fs.existsSync(path.join(full, 'index.html')) || fs.existsSync(full + '.html');
};

// 1) 内链完整性
const htmlFiles = walk('dist').filter((f) => f.endsWith('.html'));
const missing = new Map();
let totalLinks = 0;
for (const f of htmlFiles) {
  const h = fs.readFileSync(f, 'utf8');
  for (const m of h.matchAll(/href="(\/[^"]*)"/g)) {
    totalLinks++;
    if (!exists(m[1])) {
      const key = m[1];
      if (!missing.has(key)) missing.set(key, []);
      if (missing.get(key).length < 3) missing.get(key).push(path.relative('dist', f));
    }
  }
}
console.log('== 内链完整性 ==');
console.log('内链总数:', totalLinks, '| 断链:', missing.size);
if (missing.size) {
  for (const [k, v] of missing) console.log('  ' + k + '  ← ' + v.join(', '));
  process.exitCode = 1;
}

// 2) PWA 预缓存
const swPath = 'dist/sw.js';
if (fs.existsSync(swPath)) {
  const sw = fs.readFileSync(swPath, 'utf8');
  const urls = [...sw.matchAll(/[{,]url:"([^"]+)"/g)].map((m) => m[1]);
  const isPage = (u) => {
    const p = path.join('dist', u);
    return fs.existsSync(path.join(p, 'index.html')) || (u === '/' && fs.existsSync('dist/index.html'));
  };
  const norm = (u) => u.replace(/^\//, '').replace(/\/$/, '');
  let bytes = 0;
  let missingAssets = 0;
  let htmlPages = 0;
  let demoIn = false;
  for (const u of urls) {
    const p = path.join('dist', u);
    if (fs.existsSync(p)) bytes += fs.statSync(p).size;
    else if (fs.existsSync(p + '.html')) bytes += fs.statSync(p + '.html').size;
    else missingAssets++;
    if (isPage(u)) htmlPages++;
    if (norm(u) === 'demo/5ht2a') demoIn = true;
  }
  console.log('\n== PWA 预缓存 ==');
  console.log('条目:', urls.length, '| 体积:', (bytes / 1048576).toFixed(1) + 'MB', '| 缺失:', missingAssets);
  console.log('HTML 页数:', htmlPages, '| demo 页在列:', demoIn ? '是' : '否');
}

// 3) 页面重量
const sizes = htmlFiles
  .map((f) => ({ f: path.relative('dist', f).split(path.sep).join('/'), kb: Math.round(fs.statSync(f).size / 1024) }))
  .sort((a, b) => b.kb - a.kb);
console.log('\n== 页面重量（未压缩 HTML）==');
console.log('总量:', (sizes.reduce((s, x) => s + x.kb, 0) / 1024).toFixed(1) + 'MB /', sizes.length, '页');
sizes.slice(0, 5).forEach((s) => console.log(`  ${s.kb}KB  ${s.f}`));
