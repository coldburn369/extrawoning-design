import type { Metadata } from "next";
import { headers } from "next/headers";
import Script from "next/script";
import { connection } from "next/server";

import { normalizeLegacyRoutes, readLegacyFile } from "../../lib/legacy-markup";
import "./route-legacy.css";

export const metadata: Metadata = {
  title: "ExtraWoning — adrescheck",
  description:
    "Controleer per adres wat de gemeentelijke regelset zegt over het toevoegen van een woonruimte.",
  robots: {
    index: false,
    follow: false,
  },
};

const CHECK_MARKUP = normalizeLegacyRoutes(
  [
    readLegacyFile("check/sections/form.html"),
    readLegacyFile("check/sections/templates.html"),
  ].join("\n"),
);

export default async function CheckPage() {
  await connection();
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <>
      <div
        className="route-compat check-page"
        dangerouslySetInnerHTML={{ __html: CHECK_MARKUP }}
      />
      <Script
        id="check-controller"
        src="/legacy/check/check.js"
        type="module"
        nonce={nonce}
        strategy="afterInteractive"
      />
    </>
  );
}
