"""Vercel AI Gateway + Python example.

Calls Jev (typesafe-ai/jev), TypeSafe AI's evaluation model, through the
Vercel AI Gateway evaluation protocol — the same wire format the AI SDK's
`experimental_evaluate` uses in index.ts's sibling TypeScript example.

The Gateway serves evaluations through this protocol rather than its
OpenAI-compatible endpoints, and pydantic-ai's `TypeSafeModel` integration
speaks the TypeSafe API protocol (`api.typesafe.ai`) instead, so this
example calls the Gateway endpoint directly.

Run: uv run --env-file .env.local main.py
"""

import json
import os

import httpx
from pydantic import BaseModel

GATEWAY_URL = "https://ai-gateway.vercel.sh/v4/ai/evaluation-model"
MODEL_ID = "typesafe-ai/jev"


class SupportTicketTriage(BaseModel):
    """The decision, as a typed Python object."""

    department: str
    is_urgent: bool
    severity_score: int


state = "My card was charged twice for order #4821!"

# Each key is one typed question for Jev: a pick-one, a yes/no, and a rubric.
questions = {
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


def main() -> None:
    response = httpx.post(
        GATEWAY_URL,
        # Point to Vercel AI Gateway using your Gateway credentials
        headers={
            "authorization": f"Bearer {os.environ['AI_GATEWAY_API_KEY']}",
            "ai-model-id": MODEL_ID,
            "ai-evaluation-model-specification-version": "4",
            "ai-gateway-protocol-version": "0.0.1",
            "ai-gateway-auth-method": "api-key",
        },
        json={"state": state, "questions": questions, "providerOptions": {}},
        timeout=60,
    )
    response.raise_for_status()
    answers = response.json()["answers"]
    print(json.dumps(answers, indent=2))

    # Run evaluation pass: turn Jev's answers into the typed decision.
    # A boolean answer is P(true); a score is a fractional position, so it
    # rounds to the nearest rubric level (0-4).
    triage = SupportTicketTriage(
        department=answers["department"]["choice"],
        is_urgent=answers["is_urgent"]["probability"] >= 0.5,
        severity_score=round(answers["severity_score"]["score"]),
    )
    print(f"\ntriage: {triage}")


if __name__ == "__main__":
    main()
