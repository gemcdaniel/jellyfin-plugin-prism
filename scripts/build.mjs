import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const jsSrcDir = path.join(srcDir, 'js');
const distDir = path.join(rootDir, 'dist');
const pluginWebDir = path.join(rootDir, 'plugin', 'Jellyfin.Plugin.Prism', 'Web');

export const CSS_MODULES = [
  'tokens.css',
  'base.css',
  'cards.css',
  'pages.css',
  'hero.css',
  'tv.css',
  'mobile.css',
];

export const JS_MODULES = [
  '01-core.js',
  '02-stability.js',
  '03-ambient-detail.js',
  '04-spotlight.js',
  '05-sections-discovery.js',
  '06-infinite-scroll.js',
  '07-badges-bootstrap.js',
];

const BANNER = `/*!
 * Prism — Jellyfin Experience Plugin & OLED UI
 * True-black OLED surfaces + Prism violet-cyan accents + LG WebOS 60fps guardrails
 * Built from modular sources in src/
 */
`;

/**
 * Strip CSS comments while preserving quoted string literals.
 */
export function stripComments(css) {
  let out = '';
  let inString = null;
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    const next = css[i + 1];

    if (inString) {
      out += ch;
      if (ch === '\\' && next) {
        out += next;
        i += 1;
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = ch;
      out += ch;
      continue;
    }

    if (ch === '/' && next === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end === -1) {
        throw new Error('Unclosed CSS comment detected');
      }
      i = end + 1;
      continue;
    }

    out += ch;
  }
  return out;
}

/**
 * Verify balanced braces outside comments and string literals.
 */
export function assertBalancedBraces(css, label) {
  const cleaned = stripComments(css);
  let depth = 0;
  let inString = null;

  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];

    if (inString) {
      if (ch === '\\' && next) {
        i += 1;
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }

    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth < 0) {
        throw new Error(`Unexpected closing brace in ${label}`);
      }
    }
  }

  if (depth !== 0) {
    throw new Error(`Unbalanced braces (depth=${depth}) in ${label}`);
  }
}

/**
 * Safe CSS minifier that preserves calc() math spaces and pseudo-selectors.
 */
export function minifyCss(css) {
  return stripComments(css)
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

export function generateCssOutputs() {
  const parts = [];

  for (const fileName of CSS_MODULES) {
    const filePath = path.join(srcDir, fileName);
    const content = fs.readFileSync(filePath, 'utf8');
    assertBalancedBraces(content, fileName);
    parts.push(content.trim());
  }

  const bundled = `${BANNER}\n${parts.join('\n\n')}\n`;
  assertBalancedBraces(bundled, 'dist/prism.css');

  const minified = `/*! Prism — Jellyfin UI (minified) */\n${minifyCss(parts.join('\n'))}\n`;
  assertBalancedBraces(minified, 'dist/prism.min.css');

  return { bundled, minified };
}

export function generateJsOutput() {
  if (!fs.existsSync(jsSrcDir)) {
    throw new Error(`Missing JS source directory: ${jsSrcDir}`);
  }

  const parts = [];
  for (const fileName of JS_MODULES) {
    const filePath = path.join(jsSrcDir, fileName);
    const content = fs.readFileSync(filePath, 'utf8').trim();
    parts.push(`  // --- ${fileName} ---\n${content}`);
  }

  const bundledJs = `/*! Prism — Client Script (built from src/js/) */\n(function () {\n  'use strict';\n\n${parts.join('\n\n')}\n})();\n`;

  // Compile-check bundled JS syntax at build time
  new vm.Script(bundledJs, { filename: 'prism.js' });
  return bundledJs;
}

function buildCss() {
  const { bundled, minified } = generateCssOutputs();

  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'prism.css'), bundled, 'utf8');
  fs.writeFileSync(path.join(distDir, 'prism.min.css'), minified, 'utf8');

  fs.mkdirSync(pluginWebDir, { recursive: true });
  fs.writeFileSync(path.join(pluginWebDir, 'prism.min.css'), minified, 'utf8');

  console.log(
    `Built dist/prism.css (${bundled.length} bytes), dist/prism.min.css (${minified.length} bytes), and synced plugin Web/prism.min.css`
  );
}

function buildJs() {
  const bundledJs = generateJsOutput();

  fs.mkdirSync(pluginWebDir, { recursive: true });
  fs.writeFileSync(path.join(pluginWebDir, 'prism.js'), bundledJs, 'utf8');
  console.log(`Built plugin Web/prism.js (${bundledJs.length} bytes from ${JS_MODULES.length} modules)`);
}

export function build() {
  buildCss();
  buildJs();
}

if (path.resolve(process.argv[1] || '') === __filename) {
  build();
}
