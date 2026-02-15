// bundle-single-html.js — Merge all Observable Framework report pages into a single
// self-contained HTML file.
//
// Takes a built dist/{org}/ directory and merges index.html, movement-report.html,
// and closing-remarks.html into one .html file with ALL dependencies inlined (CSS,
// JS modules, JSON data). Internet is needed only for Mapbox tile requests.
//
// Usage:
//   MAPBOX_TOKEN=pk.xxx node scripts/bundle-single-html.js \
//     --input-dir dist/tfl \
//     --output dist/report-standalone.html
//
// How it works:
//   1. Reads all three pages and uses movement-report.html as the base (richest <head>)
//   2. Merges Observable define() cells, resolving ID collisions across pages
//   3. Deduplicates registerFile() calls and inlines JSON data as base64 data URLs
//   4. Stacks <main> content: Executive Summary → Movement Report → Closing Remarks
//   5. Removes sidebar navigation (irrelevant in single-page standalone)
//   6. Inlines local CSS files as <style> blocks
//   7. Uses esbuild to bundle all JS modules into a single inline <script type="module">
//   8. Injects the Mapbox access token as window.__MAPBOX_TOKEN
//
// Known caveats:
//   - Google Fonts remain an external CDN link (falls back to system sans-serif if offline)
//   - import.meta.resolve() in Observable's stdlib points to page URL after bundling —
//     only affects unused features (parquet loading, sample datasets)
//   - Output size is typically 4–6 MB (deck.gl, mapbox-gl, d3, react, baked data)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename, join, relative } from "node:path";
import { parseArgs } from "node:util";
import { build } from "esbuild";

// ── CLI args ────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    "input-dir": { type: "string" },
    output: { type: "string" },
  },
  strict: true,
});

const inputDir = values["input-dir"] ? resolve(values["input-dir"]) : null;
const outputPath = values.output ? resolve(values.output) : null;

if (!inputDir || !outputPath) {
  console.error(
    "Usage: MAPBOX_TOKEN=pk.xxx node scripts/bundle-single-html.js --input-dir <dir> --output <file>"
  );
  process.exit(1);
}

const mapboxToken = process.env.MAPBOX_TOKEN;
if (!mapboxToken) {
  console.error("Error: MAPBOX_TOKEN environment variable is not set.");
  process.exit(1);
}

const orgSlug = basename(inputDir);

// ── Discover and validate pages ─────────────────────────────────────────────

const PAGE_FILES = ["index.html", "movement-report.html", "closing-remarks.html"];

for (const file of PAGE_FILES) {
  const p = join(inputDir, file);
  if (!existsSync(p)) {
    console.error(`Error: required page not found: ${p}`);
    process.exit(1);
  }
}

console.log(`Merging ${PAGE_FILES.length} pages from ${relative(process.cwd(), inputDir)}/`);

const pages = PAGE_FILES.map((file) => ({
  name: file,
  html: readFileSync(join(inputDir, file), "utf-8"),
}));

// The base page dir for resolving relative hrefs (all pages share the same dir)
const baseDir = inputDir;

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveHref(href) {
  return resolve(baseDir, href);
}

function readLocalFile(href) {
  return readFileSync(resolveHref(href), "utf-8");
}

function readLocalBinary(href) {
  return readFileSync(resolveHref(href));
}

// ── Step 1: Extract <script type="module"> from each page ───────────────────

const scriptTagRe = /<script\s+type="module">([\s\S]*?)<\/script>/;

function extractScript(html) {
  const m = html.match(scriptTagRe);
  return m ? m[1] : "";
}

// ── Step 2: Extract <main> inner HTML from each page ────────────────────────

function extractMain(html) {
  const startRe = /<main[^>]*>/;
  const endRe = /<\/main>/;
  const startMatch = html.match(startRe);
  const endMatch = html.match(endRe);
  if (!startMatch || !endMatch) return "";
  const startIdx = startMatch.index + startMatch[0].length;
  const endIdx = endMatch.index;
  return html.substring(startIdx, endIdx);
}

// ── Step 3: Parse script content into registerFile blocks and define blocks ──

function parseRegisterFiles(script) {
  const re = /registerFile\("([^"]+)",\s*(\{[^}]+\})\);/g;
  const files = new Map();
  let m;
  while ((m = re.exec(script)) !== null) {
    if (!files.has(m[1])) {
      files.set(m[1], m[0]);
    }
  }
  return files;
}

