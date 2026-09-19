"""Compare Luna Max and Jev on the same support-ticket triage task."""

from __future__ import annotations

import json
import math
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import httpx
from pydantic import BaseModel, Field

LUNA_MODEL = "openai/gpt-5.6-luna"
JEV_MODEL = "typesafe-ai/jev"
MODELS_URL = "https://ai-gateway.vercel.sh/v1/models"
CHAT_URL = "https://ai-gateway.vercel.sh/v1/chat/completions"
EVALUATION_URL = "https://ai-gateway.vercel.sh/v4/ai/evaluation-model"

TICKETS = [
    {"id": "T1", "text": "My card was charged twice for order #4821! I need this fixed today."},
    {"id": "T2", "text": "The export button in the dashboard fails with a 500 error since this morning. We have a workaround, but please look into it."},
    {"id": "T3", "text": "What does the Enterprise plan cost for 50 seats, and does it include SSO? We're evaluating options for next quarter."},
]

QUESTIONS = {
    "department": {
        "type": "choice",
        "instructions": "Department to route to: billing, tech, or sales",
        "criteria": {
            "billing": "Charges, invoices, and refunds",
            "tech": "Bugs, outages, and integration failures",
            "sales": "Pricing, plans, and purchases",
        },
    },
    "is_urgent": {
        "type": "boolean",
        "instructions": "Does this ticket require immediate attention?",
    },
    "severity_score": {
        "type": "score",
        "instructions": "How severe is the issue?",
        "criteria": [
            "No impact — cosmetic or question only",
            "Low — minor inconvenience, workaround exists",
            "Moderate — something is broken, no workaround",
            "High — major impact on work, money, or data at risk",
            "Critical — outage, security issue, or charged twice",
        ],
    },
}

LUNA_INSTRUCTIONS = """Triage one support ticket using exactly these rules.
department: choose billing (charges, invoices, and refunds), tech (bugs, outages, and integration failures), or sales (pricing, plans, and purchases).
is_urgent: whether the ticket requires immediate attention.
severity_score: choose one integer level: 0 = No impact — cosmetic or question only; 1 = Low — minor inconvenience, workaround exists; 2 = Moderate — something is broken, no workaround; 3 = High — major impact on work, money, or data at risk; 4 = Critical — outage, security issue, or charged twice."""

TRIAGE_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "department": {"type": "string", "enum": ["billing", "tech", "sales"]},
        "is_urgent": {"type": "boolean"},
        "severity_score": {"type": "integer", "minimum": 0, "maximum": 4},
    },
    "required": ["department", "is_urgent", "severity_score"],
    "additionalProperties": False,
}

FALLBACK_RATES = {
    LUNA_MODEL: {"input": 0.0000002, "output": 0.0000012, "cachedInput": 0.00000002},
    JEV_MODEL: {"input": 0.000000042, "output": 0.0, "cachedInput": 0.000000042},
}


class SupportTicketTriage(BaseModel):
    department: Literal["billing", "tech", "sales"]
    is_urgent: bool
    severity_score: int = Field(ge=0, le=4)


