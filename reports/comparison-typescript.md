# Luna Max vs Jev vs DeepSeek Flash — TypeScript task report

Generated: 2026-09-19T21:27:36.410Z

## Method

Nine sequential calls (Luna, then Jev, then DeepSeek Flash for each ticket). Luna used reasoning effort max and AI SDK generateObject; DeepSeek Flash used reasoning effort max and a forced tool call; Jev used the evaluation protocol. Per-token prices fetched from the public Gateway models endpoint; a brief constant supplies cached-input pricing only if that optional field is absent.

## Decisions and agreement

| Ticket | Model | Department | Urgent | Severity |
|---|---|---|---:|---:|
| T1 | openai/gpt-5.6-luna | billing | yes | 4 |
| T1 | typesafe-ai/jev | billing | yes | 4 |
| T1 | deepseek/deepseek-v4-flash | billing | yes | 4 |
| T2 | openai/gpt-5.6-luna | tech | no | 1 |
| T2 | typesafe-ai/jev | tech | yes | 1 |
| T2 | deepseek/deepseek-v4-flash | tech | no | 1 |
| T3 | openai/gpt-5.6-luna | sales | no | 0 |
| T3 | typesafe-ai/jev | sales | no | 0 |
| T3 | deepseek/deepseek-v4-flash | sales | no | 0 |

| Ticket | Luna vs Jev | Luna vs DeepSeek Flash | Jev vs DeepSeek Flash | All three |
|---|---:|---:|---:|---:|
| T1 | yes | yes | yes | yes |
| T2 | no | yes | no | no |
| T3 | yes | yes | yes | yes |

## Per-call measurements

| Ticket | Model | Latency ms | Input | Output | Reasoning | Gateway cost | Table cost | >1% divergence |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| T1 | openai/gpt-5.6-luna | 2151 | 212 | 77 | 49 | $0.00013480 | $0.00013480 | no |
| T1 | typesafe-ai/jev | 315 | 466 | 72 | n/a | n/a | $0.00001957 | n/a |
| T1 | deepseek/deepseek-v4-flash | 1932 | 587 | 199 | 116 | $0.00026048 | $0.00012805 | yes |
| T2 | openai/gpt-5.6-luna | 1986 | 222 | 97 | 69 | $0.00016080 | $0.00016080 | no |
| T2 | typesafe-ai/jev | 276 | 476 | 72 | n/a | n/a | $0.00001999 | n/a |
| T2 | deepseek/deepseek-v4-flash | 4390 | 598 | 263 | 180 | $0.00030514 | $0.00014612 | yes |
| T3 | openai/gpt-5.6-luna | 1957 | 220 | 64 | 36 | $0.00012080 | $0.00012080 | no |
| T3 | typesafe-ai/jev | 356 | 474 | 72 | n/a | n/a | $0.00001991 | n/a |
| T3 | deepseek/deepseek-v4-flash | 1566 | 517 | 80 | 0 | $0.00016654 | $0.00008801 | yes |

## Totals

| Model | Calls | Latency ms | Input | Output | Reasoning | Gateway cost | Table cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| openai/gpt-5.6-luna | 3 | 6094 | 654 | 238 | 154 | $0.00041640 | $0.00041640 |
| typesafe-ai/jev | 3 | 947 | 1416 | 216 | n/a | n/a | $0.00005947 |
| deepseek/deepseek-v4-flash | 3 | 7888 | 1702 | 542 | 296 | $0.00073216 | $0.00036218 |

## Notes

- Pricing source: `gateway-models-api`.
- Gateway/table divergence over 1%: T1, T2, T3.
- Jev has no Gateway-reported cost field; its table cost uses actual token usage and the listed per-token price.
- For multi-provider models the table estimate uses the public list price and can differ from the serving provider's rate; Gateway-reported costs are authoritative.
- DeepSeek Flash structured output uses a forced tool call: the Gateway does not expose responseFormat for this model.
