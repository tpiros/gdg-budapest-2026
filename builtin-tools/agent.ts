import { LlmAgent, GOOGLE_SEARCH, URL_CONTEXT } from "@google/adk";

export const rootAgent = new LlmAgent({
  name: "research_assistant",
  model: "gemini-3.8-flash",
  description: "Searches the web and reads pages to answer questions.",
  instruction: `You are a research assistant.

Process:
1. Search the web with a focused query.
2. Pick the most relevant URL from the results.
3. Read the page at that URL in full.
4. Decide whether you have enough. If not, read another URL or run a sharper search.
5. When you have enough, write a concise answer with citations.

Rules:
- Do not answer from memory. Always search first.
- Prefer primary sources over aggregators.
- Stop searching as soon as the answer is solid.`,
  // GOOGLE_SEARCH and URL_CONTEXT are Gemini built-ins, not function tools.
  // ADK only pushes `{googleSearch:{}}` / `{urlContext:{}}` into the request
  // config (tools/google_search_tool.js, url_context_tool.js); `runAsync` is a
  // no-op, so no function-call events are ever emitted. Search results surface
  // as `groundingMetadata` on the response. `urlContextMetadata` is dropped by
  // `createLlmResponse` (models/llm_response.js), so URL context leaves no
  // trace in ADK events at all.
  tools: [GOOGLE_SEARCH, URL_CONTEXT],
});
