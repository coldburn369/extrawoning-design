import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "ExtraWoning — Zit er een extra woning in jouw huis?",
  description:
    "Ontdek binnen enkele minuten of jouw woning kansrijk is voor een vergunde extra wooneenheid — inclusief rapport met regels, waarde-impact en vervolgstappen.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="nl" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
