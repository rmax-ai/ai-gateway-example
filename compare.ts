import { mkdir, rename, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { experimental_evaluate, generateObject, generateText, tool } from "ai";
import { z } from "zod";

const LUNA_MODEL = "openai/gpt-5.6-luna";
const JEV_MODEL = "typesafe-ai/jev";
const DEEPSEEK_MODEL = "deepseek/deepseek-v4-flash";
const MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";

const ARMS = [
  { id: "luna-max", modelId: LUNA_MODEL, reasoningEffort: "max", structuredOutputMechanism: "ai-sdk-generateObject" },
  { id: "luna-none", modelId: LUNA_MODEL, reasoningEffort: "none", structuredOutputMechanism: "ai-sdk-generateObject" },
  { id: "jev", modelId: JEV_MODEL, reasoningEffort: null, structuredOutputMechanism: "evaluation-protocol" },
  { id: "deepseek-max", modelId: DEEPSEEK_MODEL, reasoningEffort: "max", structuredOutputMechanism: "ai-sdk-forced-tool" },
  { id: "deepseek-none", modelId: DEEPSEEK_MODEL, reasoningEffort: "none", structuredOutputMechanism: "ai-sdk-forced-tool" },
] as const;

const tickets = [
  { id: "T1", text: "My card was charged twice for order #4821! I need this fixed today." },
  { id: "T2", text: "The export button in the dashboard fails with a 500 error since this morning. We have a workaround, but please look into it." },
  { id: "T3", text: "What does the Enterprise plan cost for 50 seats, and does it include SSO? We're evaluating options for next quarter." },
] as const;

const questions = {
  department: {
    type: "choice",
    instructions: "Department to route to: billing, tech, or sales",
    criteria: {
      billing: "Charges, invoices, and refunds",
      tech: "Bugs, outages, and integration failures",
      sales: "Pricing, plans, and purchases",
    },
  },
  is_urgent: {
    type: "boolean",
    instructions: "Does this ticket require immediate attention?",
  },
  severity_score: {
    type: "score",
    instructions: "How severe is the issue?",
    criteria: [
      "No impact — cosmetic or question only",
      "Low — minor inconvenience, workaround exists",
      "Moderate — something is broken, no workaround",
      "High — major impact on work, money, or data at risk",
      "Critical — outage, security issue, or charged twice",
    ],
  },
} as const;

const TRIAGE_INSTRUCTIONS = `Triage one support ticket using exactly these rules.
department: choose billing (charges, invoices, and refunds), tech (bugs, outages, and integration failures), or sales (pricing, plans, and purchases).
is_urgent: whether the ticket requires immediate attention.
severity_score: choose one integer level: 0 = No impact — cosmetic or question only; 1 = Low — minor inconvenience, workaround exists; 2 = Moderate — something is broken, no workaround; 3 = High — major impact on work, money, or data at risk; 4 = Critical — outage, security issue, or charged twice.`;

const triageSchema = z.object({
  department: z.enum(["billing", "tech", "sales"]),
  is_urgent: z.boolean(),
  severity_score: z.number().int().min(0).max(4),
});

type Triage = z.infer<typeof triageSchema>;
type Rates = { input: number; output: number; cachedInput: number };
type Pricing = {
  source: "gateway-models-api" | "brief-fallback";
  note: string;
  ratesUsdPerToken: Record<string, Rates>;
};
type Tokens = { input: number; output: number; reasoning: number | null; cachedInput: number | null };
type CallRecord = {
  ticketId: string;
  ticket: string;
  armId: string;
  modelId: string;
  decision: Triage;
  rawDecision: { isUrgentProbability: number; severityScore: number } | null;
  latencyMs: number;
  tokens: Tokens;
  costUsd: {
    gatewayReported: number | null;
    tableComputed: number;
    divergencePct: number | null;
    divergenceOverOnePercent: boolean | null;
  };
};

const FALLBACK_RATES: Record<string, Rates> = {
  [LUNA_MODEL]: { input: 0.0000002, output: 0.0000012, cachedInput: 0.00000002 },
  [JEV_MODEL]: { input: 0.000000042, output: 0, cachedInput: 0.000000042 },
  [DEEPSEEK_MODEL]: { input: 0.00000013, output: 0.00000026, cachedInput: 0.000000028 },
};

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function rate(value: unknown): number {
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("invalid pricing value");
  return parsed;
}

async function fetchPricing(): Promise<Pricing> {
  try {
    const response = await fetch(MODELS_URL, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`pricing HTTP ${response.status}`);
    const payload = object(await response.json());
    const entries = payload && (Array.isArray(payload.data) ? payload.data : payload.models);
    if (!Array.isArray(entries)) throw new Error("pricing response has no model array");

    const rates: Record<string, Rates> = {};
    for (const modelId of [LUNA_MODEL, JEV_MODEL, DEEPSEEK_MODEL]) {
      const entry = entries.map(object).find((candidate) => candidate?.id === modelId);
      const pricing = object(entry?.pricing);
      if (!pricing) throw new Error(`pricing missing for ${modelId}`);
      const fallback = FALLBACK_RATES[modelId];
      rates[modelId] = {
        input: rate(pricing.input),
        output: rate(pricing.output),
        cachedInput: pricing.input_cache_read != null
          ? rate(pricing.input_cache_read)
          : pricing.cachedInputTokens != null
            ? rate(pricing.cachedInputTokens)
            : fallback.cachedInput,
      };
    }
    return {
      source: "gateway-models-api",
      note: "Per-token prices fetched from the public Gateway models endpoint; a brief constant supplies cached-input pricing only if that optional field is absent.",
      ratesUsdPerToken: rates,
    };
  } catch {
    console.warn("Pricing fetch failed; using the reviewed fallback constants from the example.");
    return {
      source: "brief-fallback",
      note: "Pricing fetch failed; used the reviewed per-token constants embedded in the example.",
      ratesUsdPerToken: structuredClone(FALLBACK_RATES),
    };
  }
}

function requiredCount(value: number | undefined, label: string): number {
  if (!Number.isInteger(value) || value == null || value < 0) throw new Error(`Missing or invalid ${label}`);
  return value;
}

function computedCost(tokens: Tokens, rates: Rates): number {
  const cached = tokens.cachedInput ?? 0;
  if (cached > tokens.input) throw new Error("Cached input tokens exceed total input tokens");
  return (tokens.input - cached) * rates.input + cached * rates.cachedInput + tokens.output * rates.output;
}

function gatewayCost(metadata: unknown, label: string): number {
  const gateway = object(object(metadata)?.gateway);
  const value = gateway?.cost;
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} Gateway cost metadata is missing or invalid`);
  return parsed;
}

function costFields(gatewayReported: number | null, tableComputed: number) {
  if (!(tableComputed > 0)) throw new Error("Computed cost must be positive");
  const divergencePct = gatewayReported == null
    ? null
    : Math.abs(tableComputed - gatewayReported) / gatewayReported * 100;
  return {
    gatewayReported,
    tableComputed,
    divergencePct,
    divergenceOverOnePercent: divergencePct == null ? null : divergencePct > 1,
  };
}

async function callLuna(ticket: typeof tickets[number], pricing: Pricing, effort: "max" | "none"): Promise<CallRecord> {
  const armId = `luna-${effort}`;
  const started = performance.now();
  const result = await generateObject({
    model: LUNA_MODEL,
    schema: triageSchema,
    schemaName: "support_ticket_triage",
    schemaDescription: "Routing and severity decision for one support ticket",
    instructions: TRIAGE_INSTRUCTIONS,
    prompt: ticket.text,
    providerOptions: { openai: { reasoningEffort: effort } },
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(60_000),
  });
  const latencyMs = Math.round(performance.now() - started);
  const input = requiredCount(result.usage.inputTokens, `${armId} input tokens`);
  const output = requiredCount(result.usage.outputTokens, `${armId} output tokens`);
  const reasoning = result.usage.outputTokenDetails.reasoningTokens;
  const cachedInput = result.usage.inputTokenDetails.cacheReadTokens;
  const tokens: Tokens = {
    input,
    output,
    reasoning: reasoning == null ? null : requiredCount(reasoning, `${armId} reasoning tokens`),
    cachedInput: cachedInput == null ? null : requiredCount(cachedInput, `${armId} cached input tokens`),
  };
  const tableComputed = computedCost(tokens, pricing.ratesUsdPerToken[LUNA_MODEL]);
  return {
    ticketId: ticket.id,
    ticket: ticket.text,
    armId,
    modelId: LUNA_MODEL,
    decision: triageSchema.parse(result.object),
    rawDecision: null,
    latencyMs,
    tokens,
    costUsd: costFields(gatewayCost(result.providerMetadata, armId), tableComputed),
  };
}

async function callDeepseek(ticket: typeof tickets[number], pricing: Pricing, effort: "max" | "none"): Promise<CallRecord> {
  const armId = `deepseek-${effort}`;
  const started = performance.now();
  // The Gateway does not expose responseFormat for DeepSeek Flash, so structured
  // output goes through a forced tool call (deepseek routes declare tool support).
  const result = await generateText({
    model: DEEPSEEK_MODEL,
    tools: {
      submit_triage: tool({
        description: "Submit the triage decision for the ticket.",
        inputSchema: triageSchema,
      }),
    },
    toolChoice: { type: "tool", toolName: "submit_triage" },
    instructions: TRIAGE_INSTRUCTIONS,
    prompt: ticket.text,
    providerOptions: { deepseek: { reasoningEffort: effort } },
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(60_000),
  });
  const latencyMs = Math.round(performance.now() - started);
  const toolCall = result.toolCalls[0];
  if (!toolCall || toolCall.toolName !== "submit_triage") throw new Error(`${armId} did not call submit_triage`);
  const input = requiredCount(result.usage.inputTokens, `${armId} input tokens`);
  const output = requiredCount(result.usage.outputTokens, `${armId} output tokens`);
  const reasoning = result.usage.outputTokenDetails.reasoningTokens;
  const cachedInput = result.usage.inputTokenDetails.cacheReadTokens;
  const tokens: Tokens = {
    input,
    output,
    reasoning: reasoning == null ? null : requiredCount(reasoning, `${armId} reasoning tokens`),
    cachedInput: cachedInput == null ? null : requiredCount(cachedInput, `${armId} cached input tokens`),
  };
  const tableComputed = computedCost(tokens, pricing.ratesUsdPerToken[DEEPSEEK_MODEL]);
  return {
    ticketId: ticket.id,
    ticket: ticket.text,
    armId,
    modelId: DEEPSEEK_MODEL,
    decision: triageSchema.parse(toolCall.input),
    rawDecision: null,
    latencyMs,
    tokens,
    costUsd: costFields(gatewayCost(result.providerMetadata, armId), tableComputed),
  };
}

async function callJev(ticket: typeof tickets[number], pricing: Pricing): Promise<CallRecord> {
  const started = performance.now();
  const result = await experimental_evaluate({
    model: JEV_MODEL,
    state: ticket.text,
    questions,
    providerOptions: {},
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(60_000),
  });
  const latencyMs = Math.round(performance.now() - started);
  const input = requiredCount(result.usage.inputTokens, "Jev input tokens");
  const output = requiredCount(result.usage.outputTokens, "Jev output tokens");
  const probability = result.answers.is_urgent.probability;
  const rawScore = result.answers.severity_score.score;
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new Error("Invalid Jev probability");
  if (!Number.isFinite(rawScore) || rawScore < 0 || rawScore > 4) throw new Error("Invalid Jev score");
  const decision = triageSchema.parse({
    department: result.answers.department.choice,
    is_urgent: probability >= 0.5,
    severity_score: Math.min(4, Math.max(0, Math.floor(rawScore + 0.5))),
  });
  const tokens: Tokens = { input, output, reasoning: null, cachedInput: null };
  const tableComputed = computedCost(tokens, pricing.ratesUsdPerToken[JEV_MODEL]);
  return {
    ticketId: ticket.id,
    ticket: ticket.text,
    armId: "jev",
    modelId: JEV_MODEL,
    decision,
    rawDecision: { isUrgentProbability: probability, severityScore: rawScore },
    latencyMs,
    tokens,
    costUsd: costFields(null, tableComputed),
  };
}

function totalFor(calls: CallRecord[], armId: string) {
  const selected = calls.filter((call) => call.armId === armId);
  if (selected.length !== 3) throw new Error(`Expected three calls for ${armId}`);
  const reasoningValues = selected.map((call) => call.tokens.reasoning);
  const cachedValues = selected.map((call) => call.tokens.cachedInput);
  const gatewayValues = selected.map((call) => call.costUsd.gatewayReported);
  return {
    calls: selected.length,
    latencyMs: selected.reduce((sum, call) => sum + call.latencyMs, 0),
    tokens: {
      input: selected.reduce((sum, call) => sum + call.tokens.input, 0),
      output: selected.reduce((sum, call) => sum + call.tokens.output, 0),
      reasoning: reasoningValues.every((value) => value == null)
        ? null
        : reasoningValues.reduce<number>((sum, value) => sum + (value ?? 0), 0),
      cachedInput: cachedValues.every((value) => value == null)
        ? null
        : cachedValues.reduce<number>((sum, value) => sum + (value ?? 0), 0),
    },
    costUsd: {
      gatewayReported: gatewayValues.every((value) => value == null)
        ? null
        : gatewayValues.reduce<number>((sum, value) => sum + (value ?? 0), 0),
      tableComputed: selected.reduce((sum, call) => sum + call.costUsd.tableComputed, 0),
    },
  };
}

function money(value: number | null): string { return value == null ? "n/a" : `$${value.toFixed(8)}`; }
function yes(value: boolean): string { return value ? "yes" : "no"; }

function markdown(report: any): string {
  const armIds: string[] = report.method.arms.map((arm: { id: string }) => arm.id);
  const pairFor = (item: any, a: string, b: string) => item.pairs[`${a}-vs-${b}`] ?? item.pairs[`${b}-vs-${a}`];
  const lines = [
    "# Support-ticket triage: reasoning max vs none — TypeScript task report",
    "",
    `Generated: ${report.timestamp}`,
    "",
    "## Method",
    "",
    `Fifteen sequential calls (per ticket: Luna max, Luna none, Jev, DeepSeek max, DeepSeek none). Luna used AI SDK generateObject; DeepSeek Flash used a forced tool call; Jev used the evaluation protocol. ${report.method.reasoningNote} ${report.pricing.note}`,
    "",
    "## Decisions and agreement",
    "",
    "| Ticket | Arm | Model | Department | Urgent | Severity |",
    "|---|---|---|---|---:|---:|",
  ];
  for (const call of report.calls) lines.push(`| ${call.ticketId} | ${call.armId} | ${call.modelId} | ${call.decision.department} | ${yes(call.decision.is_urgent)} | ${call.decision.severity_score} |`);
  for (const item of report.agreements) {
    lines.push("", `Pairwise agreement (all three fields) — ${item.ticketId}:`, "");
    lines.push(`| | ${armIds.join(" | ")} |`);
    lines.push(`|---|${"---|".repeat(armIds.length)}`);
    for (const a of armIds) {
      const cells = armIds.map((b: string) => (a === b ? "—" : yes(pairFor(item, a, b).all)));
      lines.push(`| ${a} | ${cells.join(" | ")} |`);
    }
    const disagreeing = Object.entries(item.pairs).filter(([, pair]) => !(pair as { all: boolean }).all).map(([key]) => key.replace("-vs-", " vs "));
    lines.push("", item.all ? `${item.ticketId}: all five configurations agree.` : `${item.ticketId}: not unanimous — disagreeing pairs: ${disagreeing.join(", ")}.`);
  }
  lines.push("", "## Per-call measurements", "", "| Ticket | Arm | Latency ms | Input | Output | Reasoning | Gateway cost | Table cost | >1% divergence |", "|---|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const call of report.calls) lines.push(`| ${call.ticketId} | ${call.armId} | ${call.latencyMs} | ${call.tokens.input} | ${call.tokens.output} | ${call.tokens.reasoning ?? "n/a"} | ${money(call.costUsd.gatewayReported)} | ${money(call.costUsd.tableComputed)} | ${call.costUsd.divergenceOverOnePercent == null ? "n/a" : yes(call.costUsd.divergenceOverOnePercent)} |`);
  lines.push("", "## Totals", "", "| Arm | Model | Calls | Latency ms | Input | Output | Reasoning | Gateway cost | Table cost |", "|---|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const arm of report.method.arms) {
    const total = report.totals[arm.id];
    lines.push(`| ${arm.id} | ${arm.modelId} | ${total.calls} | ${total.latencyMs} | ${total.tokens.input} | ${total.tokens.output} | ${total.tokens.reasoning ?? "n/a"} | ${money(total.costUsd.gatewayReported)} | ${money(total.costUsd.tableComputed)} |`);
  }
  const divergent = report.calls.filter((call: CallRecord) => call.costUsd.divergenceOverOnePercent).map((call: CallRecord) => `${call.ticketId} (${call.armId})`);
  lines.push("", "## Notes", "",
    `- Pricing source: \`${report.pricing.source}\`.`,
    `- Gateway/table divergence over 1%: ${divergent.length ? divergent.join(", ") : "none"}.`,
    "- Both chat models reason by default when reasoning effort is omitted; the `none` arms send reasoning effort `none` explicitly (measured: 0 reasoning tokens).",
    "- Jev has no Gateway-reported cost field; its table cost uses actual token usage and the listed per-token price.",
    "- For multi-provider models the table estimate uses the public list price and can differ from the serving provider's rate; Gateway-reported costs are authoritative.",
    "- DeepSeek Flash structured output uses a forced tool call: the Gateway does not expose responseFormat for this model.",
    "");
  return lines.join("\n");
}

