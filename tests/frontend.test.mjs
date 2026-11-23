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

test('CSS includes mobile spotlight stacked pagination, clean dot reset, and touch-action rules', () => {
  const bundledCss = fs.readFileSync(path.join(rootDir, 'dist', 'prism.css'), 'utf8');
  const heroCss = fs.readFileSync(path.join(rootDir, 'src', 'hero.css'), 'utf8');
  const mobileCss = fs.readFileSync(path.join(rootDir, 'src', 'mobile.css'), 'utf8');

  assert.ok(heroCss.includes('touch-action: pan-y pinch-zoom;'));
  assert.ok(heroCss.includes('overflow: hidden;'));
  assert.ok(heroCss.includes('padding: 0;'));
  assert.ok(heroCss.includes('appearance: none;'));
  assert.ok(bundledCss.includes('.layout-mobile #slides-container .hero-controls-right'));
  assert.ok(bundledCss.includes('@media (max-width: 768px)'));
  assert.ok(bundledCss.includes('html:not(.layout-tv) #slides-container .hero-controls-right'));
  assert.ok(bundledCss.includes('html:not(.layout-tv) .prism-inline-spotlight .hero-controls-right'));
  assert.equal(mobileCss.includes('.layout-mobile .prism-inline-spotlight-stage'), false);
});

test('CSS clears native itemBackdrop image when Prism detail backdrop is active', () => {
  const pagesCss = fs.readFileSync(path.join(rootDir, 'src', 'pages.css'), 'utf8');
  const bundledCss = fs.readFileSync(path.join(rootDir, 'dist', 'prism.css'), 'utf8');

  assert.ok(pagesCss.includes('.itemDetailPage.has-prism-backdrop .itemBackdrop'));
  assert.ok(pagesCss.includes('background-image: none !important;'));
  assert.ok(pagesCss.includes('.itemDetailPage.has-prism-backdrop .itemBackdrop img'));
  assert.ok(bundledCss.includes('.itemDetailPage.has-prism-backdrop .itemBackdrop'));
});

test('CSS scopes full-width Play CTA and hero button stretching to phones (<=640px), keeping tablet buttons compact', () => {
  const mobileCss = fs.readFileSync(path.join(rootDir, 'src', 'mobile.css'), 'utf8');
  const heroCss = fs.readFileSync(path.join(rootDir, 'src', 'hero.css'), 'utf8');

  const mobilePhoneSplit = mobileCss.split('@media (max-width: 640px)');
  assert.equal(mobilePhoneSplit.length, 2);
  assert.equal(mobilePhoneSplit[0].includes('flex: 1 1 100%;'), false);
  assert.equal(mobilePhoneSplit[0].includes('.layout-mobile .mainDetailButtons {'), false);
  assert.ok(mobilePhoneSplit[1].includes('flex: 1 1 100%;'));

  const heroPhoneSplit = heroCss.split('@media (max-width: 640px)');
  assert.equal(heroPhoneSplit.length, 2);
  assert.equal(heroPhoneSplit[0].includes('flex: 1 1 auto;'), false);
  assert.ok(heroPhoneSplit[1].includes('flex: 1 1 auto;'));
});

test('CSS styles sleek menu rows, full-card selection ring with circular checkbox, and centered card overlays', () => {
  const baseCss = fs.readFileSync(path.join(rootDir, 'src', 'base.css'), 'utf8');
  const cardsCss = fs.readFileSync(path.join(rootDir, 'src', 'cards.css'), 'utf8');
  const mobileCss = fs.readFileSync(path.join(rootDir, 'src', 'mobile.css'), 'utf8');
  const bundledCss = fs.readFileSync(path.join(rootDir, 'dist', 'prism.css'), 'utf8');

  assert.ok(baseCss.includes('.actionSheetMenuItem'));
  assert.ok(baseCss.includes('.MuiMenu-paper .MuiMenuItem-root'));
  assert.ok(baseCss.includes('html.prism-hero-page:not(.layout-tv) .MuiAppBar-root + div[aria-hidden="true"]'));
  assert.ok(mobileCss.includes('.layout-mobile .listItem:not(.actionSheetMenuItem):not(.listItem-button)'));
  assert.ok(cardsCss.includes('.card .cardOverlayFab-primary'));
  assert.ok(cardsCss.includes('.card .cardOverlayButton-br[data-action="play"]'));
  assert.ok(cardsCss.includes('.card .cardOverlayButton-br:not(.flex) [data-action="play"]'));
  assert.ok(cardsCss.includes('.homeSectionsContainer .sectionTitle.padded-left'));
  assert.ok(cardsCss.includes('html.layout-mobile .card:not(:focus-within) .cardOverlayContainer'));
  assert.ok(cardsCss.includes('.cardBox .itemSelectionPanel .multiSelectCheckboxOutline'));
  assert.ok(cardsCss.includes('.card:has(.chkItemSelect:checked) .cardBox'));
  assert.ok(bundledCss.includes('.itemSelectionPanel'));
});

