import {
  DEFAULT_ROUTE,
  LlmAgent,
  NodeContext,
  Workflow,
  createEvent,
  node,
} from "@google/adk";
import { ThinkingLevel } from "@google/genai";
import { z } from "zod";

// Hangman as a loop. A model guesses one letter at a time, a plain function
// judges the guess, and the judge's route either sends the game round again or
// ends it.
//
//   START -> setup -> guesser -> judge --GUESS--> guesser   (the back-edge)
//                                  |
//                                  +--SOLVED / HANGED--> result
//
// A graph cycle is not capped by the framework: the graph validator only
// rejects *unconditional* cycles (workflow/utils/graph_validation.js:151). The
// only backstop is RunConfig.maxLlmCalls, which defaults to 500
// (agents/run_config.js:27). So the rules guarantee the exit instead: every lap
// either reveals a new letter or costs a life, a repeated or malformed guess
// costs a life too, and there are only MAX_MISSES lives.
const MAX_MISSES = 6;

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

// The secret is picked from this list. Any message starts a game.
const WORDS = [
  "budapest",
  "danube",
  "paprika",
  "goulash",
  "parliament",
  "workflow",
  "gemini",
  "keyboard",
  "compiler",
  "javascript",
];

// --- Schemas ---

const BoardSchema = z.object({
  pattern: z.string().describe("The word with hidden letters as underscores"),
  guessed: z.string().describe("Letters guessed so far"),
  livesLeft: z.number().describe("Wrong guesses still allowed"),
});
type Board = z.infer<typeof BoardSchema>;

const GuessSchema = z.object({
  letter: z.string().describe("Exactly one letter, a to z, not guessed before"),
});
type Guess = z.infer<typeof GuessSchema>;

// --- Helpers ---

function toBoard(secret: string, guessed: string[], misses: number): Board {
  return {
    pattern: [...secret].map((c) => (guessed.includes(c) ? c : "_")).join(" "),
    guessed: guessed.length ? guessed.join(", ") : "none yet",
    livesLeft: MAX_MISSES - misses,
  };
}

function hearts(misses: number): string {
  return "♥".repeat(MAX_MISSES - misses) + "♡".repeat(misses);
}

function say(ctx: NodeContext, author: string, text: string) {
  return {
    author,
    invocationId: ctx.invocationId,
    branch: ctx.branch,
    content: { role: "model", parts: [{ text }] },
  };
}

// --- Setup: deterministic node, no model call ---
// The secret lives in state and never reaches the guesser: its only input is
// the masked board this node outputs.

function setup(ctx: NodeContext) {
  const secret = WORDS[Math.floor(Math.random() * WORDS.length)];

  // Reset per game, so a second game in the same session starts clean.
  ctx.state.set("secret", secret);
  ctx.state.set("guessed", []);
  ctx.state.set("misses", 0);
  ctx.state.set("turns", 0);

  const board = toBoard(secret, [], 0);
  return createEvent({
    ...say(ctx, "setup", `new game · ${secret.length} letters · ${hearts(0)}   ${board.pattern}`),
    output: board,
  });
}

// --- Guesser: the only model call per lap ---
// `{Board.pattern}` reads a field off this node's input. Only the part after
// the dot matters; `Board` is a label for the reader.

const guesser = new LlmAgent({
  name: "guesser",
  model: "gemini-3.8-flash",
  description: "Guesses one letter in a game of hangman.",
  instruction: `You are playing hangman. Find the hidden English word one letter at a time.

Word so far: {Board.pattern}
Already guessed: {Board.guessed}
Lives left: {Board.livesLeft}

Each underscore is one hidden letter. Choose the single letter most likely to be
in the word. Never repeat a letter you already guessed. Reply with that one letter.`,
  outputSchema: GuessSchema,
  // One letter needs little thought. Gemini 3.8 Flash defaults to medium
  // thinking; low keeps each lap to a few seconds on stage.
  generateContentConfig: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
});

// --- Score: one guess against the secret ---
// Every guess either reveals a new letter or costs a life. A repeated or
// malformed guess costs a life too, so no lap can pass without progress.

function score(ctx: NodeContext, guess: Guess) {
  const secret = ctx.state.get("secret") as string;
  const guessed = (ctx.state.get("guessed") as string[] | undefined) ?? [];
  let misses = (ctx.state.get("misses") as number | undefined) ?? 0;
  const turns = ((ctx.state.get("turns") as number | undefined) ?? 0) + 1;
  ctx.state.set("turns", turns);

  const letter = guess.letter.trim().toLowerCase();
  let verdict: string;
  let next = guessed;
  if (letter.length !== 1 || !ALPHABET.includes(letter)) {
    misses += 1;
    verdict = `"${guess.letter}" is not one letter, a life lost`;
  } else if (guessed.includes(letter)) {
    misses += 1;
    verdict = `${letter} again, a life lost`;
  } else {
    next = [...guessed, letter];
    if (secret.includes(letter)) {
      verdict = `${letter} ✓`;
    } else {
      misses += 1;
      verdict = `${letter} ✗`;
    }
  }
  ctx.state.set("guessed", next);
  ctx.state.set("misses", misses);

  const board = toBoard(secret, next, misses);
  return { board, misses, solved: !board.pattern.includes("_"), verdict, turns };
}

// --- Judge: deterministic node that also picks the route ---
// The engine follows `event.route` and nothing else, so the judge sets it.
// Its `output` is the new board, which the next lap's guesser receives as input.

function judge(ctx: NodeContext, guess: Guess) {
  const { board, misses, solved, verdict, turns } = score(ctx, guess);
  // Two exits: the word is found, or the lives run out.
  const route = solved ? "SOLVED" : misses >= MAX_MISSES ? "HANGED" : "GUESS";

  return createEvent({
    ...say(ctx, "judge", `guess ${turns}: ${verdict.padEnd(10)} ${board.pattern}   ${hearts(misses)}   → ${route}`),
    route,
    output: board,
  });
}

// --- Result: terminal node ---

function result(ctx: NodeContext) {
  const secret = ctx.state.get("secret") as string;
  const misses = (ctx.state.get("misses") as number | undefined) ?? 0;
  const turns = (ctx.state.get("turns") as number | undefined) ?? 0;

  return misses >= MAX_MISSES
    ? `Hanged after ${turns} guesses. The word was "${secret}".`
    : `Solved "${secret}" in ${turns} guesses with ${MAX_MISSES - misses} ${MAX_MISSES - misses === 1 ? "life" : "lives"} left.`;
}

// --- Workflow ---
// Build each node once and reuse the reference: edges match nodes by object
// identity, and the Workflow constructor throws on two nodes with one name.

const setupNode = node(setup, { name: "setup" });
const judgeNode = node(judge, { name: "judge", inputSchema: GuessSchema });
const resultNode = node(result, { name: "result" });

export const rootAgent = new Workflow({
  name: "hangman",
  edges: [
    ["START", setupNode, guesser, judgeNode],
    // A route that matches no edge stops the branch silently (a debug-level
    // log in workflow/graph.js:102). DEFAULT_ROUTE is the safety net.
    [judgeNode, { GUESS: guesser, SOLVED: resultNode, HANGED: resultNode, [DEFAULT_ROUTE]: resultNode }],
  ],
});
