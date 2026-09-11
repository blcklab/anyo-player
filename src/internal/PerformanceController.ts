import type { RendererAdapter } from '@blcklab/anyo'
import {
  DEFAULT_OPTIMIZATION,
  DEFAULT_SHADOW_OPTIONS,
  type RendererImageQuality,
  type RendererOptimizationOptions,
  type RendererPostProcessing,
  type RendererShadowOptions,
} from '@blcklab/sekai64/renderer'
import type {
  AnyoPlayerDeviceProfile,
  AnyoPlayerPerformanceChangeEvent,
  AnyoPlayerPerformanceOptions,
  AnyoPlayerPerformanceSnapshot,
  AnyoPlayerQualityPolicy,
  AnyoPlayerQualityPreferenceSnapshot,
  AnyoPlayerQualityPreset,
  AnyoPlayerQualityStorage,
  AnyoPlayerResolvedQualityPreset,
  AnyoPlayerRendererOptions,
} from '../types.js'

export const ANYO_PLAYER_QUALITY_PREFERENCE_FORMAT = '@blcklab/anyo-player/quality-preference' as const
export const ANYO_PLAYER_QUALITY_PREFERENCE_VERSION = 1 as const

interface NativeRendererStats {
  drawCalls: number
  instancedDrawCalls?: number
  instancesRendered?: number
  triangles: number
  visibleObjects: number
  culledObjects: number
  frustumCulledObjects?: number
  occlusionCulledObjects?: number
  pipelineChanges: number
  geometryMemory: number
  textureMemory: number
  shadowDrawCalls?: number
  postProcessPasses?: number
  materialChanges?: number
  textureUploads?: number
  textureEvictions?: number
  geometryEvictions?: number
  cpuFrameMs?: number
  gpuFrameMs?: number | null
  fps?: number
  renderScale?: number
  clusterCount?: number
  clusteredLightReferences?: number
  clusterOverflows?: number
  visibleLights?: number
  rejectedLights?: number
  staticBatches?: number
  renderQueueBuildMs?: number
  shadowPassMs?: number
  postProcessMs?: number
  shaderCompilations?: number
  gpuResourceCreationsThisFrame?: number
  shadowCulledObjects?: number
  streamingQueued?: number
  streamingActive?: number
}

interface NativeRenderer {
  readonly backend: string
  readonly stats: NativeRendererStats
  readonly capabilities?: {
    timestampQueries?: boolean
    advanced?: Readonly<Record<string, boolean>>
  }
  readonly imageQuality: RendererImageQuality
  setImageQuality(options: Partial<RendererImageQuality>): void
  setShadowOptions(options: Partial<RendererShadowOptions>): void
  setPostProcessing(options: Partial<RendererPostProcessing>): void
  setOptimization(options: Partial<RendererOptimizationOptions>): void
}

interface NativeRendererAccess { engine?: { renderer?: NativeRenderer } }
interface NativeRendererAdapter extends RendererAdapter { getNativeAccess?(): NativeRendererAccess | null }

export interface PerformanceControllerDependencies {
  storage?: AnyoPlayerQualityStorage
  rendererOptimization?: Partial<RendererOptimizationOptions>
}

export interface NormalizedPerformanceOptions {
  enabled: boolean
  quality: AnyoPlayerQualityPreset
  resolvedQuality: AnyoPlayerResolvedQualityPreset
  targetFps: number
  dynamicResolution: boolean
  minimumScale: number
  maximumScale: number
  telemetryIntervalMs: number
  adjustmentIntervalMs: number
  sampleWindow: number
  inactiveRenderScale: number
  policy: Readonly<AnyoPlayerQualityPolicy>
  storageKey: string | null
  restoreOnLoad: boolean
  saveOnChange: boolean
}

export interface QualityRendererSettings {
  imageQuality: RendererImageQuality
  shadows: RendererShadowOptions
  postProcessing: RendererPostProcessing
  optimization: RendererOptimizationOptions
}

const QUALITY_ORDER: readonly AnyoPlayerResolvedQualityPreset[] = ['low', 'medium', 'high', 'ultra']

