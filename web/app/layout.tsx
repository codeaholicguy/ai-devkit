import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SkipToContent from "@/components/SkipToContent";
import { GitHubProvider } from "@/lib/GitHubContext";
import Script from "next/script";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ai-devkit.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "AI DevKit - Make AI Coding Agents Follow Your Process",
    template: "%s | AI DevKit",
  },
  description:
    "AI DevKit makes AI coding agents follow a repeatable engineering workflow with requirements, design, planning, tests, verification, memory, and review.",
  keywords: [
    "AI",
    "development",
    "CLI",
    "AI agent workflow",
    "verification",
    "memory",
    "AI-assisted coding",
    "software engineering",
    "project management",
    "repeatable engineering workflow",
    "specs driven development",
  ],
  authors: [{ name: "AI DevKit Team" }],
  creator: "AI DevKit",
  publisher: "AI DevKit",
  openGraph: {
    title: "AI DevKit - Make AI Coding Agents Follow Your Process",
    description:
      "Make AI coding agents follow a repeatable engineering workflow with memory, verification, skills, and multi-agent setup.",
    url: siteUrl,
    siteName: "AI DevKit",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI DevKit - Make AI Coding Agents Follow Your Process",
    description:
      "Make AI coding agents follow a repeatable engineering workflow with memory, verification, skills, and multi-agent setup.",
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
        url: siteUrl,
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#softwareapplication`,
        name: "AI DevKit",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "macOS, Linux, Windows",
        description:
          "A workflow layer for AI coding agents with requirements, design, planning, tests, verification, memory, skills, and review.",
        url: siteUrl,
        downloadUrl: "https://www.npmjs.com/package/ai-devkit",
        softwareHelp: `${siteUrl}/docs`,
        sourceOrganization: {
          "@type": "Organization",
          name: "AI DevKit",
          url: siteUrl,
        },
        isAccessibleForFree: true,
        sameAs: ["https://github.com/codeaholicguy/ai-devkit"],
      },
    ],
  };

  return (
    <html lang="en">
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
