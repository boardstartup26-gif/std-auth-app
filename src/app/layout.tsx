import type { Metadata } from "next";
import { Fraunces, Geist } from "next/font/google";
import { AnalyticsProvider } from "@/app/_components/AnalyticsProvider";
import "./globals.css";

// Geist Mono is deliberately not loaded. Nothing sets a monospace face any
// more — figures use the sans face's tabular numerals instead — so shipping the
// font would be a download nobody renders.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

// Display face. The extra axes are requested explicitly because next/font ships
// only `wght` by default — without them `font-variation-settings: "opsz" 144,
// "SOFT" 0, "WONK" 1` in globals.css would silently do nothing.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

export const metadata: Metadata = {
  title: "BoardEdge",
  description: "AI-powered ICSE answer evaluation with examiner-style feedback.",
  // Add the verification object right here:
  verification: {
    google: "ZQJGhBJbPN1AvGsJYaUzy03HJxpZbfoXQHogKZk2EOk",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Light renders for everyone: no `dark` class, and globals.css has no
    // prefers-color-scheme rule, so a dark-OS visitor still gets the light
    // design. `color-scheme` is set in CSS rather than inline here — an inline
    // style would outrank the `.dark` override a future toggle will use.
    <html
      lang="en"
      className={`${geistSans.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground font-sans">
        {/* Renders nothing; owns page_view + anonymous-visitor continuity. */}
        <AnalyticsProvider />
        {children}
      </body>
    </html>
  );
}