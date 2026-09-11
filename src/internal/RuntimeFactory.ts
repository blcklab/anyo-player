import {
  createWorld,
  entitiesPlugin,
  explorableBuildingPreset,
  xrExplorationPlugin,
  type RendererAdapter,
  type World,
  type WorldPlugin,
  type WorldSystem,
  type RuntimeSystemsOptions,
} from '@blcklab/anyo'
import { Sekai64Renderer } from '@blcklab/anyo/renderer-sekai64'
import {
  webSurfacePlugin,
  type WebSurfacePluginOptions,
} from '@blcklab/anyo/web-surface'
import type {
  AnyoPlayerComponentOptions,
  AnyoPlayerExplorationOptions,
  AnyoPlayerRendererOptions,
  AnyoPlayerPerformanceOptions,
  AnyoPlayerCameraMode,
  AnyoPlayerFallRecoveryStatus,
} from '../types.js'
import type { WorldValidationOptions } from '@blcklab/anyo'
import { PlayerCameraController } from './PlayerCameraController.js'
import { applyQualityToRendererOptions } from './PerformanceController.js'

export interface PlayerRuntime {
  world: World
  renderer: RendererAdapter
  camera?: PlayerCameraController
}

export interface RuntimeFactoryOptions {
  canvas: HTMLCanvasElement
  renderer: AnyoPlayerRendererOptions
  performance: false | AnyoPlayerPerformanceOptions | undefined
  exploration: AnyoPlayerExplorationOptions
  webSurface: false | WebSurfacePluginOptions
  components?: AnyoPlayerComponentOptions
  plugins: readonly WorldPlugin[]
  systems?: readonly WorldSystem[]
  systemOptions?: RuntimeSystemsOptions
  validation?: WorldValidationOptions
  onWarning: (message: string) => void
  onCameraModeChange?: (previous: AnyoPlayerCameraMode, mode: AnyoPlayerCameraMode) => void
  onFallRecoveryChange?: (status: AnyoPlayerFallRecoveryStatus) => void
}

export interface PlayerRuntimeFactory {
  create(options: RuntimeFactoryOptions): PlayerRuntime
}

export interface RuntimePlan {
  backend: 'auto' | 'webgpu' | 'webgl2'
  desktopExploration: false | {
    browserInput: false
    pointerLock?: boolean
    lookSensitivity?: number
  }
  xrEnabled: boolean
}

export function createRuntimePlan(
  renderer: AnyoPlayerRendererOptions,
  exploration: AnyoPlayerExplorationOptions,
  onWarning: (message: string) => void,
): RuntimePlan {
  const requestedBackend = renderer.backend ?? 'auto'
  const vrEnabled = exploration.vr === true || typeof exploration.vr === 'object'
  const backend = vrEnabled ? 'webgl2' : requestedBackend
  if (vrEnabled && requestedBackend === 'webgpu') {
    onWarning('VR is enabled, so Anyo Player selected Sekai64 WebGL2 instead of WebGPU for the current XR backend.')
  }
  return {
    backend,
    desktopExploration: exploration.desktop === false && exploration.touch === false
      ? false
      : {
          browserInput: false,
          ...(exploration.pointerLock === undefined ? {} : { pointerLock: exploration.pointerLock }),
          ...(exploration.lookSensitivity === undefined ? {} : { lookSensitivity: exploration.lookSensitivity }),
        },
    xrEnabled: vrEnabled,
  }
}

function createPlugins(
  plan: RuntimePlan,
  exploration: AnyoPlayerExplorationOptions,
  webSurface: false | WebSurfacePluginOptions,
  hostPlugins: readonly WorldPlugin[],
  camera: PlayerCameraController,
  components?: AnyoPlayerComponentOptions,
): WorldPlugin[] {
  const plugins = explorableBuildingPreset({ exploration: false })
  if (plan.desktopExploration) plugins.push(camera.plugin)
  if (components?.registry || components?.unknown) {
    const entityPluginIndex = plugins.findIndex(plugin => plugin.name === 'anyo:entities')
    const configuredEntityPlugin = entitiesPlugin({
      ...(components.registry ? { componentRegistry: components.registry } : {}),
      ...(components.unknown ? { unknownComponents: components.unknown } : {}),
    })
    if (entityPluginIndex >= 0) plugins.splice(entityPluginIndex, 1, configuredEntityPlugin)
    else plugins.push(configuredEntityPlugin)
  }
  if (plan.xrEnabled) plugins.push(xrExplorationPlugin(exploration.xr))
  if (webSurface !== false) plugins.push(webSurfacePlugin(webSurface))
  plugins.push(...hostPlugins)
  return plugins
}

