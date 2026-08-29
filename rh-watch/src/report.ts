import { DISCLAIMER, NO_ADVICE } from "./config.js";
import type { OwnerPowers, Report } from "./types.js";

function yn(v: boolean | null): string {
  if (v === true) return "yes";
  if (v === false) return "no";
  return "unknown";
}

function powersLine(p: OwnerPowers): string {
  const bits = [
    p.mint && "mint",
    p.pause && "pause",
    p.blacklist && "blacklist",
    p.setTax && "set tax",
  ].filter(Boolean);
  const owner = p.ownerRead ? `owner=${p.owner ?? "none"}` : "owner=unread";
  if (!bits.length) return `none (${owner})`;
  return `${bits.join(", ")} (${owner}; fns: ${p.functions.join(", ")})`;
}

export function formatReport(report: Report): string {
  const lines = [
    "=== rh-watch report ===",
    NO_ADVICE,
    DISCLAIMER,
    "",
    `Address:       ${report.address}`,
    `Name:          ${report.name ?? "?"}`,
    `Symbol:        ${report.symbol ?? "?"}`,
    `Verified:      ${yn(report.verified)}`,
    `Owner powers:  ${powersLine(report.ownerPowers)}`,
    `Tax:           ${report.tax.note}`,
    `LP:            ${report.lp.status} — ${report.lp.note}`,
    `Concentration: ${report.concentration}`,
    `Pool:          ${report.pool}`,
    `Explorer:      ${report.explorerUrl}`,
    `Verdict:       ${report.verdict}`,
    "Reasons:",
    ...report.reasons.map((r) => `  - ${r}`),
  ];
  if (report.verdict === "PASS") {
    lines.push("", DISCLAIMER);
  }
  return lines.join("\n");
}

export function formatKillLine(report: Report): string {
  const why = report.reasons[0] ?? "killed";
  const tag = report.symbol ?? report.name ?? "?";
  return `KILL ${report.address} ${tag} — ${why}`;
}
