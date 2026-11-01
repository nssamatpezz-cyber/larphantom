import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { ChartPeriod, Settings, Token, WalletAccount } from './types';
import { toDisplayCurrency } from './logic';
import { settleSheetFrames, useReducedMotion } from './motion';

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    menu: 'M4 7h16M4 12h16M4 17h16', close: 'm6 6 12 12M18 6 6 18', back: 'm15 18-6-6 6-6', chevron: 'm9 18 6-6-6-6',
    send: 'm5 12 14-7-4 14-3-6-7-1ZM12 13l7-8', receive: 'm19 12-14 7 4-14 3 6 7 1ZM12 11 5 19', swap: 'm7 7h13l-3-3m3 3-3 3M17 17H4l3 3m-3-3 3-3',
    plus: 'M12 5v14M5 12h14', search: 'm20 20-4.5-4.5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
    settings: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.7 2.9-.2-.1a1.7 1.7 0 0 0-1.8.2l-.2.1h-3.4l-.1-.2a1.7 1.7 0 0 0-1.6-1l-.2.1-2.9-1.7.1-.2a1.7 1.7 0 0 0-.2-1.8l-.1-.2v-3.4l.2-.1a1.7 1.7 0 0 0 1-1.6l-.1-.2 1.7-2.9.2.1a1.7 1.7 0 0 0 1.8-.2l.2-.1h3.4l.1.2a1.7 1.7 0 0 0 1.6 1l.2-.1 2.9 1.7-.1.2a1.7 1.7 0 0 0 .2 1.8l.1.2v3.4l-.2.1a1.7 1.7 0 0 0-1 1.6Z',
    copy: 'M8 8h11v12H8zM5 16H4V4h12v1', eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
    eyeOff: 'm3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a15.2 15.2 0 0 1-4 4.6M6.2 6.3C3.4 8.1 2 12 2 12s3.5 7 10 7a10 10 0 0 0 3.2-.5',
    wallet: 'M4 6.5h15a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13M16 13h5m-5 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
    history: 'M3 12a9 9 0 1 0 2.7-6.4L3 8m0-5v5h5m4-1v5l3 2', star: 'm12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z',
    cash: 'M3 7h18v12H3zM7 7V5h14v12M12 10v6m-2-1 2 1 2-1', user: 'M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    clock: 'M12 8v4l2.5 1.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', info: 'M12 11v5m0-9h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
    check: 'm5 12 4 4L19 6', trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3', grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    external: 'M14 4h6v6m0-6-9 9M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6',
    heart: 'M20.8 8.7c0 5.2-8.8 10.3-8.8 10.3S3.2 13.9 3.2 8.7A4.7 4.7 0 0 1 12 6.5a4.7 4.7 0 0 1 8.8 2.2Z',
    chat: 'M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6.5a7.5 7.5 0 1 1 17-3Z',
    share: 'M12 16V3m0 0L7 8m5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5',
    qr: 'M4 4h5v5H4zM15 4h5v5h-5zM4 15h5v5H4zM15 15h2v2h-2zM20 14v3m-6 3h3m3 0h.01M6.5 6.5h.01m11 0h.01m-11 11h.01',
    banknote: 'M3 6h18v12H3zM3 10a4 4 0 0 0 4-4m10 0a4 4 0 0 0 4 4M3 14a4 4 0 0 1 4 4m10 0a4 4 0 0 1 4-4M12 9v6m-2-4c0-2 4-2 4 0s-4 0-4 2 4 2 4 0',
    cashCoin: 'M12 3v18m3-13c-1-2-6-2-6 1 0 4 6 1 6 5 0 3-5 3-6 1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
    shuffle: 'M4 6h2c5 0 7 12 12 12h2m-3-3 3 3-3 3M4 18h2c2 0 3-2 4-4m4-4c1-2 2-4 4-4h2m-3-3 3 3-3 3',
    ball: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 8l4 3-1.5 4.5h-5L8 11l4-3Zm0 0V3m4 8 5-1m-6.5 5.5 3 4m-8-4-3 4M8 11l-5-1',
    alert: 'M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0ZM12 9v4m0 4h.01',
    globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z',
    book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22V5.5Zm0 0V20m4-13h8m-8 4h8',
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.info}/></svg>;
}

