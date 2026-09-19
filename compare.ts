import { mkdir, rename, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { experimental_evaluate, generateObject } from "ai";
import { z } from "zod";

const LUNA_MODEL = "openai/gpt-5.6-luna";
const JEV_MODEL = "typesafe-ai/jev";
const MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";

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

const LUNA_INSTRUCTIONS = `Triage one support ticket using exactly these rules.
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
    for (const modelId of [LUNA_MODEL, JEV_MODEL]) {
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

function gatewayCost(metadata: unknown): number {
  const gateway = object(object(metadata)?.gateway);
  const value = gateway?.cost;
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("Luna Gateway cost metadata is missing or invalid");
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

async function callLuna(ticket: typeof tickets[number], pricing: Pricing): Promise<CallRecord> {
  const started = performance.now();
  const result = await generateObject({
    model: LUNA_MODEL,
    schema: triageSchema,
    schemaName: "support_ticket_triage",
    schemaDescription: "Routing and severity decision for one support ticket",
    instructions: LUNA_INSTRUCTIONS,
    prompt: ticket.text,
    providerOptions: { openai: { reasoningEffort: "max" } },
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(60_000),
  });
  const latencyMs = Math.round(performance.now() - started);
  const input = requiredCount(result.usage.inputTokens, "Luna input tokens");
  const output = requiredCount(result.usage.outputTokens, "Luna output tokens");
  const reasoning = result.usage.outputTokenDetails.reasoningTokens;
  const cachedInput = result.usage.inputTokenDetails.cacheReadTokens;
  const tokens: Tokens = {
    input,
    output,
    reasoning: reasoning == null ? null : requiredCount(reasoning, "Luna reasoning tokens"),
    cachedInput: cachedInput == null ? null : requiredCount(cachedInput, "Luna cached input tokens"),
  };
  const tableComputed = computedCost(tokens, pricing.ratesUsdPerToken[LUNA_MODEL]);
  return {
    ticketId: ticket.id,
    ticket: ticket.text,
    modelId: LUNA_MODEL,
    decision: triageSchema.parse(result.object),
    rawDecision: null,
    latencyMs,
    tokens,
    costUsd: costFields(gatewayCost(result.providerMetadata), tableComputed),
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
    modelId: JEV_MODEL,
    decision,
    rawDecision: { isUrgentProbability: probability, severityScore: rawScore },
    latencyMs,
    tokens,
    costUsd: costFields(null, tableComputed),
  };
}

function totalFor(calls: CallRecord[], modelId: string) {
  const selected = calls.filter((call) => call.modelId === modelId);
  if (selected.length !== 3) throw new Error(`Expected three calls for ${modelId}`);
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
  const lines = [
    "# Luna Max vs Jev — TypeScript task report",
    "",
    `Generated: ${report.timestamp}`,
    "",
    "## Method",
    "",
    `Six sequential calls (Luna then Jev for each ticket). Luna used reasoning effort max and AI SDK generateObject; Jev used the evaluation protocol. ${report.pricing.note}`,
    "",
    "## Decisions and agreement",
    "",
    "| Ticket | Model | Department | Urgent | Severity |",
    "|---|---|---|---:|---:|",
  ];
  for (const call of report.calls) lines.push(`| ${call.ticketId} | ${call.modelId} | ${call.decision.department} | ${yes(call.decision.is_urgent)} | ${call.decision.severity_score} |`);
  lines.push("", "| Ticket | Department | Urgent | Severity | All |", "|---|---:|---:|---:|---:|");
  for (const item of report.agreements) lines.push(`| ${item.ticketId} | ${yes(item.department)} | ${yes(item.is_urgent)} | ${yes(item.severity_score)} | ${yes(item.all)} |`);
  lines.push("", "## Per-call measurements", "", "| Ticket | Model | Latency ms | Input | Output | Reasoning | Gateway cost | Table cost | >1% divergence |", "|---|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const call of report.calls) lines.push(`| ${call.ticketId} | ${call.modelId} | ${call.latencyMs} | ${call.tokens.input} | ${call.tokens.output} | ${call.tokens.reasoning ?? "n/a"} | ${money(call.costUsd.gatewayReported)} | ${money(call.costUsd.tableComputed)} | ${call.costUsd.divergenceOverOnePercent == null ? "n/a" : yes(call.costUsd.divergenceOverOnePercent)} |`);
  lines.push("", "## Totals", "", "| Model | Calls | Latency ms | Input | Output | Reasoning | Gateway cost | Table cost |", "|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const modelId of [LUNA_MODEL, JEV_MODEL]) {
    const total = report.totals[modelId];
    lines.push(`| ${modelId} | ${total.calls} | ${total.latencyMs} | ${total.tokens.input} | ${total.tokens.output} | ${total.tokens.reasoning ?? "n/a"} | ${money(total.costUsd.gatewayReported)} | ${money(total.costUsd.tableComputed)} |`);
  }
  const divergent = report.calls.filter((call: CallRecord) => call.costUsd.divergenceOverOnePercent).map((call: CallRecord) => call.ticketId);
  lines.push("", "## Notes", "", `- Pricing source: \`${report.pricing.source}\`.`, `- Luna Gateway/table divergence over 1%: ${divergent.length ? divergent.join(", ") : "none"}.`, "- Jev has no Gateway-reported cost field; its table cost uses actual token usage and the listed per-token price.", "");
  return lines.join("\n");
}

async function main() {
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error("AI_GATEWAY_API_KEY is required");
  const pricing = await fetchPricing();
  const calls: CallRecord[] = [];
  for (const ticket of tickets) {
    calls.push(await callLuna(ticket, pricing));
    calls.push(await callJev(ticket, pricing));
  }
  if (calls.length !== 6 || calls.some((call) => call.tokens.input <= 0 || call.tokens.output < 0)) throw new Error("Incomplete or invalid call measurements");
  const agreements = tickets.map((ticket) => {
    const luna = calls.find((call) => call.ticketId === ticket.id && call.modelId === LUNA_MODEL)!;
    const jev = calls.find((call) => call.ticketId === ticket.id && call.modelId === JEV_MODEL)!;
    const department = luna.decision.department === jev.decision.department;
    const is_urgent = luna.decision.is_urgent === jev.decision.is_urgent;
    const severity_score = luna.decision.severity_score === jev.decision.severity_score;
    return { ticketId: ticket.id, department, is_urgent, severity_score, all: department && is_urgent && severity_score };
  });
  const totals = { [LUNA_MODEL]: totalFor(calls, LUNA_MODEL), [JEV_MODEL]: totalFor(calls, JEV_MODEL) };
  if (!(totals[LUNA_MODEL].costUsd.gatewayReported! > 0) || !(totals[LUNA_MODEL].costUsd.tableComputed > 0) || !(totals[JEV_MODEL].costUsd.tableComputed > 0)) throw new Error("Cost totals must be positive");
  const report = {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    language: "typescript",
    task: "support-ticket-triage",
    method: {
      execution: "sequential-ticket-order-luna-then-jev",
      lunaReasoningEffort: "max",
      lunaStructuredOutputMechanism: "ai-sdk-generateObject",
      jevUrgencyThreshold: 0.5,
      jevSeverityNormalization: "clamp(floor(score + 0.5), 0, 4)",
    },
    models: { luna: LUNA_MODEL, jev: JEV_MODEL },
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
