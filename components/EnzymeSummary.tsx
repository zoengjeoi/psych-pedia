import React, { useEffect, useMemo, useState } from 'react';
import { Drug, NavigateType } from '../types';
import { extractEnzymes } from '../utils';

interface EnzymeSummaryProps {
  enzymeId: string;
  onBack?: () => void;
  backLabel?: string | null;
  onNavigate: (type: NavigateType, id: string) => void;
  isDarkMode?: boolean;
}

const EnzymeSummary: React.FC<EnzymeSummaryProps> = ({
  enzymeId,
  onBack,
  backLabel,
  onNavigate,
  isDarkMode = true
}) => {
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const normalizedEnzyme = enzymeId.toUpperCase();

  useEffect(() => {
    const loadDrugs = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/drugs.json');
        if (!response.ok) throw new Error('Failed to load drugs.json');
        const data = await response.json();
        setDrugs(data.drugs || []);
      } catch (err) {
        console.error('Error loading drugs for enzyme summary:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    loadDrugs();
  }, []);

  const matchedDrugs = useMemo(() => {
    return drugs.filter(drug => {
      const enzymes = extractEnzymes(drug.pk_data?.metabolism);
      return enzymes.includes(normalizedEnzyme);
    });
  }, [drugs, normalizedEnzyme]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <p className="text-slate-500 dark:text-slate-400">加载酶汇总中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-10 text-center">
        <div className="text-red-500 dark:text-red-400 mb-2">❌ 加载失败</div>
        <p className="text-slate-500 dark:text-slate-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8 animate-fade-in">
      {onBack && backLabel && (
        <button
          onClick={onBack}
          className="group mb-6 flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors bg-white dark:bg-medical-panel border border-slate-200 dark:border-medical-line rounded-lg shadow-sm hover:shadow"
        >
          <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
          <span>返回 {backLabel}</span>
        </button>
      )}

      <div className="bg-white dark:bg-medical-surface rounded-2xl card-depth border border-slate-200 dark:border-medical-line overflow-hidden">
        <div className="relative overflow-hidden bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-medical-panel p-8 border-b border-slate-200 dark:border-medical-line">
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-cyan-500/10 dark:bg-teal-400/10 blur-3xl animate-glow-pulse"></div>
          <div className="relative flex items-center gap-3 mb-2">
            <span className="px-3 py-1 rounded text-xs font-bold uppercase tracking-wider bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300">肝酶</span>
          </div>
          <h1 className="relative font-serif text-4xl font-bold text-slate-900 dark:text-white mb-2">{normalizedEnzyme}</h1>
          <p className="relative text-slate-600 dark:text-slate-300">共 {matchedDrugs.length} 种药物涉及该代谢途径</p>
        </div>

        <div className="p-8">
          {matchedDrugs.length === 0 ? (
            <div className="p-8 bg-slate-50 dark:bg-black/20 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center">
              <p className="text-sm text-slate-500">暂无匹配药物</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {matchedDrugs.map(drug => (
                <button
                  key={drug.id}
                  onClick={() => onNavigate('drug', drug.id)}
                  className="text-left group rounded-xl border border-slate-200 dark:border-medical-line bg-slate-50 dark:bg-medical-panel/60 p-4 hover:shadow-md hover:shadow-cyan-500/10 hover:border-cyan-400 hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-400">
                        {drug.name_cn}
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">{drug.name_en}</p>
                    </div>
                    <span className="text-xs font-semibold px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                      {drug.categories && drug.categories.length > 0 ? drug.categories[0] : drug.category}
                    </span>
                  </div>
                  {drug.pk_data?.metabolism && (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      代谢途径：{drug.pk_data.metabolism}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EnzymeSummary;
