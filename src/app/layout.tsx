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
  title: "dsh web — DeepSeek Harness Web Edition",
  description:
    "A browser-native recreation of the deepseek-harness agent console: plugin-based tools, virtual workspace, permission gates and streaming DeepSeek models — deployable on Vercel.",
  keywords: [
    "dsh",
    "deepseek",
    "deepseek-harness",
    "agent harness",
    "AI agent",
    "Next.js",
    "Vercel",
  ],
  authors: [{ name: "dsh web contributors" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

/**
 * Theme decision (Task 2-b): static dark default via `<html className="dark">`.
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
