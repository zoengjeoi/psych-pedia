# PsychPedia（精神药理学临床速查百科）

面向临床医生的精神药理学速查站。Astro 5 静态多页应用（MPA），Tailwind v4，零/极少 JS。
线上：psychpedia.me（Netlify）。

## 内容源与结构

- **唯一内容源**：`src/content/drugs/*.md`（药物，84 条）与 `src/content/principles/*.md`（受体/转运体/通道/假说，25 条）。Astro 构建时直接读取，**没有 JSON 同步步骤**，也不存在手改 JSON 的问题。
- frontmatter schema 定义在 `src/lib/content-schema.mjs`（zod），分类白名单在 `src/lib/taxonomy.mjs`（`DRUG_CATEGORY_ORDER`）。
- 词条渲染：`src/components/DrugArticle.astro`（药物）/ `PrincipleArticle.astro`（受体）；markdown 管线在 `src/lib/markdown.ts`（自动内链、下标、引用标签等）。
- 靶点雷达为 SSR 直出 SVG（`src/components/RadarChart.astro`），link_id 跳转受 validIds 白名单保护。

## 常用命令

```bash
npm run dev              # 本地开发 http://localhost:4321
npm run build            # 构建到 dist/
npm run check            # astro check（保持 0 错误）
npm run generate -- <id> [...]    # Gemini 重写词条正文（frontmatter 保留，自动备份 .backups/）
npm run generate -- --new 中文名 [英文名]   # AI 新建整条药物词条
npm run generate -- --receptor 受体名       # AI 新建受体词条
npm run generate -- --test-search           # 自测审稿搜索 grounding 通道
node scripts/scan-evidence.cjs              # 循证体检（营销词/地位断言/机制当事实）
node qa-check.cjs                           # 构建产物回归（内链/PWA 预缓存/页面重量）
```

生成管线读根目录 `.env`：`GEMINI_API_KEY` 之外可设
`GEMINI_REVIEW_MODEL`（审稿模型，双 AI 流水线）与 `GEMINI_GROUNDING=1`（审稿时联网核实批准状态）。
密钥只在本机脚本进程内使用，绝不出现在任何输出或提交里。

## 内容写作规范（循证要求，重要）

词条面向临床决策，立场是**循证、中立、去营销化**。写作与审校时遵守：

1. **三层证据**：机制推导 → 写“理论上/有望”；厂商主张/说明书宣称 → 写“厂商宣称”；
   随机对照试验（RCT）/荟萃分析 → 才可写成既成事实。**已知试验数据与机制推论相反时，必须如实写出矛盾**。
2. **地位断言需证据**：“首选/一线/金标准/最佳”必须有指南推荐或头对头/荟萃支持；
   同类药之间（各 SSRI 间、各 SGA 间）无优效证据时**禁止写谁优于谁**。正确范式：
   “对强迫思维和行为有较好的疗效。但 Meta 分析并不认为氟伏沙明治强迫症比其他 SSRI 更好，指南也并未首选推荐氟伏沙明。”
3. **禁营销式用语**：卓越/完美/彻底改变/革命性/里程碑（药物评价语境）/强效逆转/独一无二/绝对安全。
   金标准确有指南支持时可保留（如氯氮平之于难治性精神分裂症），但要有据可查。
4. **批准状态按地区分别核实**：适应症表三列 NMPA/FDA/EMA 各以当地官方说明书为准。**中国说明书通常比 FDA 保守，
   绝不要把 FDA 的适应症默认当作中国也已批准**（典型错误：舍曲林在中国只获批 MDD+OCD，却标成惊恐障碍、PTSD 也已批准）。
   吃不准用 ❔ 加 `[需核实]`，宁缺毋滥。国内超说明书用法优先参考《广东省药学会超药品说明书用药目录》（年度更新）：
   未获 NMPA 批准但在该目录内的，中国列填 ❌、备注写明"超说明书用法"及目录来源。
   全库核查工具：`node scripts/check-indications.mjs`（flash + 搜索，输出报告供人工复核）。
5. **超说明书用法**：必须明示“超说明书”，有对照试验证据的写出证据强度，推广驱动的用法谨慎收录。

合规检查：改动词条后跑 `node scripts/scan-evidence.cjs` 复查；新词条生成时审核模型会按上述四维
（硬伤/循证/hype/过时）挑错并自动回修。

## 部署与协作（重要）

- **绝不直接 push main**：Netlify 免费额度按次计费，生产部署每次消耗 15 credits。
  流程固定为：改动 → push 到 `dev` 分支 → 开 Pull Request → 用 Deploy Preview 验收 → 用户确认后 merge。
- `tools/` 与 `.env` 是敏感文件，不提交。
- 构建产物 `dist/`、`.backups/`、`.zcode/`、`v2/` 不提交。