function parseDefineBlocks(script) {
  // Match define({...}); blocks — handles nested braces by counting
  const blocks = [];
  const marker = "define({";
  let searchStart = 0;
  while (true) {
    const idx = script.indexOf(marker, searchStart);
    if (idx === -1) break;
    // Find the matching closing });
    let depth = 0;
    let i = idx + "define(".length;
    // We're at the opening { of the object
    for (; i < script.length; i++) {
      if (script[i] === "{") depth++;
      else if (script[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    // i is now at the closing } of the object arg
    // Look for ");" after it
    const end = script.indexOf(");", i);
    if (end === -1) break;
    const block = script.substring(idx, end + 2);
    // Extract cell ID
    const idMatch = block.match(/id:\s*"([^"]+)"/);
    const id = idMatch ? idMatch[1] : null;
    blocks.push({ id, block });
    searchStart = end + 2;
  }
  return blocks;
}

// ── Step 4: Build collision remap tables ────────────────────────────────────

// Cell IDs that exist in movement-report (the canonical page) — these keep their IDs.
// Cells from index and closing-remarks that collide get suffixed.

const movementScript = extractScript(pages[1].html);

// Build remap tables for index (suffix -100) and closing-remarks (suffix -200)
// Observable's isRoot regex: /^:[0-9a-f]{8}(?:-\d+)?:$/
// IDs must be 8 hex chars with an optional single -digits suffix.
// Page offsets: index=100, closing=200. For IDs already suffixed (e.g. "82a3537f-1"),
// we add the page offset to the existing suffix (→ "82a3537f-201") instead of appending.
const PAGE_OFFSETS = [100, 0, 200]; // index, movement, closing

function buildRemapTable(pageIndex) {
  const offset = PAGE_OFFSETS[pageIndex];
  if (offset === 0) return new Map(); // movement-report: no remapping
  const script = extractScript(pages[pageIndex].html);
  const defines = parseDefineBlocks(script);
  const remap = new Map();
  for (const { id } of defines) {
    if (!id) continue;
    // Skip the data-loading cell that we'll remove entirely
    if (id === "bf5e5f37") continue;
    // Remap ALL cells from index/closing-remarks to avoid collisions.
    // Handle IDs that already have a -N suffix (e.g. "82a3537f-1" → "82a3537f-201")
    const suffixMatch = id.match(/^([0-9a-f]{8})-(\d+)$/);
    let newId;
    if (suffixMatch) {
      newId = `${suffixMatch[1]}-${parseInt(suffixMatch[2], 10) + offset}`;
    } else {
      newId = `${id}-${offset}`;
    }
    remap.set(id, newId);
  }
  return remap;
}

const remapTables = [buildRemapTable(0), new Map(), buildRemapTable(2)];

console.log("Cell ID remapping:");
for (let i = 0; i < 3; i++) {
  if (remapTables[i].size > 0) {
    for (const [from, to] of remapTables[i]) {
      console.log(`  ${pages[i].name}: ${from} → ${to}`);
    }
  }
}

// ── Step 5: Merge registerFile calls ────────────────────────────────────────

console.log("Merging registerFile calls...");
const allRegisterFiles = new Map();
for (const page of pages) {
  const script = extractScript(page.html);
  const files = parseRegisterFiles(script);
  for (const [name, call] of files) {
    if (!allRegisterFiles.has(name)) {
      allRegisterFiles.set(name, call);
      console.log(`  ${name}`);
    }
  }
}

// ── Step 6: Merge define blocks ─────────────────────────────────────────────

console.log("Merging define() cells...");
const allDefineBlocks = [];

for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
  const script = extractScript(pages[pageIdx].html);
  const defines = parseDefineBlocks(script);
  const remap = remapTables[pageIdx];

  for (const { id, block } of defines) {
    // Skip bf5e5f37 from index and closing-remarks (canonical is f12777a6)
    if (id === "bf5e5f37" && pageIdx !== 1) {
      console.log(`  ${pages[pageIdx].name}: skipped bf5e5f37 (using canonical f12777a6)`);
      continue;
    }

    let processedBlock = block;

    // Patch f12777a6: add "name" to outputs and body
    if (id === "f12777a6") {
      // Add "name" to outputs array (after "periodLabel")
      processedBlock = processedBlock.replace(
        /outputs:\s*\[([^\]]+)\]/,
        (match, outputList) => {
          if (outputList.includes('"name"')) return match; // already there
          return match.replace("]", ',"name"]');
        }
      );
      // Add `const name = orgName("slug");` before the return statement
      processedBlock = processedBlock.replace(
        /return \{/,
        `const name = orgName("${orgSlug}");\nreturn {`
      );
      // Add name to the return object
      processedBlock = processedBlock.replace(
        /return \{([^}]+)\}/,
        (match, returnBody) => {
          if (returnBody.includes("name")) return match;
          return match.replace("}", ",name}");
        }
      );
      console.log(`  ${pages[pageIdx].name}: patched f12777a6 (added "name" output)`);
    }

    // Remap cell ID if needed
    if (remap.has(id)) {
      const newId = remap.get(id);
      processedBlock = processedBlock.replace(
        `id: "${id}"`,
        `id: "${newId}"`
      );
      console.log(`  ${pages[pageIdx].name}: ${id} → ${newId}`);
    }

    allDefineBlocks.push(processedBlock);
  }
}

