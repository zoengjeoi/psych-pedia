import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { NavigateType } from '../types';
import { usePrinciples, buildPrinciplePatterns, linkMarkdownPrinciples } from '../usePrinciples';
import { fixCjkPunctuationEmphasis, remarkStripZeroWidth } from '../cjkMarkdown';

interface MarkdownEditorProps {
  content: string;
  onChange: (content: string) => void;
  isDarkMode: boolean;
  readOnly?: boolean;
  onNavigate?: (type: NavigateType, id: string) => void;
}

// 提取文本内容用于生成 ID
const extractTextFromNode = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(extractTextFromNode).join('');
  if (node.props && node.props.children) return extractTextFromNode(node.props.children);
  if (node.children) return extractTextFromNode(node.children);
  if (node.value) return node.value;
  return '';
};

const getHeadingId = (children: any) => {
  const text = extractTextFromNode(children).trim();
  return 'h-' + encodeURIComponent(text.toLowerCase().replace(/\s+/g, '-'));
};

const Heading = ({ level, children, ...props }: any) => {
  const id = getHeadingId(children);
  const Tag = `h${level}` as any;
  const baseClass = "scroll-mt-20 text-slate-900 dark:text-white";
  
  const getClassName = (l: number) => {
    switch(l) {
      case 1: return `font-serif text-xl sm:text-3xl font-bold mt-6 mb-4 pb-2 border-b-2 border-slate-200 dark:border-medical-line ${baseClass}`;
      case 2: return `font-serif text-2xl font-bold mt-5 mb-3 pb-1 border-b border-slate-200 dark:border-medical-line ${baseClass}`;
      case 3: return `font-serif text-xl font-bold mt-4 mb-2 text-slate-800 dark:text-slate-200 scroll-mt-20`;
      case 4: return `text-lg font-semibold mt-3 mb-2 text-slate-800 dark:text-slate-200 scroll-mt-20`;
      default: return `font-semibold mt-2 mb-2 text-slate-800 dark:text-slate-200 scroll-mt-20`;
    }
  };

  return <Tag id={id} className={getClassName(level)} {...props}>{children}</Tag>;
};

