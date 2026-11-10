// src/lib/cron-auth.ts
//
// The one authorisation check for /api/cron/* routes. Vercel Cron sends
// `Authorization: Bearer $CRON_SECRET` once that variable is set on the
// project. Without a (long enough) secret every request is refused: these
// routes write to students' inboxes and send email, so "unconfigured" must
// mean "does nothing", never "open to anyone". Constant-time compare.

import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export function cronAuthorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 16) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
