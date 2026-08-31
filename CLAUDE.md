# Psych-Pedia(精神药理学临床速查百科)

React + Vite + Tailwind CDN 单页应用。内容源是 `content/` 下的 Obsidian 风格 Markdown,应用运行时从 `public/*.json` 读取。侧栏/首页读 `drugs-index.json` 与 `principles-index.json`,详情页读 `public/drugs/{id}.json`,酶汇总页读 `public/drugs.json`。

## 数据管线(改内容必看)

唯一内容源是 Markdown;改内容后必须重建 JSON:

1. 编辑 `content/drugs/*.md`(药物)或 `content/principles/*.md`(受体/假说)
2. 运行 `npm run sync` → 生成 `public/drugs-index.json`、`public/principles-index.json`、`public/drugs/{id}.json`、`public/principles/{id}.json`
3. **手动重建 `public/drugs.json`**(sync **不**生成它,酶汇总页靠它)——从 `public/drugs/*.json` 聚合为 `{ "drugs": [...全部...] }`

命令:`npm run dev`(端口 3000)、`npm run build`、`npm run sync`。部署走 Netlify(`netlify.toml`)。Tailwind 是 CDN,新增任意 class 无需构建,直接刷新即可。

## 药物词条 schema(`content/drugs/{id}.md`)

frontmatter:
- `id`(小写英文)、`name_cn`、`name_en`
- `categories[]`:必须用下方分类清单,可多分类
- `tags[]`:临床标签
- `stahl_radar`:`labels[]` / `values[]`(0–10)/ `link_ids[]` —— **`link_ids` 必须对应 `content/principles/` 里存在的 id**(雷达点击靠它跳转)
- `pearls[]`:`{ title, type: danger|warning|success|info, content }`(临床实战笔记)
- `pk_data`:`{ half_life, protein_binding, metabolism, peak_time }`
- `market_info`:`{ price, insurance, pregnancy }`

正文:wiki_content(markdown,支持图片/表格/引用)。

## 原理/假说词条 schema(`content/principles/{id}.md`)

frontmatter:`id`、`type`(`receptor`|`transporter`|`ion_channel` → 侧栏"受体百科";`hypothesis` → 侧栏"生物学假说")、`title`、`subtitle`、`visual_guide`(可选)。

正文:
- 用 `## 简介` 段承载 RichText 简介(该段内提及受体术语会自动生成跳转链接),其余内容作为 wiki_content
- 假说正文提及受体时,用其**标题首词**(如 D2、D3、5-HT1A、NMDA、5-HT 转运体、去甲肾上腺素转运体)即可自动生成跳转链接
- 示例:多巴胺假说 → 正文提 D2/D3;单胺假说 → 提 SERT/NET;谷氨酸假说 → 提 NMDA

## 分类规范

- 只用 `constants.ts` 的 `DRUG_CATEGORY_ORDER` 中的分类;**全角括号**统一命名(如 `SSRI(选择性5-羟色胺再摄取抑制剂)`);一个药可多个分类
- 新增分类前先检查是否已有同义分类,避免"三环类" vs "三环"这类字符不齐导致的重复

## 常见坑

- `content/drugs/KarXT.md` **文件名是大写**,但 frontmatter `id` 是小写 `karxt`;脚本按 frontmatter id 匹配
- `public/drugs.json` 不在 sync 输出里,必须手动重建
- 原理自动跳转依赖 RichText / MarkdownEditor 从 `/principles-index.json` 加载;新增原理后跑一次 sync
- `stahl_radar.link_ids` 指向不存在的原理时,雷达标签点击无跳转(需与 principles 对齐)
- 希腊字母 α/β 所在的分类标题**禁用 CSS `uppercase`**(会渲染成 Α/Β,即 A/B)
- 移动端目录标题应为"目录",不要引入损坏字符
