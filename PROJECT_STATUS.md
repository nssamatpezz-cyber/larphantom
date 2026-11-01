# Project status — Orbit Vault Simulator

## Delivery status

The mobile simulator rebuild is implemented. The project keeps Orbit Vault branding and reconstructs the observable patterns in the supplied iPhone screenshots independently: Home / Trade / Predict / Explore top tabs, an avatar-led account drawer, large portfolio hero, circular actions, token rows, token detail, and settings groups. No MyLarpWallet or Phantom source code or logos are included.

## UI polish pass — 2026-11-01

- Removed the market-provider/status caption and its fallback error line from the wallet home, including the spacing they added under the portfolio change. The read-only quote refresh and one-second local price simulation still use the same Zustand store and intervals.
- The left header account button now uses an original platform ghost emoji treatment. Existing accounts stored with the old Orbit glyph render with the new avatar without rewriting profile, address, balances, or history; users can still choose another emoji or upload an image.
- All 20 supported catalog assets now have locally bundled, centralized logos. Eighteen branded SVGs use Web3icons Core 4.0.55, with local HYPE and TON images from CoinPaprika. `TokenIcon` is shared across asset rows and supporting screens, uses contain sizing, and falls back gracefully if an image is unavailable. Existing custom icon marks migrate to the optional override field.
- Mobile viewport handling uses stable `svh` sizing in Safari, dynamic sizing for standalone PWA mode, safe-area padding, landscape height adjustments, 16px form controls to avoid Safari's focus zoom, and touch-friendly non-selectable button behavior. Viewport zoom remains enabled.
- Reference check: the public MyLarpWallet demo shows the avatar-led drawer, balance-first home, asset list and token-detail chart interactions. The linked GitHub repository explicitly says it publishes a built IPA without application source, so the comparison is based on observable browser references; no source or protected assets were copied.

## Current reference audit

The public MyLarpWallet demo exposes a mobile shell with Home / Trade / Predict, a left account drawer, a balance-first home, Send / Deposit actions, a cash row, token rows, a fixed Search / Add dock, and token details with a green LIVE chart and time selectors. The linked GitHub “Phantom-Wallet-Clone” repository says it distributes a built IPA and does not include its iOS source; the public MyLarpWallet browser demo is the observable comparison source. Orbit keeps its additional simulator surfaces and original branding.

## Attached iPhone screenshot reconstruction — 2026-11-01

- Reworked the mobile shell around the seven supplied screenshots: horizontally scrollable Home / Trade / Predict / Explore pills, the account drawer, balance-first Home, the full-screen quick-action overlay, token detail, market discovery, and fictional prediction cards. Kept the existing Orbit Vault name and artwork; no Phantom or MyLarpWallet logos or source were added.
- Matched the screenshot palette, system font stack, large balance hierarchy, dark asset rows, lavender actions, market cards, ranking list, and floating Search / plus dock. Explore now has dedicated Tokens / Sites / Learn shortcuts and locally written simulator notes. It does not claim to display live news or connect to websites.
- Added safe-area spacing for the status and home-indicator regions using platform environment insets. No fake iOS status or home-indicator bars are rendered. The standalone PWA receives the same top and bottom inset treatment.
- Rebuilt Token detail with the chart, period controls, receive action, fictional-asset notice, position, and fixed Buy bar. Corrected chart container sizing so the graph no longer overlaps the period selector or action buttons.
- Rebuilt quick actions as a blurred full-screen overlay and fixed its exit timer so choosing Send, Receive, Add Cash, or Trade completes the close and opens the correct local flow. Backdrop dismissal is isolated from the content beneath it.
- Added the Explore tab without changing market initialization, price movement, account balances, transactions, local persistence, or the account’s saved profile.

### Verification for the screenshot pass

- `npm run build` (TypeScript and production Vite/PWA build): passed.
- `npm test`: passed, 14 tests.
- Browser-emulated widths 375, 390, 393, 402, and 430 CSS px: all four main tabs and Token detail stayed within the viewport; no horizontal overflow. Token detail charts resized with the viewport.
- Captured and reviewed Home, Trade, Token detail, quick actions, Predict, Explore, and the account drawer against the supplied iPhone references. Safe-area styles were reviewed in code; no physical iPhone or installed PWA was available for this pass.
- Opened Send from quick actions and verified its local simulation disclosure. Closed it without confirming or changing balances. No account, asset, settings, or transaction data was reset or edited during visual QA.

