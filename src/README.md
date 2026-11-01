# Orbit Vault Simulator

Orbit Vault is a mobile-first crypto-wallet interface simulator for content creation, prototyping, learning, and entertainment. It uses original Orbit Vault branding and independently implemented UI.

## Safety and data

- All accounts, balances, cash adjustments, swaps, receipts, and activity are fictional and stored locally in this browser.
- The app does not connect to a blockchain, RPC endpoint, exchange, wallet provider, or payment service. It never creates or handles seed phrases, private keys, or signatures.
- CoinGecko is queried read-only for public market-price snapshots, with CoinPaprika as a fallback. If both providers are unavailable or rate-limited, Orbit Vault reports that and uses the latest saved snapshot. After a snapshot loads, the one-second price movement is a local simulation based on the preceding simulated price; it is not a live quote or market prediction.
- A first-launch notice must be acknowledged before the simulator opens. About contains the accessible “Simulator — No Real Funds” disclosure, and transaction confirmations explicitly describe local simulation. The screenshot watermark is optional.
- Never use Orbit Vault to mislead someone, impersonate a wallet or person, or present simulated balances or activity as proof of funds or real transactions.

## Run locally

Install dependencies and start Vite:

```bash
npm install
npm run dev
```

The terminal prints the local URL. Open it in a mobile browser or use the browser’s device preview.

## Build and test

```bash
npm run build
npm test
```

The production site is written to `dist/`.

## Deploy

- **Vercel:** import the repository, use `npm run build`, and set the output directory to `dist`.
- **Netlify:** connect the repository, use build command `npm run build`, and publish directory `dist`.
- **Cloudflare Pages:** keep the existing GitHub-connected Pages project, use `npm run build`, and set the build output directory to `dist`. This is a static Vite application; no Worker or backend is required.
- No backend, environment variable, or market-data API key is required. Public endpoints can rate-limit or refuse browser requests; the app explains when it falls back to a saved snapshot. CoinGecko is tried first; CoinPaprika is the fallback provider.

## Install on a phone

- **iPhone / iPad:** open the deployed page in Safari, tap **Share**, then **Add to Home Screen**. Launch Orbit Vault from the new home-screen icon.
- **Android:** open the page in Chrome, open the browser menu, and tap **Install app** or **Add to Home screen**.

The PWA manifest, standalone display mode, local app icons, and service worker provide install metadata and an offline app shell. Read-only market quotes require connectivity; local wallet simulation remains available from saved data when offline.

The layout reads the actual viewport and all four safe-area insets. It uses dynamic viewport height in Safari and standalone mode, and keeps sheet controls within the visual viewport when the keyboard changes its size. No device resolution or Dynamic Island dimensions are hardcoded. The single generated manifest is `/manifest.webmanifest`; local PNG and SVG install icons are included.

Launch and page backgrounds are black in the default dark theme. The deprecated translucent Apple status-bar override is omitted, following [WebKit guidance](https://bugs.webkit.org/show_bug.cgi?id=317153#c2), so iOS can match the status region to the page. The application does not draw or hide system bars. Some iOS versions retain system-owned inset behavior; desktop WebKit tests cannot certify the appearance of an installed iPhone PWA.

## Features

- Home, Trade, Predict, and Explore primary tabs with a mobile account drawer; Activity, Watchlist, and Collectibles surfaces.
- Multi-account local profiles with independent cash and token quantities, editable name/address/avatar, and account switching/deletion.
- Cash adjustment, local send/review/confirmation, local receipt with an address QR, and local asset swaps with a 0.5% simulated spread.
- Search across the included 20-asset market catalog, with Featured, Top gainers and Market cap discovery lists and Watchlist/In wallet filters. Search shows unit quotes even for unowned assets. Add/remove assets per account, edit quantities and metadata, manage custom local assets, hide and sort assets, and inspect token details/history.
- Portfolio charts with 1H, 24H, 1W, 1M, 1Y, and ALL views; token details use LIVE, 1D, 1W, 1M, 1Y, and ALL. The rolling LIVE series follows the shared local market simulation.
- Activity details, locally saved practice picks, appearance/currency/precision preferences, optional watermark, JSON import/export, and reset controls.
- LocalStorage persistence with migration from the previous single-profile format, same-origin tab synchronization, an installation guide, and an About disclosure.

## Market snapshot provenance

The centralized starter prices in `src/catalog.ts` were retrieved from CoinPaprika’s public `/v1/tickers?quotes=USD,EUR,GBP` endpoint and matched by CoinPaprika ID, not by ticker alone. The successful response was timestamped **2026-10-31 18:33:29 UTC**. It included USD prices, 24-hour change, market capitalization, and EUR/GBP values. Each record keeps both provider identifiers, source, quote timestamp, and volatility profile. This dated snapshot is the fallback; runtime quotes are refreshed on launch and every 60 seconds when a public endpoint is reachable. See the [CoinPaprika ticker API documentation](https://docs.coinpaprika.com/) and [CoinGecko Simple Price API documentation](https://docs.coingecko.com/reference/simple-price).

## Token icons

Supported assets use centralized, locally bundled logos from `public/tokens/`, so they appear consistently in wallet rows, search, details, transaction history, and account asset lists without runtime image requests. Eighteen branded SVGs come from [`@web3icons/core`](https://github.com/0xa3k5/web3icons) 4.0.55 under its MIT license; Hyperliquid (HYPE) and Toncoin (TON) marks are from CoinPaprika's logo resources. The attribution and license are in `public/tokens/ASSET-SOURCES.md` and `public/tokens/WEB3ICONS-LICENCE.txt`. User-selected icon overrides are preserved; leaving an override blank keeps the catalog logo. Custom assets without logos retain their user-entered mark and use the asset symbol if no mark is set.
