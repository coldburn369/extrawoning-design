import fs from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(process.cwd(), "..");

export function readLegacyFile(relativePath: string) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

export function normalizeLegacyRoutes(markup: string) {
  return markup
    .replaceAll('href="../landing/index.html"', 'href="/landing/"')
    .replaceAll('href="../check/index.html"', 'href="/check/"')
    .replaceAll('href="../privacy/index.html"', 'href="/privacy/"')
    .replaceAll('src="../extrawoning_logo_web.svg"', 'src="/extrawoning_logo_web.svg"');
}