const QUALITY_SETTINGS: Record<AnyoPlayerResolvedQualityPreset, QualityRendererSettings> = {
  low: {
    imageQuality: { renderScale: 0.65, msaaSamples: 1, maxAnisotropy: 2, mipmaps: true, dithering: true, antialiasing: 'fxaa', sharpen: 0 },
    shadows: { ...DEFAULT_SHADOW_OPTIONS, enabled: true, mapSize: 512, bias: 0.0009, normalBias: 0.018, softness: 0.65, cameraPadding: 2, cascades: 1, maxDistance: 45, splitLambda: 0.55, stabilize: true, casterDistance: 55 },
    postProcessing: {
      enabled: true,
      ssao: { enabled: false, mode: 'contact', radius: 0.6, intensity: 0.65, bias: 0.025, samples: 4, halfResolution: true, denoise: false, denoiseRadius: 1, directions: 2 },
      bloom: { enabled: false, threshold: 1.1, strength: 0.08, radius: 0.45, levels: 2, scatter: 0.6, clamp: 4 },
      outlines: { enabled: false, mode: 'screen-space', color: [0.08, 0.065, 0.11], thickness: 1, depthThreshold: 0.012, normalThreshold: 0.28, charactersOnly: true },
    },
    optimization: { ...DEFAULT_OPTIMIZATION, frustumCulling: true, cachedBounds: true, pipelineSorting: true, shadowCasterCulling: true, lodHysteresis: 0.08, hizOcclusion: true, hizResolution: 64, clusteredLighting: true, clusterDimensions: [8, 5, 12], maxLightsPerCluster: 12, staticBatching: true, staticBatchMinInstances: 4, textureMemoryBudgetMB: 128, textureEvictionFrames: 120 },
  },
  medium: {
    imageQuality: { renderScale: 0.8, msaaSamples: 2, maxAnisotropy: 4, mipmaps: true, dithering: true, antialiasing: 'fxaa', sharpen: 0.04 },
    shadows: { ...DEFAULT_SHADOW_OPTIONS, enabled: true, mapSize: 1024, bias: 0.0008, normalBias: 0.016, softness: 0.8, cameraPadding: 2, cascades: 2, maxDistance: 80, splitLambda: 0.6, stabilize: true, casterDistance: 95 },
    postProcessing: {
      enabled: true,
      ssao: { enabled: true, mode: 'gtao', radius: 0.65, intensity: 0.65, bias: 0.02, samples: 6, halfResolution: true, denoise: true, denoiseRadius: 1.5, directions: 3 },
      bloom: { enabled: true, threshold: 1.05, strength: 0.08, radius: 0.5, levels: 3, scatter: 0.65, clamp: 6 },
      outlines: { enabled: true, mode: 'hybrid', color: [0.08, 0.065, 0.11], thickness: 1, depthThreshold: 0.011, normalThreshold: 0.25, charactersOnly: true },
    },
    optimization: { ...DEFAULT_OPTIMIZATION, frustumCulling: true, cachedBounds: true, pipelineSorting: true, shadowCasterCulling: true, lodHysteresis: 0.08, hizOcclusion: true, hizResolution: 96, clusteredLighting: true, clusterDimensions: [12, 7, 16], maxLightsPerCluster: 16, staticBatching: true, staticBatchMinInstances: 3, textureMemoryBudgetMB: 256, textureEvictionFrames: 180 },
  },
  high: {
    imageQuality: { renderScale: 1, msaaSamples: 4, maxAnisotropy: 8, mipmaps: true, dithering: true, antialiasing: 'fxaa', sharpen: 0.08 },
    shadows: { ...DEFAULT_SHADOW_OPTIONS, enabled: true, mapSize: 2048, bias: 0.0007, normalBias: 0.014, softness: 1, cameraPadding: 2, cascades: 3, maxDistance: 135, splitLambda: 0.67, stabilize: true, casterDistance: 155 },
    postProcessing: {
      enabled: true,
      ssao: { enabled: true, mode: 'gtao', radius: 0.72, intensity: 0.78, bias: 0.018, samples: 8, halfResolution: true, denoise: true, denoiseRadius: 2, directions: 4 },
      bloom: { enabled: true, threshold: 1, strength: 0.11, radius: 0.56, levels: 4, scatter: 0.72, clamp: 8 },
      outlines: { enabled: true, mode: 'hybrid', color: [0.08, 0.065, 0.11], thickness: 1.1, depthThreshold: 0.009, normalThreshold: 0.22, charactersOnly: true },
    },
    optimization: { ...DEFAULT_OPTIMIZATION, frustumCulling: true, cachedBounds: true, pipelineSorting: true, shadowCasterCulling: true, lodHysteresis: 0.08, hizOcclusion: true, hizResolution: 128, clusteredLighting: true, clusterDimensions: [16, 9, 24], maxLightsPerCluster: 24, staticBatching: true, staticBatchMinInstances: 3, textureMemoryBudgetMB: 512, textureEvictionFrames: 300 },
  },
  ultra: {
    imageQuality: { renderScale: 1.15, msaaSamples: 4, maxAnisotropy: 16, mipmaps: true, dithering: true, antialiasing: 'fxaa', sharpen: 0.12 },
    shadows: { ...DEFAULT_SHADOW_OPTIONS, enabled: true, mapSize: 4096, bias: 0.0006, normalBias: 0.012, softness: 1.2, cameraPadding: 2, cascades: 4, maxDistance: 210, splitLambda: 0.72, stabilize: true, casterDistance: 235 },
    postProcessing: {
      enabled: true,
      ssao: { enabled: true, mode: 'gtao', radius: 0.8, intensity: 0.9, bias: 0.015, samples: 12, halfResolution: false, denoise: true, denoiseRadius: 2.5, directions: 6 },
      bloom: { enabled: true, threshold: 0.95, strength: 0.14, radius: 0.62, levels: 5, scatter: 0.78, clamp: 12 },
      outlines: { enabled: true, mode: 'hybrid', color: [0.08, 0.065, 0.11], thickness: 1.2, depthThreshold: 0.008, normalThreshold: 0.2, charactersOnly: true },
    },
    optimization: { ...DEFAULT_OPTIMIZATION, frustumCulling: true, cachedBounds: true, pipelineSorting: true, shadowCasterCulling: true, lodHysteresis: 0.08, hizOcclusion: true, hizResolution: 192, clusteredLighting: true, clusterDimensions: [20, 12, 28], maxLightsPerCluster: 32, staticBatching: true, staticBatchMinInstances: 2, textureMemoryBudgetMB: 768, textureEvictionFrames: 420 },
  },
}

