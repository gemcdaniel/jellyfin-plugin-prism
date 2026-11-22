import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  CSS_MODULES,
  JS_MODULES,
  assertBalancedBraces,
  generateCssOutputs,
  generateJsOutput,
} from './build.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const errors = [];

function recordError(file, message) {
  errors.push(`${path.relative(rootDir, file)}: ${message}`);
}

function listFilesRecursive(dir, predicate) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(fullPath, predicate));
    } else if (entry.isFile() && predicate(fullPath)) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

function checkTextHygiene(filePath, content) {
  if (content.includes('\r\n')) {
    recordError(filePath, 'contains CRLF line endings; expected LF');
  }
  if (!content.endsWith('\n')) {
    recordError(filePath, 'missing trailing newline at EOF');
  }
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.includes('\t')) {
      recordError(filePath, `line ${i + 1} contains raw tab character`);
    }
    if (/[ \t]+$/.test(line)) {
      recordError(filePath, `line ${i + 1} has trailing whitespace`);
    }
  }
}

function lintCss() {
  const srcDir = path.join(rootDir, 'src');
  const cssFiles = listFilesRecursive(srcDir, (f) => f.endsWith('.css'));

  for (const expectedMod of CSS_MODULES) {
    if (!fs.existsSync(path.join(srcDir, expectedMod))) {
      recordError(path.join(srcDir, expectedMod), 'declared in CSS_MODULES but missing on disk');
    }
  }

  for (const filePath of cssFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    checkTextHygiene(filePath, content);
    try {
      assertBalancedBraces(content, path.relative(rootDir, filePath));
    } catch (err) {
      recordError(filePath, err.message);
    }
  }

  const tvCssPath = path.join(srcDir, 'tv.css');
  if (fs.existsSync(tvCssPath)) {
    const tvCss = fs.readFileSync(tvCssPath, 'utf8');
    if (!tvCss.includes('backdrop-filter: none !important')) {
      recordError(tvCssPath, 'missing LG WebOS guardrail: backdrop-filter: none !important');
    }
    if (!tvCss.includes('animation: none !important')) {
      recordError(tvCssPath, 'missing LG WebOS guardrail: animation: none !important');
    }
  }
}

function lintJs() {
  const srcJsDir = path.join(rootDir, 'src', 'js');
  const modJsFiles = JS_MODULES.map((m) => path.join(srcJsDir, m));
  const mjsFiles = [
    ...listFilesRecursive(path.join(rootDir, 'scripts'), (f) => f.endsWith('.mjs')),
    ...listFilesRecursive(path.join(rootDir, 'tests'), (f) => f.endsWith('.mjs')),
  ];
  const webJs = path.join(rootDir, 'plugin', 'Jellyfin.Plugin.Prism', 'Web', 'prism.js');

  const debuggerRegex = /\bdebugger\s*;/;

  for (const filePath of modJsFiles) {
    if (!fs.existsSync(filePath)) {
      recordError(filePath, 'declared in JS_MODULES but missing on disk');
      continue;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    checkTextHygiene(filePath, content);

    if (debuggerRegex.test(content)) {
      recordError(filePath, 'contains debugger statement');
    }
    if (/\bconsole\.log\s*\(/.test(content)) {
      recordError(filePath, 'contains console.log(...) in client runtime module');
    }

    // Wrap module snippet in function body for syntax validation (modules share outer IIFE in prism.js)
    try {
      new vm.Script(`(function () {\n${content}\n});`, { filename: path.basename(filePath) });
    } catch (err) {
      recordError(filePath, `JS syntax error: ${err.message}`);
    }
  }

  if (fs.existsSync(webJs)) {
    const webContent = fs.readFileSync(webJs, 'utf8');
    checkTextHygiene(webJs, webContent);
    if (debuggerRegex.test(webContent)) {
      recordError(webJs, 'contains debugger statement');
    }
    try {
      new vm.Script(webContent, { filename: 'prism.js' });
    } catch (err) {
      recordError(webJs, `JS syntax error: ${err.message}`);
    }
  }

  for (const filePath of mjsFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    checkTextHygiene(filePath, content);
    if (filePath !== __filename && debuggerRegex.test(content)) {
      recordError(filePath, 'contains debugger statement');
    }
    try {
      execFileSync(process.execPath, ['--check', filePath], { stdio: 'pipe' });
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString('utf8').trim() : err.message;
      recordError(filePath, `ESM syntax check failed: ${stderr}`);
    }
  }

  const configPagePath = path.join(rootDir, 'plugin', 'Jellyfin.Plugin.Prism', 'Configuration', 'configPage.html');
  if (fs.existsSync(configPagePath)) {
    const html = fs.readFileSync(configPagePath, 'utf8');
    checkTextHygiene(configPagePath, html);
    const scriptMatch = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
    if (!scriptMatch) {
      recordError(configPagePath, 'missing inline <script> block');
    } else {
      try {
        new vm.Script(scriptMatch[1], { filename: 'configPage.inline.js' });
      } catch (err) {
        recordError(configPagePath, `inline <script> syntax error: ${err.message}`);
      }
    }
  }
}

function lintPackageAndWorkflows() {
  const pkgPath = path.join(rootDir, 'package.json');
  const pkgContent = fs.readFileSync(pkgPath, 'utf8');
  checkTextHygiene(pkgPath, pkgContent);
  try {
    JSON.parse(pkgContent);
  } catch (err) {
    recordError(pkgPath, `invalid JSON: ${err.message}`);
  }

  const githubDir = path.join(rootDir, '.github');
  const ymlFiles = listFilesRecursive(githubDir, (f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  for (const filePath of ymlFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    checkTextHygiene(filePath, content);
  }
}

function lintBuiltBundlesSync() {
  const { bundled, minified } = generateCssOutputs();
  const expectedJs = generateJsOutput();

  const artifacts = [
    { filePath: path.join(rootDir, 'dist', 'prism.css'), expected: bundled },
    { filePath: path.join(rootDir, 'dist', 'prism.min.css'), expected: minified },
    {
      filePath: path.join(rootDir, 'plugin', 'Jellyfin.Plugin.Prism', 'Web', 'prism.min.css'),
      expected: minified,
    },
    {
      filePath: path.join(rootDir, 'plugin', 'Jellyfin.Plugin.Prism', 'Web', 'prism.js'),
      expected: expectedJs,
    },
  ];

  for (const { filePath, expected } of artifacts) {
    if (!fs.existsSync(filePath)) {
      recordError(filePath, 'built artifact is missing; run "npm run build"');
      continue;
    }
    const actual = fs.readFileSync(filePath, 'utf8');
    if (actual !== expected) {
      recordError(filePath, 'is out of sync with src/; run "npm run build"');
    }
  }
}

lintCss();
lintJs();
lintPackageAndWorkflows();
lintBuiltBundlesSync();

if (errors.length > 0) {
  console.error(`Lint failed with ${errors.length} issue(s):`);
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log('Frontend lint passed: CSS, JS, configPage inline script, workflows, and bundle sync verified.');
