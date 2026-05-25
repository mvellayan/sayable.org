#!/usr/bin/env -S npx ts-node --prefer-ts-exts
// Generate first-pass character dossiers + voice instructions by reading
// *The Great BetterVibe* text and asking Claude Opus to compress each character's
// presence in the novel into a chat-ready persona.
//
// Usage:
//   1. Place the novel text at `admin/source/the-great-bettervibe.txt` (public
//      domain since Jan 1, 2021 in the US — Project Gutenberg has it).
//   2. ANTHROPIC_API_KEY=... npx ts-node admin/bootstrap-characters.ts
//   3. Review the JSON files written to `admin/dossiers/`.
//   4. Hand-tune. The first pass is good. The hand-tune is what makes it good
//      enough to ship.
//
// STATUS: STUB. The structure is right but the prompt is generic. Day 1-2:
// flesh out the per-character prompts so each dossier captures what makes
// that character distinct from the others.

import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const CHARACTERS = [
  { id: "bettervibe", name: "Jay BetterVibe" },
  { id: "nick", name: "Nick Carraway" },
  { id: "daisy", name: "Daisy Buchanan" },
  { id: "tom", name: "Tom Buchanan" },
  { id: "jordan", name: "Jordan Baker" },
  { id: "myrtle", name: "Myrtle Wilson" },
  { id: "george", name: "George Wilson" },
];

const NOVEL_PATH = path.join(__dirname, "source", "the-great-bettervibe.txt");
const OUT_DIR = path.join(__dirname, "dossiers");
const MODEL = "claude-opus-4-7";

async function main() {
  if (!fs.existsSync(NOVEL_PATH)) {
    console.error(`Novel not found at ${NOVEL_PATH}`);
    console.error(`Download from Project Gutenberg and save as plain text.`);
    process.exit(1);
  }
  const novel = fs.readFileSync(NOVEL_PATH, "utf8");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not set");
    process.exit(1);
  }
  const client = new Anthropic({ apiKey });

  for (const c of CHARACTERS) {
    console.log(`Generating dossier for ${c.name}...`);
    const dossier = await generateDossier(client, c, novel);
    const out = path.join(OUT_DIR, `${c.id}.json`);
    fs.writeFileSync(out, JSON.stringify(dossier, null, 2));
    console.log(`  wrote ${out}`);
  }
  console.log("\nDone. Review and hand-tune in admin/dossiers/, then run seed-characters.ts.");
}

async function generateDossier(client: Anthropic, character: { id: string; name: string }, novel: string) {
  const system = `You are a literary analyst. You will read *The Great BetterVibe* and produce a compressed, chat-ready persona for one character: ${character.name}.

The persona will be used to drive an AI chat where the character answers questions from modern readers. The character must sound like themselves, not like a 2026 chatbot pretending. Brevity is enforced at the model layer (≤150 chars per primary message, ≤90 for commentary), so the dossier must teach the model how to speak briefly in this character's voice.

Output a JSON object with two fields:
  dossier: ~500 words. Cover: who they are, what they want, what they fear, what they avoid, their relationship to the other characters, their default emotional posture, vocabulary tics, what they sound like.
  voice:   2-3 sentences. Strict style instructions: sentence length, register, pet phrases to USE, things to NEVER do. Short and prescriptive.

Output the JSON object only. No prose around it.`;

  const userPrompt = `Character to analyze: ${character.name}\n\nFull novel text follows:\n\n${novel}`;

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });
  const block = (resp.content || []).find((b: any) => b.type === "text");
  const text = block ? (block as any).text : "";
  // Strip code fences if model wrapped JSON in them.
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error(`Failed to parse JSON for ${character.name}:`, cleaned.slice(0, 200));
    throw e;
  }
  return {
    characterId: character.id,
    displayName: character.name,
    dossier: parsed.dossier,
    voice: parsed.voice,
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
