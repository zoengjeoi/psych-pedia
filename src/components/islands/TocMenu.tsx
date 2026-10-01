import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TocItem } from '../../lib/types';

interface Props {
  items: TocItem[];
}

/**
 * 本页目录。
 *  - 桌面端（≥lg）：顶栏「目录」按钮，点击在按钮下方弹出面板；
 *  - 移动端（<lg）：右下悬浮按钮（FAB），点击滑出左侧抽屉——与旧版习惯一致。
 * 移动端的悬浮层通过 portal 挂到 body：顶栏的 backdrop-blur 会劫持 fixed
 * 定位的包含块，不逃出去抽屉会被压扁。
 * Scroll spy 高亮当前章节，点击条目平滑滚动。
 */
const TocMenu: React.FC<Props> = ({ items }) => {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const scrollLockUntil = useRef<number>(0);
  const visibleHeadings = useRef<Set<string>>(new Set());

  useEffect(() => setMounted(true), []);

  /* ---------- Scroll spy ---------- */
  useEffect(() => {
    if (items.length === 0) return;
    const elements = items
      .map((it) => document.getElementById(it.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visibleHeadings.current.add(entry.target.id);
          else visibleHeadings.current.delete(entry.target.id);
        }
        if (performance.now() < scrollLockUntil.current) return;
        const current = items.find((it) => visibleHeadings.current.has(it.id));
        if (current) setActiveId(current.id);
      },
      { rootMargin: '-96px 0px -40% 0px', threshold: 0 }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  /* ---------- 桌面端：点击面板外 / Esc 关闭 ---------- */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  const jumpTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    setActiveId(id);
    scrollLockUntil.current = performance.now() + 1000;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setOpen(false);
  };

  const activeIndex = Math.max(
    0,
    items.findIndex((it) => it.id === activeId)
  );

  const list = (variant: 'panel' | 'drawer') => (
    <ul
      className={`pp-toc-scroll relative flex flex-col gap-1 overflow-y-auto ${
        variant === 'panel' ? 'max-h-[60vh] px-3 py-2' : 'flex-1 py-2.5'
      }`}
    >
      {items.map((item, i) => {
        const active = item.id === activeId;
        const indent = Math.min(Math.max(item.depth - 2, 0), 3) * 16;
        return (
          <li key={`${item.id}-${i}`}>
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                jumpTo(item.id);
              }}
              className={`group relative flex items-center rounded-lg py-2 pr-3 transition-colors duration-150 ${
                variant === 'drawer' ? 'text-sm' : 'text-sm'
              } ${
                active
                  ? 'bg-cyan-500/10 font-semibold text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300'
                  : 'text-slate-500 hover:bg-slate-100/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200'
              }`}
              style={{ paddingLeft: `${(variant === 'drawer' ? 20 : 14) + indent}px` }}
            >
              <span className="truncate whitespace-nowrap">{item.text}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );

  const progress = (
    <div className="mx-5 mb-3.5 mt-1 h-[3px] overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/60">
      <div
        className="h-full rounded-full bg-medical-primary transition-[width] duration-300"
        style={{ width: `${((activeIndex + 1) / items.length) * 100}%` }}
      />
    </div>
  );

  return (
    <>
      {/* 桌面端入口：顶栏按钮 + 下方弹出面板 */}
      <div className="relative hidden lg:block">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="目录"
          title={`目录：${items[activeIndex]?.text ?? ''}`}
          className={`flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-all ${
            open
              ? 'border-medical-primary bg-cyan-50 text-medical-primary-deep dark:border-medical-primary-bright dark:bg-cyan-500/10 dark:text-cyan-200'
              : 'border-slate-200 bg-white text-slate-700 shadow-sm hover:border-medical-primary hover:text-medical-primary dark:border-white/10 dark:bg-medical-surface dark:text-slate-200 dark:hover:border-medical-primary-bright dark:hover:text-cyan-200'
          }`}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.5 6.5h10M9.5 12h10M9.5 17.5h10" />
            <circle cx="4.75" cy="6.5" r="1.15" fill="currentColor" stroke="none" />
            <circle cx="4.75" cy="12" r="1.15" fill="currentColor" stroke="none" />
            <circle cx="4.75" cy="17.5" r="1.15" fill="currentColor" stroke="none" />
          </svg>
          <span>目录</span>
        </button>

        {/* 目录面板：portal 到 body，fixed 贴内容区左缘（自动感知侧栏折叠），顶栏下方弹出 */}
        {open &&
          mounted &&
          createPortal(
            <div className="pp-toc-panel fixed top-[70px] z-40 hidden w-[340px] lg:block">
              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-slate-900/10 dark:border-white/10 dark:bg-[#1a2029] dark:shadow-black/40">
                <div className="flex items-center justify-between px-5 pt-3.5 pb-1.5">
                  <p className="text-xs font-semibold tracking-widest text-slate-400 uppercase dark:text-slate-500">
                    目录
                  </p>
                  <p className="font-mono text-xs text-slate-300 dark:text-slate-600">
                    {activeIndex + 1}/{items.length}
                  </p>
                </div>
                {list('panel')}
                {progress}
              </div>
            </div>,
            document.body
          )}
      </div>

      {/* 移动端：悬浮按钮 + 遮罩 + 右侧抽屉（portal 挂到 body）。
          抽屉常驻 DOM，靠 class 切换触发滑入/滑出动画（条件渲染会跳过过渡）。 */}
      {mounted &&
        createPortal(
          <>
            <button
              type="button"
              aria-label="打开目录"
              onClick={() => setOpen(true)}
              className="fixed right-5 bottom-6 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-lg transition-colors hover:text-medical-primary lg:hidden dark:border-white/10 dark:bg-medical-surface dark:text-slate-300"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.5 6.5h10M9.5 12h10M9.5 17.5h10" />
                <circle cx="4.75" cy="6.5" r="1.15" fill="currentColor" stroke="none" />
                <circle cx="4.75" cy="12" r="1.15" fill="currentColor" stroke="none" />
                <circle cx="4.75" cy="17.5" r="1.15" fill="currentColor" stroke="none" />
              </svg>
            </button>

            <div
              className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 lg:hidden ${
                open ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
              onClick={() => setOpen(false)}
            />
            <div
              aria-hidden={!open}
              className={`toc-drawer fixed inset-y-0 right-0 z-40 flex w-72 flex-col border-l border-slate-200 bg-white shadow-2xl lg:hidden dark:border-white/10 dark:bg-medical-panel ${
                open ? 'open' : ''
              }`}
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5 dark:border-medical-line">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">目录</p>
                <button
                  type="button"
                  aria-label="关闭目录"
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-medical-surface-alt"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
              {list('drawer')}
            </div>
          </>,
          document.body
        )}
    </>
  );
};

export default TocMenu;
