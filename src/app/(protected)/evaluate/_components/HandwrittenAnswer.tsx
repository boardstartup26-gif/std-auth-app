"use client";

// Handwritten answers: photograph the page, check what we read, then see the
// marks.
//
//   capture → reading → review → confirming → (result shown by the page)
//
// The read-and-mark happens in one server call while the student waits on
// "reading". What comes back is the transcript plus a sealed grade the browser
// can't open; the marks appear only after the student confirms the transcript
// in the review box. Correcting a misread word re-marks the corrected text at
// no extra credit. See src/lib/evaluation/handwritten.ts.
//
// Photos are shrunk here before upload: phone cameras produce 3–12 MB files,
// the upload limit is 4 MB for all pages together, and the model reads
// handwriting just as well at 1600 px.

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { btnPrimary, btnSecondary, errorAlert, inputBase } from "@/lib/ui";

const MAX_PAGES = 3;
const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.82;
const MAX_TRANSCRIPT_CHARS = 12_000;

const READING_MESSAGES = [
  "Reading your handwriting…",
  "Working out the tricky words…",
  "Checking it against the marking scheme…",
  "Almost ready for you to check…",
];

type Stage = "capture" | "reading" | "review" | "confirming";

interface Page {
  id: string;
  blob: Blob;
  url: string;
}

export interface HandwrittenQuestionKey {
  subject: string;
  year: number;
  paper: string;
  question_number: string;
}

/** Downscale + re-encode as JPEG, respecting the photo's EXIF orientation. */
async function preparePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", JPEG_QUALITY),
  );
}

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

const UNCERTAIN_RE = /\[\?\]/g;
const ILLEGIBLE_RE = /\[illegible\]/gi;
const normalise = (t: string) => t.replace(UNCERTAIN_RE, "").replace(/\s+/g, " ").trim();

