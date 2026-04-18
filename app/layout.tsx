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
  title: "La Cayetana — Carnet digital",
  description: "Carnet de socio para la caseta de feria en Granada",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full min-h-dvh bg-white antialiased`}
    >
      <body className="flex min-h-dvh flex-col bg-white text-foreground">
        {children}
      </body>
    </html>
  );
}
