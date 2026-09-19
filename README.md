# ai-gateway-example

Minimal examples of using the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) —
one TypeScript example (AI SDK) and one Python example.

## Setup

```bash
pnpm install                        # TypeScript deps
uv sync                             # Python deps (uv creates .venv)
echo "AI_GATEWAY_API_KEY=*** > .env.local   # keep this file out of git
```

## Examples

| File | Language | Model | What it shows |
|---|---|---|---|
| `index.ts` | TypeScript | `openai/gpt-5.6-luna` | `generateText` — invents a holiday |
| `main.py` | Python | `typesafe-ai/jev` | evaluation — typed support-ticket triage |
| `compare.ts` | TypeScript | Luna Max + Jev | Costed support-ticket triage comparison |
| `compare.py` | Python | Luna Max + Jev | Costed support-ticket triage comparison |

```bash
pnpm start                             # run index.ts
uv run --env-file .env.local main.py   # run main.py
pnpm compare                                # run the TypeScript comparison
uv run --env-file .env.local compare.py    # run the Python comparison
```

`AI_GATEWAY_API_KEY` is the only credential needed, for both languages.

### Jev (evaluation model)

[Jev](https://vercel.com/ai-gateway/models/jev) (`typesafe-ai/jev`) does not
generate text: it answers **typed questions** (boolean / choice / score)
about one piece of shared state, all evaluated in parallel in a single
request. Useful for classification, routing, rubric assessment, and agent
output verification.

Via the Gateway, evaluations are served through the AI SDK's evaluation
protocol — in TypeScript that is `experimental_evaluate` from the `ai`
package; `main.py` calls the same HTTP endpoint directly from Python. Note
that pydantic-ai's `TypeSafeModel` integration speaks the TypeSafe API
protocol and targets `api.typesafe.ai`, not the Gateway.

## Costed comparison: Luna Max vs Jev

Both examples run the same three support-ticket triage cases sequentially through `openai/gpt-5.6-luna` at reasoning effort `max` and `typesafe-ai/jev`. They normalize department, urgency, and severity for exact agreement; record wall-clock latency and Gateway token usage; retain Luna's Gateway-reported cost; and independently compute both models' costs from the Gateway model table (with documented fallback constants).

Latest committed runs: TypeScript `2026-09-19`; Python `2026-09-19`.

| Language | Ticket | Model | Department | Urgent | Severity | Agreement (all fields) |
|---|---|---|---|---:|---:|---:|
| TypeScript | T1 | Luna Max | billing | yes | 4 | yes |
| TypeScript | T1 | Jev | billing | yes | 4 | yes |
| TypeScript | T2 | Luna Max | tech | no | 1 | no |
| TypeScript | T2 | Jev | tech | yes | 1 | no |
| TypeScript | T3 | Luna Max | sales | no | 0 | yes |
| TypeScript | T3 | Jev | sales | no | 0 | yes |
| Python | T1 | Luna Max | billing | yes | 4 | yes |
| Python | T1 | Jev | billing | yes | 4 | yes |
| Python | T2 | Luna Max | tech | no | 1 | no |
| Python | T2 | Jev | tech | yes | 1 | no |
| Python | T3 | Luna Max | sales | no | 0 | yes |
| Python | T3 | Jev | sales | no | 0 | yes |

| Language | Model | Total latency | Input / output tokens | Gateway-reported cost | Table-computed cost |
|---|---|---:|---:|---:|---:|
| TypeScript | Luna Max | 4904 ms | 654 / 197 | $0.00036720 | $0.00036720 |
| TypeScript | Jev | 977 ms | 1416 / 216 | n/a | $0.00005947 |
| Python | Luna Max | 5041 ms | 624 / 202 | $0.00036720 | $0.00036720 |
| Python | Jev | 1132 ms | 1416 / 216 | n/a | $0.00005947 |

Full reports: [TypeScript Markdown](reports/comparison-typescript.md), [TypeScript JSON](reports/comparison-typescript.json), [Python Markdown](reports/comparison-python.md), and [Python JSON](reports/comparison-python.json).

Regenerate them with your local Gateway key (the scripts never write it to output):

```bash
pnpm compare
uv run --env-file .env.local compare.py
```
