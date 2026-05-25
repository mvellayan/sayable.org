import React, { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { openChatStream } from "../chatStream";
import { useAuth } from "../auth";

// The whole product is here: a single chat screen.
// Dogfoods DESIGN.md per the spec.

export default function ChatPage() {
  const { token, member } = useAuth();
  const [characters, setCharacters] = useState({});
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState({}); // characterId -> { role }
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  // Initial load: characters + recent messages.
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.characters(), api.messages({ limit: 100 })])
      .then(([c, m]) => {
        if (cancelled) return;
        const byId = {};
        for (const ch of c.characters || []) byId[ch.characterId] = ch;
        setCharacters(byId);
        setMessages(m.messages || []);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-scroll on new content.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, typing]);

  function appendOrUpdateMessage(msg) {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.messageId === msg.messageId);
      if (idx >= 0) {
        const copy = prev.slice();
        copy[idx] = { ...copy[idx], ...msg };
        return copy;
      }
      return [...prev, msg];
    });
  }

  function appendDelta(characterId, deltaText) {
    setMessages((prev) => {
      // Look for the most recent in-flight message from this character
      // (no messageId yet — assigned on complete). We track these as
      // streaming-... ids based on characterId.
      const streamingId = `streaming-${characterId}`;
      const idx = prev.findIndex((m) => m.messageId === streamingId);
      if (idx >= 0) {
        const copy = prev.slice();
        copy[idx] = { ...copy[idx], text: (copy[idx].text || "") + deltaText };
        return copy;
      }
      return [
        ...prev,
        {
          messageId: streamingId,
          roomId: "main",
          ts: new Date().toISOString(),
          senderType: "character",
          senderId: characterId,
          text: deltaText,
          _streaming: true,
        },
      ];
    });
  }

  function finalizeStreaming(characterId, finalMessage) {
    setMessages((prev) => {
      const streamingId = `streaming-${characterId}`;
      const idx = prev.findIndex((m) => m.messageId === streamingId);
      if (idx >= 0) {
        const copy = prev.slice();
        copy[idx] = {
          ...copy[idx],
          messageId: finalMessage.messageId,
          ts: finalMessage.ts,
          text: finalMessage.text,
          characterRole: finalMessage.role,
          _streaming: false,
        };
        return copy;
      }
      // No streaming row found — just append.
      return [
        ...prev,
        {
          messageId: finalMessage.messageId,
          roomId: "main",
          ts: finalMessage.ts,
          senderType: "character",
          senderId: characterId,
          characterRole: finalMessage.role,
          text: finalMessage.text,
        },
      ];
    });
  }

  function setMoodTint(characterId, moodVector) {
    setCharacters((prev) => {
      const c = prev[characterId];
      if (!c) return prev;
      return { ...prev, [characterId]: { ...c, currentMood: moodVector } };
    });
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    setError("");
    setSending(true);

    // Optimistic friend message.
    const optimistic = {
      messageId: `local-${Date.now()}`,
      roomId: "main",
      ts: new Date().toISOString(),
      senderType: "friend",
      senderId: member.memberId,
      senderName: `${member.firstName} ${member.lastName || ""}`.trim(),
      text,
      _optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      for await (const evt of openChatStream({ text, token })) {
        switch (evt.type) {
          case "turn-start":
            // Replace the optimistic friend message with the server-assigned one.
            if (evt.friendMessage) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.messageId === optimistic.messageId ? evt.friendMessage : m
                )
              );
            }
            break;
          case "typing-start":
            setTyping((t) => ({ ...t, [evt.characterId]: { role: evt.role } }));
            break;
          case "text-delta":
            appendDelta(evt.characterId, evt.text);
            break;
          case "message-complete":
            finalizeStreaming(evt.characterId, evt);
            break;
          case "typing-stop":
            setTyping((t) => {
              const copy = { ...t };
              delete copy[evt.characterId];
              return copy;
            });
            break;
          case "mood-update":
            setMoodTint(evt.characterId, evt.moodVector);
            break;
          case "turn-end":
            break;
          case "error":
            setError(evt.error || "Something broke.");
            break;
          default:
            break;
        }
      }
    } catch (e) {
      console.error(e);
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="app">
      <header className="app__header">
        <span className="wordmark">BetterVibe</span>
      </header>
      <main className="app__main">
        <div className="chat" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="chat__empty"><em>The room is quiet.</em></div>
          ) : (
            messages.map((m) => (
              <Message key={m.messageId} m={m} characters={characters} me={member} />
            ))
          )}
          {Object.entries(typing).map(([cid, { role }]) => (
            <TypingBubble
              key={`t-${cid}`}
              characterId={cid}
              role={role}
              characters={characters}
            />
          ))}
        </div>
        <div className="composer">
          <textarea
            className="composer__field"
            placeholder="say something"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            disabled={sending}
          />
          <button
            className="composer__send"
            onClick={send}
            disabled={!draft.trim() || sending}
          >
            send →
          </button>
        </div>
        {error && (
          <div style={{ color: "var(--crimson)", padding: "4px 8px", fontSize: 13 }}>
            {error}
          </div>
        )}
      </main>
    </div>
  );
}

