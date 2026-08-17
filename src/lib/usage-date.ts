// Shared date logic for the rolling 7-day token-usage window. Both the
// evaluate and usage API routes must agree on "today" and on the window's
// start date, or a request could get reserved against one day boundary
// while the usage summary reads against another.

export function getUsageDateIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
}

// Inclusive start of the rolling window ending on `anchorDate` (a
// YYYY-MM-DD string, IST calendar day). Mirrors `p_date - 6` in the
// increment_usage() Postgres function — keep the two in sync.
export function getUsageWindowStartIST(anchorDate: string): string {
  const start = new Date(`${anchorDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 6);
  return start.toISOString().slice(0, 10);
}
