import {
  createPublicClient,
  defineChain,
  encodeFunctionData,
  hexToBigInt,
  http,
  parseAbiItem,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  BROWSER_UA,
  CHAIN_ID,
  DEFAULT_RPC_URL,
  EXPLORER_URL,
  UNI_V2_FACTORY,
  UNI_V3_FACTORY,
  UNI_V4_POOL_MANAGER,
  V3_FEE_TIERS,
  WETH,
  USDG,
} from "./config.js";
import type { AbiFn, PoolInfo } from "./types.js";

export const robinhoodChain = defineChain({
  id: CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [DEFAULT_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: EXPLORER_URL },
  },
});

export function makeClient(url: string): PublicClient {
  return createPublicClient({
    chain: robinhoodChain,
    transport: http(url, {
      fetchOptions: {
        headers: { "User-Agent": BROWSER_UA },
      },
      timeout: 25_000,
    }),
  });
}

const ERC20 = [
  parseAbiItem("function name() view returns (string)"),
  parseAbiItem("function symbol() view returns (string)"),
  parseAbiItem("function decimals() view returns (uint8)"),
  parseAbiItem("function totalSupply() view returns (uint256)"),
  parseAbiItem("function balanceOf(address) view returns (uint256)"),
] as const;

async function readString(client: PublicClient, address: Address, fn: "name" | "symbol"): Promise<string | null> {
  try {
    return await client.readContract({
      address,
      abi: ERC20,
      functionName: fn,
    });
  } catch {
    return null;
  }
}

export async function readTokenMeta(
  client: PublicClient,
  address: Address,
): Promise<{ name: string | null; symbol: string | null; totalSupply: string | null }> {
  const [name, symbol, supply] = await Promise.all([
    readString(client, address, "name"),
    readString(client, address, "symbol"),
    client
      .readContract({ address, abi: ERC20, functionName: "totalSupply" })
      .then((v) => v.toString())
      .catch(() => null),
  ]);
  return { name, symbol, totalSupply: supply };
}

export async function readOwner(
  client: PublicClient,
  address: Address,
): Promise<{ owner: string | null; read: boolean }> {
  for (const sig of [
    parseAbiItem("function owner() view returns (address)"),
    parseAbiItem("function getOwner() view returns (address)"),
    parseAbiItem("function deployer() view returns (address)"),
  ] as const) {
    try {
      const owner = await client.readContract({
        address,
        abi: [sig],
        functionName: sig.name,
      });
      return { owner, read: true };
    } catch {
      /* try next */
    }
  }
  return { owner: null, read: false };
}

const TAX_VIEW_FNS = [
  "buyTaxRate",
  "sellTaxRate",
  "taxRate",
  "buyTax",
  "sellTax",
  "taxFee",
  "totalFee",
  "getTax",
] as const;

/** Treat ≤100 as percent, 101–10000 as basis points. */
export function unitsToPercent(raw: bigint): number {
  if (raw <= 100n) return Number(raw);
  if (raw <= 10_000n) return Number(raw) / 100;
  return Number(raw) / 100; // still bps-ish; caller can KILL if huge
}

export async function readTax(
  client: PublicClient,
  address: Address,
  abi: AbiFn[],
): Promise<{ readable: boolean; percent: number | null; note: string }> {
  const names = new Set(
    abi.filter((x) => x.type === "function" && x.name).map((x) => x.name as string),
  );
  const candidates = TAX_VIEW_FNS.filter((n) => names.has(n));
  const extra = [...names].filter(
    (n) =>
      /^(buy|sell|total)?_?(tax|fee)s?_?(rate|bps|percent)?$/i.test(n) &&
      !candidates.includes(n as (typeof TAX_VIEW_FNS)[number]),
  );
  const tryNames = [...candidates, ...extra].slice(0, 8);
  if (!tryNames.length) {
    return { readable: false, percent: null, note: "Tax not readable (no view fn)" };
  }

  const percents: number[] = [];
  for (const name of tryNames) {
    try {
      const data = encodeFunctionData({
        abi: [
          {
            type: "function",
            name,
            stateMutability: "view",
            inputs: [],
            outputs: [{ type: "uint256" }],
          },
        ],
        functionName: name,
      });
      const raw = await client.call({ to: address, data });
      if (!raw.data || raw.data === "0x") continue;
      const value = hexToBigInt(raw.data);
      if (value > 10_000n) continue;
      percents.push(unitsToPercent(value));
    } catch {
      /* skip */
    }
  }
  if (!percents.length) {
    return { readable: false, percent: null, note: "Tax not readable (calls failed)" };
  }
  const worst = Math.max(...percents);
  return {
    readable: true,
    percent: worst,
    note: `readable worst-case ${worst}% (from ${tryNames.join(", ")})`,
  };
}

const getPairAbi = [
  parseAbiItem("function getPair(address,address) view returns (address)"),
] as const;
const getPoolAbi = [
  parseAbiItem("function getPool(address,address,uint24) view returns (address)"),
] as const;
const reservesAbi = [
  parseAbiItem("function getReserves() view returns (uint112,uint112,uint32)"),
] as const;
const liquidityAbi = [
  parseAbiItem("function liquidity() view returns (uint128)"),
] as const;
const poolHintAbi = [
  parseAbiItem("function liquidityPool() view returns (address)"),
  parseAbiItem("function mainPool() view returns (address)"),
  parseAbiItem("function pair() view returns (address)"),
] as const;

