// src/lib/drafts.ts
//
// An unsent typed answer for /evaluate, kept in this browser so that a failed
// request, a refresh, a crashed page or an accidental navigation doesn't throw
// away what a student spent ten minutes writing. Same idea (and same privacy
// position) as the practice paper's local backup: it never leaves the device,
// it's only the *unsent* text, and it's cleared once the answer is marked.
//
// Every access is wrapped: private mode, a full quota or blocked storage all
// just mean "no draft", never an error.

const PREFIX = "be_answer_draft_";
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

interface StoredDraft {
  text: string;
  ts: number;
}

export function readDraft(questionId: string): string {
  if (typeof window === "undefined" || !questionId) return "";
  try {
    const raw = window.localStorage.getItem(PREFIX + questionId);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    if (typeof parsed.text !== "string" || typeof parsed.ts !== "number") return "";
    if (Date.now() - parsed.ts > MAX_AGE_MS) {
      window.localStorage.removeItem(PREFIX + questionId);
      return "";
    }
    return parsed.text;
  } catch {
    return "";
  }
}

export function saveDraft(questionId: string, text: string): void {
  if (typeof window === "undefined" || !questionId) return;
  try {
    if (!text.trim()) {
      window.localStorage.removeItem(PREFIX + questionId);
      return;
    }
    const draft: StoredDraft = { text, ts: Date.now() };
    window.localStorage.setItem(PREFIX + questionId, JSON.stringify(draft));
  } catch {
    // Storage unavailable: the in-memory answer is still there.
  }
}

export function clearDraft(questionId: string): void {
  if (typeof window === "undefined" || !questionId) return;
  try {
    window.localStorage.removeItem(PREFIX + questionId);
  } catch {}
}
