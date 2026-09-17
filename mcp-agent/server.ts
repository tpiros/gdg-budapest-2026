import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// A tiny MCP server: Ollivanders' stock room. It knows nothing about ADK or
// Gemini. It speaks MCP over stdio, so any MCP client can call it.
//
// ADK starts this file as a child process (see agent.ts), asks it for its tool
// list, and turns each tool into one the model can call.

const STOCK: Record<string, { core: string; length: string; inStock: number }> = {
  holly: { core: "phoenix feather", length: '11"', inStock: 2 },
  yew: { core: "phoenix feather", length: '13.5"', inStock: 0 },
  elder: { core: "thestral tail hair", length: '15"', inStock: 1 },
  vine: { core: "dragon heartstring", length: '10.75"', inStock: 4 },
  willow: { core: "unicorn hair", length: '10.25"', inStock: 7 },
};

const server = new McpServer({ name: "ollivanders-stock", version: "1.0.0" });

server.registerTool(
  "wand_stock",
  {
    description: "How many wands of a given wood are in stock, with core and length.",
    inputSchema: { wood: z.string().describe("The wand wood, for example holly or yew") },
  },
  async ({ wood }) => {
    const entry = STOCK[wood.trim().toLowerCase()];
    const text = entry
      ? `${wood}: ${entry.inStock} in stock · ${entry.core} · ${entry.length}`
      : `${wood}: not a wood we carry. We stock ${Object.keys(STOCK).join(", ")}.`;
    return { content: [{ type: "text", text }] };
  },
);

server.registerTool(
  "restock_date",
  {
    description: "When the next delivery of a given wand wood arrives.",
    inputSchema: { wood: z.string().describe("The wand wood") },
  },
  async ({ wood }) => ({
    content: [
      {
        type: "text",
        text: STOCK[wood.trim().toLowerCase()]
          ? `${wood}: next delivery on the first Tuesday of next month.`
          : `${wood}: nothing on order.`,
      },
    ],
  }),
);

await server.connect(new StdioServerTransport());