def as_dict(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    return value


def nonnegative_int(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"Missing or invalid {label}")
    return value


def finite_number(value: Any, label: str, *, positive: bool = False) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Missing or invalid {label}") from exc
    if not math.isfinite(result) or (positive and result <= 0) or (not positive and result < 0):
        raise ValueError(f"Missing or invalid {label}")
    return result


def fetch_pricing(client: httpx.Client) -> dict[str, Any]:
    try:
        response = client.get(MODELS_URL, timeout=10.0)
        response.raise_for_status()
        payload = as_dict(response.json(), "pricing response")
        entries = payload.get("data", payload.get("models"))
        if not isinstance(entries, list):
            raise ValueError("pricing response has no model array")
        rates: dict[str, Any] = {}
        for model_id in (LUNA_MODEL, JEV_MODEL):
            entry = next((item for item in entries if isinstance(item, dict) and item.get("id") == model_id), None)
            pricing = as_dict(as_dict(entry, f"pricing entry {model_id}").get("pricing"), f"pricing {model_id}")
            cached = pricing.get("input_cache_read", pricing.get("cachedInputTokens"))
            rates[model_id] = {
                "input": finite_number(pricing.get("input"), f"{model_id} input price"),
                "output": finite_number(pricing.get("output"), f"{model_id} output price"),
                "cachedInput": FALLBACK_RATES[model_id]["cachedInput"] if cached is None else finite_number(cached, f"{model_id} cached input price"),
            }
        return {
            "source": "gateway-models-api",
            "note": "Per-token prices fetched from the public Gateway models endpoint; a brief constant supplies cached-input pricing only if that optional field is absent.",
            "ratesUsdPerToken": rates,
        }
    except (httpx.HTTPError, ValueError, json.JSONDecodeError):
        print("Pricing fetch failed; using the reviewed fallback constants from the example.", file=sys.stderr)
        return {
            "source": "brief-fallback",
            "note": "Pricing fetch failed; used the reviewed per-token constants embedded in the example.",
            "ratesUsdPerToken": json.loads(json.dumps(FALLBACK_RATES)),
        }


def table_cost(tokens: dict[str, Any], rates: dict[str, float]) -> float:
    cached = tokens["cachedInput"] or 0
    if cached > tokens["input"]:
        raise ValueError("Cached input tokens exceed total input tokens")
    result = (tokens["input"] - cached) * rates["input"] + cached * rates["cachedInput"] + tokens["output"] * rates["output"]
    if result <= 0:
        raise ValueError("Computed cost must be positive")
    return result


def cost_fields(gateway: float | None, computed: float) -> dict[str, Any]:
    divergence = None if gateway is None else abs(computed - gateway) / gateway * 100
    return {
        "gatewayReported": gateway,
        "tableComputed": computed,
        "divergencePct": divergence,
        "divergenceOverOnePercent": None if divergence is None else divergence > 1,
    }


def call_luna(client: httpx.Client, api_key: str, ticket: dict[str, str], pricing: dict[str, Any]) -> dict[str, Any]:
    started = time.perf_counter()
    response = client.post(
        CHAT_URL,
        headers={"authorization": f"Bearer {api_key}"},
        json={
            "model": LUNA_MODEL,
            "messages": [
                {"role": "system", "content": LUNA_INSTRUCTIONS},
                {"role": "user", "content": ticket["text"]},
            ],
            "reasoning_effort": "max",
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "support_ticket_triage",
                    "strict": True,
                    "schema": TRIAGE_JSON_SCHEMA,
                },
            },
        },
    )
    response.raise_for_status()
    payload = as_dict(response.json(), "Luna response")
    latency_ms = round((time.perf_counter() - started) * 1000)
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ValueError("Luna response has no choice")
    message = as_dict(as_dict(choices[0], "Luna choice").get("message"), "Luna message")
    content = message.get("content")
    if not isinstance(content, str):
        raise ValueError("Luna response content is not JSON text")
    decision = SupportTicketTriage.model_validate_json(content)
    usage = as_dict(payload.get("usage"), "Luna usage")
    input_tokens = nonnegative_int(usage.get("prompt_tokens"), "Luna input tokens")
    output_tokens = nonnegative_int(usage.get("completion_tokens"), "Luna output tokens")
    completion_details = usage.get("completion_tokens_details")
    reasoning_value = completion_details.get("reasoning_tokens") if isinstance(completion_details, dict) else None
    prompt_details = usage.get("prompt_tokens_details")
    cached_value = prompt_details.get("cached_tokens") if isinstance(prompt_details, dict) else None
    tokens = {
        "input": input_tokens,
        "output": output_tokens,
        "reasoning": None if reasoning_value is None else nonnegative_int(reasoning_value, "Luna reasoning tokens"),
        "cachedInput": None if cached_value is None else nonnegative_int(cached_value, "Luna cached input tokens"),
    }
    gateway = finite_number(usage.get("cost"), "Luna Gateway cost", positive=True)
    computed = table_cost(tokens, pricing["ratesUsdPerToken"][LUNA_MODEL])
    return {
        "ticketId": ticket["id"], "ticket": ticket["text"], "modelId": LUNA_MODEL,
        "decision": decision.model_dump(), "rawDecision": None, "latencyMs": latency_ms,
        "tokens": tokens, "costUsd": cost_fields(gateway, computed),
    }


