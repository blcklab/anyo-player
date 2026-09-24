import type {
  ActionHandler,
  ComponentTypeRegistry,
  UnknownComponentPolicy,
  RendererAssetProgress,
  RendererDiagnostic,
  World,
  WorldDocument,
  WorldValidationOptions,
  WorldPlugin,
  WorldSystem,
  RuntimeSystemsOptions,
  RendererXREnterOptions,
  XRExplorationPluginOptions,
  XRInputSnapshot,
  XRSessionState,
} from '@blcklab/anyo'
import type {
  RegisteredWebSurfaceApp,
  WebSurfaceAppRegistry,
  WebSurfaceDiagnostic,
  WebSurfaceExternalUrlPolicy,
} from '@blcklab/anyo/web-surface'
import type { EngineOptions, Node } from '@blcklab/sekai64'
import type { AssetLoaderRegistration } from '@blcklab/sekai64/assets'
import type { RendererModule } from '@blcklab/sekai64/modules'
import type { AnyoPlayerError } from './errors.js'

export type AnyoPlayerState =
  | 'idle'
  | 'loading'
  | 'replacing'
  | 'ready'
  | 'entering'
  | 'running'
  | 'paused'
  | 'vr-entering'
  | 'vr-active'
  | 'vr-exiting'
  | 'error'
  | 'disposing'
  | 'disposed'

export type AnyoPlayerLoadingPhase =
  | 'idle'
  | 'resolving-source'
  | 'creating-runtime'
  | 'loading-world'
  | 'waiting-ready'
  | 'loading-assets'
  | 'replacing-world'
  | 'ready'
  | 'ready-with-warnings'
  | 'error'
  | 'disposing'
  | 'disposed'

export type AnyoPlayerReadyStatus = 'ready' | 'ready-with-warnings'
export type AnyoPlayerPauseReason = 'user' | 'visibility' | 'offscreen'
export type AnyoPlayerInputMode = 'desktop' | 'touch' | 'gamepad'
export type AnyoPlayerVRSupportState = 'disabled' | 'unknown' | 'checking' | 'supported' | 'unsupported' | 'error'
export type AnyoPlayerXRTrackingState = 'unavailable' | 'tracked' | 'lost'
export type AnyoPlayerReducedMotionPreference = boolean | 'system'
export type AnyoPlayerInputModality = 'unknown' | 'keyboard' | 'pointer' | 'touch' | 'gamepad'
export type AnyoPlayerAnnouncementPriority = 'polite' | 'assertive'


export type AnyoPlayerQualityPreset = 'auto' | 'low' | 'medium' | 'high' | 'ultra'
export type AnyoPlayerResolvedQualityPreset = Exclude<AnyoPlayerQualityPreset, 'auto'>

export interface AnyoPlayerQualityStorage {
  getItem(key: string): string | null | Promise<string | null>
  setItem(key: string, value: string): void | Promise<void>
  removeItem(key: string): void | Promise<void>
}

export interface AnyoPlayerQualityPolicy {
  /** Optional hard override owned by the host application. */
  forceQuality?: AnyoPlayerQualityPreset
  /** Highest preset the world/player may select. */
  maximumQuality?: AnyoPlayerResolvedQualityPreset
  /** Lowest preset the world/player may select. */
  minimumQuality?: AnyoPlayerResolvedQualityPreset
  allowDynamicResolution?: boolean
  minimumRenderScale?: number
  maximumRenderScale?: number
  maximumTargetFps?: number
  maximumShadowMapSize?: number
  maximumShadowCascades?: number
  maximumAnisotropy?: number
}

export interface AnyoPlayerDeviceProfile {
  mobile: boolean
  touch: boolean
  cores: number
  memoryGB: number | null
  devicePixelRatio: number
  saveData: boolean
  reducedData: boolean
  lowPowerHint: boolean
}

export interface AnyoPlayerQualityPreferenceSnapshot {
  format: '@blcklab/anyo-player/quality-preference'
  version: 1
  quality: AnyoPlayerQualityPreset
  targetFps: number
  dynamicResolution: boolean
  minimumScale: number
  maximumScale: number
}

export interface AnyoPlayerPerformanceOptions {
  quality?: AnyoPlayerQualityPreset
  targetFps?: number
  dynamicResolution?: boolean
  minimumScale?: number
  maximumScale?: number
  telemetryIntervalMs?: number
  adjustmentIntervalMs?: number
  sampleWindow?: number
  inactiveRenderScale?: number
  policy?: AnyoPlayerQualityPolicy
  storage?: AnyoPlayerQualityStorage
  storageKey?: string
  restoreOnLoad?: boolean
  saveOnChange?: boolean
}

export interface AnyoPlayerPerformanceSnapshot {
  timestamp: string
  quality: AnyoPlayerQualityPreset
  resolvedQuality: AnyoPlayerResolvedQualityPreset
  targetFps: number
  dynamicResolution: boolean
  backend: string | null
  fps: number
  cpuFrameMs: number
  gpuFrameMs: number | null
  renderScale: number
  drawCalls: number
  shadowDrawCalls: number
  postProcessPasses: number
  triangles: number
  visibleObjects: number
  culledObjects: number
  pipelineChanges: number
  materialChanges: number
  textureUploads: number
  geometryMemory: number
  textureMemory: number
  occlusionCulledObjects: number
  clusterCount: number
  clusteredLightReferences: number
  staticBatches: number
  textureEvictions: number
  geometryEvictions: number
  instancedDrawCalls: number
  renderedInstances: number
  frustumCulledObjects: number
  shadowCulledObjects: number
  clusterOverflows: number
  rejectedLights: number
  acceptedLights: number
  queueBuildMs: number
  shadowPassMs: number
  postProcessMs: number
  streamingQueued: number
  streamingActive: number
  shaderCompilations: number
  gpuResourceCreations: number
  inactive: boolean
}

export interface AnyoPlayerPerformanceChangeEvent {
  previous: AnyoPlayerPerformanceSnapshot
  performance: AnyoPlayerPerformanceSnapshot
}

export interface AnyoPlayerQualityPreferenceChangeEvent {
  previous: AnyoPlayerQualityPreferenceSnapshot
  preference: AnyoPlayerQualityPreferenceSnapshot
  source: 'runtime' | 'storage' | 'policy'
}

export interface AnyoPlayerQualityPreferenceSavedEvent {
  key: string
  snapshot: AnyoPlayerQualityPreferenceSnapshot
}

export interface AnyoPlayerQualityPreferenceLoadedEvent {
  key: string
  snapshot: AnyoPlayerQualityPreferenceSnapshot | null
}

export interface AnyoPlayerQualityPreferenceClearedEvent { key: string }


export type AnyoPlayerTelemetryCategory =
  | 'lifecycle'
  | 'renderer'
  | 'recovery'
  | 'input'
  | 'interaction'
  | 'session'
  | 'audio'
  | 'xr'
  | 'host'

export interface AnyoPlayerTelemetryEvent {
  format: '@blcklab/anyo-player/telemetry'
  version: 1
  sequence: number
  name: string
  category: AnyoPlayerTelemetryCategory
  timestamp: string
  state: AnyoPlayerState
  phase: AnyoPlayerLoadingPhase
  details?: Readonly<Record<string, unknown>>
}

export type AnyoPlayerAnalyticsSink = (
  event: AnyoPlayerTelemetryEvent,
) => void | Promise<void>

export interface AnyoPlayerAnalyticsOptions {
  enabled?: boolean
  sink?: AnyoPlayerAnalyticsSink | readonly AnyoPlayerAnalyticsSink[]
  categories?: readonly AnyoPlayerTelemetryCategory[]
  bufferSize?: number
}

export type AnyoPlayerRendererRecoveryState =
  | 'idle'
  | 'scheduled'
  | 'recovering'
  | 'recovered'
  | 'failed'
  | 'canceled'

export interface AnyoPlayerRendererRecoveryOptions {
  enabled?: boolean
  automatic?: boolean
  maxAttempts?: number
  delayMs?: number
  backoff?: number
  restoreSession?: boolean
  /** Optional backend used after repeated WebGPU recovery failure. */
  fallbackBackend?: false | 'auto' | 'webgl2'
  fallbackAfterAttempt?: number
}

export interface AnyoPlayerRendererRecoveryStatus {
  state: AnyoPlayerRendererRecoveryState
  attempt: number
  maxAttempts: number
  automatic: boolean
  diagnosticCode: string | null
  error: AnyoPlayerError | null
}

