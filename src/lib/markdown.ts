/**
 * 构建期 Markdown 渲染管线（词条正文专用）。
 *
 * 相比旧版客户端 react-markdown 方案：
 *  - CJK 加粗修正（fixCjkPunctuationEmphasis + 零宽空格剥离）在旧版基础上把标点
 *    判定从「全角/CJK 标点」泛化为 CommonMark 全集（\p{P}+\p{S}，含半角括号引号），
 *    修复 `其**"打了就跑"…` / `**(hit-and-run)**化学` 这类半角标点紧邻导致的漏修；
 *  - 受体/假说术语自动链接从运行时字符串替换改为 mdast 层注入（只命中真正的术语，
 *    不再误伤普通英文单词，且天然跳过代码与既有链接）；
 *  - 标题 id 与 TOC 由同一遍 rehype 插件生成，永不错配（旧版两处 slug 函数靠约定对齐）。
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import { visit, SKIP } from 'unist-util-visit';
import type { TocItem, WikiPattern } from './types';

/* ------------------------------------------------------------------ */
/* CJK 强调修正（Obsidian 式侧翼判定放宽，零宽空格方案）                 */
/* ------------------------------------------------------------------ */

const ZWSP = '​'; // 零宽空格（仅作解析期的临时辅助字符，渲染前会被 remarkStripZeroWidth 剥除）

/**
 * CommonMark 眼中的「标点」= Unicode \p{P} + \p{S} 全集：
 * 全角（（）、。、中文引号破折号）与半角 ( ) " ' - 等一律算标点。
 * 旧版只认全角，导致 `其**"打了就跑"…` 与 `**(hit-and-run)**化学` 这类
 * 半角标点紧邻 `**` 的写法漏修。
 */
const isPunct = (ch: string | undefined): boolean => {
  if (!ch) return false;
  if (ch === ZWSP) return false;
  return /[\p{P}\p{S}]/u.test(ch);
};

const isWordish = (ch: string | undefined): boolean => {
  if (!ch) return false;
  if (ch === ZWSP) return false;
  return !/\s/u.test(ch) && !/[\p{P}\p{S}]/u.test(ch);
};

/**
 * 强调定界符侧翼修正。
 *
 * CommonMark 的开合判定（flanking rules）假设词与词之间有空格；中文正文没有空格，
 * 当 `**` 一侧紧邻标点、另一侧紧邻词字符（汉字/字母/数字）时就会开不上或合不上，
 * 渲染成字面星号：
 *   其**"打了就跑"(hit-and-run)** 的  →  开 ** 后跟引号、前邻汉字，开不上
 *   **…(hit-and-run)**化学           →  闭 ** 前邻右括号、后跟汉字，合不上
 *
 * 做法（与旧版一致、对原文零改动）：在定界符与紧邻标点之间插入 U+200B，让引擎
 * 眼中该侧变为「非标点」从而走判定主干；解析完成后 remarkStripZeroWidth 再剥掉
 * 全部 U+200B——最终 DOM 与复制出的文本不含任何零宽字符。
 * 仅插入；一侧是标点、另一侧是标点/空白时不插入（这些情形原生判定已正确）。
 */
export const fixCjkPunctuationEmphasis = (source: string): string => {
  if (!source) return source;
  let out = '';
  let last = 0;
  const runRegex = /[*_]+/g;
  let match: RegExpExecArray | null;
  while ((match = runRegex.exec(source)) !== null) {
    const idx = match.index;
    const len = match[0].length;
    const before = source[idx - 1];
    const after = source[idx + len];
    const insertBefore = isPunct(before) && isWordish(after);
    const insertAfter = isPunct(after) && isWordish(before);
    if (!insertBefore && !insertAfter) continue;
    out += source.slice(last, idx);
    if (insertBefore) out += ZWSP;
    out += match[0];
    if (insertAfter) out += ZWSP;
    last = idx + len;
  }
  out += source.slice(last);
  return out;
};

