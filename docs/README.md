# Anyo Player documentation

These docs are for people building and shipping applications with `@blcklab/anyo-player`.

If you are just getting started, read the production guide after the root README. It explains the lifecycle decisions that matter once a world leaves a demo and becomes part of a real application.

## Build with Player

- [Production guide](PRODUCTION.md) — loading, cleanup, security, recovery, deployment, and browser expectations
- [Public API](api/API.md) — construction options, state, methods, and adapters
- [Sekai64, animation, and VRM](integrations/SEKAI64_080_BRIDGE.md) — optional renderer integrations
- [Migration to 0.5.0](guides/MIGRATION.md) — what changed and what did not
- [Support policy](guides/SUPPORT.md) — supported engines, frameworks, and browser capability notes

## Understand the release quality

- [Testing](TESTING.md) — the automated layers run before publication and what they do not replace

## Repository-only maintainer material

Release evidence, historical milestone notes, internal architecture notes, and maintainer procedures live in `.internal/` in the source repository. They are intentionally not published to npm so package users get focused production documentation rather than project-history noise.
