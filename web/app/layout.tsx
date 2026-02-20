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
    default: "AI DevKit - Structured AI-Assisted Development",
    template: "%s | AI DevKit",
  },
  description:
    "A CLI toolkit for AI-assisted software development with phase templates and structured workflows. Improve your development process with requirements, design, planning, and testing documentation.",
  keywords: [
    "AI",
    "development",
    "CLI",
    "templates",
    "documentation",
    "structured development",
    "AI-assisted coding",
    "software engineering",
    "project management",
    "development workflow",
    "specs driven development",
  ],
  authors: [{ name: "AI DevKit Team" }],
  creator: "AI DevKit",
  publisher: "AI DevKit",
  openGraph: {
    title: "AI DevKit - Structured AI-Assisted Development",
    description:
      "A CLI toolkit for AI-assisted software development with phase templates and structured workflows.",
    url: siteUrl,
    siteName: "AI DevKit",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI DevKit - Structured AI-Assisted Development",
    description:
      "A CLI toolkit for AI-assisted software development with phase templates and structured workflows.",
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
          "A CLI toolkit for AI-assisted software development with phase templates, structured workflows, skills, and memory.",
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
