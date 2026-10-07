---
name: add-entry
description: 为 PsychPedia 精神药理学百科新增药物、受体或生物学假说词条。当用户说"新增/加一种药/加个词条/补充 XX 药物/XX 受体/加个假说"或类似请求时使用。包含从建词条、生成、审核到验证的完整工作流。
---

# 新增词条工作流(PsychPedia)

先读项目根 `CLAUDE.md`(每会话自动加载)了解架构、内容规范与部署注意事项。核心原则:
**`src/content/` 下的 md 是唯一内容源**（Astro 构建时直接读取，没有 JSON 同步步骤）。

## 0. 循证底线（所有词条通用）

见 CLAUDE.md「内容写作规范」。要点:三层证据（理论上/厂商宣称/RCT-荟萃）、地位断言（首选/一线/金标准）
必须有指南或头对头证据、禁营销式形容词、批准状态存疑加 `[需核实]`、超说明书用法要明示。
写完/改完跑 `node scripts/scan-evidence.cjs` 复查。

## 1. 澄清词条信息

### 药物(drug)
- 通用名(中文 + 英文)、商品名
- 分类:从 `src/lib/taxonomy.mjs` 的 `DRUG_CATEGORY_ORDER` 中选择,**可多分类**(如安非他酮 = NDRI + ADHD 非兴奋剂)。不要自造分类名
- 受体靶点(stahl_radar):labels / values(0–10 亲和力)/ link_ids —— **link_ids 必须对应 `src/content/principles/` 已有的 id**
- 临床要点(pearls)、PK 参数(半衰期/蛋白结合/代谢/达峰)、市场信息(价格/医保/妊娠分级)
- 用户没给全时,用标准临床参考值补齐,并在报告里标注"需人工核对"

### 原理/假说(principle)
- 受体:type=`receptor`;转运体:`transporter`;离子通道:`ion_channel`(三者都进"受体百科")
- 假说(发病机制类,如多巴胺假说、单胺假说):type=`hypothesis`(进"生物学假说")
- 受体条目 frontmatter 含 `receptor_info`(干预模式表/靶向药物 Ki 排名/临床问答),正文为自由结构
- 标题用"首词"约定:如 `D2 多巴胺受体`、`5-HT 转运体` —— 首词会被自动匹配成跳转链接

## 2. 创建/修改内容

- 药物:`src/content/drugs/{id}.md`(id 小写英文;frontmatter id 必须小写)
- 原理:`src/content/principles/{id}.md`
- 严格按 `src/lib/content-schema.mjs` 的 zod schema 写 frontmatter;分类用全角括号、统一命名
- 优先用生成管线写正文（自带双 AI 循证审稿），frontmatter 可以人工精修

## 3. 生成与审核（推荐路径）

```bash
npm run generate -- --dry-run --dump <id>   # 预览 AI 重写正文（不写盘）
npm run generate -- <id>                    # 确认后写盘（frontmatter 保留，自动备份）
npm run generate -- --new 中文名 [英文名]    # 新建整条药物词条
npm run generate -- --receptor 受体名        # 新建受体词条
```

- 管线 = 写手模型出稿 → 程序校验 → **审稿模型循证复核（硬伤/循证/hype/过时四维）** → 问题回喂修复一轮。
- 审稿模型由 `.env` 的 `GEMINI_REVIEW_MODEL` 指定；`GEMINI_GROUNDING=1` 时审稿阶段带 Google 搜索
  （用于核实批准状态/指南新近性；可用 `--test-search` 自测通道）。
- 审稿意见只是建议，最终写盘稿仍需人工复核 `[需核实]` 标记与 Ki 数值。

## 4. 验证

- `npm run dev`（http://localhost:4321）打开新词条:版式、雷达 link_id 跳转、内链（受体术语自动链接）
- `npm run build` 与 `npm run check` 通过
- `node scripts/scan-evidence.cjs` 无新增营销词/断言命中
- `node qa-check.cjs`（全站回归:内链完整性 / PWA 预缓存 / 页面重量）

## 5. 报告

列出:新增/修改的词条、所属分类、雷达 link_ids 对齐情况、scan-evidence 复查结果，以及
**需要人工核对的临床数据**（尤其是批准状态与精确数值）。不要声称"已确认临床准确",除非数据由用户提供。

## 6. 提交（遵守 Netlify 额度策略）

改动提交到 `dev` 分支并开 Pull Request，用 Deploy Preview 验收；**绝不直接 push main**
（生产部署消耗 15 credits/次）。merge 需用户明确确认。
