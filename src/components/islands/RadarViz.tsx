import React, { useEffect, useRef, useState } from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { navigate } from 'astro:transitions/client';
import type { ReceptorAction, StahlRadarData } from '../../lib/types';

const ACTION_CONFIG = {
  agonist: {
    color: { light: '#dc2626', dark: '#ef4444' },
    label_cn: '激动剂',
    label_en: 'Agonist',
  },
  partial_agonist: {
    color: { light: '#ea580c', dark: '#f97316' },
    label_cn: '部分激动剂',
    label_en: 'Partial',
  },
  antagonist: {
    color: { light: '#2563eb', dark: '#3b82f6' },
    label_cn: '拮抗剂',
    label_en: 'Antagonist',
  },
  inverse_agonist: {
    color: { light: '#9333ea', dark: '#a855f7' },
    label_cn: '反向激动',
    label_en: 'Inverse',
  },
  pam: {
    color: { light: '#059669', dark: '#10b981' },
    label_cn: '正向变构',
    label_en: 'PAM',
  },
  nam: {
    color: { light: '#64748b', dark: '#94a3b8' },
    label_cn: '负向变构',
    label_en: 'NAM',
  },
} as const;

/** 响应式跟随明暗主题（主题切换不重挂载，需要监听 html.dark） */
const useIsDark = (): boolean => {
  const [isDark, setIsDark] = useState(
    () =>
      typeof document !== 'undefined' &&
      document.documentElement.classList.contains('dark')
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);
  return isDark;
};

const formatRadarLabel = (label: string): string => {
  if (!label) return label;
  return label
    .replace(/Na\+Channel/gi, 'Na⁺通道')
    .replace(/Ca2\+Channel/gi, 'Ca²⁺通道')
    .replace(/Ca\+Channel/gi, 'Ca²⁺通道')
    .replace(/Channel/gi, '通道');
};

/** 靶点跳转属于「词条内钻取」，压入导航栈让目标页显示返回键 */
const pushDepthNav = (dest: string) => {
  try {
    const stack = JSON.parse(sessionStorage.getItem('pp-navstack') || '[]');
    stack.push({ p: dest, d: true });
    sessionStorage.setItem('pp-navstack', JSON.stringify(stack.slice(-30)));
  } catch {
    /* sessionStorage 不可用时静默降级 */
  }
};

interface RadarVizProps {
  data: StahlRadarData;
}

const RadarViz: React.FC<RadarVizProps> = ({ data }) => {
  const isDark = useIsDark();
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  const hasActionData = data.bindings && data.bindings.length > 0;

  const chartData = hasActionData
    ? data.bindings!.map((binding) => ({
        subject: binding.label,
        A: binding.value,
        fullMark: 10,
        linkId: binding.link_id ?? '',
        action: binding.action,
      }))
    : (data.labels ?? []).map((label, index) => ({
        subject: label,
        A: (data.values ?? [])[index],
        fullMark: 10,
        linkId: (data.link_ids ?? [])[index] ?? '',
        action: undefined as ReceptorAction | undefined,
      }));

  const axisColor = isDark ? '#94a3b8' : '#475569';
  const gridColor = isDark ? '#334155' : '#e2e8f0';
  const shapeFill = isDark ? 'rgba(14, 165, 233, 0.3)' : 'rgba(14, 165, 233, 0.2)';
  const shapeStroke = isDark ? '#0ea5e9' : '#0284c7';

  const getActionColor = (action?: ReceptorAction) => {
    if (!action) return shapeStroke;
    const config = ACTION_CONFIG[action];
    return isDark ? config.color.dark : config.color.light;
  };

  const CustomTick = (props: { payload?: { value?: string }; x?: number; y?: number; textAnchor?: string }) => {
    const { payload, x, y, textAnchor } = props;
    const item = chartData.find((d) => d.subject === payload?.value);
    const linkId = item?.linkId ?? '';
    return (
      <g
        className="cursor-pointer"
        onClick={() => {
          if (linkId) {
            pushDepthNav(`/${linkId}`);
            navigate(`/${linkId}`);
          }
        }}
      >
        <text
          x={x}
          y={y}
          textAnchor={textAnchor as 'start' | 'middle' | 'end' | undefined}
          fill={axisColor}
          fontSize={12}
          fontWeight={600}
          fontFamily="system-ui, -apple-system, sans-serif"
          className="radar-tick-label transition-colors duration-200"
        >
          {formatRadarLabel(payload?.value ?? '')}
        </text>
      </g>
    );
  };

  const CustomTooltip = ({ active, payload, coordinate }: any) => {
    if (active && payload?.length && mousePos && coordinate && showTooltip) {
      const item = payload[0].payload;
      const action = item.action as ReceptorAction | undefined;
      const distance = Math.sqrt(
        Math.pow(mousePos.x - coordinate.x, 2) + Math.pow(mousePos.y - coordinate.y, 2)
      );
      if (distance > 30) return null;
      return (
        <div className="pointer-events-none rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <p className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {formatRadarLabel(item.subject as string)}
          </p>
          <p className="mb-1 text-xs text-cyan-600 dark:text-cyan-400">
            亲和力: <span className="font-mono font-bold">{Number(item.A).toFixed(1)}</span>
          </p>
          {action && (
            <p className="text-xs font-medium" style={{ color: getActionColor(action) }}>
              {ACTION_CONFIG[action].label_cn}
              <span className="ml-1 opacity-70">({ACTION_CONFIG[action].label_en})</span>
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div
        className="relative min-h-0 flex-1 select-none"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
          setShowTooltip(true);
        }}
        onMouseLeave={() => {
          if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = setTimeout(() => {
            setShowTooltip(false);
            setMousePos(null);
          }, 100);
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="75%" data={chartData}>
            <PolarGrid stroke={gridColor} strokeWidth={1} />
            <PolarAngleAxis dataKey="subject" tick={<CustomTick />} />
            <PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
            <Radar
              name="Receptor Affinity"
              dataKey="A"
              stroke={shapeStroke}
              strokeWidth={2.5}
              fill={shapeFill}
              fillOpacity={0.6}
              isAnimationActive={true}
              dot={false}
              activeDot={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={false} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default RadarViz;
