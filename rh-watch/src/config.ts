/** Robinhood Chain — verified against public RPC (eth_chainId = 0x1237). */

export const CHAIN_ID = 4663;
export const DEFAULT_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
export const EXPLORER_URL = "https://robinhoodchain.blockscout.com";
export const EXPLORER_API_URL = `${EXPLORER_URL}/api`;
export const EXPLORER_REST_URL = `${EXPLORER_URL}/api/v2`;

/** Gas token is ETH. There is no official Robinhood Chain memecoin. */
export const GAS_TOKEN = "ETH";

/**
 * Browser UA: the public explorer sits behind Cloudflare and rejects
 * bare curl/node fetches with a JS challenge (403). A Chrome UA is enough
 * for the REST + Etherscan-compat APIs (confirmed 2026-08-29).
 */
export const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
export const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

/** Uniswap V3 factory — docs + on-chain bytecode (nirholas/robinhood-toolkit). */
export const UNI_V3_FACTORY = "0x1f7d7550b1b028f7571e69a784071f0205fd2efa";
/** Uniswap V4 singleton. Pools are IDs, not pair contracts. */
export const UNI_V4_POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
/**
 * Live V2-style factory on 4663. Emits PairCreated; confirmed via eth_getLogs
 * on the public RPC (not listed in Uniswap's official v2 deploy table).
 */
export const UNI_V2_FACTORY = "0x0d1ebb179cdbca88d74c923c4255cb2b17474afd";

/** pools.trade / Uniswap LiquidityLauncher token factory. */
export const TOKEN_FACTORY = "0x000000e200088d55c39a11f609e5f667729ad49b";
export const LAUNCH_ENTRY_CURRENT = "0x0000ffffbe8efe702c8703ae3477ff5de3d319c0";
export const LAUNCH_ENTRY_ORIGINAL = "0x00004c4ccc709ef590f7c81102c0689f0263d4e9";

export const V3_FEE_TIERS = [100, 500, 3000, 10000] as const;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD";

export const BURN_ADDRESSES = new Set([
  ZERO_ADDRESS.toLowerCase(),
  DEAD_ADDRESS.toLowerCase(),
  "0x000000000000000000000000000000000000dead",
]);

export const QUOTE_TOKENS = new Set([
  WETH.toLowerCase(),
  USDG.toLowerCase(),
  ZERO_ADDRESS.toLowerCase(),
]);

export const MAX_TAX_PERCENT = 5;
export const MAX_TOP10_PERCENT = 30;

export const DISCLAIMER = "Not a buy signal. Can go to zero.";
export const NO_ADVICE =
  "Education/research only. rh-watch never outputs buy or sell advice.";

export function rpcUrl(): string {
  return process.env.RH_RPC_URL?.trim() || DEFAULT_RPC_URL;
}

export function explorerTokenUrl(address: string): string {
  return `${EXPLORER_URL}/token/${address}`;
}

export function explorerAddressUrl(address: string): string {
  return `${EXPLORER_URL}/address/${address}`;
}
