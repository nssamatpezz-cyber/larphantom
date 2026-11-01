import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Area, Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import type { ChartPeriod, Settings } from './types';
import { toDisplayCurrency } from './logic';
import { useReducedMotion } from './motion';

type Props = { values: number[]; currency: Settings['currency']; settings: Settings; symbol?: string; period?: ChartPeriod; onPeriodChange?: (period: ChartPeriod) => void; height?: number; periods?: ChartPeriod[] };

function ChartTooltip({ active, payload, currency, settings, symbol }: { active?: boolean; payload?: Array<{ value?: number }>; currency: Settings['currency']; settings: Settings; symbol?: string }) {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0]?.value ?? 0);
  const converted = symbol ? toDisplayCurrency(value, settings.currency, settings) : toDisplayCurrency(value, currency, settings);
  const absolute = Math.abs(converted);
  const precision = symbol ? absolute < .0001 ? 10 : absolute < .01 ? 6 : absolute < 1 ? 4 : 2 : 2;
  const display = new Intl.NumberFormat(undefined, { style: 'currency', currency: settings.currency, minimumFractionDigits: 2, maximumFractionDigits: precision }).format(Number.isFinite(converted) ? converted : 0);
  return <div className="chart-tooltip"><span className="chart-tooltip-dot"/><span><small>{symbol ? `${symbol} price` : 'Portfolio value'}</small><b>{display}{symbol ? <i> {symbol}</i> : null}</b></span></div>;
}

export default function PriceChart({ values, currency, settings, symbol, period, onPeriodChange, height = 132, periods }: Props) {
  const id = useId().replace(/:/g, '');
  const reducedMotion = useReducedMotion();
  const [interacting, setInteracting] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const previousPeriod = useRef(period);
  useEffect(() => {
    const changed = previousPeriod.current !== period;
    previousPeriod.current = period;
    if (!changed || reducedMotion || typeof chartRef.current?.animate !== 'function') return;
    const fade = chartRef.current.animate([{ opacity: .35 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' });
    return () => fade.cancel();
  }, [period, reducedMotion]);
  const { points, min, max } = useMemo(() => {
    const finiteValues = values.filter(Number.isFinite);
    const safeValues = finiteValues.length ? finiteValues : [0];
    return { points: safeValues.map((value, index) => ({ index, value })), min: Math.min(...safeValues), max: Math.max(...safeValues) };
  }, [values]);
  const range = Math.max(max - min, Math.max(Math.abs(max), 1) * .0001);
  const choices = periods ?? ['1H', '24H', '1W', '1M', '1Y', 'ALL'];
  return <div className="chart-block">
    <div ref={chartRef} className="line-chart" style={{ height, touchAction: 'pan-y' }} role="img" aria-label={`${symbol ? `${symbol} price` : 'Portfolio value'} chart`} onPointerEnter={event => { if (event.pointerType === 'mouse') setInteracting(true); }} onPointerDown={() => setInteracting(true)} onPointerLeave={() => setInteracting(false)} onPointerUp={event => { if (event.pointerType !== 'mouse') setInteracting(false); }} onPointerCancel={() => setInteracting(false)}>
      <ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{ top: 10, right: 2, bottom: 4, left: 2 }}>
        <defs><linearGradient id={`chart-fill-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-color,var(--accent))" stopOpacity={.22}/><stop offset="100%" stopColor="var(--chart-color,var(--accent))" stopOpacity={0}/></linearGradient></defs>
        <YAxis hide domain={[min - range * .14, max + range * .14]}/>
        <Tooltip active={interacting ? undefined : false} content={<ChartTooltip currency={currency} settings={settings} symbol={symbol}/>} cursor={{ stroke: 'rgba(255,255,255,.2)', strokeDasharray: '3 5' }} isAnimationActive={!reducedMotion} animationDuration={140}/>
        <Area type="monotone" dataKey="value" stroke="none" fill={`url(#chart-fill-${id})`} isAnimationActive={false}/>
        <Line type="monotone" dataKey="value" stroke="var(--chart-color,var(--accent))" strokeWidth={2.2} dot={symbol ? point => point.index === points.length - 1 ? <g key="latest-price"><circle cx={point.cx} cy={point.cy} r={12} fill="var(--chart-color,var(--accent))" fillOpacity={.12}/><circle cx={point.cx} cy={point.cy} r={3.5} fill="var(--chart-color,var(--accent))"/></g> : <g key={point.index}/> : false} activeDot={{ r: 4, fill: 'var(--chart-color,var(--accent))', stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false}/>
      </LineChart></ResponsiveContainer>
    </div>
    {onPeriodChange && period && <div className="chart-periods" role="tablist" aria-label="Chart time period">{choices.map(choice => <button key={choice} role="tab" aria-selected={period === choice} className={period === choice ? 'is-active' : ''} onClick={() => onPeriodChange(choice)}>{choice}</button>)}</div>}
  </div>;
}