const remarkStripZeroWidth = () => (tree: unknown) => {
  visit(tree as never, (node: { value?: unknown; url?: unknown; properties?: Record<string, unknown> | undefined }) => {
    // 文本/代码/HTML 原文节点
    if (typeof node?.value === 'string') {
      node.value = node.value.split(ZWSP).join('');
    }
    // mdast 层的链接/图片目标（url 在 hast 层才会变成 properties.href）
    if (typeof node?.url === 'string' && node.url.includes(ZWSP)) {
      node.url = node.url.split(ZWSP).join('');
    }
  });
};

/* ------------------------------------------------------------------ */
/* 受体/假说术语自动链接（hast 层，元素感知）                            */
/*                                                                     */
/* 必须放在 rehype-raw 之后：正文大量使用 5-HT<sub>2</sub>A 这类内联    */
/* HTML 下标，完整术语横跨文本节点与 <sub> 元素，mdast 层永远凑不齐。   */
/* ------------------------------------------------------------------ */

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface CompiledPattern extends WikiPattern {
  re: RegExp;
}

const compilePatterns = (patterns: WikiPattern[]): CompiledPattern[] =>
  patterns
    .filter((p) => p.term.length >= 2)
    .map((p) => ({
      ...p,
      // 词边界保护：前面不能是单词字符/[，后面不能是单词字符
      re: new RegExp(`(?<![\\w\\[])${escapeRe(p.term)}(?!\\w)`, 'gi'),
    }))
    .sort((a, b) => b.term.length - a.term.length);

interface HastNode {
  type?: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const isText = (n: HastNode): boolean => n.type === 'text';

/** 元素内是否已存在链接（含自身）——避免生成嵌套 <a> */
const containsAnchor = (n: HastNode): boolean => {
  if (n.tagName === 'a') return true;
  return (n.children ?? []).some((c) => containsAnchor(c));
};

/** 可以整体包进链接的内联包装元素 */
const INLINE_WRAPPERS = new Set([
  'em',
  'strong',
  'sub',
  'sup',
  'span',
  'b',
  'i',
  'u',
  'del',
  'mark',
  'ins',
  'small',
]);

/** 需要做术语链接的容器标签（块级） */
const LINKABLE_CONTAINERS = new Set([
  'p',
  'li',
  'td',
  'th',
  'blockquote',
  'figcaption',
  'dd',
  'dt',
  'summary',
]);

/** 把 children 展开为纯文本流 + 位置映射 */
interface Segment {
  node: HastNode;
  start: number;
  end: number;
  isText: boolean;
  blocked: boolean; // 含已有链接的元素：命中不能覆盖它
}

const flattenChildren = (children: HastNode[]) => {
  const segments: Segment[] = [];
  let text = '';
  for (const child of children) {
    const start = text.length;
    text += nodeText(child);
    segments.push({
      node: child,
      start,
      end: text.length,
      isText: isText(child),
      blocked: !isText(child) && containsAnchor(child),
    });
  }
  return { segments, text };
};
/** 在文本流里找最早的、边界可切的术语命中（同位置取更长术语） */
const findLinkableMatch = (
  text: string,
  segments: Segment[],
  patterns: CompiledPattern[]
): { start: number; end: number; pattern: CompiledPattern } | null => {
  let best: { start: number; end: number; pattern: CompiledPattern } | null = null;
  for (const p of patterns) {
    p.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      // 命中的两端必须落在（未阻断的）文本节点内部
      const startOk = segments.some(
        (s) => s.isText && !s.blocked && s.start <= start && start < s.end
      );
      const endOk = segments.some(
        (s) => s.isText && !s.blocked && s.start < end && end <= s.end
      );
      // 命中覆盖范围内不得包含阻断元素
      const coveredBlocked = segments.some(
        (s) => s.blocked && s.start >= start && s.end <= end
      );
      if (startOk && endOk && !coveredBlocked) {
        if (
          !best ||
          start < best.start ||
          (start === best.start && end - start > best.end - best.start)
        ) {
          best = { start, end, pattern: p };
        }
      }
      if (m[0].length === 0) break;
    }
  }
  return best;
};