export interface AnyoPlayerRendererRecoveryChange {
  previous: AnyoPlayerRendererRecoveryStatus
  recovery: AnyoPlayerRendererRecoveryStatus
}

export interface AnyoPlayerDiagnosticOptions {
  historyLimit?: number
}

export interface AnyoPlayerDiagnosticRecord {
  sequence: number
  timestamp: string
  source: 'renderer' | 'player'
  code: string
  message: string
  severity: 'info' | 'warning' | 'error' | 'fatal'
  recoverable: boolean
  diagnostic?: RendererDiagnostic
}

export interface AnyoPlayerDiagnosticRecordedEvent {
  record: AnyoPlayerDiagnosticRecord
}

export interface AnyoPlayerAccessibilityOptions {
  reducedMotion?: AnyoPlayerReducedMotionPreference
  keyboardNavigation?: boolean
  focusManagement?: boolean
  announcements?: boolean
  instructions?: string
  roleDescription?: string
  /** Announces loading, recovery, and world replacement status changes. */
  announceStatusChanges?: boolean
}

export interface AnyoPlayerReducedMotionChange {
  previous: boolean
  reducedMotion: boolean
  preference: AnyoPlayerReducedMotionPreference
}

export interface AnyoPlayerInputModalityChange {
  previous: AnyoPlayerInputModality
  modality: AnyoPlayerInputModality
}

export interface AnyoPlayerAnnouncementOptions {
  priority?: AnyoPlayerAnnouncementPriority
}

export interface AnyoPlayerCaptionOptions {
  speaker?: string
  language?: string
  durationMs?: number
  announce?: boolean
}

export interface AnyoPlayerCaptionState {
  visible: boolean
  text: string
  speaker: string | null
  language: string | null
  startedAt: string | null
  expiresAt: string | null
}

export interface AnyoPlayerCaptionTarget {
  showCaption(caption: AnyoPlayerCaptionState): void
  clearCaption(): void
}

export interface AnyoPlayerCaptionChangeEvent {
  previous: AnyoPlayerCaptionState
  caption: AnyoPlayerCaptionState
}

export type AnyoPlayerInputAction =
  | 'move-forward'
  | 'move-backward'
  | 'move-left'
  | 'move-right'
  | 'look-up'
  | 'look-down'
  | 'look-left'
  | 'look-right'
  | 'run'
  | 'jump'
  | 'interact'
  | 'pause'

export interface AnyoPlayerKeyboardInputBinding {
  device: 'keyboard'
  code: string
}

export interface AnyoPlayerGamepadButtonInputBinding {
  device: 'gamepad-button'
  button: number
}

export interface AnyoPlayerGamepadAxisInputBinding {
  device: 'gamepad-axis'
  axis: number
  direction: -1 | 1
  threshold?: number
}

export type AnyoPlayerInputBinding =
  | AnyoPlayerKeyboardInputBinding
  | AnyoPlayerGamepadButtonInputBinding
  | AnyoPlayerGamepadAxisInputBinding

export type AnyoPlayerInputBindingMap = Record<
  AnyoPlayerInputAction,
  readonly AnyoPlayerInputBinding[]
>

export interface AnyoPlayerInputStorage {
  getItem(key: string): string | null | Promise<string | null>
  setItem(key: string, value: string): void | Promise<void>
  removeItem(key: string): void | Promise<void>
}

export interface AnyoPlayerGamepadOptions {
  enabled?: boolean
  index?: number | 'auto'
  deadZone?: number
  lookSensitivity?: number
}

export interface AnyoPlayerInputBindingsOptions {
  bindings?: Partial<AnyoPlayerInputBindingMap>
  gamepad?: boolean | AnyoPlayerGamepadOptions
  storage?: AnyoPlayerInputStorage
  storageKey?: string
  restoreOnLoad?: boolean
  saveOnChange?: boolean
  keyboardLookSensitivity?: number
}

export interface AnyoPlayerViewStorage {
  getItem(key: string): string | null | Promise<string | null>
  setItem(key: string, value: string): void | Promise<void>
  removeItem(key: string): void | Promise<void>
}

export interface AnyoPlayerViewPreferenceOptions {
  fieldOfView?: number
  pointerLookScale?: number
  touchLookScale?: number
  gamepadLookScale?: number
  invertY?: boolean
  minimumFieldOfView?: number
  maximumFieldOfView?: number
  storage?: AnyoPlayerViewStorage
  storageKey?: string
  restoreOnLoad?: boolean
  saveOnChange?: boolean
}

export interface AnyoPlayerViewPreferenceSnapshot {
  format: '@blcklab/anyo-player/view-preference'
  version: 1
  fieldOfView: number
  pointerLookScale: number
  touchLookScale: number
  gamepadLookScale: number
  invertY: boolean
}

export interface AnyoPlayerViewPreferenceChangeEvent {
  previous: AnyoPlayerViewPreferenceSnapshot
  preference: AnyoPlayerViewPreferenceSnapshot
  source: 'runtime' | 'storage' | 'reset'
}

export interface AnyoPlayerViewPreferenceSavedEvent {
  key: string
  snapshot: AnyoPlayerViewPreferenceSnapshot
}

export interface AnyoPlayerViewPreferenceLoadedEvent {
  key: string
  snapshot: AnyoPlayerViewPreferenceSnapshot | null
}

export interface AnyoPlayerViewPreferenceClearedEvent { key: string }

export interface AnyoPlayerInputBindingsSnapshot {
  format: '@blcklab/anyo-player/input-bindings'
  version: 1
  bindings: AnyoPlayerInputBindingMap
}

export interface AnyoPlayerInputBindingsChangeEvent {
  bindings: AnyoPlayerInputBindingMap
  source: 'runtime' | 'reset' | 'storage'
}

export interface AnyoPlayerInputBindingsSavedEvent {
  key: string
  snapshot: AnyoPlayerInputBindingsSnapshot
}

export interface AnyoPlayerInputBindingsLoadedEvent {
  key: string
  snapshot: AnyoPlayerInputBindingsSnapshot | null
}

export interface AnyoPlayerInputBindingsClearedEvent {
  key: string
}

export interface AnyoPlayerInputActionEvent {
  action: AnyoPlayerInputAction
  value: number
  pressed: boolean
  device: 'keyboard' | 'gamepad'
}

export interface AnyoPlayerGamepadState {
  index: number
  id: string
  mapping: string
  connected: boolean
  timestamp: number
}

export interface AnyoPlayerGamepadChangeEvent {
  gamepads: readonly AnyoPlayerGamepadState[]
  activeGamepad: number | null
}

export interface AnyoPlayerVROptions extends Omit<Partial<RendererXREnterOptions>, 'mode'> {
  mode?: 'immersive-vr'
  checkSupportOnLoad?: boolean
}

export interface AnyoPlayerResizeOptions {
  enabled?: boolean
  pixelRatio?: number | 'device'
  maxPixelRatio?: number
}


export type AnyoPlayerActivationMode = 'manual' | 'immediate' | 'visible'
export type AnyoPlayerPreloadMode = 'none' | 'source' | 'runtime'
export type AnyoPlayerIntersectionState = 'unknown' | 'visible' | 'hidden' | 'unsupported'

export interface AnyoPlayerPosterOptions {
  src: string
  alt?: string
  fit?: 'cover' | 'contain'
  position?: string
  background?: string
  className?: string
  hideWhen?: 'loading' | 'ready' | 'entered'
}

export interface AnyoPlayerEmbeddingOptions {
  activation?: AnyoPlayerActivationMode
  preload?: AnyoPlayerPreloadMode
  poster?: string | AnyoPlayerPosterOptions
  pauseWhenOffscreen?: boolean
  resumeWhenVisible?: boolean
  root?: Element | Document | null
  rootMargin?: string
  threshold?: number | readonly number[]
}

export interface AnyoPlayerActivationChange {
  activated: boolean
}

export interface AnyoPlayerIntersectionChange {
  previous: AnyoPlayerIntersectionState
  state: AnyoPlayerIntersectionState
}

export interface AnyoPlayerPreloadedEvent {
  source: AnyoPlayerSource
  document: WorldDocument
}

export interface AnyoPlayerPosterChange {
  visible: boolean
}


