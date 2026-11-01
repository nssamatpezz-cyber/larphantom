import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DATA, activeAccount, applyMarketPrices, buyUpdate, calculateSwap, cashUpdate, createDefaultData, findToken, portfolioValueUsd, sendUpdate, stepPrices, swapUpdate, validateSend } from './logic';
import { fetchMarketPrices, loadData, normalizeWalletData, STORAGE_KEY, useStore } from './store';

describe('local wallet calculations', () => {
  it('validates simulated sends before changing balances', () => {
    const token = findToken(DEFAULT_DATA, 'ethereum');
    expect(validateSend(undefined, 3, 1, 'orbit.sim.recipient')).toMatch(/Choose an asset/);
    expect(validateSend(token, 3, 1, '  ')).toMatch(/recipient/);
    expect(validateSend(token, 3, 0, 'orbit.sim.recipient')).toMatch(/above zero/);
    expect(validateSend(token, 3, 4, 'orbit.sim.recipient')).toMatch(/exceeds/);
    expect(validateSend(token, 3, 1, 'orbit.sim.recipient')).toBeNull();
  });

  it('deducts a valid local send and records its account and value', () => {
    const data = createDefaultData();
    const next = sendUpdate(data, 'ethereum', 1, 'orbit.sim.recipient', 'demo memo');
    expect(activeAccount(next).balances.ethereum).toBeCloseTo(1.418);
    expect(next.transactions[0]).toMatchObject({ type: 'sent', tokenId: 'ethereum', amount: 1, memo: 'demo memo', accountId: data.activeAccountId });
    expect(next.transactions[0].valueUsd).toBeCloseTo(findToken(data, 'ethereum')!.price);
    expect(() => sendUpdate(data, 'ethereum', 99, 'orbit.sim.recipient')).toThrow(/exceeds/);
  });

  it('calculates a swap from the current prices and applies both balance changes', () => {
    const data = createDefaultData();
    const from = findToken(data, 'ethereum')!;
    const to = findToken(data, 'usd-coin')!;
    const expected = from.price / to.price * .995;
    expect(calculateSwap(from, to, 1)).toBeCloseTo(expected);
    const next = swapUpdate(data, from.id, to.id, 1);
    expect(activeAccount(next).balances.ethereum).toBeCloseTo(1.418);
    expect(activeAccount(next).balances['usd-coin']).toBeCloseTo(1250 + expected);
    expect(next.transactions[0]).toMatchObject({ type: 'swapped', tokenId: 'ethereum', outputTokenId: 'usd-coin', outputAmount: expected });
    expect(() => swapUpdate(data, from.id, from.id, 1)).toThrow();
  });

  it('keeps cash in the computed portfolio and records adjustments', () => {
    const data = createDefaultData();
    const startingTotal = portfolioValueUsd(data);
    const next = cashUpdate(data, 125.5);
    expect(portfolioValueUsd(next)).toBeCloseTo(startingTotal + 125.5);
    expect(activeAccount(next).cashBalanceUsd).toBe(125.5);
    expect(next.transactions[0]).toMatchObject({ type: 'cash-added', amount: 125.5, valueUsd: 125.5 });
    expect(cashUpdate(next, 12.25).transactions[0].type).toBe('cash-removed');
  });

  it('converts simulated cash into a local asset purchase and rejects invalid amounts', () => {
    const data = createDefaultData();
    const funded = cashUpdate(data, 250);
    const startingTotal = portfolioValueUsd(funded);
    const price = findToken(funded, 'ethereum')!.price;
    const next = buyUpdate(funded, 'ethereum', 100);
    expect(activeAccount(next).cashBalanceUsd).toBe(150);
    expect(activeAccount(next).balances.ethereum).toBeCloseTo(2.418 + 100 / price);
    expect(portfolioValueUsd(next)).toBeCloseTo(startingTotal);
    expect(next.transactions[0]).toMatchObject({ type: 'bought', tokenId: 'ethereum', valueUsd: 100, counterparty: 'Local cash-funded simulation' });
    expect(() => buyUpdate(funded, 'ethereum', 0)).toThrow(/valid purchase/);
    expect(() => buyUpdate(funded, 'ethereum', 251)).toThrow(/cash balance/);
    expect(() => buyUpdate(funded, 'missing', 10)).toThrow(/Choose an asset/);
  });

  it('simulates each market asset from its preceding price with independent volatility', () => {
    const data = createDefaultData();
    const btc = findToken(data, 'bitcoin')!;
    const eth = findToken(data, 'ethereum')!;
    const custom = { ...btc, id: 'custom-one', priceMode: 'custom' as const, price: 17 };
    const moved = stepPrices([{ ...btc, price: 100 }, { ...eth, price: 100 }, custom], () => 1);
    expect(moved[0].price).toBeCloseTo(100 * (1 + btc.volatility));
    expect(moved[1].price).toBeCloseTo(100 * (1 + eth.volatility));
    expect(moved[0].price).not.toBe(moved[1].price);
    expect(moved[2].price).toBe(17);
    const second = stepPrices(moved.slice(0, 1), () => 1)[0];
    expect(second.price).toBeCloseTo(moved[0].price * (1 + btc.volatility));
  });

  it('reconciles new market quotes against the last market baseline without discarding local drift', () => {
    const data = createDefaultData();
    const btc = findToken(data, 'bitcoin')!;
    const drifted = { ...data, assets: data.assets.map(asset => asset.id === btc.id ? { ...asset, price: asset.marketPrice * 1.03 } : asset) };
    const updated = applyMarketPrices(drifted, { bitcoin: { usd: btc.marketPrice * 1.1, usd_24h_change: 2.5, usd_market_cap: 100, last_updated_at: 1_798_000_000 } }, '2026-10-31T20:00:00.000Z');
    expect(findToken(updated, btc.id)!.price).toBeCloseTo(btc.marketPrice * 1.03 * 1.1);
    expect(findToken(updated, btc.id)!.marketPrice).toBeCloseTo(btc.marketPrice * 1.1);
    expect(findToken(updated, btc.id)!.change24h).toBe(2.5);
  });

  it('falls back to CoinPaprika and matches full asset IDs instead of ambiguous tickers', async () => {
    const data = createDefaultData();
    const paprikaRows = data.assets.map(asset => ({
      id: asset.coinPaprikaId,
      name: asset.name,
      symbol: asset.symbol,
      last_updated: '2026-10-31T18:33:29Z',
      quotes: {
        USD: { price: asset.marketPrice, percent_change_24h: asset.change24h, market_cap: asset.marketCap },
        EUR: { price: asset.marketPrice * .89 },
        GBP: { price: asset.marketPrice * .74 },
      },
    }));
    paprikaRows.unshift({ id: 'sol-binance-peg-sol', name: 'Wrapped Solana', symbol: 'SOL', last_updated: '2026-10-31T18:33:29Z', quotes: { USD: { price: 999 }, EUR: { price: 999 }, GBP: { price: 999 } } } as typeof paprikaRows[number]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('coingecko')) return { ok: false, status: 429, json: async () => ({}) } as Response;
      return { ok: true, status: 200, json: async () => paprikaRows } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await fetchMarketPrices(data.assets);
      expect(result.provider).toBe('CoinPaprika');
      expect(result.response.solana.usd).toBe(findToken(data, 'solana')!.marketPrice);
      expect(result.response.solana.usd).not.toBe(999);
      expect(Object.keys(result.response)).toHaveLength(data.assets.length);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps the shared one-hour market and portfolio histories rolling with simulated prices', () => {
    const data = createDefaultData();
    useStore.setState({ data, marketStatus: { ready: true, source: 'snapshot', provider: 'CoinPaprika', message: '', updatedAt: null } });
    for (let index = 0; index < 60; index++) useStore.getState().tick();
    const after = useStore.getState().data;
    const bitcoin = findToken(after, 'bitcoin')!;
    expect(after.marketHistory.bitcoin).toHaveLength(60);
    expect(after.marketHistory.bitcoin[after.marketHistory.bitcoin.length - 1]).toBe(bitcoin.price);
    expect(after.portfolioHistory).toHaveLength(60);
    expect(after.portfolioHistory[after.portfolioHistory.length - 1]).toBeCloseTo(portfolioValueUsd(after));
  });
});

