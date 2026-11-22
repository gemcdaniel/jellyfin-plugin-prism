import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const opts = {
    version: null,
    repo: 'gemcdaniel/jellyfin-plugin-prism',
    outDir: 'release',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--version' && argv[i + 1]) {
      opts.version = argv[++i];
    } else if (arg === '--repo' && argv[i + 1]) {
      opts.repo = argv[++i];
    } else if (arg === '--out-dir' && argv[i + 1]) {
      opts.outDir = argv[++i];
    }
  }
  return opts;
}

function readCsprojVersion() {
  const csprojPath = path.join(rootDir, 'plugin', 'Jellyfin.Plugin.Prism', 'Jellyfin.Plugin.Prism.csproj');
  const csproj = fs.readFileSync(csprojPath, 'utf8');
  const match = csproj.match(/<Version>([^<]+)<\/Version>/);
  if (!match) {
    throw new Error('Could not parse <Version> from Jellyfin.Plugin.Prism.csproj');
  }
  return match[1].trim();
}

function toFourPartVersion(semver) {
  const base = semver.split('-')[0];
  const parts = base.split('.');
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) {
    throw new Error(`Invalid semantic version "${semver}". Expected X.Y.Z or X.Y.Z-prerelease`);
  }
  return `${base}.0`;
}

function hashFile(filePath, algorithm) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash(algorithm).update(buf).digest('hex');
}

