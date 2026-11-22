import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  CSS_MODULES,
  JS_MODULES,
  assertBalancedBraces,
  minifyCss,
  stripComments,
} from '../scripts/build.mjs';
import {
  PRISM_GUID,
  mergeManifestVersion,
} from '../scripts/update-manifest.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('stripComments removes block comments while preserving comments inside strings', () => {
  const input = '/* top */ .a { content: "/* keep */"; /* drop */ color: red; }';
  const stripped = stripComments(input);
  assert.equal(stripped.includes('/* top */'), false);
  assert.equal(stripped.includes('/* drop */'), false);
  assert.equal(stripped.includes('"/* keep */"'), true);
});

test('assertBalancedBraces accepts valid CSS and rejects unbalanced braces', () => {
  assert.doesNotThrow(() => assertBalancedBraces('.a { color: #000; } @media (min-width: 900px) { .b { display: flex; } }', 'valid.css'));
  assert.throws(() => assertBalancedBraces('.a { color: #000;', 'unclosed.css'), /Unbalanced braces/);
  assert.throws(() => assertBalancedBraces('.a { color: #000; }}', 'extra-close.css'), /Unexpected closing brace/);
});

test('minifyCss preserves calc(), max(), env(), and !important spacing', () => {
  const input = `
    /* header */
    .test {
      margin-top: calc(-1 * var(--prism-hero-pull, 64px));
      padding-left: max(0.5rem, env(safe-area-inset-left)) !important;
    }
  `;
  const out = minifyCss(input);
  assert.match(out, /margin-top:\s*calc\(-1 \* var\(--prism-hero-pull,64px\)\)/);
  assert.match(out, /padding-left:\s*max\(0\.5rem,env\(safe-area-inset-left\)\) !important/);
});

test('built minified CSS in dist/ matches plugin embedded Web/prism.min.css byte-for-byte', () => {
  const distMin = fs.readFileSync(path.join(rootDir, 'dist', 'prism.min.css'), 'utf8');
  const webMin = fs.readFileSync(
    path.join(rootDir, 'plugin', 'Jellyfin.Plugin.Prism', 'Web', 'prism.min.css'),
    'utf8'
  );
  assert.equal(webMin, distMin);
  assert.ok(distMin.length > 10000);
});

test('CSS preserves LG WebOS 60fps guardrails, borderless hero header, and scoped hamburger alignment', () => {
  const bundledCss = fs.readFileSync(path.join(rootDir, 'dist', 'prism.css'), 'utf8');
  const baseCss = fs.readFileSync(path.join(rootDir, 'src', 'base.css'), 'utf8');
  const tvCss = fs.readFileSync(path.join(rootDir, 'src', 'tv.css'), 'utf8');
  const heroCss = fs.readFileSync(path.join(rootDir, 'src', 'hero.css'), 'utf8');

  assert.equal(CSS_MODULES.length, 7);
  assert.ok(tvCss.includes('backdrop-filter: none !important'));
  assert.ok(tvCss.includes('animation: none !important'));
  assert.ok(heroCss.includes('html:not(.layout-tv) #slides-container .prism-backdrop-layer.prism-kb-active'));
  assert.ok(baseCss.includes('html.prism-hero-page.prism-at-top .MuiAppBar-root'));
  assert.ok(baseCss.includes('border-bottom: none !important;'));
  assert.ok(bundledCss.includes('html.prism-hamburger-active:not(.layout-tv) .MuiAppBar-root > .MuiToolbar-root:first-of-type'));
  assert.ok(bundledCss.includes('.MuiToolbar-root[data-prism-nav-toolbar="1"]'));
  assert.ok(bundledCss.includes('padding-left: max(0.5rem, env(safe-area-inset-left)) !important;'));
});

test('plugin Web/prism.js parses cleanly and executes idempotently in a minimal sandbox without ApiClient', () => {
  assert.equal(JS_MODULES.length, 7);
  const prismJs = fs.readFileSync(
    path.join(rootDir, 'plugin', 'Jellyfin.Plugin.Prism', 'Web', 'prism.js'),
    'utf8'
  );
  assert.doesNotThrow(() => new vm.Script(prismJs, { filename: 'prism.js' }));

  const classSet = new Set();
  const makeClassList = () => ({
    contains: (cls) => classSet.has(cls),
    add: (...cls) => cls.forEach((c) => classSet.add(c)),
    remove: (...cls) => cls.forEach((c) => classSet.delete(c)),
    toggle: (cls, force) => {
      if (force === undefined) {
        if (classSet.has(cls)) {
          classSet.delete(cls);
          return false;
        }
        classSet.add(cls);
        return true;
      }
      if (force) classSet.add(cls);
      else classSet.delete(cls);
      return Boolean(force);
    },
  });

  const styleMap = new Map();
  const makeElement = (tagName = 'div') => ({
    tagName: tagName.toUpperCase(),
    classList: makeClassList(),
    style: {
      setProperty: (k, v) => styleMap.set(k, v),
      getPropertyValue: (k) => styleMap.get(k) || '',
      removeProperty: (k) => styleMap.delete(k),
    },
    children: [],
    setAttribute: () => {},
    getAttribute: () => null,
    removeAttribute: () => {},
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild: (child) => child,
    insertBefore: (child) => child,
  });

  const headEl = makeElement('head');
  const bodyEl = makeElement('body');
  const docEl = makeElement('html');

  const mockWindow = {
    location: { hash: '#/home', pathname: '/web/' },
    innerWidth: 1440,
    scrollY: 0,
    pageYOffset: 0,
    history: { length: 1, state: null },
    addEventListener: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    requestAnimationFrame: (cb) => {
      cb();
      return 1;
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
  };

  const mockDocument = {
    readyState: 'complete',
    hidden: false,
    head: headEl,
    body: bodyEl,
    documentElement: docEl,
    activeElement: bodyEl,
    createElement: (tag) => makeElement(tag),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  mockWindow.document = mockDocument;
  mockWindow.MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  mockWindow.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) });

  const sandbox = {
    window: mockWindow,
    document: mockDocument,
    MutationObserver: mockWindow.MutationObserver,
    fetch: mockWindow.fetch,
    Image: class {},
    Promise,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Object,
    Array,
    JSON,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout: mockWindow.setTimeout,
    clearTimeout: mockWindow.clearTimeout,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const ctx = vm.createContext(sandbox);
  assert.doesNotThrow(() => vm.runInContext(prismJs, ctx));
  assert.equal(mockWindow.__prismInit, true);
  // Running twice must remain a no-op because of the init guard
  assert.doesNotThrow(() => vm.runInContext(prismJs, ctx));
});

