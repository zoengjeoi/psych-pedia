#!/usr/bin/env node
/**
 * 图标生成：白色圆角瓷砖 + 品牌渐变 Ψ（描边，不依赖系统字体）。
 * 产出：
 *   public/favicon.svg                 矢量源（浏览器标签页首选）
 *   public/favicon-{16,32,48}.png      位图回退
 *   public/favicon.ico                 多尺寸 ICO（PNG 载荷）
 *   public/icons/apple-touch-icon-180.png
 *   public/icons/icon-{192,512}.png    PWA any
 *   public/icons/icon-512-maskable.png PWA maskable（Ψ 居安全区内）
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..', 'public');
const iconsDir = path.join(publicDir, 'icons');

// 品牌渐变（与站内 .brand-gradient 同源：深青 -> 天青 -> 紫）
const DEFS = `
  <linearGradient id="ppg" x1="14" y1="10" x2="50" y2="54" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#0369a1"/>
    <stop offset="0.48" stop-color="#0ea5e9"/>
    <stop offset="1" stop-color="#7c3aed"/>
  </linearGradient>`;

// Ψ：杯形双叉 + 中柱（微降出头），圆头描边
const PSI = `
  <g stroke="url(#ppg)" stroke-width="6" stroke-linecap="round" fill="none">
    <path d="M19.5 16v14.5a12.5 12.5 0 0 0 25 0V16"/>
    <path d="M32 12.5v36.5"/>
  </g>`;

/** 标签页/小尺寸：白色圆角瓷砖 + 细边框 */
const tileSvg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
  <defs>${DEFS}</defs>
  <rect x="1.25" y="1.25" width="61.5" height="61.5" rx="14.5" fill="#ffffff" stroke="#d9e2ee" stroke-width="1.5"/>
  ${PSI}
</svg>`;

/** 满幅白底（PWA / Apple 触屏图标，由系统自行裁切圆角），Ψ 按比例缩放居中 */
const fullBleedSvg = (size, scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
  <defs>${DEFS}</defs>
  <rect width="64" height="64" fill="#ffffff"/>
  <g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${PSI}</g>
</svg>`;

async function png(svg, size, out) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
  console.log('  ✓', path.relative(publicDir, out), `${size}x${size}`);
}

// PNG 载荷的多尺寸 ICO（Vista+ 支持）
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const dirEntries = [];
  let offset = 6 + 16 * entries.length;
  const datas = [];
  for (const { size, buffer } of entries) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buffer.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buffer.length;
    dirEntries.push(e);
    datas.push(buffer);
  }
  return Buffer.concat([header, ...dirEntries, ...datas]);
}

async function main() {
  fs.mkdirSync(iconsDir, { recursive: true });

  // 矢量源
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), tileSvg(64));
  console.log('  ✓ favicon.svg');

  // 位图回退
  for (const s of [16, 32, 48]) {
    await png(tileSvg(s), s, path.join(publicDir, `favicon-${s}.png`));
  }

  // ICO
  const icoParts = [];
  for (const s of [16, 32, 48]) {
    const buf = await sharp(Buffer.from(tileSvg(s))).resize(s, s).png().toBuffer();
    icoParts.push({ size: s, buffer: buf });
  }
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), buildIco(icoParts));
  console.log('  ✓ favicon.ico');

  // PWA / Apple
  await png(fullBleedSvg(180, 0.74), 180, path.join(iconsDir, 'apple-touch-icon-180.png'));
  await png(fullBleedSvg(192, 0.74), 192, path.join(iconsDir, 'icon-192.png'));
  await png(fullBleedSvg(512, 0.74), 512, path.join(iconsDir, 'icon-512.png'));
  await png(fullBleedSvg(512, 0.58), 512, path.join(iconsDir, 'icon-512-maskable.png'));

  // 预览大图（供人工检查）
  await png(tileSvg(256), 256, path.join(iconsDir, 'preview-256.png'));
  console.log('完成');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
