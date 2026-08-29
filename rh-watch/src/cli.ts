import { DISCLAIMER, NO_ADVICE, rpcUrl } from "./config.js";
import { analyze } from "./analyze.js";
import { collectSnapshot } from "./collect.js";
import { formatReport } from "./report.js";
import { makeClient } from "./rpc.js";
import { runWatch, type WatchOptions } from "./watch.js";

function printHelp(): void {
  console.log(`rh-watch — Robinhood Chain CA analyzer + watcher

${NO_ADVICE}
${DISCLAIMER}

Commands (from rh-watch/):
  npm run analyze -- 0xCA
  npm run watch
  npm run watch -- --quiet-kills
  npm run watch -- --interval 20 --lookback 3000

Env:
  RH_RPC_URL   default https://rpc.mainnet.chain.robinhood.com

No web app, Telegram, wallet, or auto-trade.
`);
}

function parseArgs(argv: string[]): {
  cmd: "analyze" | "watch" | "help";
  address?: string;
  watch: WatchOptions;
} {
  const args = argv.slice(2);
  const cmdRaw = args[0] ?? "help";
  const rest = args.slice(1);
  const watch: WatchOptions = {
    intervalSec: 20,
    lookback: 3000,
    quietKills: false,
    analyzeDelayMs: 1500,
  };
  let address: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] ?? "";
    if (a === "--quiet-kills") watch.quietKills = true;
    else if (a === "--interval") {
      watch.intervalSec = Number(rest[++i]);
    } else if (a === "--lookback") {
      watch.lookback = Number(rest[++i]);
    } else if (a === "--help" || a === "-h") {
      return { cmd: "help", watch };
    } else if (a.startsWith("0x") || a.startsWith("0X")) {
      address = a;
    }
  }
  if (cmdRaw === "analyze" || cmdRaw === "watch" || cmdRaw === "help") {
    return { cmd: cmdRaw, address, watch };
  }
  if (cmdRaw.startsWith("0x")) {
    return { cmd: "analyze", address: cmdRaw, watch };
  }
  return { cmd: "help", watch };
}

async function main(): Promise<void> {
  const { cmd, address, watch } = parseArgs(process.argv);
  if (cmd === "help") {
    printHelp();
    process.exit(cmd === "help" && !process.argv[2] ? 0 : 0);
  }

  const client = makeClient(rpcUrl());

  if (cmd === "analyze") {
    if (!address) {
      console.error("Usage: npm run analyze -- 0xCA");
      process.exit(2);
    }
    const snapshot = await collectSnapshot(client, address);
    const report = analyze(snapshot);
    console.log(formatReport(report));
    process.exit(report.verdict === "PASS" ? 0 : 1);
  }

  await runWatch(client, watch);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
