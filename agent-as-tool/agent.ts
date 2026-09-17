import { LlmAgent, AgentTool } from "@google/adk";

// Same shop as routing-agent/agent-transfer.ts, one difference: the
// specialists are tools. agent-transfer.ts hands the conversation over with
// transfer_to_agent and the specialist speaks to the customer. Here the
// coordinator calls a specialist, gets its answer back as a tool result, and
// speaks to the customer itself.

// --- Specialist Sub-Agents ---
// Same roles as routing-agent; the instructions add a hand-off line.
// `description` becomes the tool description the coordinator's model reads
// when it picks which one to call.

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

Be concise and stay in character. If the user describes a malfunctioning wand,
say so and suggest they speak to a magical technician instead.`,
});

const magicalTechnician = new LlmAgent({
  name: "MagicalTechnician",
  model: "gemini-3.8-flash",
  description:
    "Diagnoses and repairs malfunctioning wands: wrong spells firing, damage, contamination, unresponsive cores.",
  instruction: `You are a magical technician. Diagnose and recommend a fix for
malfunctioning wands — wrong spells firing, physical damage, contamination,
unresponsive cores, backfiring charms.

Ask one clarifying question if the symptom is vague, then give a short
diagnosis and a recommended next step. Stay in character. If the question
is about choosing or buying a wand, say so and suggest they speak to a wand
specialist instead.`,
});

// --- Coordinator (Root) ---
// `tools` instead of `subAgents`. AgentTool exposes each specialist as a
// function named after the agent, taking a single `request` string.
//
// Control returns to the caller: the final event's author is the coordinator.
// Compare routing-agent, where it is the specialist.
//
// AgentTool runs the sub-agent in its own Runner, so its inner tool calls
// are not in this event stream. All the caller sees is the call into
// WandSpecialist and the answer coming back as the tool result.

export const rootAgent = new LlmAgent({
  name: "OllivandersCoordinator",
  model: "gemini-3.8-flash",
  description: "Front-of-shop coordinator at Ollivanders.",
  instruction: `You are the front-of-shop coordinator at Ollivanders.

For a question about wand products (woods, cores, lengths, what to buy), call
WandSpecialist. For a malfunctioning wand (wrong spells, damage,
contamination), call MagicalTechnician. Pass the customer's question as the
request. Then reply to the customer yourself, briefly, in the shopkeeper's
voice, based on what the specialist returned.

If the message is unrelated to wands, do not call a tool. Reply with one short
sentence asking the customer to rephrase it as a wand question.`,
  tools: [
    new AgentTool({ agent: wandSpecialist }),
    new AgentTool({ agent: magicalTechnician }),
  ],
});
