import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useStore } from './store';
import { DEFAULT_SETTINGS, activeAccount, balanceFor, buildMarketHistory, buyUpdate, calculateSwap, cashUpdate, createAccount, createId, findToken, portfolioValueUsd, receiveUpdate, sendUpdate, swapUpdate, toDisplayCurrency, validateSend } from './logic';
import { AssetRow, Avatar, Icon, Modal, PriceChart, quantity, money, moneyValue, priceMoney, TokenIcon, Toast, TransactionRow } from './ui';
import type { ChartPeriod, Chain, Currency, Prediction, Settings, Token, Transaction, WalletAccount, WalletData } from './types';

type Screen = 'home' | 'trade' | 'predict' | 'explore' | 'history' | 'watchlist' | 'collectibles';
type MainScreen = Extract<Screen, 'home' | 'trade' | 'predict' | 'explore'>;
type ModalName = 'actions' | 'cash' | 'buy' | 'send' | 'receive' | 'swap' | 'token' | 'transaction' | 'settings' | 'accounts' | 'profile' | 'add-token' | 'edit-token' | 'confirm-swap' | 'prediction' | 'about' | 'support' | 'refer' | 'reset';
type Market = { id: string; title: string; tokenId: string; horizon: string; priceTarget: string; positiveChance: number; eventType?: 'match' | 'race'; outcomes?: [string, string]; thirdOutcome?: string; outcomeShares?: [number, number, number] };

const MARKETS: Market[] = [
  { id: 'mls-practice', title: 'Charlotte vs Chicago', tokenId: 'bitcoin', horizon: 'in 4h', priceTarget: 'the Charlotte side is ahead in this fictional match', positiveChance: 44, eventType: 'match', outcomes: ['Charlotte', 'Chicago'], thirdOutcome: 'Draw', outcomeShares: [44, 34, 22] },
  { id: 'grand-prix-practice', title: 'Azerbaijan Grand Prix', tokenId: 'ethereum', horizon: 'in 1d', priceTarget: 'the highlighted driver finishes in the top three', positiveChance: 51, eventType: 'race', outcomes: ['Top 3', 'Outside top 3'] },
  { id: 'hockey-practice', title: 'Pittsburgh vs Dallas', tokenId: 'solana', horizon: 'Live', priceTarget: 'Pittsburgh leads in this fictional match', positiveChance: 48, eventType: 'match', outcomes: ['Pittsburgh', 'Dallas'] },
  { id: 'btc-hour', title: 'Bitcoin · next hour', tokenId: 'bitcoin', horizon: '1H', priceTarget: 'above its current price', positiveChance: 53 },
  { id: 'eth-day', title: 'Ethereum · today', tokenId: 'ethereum', horizon: '24H', priceTarget: 'higher by the end of the day', positiveChance: 51 },
  { id: 'sol-week', title: 'Solana · this week', tokenId: 'solana', horizon: '1W', priceTarget: 'higher by week close', positiveChance: 56 },
];

const isMainScreen = (screen: Screen): screen is MainScreen => screen === 'home' || screen === 'trade' || screen === 'predict' || screen === 'explore';
const randomUnit = (seed: number) => { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function periodSeries(current: number, period: ChartPeriod, salt = 1, history?: number[]): number[] {
  if ((period === 'LIVE' || period === '1H') && history?.length) return history;
  const count = period === '24H' || period === '1D' ? 48 : period === '1W' ? 42 : period === '1M' ? 50 : period === '1Y' ? 52 : 60;
  const range = period === '24H' || period === '1D' ? .025 : period === '1W' ? .07 : period === '1M' ? .14 : period === '1Y' ? .4 : .65;
  return Array.from({ length: count }, (_, index) => {
    const t = index / Math.max(1, count - 1);
    const wave = (randomUnit(index + salt) - .5) * .35 + Math.sin(index * .21 + salt) * .25 + Math.sin(index * .073 + salt * .61) * .18;
    return current * (1 - range * .2 + t * range * .2 + wave * range * .38);
  });
}
const displayAmountToUsd = (amount: number, settings: Settings) => amount / (settings.currency === 'EUR' ? settings.usdToEur : settings.currency === 'GBP' ? settings.usdToGbp : 1);
const priceInputValue = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0';
  const precision = value < .0001 ? 10 : value < .01 ? 8 : value < 1 ? 6 : 2;
  return String(Number(value.toFixed(precision)));
};
const textForTx = (transaction: Transaction) => {
  if (transaction.type === 'sent') return `Sent ${transaction.tokenSymbol}`;
  if (transaction.type === 'received') return `Received ${transaction.tokenSymbol}`;
  if (transaction.type === 'bought') return `Bought ${transaction.tokenSymbol}`;
  if (transaction.type === 'swapped') return `Swapped ${transaction.tokenSymbol}`;
  if (transaction.type === 'cash-added') return 'Cash added';
  if (transaction.type === 'cash-removed') return 'Cash removed';
  return 'Practice pick';
};

function updateAccount(data: WalletData, accountId: string, patch: Partial<WalletAccount>): WalletData {
  return { ...data, accounts: data.accounts.map(account => account.id === accountId ? { ...account, ...patch } : account) };
}

