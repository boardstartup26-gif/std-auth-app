"use client";

// src/app/(protected)/_components/QuestionSheetParts.tsx
//
// The pieces of the paper "sheet" a question is printed on: its figure (with a
// full-size viewer) and its context block (literary extract, historical
// passage, reference table). Shared by /evaluate and the practice-paper
// attempt view, so a question looks the same wherever a student meets it.
// Moved verbatim from evaluate/page.tsx.

import { useEffect } from "react";
import {
  contextBlockquote,
  contextExtractText,
  contextItalic,
  contextItem,
  contextMeta,
  contextSource,
  contextTable,
  contextWrapper,
  figCaption,
  figPlate,
  figTool,
} from "@/lib/ui";
import { diagramState, type Question, type StimulusData, type TableData } from "../evaluate/_lib/question";

// ─── Question sheet ───────────────────────────────────────────────────────────

// The figure at full size, over the page. Crops are imperfect at the edges —
// rather than chase perfection, every figure gets a way to be looked at
// properly.
export function FigureViewer({ src, label, onClose }: { src: string; label: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    // The page behind must not scroll while the viewer owns the screen.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col gap-3 bg-black/95 p-4 sm:p-8"
    >
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded border border-border px-3 py-1.5 text-xs font-bold text-foreground transition-colors hover:border-cursor hover:text-cursor"
        >
          Close ✕
        </button>
      </div>
      {/* Stop propagation so clicking the image itself doesn't dismiss. */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={label}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-lg bg-white object-contain"
        />
      </div>
    </div>
  );
}

export function FigureSlot({ q, onZoom }: { q: Question; onZoom: () => void }) {
  const state = diagramState(q);

  if (q.diagram_url) {
    return (
      <figure className="m-0 flex flex-col gap-2">
        <div className={figPlate}>
          <div className="absolute right-2 top-2 z-10">
            <button type="button" onClick={onZoom} className={figTool}>⤢ Zoom</button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={q.diagram_url}
            alt={`Figure for Q${q.question_number}`}
            onClick={onZoom}
            className="max-h-[260px] w-auto max-w-full cursor-zoom-in"
          />
        </div>
        <figcaption className={figCaption}>
          <span>Figure — Q{q.question_number}</span>
          <span className="inline-flex items-center gap-1.5 text-[#2F6B3D] before:block before:h-[5px] before:w-[5px] before:rounded-full before:bg-[#2F8A46]">
            From question paper
          </span>
        </figcaption>
      </figure>
    );
  }

  // No image, and an honest reason why. Never a silent blank.
  if (state === "map") {
    return (
      <div className={`${figPlate} min-h-[88px]`}>
        <p className="m-0 max-w-[280px] text-center text-[10px] leading-relaxed text-paper-ink-soft">
          <span className="font-semibold text-paper-ink">Survey of India map extract</span>
          <br />
          These sheets aren&apos;t ours to reproduce. Refer to your
          <br />
          physical map, then answer below.
        </p>
      </div>
    );
  }

  if (q.diagram_required) {
    return (
      <div className={`${figPlate} min-h-[88px]`}>
        <p className="m-0 max-w-[240px] text-center text-[10px] leading-relaxed text-paper-ink-soft">
          Figure not available yet
          <br />
          <span className="text-[#8A8878]">Refer to your printed paper.</span>
        </p>
      </div>
    );
  }

  return null;
}

// ─── Context block (extract/stimulus) ──────────────────────────────────────
// Renders the passage, literary extract, or picture a question refers to,
// above question_text. Only History & Civics and English Literature rows
// carry this data today; every other subject falls through to no context.
//
// Pictures are NOT handled here — a History & Civics picture question is a
// diagram like any other subject's, so it goes through diagram_url/
// diagram_source/diagram_required and the existing FigureSlot/Report-figure
// machinery below (see scripts/sync_diagram_figures.mjs, which now covers
// the "history" folder the same way it already covers the four science
// subjects). This block covers only what FigureSlot doesn't: literary
// extracts, historical passages, and reference tables.

function LiteratureContext({ q }: { q: Question }) {
  if (!q.literary_work && !q.extract) return null;
  return (
    <div className={contextItem}>
      {q.literary_work && (
        <p className={contextMeta}>
          &ldquo;{q.literary_work.title}&rdquo;
          {q.literary_work.author ? ` — ${q.literary_work.author}` : ""}
        </p>
      )}
      {q.extract?.context_before && <p className={contextItalic}>{q.extract.context_before}</p>}
      {q.extract?.text && <p className={contextExtractText}>{q.extract.text}</p>}
      {(q.extract?.speaker || q.extract?.reference) && (
        <p className={contextSource}>
          {[q.extract?.speaker, q.extract?.reference].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

function PassageContext({ stimulus }: { stimulus: StimulusData }) {
  return (
    <div className={contextItem}>
      <blockquote className={contextBlockquote}>{stimulus.text}</blockquote>
      {stimulus.source && <p className={contextSource}>Source: {stimulus.source}</p>}
    </div>
  );
}

function TableContext({ table }: { table: TableData }) {
  if (!table.rows?.length) return null;
  return (
    <div className={contextItem}>
      <table className={contextTable}>
        {table.headers && (
          <thead>
            <tr>
              {table.headers.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ContextBlock({ subject, q }: { subject: string; q: Question }) {
  const blocks: React.ReactNode[] = [];

  if (subject === "English Literature") {
    if (q.literary_work || q.extract) blocks.push(<LiteratureContext q={q} key="lit" />);
  }

  if (subject === "History & Civics") {
    if (q.stimulus?.type === "passage") {
      blocks.push(<PassageContext stimulus={q.stimulus} key="passage" />);
    }
    // Skip when a diagram_url figure already exists for this row — a couple
    // of rows have both because their table_data is a transcription of the
    // same screenshot FigureSlot renders below (see sync_diagram_figures.mjs
    // fan-out); showing the table again on top of it just duplicates it.
    if (q.table_data && !q.diagram_url) {
      blocks.push(<TableContext table={q.table_data} key="table" />);
    }
  }

  if (blocks.length === 0) return null;

  return <div className={contextWrapper}>{blocks}</div>;
}
