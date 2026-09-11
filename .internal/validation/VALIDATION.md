# Player 0.3 Cross-Runtime Validation Candidate

`@blcklab/anyo-player@0.3.0-rc.10` converts the RC.10 evidence lab into an executable cross-runtime matrix. It does not declare unperformed physical tests as passed.

## Local validation lab

```bash
npm install
npm run validation:serve
```

Open the printed URL. Two servers are started so the GLB and five PBR textures are genuinely fetched cross-origin. The lab covers core loading, multi-player isolation, custom elements, replacement, disposal, lifecycle stress, remote assets, WebGL loss, WebGPU device destruction/recovery, memory cycling, pointer lock, fullscreen, touch review, accessibility review, and physical WebXR.

## Automated browser matrix

```bash
npm install --no-save playwright@1.62.0
npx playwright install --with-deps chromium firefox webkit
npm run validation:matrix
npm run validation:memory
```

Reports are written to `validation-results/`. WebKit and mobile emulation results must remain labeled as automation; they do not replace real Safari, Android, or iOS evidence.

## Evidence validation

```bash
npm run validation:check -- ./validation-results/chrome-webgl2.json
npm run validation:strict -- ./validation-results/stable-matrix.json
```

Strict validation fails when any required row is pending, blocked, failed, missing, or lacks evidence. Start from `validation/stable-matrix.template.json` and retain the template unchanged.

## Published CDN verification

```bash
npm run validation:cdn:published -- 0.3.0-rc.10
```

Run this only after publishing the exact candidate, then validate the import-map example from a clean browser profile.

## Stable promotion rule

Player `0.3.0` remains blocked until the exact Vue/React CI rows pass, the desktop and mobile physical matrix is documented, renderer loss and memory evidence are complete, the physical headset flow passes where supported, the CDN package is verified, known limitations are published, and the stable Anyo/Sekai64 pair is revalidated.