export default function App() {
  const data = useStore(state => state.data);
  const acknowledged = useStore(state => state.acknowledged);
  const marketStatus = useStore(state => state.marketStatus);
  const storeError = useStore(state => state.error);
  const tick = useStore(state => state.tick);
  const refreshPrices = useStore(state => state.refreshPrices);
  const acknowledge = useStore(state => state.acknowledge);
  const setData = useStore(state => state.setData);
  const [screen, setScreen] = useState<Screen>('home');
  const [previousMain, setPreviousMain] = useState<MainScreen>('home');
  const [modal, setModal] = useState<ModalName | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState('');
  const [selectedTxId, setSelectedTxId] = useState('');
  const [selectedMarketId, setSelectedMarketId] = useState(MARKETS[0].id);
  const [swapDraft, setSwapDraft] = useState({ fromId: 'solana', toId: 'ethereum', amount: 0 });
  const [preferredSwapFrom, setPreferredSwapFrom] = useState('');
  const [toast, setToast] = useState('');
  const [themePrompt, setThemePrompt] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const account = activeAccount(data);
  const selectedToken = findToken(data, selectedTokenId);
  const selectedTx = data.transactions.find(tx => tx.id === selectedTxId);

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  };
  const goTo = (next: Screen) => {
    if (isMainScreen(screen)) setPreviousMain(screen);
    setScreen(next);
    setModal(null);
  };
  const openToken = (token: Token) => { setSelectedTokenId(token.id); setModal('token'); };
  const openTransaction = (tx: Transaction) => { setSelectedTxId(tx.id); setModal('transaction'); };
  const closeModal = useCallback(() => setModal(null), []);
  useEffect(() => { if (modal) setToast(''); }, [modal]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshPrices(controller.signal);
    const interval = window.setInterval(() => void refreshPrices(controller.signal), 60_000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [refreshPrices]);
  useEffect(() => {
    if (!acknowledged || !marketStatus.ready) return;
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [acknowledged, marketStatus.ready, tick]);
  useEffect(() => {
    const capture = (event: Event) => { event.preventDefault(); setInstallPrompt(event as BeforeInstallPromptEvent); };
    window.addEventListener('beforeinstallprompt', capture);
    return () => window.removeEventListener('beforeinstallprompt', capture);
  }, []);
  useEffect(() => {
    if (storeError) notify(storeError);
  }, [storeError]);

  const moveMainScreen = (direction: -1 | 1) => {
    const tabs: MainScreen[] = ['home', 'trade', 'predict', 'explore'];
    const index = Math.max(0, tabs.indexOf(isMainScreen(screen) ? screen : previousMain));
    setScreen(tabs[Math.max(0, Math.min(tabs.length - 1, index + direction))]);
  };
  const touchProps = {
    onTouchStart: (event: React.TouchEvent) => { touchOrigin.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; },
    onTouchEnd: (event: React.TouchEvent) => {
      const origin = touchOrigin.current; touchOrigin.current = null;
      if (!origin || modal || !isMainScreen(screen)) return;
      const dx = event.changedTouches[0].clientX - origin.x;
      const dy = event.changedTouches[0].clientY - origin.y;
      if (Math.abs(dx) > 88 && Math.abs(dy) < 54 && !(event.target as Element | null)?.closest('button,input,select,.chart-block,.search-input,.top-nav,.perps-preview,.hot-market-strip,.predict-upcoming-strip,.home-prediction-preview-strip,.filter-pills')) moveMainScreen(dx < 0 ? 1 : -1);
    },
  };

  if (!acknowledged) return <main className="first-launch" style={{ '--accent': data.settings.accent } as React.CSSProperties}>
    <div className="brand-orbit">◈</div><span className="overline">ORBIT VAULT · SIMULATOR</span><h1>Your wallet, imagined.</h1>
    <p>A private, local interface simulator for design reviews, content, and learning. It has no funds and cannot make blockchain transactions.</p>
    <div className="disclosure-card"><Icon name="info" size={19}/><span><b>Before you continue</b><small>Market snapshots may come from CoinGecko or CoinPaprika, then prices drift locally for simulation. All balances and activity are fictional. Do not present them as proof of funds.</small></span></div>
    <button className="button-primary" onClick={acknowledge}>I understand · open Orbit Vault</button>
  </main>;

  const header = <AppHeader screen={screen} account={account} setDrawer={() => setThemePrompt(true)} onSettings={() => setModal('settings')} onBack={() => setScreen(previousMain)} onNavigate={setScreen}/>;
  return <div className={`app-shell theme-${data.settings.theme}`} style={{ '--accent': data.settings.accent } as React.CSSProperties} {...touchProps}>
    {header}
    <div className="screen-scroll" key={screen}>
      {screen === 'home' && <WalletHome data={data} onToken={openToken} onCash={() => setModal('cash')} onAction={action => setModal(action)} onScreen={goTo} onAccount={() => setThemePrompt(true)} onTransaction={openTransaction} onAddToken={() => setModal('add-token')} onEditToken={token => { setSelectedTokenId(token.id); setModal('edit-token'); }} onNotify={notify}/>} 
      {screen === 'trade' && <TradeScreen data={data} onToken={openToken} onSwap={() => setModal('swap')} onBrowse={() => goTo('watchlist')}/>}
      {screen === 'predict' && <PredictScreen data={data} onChoose={market => { setSelectedMarketId(market.id); setModal('prediction'); }} onHistory={() => goTo('history')}/>}
      {screen === 'explore' && <ExploreScreen data={data} onToken={openToken} onTokens={() => goTo('watchlist')} onCollectibles={() => goTo('collectibles')} onLearn={() => setModal('about')} onNotify={notify}/>} 
      {screen === 'history' && <HistoryScreen data={data} onTransaction={openTransaction}/>}
      {screen === 'watchlist' && <WatchlistScreen data={data} onToken={openToken} onAddToken={() => setModal('add-token')} onBack={() => setScreen('home')}/>}
      {screen === 'collectibles' && <CollectiblesScreen onBack={() => setScreen('home')}/>}
    </div>

    {isMainScreen(screen) && <div className="home-dock"><button className="search-dock" onClick={() => goTo('watchlist')}><Icon name="search" size={23}/><span>Search assets</span><small>{data.assets.length}</small></button><button className="dock-plus" onClick={() => setModal('actions')} aria-label="Open quick actions"><Icon name="plus" size={30}/></button></div>}

    {themePrompt && <AccountDrawer data={data} onClose={() => setThemePrompt(false)} onSwitch={id => { useStore.getState().update(d => ({ ...d, activeAccountId: id })); setThemePrompt(false); setScreen('home'); }} onAccounts={() => { setThemePrompt(false); setModal('accounts'); }} onProfile={() => { setThemePrompt(false); setModal('profile'); }} onNavigate={next => { setThemePrompt(false); goTo(next); }} onSettings={() => { setThemePrompt(false); setModal('settings'); }} onSupport={() => { setThemePrompt(false); setModal('support'); }} onRefer={() => { setThemePrompt(false); setModal('refer'); }} onNotify={notify}/>}

    {modal === 'actions' && <QuickActions onClose={closeModal} onAction={action => setModal(action)}/>} 
    {modal === 'cash' && <CashSheet data={data} onClose={closeModal} onNotify={notify}/>}
    {modal === 'buy' && <BuyCryptoSheet data={data} initialTokenId={selectedTokenId} onClose={closeModal} onNotify={notify} onDone={tx => { setSelectedTxId(tx.id); setModal('transaction'); }}/ >}
    {modal === 'send' && <SendSheet data={data} initialTokenId={selectedTokenId} onClose={closeModal} onNotify={notify} onDone={tx => { setSelectedTxId(tx.id); setModal('transaction'); }}/>} 
    {modal === 'receive' && <ReceiveSheet data={data} initialTokenId={selectedTokenId} onClose={closeModal} onNotify={notify} onDone={tx => { setSelectedTxId(tx.id); setModal('transaction'); }}/>} 
    {modal === 'swap' && <SwapSheet data={data} initialTokenId={preferredSwapFrom} onReview={draft => { setSwapDraft(draft); setModal('confirm-swap'); }} onAddToken={() => setModal('add-token')} onToken={openToken} onClose={closeModal}/>}
    {modal === 'token' && selectedToken && <TokenDetail data={data} token={selectedToken} onClose={closeModal} onAction={action => { closeModal(); if (action === 'swap') { setPreferredSwapFrom(selectedToken.id); setModal('swap'); } else setModal(action); }} onTransaction={openTransaction} onEdit={() => setModal('edit-token')} onNotify={notify}/>}
    {modal === 'transaction' && selectedTx && <TransactionDetail data={data} transaction={selectedTx} onClose={closeModal}/>}
    {modal === 'settings' && <SettingsSheet data={data} onClose={closeModal} onAccounts={() => setModal('accounts')} onProfile={() => setModal('profile')} onEditToken={token => { setSelectedTokenId(token.id); setModal('edit-token'); }} onAddToken={() => setModal('add-token')} onAbout={() => setModal('about')} onReset={() => setModal('reset')} installPrompt={installPrompt} onNotify={notify} onImport={setData}/>}
    {modal === 'accounts' && <AccountsSheet data={data} onClose={closeModal} onNotify={notify} onProfile={() => setModal('profile')}/>}
    {modal === 'profile' && <ProfileSheet data={data} onClose={closeModal} onNotify={notify}/>}
    {modal === 'add-token' && <AddTokenSheet data={data} onClose={closeModal} onNotify={notify} onEdit={token => { setSelectedTokenId(token.id); setModal('edit-token'); }}/>} 
    {modal === 'edit-token' && selectedToken && <EditTokenSheet data={data} token={selectedToken} onClose={closeModal} onNotify={notify}/>}
    {modal === 'confirm-swap' && <SwapConfirmation data={data} draft={swapDraft} onClose={closeModal} onNotify={notify} onDone={tx => { setSelectedTxId(tx.id); setModal('transaction'); }}/>} 
    {modal === 'prediction' && <PredictionSheet data={data} market={MARKETS.find(item => item.id === selectedMarketId) ?? MARKETS[0]} onClose={closeModal} onNotify={notify}/>}
    {modal === 'about' && <AboutSheet onClose={closeModal}/>}
    {modal === 'support' && <SupportSheet onClose={closeModal}/>}
    {modal === 'refer' && <ReferSheet onClose={closeModal} onNotify={notify}/>}
    {modal === 'reset' && <ResetSheet onClose={closeModal} onConfirm={() => { useStore.getState().reset(); closeModal(); notify('Wallet settings and simulator data reset'); }}/>}
    <Toast message={toast}/>
  </div>;
}

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

function AppHeader({ screen, account, setDrawer, onSettings, onBack, onNavigate }: { screen: Screen; account: WalletAccount; setDrawer: () => void; onSettings: () => void; onBack: () => void; onNavigate: (screen: Screen) => void }) {
  const titles: Record<Screen, string> = { home: 'Home', trade: 'Trade', predict: 'Predict', explore: 'Explore', history: 'History', watchlist: 'Tokens', collectibles: 'Collectibles' };
  const navRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const update = () => {
      const selected = nav.querySelector<HTMLButtonElement>('button.selected');
      if (!selected) return;
      nav.style.setProperty('--pill-left', `${selected.offsetLeft}px`);
      nav.style.setProperty('--pill-width', `${selected.offsetWidth}px`);
      const right = selected.offsetLeft + selected.offsetWidth;
      if (right > nav.scrollLeft + nav.clientWidth || selected.offsetLeft < nav.scrollLeft) {
        nav.scrollTo({ left: Math.max(0, right - nav.clientWidth + 4), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
    };
    update();
    const resize = new ResizeObserver(update); resize.observe(nav);
    return () => resize.disconnect();
  }, [screen]);
  return <header className="app-header">
    <button className="header-avatar" onClick={setDrawer} aria-label="Open account drawer"><Avatar account={account}/></button>
    {isMainScreen(screen) ? <nav ref={navRef} className="top-nav" aria-label="Main navigation"><span className="nav-active-pill" aria-hidden="true"/>{(['home', 'trade', 'predict', 'explore'] as const).map(item => <button key={item} aria-current={screen === item ? 'page' : undefined} className={screen === item ? 'selected' : ''} onClick={() => onNavigate(item)}>{titles[item]}</button>)}</nav> : <button className="subpage-title" onClick={onBack}><Icon name="back" size={19}/><span>{titles[screen]}</span></button>}
    {!isMainScreen(screen) && <button className="header-utility" onClick={screen === 'watchlist' ? onBack : onSettings} aria-label={screen === 'watchlist' ? 'Back to wallet' : 'Open settings'}>{screen === 'watchlist' ? <Icon name="close"/> : <Icon name="settings"/>}</button>}
  </header>;
}

function WalletHome({ data, onToken, onCash, onAction, onScreen, onAccount, onTransaction, onAddToken, onEditToken, onNotify }: { data: WalletData; onToken: (token: Token) => void; onCash: () => void; onAction: (action: ModalName) => void; onScreen: (screen: Screen) => void; onAccount: () => void; onTransaction: (tx: Transaction) => void; onAddToken: () => void; onEditToken: (token: Token) => void; onNotify: (message: string) => void }) {
  const [hidden, setHidden] = useState(false);
  const [showPortfolioChart, setShowPortfolioChart] = useState(false);
  const [period, setPeriod] = useState<ChartPeriod>(data.settings.chartPeriod);
  useEffect(() => { setPeriod(data.settings.chartPeriod); }, [data.settings.chartPeriod]);
  const setChartPeriod = (next: ChartPeriod) => { setPeriod(next); useStore.getState().update(wallet => ({ ...wallet, settings: { ...wallet.settings, chartPeriod: next } })); };
  const account = activeAccount(data);
  const total = portfolioValueUsd(data, account);
  const assets = account.assetOrder.map(id => findToken(data, id)).filter((asset): asset is Token => Boolean(asset) && !account.hiddenAssets.includes(asset!.id));
  const sorted = [...assets].sort((a, b) => data.settings.sortBy === 'name' ? a.name.localeCompare(b.name) : data.settings.sortBy === 'change' ? b.change24h - a.change24h : b.price * balanceFor(account, b.id) - a.price * balanceFor(account, a.id));
  const recent = data.transactions.filter(tx => tx.accountId === account.id).slice(0, 3);
  const change = assets.reduce((sum, asset) => sum + asset.price * balanceFor(account, asset.id) * asset.change24h / 100, 0);
  const currentSeries = periodSeries(total, period, 71, data.portfolioHistory);
  const watchlist = account.watchlist.map(id => findToken(data, id)).filter((asset): asset is Token => Boolean(asset)).slice(0, 3);
  const perpsPreview = ['bitcoin', 'ethereum', 'solana', 'hyperliquid', 'ripple'].map(id => findToken(data, id)).filter((asset): asset is Token => Boolean(asset));
  return <main className="wallet-screen">
    <section className="wallet-heading"><button onClick={onAccount} className="portfolio-address"><span>{account.name}</span><Icon name="chevron" size={16}/></button><button className="visibility-toggle" onClick={() => setHidden(value => !value)} aria-label={hidden ? 'Show balance' : 'Hide balance'}><Icon name={hidden ? 'eyeOff' : 'eye'} size={19}/></button></section>
    <section className="portfolio-summary">
      <h1>{hidden ? '••••••••' : money(total, data.settings)}</h1>
      <p className={`portfolio-change ${change >= 0 ? 'positive' : 'negative'}`}>{hidden ? '••••' : `${change >= 0 ? '+' : ''}${money(change, data.settings)}`} <span className="change-pill">{hidden ? '••••' : `${change >= 0 ? '+' : ''}${total ? (change / total * 100).toFixed(2) : '0.00'}%`}</span></p>
    </section>
    <button className="cash-row" onClick={onCash}><span className="cash-symbol"><Icon name="banknote" size={27}/></span><b>Cash</b><strong>{hidden ? '••••' : money(account.cashBalanceUsd, data.settings)}</strong></button>
    <div className="section-heading wallet-token-heading"><button className="reference-section-link" onClick={() => onScreen('watchlist')}>Tokens <Icon name="chevron" size={15}/></button><button className="text-button" onClick={onAddToken}><Icon name="plus" size={15}/> Manage</button></div>
    {sorted.length ? <section className="asset-list reference-asset-list">{sorted.map(asset => <AssetRow key={asset.id} token={asset} balance={balanceFor(account, asset.id)} settings={data.settings} hidden={hidden || !data.settings.showPrices} showChain={false} onClick={() => onToken(asset)} onMore={() => onEditToken(asset)}/>)}</section> : <EmptyState icon="grid" title="No assets in this account" body="Add tokens from the supported market list or create a local asset." action="Add assets" onAction={onAddToken}/>}
    <section className="home-reference-section">
      <div className="section-heading"><div><h2>Perps <Icon name="chevron" size={18}/></h2></div><button className="text-button" onClick={() => onScreen('trade')}>Explore <Icon name="chevron" size={14}/></button></div>
      <div className="perps-preview">{perpsPreview.map((asset, index) => <button key={asset.id} onClick={() => onScreen('trade')} aria-label={`${asset.name} market`}><span className="perps-preview-logo"><TokenIcon token={asset} size="md"/><small>∞</small></span><span className="perps-preview-title"><b>{asset.symbol}</b><small>{[5, 10, 5, 3, 2][index]}x</small></span><strong className={asset.change24h >= 0 ? 'positive' : 'negative'}>{asset.change24h >= 0 ? '+' : ''}{asset.change24h.toFixed(2)}%</strong></button>)}</div>
      <div className="section-heading"><div><h2>Predictions <Icon name="chevron" size={18}/></h2></div><button className="text-button" onClick={() => onScreen('predict')}>Explore <Icon name="chevron" size={14}/></button></div>
      <div className="home-prediction-preview-strip"><button className="home-prediction-preview" onClick={() => onScreen('predict')}><span className="prediction-sport-icon">⚽</span><b>Charlotte vs Chicago</b><small>MLS · in 4h</small><span className="home-prediction-bars"><i/><i/><i/></span></button><button className="home-prediction-preview" onClick={() => onScreen('predict')}><span className="prediction-sport-icon race">◉</span><b>Virtual Grand Prix</b><small>Practice event · 1d</small><span className="home-prediction-bars"><i/><i/></span></button></div>
      {watchlist.length > 0 && <><div className="section-heading"><div><h2>Watchlist</h2><small>Assets you follow</small></div><button className="text-button" onClick={() => onScreen('watchlist')}>See all <Icon name="chevron" size={14}/></button></div><div className="home-watchlist">{watchlist.map(asset => <button key={asset.id} onClick={() => onToken(asset)}><TokenIcon token={asset} size="sm"/><span><b>{asset.symbol}</b><small>{priceMoney(asset.price, data.settings)}</small></span><strong className={asset.change24h >= 0 ? 'positive' : 'negative'}>{asset.change24h >= 0 ? '+' : ''}{asset.change24h.toFixed(2)}%</strong></button>)}</div></>}
    </section>
    <div className="section-heading recent-heading"><div><h2>Recent activity</h2></div><button className="text-button" onClick={() => onScreen('history')}>See all <Icon name="chevron" size={15}/></button></div>
    {recent.length ? <section className="transaction-list">{recent.map(tx => <TransactionRow key={tx.id} transaction={tx} token={tx.tokenId ? findToken(data, tx.tokenId) : undefined} settings={data.settings} onClick={() => onTransaction(tx)}/>)}</section> : <EmptyState icon="history" title="Nothing here yet" body="Activity from this account will appear here."/>}
    <div className="portfolio-chart-control home-history-chart"><button className="text-button" onClick={() => setShowPortfolioChart(value => !value)} aria-expanded={showPortfolioChart}><Icon name="history" size={15}/>{showPortfolioChart ? 'Hide portfolio chart' : 'Portfolio chart'}</button>{showPortfolioChart && <div className="portfolio-chart-expanded"><PriceChart values={currentSeries} currency={data.settings.currency} settings={data.settings} period={period} onPeriodChange={setChartPeriod} height={142}/></div>}</div>
    {data.settings.watermark && <div className="screen-watermark">ORBIT VAULT</div>}
  </main>;
}

function ActionButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) { return <button className="action-button" onClick={onClick}><span><Icon name={icon} size={21}/></span><small>{label}</small></button>; }

function EmptyState({ icon, title, body, action, onAction }: { icon: string; title: string; body: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={21}/></span><b>{title}</b><p>{body}</p>{action && onAction && <button className="button-secondary" onClick={onAction}>{action}</button>}</div>;
}

function SimulationNote({ data, children, className = '' }: { data: WalletData; children: string; className?: string }) {
  if (!data.settings.showDisclaimer) return null;
  return <div className={`simulation-note ${className}`}><Icon name="info" size={15}/>{children}</div>;
}

function AccountDrawer({ data, onClose, onSwitch, onAccounts, onProfile, onNavigate, onSettings, onSupport, onRefer, onNotify }: { data: WalletData; onClose: () => void; onSwitch: (id: string) => void; onAccounts: () => void; onProfile: () => void; onNavigate: (screen: Screen) => void; onSettings: () => void; onSupport: () => void; onRefer: () => void; onNotify: (message: string) => void }) {
  const account = activeAccount(data);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);
  const closingRef = useRef(false);
  const [closing, setClosing] = useState(false);
  onCloseRef.current = onClose;
  const exitThen = (action: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    const delay = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
    closeTimer.current = window.setTimeout(action, delay);
  };
  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') exitThen(() => onCloseRef.current()); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); if (closeTimer.current) window.clearTimeout(closeTimer.current); };
  }, []);
  const copyAddress = () => {
    if (!navigator.clipboard) { onNotify('Clipboard is unavailable in this browser'); return; }
    void navigator.clipboard.writeText(account.address).then(() => onNotify('Fictional address copied')).catch(() => onNotify('Clipboard is unavailable in this browser'));
  };
  return <div className={`drawer-backdrop ${closing ? 'is-closing' : ''}`} role="presentation" onClick={event => { if (event.target === event.currentTarget) { event.preventDefault(); event.stopPropagation(); exitThen(() => onCloseRef.current()); } }}>
    <aside className={`account-drawer ${closing ? 'is-closing' : ''}`} role="dialog" aria-modal="true" aria-label="Account drawer">
      <div className="drawer-top"><Avatar account={account} size="lg"/><button ref={closeButtonRef} className="icon-button drawer-copy-address" onClick={copyAddress} aria-label="Copy fictional account address"><Icon name="copy" size={24}/></button></div>
      <div className="drawer-user"><h2 title={account.name}>@{account.name.replace(/\s+/g, '')}</h2><button className="drawer-connect" onClick={() => onNotify('Social accounts are not connected in this local simulator')}><span>𝕏</span> Connect your X account</button></div>
      <button className="drawer-account-select" onClick={() => exitThen(onAccounts)}><span><Avatar account={account} size="sm"/><b className="drawer-account-name">{account.name}</b></span><small>Switch account <Icon name="chevron" size={15}/></small></button>
      {data.accounts.length > 1 && <div className="drawer-account-list">{data.accounts.filter(item => item.id !== account.id).slice(0, 2).map(item => <button key={item.id} onClick={() => exitThen(() => onSwitch(item.id))}><Avatar account={item} size="sm"/>{item.name}<span>Switch</span></button>)}</div>}
      <div className="drawer-menu">
        <button onClick={() => exitThen(onProfile)}><Icon name="user"/> Profile</button><button onClick={() => exitThen(onSupport)}><Icon name="chat"/> Chats</button>
        <button onClick={() => exitThen(() => onNavigate('watchlist'))}><Icon name="heart"/> Watchlist</button><button onClick={() => exitThen(() => onNavigate('history'))}><Icon name="clock"/> History</button>
        <button onClick={() => exitThen(onSettings)}><Icon name="settings"/> Settings</button><button onClick={() => exitThen(onSupport)}><Icon name="info"/> Help &amp; Support</button>
      </div>
      <div className="drawer-footer drawer-extra-links"><span>ORBIT VAULT</span><div><button onClick={() => exitThen(onRefer)}>Refer &amp; earn</button><button onClick={() => exitThen(() => onNavigate('collectibles'))}>Collectibles</button></div></div>
    </aside>
  </div>;
}

