import type { Metadata } from "next";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import { FaviconTheme } from "@/components/favicon-theme";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Athar",
  description: "Internal AI film & image studio",
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
  },
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
