# Booking dependency remediation

This change removes findings from the existing booking dependency graph; it does not reuse the Angular site's earlier audit result. Before remediation, the npm audit report contained 101 findings across 34 package names, including 4 critical findings (counts can include multiple advisories for the same package).

Direct changes deliberately retain React 18. React Router 7 preserves the existing declarative BrowserRouter/Routes usage; Zod 4 requires the targeted validation-error property update from `errors` to `issues`; Vitest 4.1.12 removes the affected older mocker/tinypool toolchain; Vite stays on the patched 6.4 branch instead of changing bundlers. JSDOM 26 replaces the older proxy dependency chain. Exact versions and the frozen pnpm lockfile are authoritative. No audit exemptions or lowered assertions are added.

## Removing the unpatched deepmerge dependency

Advisory: https://github.com/advisories/GHSA-gcqx-w48m-w2h4. The upstream deepmerge package has no patched release as of this review. Downgrading to an older version to evade its reported version range would not demonstrate remediation and is not used.

Workbox's official `@rollup/plugin-node-resolve@16.0.3` imports deepmerge solely to clone its constant default configuration before freezing the exported DEFAULTS value. These defaults contain arrays, strings and booleans, with no functions, class instances or caller-supplied values. Both its CommonJS and ES module entrypoints are patched to use the supported Node `structuredClone(defaults)` operation for that clone. The unused import/require is removed. A narrowly scoped pnpm override then removes the now-unused deepmerge dependency from that resolver, rather than hiding or renaming vulnerable code.

Patch: `patches/rollup-plugin-node-resolve-16.0.3.patch`.
Upstream source: https://github.com/rollup/plugins/tree/master/packages/node-resolve.
Upstream license: MIT, https://github.com/rollup/plugins/blob/master/LICENSE.
The reviewed official npm tarball integrity was `sha512-lUYM3UBGuM93CnMPG1YocWu7X802BrNF3jW2zny5gQyLQgRFJhV1Sq0Zi74+dh/6NBx1DxFC4b4GXg9wUCG5Qg==`.

The regression tests exercise both export formats, frozen defaults, independence from custom options, absence of the removed dependency, and an actual Rollup package-resolution/bundling operation. The production build additionally exercises the Workbox pipeline.

The typescript-eslint minimatch override uses the patched 11.x API, preserving its named API used by typescript-estree. Workbox's glob override uses the compatible named glob interface. These overrides are scoped to their consumers, leaving older callers that require a callable legacy minimatch export on their own compatible versions.

## Future updates

When upgrading node-resolve, inspect its clone site and dependency list again. Remove this patch and scoped removal when upstream no longer requires the vulnerable dependency or ships a real fix. Re-run both dependency regression tests, the full production/PWA build, all application tests, and production/full npm audits. A patch that no longer applies is an installation failure, not a reason to skip the patch. Keep full audit JSON with the tested commit's sandbox evidence.

## Direct dependency resolutions changed by the frozen refresh

The original ranges of unrelated direct dependencies remain unchanged. The frozen graph resolved the following compatible minor/patch updates in addition to the explicitly pinned security migrations; React and React DOM remain 18.3.1. These changes require the complete application/browser/PWA regression suite, rather than relying only on a clean audit.

| Package | Before | After |
| --- | --- | --- |
| `@eslint/js` | 9.39.3 | 9.39.5 |
| `@hookform/resolvers` | 3.10.0 | 5.2.2 |
| `@playwright/test` | 1.58.2 | 1.65.0 |
| `@radix-ui/react-accordion` | 1.2.12 | 1.3.1 |
| `@radix-ui/react-alert-dialog` | 1.1.15 | 1.2.1 |
| `@radix-ui/react-aspect-ratio` | 1.1.8 | 1.2.0 |
| `@radix-ui/react-avatar` | 1.1.11 | 1.3.1 |
| `@radix-ui/react-checkbox` | 1.3.3 | 1.4.1 |
| `@radix-ui/react-collapsible` | 1.1.12 | 1.2.1 |
| `@radix-ui/react-context-menu` | 2.2.16 | 2.4.1 |
| `@radix-ui/react-dialog` | 1.1.15 | 1.3.1 |
| `@radix-ui/react-dropdown-menu` | 2.1.16 | 2.2.1 |
| `@radix-ui/react-hover-card` | 1.1.15 | 1.2.1 |
| `@radix-ui/react-label` | 2.1.8 | 2.1.17 |
| `@radix-ui/react-menubar` | 1.1.16 | 1.2.1 |
| `@radix-ui/react-navigation-menu` | 1.2.14 | 1.4.1 |
| `@radix-ui/react-popover` | 1.1.15 | 1.3.1 |
| `@radix-ui/react-progress` | 1.1.8 | 1.2.1 |
| `@radix-ui/react-radio-group` | 1.3.8 | 1.5.1 |
| `@radix-ui/react-scroll-area` | 1.2.10 | 1.4.0 |
| `@radix-ui/react-select` | 2.2.6 | 2.4.1 |
| `@radix-ui/react-separator` | 1.1.8 | 1.2.0 |
| `@radix-ui/react-slider` | 1.3.6 | 1.6.1 |
| `@radix-ui/react-slot` | 1.2.4 | 1.5.0 |
| `@radix-ui/react-switch` | 1.2.6 | 1.4.1 |
| `@radix-ui/react-tabs` | 1.1.13 | 1.2.1 |
| `@radix-ui/react-toast` | 1.2.15 | 1.3.1 |
| `@radix-ui/react-toggle` | 1.1.10 | 1.2.1 |
| `@radix-ui/react-toggle-group` | 1.1.11 | 1.2.1 |
| `@radix-ui/react-tooltip` | 1.2.8 | 1.4.1 |
| `@tailwindcss/typography` | 0.5.19 | 0.5.20 |
| `@tanstack/react-query` | 5.90.21 | 5.106.1 |
| `@testing-library/react` | 16.3.2 | 16.3.3 |
| `@types/node` | 22.19.11 | 22.20.5 |
| `@types/react` | 18.3.28 | 18.3.31 |
| `autoprefixer` | 10.4.24 | 10.6.2 |
| `eslint` | 9.39.3 | 9.39.5 |
| `framer-motion` | 12.34.3 | 12.43.0 |
| `idb` | 8.0.3 | 8.0.4 |
| `input-otp` | 1.4.2 | 1.5.0 |
| `jsdom` | 20.0.3 | 26.1.0 |
| `lovable-tagger` | 1.1.13 | 1.3.5 |
| `postcss` | 8.5.6 | 8.5.32 |
| `react-big-calendar` | 1.19.4 | 1.20.0 |
| `react-day-picker` | 8.10.1 | 8.10.2 |
| `react-hook-form` | 7.71.2 | 7.91.0 |
| `react-router-dom` | 6.30.3 | 7.18.5 |
| `supabase` | 2.76.14 | 2.122.1 |
| `typescript-eslint` | 8.56.1 | 8.72.1 |
| `vite` | 5.4.21 | 6.4.5 |
| `vite-plugin-pwa` | 1.2.0 | 1.3.0 |
| `vitest` | 3.2.4 | 4.1.12 |
| `zod` | 3.25.76 | 4.6.7 |
