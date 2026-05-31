# 05 — Safety

The hard line. When the app detects dangerous escalation, it stops being a
communication tool. This is a load-bearing requirement, not a feature.

---

## 14. Safety-First Guidance

When the app detects dangerous escalation, it stops normal coaching.

**Safety triggers may include:**

- Threats of violence
- Self-harm threats
- Coercion
- Abuse
- Stalking
- Repeated harassment
- Extreme intimidation
- Immediate danger
- One person expressing fear for safety

**When safety mode is triggered:**

- The thread is marked **Ended**
- No further normal messages may be exchanged in that thread
- The app stops helping draft, soften, persuade, or repair
- Any new attempted message returns a safety message to both users
- The app encourages emergency help when appropriate
- The app may suggest starting a new lower-temperature thread later, only if safe

**Example safety message:**

> This conversation appears to have escalated into a safety concern. Sayable cannot
> continue coaching or sending messages in this thread. If anyone is in immediate
> danger, call emergency services such as 911. Consider pausing this conversation and
> seeking real-world help.

**This is a very important requirement.**

---

## 14a. Manipulation & the Competence Line

The coach helps with communication *competence*, never *representation*. It
refuses to help one user manipulate, pressure, guilt, gaslight, or wear down the
other — guilt-tripping, DARVO, coercive pressure. This line is enforced in the
prompt guardrail, not just stated as a principle, and is covered by a manipulation
eval suite.

**Where protection actually lives.** A compose-side refusal is necessary but not
sufficient: someone intent on pressuring the other person can simply type the
message and send it without ever opening the coach. The structural protection is
the **Shared Mediator** (§9), which sees only the shared sent messages, forms an
independent assessment, and can name a coercive dynamic neutrally to both people.
The app does not claim a refusal-only guardrail as protection.

Receiver-side protection — each person's own coach flagging incoming coercion to
the target — is the strongest answer and is planned, not yet built.

---

## 15. No Third-Party Participation

No third parties are added to chats.

No therapists, friends, family members, pastors, or external mediators inside the
conversation.

This keeps the app simpler, more private, and less legally exposed.
