import { create } from 'zustand';
import { PRICE_SOURCE, SUPPORTED_ASSETS } from './catalog';
import { activeAccount, applyMarketPrices, createDefaultData, portfolioValueUsd, stepPrices } from './logic';
import type { MarketResponse, Token, Transaction, WalletData } from './types';

export const STORAGE_KEY = 'orbit-vault-sim-v1';
const ACKNOWLEDGEMENT_KEYS = [`${STORAGE_KEY}-ack`, `${STORAGE_KEY.replace('-v1', '')}-ack`];
const readAcknowledgement = () => ACKNOWLEDGEMENT_KEYS.some(key => localStorage.getItem(key) === 'yes');
const HISTORY_POINTS = 60;
const save = (data: WalletData, storage: Storage = localStorage) => storage.setItem(STORAGE_KEY, JSON.stringify(data));
const safeNumber = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const legacyEmojiOverride = (value: unknown): string | undefined => typeof value === 'string' && !value.startsWith('/') && /\p{Extended_Pictographic}/u.test(value) ? value : undefined;

function migrateLegacy(input: Record<string, unknown>): WalletData {
  const data = createDefaultData();
  const oldTokens = Array.isArray(input.tokens) ? input.tokens as Array<Record<string, unknown>> : [];
  const profile = (input.profile && typeof input.profile === 'object' ? input.profile : {}) as Record<string, unknown>;
  const oldSettings = (input.settings && typeof input.settings === 'object' ? input.settings : {}) as Record<string, unknown>;
  const account = data.accounts[0];
  account.name = typeof profile.name === 'string' && profile.name.trim() ? profile.name : account.name;
  account.address = typeof profile.address === 'string' && profile.address.trim() ? profile.address : account.address;
  account.assetOrder = [];
  const assets = [...data.assets];
  for (const old of oldTokens) {
    const symbol = String(old.symbol ?? '').toUpperCase();
    const mapped = assets.find(asset => asset.symbol === symbol);
    const id = mapped?.id ?? String(old.id ?? `custom-${symbol.toLowerCase() || assets.length}`);
    const prior = assets.find(asset => asset.id === id);
    const imported: Token = {
      ...(prior ?? data.assets[0]), id,
      symbol: symbol || String(old.symbol ?? 'NEW'),
      name: String(old.name ?? prior?.name ?? 'Custom asset'),
      chain: (old.chain as Token['chain']) ?? prior?.chain ?? 'Other',
      icon: prior?.icon ?? String(old.icon ?? symbol.slice(0, 1)),
      iconOverride: prior ? legacyEmojiOverride(old.icon) : undefined,
      price: safeNumber(old.price, prior?.price ?? 1),
      marketPrice: safeNumber(old.marketPrice ?? old.priceBaseline, prior?.marketPrice ?? safeNumber(old.price, 1)),
      change24h: safeNumber(old.change24h, prior?.change24h ?? 0),
      marketCap: safeNumber(old.marketCap, prior?.marketCap),
      coingeckoId: typeof old.coingeckoId === 'string' ? old.coingeckoId : prior?.coingeckoId,
      priceSource: (old.priceSource as Token['priceSource']) ?? (prior?.priceSource ?? 'custom'),
      priceRetrievedAt: String(old.priceRetrievedAt ?? prior?.priceRetrievedAt ?? new Date().toISOString()),
      volatility: safeNumber(old.volatility, prior?.volatility ?? .0002),
      priceMode: (old.priceMode as Token['priceMode']) ?? (prior?.priceMode ?? 'custom'),
      isCustom: Boolean(old.isCustom ?? !prior),
    };
    if (prior) assets[assets.indexOf(prior)] = imported;
    else assets.push(imported);
    account.balances[id] = safeNumber(old.balance, 0);
    account.assetOrder.push(id);
  }
  data.assets = assets;
  if (!account.assetOrder.length) account.assetOrder = [...data.assets.slice(0, 5).map(asset => asset.id)];
  data.settings = {
    ...data.settings,
    accent: typeof oldSettings.accent === 'string' ? oldSettings.accent : data.settings.accent,
    currency: (['USD', 'EUR', 'GBP'].includes(String(oldSettings.currency)) ? oldSettings.currency : data.settings.currency) as WalletData['settings']['currency'],
    watermark: typeof oldSettings.watermark === 'boolean' ? oldSettings.watermark : false,
    showDisclaimer: typeof oldSettings.showDisclaimer === 'boolean' ? oldSettings.showDisclaimer : true,
  };
  const oldTransactions = Array.isArray(input.transactions) ? input.transactions as Array<Record<string, unknown>> : [];
  data.transactions = oldTransactions.map(tx => ({
    id: String(tx.id ?? `tx-${Math.random().toString(36).slice(2)}`), accountId: account.id,
    type: (['sent', 'received', 'bought', 'swapped', 'cash-added', 'cash-removed', 'prediction'].includes(String(tx.type)) ? tx.type : 'received') as Transaction['type'],
    tokenId: String(tx.tokenId ?? ''), tokenSymbol: String(tx.tokenSymbol ?? ''), amount: safeNumber(tx.amount),
    valueUsd: safeNumber(tx.valueUsd), counterparty: String(tx.counterparty ?? 'Local simulation'),
    timestamp: String(tx.timestamp ?? new Date().toISOString()), status: 'completed' as const, memo: typeof tx.memo === 'string' ? tx.memo : undefined,
    outputTokenId: typeof tx.outputTokenId === 'string' ? tx.outputTokenId : undefined,
    outputTokenSymbol: typeof tx.outputTokenSymbol === 'string' ? tx.outputTokenSymbol : undefined,
    outputAmount: safeNumber(tx.outputAmount),
  }));
  return data;
}