def call_jev(client: httpx.Client, api_key: str, ticket: dict[str, str], pricing: dict[str, Any]) -> dict[str, Any]:
    started = time.perf_counter()
    response = client.post(
        EVALUATION_URL,
        headers={
            "authorization": f"Bearer {api_key}",
            "ai-model-id": JEV_MODEL,
            "ai-evaluation-model-specification-version": "4",
            "ai-gateway-protocol-version": "0.0.1",
            "ai-gateway-auth-method": "api-key",
        },
        json={"state": ticket["text"], "questions": QUESTIONS, "providerOptions": {}},
    )
    response.raise_for_status()
    payload = as_dict(response.json(), "Jev response")
    latency_ms = round((time.perf_counter() - started) * 1000)
    answers = as_dict(payload.get("answers"), "Jev answers")
    department = as_dict(answers.get("department"), "Jev department").get("choice")
    probability = finite_number(as_dict(answers.get("is_urgent"), "Jev urgent").get("probability"), "Jev probability")
    raw_score = finite_number(as_dict(answers.get("severity_score"), "Jev severity").get("score"), "Jev score")
    if probability > 1 or raw_score > 4:
        raise ValueError("Jev probability or score is outside its valid range")
    decision = SupportTicketTriage(
        department=department,
        is_urgent=probability >= 0.5,
        severity_score=min(4, max(0, math.floor(raw_score + 0.5))),
    )
    usage = as_dict(payload.get("usage"), "Jev usage")
    tokens = {
        "input": nonnegative_int(usage.get("inputTokens"), "Jev input tokens"),
        "output": nonnegative_int(usage.get("outputTokens"), "Jev output tokens"),
        "reasoning": None,
        "cachedInput": None,
    }
    computed = table_cost(tokens, pricing["ratesUsdPerToken"][JEV_MODEL])
    return {
        "ticketId": ticket["id"], "ticket": ticket["text"], "modelId": JEV_MODEL,
        "decision": decision.model_dump(),
        "rawDecision": {"isUrgentProbability": probability, "severityScore": raw_score},
        "latencyMs": latency_ms, "tokens": tokens, "costUsd": cost_fields(None, computed),
    }


def totals_for(calls: list[dict[str, Any]], model_id: str) -> dict[str, Any]:
    selected = [call for call in calls if call["modelId"] == model_id]
    if len(selected) != 3:
        raise ValueError(f"Expected three calls for {model_id}")
    reasoning = [call["tokens"]["reasoning"] for call in selected]
    cached = [call["tokens"]["cachedInput"] for call in selected]
    gateway = [call["costUsd"]["gatewayReported"] for call in selected]
    return {
        "calls": len(selected),
        "latencyMs": sum(call["latencyMs"] for call in selected),
        "tokens": {
            "input": sum(call["tokens"]["input"] for call in selected),
            "output": sum(call["tokens"]["output"] for call in selected),
            "reasoning": None if all(value is None for value in reasoning) else sum(value or 0 for value in reasoning),
            "cachedInput": None if all(value is None for value in cached) else sum(value or 0 for value in cached),
        },
        "costUsd": {
            "gatewayReported": None if all(value is None for value in gateway) else sum(value or 0 for value in gateway),
            "tableComputed": sum(call["costUsd"]["tableComputed"] for call in selected),
        },
    }


def money(value: float | None) -> str:
    return "n/a" if value is None else f"${value:.8f}"


def yes(value: bool) -> str:
    return "yes" if value else "no"


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Luna Max vs Jev — Python task report", "", f"Generated: {report['timestamp']}", "",
        "## Method", "",
        f"Six sequential calls (Luna then Jev for each ticket). Luna used reasoning effort max and OpenAI-compatible JSON Schema structured output; Jev used the evaluation protocol. {report['pricing']['note']}", "",
        "## Decisions and agreement", "", "| Ticket | Model | Department | Urgent | Severity |", "|---|---|---|---:|---:|",
    ]
    for call in report["calls"]:
        decision = call["decision"]
        lines.append(f"| {call['ticketId']} | {call['modelId']} | {decision['department']} | {yes(decision['is_urgent'])} | {decision['severity_score']} |")
    lines.extend(["", "| Ticket | Department | Urgent | Severity | All |", "|---|---:|---:|---:|---:|"])
    for item in report["agreements"]:
        lines.append(f"| {item['ticketId']} | {yes(item['department'])} | {yes(item['is_urgent'])} | {yes(item['severity_score'])} | {yes(item['all'])} |")
    lines.extend(["", "## Per-call measurements", "", "| Ticket | Model | Latency ms | Input | Output | Reasoning | Gateway cost | Table cost | >1% divergence |", "|---|---|---:|---:|---:|---:|---:|---:|---:|"])
    for call in report["calls"]:
        tokens, cost = call["tokens"], call["costUsd"]
        divergence = "n/a" if cost["divergenceOverOnePercent"] is None else yes(cost["divergenceOverOnePercent"])
        lines.append(f"| {call['ticketId']} | {call['modelId']} | {call['latencyMs']} | {tokens['input']} | {tokens['output']} | {tokens['reasoning'] if tokens['reasoning'] is not None else 'n/a'} | {money(cost['gatewayReported'])} | {money(cost['tableComputed'])} | {divergence} |")
    lines.extend(["", "## Totals", "", "| Model | Calls | Latency ms | Input | Output | Reasoning | Gateway cost | Table cost |", "|---|---:|---:|---:|---:|---:|---:|---:|"])
    for model_id in (LUNA_MODEL, JEV_MODEL):
        total = report["totals"][model_id]
        lines.append(f"| {model_id} | {total['calls']} | {total['latencyMs']} | {total['tokens']['input']} | {total['tokens']['output']} | {total['tokens']['reasoning'] if total['tokens']['reasoning'] is not None else 'n/a'} | {money(total['costUsd']['gatewayReported'])} | {money(total['costUsd']['tableComputed'])} |")
    divergent = [call["ticketId"] for call in report["calls"] if call["costUsd"]["divergenceOverOnePercent"]]
    lines.extend(["", "## Notes", "", f"- Pricing source: `{report['pricing']['source']}`.", f"- Luna Gateway/table divergence over 1%: {', '.join(divergent) if divergent else 'none'}.", "- Jev has no Gateway-reported cost field; its table cost uses actual token usage and the listed per-token price.", ""])
    return "\n".join(lines)


