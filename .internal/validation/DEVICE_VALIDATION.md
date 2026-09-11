# Device and Physical Validation Guide

This guide separates automated compatibility evidence from tests that require real browsers, phones, GPUs, or an XR headset. Never promote an emulation result into a physical-device pass.

## Automated commands

```bash
npm run check
npm install --no-save playwright@1.62.0
npx playwright install --with-deps chromium firefox webkit
npm run validation:matrix
npm run validation:memory
```

The matrix writes JSON evidence to `validation-results/`. Playwright WebKit is a WebKit compatibility signal, not a substitute for Safari. Pixel and iPhone profiles are emulation signals, not physical Android/iOS evidence.

## Desktop physical browsers

Run `npm run validation:serve`, open the printed URL in current Chrome, Firefox, and Safari, then execute the automated matrix and user-gesture controls. Record browser version, OS, GPU, backend, console diagnostics, and the exported report.

## Android Chrome and iOS Safari

Expose the validation lab through trusted HTTPS or a local secure setup. Test real touch movement/look, interaction prompts, orientation changes, background/foreground transitions, fullscreen behavior, remote assets, replacement, and disposal. Record the exact phone/tablet model and OS.

## Renderer loss

For WebGL2, run the built-in `WEBGL_lose_context` flow and confirm loss, restoration, and a usable ready state. For WebGPU, run the device-destroy flow and confirm the Sekai64 loss diagnostic plus Player recovery to `ready`. Repeat on at least one real WebGPU-capable GPU.

## Memory and GPU resources

Run the 150-generation profile, then repeat in browser DevTools with allocation sampling and GPU diagnostics. A stable result requires no unbounded canvas, document, listener, decoded-asset, buffer, texture, or pipeline growth across repeated load/replace/dispose cycles.

## Physical WebXR headset

On a physical headset, validate support detection, entry, tracking, controller or gaze interaction, pause/resume, exit, disposal during an active session, and re-entry. Capture headset/browser versions and exported diagnostics.

## Published CDN

After publishing the exact candidate, run:

```bash
npm run validation:cdn:published -- 0.3.0-rc.10
```

Then load the no-build import-map example from a clean browser profile and record network requests, console output, and package URLs.