export interface AnyoPlayerWorldRegistrationOptions { replace?: boolean }

export interface AnyoPlayerWorldDefinition {
  source: AnyoPlayerSource
  label?: string
  metadata?: Readonly<Record<string, unknown>>
}

export type AnyoPlayerWorldRegistry = Readonly<Record<
  string,
  AnyoPlayerSource | AnyoPlayerWorldDefinition
>>

export type AnyoPlayerWorldTransitionPresentation = 'none' | 'fade'
export type AnyoPlayerWorldNavigationState =
  | 'idle'
  | 'preparing'
  | 'switching'
  | 'completed'
  | 'canceled'
  | 'failed'

export interface AnyoPlayerWorldTransitionContext {
  fromWorldId: string | null
  toWorldId: string
  source: AnyoPlayerSource
  signal: AbortSignal
}

export interface AnyoPlayerWorldTransitionCompleteContext extends AnyoPlayerWorldTransitionContext {
  world: World
}

export type AnyoPlayerBeforeWorldSwitchHook = (
  context: AnyoPlayerWorldTransitionContext,
) => void | Promise<void>

export type AnyoPlayerAfterWorldSwitchHook = (
  context: AnyoPlayerWorldTransitionCompleteContext,
) => void | Promise<void>

export interface AnyoPlayerWorldTransitionOptions {
  presentation?: AnyoPlayerWorldTransitionPresentation
  minimumDuration?: number
  beforeSwitch?: AnyoPlayerBeforeWorldSwitchHook
  afterSwitch?: AnyoPlayerAfterWorldSwitchHook
}

export interface AnyoPlayerNavigationOptions {
  worlds: AnyoPlayerWorldRegistry
  initialWorld?: string
  transition?: false | AnyoPlayerWorldTransitionOptions
}

export interface AnyoPlayerNavigateOptions {
  force?: boolean
  transition?: false | AnyoPlayerWorldTransitionOptions
}

export interface AnyoPlayerWorldNavigationStatus {
  state: AnyoPlayerWorldNavigationState
  fromWorldId: string | null
  toWorldId: string | null
  error: AnyoPlayerError | null
}

export interface AnyoPlayerWorldNavigationStartEvent {
  fromWorldId: string | null
  toWorldId: string
  source: AnyoPlayerSource
}

export interface AnyoPlayerWorldNavigationChangeEvent {
  previous: AnyoPlayerWorldNavigationStatus
  navigation: AnyoPlayerWorldNavigationStatus
}

export interface AnyoPlayerWorldNavigationCompleteEvent extends AnyoPlayerWorldNavigationStartEvent {
  world: World
}

export interface AnyoPlayerWorldNavigationCanceledEvent extends AnyoPlayerWorldNavigationStartEvent {}

export interface AnyoPlayerWorldNavigationErrorEvent extends AnyoPlayerWorldNavigationStartEvent {
  error: AnyoPlayerError
}

export interface AnyoPlayerWorldPreloadedEvent {
  worldId: string
  source: AnyoPlayerSource
  document: WorldDocument
}

export interface AnyoPlayerVisibilityOptions {
  pauseWhenHidden?: boolean
  resumeWhenVisible?: boolean
  /** Lower render scale while the browser window is unfocused without pausing simulation. */
  reduceWhenUnfocused?: boolean
  unfocusedRenderScale?: number
}

export interface AnyoPlayerFullscreenOptions {
  enabled?: boolean
  target?: 'container' | 'canvas'
}

export interface AnyoPlayerVfxTarget {
  onPause?(): void | Promise<void>
  onResume?(): void | Promise<void>
}

export interface AnyoPlayerMapTarget {
  onPause?(): void | Promise<void>
  onResume?(): void | Promise<void>
  getAttribution?(): string | null
  onAttributionChange?(listener: (text: string | null) => void): () => void
}

export interface AnyoPlayerAudioTarget {
  unlock?(): void | Promise<void>
  setMuted?(muted: boolean): void | Promise<void>
  onPause?(): void | Promise<void>
  onResume?(): void | Promise<void>
}

export interface AnyoPlayerAudioOptions {
  muted?: boolean
  unlockOnEnter?: boolean
  muteOnPause?: boolean
  targets?: readonly AnyoPlayerAudioTarget[]
}

export interface AnyoPlayerAudioState {
  enabled: boolean
  muted: boolean
  unlocked: boolean
  blocked: boolean
  targetCount: number
}

export interface AnyoPlayerAudioChangeEvent extends AnyoPlayerAudioState {
  previousMuted: boolean
  source: 'runtime' | 'pause' | 'resume' | 'target'
}

export interface AnyoPlayerAudioUnlockedEvent extends AnyoPlayerAudioState {}

export interface AnyoPlayerPauseMenuOptions {
  enabled?: boolean
  title?: string
  message?: string
  showResume?: boolean
  showAudio?: boolean
  showFullscreen?: boolean
  showScreenshot?: boolean
}

export type AnyoPlayerScreenshotType = 'image/png' | 'image/jpeg' | 'image/webp'

export interface AnyoPlayerScreenshotOptions {
  type?: AnyoPlayerScreenshotType
  quality?: number
}

export interface AnyoPlayerScreenshotResult {
  blob: Blob
  type: string
  width: number
  height: number
  createdAt: string
}

export interface AnyoPlayerScreenshotCapturedEvent {
  screenshot: AnyoPlayerScreenshotResult
}

export interface AnyoPlayerResizeEvent {
  width: number
  height: number
  pixelRatio: number
}

export type AnyoPlayerRuntimeHealthState = 'healthy' | 'degraded' | 'recovering' | 'failed'

export interface AnyoPlayerRuntimeHealth {
  state: AnyoPlayerRuntimeHealthState
  reasons: readonly string[]
  rendererAvailable: boolean
  worldAvailable: boolean
  assetsReady: boolean
  performanceWithinTarget: boolean
  recoveryActive: boolean
}

export interface AnyoPlayerSourceInfo {
  kind: 'document' | 'json' | 'url' | 'blob' | 'file-map' | 'archive' | 'cache'
  url: string | null
  bytes: number | null
  cache: 'none' | 'hit' | 'miss' | 'stored' | 'fallback'
  integrity: 'not-requested' | 'verified' | 'failed' | 'unavailable'
  migratedFrom: string | null
  documentVersion: string
}

export interface AnyoPlayerDiagnosticBundle {
  format: '@blcklab/anyo-player/diagnostic-bundle'
  version: 1
  createdAt: string
  health: AnyoPlayerRuntimeHealth
  runtime: AnyoPlayerRuntimeReport
  source: AnyoPlayerSourceInfo | null
  documentHash: string | null
  diagnostics: readonly AnyoPlayerDiagnosticRecord[]
  telemetry: readonly AnyoPlayerTelemetryEvent[]
  qualityPreference: AnyoPlayerQualityPreferenceSnapshot
  viewPreference: AnyoPlayerViewPreferenceSnapshot
  inputBindings: AnyoPlayerInputBindingsSnapshot
}

export interface AnyoPlayerRuntimeReport {
  format: '@blcklab/anyo-player/runtime-report'
  version: 1
  createdAt: string
  lifecycle: {
    state: AnyoPlayerState
    phase: AnyoPlayerLoadingPhase
    readyStatus: AnyoPlayerReadyStatus | null
    entered: boolean
    paused: boolean
    pauseReason: AnyoPlayerPauseReason | null
    activated: boolean
  }
  world: {
    loaded: boolean
    documentVersion: string | null
    currentRoom: string | null
    rooms: number
    entities: number
    primitives: number
    materials: number
    colliders: number
    portals: number
    triggers: number
  }
  renderer: {
    name: string | null
    version: string | null
    backend: string | null
    shadows: boolean | null
    atmosphere: boolean | null
    colorGrading: boolean | null
    gpuPostProcessing: boolean | null
    ssao: boolean | null
    bloom: boolean | null
    outlines: boolean | null
    cascadedShadows: boolean | null
    mipmapGeneration: boolean | null
  }
  performance: AnyoPlayerPerformanceSnapshot
  viewport: AnyoPlayerResizeEvent
  input: {
    mode: AnyoPlayerInputMode | null
    modality: AnyoPlayerInputModality
    pointerLocked: boolean
    touchEnabled: boolean
    activeGamepad: number | null
    reducedMotion: boolean
  }
  assets: RendererAssetProgress
  recovery: AnyoPlayerRendererRecoveryStatus
  diagnostics: {
    total: number
    errors: number
    warnings: number
  }
}

