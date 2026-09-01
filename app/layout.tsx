import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Arafims | Hostel Management Platform",
  description:
    "Arafims replaces paper forms and manual processes with one clean platform — reservations, complaints, caution fees, and more.",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased bg-[#0f0f0f] text-[#f5f5f5]`}
      >
        {children}
      </body>
    </html>
  );
}
