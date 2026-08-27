import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://ducky-ai-coder.local"),
  title: "Ducky AI | Coder",
  description:
    "Ducky AI | Coder — a browser-native coding agent console. Plugin-based tools, a virtual workspace filesystem, permission gates and the Ducky 3.5 Coder model.",
  keywords: [
    "Ducky AI",
    "Ducky 3.5 Coder",
    "coding agent",
    "agent harness",
    "AI agent",
    "Next.js",
  ],
  authors: [{ name: "Ducky AI" }],
  openGraph: {
    title: "Ducky AI | Coder",
    description:
      "A browser-native coding agent console running Ducky 3.5 Coder.",
    images: ["/ducky-logo.png"],
  },
};

/**
 * Theme decision: static dark default via `<html className="dark">`.
 * We intentionally omit next-themes/ThemeProvider to keep zero FOUC and lock
 * the terminal aesthetic. suppressHydrationWarning retained defensively.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
