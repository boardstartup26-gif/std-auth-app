import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BoardEdge",
  description: "AI-powered ICSE answer evaluation with examiner-style feedback.",
};

const themeInitScript = `(function(){try{var t=localStorage.getItem("boardedge-theme");if(t==="dark"||t==="light"){document.documentElement.classList.toggle("dark",t==="dark");document.documentElement.classList.toggle("light",t==="light");}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-[var(--background)] text-[var(--foreground)] font-sans">{children}</body>
    </html>
  );
}
