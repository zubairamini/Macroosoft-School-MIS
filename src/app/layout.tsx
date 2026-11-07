import type { Metadata, Viewport } from "next";
import "./globals.css";
import "@fontsource/vazirmatn/400.css";
import "@fontsource/vazirmatn/500.css";
import "@fontsource/vazirmatn/600.css";
import "@fontsource/vazirmatn/700.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "مکتب‌یار — نظام مدیریت مکتب",
  description:
    "نظام مدیریت معلومات مکتب برای افغانستان — شمولیت، شاگردان، امور تعلیمی و گزارش‌ها به زبان دری و راست‌چین.",
  icons: {
    icon: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#047857",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa-AF" dir="rtl" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground min-h-screen">
        {children}
        <Toaster position="bottom-left" richColors closeButton style={{ direction: "rtl" }} />
      </body>
    </html>
  );
}