function finiteRange(value: number | undefined, fallback: number, minimum: number, maximum: number, name: string): number {
  const resolved = value ?? fallback
  if (!Number.isFinite(resolved) || resolved < minimum || resolved > maximum) throw new TypeError(`${name} must be between ${minimum} and ${maximum}.`)
  return resolved
}

function safeStorage(): AnyoPlayerQualityStorage | undefined {
  try { return typeof globalThis.localStorage === 'undefined' ? undefined : globalThis.localStorage }
  catch { return undefined }
}

function currentNavigator(): (Navigator & { deviceMemory?: number; userAgentData?: { mobile?: boolean }; connection?: { saveData?: boolean; effectiveType?: string } }) | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator as Navigator & { deviceMemory?: number; userAgentData?: { mobile?: boolean }; connection?: { saveData?: boolean; effectiveType?: string } }
}

export function detectDeviceProfile(): AnyoPlayerDeviceProfile {
  const nav = currentNavigator()
  const mobile = nav?.userAgentData?.mobile ?? (nav ? /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent) : false)
  const saveData = nav?.connection?.saveData === true
  const reducedData = saveData || ['slow-2g', '2g'].includes(nav?.connection?.effectiveType ?? '')
  const cores = Math.max(1, nav?.hardwareConcurrency ?? 4)
  const memoryGB = typeof nav?.deviceMemory === 'number' ? nav.deviceMemory : null
  const devicePixelRatio = Math.max(0.5, typeof globalThis.devicePixelRatio === 'number' ? globalThis.devicePixelRatio : 1)
  const touch = (nav?.maxTouchPoints ?? 0) > 0
  return {
    mobile,
    touch,
    cores,
    memoryGB,
    devicePixelRatio,
    saveData,
    reducedData,
    lowPowerHint: saveData || (mobile && (cores <= 4 || (memoryGB !== null && memoryGB <= 4))),
  }
}

function presetIndex(value: AnyoPlayerResolvedQualityPreset): number { return QUALITY_ORDER.indexOf(value) }
function clampPreset(value: AnyoPlayerResolvedQualityPreset, policy: AnyoPlayerQualityPolicy): AnyoPlayerResolvedQualityPreset {
  let index = presetIndex(value)
  if (policy.minimumQuality) index = Math.max(index, presetIndex(policy.minimumQuality))
  if (policy.maximumQuality) index = Math.min(index, presetIndex(policy.maximumQuality))
  return QUALITY_ORDER[Math.max(0, Math.min(QUALITY_ORDER.length - 1, index))] ?? 'high'
}

export function resolveAutomaticQuality(profile = detectDeviceProfile()): AnyoPlayerResolvedQualityPreset {
  if (profile.lowPowerHint || profile.reducedData) return 'low'
  if (profile.mobile || profile.cores <= 4 || (profile.memoryGB !== null && profile.memoryGB <= 4)) return 'medium'
  if (profile.cores >= 12 && (profile.memoryGB === null || profile.memoryGB >= 12)) return 'ultra'
  return 'high'
}

function resolveQuality(quality: AnyoPlayerQualityPreset, policy: AnyoPlayerQualityPolicy, profile: AnyoPlayerDeviceProfile): { requested: AnyoPlayerQualityPreset; resolved: AnyoPlayerResolvedQualityPreset } {
  const requested = policy.forceQuality ?? quality
  const raw = requested === 'auto' ? resolveAutomaticQuality(profile) : requested
  return { requested, resolved: clampPreset(raw, policy) }
}