export class DefaultRuntimeFactory implements PlayerRuntimeFactory {
  create(options: RuntimeFactoryOptions): PlayerRuntime {
    const rendererOptions = applyQualityToRendererOptions(options.renderer, options.performance)
    const plan = createRuntimePlan(rendererOptions, options.exploration, options.onWarning)
    const camera = new PlayerCameraController(
      plan.desktopExploration || { browserInput: false },
      options.exploration.fallRecovery === false ? false : (options.exploration.fallRecovery ?? {}),
      {
        ...(options.onCameraModeChange ? { onModeChange: options.onCameraModeChange } : {}),
        ...(options.onFallRecoveryChange ? { onRecoveryChange: options.onFallRecoveryChange } : {}),
      },
    )

    const renderer = new Sekai64Renderer({
      canvas: options.canvas,
      backend: plan.backend,
      ...(rendererOptions.antialias === undefined ? {} : { antialias: rendererOptions.antialias }),
      ...(rendererOptions.alpha === undefined ? {} : { alpha: rendererOptions.alpha }),
      ...(rendererOptions.pixelRatio === undefined ? {} : { pixelRatio: rendererOptions.pixelRatio }),
      ...(rendererOptions.maxPixelRatio === undefined ? {} : { maxPixelRatio: rendererOptions.maxPixelRatio }),
      ...(rendererOptions.fieldOfView === undefined ? {} : { fieldOfView: rendererOptions.fieldOfView }),
      ...(rendererOptions.near === undefined ? {} : { near: rendererOptions.near }),
      ...(rendererOptions.far === undefined ? {} : { far: rendererOptions.far }),
      ...(rendererOptions.development === undefined ? {} : { development: rendererOptions.development }),
      ...(rendererOptions.maxPointLights === undefined ? {} : { maxPointLights: rendererOptions.maxPointLights }),
      ...(rendererOptions.colorManagement === undefined ? {} : { colorManagement: rendererOptions.colorManagement }),
      ...(rendererOptions.environmentLighting === undefined ? {} : { environmentLighting: rendererOptions.environmentLighting }),
      ...(rendererOptions.shadows === undefined ? {} : { shadows: rendererOptions.shadows }),
      ...(rendererOptions.imageQuality === undefined ? {} : { imageQuality: rendererOptions.imageQuality }),
      ...(rendererOptions.atmosphere === undefined ? {} : { atmosphere: rendererOptions.atmosphere }),
      ...(rendererOptions.colorGrading === undefined ? {} : { colorGrading: rendererOptions.colorGrading }),
      ...(rendererOptions.postProcessing === undefined ? {} : { postProcessing: rendererOptions.postProcessing }),
      ...(rendererOptions.optimization === undefined ? {} : { optimization: rendererOptions.optimization }),
      ...(rendererOptions.entityGeometry === undefined ? {} : { entityGeometry: rendererOptions.entityGeometry }),
      ...(rendererOptions.assetConcurrency === undefined ? {} : { assetConcurrency: rendererOptions.assetConcurrency }),
      ...(rendererOptions.assetLoaders === undefined ? {} : { assetLoaders: rendererOptions.assetLoaders }),
      ...(rendererOptions.modules === undefined ? {} : { modules: rendererOptions.modules }),
    })

    const world = createWorld({
      renderer,
      plugins: createPlugins(plan, options.exploration, options.webSurface, options.plugins, camera, options.components),
      systems: [...(options.systems ?? [])],
      ...(options.systemOptions === undefined ? {} : { systemOptions: options.systemOptions }),
      autoResize: false,
      ...(options.validation === undefined ? {} : { validation: options.validation }),
      onWarning: options.onWarning,
    })
    world.exploration.setInputEnabled(false)
    return { world, renderer, camera }
  }
}