export function Avatar({ account, size = 'md' }: { account: WalletAccount; size?: 'sm' | 'md' | 'lg' }) {
  const mark = account.avatar === '◈' || account.avatar === '👻' ? 'A1' : account.avatar || account.name.slice(0, 1).toUpperCase();
  return <span className={`avatar avatar-${size} ${mark === 'A1' ? 'avatar-monogram' : ''}`}>{account.avatarImage ? <img src={account.avatarImage} alt=""/> : mark}</span>;
}

export function TokenIcon({ token, size = 'md' }: { token: Token; size?: 'sm' | 'md' | 'lg' }) {
  const hue = [...token.symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 7 % 360;
  const [logoUnavailable, setLogoUnavailable] = useState(false);
  const logo = token.iconOverride?.trim() ? '' : token.icon;
  useEffect(() => setLogoUnavailable(false), [logo]);
  const hasLogo = logo.startsWith('/') && !logoUnavailable;
  const mark = token.iconOverride?.trim() || (!logo.startsWith('/') ? logo : token.symbol);
  return <span className={`asset-icon asset-${size} ${hasLogo ? 'has-token-logo' : 'custom-token-mark'}`} style={{ '--asset-hue': `${hue}deg` } as CSSProperties} role="img" aria-label={`${token.name} token icon`}>
    {hasLogo ? <img src={logo} alt="" loading="lazy" decoding="async" onError={() => setLogoUnavailable(true)}/> : <span aria-hidden="true">{mark || token.symbol}</span>}
  </span>;
}

export function Modal({ children, onClose, title, fullScreen = false, className = '' }: { children: ReactNode; onClose: () => void; title?: string; fullScreen?: boolean; className?: string }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingRef = useRef(false);
  const previousFocusRef = useRef<HTMLElement | null>(typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const dragRef = useRef<{ pointerId: number; startY: number; lastY: number; lastTime: number; distance: number; velocity: number } | null>(null);
  const settleRef = useRef<Animation | null>(null);
  const frameRef = useRef<number | null>(null);
  const [closing, setClosing] = useState(false);
  const reducedMotion = useReducedMotion();
  onCloseRef.current = onClose;
  const requestClose = () => {
    if (closingRef.current) return;
    settleRef.current?.cancel();
    if (dialogRef.current) { dialogRef.current.style.animation = ''; dialogRef.current.style.transform = ''; }
    closingRef.current = true;
    setClosing(true);
    const delay = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
    closeTimer.current = window.setTimeout(() => onCloseRef.current(), delay);
  };
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (closingRef.current || event.button !== 0 || (event.target as HTMLElement).closest('button,input,select,textarea,a')) return;
    settleRef.current?.cancel();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startY: event.clientY, lastY: event.clientY, lastTime: event.timeStamp, distance: 0, velocity: 0 };
    if (dialogRef.current) dialogRef.current.style.animation = 'none';
  };
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const elapsed = Math.max(1, event.timeStamp - drag.lastTime);
    drag.velocity = (event.clientY - drag.lastY) / elapsed;
    drag.distance = Math.max(0, event.clientY - drag.startY);
    drag.lastY = event.clientY; drag.lastTime = event.timeStamp;
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      if (dialogRef.current && dragRef.current) dialogRef.current.style.transform = `translate3d(0,${dragRef.current.distance}px,0)`;
    });
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (frameRef.current !== null) { cancelAnimationFrame(frameRef.current); frameRef.current = null; }
    const sheet = dialogRef.current;
    if (!sheet) return;
    const releaseVelocity = event.timeStamp - drag.lastTime > 90 ? 0 : drag.velocity;
    const dismiss = event.type !== 'pointercancel' && (drag.distance > 88 || (drag.distance > 24 && releaseVelocity > .65));
    if (dismiss) {
      closingRef.current = true;
      setClosing(true);
      const delay = reducedMotion ? 0 : 220;
      if (!reducedMotion && typeof sheet.animate === 'function') settleRef.current = sheet.animate([{ transform: `translate3d(0,${drag.distance}px,0)`, opacity: 1 }, { transform: `translate3d(0,${Math.max(sheet.clientHeight, drag.distance + 160)}px,0)`, opacity: 0 }], { duration: delay, easing: 'cubic-bezier(.3,0,.7,.25)', fill: 'forwards' });
      closeTimer.current = window.setTimeout(() => onCloseRef.current(), delay);
      return;
    }
    sheet.style.transform = '';
    if (reducedMotion || drag.distance < 1 || typeof sheet.animate !== 'function') return;
    const settle = sheet.animate(settleSheetFrames(drag.distance, releaseVelocity), { duration: 420, easing: 'linear' });
    settleRef.current = settle;
    settle.onfinish = () => { settleRef.current = null; };
  };
  useEffect(() => {
    const active = document.activeElement;
    // React's autoFocus focuses during commit; do not steal focus from that input.
    if (!dialogRef.current?.contains(active)) (dialogRef.current?.querySelector<HTMLElement>('[autofocus]') ?? closeRef.current)?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== dialogRef.current) return;
      if (event.key === 'Escape') { event.preventDefault(); requestClose(); return; }
      if (event.key !== 'Tab') return;
      const focusables = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? [])].filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0);
      if (!focusables?.length) { event.preventDefault(); closeRef.current?.focus(); return; }
      const first = focusables[0]; const last = focusables[focusables.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      settleRef.current?.cancel();
      const previous = previousFocusRef.current;
      if (previous?.isConnected && !dialogRef.current?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let lastHeight = viewport.height;
    const updateViewport = () => {
      backdropRef.current?.style.setProperty('--visual-viewport-height', `${viewport.height}px`);
      backdropRef.current?.style.setProperty('--visual-viewport-top', `${viewport.offsetTop}px`);
      if (lastHeight - viewport.height > 100 && document.activeElement instanceof HTMLElement && dialogRef.current?.contains(document.activeElement)) document.activeElement.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      lastHeight = viewport.height;
    };
    updateViewport();
    viewport.addEventListener('resize', updateViewport);
    viewport.addEventListener('scroll', updateViewport);
    return () => { viewport.removeEventListener('resize', updateViewport); viewport.removeEventListener('scroll', updateViewport); };
  }, []);
  const dragHandlers = { onPointerDown: startDrag, onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: endDrag };
  return <div ref={backdropRef} className={`modal-backdrop ${closing ? 'is-closing' : ''}`} role="presentation" onClick={event => { if (event.target === event.currentTarget) { event.preventDefault(); event.stopPropagation(); requestClose(); } }}>
    <section ref={dialogRef} className={`sheet ${fullScreen ? 'sheet-fullscreen' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title ?? 'Orbit Vault dialog'}>
      <div className="sheet-handle" aria-hidden="true" {...dragHandlers}/>
      <div className="sheet-top" style={{ touchAction: 'none' }} {...dragHandlers}><span>{title ?? ''}</span><button ref={closeRef} className="icon-button close-button" onClick={requestClose} aria-label="Close"><Icon name="close"/></button></div>
      <div className="sheet-body">{children}</div>
    </section>
  </div>;
}

const moneyFormatters = new Map<string, Intl.NumberFormat>();
const quantityFormatters = new Map<number, Intl.NumberFormat>();
const moneyFormat = (value: number, currency: Settings['currency'], precision = 2) => {
  const key = `${currency}:${precision}`;
  let formatter = moneyFormatters.get(key);
  if (!formatter) { formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: precision }); moneyFormatters.set(key, formatter); }
  return formatter.format(Number.isFinite(value) ? value : 0);
};
export const money = (usd: number, settings: Settings) => moneyFormat(toDisplayCurrency(usd, settings.currency, settings), settings.currency);
export const moneyValue = (value: number, currency: Settings['currency']) => moneyFormat(value, currency);
export const priceMoney = (usd: number, settings: Settings) => {
  const value = toDisplayCurrency(usd, settings.currency, settings);
  const absolute = Math.abs(value);
  return moneyFormat(value, settings.currency, absolute < .0001 ? 10 : absolute < .01 ? 6 : absolute < 1 ? 4 : 2);
};
export const quantity = (value: number, decimals = 4) => {
  let formatter = quantityFormatters.get(decimals);
  if (!formatter) { formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: 0 }); quantityFormatters.set(decimals, formatter); }
  return formatter.format(Number.isFinite(value) ? value : 0);
};

type PriceChartProps = { values: number[]; currency: Settings['currency']; settings: Settings; symbol?: string; period?: ChartPeriod; onPeriodChange?: (period: ChartPeriod) => void; height?: number; periods?: ChartPeriod[] };
const PriceChartView = lazy(() => import('./PriceChart'));
export function PriceChart(props: PriceChartProps) {
  const height = props.height ?? 132;
  const periods = props.periods ?? ['1H', '24H', '1W', '1M', '1Y', 'ALL'] as ChartPeriod[];
  const loading = <div className="chart-block" aria-label="Loading chart" aria-busy="true"><div className="line-chart" style={{ height }}/>{props.onPeriodChange && props.period && <div className="chart-periods" role="tablist" aria-label="Chart time period">{periods.map(period => <button key={period} role="tab" aria-selected={props.period === period} className={props.period === period ? 'is-active' : ''} onClick={() => props.onPeriodChange?.(period)}>{period}</button>)}</div>}</div>;
  return <Suspense fallback={loading}><PriceChartView {...props}/></Suspense>;
}

export function AssetRow({ token, balance, settings, hidden, onClick, onMore, showChain = true }: { token: Token; balance: number; settings: Settings; hidden?: boolean; onClick: () => void; onMore?: () => void; showChain?: boolean }) {
  const hideValues = hidden ?? !settings.showPrices;
  return <div className="asset-row-wrap"><button className="asset-row" onClick={onClick}>
    <TokenIcon token={token}/><span className="asset-identity"><b>{token.name}</b><small>{quantity(balance, settings.decimals)} {token.symbol}{showChain ? ` · ${token.chain}` : ''}</small></span>
    <span className="asset-values"><b>{hideValues ? '••••••' : money(token.price * balance, settings)}</b><small className={token.change24h >= 0 ? 'positive' : 'negative'}>{hideValues ? ' ' : `${token.change24h >= 0 ? '+' : ''}${token.change24h.toFixed(2)}%`}</small></span>
  </button>{onMore && <button className="asset-more" onClick={event => { event.stopPropagation(); onMore(); }} aria-label={`Edit ${token.name}`}><Icon name="chevron" size={17}/></button>}</div>;
}

export function TransactionRow({ transaction, token, settings, onClick }: { transaction: import('./types').Transaction; token?: Token; settings: Settings; onClick: () => void }) {
  const labels: Record<import('./types').TxType, string> = { sent: 'Sent', received: 'Received', bought: 'Bought', swapped: 'Swapped', 'cash-added': 'Cash added', 'cash-removed': 'Cash removed', prediction: 'Practice pick' };
  const icon = transaction.type === 'sent' ? '↑' : transaction.type === 'received' || transaction.type === 'bought' ? '↓' : transaction.type === 'swapped' ? '⇄' : transaction.type === 'cash-added' ? '+' : transaction.type === 'cash-removed' ? '−' : '↗';
  const outgoing = transaction.type === 'sent' || transaction.type === 'cash-removed' || transaction.type === 'swapped';
  const counterparty = transaction.counterparty.replace(/\b(simulated|simulation)\b/gi, '').replace(/\s+/g, ' ').replace(/\s+([·,.])/g, '$1').trim() || 'Local record';
  const amountLabel = transaction.type === 'cash-added' || transaction.type === 'cash-removed' || transaction.type === 'prediction'
    ? money(transaction.valueUsd, settings)
    : `${outgoing ? '−' : '+'}${quantity(transaction.amount, settings.decimals)} ${transaction.tokenSymbol}`;
  return <button className="transaction-row" onClick={onClick}><span className={`transaction-icon tx-${transaction.type}`}>{icon}</span>
    {token ? <TokenIcon token={token} size="sm"/> : null}
     <span className="transaction-copy"><b>{labels[transaction.type]}{token ? ` ${token.symbol}` : transaction.tokenSymbol !== 'CASH' ? ` ${transaction.tokenSymbol}` : ''}</b><small>{counterparty} · {new Date(transaction.timestamp).toLocaleDateString()}</small></span>
    <span className={`transaction-amount ${outgoing ? 'negative' : 'positive'}`}>{amountLabel}</span>
  </button>;
}

export function Toast({ message }: { message: string }) { return message ? <div className="toast" role="status" aria-live="polite"><Icon name="check" size={17}/>{message}</div> : null; }
