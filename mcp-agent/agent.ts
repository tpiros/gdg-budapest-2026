import { LlmAgent, MCPToolset } from "@google/adk";

// Tools this repo did not write. `server.ts` is a plain MCP server: no ADK, no
// Gemini, just two tools over stdio.
//
// `StdioConnectionParams` starts that file as a child process. At startup the
// toolset calls the server's `list_tools`, wraps each one as an ADK tool, and
// the model sees them next to any FunctionTool you declared yourself
// (tools/mcp/mcp_toolset.js).
//
// The other shape is `StreamableHTTPConnectionParams` with a `url`, for a
// server someone else already runs.

// Resolve the server next to this file: the child process is spawned with the
// working directory ADK was started from, which is not always this folder.
const serverPath = new URL("server.ts", import.meta.url).pathname;

const stockRoom = new MCPToolset({
  type: "StdioConnectionParams",
  serverParams: { command: "node", args: [serverPath] },
});

export const rootAgent = new LlmAgent({
  name: "OllivandersStockRoom",
  model: "gemini-3.8-flash",
  description: "Answers questions about wand stock using the shop's MCP server.",
  instruction: `You are the stock clerk at Ollivanders.

Answer questions about what is in stock using the wand_stock tool, and questions
about deliveries using the restock_date tool. Never guess a number: if a tool
says a wood is not carried, say so. Keep replies to one or two sentences, in the
shopkeeper's voice.`,
  tools: [stockRoom],
});
