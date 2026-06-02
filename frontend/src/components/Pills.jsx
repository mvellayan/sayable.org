import React from "react";

// Emotion pills — scannable feeling labels in a few WARM tints (DESIGN.md: no
// red, no blue, never clinical). Each emotion word maps to a tint family; the
// safety pill is a distinct ochre, never alarm red.
const FAMILY = {
  // tense → ochre
  tense: [
    "angry", "anger", "frustrated", "frustration", "irritated", "annoyed",
    "defensive", "heated", "tense", "hostile", "contempt", "resentful",
    "resentment", "exasperated", "impatient", "blamed", "attacked",
  ],
  // vulnerable → soft clay
  vulnerable: [
    "hurt", "sad", "sadness", "lonely", "rejected", "dismissed", "unheard",
    "unseen", "disappointed", "grief", "ashamed", "shame", "anxious", "worried",
    "scared", "afraid", "fearful", "overwhelmed", "nervous", "insecure",
    "vulnerable", "helpless", "guilty", "pressured",
  ],
  // warm → muted sage
  warm: [
    "calm", "hopeful", "grateful", "relieved", "content", "loving", "tender",
    "open", "connected", "appreciative", "warm", "reassured", "caring",
    "supported", "playful", "curious",
  ],
};

function familyOf(word) {
  const w = String(word).toLowerCase().trim();
  for (const [fam, words] of Object.entries(FAMILY)) {
    if (words.includes(w)) return fam;
  }
  return "neutral";
}

export default function Pills({ emotions, safety = false }) {
  const list = (emotions || []).filter(Boolean);
  if (!safety && list.length === 0) return null;
  return (
    <div className="pills">
      {safety && <span className="pill pill--safety">safety concern</span>}
      {list.map((e, i) => (
        <span key={`${e}-${i}`} className={`pill pill--${familyOf(e)}`}>
          {e}
        </span>
      ))}
    </div>
  );
}
