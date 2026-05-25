#!/usr/bin/env -S npx ts-node --prefer-ts-exts
// Sync admin/dossiers/*.json + the static fields in backend/ai/personas.js
// into the BetterVibeCharacters DynamoDB table. Re-runnable.
//
// Usage: AWS_PROFILE=default AWS_REGION=us-east-1 npx ts-node admin/seed-characters.ts

import fs from "node:fs";
import path from "node:path";
import {
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION || "us-east-1";
const TABLE = process.env.CHARACTERS_TABLE || "BetterVibeCharacters";

// Load the static schema fields from the runtime personas module.
// We can't `require` the JS module directly from TS without ts-node's
// help, but `backend/ai/personas.js` exports plain CJS so the dynamic
// import path works either way.
const personasPath = path.join(__dirname, "..", "backend", "ai", "personas.js");
const dossiersDir = path.join(__dirname, "dossiers");

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { CHARACTERS } = require(personasPath);
  const raw = new DynamoDBClient({ region: REGION });
  const ddb = DynamoDBDocumentClient.from(raw, {
    marshallOptions: { removeUndefinedValues: true },
  });

  let count = 0;
  for (const id of Object.keys(CHARACTERS)) {
    const base = CHARACTERS[id];
    const dossierPath = path.join(dossiersDir, `${id}.json`);
    let dossier = base.dossier;
    let voice = base.voice;
    if (fs.existsSync(dossierPath)) {
      const parsed = JSON.parse(fs.readFileSync(dossierPath, "utf8"));
      if (parsed.dossier) dossier = parsed.dossier;
      if (parsed.voice) voice = parsed.voice;
      console.log(`  using hand-tuned dossier for ${id}`);
    } else {
      console.log(`  no dossier file for ${id} — using stub from personas.js`);
    }
    const row = {
      characterId: base.characterId,
      displayName: base.displayName,
      avatarUrl: base.avatarPath,
      accentHex: base.accentHex,
      dossier,
      voice,
      moodDimensions: base.moodDimensions,
      moodBaseline: base.moodBaseline,
      updatedAt: new Date().toISOString(),
    };
    await ddb.send(new PutCommand({ TableName: TABLE, Item: row }));
    count++;
  }
  console.log(`Seeded ${count} characters into ${TABLE}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
