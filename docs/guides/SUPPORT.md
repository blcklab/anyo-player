# Support and compatibility

`@blcklab/anyo-player@0.5.0` is a framework-neutral browser runtime. Anyo and Sekai64 remain peer dependencies so applications can control engine upgrades explicitly.

## Engine range

```text
@blcklab/anyo      >=0.10.0-rc.1 <1.0.0
@blcklab/sekai64   >=0.7.0 <0.8.0 || >=0.8.0-0 <0.9.0
```

The release was validated directly with:

```text
@blcklab/anyo      0.10.0-rc.1
@blcklab/sekai64   0.8.0-rc.33
```

## Optional framework peers

Vue and React are optional. The core Player does not import them.

```text
vue        >=3.4.0 <4.0.0
react      >=18.2.0 <20.0.0
react-dom  >=18.2.0 <20.0.0
```

Use `@blcklab/anyo-player/vue` or `@blcklab/anyo-player/react` only in applications that install the matching framework.

## Optional animation and VRM companions

The composition validated for Player `0.5.0` is:

```text
@blcklab/anyo-animation  0.1.2
@blcklab/anyo-avatar     0.2.0
```

These packages remain host-installed. Player does not pull them into every application.

## Browser capability notes

- Pointer lock, fullscreen, audio unlock, and immersive XR can require a browser-approved user gesture.
- WebXR requires a secure context and compatible browser/device support.
- Screenshots require an untainted renderer canvas; cross-origin assets must be served with compatible CORS headers.
- Local persistence may be unavailable or quota-limited in private or embedded contexts; host storage adapters can be supplied where needed.
- WebGL context restoration and WebGPU device recovery ultimately depend on browser and renderer capabilities.

## What automated CI does not claim

The repository contains broad automation across Node, framework versions, browser engines, loss/recovery flows, and memory tooling. Physical-device claims are kept separate.

Real mobile hardware, native GPU behavior, physical gamepads, assistive technologies, and immersive XR headsets should be validated by the application team on the devices it intends to support.

For deployment guidance, see [Production](../PRODUCTION.md).
