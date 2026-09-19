# Luna Max vs Jev vs DeepSeek Flash — Python task report

Generated: 2026-09-19T21:25:41.855980Z

## Method

Nine sequential calls (Luna, then Jev, then DeepSeek Flash for each ticket). Luna and DeepSeek Flash used reasoning effort max and OpenAI-compatible JSON Schema structured output; Jev used the evaluation protocol. Per-token prices fetched from the public Gateway models endpoint; a brief constant supplies cached-input pricing only if that optional field is absent.

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
| T1 | openai/gpt-5.6-luna | 1983 | 202 | 63 | 35 | $0.00011600 | $0.00011600 | no |
| T1 | typesafe-ai/jev | 288 | 466 | 72 | n/a | n/a | $0.00001957 | n/a |
| T1 | deepseek/deepseek-v4-flash | 1046 | 338 | 90 | 65 | $0.00013376 | $0.00006734 | yes |
| T2 | openai/gpt-5.6-luna | 2292 | 212 | 105 | 77 | $0.00016840 | $0.00016840 | no |
| T2 | typesafe-ai/jev | 336 | 476 | 72 | n/a | n/a | $0.00001999 | n/a |
| T2 | deepseek/deepseek-v4-flash | 4218 | 349 | 185 | 161 | $0.00019888 | $0.00009347 | yes |
| T3 | openai/gpt-5.6-luna | 852 | 210 | 26 | 0 | $0.00007320 | $0.00007320 | no |
| T3 | typesafe-ai/jev | 481 | 474 | 72 | n/a | n/a | $0.00001991 | n/a |
| T3 | deepseek/deepseek-v4-flash | 1361 | 347 | 57 | 37 | $0.00011396 | $0.00005993 | yes |

## Totals

| Model | Calls | Latency ms | Input | Output | Reasoning | Gateway cost | Table cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| openai/gpt-5.6-luna | 3 | 5127 | 624 | 194 | 112 | $0.00035760 | $0.00035760 |
| typesafe-ai/jev | 3 | 1105 | 1416 | 216 | n/a | n/a | $0.00005947 |
| deepseek/deepseek-v4-flash | 3 | 6625 | 1034 | 332 | 263 | $0.00044660 | $0.00022074 |

## Notes

- Pricing source: `gateway-models-api`.
- Gateway/table divergence over 1%: T1, T2, T3.
- Jev has no Gateway-reported cost field; its table cost uses actual token usage and the listed per-token price.
- For multi-provider models the table estimate uses the public list price and can differ from the serving provider's rate; Gateway-reported costs are authoritative.
