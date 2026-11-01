import { PRICE_SOURCE, SNAPSHOT_RETRIEVED_AT, SUPPORTED_ASSETS } from './catalog';
import type { MarketResponse, Prediction, Settings, Token, Transaction, WalletAccount, WalletData } from './types';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark', accent: '#ab9ff2', currency: 'USD', decimals: 4,
  watermark: false, showDisclaimer: true, showPrices: true, sortBy: 'value', chartPeriod: '24H',
  usdToEur: .892897, usdToGbp: .746436,
};

const initialBalances: Record<string, number> = { solana: 420, ethereum: 2.418, bitcoin: .087, hyperliquid: 0, 'usd-coin': 1250 };
const initialOrder = ['solana', 'ethereum', 'bitcoin', 'hyperliquid', 'usd-coin'];
const seededHistory = (price: number, salt: number, count = 60) => Array.from({ length: count }, (_, i) => price * (1 + Math.sin(i * .22 + salt) * .004 + Math.cos(i * .061 + salt * .7) * .002 + (i / count) * .003));

export function createId(prefix = 'sim'): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;
}

export const createDefaultAccount = (): WalletAccount => ({
  id: 'account-orbit', name: 'Orbit Wallet', address: 'orbit.sim.7F4A.91D2', avatar: '👻',
  cashBalanceUsd: 0, balances: { ...initialBalances }, assetOrder: [...initialOrder], hiddenAssets: [], watchlist: ['bitcoin', 'ethereum', 'solana'],
});

export function createDefaultData(): WalletData {
  const assets = structuredClone(SUPPORTED_ASSETS);
  const account = createDefaultAccount();
  const startingValue = assets.reduce((total, asset) => total + asset.price * (account.balances[asset.id] ?? 0), 0);
  const marketHistory = Object.fromEntries(assets.map((asset, index) => [asset.id, seededHistory(asset.price, index + 1)]));
  return {
    version: 2, assets, accounts: [account], activeAccountId: account.id,
    transactions: [], predictions: [], settings: { ...DEFAULT_SETTINGS }, marketHistory,
    portfolioHistory: seededHistory(startingValue, 71),
  };
}

export const DEFAULT_DATA = createDefaultData();
export const activeAccount = (data: WalletData): WalletAccount => data.accounts.find(account => account.id === data.activeAccountId) ?? data.accounts[0];
export const findToken = (data: WalletData, id: string): Token | undefined => data.assets.find(asset => asset.id === id);
export const balanceFor = (account: WalletAccount, tokenId: string): number => account.balances[tokenId] ?? 0;
export const tokenValueUsd = (asset: Token, balance: number): number => asset.price * balance;
export function portfolioValueUsd(data: WalletData, account = activeAccount(data)): number {
  return account.cashBalanceUsd + account.assetOrder.reduce((sum, id) => sum + (findToken(data, id)?.price ?? 0) * balanceFor(account, id), 0);
}

export const currencyRate = (currency: Settings['currency'], settings: Settings): number => currency === 'EUR' ? settings.usdToEur : currency === 'GBP' ? settings.usdToGbp : 1;
export const toDisplayCurrency = (usd: number, currency: Settings['currency'], settings: Settings): number => usd * currencyRate(currency, settings);

export function validateSend(token: Token | undefined, availableBalance: number, amount: number, recipient: string): string | null {
  if (!token) return 'Choose an asset.';
  if (!recipient.trim()) return 'Enter a fictional recipient address.';
  if (!Number.isFinite(amount) || amount <= 0) return 'Enter an amount above zero.';
  if (amount > availableBalance) return 'Amount exceeds the available simulated balance.';
  return null;
}

export function calculateSwap(from: Token | undefined, to: Token | undefined, amount: number, spread = .005): number {
  if (!from || !to || !Number.isFinite(amount) || amount <= 0) return 0;
  return amount * from.price / to.price * (1 - spread);
}

export function sendUpdate(data: WalletData, tokenId: string, amount: number, recipient: string, memo?: string): WalletData {
  const account = activeAccount(data);
  const token = findToken(data, tokenId);
  const error = validateSend(token, balanceFor(account, tokenId), amount, recipient);
  if (error || !token) throw new Error(error ?? 'Choose an asset.');
  const valueUsd = tokenValueUsd(token, amount);
  return {
    ...data,
    accounts: data.accounts.map(item => item.id === account.id ? { ...item, balances: { ...item.balances, [tokenId]: balanceFor(item, tokenId) - amount } } : item),
    transactions: [{ id: createId('tx'), accountId: account.id, type: 'sent', tokenId, tokenSymbol: token.symbol, amount, valueUsd, counterparty: recipient.trim(), timestamp: new Date().toISOString(), status: 'completed', memo }, ...data.transactions],
  };
}