describe('wallet persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState({ data: createDefaultData(), error: '' });
  });

  it('persists account balances and settings to localStorage and restores them', () => {
    useStore.getState().update(data => ({
      ...data,
      settings: { ...data.settings, currency: 'EUR' },
      accounts: data.accounts.map(account => ({ ...account, cashBalanceUsd: 77.25 })),
    }));
    const restored = loadData();
    expect(restored.settings.currency).toBe('EUR');
    expect(activeAccount(restored).cashBalanceUsd).toBe(77.25);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).version).toBe(2);
  });

  it('accepts another window’s saved wallet without echoing it or discarding price drift', () => {
    const incoming = cashUpdate(createDefaultData(), 222.75);
    const bitcoin = findToken(incoming, 'bitcoin')!;
    bitcoin.price = bitcoin.marketPrice * 1.03;
    incoming.marketHistory.bitcoin[incoming.marketHistory.bitcoin.length - 1] = bitcoin.price;
    incoming.settings.currency = 'EUR';
    useStore.setState({ acknowledged: true });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    try {
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: JSON.stringify(incoming), storageArea: localStorage }));
      const synced = useStore.getState().data;
      expect(activeAccount(synced).cashBalanceUsd).toBe(222.75);
      expect(synced.settings.currency).toBe('EUR');
      expect(synced.transactions[0].id).toBe(incoming.transactions[0].id);
      expect(findToken(synced, 'bitcoin')!.price).toBe(bitcoin.price);
      expect(synced.marketHistory.bitcoin[synced.marketHistory.bitcoin.length - 1]).toBe(bitcoin.price);
      expect(useStore.getState().acknowledged).toBe(true);
      expect(setItem).not.toHaveBeenCalled();
    } finally { setItem.mockRestore(); }
  });

  it('ignores malformed, removed and unrelated external storage without resetting wallet data', () => {
    const original = cashUpdate(createDefaultData(), 51.5);
    useStore.setState({ data: original });
    for (const newValue of ['{', '{}', JSON.stringify({ version: 2, accounts: [], assets: [] }), null]) {
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue, storageArea: localStorage }));
      expect(useStore.getState().data).toBe(original);
    }
    const foreign = JSON.stringify(cashUpdate(createDefaultData(), 999));
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: foreign, storageArea: sessionStorage }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', newValue: foreign, storageArea: localStorage }));
    expect(useStore.getState().data).toBe(original);
  });

  it('synchronizes first-launch acknowledgement separately without writing another snapshot', () => {
    const original = useStore.getState().data;
    useStore.setState({ acknowledged: false });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    try {
      window.dispatchEvent(new StorageEvent('storage', { key: `${STORAGE_KEY}-ack`, newValue: 'yes', storageArea: localStorage }));
      expect(useStore.getState().acknowledged).toBe(true);
      window.dispatchEvent(new StorageEvent('storage', { key: `${STORAGE_KEY}-ack`, newValue: null, storageArea: localStorage }));
      expect(useStore.getState().acknowledged).toBe(false);
      expect(useStore.getState().data).toBe(original);
      expect(setItem).not.toHaveBeenCalled();
    } finally { setItem.mockRestore(); }
  });

  it('normalizes an exported configuration and rejects malformed imports', () => {
    const normalized = normalizeWalletData(createDefaultData());
    expect(normalized.accounts).toHaveLength(1);
    expect(normalized.assets.length).toBeGreaterThan(1);
    expect(() => normalizeWalletData(null)).toThrow(/Invalid/);
  });

  it('fills new market-provider IDs while normalizing an earlier version-2 export', () => {
    const oldData = createDefaultData();
    const oldExport = { ...oldData, assets: oldData.assets.map(({ coinPaprikaId: _unused, ...asset }) => asset) };
    expect(normalizeWalletData(oldExport).assets.every(asset => asset.coinPaprikaId)).toBe(true);
  });

  it('upgrades supported-asset logo paths while preserving user balances and custom icon overrides', () => {
    const saved = createDefaultData();
    const legacySaved = {
      ...saved,
      assets: saved.assets.map(asset => asset.id === 'hyperliquid' ? { ...asset, icon: 'H', iconOverride: 'H' } : asset.id === 'bitcoin' ? { ...asset, icon: '⭐' } : asset),
      accounts: saved.accounts.map(account => ({ ...account, balances: { ...account.balances, hyperliquid: 8.75 } })),
    };
    const restored = normalizeWalletData(legacySaved);
    expect(findToken(restored, 'hyperliquid')).toMatchObject({ icon: '/tokens/hype.png', iconOverride: undefined });
    expect(findToken(restored, 'bitcoin')).toMatchObject({ icon: '/tokens/btc.svg', iconOverride: '⭐' });
    expect(activeAccount(restored).balances.hyperliquid).toBe(8.75);
    expect(restored.assets.every(asset => asset.icon.startsWith('/tokens/'))).toBe(true);
  });

  it('migrates the previous single-profile local format', () => {
    const legacy = {
      profile: { name: 'Saved Orbit', address: 'orbit.sim.saved' },
      tokens: [{ id: 'ethereum', name: 'Ethereum', symbol: 'ETH', balance: 3, price: 2000 }],
      settings: { currency: 'EUR', watermark: true },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    const restored = loadData();
    expect(activeAccount(restored).name).toBe('Saved Orbit');
    expect(activeAccount(restored).balances.ethereum).toBe(3);
    expect(restored.settings.currency).toBe('EUR');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).version).toBe(2);
  });
});
