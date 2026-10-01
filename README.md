# PsychPedia v2

Astro 5 + React 岛屿 + Tailwind v4 的全静态版精神药理学速查站。原版（仓库根目录）保持不变，这里是独立子项目。

## 常用命令

```bash
npm run dev              # 本地开发（默认 http://localhost:4321）
npm run build            # 构建到 dist/
npm run preview          # 预览构建产物
npm run check            # 类型 / 模板检查（应保持 0 错误）

npm run generate -- <药物id> [...]   # 用 Gemini 重写词条正文（frontmatter 原样保留）
npm run generate -- --all            # 补齐正文缺失/不完整的词条（--force 全部重写）
npm run generate -- --new 中文名 [英文名]   # AI 新建整条词条（frontmatter + 正文）
npm run image-host       # 图床上传小工具（粘贴/拖拽图片 -> GitHub -> Markdown 片段）
npm run upload-image -- <图片路径> [宽度px] [alt文字]
npm run generate-icons   # 重新生成全套 favicon / PWA 图标
npm run normalize-content # 清理词条标题里的英文残留（幂等）
```

## 图形化操作（双击即可，无需命令行）

`tools/` 下的 `.bat` 是**纯 ASCII 启动器**，中文界面逻辑在 `tools/psi.mjs`（Node 实现）。
之所以这样分层：cmd 解析批处理时按控制台代码页处理字节，中文写在 `.bat` 里会被拆成命令报语法错。

| 文件 | 作用 |
| --- | --- |
| `tools/PsychPedia菜单.bat` | 主菜单：启动/重启/停止网站、生成词条、图床、检查构建、图标 |
| `tools/启动网站.bat` | 启动网站（已在运行则直接开浏览器；会轮询端口直到就绪） |
| `tools/重启网站.bat` | 改配置/依赖后用；正文改动无需重启（自动热更新） |
| `tools/停止网站.bat` | 释放 4321 端口 |
| `tools/图床上传.bat` | 启动图床工具并打开 http://127.0.0.1:5199 |
| `tools/生成词条.bat` | 交互式：重写正文 / 补齐 / 新建词条，完成后自动清理标题 |

## 词条生成（Gemini）

> 需要 `v2/.env` 中有 `GEMINI_API_KEY`（见 `.env.example`）。
> **默认模型 `gemini-3.8-flash`**：与 `gemini-3.1-pro-preview` 同题对照实测（阿米替林 / 托莫西汀）——
> 结构完全一致（9 章节 + 18 个标题逐行相同）、表格/FAQ/下标数量相当、行文风格一致（含章节内的加粗小标题写法），
> 单次约 40-50s（pro 约 68s）且单价更低。需要更深内容时用 `--model=gemini-3.1-pro-preview` 或设置 `GEMINI_MODEL`。
> 注意：事实层面两者仍有零星出入（如托莫西汀「次要代谢酶」「达稳态时间」），生成后请按提示复核关键数值。

两种模式：**重写正文**（frontmatter 逐字保留，写盘前自动备份到 `.backups/`）与 **`--new` 新建整条词条**
（AI 产出结构化 frontmatter + 正文，用 `src/lib/content-schema.mjs` 的真实 schema 校验：
分类必须来自 `taxonomy.mjs` 白名单、`link_ids` 必须是现有受体 id、id 不得与现有词条重名）。

生成流程自带质量闸门：9 章节齐全、≥2000 字、无 LaTeX / 代码围栏 / 一级标题；**不通过则拒绝写盘**，
并自动发起一次「修复请求」（把具体错误回喂给模型重出）。实测：首次通过率并非 100%（如模型偶发 LaTeX），
修复轮能兜住，因此不必手工重跑。

调试选项：`--dry-run`（不写盘）、`--dump`（把 dry-run 结果导出到 `.astro/`）、
`--mock[=good|bad|short|latex]`（不调 API 走全流程自测）、`--lenient`（放宽校验）、
`--delay=3000`、`--model=xxx`。

## 内容

词条在 `src/content/drugs/` 与 `src/content/principles/`（Markdown + frontmatter，schema 见 `src/content.config.ts`）。
构建期管线在 `src/lib/markdown.ts`：CJK 加粗修正、受体术语自动链接（支持 `5-HT<sub>2</sub>A` 跨内联标签）、
`✅/❌` → 线条风 SVG 图标、标题 slug 与目录同源。

### 图片

图床为 GitHub 仓库 `oneyokiman/obsidian-images`，经 jsDelivr 加速。

1. 复制 `.env.example` 为 `.env`，填入 `GITHUB_TOKEN`（细粒度令牌 + 该仓库 Contents: Read and write）。
2. `npm run image-host` → 浏览器打开 `http://127.0.0.1:5199` → 粘贴或拖入图片 → 复制 Markdown 片段。
   （也可用 `npm run upload-image -- shot.png 400 描述文字` 走命令行。）
3. 把片段粘进词条。注意：该工具只在本机监听 127.0.0.1，**不要部署**。

### 图片尺寸（写在 Markdown 里，Obsidian 同样识别）

```md
![描述](url)            <!-- 原始尺寸 -->
![描述|400](url)        <!-- 宽 400px（小屏自动收缩） -->
![描述|400x260](url)    <!-- 宽 400 高 260 -->
```

## 页面结构

| 路径 | 说明 |
| --- | --- |
| `/` | 首页：搜索 + 分类索引 |
| `/{id}` | 词条页（药物与原理共用扁平命名空间，构建期校验 ID 唯一） |
| `/enzymes`、`/enzymes/{酶}` | 代谢酶索引与详情 |
| `/404`、`/offline.html` | 404 与离线回退页 |

词条页顶栏左侧为「目录」胶囊（面板自按钮位置放大展开，随侧栏折叠自动贴边）；
右侧有宽窄版面切换（仅桌面端）与主题切换。悬浮目录在移动端为右下按钮 + 右侧滑出抽屉。