function createZipArchive(zipPath, files) {
  try {
    execFileSync('zip', ['-j', '-q', zipPath, ...files], { stdio: 'pipe' });
    return;
  } catch (zipErr) {
    if (zipErr.code !== 'ENOENT') {
      throw zipErr;
    }
  }

  const pyScript = `
import os, sys, zipfile
zip_path = sys.argv[1]
files = sys.argv[2:]
with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
    for f in files:
        zf.write(f, arcname=os.path.basename(f))
`;
  execFileSync('python3', ['-c', pyScript, zipPath, ...files], { stdio: 'pipe' });
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const rawVersion = (opts.version || readCsprojVersion()).replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(rawVersion)) {
    throw new Error(`Invalid version "${rawVersion}". Expected semver like 1.1.3 or 1.2.0-rc.1`);
  }

  const assemblyVersion = toFourPartVersion(rawVersion);
  const repo = opts.repo;
  const owner = repo.split('/')[0] || 'gemcdaniel';
  const outDir = path.isAbsolute(opts.outDir) ? opts.outDir : path.join(rootDir, opts.outDir);

  const dllSrc = path.join(
    rootDir,
    'plugin',
    'Jellyfin.Plugin.Prism',
    'bin',
    'Release',
    'net10.0',
    'Jellyfin.Plugin.Prism.dll'
  );
  const cssSrc = path.join(rootDir, 'dist', 'prism.css');
  const minCssSrc = path.join(rootDir, 'dist', 'prism.min.css');

  for (const requiredFile of [dllSrc, cssSrc, minCssSrc]) {
    if (!fs.existsSync(requiredFile)) {
      throw new Error(`Required build artifact missing: ${requiredFile}`);
    }
  }

  fs.mkdirSync(outDir, { recursive: true });
  const stagingDir = path.join(outDir, '.staging');
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  const zipName = `prism-plugin_v${rawVersion}.zip`;
  const zipPath = path.join(outDir, zipName);
  const dllDest = path.join(outDir, 'Jellyfin.Plugin.Prism.dll');
  const cssDest = path.join(outDir, 'prism.css');
  const minCssDest = path.join(outDir, 'prism.min.css');

  const stagedDll = path.join(stagingDir, 'Jellyfin.Plugin.Prism.dll');
  const stagedMeta = path.join(stagingDir, 'meta.json');
  const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const changelog = `Release v${rawVersion} — see https://github.com/${repo}/releases/tag/v${rawVersion}`;

  const meta = {
    guid: 'd8a4b2e1-7c3f-4e92-9b14-6f2c8d5a1e03',
    name: 'Prism',
    description: 'True-black OLED UI, ClearLogo spotlights, 3-day rotating discovery & holiday picks, thematic collections, native watchlist, library infinite scroll, and LG WebOS 60fps guardrails.',
    overview:
      'Complete Jellyfin 12.4+ experience plugin featuring a true-black OLED UI, ClearLogo Hero Spotlight, New Releases, Thematic Picks, Personalized Hybrid Discovery, Native Watchlist integration, Library Infinite Scroll, optional TMDB background polling, and LG WebOS 60fps guardrails.',
    owner,
    category: 'General',
    version: assemblyVersion,
    targetAbi: '12.4.0.0',
    timestamp: nowIso,
    changelog,
    status: 'Active',
    autoUpdate: true,
    assemblies: ['Jellyfin.Plugin.Prism.dll'],
  };

  fs.copyFileSync(dllSrc, stagedDll);
  fs.writeFileSync(stagedMeta, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

  fs.rmSync(zipPath, { force: true });
  createZipArchive(zipPath, [stagedDll, stagedMeta]);
  fs.rmSync(stagingDir, { recursive: true, force: true });

  fs.copyFileSync(dllSrc, dllDest);
  fs.copyFileSync(cssSrc, cssDest);
  fs.copyFileSync(minCssSrc, minCssDest);

  const assetNames = [zipName, 'Jellyfin.Plugin.Prism.dll', 'prism.css', 'prism.min.css'];
  const checksumRecords = assetNames.map((name) => {
    const filePath = path.join(outDir, name);
    return {
      name,
      sha256: hashFile(filePath, 'sha256'),
      md5: hashFile(filePath, 'md5').toLowerCase(),
    };
  });

  const shaLines = checksumRecords.map((r) => `${r.sha256}  ${r.name}`);
  const md5Lines = checksumRecords.map((r) => `MD5 (${r.name}) = ${r.md5}`);
  fs.writeFileSync(
    path.join(outDir, 'checksums.txt'),
    `# SHA-256\n${shaLines.join('\n')}\n\n# MD5 (Jellyfin Plugin Manifest)\n${md5Lines.join('\n')}\n`,
    'utf8'
  );

  const zipChecksum = checksumRecords.find((r) => r.name === zipName);
  const manifestEntry = {
    version: assemblyVersion,
    changelog,
    targetAbi: '12.4.0.0',
    sourceUrl: `https://github.com/${repo}/releases/download/v${rawVersion}/${zipName}`,
    checksum: zipChecksum.md5,
    timestamp: nowIso,
  };
  fs.writeFileSync(
    path.join(outDir, 'manifest-entry.json'),
    `${JSON.stringify(manifestEntry, null, 2)}\n`,
    'utf8'
  );

  const notes = [
    `## Installation`,
    '',
    `### Option 1: Official Jellyfin Plugin Repository (Recommended for Jellyfin 12.4+)`,
    `1. In Jellyfin, open **Dashboard → Plugins → Repositories → +** (Add).`,
    `2. Enter Repository Name \`Prism\` and Repository URL:`,
    `   \`https://raw.githubusercontent.com/${repo}/main/manifest.json\``,
    `3. Save, open **Dashboard → Plugins → Catalog**, select **Prism**, click **Install**, and restart Jellyfin.`,
    '',
    `### Option 2: Manual Plugin Package (.zip / .dll)`,
    `1. Download **\`${zipName}\`** (or standalone **\`Jellyfin.Plugin.Prism.dll\`**) from the assets below.`,
    `2. Extract/copy \`Jellyfin.Plugin.Prism.dll\` into your Jellyfin plugins directory (for example \`<jellyfin-data>/plugins/Prism/\`).`,
    `3. Restart Jellyfin, clear any duplicate Custom CSS under **Dashboard → Branding → Custom CSS**, and hard-refresh your browser.`,
    '',
    `### Option 3: CSS-Only (@import via jsDelivr)`,
    '```css',
    `@import url("https://cdn.jsdelivr.net/gh/${repo}@v${rawVersion}/dist/prism.min.css");`,
    '```',
    '',
    '### Checksums',
    '| Artifact | SHA-256 | MD5 |',
    '| --- | --- | --- |',
    ...checksumRecords.map((r) => `| \`${r.name}\` | \`${r.sha256}\` | \`${r.md5}\` |`),
    '',
  ].join('\n');

  fs.writeFileSync(path.join(outDir, 'RELEASE_NOTES.md'), notes, 'utf8');

  console.log(`Packaged release v${rawVersion} artifacts into ${path.relative(rootDir, outDir) || '.'}/`);
}

main();