export function normalizeWalletData(input: unknown): WalletData {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid Orbit Vault configuration.');
  const raw = input as Record<string, unknown>;
  if (raw.version !== 2 || !Array.isArray(raw.accounts) || !Array.isArray(raw.assets)) return migrateLegacy(raw);
  const defaults = createDefaultData();
  const settings = (raw.settings && typeof raw.settings === 'object' ? raw.settings : {}) as Partial<WalletData['settings']>;
  const assets = (raw.assets as Token[]).filter(asset => asset && typeof asset.id === 'string' && typeof asset.symbol === 'string' && safeNumber(asset.price) > 0).map(asset => {
    const catalog = SUPPORTED_ASSETS.find(item => item.id === asset.id);
    const persistedOverride = catalog ? legacyEmojiOverride(asset.iconOverride) : asset.iconOverride;
    const oldMark = catalog ? legacyEmojiOverride(asset.icon) : undefined;
    return { ...catalog, ...asset, icon: catalog?.icon ?? asset.icon, iconOverride: persistedOverride ?? oldMark, coinPaprikaId: asset.coinPaprikaId ?? catalog?.coinPaprikaId, price: safeNumber(asset.price), marketPrice: safeNumber(asset.marketPrice, asset.price), change24h: safeNumber(asset.change24h), volatility: Math.max(0, safeNumber(asset.volatility, .0002)) };
  });
  const accounts = (raw.accounts as WalletData['accounts']).filter(account => account && typeof account.id === 'string' && typeof account.name === 'string').map(account => ({
    ...account, address: String(account.address ?? 'orbit.sim.local'), avatar: String(account.avatar ?? '◈'),
    cashBalanceUsd: Math.max(0, safeNumber(account.cashBalanceUsd)), balances: Object.fromEntries(Object.entries(account.balances ?? {}).map(([id, value]) => [id, Math.max(0, safeNumber(value))])),
    assetOrder: Array.isArray(account.assetOrder) ? account.assetOrder.filter(id => assets.some(asset => asset.id === id)) : [],
    hiddenAssets: Array.isArray(account.hiddenAssets) ? account.hiddenAssets : [], watchlist: Array.isArray(account.watchlist) ? account.watchlist : [],
  }));
  if (!accounts.length || !assets.length) throw new Error('Configuration needs at least one account and one asset.');
  const activeAccountId = accounts.some(account => account.id === raw.activeAccountId) ? String(raw.activeAccountId) : accounts[0].id;
  return {
    version: 2, assets, accounts, activeAccountId,
    transactions: Array.isArray(raw.transactions) ? raw.transactions as Transaction[] : [],
    predictions: Array.isArray(raw.predictions) ? raw.predictions as WalletData['predictions'] : [],
    settings: { ...defaults.settings, ...settings },
    marketHistory: raw.marketHistory && typeof raw.marketHistory === 'object' ? raw.marketHistory as WalletData['marketHistory'] : defaults.marketHistory,
    portfolioHistory: Array.isArray(raw.portfolioHistory) ? raw.portfolioHistory.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)).slice(-HISTORY_POINTS) : defaults.portfolioHistory,
  };
}

export function loadData(storage: Storage = localStorage): WalletData {
  try {
    const serialized = storage.getItem(STORAGE_KEY);
    if (!serialized) return createDefaultData();
    const parsed = normalizeWalletData(JSON.parse(serialized));
    if ((JSON.parse(serialized) as { version?: number }).version !== 2) save(parsed, storage);
    return parsed;
  } catch {
    return createDefaultData();
  }
}

type MarketProvider = 'CoinGecko' | 'CoinPaprika';

async function requestJson(url: URL, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort('timeout'), 10_000);
  const cancel = () => controller.abort(signal?.reason);
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`Price provider returned ${response.status}.`);
    return await response.json() as unknown;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error('Market data request timed out after 10 seconds.');
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

