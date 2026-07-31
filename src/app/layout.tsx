import type { Metadata } from "next";
import { Suspense } from "react";

import { ClientProviders } from "@/components/layout/client-providers";
import { LayoutStyleProvider } from "@/components/layout/layout-style-provider";
import { NavigationLoader } from "@/components/layout/navigation-loader";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "鸣潮角色MOD个人站",
    template: "%s | 鸣潮角色MOD个人站",
  },
  description:
    "专注鸣潮角色 MOD 的个人站，提供高清预览、清晰安装指引与阿里云 OSS 高速直链下载。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="theme-arcade h-full scroll-smooth antialiased"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
    >
      <body className="min-h-full bg-background text-foreground">
        <ThemeProvider>
          <LayoutStyleProvider>
            <ClientProviders>
              {children}
              <Suspense fallback={null}>
                <NavigationLoader />
              </Suspense>
              <Toaster position="top-center" richColors />
            </ClientProviders>
          </LayoutStyleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
