import React, { useEffect, useState } from 'react';
import { NavigateType, Principle } from '../types';
import RichText from './RichText';
import WikiContent from './WikiContent';

interface PrincipleDetailProps {
  principleId: string;
  onBack?: () => void;
  backLabel?: string | null;
  onNavigate: (type: NavigateType, id: string) => void;
  isDarkMode?: boolean;
  cache: Map<string, Principle>;
  setCache: React.Dispatch<React.SetStateAction<Map<string, Principle>>>;
}

const PrincipleDetail: React.FC<PrincipleDetailProps> = ({ 
  principleId, 
  onBack, 
  backLabel, 
  onNavigate, 
  isDarkMode = true,
  cache,
  setCache
}) => {
  const isReceptorLike = (type?: string) =>
    type === 'receptor' || type === 'transporter' || type === 'ion_channel';
  const [principle, setPrinciple] = useState<Principle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPrincipleDetail = async () => {
      // Check cache first
      if (cache.has(principleId)) {
        setPrinciple(cache.get(principleId)!);
        setLoading(false);
        return;
      }

      // Load from server
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/principles/${principleId}.json`);
        if (!response.ok) throw new Error(`Failed to load principle: ${principleId}`);
        const data = await response.json();
        setPrinciple(data);
        
        // Update cache
        setCache(prev => new Map(prev).set(principleId, data));
      } catch (err) {
        console.error('Error loading principle detail:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    loadPrincipleDetail();
  }, [principleId, cache, setCache]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <p className="text-slate-500 dark:text-slate-400">加载原理详情中...</p>
        </div>
      </div>
    );
  }

  if (error || !principle) {
    return (
      <div className="p-10 text-center">
        <div className="text-red-500 dark:text-red-400 mb-2">❌ 加载失败</div>
        <p className="text-slate-500 dark:text-slate-400">{error || 'Principle not found'}</p>
      </div>
    );
  }
  
  return (
    <div className="w-full px-6 md:px-10 py-8 animate-fade-in">
      
      {/* Back Button */}
      {onBack && backLabel && (
        <button 
          onClick={onBack}
          className="group mb-6 flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors bg-white dark:bg-medical-panel border border-slate-200 dark:border-medical-line rounded-lg shadow-sm hover:shadow"
        >
          <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
          <span>返回 {backLabel}</span>
        </button>
      )}

      <div>
        {/* Header */}
        <div className="mb-6">
           <div className="flex items-center gap-3 mb-2">
             <span className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider ${isReceptorLike(principle.type) ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300' : 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300'}`}>
               {isReceptorLike(principle.type) ? '基础受体' : '生物学假说'}
             </span>
           </div>
           <h1 className="font-serif text-4xl font-bold text-slate-900 dark:text-white mb-2">{principle.title}</h1>
           {principle.subtitle && (
             <h2 className="text-xl font-mono text-slate-500 dark:text-slate-400">{principle.subtitle}</h2>
           )}
        </div>

        {/* Content */}
        <div className="space-y-8">
           {/* Short Introduction Section */}
           <div className="prose prose-lg dark:prose-invert max-w-none text-slate-700 dark:text-slate-300">
             <RichText content={principle.content} onNavigate={onNavigate} />
           </div>

           {/* Images Section */}
           {principle.images && principle.images.length > 0 && (
             <div className="space-y-4">
               <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                 <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                 图像资料
               </h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {principle.images.map((img, idx) => (
                   <div key={idx} className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                     <img 
                       src={img.url} 
                       alt={img.alt} 
                       className="w-full h-auto max-h-96 object-contain"
                       onError={(e) => {
                         (e.target as HTMLImageElement).style.display = 'none';
                       }}
                     />
                     {img.alt && <p className="p-2 text-xs text-slate-600 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700">{img.alt}</p>}
                   </div>
                 ))}
               </div>
             </div>
           )}
           
         </div>
      </div>

      {/* Wiki Content Section */}
      <div className="mt-6">
        <WikiContent
          content={principle.wiki_content}
          title={principle.title}
          isDarkMode={isDarkMode}
          editable={false}
        />
      </div>
    </div>
  );
};

export default PrincipleDetail;