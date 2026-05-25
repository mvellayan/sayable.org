// SSE client for the streaming chat endpoint. The chat Lambda function URL
// returns text/event-stream with one event per `event:` / `data:` block.
//
// Usage:
//   for await (const event of openChatStream({ text, token })) {
//     switch (event.type) {
//       case "typing-start": ...
//       case "text-delta": ...
//       case "message-complete": ...
//       case "typing-stop": ...
//       case "mood-update": ...
//       case "turn-start": ...
//       case "turn-end": ...
//     }
//   }

const CHAT_URL = import.meta.env.VITE_CHAT_STREAM_URL || "";

export async function* openChatStream({ text, token }) {
  if (!CHAT_URL) {
    throw new Error("VITE_CHAT_STREAM_URL not configured");
  }
  const res = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`chat stream failed: HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });

    // SSE events end with a blank line. Split on double newline.
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
