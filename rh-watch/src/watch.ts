import type { Address, PublicClient } from "viem";
import { getAddress } from "viem";
import {
  LAUNCH_ENTRY_CURRENT,
  LAUNCH_ENTRY_ORIGINAL,
  QUOTE_TOKENS,
  TOKEN_FACTORY,
  UNI_V2_FACTORY,
  UNI_V3_FACTORY,
} from "./config.js";
import { analyze } from "./analyze.js";
import { collectSnapshot } from "./collect.js";
import { fetchTokenListPage, sleep } from "./blockscout.js";
import { formatKillLine, formatReport } from "./report.js";
import {
  PAIR_CREATED,
  POOL_CREATED,
  TOKEN_CREATED,
  dataAddress,
  topicAddress,
} from "./rpc.js";

export type WatchOptions = {
  intervalSec: number;
  lookback: number;
  quietKills: boolean;
  analyzeDelayMs: number;
};

function asToken(addr: string | null | undefined): string | null {
  if (!addr) return null;
  const lower = addr.toLowerCase();
  if (QUOTE_TOKENS.has(lower)) return null;
  if (lower === UNI_V2_FACTORY.toLowerCase()) return null;
  if (lower === UNI_V3_FACTORY.toLowerCase()) return null;
  return getAddress(addr);
}

export async function discoverNewTokens(
  client: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<string[]> {
  const found = new Set<string>();

  const addPairSide = (a: string | null, b: string | null) => {
    const ta = asToken(a);
    const tb = asToken(b);
    if (ta) found.add(ta);
    if (tb) found.add(tb);
  };

  try {
    const logs = await client.getLogs({
      address: UNI_V2_FACTORY as Address,
      event: PAIR_CREATED,
      fromBlock,
      toBlock,
    });
    for (const log of logs) {
      addPairSide(log.args.token0, log.args.token1);
    }
  } catch (err) {
    console.error(`watch: PairCreated logs failed: ${err instanceof Error ? err.message : err}`);
  }

  try {
    const logs = await client.getLogs({
      address: UNI_V3_FACTORY as Address,
      event: POOL_CREATED,
      fromBlock,
      toBlock,
    });
    for (const log of logs) {
      addPairSide(log.args.token0, log.args.token1);
    }
  } catch (err) {
    console.error(`watch: PoolCreated logs failed: ${err instanceof Error ? err.message : err}`);
  }

  for (const factory of [TOKEN_FACTORY, LAUNCH_ENTRY_CURRENT, LAUNCH_ENTRY_ORIGINAL] as Address[]) {
    try {
      const logs = await client.getLogs({
        address: factory,
        event: TOKEN_CREATED,
        fromBlock,
        toBlock,
      });
      for (const log of logs) {
        const t = asToken(log.args.token ?? null);
        if (t) found.add(t);
      }
    } catch {
      /* TokenCreated(address) may not match metadata overload — decode data */
      try {
        const raw = await client.getLogs({
          address: factory,
          fromBlock,
          toBlock,
        });
        for (const log of raw) {
          const t =
            asToken(topicAddress(log.topics[1])) ?? asToken(dataAddress(log.data, 0));
          if (t) found.add(t);
        }
      } catch (err) {
        console.error(
          `watch: TokenCreated @ ${factory} failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  return [...found];
}

export async function pollTokenList(seen: Set<string>): Promise<string[]> {
  try {
    const page = await fetchTokenListPage();
    const fresh: string[] = [];
    for (const item of page) {
      const addr = asToken(item.address);
      if (!addr) continue;
      const key = addr.toLowerCase();
      if (seen.has(key)) continue;
      fresh.push(addr);
    }
    return fresh;
  } catch (err) {
    console.error(`watch: token list failed: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

export async function runWatch(client: PublicClient, opts: WatchOptions): Promise<void> {
  const seen = new Set<string>();
  let lastBlock = (await client.getBlockNumber()) - BigInt(opts.lookback);
  if (lastBlock < 0n) lastBlock = 0n;

  console.log(
    `rh-watch watching chain 4663. interval=${opts.intervalSec}s lookback=${opts.lookback} quietKills=${opts.quietKills}`,
  );
  console.log("Education/research only. Not a buy signal. Can go to zero.");
  console.log("Discovery: Uniswap PairCreated/PoolCreated + TokenCreated + Blockscout ERC-20 list (market-cap order).");

  // Seed token-list so we only report *new* listings, not the whole first page.
  try {
    for (const item of await fetchTokenListPage()) {
      const addr = asToken(item.address);
      if (addr) seen.add(addr.toLowerCase());
    }
  } catch {
    /* start empty */
  }

  for (;;) {
    try {
      const head = await client.getBlockNumber();
      if (head > lastBlock) {
        const tokens = await discoverNewTokens(client, lastBlock + 1n, head);
        for (const token of tokens) {
          await handleToken(client, token, seen, opts);
        }
        lastBlock = head;
      }
      for (const token of await pollTokenList(seen)) {
        await handleToken(client, token, seen, opts);
      }
    } catch (err) {
      console.error(`watch tick failed: ${err instanceof Error ? err.message : err}`);
    }
    await sleep(opts.intervalSec * 1000);
  }
}

async function handleToken(
  client: PublicClient,
  token: string,
  seen: Set<string>,
  opts: WatchOptions,
): Promise<void> {
  const key = token.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  try {
    const snapshot = await collectSnapshot(client, token);
    const report = analyze(snapshot);
    if (report.verdict === "PASS") {
      console.log(formatReport(report));
      console.log("");
    } else if (!opts.quietKills) {
      console.log(formatKillLine(report));
    }
  } catch (err) {
    if (!opts.quietKills) {
      console.log(
        `KILL ${token} ? — collect failed (fail closed): ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  await sleep(opts.analyzeDelayMs);
}
