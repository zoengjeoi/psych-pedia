import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import DrugDetail from './components/DrugDetail';
import PrincipleDetail from './components/PrincipleDetail';
import EnzymeSummary from './components/EnzymeSummary';
import { Drug, NavigateType, Principle } from './types';

// Lightweight index types for sidebar
interface DrugIndex {
  id: string;
  name_cn: string;
  name_en: string;
  category: string;
  tags: string[];
}

interface PrincipleIndex {
  id: string;
  title: string;
  type: string;
  description?: string;
}

interface ViewState {
  type: NavigateType;
  id: string;
}

const App: React.FC = () => {
  // --- State ---
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [drugIndex, setDrugIndex] = useState<DrugIndex[]>([]);
  const [drugsLoading, setDrugsLoading] = useState(true);
  const [principleIndex, setPrincipleIndex] = useState<PrincipleIndex[]>([]);
  const [principlesLoading, setPrinciplesLoading] = useState(true);
  
  // Detail data cache
  const [drugCache, setDrugCache] = useState<Map<string, Drug>>(new Map());
  const [principleCache, setPrincipleCache] = useState<Map<string, Principle>>(new Map());
  
  // Router State
  const [currentView, setCurrentView] = useState<ViewState>({
    type: 'drug',
    id: '' // Will be set once drugs are loaded
  });
  const [history, setHistory] = useState<ViewState[]>([]);

  // Sidebar UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Mobile: Closed by default
  const [isCollapsed, setIsCollapsed] = useState(false); // Desktop: Expanded by default

  // --- Load Drugs Index from JSON ---
  useEffect(() => {
    const loadDrugsIndex = async () => {
      try {
        const response = await fetch('/drugs-index.json');
        if (!response.ok) throw new Error('Failed to load drugs-index.json');
        const data = await response.json();
        setDrugIndex(data.drugs);
        if (data.drugs.length > 0) {
          setCurrentView({ type: 'drug', id: data.drugs[0].id });
        }
      } catch (error) {
        console.error('Error loading drugs index:', error);
        setDrugIndex([]);
      } finally {
        setDrugsLoading(false);
      }
    };

    loadDrugsIndex();
  }, []);

  // --- Load Principles Index from JSON ---
  useEffect(() => {
    const loadPrinciplesIndex = async () => {
      try {
        const response = await fetch('/principles-index.json');
        if (!response.ok) throw new Error('Failed to load principles-index.json');
        const data = await response.json();
        // Combine receptors and hypotheses into a single array
        const allPrinciples: PrincipleIndex[] = [
          ...data.receptors,
          ...data.hypotheses
        ];
        setPrincipleIndex(allPrinciples);
      } catch (error) {
        console.error('Error loading principles index:', error);
        setPrincipleIndex([]);
      } finally {
        setPrinciplesLoading(false);
      }
    };

    loadPrinciplesIndex();
  }, []);

  // --- Theme Logic ---
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // --- Router Handlers ---
  
  // Drill-down navigation (Links, Radar) - Pushes to history
  const handleNavigate = (type: NavigateType, id: string) => {
    if (currentView.type === type && currentView.id === id) return;
    
    setHistory(prev => [...prev, currentView]);
    setCurrentView({ type, id });
    
    const main = document.getElementById('main-content');
    if (main) main.scrollTop = 0;
  };

  // Top-level navigation (Sidebar) - Resets history (Standard App Behavior)
  // or Pushes to history? For this app, sidebar clicks usually mean a new context.
  // We will reset history to avoid "Back" hell when switching between major drugs.
  const handleSidebarNavigate = (type: NavigateType, id: string) => {
    if (currentView.type === type && currentView.id === id) return;
    
    setHistory([]); // Reset history on major sidebar nav
    setCurrentView({ type, id });
    
    const main = document.getElementById('main-content');
    if (main) main.scrollTop = 0;
  };

  // Back Button Logic
  const handleBack = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    setCurrentView(previous);
  };

  // Helper to get back label
  const getBackLabel = () => {
    if (history.length === 0) return null;
    const last = history[history.length - 1];
    
    if (last.type === 'drug') {
      const d = drugIndex.find(x => x.id === last.id);
      return d ? d.name_cn : '药物详情';
    } else if (last.type === 'principle') {
      const p = principleIndex.find(x => x.id === last.id);
      return p ? p.title : '上一页';
    }
    return '酶汇总';
  };

  // --- Render Logic ---
  const renderContent = () => {

    if (drugsLoading || principlesLoading) {
      return <div className="p-10 text-center text-slate-500 dark:text-slate-400">加载中...</div>;
    }

    if (currentView.type === 'drug') {
      return (
        <DrugDetail 
          drugId={currentView.id}
          isDarkMode={isDarkMode} 
          onNavigate={handleNavigate}
          cache={drugCache}
          setCache={setDrugCache}
        />
      );
    }

    if (currentView.type === 'principle') {
      return (
        <PrincipleDetail 
          principleId={currentView.id}
          onBack={history.length > 0 ? handleBack : undefined}
          backLabel={getBackLabel()}
          onNavigate={handleNavigate}
          cache={principleCache}
          setCache={setPrincipleCache}
        />
      );
    }

    return (
      <EnzymeSummary
        enzymeId={currentView.id}
        onBack={history.length > 0 ? handleBack : undefined}
        backLabel={getBackLabel()}
        onNavigate={handleNavigate}
        isDarkMode={isDarkMode}
      />
    );
  };

  return (
    <div className="flex min-h-screen font-sans text-slate-900 dark:text-medical-text transition-colors duration-300">
      
      {/* Sidebar */}
      <Sidebar 
        drugs={drugIndex}
        principles={principleIndex}
        currentView={currentView}
        onNavigate={handleSidebarNavigate} // Use Sidebar specific handler
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
      />


      <main 
        id="main-content"
        className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto transition-all duration-300 relative"
      >
        
        {/* Top Navbar (Hamburger + Theme Toggle) */}
        <header className="sticky top-0 z-20 bg-white/80 dark:bg-medical-dark/80 backdrop-blur-md border-b border-slate-200 dark:border-medical-line px-6 py-4 flex justify-between items-center h-16 shrink-0">
           <div className="flex items-center gap-4">
             <button 
               onClick={() => setIsSidebarOpen(true)}
               className="md:hidden text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
               title="Open Menu"
             >
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
             </button>
           </div>

           <button 
             onClick={() => setIsDarkMode(!isDarkMode)}
             className="p-2 rounded-full bg-slate-100 dark:bg-medical-surface text-slate-600 dark:text-yellow-400 hover:bg-slate-200 dark:hover:bg-medical-surfaceAlt transition-colors"
             title="切换主题 (Toggle Theme)"
           >
             {isDarkMode ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
             ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
             )}
           </button>
        </header>

        {/* Dynamic Content View */}
        <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
            {renderContent()}
        </div>

      </main>
    </div>
  );
};

export default App;