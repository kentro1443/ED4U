import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { Suspense } from "react";
import { RouteProgress } from "@/components/RouteProgress";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  weight: ["400", "500", "600", "700", "800"],
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
  applicationName: "ED4U",
  keywords: ["quản trị trường học", "giáo dục", "mentor", "xếp phòng", "ED4U"],
  icons: {
    icon: "/icon.svg",
    shortcut: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1749c8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" data-scroll-behavior="smooth" className={beVietnamPro.variable}>
      <body className="min-h-dvh bg-[var(--canvas)] text-[var(--ink)] antialiased font-sans">
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