function MarketSparkline({ data, token }: { data: WalletData; token: Token }) {
  const series = (data.marketHistory[token.id] ?? buildMarketHistory(data, token.id)).slice(-24);
  const low = Math.min(...series); const high = Math.max(...series); const span = Math.max(high - low, Math.abs(high) * .0001, .000001);
  const points = series.map((value, index) => `${(index / Math.max(1, series.length - 1)) * 100},${34 - ((value - low) / span) * 28}`).join(' ');
  return <svg className={`market-sparkline ${token.change24h >= 0 ? 'is-positive' : 'is-negative'}`} viewBox="0 0 100 40" preserveAspectRatio="none" aria-label={`${token.symbol} price movement`} role="img"><polyline points={points}/></svg>;
}

function TradeScreen({ data, onToken, onSwap, onBrowse }: { data: WalletData; onToken: (token: Token) => void; onSwap: () => void; onBrowse: () => void }) {
  const account = activeAccount(data);
  const [filter, setFilter] = useState<'favorites' | 'trending' | 'perps' | 'new' | 'cards'>('trending');
  const [expanded, setExpanded] = useState(false);
  const popular = [...data.assets].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h)).slice(0, 4);
  const listed = [...data.assets].filter(asset => {
    if (filter === 'favorites') return account.watchlist.includes(asset.id);
    if (filter === 'perps') return ['bitcoin', 'ethereum', 'solana', 'hyperliquid', 'xrp'].includes(asset.id);
    if (filter === 'new') return data.assets.slice(-6).some(item => item.id === asset.id);
    return true;
  }).sort((a, b) => filter === 'new' ? data.assets.indexOf(b) - data.assets.indexOf(a) : filter === 'cards' ? a.name.localeCompare(b.name) : Math.abs(b.change24h) - Math.abs(a.change24h));
  const filters = [['favorites', 'Favorites'], ['trending', 'Trending'], ['perps', 'Perps'], ['new', 'New Markets'], ['cards', 'All tokens']] as const;
  const rows = expanded ? listed : listed.slice(0, 12);
  const cap = (token: Token) => token.marketCap ? new Intl.NumberFormat(undefined, { style: 'currency', currency: data.settings.currency, notation: 'compact', maximumFractionDigits: 1 }).format(displayAmountToUsd(token.marketCap, data.settings)) : '—';
  return <main className="trade-screen reference-market-screen">
    <section className="hot-markets-section">
      <div className="trade-section-title"><div><h1>Hot Markets</h1><p><Icon name="user" size={15}/> Based on market activity</p></div><button className={`trade-favorite-toggle ${filter === 'favorites' ? 'is-active' : ''}`} onClick={() => setFilter(value => value === 'favorites' ? 'trending' : 'favorites')} aria-label="Show favorite markets"><Icon name="heart" size={24}/></button></div>
      <div className="hot-market-strip">{popular.map(token => <button className="hot-market-card" key={token.id} onClick={() => onToken(token)}><div className="hot-market-main"><TokenIcon token={token} size="md"/><span className="hot-market-copy"><b>{token.name.toUpperCase()}</b><span>{priceMoney(token.price, data.settings)} <i>·</i> <em className={token.change24h >= 0 ? 'positive' : 'negative'}>{token.change24h >= 0 ? '+' : ''}{token.change24h.toFixed(2)}%</em></span></span><MarketSparkline data={data} token={token}/></div><div className="hot-market-sub"><Icon name="external" size={17}/><span>{token.symbol} · local market</span><Icon name="external" size={15}/></div></button>)}</div>
    </section>
    <section className="reference-market-list"><div className="market-list-heading"><button onClick={onBrowse}><h2>Explore Markets <Icon name="chevron" size={25}/></h2></button><button className="trade-swap-link" onClick={onSwap}><Icon name="swap" size={17}/> Swap</button></div>
      <div className="filter-pills market-filter-tabs" role="tablist" aria-label="Market categories"><button className={`market-heart-chip ${filter === 'favorites' ? 'selected' : ''}`} onClick={() => setFilter('favorites')} role="tab" aria-selected={filter === 'favorites'} aria-label="Favorites"><Icon name="heart" size={19}/></button>{filters.slice(1).map(([id, label]) => <button key={id} className={filter === id ? 'selected' : ''} onClick={() => { setFilter(id); setExpanded(false); }} role="tab" aria-selected={filter === id}>{label}</button>)}</div>
      {rows.length ? <div className="market-token-list">{rows.map((token, index) => <button className="market-token-row" key={token.id} onClick={() => onToken(token)}><span className="market-token-leading"><span className={`market-rank rank-${Math.min(index + 1, 3)}`}>{index + 1}</span><TokenIcon token={token} size="md"/><span className="market-token-copy"><b>{token.symbol.toUpperCase()}</b><small>{cap(token)} MC</small></span></span><span className="market-token-quote"><b>{priceMoney(token.price, data.settings)}</b><small className={token.change24h >= 0 ? 'positive' : 'negative'}>{token.change24h >= 0 ? '+' : ''}{token.change24h.toFixed(2)}%</small></span></button>)}</div> : <EmptyState icon="heart" title="No favorites yet" body="Add a token to your watchlist to keep it here." action="Browse assets" onAction={onBrowse}/>}
      {listed.length > 12 && <button className="market-show-more" onClick={() => setExpanded(value => !value)}>{expanded ? 'Show Less' : 'Show More'} <Icon name="chevron" size={14}/></button>}
    </section>
  </main>;
}

function SwapSheet({ data, initialTokenId, onReview, onAddToken, onToken, onClose }: { data: WalletData; initialTokenId: string; onReview: (draft: { fromId: string; toId: string; amount: number }) => void; onAddToken: () => void; onToken: (token: Token) => void; onClose: () => void }) {
  const account = activeAccount(data);
  const [fromId, setFromId] = useState(initialTokenId || account.assetOrder[0] || 'solana');
  const [toId, setToId] = useState(account.assetOrder.find(id => id !== fromId) ?? 'ethereum');
  const [amount, setAmount] = useState('');
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const from = findToken(data, fromId);
  const to = findToken(data, toId);
  const numericAmount = Number(amount);
  const output = calculateSwap(from, to, numericAmount);
  const error = !from || !to ? 'Add an asset to start a swap.' : fromId === toId ? 'Choose two different assets.' : numericAmount <= 0 ? 'Enter an amount above zero.' : numericAmount > balanceFor(account, fromId) ? 'This is above your available balance.' : '';
  return <Modal title="Swap" onClose={onClose} fullScreen className="swap-sheet">
    <main className="trade-screen trade-sheet-content">
    <div className="screen-title-row"><div><h1>Trade</h1><p>Exchange assets at the displayed quote.</p></div></div>
    <section className="trade-card polished-trade-card">
      <label className="trade-label">You pay</label>
      <div className="trade-input-row"><input aria-label="Amount to swap" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00"/><TokenPickerButton label="Asset to swap from" token={from} assets={data.assets} open={picker === 'from'} onToggle={() => setPicker(picker === 'from' ? null : 'from')} onSelect={asset => { setFromId(asset.id); setPicker(null); }}/></div>
      {picker === 'from' && <TokenPickerList assets={data.assets} selectedId={fromId} balanceFor={assetId => balanceFor(account, assetId)} settings={data.settings} onSelect={asset => { setFromId(asset.id); setPicker(null); }}/ >}
      <div className="trade-balance">Available {quantity(balanceFor(account, fromId), data.settings.decimals)} {from?.symbol ?? ''}<button onClick={() => setAmount(String(balanceFor(account, fromId)))}>Max</button></div>
      <button className="trade-switch" aria-label="Swap input and output assets" onClick={() => { setFromId(toId); setToId(fromId); setPicker(null); }}><Icon name="swap" size={18}/></button>
      <label className="trade-label">You receive</label>
      <div className="trade-output-row"><b>{Number.isFinite(output) ? quantity(output, 6) : '0.00'}</b><TokenPickerButton label="Asset to swap to" token={to} assets={data.assets} open={picker === 'to'} onToggle={() => setPicker(picker === 'to' ? null : 'to')} onSelect={asset => { setToId(asset.id); setPicker(null); }}/></div>
      {picker === 'to' && <TokenPickerList assets={data.assets} selectedId={toId} balanceFor={assetId => balanceFor(account, assetId)} settings={data.settings} onSelect={asset => { setToId(asset.id); setPicker(null); }}/ >}
      <div className="quote-details"><span>Rate after spread</span><b>1 {from?.symbol ?? '—'} ≈ {from && to ? quantity(calculateSwap(from, to, 1), 6) : '—'} {to?.symbol ?? ''}</b><span>Estimated spread</span><b>0.50%</b><span>Estimated value</span><b>{from ? money(from.price * numericAmount, data.settings) : money(0, data.settings)}</b></div>
      {error && <p className="field-error" role="status">{error}</p>}
      <button className="button-primary" disabled={Boolean(error)} onClick={() => onReview({ fromId, toId, amount: numericAmount })}>Review swap</button>
    </section>
    <div className="section-heading"><div><h2>Assets</h2><small>Select an asset to view details</small></div><button className="text-button" onClick={onAddToken}><Icon name="plus" size={16}/> Add</button></div>
    {account.assetOrder.length ? <section className="asset-list">{account.assetOrder.map(id => findToken(data, id)).filter((asset): asset is Token => Boolean(asset)).map(asset => <AssetRow key={asset.id} token={asset} balance={balanceFor(account, asset.id)} settings={data.settings} onClick={() => onToken(asset)}/>)}</section> : <EmptyState icon="grid" title="Add an asset first" body="Choose from the local supported asset catalog." action="Browse assets" onAction={onAddToken}/>}
    </main>
  </Modal>;
}

function TokenPickerButton({ label, token, assets, open, onToggle, onSelect }: { label: string; token?: Token; assets: Token[]; open: boolean; onToggle: () => void; onSelect: (token: Token) => void }) {
  return <button className="trade-token-picker" type="button" aria-label={label} aria-expanded={open} onClick={onToggle}>
    {token ? <TokenIcon token={token} size="sm"/> : <span className="modal-icon"><Icon name="plus" size={16}/></span>}
    <span><b>{token?.symbol ?? 'Select'}</b><small>{token?.name ?? `${assets.length} assets`}</small></span><Icon name="chevron" size={15}/>
  </button>;
}

function TokenPickerList({ assets, selectedId, balanceFor: getBalance, settings, onSelect }: { assets: Token[]; selectedId: string; balanceFor: (assetId: string) => number; settings: Settings; onSelect: (token: Token) => void }) {
  return <div className="trade-token-popover" role="listbox" aria-label="Choose a token">{assets.map(asset => <button type="button" role="option" aria-selected={selectedId === asset.id} className={selectedId === asset.id ? 'is-selected' : ''} key={asset.id} onClick={() => onSelect(asset)}><TokenIcon token={asset} size="sm"/><span><b>{asset.name}</b><small>{quantity(getBalance(asset.id), settings.decimals)} {asset.symbol}</small></span><strong>{money(asset.price, settings)}</strong></button>)}</div>;
}