async function main() {
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error("AI_GATEWAY_API_KEY is required");
  const pricing = await fetchPricing();
  const calls: CallRecord[] = [];
  for (const ticket of tickets) {
    calls.push(await callLuna(ticket, pricing, "max"));
    calls.push(await callLuna(ticket, pricing, "none"));
    calls.push(await callJev(ticket, pricing));
    calls.push(await callDeepseek(ticket, pricing, "max"));
    calls.push(await callDeepseek(ticket, pricing, "none"));
  }
  if (calls.length !== 15 || calls.some((call) => call.tokens.input <= 0 || call.tokens.output < 0)) throw new Error("Incomplete or invalid call measurements");
  const agreements = tickets.map((ticket) => {
    const decisionFor = (armId: string) =>
      calls.find((call) => call.ticketId === ticket.id && call.armId === armId)!.decision;
    const compare = (a: string, b: string) => {
      const x = decisionFor(a);
      const y = decisionFor(b);
      const department = x.department === y.department;
      const is_urgent = x.is_urgent === y.is_urgent;
      const severity_score = x.severity_score === y.severity_score;
      return { department, is_urgent, severity_score, all: department && is_urgent && severity_score };
    };
    const pairs: Record<string, ReturnType<typeof compare>> = {};
    for (let i = 0; i < ARMS.length; i += 1) {
      for (let j = i + 1; j < ARMS.length; j += 1) {
        pairs[`${ARMS[i].id}-vs-${ARMS[j].id}`] = compare(ARMS[i].id, ARMS[j].id);
      }
    }
    return { ticketId: ticket.id, pairs, all: Object.values(pairs).every((pair) => pair.all) };
  });
  const totals: Record<string, ReturnType<typeof totalFor>> = {};
  for (const arm of ARMS) totals[arm.id] = totalFor(calls, arm.id);
  for (const arm of ARMS) {
    const total = totals[arm.id];
    if (!(total.costUsd.tableComputed > 0)) throw new Error(`Table cost for ${arm.id} must be positive`);
    if (arm.modelId !== JEV_MODEL && !((total.costUsd.gatewayReported ?? 0) > 0)) throw new Error(`Gateway cost for ${arm.id} must be positive`);
  }
  for (const armId of ["luna-none", "deepseek-none"] as const) {
    if (totals[armId].tokens.reasoning !== 0) throw new Error(`Expected zero reasoning tokens for ${armId}`);
  }
  const report = {
    schemaVersion: 3,
    timestamp: new Date().toISOString(),
    language: "typescript",
    task: "support-ticket-triage",
    method: {
      execution: "sequential-ticket-order-luna-max-luna-none-jev-deepseek-max-deepseek-none",
      arms: ARMS,
      reasoningNote: "Both chat models reason by default when reasoning effort is omitted; the 'none' arms send reasoning effort 'none' explicitly (measured: 0 reasoning tokens).",
      jevUrgencyThreshold: 0.5,
      jevSeverityNormalization: "clamp(floor(score + 0.5), 0, 4)",
    },
    models: { luna: LUNA_MODEL, jev: JEV_MODEL, deepseek: DEEPSEEK_MODEL },
    pricing,
    calls,
    agreements,
    totals,
  };
  const json = JSON.stringify(report, null, 2) + "\n";
  const md = markdown(report);
  await mkdir("reports", { recursive: true });
  await Promise.all([
    writeFile("reports/.comparison-typescript.json.tmp", json, "utf8"),
    writeFile("reports/.comparison-typescript.md.tmp", md, "utf8"),
  ]);
  await rename("reports/.comparison-typescript.json.tmp", "reports/comparison-typescript.json");
  await rename("reports/.comparison-typescript.md.tmp", "reports/comparison-typescript.md");
  console.log("Wrote reports/comparison-typescript.{md,json}");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Comparison failed");
  process.exitCode = 1;
});