// ── Step 7: Assemble merged script ──────────────────────────────────────────

// Extract the import lines from movement-report (the base page)
const importLines = movementScript
  .split("\n")
  .filter((line) => line.startsWith("import "))
  .join("\n");

const mergedScript = [
  importLines,
  "",
  ...Array.from(allRegisterFiles.values()),
  "",
  ...allDefineBlocks,
  "",
].join("\n");

// ── Step 8: Merge <main> content ────────────────────────────────────────────

console.log("Merging page content...");

function remapHtmlCellIds(html, remap) {
  let result = html;
  for (const [oldId, newId] of remap) {
    // Remap <!--:oldId:--> comment markers
    result = result.replaceAll(`<!--:${oldId}:-->`, `<!--:${newId}:-->`);
  }
  return result;
}

function removeDataCellBlock(html) {
  // Remove <div class="observablehq observablehq--block"><!--:bf5e5f37:--></div>
  return html.replace(
    /<div class="observablehq observablehq--block"><!--:bf5e5f37:--><\/div>\n?/g,
    ""
  );
}

function removeToc(html) {
  // Remove <aside id="observablehq-toc">...</aside>
  return html.replace(/<aside id="observablehq-toc">[\s\S]*?<\/aside>\n?/g, "");
}

const indexMain = removeDataCellBlock(remapHtmlCellIds(extractMain(pages[0].html), remapTables[0]));
const movementMain = extractMain(pages[1].html);
const closingMain = removeToc(removeDataCellBlock(remapHtmlCellIds(extractMain(pages[2].html), remapTables[2])));

const mergedMain = [
  `<!-- ═══ Executive Summary ═══ -->`,
  indexMain,
  `<hr class="page-break">`,
  `<!-- ═══ Movement Insights ═══ -->`,
  movementMain,
  `<hr class="page-break">`,
  `<!-- ═══ Closing Remarks ═══ -->`,
  closingMain,
].join("\n");

// ── Step 9: Build the base HTML from movement-report ────────────────────────

let html = pages[1].html;

// Replace <title>
html = html.replace(
  /<title>[^<]*<\/title>/,
  `<title>Movement Intelligence Report | Rhevia</title>`
);

// Replace the script with merged version (function replacement avoids $-pattern interpretation)
html = html.replace(scriptTagRe, () => `<script type="module">\n${mergedScript}\n</script>`);

// Replace <main> content (function replacement to avoid $-pattern interpretation in HTML)
html = html.replace(
  /(<main[^>]*>)[\s\S]*?(<\/main>)/,
  (_, openTag, closeTag) => `${openTag}\n${mergedMain}\n${closeTag}`
);

// Remove sidebar elements
html = html.replace(
  /<input id="observablehq-sidebar-toggle"[^>]*>\n?/g,
  ""
);
html = html.replace(
  /<label id="observablehq-sidebar-backdrop"[^>]*><\/label>\n?/g,
  ""
);
html = html.replace(/<nav id="observablehq-sidebar">[\s\S]*?<\/nav>\n?/, "");
// Remove sidebar init script (the non-module script between </nav> and <div id="observablehq-center">)
html = html.replace(
  /<script>\{const e=document\.querySelector\("#observablehq-sidebar"\)[\s\S]*?<\/script>\n?/,
  ""
);

// Simplify footer — remove prev/next nav links
html = html.replace(
  /<footer id="observablehq-footer">\n<nav>[\s\S]*?<\/nav>\n/,
  `<footer id="observablehq-footer">\n`
);

// ── Step 10: Inline local CSS ───────────────────────────────────────────────

console.log("Inlining CSS...");
html = html.replace(
  /<link\s+rel="stylesheet"(?:\s+type="text\/css")?\s+href="([^"]+)"(?:\s+crossorigin)?>/g,
  (match, href) => {
    if (href.startsWith("http")) return match; // keep CDN links
    try {
      const css = readLocalFile(href);
      console.log(`  Inlined ${href}`);
      return `<style>/* source: ${href} */\n${css}</style>`;
    } catch (err) {
      console.warn(`  Warning: could not read CSS file ${href}: ${err.message}`);
      return match;
    }
  }
);

// ── Step 11: Remove preload / modulepreload hints ───────────────────────────

