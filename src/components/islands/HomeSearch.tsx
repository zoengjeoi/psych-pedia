import { useEffect, useMemo, useState } from 'react';
import PinyinMatch from 'pinyin-match';
import type { EntryRef } from '../../lib/types';

interface Props {
  entries: EntryRef[];
}

/**
 * 首页搜索：输入时隐藏静态分类索引（#home-index），显示搜索结果。
 * 空态完全由服务端渲染，JS 只在真正输入后接管。
 */
const HomeSearch: React.FC<Props> = ({ entries }) => {
  const [query, setQuery] = useState('');
  const trimmed = query.trim();

  const results = useMemo(() => {
    if (!trimmed) return { drugs: [], principles: [] };
    const lower = trimmed.toLowerCase();
    const match = (e: EntryRef) =>
      e.cn.includes(trimmed) ||
      e.en.toLowerCase().includes(lower) ||
      Boolean(PinyinMatch.match(e.cn, trimmed));
    const hit = entries.filter(match);
    return {
      drugs: hit.filter((e) => e.kind === 'drug'),
      principles: hit.filter((e) => e.kind === 'principle'),
    };
  }, [entries, trimmed]);

  const total = results.drugs.length + results.principles.length;
  const searching = trimmed.length > 0;

  // 搜索时隐藏服务端渲染的静态分类索引
  useEffect(() => {
    const el = document.getElementById('home-index');
    if (el) el.style.display = searching ? 'none' : '';
    return () => {
      const el2 = document.getElementById('home-index');
      if (el2) el2.style.display = '';
    };
  }, [searching]);

  const pill = (e: EntryRef) => (
    <a
      key={`${e.kind}-${e.id}`}
      href={`/${e.id}`}
      className={`group inline-flex items-baseline gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm transition-colors dark:border-medical-line dark:bg-medical-panel ${
        e.kind === 'principle'
          ? 'hover:border-violet-400 hover:text-violet-600 dark:hover:border-violet-400 dark:hover:text-violet-300'
          : 'hover:border-cyan-400 hover:text-cyan-600 dark:hover:border-cyan-400 dark:hover:text-cyan-300'
      }`}
    >
      <span className="font-medium text-slate-700 group-hover:inherit dark:text-slate-200">
        {e.cn}
      </span>
      {e.en && (
        <span className="hidden text-[10px] text-slate-400 group-hover:opacity-70 sm:inline dark:text-slate-500">
          {e.en}
        </span>
      )}
    </a>
  );

  return (
    <>
      <div className="relative mx-auto mt-8 max-w-xl">
        <svg
          className="absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-slate-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索药物、受体、假说…（支持中文 / 英文 / 拼音）"
          className="w-full rounded-xl border border-slate-200 bg-white py-3.5 pr-10 pl-12 text-sm text-slate-900 shadow-sm transition-colors focus:border-transparent focus:ring-2 focus:ring-medical-primary focus:outline-none sm:text-base dark:border-medical-line dark:bg-medical-panel dark:text-slate-100"
        />
        {searching && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="清空搜索"
            className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-medical-surface-alt dark:hover:text-slate-200"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {searching && (
        <div className="mt-10 space-y-8 text-left">
          {results.drugs.length > 0 && (
            <section>
              <h3 className="mb-3 font-serif font-bold text-slate-800 dark:text-slate-200">
                药物 <span className="align-middle text-xs font-normal text-slate-400">({results.drugs.length})</span>
              </h3>
              <div className="flex flex-wrap gap-2">{results.drugs.map(pill)}</div>
            </section>
          )}
          {results.principles.length > 0 && (
            <section>
              <h3 className="mb-3 font-serif font-bold text-slate-800 dark:text-slate-200">
                受体与假说 <span className="align-middle text-xs font-normal text-slate-400">({results.principles.length})</span>
              </h3>
              <div className="flex flex-wrap gap-2">{results.principles.map(pill)}</div>
            </section>
          )}
          {total === 0 && (
            <div className="py-14 text-center text-slate-400 dark:text-slate-500">
              <p className="text-sm">未找到与「{trimmed}」相关的词条</p>
              <p className="mt-1 text-xs opacity-80">可以试试药物英文名、中文通用名或拼音首字母</p>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default HomeSearch;
