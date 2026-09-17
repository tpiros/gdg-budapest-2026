import { LlmAgent, NodeTool, Workflow, node } from "@google/adk";
import { z } from "zod";

// A whole Workflow exposed as one tool. AgentTool wraps a single agent;
// NodeTool wraps any node, including a graph.

// --- Specialist (same as routing-agent) ---

const wandSpecialist = new LlmAgent({
  name: "WandSpecialist",
  model: "gemini-3.8-flash",
  description:
    "Answers questions about wand products: woods, cores, lengths, what to buy, how wands differ.",
  instruction: `You are a wand specialist at Ollivanders. Answer questions about
wand products — woods, cores, lengths, flexibility, and which wand suits which wizard.

Reference this catalogue when relevant:
- Holly, phoenix feather, 11"
- Yew, phoenix feather, 13.5"
- Elder, thestral tail hair, 15"
- Vine, dragon heartstring, 10.75"
- Willow, unicorn hair, 10.25"

Be concise and stay in character.`,
});

// A plain function as the last node. It receives the specialist's text and
// stamps it. No model call.
function polish(_ctx: unknown, advice: string) {
  return {
    advice: advice.trim(),
    stamp: "Countersigned by Ollivanders. Makers of Fine Wands since 382 B.C.",
  };
}

// --- The workflow the coordinator will call ---
// NodeTool requires an inputSchema on the wrapped node: the tool's parameters
// are derived from it (nodes/node_tool.js, constructor throws without one).
// The object is passed to the first node as-is; an LlmAgent node receives it
// as a JSON user turn (run_llm_agent_as_node.js, toUserContent).

const wandConsultation = new Workflow({
  name: "wand_consultation",
  description:
    "Runs a full wand consultation: the wand specialist answers, then the shop countersigns. Use for any question about choosing or buying a wand.",
  inputSchema: z.object({
    question: z.string().describe("The customer's wand question, verbatim"),
  }),
  edges: [["START", wandSpecialist, node(polish, { name: "polish" })]],
});

// --- Coordinator (Root) ---
// `new NodeTool(workflow)`: tool name and description come from the node.
//
// Difference from AgentTool: NodeTool runs the node on the caller's own
// invocation and streams the inner node events into the caller's event queue
// (node_tool.js runNode: `channel: ic.eventQueue`). So the caller sees
// WandSpecialist and polish run between the tool call and its result. With
// AgentTool that middle part is invisible.
//
// NodeTool is also marked long-running, so a node that yields RequestInput
// pauses the coordinator's turn instead of returning an empty result.

export const rootAgent = new LlmAgent({
  name: "OllivandersCoordinator",
  model: "gemini-3.8-flash",
  description: "Front-of-shop coordinator at Ollivanders.",
  instruction: `You are the front-of-shop coordinator at Ollivanders.

For any question about wands, call wand_consultation with the customer's
question. Then reply to the customer yourself, briefly, in the shopkeeper's
voice, relaying the advice and the stamp you got back.

If the message is unrelated to wands, do not call a tool. Reply with one short
sentence asking the customer to rephrase it as a wand question.`,
  tools: [new NodeTool(wandConsultation)],
});
