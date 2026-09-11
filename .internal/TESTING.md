# Maintainer testing guide

The public explanation of release coverage is `docs/TESTING.md`. This file records the maintainer workflow.

## Before opening a release PR

```bash
npm install
npm run typecheck
npm run typecheck:examples
npm test
npm run check
```

`npm run check` is the source release gate and must pass before tagging.

## CI layers

- `ci.yml` runs Node 22/24, adapter compatibility, browser automation, memory profiling, and Safari automation.
- `track-f-production.yml` is retained as a historical filename, but its UI name is production validation.
- `physical-validation.yml` validates supplied device evidence; it does not manufacture physical evidence.

## Physical evidence

Never convert browser emulation, Playwright WebKit, SwiftShader, or unavailable hardware into a physical pass. Keep unavailable rows pending/blocked and attach the actual evidence when hardware is tested.

## Npm boundary

`verify-package.mjs` must confirm that `.internal/`, `src/`, `tests/`, and `node_modules/` do not enter the tarball. Public docs required by production users must be included.
