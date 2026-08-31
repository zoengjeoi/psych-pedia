---
name: add-entry
description: 为 Psych-Pedia 精神药理学百科新增药物、受体或生物学假说词条。当用户说"新增/加一种药/加个词条/补充 XX 药物/XX 受体/加个假说"或类似请求时使用。包含从建词条、跑同步到验证的完整工作流。
---

# 新增词条工作流(Psych-Pedia)

先读项目根 `CLAUDE.md`(每会话自动加载)了解数据管线、schema 与分类规范。核心原则:**content/ 下的 md 是唯一内容源,JSON 一律由 sync 生成,不要手改 JSON**。

## 1. 澄清词条信息

### 药物(drug)
- 通用名(中文 + 英文)、商品名
- 分类:从 `constants.ts` 的 `DRUG_CATEGORY_ORDER` 中选择,**可多分类**(如安非他酮 = NDRI + ADHD 非兴奋剂)。不要自造分类名
- 受体靶点(stahl_radar):labels / values(0–10 亲和力)/ link_ids —— **link_ids 必须对应 `content/principles/` 已有的 id**
- 临床要点(pearls)、PK 参数(半衰期/蛋白结合/代谢/达峰)、市场信息(价格/医保/妊娠分级)
- 用户没给全时,用标准临床参考值补齐,并在报告里标注"需人工核对"

### 原理/假说(principle)
- 受体:type=`receptor`;转运体:`transporter`;离子通道:`ion_channel`(三者都进"受体百科")
- 假说(发病机制类,如多巴胺假说、单胺假说):type=`hypothesis`(进"生物学假说")
- 标题用"首词"约定:如 `D2 多巴胺受体`、`5-HT 转运体`、`多巴胺转运体` —— 首词会被自动匹配成跳转链接

## 2. 创建 md 文件

- 药物:`content/drugs/{id}.md`(id 小写英文;注意文件名可能被要求大写,但 frontmatter id 必须小写)
- 原理:`content/principles/{id}.md`
- 严格按 `CLAUDE.md` 中的 schema 写 frontmatter;假说正文用 `## 简介` 段承载可跳转简介,正文里提及受体术语(如 D2、NMDA、5-HT)以生成词条跳转
- 分类用全角括号、统一命名

## 3. 重建数据

```bash
npm run sync          # 生成 drugs-index / principles-index / 各详情 JSON
# 若是新增药物:再手动重建 public/drugs.json(酶汇总页用,sync 不生成它)
node -e "const fs=require('fs'),path=require('path');const d=fs.readdirSync('public/drugs').filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join('public/drugs',f),'utf-8'))).sort((a,b)=>a.id.localeCompare(b.id));fs.writeFileSync('public/drugs.json',JSON.stringify({drugs:d},null,2),'utf-8');console.log('drugs.json 已重建:',d.length,'种');"
```

## 4. 验证

- `npm run dev` 打开 localhost:3000
- 首页/侧栏出现新词条,分类归入正确组
- 详情页可打开;雷达 link_id 点击能跳转到对应原理页;假说简介里的受体名词可点击跳转
- `npm run build` 通过

## 5. 报告

列出:新增的词条、所属分类、雷达 link_ids 对齐情况、以及**需要人工核对的临床数据**。不要声称"已确认临床准确",除非数据由用户提供。