## Implemented

- **Wallet:** hideable portfolio balance, 24-hour move, chart periods, cash row, asset list, recent activity, asset search, sort preferences, and a quick-action dock.
- **Accounts:** create, rename, switch, delete with confirmation, edit fictional address, emoji avatar, and upload a locally compressed profile image. Cash and token balances stay isolated by account.
- **Cash and assets:** add/remove/set fictional cash; add supported assets or custom local assets; edit quantity, display name, ticker, chain, icon mark, and custom price; hide or remove an asset from an account.
- **Token detail:** current simulated price, holding value, market metadata, source/update time, LIVE / 1D / 1W / 1M / 1Y / ALL chart selectors, actions, and correctly filtered local activity.
- **Local flows:** validated send with review and confirmation, receive QR generated from the fictional address, optional local receipt record, and a local swap with a visible 0.5% spread and review.
- **Activity:** grouped transaction history, All / Sent / Received / Swapped / Cash filters, and per-transaction detail sheets.
- **Other reference surfaces:** a searchable 20-asset Watchlist, decorative fictional collectibles, and free local practice picks in Predict. There are no wagers or payouts.
- **Settings:** appearance/accent/currency/precision, price visibility, watermark, confirmation disclosure toggle, chart range, accounts, assets, PWA install instructions, local JSON import/export, reset, and About.
- **Persistence:** accounts, balances, custom assets, settings, prices, histories, picks, and activity are saved in localStorage. Earlier single-profile data and version-2 exports gain the new CoinPaprika IDs when normalized.
- **PWA:** standalone manifest, service worker for the offline app shell, SVG install icons, and a custom iOS home-screen icon.
- **Accessibility/motion:** visible keyboard focus, 44px-class controls, readable settings copy, Escape/outside-dismiss sheets, reduced-motion rules, fixed-height chart loading fallback, and chart code-splitting.
- **Motion polish:** sheets and the account drawer now animate on close as well as open; Escape, backdrop taps, close buttons, and swipe dismissal use the same exit path. The exit wait follows `prefers-reduced-motion`.

## Market data and simulation

- Startup prices for all 20 catalog assets were retrieved from CoinPaprika’s public ticker endpoint on **2026-10-31 18:33:29 UTC** and matched by provider asset ID. Source, ID, quote time, 24-hour change, market cap, and volatility are centralized in `src/catalog.ts`.
- At runtime, the app requests CoinGecko first and CoinPaprika if CoinGecko fails or omits a tracked asset. The public requests are read-only and need no backend or API key. Browser QA confirmed a successful CoinGecko refresh at 19:40 local time, with the UI labeling the provider and time.
- If neither provider responds, the app explains that it is using the dated saved snapshot; it does not claim that the snapshot is live.
- After a quote loads, each market-linked token advances once per second from its immediately previous simulated value using its own volatility. Stablecoins have very low volatility. Portfolio values, token detail charts, and token rows share the same Zustand state. The LIVE chart follows the shared market history; it retains a rolling 60-point, one-hour series. Local movements are not real market data.
- Periods longer than the rolling live window use deterministic, distinct demo curves rather than historical candles from an exchange.

## Verification

- TypeScript project build: passed.
- Vitest: **14 tests passed**, including send validation, balance changes, swap math, per-token continuity, provider ID matching/fallback, rolling chart history, format migration, localStorage restore, and catalog-logo migration without losing balances or emoji overrides.
- Production PWA build: passed. The chart library is split into a separate chunk; the previous single-chunk size warning is gone.
- Visual checks captured the public demo and Orbit home at mobile size, plus the Orbit account drawer, token detail after the chart loaded, Settings/banner, and Add assets. All 20 token logos loaded from local files in the add-asset catalog; no image fallbacks or broken logo requests appeared.
- Responsive viewport checks at **320, 375, 390, 393, 402, and 430px** showed matching document/shell widths and no horizontal overflow. A short landscape viewport (844×390) also filled the screen without overflow.
- In the earlier screenshot pass the Settings safety banner was still present; it was removed in the final cleanup below. The provider status caption was absent from wallet home. Browser visual checks did not change balances, token selections, or account details.

