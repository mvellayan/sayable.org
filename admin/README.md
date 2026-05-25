# admin/

Operator scripts for BetterVibe. These are NOT part of the deployed app — they run on your laptop with your AWS credentials.

## Setup once

```bash
cp ../aws/env.example ../aws/.env   # or symlink
# ensure aws CLI works against the right profile
aws sts get-caller-identity
```

## Scripts

| Script | Purpose |
|---|---|
| `bootstrap-characters.ts` | One-time: generate first-pass dossiers + voice instructions for the 7 characters by feeding *The Great BetterVibe* text into Claude Opus. Writes JSON files into `dossiers/`. **Hand-tune before launch.** |
| `generate-character-avatars.ts` | One-time: AI-generate 1920s-portrait avatars for the 7 characters. Uploads to the avatars S3 bucket. Iterate until visual style is consistent. |
| `seed-characters.ts` | Push the contents of `dossiers/*.json` (plus `accentHex`, `moodDimensions`, `moodBaseline` from `backend/ai/personas.js`) into the `BetterVibeCharacters` DynamoDB table. Re-runnable. |
| `invite-friend.sh` | Add a friend by email — pre-approves them so they can sign in without the admin-approval flow. Usage: `./invite-friend.sh <email> <firstName> [lastName]`. |
| `update-avatar.sh` | Source from `~/.zshrc` to add `update_friend_avatar` and `update_my_avatar` helpers. Useful when you want to swap a friend's photo without going through the app UI. |

## Dossier workflow

The chosen workflow (resolved via /office-hours): dossiers live as JSON in `dossiers/`, are committed to the repo, and `seed-characters.ts` syncs them to DynamoDB on each deploy.

```
admin/dossiers/bettervibe.json
admin/dossiers/nick.json
admin/dossiers/daisy.json
admin/dossiers/tom.json
admin/dossiers/jordan.json
admin/dossiers/myrtle.json
admin/dossiers/george.json
```

Each file looks like:

```json
{
  "characterId": "bettervibe",
  "displayName": "Jay BetterVibe",
  "dossier": "<~500 words: traits, vocabulary tics, what they care about, what they avoid, default emotional posture>",
  "voice": "<2-3 sentence style guide: length, register, pet phrases, things to never do>"
}
```

The `dossier` and `voice` fields override `backend/ai/personas.js` at runtime. The personas.js defaults are intentionally rough stubs — they exercise the plumbing but won't produce the screenshot-worthy moments. The hand-tuned dossiers are what make Tom sound like Tom.
