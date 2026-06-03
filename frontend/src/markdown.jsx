import React from "react";

// Inline **bold** → <strong>; everything else passes through as text.
export function renderInline(text, k) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? <strong key={`${k}-b${i}`}>{part}</strong> : part
  );
}

// Minimal markdown → the how-to styles. Supports the subset instructions.md
// uses: `# ` title, `> ` lede, `## ` section headings, `- ` bullet lists,
// `---` (everything after it is footnote-styled), and **bold**. Edit
// src/instructions.md to change the copy — no code change needed.
export function renderMarkdown(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let list = null;
  let afterRule = false;
  let key = 0;
  const flushList = () => {
    if (!list) return;
    const items = list;
    blocks.push(
      <ul key={`ul${key++}`}>
        {items.map((it, i) => <li key={i}>{renderInline(it, `li${key}-${i}`)}</li>)}
      </ul>
    );
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushList(); continue; }
    if (line === "---") { flushList(); afterRule = true; continue; }
    if (line.startsWith("- ")) { (list ||= []).push(line.slice(2)); continue; }
    flushList();
    if (line.startsWith("# ")) {
      blocks.push(<h2 key={`b${key++}`} className="info-modal__title">{renderInline(line.slice(2), `t${key}`)}</h2>);
    } else if (line.startsWith("### ")) {
      blocks.push(<h3 key={`b${key++}`}>{renderInline(line.slice(4), `h${key}`)}</h3>);
    } else if (line.startsWith("## ")) {
      blocks.push(<h3 key={`b${key++}`}>{renderInline(line.slice(3), `h${key}`)}</h3>);
    } else if (line.startsWith("> ")) {
      blocks.push(<p key={`b${key++}`} className="info-modal__lede">{renderInline(line.slice(2), `l${key}`)}</p>);
    } else {
      blocks.push(<p key={`b${key++}`} className={afterRule ? "info-modal__foot" : undefined}>{renderInline(line, `p${key}`)}</p>);
    }
  }
  flushList();
  return blocks;
}
