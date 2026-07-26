import type { Metadata } from "next";
import { connection } from "next/server";

import { normalizeLegacyRoutes, readLegacyFile } from "../../lib/legacy-markup";
import "./route-legacy.css";

export const metadata: Metadata = {
  title: "ExtraWoning — privacyverklaring",
  description:
    "Wat ExtraWoning met uw gegevens doet: wat wij bewaren, hoe lang, en wat er met het gecontroleerde adres gebeurt.",
  robots: {
    index: false,
    follow: false,
  },
};

const PRIVACY_MARKUP = normalizeLegacyRoutes(
  readLegacyFile("privacy/sections/privacy.html"),
);

export default async function PrivacyPage() {
  await connection();

  return (
    <div
      className="route-compat privacy-page"
      dangerouslySetInnerHTML={{ __html: PRIVACY_MARKUP }}
    />
  );
}