export type AnyoPlayerCacheMode = 'network-first' | 'cache-first' | 'offline-first' | 'network-only'

export interface AnyoPlayerWorldCacheEntry {
  key: string
  storedAt: string
  document: WorldDocument
  documentUrl?: string
  integrity?: string
}

export interface AnyoPlayerWorldCache {
  get(key: string): AnyoPlayerWorldCacheEntry | null | Promise<AnyoPlayerWorldCacheEntry | null>
  set(key: string, entry: AnyoPlayerWorldCacheEntry): void | Promise<void>
  delete(key: string): void | Promise<void>
  clear?(): void | Promise<void>
}

export interface AnyoPlayerVirtualFileSystem {
  files: ReadonlyMap<string, Blob | ArrayBuffer | string> | Readonly<Record<string, Blob | ArrayBuffer | string>>
  entry?: string
}

export type AnyoPlayerArchiveDecoder = (
  archive: Blob | ArrayBuffer,
  signal: AbortSignal,
) => Promise<AnyoPlayerVirtualFileSystem>

export interface AnyoPlayerLoadingOptions {
  cache?: false | AnyoPlayerWorldCache
  cacheMode?: AnyoPlayerCacheMode
  migrate?: boolean
  verifyIntegrity?: boolean
  maxDocumentBytes?: number
  archiveDecoder?: AnyoPlayerArchiveDecoder
}

export interface AnyoPlayerUrlSource {
  url: string | URL
  request?: Omit<RequestInit, 'signal'>
  integrity?: string
  cacheKey?: string
}

export interface AnyoPlayerJsonSource {
  json: string
  baseUrl?: string | URL
  integrity?: string
}

export interface AnyoPlayerDocumentSource {
  document: WorldDocument
}

export interface AnyoPlayerBlobSource {
  blob: Blob
  name?: string
  baseUrl?: string | URL
  integrity?: string
}

export interface AnyoPlayerFileMapSource extends AnyoPlayerVirtualFileSystem {
  baseUrl?: string | URL
  integrity?: string
}

export interface AnyoPlayerArchiveSource {
  archive: Blob | ArrayBuffer
  decoder?: AnyoPlayerArchiveDecoder
  entry?: string
  integrity?: string
}

export type AnyoPlayerSource =
  | WorldDocument
  | string
  | URL
  | Blob
  | AnyoPlayerUrlSource
  | AnyoPlayerJsonSource
  | AnyoPlayerDocumentSource
  | AnyoPlayerBlobSource
  | AnyoPlayerFileMapSource
  | AnyoPlayerArchiveSource


export interface AnyoPlayerSessionStorage {
  getItem(key: string): string | null | Promise<string | null>
  setItem(key: string, value: string): void | Promise<void>
  removeItem(key: string): void | Promise<void>
}

export interface AnyoPlayerSessionOptions {
  storage?: AnyoPlayerSessionStorage
  storageKey?: string
  worldKey?: string
  dataPaths?: readonly string[]
  includeAllData?: boolean
  restoreOnLoad?: boolean
  saveOnPause?: boolean
  saveOnVisibilityHidden?: boolean
  strictWorldKey?: boolean
  strictDocumentVersion?: boolean
  strictRoom?: boolean
}

export interface AnyoPlayerSessionCaptureOptions {
  dataPaths?: readonly string[]
  includeAllData?: boolean
  metadata?: Record<string, unknown>
}

export interface AnyoPlayerSessionRestoreOptions {
  restoreRuntimeData?: boolean
  restorePauseState?: boolean
  restoreXR?: boolean
  strictWorldKey?: boolean
  strictDocumentVersion?: boolean
  strictRoom?: boolean
}

export interface AnyoPlayerSessionDataEntry {
  path: string
  value: unknown
}

export interface AnyoPlayerSessionSnapshot {
  format: '@blcklab/anyo-player/session'
  version: 1
  createdAt: string
  world: {
    key?: string
    documentVersion: string
    room: string | null
  }
  camera: {
    position: [number, number, number]
    yaw: number
    pitch: number
  }
  xrRig?: {
    position: [number, number, number]
    yaw: number
  }
  data?: AnyoPlayerSessionDataEntry[]
  player: {
    paused: boolean
    pauseReason: AnyoPlayerPauseReason | null
    inputMode: AnyoPlayerInputMode | null
  }
  metadata?: Record<string, unknown>
}

export interface AnyoPlayerSessionCapturedEvent {
  snapshot: AnyoPlayerSessionSnapshot
}

export interface AnyoPlayerSessionSavedEvent {
  key: string
  snapshot: AnyoPlayerSessionSnapshot
}

export interface AnyoPlayerSessionLoadedEvent {
  key: string
  snapshot: AnyoPlayerSessionSnapshot | null
}

export interface AnyoPlayerSessionRestoredEvent {
  snapshot: AnyoPlayerSessionSnapshot
}

export interface AnyoPlayerSessionClearedEvent {
  key: string
}

export interface AnyoPlayerRendererOptions {
  backend?: 'auto' | 'webgpu' | 'webgl2'
  antialias?: boolean
  alpha?: boolean
  pixelRatio?: number
  maxPixelRatio?: number
  fieldOfView?: number
  near?: number
  far?: number
  development?: boolean
  maxPointLights?: number
  /** Shared Sekai64 S1–S7 color output configuration. */
  colorManagement?: EngineOptions['colorManagement']
  /** Lightweight hemisphere/image-based environment contribution. */
  environmentLighting?: EngineOptions['environmentLighting']
  /** Directional shadow-map quality and bias controls. */
  shadows?: EngineOptions['shadows']
  /** Texture filtering and output dithering controls. */
  imageQuality?: EngineOptions['imageQuality']
  /** Optional host override for world-authored distance/height atmosphere. */
  atmosphere?: EngineOptions['atmosphere']
  /** Optional host override for world-authored display color grading. */
  colorGrading?: EngineOptions['colorGrading']
  /** GPU post-processing plan: contact AO, bloom, and optional outlines. */
  postProcessing?: EngineOptions['postProcessing']
  /** Renderer-side culling, bounds caching, sorting, and shadow-caster controls. */
  optimization?: EngineOptions['optimization']
  /** Optional beveled geometry for authored entity boxes; structural building boxes stay exact. */
  entityGeometry?: {
    beveledBoxes?: boolean
    bevelRadius?: number
    bevelSegments?: number
  }
  assetConcurrency?: number
  /** Trusted host-installed format loaders, forwarded to the Sekai64 renderer. */
  assetLoaders?: readonly AssetLoaderRegistration<Node>[]
  /** Optional Sekai64 renderer modules installed with the renderer lifecycle. */
  modules?: readonly RendererModule[]
}

export interface AnyoPlayerDesktopKeyBindings {
  forward: readonly string[]
  backward: readonly string[]
  left: readonly string[]
  right: readonly string[]
  run: readonly string[]
  jump: readonly string[]
}

export interface AnyoPlayerTouchOptions {
  moveRadius?: number
  deadZone?: number
  moveSensitivity?: number
  lookSensitivity?: number
  runButton?: boolean
  jumpButton?: boolean
  preventDefault?: boolean
  tapThreshold?: number
  tapMaxDuration?: number
}


export type AnyoPlayerVec3 = readonly [number, number, number]
export type AnyoPlayerCameraMode = 'explore' | 'orbit' | 'top' | 'free'

export interface AnyoPlayerCameraBounds { min: AnyoPlayerVec3; max: AnyoPlayerVec3 }
export interface AnyoPlayerCameraFrameOptions {
  target?: AnyoPlayerVec3
  bounds?: AnyoPlayerCameraBounds
  radius?: number
  distance?: number
  /** Multiplicative framing padding. Values below 1 are clamped. */
  padding?: number
  northUp?: boolean
}
export interface AnyoPlayerCameraModeOptions extends AnyoPlayerCameraFrameOptions {
  yaw?: number
  pitch?: number
  speed?: number
  restoreExplorePose?: boolean
}
export interface AnyoPlayerTeleportOptions {
  position: AnyoPlayerVec3
  rotation?: readonly [number, number]
  resetMotion?: boolean
  clearInput?: boolean
}
export interface AnyoPlayerCameraModeChange { previous: AnyoPlayerCameraMode; mode: AnyoPlayerCameraMode }
export interface AnyoPlayerTeleportedEvent { position: AnyoPlayerVec3; rotation: readonly [number, number]; resetMotion: boolean }

