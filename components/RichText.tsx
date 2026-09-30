import React, { useMemo } from 'react';
import { NavigateType } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { usePrinciples, buildPrinciplePatterns } from '../usePrinciples';
import { fixCjkPunctuationEmphasis, remarkStripZeroWidth } from '../cjkMarkdown';

interface RichTextProps {
  content: string;
  onNavigate: (type: NavigateType, id: string) => void;
}

const RichText: React.FC<RichTextProps> = ({ content, onNavigate }) => {
  // 动态加载原理索引(受体+假说),构建自动跳转模式
  const principles = usePrinciples();
  const patterns = useMemo(() => buildPrinciplePatterns(principles), [principles]);

  // 简介同样需要 CJK 强调修正,例如 **D2（多巴胺 D2 受体）** 紧邻全角括号时应能正确加粗
  const fixedContent = useMemo(() => fixCjkPunctuationEmphasis(content), [content]);

  const renderTextWithLinks = (text: string) => {
    let partsToProcess: (string | React.ReactNode)[] = [text];

    patterns.forEach(pattern => {
      const keyword = pattern.term;
      const nextParts: (string | React.ReactNode)[] = [];
      
      partsToProcess.forEach(part => {
        if (typeof part !== 'string') {
          nextParts.push(part);
          return;
        }

        const regex = new RegExp(`(${keyword})`, 'gi');
        const split = part.split(regex);

        split.forEach((s, i) => {
          if (s.toLowerCase() === keyword.toLowerCase()) {
             nextParts.push(
               <span 
                 key={`${pattern.id}-${i}`}
                 onClick={(e) => {
                   e.stopPropagation();
                   onNavigate('principle', pattern.id);
                 }}
                 className="text-cyan-600 dark:text-cyan-400 font-bold cursor-pointer hover:underline hover:text-cyan-500 mx-0.5"
                 title={`跳转至 ${pattern.fullTitle}`}
               >
                 {s}
               </span>
             );
          } else if (s) {
            nextParts.push(s);
          }
        });
      });
      partsToProcess = nextParts;
    });
    return <>{...partsToProcess}</>;
  };

  const components = {
    p: ({ node, ...props }) => {
      // Process children to apply custom linking
      const childrenWithLinks = React.Children.map(props.children, child => {
        if (typeof child === 'string') {
          return renderTextWithLinks(child);
        }
        return child; // Render other non-string children as is
      });
      return <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-base">{childrenWithLinks}</p>;
    },
    strong: ({ children }) => <strong className="font-semibold text-slate-800 dark:text-white">{children}</strong>,
    em: ({ children }) => <em className="italic text-slate-600 dark:text-slate-400">{children}</em>,
    ul: ({ children }) => <ul className="list-disc list-inside space-y-1 my-2 pl-4">{children}</ul>,
    li: ({ children }) => <li className="text-slate-700 dark:text-slate-300">{children}</li>,
    a: ({ node, ...props }) => (
      <a {...props} className="text-medical-primary dark:text-medical-primaryBright hover:underline" target="_blank" rel="noopener noreferrer" />
    ),
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkStripZeroWidth]} components={components}>
      {fixedContent}
    </ReactMarkdown>
  );
};

export default RichText;