function quoteCoverage(response: MarketResponse, assets: Token[]): boolean {
  const ids = assets.filter(asset => asset.priceMode === 'market' && asset.coingeckoId).map(asset => asset.coingeckoId!);
  return ids.length > 0 && ids.every(id => typeof response[id]?.usd === 'number' && response[id].usd > 0);
}

export async function fetchMarketPrices(assets: Token[], signal?: AbortSignal): Promise<{ response: MarketResponse; updatedAt: string; provider: MarketProvider }> {
  const marketAssets = assets.filter(asset => asset.priceMode === 'market');
  if (!marketAssets.length) throw new Error('There are no market-linked assets to refresh.');
  const failures: string[] = [];

  const coingeckoIds = [...new Set(marketAssets.map(asset => asset.coingeckoId).filter((id): id is string => Boolean(id)))];
  if (coingeckoIds.length) {
    try {
      const url = new URL('https://api.coingecko.com/api/v3/simple/price');
      url.searchParams.set('ids', coingeckoIds.join(','));
      url.searchParams.set('vs_currencies', 'usd,eur,gbp');
      url.searchParams.set('include_24hr_change', 'true');
      url.searchParams.set('include_market_cap', 'true');
      url.searchParams.set('include_last_updated_at', 'true');
      const response = await requestJson(url, signal) as MarketResponse;
      if (!quoteCoverage(response, marketAssets)) throw new Error('CoinGecko returned incomplete quotes.');
      return { response, updatedAt: new Date().toISOString(), provider: 'CoinGecko' };
    } catch (error) {
      if (signal?.aborted) throw error;
      failures.push(error instanceof Error ? error.message : 'CoinGecko is unavailable.');
    }
  }

  const paprikaAssets = marketAssets.filter(asset => asset.coingeckoId && asset.coinPaprikaId);
  if (paprikaAssets.length === marketAssets.length) {
    try {
      const url = new URL('https://api.coinpaprika.com/v1/tickers');
      url.searchParams.set('quotes', 'USD,EUR,GBP');
      const rows = await requestJson(url, signal) as Array<{ id?: string; last_updated?: string; quotes?: Record<string, { price?: number; percent_change_24h?: number; market_cap?: number }> }>;
      if (!Array.isArray(rows)) throw new Error('CoinPaprika returned an unexpected response.');
      const response: MarketResponse = {};
      let latestTimestamp = 0;
      for (const asset of paprikaAssets) {
        const row = rows.find(item => item.id === asset.coinPaprikaId);
        const usd = row?.quotes?.USD;
        if (!row || typeof usd?.price !== 'number' || usd.price <= 0) continue;
        const euro = row.quotes?.EUR?.price;
        const pound = row.quotes?.GBP?.price;
        const timestamp = row.last_updated ? Date.parse(row.last_updated) : NaN;
        if (Number.isFinite(timestamp)) latestTimestamp = Math.max(latestTimestamp, timestamp);
        response[asset.coingeckoId!] = {
          usd: usd.price,
          eur: typeof euro === 'number' ? euro : undefined,
          gbp: typeof pound === 'number' ? pound : undefined,
          usd_24h_change: usd.percent_change_24h,
          usd_market_cap: usd.market_cap,
          last_updated_at: Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : undefined,
        };
      }
      if (!quoteCoverage(response, marketAssets)) throw new Error('CoinPaprika did not return every market-linked asset.');
      return { response, updatedAt: latestTimestamp ? new Date(latestTimestamp).toISOString() : new Date().toISOString(), provider: 'CoinPaprika' };
    } catch (error) {
      if (signal?.aborted) throw error;
      failures.push(error instanceof Error ? error.message : 'CoinPaprika is unavailable.');
    }
  }
  throw new Error(failures.length ? failures.join(' · ') : 'No supported market-data provider is configured for every asset.');
}

type MarketStatus = { ready: boolean; source: 'snapshot' | 'live'; provider: MarketProvider; message: string; updatedAt: string | null };
type State = {
  data: WalletData;
  acknowledged: boolean;
  marketStatus: MarketStatus;
  error: string;
  tick: () => void;
  refreshPrices: (signal?: AbortSignal) => Promise<void>;
  update: (fn: (data: WalletData) => WalletData) => void;
  setData: (data: unknown) => boolean;
  acknowledge: () => void;
  reset: () => void;
  clearError: () => void;
};

let ticks = 0;
const initialData = loadData();
const initialStatus: MarketStatus = { ready: false, source: 'snapshot', provider: 'CoinPaprika', message: 'Loading current market prices…', updatedAt: null };

