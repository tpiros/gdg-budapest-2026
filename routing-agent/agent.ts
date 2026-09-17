import {
  DEFAULT_ROUTE,
  LlmAgent,
  Workflow,
  createEvent,
  node,
  type NodeContext,
} from "@google/adk";
import { z } from "zod";

// --- Specialists ---
// Plain LlmAgents. In this file they have no `subAgents`, no
// `transfer_to_agent` tool and no idea the other one exists. The graph decides
// which of them runs.

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

const magicalTechnician = new LlmAgent({
  name: "MagicalTechnician",
  model: "gemini-3.8-flash",
  description:
    "Diagnoses and repairs malfunctioning wands: wrong spells firing, damage, contamination, unresponsive cores.",
  instruction: `You are a magical technician at Ollivanders. Diagnose and
recommend a fix for malfunctioning wands — wrong spells firing, physical damage,
contamination, unresponsive cores, backfiring charms.

Ask one clarifying question if the symptom is vague, then give a short
diagnosis and a recommended next step. Be concise and stay in character.`,
});

// --- Classifier ---
// The one place an LLM makes a judgment about *where to go*. `outputSchema`
// forces a JSON reply, and ADK parses it into the node's output, so the next
// node receives a typed object rather than prose.

const Verdict = z.object({
  route: z
    .enum(["PRODUCT", "REPAIR", "OTHER"])
    .describe(
      "PRODUCT: choosing or buying a wand. REPAIR: a wand that misbehaves or is damaged. OTHER: anything else.",
    ),
});
type Verdict = z.infer<typeof Verdict>;

const classifier = new LlmAgent({
  name: "classifier",
  model: "gemini-3.8-flash",
  instruction: `Classify the customer's message for the Ollivanders front desk.
- PRODUCT: choosing or buying a wand (woods, cores, lengths, which wand suits whom).
- REPAIR: a wand that misbehaves, sparks, backfires, is damaged or contaminated.
- OTHER: anything that is not about wands.
Reply with the JSON object only.`,
  outputSchema: Verdict,
});

// --- Dispatch ---
// The engine reads a route from `event.route` and nothing else, so this
// two-line function lifts the classifier's verdict into a route. Its `output`
// is the original user message, which becomes the chosen specialist's input.
// The LLM makes the judgment; the graph enforces where it can go.

const userText = (ctx: NodeContext) =>
  ctx.invocationContext.userContent?.parts?.map((p) => p.text ?? "").join("") ?? "";

const dispatch = node(
  (ctx: NodeContext, verdict: Verdict) =>
    createEvent({ route: verdict.route, output: userText(ctx) }),
  { name: "dispatch" },
);

// Off-topic messages never reach a specialist. DEFAULT_ROUTE handles them
// structurally: no prompt engineering, no "please do not answer that".
const redirect = node(
  () =>
    "I only handle wand questions — could you rephrase that as something about choosing or repairing a wand?",
  { name: "redirect" },
);

// --- The graph ---
// The branch is visible in `edges`. The classifier cannot send the customer
// anywhere that is not drawn here. Every turn starts at START, so there is no
// sticky specialist between turns: a repair question after a product question
// goes back through the classifier.

export const rootAgent = new Workflow({
  name: "OllivandersFrontDesk",
  edges: [
    ["START", classifier, dispatch],
    [
      dispatch,
      {
        PRODUCT: wandSpecialist,
        REPAIR: magicalTechnician,
        [DEFAULT_ROUTE]: redirect,
      },
    ],
  ],
});