## Known limitations

- This is a browser simulator, not a real wallet. It has no network account, live DApp browser, trade execution, blockchain, real NFT metadata, or transaction broadcast.
- Only 20 market assets are provider-linked. Custom assets use user-entered local prices. Provider uptime and browser access can vary; fallback behavior is visible.
- Non-live charts are synthetic visual history. The app displays provider quote timestamps so these curves are not confused with exchange candles.
- Reference inspection used the public MyLarpWallet browser demo (a marketing page containing a constrained wallet mockup), not a source-available native iOS build. Screens were visually compared in the browser, but an actual iPhone/Safari or installed PWA device was not available.
- The width matrix is an emulated browser-viewport check, not a physical-device test. Standalone PWA safe-area rules are in place and the production PWA builds, but installation was not exercised on a phone.

## Final interface cleanup and motion pass — 2026-11-01

- Removed the token-detail warning panel and the balance/holding line that ended in “simulated”; the detail page now flows directly from the chart and Receive action to the position row.
- Removed the sticky Settings safety banner and the repeated simulator notes from non-confirmation screens. The single concise “Simulator — No Real Funds” disclosure is available in About. The screenshot watermark remains configurable and now uses only the Orbit Vault name.
- Kept explicit simulated/local wording on Send, Swap, and purchase confirmations and transaction detail. The Settings disclosure toggle now controls confirmation notes only.
- Cleaned saved transaction counterparty labels for display without modifying persisted transaction data. New prices, balances, accounts, and history were not reset.
- Tuned tab and press feedback to use subtle transform/opacity motion, added a global reduced-motion fallback, and enabled short Recharts path interpolation for rolling charts.
- Mobile visual check at the open 390 × 844 app viewport: Solana detail chart rendered; removed notice and holding line were absent; drawer, Settings/About, quick-action open/close, and Send steps through Review were exercised. Send Review was dismissed without confirmation, so no balances or history were changed.
- Final `npm run build` (TypeScript + Vite production/PWA build): passed. Final `npm test`: **14 tests passed**.

## Secondary-flow polish — 2026-11-01

- Added a shared subflow visual layer in `src/styles-flows.css`: larger amount fields, clear focus rings, touch-sized controls, restrained spring-like transitions, sheet scroll padding, and consistent settings/account/transaction surfaces. Existing state and store logic remain the source of truth.
- Add Cash now shows the current balance, amount shortcuts, live next-balance preview, currency-aware input, and a direct update action. Validation and existing local persistence are unchanged.
- Send has animated step content, a token summary and large amount-entry panel, accessible recipient validation, a clearer review, and the existing explicit local-only confirmation. The browser pass progressed to Review and closed without confirming.
- Receive now encodes and displays an `orbit-demo:` address, which is intentionally not a routable chain address. Added local copy and device Share Sheet controls; no external share was initiated during QA.
- Swap asset selection now uses branded token rows and a local accessible picker instead of the browser-native select menu. The displayed quote now uses the same 0.50% spread calculation as the preview and `swapUpdate`. Swap Review was inspected and dismissed without confirming.
- Account deletion confirmation, account profile controls, add/edit token forms, settings, and activity details use the same spacing, input, focus, and touch-target system. Edited token prices open with sensible decimal precision instead of exposing float noise.
- Modal focus now prefers the requested autofocus field, traps keyboard focus inside the sheet, and returns focus to the prior control when dismissed.

### Verification for secondary flows

- `npm run build`: passed (TypeScript, Vite and PWA service-worker generation).
- `npm test`: passed, **14 tests**.
- In-app mobile browser preview at 399 CSS px wide: opened and inspected Add Cash and live balance preview; Send through Review; Receive QR/copy/share controls; Swap picker and Review; account deletion confirmation (canceled); Settings; asset edit and custom-add views; and a stored transaction detail. No cash, token, account, send, receive, or swap changes were confirmed. The application’s ongoing local price simulation continued as usual.
- The preview reported matching viewport, document and body widths (399 px; no horizontal overflow). This was browser-emulated QA, not a physical iPhone Safari session or an installed standalone PWA session. PWA build and manifest generation passed; actual device installation remains unverified.
