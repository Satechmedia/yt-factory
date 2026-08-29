# rh-watch

Standalone **TypeScript CLI** for Robinhood Chain (education / research).

You drop a contract address. It runs a fail-closed kill list and prints **PASS** or **KILL** plus reasons. The watcher polls new tokens/pairs on chain 4663 and runs the same analyzer.

**Not a buy signal. Can go to zero.** This tool never prints buy or sell advice. It does not trade, does not connect a wallet, and has no web app or Telegram bot. There is **no official Robinhood Chain memecoin**. Gas is **ETH**.

This package is **not** part of the YouTube factory pipeline in the repo root.

## Chain

| | |
| --- | --- |
| Chain | Robinhood Chain |
| Chain ID | `4663` (`eth_chainId` = `0x1237`) |
| RPC | `https://rpc.mainnet.chain.robinhood.com` (override with `RH_RPC_URL`) |
| Explorer | https://robinhoodchain.blockscout.com (Blockscout) |
| Gas | ETH |

## Run

From `rh-watch/`:

```bash
npm install
npm test
npm run typecheck

# Full kill-list report for one CA
npm run analyze -- 0xYourContractAddress

# Poll new tokens / pairs; print PASS reports in full
npm run watch

# Same, but hide one-line KILLs
npm run watch -- --quiet-kills

# Tune poll window (blocks) and sleep (seconds)
npm run watch -- --interval 20 --lookback 3000
```

`RH_RPC_URL` is optional. Example:

```bash
export RH_RPC_URL=https://rpc.mainnet.chain.robinhood.com
npm run analyze -- 0x020bfC650A365f8BB26819deAAbF3E21291018b4
```

Watch flags: `--quiet-kills`, `--interval <seconds>` (default 20), `--lookback <blocks>` (default 3000).

A PASS report still ends with: **Not a buy signal. Can go to zero.**

## Kill list (fail closed)

If a check cannot be verified, the verdict is **KILL**.

| Check | Kill when |
| --- | --- |
| Unverified | Blockscout `is_verified` is not true |
| Owner powers | ABI has mint, pause, blacklist, or set-tax (implementation ABI is merged for proxies) |
| LP lock | LP not locked, deployer holds LP, or lock is **UNCERTAIN** (V3/V4 have no classic LP token) |
| Tax | Readable buy/sell/tax view is **above 5%**. Unreadable tax is skipped (not a kill by itself) |
| Concentration | Holder API exists; top 10 holders excluding LP + burn **> 30%** of supply. API failure → KILL |
| Name / symbol | Contains `robinhood`, `hood`, or `airdrop` (case insensitive). Official “• Robinhood Token” stocks match this on purpose |
| Pool | No pool, or zero liquidity |

## What it actually calls (investigated 2026-08-29)

Public explorer REST (needs a browser `User-Agent`; bare curl gets a Cloudflare JS challenge):

- `GET /api/v2/tokens?type=ERC-20` — ERC-20 list. **Sorted by market cap / fiat value, not recency.** `next_page_params` is keyset pagination.
- `GET /api/v2/tokens/{address}` — name, symbol, supply, holders_count
- `GET /api/v2/tokens/{address}/holders` — holders (`address.hash`, `value`). Also `GET /api?module=token&action=getTokenHolders`
- `GET /api/v2/smart-contracts/{address}` — `is_verified`, ABI, `proxy_type`, `implementations[]`
- `GET /api/v2/addresses/{address}` — `is_verified`, `creator_address_hash`
- `GET /api?module=contract&action=getsourcecode` — Etherscan-compat ABI/source
- `GET /api?module=contract&action=getcontractcreation`

Rate-limit headers observed on REST: `x-ratelimit-limit: 180` (remaining/reset in the same response). The Pro API at `https://api.blockscout.com/4663/...` returns **402** without a key; this tool does **not** use it.

On-chain discovery (public RPC):

- Uniswap V2-style `PairCreated` at `0x0d1ebb179cdbca88d74c923c4255cb2b17474afd` (live logs; not in Uniswap’s official v2 deploy table)
- Uniswap V3 `PoolCreated` at `0x1f7d7550b1b028f7571e69a784071f0205fd2efa`
- `TokenCreated` at the pools.trade factory `0x000000e200088d55c39a11f609e5f667729ad49b` and launch entries
- V3 `getPool` vs WETH / USDG; V2 `getPair`; V4 PoolManager token balance at `0x8366a39CC670B4001A1121B8F6A443A643e40951`

WETH = `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`. USDG = `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`.

## Rate limits

- Sleep **1.5s** between analyze calls in `watch` so Blockscout 180/window and Cloudflare stay happy.
- Send a Chrome User-Agent. If you see HTML titled “Just a moment…”, you are in a CF challenge — wait and retry; do not hammer.
- RPC `eth_getLogs` is chunked by the lookback window (default 3k blocks). Widen slowly if the RPC 4xxs.
- Do not point this at the paid Pro API unless you add your own key later.

## Gaps (honest)

- **Most new tokens will KILL.** V3/V4 liquidity cannot be proven locked from an LP-token holder list, so LP is **UNCERTAIN → KILL**.
- Blockscout token list is **not** a new-token feed. Watch relies on `PairCreated` / `PoolCreated` / `TokenCreated` plus new names that appear on the first market-cap page.
- Tax is only used when a view function actually returns a number. Hidden transfer taxes are missed.
- Holder pages are capped (a few Blockscout pages). If the API is down, fail closed.
- Proxy clones may show implementation source via `getsourcecode` while the **token address** is still unverified — that is a KILL.
- No locker registry on 4663 is treated as canonical. Only burned LP or a Blockscout-labeled `*lock*` holder counts as locked.
- Official tokenized stocks include “Robinhood” in the name and will KILL the name check.

## Tests

```bash
npm test
```

Mocked fixtures (no network): `unverified`, `mintable`, `airdrop-name`, `pass-all`.
