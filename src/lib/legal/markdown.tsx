// src/lib/legal/markdown.tsx
//
// A deliberately small markdown renderer for content/legal/*.md.
//
// Why not a library: the legal pages need headings, paragraphs, lists, a
// table, a callout, bold and links — nothing more — and pulling in a full
// markdown/MDX toolchain for two static pages is a lot of dependency for that.
// The output is React elements built node by node, never an HTML string, so
// there is no dangerouslySetInnerHTML and nothing in the content can inject
// markup.
//
// Supported syntax (anything else renders as plain paragraph text):
//
//   ## Heading          → <h2 id="heading"> with a self-link, listed in the TOC
//   ### Sub-heading     → <h3 id="sub-heading"> with a self-link
//   - item / * item     → <ul>
//   1. item             → <ol>
//   > text              → callout
//   | a | b |           → table (second row must be the |---| separator)
//   **bold**, [text](href)
//   <!-- editor notes -->  → stripped

import { readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import type { ReactNode } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Block =
  | { type: "h2" | "h3"; text: string; id: string }
  | { type: "p"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "callout"; text: string }
  | { type: "table"; head: string[]; rows: string[][] };

export interface TocEntry {
  id: string;
  text: string;
}

export interface LegalDoc {
  blocks: Block[];
  toc: TocEntry[];
}

// ─── Loading ─────────────────────────────────────────────────────────────────

/**
 * Read and parse a document from content/legal/. Called from static server
 * components, so this runs at build time and the file is never read per
 * request.
 */
export function loadLegalDoc(file: string): LegalDoc {
  const source = readFileSync(path.join(process.cwd(), "content", "legal", file), "utf8");
  return parseMarkdown(source);
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/\*\*|\[|\]\([^)]*\)/g, "")
      .replace(/&/g, "and")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-") || "section"
  );
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function parseMarkdown(source: string): LegalDoc {
  // HTML comments are editor notes for whoever maintains the file — stripped
  // before parsing so they never reach the page.
  const lines = source
    .replace(/\r\n?/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n");
  const blocks: Block[] = [];
  const toc: TocEntry[] = [];
  const usedIds = new Map<string, number>();

  // Two headings with the same text would otherwise share an id, and the
  // second anchor would silently jump to the first.
  const uniqueId = (text: string) => {
    const base = slugify(text);
    const n = usedIds.get(base) ?? 0;
    usedIds.set(base, n + 1);
    return n === 0 ? base : `${base}-${n + 1}`;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // The page renders its own <h1> from policies.ts; a leading "# Title" in
    // the file is there for anyone reading the raw markdown and is skipped.
    if (/^#\s/.test(trimmed)) {
      i++;
      continue;
    }

    const heading = /^(#{2,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const text = heading[2].trim();
      const id = uniqueId(text);
      const type = heading[1].length === 2 ? "h2" : "h3";
      blocks.push({ type, text, id });
      if (type === "h2") toc.push({ id, text: text.replace(/\*\*/g, "") });
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    if (trimmed.startsWith(">")) {
      const parts: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        parts.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "callout", text: parts.join(" ") });
      continue;
    }

    if (trimmed.startsWith("|") && /^\|?\s*:?-{3,}/.test(lines[i + 1]?.trim() ?? "")) {
      const head = splitRow(trimmed);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", head, rows });
      continue;
    }

    // Paragraph: consume until a blank line or the start of another block.
    const parts: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3}\s|[-*]\s|\d+\.\s|>|\|)/.test(lines[i].trim())
    ) {
      parts.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: "p", text: parts.join(" ") });
  }

  return { blocks, toc };
}

// ─── Rendering ───────────────────────────────────────────────────────────────

const linkClass =
  "font-medium text-accent underline decoration-accent/40 underline-offset-2 transition-colors hover:decoration-accent";

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let n = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const key = `${keyPrefix}-${n++}`;

    if (match[1] !== undefined) {
      nodes.push(
        <strong key={key} className="font-semibold text-foreground">
          {match[1]}
        </strong>,
      );
    } else {
      const label = match[2];
      const href = match[3];
      if (href.startsWith("/") || href.startsWith("#")) {
        nodes.push(
          <Link key={key} href={href} className={linkClass}>
            {label}
          </Link>,
        );
      } else if (/^(https?:|mailto:)/.test(href)) {
        const external = href.startsWith("http");
        nodes.push(
          <a
            key={key}
            href={href}
            className={linkClass}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {label}
          </a>,
        );
      } else {
        // Unknown scheme (javascript:, data:, …) — render the label, drop the link.
        nodes.push(label);
      }
    }
    last = pattern.lastIndex;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function HeadingAnchor({ id, label }: { id: string; label: string }) {
  return (
    <a
      href={`#${id}`}
      aria-label={`Link to section: ${label}`}
      className="ml-2 align-middle text-[0.6em] text-muted-foreground no-underline opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
    >
      #
    </a>
  );
}

export function LegalMarkdown({ doc }: { doc: LegalDoc }) {
  return (
    <>
      {doc.blocks.map((block, idx) => {
        const key = `b${idx}`;
        switch (block.type) {
          case "h2":
            return (
              <h2
                key={key}
                id={block.id}
                className="group mt-14 scroll-mt-24 border-t border-border pt-8 font-display text-2xl font-[480] tracking-[-0.02em] text-foreground first:mt-0 first:border-t-0 first:pt-0 sm:text-[1.75rem]"
              >
                {renderInline(block.text, key)}
                <HeadingAnchor id={block.id} label={block.text.replace(/\*\*/g, "")} />
              </h2>
            );
          case "h3":
            return (
              <h3
                key={key}
                id={block.id}
                className="group mt-8 scroll-mt-24 text-lg font-semibold tracking-tight text-foreground"
              >
                {renderInline(block.text, key)}
                <HeadingAnchor id={block.id} label={block.text.replace(/\*\*/g, "")} />
              </h3>
            );
          case "p":
            return (
              <p key={key} className="mt-4">
                {renderInline(block.text, key)}
              </p>
            );
          case "ul":
          case "ol": {
            const ListTag = block.type;
            return (
              <ListTag
                key={key}
                className={`mt-4 space-y-2 pl-6 marker:text-muted-foreground ${
                  block.type === "ul" ? "list-disc" : "list-decimal"
                }`}
              >
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`} className="pl-1">
                    {renderInline(item, `${key}-${j}`)}
                  </li>
                ))}
              </ListTag>
            );
          }
          case "callout":
            return (
              <div
                key={key}
                className="mt-6 rounded-xl border border-border border-l-2 border-l-accent bg-card px-5 py-4 text-[15px]"
              >
                {renderInline(block.text, key)}
              </div>
            );
          case "table":
            return (
              <div key={key} className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {block.head.map((cell, j) => (
                        <th
                          key={`${key}-h${j}`}
                          scope="col"
                          className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                        >
                          {renderInline(cell, `${key}-h${j}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={`${key}-r${r}`} className="border-b border-border align-top last:border-b-0">
                        {row.map((cell, c) => (
                          <td key={`${key}-r${r}-${c}`} className="px-4 py-3 leading-relaxed">
                            {renderInline(cell, `${key}-r${r}-${c}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </>
  );
}
