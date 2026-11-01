export type Currency = 'USD' | 'EUR' | 'GBP';
export type Theme = 'dark' | 'light' | 'system';
export type TxType = 'sent' | 'received' | 'bought' | 'swapped' | 'cash-added' | 'cash-removed' | 'prediction';
export type TxStatus = 'completed' | 'pending' | 'failed';
export type ChartPeriod = 'LIVE' | '1H' | '1D' | '24H' | '1W' | '1M' | '1Y' | 'ALL';
export type Chain = 'Solana' | 'Ethereum' | 'Bitcoin' | 'Hyperliquid' | 'Base' | 'BNB Chain' | 'XRP Ledger' | 'Cardano' | 'Dogecoin' | 'Avalanche' | 'Polkadot' | 'Litecoin' | 'Sui' | 'TON' | 'Tron' | 'Other';

export type Token = {
  id: string;
  symbol: string;
  name: string;
  chain: Chain;
  icon: string;
  /** Optional user-selected emoji/mark; blank uses the local token logo in the catalog. */
  iconOverride?: string;
  price: number;
  marketPrice: number;
  change24h: number;
  marketCap?: number;
  coingeckoId?: string;
  coinPaprikaId?: string;
  priceSource: 'CoinGecko' | 'CoinPaprika' | 'custom';
  priceRetrievedAt: string;
  volatility: number;
  priceMode: 'market' | 'custom';
  isCustom?: boolean;
};

export type WalletAccount = {
  id: string;
  name: string;
  address: string;
  avatar: string;
  avatarImage?: string;
  cashBalanceUsd: number;
  balances: Record<string, number>;
  assetOrder: string[];
  hiddenAssets: string[];
  watchlist: string[];
};

export type Transaction = {
  id: string;
  accountId: string;
  type: TxType;
  tokenId?: string;
  tokenSymbol: string;
  amount: number;
  valueUsd: number;
  counterparty: string;
  timestamp: string;
  status: TxStatus;
  memo?: string;
  outputTokenId?: string;
  outputTokenSymbol?: string;
  outputAmount?: number;
};

export type Prediction = {
  id: string;
  accountId: string;
  marketId: string;
  marketTitle: string;
  choice: 'up' | 'down';
  stakeUsd: number;
  createdAt: string;
  status: 'open' | 'settled';
  outcome?: 'win' | 'loss';
};

export type Settings = {
  theme: Theme;
  accent: string;
  currency: Currency;
  decimals: 2 | 4 | 6;
  watermark: boolean;
  showDisclaimer: boolean;
  showPrices: boolean;
  sortBy: 'value' | 'name' | 'change';
  chartPeriod: ChartPeriod;
  usdToEur: number;
  usdToGbp: number;
};

export type PricePoint = { time: number; price: number };
export type WalletData = {
  version: 2;
  assets: Token[];
  accounts: WalletAccount[];
  activeAccountId: string;
  transactions: Transaction[];
  predictions: Prediction[];
  settings: Settings;
  marketHistory: Record<string, number[]>;
  portfolioHistory: number[];
};

export type MarketPrice = {
  usd: number;
  eur?: number;
  gbp?: number;
  usd_24h_change?: number;
  usd_market_cap?: number;
  last_updated_at?: number;
};
export type MarketResponse = Record<string, MarketPrice>;

export const INITIAL_DISCLAIMER_KEY = 'orbit-vault-sim-v1-ack';
