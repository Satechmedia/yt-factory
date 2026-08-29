import {
  BROWSER_UA,
  EXPLORER_API_URL,
  EXPLORER_REST_URL,
} from "./config.js";
import type { AbiFn, Holder } from "./types.js";

const DEFAULT_TIMEOUT_MS = 20_000;

export class BlockscoutError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "BlockscoutError";
  }
}

export type SmartContractInfo = {
  isVerified: boolean | null;
  name: string | null;
  abi: AbiFn[];
  proxyType: string | null;
  implementations: { address: string; name?: string | null }[];
  raw: unknown;
};

export type TokenInfo = {
  address: string;
  name: string | null;
  symbol: string | null;
  decimals: string | null;
  totalSupply: string | null;
  holdersCount: string | null;
};

export type AddressInfo = {
  isVerified: boolean | null;
  isContract: boolean | null;
  creator: string | null;
  name: string | null;
};

async function getJson(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ status: number; body: unknown }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": BROWSER_UA,
      },
      signal: ctrl.signal,
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      if (text.includes("Just a moment") || text.includes("cf-mitigated")) {
        throw new BlockscoutError(
          "Cloudflare challenge — retry with a browser User-Agent or slow down",
          res.status,
        );
      }
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(t);
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export async function fetchToken(address: string): Promise<TokenInfo | null> {
  const { status, body } = await getJson(`${EXPLORER_REST_URL}/tokens/${address}`);
  const rec = asRecord(body);
  if (status === 404 || rec?.message === "Not found") return null;
  if (!rec || rec.message === "Not found") return null;
  if (status >= 400) {
    throw new BlockscoutError(`tokens ${address} HTTP ${status}`, status);
  }
  return {
    address: String(rec.address_hash ?? address),
    name: rec.name == null ? null : String(rec.name),
    symbol: rec.symbol == null ? null : String(rec.symbol),
    decimals: rec.decimals == null ? null : String(rec.decimals),
    totalSupply: rec.total_supply == null ? null : String(rec.total_supply),
    holdersCount: rec.holders_count == null ? null : String(rec.holders_count),
  };
}

export async function fetchAddress(address: string): Promise<AddressInfo | null> {
  const { status, body } = await getJson(`${EXPLORER_REST_URL}/addresses/${address}`);
  const rec = asRecord(body);
  if (status === 404 || !rec || rec.message === "Not found") return null;
  if (status >= 400) {
    throw new BlockscoutError(`addresses ${address} HTTP ${status}`, status);
  }
  return {
    isVerified: typeof rec.is_verified === "boolean" ? rec.is_verified : null,
    isContract: typeof rec.is_contract === "boolean" ? rec.is_contract : null,
    creator: rec.creator_address_hash == null ? null : String(rec.creator_address_hash),
    name: rec.name == null ? null : String(rec.name),
  };
}

export async function fetchSmartContract(address: string): Promise<SmartContractInfo> {
  const { status, body } = await getJson(
    `${EXPLORER_REST_URL}/smart-contracts/${address}`,
  );
  const rec = asRecord(body);
  if (status === 404 || rec?.message === "Not found") {
    return {
      isVerified: false,
      name: null,
      abi: [],
      proxyType: null,
      implementations: [],
      raw: body,
    };
  }
  if (!rec) {
    return {
      isVerified: null,
      name: null,
      abi: [],
      proxyType: null,
      implementations: [],
      raw: body,
    };
  }
  if (status >= 400 && rec.message) {
    return {
      isVerified: false,
      name: null,
      abi: [],
      proxyType: null,
      implementations: [],
      raw: body,
    };
  }

  const abi = Array.isArray(rec.abi) ? (rec.abi as AbiFn[]) : [];
  const implementations = Array.isArray(rec.implementations)
    ? (rec.implementations as Record<string, unknown>[]).map((i) => ({
        address: String(i.address_hash ?? i.address ?? ""),
        name: i.name == null ? null : String(i.name),
      }))
    : [];

  const isVerified =
    typeof rec.is_verified === "boolean"
      ? rec.is_verified
      : abi.length > 0 && rec.name
        ? true
        : rec.is_verified === undefined && implementations.length
          ? false
          : null;

  return {
    isVerified,
    name: rec.name == null ? null : String(rec.name),
    abi,
    proxyType: rec.proxy_type == null ? null : String(rec.proxy_type),
    implementations: implementations.filter((i) => i.address),
    raw: body,
  };
}