export type AnyoPlayerFallRecoveryState = 'idle' | 'recovering' | 'recovered' | 'failed'
export interface AnyoPlayerFallRecoveryOptions {
  minimumY?: number
  maxAttempts?: number
  cooldownMs?: number
  supportTolerance?: number
  resetAttemptsAfterSeconds?: number
}
export interface AnyoPlayerFallRecoveryStatus {
  state: AnyoPlayerFallRecoveryState
  attempt: number
  maxAttempts: number
  position: AnyoPlayerVec3 | null
  message: string | null
}
export interface AnyoPlayerFallRecoveryChange { previous: AnyoPlayerFallRecoveryStatus; recovery: AnyoPlayerFallRecoveryStatus }

export interface AnyoPlayerCharacterAnchorOptions {
  /** Entity/authoring id to bind to the Player body. Falls back to world exploration.character. */
  character?: string
  /** Player-local offset [right, up, forward] from the body/feet position. */
  offset?: AnyoPlayerVec3
  /** Rotate the entity with the first-person yaw. Defaults to true. */
  followYaw?: boolean
  /** Use camera yaw (default) or the last actual movement direction. */
  facing?: 'camera' | 'movement'
  /** Additional yaw in radians applied after the Player yaw. */
  yawOffset?: number
  /** Optional world scale owned by the same runtime transform as the character anchor. */
  scale?: number | AnyoPlayerVec3
}

export interface AnyoPlayerThirdPersonOrbitOptions {
  /** Mouse button used to orbit: 0 left, 1 middle, 2 right. Defaults to 2. */
  button?: 0 | 1 | 2
  /** Multiplier applied to the configured pointer look sensitivity. Defaults to 1. */
  sensitivity?: number
  /** Lowest vertical orbit angle in radians. Defaults to -1.2. */
  minPitch?: number
  /** Highest vertical orbit angle in radians. Defaults to 1.2. */
  maxPitch?: number
  /** Closest wheel-zoom distance in metres. Defaults to 1.25. */
  minDistance?: number
  /** Furthest wheel-zoom distance in metres. Defaults to 12. */
  maxDistance?: number
  /** Exponential wheel zoom response. Defaults to 0.0015. */
  zoomSensitivity?: number
  /** Reverse vertical mouse orbit. Defaults to false. */
  invertY?: boolean
}

/** Frame-rate-independent third-person camera smoothing. */
export interface AnyoPlayerThirdPersonSmoothingOptions {
  /** Horizontal follow response in 1/seconds. Higher values follow the body more tightly. Defaults to 18. */
  horizontalTargetResponse?: number
  /** Vertical follow response in 1/seconds. Lower values soften stairs and small grounding corrections. Defaults to 10. */
  verticalTargetResponse?: number
  /** Wheel-zoom response in 1/seconds. Defaults to 16. */
  zoomResponse?: number
  /** Camera-arm recovery response after an obstruction clears, in 1/seconds. Defaults to 8. Collision entry remains immediate for safety. */
  collisionRecoveryResponse?: number
}

/** Follow view derived from the independent Player body. */
export interface AnyoPlayerThirdPersonCameraOptions {
  /** Distance behind the body target. Defaults to 4 metres. */
  distance?: number
  /** Height above the body/feet used as the camera target. Defaults to 1.35 metres. */
  targetHeight?: number
  /** Horizontal camera offset in player-right coordinates. Defaults to 0. */
  shoulderOffset?: number
  /** Shorten the camera arm against enabled world colliders. Defaults to true. */
  collision?: boolean
  /**
   * Smooth the follow target, zoom arm, and obstruction recovery using frame-rate-independent damping.
   * Enabled with production defaults when omitted/true. Set false for the legacy immediate camera response.
   */
  smoothing?: boolean | AnyoPlayerThirdPersonSmoothingOptions
  /** Enable MMORPG-style drag orbit and wheel zoom. Existing pointer-lock behavior is preserved when omitted/false. */
  orbit?: boolean | AnyoPlayerThirdPersonOrbitOptions
}

export interface AnyoPlayerLocomotionState {
  /** Collision-resolved horizontal velocity in world metres per second. */
  horizontalVelocity: AnyoPlayerVec3
  /** Collision-resolved planar speed in world metres per second. */
  horizontalSpeed: number
  /** Current controller vertical velocity in world metres per second. */
  verticalVelocity: number
  grounded: boolean
  /** Whether the run input is currently requested. Movement remains collision-authoritative. */
  runIntent: boolean
  /** Effective configured walk speed for the active world. */
  walkSpeed: number
  /** Effective configured run speed for the active world. */
  runSpeed: number
  /** Monotonic marker incremented by explicit body resets/teleports. */
  resetSerial: number
}

export interface AnyoPlayerViewState {
  feet: AnyoPlayerVec3
  eye: AnyoPlayerVec3
  camera: AnyoPlayerVec3
  target: AnyoPlayerVec3
  yaw: number
  pitch: number
  facingYaw: number
  grounded: boolean
  requestedDistance: number
  actualDistance: number
}

export interface AnyoPlayerExplorationOptions {
  desktop?: boolean
  touch?: boolean | AnyoPlayerTouchOptions
  vr?: boolean | AnyoPlayerVROptions
  pointerLock?: boolean
  lookSensitivity?: number
  keys?: Partial<AnyoPlayerDesktopKeyBindings>
  preventDefaultKeys?: boolean
  xr?: XRExplorationPluginOptions
  /** Verified-ground recovery. Set false to disable. */
  fallRecovery?: false | AnyoPlayerFallRecoveryOptions
}

export type AnyoPlayerInteractionTrigger = 'hover' | 'reticle' | 'select'
export type AnyoPlayerReticleMode = 'pointer-lock' | 'running'

export interface AnyoPlayerInteractionContext {
  trigger: AnyoPlayerInteractionTrigger
  entityId?: string
  primitiveId?: string
  instanceId?: number
  source?: string
  data?: unknown
  action?: string
  event?: string
  params?: Record<string, unknown>
  distance?: number
}

export interface AnyoPlayerInteractionPromptContent {
  text: string
  title?: string
  description?: string
  actionLabel?: string
  inputHint?: string
  ariaLabel?: string
}

export type AnyoPlayerInteractionPromptResolver = (
  context: AnyoPlayerInteractionContext,
) => string | AnyoPlayerInteractionPromptContent | null | undefined

export interface AnyoPlayerInteractionReticleOptions {
  enabled?: boolean
  mode?: AnyoPlayerReticleMode
  sampleInterval?: number
  maxDistance?: number
}

export interface AnyoPlayerInteractionOptions {
  enabled?: boolean
  defaultText?: string
  dataKey?: string
  selectionDuration?: number
  resolvePrompt?: AnyoPlayerInteractionPromptResolver
  reticle?: boolean | AnyoPlayerInteractionReticleOptions
  activateKeys?: readonly string[]
}

export interface AnyoPlayerInteractionTargetState {
  available: boolean
  entityId: string | null
  primitiveId: string | null
  instanceId: number | null
  distance: number | null
  source: 'reticle' | null
}

export interface AnyoPlayerReticleState {
  visible: boolean
  active: boolean
}

export interface AnyoPlayerInteractionPromptState {
  visible: boolean
  text: string
  title: string | null
  description: string | null
  actionLabel: string | null
  inputHint: string | null
  ariaLabel: string | null
  actionAvailable: boolean
  trigger: AnyoPlayerInteractionTrigger | null
  entityId: string | null
  primitiveId: string | null
}

