import type { Metadata } from "next";
import "./globals.css";

const title = "Agent PaaS · 生产运行与治理平台";
const description =
  "把 Agent 镜像变成可访问、可运维、可约束、可审计的生产服务。";

export const metadata: Metadata = {
  title,
  description,
  applicationName: "Agent PaaS",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  openGraph: {
    title,
    description,
    siteName: "Agent PaaS",
    locale: "zh_CN",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Agent PaaS · 生产运行与治理平台",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
