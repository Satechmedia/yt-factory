import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  analyze,
  classifyOwnerPowers,
  nameIsTrap,
  top10ConcentrationPercent,
} from "../src/analyze.js";
import { assessLp } from "../src/collect.js";
import { DISCLAIMER } from "../src/config.js";
import { formatKillLine, formatReport } from "../src/report.js";
import { unitsToPercent } from "../src/rpc.js";
import type { PoolInfo, TokenSnapshot } from "../src/types.js";

const dir = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): TokenSnapshot {
  const raw = JSON.parse(
    readFileSync(join(dir, "fixtures", name), "utf8"),
  ) as TokenSnapshot & { pool: (PoolInfo & { liquidity: string | bigint }) | null };
  if (raw.pool && typeof raw.pool.liquidity === "string") {
    raw.pool = { ...raw.pool, liquidity: BigInt(raw.pool.liquidity) };
  }
  return raw as TokenSnapshot;
}

describe("name trap", () => {
  it("flags robinhood, hood, and airdrop case-insensitively", () => {
    assert.equal(nameIsTrap("NVIDIA • Robinhood Token", "NVDA"), true);
    assert.equal(nameIsTrap("Good In The Hood", "GOOD"), true);
    assert.equal(nameIsTrap("Claim Airdrop Now", "DROP"), true);
    assert.equal(nameIsTrap("AIRDROP", "x"), true);
    assert.equal(nameIsTrap("Plain Research Token", "PLAIN"), false);
  });
});

describe("owner powers", () => {
  it("detects mint/pause/blacklist/setTax and ignores ERC-20 noise", () => {
    const p = classifyOwnerPowers([
      "mint",
      "pause",
      "setBlacklist",
      "setTax",
      "transfer",
      "approve",
      "allowance",
      "permit",
    ]);
    assert.equal(p.mint, true);
    assert.equal(p.pause, true);
    assert.equal(p.blacklist, true);
    assert.equal(p.setTax, true);
    assert.ok(p.functions.includes("mint"));
  });
});

describe("concentration", () => {
  it("excludes LP and burn from the top-10 sum", () => {
    const pct = top10ConcentrationPercent(
      [
        { address: "0x000000000000000000000000000000000000dEaD", value: "500000" },
        { address: "0x2222222222222222222222222222222222222222", value: "300000" },
        { address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", value: "200000" },
      ],
      1_000_000n,
      new Set([
        "0x000000000000000000000000000000000000dead",
        "0x2222222222222222222222222222222222222222",
      ]),
    );
    assert.equal(pct, 20);
  });
});

describe("tax units", () => {
  it("reads ≤100 as percent and 101–10000 as bps", () => {
    assert.equal(unitsToPercent(3n), 3);
    assert.equal(unitsToPercent(500n), 5);
  });
});

describe("LP assess", () => {
  it("is UNCERTAIN when lock cannot be proven", () => {
    const u = assessLp({
      poolKind: "v3",
      lpHolders: [],
      creator: "0x9999999999999999999999999999999999999999",
      owner: null,
    });
    assert.equal(u.status, "UNCERTAIN");
  });

  it("marks deployer-held LP", () => {
    const r = assessLp({
      poolKind: "v2",
      lpHolders: [
        { address: "0x9999999999999999999999999999999999999999", value: "80" },
        { address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", value: "20" },
      ],
      creator: "0x9999999999999999999999999999999999999999",
      owner: null,
    });
    assert.equal(r.status, "deployer_holds");
  });

  it("treats majority burn as locked", () => {
    const r = assessLp({
      poolKind: "v2",
      lpHolders: [
        { address: "0x000000000000000000000000000000000000dEaD", value: "90" },
        { address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", value: "10" },
      ],
      creator: "0x9999999999999999999999999999999999999999",
      owner: null,
    });
    assert.equal(r.status, "locked");
  });
});

describe("fixtures", () => {
  it("kills unverified (fail closed)", () => {
    const report = analyze(loadFixture("unverified.json"));
    assert.equal(report.verdict, "KILL");
    assert.ok(report.reasons.some((r) => /unverified/i.test(r)));
  });

  it("kills mintable owner powers", () => {
    const report = analyze(loadFixture("mintable.json"));
    assert.equal(report.verdict, "KILL");
    assert.ok(report.reasons.some((r) => /mint/i.test(r)));
    assert.ok(!report.reasons.some((r) => /unverified/i.test(r)));
  });

  it("kills airdrop / trap names", () => {
    const report = analyze(loadFixture("airdrop-name.json"));
    assert.equal(report.verdict, "KILL");
    assert.ok(report.reasons.some((r) => /airdrop/i.test(r)));
  });

  it("passes a clean snapshot and still prints the no-buy disclaimer", () => {
    const report = analyze(loadFixture("pass-all.json"));
    assert.equal(report.verdict, "PASS");
    assert.ok(report.reasons.includes(DISCLAIMER));
    const text = formatReport(report);
    assert.match(text, /Not a buy signal\. Can go to zero\./);
    assert.match(text, /never outputs buy or sell advice/i);
    assert.doesNotMatch(text, /\bbuy this\b/i);
    assert.doesNotMatch(text, /\bsell this\b/i);
  });

  it("watch-style KILL line is one line with a reason", () => {
    const report = analyze(loadFixture("unverified.json"));
    const line = formatKillLine(report);
    assert.equal(line.includes("\n"), false);
    assert.match(line, /^KILL 0x/);
    assert.match(line, /Unverified/);
  });
});