/**
 * 处理一个容器的 children：把术语命中替换为链接节点。
 * 每次递归生成一个链接，直到流中不再有可命中的术语。
 */
const linkifyChildren = (
  children: HastNode[],
  patterns: CompiledPattern[]
): HastNode[] => {
  const { segments, text } = flattenChildren(children);
  const match = findLinkableMatch(text, segments, patterns);
  if (!match) return children;

  const out: HastNode[] = [];
  let i = 0;
  // 命中之前的完整节点
  while (i < children.length && segments[i].end <= match.start) {
    out.push(children[i]);
    i++;
  }
  // 命中覆盖的节点：文本切片进链接，元素整体进链接
  const linkChildren: HastNode[] = [];
  let tail: HastNode | null = null;
  while (i < children.length && segments[i].start < match.end) {
    const seg = segments[i];
    const node = children[i];
    if (seg.isText) {
      const value = node.value ?? '';
      const from = Math.max(match.start - seg.start, 0);
      const to = Math.min(match.end - seg.start, value.length);
      if (from > 0) out.push({ type: 'text', value: value.slice(0, from) });
      linkChildren.push({ type: 'text', value: value.slice(from, to) });
      if (to < value.length) tail = { type: 'text', value: value.slice(to) };
    } else {
      linkChildren.push(node);
    }
    i++;
  }
  out.push({
    type: 'element',
    tagName: 'a',
    properties: {
      href: `/${match.pattern.id}`,
      title: `跳转至 ${match.pattern.fullTitle}`,
    },
    children: linkChildren,
    position: undefined,
  } as HastNode);
  if (tail) out.push(tail);
  // 命中之后的完整节点
  while (i < children.length) {
    out.push(children[i]);
    i++;
  }
  // 递归：同一容器里可能还有其他术语
  return linkifyChildren(out, patterns);
};

const rehypeAutoLink = (patterns: WikiPattern[]) => {
  const compiled = compilePatterns(patterns);
  if (compiled.length === 0) return () => {};

  const isBlockish = (n: HastNode) =>
    n.type === 'element' && !!n.tagName && !INLINE_WRAPPERS.has(n.tagName);

  /**
   * 把连续的内联子节点作为一段处理，块级子元素原样跳过
   * （留给 visit 继续下钻处理其内部）。
   */
  const processChildren = (children: HastNode[]): HastNode[] => {
    const out: HastNode[] = [];
    let run: HastNode[] = [];
    for (const child of children) {
      if (isBlockish(child)) {
        if (run.length > 0) out.push(...linkifyChildren(run, compiled));
        out.push(child);
        run = [];
      } else {
        run.push(child);
      }
    }
    if (run.length > 0) out.push(...linkifyChildren(run, compiled));
    return out;
  };

  return (tree: unknown) => {
    visit(
      tree as never,
      (node: HastNode) => {
        if (node.type !== 'element') return;
        const tag = node.tagName ?? '';
        // 标题、代码、已有链接内不做术语链接
        if (
          tag === 'a' ||
          tag === 'code' ||
          tag === 'pre' ||
          tag === 'script' ||
          tag === 'style' ||
          tag === 'svg' ||
          /^h[1-6]$/.test(tag)
        ) {
          return SKIP;
        }
        if (
          (LINKABLE_CONTAINERS.has(tag) || INLINE_WRAPPERS.has(tag)) &&
          Array.isArray(node.children)
        ) {
          node.children = processChildren(node.children as HastNode[]);
          // 不 SKIP：继续下钻，嵌套容器 / 嵌套列表里的术语也要处理
        }
      }
    );
  };
};

/* ------------------------------------------------------------------ */
/* 状态 emoji -> 统一风格 SVG 图标（✅ / ❌ / ✓ 大量出现在表格中）      */
/* ------------------------------------------------------------------ */