export function receiveUpdate(data: WalletData, tokenId: string, amount: number, sender = 'Simulated receipt', memo?: string): WalletData {
  const account = activeAccount(data);
  const token = findToken(data, tokenId);
  if (!token || !Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid simulated amount.');
  return {
    ...data,
    accounts: data.accounts.map(item => item.id === account.id ? { ...item, balances: { ...item.balances, [tokenId]: balanceFor(item, tokenId) + amount }, assetOrder: item.assetOrder.includes(tokenId) ? item.assetOrder : [...item.assetOrder, tokenId] } : item),
    transactions: [{ id: createId('tx'), accountId: account.id, type: 'received', tokenId, tokenSymbol: token.symbol, amount, valueUsd: tokenValueUsd(token, amount), counterparty: sender, timestamp: new Date().toISOString(), status: 'completed', memo }, ...data.transactions],
  };
}

export function buyUpdate(data: WalletData, tokenId: string, amountUsd: number): WalletData {
  const account = activeAccount(data);
  const token = findToken(data, tokenId);
  if (!token || !Number.isFinite(amountUsd) || amountUsd <= 0 || !Number.isFinite(token.price) || token.price <= 0) {
    throw new Error('Choose an asset and enter a valid purchase amount.');
  }
  if (amountUsd > account.cashBalanceUsd) throw new Error('Amount exceeds the available simulated cash balance.');
  const amount = amountUsd / token.price;
  return {
    ...data,
    accounts: data.accounts.map(item => item.id === account.id ? {
      ...item,
      cashBalanceUsd: item.cashBalanceUsd - amountUsd,
      balances: { ...item.balances, [tokenId]: balanceFor(item, tokenId) + amount },
      assetOrder: item.assetOrder.includes(tokenId) ? item.assetOrder : [...item.assetOrder, tokenId],
    } : item),
    transactions: [{ id: createId('tx'), accountId: account.id, type: 'bought', tokenId, tokenSymbol: token.symbol, amount, valueUsd: amountUsd, counterparty: 'Local cash-funded simulation', timestamp: new Date().toISOString(), status: 'completed', memo: 'Simulated purchase · no payment processed' }, ...data.transactions],
  };
}

export function cashUpdate(data: WalletData, nextBalanceUsd: number): WalletData {
  const account = activeAccount(data);
  if (!Number.isFinite(nextBalanceUsd) || nextBalanceUsd < 0) throw new Error('Enter a valid cash amount.');
  const delta = nextBalanceUsd - account.cashBalanceUsd;
  const type = delta >= 0 ? 'cash-added' : 'cash-removed';
  if (Math.abs(delta) < .000001) return data;
  const transaction: Transaction = { id: createId('tx'), accountId: account.id, type, tokenSymbol: 'CASH', amount: Math.abs(delta), valueUsd: Math.abs(delta), counterparty: 'Local cash adjustment', timestamp: new Date().toISOString(), status: 'completed' };
  return { ...data, accounts: data.accounts.map(item => item.id === account.id ? { ...item, cashBalanceUsd: nextBalanceUsd } : item), transactions: [transaction, ...data.transactions] };
}

export function swapUpdate(data: WalletData, fromId: string, toId: string, amount: number, spread = .005): WalletData {
  const account = activeAccount(data);
  const from = findToken(data, fromId);
  const to = findToken(data, toId);
  if (!from || !to || fromId === toId || !Number.isFinite(amount) || amount <= 0 || amount > balanceFor(account, fromId)) throw new Error('Check the selected assets and available amount.');
  const output = calculateSwap(from, to, amount, spread);
  const valueUsd = tokenValueUsd(from, amount);
  return {
    ...data,
    accounts: data.accounts.map(item => item.id === account.id ? { ...item, balances: { ...item.balances, [fromId]: balanceFor(item, fromId) - amount, [toId]: balanceFor(item, toId) + output }, assetOrder: item.assetOrder.includes(toId) ? item.assetOrder : [...item.assetOrder, toId] } : item),
    transactions: [{ id: createId('tx'), accountId: account.id, type: 'swapped', tokenId: fromId, tokenSymbol: from.symbol, amount, valueUsd, counterparty: 'Local rate simulation', timestamp: new Date().toISOString(), status: 'completed', outputTokenId: toId, outputTokenSymbol: to.symbol, outputAmount: output }, ...data.transactions],
  };
}

export function stepPrices(assets: Token[], random: () => number = Math.random): Token[] {
  return assets.map(asset => {
    if (asset.priceMode === 'custom') return asset;
    const volatility = asset.volatility || .00016;
    const move = (random() * 2 - 1) * volatility;
    return { ...asset, price: Math.max(Number.EPSILON, asset.price * (1 + move)) };
  });
}

export function applyMarketPrices(data: WalletData, response: MarketResponse, retrievedAt = new Date().toISOString(), provider: 'CoinGecko' | 'CoinPaprika' = 'CoinGecko'): WalletData {
  const usdStable = response['usd-coin'];
  const fxEur = usdStable?.eur && usdStable.usd ? usdStable.eur / usdStable.usd : data.settings.usdToEur;
  const fxGbp = usdStable?.gbp && usdStable.usd ? usdStable.gbp / usdStable.usd : data.settings.usdToGbp;
  const assets = data.assets.map(asset => {
    const quote = asset.coingeckoId ? response[asset.coingeckoId] : undefined;
    if (!quote || quote.usd <= 0 || !Number.isFinite(quote.usd)) return asset;
    const ratio = quote.usd / (asset.marketPrice || asset.price || quote.usd);
    const marketLinked = asset.priceMode === 'market';
    return {
      ...asset,
      price: marketLinked ? asset.price * ratio : asset.price,
      marketPrice: quote.usd,
      change24h: quote.usd_24h_change ?? asset.change24h,
      marketCap: quote.usd_market_cap ?? asset.marketCap,
      priceSource: marketLinked ? provider : asset.priceSource,
      priceRetrievedAt: quote.last_updated_at ? new Date(quote.last_updated_at * 1000).toISOString() : retrievedAt,
    };
  });
  return { ...data, assets, settings: { ...data.settings, usdToEur: fxEur, usdToGbp: fxGbp } };
}

export function addPrediction(data: WalletData, prediction: Omit<Prediction, 'id' | 'accountId' | 'createdAt' | 'status'>): WalletData {
  const account = activeAccount(data);
  if (!Number.isFinite(prediction.stakeUsd) || prediction.stakeUsd <= 0 || prediction.stakeUsd > account.cashBalanceUsd) throw new Error('Stake must be positive and within available simulated cash.');
  const next = cashUpdate(data, account.cashBalanceUsd - prediction.stakeUsd);
  const cashTxs = next.transactions;
  const transactions = cashTxs.filter(transaction => transaction.id !== cashTxs[0]?.id);
  return {
    ...next,
    transactions: [{ id: createId('tx'), accountId: account.id, type: 'prediction', tokenSymbol: 'CASH', amount: prediction.stakeUsd, valueUsd: prediction.stakeUsd, counterparty: prediction.marketTitle, timestamp: new Date().toISOString(), status: 'completed' }, ...transactions],
    predictions: [{ ...prediction, id: createId('pick'), accountId: account.id, createdAt: new Date().toISOString(), status: 'open' }, ...data.predictions],
  };
}

export function createAccount(data: WalletData, name: string): WalletData {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Enter an account name.');
  if (data.accounts.some(account => account.name.toLowerCase() === cleanName.toLowerCase())) throw new Error('An account with that name already exists.');
  const id = createId('account');
  const account: WalletAccount = { id, name: cleanName, address: `orbit.sim.${createId().slice(-8).toUpperCase()}`, avatar: '👻', cashBalanceUsd: 0, balances: {}, assetOrder: [], hiddenAssets: [], watchlist: [] };
  return { ...data, accounts: [...data.accounts, account], activeAccountId: id };
}

export function buildMarketHistory(data: WalletData, tokenId: string, periodCount = 60): number[] {
  const asset = findToken(data, tokenId);
  if (!asset) return [];
  return seededHistory(asset.price, tokenId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0), periodCount);
}

export const SNAPSHOT_SOURCE = PRICE_SOURCE;
export const SNAPSHOT_AT = SNAPSHOT_RETRIEVED_AT;
