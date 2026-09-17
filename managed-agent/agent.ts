import { GoogleGenAI } from "@google/genai";

const client = new GoogleGenAI({});
const agent = "antigravity-preview-05-2026";

// Turn 1: a fresh sandbox. Google runs the agent loop; we read the result.
const first = await client.interactions.create(
  {
    agent,
    environment: "remote",
    input:
      "Write a Python script that generates the first 20 Fibonacci numbers and saves them to fibonacci.txt. Then read the file and print its contents.",
  },
  { timeout: 300_000 },
);
console.log(first.output_text);

// Turn 2: same conversation, same sandbox, so the file is still there.
const second = await client.interactions.create(
  {
    agent,
    previous_interaction_id: first.id,
    environment: first.environment_id,
    input: "Read fibonacci.txt again and tell me the sum of the digits of the last number in it.",
  },
  { timeout: 300_000 },
);
console.log(second.output_text);
