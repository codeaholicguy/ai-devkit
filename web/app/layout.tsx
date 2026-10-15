import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SkipToContent from "@/components/SkipToContent";
import { GitHubProvider } from "@/lib/GitHubContext";
import Script from "next/script";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ai-devkit.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "AI DevKit - Control Plane for AI Coding Agents",
    template: "%s | AI DevKit",
  },
  description:
    "AI DevKit gives Claude Code, Codex, Cursor, Gemini CLI, opencode, Pi, and other coding agents one control plane: config, console, local-first memory, communication, and verification.",
  keywords: [
    "AI",
    "AI DevKit",
    "ai-devkit",
    "development",
    "CLI",
    "AI agent control plane",
    "AI agent workflow",
    "agent orchestration",
    "verification",
    "memory",
    "AI-assisted coding",
    "software engineering",
    "multi-agent coding",
    "local AI coding agents",
    "repeatable engineering workflow",
    "specs driven development",
  ],
  authors: [{ name: "AI DevKit Team" }],
  creator: "AI DevKit",
  publisher: "AI DevKit",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "AI DevKit - Control Plane for AI Coding Agents",
    description:
      "One config, one console, shared memory, cross-agent communication, and verification for the coding agents you already use.",
    url: siteUrl,
    siteName: "AI DevKit",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "AI DevKit agent console managing multiple local AI coding agent sessions",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI DevKit - Control Plane for AI Coding Agents",
    description:
      "One config, one console, shared memory, cross-agent communication, and verification for the coding agents you already use.",
    images: ["/og-image.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        name: "AI DevKit",
        alternateName: ["ai-devkit"],
        url: siteUrl,
      },
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: "AI DevKit",
        url: siteUrl,
        logo: `${siteUrl}/logo.svg`,
        sameAs: [
          "https://github.com/codeaholicguy/ai-devkit",
          "https://www.npmjs.com/package/ai-devkit",
        ],
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#softwareapplication`,
        name: "AI DevKit",
        alternateName: ["ai-devkit"],
        applicationCategory: "DeveloperApplication",
        operatingSystem: "macOS, Linux, Windows",
        description:
          "A control plane for AI coding agents with one config, one console, local-first memory, cross-agent communication, workflow skills, and verification gates.",
        url: siteUrl,
        downloadUrl: "https://www.npmjs.com/package/ai-devkit",
        codeRepository: "https://github.com/codeaholicguy/ai-devkit",
        softwareHelp: `${siteUrl}/docs`,
        author: { "@id": `${siteUrl}/#organization` },
        sourceOrganization: { "@id": `${siteUrl}/#organization` },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        keywords:
          "AI coding agents, agent control plane, multi-agent orchestration, Claude Code, Cursor, Codex, agent memory, MCP",
        isAccessibleForFree: true,
        sameAs: [
          "https://github.com/codeaholicguy/ai-devkit",
          "https://www.npmjs.com/package/ai-devkit",
        ],
      },
    ],
  };

  return (
    // Font variables must be on <html>: theme tokens resolve at :root.
    // suppressHydrationWarning: the theme script sets data-theme before React loads.
    <html lang="en" className={`${geist.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Applies a saved theme before first paint; without one, the OS setting decides. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body className="flex flex-col min-h-screen">
        <Script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-XYJ8T5JK0Y"
        ></Script>
        <Script id="gtag-init">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-XYJ8T5JK0Y');
          `}
        </Script>
        <GitHubProvider repo="codeaholicguy/ai-devkit">
          <SkipToContent />
          <Header />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <Footer />
          <Script
            id="structured-data"
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(structuredData),
            }}
          />
        </GitHubProvider>
      </body>
    </html>
  );
}