function normalizePolicy(value: AnyoPlayerQualityPolicy | undefined): Readonly<AnyoPlayerQualityPolicy> {
  const policy = { ...(value ?? {}) }
  if (policy.forceQuality && !['auto', 'low', 'medium', 'high', 'ultra'].includes(policy.forceQuality)) throw new TypeError('performance.policy.forceQuality is invalid.')
  for (const key of ['minimumQuality', 'maximumQuality'] as const) {
    const preset = policy[key]
    if (preset && !QUALITY_ORDER.includes(preset)) throw new TypeError(`performance.policy.${key} is invalid.`)
  }
  if (policy.minimumQuality && policy.maximumQuality && presetIndex(policy.minimumQuality) > presetIndex(policy.maximumQuality)) {
    throw new TypeError('performance.policy.minimumQuality cannot exceed maximumQuality.')
  }
  return Object.freeze(policy)
}

export function normalizePerformanceOptions(value: false | AnyoPlayerPerformanceOptions | undefined): NormalizedPerformanceOptions {
  if (value === false || value === undefined) {
    return { enabled: false, quality: 'auto', resolvedQuality: 'high', targetFps: 60, dynamicResolution: false, minimumScale: 0.6, maximumScale: 1, telemetryIntervalMs: 750, adjustmentIntervalMs: 1800, sampleWindow: 8, inactiveRenderScale: 0.5, policy: Object.freeze({}), storageKey: null, restoreOnLoad: false, saveOnChange: false }
  }
  const profile = detectDeviceProfile()
  const policy = normalizePolicy(value.policy)
  const quality = value.quality ?? 'auto'
  if (!['auto', 'low', 'medium', 'high', 'ultra'].includes(quality)) throw new TypeError('performance.quality must be "auto", "low", "medium", "high", or "ultra".')
  const resolved = resolveQuality(quality, policy, profile)
  const defaultMaximum = QUALITY_SETTINGS[resolved.resolved].imageQuality.renderScale ?? 1
  const policyMinimum = policy.minimumRenderScale ?? 0.35
  const policyMaximum = policy.maximumRenderScale ?? 2
  const minimumScale = finiteRange(value.minimumScale, resolved.resolved === 'low' ? 0.5 : 0.6, Math.max(0.35, policyMinimum), Math.min(2, policyMaximum), 'performance.minimumScale')
  const maximumScale = finiteRange(value.maximumScale, Math.min(defaultMaximum, policyMaximum), minimumScale, Math.min(2, policyMaximum), 'performance.maximumScale')
  const requestedTarget = finiteRange(value.targetFps, profile.mobile ? 45 : 60, 15, 240, 'performance.targetFps')
  const targetFps = Math.min(requestedTarget, policy.maximumTargetFps ?? 240)
  return {
    enabled: true,
    quality: resolved.requested,
    resolvedQuality: resolved.resolved,
    targetFps,
    dynamicResolution: (policy.allowDynamicResolution ?? true) && (value.dynamicResolution ?? true),
    minimumScale,
    maximumScale,
    telemetryIntervalMs: finiteRange(value.telemetryIntervalMs, 750, 250, 10_000, 'performance.telemetryIntervalMs'),
    adjustmentIntervalMs: finiteRange(value.adjustmentIntervalMs, 1800, 500, 30_000, 'performance.adjustmentIntervalMs'),
    sampleWindow: Math.trunc(finiteRange(value.sampleWindow, 8, 3, 120, 'performance.sampleWindow')),
    inactiveRenderScale: finiteRange(value.inactiveRenderScale, 0.5, 0.25, 1, 'performance.inactiveRenderScale'),
    policy,
    storageKey: value.storageKey?.trim() || '@blcklab/anyo-player:quality',
    restoreOnLoad: value.restoreOnLoad === true,
    saveOnChange: value.saveOnChange === true,
  }
}

function mergeNested<T extends object>(base: T | undefined, overlay: T): T { return { ...(base ?? {}), ...overlay } }
function mergeOptional<T extends object>(base: T, overlay: T | undefined): T { return overlay ? { ...base, ...overlay } : { ...base } }

function applyPolicy(settings: QualityRendererSettings, policy: AnyoPlayerQualityPolicy): QualityRendererSettings {
  const result = structuredClone(settings)
  if (policy.maximumRenderScale !== undefined) result.imageQuality.renderScale = Math.min(result.imageQuality.renderScale ?? 1, policy.maximumRenderScale)
  if (policy.maximumAnisotropy !== undefined) result.imageQuality.maxAnisotropy = Math.min(result.imageQuality.maxAnisotropy ?? 1, policy.maximumAnisotropy)
  if (policy.maximumShadowMapSize !== undefined) result.shadows.mapSize = Math.min(result.shadows.mapSize ?? 1024, policy.maximumShadowMapSize)
  if (policy.maximumShadowCascades !== undefined) result.shadows.cascades = Math.min(result.shadows.cascades ?? 1, policy.maximumShadowCascades)
  return result
}