def main() -> None:
    api_key = os.environ.get("AI_GATEWAY_API_KEY")
    if not api_key:
        raise RuntimeError("AI_GATEWAY_API_KEY is required")
    with httpx.Client(timeout=60.0) as client:
        pricing = fetch_pricing(client)
        calls: list[dict[str, Any]] = []
        for ticket in TICKETS:
            calls.append(call_luna(client, api_key, ticket, pricing))
            calls.append(call_jev(client, api_key, ticket, pricing))
    if len(calls) != 6 or any(call["tokens"]["input"] <= 0 or call["tokens"]["output"] < 0 for call in calls):
        raise ValueError("Incomplete or invalid call measurements")
    agreements = []
    for ticket in TICKETS:
        luna = next(call for call in calls if call["ticketId"] == ticket["id"] and call["modelId"] == LUNA_MODEL)
        jev = next(call for call in calls if call["ticketId"] == ticket["id"] and call["modelId"] == JEV_MODEL)
        department = luna["decision"]["department"] == jev["decision"]["department"]
        urgent = luna["decision"]["is_urgent"] == jev["decision"]["is_urgent"]
        severity = luna["decision"]["severity_score"] == jev["decision"]["severity_score"]
        agreements.append({"ticketId": ticket["id"], "department": department, "is_urgent": urgent, "severity_score": severity, "all": department and urgent and severity})
    totals = {LUNA_MODEL: totals_for(calls, LUNA_MODEL), JEV_MODEL: totals_for(calls, JEV_MODEL)}
    if not (totals[LUNA_MODEL]["costUsd"]["gatewayReported"] > 0 and totals[LUNA_MODEL]["costUsd"]["tableComputed"] > 0 and totals[JEV_MODEL]["costUsd"]["tableComputed"] > 0):
        raise ValueError("Cost totals must be positive")
    report = {
        "schemaVersion": 1,
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "language": "python",
        "task": "support-ticket-triage",
        "method": {
            "execution": "sequential-ticket-order-luna-then-jev",
            "lunaReasoningEffort": "max",
            "lunaStructuredOutputMechanism": "openai-response-format-json-schema",
            "jevUrgencyThreshold": 0.5,
            "jevSeverityNormalization": "clamp(floor(score + 0.5), 0, 4)",
        },
        "models": {"luna": LUNA_MODEL, "jev": JEV_MODEL},
        "pricing": pricing,
        "calls": calls,
        "agreements": agreements,
        "totals": totals,
    }
    json_text = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    markdown_text = render_markdown(report)
    reports = Path("reports")
    reports.mkdir(parents=True, exist_ok=True)
    json_tmp = reports / ".comparison-python.json.tmp"
    md_tmp = reports / ".comparison-python.md.tmp"
    json_tmp.write_text(json_text, encoding="utf-8")
    md_tmp.write_text(markdown_text, encoding="utf-8")
    json_tmp.replace(reports / "comparison-python.json")
    md_tmp.replace(reports / "comparison-python.md")
    print("Wrote reports/comparison-python.{md,json}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from exc
