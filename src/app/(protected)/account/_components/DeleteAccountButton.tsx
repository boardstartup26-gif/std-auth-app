// app/account/_components/DeleteAccountButton.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteAccountButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setPending(true);
    setError(null);

    // Every failure path must end with the button usable again. This used to
    // call res.json() unguarded, so a non-JSON response (the 404 page, a proxy
    // error) threw and left the button stuck on "Deleting…" with no message.
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const data: { error?: string } | null = await res.json().catch(() => null);

      if (!res.ok) {
        setPending(false);
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
    } catch {
      setPending(false);
      setError("Couldn't reach BoardEdge. Check your connection and try again.");
      return;
    }

    router.push("/login");
    router.refresh();
  };

  if (confirming) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-red-400">
          Are you sure? This is permanent.
        </p>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={handleDelete}
            disabled={pending}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Yes, delete my account"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-raised"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="rounded-xl border border-red-900 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-950"
    >
      Delete account
    </button>
  );
}