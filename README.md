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
| `compare.ts` | TypeScript | Luna Max + Jev + DeepSeek Flash | Costed support-ticket triage comparison |
| `compare.py` | Python | Luna Max + Jev + DeepSeek Flash | Costed support-ticket triage comparison |

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

## Costed comparison: Luna / Jev / DeepSeek Flash — reasoning max vs none

Both examples run the same three support-ticket triage cases sequentially through five configurations: `openai/gpt-5.6-luna` and `deepseek/deepseek-v4-flash` at reasoning effort `max` and `none`, plus `typesafe-ai/jev`. Both chat models reason by default when no effort is sent, so the no-reasoning arms pass `reasoning_effort: "none"` explicitly (measured: 0 reasoning tokens). The scripts normalize department, urgency, and severity for exact agreement; record wall-clock latency and Gateway token usage; retain Gateway-reported costs; and independently compute all arms' costs from the Gateway model table (with documented fallback constants).

Latest committed runs: TypeScript `2026-09-19`; Python `2026-09-19`.

| Language | Ticket | Luna max | Luna none | Jev | DeepSeek max | DeepSeek none | All five agree |
|---|---|---|---|---|---|---|---|
| TypeScript | T1 | billing / yes / 4 | billing / yes / 4 | billing / yes / 4 | billing / yes / 4 | billing / yes / 4 | yes |
| TypeScript | T2 | tech / no / 1 | tech / no / 1 | tech / yes / 1 | tech / no / 1 | tech / no / 1 | no |
| TypeScript | T3 | sales / no / 0 | sales / no / 0 | sales / no / 0 | sales / no / 0 | sales / no / 0 | yes |
| Python | T1 | billing / yes / 4 | billing / yes / 4 | billing / yes / 4 | billing / yes / 4 | billing / yes / 4 | yes |
| Python | T2 | tech / no / 1 | tech / no / 1 | tech / yes / 1 | tech / no / 1 | tech / no / 2 | no |
| Python | T3 | sales / no / 0 | sales / no / 0 | sales / no / 0 | sales / no / 0 | sales / no / 0 | yes |

| Language | Arm | Total latency | Input / output tokens | Reasoning tokens | Gateway-reported cost | Table-computed cost |
|---|---|---:|---:|---:|---:|---:|
| TypeScript | Luna max | 6966 ms | 654 / 244 | 160 | $0.00042360 | $0.00042360 |
| TypeScript | Luna none | 2741 ms | 654 / 78 | 0 | $0.00022440 | $0.00022440 |
| TypeScript | Jev | 938 ms | 1416 / 216 | n/a | n/a | $0.00005947 |
| TypeScript | DeepSeek max | 12760 ms | 1781 / 598 | 350 | $0.00078650 | $0.00038701 |
| TypeScript | DeepSeek none | 9991 ms | 1544 / 244 | 0 | $0.00050072 | $0.00026416 |
| Python | Luna max | 7782 ms | 624 / 203 | 121 | $0.00036840 | $0.00036840 |
| Python | Luna none | 2789 ms | 624 / 78 | 0 | $0.00021840 | $0.00021840 |
| Python | Jev | 934 ms | 1416 / 216 | n/a | n/a | $0.00005947 |
| Python | DeepSeek max | 7801 ms | 1034 / 455 | 386 | $0.00052778 | $0.00025272 |
| Python | DeepSeek none | 6357 ms | 797 / 70 | 0 | $0.00022154 | $0.00012181 |

Full reports: [TypeScript Markdown](reports/comparison-typescript.md), [TypeScript JSON](reports/comparison-typescript.json), [Python Markdown](reports/comparison-python.md), and [Python JSON](reports/comparison-python.json).

Regenerate them with your local Gateway key (the scripts never write it to output):

```bash
pnpm compare
uv run --env-file .env.local compare.py
```
