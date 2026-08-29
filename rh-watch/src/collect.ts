import type { Address, PublicClient } from "viem";
import { isAddress, getAddress } from "viem";
import {
  BURN_ADDRESSES,
  UNI_V4_POOL_MANAGER,
  explorerTokenUrl,
} from "./config.js";
import {
  fetchAddress,
  fetchContractCreation,
  fetchHolders,
  fetchSmartContract,
  fetchSourceCode,
  fetchToken,
} from "./blockscout.js";
import { classifyOwnerPowers } from "./analyze.js";
import {
  bestPool,
  discoverPools,
  readOwner,
  readTax,
  readTokenMeta,
} from "./rpc.js";
import type { AbiFn, Holder, LpInfo, OwnerPowers, TokenSnapshot } from "./types.js";

function emptyPowers(partial?: Partial<OwnerPowers>): OwnerPowers {
  return {
    mint: false,
    pause: false,
    blacklist: false,
    setTax: false,
    functions: [],
    owner: null,
    ownerRead: false,
    ...partial,
  };
}

function mergeAbi(...lists: AbiFn[][]): AbiFn[] {
  const seen = new Set<string>();
  const out: AbiFn[] = [];
  for (const list of lists) {
    for (const item of list) {
      const key = `${item.type}:${item.name}:${JSON.stringify(item.inputs ?? [])}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

export function assessLp(opts: {
  poolKind: "v2" | "v3" | "v4" | "unknown" | null;
  lpHolders: Holder[] | null;
  creator: string | null;
  owner: string | null;
}): LpInfo {
  if (!opts.poolKind) {
    return { status: "UNCERTAIN", note: "No pool to inspect for LP lock (UNCERTAIN)" };
  }
  if (opts.poolKind === "v3" || opts.poolKind === "v4") {
    return {
      status: "UNCERTAIN",
      note: `${opts.poolKind.toUpperCase()} liquidity has no classic LP token — lock unverifiable (UNCERTAIN)`,
    };
  }
  if (!opts.lpHolders) {
    return { status: "UNCERTAIN", note: "LP holders unread (UNCERTAIN)" };
  }
  if (!opts.lpHolders.length) {
    return { status: "UNCERTAIN", note: "LP holder list empty (UNCERTAIN)" };
  }

  let total = 0n;
  const rows = opts.lpHolders.map((h) => {
    let v = 0n;
    try {
      v = BigInt(h.value);
    } catch {
      v = 0n;
    }
    total += v;
    return { ...h, v };
  });
  if (total <= 0n) {
    return { status: "UNCERTAIN", note: "LP total supply unread (UNCERTAIN)" };
  }

  const privileged = new Set(
    [opts.creator, opts.owner]
      .filter((x): x is string => !!x)
      .map((x) => x.toLowerCase()),
  );
  const deployerHeld = rows
    .filter((r) => privileged.has(r.address.toLowerCase()))
    .reduce((a, r) => a + r.v, 0n);
  if (deployerHeld > 0n) {
    const pct = Number((deployerHeld * 10000n) / total) / 100;
    return {
      status: "deployer_holds",
      note: `deployer/owner holds ${pct.toFixed(2)}% of LP`,
    };
  }

  const burned = rows
    .filter((r) => BURN_ADDRESSES.has(r.address.toLowerCase()))
    .reduce((a, r) => a + r.v, 0n);
  const burnPct = Number((burned * 10000n) / total) / 100;
  if (burned * 2n >= total) {
    return {
      status: "locked",
      note: `LP burned (${burnPct.toFixed(2)}% to dead/zero)`,
    };
  }

  const namedLocker = rows.find((r) => /lock/i.test(r.name ?? ""));
  if (namedLocker && namedLocker.v * 2n >= total) {
    return {
      status: "locked",
      note: `majority LP at labeled locker ${namedLocker.address} (${namedLocker.name})`,
    };
  }

  return {
    status: "UNCERTAIN",
    note: "LP not burned and no labeled locker (UNCERTAIN)",
  };
}

export async function collectSnapshot(
  client: PublicClient,
  rawAddress: string,
): Promise<TokenSnapshot> {
  if (!isAddress(rawAddress)) {
    throw new Error(`Not an EVM address: ${rawAddress}`);
  }
  const address = getAddress(rawAddress) as Address;
  const explorerUrl = explorerTokenUrl(address);

  let token = await fetchToken(address).catch(() => null);
  const addrInfo = await fetchAddress(address).catch(() => null);
  const creation = await fetchContractCreation(address).catch(() => null);
  const sc = await fetchSmartContract(address).catch(() => null);
  const source = await fetchSourceCode(address).catch(() => null);

  let abi = mergeAbi(sc?.abi ?? [], source?.abi ?? []);
  if (sc?.implementations.length) {
    for (const impl of sc.implementations) {
      if (!isAddress(impl.address)) continue;
      const implSc = await fetchSmartContract(impl.address).catch(() => null);
      const implSrc = await fetchSourceCode(impl.address).catch(() => null);
      abi = mergeAbi(abi, implSc?.abi ?? [], implSrc?.abi ?? []);
    }
  }

  const verified =
    sc?.isVerified === true || addrInfo?.isVerified === true
      ? true
      : sc?.isVerified === false || source?.verified === false
        ? false
        : sc?.isVerified ?? source?.verified ?? addrInfo?.isVerified ?? null;

  const verifiedNote =
    verified === true
      ? "Verified on Blockscout"
      : verified === false
        ? "Unverified on Blockscout"
        : "Blockscout verification unread (fail closed)";

  const fns = abi.filter((x) => x.type === "function" && x.name).map((x) => x.name as string);
  const classified = classifyOwnerPowers(fns);
  const { owner, read: ownerRead } = await readOwner(client, address);
  const ownerPowers: OwnerPowers = {
    ...classified,
    owner,
    ownerRead,
  };

  const meta = await readTokenMeta(client, address);
  const name = token?.name ?? meta.name ?? source?.name ?? sc?.name ?? null;
  const symbol = token?.symbol ?? meta.symbol ?? null;
  const totalSupply = token?.totalSupply ?? meta.totalSupply ?? null;

  const tax = await readTax(client, address, abi);

  const pools = await discoverPools(client, address, abi);
  const pool = bestPool(pools);
  const poolNote = pool
    ? pool.note
    : "No V2 getPair / V3 getPool / v4 PoolManager balance / liquidityPool()";

  let holders: Holder[] | null = null;
  let holdersNote = "Holder API unread";
  try {
    holders = await fetchHolders(address);
    holdersNote = holders
      ? `${holders.length} holders from Blockscout`
      : "Holder API returned nothing (fail closed)";
    if (holders === null) holdersNote = "Holder API failed (fail closed)";
  } catch {
    holders = null;
    holdersNote = "Holder API error (fail closed)";
  }

  let lpHolders: Holder[] | null = null;
  if (pool && pool.kind === "v2" && pool.address.toLowerCase() !== UNI_V4_POOL_MANAGER.toLowerCase()) {
    try {
      lpHolders = await fetchHolders(pool.address);
    } catch {
      lpHolders = null;
    }
  }

  const creator = addrInfo?.creator ?? creation?.creator ?? null;
  const lp = assessLp({
    poolKind: pool?.kind ?? null,
    lpHolders,
    creator,
    owner,
  });

  if (!token) {
    token = {
      address,
      name,
      symbol,
      decimals: null,
      totalSupply,
      holdersCount: holders ? String(holders.length) : null,
    };
  }

  return {
    address,
    name,
    symbol,
    verified,
    verifiedNote,
    ownerPowers,
    tax,
    lp,
    holders,
    holdersNote,
    totalSupply,
    pool,
    poolNote,
    explorerUrl,
    creator,
  };
}