function Message({ m, characters, me }) {
  const isFriend = m.senderType === "friend";
  if (isFriend) {
    const isMe = m.senderId === me.memberId;
    return (
      <div className="msg msg--friend">
        <div className="msg__avatar">
          {me.avatarUrl ? <img src={me.avatarUrl} alt="" /> : initials(m.senderName)}
        </div>
        <div className="msg__column">
          <div className="msg__name">{isMe ? "You" : m.senderName}</div>
          <div className="msg__bubble">{m.text}</div>
          <div className="msg__timestamp">{timeOf(m.ts)}</div>
        </div>
      </div>
    );
  }
  const c = characters[m.senderId] || {};
  return (
    <div className="msg msg--character">
      <div
        className={`msg__avatar ${m.characterRole === "primary" ? "msg__avatar--primary" : ""}`}
      >
        {c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : initials(c.displayName)}
      </div>
      <div className="msg__column">
        <div className="msg__name">{c.displayName || m.senderId}</div>
        <div
          className="msg__bubble"
          style={{ ["--char-tint"]: tintFor(c, m.senderId) }}
        >
          {renderCharacterText(m.text)}
          {m._streaming && <span className="cursor">▍</span>}
        </div>
        <div className="msg__timestamp">{timeOf(m.ts)}</div>
      </div>
    </div>
  );
}

// Parse a character's response into dialogue / stage-direction spans.
// Stage directions are wrapped in single asterisks (*like this*) per the
// system prompt convention. We split on matched asterisk pairs and render
// the *inner* segments as italic muted "narration" — playscript-style.
//
// Unbalanced asterisks (odd count) render as plain text — safe fallback.
function renderCharacterText(text) {
  if (!text) return null;
  // Match *...* spans (non-greedy, no newlines). Multi-line stage
  // directions are rare; if you need them, change \S to . with the
  // dotall flag — but most playscript directions fit one line.
  const parts = text.split(/(\*[^*\n]+\*)/g);
  // If we split on a regex with no matches and got the original string
  // back, there are no stage directions; render as-is.
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <span key={i} className="msg__narration">
          {part.slice(1, -1)}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function TypingBubble({ characterId, role, characters }) {
  const c = characters[characterId] || {};
  return (
    <div className="msg msg--character">
      <div className={`msg__avatar ${role === "primary" ? "msg__avatar--primary" : ""}`}>
        {c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : initials(c.displayName)}
      </div>
      <div className="msg__column">
        <div className="msg__name">{c.displayName || characterId}</div>
        <div className="msg__bubble" style={{ ["--char-tint"]: tintFor(c, characterId) }}>
          <span className="typing">
            <span className="typing__dot" />
            <span className="typing__dot" />
            <span className="typing__dot" />
          </span>
        </div>
      </div>
    </div>
  );
}

function tintFor(character, characterId) {
  // TODO Day 5: shift saturation/hue based on character.currentMood vector.
  // For now, use the base accentHex from the character record.
  return character.accentHex || "#D9CFB8";
}

function timeOf(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function initials(name = "") {
  return name
    .split(" ")
    .map((p) => p.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase() || "·";
}
