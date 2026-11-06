import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Soil Moisture Chatbot",
  description:
    "Ask questions about hourly ERA5-Land soil moisture for Faisalabad, Multan and Lahore, 2020-2024.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-emerald-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
