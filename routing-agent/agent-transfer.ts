import { LlmAgent } from "@google/adk";

// The agent-tree version of routing: `subAgents` plus `transfer_to_agent`.
// Kept as the sixty-second foil for agent-as-tool. Here control MOVES to the
// specialist; in agent-as-tool it RETURNS to the coordinator. Compare the
// author of the final event in each demo. For the graph version, see agent.ts.

// --- Specialist Sub-Agents ---
// Each one needs a specific `description`. That is what the coordinator's
// model reads when it decides where to send a request.
// `disallowTransferToPeers` keeps the specialists from handing the customer
// to each other, so the only way out is back to the coordinator.

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
transfer back to the coordinator instead of answering.`,
  disallowTransferToPeers: true,
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
diagnosis and a recommended next step. Stay in character. If the question
is about choosing or buying a wand, transfer back to the coordinator instead
of answering.`,
  disallowTransferToPeers: true,
});

// --- Coordinator (Root) ---
// The model reads each sub-agent's description and calls transfer_to_agent
// to hand off. Nothing here is a hardcoded if or switch. The model routes.
// ADK appends its own transfer instructions and the tool's parameter shape,
// so the prompt only has to say WHEN to transfer, not how.
//
// Turn two does not come back here. The runner's determineAgentForResumption
// (runner.js) picks the last non-user author that is a routable LlmAgent, so
// after a transfer the next user message resumes on the specialist. That is
// the behaviour the graph version in agent.ts avoids.

export const rootAgent = new LlmAgent({
  name: "OllivandersCoordinator",
  model: "gemini-3.8-flash",
  description: "Routes wizarding customer requests to the right specialist.",
  instruction: `You are the front-of-shop coordinator at Ollivanders. Your job
is to route wand-related questions to a specialist, OR (only for off-topic
messages) reply directly with a short redirect.

For each user message, pick exactly ONE of these actions:

A. If it is about wand products (woods, cores, lengths, what to buy):
   → transfer to WandSpecialist. Output nothing else.

B. If it is about a malfunctioning wand (wrong spells, damage, contamination):
   → transfer to MagicalTechnician. Output nothing else.

C. If it is unrelated to wands (e.g. "Where can I find Lord Voldemort?"):
   → DO NOT transfer. Reply directly with one short sentence asking the user
     to rephrase as a wand question. Example: "I only handle wand questions —
     could you rephrase that as something about choosing or repairing a wand?"

Never answer wand questions yourself. Never stay silent — always produce
either a transfer (A/B) or a short text reply (C).`,
  subAgents: [wandSpecialist, magicalTechnician],
});
