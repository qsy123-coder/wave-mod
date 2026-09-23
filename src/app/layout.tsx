import type { Metadata } from "next";
import { Suspense } from "react";

import { ClientProviders } from "@/components/layout/client-providers";
import { LayoutStyleProvider } from "@/components/layout/layout-style-provider";
import { NavigationLoadingProvider } from "@/components/layout/navigation-loading-context";
import { NavigationLoader } from "@/components/layout/navigation-loader";
import { PageLoadingOverlay } from "@/components/layout/page-loading-overlay";
import { RouteChangeListener } from "@/components/layout/route-change-listener";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

export const metadata: Metadata = {
  // 让各页可以写相对 canonical / OG 地址（Next 会用它拼成绝对地址）。
  // 不设的话相对地址会退化成 http://localhost:3000，canonical 就指错域名了。
  metadataBase: new URL(getSiteUrl()),
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
              <NavigationLoadingProvider>
                {children}
                <PageLoadingOverlay />
                <Suspense fallback={null}>
                  <RouteChangeListener />
                </Suspense>
              </NavigationLoadingProvider>
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
