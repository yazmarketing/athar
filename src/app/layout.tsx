import type { Metadata, Viewport } from "next";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import { FaviconTheme } from "@/components/favicon-theme";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

/**
 * `metadataBase` needs an absolute URL. NEXTAUTH_URL is occasionally set
 * without a scheme in hosting dashboards, and a bare `new URL()` on that
 * throws at module load — taking down every page. Normalise and fall back.
 */
function resolveSiteUrl(): URL {
  const raw = process.env.NEXTAUTH_URL?.trim();
  if (raw) {
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      return new URL(candidate);
    } catch {
      // fall through to the default below
    }
  }
  return new URL("http://localhost:3000");
}

const SITE_URL_OBJ = resolveSiteUrl();
const SITE_URL = SITE_URL_OBJ.origin;

const TITLE = "Athar — AI Film & Image Studio";
const DESCRIPTION =
  "Athar is YAZ Media's in-house AI studio. Direct cinematic film and stills from a single prompt, locked to each client's brand — then version, upscale and ship without leaving the workspace.";

export const metadata: Metadata = {
  metadataBase: SITE_URL_OBJ,
  title: {
    default: TITLE,
    // Inner pages read "Library · Athar" rather than repeating the tagline.
    template: "%s · Athar",
  },
  description: DESCRIPTION,
  applicationName: "Athar",
  authors: [{ name: "YAZ Media" }],
  creator: "YAZ Media",
  publisher: "YAZ Media",
  keywords: [
    "Athar",
    "YAZ Media",
    "AI film studio",
    "AI image generation",
    "brand-consistent AI",
    "creative production",
    "generative video",
    "campaign production",
  ],
  category: "technology",
  // Internal tool — keep it out of every index.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  openGraph: {
    type: "website",
    siteName: "Athar",
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
    images: [
      {
        url: "/og/athar-og.png",
        width: 1200,
        height: 630,
        alt: "Athar — the AI film and image studio by YAZ Media",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og/athar-og.png"],
  },
  appleWebApp: {
    capable: true,
    title: "Athar",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false, address: false, email: false },
  icons: {
    icon: [
      {
        url: "/favicon/favicon-dark-16.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: "/favicon/favicon-dark-32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: "/favicon/favicon-dark-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/favicon/favicon-dark-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: "/favicon/apple-touch-icon-180.png",
    shortcut: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="dark h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <FaviconTheme />
          <AuthSessionProvider>
            {children}
            <Toaster position="bottom-right" />
          </AuthSessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