test('plugin .csproj defines valid semver Version and embeds required Web and Configuration resources', () => {
  const csprojPath = path.join(rootDir, 'plugin', 'Jellyfin.Plugin.Prism', 'Jellyfin.Plugin.Prism.csproj');
  const csproj = fs.readFileSync(csprojPath, 'utf8');
  const versionMatch = csproj.match(/<Version>([^<]+)<\/Version>/);
  assert.ok(versionMatch, 'Expected <Version> element in .csproj');
  assert.match(versionMatch[1].trim(), /^\d+\.\d+\.\d+$/);
  assert.ok(csproj.includes('<EmbeddedResource Include="Configuration\\configPage.html" />'));
  assert.ok(csproj.includes('<EmbeddedResource Include="Web\\prism.js" />'));
  assert.ok(csproj.includes('<EmbeddedResource Include="Web\\prism.min.css" />'));
});

test('mergeManifestVersion prepends newer releases, updates idempotently, normalizes MD5, and rejects invalid entries', () => {
  const base = [
    {
      guid: PRISM_GUID,
      name: 'Prism',
      description: 'Desc',
      overview: 'Overview',
      owner: 'gemcdaniel',
      category: 'General',
      imageUrl: 'https://raw.githubusercontent.com/gemcdaniel/jellyfin-plugin-prism/main/assets/logo.png',
      versions: [
        {
          version: '1.0.0.0',
          changelog: 'Initial release',
          targetAbi: '12.4.0.0',
          sourceUrl: 'https://github.com/gemcdaniel/jellyfin-plugin-prism/releases/download/v1.0.0/prism-plugin_v1.0.0.zip',
          checksum: '366578b4b59ff3a46f47bf3319559547',
          timestamp: '2026-11-22T22:28:57Z',
        },
      ],
    },
  ];

  const withV110 = mergeManifestVersion(base, {
    version: '1.1.0.0',
    changelog: 'Release v1.1.0',
    targetAbi: '12.4.0.0',
    sourceUrl: 'https://github.com/gemcdaniel/jellyfin-plugin-prism/releases/download/v1.1.0/prism-plugin_v1.1.0.zip',
    checksum: 'ABCDEF0123456789ABCDEF0123456789',
    timestamp: '2026-12-01T12:00:00Z',
  });

  assert.equal(withV110[0].versions.length, 2);
  assert.equal(withV110[0].versions[0].version, '1.1.0.0');
  assert.equal(withV110[0].versions[0].checksum, 'abcdef0123456789abcdef0123456789');
  assert.equal(withV110[0].versions[1].version, '1.0.0.0');

  const idempotent = mergeManifestVersion(withV110, {
    version: '1.1.0.0',
    changelog: 'Release v1.1.0 (republished)',
    targetAbi: '12.4.0.0',
    sourceUrl: 'https://github.com/gemcdaniel/jellyfin-plugin-prism/releases/download/v1.1.0/prism-plugin_v1.1.0.zip',
    checksum: '11111111111111111111111111111111',
    timestamp: '2026-12-01T12:05:00Z',
  });

  assert.equal(idempotent[0].versions.length, 2);
  assert.equal(idempotent[0].versions[0].checksum, '11111111111111111111111111111111');
  assert.equal(idempotent[0].versions[0].changelog, 'Release v1.1.0 (republished)');

  assert.throws(
    () =>
      mergeManifestVersion(base, {
        version: '1.2.0.0',
        targetAbi: '12.4.0.0',
        sourceUrl: 'https://example.com/Prism.dll',
        checksum: 'abcdef0123456789abcdef0123456789',
      }),
    /\.zip/
  );

  assert.throws(
    () =>
      mergeManifestVersion(base, {
        version: '1.2.0.0',
        targetAbi: '12.4.0.0',
        sourceUrl: 'https://example.com/prism.zip',
        checksum: 'not-md5',
      }),
    /MD5/
  );
});

test('repository manifest.json and assets/logo.png satisfy Jellyfin plugin repository format', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
  assert.ok(Array.isArray(manifest));
  assert.equal(manifest[0].guid, PRISM_GUID);
  assert.equal(manifest[0].name, 'Prism');
  assert.ok(manifest[0].versions.length >= 1);

  const logoBytes = fs.readFileSync(path.join(rootDir, 'assets', 'logo.png'));
  assert.deepEqual(Array.from(logoBytes.subarray(0, 8)), [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});
