import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Drill Day — the building teaches back",
  description:
    "AI-guided facilities training inside a live Autodesk Scene API model, powered by WebMCP.",
  applicationName: "Drill Day",
  keywords: ["WebMCP", "Autodesk Scene API", "facilities training", "digital twin"],
  openGraph: {
    title: "Drill Day — the building teaches back",
    description:
      "Walk the building, diagnose a live incident, and learn with an agent sharing the same scene.",
    type: "website",
    images: [
      {
        url: "/media/northgate-leak-briefing.png",
        width: 1672,
        height: 941,
        alt: "A realistic maintenance corridor and plant room at Northgate facility",
      },
    ],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