function PredictScreen({ data, onChoose, onHistory }: { data: WalletData; onChoose: (market: Market) => void; onHistory: () => void }) {
  const currentPicks = data.predictions.filter(item => item.accountId === activeAccount(data).id);
  const featured = MARKETS[0];
  const upcoming = MARKETS.slice(1, 3);
  const cryptoMarkets = MARKETS.slice(3);
  const selectedBitcoin = findToken(data, 'bitcoin');
  const outcome = (market: Market, choice: 'up' | 'down') => market.outcomes?.[choice === 'up' ? 0 : 1] ?? (choice === 'up' ? 'Up' : 'Down');
  return <main className="predict-screen">
    <section className="predict-featured-card">
      <div className="predict-league">MLS <span>{featured.horizon}</span></div>
      <div className="predict-team-row"><span className="predict-team"><i className="team-badge team-blue"><Icon name="ball" size={17}/></i><b>Charlotte</b></span><span className="predict-team"><i className="team-badge team-red"><Icon name="ball" size={17}/></i><b>Chicago</b></span></div>
      <div className="predict-event-time">{featured.horizon}</div>
      <div className="predict-share-bar" aria-label="Sample market shares"><i style={{ width: `${featured.outcomeShares?.[0]}%` }}/><i style={{ width: `${featured.outcomeShares?.[1]}%` }}/><i style={{ width: `${featured.outcomeShares?.[2]}%` }}/></div>
      <div className="predict-outcome-buttons"><button onClick={() => onChoose(featured)}><b>{featured.outcomeShares?.[0]}%</b><small>Charlotte</small></button><button onClick={() => onChoose(featured)}><b>{featured.outcomeShares?.[1]}%</b><small>Chicago</small></button></div>
    </section>
    <div className="predict-section-heading"><button onClick={() => onChoose(upcoming[0])}><h2>Upcoming <Icon name="chevron" size={23}/></h2></button></div>
    <div className="predict-upcoming-strip">{upcoming.map((market, index) => <button className="predict-upcoming-card" key={market.id} onClick={() => onChoose(market)}><span className={`upcoming-art upcoming-art-${index}`}>{market.eventType === 'race' ? '◉' : '◌'}</span><b>{market.title}</b><small>{market.eventType === 'race' ? 'Virtual race' : 'Fictional match'} · {market.horizon}</small></button>)}</div>
    <div className="predict-section-heading"><button onClick={() => selectedBitcoin && onChoose(cryptoMarkets[0])}><h2>Up or Down <Icon name="chevron" size={23}/></h2></button></div>
     {selectedBitcoin && <button className="predict-price-card" onClick={() => onChoose(cryptoMarkets[0])}><TokenIcon token={selectedBitcoin} size="md"/><span className="predict-price-copy"><b>{priceMoney(selectedBitcoin.price, data.settings)}</b><small>Target {priceMoney(selectedBitcoin.price * (1 + cryptoMarkets[0].positiveChance / 10000), data.settings)}</small></span><span className="predict-countdown">01:24</span><MarketSparkline data={data} token={selectedBitcoin}/><span className="predict-target-line"/></button>}
    <div className="predict-section-heading predict-history-heading"><div><h2>Your practice history</h2><small>{currentPicks.length} saved locally</small></div><button className="text-button" onClick={onHistory}>Activity <Icon name="chevron" size={14}/></button></div>
    {currentPicks.length ? <div className="practice-history">{currentPicks.slice(0, 5).map(pick => { const market = MARKETS.find(item => item.id === pick.marketId); return <div key={pick.id}><span className="practice-history-icon">{pick.choice === 'up' ? '↑' : '↓'}</span><span><b>{pick.marketTitle}</b><small>{market ? outcome(market, pick.choice) : pick.choice.toUpperCase()} · {new Date(pick.createdAt).toLocaleString()}</small></span><span className="practice-mark">LOCAL</span></div>; })}</div> : <EmptyState icon="history" title="No picks saved" body="Choose a market card to save a free local prediction."/>}
  </main>;
}

function HistoryScreen({ data, onTransaction }: { data: WalletData; onTransaction: (tx: Transaction) => void }) {
  const [filter, setFilter] = useState<'all' | 'cash' | Transaction['type']>('all');
  const account = activeAccount(data);
  const list = data.transactions.filter(tx => tx.accountId === account.id && (filter === 'all' || (filter === 'cash' ? tx.type === 'cash-added' || tx.type === 'cash-removed' : filter === 'received' ? tx.type === 'received' || tx.type === 'bought' : tx.type === filter)));
  const grouped = list.reduce<Record<string, Transaction[]>>((result, tx) => {
    const date = new Date(tx.timestamp); const now = new Date();
    const key = date.toDateString() === now.toDateString() ? 'Today' : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toDateString() === date.toDateString() ? 'Yesterday' : date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
    (result[key] ??= []).push(tx); return result;
  }, {});
  const filters: Array<[typeof filter, string]> = [['all', 'All'], ['sent', 'Sent'], ['received', 'Received'], ['swapped', 'Swapped'], ['cash', 'Cash']];
  return <main className="history-screen"><div className="screen-title-row"><div><h1>Activity</h1></div><span className="history-count">{list.length}</span></div>
    <div className="filter-pills" role="tablist" aria-label="Filter activity">{filters.map(([id, label]) => <button key={id} className={filter === id ? 'selected' : ''} onClick={() => setFilter(id)} role="tab" aria-selected={filter === id}>{label}</button>)}</div>
    {Object.keys(grouped).length ? Object.entries(grouped).map(([date, items]) => <section className="history-group" key={date}><h2>{date}</h2><div className="transaction-list">{items.map(tx => <TransactionRow key={tx.id} transaction={tx} token={tx.tokenId ? findToken(data, tx.tokenId) : undefined} settings={data.settings} onClick={() => onTransaction(tx)}/>)}</div></section>) : <EmptyState icon="history" title="No activity yet" body={filter === 'all' ? 'Activity from this account will appear here.' : `No ${filter} activity for this account.`}/>}
  </main>;
}

function WatchlistScreen({ data, onToken, onAddToken, onBack }: { data: WalletData; onToken: (token: Token) => void; onAddToken: () => void; onBack: () => void }) {
  const account = activeAccount(data);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'watchlist' | 'added'>('all');
  const assets = data.assets.filter(asset => {
    const matched = `${asset.name} ${asset.symbol} ${asset.chain}`.toLowerCase().includes(query.toLowerCase());
    const suggestionVisible = account.assetOrder.includes(asset.id) || !account.hiddenAssets.includes(asset.id);
    return matched && suggestionVisible && (filter === 'all' || filter === 'watchlist' && account.watchlist.includes(asset.id) || filter === 'added' && account.assetOrder.includes(asset.id));
  }).sort((a, b) => data.settings.sortBy === 'name' ? a.name.localeCompare(b.name) : data.settings.sortBy === 'change' ? b.change24h - a.change24h : b.price - a.price);
  const toggle = (id: string) => useStore.getState().update(current => updateAccount(current, account.id, { watchlist: account.watchlist.includes(id) ? account.watchlist.filter(item => item !== id) : [...account.watchlist, id] }));
  return <main className="watchlist-screen"><div className="screen-title-row"><div><span className="overline">SUPPORTED MARKETS</span><h1>Explore assets</h1><p>Local catalog · {data.assets.length} tracked assets</p></div><button className="icon-button" onClick={onBack} aria-label="Back to wallet"><Icon name="close"/></button></div>
    <label className="search-input"><Icon name="search" size={19}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, symbol or network" aria-label="Search assets"/><span>{assets.length}</span></label>
    <div className="filter-pills" role="tablist" aria-label="Asset list filter">{([['all', 'All'], ['watchlist', 'Watchlist'], ['added', 'In wallet']] as const).map(([id, label]) => <button key={id} className={filter === id ? 'selected' : ''} onClick={() => setFilter(id)} role="tab" aria-selected={filter === id}>{label}</button>)}</div>
    <div className="asset-catalog">{assets.length ? assets.map(asset => <div className="catalog-row" key={asset.id}><AssetRow token={asset} balance={balanceFor(account, asset.id)} settings={data.settings} onClick={() => onToken(asset)}/><button className={`watch-star ${account.watchlist.includes(asset.id) ? 'is-starred' : ''}`} aria-label={account.watchlist.includes(asset.id) ? `Remove ${asset.symbol} from watchlist` : `Add ${asset.symbol} to watchlist`} onClick={() => toggle(asset.id)}><Icon name="star" size={18}/></button><button className={`catalog-add ${account.assetOrder.includes(asset.id) ? 'added' : ''}`} onClick={() => {
      useStore.getState().update(current => updateAccount(current, account.id, { assetOrder: account.assetOrder.includes(asset.id) ? account.assetOrder.filter(item => item !== asset.id) : [...account.assetOrder, asset.id], balances: { ...account.balances, [asset.id]: account.balances[asset.id] ?? 0 } }));
    }} aria-label={account.assetOrder.includes(asset.id) ? `Remove ${asset.symbol} from this wallet` : `Add ${asset.symbol} to this wallet`}>{account.assetOrder.includes(asset.id) ? 'Added' : 'Add'}</button></div>) : <EmptyState icon="search" title="No matches" body="Try another name or symbol."/>}</div>
    <button className="button-secondary custom-asset-button" onClick={onAddToken}><Icon name="plus" size={17}/> Add a custom local asset</button>
  </main>;
}

function ExploreScreen({ data, onToken, onTokens, onCollectibles, onLearn, onNotify }: { data: WalletData; onToken: (token: Token) => void; onTokens: () => void; onCollectibles: () => void; onLearn: () => void; onNotify: (message: string) => void }) {
  const ranked = [...data.assets].sort((a, b) => (b.marketCap ?? b.price) - (a.marketCap ?? a.price)).slice(0, 3);
  const notes: Array<{ tokenId: string; source: string; title: string; tag: string }> = [
    { tokenId: 'bitcoin', source: 'ORBIT NOTE · 2 MIN READ', title: 'A simple guide to reading price changes', tag: 'BTC · market basics' },
    { tokenId: 'ethereum', source: 'ORBIT NOTE · 3 MIN READ', title: 'Why a token balance and its value can move differently', tag: 'ETH · portfolio basics' },
  ];
  return <main className="explore-screen">
    <div className="explore-shortcuts" aria-label="Explore categories">
      <button className="explore-shortcut" onClick={onTokens}><span className="explore-shortcut-icon tokens"><Icon name="wallet" size={24}/></span><b>Tokens</b></button>
      <button className="explore-shortcut" onClick={() => onNotify('External sites are not opened in this preview')}><span className="explore-shortcut-icon sites"><Icon name="globe" size={24}/></span><b>Sites</b></button>
      <button className="explore-shortcut" onClick={onLearn}><span className="explore-shortcut-icon learn"><Icon name="book" size={24}/></span><b>Learn</b></button>
    </div>
    <div className="explore-section-title"><button onClick={onTokens}><h1>Trending Tokens <Icon name="chevron" size={24}/></h1></button><span>Local quotes</span></div>
    <section className="explore-ranking-card" aria-label="Trending token ranking">{ranked.map((token, index) => <button className="explore-token-row" key={token.id} onClick={() => onToken(token)}><span className="explore-token-logo"><TokenIcon token={token} size="md"/><small className={`explore-medal medal-${index + 1}`}>{index + 1}</small></span><span className="explore-token-name"><b>{token.symbol.toUpperCase()}</b><small>{token.name}</small></span><span className="explore-token-value"><b>{priceMoney(token.price, data.settings)}</b><small className={token.change24h >= 0 ? 'positive' : 'negative'}>{token.change24h >= 0 ? '+' : ''}{token.change24h.toFixed(2)}%</small></span></button>)}</section>
    <div className="explore-section-title explore-news-title"><button onClick={onLearn}><h2>What’s Happening <Icon name="chevron" size={24}/></h2></button></div>
    <section className="explore-news-list">{notes.map(note => {
      const token = findToken(data, note.tokenId);
      return <button className="explore-story" key={note.tokenId} onClick={() => token ? onToken(token) : onLearn()}><small>{note.source}</small><b>{note.title}</b><span>{note.tag}</span></button>;
    })}</section>
    <button className="explore-collectibles-link" onClick={onCollectibles}><Icon name="grid" size={19}/><span><b>Collectibles</b><small>View your fictional collection</small></span><Icon name="chevron" size={17}/></button>
  </main>;
}

const collectibleCards = [
  { title: 'Orbit Bloom #014', collection: 'Orbit Garden', icon: '✦', color: 'violet' },
  { title: 'Blue Hour #022', collection: 'Quiet Skies', icon: '◒', color: 'blue' },
  { title: 'Solstice #008', collection: 'Sunroom', icon: '☼', color: 'amber' },
  { title: 'Soft Signal #031', collection: 'Signals', icon: '⌁', color: 'mint' },
];
function CollectiblesScreen({ onBack }: { onBack: () => void }) {
  const [selected, setSelected] = useState<typeof collectibleCards[number] | null>(null);
  return <main className="collectibles-screen"><div className="screen-title-row"><div><span className="overline">FICTIONAL ARTWORK</span><h1>Collectibles</h1><p>Decorative items for interface previews.</p></div><button className="icon-button" onClick={onBack} aria-label="Back to wallet"><Icon name="close"/></button></div>
    <div className="collectible-grid">{collectibleCards.map(card => <button className="collectible-card" key={card.title} onClick={() => setSelected(card)}><span className={`collectible-art ${card.color}`}><i>{card.icon}</i><small>ORBIT · SIM</small></span><b>{card.title}</b><small>{card.collection}</small></button>)}</div>
    {selected && <Modal title={selected.title} onClose={() => setSelected(null)}><div className={`collectible-art detail-art ${selected.color}`}><i>{selected.icon}</i><small>ORBIT · SIM</small></div><h2>{selected.title}</h2><p className="secondary-text">{selected.collection} · decorative local artwork</p><button className="button-secondary" onClick={() => setSelected(null)}>Close collectible</button></Modal>}
  </main>;
}