const EMOJI_ICONS: Record<string, { cls: string; d: string }> = {
  '✅': { cls: 'text-emerald-500', d: 'M5 13l4 4L19 7' },
  '✓': { cls: 'text-emerald-500', d: 'M5 13l4 4L19 7' },
  '❌': { cls: 'text-red-500', d: 'M6 6l12 12M18 6L6 18' },
  '✖': { cls: 'text-red-500', d: 'M6 6l12 12M18 6L6 18' },
};

const EMOJI_SPLIT = /(✅|❌|✓|✖)/gu;

const rehypeEmojiIcons = () => (tree: unknown) => {
  visit(
    tree as never,
    (node: HastNode) => {
      if (node.type !== 'element' || !Array.isArray(node.children)) return;
      const tag = node.tagName ?? '';
      if (tag === 'code' || tag === 'pre' || tag === 'a' || tag === 'svg' || /^h[1-6]$/.test(tag)) {
        return SKIP;
      }
      let changed = false;
      const next: HastNode[] = [];
      for (const child of node.children) {
        const value = child.type === 'text' ? (child.value ?? '') : null;
        if (value === null || !EMOJI_SPLIT.test(value)) {
          next.push(child);
          continue;
        }
        changed = true;
        EMOJI_SPLIT.lastIndex = 0;
        for (const part of value.split(EMOJI_SPLIT)) {
          if (!part) continue;
          const icon = EMOJI_ICONS[part];
          if (icon) {
            next.push({
              type: 'element',
              tagName: 'svg',
              properties: {
                viewBox: '0 0 24 24',
                fill: 'none',
                stroke: 'currentColor',
                strokeWidth: 2.5,
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
                className: ['emoji-icon', icon.cls],
                'aria-label': part === '✅' || part === '✓' ? '是' : '否',
                role: 'img',
              },
              children: [
                { type: 'element', tagName: 'path', properties: { d: icon.d }, children: [] },
              ],
              position: undefined,
            } as HastNode);
          } else {
            next.push({ type: 'text', value: part });
          }
        }
      }
      if (changed) node.children = next;
    }
  );
};

/* ------------------------------------------------------------------ */
/* 图片路径规范化（Obsidian 相对路径 -> 站点路径）                      */
/* ------------------------------------------------------------------ */