html = html.replace(
  /<link\s+rel="preload"\s+as="style"\s+href="([^"]+)"(?:\s+crossorigin)?>/g,
  (match, href) => (href.startsWith("http") ? match : "")
);
html = html.replace(/<link\s+rel="modulepreload"\s+href="[^"]+"\s*>/g, "");

// ── Step 12: Inline favicon ─────────────────────────────────────────────────

html = html.replace(
  /<link\s+rel="icon"\s+href="([^"]+)"\s+type="([^"]+)"[^>]*>/g,
  (match, href, mimeType) => {
    try {
      const buf = readLocalBinary(href);
      const b64 = buf.toString("base64");
      return `<link rel="icon" href="data:${mimeType};base64,${b64}" type="${mimeType}" sizes="32x32">`;
    } catch {
      return match;
    }
  }
);

// ── Step 13: Inline FileAttachment data as base64 data URLs ─────────────────

console.log("Inlining FileAttachment data...");
html = html.replace(
  /<script\s+type="module">([\s\S]*?)<\/script>/,
  (_match, scriptContent) => {
    const inlined = scriptContent.replace(
      /"path"\s*:\s*"([^"]+\.json)"/g,
      (match, jsonPath) => {
        if (jsonPath.startsWith("data:")) return match;
        try {
          const data = readLocalBinary(jsonPath);
          const b64 = data.toString("base64");
          console.log(`  Embedded ${jsonPath} (${data.length} bytes)`);
          return `"path":"data:application/json;base64,${b64}"`;
        } catch (err) {
          console.warn(`  Warning: could not read ${jsonPath}: ${err.message}`);
          return match;
        }
      }
    );
    return `<script type="module">${inlined}</script>`;
  }
);

// ── Step 14: Extract script for esbuild bundling ────────────────────────────

const finalScriptMatch = html.match(scriptTagRe);
if (!finalScriptMatch) {
  console.error("Error: no <script type=\"module\"> found after merging.");
  process.exit(1);
}

let scriptContent = finalScriptMatch[1];

// ── Step 15: Bundle JS with esbuild ─────────────────────────────────────────

console.log("Bundling JavaScript modules with esbuild...");

const inlineDynamicImportsPlugin = {
  name: "inline-dynamic-imports",
  setup(pluginBuild) {
    pluginBuild.onLoad({ filter: /\.js$/ }, async (args) => {
      let contents = readFileSync(args.path, "utf-8");
      const fileDir = dirname(args.path);
      const dynamicImports = [];
      let counter = 0;

      contents = contents.replace(
        /\bimport\(\s*["']([^"']+)["']\s*\)/g,
        (match, specifier) => {
          if (/^(https?:|data:|blob:)/.test(specifier)) return match;
          const resolved = resolve(fileDir, specifier);
          if (existsSync(resolved)) {
            const id = `__dyn_${counter++}`;
            dynamicImports.push({ id, specifier });
            return `Promise.resolve(${id})`;
          }
          return "Promise.resolve({})";
        }
      );

      if (dynamicImports.length > 0) {
        const statics = dynamicImports
          .map((d) => `import * as ${d.id} from ${JSON.stringify(d.specifier)};`)
          .join("\n");
        contents = statics + "\n" + contents;
      }

      return { contents, loader: "js" };
    });
  },
};

let bundledScript;
try {
  const result = await build({
    stdin: {
      contents: scriptContent,
      resolveDir: baseDir,
      loader: "js",
    },
    bundle: true,
    format: "esm",
    write: false,
    minify: false,
    platform: "browser",
    logLevel: "warning",
    plugins: [inlineDynamicImportsPlugin],
  });

  bundledScript = result.outputFiles[0].text;
  console.log(
    `  Bundled JS: ${(bundledScript.length / 1024 / 1024).toFixed(1)} MB`
  );
} catch (err) {
  console.error("esbuild bundling failed:", err.message);
  process.exit(1);
}

// ── Step 16: Reassemble HTML ────────────────────────────────────────────────

// Use a function replacement to avoid $-pattern interpretation in bundled JS
html = html.replace(scriptTagRe, () => `<script type="module">\n${bundledScript}\n</script>`);

// Inject Mapbox token in <head>
html = html.replace(
  "<head>",
  `<head>\n<script>window.__MAPBOX_TOKEN = ${JSON.stringify(mapboxToken)};</script>`
);

// Add header comments
const timestamp = new Date().toISOString();
html =
  `<!-- Rhevia Movement Intelligence Report — Standalone -->\n<!-- Generated: ${timestamp} -->\n` +
  html;

// ── Step 17: Write output ───────────────────────────────────────────────────

writeFileSync(outputPath, html);
const sizeMB = (Buffer.byteLength(html) / 1024 / 1024).toFixed(1);
console.log(
  `\nDone → ${relative(process.cwd(), outputPath)} (${sizeMB} MB)`
);
