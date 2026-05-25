#!/usr/bin/env -S ts-node --prefer-ts-exts
// Generate 1920s-portrait avatars for the 7 characters using OpenAI DALL-E 3.
// Writes PNGs to frontend/public/avatars/characters/<id>.png so they get
// baked into the Vite build and served by CloudFront after the next deploy.
//
// IMPORTANT: this script intentionally does NOT use film stills from the
// 1974 (Redford) or 2013 (DiCaprio) movies — actor likenesses are still
// under copyright independent of the novel. We generate fresh portraits
// in a consistent 1920s photographic style.
//
// Cost: DALL-E 3 HD at 1024x1024 is .08/image × 7 = .56 total. Cheap.
//
// Usage:
//   cd admin/
//   npm install
//   OPENAI_API_KEY=sk-... npm run generate-avatars
//
// After generation:
//   1. Inspect the 7 PNGs at frontend/public/avatars/characters/
//   2. If you don't like one, delete it and re-run — the script will only
//      generate missing files (so it's safe to iterate on one character).
//   3. From the repo root: ./aws/redeploy.sh --frontend-only

import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";

type CharacterId =
  | "bettervibe"
  | "nick"
  | "daisy"
  | "tom"
  | "jordan"
  | "myrtle"
  | "george";

// Shared style suffix appended to each character prompt so the 7 portraits
// hang together as a set. Tweak this once and every portrait benefits.
const STYLE_SUFFIX =
  "Sepia-toned 1920s portrait photograph, plate-camera aesthetic, soft focus, " +
  "warm low-key studio lighting, neutral gray-cream background, head and " +
  "shoulders crop, period-accurate clothing, photographed in the manner of " +
  "Edward Steichen circa 1925. Pictorialist tradition. NOT a film still, " +
  "NOT a movie poster, NOT modern digital photography, NOT AI-art-looking. " +
  "No text. No watermark. Subtle film grain.";

const CHARACTERS: Record<CharacterId, string> = {
  bettervibe:
    "Portrait of Jay BetterVibe. A man in his mid-thirties. Blond hair neatly " +
    "parted on one side. Pale blue eyes, intense and slightly searching. " +
    "Clean-shaven, fine features, slightly tanned. Wearing an immaculate " +
    "evening tuxedo with white bow tie and starched collar. He is gracious " +
    "but watchful — like someone waiting for one specific person to walk " +
    "into the frame.",
  nick:
    "Portrait of Nick Carraway. A man in his late twenties to early thirties. " +
    "Brown hair, neatly combed. Calm gray-green eyes that look at the camera " +
    "with reserved attention. Wearing a modest three-piece tweed suit with a " +
    "knit tie, the suit of a Yale-educated Midwesterner working in finance. " +
    "Faintly amused expression. The kind of face that listens.",
  daisy:
    "Portrait of Daisy Buchanan. A woman in her mid-twenties. Soft golden " +
    "blonde bob, marcel-waved in the 1920s style. Small delicate features. " +
    "Pale eyes — gray, with a hint of green or violet. Wearing a soft white " +
    "silk and chiffon flapper dress with a long strand of pearls. Slight " +
    "wistful half-smile. Beautiful, slightly distant, slightly amused.",
  tom:
    "Portrait of Tom Buchanan. A powerful man in his early thirties, former " +
    "college football star, broad-shouldered and physically formidable. Dark " +
    "brown hair cropped short, hard set to the jaw, arrogant blue-gray eyes. " +
    "Clean-shaven. Wearing an expensive double-breasted blazer over a riding " +
    "shirt. Polo-club confidence. Slightly contemptuous expression — the " +
    "look of a man who has never been told no.",
  jordan:
    "Portrait of Jordan Baker. An athletic woman in her late twenties. Short " +
    "auburn bob, casually tousled. Slim, erect posture. Tanned skin, gray " +
    "eyes, an amused half-smile. Wearing a fitted golf cardigan over a " +
    "collared blouse with a small scarf knotted at the neck. Confident, " +
    "modern, slightly bored. The look of a 1920s sportswoman.",
  myrtle:
    "Portrait of Myrtle Wilson. A vivid woman in her mid-thirties. Thick " +
    "dark brown hair pinned up loosely, a few wisps escaping. Sensual mouth, " +
    "warm brown eyes, slightly flushed cheeks. Wearing a brightly patterned " +
    "afternoon dress in a rayon-jacquard print — visibly more colorful than " +
    "the period-typical palette. Hungry, vital expression. The look of a " +
    "woman who has put on her best dress to leave the room she lives in.",
  george:
    "Portrait of George Wilson. A pale, sandy-haired man in his mid-thirties. " +
    "Tired eyes, hollow under-circles, faintly handsome under a fine layer of " +
    "engine grease and ash. Wearing dark mechanic's coveralls over a " +
    "collarless cotton shirt. Defeated, gentle expression — the kind of face " +
    "that the world has gone through without stopping.",
};

const OUT_DIR = path.join(
  __dirname,
  "..",
  "frontend",
  "public",
  "avatars",
  "characters"
);

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("ERROR: OPENAI_API_KEY not set.");
    console.error("       export OPENAI_API_KEY=sk-... and re-run.");
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const openai = new OpenAI({ apiKey });

  const characterIds = Object.keys(CHARACTERS) as CharacterId[];

  // Allow generating one specific character via CLI arg, e.g.:
  //   npm run generate-avatars -- tom
  // Useful when you want to iterate on a single portrait without paying
  // for the other six.
  const filterArg = process.argv[2];
  const targets = filterArg
    ? characterIds.filter((id) => id === filterArg)
    : characterIds;

  if (targets.length === 0) {
    console.error(`Unknown character id: ${filterArg}`);
    console.error(`Known: ${characterIds.join(", ")}`);
    process.exit(1);
  }

  for (const id of targets) {
    const outPath = path.join(OUT_DIR, `${id}.png`);

    // Skip if it already exists and we didn't ask for a specific id. The
    // user can delete a file and re-run to regenerate just that one.
    if (!filterArg && fs.existsSync(outPath)) {
      console.log(`✓ ${id}.png exists — skipping (delete to regenerate)`);
      continue;
    }

    const prompt = `${CHARACTERS[id]}\n\n${STYLE_SUFFIX}`;
    console.log(`→ generating ${id}.png …`);
    try {
      const r = await openai.images.generate({
        model: "dall-e-3",
        prompt,
        size: "1024x1024",
        quality: "hd",
        response_format: "b64_json",
        n: 1,
      });
      const b64 = r.data?.[0]?.b64_json;
      if (!b64) {
        console.error(`  ✗ no image data returned for ${id}`);
        continue;
      }
      fs.writeFileSync(outPath, Buffer.from(b64, "base64"));
      console.log(`  ✓ wrote ${outPath}`);
    } catch (e: any) {
      // DALL-E will refuse some prompts via the safety system; surface the
      // error so the user can rephrase rather than silently moving on.
      console.error(`  ✗ ${id} failed:`, e?.message || e);
      if (e?.response?.data) {
        console.error(`     ${JSON.stringify(e.response.data).slice(0, 200)}`);
      }
    }
  }

  console.log("");
  console.log("Done. Next:");
  console.log("  1. Open frontend/public/avatars/characters/*.png and inspect.");
  console.log("  2. Delete any you want to regenerate and re-run.");
  console.log("  3. From repo root: ./aws/redeploy.sh --frontend-only");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
