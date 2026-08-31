import React from 'react';
import { PRINCIPLES } from '../constants';
import { NavigateType } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface RichTextProps {
  content: string;
  onNavigate: (type: NavigateType, id: string) => void;
}

const RichText: React.FC<RichTextProps> = ({ content, onNavigate }) => {
  // Create a regex pattern from all principle IDs and Titles to find matches
  // Sorting by length desc to match longest terms first (e.g. "D2 Receptor" before "D2")
  const patterns = PRINCIPLES.map(p => ({
    id: p.id,
    term: p.title.split(' ')[0], // Match "D2" from "D2 多巴胺受体"
    fullTitle: p.title
  })).sort((a, b) => b.term.length - a.term.length);

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
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
};

export default RichText;