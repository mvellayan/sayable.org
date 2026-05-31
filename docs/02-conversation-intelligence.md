# 02 — Conversation Intelligence

How the app detects intent, reviews private drafts, and surfaces lightweight status —
the coaching layer that operates around each message.

---

## 4. Conversation Goal Detection

The app detects the likely goal of a conversation or message.

**Possible goals:**

- Express hurt
- Repair conflict
- Make a decision
- Plan something
- Ask for help
- Set a boundary
- Apologize
- Clarify misunderstanding
- Share appreciation
- Discuss recurring issue
- Pause conversation
- End conversation respectfully

Either user may change the detected goal.

The AI's coaching should change based on the goal.

**Example:**

- A boundary-setting message should not be softened into weakness.
- An apology should not be rewritten into self-defense.

---

## 5. Message Drafting

A user's typed message remains private until sent.

**Private draft flow:**

1. User types message.
2. My Coach reviews it.
3. User sees possible issues and suggested rewrites.
4. User may accept, edit, retry, or send original.
5. Only the final sent message is visible to the other user.

Private drafts are never visible to the other user.

---

## 6. AI Message Review

My Coach may review a draft before sending.

**The review may identify:**

- What the user is trying to say
- How the other person may hear it
- What is clear
- What may hurt
- What may trigger defensiveness
- What emotional state appears present
- What may be missing
- Better version
- Warmer version
- Firmer version
- Shorter version

The user remains in control. They may:

- Send original
- Send revised version
- Edit suggestion
- Ask for another version
- Cancel

---

## 7. Chat Status Indicators

The app tracks lightweight conversation states.

**Possible statuses:**

- Calm
- Sensitive
- Escalating
- Misunderstood
- Circular
- Paused
- Repair opportunity
- Needs clarity
- Safety concern
- Dormant
- Ended

These are not heavy "modes." They are quiet status indicators surfaced only when useful.

---

## 8. Misunderstanding Detection

The app detects when users may be talking past each other.

The UI should avoid homework-like checkpoints. Instead, show a subtle status:

**Possibly misunderstood**

**Available actions:**

- Summarize where we are
- Help me respond
- Ask a clarifying question
- Pause for now

The app may also privately help the receiver interpret the message:

- What they may be trying to say
- What may have hurt you
- What might be a non-escalating response
- What clarification could you ask for?

---

## 8a. Coach Skills (Composable Competences)

My Coach applies a small, curated set of communication *competences* —
de-escalation, boundaries, repair, listening-back, naming-the-feeling,
money-talk — assembled in one voice, never as competing agents. A skill is a
competence ("discuss money without it becoming about blame"), never
representation ("help me win"). Up to two apply per message, biased by the
conversation's purpose and the coach reading the draft.

**Visibility — felt, not chosen.** There is no skill-picker, loadout, or
settings catalog. Instead, at the moment the coach is helping, it quietly shows
which competence it is leaning on (e.g. *leaning on: de-escalation*), and the
user can redirect it with a one-tap nudge. The label and nudge are private
("only you see this") and styled recessively, never as loud as a human message.

---

## 8b. Current Observations

My Coach always shows its current observations, so it reads as observant and
reflective rather than reactive.

**About you and the dynamic — never the other person.** Observations reflect on
the user's own communication and the shape of the exchange. They never contain a
tactical read of the other person. Connection is half saying, half hearing: an
observation helps you see yourself and the conversation, not a lever to manage
your partner.

- Good: "You've raised three points without being acknowledged yet."
- Good: "This started as logistics, but it's really about feeling forgotten."
- Never: "She's defensive right now — push here."

**Privacy.** Observations are private to the user, assembled only inside the
coach's private context boundary; they never contain the other person's private
data.

**Refresh.** Observations update when the user opens the thread and right after
they send — current at the moments the user looks, without paying for every
message in a fast exchange.
