// Default social card (og:image / twitter:image) for every page that doesn't
// define its own. Generated at build time and served as a static PNG.
// Colours are the light-theme tokens from globals.css (--bg, --ink,
// --ink-muted, --rule, --accent); ImageResponse can't read CSS variables.

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "BoardEdge — ICSE Class 10 answers marked against the official marking scheme";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const logo = await readFile(join(process.cwd(), "public", "logo-lockup.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#FAF9F5",
          padding: "72px 80px",
          borderTop: "12px solid #C43D2B",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain <img> only */}
        <img src={logoSrc} alt="" width={202} height={60} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 72, lineHeight: 1.05, color: "#16181D", letterSpacing: "-0.02em", maxWidth: 900 }}>
            The AI examiner that knows ICSE inside out.
          </div>
          <div style={{ marginTop: 28, fontSize: 30, color: "#5C6068", maxWidth: 960 }}>
            Real past-paper questions, marked against the official CISCE scheme — point by point.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 40,
            fontSize: 24,
            color: "#5C6068",
            borderTop: "2px solid #E4E0D6",
            paddingTop: 24,
          }}
        >
          <span>ICSE Class 10</span>
          <span>2,750+ past-paper questions</span>
          <span>6 subjects</span>
        </div>
      </div>
    ),
    size,
  );
}
