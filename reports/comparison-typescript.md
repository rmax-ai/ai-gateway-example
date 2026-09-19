# Luna Max vs Jev — TypeScript task report

Generated: 2026-09-19T20:44:00.316Z

## Method

Six sequential calls (Luna then Jev for each ticket). Luna used reasoning effort max and AI SDK generateObject; Jev used the evaluation protocol. Per-token prices fetched from the public Gateway models endpoint; a brief constant supplies cached-input pricing only if that optional field is absent.

## Decisions and agreement

| Ticket | Model | Department | Urgent | Severity |
|---|---|---|---:|---:|
| T1 | openai/gpt-5.6-luna | billing | yes | 4 |
| T1 | typesafe-ai/jev | billing | yes | 4 |
| T2 | openai/gpt-5.6-luna | tech | no | 1 |
| T2 | typesafe-ai/jev | tech | yes | 1 |
| T3 | openai/gpt-5.6-luna | sales | no | 0 |
| T3 | typesafe-ai/jev | sales | no | 0 |

| Ticket | Department | Urgent | Severity | All |
|---|---:|---:|---:|---:|
| T1 | yes | yes | yes | yes |
| T2 | yes | no | yes | no |
| T3 | yes | yes | yes | yes |

## Per-call measurements

| Ticket | Model | Latency ms | Input | Output | Reasoning | Gateway cost | Table cost | >1% divergence |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| T1 | openai/gpt-5.6-luna | 1676 | 212 | 67 | 39 | $0.00012280 | $0.00012280 | no |
| T1 | typesafe-ai/jev | 300 | 466 | 72 | n/a | n/a | $0.00001957 | n/a |
| T2 | openai/gpt-5.6-luna | 2281 | 222 | 104 | 76 | $0.00016920 | $0.00016920 | no |
| T2 | typesafe-ai/jev | 350 | 476 | 72 | n/a | n/a | $0.00001999 | n/a |
| T3 | openai/gpt-5.6-luna | 947 | 220 | 26 | 0 | $0.00007520 | $0.00007520 | no |
| T3 | typesafe-ai/jev | 327 | 474 | 72 | n/a | n/a | $0.00001991 | n/a |

## Totals

| Model | Calls | Latency ms | Input | Output | Reasoning | Gateway cost | Table cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| openai/gpt-5.6-luna | 3 | 4904 | 654 | 197 | 115 | $0.00036720 | $0.00036720 |
| typesafe-ai/jev | 3 | 977 | 1416 | 216 | n/a | n/a | $0.00005947 |

## Notes

- Pricing source: `gateway-models-api`.
- Luna Gateway/table divergence over 1%: none.
- Jev has no Gateway-reported cost field; its table cost uses actual token usage and the listed per-token price.
