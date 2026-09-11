# What Anyo Player tests before release

The test suite is organized around behavior a host application can observe rather than private implementation details.

## Fast source checks

```bash
npm run typecheck
npm run typecheck:examples
```

These catch declaration mistakes, invalid examples, and accidental framework coupling before a runtime build begins.

## Runtime and regression tests

```bash
npm test
```

This builds Player and runs the Node test suite. The tests cover loading, cancellation, world replacement, input ownership, touch and gamepad behavior, framework adapters, custom elements, accessibility, recovery, XR state, audio lifecycle, diagnostics, navigation, and package boundaries.

The test names are written as behavior statements so a failing line should answer a useful question: *what user-visible contract stopped working?*

## Package-boundary checks

`npm run check` also verifies that:

- public exports match the declared package surface;
- optional Vue/React peers do not leak into the framework-neutral core;
- CDN/no-build entry points stay valid;
- hardening contracts remain intact;
- validation fixtures are structurally complete;
- the npm tarball contains required public files and does not leak source, tests, dependencies, or `.internal/` maintainer material;
- bundle sizes remain inside their defined budgets.

## Browser and device evidence

The repository includes browser-matrix, Safari, memory, renderer-loss, and physical-evidence tooling. These are release-engineering tools, not a substitute for a real target-device matrix.

Automation may prove that a flow works in Chromium, Firefox, WebKit automation, or emulation. It must not be described as physical iOS, Android, native-GPU, controller, or headset evidence unless that hardware was actually used.

Maintainer procedures and evidence templates are kept under `.internal/validation/` and are not shipped in the npm package.
