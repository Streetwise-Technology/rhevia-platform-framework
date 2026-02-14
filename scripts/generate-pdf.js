// generate-pdf.js — Render the built report pages to PDF using Playwright.
//
// Usage:
//   node scripts/generate-pdf.js --org <ORG_SUBDOMAIN> [--base-dir ./dist]
//
// Spins up a local HTTP server for dist/ so absolute asset paths resolve
// correctly, then navigates headless Chromium to each report page.

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    org: { type: "string" },
    "base-dir": { type: "string", default: "./dist" },
  },
  strict: true,
});

const org = values.org;
const baseDir = resolve(values["base-dir"]);

if (!org) {
  console.error("Usage: node scripts/generate-pdf.js --org <ORG_SUBDOMAIN>");
  process.exit(1);
}

if (!existsSync(baseDir)) {
  console.error(`Error: base directory "${baseDir}" does not exist. Run the build first.`);
  process.exit(1);
}

// --- Static file server for dist/ ------------------------------------------

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function startServer(root) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);

      // Resolve index.html for directory paths
      let filePath = join(root, pathname);
      if (pathname.endsWith("/")) {
        filePath = join(filePath, "index.html");
      } else if (!extname(pathname) && existsSync(filePath + ".html")) {
        filePath += ".html";
      } else if (!extname(pathname) && existsSync(join(filePath, "index.html"))) {
        filePath = join(filePath, "index.html");
      }

      try {
        const content = readFileSync(filePath);
        const ext = extname(filePath);
        res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.listen(0, () => resolve(server));
  });
}

// --- PDF generation ---------------------------------------------------------

const PAGES = [
  { path: `/${org}/`, name: "executive-summary" },
  { path: `/${org}/movement-report`, name: "movement-report" },
  { path: `/${org}/closing-remarks`, name: "closing-remarks" },
];

const server = await startServer(baseDir);
const port = server.address().port;
console.log(`Serving ${baseDir} on http://localhost:${port}`);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});

const outputDir = join(baseDir, org);
const pdfPaths = [];

for (const { path, name } of PAGES) {
  const url = `http://localhost:${port}${path}`;
  console.log(`Rendering ${name} from ${url}...`);

  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle" });

  // Extra wait for WebGL content (deck.gl / MapBox maps)
  await page.waitForTimeout(3000);

  const pdfPath = join(outputDir, `${name}.pdf`);
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "1cm", bottom: "1cm", left: "1cm", right: "1cm" },
  });

  pdfPaths.push(pdfPath);
  console.log(`  → ${pdfPath}`);
  await page.close();
}

await browser.close();
server.close();

// Merge individual PDFs into a single report.pdf using pdf-lib if available,
// otherwise keep them as separate files.
try {
  const { PDFDocument } = await import("pdf-lib");
  const merged = await PDFDocument.create();

  for (const pdfPath of pdfPaths) {
    const bytes = readFileSync(pdfPath);
    const doc = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }

  const mergedPath = join(outputDir, "report.pdf");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(mergedPath, await merged.save());
  console.log(`\nMerged report → ${mergedPath}`);
} catch {
  console.log("\nNote: pdf-lib not installed — individual PDFs saved (no merged report.pdf).");
  console.log("Install pdf-lib to enable merging: npm install --save-dev pdf-lib");
}
