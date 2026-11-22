import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const PRISM_GUID = 'd8a4b2e1-7c3f-4e92-9b14-6f2c8d5a1e03';

export function parseVersionParts(version) {
  const str = String(version || '').trim();
  const match = str.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Invalid 4-part version "${str}". Expected format X.Y.Z.W (e.g. 1.0.0.0)`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
}

export function compareVersionsDesc(a, b) {
  const pa = parseVersionParts(a?.version);
  const pb = parseVersionParts(b?.version);
  for (let i = 0; i < 4; i += 1) {
    if (pb[i] !== pa[i]) {
      return pb[i] - pa[i];
    }
  }
  return 0;
}

function buildDefaultPackage(repo, imageUrl) {
  const effectiveRepo = repo || 'gemcdaniel/jellyfin-plugin-prism';
  const owner = effectiveRepo.split('/')[0] || 'gemcdaniel';
  return {
    guid: PRISM_GUID,
    name: 'Prism',
    description:
      'True-black OLED UI, ClearLogo spotlights, 3-day rotating discovery & holiday picks, thematic collections, native watchlist, library infinite scroll, and LG WebOS 60fps guardrails.',
    overview:
      'Complete Jellyfin 12.4+ experience plugin featuring a true-black OLED UI, ClearLogo Hero Spotlight, New Releases, Thematic Picks, Personalized Hybrid Discovery, Native Watchlist integration, Library Infinite Scroll, optional TMDB background polling, and LG WebOS 60fps guardrails.',
    owner,
    category: 'General',
    imageUrl: imageUrl || `https://raw.githubusercontent.com/${effectiveRepo}/main/assets/logo.png`,
    versions: [],
  };
}

function normalizeAndValidateVersionEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('Version entry must be an object');
  }

  const version = String(entry.version || '').trim();
  parseVersionParts(version);

  const targetAbi = String(entry.targetAbi || '12.4.0.0').trim();
  parseVersionParts(targetAbi);

  const sourceUrl = String(entry.sourceUrl || '').trim();
  if (!/^https?:\/\/.+\.zip$/i.test(sourceUrl)) {
    throw new Error(`Invalid sourceUrl "${sourceUrl}". Expected an HTTP(S) URL ending in .zip`);
  }

  const rawChecksum = String(entry.checksum || '').trim();
  if (!/^[0-9a-f]{32}$/i.test(rawChecksum)) {
    throw new Error(`Invalid MD5 checksum "${rawChecksum}". Expected a 32-character hexadecimal string`);
  }

  const timestamp = String(entry.timestamp || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')).trim();
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`Invalid timestamp "${timestamp}"`);
  }

  const changelog = String(entry.changelog || `Release ${version}`).trim();

  return {
    version,
    changelog,
    targetAbi,
    sourceUrl,
    checksum: rawChecksum.toLowerCase(),
    timestamp,
  };
}

export function mergeManifestVersion(existingManifest, versionEntry, options = {}) {
  const repo = options.repo || 'gemcdaniel/jellyfin-plugin-prism';
  const imageUrl = options.imageUrl || `https://raw.githubusercontent.com/${repo}/main/assets/logo.png`;
  const normalizedEntry = normalizeAndValidateVersionEntry(versionEntry);

  const manifest = Array.isArray(existingManifest)
    ? existingManifest.map((pkg) => ({
        ...pkg,
        versions: Array.isArray(pkg.versions) ? pkg.versions.map((v) => ({ ...v })) : [],
      }))
    : [];

  let targetPkg = manifest.find(
    (pkg) => pkg && String(pkg.guid || '').toLowerCase() === PRISM_GUID.toLowerCase()
  );

  if (!targetPkg) {
    targetPkg = buildDefaultPackage(repo, imageUrl);
    manifest.push(targetPkg);
  } else {
    targetPkg.imageUrl = imageUrl;
    if (!targetPkg.owner) {
      targetPkg.owner = repo.split('/')[0] || 'gemcdaniel';
    }
  }

  const filteredVersions = targetPkg.versions.filter(
    (v) => String(v?.version || '').trim() !== normalizedEntry.version
  );
  filteredVersions.push(normalizedEntry);
  filteredVersions.sort(compareVersionsDesc);
  targetPkg.versions = filteredVersions;

  return manifest;
}