function createMiniDom() {
  const parseAttrs = (raw) => {
    const attrs = new Map();
    const attrRe = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let m;
    while ((m = attrRe.exec(raw))) {
      attrs.set(m[1], m[2] ?? m[3] ?? m[4] ?? '');
    }
    return attrs;
  };

  const matchesSimpleSelector = (el, part) => {
    if (!part) return false;
    let rest = part.trim();
    const notMatches = [];
    rest = rest.replace(/:not\(([^)]+)\)/g, (_, inner) => {
      notMatches.push(inner.trim());
      return '';
    });
    for (const neg of notMatches) {
      if (matchesSimpleSelector(el, neg)) return false;
    }

    const tagMatch = rest.match(/^[a-zA-Z][a-zA-Z0-9-]*/);
    if (tagMatch) {
      if (el.tagName.toLowerCase() !== tagMatch[0].toLowerCase()) return false;
      rest = rest.slice(tagMatch[0].length);
    }

    const attrMatches = [];
    rest = rest.replace(/\[([^\]=]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/g, (_, k, v1, v2, v3) => {
      attrMatches.push([k.trim(), v1 ?? v2 ?? v3]);
      return '';
    });
    for (const [k, v] of attrMatches) {
      if (!el.attributes.has(k)) return false;
      if (v !== undefined && el.attributes.get(k) !== v) return false;
    }

    const idMatch = rest.match(/#([a-zA-Z0-9_-]+)/);
    if (idMatch) {
      if (el.attributes.get('id') !== idMatch[1]) return false;
      rest = rest.replace(idMatch[0], '');
    }

    const classMatches = rest.match(/\.[a-zA-Z0-9_-]+/g) || [];
    for (const c of classMatches) {
      if (!el.classList.contains(c.slice(1))) return false;
    }
    return true;
  };

  const matchesCompoundChain = (el, chain) => {
    const tokens = chain.trim().split(/\s+/);
    if (tokens.length === 0) return false;
    if (tokens.includes('>')) {
      const idx = tokens.lastIndexOf('>');
      const childSel = tokens.slice(idx + 1).join(' ');
      const parentSel = tokens.slice(0, idx).join(' ');
      return matchesSimpleSelector(el, childSel) && el.parentNode && matchesCompoundChain(el.parentNode, parentSel);
    }
    if (!matchesSimpleSelector(el, tokens[tokens.length - 1])) return false;
    let cur = el.parentNode;
    for (let i = tokens.length - 2; i >= 0; i -= 1) {
      while (cur && !matchesSimpleSelector(cur, tokens[i])) {
        cur = cur.parentNode;
      }
      if (!cur) return false;
      cur = cur.parentNode;
    }
    return true;
  };

  const matchesSelector = (el, selector) =>
    selector.split(',').some((s) => matchesCompoundChain(el, s));

  const collectDescendants = (root, selector, out = []) => {
    for (const child of root.children) {
      if (matchesSelector(child, selector)) out.push(child);
      collectDescendants(child, selector, out);
    }
    return out;
  };

  const voidTags = new Set(['img', 'br', 'hr', 'input', 'path']);

  const makeElement = (tagName = 'div') => {
    const classSet = new Set();
    const attributes = new Map();
    const styleMap = new Map();
    const listeners = new Map();
    const el = {
      tagName: tagName.toUpperCase(),
      attributes,
      children: [],
      parentNode: null,
      offsetHeight: 64,
      offsetParent: {},
      scrollTop: 0,
      textContent: '',
      classList: {
        contains: (cls) => classSet.has(cls),
        add: (...cls) => cls.forEach((c) => {
          classSet.add(c);
          attributes.set('class', Array.from(classSet).join(' '));
        }),
        remove: (...cls) => cls.forEach((c) => {
          classSet.delete(c);
          attributes.set('class', Array.from(classSet).join(' '));
        }),
        toggle: (cls, force) => {
          const next = force === undefined ? !classSet.has(cls) : Boolean(force);
          if (next) classSet.add(cls);
          else classSet.delete(cls);
          attributes.set('class', Array.from(classSet).join(' '));
          return next;
        },
      },
      style: {
        setProperty: (k, v) => styleMap.set(k, String(v)),
        getPropertyValue: (k) => styleMap.get(k) || '',
        removeProperty: (k) => styleMap.delete(k),
      },
      get id() {
        return attributes.get('id') || '';
      },
      set id(val) {
        attributes.set('id', String(val));
      },
      get className() {
        return Array.from(classSet).join(' ');
      },
      set className(val) {
        classSet.clear();
        String(val || '').split(/\s+/).filter(Boolean).forEach((c) => classSet.add(c));
        attributes.set('class', Array.from(classSet).join(' '));
      },
      get firstChild() {
        return el.children[0] || null;
      },
      get firstElementChild() {
        return el.children[0] || null;
      },
      get nextSibling() {
        if (!el.parentNode) return null;
        const idx = el.parentNode.children.indexOf(el);
        return idx >= 0 ? el.parentNode.children[idx + 1] || null : null;
      },
      setAttribute: (k, v) => {
        attributes.set(k, String(v));
        if (k === 'class') el.className = String(v);
      },
      getAttribute: (k) => (attributes.has(k) ? attributes.get(k) : null),
      removeAttribute: (k) => attributes.delete(k),
      appendChild: (child) => {
        if (child.parentNode) {
          const i = child.parentNode.children.indexOf(child);
          if (i >= 0) child.parentNode.children.splice(i, 1);
        }
        child.parentNode = el;
        el.children.push(child);
        return child;
      },
      insertBefore: (child, ref) => {
        if (!ref) return el.appendChild(child);
        const idx = el.children.indexOf(ref);
        if (idx === -1) return el.appendChild(child);
        child.parentNode = el;
        el.children.splice(idx, 0, child);
        return child;
      },
      removeChild: (child) => {
        const idx = el.children.indexOf(child);
        if (idx >= 0) {
          el.children.splice(idx, 1);
          child.parentNode = null;
        }
        return child;
      },
      contains: (target) => {
        let cur = target;
        while (cur) {
          if (cur === el) return true;
          cur = cur.parentNode;
        }
        return false;
      },
      closest: (selector) => {
        let cur = el;
        while (cur && cur.tagName) {
          if (matchesSelector(cur, selector)) return cur;
          cur = cur.parentNode;
        }
        return null;
      },
      querySelector: (selector) => collectDescendants(el, selector)[0] || null,
      querySelectorAll: (selector) => collectDescendants(el, selector),
      getBoundingClientRect: () => ({ top: 0, left: 0, right: 390, bottom: 420, width: 390, height: 420 }),
      addEventListener: (type, fn, opts) => {
        const capture = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push({ fn, capture });
      },
      removeEventListener: (type, fn, opts) => {
        const capture = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
        const list = listeners.get(type);
        if (!list) return;
        listeners.set(type, list.filter((l) => l.fn !== fn || l.capture !== capture));
      },
      dispatchEvent: (evt) => {
        evt.target = el;
        evt.defaultPrevented = Boolean(evt.defaultPrevented);
        let stopped = false;
        let stoppedImmediate = false;
        evt.preventDefault = () => { evt.defaultPrevented = true; };
        evt.stopPropagation = () => { stopped = true; };
        evt.stopImmediatePropagation = () => { stopped = true; stoppedImmediate = true; };

        const chain = [];
        let cur = el;
        while (cur) {
          chain.unshift(cur);
          cur = cur.parentNode;
        }

        for (const node of chain) {
          if (stopped) break;
          const list = node._listeners.get(evt.type) || [];
          for (const entry of list) {
            if (entry.capture) {
              evt.currentTarget = node;
              entry.fn.call(node, evt);
              if (stoppedImmediate) break;
            }
          }
        }
        for (let i = chain.length - 1; i >= 0; i -= 1) {
          if (stopped) break;
          const node = chain[i];
          const list = node._listeners.get(evt.type) || [];
          for (const entry of list) {
            if (!entry.capture) {
              evt.currentTarget = node;
              entry.fn.call(node, evt);
              if (stoppedImmediate) break;
            }
          }
        }
        return !evt.defaultPrevented;
      },
      _listeners: listeners,
    };

    Object.defineProperty(el, 'innerHTML', {
      get: () => '',
      set: (html) => {
        el.children = [];
        const stack = [el];
        const tokenRe = /<(\/)?([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/)?>|([^<]+)/g;
        let m;
        while ((m = tokenRe.exec(String(html || '')))) {
          if (m[5]) {
            const top = stack[stack.length - 1];
            top.textContent += m[5];
            continue;
          }
          const isClose = Boolean(m[1]);
          const tag = m[2].toLowerCase();
          const attrStr = m[3] || '';
          const selfClose = Boolean(m[4]) || voidTags.has(tag);
          if (isClose) {
            if (stack.length > 1) stack.pop();
            continue;
          }
          const node = makeElement(tag);
          for (const [k, v] of parseAttrs(attrStr)) {
            node.setAttribute(k, v);
          }
          stack[stack.length - 1].appendChild(node);
          if (!selfClose) stack.push(node);
        }
      },
    });

    return el;
  };

  const docEl = makeElement('html');
  const headEl = makeElement('head');
  const bodyEl = makeElement('body');
  docEl.appendChild(headEl);
  docEl.appendChild(bodyEl);

  const docListeners = new Map();
  const mockDocument = {
    readyState: 'complete',
    hidden: false,
    head: headEl,
    body: bodyEl,
    documentElement: docEl,
    activeElement: bodyEl,
    createElement: (tag) => makeElement(tag),
    createDocumentFragment: () => makeElement('fragment'),
    getElementById: (id) => collectDescendants(docEl, `#${id}`)[0] || null,
    querySelector: (selector) => collectDescendants(docEl, selector)[0] || null,
    querySelectorAll: (selector) => collectDescendants(docEl, selector),
    addEventListener: (type, fn, opts) => {
      const capture = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push({ fn, capture });
    },
    removeEventListener: (type, fn) => {
      const list = docListeners.get(type);
      if (list) docListeners.set(type, list.filter((l) => l.fn !== fn));
    },
  };

  return { makeElement, mockDocument };
}

test('Hero spotlight handles horizontal touch swipes without triggering on vertical scroll or taps, and suppresses synthetic clicks after swipe', async () => {
  const prismJs = fs.readFileSync(
    path.join(rootDir, 'plugin', 'Jellyfin.Plugin.Prism', 'Web', 'prism.js'),
    'utf8'
  );
  const { makeElement, mockDocument } = createMiniDom();

  const pageEl = makeElement('div');
  pageEl.className = 'page';
  const sectionsEl = makeElement('div');
  sectionsEl.className = 'homeSectionsContainer';
  pageEl.appendChild(sectionsEl);
  mockDocument.body.appendChild(pageEl);

  let nowMs = 1700000000000;
  class FakeDate extends Date {
    static now() {
      return nowMs;
    }
  }

  const navigated = [];
  const heroItems = [
    { Id: 'item1', Name: 'First Movie', Overview: 'Plot 1', HasBackdrop: true, BackdropCount: 1 },
    { Id: 'item2', Name: 'Second Movie', Overview: 'Plot 2', HasBackdrop: true, BackdropCount: 1 },
    { Id: 'item3', Name: 'Third Movie', Overview: 'Plot 3', HasBackdrop: true, BackdropCount: 1 },
  ];

  const mockWindow = {
    location: { hash: '#/home', pathname: '/web/' },
    innerWidth: 390,
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
    Emby: {
      Page: {
        show: (target) => navigated.push(target),
      },
    },
    ApiClient: {
      getCurrentUserId: () => 'user1',
      getUrl: (rel) => `/${rel}`,
      getJSON: (url) => {
        if (url.includes('HomeSections')) {
          return Promise.resolve({
            CacheVersion: 'v1',
            DiscoveryAvailable: false,
            HeroItems: heroItems,
            Sections: [],
          });
        }
        return Promise.resolve({ Ids: [] });
      },
    },
    document: mockDocument,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    fetch: () => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        enablePlugin: true,
        enableHeroSpotlight: true,
        enableWatchlist: true,
        enableHomeSections: false,
        enableInfiniteDiscovery: false,
      }),
    }),
  };

  const sandbox = {
    window: mockWindow,
    document: mockDocument,
    MutationObserver: mockWindow.MutationObserver,
    fetch: mockWindow.fetch,
    Image: class {},
    Promise,
    Date: FakeDate,
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

  vm.runInContext(prismJs, vm.createContext(sandbox));
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  const hero = mockDocument.getElementById('slides-container');
  assert.ok(hero, 'Expected #slides-container to be rendered');

  const getActiveDotIndex = () => {
    const activeDot = hero.querySelector('.dot.active');
    return activeDot ? Number(activeDot.getAttribute('data-slide-idx')) : -1;
  };
  const getTitle = () => hero.querySelector('.prism-hero-title').textContent;

  assert.equal(getActiveDotIndex(), 0);
  assert.equal(getTitle(), 'First Movie');

  const swipe = (points) => {
    const start = points[0];
    hero.dispatchEvent({
      type: 'touchstart',
      cancelable: false,
      touches: [{ clientX: start.x, clientY: start.y }],
    });
    const moveResults = [];
    for (let i = 1; i < points.length - 1; i += 1) {
      nowMs += 30;
      const moveEvt = {
        type: 'touchmove',
        cancelable: true,
        touches: [{ clientX: points[i].x, clientY: points[i].y }],
      };
      hero.dispatchEvent(moveEvt);
      moveResults.push(Boolean(moveEvt.defaultPrevented));
    }
    nowMs += 30;
    const end = points[points.length - 1];
    hero.dispatchEvent({
      type: 'touchend',
      cancelable: true,
      touches: [],
      changedTouches: [{ clientX: end.x, clientY: end.y }],
    });
    return moveResults;
  };

  // Swipe left (dx = -80, dy = 4) -> advances to slide 1
  swipe([{ x: 260, y: 220 }, { x: 220, y: 222 }, { x: 180, y: 224 }, { x: 180, y: 224 }]);
  assert.equal(getActiveDotIndex(), 1);
  assert.equal(getTitle(), 'Second Movie');

  // Synthetic click on Play button immediately after swipe must be suppressed
  const playBtnAfterSwipe = hero.querySelector('.play-button');
  playBtnAfterSwipe.dispatchEvent({ type: 'click', cancelable: true });
  assert.equal(navigated.length, 0);

  // Vertical scroll (dx = 5, dy = -90) -> must keep slide 1 and leave touchmove non-prevented
  const vertPrevented = swipe([{ x: 200, y: 220 }, { x: 202, y: 170 }, { x: 205, y: 130 }, { x: 205, y: 130 }]);
  assert.equal(getActiveDotIndex(), 1);
  assert.equal(getTitle(), 'Second Movie');
  assert.ok(vertPrevented.every((p) => p === false));

  // Swipe right (dx = +80, dy = -3) -> returns to slide 0
  swipe([{ x: 120, y: 220 }, { x: 165, y: 218 }, { x: 200, y: 217 }, { x: 200, y: 217 }]);
  assert.equal(getActiveDotIndex(), 0);
  assert.equal(getTitle(), 'First Movie');

  // Swipe right from slide 0 -> wraps to slide 2
  swipe([{ x: 120, y: 220 }, { x: 165, y: 219 }, { x: 200, y: 218 }, { x: 200, y: 218 }]);
  assert.equal(getActiveDotIndex(), 2);
  assert.equal(getTitle(), 'Third Movie');

  // Short tap (dx = 2, dy = 2) after suppression window expires -> leaves slide unchanged & allows click
  nowMs += 400;
  swipe([{ x: 100, y: 300 }, { x: 102, y: 302 }, { x: 102, y: 302 }]);
  assert.equal(getActiveDotIndex(), 2);
  const playBtnOnSlide2 = hero.querySelector('.play-button');
  playBtnOnSlide2.dispatchEvent({ type: 'click', cancelable: true });
  assert.deepEqual(navigated, ['/details?id=item3']);
});