export const useStore = create<State>((set, get) => ({
  data: initialData,
  acknowledged: readAcknowledgement(),
  marketStatus: initialStatus,
  error: '',
  tick: () => set(state => {
    if (!state.marketStatus.ready) return state;
    const nextTick = ticks + 1;
    const advanceHistory = nextTick % 60 === 0;
    const assets = stepPrices(state.data.assets);
    const nextData = { ...state.data, assets };
    const marketHistory = { ...nextData.marketHistory };
    for (const asset of assets) {
      const points = marketHistory[asset.id] ?? [];
      const retained = points.length ? (advanceHistory ? points.slice(-59) : points.slice(0, -1)) : [];
      marketHistory[asset.id] = [...retained, asset.price];
    }
    const portfolioPoints = state.data.portfolioHistory;
    const retainedPortfolio = portfolioPoints.length ? (advanceHistory ? portfolioPoints.slice(-59) : portfolioPoints.slice(0, -1)) : [];
    const portfolioHistory = [...retainedPortfolio, portfolioValueUsd(nextData)];
    nextData.marketHistory = marketHistory;
    nextData.portfolioHistory = portfolioHistory;
    ticks = nextTick;
    if (ticks % 15 === 0) { try { save(nextData); } catch { /* Keep the in-memory simulator usable when local storage is full. */ } }
    return { data: nextData };
  }),
  refreshPrices: async (signal) => {
    try {
      const { response, updatedAt, provider } = await fetchMarketPrices(get().data.assets, signal);
      set(state => {
        const merged = applyMarketPrices(state.data, response, updatedAt, provider);
        const marketHistory = { ...merged.marketHistory };
        for (const asset of merged.assets) {
          if (!response[asset.coingeckoId ?? '']) continue;
          const points = marketHistory[asset.id] ?? [];
          marketHistory[asset.id] = points.length ? [...points.slice(0, -1), asset.price] : [asset.price];
        }
        merged.marketHistory = marketHistory;
        const portfolioHistory = [...merged.portfolioHistory.slice(0, -1), portfolioValueUsd(merged)];
        merged.portfolioHistory = portfolioHistory;
        try { save(merged); } catch { /* Market refresh remains available in memory. */ }
        return { data: merged, marketStatus: { ready: true, source: 'live', provider, message: `${provider} snapshot received; prices drift locally between updates.`, updatedAt } };
      });
    } catch (error) {
      if (signal?.aborted) return;
      const rawMessage = error instanceof Error ? error.message : '';
      const message = rawMessage.toLowerCase().includes('fetch') ? 'Market provider could not be reached.' : rawMessage || 'Price provider is unavailable.';
      set(state => ({ marketStatus: { ...state.marketStatus, ready: true, source: 'snapshot', message: `${message} Using the latest saved market snapshot; prices still simulate locally.`, updatedAt: state.data.assets.find(asset => asset.priceMode === 'market')?.priceRetrievedAt ?? state.marketStatus.updatedAt } }));
    }
  },
  update: fn => set(state => {
    const data = fn(state.data);
    let error = '';
    try { save(data); } catch { error = 'Local storage is full. Export the configuration before adding more data.'; }
    return { data, error };
  }),
  setData: input => {
    try { const data = normalizeWalletData(input); save(data); set({ data, error: '' }); return true; }
    catch (error) { set({ error: error instanceof Error ? error.message : 'Could not load this configuration.' }); return false; }
  },
  acknowledge: () => { localStorage.setItem(`${STORAGE_KEY}-ack`, 'yes'); set({ acknowledged: true }); },
  reset: () => { const data = createDefaultData(); save(data); set({ data, error: '' }); },
  clearError: () => set({ error: '' }),
}));

// Other tabs and installed PWA windows share the same persistent wallet. Apply
// their latest snapshot without saving it again, which would create an echo.
const syncStorageChange = (event: StorageEvent) => {
  if (event.storageArea !== localStorage) return;
  if (event.key && ACKNOWLEDGEMENT_KEYS.includes(event.key)) {
    useStore.setState({ acknowledged: event.newValue === 'yes' || readAcknowledgement() });
    return;
  }
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try {
    const input: unknown = JSON.parse(event.newValue);
    if (!input || typeof input !== 'object' || Array.isArray(input)) return;
    const raw = input as Record<string, unknown>;
    const currentWallet = raw.version === 2 && Array.isArray(raw.accounts) && Array.isArray(raw.assets);
    const legacyWallet = Array.isArray(raw.tokens) && raw.profile && typeof raw.profile === 'object';
    if (!currentWallet && !legacyWallet) return;
    useStore.setState({ data: normalizeWalletData(input) });
  } catch {
    // An incomplete or malformed external write must not replace a usable wallet.
  }
};

window.addEventListener('storage', syncStorageChange);
const hot = (import.meta as ImportMeta & { hot?: { dispose: (callback: () => void) => void } }).hot;
hot?.dispose(() => window.removeEventListener('storage', syncStorageChange));
