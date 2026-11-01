import type { Chain, Token } from './types';

export const PRICE_SOURCE = 'CoinPaprika API /v1/tickers';
export const SNAPSHOT_RETRIEVED_AT = '2026-10-31T18:33:29Z';

type AssetSeed = {
  id: string;
  coinPaprikaId: string;
  symbol: string;
  name: string;
  chain: Chain;
  price: number;
  change24h: number;
  marketCap: number;
  volatility: number;
  icon: string;
};

const assetSeeds: AssetSeed[] = [
  { id: 'solana', coinPaprikaId: 'sol-solana', symbol: 'SOL', name: 'Solana', chain: 'Solana', price: 96.07259738721146, change24h: 1.99, marketCap: 56691963774, volatility: .00032, icon: '/tokens/sol.svg' },
  { id: 'ethereum', coinPaprikaId: 'eth-ethereum', symbol: 'ETH', name: 'Ethereum', chain: 'Ethereum', price: 2254.8452010575534, change24h: 1.37, marketCap: 275490765547, volatility: .00018, icon: '/tokens/eth.svg' },
  { id: 'bitcoin', coinPaprikaId: 'btc-bitcoin', symbol: 'BTC', name: 'Bitcoin', chain: 'Bitcoin', price: 77601.89770897415, change24h: 1.68, marketCap: 1560284087033, volatility: .00012, icon: '/tokens/btc.svg' },
  { id: 'hyperliquid', coinPaprikaId: 'hype-hyperliquid', symbol: 'HYPE', name: 'Hyperliquid', chain: 'Hyperliquid', price: 87.84093877431609, change24h: -2.4, marketCap: 21029719290, volatility: .00042, icon: '/tokens/hype.png' },
  { id: 'usd-coin', coinPaprikaId: 'usdc-usd-coin', symbol: 'USDC', name: 'USD Coin', chain: 'Base', price: .9999453799470203, change24h: .01, marketCap: 71711868708, volatility: .000005, icon: '/tokens/usdc.svg' },
  { id: 'tether', coinPaprikaId: 'usdt-tether', symbol: 'USDT', name: 'Tether', chain: 'Ethereum', price: .9987188474900724, change24h: .04, marketCap: 179892673181, volatility: .000005, icon: '/tokens/usdt.svg' },
  { id: 'binancecoin', coinPaprikaId: 'bnb-binance-coin', symbol: 'BNB', name: 'BNB', chain: 'BNB Chain', price: 706.1069588209542, change24h: 1.49, marketCap: 92861089990, volatility: .00017, icon: '/tokens/bnb.svg' },
  { id: 'ripple', coinPaprikaId: 'xrp-xrp', symbol: 'XRP', name: 'XRP', chain: 'XRP Ledger', price: 1.2536455463888283, change24h: 1.14, marketCap: 79419946796, volatility: .00024, icon: '/tokens/xrp.svg' },
  { id: 'cardano', coinPaprikaId: 'ada-cardano', symbol: 'ADA', name: 'Cardano', chain: 'Cardano', price: .1937004754965862, change24h: 1.3, marketCap: 7546720111, volatility: .00025, icon: '/tokens/ada.svg' },
  { id: 'dogecoin', coinPaprikaId: 'doge-dogecoin', symbol: 'DOGE', name: 'Dogecoin', chain: 'Dogecoin', price: .0759186485071464, change24h: 1.69, marketCap: 13015169164, volatility: .0003, icon: '/tokens/doge.svg' },
  { id: 'avalanche-2', coinPaprikaId: 'avax-avalanche', symbol: 'AVAX', name: 'Avalanche', chain: 'Avalanche', price: 8.573040103535572, change24h: 2.39, marketCap: 3620182953, volatility: .00033, icon: '/tokens/avax.svg' },
  { id: 'chainlink', coinPaprikaId: 'link-chainlink', symbol: 'LINK', name: 'Chainlink', chain: 'Ethereum', price: 11.696270958451557, change24h: 5.24, marketCap: 8969285033, volatility: .00028, icon: '/tokens/link.svg' },
  { id: 'polkadot', coinPaprikaId: 'dot-polkadot', symbol: 'DOT', name: 'Polkadot', chain: 'Polkadot', price: .9534170531073819, change24h: -.45, marketCap: 1630307594, volatility: .00032, icon: '/tokens/dot.svg' },
  { id: 'litecoin', coinPaprikaId: 'ltc-litecoin', symbol: 'LTC', name: 'Litecoin', chain: 'Litecoin', price: 55.87043008937704, change24h: 1.66, marketCap: 4221485165, volatility: .0002, icon: '/tokens/ltc.svg' },
  { id: 'sui', coinPaprikaId: 'sui-sui', symbol: 'SUI', name: 'Sui', chain: 'Sui', price: .9007879056475032, change24h: 2.29, marketCap: 3709688211, volatility: .00038, icon: '/tokens/sui.svg' },
  { id: 'the-open-network', coinPaprikaId: 'ton-tontoken', symbol: 'TON', name: 'Toncoin', chain: 'TON', price: 1.2166219346095482, change24h: 5.25, marketCap: 328487922, volatility: .00031, icon: '/tokens/ton.png' },
  { id: 'tron', coinPaprikaId: 'trx-tron', symbol: 'TRX', name: 'TRON', chain: 'Tron', price: .3079014181444007, change24h: -7.08, marketCap: 29257371517, volatility: .00017, icon: '/tokens/trx.svg' },
  { id: 'aave', coinPaprikaId: 'aave-new', symbol: 'AAVE', name: 'Aave', chain: 'Ethereum', price: 134.50636738789228, change24h: 6.57, marketCap: 2073607055, volatility: .0004, icon: '/tokens/aave.svg' },
  { id: 'shiba-inu', coinPaprikaId: 'shib-shiba-inu', symbol: 'SHIB', name: 'Shiba Inu', chain: 'Ethereum', price: .0000046796991410741, change24h: -.5, marketCap: 2757457768, volatility: .00037, icon: '/tokens/shib.svg' },
  { id: 'pepe', coinPaprikaId: 'pepe-pepe', symbol: 'PEPE', name: 'Pepe', chain: 'Ethereum', price: .000005037593242993968, change24h: 1.14, marketCap: 2119265101, volatility: .00045, icon: '/tokens/pepe.svg' },
];

export const SUPPORTED_ASSETS: Token[] = assetSeeds.map(asset => ({
  ...asset,
  marketPrice: asset.price,
  coingeckoId: asset.id,
  priceSource: 'CoinPaprika',
  priceRetrievedAt: SNAPSHOT_RETRIEVED_AT,
  priceMode: 'market',
}));

export const ICON_LICENSE = 'Web3icons core branded icons (MIT); HYPE and TON image marks from CoinPaprika. Cryptocurrency marks remain the property of their respective projects.';
