# Prism — Jellyfin Experience Plugin & OLED UI

[![CI](https://github.com/gemcdaniel/jellyfin-plugin-prism/actions/workflows/ci.yml/badge.svg)](https://github.com/gemcdaniel/jellyfin-plugin-prism/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/gemcdaniel/jellyfin-plugin-prism?include_prereleases)](https://github.com/gemcdaniel/jellyfin-plugin-prism/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-00D4FF.svg)](./LICENSE)

**Prism** is a full Jellyfin 12.4+ experience plugin and frontend UI combining a **true-black OLED canvas (`#000000`)** with **Prism Glass** violet-to-cyan accents (`#7C5CFF` → `#00D4FF`), ClearLogo spotlight banners, 3-day rotating discovery & holiday sections, thematic collections, native watchlist sync, infinite library scrolling, and LG WebOS 60fps guardrails.

It is designed around real living-room hardware constraints—including **LG WebOS 60fps performance guardrails** that disable expensive live `backdrop-filter` blurs on TV layouts while keeping frosted glass accents on desktop and mobile.

---

## Client Compatibility

| Client | Support | Notes |
| --- | --- | --- |
| **Jellyfin Web (Desktop)** | Full | Uses frosted glass header/dialogs and hover transitions. |
| **Jellyfin Android (Mobile)** | Full | Uses `.layout-mobile` with `44px` touch targets and horizontal peeking carousels. |
| **Jellyfin WebOS (LG TV)** | Full | Uses `.layout-tv` with high-contrast D-pad focus rings and `backdrop-filter` disabled for 60fps scrolling. |
| **Jellyfin for Android TV** | Collection Sync Only | The official Android TV app is native Kotlin/Android and does not load Web Custom CSS or Web plugins, though the plugin's optional Scheduled Task can sync active seasonal/holiday picks into a native Jellyfin Collection. |

---

## Installation

### Option 1: Prism Jellyfin Plugin (Recommended for Jellyfin 12.4+)
The bundled `.NET 10` plugin ([`plugin/Jellyfin.Plugin.Prism`](./plugin/Jellyfin.Plugin.Prism)) unlocks:
- **Upgraded Hero & Inline Discovery Spotlights**: Full-bleed OLED hero banner with **ClearLogo artwork** (with title fallback), **multi-backdrop cycling**, subtle Ken Burns motion on Desktop/Mobile (disabled on LG WebOS TV & `prefers-reduced-motion`), Watchlist quick-toggle, and **inline Discovery Spotlight banners** interspersed across the feed.
- **New Releases & 3-Day Rotating Dynamic Sections**: **New Release Movies** and **Recently Aired Episodes** (deduplicated per series), **4K & HDR Showcase**, **Critically Acclaimed**, **Quick Watches (<100m)**, **Decade Flashbacks**, **Hidden Gems**, and **Rotating Spotlight Genres** — deterministically rotated every **3 days** so Home stays fresh without shifting on reloads.
- **12-Window Holiday & Seasonal Picks (+ Seasonal TV Episodes)**: Calendar-aware holiday rows year-round (`New Year`, `Awards Season`, `Valentine's`, `St. Patrick's`, `Spring`, `May 4th Sci-Fi`, `Summer Blockbusters`, `Independence Day`, `Back to School`, `Halloween`, `Thanksgiving`, `Christmas`) plus holiday episode specials.
- **Thematic Picks**: 28 curated themes across 5 categories (`Story Origins`, `Core Concepts`, `Crime & Intrigue`, `Tone & Style`, `Settings & Journeys`) built from library tags, metadata, and optional TMDB keywords, with an interactive tile strip and modal browser.
- **Hybrid Infinite Discovery**: Personalized rows (*Because You Watched / Favorited / Watchlisted*, *Watch-History Cast & Directors*, *Popular Genres*, *Studios*, *Top Actors/Directors/Writers*, *Watch Again*) loaded progressively via `IntersectionObserver` on Desktop/Mobile and a focusable **Discover More** button on `.layout-tv`.
- **Optional TMDB Background Polling**: Enter an optional TMDB v3 API Key or v4 Read Access Token under plugin settings to match **Trending**, **Popular/Now Playing**, active **Holiday**, and **Thematic** lists in O(1) via `ProviderIds` via a 12-hour background Scheduled Task (`Refresh Prism TMDB Dynamic & Holiday Feeds`) with zero Home-load blocking.
- **Native Watchlist Integration**: Backed by Jellyfin's `UserData.Likes` (KefinTweaks-compatible), toggleable from Hero, Spotlights, cards, and Detail pages, with **server-side auto-removal when watched** across all Jellyfin clients.
- **Library Infinite Scroll**: Seamless 100-item batch appending on Movies & TV library grids respecting Jellyfin sort, filter, and alpha-picker state (scroll on Desktop/Mobile, **Load More** button on TV).
- **Performance & Stability**: Shared in-memory library index with batch DB queries (`GetPeopleByItems`, `GetUserDataBatch`), debounced event-driven cache busting, client `localStorage` SWR caching, coalesced `rAF` DOM observation, `.backdropContainer` DOM leak pruning, Dashboard Back Button fix, TV Guide scroll fix (`#5705`), and automatic global CSS injection across `/dashboard/*`.
- **Optional Native Holiday Collection Sync**: Scheduled Task (`Sync Prism Seasonal Holiday Collection`) so native Android TV surfaces active seasonal picks.

#### Install or Build Plugin
1. **From GitHub Releases (Prebuilt)**: Download `prism-plugin_vX.Y.Z.zip` (or standalone `Jellyfin.Plugin.Prism.dll`) from the [Releases](https://github.com/gemcdaniel/jellyfin-plugin-prism/releases) page, extract/copy into your Jellyfin server's plugins directory (e.g. `<jellyfin-data>/plugins/Prism/Jellyfin.Plugin.Prism.dll`), and restart Jellyfin.
2. **Or Build from Source**:
   ```bash
   npm run build:plugin
   ```
   Then copy `plugin/Jellyfin.Plugin.Prism/bin/Release/net10.0/Jellyfin.Plugin.Prism.dll` into your Jellyfin plugins directory and restart Jellyfin.
3. *(Recommended)* Clear any pasted CSS from **Dashboard → Branding → Custom CSS** so it isn't loaded twice, then configure toggles under **Dashboard → Plugins → Prism**.

### Option 2: CSS-Only Installation (No Plugin)
1. Open your Jellyfin server **Dashboard → Branding → Custom CSS**.
2. Paste an `@import` pointing to your hosted `dist/prism.min.css`, or copy the contents of [`dist/prism.min.css`](./dist/prism.min.css) directly into the Custom CSS box:

```css
@import url("https://cdn.jsdelivr.net/gh/gemcdaniel/jellyfin-plugin-prism@main/dist/prism.min.css");
```

3. Click **Save** and refresh your client. *(Note: Jellyfin 12.4 isolates `/dashboard/*` from Custom CSS, and dynamic holiday rows + the JS TV Guide scroll helper require the plugin.)*

---

## Customization

All colors, radii, and focus halos are exposed as CSS variables in [`src/tokens.css`](./src/tokens.css). Add overrides **below** your `@import` line in Jellyfin's Custom CSS box:

```css
@import url("https://cdn.jsdelivr.net/gh/gemcdaniel/jellyfin-plugin-prism@main/dist/prism.min.css");

:root {
  /* Example: shift accents to warm amber/coral */
  --prism-accent-1: #FF6B4A;
  --prism-accent-2: #F5A623;
  --prism-focus-ring: #F5A623;
  --prism-focus-glow: rgba(245, 166, 35, 0.45);
}
```

---

## Development & Preview

### Project Structure
- `src/tokens.css` — Color, surface, radius, and ambient radial glow variables
- `src/base.css` — True-black OLED canvas, scrims, header bar, tabs, drawer, buttons, dialogs
- `src/cards.css` — 16:9 Continue Watching & Episode cards, 2:3 poster cards, Thematic tiles & modal, progress bars, badges
- `src/pages.css` — Item Detail view, Video Player OSD, and Login page
- `src/hero.css` — Spotlight banner, ClearLogo, dual-layer crossfade, and inline discovery spotlights across Desktop, TV, and Mobile
- `src/tv.css` — `.layout-tv` 10-foot focus rings, overscan margins, and LG WebOS 60fps guardrails
- `src/mobile.css` — `.layout-mobile` touch hit targets, peeking carousels, and mobile detail layout
- `src/js/` — Modular client runtime bundled into `plugin/Jellyfin.Plugin.Prism/Web/prism.js`
- `dist/prism.css` & `dist/prism.min.css` — Bundled single-file CSS outputs
- `plugin/Jellyfin.Plugin.Prism/` — Jellyfin 12.4 `.NET 10` plugin source (HTML middleware, shared library index, Discovery & Home APIs, TMDB background service, Watchlist auto-remove lifecycle, TV Guide scroll fix, and Collection sync task)
- `preview/index.html` — Offline Jellyfin DOM preview harness (Desktop / TV / Mobile + Home / Detail + Media Bar toggle)

### Build, Lint, Test & Local Preview
```bash
npm run build         # Builds CSS & JS bundles (dist/ + plugin Web/)
npm run lint          # Runs CSS/JS/workflow linter & dotnet format verification
npm test              # Runs frontend node:test suite & .NET xUnit tests
npm run build:plugin  # Builds bundles + compiles Release Jellyfin.Plugin.Prism.dll
```

Open `preview/index.html` directly in your browser (or serve the repository root locally with `npx serve .` / `python3 -m http.server`) to test Desktop, `.layout-tv`, and `.layout-mobile` views interactively.

---

## License

Licensed under the [MIT License](./LICENSE).
