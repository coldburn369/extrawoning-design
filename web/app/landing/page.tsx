import fs from "node:fs";
import path from "node:path";
import { connection } from "next/server";

import LandingClient from "./landing-client";

const SECTION_ORDER = [
  "sprites",
  "header",
  "hero",
  "research",
  "report",
  "investor",
  "examples",
  "trust-pricing",
  "final-cta",
  "footer",
] as const;

function readSection(name: (typeof SECTION_ORDER)[number]) {
  const filename = path.resolve(
    process.cwd(),
    "..",
    "landing",
    "sections",
    `${name}.html`,
  );

  return fs.readFileSync(filename, "utf8");
}

function landingMarkup() {
  const sections = Object.fromEntries(
    SECTION_ORDER.map((name) => [name, readSection(name)]),
  );

  // Event-handler attributes are deliberately not carried into Next. The
  // external client component prevents the two placeholder forms instead,
  // which remains compatible with the preview CSP.
  return [
    sections.sprites,
    sections.header,
    "<main>",
    sections.hero,
    sections.research,
    sections.report,
    sections.investor,
    sections.examples,
    sections["trust-pricing"],
    sections["final-cta"],
    "</main>",
    sections.footer,
  ]
    .join("\n")
    .replaceAll(/\s+onsubmit="return false"/g, "");
}

const LANDING_MARKUP = landingMarkup();

export default async function LandingPage() {
  // A fresh response is required so Next can apply the per-request CSP nonce
  // generated in proxy.ts to its bootstrap and client-component scripts.
  await connection();

  return (
    <>
      <div
        className="landing-compat"
        dangerouslySetInnerHTML={{ __html: LANDING_MARKUP }}
      />
      <LandingClient />
    </>
  );
}
