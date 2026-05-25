# 01 — Data Model: Profiles, Relationships, Threads

The core entities of the app: each user's communication profile, the relationship
object that links two users, and the named chat threads within a relationship.

---

## 1. Communication Profile

Each user has an editable communication profile.

The profile captures:

- How I prefer to receive hard feedback
- What makes me defensive
- What helps me calm down
- What makes me feel heard
- How I tend to act during conflict
- What I am trying to improve
- Topics that are sensitive for me
- Words, tones, or patterns that escalate me
- Repair attempts that work for me

The profile should feel practical, not clinical.

**Visibility options:**

- Private to me
- Available to My Coach
- Shareable with selected relationship
- Shared with all active relationships

AI-generated observations should be explainable and editable.

---

## 2. Relationships

The app supports a relationship object between two users.

**Initial primary relationship type:**

- Romantic couple

**Data model should support:**

- Spouse
- Dating partner
- Family member
- Friend
- Work relationship
- Other

**Each relationship includes:**

- Two users
- Relationship name/label
- Active/inactive status
- Shared relationship patterns
- Shared conversation threads
- Shared mediator summaries
- Shared safety state
- Relationship-level settings

---

## 3. Chat Threads

The same two users can have multiple named threads.

**Examples:**

- Money
- Parenting
- Travel planning
- Household responsibilities
- Feeling unheard
- Family boundaries
- Repair after argument
- Appreciation
- Decision making

**Each thread includes:**

- Thread name
- Detected or selected conversation goal
- Current state/status
- Sent messages
- Private drafts per user
- Private AI reviews per user
- Shared mediator summaries
- Safety status
- Relationship-pattern links
- Last activity date

Users may rename threads.
