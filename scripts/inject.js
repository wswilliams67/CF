#!/usr/bin/env node
/**
 * Nimbus v1 Portable — Build Injector
 *
 * Resolves <!-- @nimbus components: x, y, z --> markers in HTML source files
 * and emits fully self-contained pages with correct <link> and <script> tags.
 *
 * Usage:
 *   node inject.js <source.html> [<output.html>]
 *
 * If no output path is given the resolved file is printed to stdout.
 *
 * Marker syntax (place inside <head> where component CSS should land):
 *   <!-- @nimbus components: modal, datatable, tabs -->
 *
 * The injector:
 *   1. Reads manifest.json from the redwell root
 *   2. Collects unique CSS and JS deps for the listed components (plus core)
 *   3. Replaces the marker with <link> tags for CSS
 *   4. Inserts <script> tags just before </body>
 *   5. Writes the resolved file (or prints to stdout)
 *
 * Path depth convention:
 *   Pages are assumed to live one level deep (redwell/pages/<file>.html).
 *   All asset paths are prefixed with "../" accordingly.
 *   Pass --depth=2 for pages nested two levels deep (prefix becomes "../../").
 */

"use strict";

const fs   = require("fs");
const path = require("path");

/* ── Config ──────────────────────────────────────────────────────────────── */

const REDWELL_ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(REDWELL_ROOT, "manifest.json");

/* ── CLI args ─────────────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
  console.log([
    "Usage: node inject.js <source.html> [<output.html>] [--depth=N]",
    "",
    "  source.html   HTML file containing <!-- @nimbus components: ... --> marker",
    "  output.html   Optional output path (default: print to stdout)",
    "  --depth=N     Directory depth of the output page (default: 1)",
    "",
    "Example:",
    "  node inject.js ../pages/my-page.html ../pages/my-page.out.html",
  ].join("\n"));
  process.exit(0);
}

let sourceFile  = null;
let outputFile  = null;
let depth       = 1;

for (const arg of args) {
  if (arg.startsWith("--depth=")) {
    depth = parseInt(arg.split("=")[1], 10) || 1;
  } else if (!sourceFile) {
    sourceFile = arg;
  } else {
    outputFile = arg;
  }
}

if (!sourceFile) {
  console.error("Error: no source file specified.");
  process.exit(1);
}

/* ── Load manifest ────────────────────────────────────────────────────────── */

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const prefix   = "../".repeat(depth);

/* ── Parse marker ─────────────────────────────────────────────────────────── */

const MARKER_RE = /<!--\s*@nimbus\s+components:\s*([^-]+?)\s*-->/i;

let source = fs.readFileSync(path.resolve(sourceFile), "utf8");

const match = source.match(MARKER_RE);
if (!match) {
  console.error("Warning: no <!-- @nimbus components: ... --> marker found. Outputting source unchanged.");
  if (outputFile) fs.writeFileSync(outputFile, source, "utf8");
  else process.stdout.write(source);
  process.exit(0);
}

const requestedComponents = match[1]
  .split(",")
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

/* ── Collect deps (core always first, then requested components) ─────────── */

const allComponents = ["core", ...requestedComponents];
const seenCss = new Set();
const seenJs  = new Set();
const cssFiles = [];
const jsFiles  = [];

for (const name of allComponents) {
  const entry = manifest[name];
  if (!entry) {
    console.error(`Warning: component "${name}" not found in manifest.json — skipping.`);
    continue;
  }
  for (const file of (entry.css || [])) {
    if (!seenCss.has(file)) { seenCss.add(file); cssFiles.push(file); }
  }
  for (const file of (entry.js || [])) {
    if (!seenJs.has(file)) { seenJs.add(file); jsFiles.push(file); }
  }
}

/* ── Build tag blocks ────────────────────────────────────────────────────── */

const componentList = requestedComponents.length
  ? requestedComponents.join(", ")
  : "(none)";

const cssBlock = [
  `<!-- ═══ Nimbus v1 CSS — core + components: ${componentList} ═══ -->`,
  ...cssFiles.map(f => `<link rel="stylesheet" href="${prefix}${f}" media="all" type="text/css" />`),
].join("\n");

const jsBlock = [
  `<!-- ═══ Nimbus v1 JS — core + components: ${componentList} ═══ -->`,
  ...jsFiles.map(f => `<script type="text/javascript" src="${prefix}${f}"></script>`),
].join("\n");

/* ── Inject ───────────────────────────────────────────────────────────────── */

// Replace the @nimbus marker with the CSS block
source = source.replace(MARKER_RE, cssBlock);

// Insert JS block just before </body>
if (source.includes("</body>")) {
  source = source.replace("</body>", `${jsBlock}\n</body>`);
} else {
  source += "\n" + jsBlock;
}

/* ── Output ───────────────────────────────────────────────────────────────── */

if (outputFile) {
  fs.writeFileSync(path.resolve(outputFile), source, "utf8");
  console.log(`Injected ${cssFiles.length} CSS and ${jsFiles.length} JS refs → ${outputFile}`);
} else {
  process.stdout.write(source);
}
