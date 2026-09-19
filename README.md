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

```bash
pnpm start                             # run index.ts
uv run --env-file .env.local main.py   # run main.py
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