export async function fetchSourceCode(address: string): Promise<{
  verified: boolean | null;
  name: string | null;
  abi: AbiFn[];
}> {
  const url = `${EXPLORER_API_URL}?module=contract&action=getsourcecode&address=${address}`;
  const { status, body } = await getJson(url);
  const rec = asRecord(body);
  if (status >= 400 || !rec) {
    return { verified: null, name: null, abi: [] };
  }
  const result = Array.isArray(rec.result) ? rec.result[0] : rec.result;
  const row = asRecord(result);
  if (!row) return { verified: null, name: null, abi: [] };
  const source = String(row.SourceCode ?? "");
  const abiRaw = row.ABI;
  let abi: AbiFn[] = [];
  if (typeof abiRaw === "string" && abiRaw.startsWith("[")) {
    try {
      abi = JSON.parse(abiRaw) as AbiFn[];
    } catch {
      abi = [];
    }
  } else if (Array.isArray(abiRaw)) {
    abi = abiRaw as AbiFn[];
  }
  const unverified =
    typeof abiRaw === "string" && abiRaw.toLowerCase().includes("not verified");
  const verified = unverified ? false : source.length > 0 || abi.length > 0;
  return {
    verified,
    name: row.ContractName == null ? null : String(row.ContractName),
    abi,
  };
}

export async function fetchHolders(address: string): Promise<Holder[] | null> {
  const rest = await fetchHoldersRest(address);
  if (rest !== null) return rest;
  return fetchHoldersCompat(address);
}

async function fetchHoldersRest(address: string): Promise<Holder[] | null> {
  const items: Holder[] = [];
  let url: string | null = `${EXPLORER_REST_URL}/tokens/${address}/holders`;
  let pages = 0;
  while (url && pages < 3) {
    const { status, body } = await getJson(url);
    const rec = asRecord(body);
    if (status === 404 || rec?.message === "Not found") return pages === 0 ? null : items;
    if (status >= 400 || !rec) {
      if (pages === 0) return null;
      break;
    }
    const batch = Array.isArray(rec.items) ? rec.items : [];
    for (const raw of batch) {
      const row = asRecord(raw);
      if (!row) continue;
      const addr = asRecord(row.address);
      const hash = String(addr?.hash ?? row.address_hash ?? "");
      if (!hash) continue;
      items.push({
        address: hash,
        value: String(row.value ?? "0"),
        isContract: typeof addr?.is_contract === "boolean" ? addr.is_contract : undefined,
        name: addr?.name == null ? null : String(addr.name),
      });
    }
    const next = asRecord(rec.next_page_params);
    if (!next) break;
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (v != null) qs.set(k, String(v));
    }
    url = `${EXPLORER_REST_URL}/tokens/${address}/holders?${qs.toString()}`;
    pages += 1;
  }
  return items;
}

async function fetchHoldersCompat(address: string): Promise<Holder[] | null> {
  const url = `${EXPLORER_API_URL}?module=token&action=getTokenHolders&contractaddress=${address}&page=1&offset=50`;
  const { status, body } = await getJson(url);
  const rec = asRecord(body);
  if (status >= 400 || !rec || rec.status === "0") return null;
  const result = rec.result;
  if (!Array.isArray(result)) return null;
  return result.map((raw) => {
    const row = asRecord(raw) ?? {};
    return {
      address: String(row.address ?? ""),
      value: String(row.value ?? "0"),
    };
  }).filter((h) => h.address);
}

export type TokenListItem = {
  address: string;
  name: string | null;
  symbol: string | null;
};

/** Default sort is market cap / fiat value, not recency. */
export async function fetchTokenListPage(): Promise<TokenListItem[]> {
  const { status, body } = await getJson(`${EXPLORER_REST_URL}/tokens?type=ERC-20`);
  const rec = asRecord(body);
  if (status >= 400 || !rec || !Array.isArray(rec.items)) {
    throw new BlockscoutError(`tokens list HTTP ${status}`, status);
  }
  return (rec.items as unknown[]).map((raw) => {
    const row = asRecord(raw) ?? {};
    return {
      address: String(row.address_hash ?? row.address ?? ""),
      name: row.name == null ? null : String(row.name),
      symbol: row.symbol == null ? null : String(row.symbol),
    };
  }).filter((t) => t.address);
}

export async function fetchContractCreation(address: string): Promise<{
  creator: string | null;
  factory: string | null;
} | null> {
  const url = `${EXPLORER_API_URL}?module=contract&action=getcontractcreation&contractaddresses=${address}`;
  const { status, body } = await getJson(url);
  const rec = asRecord(body);
  if (status >= 400 || !rec) return null;
  const result = Array.isArray(rec.result) ? rec.result[0] : rec.result;
  const row = asRecord(result);
  if (!row) return null;
  return {
    creator: row.contractCreator == null ? null : String(row.contractCreator),
    factory: row.contractFactory == null ? null : String(row.contractFactory),
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
