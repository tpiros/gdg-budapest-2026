# gdg-budapest-2026

Demo code for **Agents, Workflows, Graphs** — GDG Budapest 2026.

Everything here runs on [Google ADK](https://github.com/google/adk-js) **2.0**, except `managed-agent`, which calls the [Interactions API](https://ai.google.dev/gemini-api/docs/interactions) directly through `@google/genai`.

## The demos

| Folder | What it shows |
|---|---|
| `single-agent` | One agent, one `FunctionTool` behind `requireConfirmation`. Star Wars lookup against SWAPI; approve each call. |
| `builtin-tools` | Built-in tools: `GOOGLE_SEARCH` and `URL_CONTEXT`. |
| `sequential-agent` | A `Workflow` chain. The first step is a plain function, not an agent. |
| `parallel-agent` | Fan out to three translators plus a deliberately slow node, then a `JoinNode` barrier: the join fires only once the slow node finishes, and hands the aggregator one object keyed by node name. `npm run start:map` sizes the same fan-out at runtime with `ParallelWorker`. |
| `loop-agent` | Hangman as a loop. A model guesses one letter, a plain function judges it and picks the route: round again, solved, or hanged after six misses. The word is picked at random and the model never sees it. |
| `routing-agent` | LLM-driven branching in a `Workflow`: a classifier `LlmAgent` with a zod `outputSchema` feeds a `RoutingMap` edge with `DEFAULT_ROUTE` for off-topic messages. The `subAgents` + `transfer_to_agent` version is kept as a foil: `npm run start:transfer`. |
| `agent-as-tool` | `AgentTool`: the mirror of `routing-agent`. The specialist returns, the coordinator answers. `npm run start:nodetool` wraps a whole Workflow as one tool with `NodeTool`; `npm run start:hitl` pauses inside that tool with `RequestInput` and resumes on the next message. |
| `mcp-agent` | Tools from an MCP server. `server.ts` is a plain stdio MCP server that knows nothing about ADK; `MCPToolset` starts it, discovers its tools and hands them to the model. |
| `managed-agent` | Not ADK: `@google/genai`'s Interactions API directly. A hosted agent in a remote sandbox, no orchestration code. |

## Running one

```bash
cd single-agent
npm install
echo "GEMINI_API_KEY=your-key-here" > .env
npm start          # or: npm run web
```

`npm start` runs the agent in the terminal. `npm run web` opens the ADK dev UI,
where you can watch the tool calls, the event stream and the session state
behind each answer.

## The graph

One `Workflow` covers sequential, parallel and looping work. You declare
`edges`, and the shape falls out of the wiring.

```ts
// sequential
edges: [["START", a, b, c]]

// parallel, with a fan-in barrier
edges: [["START", [fr, es, ja], join, aggregator]]

// a loop is an edge pointing backwards
const judgeNode = node(judge, { name: "judge", inputSchema: GuessSchema });
const resultNode = node(result, { name: "result" });

edges: [
  ["START", setupNode, guesser, judgeNode],
  [judgeNode, { GUESS: guesser, SOLVED: resultNode, HANGED: resultNode, [DEFAULT_ROUTE]: resultNode }],
]
```

Two things worth knowing:

- A graph cycle has no built-in iteration cap. Guaranteeing the exit is your job.
- `Workflow` logs that it is experimental and may change.