export function HandwrittenAnswer<Result extends { tokens_remaining: number }>({
  question,
  disabled,
  onUploadStart,
  onTokens,
  onResult,
}: {
  question: HandwrittenQuestionKey;
  disabled: boolean;
  /** Fired as the photos are sent, for the page's submit telemetry. */
  onUploadStart: (pages: number) => void;
  onTokens: (remaining: number) => void;
  onResult: (result: Result & { transcript: string; transcript_edited: boolean }) => void;
}) {
  const [stage, setStage] = useState<Stage>("capture");
  const [pages, setPages] = useState<Page[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [original, setOriginal] = useState("");
  const [sealed, setSealed] = useState<string | null>(null);
  const [messageIndex, setMessageIndex] = useState(0);
  const [zoomed, setZoomed] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Object URLs hold the photo in memory until revoked.
  const pagesRef = useRef<Page[]>([]);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);
  useEffect(() => () => pagesRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  useEffect(() => {
    if (stage !== "reading") return;
    const id = setInterval(() => setMessageIndex((i) => Math.min(i + 1, READING_MESSAGES.length - 1)), 3000);
    return () => clearInterval(id);
  }, [stage]);

  const addFiles = useCallback(async (list: FileList | null) => {
    if (!list?.length) return;
    setError(null);
    const room = MAX_PAGES - pagesRef.current.length;
    const chosen = Array.from(list).slice(0, room);
    try {
      const prepared = await Promise.all(
        chosen.map(async (file) => {
          const blob = await preparePhoto(file);
          return { id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob) };
        }),
      );
      setPages((prev) => [...prev, ...prepared].slice(0, MAX_PAGES));
      if (list.length > room) setError(`Up to ${MAX_PAGES} pages per answer.`);
    } catch {
      setError("Couldn't open that photo. Try taking it again, or choose a JPEG or PNG.");
    }
  }, []);

  const removePage = (id: string) =>
    setPages((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((p) => p.id !== id);
    });

  async function readPhotos() {
    if (!pages.length || disabled) return;
    setError(null);
    setMessageIndex(0);
    setStage("reading");
    onUploadStart(pages.length);

    const form = new FormData();
    form.set("subject", question.subject);
    form.set("year", String(question.year));
    form.set("paper", question.paper);
    form.set("question_number", question.question_number);
    pages.forEach((p, i) => form.append("pages", p.blob, `page-${i + 1}.jpg`));

    try {
      const res = await fetch("/api/evaluate/handwritten", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (typeof data.tokens_remaining === "number") onTokens(data.tokens_remaining);
      if (!res.ok) {
        setError(data?.error ?? "We couldn't read your photo. Please try again.");
        setStage("capture");
        return;
      }
      setOriginal(data.transcript);
      setTranscript(data.transcript);
      setSealed(data.sealed);
      setStage("review");
    } catch {
      setError("Network error. Check your connection and try again.");
      setStage("capture");
    }
  }

  async function confirm() {
    if (!sealed || !transcript.trim()) return;
    setError(null);
    setStage("confirming");
    try {
      const res = await fetch("/api/evaluate/handwritten/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sealed, transcript }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong. Please press confirm again.");
        // An expired or used review can't be retried; anything else can.
        const dead = ["review_expired", "review_invalid", "already_confirmed"].includes(data?.code);
        setStage(dead ? "capture" : "review");
        if (dead) setSealed(null);
        return;
      }
      onTokens(data.tokens_remaining);
      onResult(data);
      setStage("capture");
      setSealed(null);
      setPages((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.url));
        return [];
      });
    } catch {
      setError("Network error. Your review is still here. Press confirm again.");
      setStage("review");
    }
  }

  function startOver() {
    setSealed(null);
    setTranscript("");
    setOriginal("");
    setError(null);
    setStage("capture");
  }

  /** Selects the next [?] or [illegible] after the cursor, wrapping round. */
  function jumpToNextMarker() {
    const el = textRef.current;
    if (!el) return;
    const re = /\S*\[\?\]|\[illegible\]/gi;
    const from = el.selectionEnd ?? 0;
    const matches = [...transcript.matchAll(re)];
    const next = matches.find((m) => (m.index ?? 0) >= from) ?? matches[0];
    if (!next || next.index === undefined) return;
    el.focus();
    el.setSelectionRange(next.index, next.index + next[0].length);
  }

  const uncertain = countMatches(transcript, UNCERTAIN_RE);
  const illegible = countMatches(transcript, ILLEGIBLE_RE);
  const edited = normalise(transcript) !== normalise(original);

  // ─── Review ────────────────────────────────────────────────────────────────

  if (stage === "review" || stage === "confirming") {
    const busy = stage === "confirming";
    return (
      <div className="flex flex-col gap-4">
        <div>
          <p className="font-display text-lg text-foreground">Check what we read</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            This is your answer as we read it from the photo. It’s what gets marked, so fix
            anything we misread. Don’t add anything you didn’t write: that only fools
            you, not the examiner.
          </p>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {pages.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setZoomed(p.url)}
              className="shrink-0 overflow-hidden rounded-lg border border-border"
              aria-label={`View page ${i + 1} of your photo`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, nothing to optimise */}
              <img src={p.url} alt="" className="h-24 w-auto object-cover" />
            </button>
          ))}
        </div>

        {(uncertain > 0 || illegible > 0) && (
          <div className="rounded-lg border border-rule bg-card/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            {uncertain > 0 && (
              <p>
                <span className="font-semibold text-foreground">{uncertain}</span>{" "}
                {uncertain === 1 ? "word is" : "words are"} marked{" "}
                <code className="font-mono text-foreground">[?]</code>: our best guess. If it’s right,
                just delete the <code className="font-mono">[?]</code>. If not, correct the word.
              </p>
            )}
            {illegible > 0 && (
              <p className={uncertain > 0 ? "mt-1" : ""}>
                <span className="font-semibold text-accent">{illegible}</span>{" "}
                {illegible === 1 ? "part" : "parts"} we couldn’t read at all (
                <code className="font-mono text-foreground">[illegible]</code>). Type what you wrote there,
                or it gets no marks.
              </p>
            )}
            <button
              type="button"
              onClick={jumpToNextMarker}
              className="mt-2 text-xs font-semibold text-accent underline-offset-2 hover:underline"
            >
              Go to the next one →
            </button>
          </div>
        )}

        <label className="sr-only" htmlFor="handwritten-transcript">
          Transcript of your answer
        </label>
        <textarea
          id="handwritten-transcript"
          ref={textRef}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={10}
          maxLength={MAX_TRANSCRIPT_CHARS}
          disabled={busy}
          spellCheck={false}
          className={`${inputBase} w-full px-3 py-2.5 font-mono text-[13px] leading-relaxed disabled:bg-card/50`}
        />

        {error && (
          <p className={errorAlert} role="alert">
            {error}
          </p>
        )}

        <button type="button" onClick={confirm} disabled={busy || !transcript.trim()} className={btnPrimary}>
          {busy
            ? edited
              ? "Marking your corrected answer…"
              : "Opening your marks…"
            : edited
              ? "Mark my corrected answer"
              : "Looks right, show my marks"}
        </button>
        <p className="text-center text-xs text-muted-foreground">
          {edited
            ? "You changed the transcript, so it will be marked again. No extra credit."
            : "Confirming costs nothing extra. The credit was used when we read the photo."}
        </p>
        <button
          type="button"
          onClick={startOver}
          disabled={busy}
          className="text-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
        >
          Retake the photo instead (reading a new photo uses another credit)
        </button>

        {zoomed && <PhotoOverlay src={zoomed} onClose={() => setZoomed(null)} />}
      </div>
    );
  }

  // ─── Capture / reading ─────────────────────────────────────────────────────

  const reading = stage === "reading";
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Write your answer on paper, then photograph it: page flat, good light, the writing filling the
        frame. Up to {MAX_PAGES} pages. You’ll check what we read before you see any marks.
      </p>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {pages.length > 0 && (
        <ol className="flex gap-2 overflow-x-auto pb-1">
          {pages.map((p, i) => (
            <li key={p.id} className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, nothing to optimise */}
              <img src={p.url} alt={`Page ${i + 1}`} className="h-28 w-auto rounded-lg border border-border object-cover" />
              <span className="absolute bottom-1 left-1 rounded bg-ink/70 px-1.5 text-[10px] font-semibold text-background">
                {i + 1}
              </span>
              {!reading && (
                <button
                  type="button"
                  onClick={() => removePage(p.id)}
                  aria-label={`Remove page ${i + 1}`}
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-ink/70 text-background"
                >
                  <X size={14} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      {pages.length < MAX_PAGES && !reading && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => cameraRef.current?.click()} disabled={disabled} className={btnSecondary}>
            <Camera size={16} strokeWidth={1.75} className="mr-2" aria-hidden />
            {pages.length ? "Add a page" : "Take photo"}
          </button>
          <button type="button" onClick={() => galleryRef.current?.click()} disabled={disabled} className={btnSecondary}>
            <ImagePlus size={16} strokeWidth={1.75} className="mr-2" aria-hidden />
            From gallery
          </button>
        </div>
      )}

      {error && (
        <p className={errorAlert} role="alert">
          {error}
        </p>
      )}

      <button type="button" onClick={readPhotos} disabled={!pages.length || reading || disabled} className={btnPrimary}>
        {reading ? "Reading…" : pages.length > 1 ? `Read my ${pages.length} pages` : "Read my answer"}
      </button>
      {reading && <p className="text-center text-xs text-muted-foreground">{READING_MESSAGES[messageIndex]}</p>}
    </div>
  );
}

function PhotoOverlay({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Your photo"
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, nothing to optimise */}
      <img src={src} alt="Your answer photo" className="max-h-full max-w-full rounded-lg object-contain" />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-background text-foreground"
      >
        <X size={18} aria-hidden />
      </button>
    </div>
  );
}
