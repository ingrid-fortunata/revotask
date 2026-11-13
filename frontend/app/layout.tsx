import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import type { ReactNode } from "react";
import { ToasterHost } from "@/components/shared/ToasterHost";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });

export const metadata: Metadata = {
  title: "RevoTask",
  description: "RevoTask collaborative Kanban board.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={figtree.variable}>
      <body className="min-h-dvh bg-base-200 font-sans text-base-content antialiased">
        {children}
        <ToasterHost />
      </body>
    </html>
  );
}
