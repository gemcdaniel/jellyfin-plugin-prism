## Summary

<!-- Describe what this PR changes and why. -->

## Type of Change

- [ ] Bug fix
- [ ] New feature / discovery enhancement
- [ ] CSS / layout adjustment
- [ ] Build / CI / documentation

## Checklist

- [ ] Rebuilt CSS & JS bundles (`npm run build`) if files under `src/` changed
- [ ] `npm run lint` passes with 0 errors
- [ ] `npm test` passes (frontend `node --test` and `.NET 10` xUnit suite)
- [ ] `dotnet build Prism.sln -c Release -warnaserror` succeeds with 0 warnings
- [ ] Preserved LG WebOS `.layout-tv` guardrails (`backdrop-filter: none !important`, no Ken Burns animation, native TV top nav)