function isAddress(v: string): v is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(v);
}

async function pairReserves(
  client: PublicClient,
  pair: Address,
): Promise<{ liquidity: bigint; note: string } | null> {
  try {
    const [r0, r1] = await client.readContract({
      address: pair,
      abi: reservesAbi,
      functionName: "getReserves",
    });
    const liquidity = r0 + r1;
    return {
      liquidity,
      note: `v2 reserves ${r0.toString()}+${r1.toString()}`,
    };
  } catch {
    return null;
  }
}

async function v3Liquidity(
  client: PublicClient,
  pool: Address,
): Promise<{ liquidity: bigint; note: string } | null> {
  try {
    const liq = await client.readContract({
      address: pool,
      abi: liquidityAbi,
      functionName: "liquidity",
    });
    return { liquidity: liq, note: `v3 liquidity()=${liq.toString()}` };
  } catch {
    return null;
  }
}

export async function discoverPools(
  client: PublicClient,
  token: Address,
  abi: AbiFn[],
): Promise<PoolInfo[]> {
  const found: PoolInfo[] = [];
  const seen = new Set<string>();

  const push = (info: PoolInfo) => {
    const key = info.address.toLowerCase();
    if (seen.has(key) || key === "0x0000000000000000000000000000000000000000") return;
    seen.add(key);
    found.push(info);
  };

  const hints = abi
    .filter((x) => x.type === "function" && x.name)
    .map((x) => x.name as string)
    .filter((n) => /^(liquidityPool|mainPool|pair)$/i.test(n));

  for (const name of hints) {
    try {
      const item = poolHintAbi.find((x) => x.name === name);
      if (!item) continue;
      const pool = await client.readContract({
        address: token,
        abi: [item],
        functionName: item.name,
      });
      if (!isAddress(pool)) continue;
      const reserves = await pairReserves(client, pool);
      if (reserves) {
        push({ address: pool, kind: "v2", ...reserves });
      } else {
        const v3 = await v3Liquidity(client, pool);
        push({
          address: pool,
          kind: v3 ? "v3" : "unknown",
          liquidity: v3?.liquidity ?? 0n,
          note: v3?.note ?? `hint ${name}()=${pool}`,
        });
      }
    } catch {
      /* skip */
    }
  }

  for (const quote of [WETH, USDG] as Address[]) {
    try {
      const pair = await client.readContract({
        address: UNI_V2_FACTORY as Address,
        abi: getPairAbi,
        functionName: "getPair",
        args: [token, quote],
      });
      if (isAddress(pair) && pair !== "0x0000000000000000000000000000000000000000") {
        const reserves = await pairReserves(client, pair);
        push({
          address: pair,
          kind: "v2",
          liquidity: reserves?.liquidity ?? 0n,
          note: reserves?.note ?? `v2 getPair vs ${quote}`,
        });
      }
    } catch {
      /* factory may revert */
    }

    for (const fee of V3_FEE_TIERS) {
      try {
        const pool = await client.readContract({
          address: UNI_V3_FACTORY as Address,
          abi: getPoolAbi,
          functionName: "getPool",
          args: [token, quote, fee],
        });
        if (isAddress(pool) && pool !== "0x0000000000000000000000000000000000000000") {
          const v3 = await v3Liquidity(client, pool);
          push({
            address: pool,
            kind: "v3",
            liquidity: v3?.liquidity ?? 0n,
            note: v3?.note ?? `v3 fee ${fee}`,
          });
        }
      } catch {
        /* skip */
      }
    }
  }

  try {
    const bal = await client.readContract({
      address: token,
      abi: ERC20,
      functionName: "balanceOf",
      args: [UNI_V4_POOL_MANAGER as Address],
    });
    if (bal > 0n) {
      push({
        address: UNI_V4_POOL_MANAGER,
        kind: "v4",
        liquidity: bal,
        note: `v4 PoolManager holds ${bal.toString()} tokens`,
      });
    }
  } catch {
    /* skip */
  }

  return found;
}

export function bestPool(pools: PoolInfo[]): PoolInfo | null {
  if (!pools.length) return null;
  return [...pools].sort((a, b) => (a.liquidity === b.liquidity ? 0 : a.liquidity > b.liquidity ? -1 : 1))[0] ?? null;
}

export const PAIR_CREATED = parseAbiItem(
  "event PairCreated(address indexed token0, address indexed token1, address pair, uint256)",
);
export const POOL_CREATED = parseAbiItem(
  "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)",
);
export const TOKEN_CREATED = parseAbiItem("event TokenCreated(address token)");

export function topicAddress(topic: Hex | undefined): Address | null {
  if (!topic || topic.length < 66) return null;
  return `0x${topic.slice(26)}` as Address;
}

export function dataAddress(data: Hex | undefined, word = 0): Address | null {
  if (!data || data === "0x") return null;
  const hex = data.slice(2);
  const slice = hex.slice(word * 64, word * 64 + 64);
  if (slice.length < 64) return null;
  return `0x${slice.slice(24)}` as Address;
}
