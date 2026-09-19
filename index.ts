import { generateText } from "ai";

const { text } = await generateText({
  model: "openai/gpt-5.6-luna",
  prompt:
    "Invent a new holiday. Give it a name, then describe its traditions: " +
    "when it is celebrated, how people celebrate, and any special foods or customs.",
});

console.log(text);