export function qualitySettings(preset: AnyoPlayerResolvedQualityPreset, policy: AnyoPlayerQualityPolicy = {}): QualityRendererSettings {
  return applyPolicy(QUALITY_SETTINGS[preset], policy)
}

export function applyQualityToRendererOptions(renderer: AnyoPlayerRendererOptions, performance: false | AnyoPlayerPerformanceOptions | undefined): AnyoPlayerRendererOptions {
  const normalized = normalizePerformanceOptions(performance)
  if (!normalized.enabled) return renderer
  const settings = qualitySettings(normalized.resolvedQuality, normalized.policy)
  settings.imageQuality.renderScale = Math.min(normalized.maximumScale, Math.max(normalized.minimumScale, settings.imageQuality.renderScale ?? 1))
  return {
    ...renderer,
    imageQuality: mergeNested(settings.imageQuality, renderer.imageQuality ?? {}),
    shadows: mergeNested(settings.shadows, renderer.shadows ?? {}),
    postProcessing: {
      ...settings.postProcessing,
      ...(renderer.postProcessing ?? {}),
      ssao: mergeOptional(settings.postProcessing.ssao, renderer.postProcessing?.ssao),
      bloom: mergeOptional(settings.postProcessing.bloom, renderer.postProcessing?.bloom),
      outlines: mergeOptional(settings.postProcessing.outlines, renderer.postProcessing?.outlines),
    },
    optimization: mergeNested(settings.optimization, renderer.optimization ?? {}),
  }
}

function getNativeRenderer(adapter: RendererAdapter | null): NativeRenderer | null {
  return (adapter as NativeRendererAdapter | null)?.getNativeAccess?.()?.engine?.renderer ?? null
}

function preference(options: NormalizedPerformanceOptions): AnyoPlayerQualityPreferenceSnapshot {
  return { format: ANYO_PLAYER_QUALITY_PREFERENCE_FORMAT, version: ANYO_PLAYER_QUALITY_PREFERENCE_VERSION, quality: options.quality, targetFps: options.targetFps, dynamicResolution: options.dynamicResolution, minimumScale: options.minimumScale, maximumScale: options.maximumScale }
}

function clonePerformanceSnapshot(value: AnyoPlayerPerformanceSnapshot): AnyoPlayerPerformanceSnapshot {
  // Performance snapshots contain scalar telemetry only. A field copy is both
  // faster and safe when a framework has wrapped the source object in a Proxy,
  // which structuredClone() is required to reject.
  return { ...value }
}

function blankSnapshot(options: NormalizedPerformanceOptions, inactive = false): AnyoPlayerPerformanceSnapshot {
  return {
    timestamp: new Date().toISOString(), quality: options.quality, resolvedQuality: options.resolvedQuality, targetFps: options.targetFps, dynamicResolution: options.dynamicResolution,
    backend: null, fps: 0, cpuFrameMs: 0, gpuFrameMs: null, renderScale: 1, drawCalls: 0, shadowDrawCalls: 0, postProcessPasses: 0, triangles: 0,
    visibleObjects: 0, culledObjects: 0, pipelineChanges: 0, materialChanges: 0, textureUploads: 0, geometryMemory: 0, textureMemory: 0,
    occlusionCulledObjects: 0, clusterCount: 0, clusteredLightReferences: 0, staticBatches: 0, textureEvictions: 0, geometryEvictions: 0,
    instancedDrawCalls: 0, renderedInstances: 0, frustumCulledObjects: 0, shadowCulledObjects: 0, clusterOverflows: 0, rejectedLights: 0, acceptedLights: 0,
    queueBuildMs: 0, shadowPassMs: 0, postProcessMs: 0, streamingQueued: 0, streamingActive: 0, shaderCompilations: 0, gpuResourceCreations: 0, inactive,
  }
}

