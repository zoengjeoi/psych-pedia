/**
 * 一次性生成器：为不支持 oklch/color-mix 的老内核（微信 X5 等）生成 CSS 兼容回退。
 * 读取 dist CSS → 提取 oklch 色板与 color-mix 工具类 → 以 Tailwind v3 等值 sRGB 生成
 * @supports not 回退块 → 追加到 src/styles/global.css（幂等，带标记）。
 */
const fs = require('fs');
const path = require('path');

const cssFile = fs.readdirSync('dist/_astro').filter((f) => f.endsWith('.css')).map((f) => path.join('dist/_astro', f))[0];
const css = fs.readFileSync(cssFile, 'utf8');

// Tailwind v3 等值 sRGB 色板
const V3 = {
  amber: { 50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f' },
  cyan: { 50: '#ecfeff', 100: '#cffafe', 200: '#a5f3fc', 300: '#67e8f9', 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490', 800: '#155e75', 900: '#164e63' },
  emerald: { 50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b' },
  indigo: { 50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81' },
  red: { 50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 800: '#991b1b', 900: '#7f1d1d' },
  rose: { 500: '#f43f5e', 600: '#e11d48' },
  sky: { 50: '#f0f9ff', 200: '#bae6fd', 300: '#7dd3fc', 400: '#38bdf8', 500: '#0ea5e9', 600: '#0284c7', 900: '#0c4a6e' },
  slate: { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a' },
  teal: { 50: '#f0fdfa', 100: '#ccfbf1', 300: '#5eead4', 400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a' },
  violet: { 100: '#ede9fe', 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6' },
  yellow: { 400: '#facc15' },
  // medical 色板（global.css 中已是 hex，这里供 color-mix 回退换算）
  'medical-dark': '#0f1115', 'medical-dark-alt': '#12151b', 'medical-panel': '#161b22',
  'medical-surface': '#1a2029', 'medical-surface-alt': '#232b36', 'medical-line': '#232b36',
  'medical-primary': '#0ea5e9', 'medical-primary-bright': '#7fb3e0', 'medical-primary-deep': '#075ea8',
  white: '#ffffff', black: '#000000',
};
const hexOf = (varName) => {
  const m = varName.match(/^--color-([a-z-]+?)-(\d{2,3})$/);
  if (m && V3[m[1]] && V3[m[1]][m[2]]) return V3[m[1]][m[2]];
  if (V3[varName.replace('--color-', '')]) return V3[varName.replace('--color-', '')];
  return null;
};

// 1) 色板回退：--color-*: oklch(...) → hex
const paletteLines = [];
for (const m of css.matchAll(/(--color-[a-z0-9-]+):oklch\([^)]*\)/g)) {
  const hex = hexOf(m[1]);
  if (hex) paletteLines.push(`    ${m[1]}: ${hex};`);
}
const paletteBlock = paletteLines.length
  ? [...new Set(paletteLines)].sort().join('\n')
  : '';

// 2) color-mix 工具类回退：选择器 + 原声明 → rgba 等值
const toRgba = (varName, pct) => {
  const hex = hexOf(varName);
  if (!hex) return null;
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${(pct / 100).toFixed(2)})`;
};

const ruleRe = /([^{}]+)\{([^{}]*color-mix\([^{}]*\)[^{}]*)\}/g;
const fallbackRules = [];
for (const m of css.matchAll(ruleRe)) {
  const selector = m[1].trim().replace(/\s+/g, ' ');
  if (selector.includes(':hover') || selector.includes('@media')) continue; // hover/媒体态不回退
  const decls = m[2].split(';').map((d) => d.trim()).filter(Boolean);
  const out = [];
  for (const decl of decls) {
    const cm = decl.match(/^(background-color|color|border-color|--tw-[a-z-]+):color-mix\(in oklab, *var\((--color-[a-z0-9-]+)\) *([0-9.]+)%(?: *, *transparent)?\)$/i);
    if (!cm) { out.push(decl); continue; }
    const rgba = toRgba(cm[2], parseFloat(cm[3]));
    out.push(rgba ? `${cm[1]}:${rgba}` : decl);
  }
  if (out.some((d) => d.includes('rgba('))) {
    fallbackRules.push(`  ${selector} {\n    ${out.join(';\n    ')};\n  }`);
  }
}

// 3) 组装回退块（纯 sRGB 无分层覆盖；不用 @supports——lightningcss 会按现代目标把它删掉；
//    hover 态选择器不回退（老浏览器丢失 hover 微交互可接受），避免无条件应用 hover 样式）
const block =
  `\n/* === sRGB 色板回退（自动生成，勿手改；重跑 node patch-oklch-fallback.cjs 再生成） === */\n` +
  (paletteBlock ? `  :root {\n${paletteBlock}\n  }\n` : '') +
  (fallbackRules.length ? fallbackRules.join('\n') + '\n' : '') +
  `/* === sRGB 回退结束 === */\n`;

// 4) 幂等追加到 global.css
const target = path.join(ROOT_PROCESS(), 'src', 'styles', 'global.css');
let g = fs.readFileSync(target, 'utf8');
const START = '/* === oklch/color-mix 兼容回退';
if (g.includes(START)) {
  g = g.slice(0, g.indexOf(START)).trimEnd() + '\n';
}
fs.writeFileSync(target, g.trimEnd() + '\n' + block, 'utf8');
console.log(`✅ 回退块已写入 global.css：色板 ${new Set(paletteLines).size} 项，color-mix 规则 ${fallbackRules.length} 条`);

function ROOT_PROCESS() {
  return process.cwd();
}
