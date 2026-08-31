import React, { useEffect, useState } from 'react';
import { Drug, NavigateType } from '../types';
import { ENZYME_REGEX } from '../utils';
import RadarViz from './RadarChart';
import RichText from './RichText';
import WikiContent from './WikiContent';

interface DrugDetailProps {
  drugId: string;
  isDarkMode: boolean;
  onNavigate: (type: NavigateType, id: string) => void;
  cache: Map<string, Drug>;
  setCache: React.Dispatch<React.SetStateAction<Map<string, Drug>>>;
}

const DrugDetail: React.FC<DrugDetailProps> = ({ drugId, isDarkMode, onNavigate, cache, setCache }) => {
  const [drug, setDrug] = useState<Drug | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFormulation, setSelectedFormulation] = useState<string>('');

  useEffect(() => {
    const loadDrugDetail = async () => {
      // Check cache first
      if (cache.has(drugId)) {
        const cachedDrug = cache.get(drugId)!;
        setDrug(cachedDrug);
        // Initialize selected formulation
        if (cachedDrug.pk_data?.dosage_forms?.length > 0) {
          setSelectedFormulation(cachedDrug.pk_data.dosage_forms[0].formulation);
        }
        setLoading(false);
        return;
      }

      // Load from server
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/drugs/${drugId}.json`);
        if (!response.ok) throw new Error(`Failed to load drug: ${drugId}`);
        const data = await response.json();
        setDrug(data);
        // Initialize selected formulation
        if (data.pk_data?.dosage_forms?.length > 0) {
          setSelectedFormulation(data.pk_data.dosage_forms[0].formulation);
        }
        
        // Update cache
        setCache(prev => new Map(prev).set(drugId, data));
      } catch (err) {
        console.error('Error loading drug detail:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    loadDrugDetail();
  }, [drugId, cache, setCache]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <p className="text-slate-500 dark:text-slate-400">加载药物详情中...</p>
        </div>
      </div>
    );
  }

  if (error || !drug) {
    return (
      <div className="p-10 text-center">
        <div className="text-red-500 dark:text-red-400 mb-2">❌ 加载失败</div>
        <p className="text-slate-500 dark:text-slate-400">{error || 'Drug not found'}</p>
      </div>
    );
  }
  
  const getPearlColor = (type: string) => {
    switch (type) {
      case 'danger': return 'border-red-500 bg-red-50 dark:bg-red-900/10 text-red-900 dark:text-red-200';
      case 'warning': return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/10 text-yellow-900 dark:text-yellow-200';
      case 'success': return 'border-green-500 bg-green-50 dark:bg-green-900/10 text-green-900 dark:text-green-200';
      default: return 'border-blue-500 bg-blue-50 dark:bg-blue-900/10 text-blue-900 dark:text-blue-200';
    }
  };

  const getPearlIcon = (type: string) => {
     switch (type) {
      case 'danger': return (
        <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
      );
      case 'warning': return (
        <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      );
      case 'success': return (
         <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      );
      default: return (
        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      );
    }
  }

  const renderMetabolism = (metabolism: string) => {
    if (!metabolism) return null;
    const regex = new RegExp(ENZYME_REGEX.source, 'gi');
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(metabolism)) !== null) {
      if (match.index > lastIndex) {
        parts.push(metabolism.slice(lastIndex, match.index));
      }

      const enzyme = match[0].toUpperCase();
      parts.push(
        <button
          key={`enzyme-${match.index}-${enzyme}`}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onNavigate('enzyme', enzyme);
          }}
          className="text-cyan-600 dark:text-cyan-400 font-bold hover:underline hover:text-cyan-500"
        >
          {enzyme}
        </button>
      );

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < metabolism.length) {
      parts.push(metabolism.slice(lastIndex));
    }

    return parts.length > 0 ? parts : metabolism;
  };

  const hasRadar = Boolean(
    drug.stahl_radar?.bindings?.length ||
    (drug.stahl_radar?.labels?.length && drug.stahl_radar?.values?.length)
  );

  const dosageForms = drug.pk_data?.dosage_forms || [];
  const hasMultipleDosageForms = dosageForms.length > 1;
  const activeDosageForm = dosageForms.find(f => f.formulation === selectedFormulation) || dosageForms[0];
  const halfLifeValue = hasMultipleDosageForms
    ? `${activeDosageForm?.half_life || drug.pk_data?.half_life || 'N/A'} ${activeDosageForm?.formulation || ''}`
    : (drug.pk_data?.half_life || 'N/A');

  const handleHalfLifeToggle = () => {
    if (!hasMultipleDosageForms) return;
    const currentIndex = dosageForms.findIndex(f => f.formulation === selectedFormulation);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % dosageForms.length : 0;
    setSelectedFormulation(dosageForms[nextIndex].formulation);
  };

  return (
    <div className="space-y-8 animate-fade-in">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
            <div>
                <h2 className="font-serif text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight mb-1">
                    {drug.name_cn}
                </h2>
                <div className="flex items-center gap-3">
                    <span className="text-xl text-slate-500 dark:text-slate-400 font-medium font-mono">
                        {drug.name_en}
                    </span>
                    <div className="flex flex-wrap gap-2">
                        {drug.categories && drug.categories.length > 0
                          ? drug.categories.map(cat => (
                              <span key={cat} className="px-2 py-0.5 rounded text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                {cat}
                              </span>
                            ))
                          : drug.category && (
                              <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                {drug.category}
                              </span>
                            )}
                    </div>
                </div>
            </div>
             <div className="flex flex-wrap gap-2 md:ml-auto">
                {drug.tags?.map(tag => (
                    <span key={tag} className="px-3 py-1 rounded-full text-xs font-semibold bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border border-cyan-100 dark:border-cyan-800">
                        {tag}
                    </span>
                ))}
            </div>
        </div>

        {/* PK Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div className="bg-slate-100 dark:bg-medical-surface p-4 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col items-center text-center">
                 <span className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">半衰期 (T1/2)</span>
                 {hasMultipleDosageForms ? (
                   <button
                     type="button"
                     onClick={handleHalfLifeToggle}
                     className="text-2xl font-black text-slate-800 dark:text-white font-mono hover:underline hover:text-slate-600 dark:hover:text-slate-300 transition"
                     title="点击切换剂型"
                   >
                     {halfLifeValue}
                   </button>
                 ) : (
                   <span className="text-2xl font-black text-slate-800 dark:text-white font-mono">{halfLifeValue}</span>
                 )}
             </div>
             <div className="bg-slate-100 dark:bg-medical-surface p-4 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col items-center text-center">
                 <span className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">蛋白结合率</span>
                 <span className="text-2xl font-black text-slate-800 dark:text-white font-mono">{drug.pk_data.protein_binding}</span>
             </div>
             <div className="bg-slate-100 dark:bg-medical-surface p-4 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col items-center text-center">
                 <span className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">主要代谢途径</span>
                 <span className="text-xl font-bold text-slate-800 dark:text-cyan-400 font-mono">
                   {renderMetabolism(drug.pk_data.metabolism)}
                 </span>
             </div>
        </div>

        {/* Main Grid */}
        <div className={hasRadar ? 'grid grid-cols-1 lg:grid-cols-2 gap-8' : 'space-y-4'}>
          {hasRadar && (
            <div className="bg-white dark:bg-medical-surface rounded-xl p-2 sm:p-3 card-depth border border-slate-200 dark:border-medical-line flex flex-col">
              <div className="mb-1 flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-1">
                <h3 className="font-bold text-sm sm:text-base text-slate-800 dark:text-cyan-400 flex items-center gap-2">
                    <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                    功能靶点雷达 (Functional Target Profile)
                </h3>

              </div>
              <div className="h-64 sm:h-96">
                <RadarViz 
                  data={drug.stahl_radar} 
                  onLabelClick={(linkId) => onNavigate('principle', linkId)} 
                  isDarkMode={isDarkMode}
                />
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
              <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200">临床实战笔记 (Practice Notes)</h3>
            </div>
                
            {drug.pearls?.map((pearl, idx) => (
              <div key={idx} className={`p-4 rounded-lg border-l-4 shadow-sm ${getPearlColor(pearl.type)} hover:shadow-md hover:-translate-y-0.5 transition-all`}>
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex-shrink-0">
                    {getPearlIcon(pearl.type)}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm uppercase tracking-wide opacity-90 mb-1">{pearl.title}</h4>
                    <RichText content={pearl.content} onNavigate={onNavigate} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Market Info */}
        <div className="bg-slate-50 dark:bg-medical-panel rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4">市场与处方信息</h4>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                    <span className="block text-xs text-slate-400 mb-1">价格/供应</span>
                    <span className="font-mono text-sm dark:text-slate-200 font-medium">{drug.market_info.price}</span>
                </div>
                <div>
                    <span className="block text-xs text-slate-400 mb-1">医保状态</span>
                    <span className="font-mono text-sm dark:text-slate-200 font-medium">{drug.market_info.insurance}</span>
                </div>
                <div>
                    <span className="block text-xs text-slate-400 mb-1">妊娠分级</span>
                    <span className="font-mono text-sm dark:text-slate-200 font-medium">{drug.market_info.pregnancy}</span>
                </div>
            </div>
        </div>

        {/* Wiki Content Section */}
        <WikiContent
          content={drug.wiki_content}
          title={drug.name_cn}
          isDarkMode={isDarkMode}
          editable={false}
          onNavigate={onNavigate}
        />
    </div>
  );
};

export default DrugDetail;