function normalizeStoredPreference(value: unknown): AnyoPlayerQualityPreferenceSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Stored quality preference must be an object.')
  const record = value as Record<string, unknown>
  if (record.format !== ANYO_PLAYER_QUALITY_PREFERENCE_FORMAT || record.version !== ANYO_PLAYER_QUALITY_PREFERENCE_VERSION) throw new TypeError('Unsupported quality preference format or version.')
  const quality = String(record.quality) as AnyoPlayerQualityPreset
  if (!['auto', 'low', 'medium', 'high', 'ultra'].includes(quality)) throw new TypeError('Stored quality preset is invalid.')
  return {
    format: ANYO_PLAYER_QUALITY_PREFERENCE_FORMAT,
    version: ANYO_PLAYER_QUALITY_PREFERENCE_VERSION,
    quality,
    targetFps: finiteRange(Number(record.targetFps), 60, 15, 240, 'quality.targetFps'),
    dynamicResolution: Boolean(record.dynamicResolution),
    minimumScale: finiteRange(Number(record.minimumScale), 0.6, 0.35, 2, 'quality.minimumScale'),
    maximumScale: finiteRange(Number(record.maximumScale), 1, 0.35, 2, 'quality.maximumScale'),
  }
}

export class PerformanceController {
  private options: NormalizedPerformanceOptions
  private renderer: RendererAdapter | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private snapshotValue: AnyoPlayerPerformanceSnapshot
  private lastScaleAdjustment = 0
  private readonly fpsSamples: number[] = []
  private active = true
  private activeScaleBeforeInactive: number | null = null
  private restored = false
  private readonly storage: AnyoPlayerQualityStorage | undefined
  private readonly onChange: ((event: AnyoPlayerPerformanceChangeEvent) => void) | undefined
  private readonly onQualityApplied: ((quality: AnyoPlayerResolvedQualityPreset, renderScale: number) => void) | undefined
  private readonly rendererOptimization: Readonly<Partial<RendererOptimizationOptions>>

  constructor(
    value: false | AnyoPlayerPerformanceOptions | undefined,
    callbacks: { onChange?: (event: AnyoPlayerPerformanceChangeEvent) => void; onQualityApplied?: (quality: AnyoPlayerResolvedQualityPreset, renderScale: number) => void } = {},
    dependencies: PerformanceControllerDependencies = {},
  ) {
    this.options = normalizePerformanceOptions(value)
    this.snapshotValue = blankSnapshot(this.options)
    this.storage = value === false ? undefined : value?.storage ?? dependencies.storage ?? safeStorage()
    this.onChange = callbacks.onChange
    this.onQualityApplied = callbacks.onQualityApplied
    this.rendererOptimization = Object.freeze({ ...(dependencies.rendererOptimization ?? {}) })
  }

  get enabled(): boolean { return this.options.enabled }
  get snapshot(): AnyoPlayerPerformanceSnapshot { return clonePerformanceSnapshot(this.snapshotValue) }
  get quality(): AnyoPlayerQualityPreset { return this.options.quality }
  get preference(): AnyoPlayerQualityPreferenceSnapshot { return preference(this.options) }
  get deviceProfile(): AnyoPlayerDeviceProfile { return detectDeviceProfile() }
  get storageKey(): string | null { return this.options.storageKey }
  get storageAvailable(): boolean { return Boolean(this.storage && this.options.storageKey) }
  get restoreOnLoad(): boolean { return this.options.restoreOnLoad }
  get saveOnChange(): boolean { return this.options.saveOnChange }
  get runtimeOptions(): AnyoPlayerPerformanceOptions | false {
    if (!this.options.enabled) return false
    return { quality: this.options.quality, targetFps: this.options.targetFps, dynamicResolution: this.options.dynamicResolution, minimumScale: this.options.minimumScale, maximumScale: this.options.maximumScale, telemetryIntervalMs: this.options.telemetryIntervalMs, adjustmentIntervalMs: this.options.adjustmentIntervalMs, sampleWindow: this.options.sampleWindow, inactiveRenderScale: this.options.inactiveRenderScale, policy: this.options.policy }
  }

  attach(renderer: RendererAdapter): void {
    this.renderer = renderer
    if (this.options.enabled) this.applyCurrentQuality()
    this.sample()
    this.restartTimer()
  }

  detach(): void {
    this.stopTimer(); this.renderer = null; this.fpsSamples.length = 0; this.activeScaleBeforeInactive = null; this.snapshotValue = blankSnapshot(this.options, !this.active)
  }

  dispose(): void { this.detach() }

  setQuality(preset: AnyoPlayerQualityPreset): AnyoPlayerPerformanceSnapshot {
    if (!['auto', 'low', 'medium', 'high', 'ultra'].includes(preset)) throw new TypeError('quality must be "auto", "low", "medium", "high", or "ultra".')
    const resolved = resolveQuality(preset, this.options.policy, detectDeviceProfile())
    const settings = qualitySettings(resolved.resolved, this.options.policy)
    this.options = { ...this.options, enabled: true, quality: resolved.requested, resolvedQuality: resolved.resolved, maximumScale: Math.max(this.options.minimumScale, Math.min(this.options.policy.maximumRenderScale ?? 2, settings.imageQuality.renderScale ?? 1)) }
    this.fpsSamples.length = 0; this.applyCurrentQuality(); this.restartTimer(); return this.sample()
  }

