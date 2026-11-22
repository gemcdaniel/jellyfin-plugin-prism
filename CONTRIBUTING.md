# Contributing to Prism

Thanks for helping improve **Prism**!

## Prerequisites

- **Node.js 22+** (uses built-in `node:test`, zero external npm runtime dependencies)
- **.NET 10 SDK** (`10.0.x`) targeting Jellyfin `12.4.0`

## Local Development Workflow

1. Edit modular styles in `src/*.css` or modular client scripts in `src/js/*.js`.
2. Rebuild bundled CSS and JS assets:
   ```bash
   npm run build
   ```
   > **Note:** Both `dist/` (`prism.css`, `prism.min.css`) and `plugin/Jellyfin.Plugin.Prism/Web/` (`prism.min.css`, `prism.js`) are committed in git so jsDelivr Custom CSS `@import` links and standalone `dotnet build` work out of the box. CI checks that built artifacts stay in sync with `src/`.
3. Build the `.NET 10` plugin in Release mode:
   ```bash
   npm run build:plugin
   ```
4. Run all linters and unit tests before opening a PR:
   ```bash
   npm run lint
   npm test
   ```
   To auto-fix C# formatting issues:
   ```bash
   dotnet format Prism.sln
   ```

## LG WebOS & Performance Guardrails

Prism targets smooth **60fps** rendering across Desktop, Android Mobile, and LG WebOS `.layout-tv` hardware:

- **Never re-enable `backdrop-filter` in `.layout-tv`**: Always keep `backdrop-filter: none !important` and disable CSS Ken Burns animations for `.layout-tv` and `prefers-reduced-motion`.
- **Keep desktop hamburger overrides scoped**: Never force `.prism-hamburger-active` on `.layout-tv` or `/dashboard/*`, and scope desktop toolbar padding overrides to the primary `AppToolbar` rather than secondary library toolbars.
- **Avoid N+1 server queries or unthrottled DOM observers**: Batch metadata lookups and coalesce `MutationObserver` callbacks.

## Releasing

Releases are automated by `.github/workflows/release.yml`:

1. Update `<Version>` in `plugin/Jellyfin.Plugin.Prism/Jellyfin.Plugin.Prism.csproj` (e.g. `1.1.0`), rebuild (`npm run build`), and commit on `main`.
2. Create and push a matching annotated git tag:
   ```bash
   git tag -a v1.1.0 -m "Release v1.1.0"
   git push origin v1.1.0
   ```
   GitHub Actions validates the tag against `<Version>`, runs `npm run lint` and `npm test`, packages `prism-plugin_v1.1.0.zip` + standalone assets, generates checksums, publishes the GitHub Release, and (for non-prerelease tags) automatically updates `manifest.json` on `main` so Jellyfin servers pick up the update.
