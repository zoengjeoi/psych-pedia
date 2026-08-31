import React, { useEffect, useState, useRef } from 'react';

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface TocProps {
  content: string;
}

const cleanMarkdownText = (text: string) => {
  return text
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~`]/g, '')
    .trim();
};

const TableOfContents: React.FC<TocProps> = ({ content }) => {
  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [isHovered, setIsHovered] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  
  const hoverTimeoutRef = useRef<NodeJS.Timeout>();
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();
  const visibleHeadingsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const lines = content.split('\n');
    const items: TocItem[] = [];
    let inCodeBlock = false;
    
    lines.forEach(line => {
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        return;
      }
      if (inCodeBlock) return;

      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = cleanMarkdownText(match[2]);
        const id = 'h-' + encodeURIComponent(text.toLowerCase().replace(/\s+/g, '-'));
        items.push({ id, text, level });
      }
    });
    
    setToc(items);
  }, [content]);

  useEffect(() => {
    visibleHeadingsRef.current.clear();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            visibleHeadingsRef.current.add(entry.target.id);
          } else {
            visibleHeadingsRef.current.delete(entry.target.id);
          }
        });

        if (isScrollingRef.current) return;

        // 根据文档流的顺序在可视集合中找到最顶部的标题
        const activeItem = toc.find(item => visibleHeadingsRef.current.has(item.id));
        if (activeItem) {
          setActiveId(activeItem.id);
        }
      },
      { 
         // 将顶部的边距稍微设大或者下调，确保 scroll-mt-20 即精确跳到的时候也在可视范围内
        rootMargin: '-85px 0px -40% 0px', 
        threshold: 0 
      } 
    );

    const observeHeaders = () => {
      toc.forEach(item => {
        const el = document.getElementById(item.id);
        if (el) observer.observe(el);
      });
    };

    const timeoutId = setTimeout(observeHeaders, 500);

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [toc]);

  const handleMouseEnter = () => {
     if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
     setIsHovered(true);
  };

  const handleMouseLeave = () => {
     hoverTimeoutRef.current = setTimeout(() => {
        setIsHovered(false);
     }, 150);
  };

  const handleClick = (e: React.MouseEvent, id: string, isMobile: boolean = false) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      isScrollingRef.current = true;
      setActiveId(id);
      
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false;
        // 等待完全平滑滚动结束后，我们手动同步一次状态
        const newActiveItem = toc.find(item => visibleHeadingsRef.current.has(item.id));
        if (!isMobile && newActiveItem && !visibleHeadingsRef.current.has(id)) {
           // 可选的修正：如果滚动结束后点击的目标真的不在视野内了（极罕见），重新定位
        }
      }, 1000); // 正常 smooth scroll 需要大约 500-800ms

      if (isMobile) {
        setTimeout(() => setIsMobileOpen(false), 300);
      }
    }
  };

  if (toc.length === 0) return null;

  const getIndentLevel = (level: number) => {
     const minLevel = Math.min(...toc.map(t => t.level));
     return level - minLevel;
  };

  return (
    <>
      <style>{`
        .toc-scrollbar::-webkit-scrollbar {
           width: 4px;
        }
        .toc-scrollbar::-webkit-scrollbar-track {
           background: transparent;
        }
        .toc-scrollbar::-webkit-scrollbar-thumb {
           background: rgba(148, 163, 184, 0.4);
           border-radius: 4px;
        }
        .dark .toc-scrollbar::-webkit-scrollbar-thumb {
           background: rgba(71, 85, 105, 0.6);
        }
        .toc-scrollbar:hover::-webkit-scrollbar-thumb {
           background: rgba(148, 163, 184, 0.8);
        }
      `}</style>
      
      <div 
        className={`fixed right-6 top-[20%] z-[40] hidden md:flex flex-col transition-all duration-300 ease-out overflow-hidden ${isHovered ? 'w-[280px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xl rounded-2xl border border-slate-200/60 dark:border-slate-800' : 'w-8 bg-transparent border-transparent'}`}
        style={{ maxHeight: 'calc(100vh - 30%)' }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className={`flex flex-col w-full h-full relative py-4 ${isHovered ? 'px-3 overflow-y-auto toc-scrollbar' : 'overflow-hidden items-center'}`} style={{ gap: '0.2rem' }}>
          <div 
             className={`absolute top-6 bottom-6 w-px bg-slate-200/80 dark:bg-slate-700/80 -z-10 transition-opacity duration-300 ${isHovered ? 'opacity-0' : 'opacity-100'}`}
             style={{ left: '50%', transform: 'translateX(-50%)' }}
          />

          {toc.map((item, index) => {
            const isActive = activeId === item.id;
            const indentLevel = getIndentLevel(item.level);
            
            if (!isHovered) {
                return (
                   <div 
                      key={index} 
                      className="relative flex items-center justify-center cursor-pointer w-full flex-shrink-0"
                      style={{ height: '12px' }}
                      onClick={(e) => handleClick(e, item.id)}
                      title={item.text}
                   >
                      <div className={`rounded-full transition-all duration-300 ${isActive ? 'bg-cyan-400 w-2 h-2 shadow-[0_0_10px_rgba(34,211,238,0.9)]' : 'bg-slate-300 dark:bg-slate-600 w-1.5 h-1.5 hover:scale-150 hover:bg-cyan-400'}`} />
                   </div>
                );
            }

            return (
               <div 
                  key={index}
                  className={`flex items-center cursor-pointer group transition-colors duration-150 py-1 px-2 rounded-lg ${isActive ? 'bg-cyan-50 dark:bg-cyan-500/15' : 'hover:bg-slate-50 dark:hover:bg-slate-800/80'}`}
                  onClick={(e) => handleClick(e, item.id)}
               >
                  <div className="flex-shrink-0 flex justify-center mr-2 w-3" style={{ marginLeft: `${indentLevel * 12}px` }}>
                     <div className={`rounded-full transition-all duration-300 ${isActive ? 'bg-cyan-500 w-2 h-2 shadow-[0_0_8px_rgba(6,182,212,0.6)]' : 'bg-slate-300 dark:bg-slate-600 w-1 h-1 group-hover:w-1.5 group-hover:h-1.5 group-hover:bg-cyan-400'}`} />
                  </div>
                  
                  <span className={`text-[13px] leading-tight flex-1 block transition-colors duration-200 ${isActive ? 'text-cyan-600 dark:text-cyan-400 font-semibold' : 'text-slate-600 dark:text-slate-400 group-hover:text-cyan-500'}`}>
                     {item.text}
                  </span>
               </div>
            );
          })}
        </div>
      </div>

      <div className="md:hidden">
         <button 
            onClick={() => setIsMobileOpen(true)}
            className="fixed right-4 bottom-24 z-40 w-10 h-10 bg-cyan-500 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-cyan-600 transition-colors"
         >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7"/></svg>
         </button>

         <div 
            className={`fixed inset-0 z-50 transition-opacity duration-300 ${isMobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
         >
            <div 
               className="absolute inset-0 bg-black/50 backdrop-blur-sm"
               onClick={() => setIsMobileOpen(false)}
            />
            <div 
               className={`absolute right-0 top-0 bottom-0 w-64 bg-white dark:bg-slate-900 shadow-2xl p-4 overflow-y-auto transform transition-transform duration-300 ease-out ${isMobileOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
               <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="font-bold text-lg text-slate-800 dark:text-white">目录</h3>
                  <button onClick={() => setIsMobileOpen(false)} className="text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 p-2 rounded-full transition-colors">
                     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
               </div>
               <div className="flex flex-col gap-1">
                  {toc.map((item, index) => {
                     const isActive = activeId === item.id;
                     const mobileIndent = Math.min((item.level - 1) * 12, 24);
                     return (
                        <div 
                           key={index}
                           className={`flex items-center cursor-pointer py-1.5 px-2 rounded-lg transition-colors ${isActive ? 'bg-cyan-50 dark:bg-cyan-500/15' : 'hover:bg-slate-50 dark:hover:bg-slate-800/80'}`}
                           style={{ paddingLeft: `${mobileIndent + 8}px` }}
                           onClick={(e) => handleClick(e, item.id, true)}
                        >
                           <div className={`w-1.5 h-1.5 rounded-full mr-3 flex-shrink-0 transition-colors ${isActive ? 'bg-cyan-500 shadow-[0_0_4px_rgba(6,182,212,0.8)]' : 'bg-slate-300 dark:bg-slate-600'}`} />
                           <span className={`text-[14px] tracking-tight transition-colors ${isActive ? 'text-cyan-600 dark:text-cyan-400 font-semibold' : 'text-slate-600 dark:text-slate-300'}`}>
                              {item.text}
                           </span>
                        </div>
                     );
                  })}
               </div>
            </div>
         </div>
      </div>
    </>
  );
};

export default TableOfContents;
