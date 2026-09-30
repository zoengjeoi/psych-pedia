/**
 * CJK 友好的 Markdown 强调渲染修正
 *
 * 问题背景:
 * react-markdown(底层是 micromark / CommonMark)对 `*`/`_` 强调有一套 "flanking(侧翼)"
 * 判定规则:当定界符一侧紧邻 Unicode 标点、另一侧紧邻单词字符(字母/数字/汉字)时,
 * 该定界符被判定为不能打开或关闭强调。中文正文没有空格,全角标点(、。，（）…)又属于
 * Unicode 标点,于是 `**反事实（counterfactual）**比较` 里结尾的 `**` 紧挨 `）` 与 `比`,
 * 无法作为闭界定符,整段加粗失效、`**` 原样显示(Obsidian 等工具会修正这一点)。
 *
 * 方案:
 * 1. 解析前预处理:当强调定界符一侧是全角/CJK 标点、另一侧是词字符时,在标点与定界符之间
 *    插入零宽空格(U+200B),让 flanking 判定恢复正常。仅插入、绝不删除或改写原文任何字符。
 * 2. 解析后再用一个 remark 插件把所有 U+200B 从 mdast 文本节点里剥掉——
 *    因此最终 DOM、复制出的文本都不含零宽字符,输出与 Obsidian 一致且干净。
 */

const ZWSP = '​'; // 零宽空格(仅作解析期的临时辅助字符,渲染前会被 remarkStripZeroWidth 剥除)

/** 全角/CJK 标点(含中文引号、破折号、省略号);需是引擎眼中的标点,并排除全角字母/数字 */
const isCjkPunct = (ch: string | undefined): boolean => {
  if (!ch) return false;
  const cp = ch.codePointAt(0);
  if (cp === undefined) return false;
  const inCjkSymbols = cp >= 0x3000 && cp <= 0x303f; // 、。〈〉《》「」【】… 等
  const inFullwidth = cp >= 0xff00 && cp <= 0xff60; // ！＂（）；：？［］｛｝ 等(含全角字母/数字,需再排除)
  const curlyQuotes = cp === 0x2018 || cp === 0x2019 || cp === 0x201c || cp === 0x201d; // “ ” ‘ ’
  const dash = cp === 0x2014 || cp === 0x2026; // ——(破折号)/ ……(省略号)
  if (!(inCjkSymbols || inFullwidth || curlyQuotes || dash)) return false;
  // 排除全角空格(0x3000)、全角拉丁字母/数字等本就不是标点的字符
  return !/[\p{L}\p{N}\s]/u.test(ch);
};

/** 词字符 = 非空白、非标点/符号(与 micromark unicodePunctuation=\p{P}|\p{S} 对应)、非我们插入的零宽空格 */
const isWordish = (ch: string | undefined): boolean => {
  if (!ch) return false;
  if (ch === ZWSP) return false;
  return !/\s/u.test(ch) && !/\p{P}|\p{S}/u.test(ch);
};

/**
 * 解析前预处理:在会让 flanking 失效的 `*`/`_` 定界符两侧按需插入零宽空格。
 * 只处理 "一侧是全角标点、另一侧是词字符" 的情形(这正是 CommonMark 会拒绝、而
 * 中文作者几乎必然想表达强调的写法);两侧同为标点等已能正常判定的情形一概不动。
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

    const insertBefore = isCjkPunct(before) && isWordish(after); // 例:（counterfactual）**比较  →  `）` 与 `**`
    const insertAfter = isCjkPunct(after) && isWordish(before); // 例:词**（内容）        →  `**` 与 `（`
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

/** 递归遍历 mdast,把文本/代码等所有带 value 的节点里的 U+200B 去掉 */
const stripFromTree = (node: any): void => {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach(stripFromTree);
    return;
  }
  if (typeof node === 'object') {
    if (typeof node.value === 'string') {
      node.value = node.value.split(ZWSP).join('');
    }
    if (Array.isArray(node.children)) {
      node.children.forEach(stripFromTree);
    }
  }
};

/**
 * remark 插件:解析完成后清理零宽空格。需放在 remarkPlugins 列表里(GFM 之后即可)。
 * 用法:remarkPlugins={[remarkGfm, remarkStripZeroWidth]}
 */
export const remarkStripZeroWidth = (): ((tree: any) => void) => (tree) => {
  stripFromTree(tree);
};
