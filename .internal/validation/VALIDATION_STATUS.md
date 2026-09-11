# RC.10 Validation Status

Status as packaged: automated infrastructure is complete; hardware evidence remains gated.

| Milestone | Implementation | Executed in this build environment | Stable evidence |
| --- | --- | --- | --- |
| V1 Vue 3.4/3.5 and React 18/19 | Exact-version CI and runtime fixtures added | Core adapter suite uses local declarations; registry access unavailable | Await CI run with real packages |
| V2 Chrome/Firefox/Safari desktop | Playwright matrix plus real Safari runner added | Chromium available but unusable in the container graphics environment; Firefox/Safari unavailable | Await CI and physical browser reports |
| V3 Android/iOS | Mobile emulation profiles added | Not physical hardware | Await real devices |
| V4 Pointer lock/fullscreen/focus/touch | Gesture and manual evidence controls added | Requires browser user gestures and touch hardware | Await physical reports |
| V5 Remote GLB/PBR | Cross-origin GLB plus five texture-channel fixture added | Fixture integrity covered by Node tests | Await browser matrix evidence |
| V6 WebGL2 loss | `WEBGL_lose_context` flow added | Requires usable browser GPU context | Await browser/physical evidence |
| V7 WebGPU loss | Real `GPUDevice.destroy()` recovery flow added | No usable WebGPU device in this container | Await WebGPU CI/physical evidence |
| V8 Memory/GPU resources | 150-generation CDP profiler added | Playwright browser unavailable locally | Await CI plus physical DevTools profile |
| V9 Physical WebXR | Headset workflow and report row added | No headset attached | Await headset evidence |
| V10 Published CDN | Exact-file verifier added | RC.10 is not published | Await publication and clean-profile run |

`pending` and `blocked` are valid evidence states. They are not passes.
