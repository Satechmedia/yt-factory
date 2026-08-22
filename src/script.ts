import type { Script } from "./types.ts";
import { assertValidScript } from "./validate.ts";

function normalize(topic: string): string {
  return topic.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Original plain-English money explainers. These are written here, not
 * scraped from other channels, and they are not trading signals.
 */
const CURATED: Array<{ match: (n: string) => boolean; script: Omit<Script, "topic"> }> = [
  {
    match: (n) => n.includes("emergency fund"),
    script: {
      hook: "An emergency fund is not leftover cash. It is money that stops a surprise from becoming debt.",
      beats: [
        "It is a cash buffer you can spend this week without selling investments or borrowing.",
        "It is not your retirement account, not stocks, and not the checking account you live on.",
        "Without it, a car repair or missed paycheck often hits a card, and interest adds a second problem.",
        "Start with one thousand dollars. Then aim for three months of must-pay bills, not your whole lifestyle.",
        "Keep it in a separate savings account you can reach in a day or two. Not in the market.",
        "If you would hesitate to use it tomorrow, it is not an emergency fund.",
      ],
      cta: "Save this, then do one step today: open a separate savings account or move your first fifty dollars.",
    },
  },
  {
    match: (n) => n.includes("compound interest"),
    script: {
      hook: "Compound interest is not a hack. It is interest that starts earning interest.",
      beats: [
        "You earn a return on the original cash, then on the growth that already piled up.",
        "It is not a stock tip, and not a reason to borrow so you can compound faster.",
        "It helps a savings balance, and it hurts a credit card you do not pay off.",
        "The plain rule is leave the money alone and keep adding. Interrupting the pile resets the clock.",
        "Early years look small. Later years look large because the pile is already wide.",
        "The usual mistake is waiting for a perfect start. A small amount that sits beats a plan that never begins.",
      ],
      cta: "Save this, then set one automatic transfer this week, even if it is only twenty dollars.",
    },
  },
  {
    match: (n) =>
      n.includes("high yield") || n.includes("hysa") || n.includes("high yield savings"),
    script: {
      hook: "A high-yield savings account is still just savings. The yield is the interest the bank pays you to park cash.",
      beats: [
        "You keep everyday access, but the cash sits in a separate account instead of a spending balance.",
        "It is not investing, not a CD lockup, and not a way to beat the stock market.",
        "It is a good home for an emergency fund or a bill you will pay in a few months.",
        "Compare the annual percentage yield, fees, and how fast you can move money back to checking.",
        "If the rate can change, that is normal. You are renting a parking spot for cash, not buying a return.",
      ],
      cta: "If you have cash sitting in checking, save this and move a first slice into a separate savings account.",
    },
  },
  {
    match: (n) => n.includes("sinking fund"),
    script: {
      hook: "A sinking fund is savings with a name on it. You are paying a future bill in small pieces, on purpose.",
      beats: [
        "Think car insurance, a flight, or a new laptop — costs you can see coming.",
        "It is not an emergency fund. Emergencies are surprises. A sinking fund is for the bill you already expect.",
        "Pick the cost, divide by the months you have, and move that amount automatically.",
        "Keep it separate from rent money so a planned expense does not raid the grocery budget.",
        "The usual mistake is calling every large purchase an emergency after you failed to plan for it.",
      ],
      cta: "Save this, then name one upcoming bill and open a labeled savings pile for it this week.",
    },
  },
];

function shortLabel(topic: string): string {
  const cleaned = topic.replace(/[?!.,]/g, "").trim() || "this idea";
  const words = cleaned.split(/\s+/);
  return words.length <= 8 ? cleaned : words.slice(0, 8).join(" ");
}

function composeGeneric(topic: string): Omit<Script, "topic"> {
  const name = shortLabel(topic);

  return {
    hook: `"${name}" is not a hot tip. It is a plainer money rule, not a trick.`,
    beats: [
      "In one sentence, it is a way to handle cash so a normal month does not become a scramble.",
      "It is not a trading signal, not a stock pick, and not a promise you will get rich this year.",
      "You feel it when a bill lands, a balance grows, or a paycheck has to stretch.",
      "Give the money a job, keep that job boring, and do not mix it with spending money.",
      "A useful check: can you say the next step in one line — move cash, wait, or pay what you owe?",
      "The usual mistake is treating the idea like a shortcut. Clarity first, then one small action.",
    ],
    cta: "If that framing helped, save this and take one small step this week.",
  };
}

export function writeScriptMarkdown(script: Script): string {
  const beats = script.beats
    .map((beat, index) => `${index + 1}. ${beat}`)
    .join("\n");

  return [
    `# ${script.topic}`,
    "",
    "## Hook",
    "",
    script.hook,
    "",
    "## Beats",
    "",
    beats,
    "",
    "## CTA",
    "",
    script.cta,
    "",
  ].join("\n");
}

export function generateScript(topic: string): Script {
  const trimmed = topic.trim();
  if (!trimmed) {
    throw new Error("A topic is required.");
  }

  const key = normalize(trimmed);
  const curated = CURATED.find((entry) => entry.match(key));
  const body = curated ? curated.script : composeGeneric(trimmed);
  const script: Script = { topic: trimmed, ...body };
  assertValidScript(script);
  return script;
}
