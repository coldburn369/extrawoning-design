import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(webRoot, "..");

const stylesheets = [
  "design-system/tokens.css",
  "landing/css/base.css",
  "landing/css/components.css",
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
];

const css = stylesheets
  .map((relativePath) => {
    const source = fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
    return `/* ==== ${relativePath} ==== */\n${source}`;
  })
  .join("\n")
  .replaceAll('url("./fonts/', 'url("/fonts/')
  .replaceAll('url("../../assets/', 'url("/assets/');

fs.writeFileSync(path.join(webRoot, "app", "legacy.css"), css);

const sectionDirectory = path.join(repositoryRoot, "landing", "sections");
const sectionMarkup = fs
  .readdirSync(sectionDirectory)
  .filter((filename) => filename.endsWith(".html"))
  .map((filename) => fs.readFileSync(path.join(sectionDirectory, filename), "utf8"))
  .join("\n");

const assetNames = new Set();
for (const match of sectionMarkup.matchAll(/\.\.\/assets\/([^"'<> ]+)/g)) {
  assetNames.add(match[1]);
}
for (const match of css.matchAll(/url\("\/assets\/([^"]+)"\)/g)) {
  assetNames.add(match[1]);
}

const publicAssets = path.join(webRoot, "public", "assets");
fs.mkdirSync(publicAssets, { recursive: true });
for (const name of assetNames) {
  fs.copyFileSync(
    path.join(repositoryRoot, "assets", name),
    path.join(publicAssets, name),
  );
}

const fontSource = path.join(repositoryRoot, "design-system", "fonts");
const publicFonts = path.join(webRoot, "public", "fonts");
fs.mkdirSync(publicFonts, { recursive: true });
for (const name of fs.readdirSync(fontSource)) {
  if (!/\.(woff2|txt)$/i.test(name)) continue;
  fs.copyFileSync(path.join(fontSource, name), path.join(publicFonts, name));
}

console.log(
  `prepared legacy CSS, ${assetNames.size} images, and ${fs.readdirSync(publicFonts).length} font files`,
);
