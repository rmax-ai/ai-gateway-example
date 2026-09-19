# ai-gateway-example

Minimal examples of using the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) with the
[AI SDK](https://ai-sdk.dev) (`ai@7`).

## Setup

```bash
pnpm install
echo "AI_GATEWAY_API_KEY=your-key-here" > .env.local   # keep this file out of git
```

## Examples

| File | Model | API |
|---|---|---|
| `index.ts` | `openai/gpt-5.6-luna` | `generateText` — invents a holiday |
| `jev.ts` | `typesafe-ai/jev` | `experimental_evaluate` — typed evaluation of shared state |

```bash
pnpm start   # run index.ts
pnpm jev     # run jev.ts
```

String model ids route through the AI Gateway;
`AI_GATEWAY_API_KEY` is the only credential needed.

### Jev (evaluation model)

[Jev](https://vercel.com/ai-gateway/models/jev) (`typesafe-ai/jev`) does not
generate text — it answers **typed questions** (boolean / choice / score)
about one piece of shared state, all evaluated in parallel within a single
request. Useful for classification, routing, rubric assessment, and agent
output verification.
