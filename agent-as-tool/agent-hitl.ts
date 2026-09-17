import {
  App,
  FunctionNode,
  LlmAgent,
  NodeTool,
  RequestInput,
  Workflow,
  createResumabilityConfig,
} from "@google/adk";
import { z } from "zod";

// agent-nodetool.ts plus one thing: the tool pauses to ask the customer a
// question, and the answer comes in on the next turn.

// --- Specialist (routing-agent's, plus the wand arm) ---

const wandSpecialist = new LlmAgent({
  name: "WandSpecialist",
  model: "gemini-3.8-flash",
  description:
    "Answers questions about wand products: woods, cores, lengths, what to buy, how wands differ.",
  instruction: `You are a wand specialist at Ollivanders. Answer questions about
wand products — woods, cores, lengths, flexibility, and which wand suits which wizard.
The customer's wand arm is given; mention it once when you recommend.

Reference this catalogue when relevant:
- Holly, phoenix feather, 11"
- Yew, phoenix feather, 13.5"
- Elder, thestral tail hair, 15"
- Vine, dragon heartstring, 10.75"
- Willow, unicorn hair, 10.25"

Be concise and stay in character.`,
});

// --- The node that pauses ---
// Yielding a RequestInput turns into an `adk_request_input` interrupt event
// (base_node.js run → createRequestInputEvent). NodeTool is long-running, so
// the coordinator's turn ends with the tool call unanswered.
//
// On the next user message request_input_llm_request_processor.js finds that
// pending NodeTool call, re-runs it, and hands the reply to the workflow as
// ctx.resumeInputs[interruptId]. Completed nodes are not re-run. By default a
// function node that paused is not re-run either: the reply becomes its output
// as-is (workflow.js, `!node.rerunOnResume`). `rerunOnResume: true` runs this
// function again so it can combine the reply with its original input.

const Fitting = z.object({ question: z.string() });

const askWandArm = new FunctionNode(
  "ask_wand_arm",
  function* (ctx, input: z.infer<typeof Fitting>) {
    const arm = ctx.resumeInputs["wand_arm"];
    if (arm === undefined) {
      yield new RequestInput({
        interruptId: "wand_arm",
        message: "Which is your wand arm, left or right?",
      });
      return;
    }
    yield { question: input.question, wandArm: String(arm) };
  },
  { inputSchema: Fitting, rerunOnResume: true },
);

const wandFitting = new Workflow({
  name: "wand_fitting",
  description:
    "Fits a customer with a wand. Asks the customer for their wand arm, then the wand specialist recommends. Use for any question about choosing or buying a wand.",
  inputSchema: Fitting,
  edges: [["START", askWandArm, wandSpecialist]],
});

// --- Coordinator (Root) ---

export const rootAgent = new LlmAgent({
  name: "OllivandersCoordinator",
  model: "gemini-3.8-flash",
  description: "Front-of-shop coordinator at Ollivanders.",
  instruction: `You are the front-of-shop coordinator at Ollivanders.

For any question about wands, call wand_fitting with the customer's question.
Then reply to the customer yourself, briefly, in the shopkeeper's voice,
relaying the specialist's recommendation.

If the message is unrelated to wands, do not call a tool. Reply with one short
sentence asking the customer to rephrase it as a wand question.`,
  tools: [new NodeTool(wandFitting)],
});

// App carries the resumability config with the root. The resume itself comes
// from request_input_llm_request_processor.js, which runs either way; this
// coordinator is the root, so the next message lands on it regardless.
export const app = new App({
  name: rootAgent.name,
  rootAgent,
  resumabilityConfig: createResumabilityConfig({ isResumable: true }),
});
