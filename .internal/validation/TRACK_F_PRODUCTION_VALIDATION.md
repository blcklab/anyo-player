# Track F production validation

Track F turns Anyo Player's existing browser and physical validation foundation into a coordinated release gate.

Automated coverage includes:

- package, export, CDN/no-build, and optional-peer boundaries
- Chromium browser smoke without requiring a framework
- Playwright Chromium, Firefox, and WebKit compatibility matrix when available
- WebGL2 context loss/restoration
- WebGPU device loss and Player recovery where available
- remote GLB and PBR texture loading
- repeated load/replace/dispose stress
- CDP heap, DOM-node, and document-count profiling
- Vue 3.4/3.5 and React 18/19 adapters
- quality tiers, dynamic resolution, source loading, cache fallback, captions, and diagnostics

Physical-device evidence remains separate and mandatory for stable releases. WebKit emulation is not physical iOS Safari, and Chromium mobile emulation is not physical Android evidence.
