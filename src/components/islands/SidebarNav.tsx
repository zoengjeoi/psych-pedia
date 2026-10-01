import { useEffect, useMemo, useRef, useState } from 'react';
import PinyinMatch from 'pinyin-match';
import { DRUG_CATEGORY_ORDER } from '../../lib/constants';
import type { EntryRef } from '../../lib/types';

interface Props {
  entries: EntryRef[];
  currentPath: string;
}

const sortGroups = (a: [string, EntryRef[]], b: [string, EntryRef[]]) => {
  const ia = DRUG_CATEGORY_ORDER.indexOf(a[0]);
  const ib = DRUG_CATEGORY_ORDER.indexOf(b[0]);
  return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
};

const SidebarNav: React.FC<Props> = ({ entries, currentPath: initialPath }) => {
  const [query, setQuery] = useState('');
  // 侧栏经 transition:persist 跨页面存活：高亮不再来自构建期的 props，
  // 而是跟随每次换页后的实际 URL（滚动位置、搜索词也因此得以保留）。
  const [currentPath, setCurrentPath] = useState(initialPath);
  const navRef = useRef<HTMLElement | null>(null);
  // 分组默认全部收起；仅当前词条所属分类自动展开，其余为用户手动开关。
  // 换页后手动状态清空，重新回到「只展开当前词条分类」的默认。
  const [userOpen, setUserOpen] = useState<Set<string>>(new Set());
  const [userClosed, setUserClosed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const update = () => setCurrentPath(location.pathname.replace(/\/+$/, '') || '/');
    document.addEventListener('astro:after-swap', update);
    return () => document.removeEventListener('astro:after-swap', update);
  }, []);

  // 换页后清空手动开合，并让激活项滚入视野
  useEffect(() => {
    setUserOpen(new Set());
    setUserClosed(new Set());
    const raf = requestAnimationFrame(() => {
      navRef.current
        ?.querySelector('a[aria-current="page"]')
        ?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(raf);
  }, [currentPath, query]);

  const filtered = useMemo(() => {
    if (!query.trim()) return entries;
    const q = query.trim();
    const lower = q.toLowerCase();
    return entries.filter((e) => {
      if (e.cn.includes(q)) return true;
      if (e.en.toLowerCase().includes(lower)) return true;
      return Boolean(PinyinMatch.match(e.cn, q));
    });
  }, [entries, query]);

  const groups = useMemo(() => {
    // 固定分组顺序：受体百科 -> 生物学假说 -> 药物分类（按主流顺序）
    const order = ['受体百科', '生物学假说'];
    const map = new Map<string, EntryRef[]>();
    for (const e of filtered) {
      // 多分类药物在每个所属分类下都出现（与旧版一致）
      for (const g of e.groups) {
        const list = map.get(g) ?? [];
        list.push(e);
        map.set(g, list);
      }
    }
    return Array.from(map.entries()).sort((a, b) => {
      const oa = order.indexOf(a[0]);
      const ob = order.indexOf(b[0]);
      if (oa !== -1 || ob !== -1) {
        return (oa === -1 ? 99 : oa) - (ob === -1 ? 99 : ob);
      }
      return sortGroups(a, b);
    });
  }, [filtered]);

  const activeGroups = useMemo(() => {
    // 当前词条所属的全部分类（安非他酮 = NDRI + ADHD 非兴奋剂）
    const s = new Set<string>();
    for (const e of entries) {
      if (currentPath === `/${e.id}`) e.groups.forEach((g) => s.add(g));
    }
    return s;
  }, [entries, currentPath]);

  const isGroupOpen = (group: string) => {
    if (query.trim()) {
      // 搜索：结果少时全部展开，多时收起（可手动展开某个分组）
      return filtered.length <= 20 ? !userClosed.has(group) : userOpen.has(group);
    }
    if (userClosed.has(group)) return false;
    return activeGroups.has(group) || userOpen.has(group);
  };
  const toggleGroup = (group: string) => {
    const open = isGroupOpen(group);
    setUserOpen((prev) => {
      const next = new Set(prev);
      if (open) next.delete(group);
      else next.add(group);
      return next;
    });
    setUserClosed((prev) => {
      const next = new Set(prev);
      if (open) next.add(group);
      else next.delete(group);
      return next;
    });
  };

  const isActive = (e: EntryRef) => currentPath === `/${e.id}`;

  return (
    <nav ref={navRef} className="flex min-h-0 flex-1 flex-col" aria-label="词条导航">
      <div className="border-b border-slate-200 p-4 dark:border-medical-line">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索药物 / 受体 / 假说…"
            className="w-full rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 pl-9 text-sm text-slate-900 focus:ring-2 focus:ring-medical-primary focus:outline-none dark:border-medical-line dark:bg-medical-panel dark:text-slate-100"
          />
          <svg
            className="absolute top-2.5 left-3 h-4 w-4 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            >
            </path>
          </svg>
        </div>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-6">
        {groups.length === 0 && (
          <p className="px-3 py-6 text-sm text-slate-400 dark:text-slate-500">
            未找到与「{query.trim()}」相关的词条
          </p>
        )}
        {groups.map(([group, items]) => {
          const open = isGroupOpen(group);
          return (
            <div key={group} className="mt-5 mb-2">
              <button
                type="button"
                onClick={() => toggleGroup(group)}
                className="flex w-full items-center justify-between gap-2 px-3 text-xs font-bold tracking-wider text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-400"
              >
                <span className="flex-1 text-left break-words">
                  {group}
                  <span className="ml-1.5 font-normal opacity-70">{items.length}</span>
                </span>
                <svg
                  className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
                </svg>
              </button>

              {open && (
                <div className="mt-1.5 space-y-0.5">
                  {items.map((e) => {
                    const active = isActive(e);
                    const violet = e.kind === 'principle' && e.groups.includes('受体百科');
                    return (
                      <a
                        key={`${e.kind}-${e.id}`}
                        href={`/${e.id}`}
                        title={e.cn}
                        aria-current={active ? 'page' : undefined}
                        className={`flex items-center gap-3 rounded-md px-3 py-1.5 text-left text-sm transition-colors duration-150 ${
                          active
                            ? violet
                              ? 'bg-violet-500/10 font-semibold text-violet-700 shadow-[inset_3px_0_0_0_rgba(139,92,246,0.85)] dark:text-violet-300'
                              : 'bg-cyan-500/10 font-semibold text-cyan-700 shadow-[inset_3px_0_0_0_rgba(14,165,233,0.9)] dark:text-cyan-300'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-medical-surface-alt dark:hover:text-slate-200'
                        }`}
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                          {e.kind === 'principle' ? (
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                              >
                              </path>
                            </svg>
                          ) : (
                            <span
                              className={`h-2 w-2 rounded-full transition-all ${
                                active ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]' : 'bg-slate-400/70'
                              }`}
                            >
                            </span>
                          )}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">{e.cn}</span>
                          {e.en && (
                            <span className="truncate text-[10px] opacity-60">{e.en}</span>
                          )}
                        </span>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
};

export default SidebarNav;