const remarkNormalizeImages = () => (tree: unknown) => {
  const fix = (node: { url?: string }) => {
    if (typeof node.url === 'string' && node.url.includes('/public/images/')) {
      node.url = node.url.replace(/.*\/public\/images\//, '/images/');
    }
  };
  visit(tree as never, (node: { type?: string; url?: string }) => {
    if (node.type === 'image' || node.type === 'link') fix(node as { url?: string });
  });
};

/**
 * 移除正文中的 h1 标题（89 个词条正文自带 `# 词条名` 回显，
 * 与页面模板的大标题重复，也会在目录里多出指向页顶的项）。
 * 词条正文一律以 `## ` 分节，h1 不承载内容语义。
 */
const remarkDropH1 = () => (tree: unknown) => {
  const root = tree as { children?: Array<{ type?: string; depth?: number }> };
  if (Array.isArray(root.children)) {
    root.children = root.children.filter(
      (n) => !(n.type === 'heading' && n.depth === 1)
    );
  }
};

/* ------------------------------------------------------------------ */
/* rehype：标题 id + TOC 收集 + 样式注入                               */
/* ------------------------------------------------------------------ */

export interface WikiStyleOptions {
  /** 简介（intro）等场景用更接近正文的标题观感 */
  variant?: 'wiki' | 'intro';
}

const nodeText = (node: unknown): string => {
  if (!node || typeof node !== 'object') return '';
  const n = node as { type?: string; value?: string; children?: unknown[]; tagName?: string };
  if (n.type === 'text' && typeof n.value === 'string') return n.value;
  if (n.tagName === 'img') return ''; // 标题里的图片不计入目录文本
  if (Array.isArray(n.children)) return n.children.map(nodeText).join('');
  return '';
};

const HEADING_CLASSES: Record<number, string> = {
  1: 'scroll-mt-24 font-serif text-xl sm:text-3xl font-bold mt-6 mb-4 pb-2 border-b-2 border-slate-200 dark:border-medical-line text-slate-900 dark:text-white',
  2: 'scroll-mt-24 font-serif text-2xl font-bold mt-5 mb-3 pb-1 border-b border-slate-200 dark:border-medical-line text-slate-900 dark:text-white',
  3: 'scroll-mt-24 font-serif text-xl font-bold mt-4 mb-2 text-slate-800 dark:text-slate-200',
  4: 'scroll-mt-24 text-lg font-semibold mt-3 mb-2 text-slate-800 dark:text-slate-200',
  5: 'scroll-mt-24 font-semibold mt-2 mb-2 text-slate-800 dark:text-slate-200',
  6: 'scroll-mt-24 font-semibold mt-2 mb-2 text-slate-800 dark:text-slate-200',
};

const ELEMENT_CLASSES: Record<string, string> = {
  p: 'text-slate-700 dark:text-slate-300 leading-relaxed mb-3',
  ul: 'list-disc list-inside space-y-1 mb-3 text-slate-700 dark:text-slate-300',
  ol: 'list-decimal list-inside space-y-1 mb-3 text-slate-700 dark:text-slate-300',
  li: 'ml-4 marker:text-slate-400',
  blockquote: 'md-quote mb-4 rounded-lg bg-slate-100 px-4 py-3 not-italic text-slate-700 dark:bg-medical-surface-alt dark:text-slate-300',
  pre: 'bg-slate-100 dark:bg-slate-800 p-3 rounded-lg overflow-x-auto mb-3',
  table:
    'min-w-full divide-y divide-slate-200 dark:divide-medical-line border border-slate-200 dark:border-medical-line text-xs sm:text-sm',
  thead: 'bg-slate-100 dark:bg-medical-surface-alt',
  tbody: 'bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-700',
  th: 'px-2 sm:px-4 py-1 sm:py-2 text-left text-xs sm:text-sm font-semibold text-slate-900 dark:text-white',
  td: 'px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300',
  hr: 'my-6 border-slate-200 dark:border-slate-700',
  strong: 'font-semibold text-slate-800 dark:text-white',
  em: 'italic text-slate-600 dark:text-slate-400',
};

const rehypeWiki = (opts: { toc: TocItem[] } & WikiStyleOptions) => (tree: unknown) => {
  const seen = new Map<string, number>();

  visit(
    tree as never,
    (el: {
      tagName?: string;
      properties?: Record<string, unknown>;
      children?: unknown[];
      value?: string;
    }, _index?: number, parent?: { children?: unknown[]; tagName?: string }) => {
      const tag = el.tagName ?? '';
      if (/^h[1-6]$/.test(tag)) {        const depth = Number(tag[1]);
        const text = nodeText(el).trim();
        const base = 'h-' + text.toLowerCase().replace(/\s+/g, '-');
        const n = seen.get(base) ?? 0;
        seen.set(base, n + 1);
        const id = n > 0 ? `${base}-${n}` : base;
        el.properties = el.properties ?? {};
        el.properties.id = id;
        opts.toc.push({ depth, id, text });
        addClasses(el, HEADING_CLASSES[depth] ?? HEADING_CLASSES[5]);
        return;
      }
      if (tag === 'a') {
        el.properties = el.properties ?? {};
        const href = String(el.properties.href ?? '');
        el.properties.className = arrayed(el.properties.className);
        const isInternal = href.startsWith('/') && !href.startsWith('//');
        if (isInternal) {
          addClasses(el, 'text-medical-primary dark:text-medical-primary-bright font-medium hover:underline');
        } else {
          addClasses(el, 'text-medical-primary dark:text-medical-primary-bright hover:underline');
          el.properties.target = '_blank';
          el.properties.rel = 'noopener noreferrer';
        }
        return;
      }
      if (tag === 'code') {
        el.properties = el.properties ?? {};
        const isBlock = parent?.tagName === 'pre';
        if (isBlock) {
          addClasses(
            el,
            'text-slate-800 dark:text-slate-200 text-sm font-mono'
          );
        } else {
          addClasses(
            el,
            'bg-slate-100 dark:bg-slate-800 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded text-[0.85em] font-mono'
          );
        }
        return;
      }
      if (tag === 'img') {
        el.properties = el.properties ?? {};
        // 尺寸语法：![描述|400](url) 或 ![描述|400x260](url)
        // （Obsidian 同样识别该写法，因此网页与本地编辑预览保持一致，尺寸只写在 Markdown 里）
        const altRaw = String(el.properties.alt ?? '');
        const sizeMatch = altRaw.match(/^(.*?)\|\s*(\d+)\s*(?:x\s*(\d+)\s*)?$/);
        if (sizeMatch) {
          el.properties.alt = sizeMatch[1].trim();
          const existingStyle =
            typeof el.properties.style === 'string' ? el.properties.style.replace(/;?\s*$/, ';') : '';
          const width = sizeMatch[2];
          const height = sizeMatch[3];
          el.properties.style = `${existingStyle}width:${width}px${height ? `;height:${height}px` : ''}`;
        }
        addClasses(el, 'rounded-lg shadow-sm max-w-full h-auto my-4');
        el.properties.loading = 'lazy';
        el.properties.decoding = 'async';
        return;
      }
      if (tag === 'input') {
        el.properties = el.properties ?? {};
        el.properties.disabled = true;
        addClasses(el, 'mr-1 accent-medical-primary align-middle');
        return;
      }
      const classes = ELEMENT_CLASSES[tag];
      if (classes) addClasses(el, classes);
    }
  );
};

/** 表格外包一层横向滚动容器（在样式注入之后执行，不影响子树着类） */
const rehypeWrapTables = () => (tree: unknown) => {
  visit(
    tree as never,
    (el: HastNode, index?: number, parent?: { children?: unknown[] }) => {
      if (el.tagName !== 'table' || !parent || typeof index !== 'number' || !Array.isArray(parent.children)) {
        return;
      }
      const wrapper = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['overflow-x-auto', 'mb-4', '-mx-2', 'px-2'] },
        children: [el as unknown],
        position: undefined,
      };
      parent.children[index] = wrapper;
      return SKIP;
    }
  );
};

