// SSE client for the private coach review (coachFn Lambda function URL).
// My Coach reviews a draft before it's sent. Streams to the requesting user only.
//
// Usage:
//   for await (const ev of openCoachStream({ relationshipId, threadId, draftText, token })) {
//     if (ev.type === "text-delta") append(ev.text);
//     if (ev.type === "review-complete") done(ev.reviewId);
//     if (ev.type === "error") show(ev.error);
//   }

const COACH_URL = import.meta.env.VITE_COACH_STREAM_URL || "";

export async function* openCoachStream({ relationshipId, threadId, draftText, token, skill }) {
  if (!COACH_URL) throw new Error("VITE_COACH_STREAM_URL not configured");
  const res = await fetch(COACH_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    // `skill` (optional) is the one-tap nudge: a manual competence override the
    // server biases selection toward. Omitted = auto-selection by purpose.
    body: JSON.stringify({ relationshipId, threadId, draftText, skill: skill || undefined }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`coach stream failed: HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      const lines = raw.split("\n");
      let event = "message";
      let dataLine = "";
      for (const ln of lines) {
        if (ln.startsWith("event:")) event = ln.slice(6).trim();
        else if (ln.startsWith("data:")) dataLine += ln.slice(5).trim();
      }
      if (!dataLine) continue;
      let data = {};
      try {
        data = JSON.parse(dataLine);
      } catch (e) {
        console.warn("sse_parse_failed", e, dataLine);
        continue;
      }
      yield { type: event, ...data };
    }
  }
}