  setTargetFps(targetFps: number): AnyoPlayerPerformanceSnapshot {
    this.options = { ...this.options, enabled: true, targetFps: Math.min(finiteRange(targetFps, 60, 15, 240, 'targetFps'), this.options.policy.maximumTargetFps ?? 240) }
    return this.sample()
  }

  setDynamicResolution(enabled: boolean): AnyoPlayerPerformanceSnapshot {
    this.options = { ...this.options, enabled: true, dynamicResolution: Boolean(enabled) && (this.options.policy.allowDynamicResolution ?? true) }
    if (!this.options.dynamicResolution) this.applyCurrentQuality()
    return this.sample()
  }

  setActive(active: boolean): void {
    if (this.active === active) return
    this.active = active
    const renderer = getNativeRenderer(this.renderer)
    if (!renderer || !this.options.enabled) return
    if (!active) {
      this.activeScaleBeforeInactive = renderer.imageQuality.renderScale ?? 1
      renderer.setImageQuality({ renderScale: Math.min(this.options.inactiveRenderScale, this.activeScaleBeforeInactive) })
    } else if (this.activeScaleBeforeInactive !== null) {
      renderer.setImageQuality({ renderScale: Math.min(this.options.maximumScale, Math.max(this.options.minimumScale, this.activeScaleBeforeInactive)) })
      this.activeScaleBeforeInactive = null
      this.lastScaleAdjustment = Date.now()
    }
    this.sample()
  }

  async restoreConfigured(): Promise<{ key: string; snapshot: AnyoPlayerQualityPreferenceSnapshot } | null> {
    if (this.restored || !this.options.restoreOnLoad) return null
    this.restored = true
    return this.load()
  }

  async save(key?: string): Promise<{ key: string; snapshot: AnyoPlayerQualityPreferenceSnapshot }> {
    const resolvedKey = this.resolveStorageKey(key)
    const snapshot = this.preference
    await this.requireStorage().setItem(resolvedKey, JSON.stringify(snapshot))
    return { key: resolvedKey, snapshot }
  }

  async load(key?: string): Promise<{ key: string; snapshot: AnyoPlayerQualityPreferenceSnapshot } | null> {
    const resolvedKey = this.resolveStorageKey(key)
    const raw = await this.requireStorage().getItem(resolvedKey)
    if (raw === null) return null
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch (error) { throw new TypeError(`Stored quality preference is invalid JSON: ${String(error)}`) }
    const stored = normalizeStoredPreference(parsed)
    const resolved = resolveQuality(stored.quality, this.options.policy, detectDeviceProfile())
    const minimumScale = Math.max(this.options.policy.minimumRenderScale ?? 0.35, stored.minimumScale)
    const maximumScale = Math.min(this.options.policy.maximumRenderScale ?? 2, Math.max(minimumScale, stored.maximumScale))
    this.options = {
      ...this.options,
      enabled: true,
      quality: resolved.requested,
      resolvedQuality: resolved.resolved,
      targetFps: Math.min(stored.targetFps, this.options.policy.maximumTargetFps ?? 240),
      dynamicResolution: stored.dynamicResolution && (this.options.policy.allowDynamicResolution ?? true),
      minimumScale,
      maximumScale,
    }
    this.applyCurrentQuality(); this.restartTimer(); this.sample()
    return { key: resolvedKey, snapshot: this.preference }
  }

  async clear(key?: string): Promise<string> {
    const resolvedKey = this.resolveStorageKey(key)
    await this.requireStorage().removeItem(resolvedKey)
    return resolvedKey
  }

