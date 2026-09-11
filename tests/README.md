# Reading the test suite

Tests are named after observable Player behavior. A failure should describe the contract that changed rather than an old project milestone.

The files are grouped broadly by responsibility:

- lifecycle and world replacement;
- loading and source resolution;
- desktop, touch, gamepad, and XR input;
- accessibility and Player UI;
- renderer recovery, diagnostics, performance, and long-running ownership;
- custom element, Vue, and React adapters;
- optional audio, VFX, map, Web Surface, and interaction bridges;
- package exports, boundaries, and validation fixtures.

Some filenames such as `track-d-runtime.test.mjs` and `track-f-production.test.mjs` are retained for repository/history compatibility. Their individual test names use production behavior language instead of milestone labels.
