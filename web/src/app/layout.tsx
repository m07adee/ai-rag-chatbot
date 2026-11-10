import type { Metadata, Viewport } from "next";
import { Inter, Cairo } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const cairo = Cairo({ variable: "--font-cairo", subsets: ["arabic", "latin"] });

export const metadata: Metadata = {
  title: "Lumina Dental — AI Knowledge-Base Chatbot Demo",
  description: "A RAG chatbot that answers customers from the business's own documents in English, Arabic and Turkish, with sources and human hand-off.",
};
export const viewport: Viewport = { themeColor: "#0d9488" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" dir="ltr" className={`${inter.variable} ${cairo.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
