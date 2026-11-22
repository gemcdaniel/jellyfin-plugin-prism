# Security Policy

## Supported Versions

Security fixes are applied to the latest `main` branch and latest minor release of `Jellyfin.Plugin.Prism`:

| Version | Supported |
| --- | --- |
| `1.0.x` (latest) | Yes |

## Reporting a Vulnerability

Please **do not** open public GitHub issues for security vulnerabilities.

Instead, report vulnerabilities privately through [GitHub Security Advisories](https://github.com/gemcdaniel/jellyfin-plugin-prism/security/advisories/new) with:

- A clear description of the issue and affected component (plugin API, middleware, client script, etc.)
- Steps or a proof of concept to reproduce
- Impact assessment and any suggested remediation

## Credential & Privacy Practices

- Optional **TMDB API keys / v4 Bearer tokens** configured in `PluginConfiguration.TmdbApiKey` are stored server-side only and are **never** exposed in `/Prism/config` (only a boolean `hasTmdbApiKey` flag is returned to clients).
- Authenticated discovery, watchlist, and media-badge endpoints validate Jellyfin user claims via `[Authorize]`.