const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  content,
  onChange,
  isDarkMode,
  readOnly = false,
  onNavigate
}) => {
  const [isPreview, setIsPreview] = useState(true);

  // 原理词条自动跳转:仅对预览渲染的 markdown 做预处理,编辑态 textarea 保持原文。
  // 之后再套一层 CJK 强调修正,让 **加粗紧邻全角标点(如 反事实（counterfactual）) 也能正常渲染。
  const principles = usePrinciples();
  const patterns = useMemo(() => buildPrinciplePatterns(principles), [principles]);
  const processedContent = useMemo(
    () => (isPreview ? fixCjkPunctuationEmphasis(linkMarkdownPrinciples(content, patterns)) : content),
    [content, patterns, isPreview]
  );

  return (
    <div className="markdown-editor-container">
      {/* Editor/Preview Toggle */}
      {!readOnly && (
        <div className="flex gap-2 mb-4 border-b border-slate-200 dark:border-slate-700 pb-2">
          <button
            onClick={() => setIsPreview(false)}
            className={`px-4 py-2 rounded-t transition-colors ${
              !isPreview
                ? 'bg-gradient-to-r from-medical-primary to-medical-primaryDeep text-white shadow-md'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            编辑
          </button>
          <button
            onClick={() => setIsPreview(true)}
            className={`px-4 py-2 rounded-t transition-colors ${
              isPreview
                ? 'bg-gradient-to-r from-medical-primary to-medical-primaryDeep text-white shadow-md'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            预览
          </button>
          <div className="ml-auto flex items-center text-xs text-slate-500 dark:text-slate-400">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            支持 Markdown 格式
          </div>
        </div>
      )}

      {/* Editor or Preview */}
      {!isPreview && !readOnly ? (
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-96 p-4 font-mono text-sm border border-slate-300 dark:border-medical-line rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-medical-primary focus:border-transparent resize-vertical"
          placeholder="在此输入 Markdown 格式的内容...

支持的格式：
- **粗体** 和 *斜体*
- # 标题
- [链接](url)
- ![图片](url)
- 列表、表格等

示例：
## 概述
这是一段**重要**的内容。

### 详细说明
1. 第一点
2. 第二点
"
        />
      ) : (
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkStripZeroWidth]}
            rehypePlugins={[rehypeRaw, rehypeSanitize]}
            components={{
              h1: (props) => <Heading level={1} {...props} />,
              h2: (props) => <Heading level={2} {...props} />,
              h3: (props) => <Heading level={3} {...props} />,
              h4: (props) => <Heading level={4} {...props} />,
              h5: (props) => <Heading level={5} {...props} />,
              h6: (props) => <Heading level={6} {...props} />,
              p: ({ node, ...props }) => (
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed mb-3" {...props} />
              ),
              ul: ({ node, ...props }) => (
                <ul className="list-disc list-inside space-y-1 mb-3 text-slate-700 dark:text-slate-300" {...props} />
              ),
              ol: ({ node, ...props }) => (
                <ol className="list-decimal list-inside space-y-1 mb-3 text-slate-700 dark:text-slate-300" {...props} />
              ),
              li: ({ node, ...props }) => (
                <li className="ml-4" {...props} />
              ),
              blockquote: ({ node, ...props }) => (
                <blockquote className="border-l-4 border-medical-primary pl-4 py-2 my-3 bg-cyan-50 dark:bg-cyan-500/10 text-slate-700 dark:text-slate-300 italic" {...props} />
              ),
              code: ({ node, inline, ...props }: any) =>
                inline ? (
                  <code className="bg-slate-100 dark:bg-slate-800 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded text-sm font-mono" {...props} />
                ) : (
                  <code className="block bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 p-3 rounded-lg overflow-x-auto text-sm font-mono mb-3" {...props} />
                ),
              pre: ({ node, ...props }) => (
                <pre className="bg-slate-100 dark:bg-slate-800 p-3 rounded-lg overflow-x-auto mb-3" {...props} />
              ),
              a: ({ node, href, children, ...props }) => {
                if (href && href.startsWith('/principle/')) {
                  const pid = href.replace('/principle/', '');
                  return (
                    <a
                      className="text-medical-primary dark:text-medical-primaryBright font-medium hover:underline cursor-pointer"
                      onClick={(e) => {
                        e.preventDefault();
                        onNavigate?.('principle', pid);
                      }}
                      title="查看原理词条"
                    >
                      {children}
                    </a>
                  );
                }
                return (
                  <a href={href} className="text-medical-primary dark:text-medical-primaryBright hover:underline" target="_blank" rel="noopener noreferrer" {...props}>
                    {children}
                  </a>
                );
              },
              table: ({ node, ...props }) => (
                <div className="overflow-x-auto mb-4 -mx-2 px-2">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-medical-line border border-slate-200 dark:border-medical-line text-xs sm:text-sm" {...props} />
                </div>
              ),
              thead: ({ node, ...props }) => (
                <thead className="bg-slate-100 dark:bg-medical-surfaceAlt" {...props} />
              ),
              tbody: ({ node, ...props }) => (
                <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-700" {...props} />
              ),
              th: ({ node, ...props }) => (
                <th className="px-2 sm:px-4 py-1 sm:py-2 text-left text-xs sm:text-sm font-semibold text-slate-900 dark:text-white" {...props} />
              ),
              td: ({ node, ...props }) => (
                <td className="px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300" {...props} />
              ),
              img: ({ node, ...props }) => (
                <img className="rounded-lg shadow-md max-w-full h-auto my-4" {...props} alt={props.alt || ''} />
              ),
              hr: ({ node, ...props }) => (
                <hr className="my-6 border-slate-200 dark:border-slate-700" {...props} />
              ),
            }}
          >
            {processedContent || '*暂无内容*'}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
};

export default MarkdownEditor;