function CashSheet({ data, onClose, onNotify }: { data: WalletData; onClose: () => void; onNotify: (message: string) => void }) {
  const account = activeAccount(data);
  const current = toDisplayCurrency(account.cashBalanceUsd, data.settings.currency, data.settings);
  const [mode, setMode] = useState<'add' | 'remove' | 'set'>('add');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const number = Number(amount);
  const nextDisplay = mode === 'set' ? number : current + (mode === 'add' ? number : -number);
  const nextUsd = displayAmountToUsd(nextDisplay, data.settings);
  const currencyMark = new Intl.NumberFormat(undefined, { style: 'currency', currency: data.settings.currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find(part => part.type === 'currency')?.value ?? data.settings.currency;
  const shortcuts = mode === 'add' ? [50, 250, 500] : mode === 'remove' ? [current * .25, current * .5, current] : [0, current * .25, current * .5];
  const submit = () => {
    if (!Number.isFinite(number) || number < 0 || (mode !== 'set' && number <= 0) || nextDisplay < 0) { setError('Enter a valid amount. The cash balance cannot be negative.'); return; }
    useStore.getState().update(wallet => cashUpdate(wallet, nextUsd));
    onNotify(mode === 'remove' ? 'Cash balance reduced' : 'Cash balance updated'); onClose();
  };
  return <Modal title="Cash balance" onClose={onClose}><div className="sheet-intro"><span className="modal-icon"><Icon name="cash" size={22}/></span><div><h2>Cash</h2><p>Manage the cash shown in this account.</p></div></div>
    <div className="cash-total cash-balance-hero"><small>Current balance</small><b>{money(account.cashBalanceUsd, data.settings)}</b><span>Available in {account.name}</span></div>
    <div className="segmented-choice">{([['add', 'Add cash'], ['remove', 'Remove'], ['set', 'Set balance']] as const).map(([key, label]) => <button key={key} className={mode === key ? 'selected' : ''} onClick={() => { setMode(key); setError(''); }}>{label}</button>)}</div>
    <div className="cash-amount-panel"><label className="field-label" htmlFor="cash-amount">{mode === 'set' ? 'New balance' : `${mode === 'add' ? 'Amount to add' : 'Amount to remove'}`}</label><div className="cash-amount-input"><span aria-hidden="true">{currencyMark}</span><input id="cash-amount" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={event => { setAmount(event.target.value); setError(''); }} placeholder="0.00" aria-label="Cash amount" autoFocus/></div><small>{data.settings.currency} · updates only this local account</small></div>
    <div className="cash-shortcuts" aria-label="Suggested amounts">{shortcuts.map((value, index) => <button key={`${mode}-${index}`} onClick={() => { setAmount(String(Math.max(0, Math.round(value * 100) / 100))); setError(''); }}>{mode === 'add' ? `+${currencyMark}${value}` : `${currencyMark}${Math.round(value * 100) / 100}`}</button>)}</div>
    <div className="cash-next-balance"><span>New balance</span><b className={nextDisplay < 0 ? 'negative' : ''}>{money(nextUsd, data.settings)}</b></div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <button className="button-primary cash-submit" onClick={submit}>{mode === 'remove' ? 'Update cash balance' : mode === 'set' ? 'Save new balance' : 'Add cash'}</button>
  </Modal>;
}

function SendSheet({ data, initialTokenId, onClose, onNotify, onDone }: { data: WalletData; initialTokenId: string; onClose: () => void; onNotify: (message: string) => void; onDone: (tx: Transaction) => void }) {
  const account = activeAccount(data);
  const sendable = account.assetOrder.map(id => findToken(data, id)).filter((token): token is Token => Boolean(token) && balanceFor(account, token!.id) > 0);
  const [step, setStep] = useState<'asset' | 'recipient' | 'amount' | 'review' | 'success'>('asset');
  const [tokenId, setTokenId] = useState(sendable.some(item => item.id === initialTokenId) ? initialTokenId : sendable[0]?.id ?? '');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState('');
  const token = findToken(data, tokenId);
  const number = Number(amount);
  const validation = validateSend(token, token ? balanceFor(account, token.id) : 0, number, recipient);
  const steps = ['asset', 'recipient', 'amount', 'review'] as const;
  const advance = () => {
    if (step === 'asset') { if (!token) { setError('Add an asset with a balance before sending.'); return; } setError(''); setStep('recipient'); }
    else if (step === 'recipient') { if (!recipient.trim()) { setError('Enter a fictional recipient address.'); return; } setError(''); setStep('amount'); }
    else if (step === 'amount') { if (validation) { setError(validation); return; } setError(''); setStep('review'); }
  };
  const confirm = () => {
    try {
      useStore.getState().update(wallet => sendUpdate(wallet, tokenId, number, recipient, memo));
      const tx = useStore.getState().data.transactions[0];
      if (!tx) throw new Error('Could not record the simulated transaction.');
      setStep('success'); onNotify('Local simulated send complete');
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not record this send.'); }
  };
  const labels = ['Asset', 'Recipient', 'Amount', 'Review'];
  return <Modal title="Send" onClose={onClose} fullScreen className="flow-sheet">
    {step !== 'success' ? <><div className={`flow-heading flow-step-heading step-${step}`}><span className="overline">SEND</span><h2>{step === 'asset' ? 'Choose an asset' : step === 'recipient' ? 'Add a recipient' : step === 'amount' ? 'Enter amount' : 'Review & confirm'}</h2><p>{step === 'review' ? 'This stays on this device and only updates the local simulator.' : 'A few quick steps to create a local activity record.'}</p></div>
      <div className="flow-stepper" aria-label="Send flow progress">{labels.map((label, index) => <span key={label} className={steps.indexOf(step as typeof steps[number]) >= index ? 'done' : ''}><i>{index + 1}</i>{label}</span>)}</div>
      <div className="flow-step-pane" key={step}>
        {step === 'asset' && <div className="choice-list">{sendable.length ? sendable.map(item => <button className={tokenId === item.id ? 'chosen' : ''} key={item.id} onClick={() => setTokenId(item.id)}><TokenIcon token={item}/><span><b>{item.name}</b><small>{quantity(balanceFor(account, item.id), data.settings.decimals)} {item.symbol} available</small></span>{tokenId === item.id && <Icon name="check" size={18}/>}</button>) : <EmptyState icon="grid" title="No spendable assets" body="Add an asset and balance in Settings." action="Close" onAction={onClose}/>}</div>}
        {step === 'recipient' && <div className="flow-fields"><label className="field-label">Fictional recipient<input className="text-input address-input" value={recipient} onChange={event => { setRecipient(event.target.value); setError(''); }} placeholder="orbit-demo:recipient-name" autoCapitalize="off" autoCorrect="off" autoFocus/><small className="helper-text">Use any label or demo address. Nothing is sent to a network.</small></label><label className="field-label">Memo <span className="optional">Optional</span><input className="text-input" value={memo} onChange={event => setMemo(event.target.value)} placeholder="Add a note"/></label></div>}
        {step === 'amount' && token && <div className="flow-fields send-amount-pane"><div className="amount-entry-card"><div className="amount-entry-asset"><TokenIcon token={token}/><span><b>{token.name}</b><small>{token.symbol} · {token.chain}</small></span></div><label className="amount-entry-control" htmlFor="send-amount"><span>Amount</span><div><input id="send-amount" className="amount-input" type="number" inputMode="decimal" min="0" max={balanceFor(account, token.id)} step="any" value={amount} onChange={event => { setAmount(event.target.value); setError(''); }} placeholder="0.00" autoFocus/><b>{token.symbol}</b></div></label><div className="amount-fiat">≈ {money(token.price * number, data.settings)}</div></div><div className="available-row"><span>Available {quantity(balanceFor(account, token.id), data.settings.decimals)} {token.symbol}</span><button onClick={() => setAmount(String(balanceFor(account, token.id)))}>Max</button></div><div className="amount-percentages">{[25, 50, 75, 100].map(percent => <button key={percent} onClick={() => setAmount(String(balanceFor(account, token.id) * percent / 100))}>{percent === 100 ? 'Max' : `${percent}%`}</button>)}</div></div>}
        {step === 'review' && token && <><div className="review-card"><div className="review-asset-heading"><TokenIcon token={token}/><span><b>{token.name}</b><small>{token.symbol} · local preview</small></span></div><ReviewRow label="Recipient" value={recipient}/><ReviewRow label="Amount" value={`${quantity(number, data.settings.decimals)} ${token.symbol}`}/><ReviewRow label="Simulated value" value={money(token.price * number, data.settings)}/>{memo && <ReviewRow label="Memo" value={memo}/>}<ReviewRow label="Network fee" value="None · no network"/></div><SimulationNote data={data}>Confirming creates a local record and updates only this account’s balance.</SimulationNote></>}
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
      <div className="flow-bottom">{step !== 'asset' && <button className="button-secondary" onClick={() => { setError(''); setStep(steps[Math.max(0, steps.indexOf(step as typeof steps[number]) - 1)]); }}>Back</button>}{step === 'review' ? <button className="button-primary" onClick={confirm}>Confirm simulated send</button> : <button className="button-primary" onClick={advance} disabled={!sendable.length && step === 'asset'}>Continue</button>}</div>
    </> : <div className="success-screen"><span className="success-mark"><Icon name="check" size={31}/></span><span className="overline">LOCAL RECORD CREATED</span><h2>Send recorded</h2><p>{quantity(number, data.settings.decimals)} {token?.symbol} was deducted from this account locally.</p><SimulationNote data={data}>Nothing was signed or broadcast.</SimulationNote><button className="button-primary" onClick={() => { const tx = useStore.getState().data.transactions[0]; if (tx) onDone(tx); }}>View activity details</button><button className="button-secondary" onClick={onClose}>Done</button></div>}
  </Modal>;
}

function ReceiveSheet({ data, initialTokenId, onClose, onNotify, onDone }: { data: WalletData; initialTokenId: string; onClose: () => void; onNotify: (message: string) => void; onDone: (tx: Transaction) => void }) {
  const account = activeAccount(data);
  const receiveAddress = `orbit-demo:${account.id.slice(-6)}:${account.address.slice(-8)}`;
  const [recording, setRecording] = useState(false);
  const [tokenId, setTokenId] = useState(data.assets.some(asset => asset.id === initialTokenId) ? initialTokenId : account.assetOrder[0] ?? data.assets[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState('');
  const token = findToken(data, tokenId);
  const copy = async () => { try { await navigator.clipboard.writeText(receiveAddress); onNotify('Demo address copied'); } catch { setError('Clipboard is unavailable here. Select and copy the address below.'); } };
  const share = async () => {
    const shareData = { title: 'Orbit Vault demo address', text: `Fictional receive preview: ${receiveAddress}` };
    const canShare = typeof navigator.share === 'function';
    try { if (canShare) await navigator.share(shareData); else await navigator.clipboard.writeText(shareData.text); onNotify(canShare ? 'Demo address shared' : 'Demo address copied for sharing'); }
    catch (failure) { if (failure instanceof DOMException && failure.name === 'AbortError') return; setError('Sharing is unavailable here. Copy the demo address instead.'); }
  };
  const record = () => {
    try { useStore.getState().update(wallet => receiveUpdate(wallet, tokenId, Number(amount), 'Local simulated receipt', memo)); const tx = useStore.getState().data.transactions[0]; if (tx) onDone(tx); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Enter a valid amount.'); }
  };
  return <Modal title="Receive" onClose={onClose} fullScreen className="receive-sheet">
    <div className="flow-heading"><span className="overline">RECEIVE PREVIEW</span><h2>Receive</h2><p>Preview a fictional address for your content.</p></div>
    <div className="receive-preview-card"><div className="receive-qr"><QRCodeSVG value={receiveAddress} size={208} level="M" includeMargin bgColor="#ffffff" fgColor="#11111a"/><span className="network-pill"><span className="live-dot"/>Non-routable demo address</span></div>
    <div className="address-card"><small>{account.name} · preview only</small><code>{receiveAddress}</code><div className="receive-address-actions"><button className="button-secondary" onClick={() => void copy()}><Icon name="copy" size={17}/> Copy</button><button className="button-secondary" onClick={() => void share()}><Icon name="share" size={17}/> Share</button></div></div></div>
    {!recording ? <button className="button-primary" onClick={() => setRecording(true)}>Create local receipt</button> : <div className="receipt-form"><h3>Create local receipt</h3><label className="field-label">Asset<select className="text-input" value={tokenId} onChange={event => setTokenId(event.target.value)}>{data.assets.map(asset => <option key={asset.id} value={asset.id}>{asset.name} ({asset.symbol})</option>)}</select></label><label className="field-label">Amount<input className="text-input" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={event => { setAmount(event.target.value); setError(''); }} placeholder="0.00"/></label><label className="field-label">Memo <span className="optional">Optional</span><input className="text-input" value={memo} onChange={event => setMemo(event.target.value)} placeholder="Add a note"/></label>{token && <small className="helper-text">Estimated value: {money(token.price * Number(amount || 0), data.settings)}</small>}<button className="button-primary" disabled={!token || Number(amount) <= 0} onClick={record}>Record simulated receipt</button></div>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </Modal>;
}

function ReviewRow({ label, value }: { label: string; value: string }) { return <div className="review-row"><small>{label}</small><b>{value}</b></div>; }

function TokenDetail({ data, token, onClose, onAction, onTransaction, onEdit, onNotify }: { data: WalletData; token: Token; onClose: () => void; onAction: (action: ModalName) => void; onTransaction: (tx: Transaction) => void; onEdit: () => void; onNotify: (message: string) => void }) {
  const account = activeAccount(data);
  const current = findToken(data, token.id) ?? token;
  const [period, setPeriod] = useState<ChartPeriod>('LIVE');
  const [menuOpen, setMenuOpen] = useState(false);
  const history = data.marketHistory[current.id] ?? buildMarketHistory(data, current.id);
  const values = periodSeries(current.price, period, current.id.length * 11, history);
  const transactions = data.transactions.filter(tx => tx.accountId === account.id && (tx.tokenId === current.id || tx.outputTokenId === current.id));
  const watched = account.watchlist.includes(current.id);
  const priorPrice = current.price / Math.max(.0001, 1 + current.change24h / 100);
  const dayMove = current.price - priorPrice;
  const toggleWatch = () => useStore.getState().update(wallet => updateAccount(wallet, account.id, { watchlist: watched ? account.watchlist.filter(id => id !== current.id) : [...account.watchlist, current.id] }));
  const shareToken = () => {
    const content = `${current.name} (${current.symbol}) · ${priceMoney(current.price, data.settings)}`;
    if (!navigator.clipboard) { onNotify('Share text is ready, but clipboard is unavailable'); return; }
    void navigator.clipboard.writeText(content).then(() => onNotify('Simulated token summary copied')).catch(() => onNotify('Clipboard is unavailable in this browser'));
  };
  return <Modal title={`${current.name} details`} onClose={onClose} fullScreen className="token-detail-sheet">
    <div className="token-detail-topline"><button className="token-back-button" onClick={onClose} aria-label="Back"><Icon name="back" size={24}/></button><TokenIcon token={current} size="sm"/><span className="token-topline-spacer"/><button className={`token-topline-button ${watched ? 'is-watched' : ''}`} onClick={toggleWatch} aria-label={watched ? `Remove ${current.symbol} from watchlist` : `Add ${current.symbol} to watchlist`}><Icon name="heart" size={23}/></button><span className="token-share-tools"><button className="token-topline-button" onClick={shareToken} aria-label="Copy token summary"><Icon name="share" size={21}/></button><button className="token-topline-button token-more-button" onClick={() => setMenuOpen(value => !value)} aria-label="More token actions" aria-expanded={menuOpen}>···</button></span>{menuOpen && <div className="token-action-menu"><button onClick={() => onAction('send')}>Send {current.symbol}</button><button onClick={() => onAction('receive')}>Receive {current.symbol}</button><button onClick={() => onAction('swap')}>Swap {current.symbol}</button><button onClick={onEdit}>Edit asset</button></div>}</div>
    <div className="token-reference-summary"><h1><button className="token-title-button" onClick={() => setMenuOpen(value => !value)} aria-expanded={menuOpen}>{current.name}<Icon name="chevron" size={20}/></button></h1><p className="token-price-large">{priceMoney(current.price, data.settings)}</p><div className={current.change24h >= 0 ? 'positive' : 'negative'}>{dayMove >= 0 ? '+' : ''}{priceMoney(dayMove, data.settings)} <span>({current.change24h >= 0 ? '+' : ''}{current.change24h.toFixed(2)}%) today</span></div></div>
    <div className="token-chart-shell" style={{ '--chart-color': current.change24h >= 0 ? '#00df70' : '#ff0050' } as React.CSSProperties}><PriceChart values={values} currency={data.settings.currency} settings={data.settings} symbol={current.symbol} period={period} onPeriodChange={setPeriod} periods={['LIVE', '1D', '1W', '1M', '1Y', 'ALL']} height={282}/></div>
    <button className="token-receive-button" onClick={() => onAction('receive')}><Icon name="qr" size={20}/>Receive</button>
    <div className="token-position reference-token-position"><TokenIcon token={current} size="sm"/><span><b>Your position</b><small>{quantity(balanceFor(account, current.id), data.settings.decimals)} {current.symbol}</small></span><span className="token-position-values"><strong>{money(balanceFor(account, current.id) * current.price, data.settings)}</strong><small className={current.change24h >= 0 ? 'positive' : 'negative'}>{dayMove >= 0 ? '+' : ''}{money(dayMove * balanceFor(account, current.id), data.settings)}</small></span></div>
    <div className="section-heading token-reference-section-heading"><div><h2>About {current.symbol}</h2><small>{current.name} · {current.chain}</small></div><Icon name="chevron" size={15}/></div>
    <div className="info-list token-about-list"><ReviewRow label="Market cap" value={current.marketCap ? money(current.marketCap, data.settings) : 'Not available'}/><ReviewRow label="Market price" value={priceMoney(current.price, data.settings)}/><ReviewRow label="24h change" value={`${current.change24h >= 0 ? '+' : ''}${current.change24h.toFixed(2)}%`}/><ReviewRow label="Network" value={current.chain}/><ReviewRow label="Price source" value={current.priceMode === 'market' ? `${current.priceSource} public snapshot` : 'Local custom value'}/><ReviewRow label="Last update" value={new Date(current.priceRetrievedAt).toLocaleString()}/></div>
    <div className="section-heading recent-heading"><div><h2>Activity</h2><small>{transactions.length} local records</small></div></div>
    {transactions.length ? <section className="transaction-list">{transactions.map(tx => <TransactionRow key={tx.id} transaction={tx} token={current} settings={data.settings} onClick={() => onTransaction(tx)}/>)}</section> : <EmptyState icon="history" title="No token activity" body={`Local ${current.symbol} activity will appear here.`}/>}
    <div className="token-trade-bar"><span title={current.marketCap ? money(current.marketCap, data.settings) : undefined}><b>{current.marketCap ? new Intl.NumberFormat(undefined, { style: 'currency', currency: data.settings.currency, notation: 'compact', maximumFractionDigits: 1 }).format(toDisplayCurrency(current.marketCap, data.settings.currency, data.settings)) : '—'}</b><small>market cap</small></span><button onClick={() => onAction('buy')}><Icon name="plus" size={17}/>Buy</button></div>
  </Modal>;
}

function TransactionDetail({ data, transaction, onClose }: { data: WalletData; transaction: Transaction; onClose: () => void }) {
  const token = transaction.tokenId ? findToken(data, transaction.tokenId) : undefined;
  return <Modal title="Activity details" onClose={onClose} className="transaction-detail-sheet">
    <div className="tx-detail-top"><span className="transaction-icon tx-detail-icon">{transaction.type === 'sent' ? '↑' : transaction.type === 'received' || transaction.type === 'bought' ? '↓' : transaction.type === 'swapped' ? '⇄' : '+'}</span><span className="overline">LOCAL ACTIVITY</span><h2>{textForTx(transaction)}</h2><p>{token ? `${quantity(transaction.amount, data.settings.decimals)} ${token.symbol}` : money(transaction.valueUsd, data.settings)}</p></div>
    <div className="info-list"><ReviewRow label="Status" value="Recorded locally · simulated"/><ReviewRow label="Simulated value" value={money(transaction.valueUsd, data.settings)}/><ReviewRow label="Counterparty / note" value={transaction.counterparty}/><ReviewRow label="Date" value={new Date(transaction.timestamp).toLocaleString()}/>{transaction.memo && <ReviewRow label="Memo" value={transaction.memo}/ >}{transaction.outputTokenSymbol && <ReviewRow label="Swap output" value={`${quantity(transaction.outputAmount ?? 0, 6)} ${transaction.outputTokenSymbol}`}/>}</div>
    <button className="button-secondary full-button" onClick={onClose}>Close details</button>
  </Modal>;
}

function SettingsSheet({ data, onClose, onAccounts, onProfile, onEditToken, onAddToken, onAbout, onReset, installPrompt, onNotify, onImport }: { data: WalletData; onClose: () => void; onAccounts: () => void; onProfile: () => void; onEditToken: (token: Token) => void; onAddToken: () => void; onAbout: () => void; onReset: () => void; installPrompt: BeforeInstallPromptEvent | null; onNotify: (message: string) => void; onImport: (data: unknown) => boolean }) {
  const account = activeAccount(data);
  const [installGuide, setInstallGuide] = useState(false);
  const updateSettings = (patch: Partial<Settings>) => useStore.getState().update(wallet => ({ ...wallet, settings: { ...wallet.settings, ...patch } }));
  const exportData = () => {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = 'orbit-vault-simulator.json'; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000); onNotify('Configuration exported to this device');
    } catch { onNotify('The browser could not export this configuration'); }
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try { if (onImport(JSON.parse(await file.text()))) onNotify('Configuration imported locally'); }
    catch { onNotify('That file is not a valid Orbit Vault configuration'); }
  };
  const promptInstall = async () => {
    if (!installPrompt) { setInstallGuide(true); return; }
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') onNotify('Orbit Vault installed'); else setInstallGuide(true);
  };
  return <Modal title="Settings" onClose={onClose} fullScreen className="settings-sheet">
    <div className="settings-hero"><h2>Settings</h2><p>Personalize your wallet.</p></div>
    <SettingsGroup title="Appearance" subtitle="Personalize the wallet display">
      <SettingRow label="Theme" description="Choose the interface palette"><div className="segmented-choice compact">{(['dark', 'light', 'system'] as const).map(theme => <button key={theme} className={data.settings.theme === theme ? 'selected' : ''} onClick={() => updateSettings({ theme })}>{theme === 'system' ? 'System' : theme === 'dark' ? 'Dark' : 'Light'}</button>)}</div></SettingRow>
      <SettingRow label="Accent color" description="Action and chart highlight"><input className="accent-picker" aria-label="Accent color" type="color" value={data.settings.accent} onChange={event => updateSettings({ accent: event.target.value })}/></SettingRow>
      <SettingRow label="Display currency" description="Converted using the saved FX quote"><select className="setting-select" value={data.settings.currency} onChange={event => updateSettings({ currency: event.target.value as Currency })}><option value="USD">USD · $</option><option value="EUR">EUR · €</option><option value="GBP">GBP · £</option></select></SettingRow>
      <SettingRow label="Balance precision" description="Maximum decimal places"><select className="setting-select" value={data.settings.decimals} onChange={event => updateSettings({ decimals: Number(event.target.value) as Settings['decimals'] })}><option value="2">2 places</option><option value="4">4 places</option><option value="6">6 places</option></select></SettingRow>
      <SettingToggle label="Show asset prices" description="Show current fiat values in lists" checked={data.settings.showPrices} onChange={checked => updateSettings({ showPrices: checked })}/>
      <SettingToggle label="Screenshot watermark" description="Show a subtle Orbit Vault label" checked={data.settings.watermark} onChange={checked => updateSettings({ watermark: checked })}/>
      <SettingToggle label="Confirmation disclosure" description="Show the local-only note before recording activity" checked={data.settings.showDisclaimer} onChange={checked => updateSettings({ showDisclaimer: checked })}/>
    </SettingsGroup>
    <SettingsGroup title="Wallet & accounts" subtitle="Independent balances and local profiles">
      <button className="settings-link-row" onClick={onAccounts}><span><b>Accounts</b><small>{data.accounts.length} local {data.accounts.length === 1 ? 'account' : 'accounts'} · active: {account.name}</small></span><Icon name="chevron"/></button>
      <button className="settings-link-row" onClick={onProfile}><span><b>Active profile</b><small>{account.name} · {account.address}</small></span><Icon name="chevron"/></button>
    </SettingsGroup>
    <SettingsGroup title="Portfolio" subtitle="How lists and charts behave">
      <SettingRow label="Token ordering" description="Sort the wallet asset list"><select className="setting-select" value={data.settings.sortBy} onChange={event => updateSettings({ sortBy: event.target.value as Settings['sortBy'] })}><option value="value">Portfolio value</option><option value="name">Name</option><option value="change">24h change</option></select></SettingRow>
      <SettingRow label="Default chart range" description="Used when the wallet opens"><select className="setting-select" value={data.settings.chartPeriod} onChange={event => updateSettings({ chartPeriod: event.target.value as ChartPeriod })}>{(['1H', '24H', '1W', '1M', '1Y', 'ALL'] as const).map(period => <option key={period} value={period}>{period}</option>)}</select></SettingRow>
    </SettingsGroup>
    <SettingsGroup title="Assets" subtitle="Change holdings, metadata and account visibility">
      {account.assetOrder.length ? account.assetOrder.map(id => findToken(data, id)).filter((asset): asset is Token => Boolean(asset)).map(asset => <button key={asset.id} className="settings-link-row" onClick={() => onEditToken(asset)}><span className="setting-asset-icon"><TokenIcon token={asset} size="sm"/></span><span><b>{asset.name} · {asset.symbol}</b><small>{quantity(balanceFor(account, asset.id), data.settings.decimals)} {asset.symbol} · {asset.chain}</small></span><Icon name="chevron"/></button>) : <p className="settings-empty">No assets in this account.</p>}
      <button className="settings-add-row" onClick={onAddToken}><Icon name="plus" size={17}/> Add or search assets</button>
      {data.assets.map(asset => account.assetOrder.includes(asset.id) ? null : <button key={asset.id} className="settings-link-row muted-row" onClick={() => useStore.getState().update(wallet => updateAccount(wallet, account.id, { hiddenAssets: account.hiddenAssets.includes(asset.id) ? account.hiddenAssets.filter(id => id !== asset.id) : [...account.hiddenAssets, asset.id] }))}><span><b>{asset.name} · {asset.symbol}</b><small>{account.hiddenAssets.includes(asset.id) ? 'Hidden from suggestions' : 'Not in this account'}</small></span><span className="small-action">{account.hiddenAssets.includes(asset.id) ? 'Show' : 'Hide'}</span></button>)}
    </SettingsGroup>
    <SettingsGroup title="Install app" subtitle="Open Orbit Vault like an app on your phone">
      <button className="settings-link-row" onClick={() => void promptInstall()}><span><b>Install Orbit Vault</b><small>Use the browser installation prompt when available</small></span><Icon name="external"/></button>
      {installGuide && <div className="install-guide"><b>iPhone / iPad</b><small>Open this page in Safari, tap Share, then choose “Add to Home Screen”.</small><b>Android</b><small>Open Chrome’s menu and tap “Install app” or “Add to Home screen”.</small></div>}
    </SettingsGroup>
    <SettingsGroup title="Data & privacy" subtitle="Your data and backups">
      <button className="settings-link-row" onClick={exportData}><span><b>Export configuration</b><small>Download accounts, balances and preferences as JSON</small></span><Icon name="external"/></button>
      <label className="settings-link-row import-row"><span><b>Import configuration</b><small>Load a previously exported JSON file</small></span><input type="file" accept="application/json,.json" onChange={event => { void importFile(event.target.files?.[0]); event.target.value = ''; }}/><Icon name="external"/></label>
      <button className="settings-link-row" onClick={() => useStore.getState().update(wallet => ({ ...wallet, settings: { ...DEFAULT_SETTINGS, usdToEur: wallet.settings.usdToEur, usdToGbp: wallet.settings.usdToGbp } }))}><span><b>Reset preferences</b><small>Restore appearance and display defaults</small></span><Icon name="history"/></button>
      <button className="settings-link-row destructive-row" onClick={onReset}><span><b>Reset wallet data</b><small>Remove accounts and activity from this browser</small></span><Icon name="trash"/></button>
    </SettingsGroup>
    <SettingsGroup title="Information" subtitle="About Orbit Vault">
      <button className="settings-link-row" onClick={onAbout}><span><b>About Orbit Vault</b><small>App information</small></span><Icon name="chevron"/></button>
    </SettingsGroup>
  </Modal>;
}

function SettingsGroup({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) { return <section className="settings-group"><div className="settings-group-title"><h3>{title}</h3>{subtitle && <small>{subtitle}</small>}</div><div className="settings-group-content">{children}</div></section>; }
function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) { return <div className="setting-row"><span><b>{label}</b><small>{description}</small></span>{children}</div>; }
function SettingToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className="setting-toggle"><span><b>{label}</b><small>{description}</small></span><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)}/><i aria-hidden="true"/></label>; }

function AccountsSheet({ data, onClose, onNotify, onProfile }: { data: WalletData; onClose: () => void; onNotify: (message: string) => void; onProfile: () => void }) {
  const [name, setName] = useState('');
  const [deleteId, setDeleteId] = useState('');
  const [error, setError] = useState('');
  const active = activeAccount(data);
  const add = () => {
    try { useStore.getState().update(wallet => createAccount(wallet, name)); setName(''); setError(''); onNotify('New local account created'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not create this account.'); }
  };
  const remove = (id: string) => {
    if (data.accounts.length <= 1) { setError('Keep at least one account in this simulator.'); setDeleteId(''); return; }
    useStore.getState().update(wallet => {
      const remaining = wallet.accounts.filter(account => account.id !== id);
      const nextActive = wallet.activeAccountId === id ? remaining[0].id : wallet.activeAccountId;
      return { ...wallet, accounts: remaining, activeAccountId: nextActive, transactions: wallet.transactions.filter(tx => tx.accountId !== id), predictions: wallet.predictions.filter(pick => pick.accountId !== id) };
    });
    setDeleteId(''); setError(''); onNotify('Local account and its activity removed');
  };
  return <Modal title="Accounts" onClose={onClose} fullScreen>
    <div className="sheet-intro"><span className="modal-icon"><Icon name="user" size={22}/></span><div><h2>Accounts</h2><p>Each account keeps its own cash and token balances.</p></div></div>
    <div className="account-list">{data.accounts.map(item => <div className={`managed-account ${item.id === active.id ? 'is-active' : ''}`} key={item.id}><button className="managed-account-main" onClick={() => useStore.getState().update(wallet => ({ ...wallet, activeAccountId: item.id }))}><Avatar account={item}/><span><b>{item.name}</b><small>{item.address}</small></span><small>{item.id === active.id ? 'Active' : 'Switch'}</small></button><button className="account-edit-link" onClick={() => { useStore.getState().update(wallet => ({ ...wallet, activeAccountId: item.id })); onProfile(); }}>Edit</button><button className="account-delete-link" onClick={() => { setDeleteId(deleteId === item.id ? '' : item.id); setError(''); }} aria-label={`Delete ${item.name}`}><Icon name="trash" size={17}/></button>{deleteId === item.id && <div className="inline-confirm"><span>Delete this account, local balances and its activity?</span><button onClick={() => remove(item.id)}>Delete account</button><button onClick={() => setDeleteId('')}>Cancel</button></div>}</div>)}</div>
    <div className="create-account-form"><h3>Create another account</h3><label className="field-label">Account name<input className="text-input" value={name} onChange={event => { setName(event.target.value); setError(''); }} placeholder="Studio wallet" maxLength={32}/></label>{error && <p className="field-error" role="alert">{error}</p>}<button className="button-primary" disabled={!name.trim()} onClick={add}>Create local account</button><p className="helper-text">New accounts start empty. No wallet keys or network accounts are generated.</p></div>
  </Modal>;
}

function ProfileSheet({ data, onClose, onNotify }: { data: WalletData; onClose: () => void; onNotify: (message: string) => void }) {
  const account = activeAccount(data);
  const [name, setName] = useState(account.name);
  const [avatar, setAvatar] = useState(account.avatar === '◈' ? '👻' : account.avatar);
  const [address, setAddress] = useState(account.address);
  const [avatarImage, setAvatarImage] = useState(account.avatarImage ?? '');
  const [error, setError] = useState('');
  const save = () => {
    if (!name.trim()) { setError('Enter an account name.'); return; }
    if (!address.trim()) { setError('Enter a fictional address or label.'); return; }
    useStore.getState().update(wallet => updateAccount(wallet, account.id, { name: name.trim(), address: address.trim(), avatar: avatar || '👻', avatarImage: avatarImage || undefined }));
    onNotify('Account profile saved locally'); onClose();
  };
  const uploadAvatar = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Choose an image file.'); return; }
    const image = new Image(); const reader = new FileReader();
    reader.onload = () => { image.onload = () => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256; const context = canvas.getContext('2d'); if (!context) { setError('This browser could not process that image.'); return; } const scale = Math.max(256 / image.width, 256 / image.height); const width = image.width * scale; const height = image.height * scale; context.drawImage(image, (256 - width) / 2, (256 - height) / 2, width, height); setAvatarImage(canvas.toDataURL('image/webp', .78)); setError(''); }; image.src = String(reader.result); };
    reader.readAsDataURL(file);
  };
  return <Modal title="Account profile" onClose={onClose}>
    <div className="profile-preview"><Avatar account={{ ...account, name, avatar, avatarImage: avatarImage || undefined }} size="lg"/><span><b>{name || 'Account name'}</b><small>{account.address}</small></span></div>
    <label className="field-label">Account name<input className="text-input" value={name} onChange={event => setName(event.target.value)} maxLength={32}/></label>
    <label className="field-label">Avatar mark<input className="text-input" value={avatar} onChange={event => setAvatar(event.target.value.slice(0, 4))} maxLength={4} placeholder="◈ or initials"/></label>
    <div className="avatar-presets">{['👻', '◉', '✦', '☼', 'OV'].map(mark => <button key={mark} onClick={() => { setAvatar(mark); setAvatarImage(''); }}>{mark}</button>)}</div>
    <label className="button-secondary upload-button"><Icon name="user" size={17}/> Upload profile image<input type="file" accept="image/*" onChange={event => { uploadAvatar(event.target.files?.[0]); event.target.value = ''; }}/></label>
    {avatarImage && <button className="text-button remove-image" onClick={() => setAvatarImage('')}>Remove uploaded image</button>}
    <label className="field-label">Fictional address<input className="text-input address-input" value={address} onChange={event => setAddress(event.target.value)} autoCapitalize="off" autoCorrect="off"/></label>
    <div className="address-card compact-address"><small>Displayed in this app only</small><code>{address}</code><button className="button-secondary" onClick={() => navigator.clipboard?.writeText(address).then(() => onNotify('Fictional address copied')).catch(() => setError('Clipboard unavailable'))}><Icon name="copy" size={16}/> Copy address</button></div>
    {error && <p className="field-error" role="alert">{error}</p>}<button className="button-primary" onClick={save}>Save profile</button>
  </Modal>;
}

const chains: Chain[] = ['Solana', 'Ethereum', 'Bitcoin', 'Hyperliquid', 'Base', 'BNB Chain', 'XRP Ledger', 'Cardano', 'Dogecoin', 'Avalanche', 'Polkadot', 'Litecoin', 'Sui', 'TON', 'Tron', 'Other'];

function AddTokenSheet({ data, onClose, onNotify, onEdit }: { data: WalletData; onClose: () => void; onNotify: (message: string) => void; onEdit: (token: Token) => void }) {
  const account = activeAccount(data);
  const [mode, setMode] = useState<'browse' | 'custom'>('browse');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ name: '', symbol: '', chain: 'Other' as Chain, price: '1', icon: '' });
  const [error, setError] = useState('');
  const assets = data.assets.filter(asset => `${asset.name} ${asset.symbol} ${asset.chain}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const addExisting = (asset: Token) => {
    useStore.getState().update(wallet => updateAccount(wallet, account.id, { assetOrder: account.assetOrder.includes(asset.id) ? account.assetOrder : [...account.assetOrder, asset.id], balances: { ...account.balances, [asset.id]: account.balances[asset.id] ?? 0 }, hiddenAssets: account.hiddenAssets.filter(id => id !== asset.id) }));
    onNotify(`${asset.symbol} added to this account`);
  };
  const createCustom = () => {
    const name = form.name.trim(); const symbol = form.symbol.trim().toUpperCase(); const displayPrice = Number(form.price); const price = displayAmountToUsd(displayPrice, data.settings);
    if (!name || !/^[A-Z0-9]{2,12}$/.test(symbol) || !Number.isFinite(price) || price <= 0) { setError('Add a name, a 2–12 character symbol, and a price above zero.'); return; }
    const token: Token = { id: createId('custom'), name, symbol, chain: form.chain, icon: form.icon.trim() || symbol.slice(0, 2), price, marketPrice: price, change24h: 0, priceSource: 'custom', priceRetrievedAt: new Date().toISOString(), volatility: .0002, priceMode: 'custom', isCustom: true };
    useStore.getState().update(wallet => ({ ...wallet, assets: [...wallet.assets, token], accounts: wallet.accounts.map(item => item.id === account.id ? { ...item, balances: { ...item.balances, [token.id]: 0 }, assetOrder: [...item.assetOrder, token.id] } : item) }));
    onNotify(`${symbol} custom asset created`); onClose();
  };
  return <Modal title="Add assets" onClose={onClose} fullScreen>
    <div className="sheet-intro"><span className="modal-icon"><Icon name="plus" size={22}/></span><div><h2>Add assets</h2><p>Choose a tracked asset or create a custom local entry.</p></div></div>
    <div className="segmented-choice">{(['browse', 'custom'] as const).map(item => <button key={item} className={mode === item ? 'selected' : ''} onClick={() => { setMode(item); setError(''); }}>{item === 'browse' ? 'Supported assets' : 'Custom asset'}</button>)}</div>
    {mode === 'browse' ? <><label className="search-input asset-search"><Icon name="search" size={18}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search supported assets" aria-label="Search supported assets"/></label><div className="modal-asset-list">{assets.map(asset => <div className="modal-asset-row" key={asset.id}><AssetRow token={asset} balance={balanceFor(account, asset.id)} settings={data.settings} onClick={() => onEdit(asset)}/>{account.assetOrder.includes(asset.id) ? <button className="small-action" onClick={() => onEdit(asset)}>Edit</button> : <button className="add-chip" onClick={() => addExisting(asset)}>Add</button>}</div>)}{!assets.length && <EmptyState icon="search" title="No matches" body="Try another name or symbol."/>}</div></> : <div className="custom-token-form">
      <label className="field-label">Name<input className="text-input" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Example token" maxLength={32}/></label>
      <label className="field-label">Symbol<input className="text-input" value={form.symbol} onChange={event => setForm({ ...form, symbol: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) })} placeholder="EXMPL" maxLength={12}/></label>
      <label className="field-label">Displayed network<select className="text-input" value={form.chain} onChange={event => setForm({ ...form, chain: event.target.value as Chain })}>{chains.map(chain => <option key={chain} value={chain}>{chain}</option>)}</select></label>
      <label className="field-label">Starting mock price ({data.settings.currency})<input className="text-input" type="number" inputMode="decimal" min="0" step="any" value={form.price} onChange={event => setForm({ ...form, price: event.target.value })}/></label>
      <label className="field-label">Icon mark <span className="optional">Emoji or initials</span><input className="text-input" value={form.icon} onChange={event => setForm({ ...form, icon: event.target.value.slice(0, 4) })} placeholder={form.symbol.slice(0, 2) || 'EX'}/></label>
      {error && <p className="field-error" role="alert">{error}</p>}<button className="button-primary" onClick={createCustom}>Create custom asset</button>
    </div>}
  </Modal>;
}

function EditTokenSheet({ data, token, onClose, onNotify }: { data: WalletData; token: Token; onClose: () => void; onNotify: (message: string) => void }) {
  const account = activeAccount(data);
  const [name, setName] = useState(token.name);
  const [symbol, setSymbol] = useState(token.symbol);
  const [chain, setChain] = useState<Chain>(token.chain);
  const [mark, setMark] = useState(token.iconOverride ?? (token.isCustom && !token.icon.startsWith('/') ? token.icon : ''));
  const [price, setPrice] = useState(priceInputValue(toDisplayCurrency(token.price, data.settings.currency, data.settings)));
  const [priceWasEdited, setPriceWasEdited] = useState(false);
  const [balance, setBalance] = useState(String(Number(balanceFor(account, token.id).toFixed(12))));
  const [balanceWasEdited, setBalanceWasEdited] = useState(false);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const save = () => {
    const nextPrice = displayAmountToUsd(Number(price), data.settings); const nextBalance = balanceWasEdited ? Number(balance) : balanceFor(account, token.id); const nextSymbol = symbol.trim().toUpperCase();
    if (!name.trim() || !/^[A-Z0-9]{2,12}$/.test(nextSymbol) || !Number.isFinite(nextPrice) || nextPrice <= 0 || !Number.isFinite(nextBalance) || nextBalance < 0) { setError('Check the name, symbol, price and non-negative quantity.'); return; }
    const customPrice = priceWasEdited;
    useStore.getState().update(wallet => ({
      ...wallet,
      assets: wallet.assets.map(asset => asset.id === token.id ? { ...asset, name: name.trim(), symbol: nextSymbol, chain, icon: findToken(wallet, token.id)?.icon ?? asset.icon, iconOverride: mark.trim() || undefined, price: customPrice ? nextPrice : asset.price, marketPrice: customPrice ? nextPrice : asset.marketPrice, priceMode: customPrice ? 'custom' : asset.priceMode, priceSource: customPrice ? 'custom' : asset.priceSource, priceRetrievedAt: customPrice ? new Date().toISOString() : asset.priceRetrievedAt } : asset),
      accounts: wallet.accounts.map(item => item.id === account.id ? { ...item, balances: { ...item.balances, [token.id]: nextBalance }, assetOrder: item.assetOrder.includes(token.id) ? item.assetOrder : [...item.assetOrder, token.id] } : item),
    }));
    onNotify(customPrice ? `${nextSymbol} saved with a custom price` : `${nextSymbol} saved locally`); onClose();
  };
  const syncPrice = () => { const state = useStore.getState(); const latestPrice = findToken(state.data, token.id)?.marketPrice ?? token.marketPrice; const provider = state.marketStatus.provider; useStore.getState().update(wallet => ({ ...wallet, assets: wallet.assets.map(asset => asset.id === token.id ? { ...asset, price: asset.marketPrice, priceMode: 'market', priceSource: provider } : asset) })); setPrice(priceInputValue(toDisplayCurrency(latestPrice, data.settings.currency, data.settings))); setPriceWasEdited(false); onNotify(`${provider} market price sync restored`); };
  const remove = () => { useStore.getState().update(wallet => updateAccount(wallet, account.id, { assetOrder: account.assetOrder.filter(id => id !== token.id), hiddenAssets: account.hiddenAssets.filter(id => id !== token.id) })); onNotify(`${token.symbol} removed from this account`); onClose(); };
  return <Modal title={`Edit ${token.symbol}`} onClose={onClose} className="edit-token-sheet">
    <div className="sheet-intro"><TokenIcon token={token} size="lg"/><div><h2>Edit asset</h2><p>Changes to the balance apply only to {account.name}.</p></div></div>
    <label className="field-label">Name<input className="text-input" value={name} onChange={event => setName(event.target.value)} maxLength={32}/></label>
    <label className="field-label">Symbol<input className="text-input" value={symbol} onChange={event => setSymbol(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))} maxLength={12}/></label>
    <label className="field-label">Network<select className="text-input" value={chain} onChange={event => setChain(event.target.value as Chain)}>{chains.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
    <label className="field-label">Logo override <span className="optional">Optional emoji; blank keeps the token logo</span><input className="text-input" value={mark} onChange={event => setMark(event.target.value.slice(0, 4))} placeholder="Use token logo"/></label>
    <label className="field-label">Quantity owned<input className="text-input" type="number" inputMode="decimal" min="0" step="any" value={balance} onChange={event => { setBalance(event.target.value); setBalanceWasEdited(true); }}/></label>
    <label className="field-label">Displayed price ({data.settings.currency})<input className="text-input" type="number" inputMode="decimal" min="0" step="any" value={price} onChange={event => { setPrice(event.target.value); setPriceWasEdited(true); }}/></label>
    <div className="price-source-row"><span><b>{token.priceMode === 'market' ? 'Market linked' : 'Custom local price'}</b><small>{token.priceMode === 'market' ? 'Public price snapshots refresh periodically' : 'This asset is excluded from market updates'}</small></span>{(token.coingeckoId || token.coinPaprikaId) && token.priceMode !== 'market' && <button className="small-action" onClick={syncPrice}>Sync market</button>}</div>
    <SettingToggle label="Hide from wallet home" description="The asset stays in this account and its balance is preserved" checked={account.hiddenAssets.includes(token.id)} onChange={checked => useStore.getState().update(wallet => updateAccount(wallet, account.id, { hiddenAssets: checked ? [...new Set([...account.hiddenAssets, token.id])] : account.hiddenAssets.filter(id => id !== token.id) }))}/>
    {error && <p className="field-error" role="alert">{error}</p>}
    <button className="button-primary" onClick={save}>Save asset</button>
    {!confirmRemove ? <button className="button-danger" onClick={() => setConfirmRemove(true)}>Remove from this account</button> : <div className="inline-confirm danger-confirm"><span>Remove {token.symbol} from this account? Its quantity will stay saved.</span><button onClick={remove}>Confirm remove</button><button onClick={() => setConfirmRemove(false)}>Cancel</button></div>}
  </Modal>;
}

function QuickActions({ onClose, onAction }: { onClose: () => void; onAction: (action: 'send' | 'receive' | 'cash' | 'swap') => void }) {
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closingRef = useRef(false);
  const finish = (action: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    timer.current = window.setTimeout(action, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); finish(() => onCloseRef.current()); } };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); if (timer.current) clearTimeout(timer.current); };
  }, []);
  return <div className={`quick-actions-overlay ${closing ? 'is-closing' : ''}`} role="presentation" onClick={event => { if (event.target === event.currentTarget) { event.preventDefault(); event.stopPropagation(); finish(onClose); } }}>
    <section className="quick-actions-panel" role="dialog" aria-modal="true" aria-label="Quick actions">
      <div className="quick-actions-list">
        {([['send', 'Send'], ['receive', 'Receive'], ['cash', 'Add Cash'], ['swap', 'Trade']] as const).map(([action, label], index) => <button key={action} className="quick-action-item" style={{ '--action-index': index } as React.CSSProperties} onClick={() => finish(() => onAction(action))}><b>{label}</b><span><Icon name={action === 'cash' ? 'cashCoin' : action === 'swap' ? 'shuffle' : action === 'receive' ? 'qr' : action} size={27}/></span></button>)}
      </div>
      <button className="quick-actions-close" onClick={() => finish(onClose)} aria-label="Close quick actions"><Icon name="close" size={34}/></button>
    </section>
  </div>;
}

function BuyCryptoSheet({ data, initialTokenId, onClose, onNotify, onDone }: { data: WalletData; initialTokenId: string; onClose: () => void; onNotify: (message: string) => void; onDone: (tx: Transaction) => void }) {
  const account = activeAccount(data);
  const purchasable = data.assets.filter(asset => account.assetOrder.includes(asset.id));
  const [tokenId, setTokenId] = useState(purchasable.some(asset => asset.id === initialTokenId) ? initialTokenId : purchasable[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const token = findToken(data, tokenId);
  const usd = displayAmountToUsd(Number(amount), data.settings);
  const quantityOut = token && token.price > 0 ? usd / token.price : 0;
  const valid = Boolean(token && Number.isFinite(usd) && usd > 0 && usd <= account.cashBalanceUsd && token.price > 0);
  const confirm = () => {
    try {
      useStore.getState().update(wallet => buyUpdate(wallet, tokenId, usd));
      const tx = useStore.getState().data.transactions[0];
      if (!tx) throw new Error('Could not save the local purchase record.');
      onNotify('Simulated purchase complete · no payment processed'); onDone(tx);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not complete the local simulation.'); }
  };
  return <Modal title="Buy crypto" onClose={onClose} className="buy-crypto-sheet">
    <div className="sheet-intro"><span className="modal-icon"><Icon name="plus" size={22}/></span><div><h2>Buy Crypto</h2><p>Use this account’s cash balance.</p></div></div>
    <div className="cash-total"><small>Available cash</small><b>{money(account.cashBalanceUsd, data.settings)}</b></div>
    <label className="field-label">Asset<select className="text-input" value={tokenId} onChange={event => setTokenId(event.target.value)}>{purchasable.map(asset => <option key={asset.id} value={asset.id}>{asset.name} ({asset.symbol}) · {priceMoney(asset.price, data.settings)}</option>)}</select></label>
    <label className="field-label">Cash amount ({data.settings.currency})<input className="text-input" type="number" inputMode="decimal" min="0" max={toDisplayCurrency(account.cashBalanceUsd, data.settings.currency, data.settings)} step="any" value={amount} onChange={event => { setAmount(event.target.value); setError(''); }} placeholder="0.00"/></label>
    <div className="available-row"><span>Estimated amount</span><b>{token ? `${quantity(quantityOut, data.settings.decimals)} ${token.symbol}` : '—'}</b></div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <SimulationNote data={data}>This confirmation records a simulated purchase and changes only this account’s local balance.</SimulationNote>
    <button className="button-primary" disabled={!valid} onClick={confirm}>Record simulated purchase</button>
    {!purchasable.length && <EmptyState icon="grid" title="No assets in this account" body="Add a token to the account before simulating a purchase." action="Browse assets" onAction={onClose}/>}
  </Modal>;
}

function SwapConfirmation({ data, draft, onClose, onNotify, onDone }: { data: WalletData; draft: { fromId: string; toId: string; amount: number }; onClose: () => void; onNotify: (message: string) => void; onDone: (tx: Transaction) => void }) {
  const account = activeAccount(data); const from = findToken(data, draft.fromId); const to = findToken(data, draft.toId);
  const output = calculateSwap(from, to, draft.amount);
  const error = !from || !to || from.id === to.id || draft.amount <= 0 || draft.amount > balanceFor(account, draft.fromId);
  const confirm = () => {
    try { useStore.getState().update(wallet => swapUpdate(wallet, draft.fromId, draft.toId, draft.amount)); const transaction = useStore.getState().data.transactions[0]; if (!transaction) throw new Error('No local transaction was saved.'); onNotify('Local simulated swap complete'); onDone(transaction); }
    catch (failure) { onNotify(failure instanceof Error ? failure.message : 'Could not update simulated balances.'); }
  };
  return <Modal title="Review swap" onClose={onClose}>
    <div className="flow-heading"><span className="overline">SIMULATED TRANSACTION</span><h2>Confirm swap</h2><p>Review the quote before updating your balances.</p></div>
    {error ? <EmptyState icon="info" title="Quote unavailable" body="Check the selected assets and available balance, then try again."/> : <div className="swap-review-card"><div className="swap-review-asset">{from && <TokenIcon token={from}/>}<span><small>You pay</small><b>{quantity(draft.amount, data.settings.decimals)} {from?.symbol}</b><small>{from && money(from.price * draft.amount, data.settings)}</small></span></div><div className="swap-review-arrow"><Icon name="receive" size={17}/></div><div className="swap-review-asset">{to && <TokenIcon token={to}/>}<span><small>Estimated output</small><b>{quantity(output, 6)} {to?.symbol}</b><small>{to && money(to.price * output, data.settings)}</small></span></div><div className="quote-details"><span>Rate after spread</span><b>1 {from?.symbol} ≈ {from && to ? quantity(calculateSwap(from, to, 1), 6) : '—'} {to?.symbol}</b><span>Estimated spread</span><b>0.50%</b><span>Fee</span><b>None · no exchange</b></div></div>}
    <SimulationNote data={data}>Confirming creates a simulated record and updates only local balances.</SimulationNote>
    <button className="button-primary" disabled={error} onClick={confirm}>Confirm simulated swap</button><button className="button-secondary full-button" onClick={onClose}>Go back</button>
  </Modal>;
}

function PredictionSheet({ data, market, onClose, onNotify }: { data: WalletData; market: Market; onClose: () => void; onNotify: (message: string) => void }) {
  const account = activeAccount(data);
  const [choice, setChoice] = useState<'up' | 'down' | null>(null);
  const token = market.eventType ? undefined : findToken(data, market.tokenId);
  const choiceLabels = market.outcomes ?? ['Rise', 'Fall'];
  const savePick = () => {
    if (!choice) return;
    const prediction: Prediction = { id: createId('pick'), accountId: account.id, marketId: market.id, marketTitle: market.title, choice, stakeUsd: 0, createdAt: new Date().toISOString(), status: 'open' };
    useStore.getState().update(wallet => ({ ...wallet, predictions: [prediction, ...wallet.predictions.filter(item => !(item.accountId === account.id && item.marketId === market.id))] }));
    onNotify(`Local ${choice.toUpperCase()} practice pick saved`); onClose();
  };
  return <Modal title="Practice prediction" onClose={onClose}>
    <div className="sheet-intro">{token ? <TokenIcon token={token}/> : <span className="modal-icon">{market.eventType === 'race' ? '◉' : '⚽'}</span>}<div><span className="overline">PRACTICE · NO WAGER</span><h2>{market.title}</h2><p>{market.eventType ? `Choose an outcome for this fictional ${market.eventType} practice market.` : `Will it be ${market.priceTarget}?`}</p></div></div>
    {token && <div className="market-current"><span>Current price</span><b>{priceMoney(token.price, data.settings)}</b></div>}
    <div className="prediction-choice"><button className={choice === 'up' ? 'selected up-choice' : 'up-choice'} onClick={() => setChoice('up')}>{market.eventType ? choiceLabels[0] : '↑ I think it will rise'}</button><button className={choice === 'down' ? 'selected down-choice' : 'down-choice'} onClick={() => setChoice('down')}>{market.eventType ? choiceLabels[1] : '↓ I think it will fall'}</button></div>
    <button className="button-primary" disabled={!choice} onClick={savePick}>Save practice pick</button>
  </Modal>;
}

function AboutSheet({ onClose }: { onClose: () => void }) {
  return <Modal title="About Orbit Vault" onClose={onClose}>
    <div className="about-mark">◈</div><span className="overline">ORBIT VAULT</span><h2>A wallet interface for creators</h2><p className="secondary-text">Made for content creation, interface prototyping, learning and entertainment.</p>
    <div className="about-disclosure"><b>Simulator — No Real Funds</b><p>No wallet or blockchain connection. Balances and transactions are fictional, local records.</p></div>
    <button className="button-primary" onClick={onClose}>Understood</button>
  </Modal>;
}

function SupportSheet({ onClose }: { onClose: () => void }) {
  const [topic, setTopic] = useState('');
  return <Modal title="Help & support" onClose={onClose}>
    <div className="sheet-intro"><span className="modal-icon"><Icon name="info" size={22}/></span><div><h2>Help & support</h2><p>Quick answers about Orbit Vault.</p></div></div>
    <div className="faq-list">{[
      ['Where is my data stored?', 'Accounts, balances, settings and history are saved only in this browser’s local storage. Use Export configuration to make a local backup.'],
      ['How often do prices refresh?', 'Orbit Vault checks CoinGecko and falls back to CoinPaprika when the primary source is unavailable.'],
    ].map(([question, answer]) => <details key={question}><summary>{question}<Icon name="chevron" size={16}/></summary><p>{answer}</p></details>)}</div>
    <label className="field-label">Choose a topic<select className="text-input" value={topic} onChange={event => setTopic(event.target.value)}><option value="">Select a help topic</option><option>Accounts and balances</option><option>Market data</option><option>Import or export</option><option>Install on a phone</option></select></label>
    {topic && <small className="helper-text">{topic}: see the matching section in Settings, or export a backup first.</small>}
    <button className="button-secondary full-button" onClick={onClose}>Close help</button>
  </Modal>;
}

function ReferSheet({ onClose, onNotify }: { onClose: () => void; onNotify: (message: string) => void }) {
  const code = 'ORBIT-LOCAL';
  return <Modal title="Refer & earn" onClose={onClose}>
    <div className="sheet-intro"><span className="modal-icon"><Icon name="star" size={22}/></span><div><span className="overline">LOCAL PREVIEW</span><h2>Share Orbit Vault</h2><p>This build has no referral program or rewards.</p></div></div>
    <div className="referral-code"><small>Sample creator code</small><b>{code}</b></div><button className="button-primary" onClick={() => navigator.clipboard?.writeText(code).then(() => onNotify('Sample code copied')).catch(() => onNotify('Clipboard unavailable'))}>Copy sample code</button>
    <small className="helper-text">Sample codes are for content previews.</small>
  </Modal>;
}

function ResetSheet({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  return <Modal title="Reset local data" onClose={onClose}>
    <div className="danger-symbol"><Icon name="trash" size={24}/></div><h2>Reset Orbit Vault?</h2><p className="secondary-text">This clears all local accounts, balances, transactions, practice picks and settings from this browser. Export a backup first if you may need it.</p>
    <button className="button-danger" onClick={onConfirm}>Reset all local data</button><button className="button-secondary full-button" onClick={onClose}>Keep my data</button>
  </Modal>;
}