  sample(): AnyoPlayerPerformanceSnapshot {
    const previous = this.snapshotValue
    const renderer = getNativeRenderer(this.renderer)
    if (!renderer) this.snapshotValue = blankSnapshot(this.options, !this.active)
    else {
      const stats = renderer.stats
      this.snapshotValue = {
        timestamp: new Date().toISOString(), quality: this.options.quality, resolvedQuality: this.options.resolvedQuality, targetFps: this.options.targetFps, dynamicResolution: this.options.dynamicResolution,
        backend: renderer.backend, fps: stats.fps ?? 0, cpuFrameMs: stats.cpuFrameMs ?? 0, gpuFrameMs: stats.gpuFrameMs ?? null, renderScale: stats.renderScale ?? renderer.imageQuality.renderScale ?? 1,
        drawCalls: stats.drawCalls, shadowDrawCalls: stats.shadowDrawCalls ?? 0, postProcessPasses: stats.postProcessPasses ?? 0, triangles: stats.triangles,
        visibleObjects: stats.visibleObjects, culledObjects: stats.culledObjects, pipelineChanges: stats.pipelineChanges, materialChanges: stats.materialChanges ?? 0,
        textureUploads: stats.textureUploads ?? 0, geometryMemory: stats.geometryMemory, textureMemory: stats.textureMemory, occlusionCulledObjects: stats.occlusionCulledObjects ?? 0,
        clusterCount: stats.clusterCount ?? 0, clusteredLightReferences: stats.clusteredLightReferences ?? 0, staticBatches: stats.staticBatches ?? 0, textureEvictions: stats.textureEvictions ?? 0,
        geometryEvictions: stats.geometryEvictions ?? 0, instancedDrawCalls: stats.instancedDrawCalls ?? 0, renderedInstances: stats.instancesRendered ?? 0,
        frustumCulledObjects: stats.frustumCulledObjects ?? 0, shadowCulledObjects: stats.shadowCulledObjects ?? 0, clusterOverflows: stats.clusterOverflows ?? 0,
        rejectedLights: stats.rejectedLights ?? 0, acceptedLights: stats.visibleLights ?? 0, queueBuildMs: stats.renderQueueBuildMs ?? 0, shadowPassMs: stats.shadowPassMs ?? 0,
        postProcessMs: stats.postProcessMs ?? 0, streamingQueued: stats.streamingQueued ?? 0, streamingActive: stats.streamingActive ?? 0,
        shaderCompilations: stats.shaderCompilations ?? 0, gpuResourceCreations: stats.gpuResourceCreationsThisFrame ?? 0, inactive: !this.active,
      }
      this.adjustResolution(renderer)
    }
    this.onChange?.({ previous: clonePerformanceSnapshot(previous), performance: this.snapshot })
    return this.snapshot
  }

  private applyCurrentQuality(): void {
    const renderer = getNativeRenderer(this.renderer)
    if (!renderer || !this.options.enabled) return
    const settings = qualitySettings(this.options.resolvedQuality, this.options.policy)
    settings.imageQuality.renderScale = Math.min(this.options.maximumScale, Math.max(this.options.minimumScale, settings.imageQuality.renderScale ?? 1))
    renderer.setOptimization({ ...settings.optimization, ...this.rendererOptimization }); renderer.setShadowOptions(settings.shadows); renderer.setPostProcessing(settings.postProcessing); renderer.setImageQuality(settings.imageQuality)
    this.lastScaleAdjustment = Date.now(); this.activeScaleBeforeInactive = null
    this.onQualityApplied?.(this.options.resolvedQuality, settings.imageQuality.renderScale ?? 1)
  }

  private adjustResolution(renderer: NativeRenderer): void {
    if (!this.active || !this.options.enabled || !this.options.dynamicResolution) return
    const fps = renderer.stats.fps ?? 0
    if (fps <= 0) return
    this.fpsSamples.push(fps)
    if (this.fpsSamples.length > this.options.sampleWindow) this.fpsSamples.shift()
    if (this.fpsSamples.length < this.options.sampleWindow || Date.now() - this.lastScaleAdjustment < this.options.adjustmentIntervalMs) return
    const sorted = [...this.fpsSamples].sort((a, b) => a - b)
    const lowPercentile = sorted[Math.floor((sorted.length - 1) * 0.25)] ?? fps
    const median = sorted[Math.floor((sorted.length - 1) * 0.5)] ?? fps
    const current = renderer.imageQuality.renderScale ?? 1
    let next = current
    if (lowPercentile < this.options.targetFps - 5) next = Math.max(this.options.minimumScale, current - 0.05)
    else if (median > this.options.targetFps + 7) next = Math.min(this.options.maximumScale, current + 0.025)
    if (Math.abs(next - current) < 0.001) return
    renderer.setImageQuality({ renderScale: Number(next.toFixed(3)) })
    this.lastScaleAdjustment = Date.now(); this.fpsSamples.length = 0
    this.onQualityApplied?.(this.options.resolvedQuality, next)
  }

  private restartTimer(): void {
    this.stopTimer()
    if (!this.renderer || !this.options.enabled || typeof setInterval === 'undefined') return
    this.timer = setInterval(() => this.sample(), this.options.telemetryIntervalMs)
  }

  private stopTimer(): void { if (this.timer !== null) clearInterval(this.timer); this.timer = null }
  private resolveStorageKey(key?: string): string { const resolved = key?.trim() || this.options.storageKey; if (!resolved) throw new TypeError('Quality preference storage requires a non-empty key.'); return resolved }
  private requireStorage(): AnyoPlayerQualityStorage { if (!this.storage) throw new TypeError('Quality preference storage is unavailable.'); return this.storage }
}
