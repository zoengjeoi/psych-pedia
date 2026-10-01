#!/usr/bin/env node
/**
 * 命令行上传图片到 GitHub 图床，输出可直接粘贴的 Markdown 片段。
 * 用法：npm run upload-image -- <图片路径> [宽度px] [alt文字]
 *   例：npm run upload-image -- D:/shot.png 400 喹硫平剂量图
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, uploadImage } from './image-upload-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(root);

const [file, width, ...altParts] = process.argv.slice(2);
if (!file) {
  console.error('用法：npm run upload-image -- <图片路径> [宽度px] [alt文字]');
  process.exit(1);
}
const abs = path.resolve(process.cwd(), file);
if (!fs.existsSync(abs)) {
  console.error(`文件不存在：${abs}`);
  process.exit(1);
}

try {
  const result = await uploadImage({
    buffer: fs.readFileSync(abs),
    filename: path.basename(abs),
    alt: altParts.join(' '),
    width: width ? Number(width) : undefined,
  });
  console.log('\n✅ 上传成功');
  console.log(`   路径：${result.path}`);
  console.log(`   直链：${result.url}`);
  console.log(`\nMarkdown（已复制到输出，直接粘贴即可）：\n${result.markdown}\n`);
} catch (error) {
  console.error(`\n❌ ${error.message}\n`);
  process.exit(1);
}