function arrayed(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') return v.split(/\s+/).filter(Boolean);
  return [];
}

function addClasses(
  el: { properties?: Record<string, unknown> },
  classes: string
) {
  el.properties = el.properties ?? {};
  const existing = arrayed(el.properties.className);
  const incoming = classes.split(/\s+/).filter(Boolean);
  el.properties.className = Array.from(new Set([...existing, ...incoming]));
}

/* ------------------------------------------------------------------ */
/* 引用框改造：> 引用的首行提取为灰底标签（默认「引用」），其余为正文。     */
/* 面板样式见 ELEMENT_CLASSES.blockquote + global.css 的 .md-quote-label */
/* ------------------------------------------------------------------ */

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const QUOTE_LABEL_DEFAULT = '引用';

const remarkQuoteLabel = () => (tree: unknown) => {
  visit(tree as never, 'blockquote', (node: { children: never[] }) => {
    const children = node.children as Array<Record<string, unknown>>;
    let label = '';
    const first = children[0] as { type: string; children?: Array<Record<string, unknown>> } | undefined;
    if (first?.type === 'paragraph' && first.children?.length) {
      const firstChild = first.children[0] as { type: string; value?: string };
      const multiline = firstChild?.type === 'text' && (firstChild.value ?? '').includes('\n');
      const pureText = first.children.every((c) => (c as { type: string }).type === 'text');
      if (multiline) {
        // 首段含换行：首行 = 标签，其余留在原段落
        const [head, ...rest] = (firstChild.value as string).split('\n');
        label = head.trim();
        const remain = rest.join('\n').trim();
        if (remain) firstChild.value = remain;
        else children.shift();
      } else if (children.length > 1 && pureText) {
        // 多段落：首段为纯文本短行时视为标签（避免吞掉正文首句）
        label = first.children.map((c) => (c as { value?: string }).value ?? '').join('').trim();
        if (label && label.length <= 20) children.shift();
        else label = '';
      }
    }
    const escaped = escapeHtml(label || QUOTE_LABEL_DEFAULT);
    children.unshift({
      type: 'html',
      value: `<div class="md-quote-label"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.983 3v7.391c0 5.704-3.731 9.57-8.983 10.609l-.995-2.151c2.432-.917 3.995-3.638 3.995-5.849h-4v-10h9.983zM24 3v7.391c0 5.704-3.748 9.571-9 10.609l-.996-2.151c2.433-.917 3.996-3.638 3.996-5.849h-4v-10h9.983z"/></svg><span>${escaped}</span></div>`,
    } as never);
  });
};

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */

