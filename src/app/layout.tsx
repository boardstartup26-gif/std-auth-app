import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AnalyticsProvider } from "@/app/_components/AnalyticsProvider";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}>
      <body className="bg-background text-foreground font-sans">
        {/* Renders nothing; owns page_view + anonymous-visitor continuity. */}
        <AnalyticsProvider />
        {children}
      </body>
    </html>
  );
}