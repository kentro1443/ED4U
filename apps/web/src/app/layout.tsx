import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    template: "%s · ED4U",
    default: "ED4U · Nền tảng vận hành trường học",
  },
  description: "Nền tảng vận hành trường học ED4U",
  icons: {
    icon: "/icon.svg",
    shortcut: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" data-scroll-behavior="smooth" className={inter.variable}>
      <body className="min-h-dvh bg-[var(--canvas)] text-[var(--ink)] antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
