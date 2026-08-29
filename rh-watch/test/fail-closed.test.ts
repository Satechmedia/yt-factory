import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { analyze, runKillList } from "../src/analyze.js";
import { fetchSmartContract } from "../src/blockscout.js";
import { formatKillLine, formatReport } from "../src/report.js";
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

const BUY_LANG = /\bbuy(?:-|\s)?signal\b|\bbuy this\b|\bbuy now\b/i;

describe("required fixtures present", () => {
  it("ships unverified, mintable, airdrop-name, and pass-all", () => {
    for (const name of [
      "unverified.json",
      "mintable.json",
      "airdrop-name.json",
      "pass-all.json",
    ]) {
      assert.ok(existsSync(join(dir, "fixtures", name)), `missing fixture ${name}`);
    }
  });
});

describe("fail-closed: unreadable tax", () => {
  it("kills when tax cannot be proven ≤5% (kill:false skip is a product bug)", () => {
    const snap = loadFixture("tax-unreadable.json");
    const checks = runKillList(snap);
    const tax = checks.find((c) => c.id === "tax");
    assert.ok(tax, "tax check missing");
    assert.equal(
      tax.kill,
      true,
      `unreadable tax must be KILL, not skip; got kill=${tax.kill} reason=${tax.reason}`,
    );
    const report = analyze(snap);
    assert.equal(report.verdict, "KILL");
    assert.ok(report.reasons.some((r) => /tax/i.test(r)));
  });
});

describe("fail-closed: verification", () => {
  it("kills when verified is missing (null) — only is_verified === true is verified", () => {
    const snap = loadFixture("verify-missing.json");
    assert.equal(snap.verified, null);
    const checks = runKillList(snap);
    const verified = checks.find((c) => c.id === "verified");
    assert.ok(verified, "verified check missing");
    assert.equal(verified.kill, true);
    const report = analyze(snap);
    assert.equal(report.verdict, "KILL");
    assert.ok(report.reasons.some((r) => /verif/i.test(r)));
  });

  it("does not treat ABI+name as verified when is_verified is missing", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          name: "Inferred Token",
          abi: [{ type: "function", name: "transfer", inputs: [], outputs: [] }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as typeof fetch;
    try {
      const sc = await fetchSmartContract(
        "0x1111111111111111111111111111111111111111",
      );
      assert.notEqual(
        sc.isVerified,
        true,
        "ABI+name with missing is_verified must not be treated as verified",
      );
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe("verdict and buy language", () => {
  it("verdict is only PASS or KILL", () => {
    for (const name of [
      "unverified.json",
      "mintable.json",
      "airdrop-name.json",
      "pass-all.json",
      "tax-unreadable.json",
      "verify-missing.json",
    ]) {
      const v = analyze(loadFixture(name)).verdict;
      assert.ok(v === "PASS" || v === "KILL", `${name} verdict=${v}`);
    }
  });

  it("KILL line and verdict field have no buy/buy-signal language", () => {
    const report = analyze(loadFixture("unverified.json"));
    assert.doesNotMatch(report.verdict, BUY_LANG);
    assert.doesNotMatch(formatKillLine(report), BUY_LANG);
    for (const r of report.reasons) {
      assert.doesNotMatch(r, BUY_LANG);
    }
  });

  it("formatted CLI report has no buy/buy-signal language", () => {
    const text = formatReport(analyze(loadFixture("pass-all.json")));
    assert.doesNotMatch(text, BUY_LANG);
  });
});