export interface AnyoPlayerUiLabels {
  loadingTitle: string
  resolvingSource: string
  creatingRuntime: string
  loadingWorld: string
  waitingReady: string
  loadingAssets: string
  replacingWorld: string
  replacementFailed: string
  readyWithWarnings: string
  enterTitle: string
  enterMessage: string
  enterButton: string
  reenterMessage: string
  pointerLockFailed: string
  pause: string
  resume: string
  muteAudio: string
  unmuteAudio: string
  unlockAudio: string
  audioUnavailable: string
  takeScreenshot: string
  screenshotCaptured: string
  screenshotFailed: string
  pauseMenuTitle: string
  pauseMenuMessage: string
  pausedTitle: string
  pausedMessage: string
  visibilityPaused: string
  offscreenPaused: string
  enterFullscreen: string
  exitFullscreen: string
  fullscreenFailed: string
  touchMove: string
  touchRun: string
  touchJump: string
  interactionDefault: string
  interactionAction: string
  interactionHint: string
  vrChecking: string
  enterVR: string
  exitVR: string
  vrUnsupported: string
  vrEntering: string
  vrActive: string
  vrExiting: string
  vrTrackingLost: string
  vrTrackingRestored: string
  vrInputs: string
  vrEnterFailed: string
  vrExitFailed: string
  errorTitle: string
  retry: string
  webglContextLost: string
  webglContextRestored: string
  webgpuDeviceLost: string
  worldControls: string
  loadingProgress: string
}


export type AnyoPlayerUiStyleMode = 'auto' | 'external' | 'inject'
export type AnyoPlayerUiAdapterMode = 'augment' | 'replace'
export type AnyoPlayerUiSlotName =
  | 'loading'
  | 'diagnostic'
  | 'xr-status'
  | 'reticle'
  | 'interaction'
  | 'enter'
  | 'pause'
  | 'controls'
  | 'error'

export interface AnyoPlayerThemeTokens {
  background?: string
  surface?: string
  text?: string
  muted?: string
  border?: string
  accent?: string
  accentText?: string
  warning?: string
  error?: string
  panelRadius?: string
  controlRadius?: string
  fontFamily?: string
  backdropBlur?: string
}

export interface AnyoPlayerUiStyleOptions {
  mode?: AnyoPlayerUiStyleMode
  root?: Document | ShadowRoot | null
  nonce?: string
}

export interface AnyoPlayerUiDiagnosticSnapshot {
  message: string
  severity: 'info' | 'warning' | 'error' | 'fatal'
}

export interface AnyoPlayerUiSnapshot {
  phase: AnyoPlayerLoadingPhase
  progress: RendererAssetProgress
  readyStatus: AnyoPlayerReadyStatus | null
  paused: boolean
  pauseReason: AnyoPlayerPauseReason | null
  fullscreen: boolean
  interactionPrompt: AnyoPlayerInteractionPromptState
  reticle: AnyoPlayerReticleState
  vrSupport: AnyoPlayerVRSupportState
  vrSession: 'idle' | 'entering' | 'active' | 'exiting'
  xrTracking: AnyoPlayerXRTrackingState
  xrInputCount: number
  audio: AnyoPlayerAudioState
  caption: AnyoPlayerCaptionState
  error: AnyoPlayerError | null
  diagnostic: AnyoPlayerUiDiagnosticSnapshot | null
}

export interface AnyoPlayerUiAdapterActions {
  retry(): Promise<void>
  enter(): void
  togglePause(): void
  toggleFullscreen(): Promise<void>
  toggleVR(): Promise<void>
  interact(): Promise<boolean>
  toggleAudio(): Promise<void>
  captureScreenshot(): Promise<void>
}

export type AnyoPlayerUiSlotMap = Readonly<Record<AnyoPlayerUiSlotName, HTMLElement>>

export interface AnyoPlayerUiAdapterContext {
  root: HTMLElement
  slots: AnyoPlayerUiSlotMap
  actions: AnyoPlayerUiAdapterActions
  labels: Readonly<AnyoPlayerUiLabels>
  getSnapshot(): AnyoPlayerUiSnapshot
}

export interface AnyoPlayerUiAdapter {
  mode?: AnyoPlayerUiAdapterMode
  mount(context: AnyoPlayerUiAdapterContext): void | (() => void)
  update?(snapshot: AnyoPlayerUiSnapshot): void
  dispose?(): void
}

export interface AnyoPlayerThemeChangeEvent {
  theme: Readonly<AnyoPlayerThemeTokens>
}

export interface AnyoPlayerUiOptions {
  showProgress?: boolean
  showProgressDetails?: boolean
  showDiagnostics?: boolean
  showErrors?: boolean
  showEnterPrompt?: boolean
  showControls?: boolean
  showPauseControl?: boolean
  showAudioControl?: boolean
  showFullscreenControl?: boolean
  showTouchControls?: boolean
  showInteractionPrompt?: boolean
  showInteractionAction?: boolean
  showReticle?: boolean
  showVRControl?: boolean
  showXRStatus?: boolean
  allowRetry?: boolean
  className?: string
  labels?: Partial<AnyoPlayerUiLabels>
  theme?: AnyoPlayerThemeTokens
  styles?: false | AnyoPlayerUiStyleOptions
  adapter?: AnyoPlayerUiAdapter
}

export interface AnyoPlayerWebSurfaceOptions {
  /**
   * Reuse a host-owned registry across players or application modules.
   * Player creates an isolated registry when omitted.
   */
  registry?: WebSurfaceAppRegistry
  /**
   * Convenience registrations installed for the lifetime of this Player.
   * These registrations are removed during disposal without clearing a host-owned registry.
   */
  apps?: Readonly<Record<string, RegisteredWebSurfaceApp>>
  /**
   * Optional host-owned overlay root. When omitted, Anyo creates and owns a fixed document root.
   */
  root?: HTMLElement
  zIndex?: number
  externalUrls?: WebSurfaceExternalUrlPolicy
  onDiagnostic?: (diagnostic: WebSurfaceDiagnostic) => void
}

export interface AnyoPlayerComponentOptions {
  /** Host-owned registry used by the built-in entity compiler. */
  registry?: ComponentTypeRegistry
  /** Policy for component types that are not present in the registry. */
  unknown?: UnknownComponentPolicy
}

export interface AnyoPlayerOptions {
  container: HTMLElement
  canvas?: HTMLCanvasElement
  source?: AnyoPlayerSource
  baseUrl?: string | URL
  renderer?: AnyoPlayerRendererOptions
  performance?: false | AnyoPlayerPerformanceOptions
  loading?: false | AnyoPlayerLoadingOptions
  exploration?: AnyoPlayerExplorationOptions
  view?: false | AnyoPlayerViewPreferenceOptions
  webSurface?: false | AnyoPlayerWebSurfaceOptions
  /** Extension component registry/policy used by the built-in entity compiler. */
  components?: AnyoPlayerComponentOptions
  /**
   * Trusted host-installed Anyo plugins appended after Player built-ins.
   * Plugins are executable host code and are never read from world JSON.
   */
  plugins?: readonly WorldPlugin[]
  /** Trusted host-installed fixed-step runtime systems, including optional physics. */
  systems?: readonly WorldSystem[]
  /** Fixed-step scheduler tuning shared by installed runtime systems. */
  systemOptions?: RuntimeSystemsOptions
  interaction?: false | AnyoPlayerInteractionOptions
  resize?: false | AnyoPlayerResizeOptions
  visibility?: false | AnyoPlayerVisibilityOptions
  embedding?: false | AnyoPlayerEmbeddingOptions
  navigation?: false | AnyoPlayerNavigationOptions
  fullscreen?: false | AnyoPlayerFullscreenOptions
  validation?: WorldValidationOptions
  ui?: false | AnyoPlayerUiOptions
  session?: false | AnyoPlayerSessionOptions
  input?: false | AnyoPlayerInputBindingsOptions
  accessibility?: false | AnyoPlayerAccessibilityOptions
  audio?: false | AnyoPlayerAudioOptions
  pauseMenu?: false | AnyoPlayerPauseMenuOptions
  rendererRecovery?: false | AnyoPlayerRendererRecoveryOptions
  analytics?: false | AnyoPlayerAnalyticsOptions
  diagnostics?: false | AnyoPlayerDiagnosticOptions
  ariaLabel?: string
  fetch?: typeof globalThis.fetch
  onWarning?: (message: string) => void
}

export interface AnyoPlayerStateChange {
  previous: AnyoPlayerState
  state: AnyoPlayerState
}

export interface AnyoPlayerPhaseChange {
  previous: AnyoPlayerLoadingPhase
  phase: AnyoPlayerLoadingPhase
}

export interface AnyoPlayerReadyEvent {
  world: World
  progress: RendererAssetProgress
  status: AnyoPlayerReadyStatus
}

export interface AnyoPlayerWorldReplacingEvent {
  world: World
  source: AnyoPlayerSource
}

export interface AnyoPlayerWorldReplacedEvent extends AnyoPlayerReadyEvent {}

