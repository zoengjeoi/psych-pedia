import React, { useMemo, useState } from 'react';
import PinyinMatch from 'pinyin-match';
import { NavigateType } from '../types';
import { DRUG_CATEGORY_ORDER } from '../constants';

interface DrugIndex {
  id: string;
  name_cn: string;
  name_en: string;
  category?: string;
  categories?: string[];
  tags?: string[];
}

interface PrincipleIndex {
  id: string;
  title: string;
  type: string;
  description?: string;
}

interface HomeProps {
  drugs: DrugIndex[];
  principles: PrincipleIndex[];
  onNavigate: (type: NavigateType, id: string) => void;
  isDarkMode: boolean;
}

const Home: React.FC<HomeProps> = ({ drugs, principles, onNavigate, isDarkMode }) => {
  const [searchTerm, setSearchTerm] = useState('');

  // --- 分类分组(兼容 category 字符串与 categories 数组) ---
  const categoryGroups = useMemo(() => {
    const grouped: Record<string, DrugIndex[]> = {};
    drugs.forEach(d => {
      const cats = d.categories && d.categories.length > 0 ? d.categories : [d.category || '未分类'];
      cats.forEach(cat => {
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(d);
      });
    });
    // 按主流分类顺序排序(未在清单中的排最后)
    return Object.entries(grouped).sort((a, b) => {
      const ia = DRUG_CATEGORY_ORDER.indexOf(a[0]);
      const ib = DRUG_CATEGORY_ORDER.indexOf(b[0]);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }, [drugs]);

  // --- 搜索结果 ---
  const filteredDrugs = useMemo(() => {
    if (!searchTerm) return [];
    const lower = searchTerm.toLowerCase();
    return drugs.filter(d =>
      d.name_cn.includes(searchTerm) ||
      d.name_en.toLowerCase().includes(lower) ||
      (PinyinMatch.match(d.name_cn, searchTerm) as boolean | any[])
    );
  }, [drugs, searchTerm]);

  const filteredPrinciples = useMemo(() => {
    if (!searchTerm) return [];
    const lower = searchTerm.toLowerCase();
    return principles.filter(p =>
      p.title.includes(searchTerm) ||
      p.description?.toLowerCase().includes(lower) ||
      (PinyinMatch.match(p.title, searchTerm) as boolean | any[])
    );
  }, [principles, searchTerm]);

  const totalResults = filteredDrugs.length + filteredPrinciples.length;

  // --- 药丸:药物词条(索引与搜索共用) ---
  const renderDrugPill = (d: DrugIndex) => (
    <button
      key={d.id}
      onClick={() => onNavigate('drug', d.id)}
      className="group inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-md text-sm border border-slate-200 dark:border-medical-line bg-slate-50 dark:bg-medical-panel hover:border-cyan-400 dark:hover:border-cyan-400 hover:text-cyan-600 dark:hover:text-cyan-300 hover:-translate-y-0.5 transition-all"
      title={`${d.name_cn} · ${d.name_en}`}
    >
      <span className="font-medium text-slate-700 dark:text-slate-200">{d.name_cn}</span>
      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono hidden sm:inline group-hover:text-cyan-400 dark:group-hover:text-cyan-300">{d.name_en}</span>
    </button>
  );

  const renderPrinciplePill = (p: PrincipleIndex) => (
    <button
      key={p.id}
      onClick={() => onNavigate('principle', p.id)}
      className="group inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-md text-sm border border-slate-200 dark:border-medical-line bg-slate-50 dark:bg-medical-panel hover:border-violet-400 dark:hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-300 hover:-translate-y-0.5 transition-all"
      title={p.title}
    >
      <span className="font-medium text-slate-700 dark:text-slate-200">{p.title}</span>
    </button>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-10 animate-fade-in">
      {/* ---------- Hero:Logo + 搜索框 ---------- */}
      <div className="text-center mb-12">
        <h1 className="font-serif text-4xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white">
          <span className="text-gradient">PsychPedia</span>
        </h1>
        <p className="mt-3 text-slate-500 dark:text-slate-400">精神药理学临床速查百科 · 为临床医生打造</p>

        {/* 搜索框 */}
        <div className="relative max-w-xl mx-auto mt-7">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜索药物、受体、假说…(支持中文 / 英文 / 拼音)"
            className="w-full bg-white dark:bg-medical-panel text-slate-900 dark:text-slate-100 text-sm sm:text-base rounded-xl pl-12 pr-10 py-3.5 border border-slate-200 dark:border-medical-line shadow-sm focus:outline-none focus:ring-2 focus:ring-medical-primary focus:border-transparent transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-medical-surfaceAlt transition-colors"
              title="清空"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
        {searchTerm && (
          <p className="mt-2.5 text-xs text-slate-400 dark:text-slate-500">共 {totalResults} 条结果，点击词条直接跳转</p>
        )}
      </div>

      {/* ---------- 搜索结果或分类索引 ---------- */}
      {searchTerm ? (
        <div className="space-y-7">
          {filteredDrugs.length > 0 && (
            <section>
              <h3 className="font-serif font-bold text-slate-800 dark:text-slate-200 mb-3">
                药物 <span className="text-xs font-normal text-slate-400 align-middle">({filteredDrugs.length})</span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {filteredDrugs.map(renderDrugPill)}
              </div>
            </section>
          )}
          {filteredPrinciples.length > 0 && (
            <section>
              <h3 className="font-serif font-bold text-slate-800 dark:text-slate-200 mb-3">
                受体与假说 <span className="text-xs font-normal text-slate-400 align-middle">({filteredPrinciples.length})</span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {filteredPrinciples.map(renderPrinciplePill)}
              </div>
            </section>
          )}
          {totalResults === 0 && (
            <div className="text-center py-14 text-slate-400 dark:text-slate-500">
              <div className="text-4xl mb-3 opacity-50">🔍</div>
              <p className="text-sm">未找到与「{searchTerm}」相关的词条</p>
            </div>
          )}
        </div>
      ) : (
        /* ---------- 药物分类词条索引 ---------- */
        <div>
          <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-200 dark:border-medical-line">
            <h2 className="font-serif text-xl font-bold text-slate-800 dark:text-slate-200">药物分类索引</h2>
            <span className="text-xs text-slate-400 dark:text-slate-500">{drugs.length} 种药物 · {categoryGroups.length} 个分类</span>
          </div>
          <div className="space-y-5">
            {categoryGroups.map(([cat, items]) => (
              <div key={cat} className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
                <div className="sm:w-48 sm:shrink-0 flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 leading-snug">{cat}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-cyan-50 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300">{items.length}</span>
                </div>
                <div className="flex flex-wrap gap-2 flex-1">
                  {items.map(renderDrugPill)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
