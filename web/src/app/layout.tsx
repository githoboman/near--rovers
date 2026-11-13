import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Newsreader, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { NearProvider } from "@/providers/NearProvider";
import { PerpetuaProvider } from "@/providers/PerpetuaStore";
import { TopNav } from "@/components/TopNav";
import { PageShell } from "@/components/PageShell";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#080B10",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  title: "Perpetua — Truth, priced in real time",
  description:
    "AI-synthesized encyclopedia where every claim has a perpetual prediction market and optimistic NEAR AI Cloud jury.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>
        <NearProvider>
          <PerpetuaProvider>
            <TopNav />
            <PageShell>{children}</PageShell>
          </PerpetuaProvider>
        </NearProvider>
      </body>
    </html>
  );
}