export interface AnyoPlayerEnteredEvent {
  world: World
  mode: AnyoPlayerInputMode
  pointerLockRequested: boolean
}

export type AnyoPlayerExitReason =
  | 'blur'
  | 'window-blur'
  | 'escape'
  | 'pointer-lock-exit'
  | 'pointer-lock-error'
  | 'gamepad-disconnected'
  | 'runtime-error'
  | 'vr-enter'
  | 'replace-world'
  | 'session-restore'
  | 'pause'
  | 'visibility'
  | 'offscreen'
  | 'dispose'
  | 'camera-mode'

export interface AnyoPlayerExitedEvent {
  reason: AnyoPlayerExitReason
}

export interface AnyoPlayerPointerLockChange {
  locked: boolean
}

export interface AnyoPlayerPauseEvent {
  reason: AnyoPlayerPauseReason
}

export interface AnyoPlayerResumeEvent {
  reason: AnyoPlayerPauseReason
  controlsRequested: boolean
}

export interface AnyoPlayerFullscreenChange {
  fullscreen: boolean
}

export interface AnyoPlayerVRSupportChange {
  previous: AnyoPlayerVRSupportState
  state: AnyoPlayerVRSupportState
  supported: boolean | null
}

export interface AnyoPlayerXRStateChange {
  previous: XRSessionState
  state: XRSessionState
}

export interface AnyoPlayerXRTrackingChange {
  previous: AnyoPlayerXRTrackingState
  state: AnyoPlayerXRTrackingState
}

export interface AnyoPlayerXRInputChange {
  inputs: readonly XRInputSnapshot[]
}

export interface AnyoPlayerVREnteredEvent {
  world: World
  inputs: readonly XRInputSnapshot[]
}

export interface AnyoPlayerVRExitedEvent {
  browserEnded: boolean
}

export interface AnyoPlayerInteractionTargetChange {
  target: AnyoPlayerInteractionTargetState
}

export interface AnyoPlayerInteractionActivatedEvent {
  target: AnyoPlayerInteractionTargetState
  selected: boolean
}

export interface AnyoPlayerWarning {
  message: string
}

export interface AnyoPlayerEventMap {
  statechange: AnyoPlayerStateChange
  phasechange: AnyoPlayerPhaseChange
  progress: RendererAssetProgress
  diagnostic: RendererDiagnostic
  diagnosticrecorded: AnyoPlayerDiagnosticRecordedEvent
  rendererrecoverychange: AnyoPlayerRendererRecoveryChange
  performancechange: AnyoPlayerPerformanceChangeEvent
  qualitypreferencechange: AnyoPlayerQualityPreferenceChangeEvent
  qualitypreferencesaved: AnyoPlayerQualityPreferenceSavedEvent
  qualitypreferenceloaded: AnyoPlayerQualityPreferenceLoadedEvent
  qualitypreferencecleared: AnyoPlayerQualityPreferenceClearedEvent
  viewpreferencechange: AnyoPlayerViewPreferenceChangeEvent
  viewpreferencesaved: AnyoPlayerViewPreferenceSavedEvent
  viewpreferenceloaded: AnyoPlayerViewPreferenceLoadedEvent
  viewpreferencecleared: AnyoPlayerViewPreferenceClearedEvent
  captionchange: AnyoPlayerCaptionChangeEvent
  cameramodechange: AnyoPlayerCameraModeChange
  teleported: AnyoPlayerTeleportedEvent
  fallrecoverychange: AnyoPlayerFallRecoveryChange
  telemetry: AnyoPlayerTelemetryEvent
  analyticserror: AnyoPlayerError
  warning: AnyoPlayerWarning
  inputerror: AnyoPlayerError
  pointerlockchange: AnyoPlayerPointerLockChange
  resize: AnyoPlayerResizeEvent
  paused: AnyoPlayerPauseEvent
  resumed: AnyoPlayerResumeEvent
  fullscreenchange: AnyoPlayerFullscreenChange
  fullscreenerror: AnyoPlayerError
  vrsupportchange: AnyoPlayerVRSupportChange
  xrstatechange: AnyoPlayerXRStateChange
  xrtrackingchange: AnyoPlayerXRTrackingChange
  xrinputchange: AnyoPlayerXRInputChange
  vrentered: AnyoPlayerVREnteredEvent
  vrexited: AnyoPlayerVRExitedEvent
  vrerror: AnyoPlayerError
  entered: AnyoPlayerEnteredEvent
  exited: AnyoPlayerExitedEvent
  interaction: AnyoPlayerInteractionContext
  interactionpromptchange: AnyoPlayerInteractionPromptState
  interactiontargetchange: AnyoPlayerInteractionTargetChange
  interactionactivated: AnyoPlayerInteractionActivatedEvent
  interactionerror: AnyoPlayerError
  error: AnyoPlayerError
  ready: AnyoPlayerReadyEvent
  worldreplacing: AnyoPlayerWorldReplacingEvent
  worldreplaced: AnyoPlayerWorldReplacedEvent
  worldreplaceerror: AnyoPlayerError
  sessioncaptured: AnyoPlayerSessionCapturedEvent
  sessionsaved: AnyoPlayerSessionSavedEvent
  sessionloaded: AnyoPlayerSessionLoadedEvent
  sessionrestored: AnyoPlayerSessionRestoredEvent
  sessioncleared: AnyoPlayerSessionClearedEvent
  sessionerror: AnyoPlayerError
  inputbindingschange: AnyoPlayerInputBindingsChangeEvent
  inputbindingssaved: AnyoPlayerInputBindingsSavedEvent
  inputbindingsloaded: AnyoPlayerInputBindingsLoadedEvent
  inputbindingscleared: AnyoPlayerInputBindingsClearedEvent
  inputbindingserror: AnyoPlayerError
  inputaction: AnyoPlayerInputActionEvent
  gamepadchange: AnyoPlayerGamepadChangeEvent
  reducedmotionchange: AnyoPlayerReducedMotionChange
  inputmodalitychange: AnyoPlayerInputModalityChange
  audiochange: AnyoPlayerAudioChangeEvent
  audiounlocked: AnyoPlayerAudioUnlockedEvent
  audioerror: AnyoPlayerError
  screenshotcaptured: AnyoPlayerScreenshotCapturedEvent
  screenshoterror: AnyoPlayerError
  activationchange: AnyoPlayerActivationChange
  intersectionchange: AnyoPlayerIntersectionChange
  preloaded: AnyoPlayerPreloadedEvent
  posterchange: AnyoPlayerPosterChange
  worldnavigationchange: AnyoPlayerWorldNavigationChangeEvent
  worldnavigationstart: AnyoPlayerWorldNavigationStartEvent
  worldnavigationcomplete: AnyoPlayerWorldNavigationCompleteEvent
  worldnavigationcanceled: AnyoPlayerWorldNavigationCanceledEvent
  worldnavigationerror: AnyoPlayerWorldNavigationErrorEvent
  worldpreloaded: AnyoPlayerWorldPreloadedEvent
  themechange: AnyoPlayerThemeChangeEvent
  disposed: undefined
}

export type AnyoPlayerListener<TKey extends keyof AnyoPlayerEventMap> = (
  payload: AnyoPlayerEventMap[TKey],
) => void

