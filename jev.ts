import { experimental_evaluate as evaluate } from "ai";

// Jev (typesafe-ai/jev) is an evaluation model: it answers typed questions
// (boolean / choice / score) about one shared state — all evaluated in
// parallel within a single request. Useful for classification, routing,
// rubric-based assessment, and agent output verification.
const result = await evaluate({
  model: "typesafe-ai/jev",
  state:
    "The support agent issued a full refund for order #1042 after the " +
    "customer reported a damaged item, apologized for the inconvenience, " +
    "and asked the customer to send a photo of the damage.",
  questions: {
    refund_issued: {
      type: "boolean",
      instructions: "Was a refund issued for the order?",
    },
    photo_requested: {
      type: "boolean",
      instructions: "Did the agent ask the customer for a photo?",
    },
    tone: {
      type: "choice",
      instructions: "What best describes the agent's tone?",
      criteria: {
        apologetic: "The agent apologizes or expresses empathy.",
        neutral: "Polite and factual, but no apology or empathy.",
        dismissive: "Minimizes the problem or deflects the customer.",
      },
    },
    helpfulness: {
      type: "score",
      instructions: "How helpful was the response overall?",
      criteria: [
        "Unhelpful — the issue was not addressed",
        "Partially helpful — addressed but incomplete",
        "Fully helpful — issue resolved, with clear next steps",
      ],
    },
  },
});

console.log(JSON.stringify(result.answers, null, 2));
console.log(
  `\nmodel: ${result.response.modelId} | tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`,
);
