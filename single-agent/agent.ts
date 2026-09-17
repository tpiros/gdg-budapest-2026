import { LlmAgent, FunctionTool } from "@google/adk";
import { z } from "zod";

const swapiPeopleTool = new FunctionTool({
  name: "swapi_people",
  description: "Search Star Wars characters from SWAPI by name.",
  parameters: z.object({
    name: z.string().describe("Character name to search for"),
  }),
  requireConfirmation: true,
  execute: async ({ name }) => {
    const res = await fetch("https://swapi.info/api/people");
    if (!res.ok) throw new Error(`SWAPI request failed: ${res.status}`);
    const all = (await res.json()) as Array<{ name: string }>;
    const needle = name.toLowerCase();
    return {
      results: all.filter((p) => p.name.toLowerCase().includes(needle)),
    };
  },
});

export const rootAgent = new LlmAgent({
  name: "star_wars_lookup",
  model: "gemini-3.8-flash",
  description: "Looks up Star Wars characters using SWAPI.",
  instruction: `You are a Star Wars character lookup assistant. When the user
  gives you a character name, call the swapi_people tool and summarize the
  result concisely. If the user hasn't given a name, ask for one.`,
  tools: [swapiPeopleTool],
});
