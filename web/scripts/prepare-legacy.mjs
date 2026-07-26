import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(webRoot, "..");

// Removed after the first migration slice split CSS per route. Clean the old
// generated bundle so an existing checkout cannot accidentally keep using it.
fs.rmSync(path.join(webRoot, "app", "legacy.css"), { force: true });

const bundles = [
  {
    output: "app/shared-legacy.css",
    sources: [
      "design-system/tokens.css",
      "landing/css/base.css",
      "landing/css/components.css",
    ],
  },
  {
    output: "app/landing/route-legacy.css",
    sources: [
      "landing/css/header.css",
      "landing/css/cta.css",
      "landing/css/hero.css",
      "landing/css/research.css",
      "landing/css/report.css",
      "landing/css/investor.css",
      "landing/css/examples.css",
      "landing/css/trust-pricing.css",
      "landing/css/footer.css",
      "landing/css/motion.css",
      "landing/css/loader.css",
    ],
  },
  {
    output: "app/privacy/route-legacy.css",
    sources: ["privacy/css/privacy.css"],
  },
  {
    output: "app/check/route-legacy.css",
    sources: [
      "check/css/check.css",
      "check/css/result.css",
      "check/css/answers.css",
    ],
  },
];

function buildCss(sources) {
  return sources
    .map((relativePath) => {
      const source = fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
      return `/* ==== ${relativePath} ==== */\n${source}`;
    })
    .join("\n")
    .replaceAll('url("./fonts/', 'url("/fonts/')
    .replaceAll('url("../../assets/', 'url("/assets/');
}

const generatedCss = [];
for (const bundle of bundles) {
  const output = path.join(webRoot, bundle.output);
  const css = buildCss(bundle.sources);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, css);
  generatedCss.push(css);
}

const sectionRoots = ["landing/sections", "privacy/sections", "check/sections"];
const sectionMarkup = sectionRoots
  .flatMap((relativeDirectory) => {
    const directory = path.join(repositoryRoot, relativeDirectory);
    return fs
      .readdirSync(directory)
      .filter((filename) => filename.endsWith(".html"))
      .map((filename) => fs.readFileSync(path.join(directory, filename), "utf8"));
  })
  .join("\n");

const assetNames = new Set();
assetNames.add("extrawoning-favicon.svg");
for (const match of sectionMarkup.matchAll(/\.\.\/assets\/([^"'<> ]+)/g)) {
  assetNames.add(match[1]);
}
for (const match of generatedCss.join("\n").matchAll(/url\("\/assets\/([^"]+)"\)/g)) {
  assetNames.add(match[1]);
}

const publicAssets = path.join(webRoot, "public", "assets");
fs.mkdirSync(publicAssets, { recursive: true });
for (const name of assetNames) {
  const destination = path.join(publicAssets, name);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(
    path.join(repositoryRoot, "assets", name),
    destination,
  );
}

const fontSource = path.join(repositoryRoot, "design-system", "fonts");
const publicFonts = path.join(webRoot, "public", "fonts");
fs.mkdirSync(publicFonts, { recursive: true });
for (const name of fs.readdirSync(fontSource)) {
  if (!/\.(woff2|txt)$/i.test(name)) continue;
  fs.copyFileSync(path.join(fontSource, name), path.join(publicFonts, name));
}

fs.copyFileSync(
  path.join(repositoryRoot, "extrawoning_logo_web.svg"),
  path.join(webRoot, "public", "extrawoning_logo_web.svg"),
);

const legacyCheck = path.join(webRoot, "public", "legacy", "check");
fs.mkdirSync(legacyCheck, { recursive: true });
for (const name of ["check.js", "contract.js", "render.js"]) {
  fs.copyFileSync(
    path.join(repositoryRoot, "check", name),
    path.join(legacyCheck, name),
  );
}

console.log(
  `prepared ${bundles.length} CSS bundles, ${assetNames.size} images, ` +
    `${fs.readdirSync(publicFonts).length} font files, and the check modules`,
);
