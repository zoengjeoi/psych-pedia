import React, { useMemo, useState, useEffect } from 'react';
import PinyinMatch from 'pinyin-match';
import { Drug, NavigateType, Principle } from '../types';

interface SidebarProps {
  drugs: Drug[];
  principles: Principle[];
  currentView: { type: NavigateType, id: string };
  onNavigate: (type: NavigateType, id: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ drugs, principles, currentView, onNavigate, isOpen, setIsOpen, isCollapsed, setIsCollapsed }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());



  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const filteredDrugs = useMemo(() => {
    if (!searchTerm) return drugs;
    const lowerTerm = searchTerm.toLowerCase();
    return drugs.filter(d => 
      d.name_en.toLowerCase().includes(lowerTerm) || 
      d.name_cn.includes(searchTerm) ||
      (PinyinMatch.match(d.name_cn, searchTerm) as boolean | any[])
    );
  }, [drugs, searchTerm]);

  const filteredPrinciples = useMemo(() => {
    if (!searchTerm) return principles;
    const lowerTerm = searchTerm.toLowerCase();
    return principles.filter(p => 
      p.title.includes(searchTerm) || 
      p.subtitle?.toLowerCase().includes(lowerTerm) ||
      (PinyinMatch.match(p.title, searchTerm) as boolean | any[])
    );
  }, [principles, searchTerm]);

  const drugGroups = useMemo(() => {
    const grouped: Record<string, Drug[]> = {};
    filteredDrugs.forEach(d => {
      // Support both 'categories' (array) and 'category' (string) for backward compatibility
      const categories = d.categories && d.categories.length > 0 ? d.categories : (d.category ? [d.category] : []);
      categories.forEach(cat => {
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(d);
      });
    });
    return grouped;
  }, [filteredDrugs]);

  const principleGroups = useMemo(() => {
    const grouped: Record<string, Principle[]> = {};
    filteredPrinciples.forEach(p => {
      const cat = p.type === 'receptor' ? '受体百科' : '生物学假说';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    });
    return grouped;
  }, [filteredPrinciples]);

  // Update expanded categories when view changes or search results update
  useEffect(() => {
    if (searchTerm) {
      const totalItems = filteredDrugs.length + filteredPrinciples.length;
      // Auto-expand if results are few (<= 20)
      if (totalItems > 0 && totalItems <= 20) {
        const newExpanded = new Set<string>();
        Object.keys(drugGroups).forEach(cat => newExpanded.add(cat));
        Object.keys(principleGroups).forEach(cat => newExpanded.add(cat));
        setExpandedCategories(newExpanded);
      } else {
        // Collapse if too many results
        setExpandedCategories(new Set());
      }
      return;
    }

    // Default behavior: expand only current item's category
    const newExpanded = new Set<string>();
    
    if (currentView.type === 'drug') {
      const drug = drugs.find(d => d.id === currentView.id);
      if (drug) {
        // Support both 'categories' (array) and 'category' (string) for backward compatibility
        const categories = drug.categories && drug.categories.length > 0 ? drug.categories : (drug.category ? [drug.category] : []);
        categories.forEach(cat => newExpanded.add(cat));
      }
    } else if (currentView.type === 'principle') {
      const principle = principles.find(p => p.id === currentView.id);
      if (principle) {
        const cat = principle.type === 'receptor' ? '受体百科' : '生物学假说';
        newExpanded.add(cat);
      }
    }
    
    setExpandedCategories(newExpanded);
  }, [currentView, drugs, principles, searchTerm, filteredDrugs, filteredPrinciples, drugGroups, principleGroups]);

  const handleItemClick = (type: NavigateType, id: string) => {
    onNavigate(type, id);
    if (window.innerWidth < 768) setIsOpen(false);
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`
          fixed md:relative z-40 h-screen
          bg-white dark:bg-medical-panel
          border-r border-slate-200 dark:border-medical-line
          transition-[width,transform] duration-200 ease-out
          flex flex-col overflow-hidden
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${isCollapsed ? 'md:w-16' : 'md:w-72'}
          w-72
        `}
      >
        {/* Collapsed State - Expand Button */}
        {isCollapsed && (
          <div className="hidden md:flex flex-col items-center py-4">
            <button
              onClick={() => setIsCollapsed(false)}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-medical-surfaceAlt text-slate-400 hover:text-cyan-500 transition-all group"
              title="Expand Sidebar"
            >
              <svg className="w-5 h-5 transform group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path>
              </svg>
            </button>
          </div>
        )}

        {/* Expanded State - Full Content */}
        <div
          className={`flex min-h-0 flex-1 flex-col transition-opacity duration-150 ${
            isCollapsed ? 'md:opacity-0 md:pointer-events-none md:hidden' : 'opacity-100'
          }`}
        >
          <div className="p-4 border-b border-slate-200 dark:border-medical-line flex items-center justify-between">
            <div className="flex-1">
              <h1 className="font-serif text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-1">
                <span className="text-gradient">PsychPedia</span>
              </h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest">v2.0 Beta</p>
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setIsCollapsed(true)}
                className="hidden md:flex p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-medical-surfaceAlt text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors group"
                title="Collapse Sidebar"
              >
                <svg className="w-4 h-4 transform group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7"></path>
                </svg>
              </button>
              <button onClick={() => setIsOpen(false)} className="md:hidden p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
          </div>

          <div className="p-4 sticky top-0 bg-white dark:bg-medical-panel z-10 border-b border-slate-200 dark:border-medical-line">
            <div className="relative">
              <input
                type="text"
                placeholder="搜索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-100 dark:bg-medical-panel text-slate-900 dark:text-slate-100 text-sm rounded-lg px-4 py-2 pl-9 border border-slate-200 dark:border-medical-line focus:outline-none focus:ring-2 focus:ring-medical-primary"
              />
              <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pb-6 px-2">
            {Object.entries(principleGroups).map(([category, items]) => (
              <div key={category} className="mb-6">
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between px-3 mb-2 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider hover:text-slate-600 dark:hover:text-slate-400 transition-colors gap-2"
                >
                  <span className="text-left flex-1 break-words">{category}</span>
                  <svg className={`w-4 h-4 transition-transform duration-200 flex-shrink-0 ${expandedCategories.has(category) ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                </button>
                {expandedCategories.has(category) && (
                  <div className="space-y-1">
                    {items.map(p => (
                      <button
                        key={p.id}
                        onClick={() => handleItemClick('principle', p.id)}
                        className={`w-full text-left px-3 py-2 rounded-md transition-all duration-200 flex items-center gap-3 ${
                          currentView.id === p.id && currentView.type === 'principle'
                            ? 'bg-gradient-to-r from-violet-500/15 via-violet-500/5 to-transparent text-violet-700 dark:text-violet-300 shadow-[inset_3px_0_0_0_rgba(139,92,246,0.85)]'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-medical-surfaceAlt hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                        title={p.title}
                      >
                        <span className="w-5 h-5 flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                        </span>
                        <span className="text-sm font-medium truncate">{p.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {Object.entries(drugGroups).map(([category, items]) => (
              <div key={category} className="mb-6">
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between px-3 mb-2 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider hover:text-slate-600 dark:hover:text-slate-400 transition-colors gap-2"
                >
                  <span className="text-left flex-1 break-words">{category}</span>
                  <svg className={`w-4 h-4 transition-transform duration-200 flex-shrink-0 ${expandedCategories.has(category) ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                </button>
                {expandedCategories.has(category) && (
                  <div className="space-y-1">
                    {items.map(d => (
                      <button
                        key={d.id}
                        onClick={() => handleItemClick('drug', d.id)}
                        className={`w-full text-left px-3 py-2 rounded-md transition-all duration-200 flex items-center gap-3 ${
                          currentView.id === d.id && currentView.type === 'drug'
                            ? 'bg-gradient-to-r from-cyan-500/15 via-cyan-500/5 to-transparent text-cyan-700 dark:text-cyan-300 shadow-[inset_3px_0_0_0_rgba(14,165,233,0.9)]'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-medical-surfaceAlt hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                        title={d.name_cn}
                      >
                        <span className="w-5 h-5 flex items-center justify-center shrink-0">
                          <div className={`w-2 h-2 rounded-full transition-all ${currentView.id === d.id ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]' : 'bg-slate-400'}`}></div>
                        </span>
                        <div className="flex flex-col truncate">
                          <span className="text-sm font-medium">{d.name_cn}</span>
                          <span className="text-[10px] opacity-60">{d.name_en}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