export function updateManifestFile(manifestPath, versionEntry, options = {}) {
  let existing = [];
  if (fs.existsSync(manifestPath)) {
    const raw = fs.readFileSync(manifestPath, 'utf8').trim();
    if (raw) {
      existing = JSON.parse(raw);
      if (!Array.isArray(existing)) {
        throw new Error(`Expected JSON array in ${manifestPath}`);
      }
    }
  }

  const updated = mergeManifestVersion(existing, versionEntry, options);
  fs.mkdirSync(path.dirname(path.resolve(manifestPath)), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  return updated;
}

function parseCliArgs(argv) {
  const opts = {
    manifest: path.join(rootDir, 'manifest.json'),
    entry: null,
    repo: 'gemcdaniel/jellyfin-plugin-prism',
    imageUrl: null,
    version: null,
    checksum: null,
    sourceUrl: null,
    targetAbi: null,
    timestamp: null,
    changelog: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--manifest' && argv[i + 1]) {
      const val = argv[++i];
      opts.manifest = path.isAbsolute(val) ? val : path.resolve(rootDir, val);
    } else if (arg === '--entry' && argv[i + 1]) {
      const val = argv[++i];
      opts.entry = path.isAbsolute(val) ? val : path.resolve(rootDir, val);
    } else if (arg === '--repo' && argv[i + 1]) {
      opts.repo = argv[++i];
    } else if (arg === '--image-url' && argv[i + 1]) {
      opts.imageUrl = argv[++i];
    } else if (arg === '--version' && argv[i + 1]) {
      opts.version = argv[++i];
    } else if (arg === '--checksum' && argv[i + 1]) {
      opts.checksum = argv[++i];
    } else if (arg === '--source-url' && argv[i + 1]) {
      opts.sourceUrl = argv[++i];
    } else if (arg === '--target-abi' && argv[i + 1]) {
      opts.targetAbi = argv[++i];
    } else if (arg === '--timestamp' && argv[i + 1]) {
      opts.timestamp = argv[++i];
    } else if (arg === '--changelog' && argv[i + 1]) {
      opts.changelog = argv[++i];
    }
  }
  return opts;
}

function runCli() {
  const opts = parseCliArgs(process.argv.slice(2));
  let entry = {};

  if (opts.entry) {
    if (!fs.existsSync(opts.entry)) {
      throw new Error(`Manifest entry file not found: ${opts.entry}`);
    }
    entry = JSON.parse(fs.readFileSync(opts.entry, 'utf8'));
  } else {
    const defaultEntryPath = path.join(rootDir, 'release', 'manifest-entry.json');
    if (fs.existsSync(defaultEntryPath) && !opts.version) {
      entry = JSON.parse(fs.readFileSync(defaultEntryPath, 'utf8'));
    }
  }

  if (opts.version) entry.version = opts.version;
  if (opts.checksum) entry.checksum = opts.checksum;
  if (opts.sourceUrl) entry.sourceUrl = opts.sourceUrl;
  if (opts.targetAbi) entry.targetAbi = opts.targetAbi;
  if (opts.timestamp) entry.timestamp = opts.timestamp;
  if (opts.changelog) entry.changelog = opts.changelog;

  const updated = updateManifestFile(opts.manifest, entry, {
    repo: opts.repo,
    imageUrl: opts.imageUrl || undefined,
  });

  const pkg = updated.find((p) => String(p.guid || '').toLowerCase() === PRISM_GUID.toLowerCase());
  const topVer = pkg?.versions?.[0]?.version || 'unknown';
  console.log(
    `Updated ${path.relative(rootDir, opts.manifest) || opts.manifest}: ${pkg?.versions?.length || 0} version(s), latest=${topVer}`
  );
}

if (path.resolve(process.argv[1] || '') === __filename) {
  runCli();
}