export interface AnyoPlayer {
  readonly container: HTMLElement
  readonly canvas: HTMLCanvasElement
  readonly state: AnyoPlayerState
  readonly phase: AnyoPlayerLoadingPhase
  readonly readyStatus: AnyoPlayerReadyStatus | null
  readonly world: World | null
  readonly webSurfaceRegistry: WebSurfaceAppRegistry | null
  readonly progress: RendererAssetProgress
  readonly error: AnyoPlayerError | null
  readonly entered: boolean
  readonly inputMode: AnyoPlayerInputMode | null
  readonly touchEnabled: boolean
  readonly pointerLocked: boolean
  readonly paused: boolean
  readonly pauseReason: AnyoPlayerPauseReason | null
  readonly fullscreen: boolean
  readonly viewport: AnyoPlayerResizeEvent
  readonly interactionPrompt: AnyoPlayerInteractionPromptState
  readonly interactionTarget: AnyoPlayerInteractionTargetState
  readonly reticle: AnyoPlayerReticleState
  readonly vrEnabled: boolean
  readonly vrSupportState: AnyoPlayerVRSupportState
  readonly vrSupported: boolean | null
  readonly xrState: XRSessionState
  readonly xrTracking: AnyoPlayerXRTrackingState
  readonly xrInputs: readonly XRInputSnapshot[]
  readonly sessionEnabled: boolean
  readonly sessionStorageAvailable: boolean
  readonly sessionKey: string | null
  readonly inputBindings: AnyoPlayerInputBindingMap
  readonly inputBindingsStorageAvailable: boolean
  readonly inputBindingsKey: string | null
  readonly gamepadEnabled: boolean
  readonly gamepads: readonly AnyoPlayerGamepadState[]
  readonly activeGamepad: number | null
  readonly reducedMotion: boolean
  readonly reducedMotionPreference: AnyoPlayerReducedMotionPreference
  readonly inputModality: AnyoPlayerInputModality
  readonly audio: AnyoPlayerAudioState
  readonly rendererRecovery: AnyoPlayerRendererRecoveryStatus
  readonly performance: AnyoPlayerPerformanceSnapshot
  readonly qualityPreference: AnyoPlayerQualityPreferenceSnapshot
  readonly deviceProfile: AnyoPlayerDeviceProfile
  readonly viewPreference: AnyoPlayerViewPreferenceSnapshot
  readonly sourceInfo: AnyoPlayerSourceInfo | null
  readonly health: AnyoPlayerRuntimeHealth
  readonly caption: AnyoPlayerCaptionState
  readonly cameraMode: AnyoPlayerCameraMode
  readonly characterAnchorEntity: string | null
  readonly thirdPersonCameraEnabled: boolean
  readonly viewState: AnyoPlayerViewState | null
  readonly locomotion: AnyoPlayerLocomotionState | null
  readonly fallRecovery: AnyoPlayerFallRecoveryStatus
  readonly diagnostics: readonly AnyoPlayerDiagnosticRecord[]
  readonly telemetry: readonly AnyoPlayerTelemetryEvent[]
  readonly activated: boolean
  readonly preloaded: boolean
  readonly intersection: AnyoPlayerIntersectionState
  readonly posterVisible: boolean
  readonly worldIds: readonly string[]
  readonly currentWorldId: string | null
  readonly navigation: AnyoPlayerWorldNavigationStatus
  readonly theme: Readonly<AnyoPlayerThemeTokens>

  preload(source?: AnyoPlayerSource): Promise<WorldDocument>
  clearPreload(): void
  activate(): Promise<void>
  registerWorld(worldId: string, source: AnyoPlayerSource | AnyoPlayerWorldDefinition, options?: AnyoPlayerWorldRegistrationOptions): () => void
  unregisterWorld(worldId: string): boolean
  preloadWorld(worldId: string): Promise<WorldDocument>
  clearWorldPreload(worldId?: string): void
  cancelWorldPreload(worldId?: string): boolean
  navigateTo(worldId: string, options?: AnyoPlayerNavigateOptions): Promise<void>
  cancelNavigation(): boolean
  load(source?: AnyoPlayerSource): Promise<void>
  replaceWorld(source: AnyoPlayerSource): Promise<void>
  retry(): Promise<void>
  enter(): void
  setCameraMode(mode: AnyoPlayerCameraMode, options?: AnyoPlayerCameraModeOptions): void
  setCharacterAnchor(options: false | AnyoPlayerCharacterAnchorOptions): Promise<void>
  setThirdPersonCamera(options: false | AnyoPlayerThirdPersonCameraOptions): void
  frameCamera(options?: AnyoPlayerCameraFrameOptions): void
  teleport(options: AnyoPlayerTeleportOptions): void
  pause(): void
  resume(): void
  enterFullscreen(): Promise<void>
  exitFullscreen(): Promise<void>
  toggleFullscreen(): Promise<void>
  checkVRSupport(): Promise<boolean>
  enterVR(): Promise<void>
  exitVR(): Promise<void>
  resizeNow(): AnyoPlayerResizeEvent
  resetToSpawn(): void
  setQualityPreset(preset: AnyoPlayerQualityPreset): AnyoPlayerPerformanceSnapshot
  setTargetFps(targetFps: number): AnyoPlayerPerformanceSnapshot
  setDynamicResolution(enabled: boolean): AnyoPlayerPerformanceSnapshot
  getPerformanceSnapshot(): AnyoPlayerPerformanceSnapshot
  saveQualityPreference(key?: string): Promise<AnyoPlayerQualityPreferenceSnapshot>
  loadQualityPreference(key?: string): Promise<AnyoPlayerQualityPreferenceSnapshot | null>
  clearQualityPreference(key?: string): Promise<void>
  setViewPreference(preference: Partial<Omit<AnyoPlayerViewPreferenceSnapshot, 'format' | 'version'>>): AnyoPlayerViewPreferenceSnapshot
  resetViewPreference(): AnyoPlayerViewPreferenceSnapshot
  saveViewPreference(key?: string): Promise<AnyoPlayerViewPreferenceSnapshot>
  loadViewPreference(key?: string): Promise<AnyoPlayerViewPreferenceSnapshot | null>
  clearViewPreference(key?: string): Promise<void>
  createRuntimeHealth(): AnyoPlayerRuntimeHealth
  createRuntimeReport(): AnyoPlayerRuntimeReport
  downloadRuntimeReport(filename?: string): AnyoPlayerRuntimeReport
  createDiagnosticBundle(): AnyoPlayerDiagnosticBundle
  downloadDiagnosticBundle(filename?: string): AnyoPlayerDiagnosticBundle
  captureSession(options?: AnyoPlayerSessionCaptureOptions): AnyoPlayerSessionSnapshot
  restoreSession(snapshot: unknown, options?: AnyoPlayerSessionRestoreOptions): Promise<AnyoPlayerSessionSnapshot>
  saveSession(key?: string, options?: AnyoPlayerSessionCaptureOptions): Promise<AnyoPlayerSessionSnapshot>
  loadSession(key?: string, options?: AnyoPlayerSessionRestoreOptions): Promise<AnyoPlayerSessionSnapshot | null>
  clearSession(key?: string): Promise<void>
  setInputBindings(bindings: Partial<AnyoPlayerInputBindingMap>, options?: { merge?: boolean }): AnyoPlayerInputBindingMap
  resetInputBindings(): AnyoPlayerInputBindingMap
  saveInputBindings(key?: string): Promise<AnyoPlayerInputBindingsSnapshot>
  loadInputBindings(key?: string): Promise<AnyoPlayerInputBindingsSnapshot | null>
  clearInputBindings(key?: string): Promise<void>
  setReducedMotion(preference: AnyoPlayerReducedMotionPreference): boolean
  announce(message: string, options?: AnyoPlayerAnnouncementOptions): void
  showCaption(text: string, options?: AnyoPlayerCaptionOptions): AnyoPlayerCaptionState
  clearCaption(): void
  registerCaptionTarget(target: AnyoPlayerCaptionTarget): () => void
  registerVfxTarget(target: AnyoPlayerVfxTarget): () => void
  registerMapTarget(target: AnyoPlayerMapTarget): () => void
  setMapAttribution(text: string | null): void
  registerAudioTarget(target: AnyoPlayerAudioTarget): () => void
  unlockAudio(): Promise<AnyoPlayerAudioState>
  setAudioMuted(muted: boolean): Promise<AnyoPlayerAudioState>
  toggleAudioMuted(): Promise<AnyoPlayerAudioState>
  captureScreenshot(options?: AnyoPlayerScreenshotOptions): Promise<AnyoPlayerScreenshotResult>
  recoverRenderer(): Promise<void>
  cancelRendererRecovery(): void
  clearDiagnostics(): void
  registerAnalyticsSink(sink: AnyoPlayerAnalyticsSink): () => void
  trackTelemetry(name: string, details?: Record<string, unknown>, category?: AnyoPlayerTelemetryCategory): AnyoPlayerTelemetryEvent | null
  clearTelemetry(): void
  setTheme(theme: AnyoPlayerThemeTokens | null): Readonly<AnyoPlayerThemeTokens>
  interact(): Promise<boolean>
  registerAction(name: string, handler: ActionHandler): () => void
  on<TKey extends keyof AnyoPlayerEventMap>(
    event: TKey,
    listener: AnyoPlayerListener<TKey>,
  ): () => void
  disposeAsync(): Promise<void>
}
