# Support-ticket triage: reasoning max vs none — Python task report

Generated: 2026-09-19T21:42:31.937109Z

## Method

Fifteen sequential calls (per ticket: Luna max, Luna none, Jev, DeepSeek max, DeepSeek none). Luna and DeepSeek Flash used OpenAI-compatible JSON Schema structured output; Jev used the evaluation protocol. Both chat models reason by default when reasoning effort is omitted; the 'none' arms send reasoning effort 'none' explicitly (measured: 0 reasoning tokens). Per-token prices fetched from the public Gateway models endpoint; a brief constant supplies cached-input pricing only if that optional field is absent.

## Decisions and agreement

| Ticket | Arm | Model | Department | Urgent | Severity |
|---|---|---|---:|---:|---:|
| T1 | luna-max | openai/gpt-5.6-luna | billing | yes | 4 |
| T1 | luna-none | openai/gpt-5.6-luna | billing | yes | 4 |
| T1 | jev | typesafe-ai/jev | billing | yes | 4 |
| T1 | deepseek-max | deepseek/deepseek-v4-flash | billing | yes | 4 |
| T1 | deepseek-none | deepseek/deepseek-v4-flash | billing | yes | 4 |
| T2 | luna-max | openai/gpt-5.6-luna | tech | no | 1 |
| T2 | luna-none | openai/gpt-5.6-luna | tech | no | 1 |
| T2 | jev | typesafe-ai/jev | tech | yes | 1 |
| T2 | deepseek-max | deepseek/deepseek-v4-flash | tech | no | 1 |
| T2 | deepseek-none | deepseek/deepseek-v4-flash | tech | no | 2 |
| T3 | luna-max | openai/gpt-5.6-luna | sales | no | 0 |
| T3 | luna-none | openai/gpt-5.6-luna | sales | no | 0 |
| T3 | jev | typesafe-ai/jev | sales | no | 0 |
| T3 | deepseek-max | deepseek/deepseek-v4-flash | sales | no | 0 |
| T3 | deepseek-none | deepseek/deepseek-v4-flash | sales | no | 0 |

Pairwise agreement (all three fields) — T1:

| | luna-max | luna-none | jev | deepseek-max | deepseek-none |
|---|---|---|---|---|---|
| luna-max | — | yes | yes | yes | yes |
| luna-none | yes | — | yes | yes | yes |
| jev | yes | yes | — | yes | yes |
| deepseek-max | yes | yes | yes | — | yes |
| deepseek-none | yes | yes | yes | yes | — |

T1: all five configurations agree.

Pairwise agreement (all three fields) — T2:

| | luna-max | luna-none | jev | deepseek-max | deepseek-none |
|---|---|---|---|---|---|
| luna-max | — | yes | no | yes | no |
| luna-none | yes | — | no | yes | no |
| jev | no | no | — | no | no |
| deepseek-max | yes | yes | no | — | no |
| deepseek-none | no | no | no | no | — |

T2: not unanimous — disagreeing pairs: luna-max vs jev, luna-max vs deepseek-none, luna-none vs jev, luna-none vs deepseek-none, jev vs deepseek-max, jev vs deepseek-none, deepseek-max vs deepseek-none.

Pairwise agreement (all three fields) — T3:

| | luna-max | luna-none | jev | deepseek-max | deepseek-none |
|---|---|---|---|---|---|
| luna-max | — | yes | yes | yes | yes |
| luna-none | yes | — | yes | yes | yes |
| jev | yes | yes | — | yes | yes |
| deepseek-max | yes | yes | yes | — | yes |
| deepseek-none | yes | yes | yes | yes | — |

T3: all five configurations agree.

## Per-call measurements

| Ticket | Arm | Latency ms | Input | Output | Reasoning | Gateway cost | Table cost | >1% divergence |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| T1 | luna-max | 2071 | 202 | 64 | 36 | $0.00011720 | $0.00011720 | no |
| T1 | luna-none | 888 | 202 | 26 | 0 | $0.00007160 | $0.00007160 | no |
| T1 | jev | 365 | 466 | 72 | n/a | n/a | $0.00001957 | n/a |
| T1 | deepseek-max | 4195 | 338 | 85 | 64 | $0.00013046 | $0.00006604 | yes |
| T1 | deepseek-none | 3700 | 259 | 24 | 0 | $0.00007282 | $0.00003991 | yes |
| T2 | luna-max | 4827 | 212 | 113 | 85 | $0.00017800 | $0.00017800 | no |
| T2 | luna-none | 926 | 212 | 26 | 0 | $0.00007360 | $0.00007360 | no |
| T2 | jev | 264 | 476 | 72 | n/a | n/a | $0.00001999 | n/a |
| T2 | deepseek-max | 2484 | 349 | 255 | 231 | $0.00024508 | $0.00011167 | yes |
| T2 | deepseek-none | 656 | 270 | 23 | 0 | $0.00007458 | $0.00004108 | yes |
| T3 | luna-max | 884 | 210 | 26 | 0 | $0.00007320 | $0.00007320 | no |
| T3 | luna-none | 975 | 210 | 26 | 0 | $0.00007320 | $0.00007320 | no |
| T3 | jev | 305 | 474 | 72 | n/a | n/a | $0.00001991 | n/a |
| T3 | deepseek-max | 1122 | 347 | 115 | 91 | $0.00015224 | $0.00007501 | yes |
| T3 | deepseek-none | 2001 | 268 | 23 | 0 | $0.00007414 | $0.00004082 | yes |

## Totals

| Arm | Model | Calls | Latency ms | Input | Output | Reasoning | Gateway cost | Table cost |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| luna-max | openai/gpt-5.6-luna | 3 | 7782 | 624 | 203 | 121 | $0.00036840 | $0.00036840 |
| luna-none | openai/gpt-5.6-luna | 3 | 2789 | 624 | 78 | 0 | $0.00021840 | $0.00021840 |
| jev | typesafe-ai/jev | 3 | 934 | 1416 | 216 | n/a | n/a | $0.00005947 |
| deepseek-max | deepseek/deepseek-v4-flash | 3 | 7801 | 1034 | 455 | 386 | $0.00052778 | $0.00025272 |
| deepseek-none | deepseek/deepseek-v4-flash | 3 | 6357 | 797 | 70 | 0 | $0.00022154 | $0.00012181 |

## Notes

- Pricing source: `gateway-models-api`.
- Gateway/table divergence over 1%: T1 (deepseek-max), T1 (deepseek-none), T2 (deepseek-max), T2 (deepseek-none), T3 (deepseek-max), T3 (deepseek-none).
- Both chat models reason by default when reasoning effort is omitted; the `none` arms send reasoning effort `none` explicitly (measured: 0 reasoning tokens).
- Jev has no Gateway-reported cost field; its table cost uses actual token usage and the listed per-token price.
- For multi-provider models the table estimate uses the public list price and can differ from the serving provider's rate; Gateway-reported costs are authoritative.
