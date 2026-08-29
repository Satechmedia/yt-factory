export type Verdict = "PASS" | "KILL";

export type AbiFn = {
  type?: string;
  name?: string;
  inputs?: { type?: string; name?: string }[];
  outputs?: { type?: string; name?: string }[];
  stateMutability?: string;
};

export type Holder = {
  address: string;
  value: string;
  isContract?: boolean;
  name?: string | null;
};

export type PoolInfo = {
  address: string;
  kind: "v2" | "v3" | "v4" | "unknown";
  liquidity: bigint;
  note: string;
};

export type LpStatus = "locked" | "deployer_holds" | "unlocked" | "UNCERTAIN";

export type LpInfo = {
  status: LpStatus;
  note: string;
};

export type TaxInfo = {
  readable: boolean;
  percent: number | null;
  note: string;
};

export type OwnerPowers = {
  mint: boolean;
  pause: boolean;
  blacklist: boolean;
  setTax: boolean;
  functions: string[];
  owner: string | null;
  ownerRead: boolean;
};

export type TokenSnapshot = {
  address: string;
  name: string | null;
  symbol: string | null;
  verified: boolean | null;
  verifiedNote: string;
  ownerPowers: OwnerPowers;
  tax: TaxInfo;
  lp: LpInfo;
  holders: Holder[] | null;
  holdersNote: string;
  totalSupply: string | null;
  pool: PoolInfo | null;
  poolNote: string;
  explorerUrl: string;
  creator: string | null;
};

export type Report = {
  address: string;
  name: string | null;
  symbol: string | null;
  verified: boolean | null;
  ownerPowers: OwnerPowers;
  tax: TaxInfo;
  lp: LpInfo;
  concentration: string;
  pool: string;
  explorerUrl: string;
  verdict: Verdict;
  reasons: string[];
};

export type Check = {
  id: string;
  kill: boolean;
  reason: string;
};
