#!/usr/bin/env node
/**
 * 一次性内容规范化脚本：清理 v2/src/content 下词条标题的「AI 腔」。
 *
 * 规则（只匹配整行 `## ` 标题，不动正文）：
 *   药物代谢Dynamics和服药方式[Dosing]      -> 药物代谢和服药方式
 *   Counseling (患者教育) / Counseling（患者教育 FAQ） 等 -> 患者教育
 *   最佳临床实践(理想病人) / - 理想病人 Ideal Candidate   -> 理想病人
 *   概况 Overview / 药物机制 Mechanism / 指南定位 Guideline Positioning /
 *   代谢途径和药物相互作用 Metabolism & DDI / 不良反应 Adverse Effects -> 纯中文
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contentDir = path.resolve(__dirname, '..', 'src', 'content');

// [正则(匹配整个标题行,去掉行尾空白后), 替换标题]
const RULES = [
  [/^## 药物代谢Dynamics和服药方式()?Dosing$/u, '## 药物代谢和服药方式'],
  [/^## 药物代谢Dynamics和服药方式$/u, '## 药物代谢和服药方式'],
  [/^## Counseling\s*[（(]\s*患者教育(\s*FAQ)?\s*[)）]$/u, '## 患者教育'],
  [/^## 最佳临床实践\s*[（(]?\s*[-–—]?\s*理想病人\s*(Ideal Candidate)?\s*[)）]?$/u, '## 理想病人'],
  [/^## 概况 Overview\s*$/u, '## 概况'],
  [/^## 药物机制 Mechanism$/u, '## 药物机制'],
  [/^## 指南定位 Guideline Positioning$/u, '## 指南定位'],
  [/^## 代谢途径和药物相互作用 Metabolism & DDI$/u, '## 代谢途径和药物相互作用'],
  [/^## 不良反应 Adverse Effects$/u, '## 不良反应'],
  // ---- 三级标题：黑框警告等重复英文注解 ----
  [/^### ⚠️\s*黑框警告级别提示\s*[（(]\s*基于\s*EMA及NMPA说明书\s*[)）]$/u, '### ⚠️ 黑框警告级别提示（基于 EMA/NMPA 说明书）'],
  [/^### ⚠️\s*黑框警告\s*[（(]\s*FDA针对所有苯二氮䓬类药物\s*[)）]$/u, '### ⚠️ 黑框警告（FDA：所有苯二氮䓬类）'],
  [/^### ⚠️\s*警告\s*[（(]\s*FDA Class Warning\s*[)）]$/u, '### ⚠️ FDA 警告'],
  [/^### ⚠️\s*黑框警告\s*[（(]\s*(Black Box Warnings?|Boxed Warning|FDA Boxed Warning|FDA Black Box Warning|FDA|Class Effect|FDA标准)\s*[)）]$/u, '### ⚠️ 黑框警告'],
  [/^### ⚠️\s*肝脏警告\s*[（(]\s*Hepatotoxicity Warning\s*[)）]$/u, '### ⚠️ 肝脏警告'],
  [/^### 绝对禁忌症\s*[（(]\s*Contraindications\s*[)）]$/u, '### 绝对禁忌症'],
  [/^### 停药反应\s*[（(]\s*Withdrawal Syndrome\s*[)）]$/u, '### 停药反应'],
  [/^### 肝功能监测要求表\s*[（(]\s*CRITICAL\s*[)）]$/u, '### 肝功能监测要求表'],
  [/^### 重要DDI表\s*[（(]\s*主要为药效学相互作用\s*[)）]$/u, '### 重要药物相互作用（主要为药效学）'],
  [/^### 重要药物相互作用\s*[（(]\s*DDI\s*[)）]\s*表$/u, '### 重要药物相互作用'],
  [/^### 重要(药物)?DDI.*表.*$/u, '### 重要药物相互作用'],
  [/^### ⚠️\s*黑框警告\s*[（(]\s*FDA\/NMPA\s*[)）]$/u, '### ⚠️ 黑框警告（FDA/NMPA）'],
];


// 汇报用：抓出所有「中文后跟英文单词」的标题，人工复核漏网之鱼
const SUSPICIOUS = /## .*[\u4e00-\u9fff][\s(]*[A-Za-z]{2,}.*$/u;

let changedFiles = 0;
let changedLines = 0;
const remaining = [];

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      walk(p);
      continue;
    }
    if (!name.endsWith('.md')) continue;

    const src = fs.readFileSync(p, 'utf-8');
    let fileChanged = false;
    const outLines = src.split('\n').map((line) => {
      const trimmedEnd = line.replace(/\s+$/u, '');
      if (!trimmedEnd.startsWith('##')) return line;
      for (const [re, replacement] of RULES) {
        if (re.test(trimmedEnd)) {
          // 规则命中但结果与原文相同（例如已是统一写法）时不算改动，
          // 否则每次运行都会重写文件、报告「N 个文件被改写」，看起来不幂等。
          if (replacement === trimmedEnd) return line;
          fileChanged = true;
          changedLines++;
          return replacement;
        }
      }
      if (SUSPICIOUS.test(trimmedEnd)) {
        remaining.push(`${path.relative(contentDir, p)}: ${trimmedEnd}`);
      }
      return line;
    });

    if (fileChanged) {
      fs.writeFileSync(p, outLines.join('\n'), 'utf-8');
      changedFiles++;
    }
  }
}

walk(contentDir);
console.log(`✅ 规范化完成：${changedFiles} 个文件，${changedLines} 行标题被改写`);
if (remaining.length) {
  console.log(`\n⚠️ 以下标题仍含英文单词（请人工确认是否处理）：`);
  for (const r of [...new Set(remaining)]) console.log('  ' + r);
}
