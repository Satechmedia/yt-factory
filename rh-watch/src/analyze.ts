import {
  BURN_ADDRESSES,
  DISCLAIMER,
  MAX_TAX_PERCENT,
  MAX_TOP10_PERCENT,
} from "./config.js";
import type {
  Check,
  Holder,
  OwnerPowers,
  Report,
  TokenSnapshot,
} from "./types.js";

const NAME_TRAP = /robinhood|\bhood\b|hood|airdrop/i;

export function nameIsTrap(name: string | null, symbol: string | null): boolean {
  const blob = `${name ?? ""} ${symbol ?? ""}`;
  return NAME_TRAP.test(blob);
}

export function privilegedFunctions(fns: string[]): OwnerPowers["functions"] {
  const found = new Set<string>();
  for (const raw of fns) {
    const n = raw.toLowerCase();
    if (
      n === "mint" ||
      n === "mintto" ||
      n === "mintfor" ||
      n === "minttokens"
    ) {
      found.add(raw);
    } else if (n === "pause" || n === "unpause" || n === "setpaused" || n === "setpause") {
      found.add(raw);
    } else if (
      n === "blacklist" ||
      n === "unblacklist" ||
      n === "addblacklist" ||
      n === "addblacklisted" ||
      n === "setblacklist" ||
      n === "setblacklisted" ||
      n === "blockaddress" ||
      n === "banaddress"
    ) {
      found.add(raw);
    } else if (
      n === "settax" ||
      n === "setfee" ||
      n === "setfees" ||
      n === "setbuytax" ||
      n === "setselltax" ||
      n === "updatetax" ||
      n === "updatefees" ||
      n === "settaxfee" ||
      n === "setliquidityfee" ||
      n === "setbuytaxrate" ||
      n === "setselltaxrate" ||
      n === "updatetaxes"
    ) {
      found.add(raw);
    }
  }
  return [...found];
}

export function classifyOwnerPowers(fns: string[]): Pick<
  OwnerPowers,
  "mint" | "pause" | "blacklist" | "setTax" | "functions"
> {
  const functions = privilegedFunctions(fns);
  const lower = new Set(functions.map((f) => f.toLowerCase()));
  return {
    mint: [...lower].some((n) => n.startsWith("mint")),
    pause: [...lower].some((n) => n.includes("pause")),
    blacklist: [...lower].some(
      (n) => n.includes("blacklist") || n === "blockaddress" || n === "banaddress",
    ),
    setTax: [...lower].some(
      (n) => n.includes("tax") || n.includes("fee"),
    ),
    functions,
  };
}

export function top10ConcentrationPercent(
  holders: Holder[],
  totalSupply: bigint,
  exclude: Set<string>,
): number | null {
  if (totalSupply <= 0n) return null;
  const kept = holders
    .filter((h) => !exclude.has(h.address.toLowerCase()))
    .map((h) => {
      try {
        return BigInt(h.value);
      } catch {
        return 0n;
      }
    })
    .filter((v) => v > 0n)
    .sort((a, b) => (a === b ? 0 : a > b ? -1 : 1))
    .slice(0, 10);
  const sum = kept.reduce((a, b) => a + b, 0n);
  return Number((sum * 10000n) / totalSupply) / 100;
}

function excludeSet(snapshot: TokenSnapshot): Set<string> {
  const out = new Set<string>(BURN_ADDRESSES);
  out.add(snapshot.address.toLowerCase());
  if (snapshot.pool) out.add(snapshot.pool.address.toLowerCase());
  return out;
}

