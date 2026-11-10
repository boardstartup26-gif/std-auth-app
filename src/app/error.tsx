"use client";

// Boundary for everything outside the signed-in app: the landing page, auth,
// legal and parent-confirmation pages. Signed-in pages have their own, nested
// inside the app shell, in (protected)/error.tsx.

import { RouteError } from "@/app/_components/states/RouteError";

export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="min-h-dvh bg-background">
      <RouteError error={error} retry={retry} home={{ label: "Go to BoardEdge", href: "/" }} />
    </main>
  );
}
