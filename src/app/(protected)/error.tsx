"use client";

// Boundary for every signed-in page. It sits *inside* (protected)/layout.tsx,
// so the sidebar and top bar stay on screen and usable while only the content
// column shows the failure. `retry` (stable since Next 16.3) re-fetches and
// re-renders the segment; the older `reset` would only re-render stale output.

import { RouteError } from "@/app/_components/states/RouteError";

export default function ProtectedError({ error, retry }: { error: unknown; retry: () => void }) {
  return <RouteError error={error} retry={retry} />;
}