export function runKillList(snapshot: TokenSnapshot): Check[] {
  const checks: Check[] = [];

  if (snapshot.verified !== true) {
    checks.push({
      id: "verified",
      kill: true,
      reason:
        snapshot.verified === false
          ? "Unverified on Blockscout"
          : snapshot.verifiedNote ||
            "Verification status unknown (fail closed)",
    });
  } else {
    checks.push({ id: "verified", kill: false, reason: "Verified on Blockscout" });
  }

  const powers = snapshot.ownerPowers;
  if (!powers.ownerRead && (powers.mint || powers.pause || powers.blacklist || powers.setTax)) {
    checks.push({
      id: "owner",
      kill: true,
      reason: `Owner powers present and owner() unread (fail closed): ${powers.functions.join(", ")}`,
    });
  } else if (powers.mint || powers.pause || powers.blacklist || powers.setTax) {
    const bits = [
      powers.mint && "mint",
      powers.pause && "pause",
      powers.blacklist && "blacklist",
      powers.setTax && "set tax",
    ].filter(Boolean);
    checks.push({
      id: "owner",
      kill: true,
      reason: `Owner can ${bits.join(", ")} (${powers.functions.join(", ")})`,
    });
  } else if (powers.functions.length === 0 && snapshot.verified === true) {
    checks.push({
      id: "owner",
      kill: false,
      reason: "No mint/pause/blacklist/set-tax functions in ABI",
    });
  } else {
    checks.push({
      id: "owner",
      kill: true,
      reason: snapshot.ownerPowers.functions.length
        ? `Owner powers unverifiable (fail closed): ${powers.functions.join(", ")}`
        : "Owner powers unverifiable — ABI missing (fail closed)",
    });
  }

  if (snapshot.lp.status !== "locked") {
    const prefix = snapshot.lp.status === "UNCERTAIN" ? "UNCERTAIN — " : "";
    checks.push({
      id: "lp",
      kill: true,
      reason:
        snapshot.lp.status === "deployer_holds"
          ? `Deployer holds LP — ${snapshot.lp.note}`
          : `${prefix}${snapshot.lp.note || "LP not locked / cannot verify lock"}`,
    });
  } else {
    checks.push({ id: "lp", kill: false, reason: snapshot.lp.note || "LP locked" });
  }

  if (snapshot.tax.readable && snapshot.tax.percent !== null) {
    if (snapshot.tax.percent > MAX_TAX_PERCENT) {
      checks.push({
        id: "tax",
        kill: true,
        reason: `Tax ${snapshot.tax.percent}% > ${MAX_TAX_PERCENT}%`,
      });
    } else {
      checks.push({
        id: "tax",
        kill: false,
        reason: `Tax ${snapshot.tax.percent}% (readable, ≤ ${MAX_TAX_PERCENT}%)`,
      });
    }
  } else {
    checks.push({
      id: "tax",
      kill: false,
      reason: snapshot.tax.note || "Tax not readable — skipped",
    });
  }

  if (snapshot.holders === null) {
    checks.push({
      id: "holders",
      kill: true,
      reason:
        snapshot.holdersNote ||
        "Holder list unverifiable (fail closed)",
    });
  } else {
    let supply: bigint | null = null;
    try {
      supply = snapshot.totalSupply ? BigInt(snapshot.totalSupply) : null;
    } catch {
      supply = null;
    }
    const pct =
      supply !== null
        ? top10ConcentrationPercent(snapshot.holders, supply, excludeSet(snapshot))
        : null;
    if (pct === null) {
      checks.push({
        id: "holders",
        kill: true,
        reason: "Holder concentration unverifiable (fail closed)",
      });
    } else if (pct > MAX_TOP10_PERCENT) {
      checks.push({
        id: "holders",
        kill: true,
        reason: `Top 10 holders excluding LP/burn = ${pct.toFixed(2)}% > ${MAX_TOP10_PERCENT}%`,
      });
    } else {
      checks.push({
        id: "holders",
        kill: false,
        reason: `Top 10 holders excluding LP/burn = ${pct.toFixed(2)}%`,
      });
    }
  }

  if (nameIsTrap(snapshot.name, snapshot.symbol)) {
    checks.push({
      id: "name",
      kill: true,
      reason: `Name/symbol contains robinhood, hood, or airdrop (${snapshot.name ?? "?"} / ${snapshot.symbol ?? "?"})`,
    });
  } else {
    checks.push({ id: "name", kill: false, reason: "Name/symbol has no robinhood/hood/airdrop trap" });
  }

  if (!snapshot.pool) {
    checks.push({
      id: "pool",
      kill: true,
      reason: snapshot.poolNote || "No pool / zero liquidity",
    });
  } else if (snapshot.pool.liquidity <= 0n) {
    checks.push({
      id: "pool",
      kill: true,
      reason: `Zero liquidity — ${snapshot.pool.note}`,
    });
  } else {
    checks.push({
      id: "pool",
      kill: false,
      reason: snapshot.pool.note,
    });
  }

  return checks;
}

export function analyze(snapshot: TokenSnapshot): Report {
  const checks = runKillList(snapshot);
  const kills = checks.filter((c) => c.kill);
  const verdict: Report["verdict"] = kills.length ? "KILL" : "PASS";
  const reasons =
    verdict === "KILL"
      ? kills.map((c) => c.reason)
      : [
          DISCLAIMER,
          ...checks.filter((c) => !c.kill).map((c) => c.reason),
        ];

  let concentration = snapshot.holdersNote || "unknown";
  if (snapshot.holders && snapshot.totalSupply) {
    try {
      const pct = top10ConcentrationPercent(
        snapshot.holders,
        BigInt(snapshot.totalSupply),
        excludeSet(snapshot),
      );
      if (pct !== null) {
        concentration = `top10 excl LP/burn = ${pct.toFixed(2)}%`;
      }
    } catch {
      /* keep note */
    }
  }

  return {
    address: snapshot.address,
    name: snapshot.name,
    symbol: snapshot.symbol,
    verified: snapshot.verified,
    ownerPowers: snapshot.ownerPowers,
    tax: snapshot.tax,
    lp: snapshot.lp,
    concentration,
    pool: snapshot.pool
      ? `${snapshot.pool.kind} ${snapshot.pool.address} — ${snapshot.pool.note}`
      : snapshot.poolNote || "none",
    explorerUrl: snapshot.explorerUrl,
    verdict,
    reasons,
  };
}
