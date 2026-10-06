import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "LeMans 2.0", template: "%s - LeMans 2.0" },
  description: "Attendance, leave and billing assurance",
  appleWebApp: { capable: true, title: "LeMans", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#460073", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
