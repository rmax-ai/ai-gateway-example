# Support-ticket triage: reasoning max vs none — TypeScript task report

Generated: 2026-09-19T21:42:05.083Z

## Method

Fifteen sequential calls (per ticket: Luna max, Luna none, Jev, DeepSeek max, DeepSeek none). Luna used AI SDK generateObject; DeepSeek Flash used a forced tool call; Jev used the evaluation protocol. Both chat models reason by default when reasoning effort is omitted; the 'none' arms send reasoning effort 'none' explicitly (measured: 0 reasoning tokens). Per-token prices fetched from the public Gateway models endpoint; a brief constant supplies cached-input pricing only if that optional field is absent.

## Decisions and agreement

| Ticket | Arm | Model | Department | Urgent | Severity |
|---|---|---|---|---:|---:|
| T1 | luna-max | openai/gpt-5.6-luna | billing | yes | 4 |
| T1 | luna-none | openai/gpt-5.6-luna | billing | yes | 4 |
| T1 | jev | typesafe-ai/jev | billing | yes | 4 |
| T1 | deepseek-max | deepseek/deepseek-v4-flash | billing | yes | 4 |
| T1 | deepseek-none | deepseek/deepseek-v4-flash | billing | yes | 4 |
| T2 | luna-max | openai/gpt-5.6-luna | tech | no | 1 |
| T2 | luna-none | openai/gpt-5.6-luna | tech | no | 1 |
| T2 | jev | typesafe-ai/jev | tech | yes | 1 |
| T2 | deepseek-max | deepseek/deepseek-v4-flash | tech | no | 1 |
| T2 | deepseek-none | deepseek/deepseek-v4-flash | tech | no | 1 |
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
| luna-max | — | yes | no | yes | yes |
| luna-none | yes | — | no | yes | yes |
| jev | no | no | — | no | no |
| deepseek-max | yes | yes | no | — | yes |
| deepseek-none | yes | yes | no | yes | — |

T2: not unanimous — disagreeing pairs: luna-max vs jev, luna-none vs jev, jev vs deepseek-max, jev vs deepseek-none.

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
| T1 | luna-max | 2395 | 212 | 68 | 40 | $0.00012400 | $0.00012400 | no |
| T1 | luna-none | 882 | 212 | 26 | 0 | $0.00007360 | $0.00007360 | no |
| T1 | jev | 331 | 466 | 72 | n/a | n/a | $0.00001957 | n/a |
| T1 | deepseek-max | 2521 | 587 | 183 | 100 | $0.00024992 | $0.00012389 | yes |
| T1 | deepseek-none | 898 | 508 | 82 | 0 | $0.00016588 | $0.00008736 | yes |
| T2 | luna-max | 2549 | 222 | 103 | 75 | $0.00016800 | $0.00016800 | no |
| T2 | luna-none | 825 | 222 | 26 | 0 | $0.00007560 | $0.00007560 | no |
| T2 | jev | 325 | 476 | 72 | n/a | n/a | $0.00001999 | n/a |
| T2 | deepseek-max | 9102 | 598 | 255 | 172 | $0.00029986 | $0.00014404 | yes |
| T2 | deepseek-none | 8135 | 519 | 81 | 0 | $0.00016764 | $0.00008853 | yes |
| T3 | luna-max | 2022 | 220 | 73 | 45 | $0.00013160 | $0.00013160 | no |
| T3 | luna-none | 1034 | 220 | 26 | 0 | $0.00007520 | $0.00007520 | no |
| T3 | jev | 282 | 474 | 72 | n/a | n/a | $0.00001991 | n/a |
| T3 | deepseek-max | 1137 | 596 | 160 | 78 | $0.00023672 | $0.00011908 | yes |
| T3 | deepseek-none | 958 | 517 | 81 | 0 | $0.00016720 | $0.00008827 | yes |

## Totals

| Arm | Model | Calls | Latency ms | Input | Output | Reasoning | Gateway cost | Table cost |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| luna-max | openai/gpt-5.6-luna | 3 | 6966 | 654 | 244 | 160 | $0.00042360 | $0.00042360 |
| luna-none | openai/gpt-5.6-luna | 3 | 2741 | 654 | 78 | 0 | $0.00022440 | $0.00022440 |
| jev | typesafe-ai/jev | 3 | 938 | 1416 | 216 | n/a | n/a | $0.00005947 |
| deepseek-max | deepseek/deepseek-v4-flash | 3 | 12760 | 1781 | 598 | 350 | $0.00078650 | $0.00038701 |
| deepseek-none | deepseek/deepseek-v4-flash | 3 | 9991 | 1544 | 244 | 0 | $0.00050072 | $0.00026416 |

## Notes

- Pricing source: `gateway-models-api`.
- Gateway/table divergence over 1%: T1 (deepseek-max), T1 (deepseek-none), T2 (deepseek-max), T2 (deepseek-none), T3 (deepseek-max), T3 (deepseek-none).
- Both chat models reason by default when reasoning effort is omitted; the `none` arms send reasoning effort `none` explicitly (measured: 0 reasoning tokens).
- Jev has no Gateway-reported cost field; its table cost uses actual token usage and the listed per-token price.
- For multi-provider models the table estimate uses the public list price and can differ from the serving provider's rate; Gateway-reported costs are authoritative.
- DeepSeek Flash structured output uses a forced tool call: the Gateway does not expose responseFormat for this model.
