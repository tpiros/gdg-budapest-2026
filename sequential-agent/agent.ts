import { FunctionTool, LlmAgent, Workflow, node } from "@google/adk";
import { z } from "zod";

// --- Tools ---

const searchWikipedia = new FunctionTool({
  name: "search_wikipedia",
  description: "Search Wikipedia for biographical information about a person",
  parameters: z.object({
    query: z.string().describe("The person to search for on Wikipedia"),
  }),
  execute: async ({ query }) => {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`;
    const searchRes = await fetch(searchUrl);
    const searchData = (await searchRes.json()) as any;
    if (!searchData.query?.search?.length)
      return { result: "No results found" };
    const title = searchData.query.search[0].title;
    const summaryRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    );
    const summaryData = (await summaryRes.json()) as any;
    return { result: summaryData.extract || "No information found" };
  },
});

// --- Schemas ---

const QuoteSchema = z.object({
  quote: z.string().describe("The text of the quote"),
  author: z.string().describe("The author of the quote"),
});
type Quote = z.infer<typeof QuoteSchema>;

// --- Node 1: plain code ---
// Calling an API and reading the answer back needs no judgement, so this step
// is a function rather than an agent. In a graph, a node can be either.

async function fetchQuote(): Promise<Quote> {
  // zenquotes credits plenty of quotes to "Unknown", and the next node then
  // researches a person called Unknown. Ask again for one worth looking up.
  // Stop if the API rate-limits, though. It reports a 429 as an ordinary quote
  // credited to "zenquotes.io", so retrying would research a website. Fall
  // back to a known-good quote so a network hiccup cannot kill a live demo.
  let quote: Quote = {
    quote: "The best way out is always through.",
    author: "Robert Frost",
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("https://zenquotes.io/api/random", {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) break;

      const [first] = (await res.json()) as Array<{ q: string; a: string }>;
      const author = (first?.a ?? "").trim();

      if (/^zenquotes\.io$/i.test(author)) break; // rate limited, stop asking
      if (!author || /^unknown$/i.test(author)) continue;

      quote = { quote: first.q, author };
      break;
    } catch {
      break; // timeout or network error: keep the fallback
    }
  }

  return quote;
}

// --- Node 2: an agent, because summarising a bio needs judgement ---
// `{Quote.author}` reads the `author` field off this node's input, which is
// whatever the previous node returned. Only the part after the dot matters:
// `Quote` is a label for the reader, and `{Anything.author}` resolves the same.

const authorResearcher = new LlmAgent({
  name: "author_researcher",
  model: "gemini-3.8-flash",
  description: "Researches a person on Wikipedia and returns a concise bio.",
  instruction: `Search Wikipedia for {Quote.author} using the search_wikipedia tool.

Return a concise 2-3 sentence bio covering who they are and why they are
notable. No preamble.`,
  tools: [searchWikipedia],
});

// --- Node 3: an agent ---
// A node's input is only its immediate predecessor's output, so the quote is
// out of reach as `{Quote.quote}` here. `<Quote.quote from fetch_quote>` binds
// to a named node instead and reaches any node that already ran in this turn.
// The bio arrives as this node's input, appended to the conversation.

const cardWriter = new LlmAgent({
  name: "card_writer",
  model: "gemini-3.8-flash",
  description: "Writes a punchy one-line daily inspiration card.",
  instruction: `You write punchy "Daily Inspiration" cards.

The quote: "<Quote.quote from fetch_quote>"
The author: <Quote.author from fetch_quote>

Their background is in the message above. Combine all of it into exactly ONE
line that ends with "— <Quote.author from fetch_quote>". No preamble, no
surrounding quotes, no extra formatting.`,
});

// --- Workflow ---
// One row of edges reads as the pipeline: start, fetch the quote, research the
// author, write the card. Each node's return value is the next node's input.

export const rootAgent = new Workflow({
  name: "quote_pipeline",
  edges: [
    [
      "START",
      node(fetchQuote, { name: "fetch_quote", outputSchema: QuoteSchema }),
      node(authorResearcher, { inputSchema: QuoteSchema }),
      cardWriter,
    ],
  ],
});
