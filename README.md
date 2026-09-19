# ai-gateway-example

Minimal example of using the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) with the
[AI SDK](https://ai-sdk.dev) (`ai@7`). Asks the model to invent a holiday.

## Setup

```bash
pnpm install
echo "AI_GATEWAY_API_KEY=your-key-here" > .env.local   # keep this file out of git
```

## Run

```bash
pnpm start          # node --env-file=.env.local index.ts
```

The string model id `openai/gpt-5.6-luna` routes through the AI Gateway;
`AI_GATEWAY_API_KEY` is the only credential needed.