/** 内链守卫：目标词条不存在的链接降级为纯文本（AI 生成的正文/雷达偶发硬编码不存在的 id） */
const rehypeValidateInternalLinks = (validIds: Set<string> | null) => (tree: unknown) => {
  if (!validIds) return;
  visit(tree as never, 'element', (node: { tagName?: string; properties?: Record<string, unknown> }) => {
    if (node.tagName !== 'a') return;
    const props = node.properties ?? (node.properties = {});
    const href = String(props.href ?? '');
    if (!href.startsWith('/') || href.startsWith('//')) return;
    const clean = decodeURIComponent(href.split('#')[0]).replace(/\/+$/, '');
    if (!clean || validIds.has(clean.slice(1))) return;
    node.tagName = 'span';
    delete props.href;
    delete props.target;
    delete props.rel;
  });
};

export interface RenderedWiki {
  html: string;
  toc: TocItem[];
}

export const renderWiki = async (
  markdown: string,
  patterns: WikiPattern[] = [],
  validIds: Set<string> | null = null
): Promise<RenderedWiki> => {
  const toc: TocItem[] = [];
  const source = fixCjkPunctuationEmphasis(markdown ?? '');
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkQuoteLabel)
    .use(remarkDropH1)
    .use(remarkStripZeroWidth)
    .use(remarkNormalizeImages)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeEmojiIcons)
    // 自动链接必须在 rehype-raw 之后：术语常横跨 5-HT<sub>2</sub>A 的内联下标
    .use(rehypeAutoLink, patterns)
    .use(rehypeWiki, { toc })
    .use(rehypeWrapTables)
    .use(rehypeValidateInternalLinks, validIds)
    .use(rehypeStringify)
    .process(source);
  return { html: String(file), toc };
};

/** 从原理正文中拆出「简介」段落（与旧 md-to-json 的提取规则一致） */
export const splitPrincipleIntro = (
  body: string
): { intro: string; rest: string } => {
  const src = body ?? '';
  const match = src.match(/## 简介\n\n([\s\S]*?)(?:\n## |\n# |$)/);
  if (!match) return { intro: '', rest: src.trim() };
  const rest = src.replace(/## 简介\n\n[\s\S]*?(?=\n## |\n# |$)/, '').trim();
  return { intro: match[1].trim(), rest };
};

/** 提取正文图片（原理页图像资料区），同时解析 `|宽度[x高度]` 尺寸语法 */
export interface BodyImage {
  alt: string;
  url: string;
  width?: number;
  height?: number;
}

export const extractImages = (body: string): BodyImage[] => {
  const images: BodyImage[] = [];
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body ?? '')) !== null) {
    let url = m[2];
    if (url.includes('/public/images/')) {
      url = url.replace(/.*\/public\/images\//, '/images/');
    }
    const sizeMatch = (m[1] ?? '').match(/^(.*?)\|\s*(\d+)\s*(?:x\s*(\d+)\s*)?$/);
    images.push({
      alt: sizeMatch ? sizeMatch[1].trim() : m[1] || '图片',
      url,
      width: sizeMatch ? Number(sizeMatch[2]) : undefined,
      height: sizeMatch && sizeMatch[3] ? Number(sizeMatch[3]) : undefined,
    });
  }
  return images;
};
