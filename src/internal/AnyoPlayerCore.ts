import type {
  ActionHandler,
  RendererAssetProgress,
  RendererDiagnostic,
  World,
  WorldDocument,
  XRInputSnapshot,
  XRSessionState,
} from '@blcklab/anyo'
import { hashWorldDocument } from '@blcklab/anyo'
import {
  createWebSurfaceAppRegistry,
  type WebSurfaceAppRegistry,
  type WebSurfaceDiagnostic,
  type WebSurfacePluginOptions,
} from '@blcklab/anyo/web-surface'
import { AnyoPlayerError, toPlayerError } from '../errors.js'
import type { AnyoPlayerErrorCode } from '../errors.js'
import type {
  AnyoPlayer,
  AnyoPlayerAnnouncementOptions,
  AnyoPlayerAnalyticsSink,
  AnyoPlayerDiagnosticRecord,
  AnyoPlayerRendererRecoveryOptions,
  AnyoPlayerRendererRecoveryStatus,
  AnyoPlayerCameraMode,
  AnyoPlayerCameraModeOptions,
  AnyoPlayerCameraFrameOptions,
  AnyoPlayerCharacterAnchorOptions,
  AnyoPlayerThirdPersonCameraOptions,
  AnyoPlayerThirdPersonShoulderSide,
  AnyoPlayerTeleportOptions,
  AnyoPlayerFallRecoveryStatus,
  AnyoPlayerTelemetryCategory,
  AnyoPlayerTelemetryEvent,
  AnyoPlayerThemeTokens,
  AnyoPlayerAudioState,
  AnyoPlayerCaptionOptions,
  AnyoPlayerCaptionState,
  AnyoPlayerCaptionTarget,
  AnyoPlayerVfxTarget,
  AnyoPlayerMapTarget,
  AnyoPlayerAudioTarget,
  AnyoPlayerDesktopKeyBindings,
  AnyoPlayerEventMap,
  AnyoPlayerExitReason,
  AnyoPlayerInputMode,
  AnyoPlayerIntersectionState,
  AnyoPlayerNavigateOptions,
  AnyoPlayerNavigationOptions,
  AnyoPlayerWorldDefinition,
  AnyoPlayerWorldRegistrationOptions,
  AnyoPlayerWorldNavigationStatus,
  AnyoPlayerWorldTransitionOptions,
  AnyoPlayerInputModality,
  AnyoPlayerInputAction,
  AnyoPlayerInputBinding,
  AnyoPlayerInputBindingMap,
  AnyoPlayerInputBindingsSnapshot,
  AnyoPlayerInputStorage,
  AnyoPlayerGamepadState,
  AnyoPlayerInteractionContext,
  AnyoPlayerInteractionPromptContent,
  AnyoPlayerInteractionPromptState,
  AnyoPlayerInteractionReticleOptions,
  AnyoPlayerInteractionTargetState,
  AnyoPlayerReticleState,
  AnyoPlayerListener,
  AnyoPlayerLoadingPhase,
  AnyoPlayerOptions,
  AnyoPlayerPauseReason,
  AnyoPlayerReadyStatus,
  AnyoPlayerReducedMotionPreference,
  AnyoPlayerResizeEvent,
  AnyoPlayerRuntimeReport,
  AnyoPlayerRuntimeHealth,
  AnyoPlayerDiagnosticBundle,
  AnyoPlayerSourceInfo,
  AnyoPlayerPerformanceSnapshot,
  AnyoPlayerQualityPreset,
  AnyoPlayerQualityPreferenceSnapshot,
  AnyoPlayerQualityStorage,
  AnyoPlayerViewPreferenceSnapshot,
  AnyoPlayerViewStorage,
  AnyoPlayerScreenshotOptions,
  AnyoPlayerScreenshotResult,
  AnyoPlayerSessionCaptureOptions,
  AnyoPlayerSessionRestoreOptions,
  AnyoPlayerSessionSnapshot,
  AnyoPlayerSessionStorage,
  AnyoPlayerSource,
  AnyoPlayerState,
  AnyoPlayerTouchOptions,
  AnyoPlayerVROptions,
  AnyoPlayerVRSupportState,
  AnyoPlayerXRTrackingState,
} from '../types.js'
import { ContainerHost } from './ContainerHost.js'
import { VfxController } from './VfxController.js'
import { MapController } from './MapController.js'
import {
  DEFAULT_DESKTOP_KEYS,
  DesktopInputController,
} from './DesktopInputController.js'
import { EventHub } from './EventHub.js'
import {
  DefaultRuntimeFactory,
  type PlayerRuntime,
  type PlayerRuntimeFactory,
} from './RuntimeFactory.js'
import { SourceResolver, type ResolvedPlayerSource } from './SourceResolver.js'
import { StateMachine } from './StateMachine.js'
import { StyleController } from './StyleController.js'
import { ResponsiveController } from './ResponsiveController.js'
import { FullscreenController } from './FullscreenController.js'
import { VisibilityController } from './VisibilityController.js'
import { DEFAULT_UI_LABELS, createPlayerUI, type PlayerUIController } from '../ui/PlayerUI.js'
import {
  TouchInputController,
  detectTouchCapability,
} from './TouchInputController.js'
import { XRController } from './XRController.js'
import { SessionController } from './SessionController.js'
import { InteractionPresentationController } from './InteractionPresentationController.js'
import { InputBindingsController, cloneInputBindingMap } from './InputBindingsController.js'
import { GamepadController } from './GamepadController.js'
import { AccessibilityController } from './AccessibilityController.js'
import { AudioController } from './AudioController.js'
import { ScreenshotController } from './ScreenshotController.js'
import { TelemetryController } from './TelemetryController.js'
import { EmbeddingController } from './EmbeddingController.js'
import { PerformanceController } from './PerformanceController.js'
import { ViewPreferenceController } from './ViewPreferenceController.js'
import { CaptionController } from './CaptionController.js'

const TERMINAL_PROGRESS: RendererAssetProgress = {
  queued: 0,
  loading: 0,
  loaded: 0,
  failed: 0,
  total: 0,
  ratio: 1,
}

interface ActionRegistration {
  token: symbol
  handler: ActionHandler
}

interface PreloadedSource {
  source: AnyoPlayerSource
  resolved: ResolvedPlayerSource
}

interface PendingPreload {
  source: AnyoPlayerSource
  controller: AbortController
  promise: Promise<ResolvedPlayerSource>
}

function samePlayerSource(left: AnyoPlayerSource, right: AnyoPlayerSource): boolean {
  if (left === right) return true
  if (typeof left === 'string' && typeof right === 'string') return left === right
  if (left instanceof URL && right instanceof URL) return left.href === right.href
  return false
}

function cloneResolvedSource(source: ResolvedPlayerSource): ResolvedPlayerSource {
  const info = source.info ?? {
    kind: 'document' as const,
    url: source.documentUrl ?? null,
    bytes: null,
    cache: 'none' as const,
    integrity: 'not-requested' as const,
    migratedFrom: null,
    documentVersion: source.document.version,
  }
  return {
    document: structuredClone(source.document),
    ...(source.documentUrl === undefined ? {} : { documentUrl: source.documentUrl }),
    info: structuredClone(info),
    ...(source.cleanup ? { cleanup: source.cleanup } : {}),
  }
}

interface NormalizedWorldDefinition {
  id: string
  source: AnyoPlayerSource
  label: string | null
  metadata: Readonly<Record<string, unknown>> | null
}

interface NormalizedWorldTransitionOptions {
  presentation: 'none' | 'fade'
  minimumDuration: number
  beforeSwitch?: AnyoPlayerWorldTransitionOptions['beforeSwitch']
  afterSwitch?: AnyoPlayerWorldTransitionOptions['afterSwitch']
}

interface NormalizedNavigationOptions {
  worlds: Map<string, NormalizedWorldDefinition>
  initialWorld: string | null
  transition: NormalizedWorldTransitionOptions
}

function isWorldDefinition(value: AnyoPlayerSource | AnyoPlayerWorldDefinition): value is AnyoPlayerWorldDefinition {
  return Boolean(value && typeof value === 'object' && 'source' in value && !('version' in value))
}

function normalizeTransitionOptions(
  value: false | AnyoPlayerWorldTransitionOptions | undefined,
  fallback?: NormalizedWorldTransitionOptions,
): NormalizedWorldTransitionOptions {
  if (value === false) return { presentation: 'none', minimumDuration: 0 }
  const minimumDuration = value?.minimumDuration ?? fallback?.minimumDuration ?? 160
  if (!Number.isFinite(minimumDuration) || minimumDuration < 0 || minimumDuration > 60_000) {
    throw new TypeError('navigation.transition.minimumDuration must be between 0 and 60000 milliseconds.')
  }
  const presentation = value?.presentation ?? fallback?.presentation ?? 'fade'
  if (!['none', 'fade'].includes(presentation)) {
    throw new TypeError('navigation.transition.presentation must be "none" or "fade".')
  }
  return {
    presentation,
    minimumDuration,
    ...(value?.beforeSwitch ?? fallback?.beforeSwitch
      ? { beforeSwitch: value?.beforeSwitch ?? fallback?.beforeSwitch }
      : {}),
    ...(value?.afterSwitch ?? fallback?.afterSwitch
      ? { afterSwitch: value?.afterSwitch ?? fallback?.afterSwitch }
      : {}),
  }
}

function normalizeWorldDefinition(rawId: string, rawDefinition: AnyoPlayerSource | AnyoPlayerWorldDefinition): NormalizedWorldDefinition {
  const id = rawId.trim()
  if (!id) throw new TypeError('navigation world identifiers must not be empty.')
  const definition = isWorldDefinition(rawDefinition) ? rawDefinition : { source: rawDefinition }
  if (definition.source === undefined || definition.source === null) throw new TypeError(`navigation world "${id}" source is required.`)
  return { id, source: definition.source, label: definition.label?.trim() || null, metadata: definition.metadata ? structuredClone(definition.metadata) : null }
}

function normalizeNavigationOptions(
  value: false | AnyoPlayerNavigationOptions | undefined,
): NormalizedNavigationOptions | null {
  if (value === false || value === undefined) return null
  if (!value.worlds || typeof value.worlds !== 'object' || Array.isArray(value.worlds)) {
    throw new TypeError('navigation.worlds must be an object map of world identifiers to sources.')
  }
  const worlds = new Map<string, NormalizedWorldDefinition>()
  for (const [rawId, rawDefinition] of Object.entries(value.worlds)) {
    const definition = normalizeWorldDefinition(rawId, rawDefinition)
    worlds.set(definition.id, definition)
  }
  if (worlds.size === 0) throw new TypeError('navigation.worlds must define at least one world.')
  const initialWorld = value.initialWorld?.trim() || null
  if (initialWorld && !worlds.has(initialWorld)) {
    throw new TypeError(`navigation.initialWorld references unknown world "${initialWorld}".`)
  }
  return {
    worlds,
    initialWorld,
    transition: normalizeTransitionOptions(value.transition),
  }
}

function cloneNavigationStatus(status: AnyoPlayerWorldNavigationStatus): AnyoPlayerWorldNavigationStatus {
  return { ...status }
}

function waitForMinimumDuration(startedAt: number, minimumDuration: number): Promise<void> {
  const remaining = minimumDuration - (Date.now() - startedAt)
  return remaining > 0 ? new Promise(resolve => setTimeout(resolve, remaining)) : Promise.resolve()
}


interface EntityInteractionPayload {
  entityId?: string
  primitiveId?: string
  instanceId?: number
  source?: string
  data?: unknown
}

const HIDDEN_INTERACTION_PROMPT: AnyoPlayerInteractionPromptState = {
  visible: false,
  text: '',
  title: null,
  description: null,
  actionLabel: null,
  inputHint: null,
  ariaLabel: null,
  actionAvailable: false,
  trigger: null,
  entityId: null,
  primitiveId: null,
}

const EMPTY_INTERACTION_TARGET: AnyoPlayerInteractionTargetState = {
  available: false,
  entityId: null,
  primitiveId: null,
  instanceId: null,
  distance: null,
  source: null,
}

const HIDDEN_RETICLE: AnyoPlayerReticleState = {
  visible: false,
  active: false,
}

function asVROptions(value: boolean | AnyoPlayerVROptions | undefined): AnyoPlayerVROptions {
  return typeof value === 'object' && value !== null ? value : {}
}

function asReticleOptions(value: boolean | AnyoPlayerInteractionReticleOptions | undefined): AnyoPlayerInteractionReticleOptions {
  if (value === false) return { enabled: false }
  return typeof value === 'object' && value !== null ? value : {}
}

function asTouchOptions(
  value: boolean | AnyoPlayerTouchOptions | undefined,
): AnyoPlayerTouchOptions {
  return typeof value === 'object' && value !== null ? value : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

interface ManagedRuntime extends PlayerRuntime {
  operationId: number
  eventCleanups: Array<() => void>
  actionCleanups: Map<string, { token: symbol; cleanup: () => void }>
  fatalDiagnostic: RendererDiagnostic | null
  fatalSignal: Promise<RendererDiagnostic>
  resolveFatal: (diagnostic: RendererDiagnostic) => void
  fatalHandled: boolean
  disposed: boolean
}

interface ReplacementContext {
  returnState: 'ready' | 'paused'
  pauseReason: AnyoPlayerPauseReason | null
  previousSource: AnyoPlayerSource | undefined
  previousDocument: WorldDocument
  previousProgress: RendererAssetProgress
  previousReadyStatus: AnyoPlayerReadyStatus
}


interface NormalizedRendererRecoveryOptions {
  enabled: boolean
  automatic: boolean
  maxAttempts: number
  delayMs: number
  backoff: number
  restoreSession: boolean
  fallbackBackend: false | 'auto' | 'webgl2'
  fallbackAfterAttempt: number
}

function boundedNumber(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (value === undefined) return fallback
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite number.`)
  return Math.min(maximum, Math.max(minimum, value))
}

function normalizeRendererRecoveryOptions(
  value: false | AnyoPlayerRendererRecoveryOptions | undefined,
): NormalizedRendererRecoveryOptions {
  if (value === false) {
    return { enabled: false, automatic: false, maxAttempts: 0, delayMs: 0, backoff: 1, restoreSession: false, fallbackBackend: false, fallbackAfterAttempt: 1 }
  }
  return {
    enabled: value?.enabled !== false,
    automatic: value?.automatic === true,
    maxAttempts: Math.trunc(boundedNumber(value?.maxAttempts, 2, 1, 10, 'rendererRecovery.maxAttempts')),
    delayMs: Math.trunc(boundedNumber(value?.delayMs, 250, 0, 60_000, 'rendererRecovery.delayMs')),
    backoff: boundedNumber(value?.backoff, 2, 1, 10, 'rendererRecovery.backoff'),
    restoreSession: value?.restoreSession !== false,
    fallbackBackend: value?.fallbackBackend ?? false,
    fallbackAfterAttempt: Math.trunc(boundedNumber(value?.fallbackAfterAttempt, 1, 1, 10, 'rendererRecovery.fallbackAfterAttempt')),
  }
}

function cloneRecoveryStatus(status: AnyoPlayerRendererRecoveryStatus): AnyoPlayerRendererRecoveryStatus {
  return { ...status }
}

export interface AnyoPlayerDependencies {
  runtimeFactory?: PlayerRuntimeFactory
  sourceResolver?: SourceResolver
  ui?: PlayerUIController
  sessionStorage?: AnyoPlayerSessionStorage
  inputStorage?: AnyoPlayerInputStorage
  performanceStorage?: AnyoPlayerQualityStorage
  viewStorage?: AnyoPlayerViewStorage
  now?: () => Date
}

function mergeKeyBindings(
  overrides: Partial<AnyoPlayerDesktopKeyBindings> | undefined,
): AnyoPlayerDesktopKeyBindings {
  return {
    forward: overrides?.forward ?? DEFAULT_DESKTOP_KEYS.forward,
    backward: overrides?.backward ?? DEFAULT_DESKTOP_KEYS.backward,
    left: overrides?.left ?? DEFAULT_DESKTOP_KEYS.left,
    right: overrides?.right ?? DEFAULT_DESKTOP_KEYS.right,
    run: overrides?.run ?? DEFAULT_DESKTOP_KEYS.run,
    jump: overrides?.jump ?? DEFAULT_DESKTOP_KEYS.jump,
  }
}

function keyboardBindings(codes: readonly string[]): readonly AnyoPlayerInputBinding[] {
  return codes.map(code => ({ device: 'keyboard' as const, code }))
}

function createDefaultInputBindings(options: AnyoPlayerOptions): AnyoPlayerInputBindingMap {
  const keys = mergeKeyBindings(options.exploration?.keys)
  const interactKeys = options.interaction === false
    ? ['KeyE']
    : options.interaction?.activateKeys ?? ['KeyE']
  return {
    'move-forward': [...keyboardBindings(keys.forward), { device: 'gamepad-axis', axis: 1, direction: -1 }],
    'move-backward': [...keyboardBindings(keys.backward), { device: 'gamepad-axis', axis: 1, direction: 1 }],
    'move-left': [...keyboardBindings(keys.left), { device: 'gamepad-axis', axis: 0, direction: -1 }],
    'move-right': [...keyboardBindings(keys.right), { device: 'gamepad-axis', axis: 0, direction: 1 }],
    'look-up': [{ device: 'gamepad-axis', axis: 3, direction: -1 }],
    'look-down': [{ device: 'gamepad-axis', axis: 3, direction: 1 }],
    'look-left': [{ device: 'gamepad-axis', axis: 2, direction: -1 }],
    'look-right': [{ device: 'gamepad-axis', axis: 2, direction: 1 }],
    run: [...keyboardBindings(keys.run), { device: 'gamepad-button', button: 10 }],
    jump: [...keyboardBindings(keys.jump), { device: 'gamepad-button', button: 0 }],
    interact: [...keyboardBindings(interactKeys), { device: 'gamepad-button', button: 2 }],
    pause: [{ device: 'keyboard', code: 'KeyP' }, { device: 'gamepad-button', button: 9 }],
  }
}

function keyboardCodes(
  bindings: AnyoPlayerInputBindingMap,
  action: AnyoPlayerInputAction,
): readonly string[] {
  return bindings[action]
    .filter((binding): binding is Extract<AnyoPlayerInputBinding, { device: 'keyboard' }> => binding.device === 'keyboard')
    .map(binding => binding.code)
}

function describeInputBinding(binding: AnyoPlayerInputBinding | undefined): string | null {
  if (!binding) return null
  if (binding.device === 'keyboard') {
    if (binding.code.startsWith('Key')) return binding.code.slice(3)
    if (binding.code.startsWith('Digit')) return binding.code.slice(5)
    return binding.code
  }
  if (binding.device === 'gamepad-button') {
    const labels: Record<number, string> = {
      0: 'A / Cross', 1: 'B / Circle', 2: 'X / Square', 3: 'Y / Triangle',
      8: 'View', 9: 'Menu', 10: 'Left stick', 11: 'Right stick',
    }
    return labels[binding.button] ?? `Button ${binding.button}`
  }
  return `Axis ${binding.axis} ${binding.direction > 0 ? '+' : '-'}`
}

async function waitForPendingPreload(
  preload: Promise<ResolvedPlayerSource>,
  signal: AbortSignal,
): Promise<ResolvedPlayerSource> {
  if (signal.aborted) throw signal.reason
  return new Promise<ResolvedPlayerSource>((resolve, reject) => {
    const handleAbort = () => reject(signal.reason)
    signal.addEventListener('abort', handleAbort, { once: true })
    preload.then(
      value => {
        signal.removeEventListener('abort', handleAbort)
        resolve(value)
      },
      error => {
        signal.removeEventListener('abort', handleAbort)
        reject(error)
      },
    )
  })
}

export class AnyoPlayerCore implements AnyoPlayer {
  readonly container: HTMLElement
  readonly canvas: HTMLCanvasElement

  private readonly options: AnyoPlayerOptions
  private readonly host: ContainerHost
  private readonly runtimeFactory: PlayerRuntimeFactory
  private readonly sourceResolver: SourceResolver
  private readonly webSurfaceRegistryValue: WebSurfaceAppRegistry | null
  private readonly webSurfaceRuntimeOptions: false | WebSurfacePluginOptions
  private readonly webSurfaceRegistrationCleanups: Array<() => void>
  private readonly stateMachine = new StateMachine()
  private readonly events = new EventHub<AnyoPlayerEventMap>()
  private readonly actions = new Map<string, ActionRegistration>()
  private readonly ui: PlayerUIController
  private readonly styleController: StyleController
  private readonly desktopInput: DesktopInputController
  private readonly touchInput: TouchInputController
  private readonly inputBindingsController: InputBindingsController
  private readonly gamepadInput: GamepadController
  private readonly desktopEnabled: boolean
  private readonly touchEnabledValue: boolean
  private readonly responsive: ResponsiveController
  private readonly fullscreenController: FullscreenController
  private readonly visibilityController: VisibilityController
  private readonly embeddingController: EmbeddingController
  private readonly xrController: XRController
  private readonly vrEnabledValue: boolean
  private readonly sessionController: SessionController
  private readonly interactionPresentation: InteractionPresentationController
  private readonly accessibilityController: AccessibilityController
  private readonly audioController: AudioController
  private readonly captionController: CaptionController
  private readonly vfxController = new VfxController()
  private readonly mapController: MapController
  private readonly screenshotController: ScreenshotController
  private readonly telemetryController: TelemetryController
  private readonly performanceController: PerformanceController
  private readonly viewPreferenceController: ViewPreferenceController
  private readonly rendererRecoveryOptions: NormalizedRendererRecoveryOptions
  private readonly diagnosticHistoryLimit: number
  private readonly now: () => Date
  private readonly reticleMode: 'pointer-lock' | 'running'
  private navigationOptions: NormalizedNavigationOptions | null
  private readonly worldPreloadCache = new Map<string, ResolvedPlayerSource>()
  private readonly worldPreloadTasks = new Map<string, { controller: AbortController; promise: Promise<ResolvedPlayerSource> }>()

  private activeRuntime: ManagedRuntime | null = null
  private pendingRuntime: ManagedRuntime | null = null
  private activeDocument: WorldDocument | null = null
  private progressValue: RendererAssetProgress = { ...TERMINAL_PROGRESS }
  private errorValue: AnyoPlayerError | null = null
  private phaseValue: AnyoPlayerLoadingPhase = 'idle'
  private readyStatusValue: AnyoPlayerReadyStatus | null = null
  private lastSource: AnyoPlayerSource | undefined
  private currentAbort: AbortController | null = null
  private operationId = 0
  private operationTail: Promise<void> = Promise.resolve()
  private disposalPromise: Promise<void> | null = null
  private pauseReasonValue: AnyoPlayerPauseReason | null = null
  private resumeInputModeAfterPause: AnyoPlayerInputMode | null = null
  private inputModeValue: AnyoPlayerInputMode | null = null
  private interactionPromptValue: AnyoPlayerInteractionPromptState = { ...HIDDEN_INTERACTION_PROMPT }
  private interactionTargetValue: AnyoPlayerInteractionTargetState = { ...EMPTY_INTERACTION_TARGET }
  private reticleValue: AnyoPlayerReticleState = { ...HIDDEN_RETICLE }
  private reticleInteractionContext: AnyoPlayerInteractionContext | null = null
  private interactionPromptTimer: ReturnType<typeof setTimeout> | null = null
  private hoveredInteractionEntity: string | null = null
  private hoveredInteractionPayload: EntityInteractionPayload | null = null
  private suppressInputExit = false
  private xrExitRequested = false
  private replacementContext: ReplacementContext | null = null
  private replacementStage: 'idle' | 'resolving' | 'mutating' = 'idle'
  private sessionRestoreActive = false
  private inputBindingsRestoreAttempted = false
  private diagnosticsValue: AnyoPlayerDiagnosticRecord[] = []
  private diagnosticSequence = 0
  private rendererRecoveryValue: AnyoPlayerRendererRecoveryStatus
  private fallRecoveryValue: AnyoPlayerFallRecoveryStatus = { state: 'idle', attempt: 0, maxAttempts: 3, position: null, message: null }
  private rendererRecoveryTimer: ReturnType<typeof setTimeout> | null = null
  private rendererRecoveryPromise: Promise<void> | null = null
  private rendererRecoverySnapshot: AnyoPlayerSessionSnapshot | null = null
  private activatedValue = false
  private preloadedSource: PreloadedSource | null = null
  private pendingPreload: PendingPreload | null = null
  private currentWorldIdValue: string | null = null
  private sourceInfoValue: AnyoPlayerSourceInfo | null = null
  private activeSourceCleanup: (() => void) | null = null
  private performancePreferenceRestoreAttempted = false
  private viewPreferenceRestoreAttempted = false
  private recoveryRendererBackendOverride: 'auto' | 'webgl2' | null = null
  private navigationValue: AnyoPlayerWorldNavigationStatus = {
    state: 'idle',
    fromWorldId: null,
    toWorldId: null,
    error: null,
  }
  private navigationAbort: AbortController | null = null
  private navigationCommitted = false
  private navigationSequence = 0

  constructor(options: AnyoPlayerOptions, dependencies: AnyoPlayerDependencies = {}) {
    this.options = options
    this.now = dependencies.now ?? (() => new Date())
    this.navigationOptions = normalizeNavigationOptions(options.navigation)
    this.rendererRecoveryOptions = normalizeRendererRecoveryOptions(options.rendererRecovery)
    const diagnosticLimit = options.diagnostics === false ? 0 : options.diagnostics?.historyLimit ?? 50
    if (!Number.isFinite(diagnosticLimit)) throw new TypeError('diagnostics.historyLimit must be a finite number.')
    this.diagnosticHistoryLimit = Math.min(1000, Math.max(0, Math.trunc(diagnosticLimit)))

    const configuredWebSurface = options.webSurface === false ? null : (options.webSurface ?? {})
    if (!configuredWebSurface) {
      this.webSurfaceRegistryValue = null
      this.webSurfaceRuntimeOptions = false
      this.webSurfaceRegistrationCleanups = []
    } else {
      const registry = configuredWebSurface.registry ?? createWebSurfaceAppRegistry()
      const cleanups: Array<() => void> = []
      try {
        for (const [id, app] of Object.entries(configuredWebSurface.apps ?? {})) {
          cleanups.push(registry.register(id, app))
        }
      } catch (error) {
        for (const cleanup of cleanups.reverse()) cleanup()
        throw error
      }
      this.webSurfaceRegistryValue = registry
      this.webSurfaceRegistrationCleanups = cleanups
      this.webSurfaceRuntimeOptions = {
        registry,
        ...(configuredWebSurface.root === undefined ? {} : { root: configuredWebSurface.root }),
        ...(configuredWebSurface.zIndex === undefined ? {} : { zIndex: configuredWebSurface.zIndex }),
        ...(configuredWebSurface.externalUrls === undefined ? {} : { externalUrls: configuredWebSurface.externalUrls }),
        onDiagnostic: diagnostic => this.handleWebSurfaceDiagnostic(
          diagnostic,
          configuredWebSurface.onDiagnostic,
        ),
      }
    }

    this.rendererRecoveryValue = {
      state: 'idle',
      attempt: 0,
      maxAttempts: this.rendererRecoveryOptions.maxAttempts,
      automatic: false,
      diagnosticCode: null,
      error: null,
    }
    this.desktopEnabled = options.exploration?.desktop !== false
    this.vrEnabledValue = options.exploration?.vr === true || typeof options.exploration?.vr === 'object'
    this.host = new ContainerHost(options.container, options.canvas, options.ariaLabel ?? 'Interactive Anyo world')
    this.container = this.host.container
    this.canvas = this.host.canvas
    const resolvedUiOptions = options.ui === false ? undefined : options.ui
    this.styleController = new StyleController(
      this.container,
      resolvedUiOptions?.styles,
      resolvedUiOptions?.theme,
    )
    this.sessionController = new SessionController(this.container, options.session, {
      ...(dependencies.sessionStorage ? { storage: dependencies.sessionStorage } : {}),
      now: this.now,
    })
    this.inputBindingsController = new InputBindingsController(
      this.container,
      createDefaultInputBindings(options),
      options.input,
      dependencies.inputStorage ? { storage: dependencies.inputStorage } : {},
    )
    const viewOptions = options.view === false
      ? false
      : {
          ...(options.view ?? {}),
          ...(options.view?.fieldOfView === undefined && options.renderer?.fieldOfView !== undefined
            ? { fieldOfView: options.renderer.fieldOfView }
            : {}),
        }
    this.viewPreferenceController = new ViewPreferenceController(
      this.container,
      viewOptions,
      dependencies.viewStorage ? { storage: dependencies.viewStorage } : {},
    )
    this.accessibilityController = new AccessibilityController(
      this.container,
      this.canvas,
      options.accessibility,
      {
        onReducedMotionChange: (previous, reducedMotion, preference) => {
          this.events.emit('reducedmotionchange', { previous, reducedMotion, preference })
        },
        onInputModalityChange: (previous, modality) => {
          this.events.emit('inputmodalitychange', { previous, modality })
        },
      },
    )
    this.captionController = new CaptionController(this.now, (previous, caption) => {
      this.ui?.setCaption?.(caption)
      this.events.emit('captionchange', { previous, caption })
    })
    this.audioController = new AudioController(options.audio, {
      onChange: (previousMuted, state, source) => {
        this.ui?.setAudioState?.(state)
        this.events.emit('audiochange', { ...state, previousMuted, source })
      },
      onUnlocked: state => {
        this.ui?.setAudioState?.(state)
        this.events.emit('audiounlocked', state)
      },
      onError: error => {
        this.ui?.setControlError?.(error)
        this.events.emit('audioerror', error)
      },
    })
    this.mapController = new MapController(text => this.ui.setMapAttribution(text))
    this.screenshotController = new ScreenshotController(this.now)
    const touchOption = options.exploration?.touch
    this.touchEnabledValue = touchOption === false
      ? false
      : touchOption === true || typeof touchOption === 'object' || detectTouchCapability(this.container)
    this.runtimeFactory = dependencies.runtimeFactory ?? new DefaultRuntimeFactory()
    this.sourceResolver = dependencies.sourceResolver ?? new SourceResolver({
      ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      ...(options.loading === undefined ? {} : { loading: options.loading }),
    })
    const labels = {
      ...DEFAULT_UI_LABELS,
      ...(options.ui === false ? {} : options.ui?.labels),
    }
    this.touchInput = new TouchInputController(
      this.container,
      this.canvas,
      {
        enabled: this.touchEnabledValue,
        showControls: options.ui !== false && options.ui?.showTouchControls !== false,
        moveLabel: labels.touchMove,
        runLabel: labels.touchRun,
        jumpLabel: labels.touchJump,
        options: asTouchOptions(touchOption),
      },
      {
        onEnterRequest: () => {
        this.accessibilityController.setInputModality('touch')
        return this.enterTouchFromGesture()
      },
        onTap: (clientX, clientY) => this.handleTouchTap(clientX, clientY),
      },
    )
    this.desktopInput = new DesktopInputController(this.canvas, {
      onEnterRequest: source => {
        this.accessibilityController.setInputModality(source)
        this.enterFromGesture()
      },
      onExitRequest: reason => this.handleInputExit(reason),
      onPointerLockChange: locked => {
        this.events.emit('pointerlockchange', { locked })
        this.syncInteractionPresentation()
      },
      onPointerLockError: error => this.handlePointerLockError(error),
      onAction: action => this.handleBoundAction(action, 'keyboard'),
      onActionValue: (action, value, pressed) => {
        if (pressed || Math.abs(value) > 0.01) this.accessibilityController.setInputModality('keyboard')
        this.events.emit('inputaction', { action, value, pressed, device: 'keyboard' })
      },
    })
    const inputOptions = options.input === false ? undefined : options.input
    this.gamepadInput = new GamepadController(
      this.canvas,
      inputOptions?.gamepad,
      this.inputBindingsController.bindings,
      {
        onEnterRequest: index => this.enterGamepadFromActivity(index),
        onExitRequest: () => this.handleGamepadExit(),
        onAction: action => this.handleBoundAction(action, 'gamepad'),
        onActionValue: (action, value, pressed) => {
          if (pressed || Math.abs(value) > 0.01) this.accessibilityController.setInputModality('gamepad')
          this.events.emit('inputaction', { action, value, pressed, device: 'gamepad' })
        },
        onGamepadsChange: (gamepads, activeGamepad) => {
          this.events.emit('gamepadchange', { gamepads, activeGamepad })
        },
        onWarning: message => this.emitWarning(message),
      },
    )
    const uiOptions = options.ui === false
      ? false
      : {
          ...(options.ui ?? {}),
          ...(options.fullscreen === false || options.fullscreen?.enabled === false
            ? { showFullscreenControl: false }
            : {}),
          ...(options.audio === false ? { showAudioControl: false } : {}),
        }
    this.ui = dependencies.ui ?? createPlayerUI(
      this.container,
      uiOptions,
      () => this.retry(),
      () => this.enterFromGesture(),
      () => this.togglePauseFromGesture(),
      () => this.toggleFullscreen(),
      () => this.toggleVRFromGesture(),
      () => this.interact(),
      () => this.toggleAudioFromGesture(),
      () => this.captureScreenshotFromMenu(),
      options.pauseMenu,
      this.audioController.state,
      {
        options: options.accessibility,
        isKeyboardModality: () => this.accessibilityController.keyboardActive,
      },
      error => options.onWarning?.(`Anyo Player UI adapter failed: ${error instanceof Error ? error.message : String(error)}`),
    )
    this.ui.setAudioState(this.audioController.state)
    this.ui.setCaption?.(this.captionController.state)
    const interactionOptions = options.interaction === false ? undefined : options.interaction
    const reticleOptions = asReticleOptions(interactionOptions?.reticle)
    this.reticleMode = reticleOptions.mode ?? 'pointer-lock'
    this.interactionPresentation = new InteractionPresentationController(
      this.canvas,
      reticleOptions,
      {
        onTargetChange: (target, context) => this.handleInteractionTargetChange(target, context),
        onActivateStart: target => this.handleInteractionActivateStart(target),
        onActivateComplete: (target, selected) => this.handleInteractionActivateComplete(target, selected),
        onError: error => this.handleInteractionError(error),
      },
    )

    this.xrController = new XRController(
      this.vrEnabledValue,
      asVROptions(options.exploration?.vr),
      {
        onSupportChange: (previous, state) => this.handleVRSupportChange(previous, state),
        onStateChange: (previous, state) => this.handleXRStateChange(previous, state),
        onSessionStart: () => this.handleXRSessionStart(),
        onSessionEnd: () => this.handleXRSessionEnd(),
        onInputsChange: inputs => this.handleXRInputsChange(inputs),
        onTrackingChange: (previous, state) => this.handleXRTrackingChange(previous, state),
        onReferenceSpaceReset: () => this.emitWarning('The XR reference space was reset by the browser.'),
        onError: error => this.handleXRError(error),
      },
    )
    this.ui.setVRSupport(this.xrController.supportState)
    this.responsive = new ResponsiveController(
      this.container,
      options.resize,
      options.renderer?.pixelRatio,
      options.renderer?.maxPixelRatio,
      {
        onResize: event => this.events.emit('resize', event),
        onWarning: message => this.emitWarning(message),
      },
    )
    this.fullscreenController = new FullscreenController(
      this.container,
      this.canvas,
      options.fullscreen,
      {
        onChange: fullscreen => {
          this.ui.setFullscreen(fullscreen)
          this.events.emit('fullscreenchange', { fullscreen })
          this.responsive.resizeNow(true)
        },
        onError: error => this.handleFullscreenError(error),
      },
    )
    this.visibilityController = new VisibilityController(
      this.container.ownerDocument,
      options.visibility,
      {
        onHidden: () => {
          this.performanceController?.setActive(false)
          this.handleVisibilityHidden()
        },
        onVisible: () => {
          this.performanceController?.setActive(this.container.ownerDocument.hasFocus?.() !== false)
          this.handleVisibilityVisible()
        },
        onUnfocused: () => {
          if (this.visibilityController?.reduceWhenUnfocused) this.performanceController?.setActive(false)
        },
        onFocused: () => {
          if (this.visibilityController?.reduceWhenUnfocused) this.performanceController?.setActive(!this.container.ownerDocument.hidden)
        },
      },
    )
    this.embeddingController = new EmbeddingController(
      this.container,
      options.embedding,
      {
        onIntersectionChange: (previous, state) => {
          this.events.emit('intersectionchange', { previous, state })
          this.emitTelemetry('embedding.intersection-change', { previous, state }, 'lifecycle')
        },
        onVisible: () => this.handleIntersectionVisible(),
        onHidden: () => this.handleIntersectionHidden(),
        onPosterChange: visible => this.events.emit('posterchange', { visible }),
      },
    )
    this.telemetryController = new TelemetryController(
      options.analytics,
      {
        onEvent: event => this.events.emit('telemetry', event),
        onError: error => {
          this.events.emit('analyticserror', error)
          this.options.onWarning?.(error.message)
          this.ui.handleWarning(error.message)
          this.events.emit('warning', { message: error.message })
        },
      },
      this.now,
    )
    const performanceOptions = options.performance === false
      ? false
      : {
          ...(options.performance ?? {}),
          ...(options.performance?.inactiveRenderScale === undefined && options.visibility !== false && options.visibility?.unfocusedRenderScale !== undefined
            ? { inactiveRenderScale: options.visibility.unfocusedRenderScale }
            : {}),
        }
    this.performanceController = new PerformanceController(performanceOptions, {
      onChange: event => this.events.emit('performancechange', event),
      onQualityApplied: (quality, renderScale) => this.emitTelemetry(
        'renderer.quality-applied',
        { quality, renderScale },
        'renderer',
      ),
    }, {
      ...(dependencies.performanceStorage ? { storage: dependencies.performanceStorage } : {}),
      ...(options.renderer?.optimization ? { rendererOptimization: options.renderer.optimization } : {}),
    })
    this.responsive.start()
    this.syncAccessibilityBindings(this.inputBindingsController.bindings)
    const initialNavigationWorld = this.navigationOptions?.initialWorld
      ? this.navigationOptions.worlds.get(this.navigationOptions.initialWorld) ?? null
      : null
    this.lastSource = options.source ?? initialNavigationWorld?.source
    this.currentWorldIdValue = this.lastSource === undefined ? null : this.findNavigationWorldId(this.lastSource)
    queueMicrotask(() => this.initializeEmbeddingLifecycle())
  }

  get state(): AnyoPlayerState {
    return this.stateMachine.state
  }

  get phase(): AnyoPlayerLoadingPhase {
    return this.phaseValue
  }

  get readyStatus(): AnyoPlayerReadyStatus | null {
    return this.readyStatusValue
  }

  get world(): World | null {
    return this.activeRuntime?.world ?? null
  }

  get webSurfaceRegistry(): WebSurfaceAppRegistry | null {
    return this.webSurfaceRegistryValue
  }

  get progress(): RendererAssetProgress {
    return { ...this.progressValue }
  }

  get error(): AnyoPlayerError | null {
    return this.errorValue
  }

  get entered(): boolean {
    return this.state === 'running' && this.inputModeValue !== null
  }

  get inputMode(): AnyoPlayerInputMode | null {
    return this.inputModeValue
  }

  get touchEnabled(): boolean {
    return this.touchEnabledValue
  }

  get pointerLocked(): boolean {
    return this.desktopInput.pointerLocked
  }

  get paused(): boolean {
    return this.state === 'paused'
  }

  get pauseReason(): AnyoPlayerPauseReason | null {
    return this.pauseReasonValue
  }

  get fullscreen(): boolean {
    return this.fullscreenController.fullscreen
  }

  get viewport(): AnyoPlayerResizeEvent {
    return this.responsive.viewport
  }

  get interactionPrompt(): AnyoPlayerInteractionPromptState {
    return { ...this.interactionPromptValue }
  }

  get interactionTarget(): AnyoPlayerInteractionTargetState {
    return { ...this.interactionTargetValue }
  }

  get reticle(): AnyoPlayerReticleState {
    return { ...this.reticleValue }
  }

  get vrEnabled(): boolean {
    return this.vrEnabledValue
  }

  get vrSupportState(): AnyoPlayerVRSupportState {
    return this.xrController.supportState
  }

  get vrSupported(): boolean | null {
    return this.xrController.supported
  }

  get xrState(): XRSessionState {
    return this.xrController.state
  }

  get xrTracking(): AnyoPlayerXRTrackingState {
    return this.xrController.tracking
  }

  get xrInputs(): readonly XRInputSnapshot[] {
    return this.xrController.inputs
  }

  get sessionEnabled(): boolean {
    return this.sessionController.enabled
  }

  get sessionStorageAvailable(): boolean {
    return this.sessionController.storageAvailable
  }

  get sessionKey(): string | null {
    return this.sessionController.storageKey
  }

  get inputBindings(): AnyoPlayerInputBindingMap {
    return this.inputBindingsController.bindings
  }

  get inputBindingsStorageAvailable(): boolean {
    return this.inputBindingsController.storageAvailable
  }

  get inputBindingsKey(): string | null {
    return this.inputBindingsController.storageKey
  }

  get gamepadEnabled(): boolean {
    return this.gamepadInput.enabled
  }

  get gamepads(): readonly AnyoPlayerGamepadState[] {
    return this.gamepadInput.gamepads
  }

  get activeGamepad(): number | null {
    return this.gamepadInput.activeGamepad
  }

  get reducedMotion(): boolean {
    return this.accessibilityController.reducedMotion
  }

  get reducedMotionPreference(): AnyoPlayerReducedMotionPreference {
    return this.accessibilityController.preference
  }

  get inputModality(): AnyoPlayerInputModality {
    return this.accessibilityController.inputModality
  }

  get audio(): AnyoPlayerAudioState {
    return this.audioController.state
  }

  get rendererRecovery(): AnyoPlayerRendererRecoveryStatus {
    return cloneRecoveryStatus(this.rendererRecoveryValue)
  }

  get performance(): AnyoPlayerPerformanceSnapshot {
    return this.performanceController.snapshot
  }

  get qualityPreference(): AnyoPlayerQualityPreferenceSnapshot {
    return this.performanceController.preference
  }

  get deviceProfile() {
    return this.performanceController.deviceProfile
  }

  get viewPreference(): AnyoPlayerViewPreferenceSnapshot {
    return this.viewPreferenceController.preference
  }

  get sourceInfo(): AnyoPlayerSourceInfo | null {
    return this.sourceInfoValue ? structuredClone(this.sourceInfoValue) : null
  }

  get health(): AnyoPlayerRuntimeHealth {
    return this.createRuntimeHealth()
  }

  get caption(): AnyoPlayerCaptionState {
    return this.captionController.state
  }

  get cameraMode(): AnyoPlayerCameraMode {
    return this.activeRuntime?.camera?.mode ?? 'explore'
  }

  get characterAnchorEntity(): string | null {
    return this.activeRuntime?.camera?.characterAnchorEntity ?? null
  }

  get viewState() { return this.activeRuntime?.camera?.viewState ?? null }

  get locomotion() { return this.activeRuntime?.camera?.locomotion ?? null }

  get thirdPersonCameraEnabled(): boolean {
    return this.activeRuntime?.camera?.thirdPersonCameraEnabled ?? false
  }

  get fallRecovery(): AnyoPlayerFallRecoveryStatus {
    return structuredClone(this.fallRecoveryValue)
  }

  get diagnostics(): readonly AnyoPlayerDiagnosticRecord[] {
    return this.diagnosticsValue.map(record => structuredClone(record))
  }

  get telemetry(): readonly AnyoPlayerTelemetryEvent[] {
    return this.telemetryController.history
  }

  get activated(): boolean {
    return this.activatedValue
  }

  get preloaded(): boolean {
    return this.preloadedSource !== null
  }

  get intersection(): AnyoPlayerIntersectionState {
    return this.embeddingController.intersection
  }

  get posterVisible(): boolean {
    return this.embeddingController.posterVisible
  }

  get worldIds(): readonly string[] {
    return this.navigationOptions ? [...this.navigationOptions.worlds.keys()] : []
  }

  get currentWorldId(): string | null {
    return this.currentWorldIdValue
  }

  get navigation(): AnyoPlayerWorldNavigationStatus {
    return cloneNavigationStatus(this.navigationValue)
  }

  get theme(): Readonly<AnyoPlayerThemeTokens> {
    return this.styleController.theme
  }

  registerWorld(worldId: string, source: AnyoPlayerSource | AnyoPlayerWorldDefinition, options: AnyoPlayerWorldRegistrationOptions = {}): () => void {
    this.assertNotDisposed()
    const definition = normalizeWorldDefinition(worldId, source)
    if (!this.navigationOptions) this.navigationOptions = { worlds: new Map(), initialWorld: null, transition: normalizeTransitionOptions(undefined) }
    const previous = this.navigationOptions.worlds.get(definition.id)
    if (previous && options.replace !== true) throw new AnyoPlayerError('PLAYER_NAVIGATION_WORLD_EXISTS', `World "${definition.id}" is already registered.`)
    this.cancelWorldPreload(definition.id)
    this.releaseResolvedSource(this.worldPreloadCache.get(definition.id))
    this.worldPreloadCache.delete(definition.id)
    this.navigationOptions.worlds.set(definition.id, definition)
    let active = true
    return () => {
      if (!active) return
      active = false
      const current = this.navigationOptions?.worlds.get(definition.id)
      if (current !== definition || this.currentWorldIdValue === definition.id) return
      this.cancelWorldPreload(definition.id)
      this.releaseResolvedSource(this.worldPreloadCache.get(definition.id))
      this.worldPreloadCache.delete(definition.id)
      if (previous) this.navigationOptions?.worlds.set(definition.id, previous)
      else this.navigationOptions?.worlds.delete(definition.id)
    }
  }

  unregisterWorld(worldId: string): boolean {
    this.assertNotDisposed()
    const id = worldId.trim()
    if (!id || !this.navigationOptions?.worlds.has(id) || id === this.currentWorldIdValue) return false
    this.cancelWorldPreload(id)
    this.releaseResolvedSource(this.worldPreloadCache.get(id))
    this.worldPreloadCache.delete(id)
    return this.navigationOptions.worlds.delete(id)
  }

  async preloadWorld(worldId: string): Promise<WorldDocument> {
    this.assertNotDisposed()
    const entry = this.getNavigationWorld(worldId)
    const cached = this.worldPreloadCache.get(entry.id)
    if (cached) return structuredClone(cached.document)
    const existing = this.worldPreloadTasks.get(entry.id)
    if (existing) return structuredClone((await existing.promise).document)
    const controller = new AbortController()
    const promise = this.sourceResolver.resolve(entry.source, controller.signal)
    this.worldPreloadTasks.set(entry.id, { controller, promise })
    let resolved: ResolvedPlayerSource | null = null
    let stored = false
    try {
      resolved = await promise
      this.assertNotDisposed()
      this.worldPreloadCache.set(entry.id, cloneResolvedSource(resolved))
      stored = true
      const document = structuredClone(resolved.document)
      this.events.emit('worldpreloaded', { worldId: entry.id, source: entry.source, document })
      this.emitTelemetry('navigation.world-preloaded', { worldId: entry.id }, 'lifecycle')
      return document
    } catch (cause) {
      throw toPlayerError(cause, controller.signal.aborted ? 'PLAYER_NAVIGATION_CANCELED' : 'PLAYER_NAVIGATION_FAILED', `Could not preload world "${entry.id}".`)
    } finally {
      if (!stored) this.releaseResolvedSource(resolved)
      const current = this.worldPreloadTasks.get(entry.id)
      if (current?.controller === controller) this.worldPreloadTasks.delete(entry.id)
    }
  }

  clearWorldPreload(worldId?: string): void {
    this.assertNotDisposed()
    if (worldId === undefined) {
      for (const resolved of this.worldPreloadCache.values()) this.releaseResolvedSource(resolved)
      this.worldPreloadCache.clear()
      return
    }
    const id = this.getNavigationWorld(worldId).id
    this.releaseResolvedSource(this.worldPreloadCache.get(id))
    this.worldPreloadCache.delete(id)
  }

  cancelWorldPreload(worldId?: string): boolean {
    this.assertNotDisposed()
    return this.cancelWorldPreloadTasks(worldId)
  }

  private cancelWorldPreloadTasks(worldId?: string): boolean {
    let canceled = false
    const ids = worldId === undefined ? [...this.worldPreloadTasks.keys()] : [worldId.trim()]
    for (const id of ids) {
      const task = this.worldPreloadTasks.get(id)
      if (!task || task.controller.signal.aborted) continue
      task.controller.abort(new AnyoPlayerError('PLAYER_NAVIGATION_CANCELED', `World preload "${id}" was canceled.`))
      this.worldPreloadTasks.delete(id)
      canceled = true
    }
    return canceled
  }

  async navigateTo(worldId: string, options: AnyoPlayerNavigateOptions = {}): Promise<void> {
    this.assertNotDisposed()
    const entry = this.getNavigationWorld(worldId)
    if (entry.id === this.currentWorldIdValue && this.activeRuntime && options.force !== true) return
    if (this.navigationCommitted) {
      throw new AnyoPlayerError(
        'PLAYER_NAVIGATION_BUSY',
        'The current world navigation has already started committing to the Anyo runtime.',
      )
    }

    this.cancelNavigation()
    const sequence = ++this.navigationSequence
    const controller = new AbortController()
    this.navigationAbort = controller
    const fromWorldId = this.currentWorldIdValue
    const transition = normalizeTransitionOptions(options.transition, this.navigationOptions?.transition)
    const startedAt = Date.now()
    const context = {
      fromWorldId,
      toWorldId: entry.id,
      source: entry.source,
      signal: controller.signal,
    }
    this.setNavigationPresentation(transition.presentation, 'preparing')
    this.setNavigation({ state: 'preparing', fromWorldId, toWorldId: entry.id, error: null })
    this.events.emit('worldnavigationstart', { fromWorldId, toWorldId: entry.id, source: entry.source })
    this.emitTelemetry('navigation.started', { fromWorldId, toWorldId: entry.id }, 'lifecycle')

    try {
      await transition.beforeSwitch?.(context)
      this.assertNavigationCurrent(sequence, controller)
      let resolved = this.worldPreloadCache.get(entry.id)
      if (!resolved) {
        resolved = await this.sourceResolver.resolve(entry.source, controller.signal)
        this.assertNavigationCurrent(sequence, controller)
        this.worldPreloadCache.set(entry.id, cloneResolvedSource(resolved))
        const document = structuredClone(resolved.document)
        this.events.emit('worldpreloaded', { worldId: entry.id, source: entry.source, document })
      }

      this.navigationCommitted = true
      this.setNavigationPresentation(transition.presentation, 'switching')
      this.setNavigation({ state: 'switching', fromWorldId, toWorldId: entry.id, error: null })
      this.releaseResolvedSource(this.preloadedSource?.resolved)
      this.preloadedSource = { source: entry.source, resolved: cloneResolvedSource(resolved) }
      if (resolved.cleanup) this.worldPreloadCache.delete(entry.id)
      if (this.activeRuntime && this.activeDocument) await this.replaceWorld(entry.source)
      else await this.load(entry.source)
      this.lastSource = entry.source
      await waitForMinimumDuration(startedAt, transition.minimumDuration)
      this.assertNavigationCurrent(sequence, controller, true)
      this.currentWorldIdValue = entry.id
      const world = this.activeRuntime?.world
      if (!world) throw new AnyoPlayerError('PLAYER_NAVIGATION_FAILED', 'The destination world did not become active.')
      if (transition.afterSwitch) {
        try {
          await transition.afterSwitch({ ...context, world })
        } catch (hookError) {
          this.emitWarning(`Anyo Player afterSwitch hook failed after navigating to "${entry.id}": ${String(hookError)}`)
        }
      }
      this.setNavigation({ state: 'completed', fromWorldId, toWorldId: entry.id, error: null })
      this.events.emit('worldnavigationcomplete', { fromWorldId, toWorldId: entry.id, source: entry.source, world })
      this.emitTelemetry('navigation.completed', { fromWorldId, toWorldId: entry.id }, 'lifecycle')
    } catch (cause) {
      const canceled = controller.signal.aborted && !this.navigationCommitted
      if (canceled) {
        const error = new AnyoPlayerError('PLAYER_NAVIGATION_CANCELED', 'World navigation was canceled.', { cause })
        this.setNavigation({ state: 'canceled', fromWorldId, toWorldId: entry.id, error })
        this.events.emit('worldnavigationcanceled', { fromWorldId, toWorldId: entry.id, source: entry.source })
        this.emitTelemetry('navigation.canceled', { fromWorldId, toWorldId: entry.id }, 'lifecycle')
        throw error
      }
      const error = toPlayerError(cause, 'PLAYER_NAVIGATION_FAILED', `Could not navigate to world "${entry.id}".`)
      this.setNavigation({ state: 'failed', fromWorldId, toWorldId: entry.id, error })
      this.events.emit('worldnavigationerror', { fromWorldId, toWorldId: entry.id, source: entry.source, error })
      this.emitTelemetry('navigation.failed', { fromWorldId, toWorldId: entry.id, code: error.code }, 'lifecycle')
      throw error
    } finally {
      if (this.navigationSequence === sequence) {
        this.navigationAbort = null
        this.navigationCommitted = false
        this.setNavigationPresentation('none', null)
      }
    }
  }

  cancelNavigation(): boolean {
    this.assertNotDisposed()
    if (!this.navigationAbort || this.navigationCommitted || this.navigationAbort.signal.aborted) return false
    this.navigationAbort.abort(new AnyoPlayerError('PLAYER_NAVIGATION_CANCELED', 'World navigation was canceled by the host.'))
    return true
  }

  async preload(source: AnyoPlayerSource | undefined = this.lastSource): Promise<WorldDocument> {
    this.assertNotDisposed()
    if (source === undefined) {
      throw new AnyoPlayerError('PLAYER_INVALID_SOURCE', 'No Anyo Player source was provided for preloading.')
    }
    this.lastSource = source
    if (this.preloadedSource && samePlayerSource(this.preloadedSource.source, source)) {
      return structuredClone(this.preloadedSource.resolved.document)
    }
    if (this.pendingPreload && samePlayerSource(this.pendingPreload.source, source)) {
      const resolved = await this.pendingPreload.promise
      return structuredClone(resolved.document)
    }

    this.clearPreload()
    const controller = new AbortController()
    const promise = this.sourceResolver.resolve(source, controller.signal)
    const pending: PendingPreload = { source, controller, promise }
    this.pendingPreload = pending
    let resolved: ResolvedPlayerSource | null = null
    let stored = false
    try {
      resolved = await promise
      this.assertNotDisposed()
      if (this.pendingPreload !== pending) {
        throw new AnyoPlayerError('PLAYER_OPERATION_SUPERSEDED', 'Anyo Player preloading was superseded by a newer source.')
      }
      this.preloadedSource = { source, resolved: cloneResolvedSource(resolved) }
      stored = true
      const document = structuredClone(resolved.document)
      this.events.emit('preloaded', { source, document })
      this.emitTelemetry('embedding.source-preloaded', {
        documentVersion: document.version,
        documentUrl: resolved.documentUrl ?? null,
      }, 'lifecycle')
      return document
    } catch (error) {
      if (this.state === 'disposing' || this.state === 'disposed') throw error
      const playerError = toPlayerError(error, 'PLAYER_PRELOAD_FAILED', 'Anyo Player could not preload the world source.')
      this.emitWarning(playerError.message)
      throw playerError
    } finally {
      if (!stored) this.releaseResolvedSource(resolved)
      if (this.pendingPreload === pending) this.pendingPreload = null
    }
  }

  clearPreload(): void {
    this.pendingPreload?.controller.abort(new AnyoPlayerError(
      'PLAYER_OPERATION_SUPERSEDED',
      'Anyo Player preloading was cleared.',
    ))
    this.pendingPreload = null
    this.releaseResolvedSource(this.preloadedSource?.resolved)
    this.preloadedSource = null
  }

  activate(): Promise<void> {
    this.assertNotDisposed()
    this.setActivated(true)
    if (this.activeRuntime && ['ready', 'entering', 'running', 'paused', 'vr-entering', 'vr-active', 'vr-exiting'].includes(this.state)) {
      return Promise.resolve()
    }
    if (this.state === 'loading' || this.state === 'replacing') return this.operationTail
    return this.load(this.lastSource)
  }

  load(source: AnyoPlayerSource | undefined = this.lastSource): Promise<void> {
    this.assertCanLoad()
    this.setActivated(true)
    this.embeddingController.handleLoadStart()
    if (source === undefined) {
      const error = new AnyoPlayerError(
        'PLAYER_INVALID_SOURCE',
        'No Anyo Player source was provided.',
      )
      this.errorValue = error
      this.readyStatusValue = null
      this.transition('error')
      this.setPhase('error')
      this.ui.setError(error)
      this.events.emit('error', error)
      return Promise.reject(error)
    }

    this.lastSource = source
    this.errorValue = null
    this.inputModeValue = null
    this.touchInput.setVisible(false)
    this.clearInteractionPrompt()
    this.stopInteractionPresentation()
    this.readyStatusValue = null
    this.progressValue = { ...TERMINAL_PROGRESS, ratio: 0 }
    this.emitProgress()
    if (this.state === 'idle' || this.state === 'error') this.transition('loading')
    this.setPhase('resolving-source')

    const operationId = ++this.operationId
    this.currentAbort?.abort(new AnyoPlayerError(
      'PLAYER_OPERATION_SUPERSEDED',
      'Anyo Player loading was superseded by a newer operation.',
    ))
    const abortController = new AbortController()
    this.currentAbort = abortController

    const run = this.operationTail.then(() => this.performLoad(operationId, source, abortController))
    this.operationTail = run.then(() => undefined, () => undefined)
    return run
  }

  async replaceWorld(source: AnyoPlayerSource): Promise<void> {
    this.assertNotDisposed()
    if (!this.activeRuntime || !this.activeDocument) return this.load(source)

    if (this.state === 'vr-entering' || this.state === 'vr-active') {
      await this.exitVR()
    } else if (this.state === 'vr-exiting') {
      throw new AnyoPlayerError(
        'PLAYER_INVALID_STATE',
        'Wait for the active VR session to finish exiting before replacing the world.',
      )
    }

    if (this.state === 'replacing' && this.replacementStage !== 'resolving') {
      throw new AnyoPlayerError(
        'PLAYER_INVALID_STATE',
        'The current world replacement has already started mutating the Anyo runtime.',
      )
    }
    if (!['ready', 'entering', 'running', 'paused', 'replacing'].includes(this.state)) {
      throw new AnyoPlayerError(
        'PLAYER_INVALID_STATE',
        `replaceWorld() requires a loaded world, not state "${this.state}".`,
      )
    }

    if (!this.replacementContext) {
      const wasPaused = this.state === 'paused'
      this.replacementContext = {
        returnState: wasPaused ? 'paused' : 'ready',
        pauseReason: wasPaused ? this.pauseReasonValue : null,
        previousSource: this.lastSource,
        previousDocument: structuredClone(this.activeDocument),
        previousProgress: { ...this.progressValue },
        previousReadyStatus: this.readyStatusValue ?? 'ready',
      }

      if (this.state === 'running' || this.state === 'entering') {
        this.deactivateActiveInput(true)
        this.events.emit('exited', { reason: 'replace-world' })
      }
      this.inputModeValue = null
      this.touchInput.setVisible(false)
      this.clearInteractionPrompt()
      this.transition('replacing')
    }

    this.errorValue = null
    this.readyStatusValue = null
    this.progressValue = { ...TERMINAL_PROGRESS, ratio: 0 }
    this.emitProgress()
    this.setPhase('resolving-source')
    this.replacementStage = 'resolving'
    this.events.emit('worldreplacing', { world: this.activeRuntime.world, source })

    const operationId = ++this.operationId
    this.activeRuntime.operationId = operationId
    this.currentAbort?.abort(new AnyoPlayerError(
      'PLAYER_OPERATION_SUPERSEDED',
      'Anyo Player world replacement was superseded by a newer source.',
    ))
    const abortController = new AbortController()
    this.currentAbort = abortController

    const run = this.operationTail.then(() => this.performReplacement(
      operationId,
      source,
      abortController,
    ))
    this.operationTail = run.then(() => undefined, () => undefined)
    return run
  }

  retry(): Promise<void> {
    if (this.state !== 'error') {
      return Promise.reject(new AnyoPlayerError(
        'PLAYER_INVALID_STATE',
        `retry() requires the player to be in the "error" state, not "${this.state}".`,
      ))
    }
    if (this.errorValue?.code === 'PLAYER_RENDERER_LOST' && this.rendererRecoveryOptions.enabled) {
      return this.recoverRenderer()
    }
    return this.load(this.lastSource)
  }

  enter(): void {
    this.assertNotDisposed()
    if (!this.desktopEnabled) {
      throw new AnyoPlayerError(
        'PLAYER_INVALID_STATE',
        'Desktop exploration is disabled for this Anyo Player.',
      )
    }
    if (this.state !== 'ready' || !this.activeRuntime) {
      throw new AnyoPlayerError(
        'PLAYER_INVALID_STATE',
        `enter() requires the player to be in the "ready" state, not "${this.state}".`,
      )
    }

    if (this.audioController.unlockOnEnter && !this.audioController.state.unlocked) {
      void this.unlockAudio().catch(() => undefined)
    }
    this.transition('entering')
    this.ui.setEntering()
    this.touchInput.deactivate()
    this.touchInput.setVisible(false)
    this.inputModeValue = 'desktop'
    this.clearInteractionPrompt()
    const pointerLockRequested = this.desktopInput.activate()
    if ((this.state as AnyoPlayerState) !== 'entering') return

    this.transition('running')
    this.ui.setRunning()
    this.embeddingController.handleEntered()
    this.syncInteractionPresentation()
    this.events.emit('entered', {
      world: this.activeRuntime.world,
      mode: 'desktop',
      pointerLockRequested,
    })
  }

  setCameraMode(mode: AnyoPlayerCameraMode, options: AnyoPlayerCameraModeOptions = {}): void {
    this.assertNotDisposed()
    const runtime = this.activeRuntime
    if (!runtime || !['ready', 'entering', 'running', 'paused'].includes(this.state)) {
      throw new AnyoPlayerError('PLAYER_INVALID_STATE', `Camera mode requires a loaded world, not state "${this.state}".`)
    }
    if (mode !== 'explore' && (this.state === 'running' || this.state === 'entering')) {
      this.deactivateActiveInput(true)
      this.inputModeValue = null
      this.transition('ready')
      this.ui.setReady(this.readyStatusValue ?? 'ready', this.progressValue, false)
      this.touchInput.setVisible(false)
      this.clearInteractionPrompt()
      this.events.emit('exited', { reason: 'camera-mode' })
    }
    if (!runtime.camera) {
      if (mode !== 'explore') throw new AnyoPlayerError('PLAYER_INVALID_STATE', 'This custom Player runtime does not provide inspection camera controls.')
      return
    }
    runtime.camera.setMode(mode, options)
  }

  async setCharacterAnchor(options: false | AnyoPlayerCharacterAnchorOptions): Promise<void> {
    this.assertNotDisposed()
    const runtime = this.activeRuntime
    if (!runtime || !['ready', 'entering', 'running', 'paused'].includes(this.state)) {
      throw new AnyoPlayerError('PLAYER_INVALID_STATE', `Character anchor requires a loaded world, not state "${this.state}".`)
    }
    if (!runtime.camera) {
      throw new AnyoPlayerError('PLAYER_INVALID_STATE', 'This custom Player runtime does not provide character anchoring.')
    }
    runtime.camera.setCharacterAnchor(options)
    await runtime.world.flushRuntimeTransforms()
  }

  setThirdPersonCamera(options: false | AnyoPlayerThirdPersonCameraOptions): void {
    this.assertNotDisposed()
    const runtime = this.activeRuntime
    if (!runtime || !['ready', 'entering', 'running', 'paused'].includes(this.state)) {
      throw new AnyoPlayerError('PLAYER_INVALID_STATE', `Third-person camera requires a loaded world, not state "${this.state}".`)
    }
    if (!runtime.camera) {
      throw new AnyoPlayerError('PLAYER_INVALID_STATE', 'This custom Player runtime does not provide third-person camera controls.')
    }
    runtime.camera.setThirdPersonCamera(options)
  }

  setThirdPersonShoulder(side: AnyoPlayerThirdPersonShoulderSide, offset?: number): void {
    this.assertNotDisposed()
    const runtime = this.activeRuntime
    if (!runtime || !['ready', 'entering', 'running', 'paused'].includes(this.state)) {
      throw new AnyoPlayerError('PLAYER_INVALID_STATE', `Third-person shoulder controls require a loaded world, not state "${this.state}".`)
    }
    if (!runtime.camera) {
      throw new AnyoPlayerError('PLAYER_INVALID_STATE', 'This custom Player runtime does not provide third-person camera controls.')
    }
    runtime.camera.setThirdPersonShoulder(side, offset)
  }

  swapThirdPersonShoulder(): AnyoPlayerThirdPersonShoulderSide {
    this.assertNotDisposed()
    const runtime = this.activeRuntime
    if (!runtime || !['ready', 'entering', 'running', 'paused'].includes(this.state)) {
      throw new AnyoPlayerError('PLAYER_INVALID_STATE', `Third-person shoulder controls require a loaded world, not state "${this.state}".`)
    }
    if (!runtime.camera) {
      throw new AnyoPlayerError('PLAYER_INVALID_STATE', 'This custom Player runtime does not provide third-person camera controls.')
    }
    return runtime.camera.swapThirdPersonShoulder()
  }

  frameCamera(options: AnyoPlayerCameraFrameOptions = {}): void {
    this.assertNotDisposed()
    if (!this.activeRuntime) throw new AnyoPlayerError('PLAYER_INVALID_STATE', 'Camera framing requires a loaded world.')
    if (!this.activeRuntime.camera) throw new AnyoPlayerError('PLAYER_INVALID_STATE', 'This custom Player runtime does not provide camera framing.')
    this.activeRuntime.camera.frame(options)
  }

  teleport(options: AnyoPlayerTeleportOptions): void {
    this.assertNotDisposed()
    const runtime = this.activeRuntime
    if (!runtime) throw new AnyoPlayerError('PLAYER_INVALID_STATE', 'Teleport requires a loaded world.')
    if (runtime.camera) runtime.camera.teleport(options)
    else {
      runtime.renderer.camera.setPosition([...options.position] as [number, number, number])
      if (options.rotation) runtime.renderer.camera.setRotation(options.rotation[0], options.rotation[1])
      runtime.world.exploration.clearInput()
    }
    const view = runtime.camera?.viewState
    const rotation = view ? [view.yaw, view.pitch] : runtime.renderer.camera.getRotation()
    this.events.emit('teleported', {
      position: [...(view?.eye ?? runtime.renderer.camera.getPosition())] as [number, number, number],
      rotation: [rotation[0], rotation[1]],
      resetMotion: options.resetMotion !== false,
    })
  }

  resetToSpawn(): void {
    this.assertNotDisposed()
    const runtime = this.activeRuntime
    const document = this.activeDocument
    if (!runtime || !document) throw new AnyoPlayerError('PLAYER_INVALID_STATE', 'Reset to spawn requires a loaded world.')
    const exploration = document.exploration
    const position = exploration?.spawn?.position
      ?? [0, exploration?.eyeHeight ?? 1.65, 0]
    const room = exploration?.spawn?.room ? runtime.world.compiled?.roomById.get(exploration.spawn.room) : null
    const resolved = room ? [(room.bounds.min[0] + room.bounds.max[0]) / 2 + position[0], room.bounds.min[1] + position[1], (room.bounds.min[2] + room.bounds.max[2]) / 2 + position[2]] : position
    if (exploration?.spawn?.room) runtime.world.setCurrentRoom(exploration.spawn.room)
    this.teleport({ position: [...resolved] as [number, number, number], rotation: [0, 0], resetMotion: true, clearInput: true })
  }

  setQualityPreset(preset: AnyoPlayerQualityPreset): AnyoPlayerPerformanceSnapshot {
    this.assertNotDisposed()
    const previous = this.performanceController.preference
    const performance = this.performanceController.setQuality(preset)
    this.emitQualityPreferenceChange(previous, 'runtime')
    this.persistQualityPreferenceIfConfigured()
    return performance
  }

  setTargetFps(targetFps: number): AnyoPlayerPerformanceSnapshot {
    this.assertNotDisposed()
    const previous = this.performanceController.preference
    const performance = this.performanceController.setTargetFps(targetFps)
    this.emitQualityPreferenceChange(previous, 'runtime')
    this.persistQualityPreferenceIfConfigured()
    return performance
  }

  setDynamicResolution(enabled: boolean): AnyoPlayerPerformanceSnapshot {
    this.assertNotDisposed()
    const previous = this.performanceController.preference
    const performance = this.performanceController.setDynamicResolution(enabled)
    this.emitQualityPreferenceChange(previous, 'runtime')
    this.persistQualityPreferenceIfConfigured()
    return performance
  }

  getPerformanceSnapshot(): AnyoPlayerPerformanceSnapshot {
    this.assertNotDisposed()
    return this.performanceController.sample()
  }

  async saveQualityPreference(key?: string): Promise<AnyoPlayerQualityPreferenceSnapshot> {
    this.assertNotDisposed()
    try {
      const saved = await this.performanceController.save(key)
      this.events.emit('qualitypreferencesaved', saved)
      this.emitTelemetry('quality.preference-saved', { key: saved.key }, 'host')
      return saved.snapshot
    } catch (cause) {
      throw this.preferenceError(cause, 'PLAYER_QUALITY_STORAGE_UNAVAILABLE', 'Could not save the Anyo Player quality preference.')
    }
  }

  async loadQualityPreference(key?: string): Promise<AnyoPlayerQualityPreferenceSnapshot | null> {
    this.assertNotDisposed()
    const previous = this.performanceController.preference
    try {
      const loaded = await this.performanceController.load(key)
      const resolvedKey = loaded?.key ?? key?.trim() ?? this.performanceController.storageKey ?? ''
      this.events.emit('qualitypreferenceloaded', { key: resolvedKey, snapshot: loaded?.snapshot ?? null })
      if (loaded) this.emitQualityPreferenceChange(previous, 'storage')
      return loaded?.snapshot ?? null
    } catch (cause) {
      throw this.preferenceError(cause, 'PLAYER_QUALITY_PREFERENCE_INVALID', 'Could not load the Anyo Player quality preference.')
    }
  }

  async clearQualityPreference(key?: string): Promise<void> {
    this.assertNotDisposed()
    try {
      const resolvedKey = await this.performanceController.clear(key)
      this.events.emit('qualitypreferencecleared', { key: resolvedKey })
    } catch (cause) {
      throw this.preferenceError(cause, 'PLAYER_QUALITY_STORAGE_UNAVAILABLE', 'Could not clear the Anyo Player quality preference.')
    }
  }

  setViewPreference(
    preference: Partial<Omit<AnyoPlayerViewPreferenceSnapshot, 'format' | 'version'>>,
  ): AnyoPlayerViewPreferenceSnapshot {
    this.assertNotDisposed()
    const previous = this.viewPreferenceController.preference
    const next = this.viewPreferenceController.set(preference)
    this.applyViewPreference()
    this.events.emit('viewpreferencechange', { previous, preference: next, source: 'runtime' })
    this.persistViewPreferenceIfConfigured()
    return next
  }

  resetViewPreference(): AnyoPlayerViewPreferenceSnapshot {
    this.assertNotDisposed()
    const previous = this.viewPreferenceController.preference
    const next = this.viewPreferenceController.reset()
    this.applyViewPreference()
    this.events.emit('viewpreferencechange', { previous, preference: next, source: 'reset' })
    this.persistViewPreferenceIfConfigured()
    return next
  }

  async saveViewPreference(key?: string): Promise<AnyoPlayerViewPreferenceSnapshot> {
    this.assertNotDisposed()
    try {
      const saved = await this.viewPreferenceController.save(key)
      this.events.emit('viewpreferencesaved', saved)
      return saved.snapshot
    } catch (cause) {
      throw this.preferenceError(cause, 'PLAYER_VIEW_STORAGE_UNAVAILABLE', 'Could not save the Anyo Player view preference.')
    }
  }

  async loadViewPreference(key?: string): Promise<AnyoPlayerViewPreferenceSnapshot | null> {
    this.assertNotDisposed()
    const previous = this.viewPreferenceController.preference
    try {
      const loaded = await this.viewPreferenceController.load(key)
      const resolvedKey = loaded?.key ?? key?.trim() ?? this.viewPreferenceController.storageKey ?? ''
      this.events.emit('viewpreferenceloaded', { key: resolvedKey, snapshot: loaded?.snapshot ?? null })
      if (loaded) {
        this.applyViewPreference()
        this.events.emit('viewpreferencechange', { previous, preference: loaded.snapshot, source: 'storage' })
      }
      return loaded?.snapshot ?? null
    } catch (cause) {
      throw this.preferenceError(cause, 'PLAYER_VIEW_PREFERENCE_INVALID', 'Could not load the Anyo Player view preference.')
    }
  }

  async clearViewPreference(key?: string): Promise<void> {
    this.assertNotDisposed()
    try {
      const resolvedKey = await this.viewPreferenceController.clear(key)
      this.events.emit('viewpreferencecleared', { key: resolvedKey })
    } catch (cause) {
      throw this.preferenceError(cause, 'PLAYER_VIEW_STORAGE_UNAVAILABLE', 'Could not clear the Anyo Player view preference.')
    }
  }

  createRuntimeHealth(): AnyoPlayerRuntimeHealth {
    const reasons: string[] = []
    const rendererAvailable = this.activeRuntime !== null
    const worldAvailable = this.world !== null
    const assetsReady = this.progress.failed === 0 && this.progress.loading === 0 && this.progress.queued === 0
    const performance = this.performanceController.snapshot
    const performanceWithinTarget = performance.fps <= 0 || performance.inactive || performance.fps >= Math.max(15, performance.targetFps * 0.75)
    const recoveryActive = ['scheduled', 'recovering'].includes(this.rendererRecoveryValue.state)
    if (!rendererAvailable) reasons.push('renderer-unavailable')
    if (!worldAvailable) reasons.push('world-unavailable')
    if (!assetsReady) reasons.push(this.progress.failed > 0 ? 'asset-failures' : 'assets-loading')
    if (!performanceWithinTarget) reasons.push('performance-below-target')
    if (recoveryActive) reasons.push('renderer-recovery-active')
    if (this.state === 'error' || this.errorValue) reasons.push(this.errorValue?.code ?? 'player-error')
    const state: AnyoPlayerRuntimeHealth['state'] = this.state === 'error'
      ? 'failed'
      : recoveryActive
        ? 'recovering'
        : reasons.length > 0
          ? 'degraded'
          : 'healthy'
    return { state, reasons, rendererAvailable, worldAvailable, assetsReady, performanceWithinTarget, recoveryActive }
  }

  createRuntimeReport(): AnyoPlayerRuntimeReport {
    this.assertNotDisposed()
    const world = this.world
    const compiled = world?.compiled ?? null
    const rendererInfo = world?.renderer.info
    const nativeRenderer = (this.activeRuntime?.renderer as { getNativeAccess?: () => { engine?: { renderer?: { capabilities?: { features?: Record<string, boolean> } } } } | null } | undefined)
      ?.getNativeAccess?.()?.engine?.renderer
    const rendererFeatures = nativeRenderer?.capabilities?.features
    const diagnostics = this.diagnosticsValue
    const count = (value: unknown): number => Array.isArray(value) ? value.length : 0
    return {
      format: '@blcklab/anyo-player/runtime-report',
      version: 1,
      createdAt: this.now().toISOString(),
      lifecycle: {
        state: this.state,
        phase: this.phase,
        readyStatus: this.readyStatus,
        entered: this.entered,
        paused: this.paused,
        pauseReason: this.pauseReason,
        activated: this.activated,
      },
      world: {
        loaded: world !== null,
        documentVersion: world?.document?.version ?? null,
        currentRoom: world?.getCurrentRoom() ?? null,
        rooms: count(compiled?.rooms),
        entities: count(compiled?.entities),
        primitives: count(compiled?.primitives),
        materials: count(compiled?.materials),
        colliders: count(compiled?.colliders),
        portals: count(compiled?.portals),
        triggers: count(compiled?.triggers),
      },
      renderer: {
        name: rendererInfo?.name ?? null,
        version: rendererInfo?.version ?? null,
        backend: rendererInfo?.capabilities.backend ?? null,
        shadows: rendererInfo ? rendererInfo.capabilities.shadows : null,
        atmosphere: rendererInfo?.capabilities.atmosphere ?? null,
        colorGrading: rendererInfo?.capabilities.colorGrading ?? null,
        gpuPostProcessing: rendererFeatures?.gpuPostProcessing ?? null,
        ssao: rendererFeatures?.ssao ?? null,
        bloom: rendererFeatures?.bloom ?? null,
        outlines: rendererFeatures?.outlines ?? null,
        cascadedShadows: rendererFeatures?.cascadedShadows ?? null,
        mipmapGeneration: rendererFeatures?.mipmapGeneration ?? null,
      },
      performance: this.performanceController.sample(),
      viewport: this.viewport,
      input: {
        mode: this.inputMode,
        modality: this.inputModality,
        pointerLocked: this.pointerLocked,
        touchEnabled: this.touchEnabled,
        activeGamepad: this.activeGamepad,
        reducedMotion: this.reducedMotion,
      },
      assets: this.progress,
      recovery: this.rendererRecovery,
      diagnostics: {
        total: diagnostics.length,
        errors: diagnostics.filter(record => record.severity === 'error').length,
        warnings: diagnostics.filter(record => record.severity === 'warning').length,
      },
    }
  }

  downloadRuntimeReport(filename = 'anyo-player-runtime-report.json'): AnyoPlayerRuntimeReport {
    const report = this.createRuntimeReport()
    if (typeof document === 'undefined' || typeof URL === 'undefined') return report
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.style.display = 'none'
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    return report
  }

  createDiagnosticBundle(): AnyoPlayerDiagnosticBundle {
    this.assertNotDisposed()
    const inputBindings = this.inputBindingsController.bindings
    return {
      format: '@blcklab/anyo-player/diagnostic-bundle',
      version: 1,
      createdAt: this.now().toISOString(),
      health: this.createRuntimeHealth(),
      runtime: this.createRuntimeReport(),
      source: this.sourceInfo,
      documentHash: this.activeDocument ? hashWorldDocument(this.activeDocument) : null,
      diagnostics: this.diagnostics,
      telemetry: this.telemetry,
      qualityPreference: this.qualityPreference,
      viewPreference: this.viewPreference,
      inputBindings: {
        format: '@blcklab/anyo-player/input-bindings',
        version: 1,
        bindings: cloneInputBindingMap(inputBindings),
      },
    }
  }

  downloadDiagnosticBundle(filename = 'anyo-player-diagnostic-bundle.json'): AnyoPlayerDiagnosticBundle {
    const bundle = this.createDiagnosticBundle()
    this.downloadJson(bundle, filename)
    return bundle
  }

  pause(): void {
    this.pauseInternal('user')
  }

  resume(): void {
    this.resumeInternal(true)
  }

  async enterFullscreen(): Promise<void> {
    this.assertFullscreenState()
    try {
      await this.fullscreenController.enter()
    } catch (error) {
      const playerError = toPlayerError(
        error,
        'PLAYER_FULLSCREEN_FAILED',
        'Anyo Player could not enter fullscreen.',
      )
      this.handleFullscreenError(playerError)
      throw playerError
    }
  }

  async exitFullscreen(): Promise<void> {
    this.assertNotDisposed()
    try {
      await this.fullscreenController.exit()
    } catch (error) {
      const playerError = toPlayerError(
        error,
        'PLAYER_FULLSCREEN_FAILED',
        'Anyo Player could not exit fullscreen.',
      )
      this.handleFullscreenError(playerError)
      throw playerError
    }
  }

  async toggleFullscreen(): Promise<void> {
    if (this.fullscreen) await this.exitFullscreen()
    else await this.enterFullscreen()
  }

  async checkVRSupport(): Promise<boolean> {
    this.assertNotDisposed()
    if (!this.vrEnabledValue) return false
    if (!this.activeRuntime) {
      throw new AnyoPlayerError(
        'PLAYER_INVALID_STATE',
        'Load an Anyo world before checking VR support.',
      )
    }
    try {
      return await this.xrController.checkSupport()
    } catch (cause) {
      const error = new AnyoPlayerError(
        'PLAYER_VR_SUPPORT_FAILED',
        'Anyo Player could not determine whether immersive VR is supported.',
        { cause },
      )
      this.ui.setControlError(error)
      this.events.emit('vrerror', error)
      throw error
    }
  }

  async enterVR(): Promise<void> {
    this.assertNotDisposed()
    if (!this.vrEnabledValue) {
      throw new AnyoPlayerError('PLAYER_VR_DISABLED', 'VR is disabled for this Anyo Player.')
    }
    if (!this.activeRuntime || !['ready', 'entering', 'running'].includes(this.state)) {
      throw new AnyoPlayerError(
        'PLAYER_INVALID_STATE',
        `enterVR() requires a ready or running world, not state "${this.state}".`,
      )
    }
    const supported = this.vrSupported ?? await this.checkVRSupport()
    if (!supported) {
      const error = new AnyoPlayerError(
        'PLAYER_VR_UNSUPPORTED',
        'Immersive VR is not supported by the current browser, device, or renderer.',
      )
      this.ui.setControlError(error)
      this.events.emit('vrerror', error)
      throw error
    }

    const controlsWereActive = this.state === 'running' || this.state === 'entering'
    if (controlsWereActive) {
      this.deactivateActiveInput(true)
      this.events.emit('exited', { reason: 'vr-enter' })
    }
    this.touchInput.setVisible(false)
    this.clearInteractionPrompt()
    this.xrExitRequested = false
    this.transition('vr-entering')
    this.ui.setVRSession('entering', this.xrInputs.length)
    try {
      await this.xrController.enter()
      if (this.state === 'vr-entering') this.activateXRSession()
    } catch (cause) {
      if (this.state === 'vr-entering') this.transition('ready')
      this.ui.setVRSession('idle', 0)
      this.ui.setReady(
        this.readyStatusValue ?? 'ready',
        this.progressValue,
        this.desktopEnabled && !this.touchEnabledValue,
      )
      this.ui.setVRSupport(this.xrController.supportState)
      this.touchInput.setVisible(this.touchEnabledValue)
      const error = new AnyoPlayerError(
        'PLAYER_VR_ENTER_FAILED',
        'Anyo Player could not enter immersive VR.',
        { cause },
      )
      this.ui.setControlError(error)
      this.events.emit('vrerror', error)
      throw error
    }
  }

  async exitVR(): Promise<void> {
    this.assertNotDisposed()
    if (!this.activeRuntime || !['vr-entering', 'vr-active'].includes(this.state)) {
      throw new AnyoPlayerError(
        'PLAYER_INVALID_STATE',
        `exitVR() requires an active or entering VR session, not state "${this.state}".`,
      )
    }
    this.xrExitRequested = true
    if (this.state === 'vr-active') this.transition('vr-exiting')
    this.ui.setVRSession('exiting', this.xrInputs.length)
    try {
      await this.xrController.exit()
      if (this.state === 'vr-exiting' || this.state === 'vr-entering') this.finishXRSession(false)
    } catch (cause) {
      this.xrExitRequested = false
      if (this.state === 'vr-exiting') this.transition('vr-active')
      this.ui.setVRSession('active', this.xrInputs.length)
      const error = new AnyoPlayerError(
        'PLAYER_VR_EXIT_FAILED',
        'Anyo Player could not exit immersive VR cleanly.',
        { cause },
      )
      this.ui.setControlError(error)
      this.events.emit('vrerror', error)
      throw error
    }
  }

  resizeNow(): AnyoPlayerResizeEvent {
    this.assertNotDisposed()
    return this.responsive.resizeNow(true)
  }

  captureSession(
    options: AnyoPlayerSessionCaptureOptions = {},
  ): AnyoPlayerSessionSnapshot {
    this.assertSessionWorldAvailable('captureSession')
    const snapshot = this.sessionController.capture({
      world: this.activeRuntime!.world,
      document: this.activeDocument!,
      paused: this.state === 'paused',
      pauseReason: this.pauseReasonValue,
      inputMode: this.inputModeValue ?? this.resumeInputModeAfterPause,
    }, options)
    const view = this.activeRuntime?.camera?.viewState
    if (view && this.cameraMode === 'explore') {
      snapshot.camera.position = [...view.eye]
      snapshot.camera.yaw = view.yaw
      snapshot.camera.pitch = view.pitch
    }
    this.events.emit('sessioncaptured', { snapshot: structuredClone(snapshot) })
    return structuredClone(snapshot)
  }

  async restoreSession(
    snapshot: unknown,
    options: AnyoPlayerSessionRestoreOptions = {},
  ): Promise<AnyoPlayerSessionSnapshot> {
    this.assertSessionWorldAvailable('restoreSession')
    if (this.state === 'vr-entering' || this.state === 'vr-active') await this.exitVR()
    else if (this.state === 'vr-exiting') {
      throw new AnyoPlayerError(
        'PLAYER_INVALID_STATE',
        'Wait for the active VR session to finish exiting before restoring a session.',
      )
    }

    const run = this.operationTail.then(() => this.performSessionRestore(snapshot, options))
    this.operationTail = run.then(() => undefined, () => undefined)
    return run
  }

  async saveSession(
    key?: string,
    options: AnyoPlayerSessionCaptureOptions = {},
  ): Promise<AnyoPlayerSessionSnapshot> {
    const snapshot = this.captureSession(options)
    try {
      const resolvedKey = await this.sessionController.save(key, snapshot)
      this.events.emit('sessionsaved', { key: resolvedKey, snapshot: structuredClone(snapshot) })
      return snapshot
    } catch (error) {
      const playerError = this.sessionError(
        error,
        'PLAYER_SESSION_SAVE_FAILED',
        'Anyo Player could not save the current session.',
      )
      this.events.emit('sessionerror', playerError)
      throw playerError
    }
  }

  async loadSession(
    key?: string,
    options: AnyoPlayerSessionRestoreOptions = {},
  ): Promise<AnyoPlayerSessionSnapshot | null> {
    this.assertSessionWorldAvailable('loadSession')
    try {
      const loaded = await this.sessionController.load(key)
      this.events.emit('sessionloaded', {
        key: loaded?.key ?? key?.trim() ?? this.sessionController.storageKey ?? '',
        snapshot: loaded ? structuredClone(loaded.snapshot) : null,
      })
      if (!loaded) return null
      await this.restoreSession(loaded.snapshot, options)
      return structuredClone(loaded.snapshot)
    } catch (error) {
      const playerError = this.sessionError(
        error,
        'PLAYER_SESSION_LOAD_FAILED',
        'Anyo Player could not load the saved session.',
      )
      this.events.emit('sessionerror', playerError)
      throw playerError
    }
  }

  async clearSession(key?: string): Promise<void> {
    this.assertNotDisposed()
    try {
      const resolvedKey = await this.sessionController.clear(key)
      this.events.emit('sessioncleared', { key: resolvedKey })
    } catch (error) {
      const playerError = this.sessionError(
        error,
        'PLAYER_SESSION_SAVE_FAILED',
        'Anyo Player could not clear the saved session.',
      )
      this.events.emit('sessionerror', playerError)
      throw playerError
    }
  }

  setInputBindings(
    bindings: Partial<AnyoPlayerInputBindingMap>,
    options: { merge?: boolean } = {},
  ): AnyoPlayerInputBindingMap {
    this.assertNotDisposed()
    try {
      const value = this.inputBindingsController.setBindings(bindings, options.merge !== false)
      this.applyInputBindings(value)
      this.events.emit('inputbindingschange', { bindings: cloneInputBindingMap(value), source: 'runtime' })
      this.persistInputBindingsOnChange()
      return cloneInputBindingMap(value)
    } catch (error) {
      const playerError = this.inputBindingsError(
        error,
        'PLAYER_INPUT_BINDINGS_INVALID',
        'Anyo Player could not apply the input bindings.',
      )
      this.events.emit('inputbindingserror', playerError)
      throw playerError
    }
  }

  resetInputBindings(): AnyoPlayerInputBindingMap {
    this.assertNotDisposed()
    const value = this.inputBindingsController.reset()
    this.applyInputBindings(value)
    this.events.emit('inputbindingschange', { bindings: cloneInputBindingMap(value), source: 'reset' })
    this.persistInputBindingsOnChange()
    return cloneInputBindingMap(value)
  }

  async saveInputBindings(key?: string): Promise<AnyoPlayerInputBindingsSnapshot> {
    this.assertNotDisposed()
    try {
      const saved = await this.inputBindingsController.save(key)
      this.events.emit('inputbindingssaved', {
        key: saved.key,
        snapshot: structuredClone(saved.snapshot),
      })
      return structuredClone(saved.snapshot)
    } catch (error) {
      const playerError = this.inputBindingsError(
        error,
        'PLAYER_INPUT_BINDINGS_SAVE_FAILED',
        'Anyo Player could not save the current input bindings.',
      )
      this.events.emit('inputbindingserror', playerError)
      throw playerError
    }
  }

  async loadInputBindings(key?: string): Promise<AnyoPlayerInputBindingsSnapshot | null> {
    this.assertNotDisposed()
    try {
      const loaded = await this.inputBindingsController.load(key)
      this.applyInputBindings(this.inputBindingsController.bindings)
      this.events.emit('inputbindingsloaded', {
        key: loaded?.key ?? key?.trim() ?? this.inputBindingsController.storageKey ?? '',
        snapshot: loaded ? structuredClone(loaded.snapshot) : null,
      })
      if (!loaded) return null
      this.events.emit('inputbindingschange', {
        bindings: cloneInputBindingMap(loaded.snapshot.bindings),
        source: 'storage',
      })
      return structuredClone(loaded.snapshot)
    } catch (error) {
      const playerError = this.inputBindingsError(
        error,
        'PLAYER_INPUT_BINDINGS_LOAD_FAILED',
        'Anyo Player could not load the saved input bindings.',
      )
      this.events.emit('inputbindingserror', playerError)
      throw playerError
    }
  }

  async clearInputBindings(key?: string): Promise<void> {
    this.assertNotDisposed()
    try {
      const resolvedKey = await this.inputBindingsController.clear(key)
      this.events.emit('inputbindingscleared', { key: resolvedKey })
    } catch (error) {
      const playerError = this.inputBindingsError(
        error,
        'PLAYER_INPUT_BINDINGS_SAVE_FAILED',
        'Anyo Player could not clear the saved input bindings.',
      )
      this.events.emit('inputbindingserror', playerError)
      throw playerError
    }
  }

  setReducedMotion(preference: AnyoPlayerReducedMotionPreference): boolean {
    this.assertNotDisposed()
    return this.accessibilityController.setReducedMotion(preference)
  }

  announce(message: string, options: AnyoPlayerAnnouncementOptions = {}): void {
    this.assertNotDisposed()
    this.accessibilityController.announce(message, options.priority ?? 'polite')
  }

  showCaption(text: string, options: AnyoPlayerCaptionOptions = {}): AnyoPlayerCaptionState {
    this.assertNotDisposed()
    const caption = this.captionController.show(text, options)
    if (options.announce === true) {
      const message = caption.speaker ? `${caption.speaker}: ${caption.text}` : caption.text
      this.accessibilityController.announce(message, 'polite')
    }
    return caption
  }

  clearCaption(): void {
    this.assertNotDisposed()
    this.captionController.clear()
  }

  registerCaptionTarget(target: AnyoPlayerCaptionTarget): () => void {
    this.assertNotDisposed()
    return this.captionController.register(target)
  }


  registerVfxTarget(target: AnyoPlayerVfxTarget): () => void {
    this.assertNotDisposed()
    return this.vfxController.register(target)
  }

  registerMapTarget(target: AnyoPlayerMapTarget): () => void {
    this.assertNotDisposed()
    return this.mapController.register(target)
  }

  setMapAttribution(text: string | null): void {
    this.assertNotDisposed()
    this.mapController.setAttribution(text)
  }

  registerAudioTarget(target: AnyoPlayerAudioTarget): () => void {
    this.assertNotDisposed()
    return this.audioController.register(target)
  }

  unlockAudio(): Promise<AnyoPlayerAudioState> {
    this.assertNotDisposed()
    return this.audioController.unlock()
  }

  setAudioMuted(muted: boolean): Promise<AnyoPlayerAudioState> {
    this.assertNotDisposed()
    return this.audioController.setMuted(muted)
  }

  toggleAudioMuted(): Promise<AnyoPlayerAudioState> {
    this.assertNotDisposed()
    return this.audioController.setMuted(!this.audioController.state.muted)
  }

  async captureScreenshot(options: AnyoPlayerScreenshotOptions = {}): Promise<AnyoPlayerScreenshotResult> {
    this.assertNotDisposed()
    if (!this.activeRuntime || !['ready', 'entering', 'running', 'paused'].includes(this.state)) {
      const error = new AnyoPlayerError(
        'PLAYER_INVALID_STATE',
        `captureScreenshot() requires a loaded non-XR world, not state "${this.state}".`,
      )
      this.events.emit('screenshoterror', error)
      throw error
    }
    try {
      const screenshot = await this.screenshotController.capture(
        this.canvas,
        () => this.activeRuntime?.renderer.render(0),
        options,
      )
      this.events.emit('screenshotcaptured', { screenshot })
      return screenshot
    } catch (cause) {
      const error = cause instanceof AnyoPlayerError
        ? cause
        : new AnyoPlayerError('PLAYER_SCREENSHOT_FAILED', 'Anyo Player could not capture a screenshot.', { cause })
      this.ui.setControlError(error)
      this.events.emit('screenshoterror', error)
      throw error
    }
  }

  recoverRenderer(): Promise<void> {
    this.assertNotDisposed()
    if (!this.rendererRecoveryOptions.enabled) {
      return Promise.reject(new AnyoPlayerError(
        'PLAYER_RENDERER_RECOVERY_DISABLED',
        'Renderer recovery is disabled for this Anyo Player.',
      ))
    }
    if (this.rendererRecoveryPromise) return this.rendererRecoveryPromise
    if (this.state !== 'error' || this.errorValue?.code !== 'PLAYER_RENDERER_LOST' || this.lastSource === undefined) {
      return Promise.reject(new AnyoPlayerError(
        'PLAYER_INVALID_STATE',
        `recoverRenderer() requires a renderer-loss error state, not "${this.state}".`,
      ))
    }
    this.clearRendererRecoveryTimer()
    const run = this.performRendererRecovery(false)
    const tracked = run.finally(() => {
      if (this.rendererRecoveryPromise === tracked) this.rendererRecoveryPromise = null
    })
    this.rendererRecoveryPromise = tracked
    return tracked
  }

  cancelRendererRecovery(): void {
    this.assertNotDisposed()
    this.clearRendererRecoveryTimer()
    if (this.rendererRecoveryValue.state === 'scheduled') {
      this.setRendererRecovery({
        ...this.rendererRecoveryValue,
        state: 'canceled',
        automatic: true,
      })
    }
  }

  clearDiagnostics(): void {
    this.assertNotDisposed()
    this.diagnosticsValue = []
  }

  registerAnalyticsSink(sink: AnyoPlayerAnalyticsSink): () => void {
    this.assertNotDisposed()
    return this.telemetryController.register(sink)
  }

  trackTelemetry(
    name: string,
    details?: Record<string, unknown>,
    category: AnyoPlayerTelemetryCategory = 'host',
  ): AnyoPlayerTelemetryEvent | null {
    this.assertNotDisposed()
    return this.telemetryController.track(name, category, { state: this.state, phase: this.phase }, details)
  }

  clearTelemetry(): void {
    this.assertNotDisposed()
    this.telemetryController.clear()
  }

  setTheme(theme: AnyoPlayerThemeTokens | null): Readonly<AnyoPlayerThemeTokens> {
    this.assertNotDisposed()
    const value = this.styleController.setTheme(theme)
    this.events.emit('themechange', { theme: value })
    return value
  }

  async interact(): Promise<boolean> {
    this.assertNotDisposed()
    if (!this.activeRuntime || this.state !== 'running' || !['desktop', 'gamepad'].includes(this.inputModeValue ?? '')) return false
    try {
      return await this.interactionPresentation.activate()
    } catch (cause) {
      const error = new AnyoPlayerError(
        'PLAYER_INTERACTION_FAILED',
        'Anyo Player could not activate the focused interaction.',
        { cause },
      )
      this.ui.setControlError(error)
      this.events.emit('interactionerror', error)
      throw error
    }
  }

  registerAction(name: string, handler: ActionHandler): () => void {
    this.assertNotDisposed()
    const normalizedName = name.trim()
    if (!normalizedName) throw new TypeError('Anyo Player action name must not be empty.')
    if (typeof handler !== 'function') throw new TypeError('Anyo Player action handler must be a function.')

    const previous = this.actions.get(normalizedName)
    if (previous) this.removeRuntimeAction(normalizedName, previous.token)

    const registration: ActionRegistration = { token: Symbol(normalizedName), handler }
    this.actions.set(normalizedName, registration)
    this.installAction(this.pendingRuntime, normalizedName, registration)
    this.installAction(this.activeRuntime, normalizedName, registration)

    return () => {
      const current = this.actions.get(normalizedName)
      if (!current || current.token !== registration.token) return
      this.actions.delete(normalizedName)
      this.removeRuntimeAction(normalizedName, registration.token)
    }
  }

  on<TKey extends keyof AnyoPlayerEventMap>(
    event: TKey,
    listener: AnyoPlayerListener<TKey>,
  ): () => void {
    this.assertNotDisposed()
    return this.events.on(event, listener)
  }

  disposeAsync(): Promise<void> {
    if (this.disposalPromise) return this.disposalPromise
    if (this.state === 'disposed') return Promise.resolve()

    if (this.state === 'running' || this.state === 'entering') {
      this.deactivateActiveInput(true)
      this.events.emit('exited', { reason: 'dispose' })
    }
    this.clearInteractionPrompt()
    this.clearRendererRecoveryTimer()
    this.transition('disposing')
    this.setPhase('disposing')
    ++this.operationId
    this.currentAbort?.abort(new AnyoPlayerError('PLAYER_DISPOSED', 'Anyo Player is being disposed.'))
    this.currentAbort = null

    this.disposalPromise = (async () => {
      await this.operationTail
      if (this.fullscreen) {
        try {
          await this.fullscreenController.exit()
        } catch (error) {
          this.emitWarning(`Anyo Player could not exit fullscreen during disposal: ${String(error)}`)
        }
      }
      this.visibilityController.dispose()
      this.navigationAbort?.abort(new AnyoPlayerError('PLAYER_DISPOSED', 'Anyo Player was disposed during navigation.'))
      this.navigationAbort = null
      this.cancelWorldPreloadTasks()
      for (const resolved of this.worldPreloadCache.values()) this.releaseResolvedSource(resolved)
      this.worldPreloadCache.clear()
      this.setNavigationPresentation('none', null)
      this.embeddingController.dispose()
      this.clearPreload()
      this.fullscreenController.dispose()
      this.responsive.dispose()
      this.desktopInput.dispose()
      this.touchInput.dispose()
      this.gamepadInput.dispose()
      this.interactionPresentation.dispose()
      this.xrController.dispose()
      this.accessibilityController.dispose()
      this.captionController.dispose()
      this.audioController.dispose()
      this.performanceController.dispose()
      this.vfxController.dispose()
      this.mapController.dispose()
      this.clearInteractionPromptTimer()
      const runtimes = new Set<ManagedRuntime>()
      if (this.pendingRuntime) runtimes.add(this.pendingRuntime)
      if (this.activeRuntime) runtimes.add(this.activeRuntime)
      this.pendingRuntime = null
      this.activeRuntime = null
      this.activeDocument = null
      this.replacementContext = null
      this.replacementStage = 'idle'
      for (const runtime of runtimes) await this.disposeManagedRuntime(runtime)
      this.releaseActiveSource()
      for (const cleanup of this.webSurfaceRegistrationCleanups.splice(0)) cleanup()

      this.actions.clear()
      this.ui.dispose()
      this.styleController.dispose()
      this.host.dispose()
      this.transition('disposed')
      this.setPhase('disposed')
      this.events.emit('disposed', undefined)
      this.events.clear()
    })()

    return this.disposalPromise
  }

  private async performLoad(
    operationId: number,
    source: AnyoPlayerSource,
    abortController: AbortController,
  ): Promise<void> {
    let runtime: ManagedRuntime | null = null
    let resolved: ResolvedPlayerSource | null = null
    let sourcePromoted = false
    try {
      resolved = await this.resolveRuntimeSource(source, abortController.signal)
      this.assertCurrentOperation(operationId)
      await this.restoreConfiguredPreferences()
      this.assertCurrentOperation(operationId)
      await this.restoreConfiguredInputBindings()
      this.assertCurrentOperation(operationId)
      this.setPhase('creating-runtime')

      const created = this.runtimeFactory.create({
        canvas: this.canvas,
        renderer: {
          ...(this.options.renderer ?? {}),
          ...(this.recoveryRendererBackendOverride ? { backend: this.recoveryRendererBackendOverride } : {}),
        },
        performance: this.performanceController.runtimeOptions,
        exploration: this.options.exploration ?? {},
        webSurface: this.webSurfaceRuntimeOptions,
        ...(this.options.components === undefined ? {} : { components: this.options.components }),
        plugins: [...(this.options.plugins ?? [])],
        systems: [...(this.options.systems ?? [])],
        ...(this.options.systemOptions === undefined ? {} : { systemOptions: this.options.systemOptions }),
        ...(this.options.validation === undefined ? {} : { validation: this.options.validation }),
        onWarning: message => this.emitWarning(message),
        onCameraModeChange: (previous, mode) => {
          if (!this.isCurrentOperation(operationId)) return
          this.events.emit('cameramodechange', { previous, mode })
          this.emitTelemetry('camera.mode', { previous, mode })
        },
        onFallRecoveryChange: status => {
          if (!this.isCurrentOperation(operationId)) return
          const previous = structuredClone(this.fallRecoveryValue)
          this.fallRecoveryValue = structuredClone(status)
          this.events.emit('fallrecoverychange', { previous, recovery: structuredClone(status) })
          this.emitTelemetry('exploration.fall-recovery', { state: status.state, attempt: status.attempt, maxAttempts: status.maxAttempts })
          if (status.state === 'failed' && status.message) this.emitWarning(status.message)
        },
      })
      runtime = this.manageRuntime(created, operationId)
      this.pendingRuntime = runtime
      this.responsive.attach(runtime.renderer)
      this.installStagedActions(runtime)
      runtime.world.exploration.setInputEnabled(false)

      this.setPhase('loading-world')
      await this.awaitRuntimeStep(runtime, runtime.world.load(resolved.document))
      this.assertCurrentOperation(operationId)
      this.responsive.resizeNow(true)

      this.setPhase('waiting-ready')
      await this.awaitRuntimeStep(runtime, runtime.world.whenReady())
      this.assertCurrentOperation(operationId)
      runtime.world.start()

      this.setPhase('loading-assets')
      await this.awaitRuntimeStep(runtime, runtime.world.whenIdle())
      this.assertCurrentOperation(operationId)

      this.progressValue = { ...runtime.world.getAssetProgress() }
      this.emitProgress()
      this.pendingRuntime = null
      this.activeRuntime = runtime
      this.performanceController.attach(this.activeRuntime.renderer)
      this.interactionPresentation.bind(runtime.world, runtime.renderer)
      runtime = null
      this.activeDocument = structuredClone(resolved.document)
      if (!this.navigationCommitted) this.currentWorldIdValue = this.findNavigationWorldId(source)
      this.configureInput(resolved.document, this.activeRuntime)
      this.promoteResolvedSource(resolved)
      sourcePromoted = true
      this.xrController.bind(this.activeRuntime.world)
      this.ui.setVRSupport(this.xrController.supportState)

      const readyStatus: AnyoPlayerReadyStatus = this.progressValue.failed > 0
        ? 'ready-with-warnings'
        : 'ready'
      this.readyStatusValue = readyStatus
      this.transition('ready')
      this.setPhase(readyStatus)
      this.ui.setReady(readyStatus, this.progressValue, this.desktopEnabled && !this.touchEnabledValue)
      this.embeddingController.handleReady()
      this.touchInput.setVisible(this.touchEnabledValue)
      this.events.emit('ready', {
        world: this.activeRuntime.world,
        progress: this.progress,
        status: readyStatus,
      })
      await this.restoreConfiguredSessionAfterLoad()
      if (this.xrController.checkSupportOnLoad && this.vrEnabledValue) {
        void this.checkVRSupport().catch(() => undefined)
      }
      if (this.visibilityController.pauseWhenHidden && this.visibilityController.hidden) {
        this.pauseInternal('visibility', false)
      } else if (this.embeddingController.pauseWhenOffscreen && this.embeddingController.intersection === 'hidden') {
        this.pauseInternal('offscreen', false)
      }
    } catch (error) {
      if (runtime) {
        if (this.pendingRuntime === runtime) this.pendingRuntime = null
        await this.disposeManagedRuntime(runtime)
      }

      if (!this.isCurrentOperation(operationId)) {
        if (this.state === 'disposing' || this.state === 'disposed') {
          throw new AnyoPlayerError('PLAYER_DISPOSED', 'Anyo Player was disposed during loading.', { cause: error })
        }
        throw new AnyoPlayerError(
          'PLAYER_OPERATION_SUPERSEDED',
          'Anyo Player loading was superseded by a newer operation.',
          { cause: error },
        )
      }

      const playerError = toPlayerError(
        error,
        'PLAYER_WORLD_LOAD_FAILED',
        'Anyo Player failed to create or load the world.',
      )
      this.errorValue = playerError
      this.readyStatusValue = null
      this.transition('error')
      this.setPhase('error')
      this.ui.setError(playerError)
      this.embeddingController.handleError()
      this.events.emit('error', playerError)
      throw playerError
    } finally {
      if (!sourcePromoted) this.releaseResolvedSource(resolved)
      if (this.currentAbort === abortController) this.currentAbort = null
    }
  }

  private async performReplacement(
    operationId: number,
    source: AnyoPlayerSource,
    abortController: AbortController,
  ): Promise<void> {
    const runtime = this.activeRuntime
    const context = this.replacementContext
    if (!runtime || !context) {
      throw new AnyoPlayerError(
        'PLAYER_INVALID_STATE',
        'Anyo Player lost its active runtime before world replacement could begin.',
      )
    }

    let resolved: ResolvedPlayerSource | null = null
    let sourcePromoted = false
    try {
      resolved = await this.resolveRuntimeSource(source, abortController.signal)
      this.assertCurrentOperation(operationId)
      await this.restoreConfiguredPreferences()
      this.assertCurrentOperation(operationId)
      this.replacementStage = 'mutating'
      runtime.operationId = operationId
      this.setPhase('replacing-world')

      runtime.camera?.setWorldReplacement(true)
      try {
        await this.awaitRuntimeStep(runtime, runtime.world.load(resolved.document))
      } finally {
        runtime.camera?.setWorldReplacement(false)
      }
      this.assertCurrentOperation(operationId)
      this.responsive.resizeNow(true)

      this.setPhase('waiting-ready')
      await this.awaitRuntimeStep(runtime, runtime.world.whenReady())
      this.assertCurrentOperation(operationId)

      if (context.returnState === 'ready' && !runtime.world.isRunning) runtime.world.start()
      if (context.returnState === 'paused' && runtime.world.isRunning) runtime.world.pause()

      this.setPhase('loading-assets')
      await this.awaitRuntimeStep(runtime, runtime.world.whenIdle())
      this.assertCurrentOperation(operationId)

      this.activeDocument = structuredClone(resolved.document)
      this.lastSource = source
      if (!this.navigationCommitted) this.currentWorldIdValue = this.findNavigationWorldId(source)
      this.progressValue = { ...runtime.world.getAssetProgress() }
      this.emitProgress()
      this.configureInput(resolved.document, runtime)
      this.promoteResolvedSource(resolved)
      sourcePromoted = true
      this.interactionPresentation.bind(runtime.world, runtime.renderer)
      this.interactionPresentation.refreshNow()
      this.xrController.bind(runtime.world)
      this.ui.setVRSupport(this.xrController.supportState)

      const readyStatus: AnyoPlayerReadyStatus = this.progressValue.failed > 0
        ? 'ready-with-warnings'
        : 'ready'
      this.readyStatusValue = readyStatus
      this.errorValue = null
      this.replacementContext = null
      this.replacementStage = 'idle'
      this.setPhase(readyStatus)
      this.embeddingController.handleReady()

      if (context.returnState === 'paused') {
        this.pauseReasonValue = context.pauseReason ?? 'user'
        this.transition('paused')
        this.ui.setPaused(this.pauseReasonValue)
        this.touchInput.setVisible(false)
      } else {
        this.pauseReasonValue = null
        this.transition('ready')
        this.ui.setReady(readyStatus, this.progressValue, this.desktopEnabled && !this.touchEnabledValue)
        this.touchInput.setVisible(this.touchEnabledValue)
      }

      const readyEvent = {
        world: runtime.world,
        progress: this.progress,
        status: readyStatus,
      }
      this.events.emit('ready', readyEvent)
      this.performanceController.attach(runtime.renderer)
      this.events.emit('worldreplaced', readyEvent)
      await this.restoreConfiguredSessionAfterLoad()
      if (this.xrController.checkSupportOnLoad && this.vrEnabledValue) {
        void this.checkVRSupport().catch(() => undefined)
      }
      if (
        context.returnState === 'ready'
        && this.visibilityController.pauseWhenHidden
        && this.visibilityController.hidden
      ) {
        this.pauseInternal('visibility', false)
      }
    } catch (cause) {
      if (!this.isCurrentOperation(operationId)) {
        if (this.state === 'disposing' || this.state === 'disposed') {
          throw new AnyoPlayerError(
            'PLAYER_DISPOSED',
            'Anyo Player was disposed during world replacement.',
            { cause },
          )
        }
        throw new AnyoPlayerError(
          'PLAYER_OPERATION_SUPERSEDED',
          'Anyo Player world replacement was superseded by a newer source.',
          { cause },
        )
      }

      if (runtime.fatalDiagnostic || this.state === 'error') {
        this.replacementContext = null
        this.replacementStage = 'idle'
        throw this.errorValue ?? this.rendererLossError(runtime.fatalDiagnostic as RendererDiagnostic)
      }

      const replacementError = toPlayerError(
        cause,
        'PLAYER_WORLD_REPLACE_FAILED',
        'The new world could not be loaded. The previous world is still available.',
      )

      let rollbackHealthy = false
      try {
        await runtime.world.whenReady()
        if (context.returnState === 'ready' && !runtime.world.isRunning) runtime.world.start()
        if (context.returnState === 'paused' && runtime.world.isRunning) runtime.world.pause()
        await runtime.world.whenIdle()
        rollbackHealthy = true
      } catch (rollbackError) {
        this.emitWarning(`Anyo Player could not verify the previous world after replacement failure: ${String(rollbackError)}`)
      }

      if (!rollbackHealthy) {
        const fatalError = new AnyoPlayerError(
          'PLAYER_WORLD_REPLACE_FAILED',
          'World replacement failed and the previous world could not be restored safely.',
          { cause },
        )
        this.replacementContext = null
        this.replacementStage = 'idle'
        this.errorValue = fatalError
        this.readyStatusValue = null
        this.activeDocument = null
        this.transition('error')
        this.setPhase('error')
        this.ui.setError(fatalError)
        this.events.emit('error', fatalError)
        if (this.activeRuntime === runtime) { this.activeRuntime = null; this.performanceController.detach() }
        await this.disposeManagedRuntime(runtime)
        this.releaseActiveSource()
        throw fatalError
      }

      this.lastSource = context.previousSource
      this.activeDocument = structuredClone(context.previousDocument)
      this.progressValue = { ...runtime.world.getAssetProgress() }
      if (this.progressValue.total === 0 && context.previousProgress.total > 0) {
        this.progressValue = { ...context.previousProgress }
      }
      this.emitProgress()
      this.readyStatusValue = this.progressValue.failed > 0
        ? 'ready-with-warnings'
        : context.previousReadyStatus
      this.errorValue = null
      this.configureInput(context.previousDocument, runtime)
      this.interactionPresentation.bind(runtime.world, runtime.renderer)
      this.interactionPresentation.refreshNow()
      this.replacementContext = null
      this.replacementStage = 'idle'
      this.setPhase(this.readyStatusValue)

      if (context.returnState === 'paused') {
        this.pauseReasonValue = context.pauseReason ?? 'user'
        this.transition('paused')
        this.ui.setPaused(this.pauseReasonValue)
        this.touchInput.setVisible(false)
      } else {
        this.pauseReasonValue = null
        this.transition('ready')
        this.ui.setReady(
          this.readyStatusValue,
          this.progressValue,
          this.desktopEnabled && !this.touchEnabledValue,
        )
        this.touchInput.setVisible(this.touchEnabledValue)
      }
      this.ui.setControlError(replacementError)
      this.events.emit('worldreplaceerror', replacementError)
      throw replacementError
    } finally {
      if (!sourcePromoted) this.releaseResolvedSource(resolved)
      if (this.currentAbort === abortController) this.currentAbort = null
    }
  }

  private async restoreConfiguredPreferences(): Promise<void> {
    if (!this.performancePreferenceRestoreAttempted) {
      this.performancePreferenceRestoreAttempted = true
      if (this.performanceController.restoreOnLoad) {
        const previous = this.performanceController.preference
        try {
          const loaded = await this.performanceController.restoreConfigured()
          const key = loaded?.key ?? this.performanceController.storageKey ?? ''
          this.events.emit('qualitypreferenceloaded', { key, snapshot: loaded?.snapshot ?? null })
          if (loaded) this.emitQualityPreferenceChange(previous, 'storage')
        } catch (cause) {
          this.emitWarning(this.preferenceError(cause, 'PLAYER_QUALITY_PREFERENCE_INVALID', 'Stored quality preference could not be restored.').message)
        }
      }
    }
    if (!this.viewPreferenceRestoreAttempted) {
      this.viewPreferenceRestoreAttempted = true
      if (this.viewPreferenceController.restoreOnLoad) {
        const previous = this.viewPreferenceController.preference
        try {
          const loaded = await this.viewPreferenceController.restoreConfigured()
          const key = loaded?.key ?? this.viewPreferenceController.storageKey ?? ''
          this.events.emit('viewpreferenceloaded', { key, snapshot: loaded?.snapshot ?? null })
          if (loaded) {
            this.applyViewPreference()
            this.events.emit('viewpreferencechange', { previous, preference: loaded.snapshot, source: 'storage' })
          }
        } catch (cause) {
          this.emitWarning(this.preferenceError(cause, 'PLAYER_VIEW_PREFERENCE_INVALID', 'Stored view preference could not be restored.').message)
        }
      }
    }
  }

  private emitQualityPreferenceChange(
    previous: AnyoPlayerQualityPreferenceSnapshot,
    source: 'runtime' | 'storage' | 'policy',
  ): void {
    const preference = this.performanceController.preference
    this.events.emit('qualitypreferencechange', { previous, preference, source })
    this.emitTelemetry('quality.preference-changed', {
      source,
      quality: preference.quality,
      targetFps: preference.targetFps,
      dynamicResolution: preference.dynamicResolution,
    }, 'renderer')
  }

  private persistQualityPreferenceIfConfigured(): void {
    if (!this.performanceController.saveOnChange) return
    void this.saveQualityPreference().catch(error => this.emitWarning(error instanceof Error ? error.message : String(error)))
  }

  private persistViewPreferenceIfConfigured(): void {
    if (!this.viewPreferenceController.saveOnChange) return
    void this.saveViewPreference().catch(error => this.emitWarning(error instanceof Error ? error.message : String(error)))
  }

  private preferenceError(
    cause: unknown,
    code: AnyoPlayerErrorCode,
    message: string,
  ): AnyoPlayerError {
    if (cause instanceof AnyoPlayerError) return cause
    return new AnyoPlayerError(code, message, { cause })
  }

  private applyViewPreference(): void {
    if (!this.viewPreferenceController.enabled) return
    const preference = this.viewPreferenceController.preference
    this.activeRuntime?.camera?.setFieldOfView(preference.fieldOfView)
    this.touchInput.setLookSettings(preference.touchLookScale, preference.invertY)
    this.gamepadInput.setLookSettings(preference.gamepadLookScale, preference.invertY)
  }

  private promoteResolvedSource(resolved: ResolvedPlayerSource): void {
    const normalized = cloneResolvedSource(resolved)
    this.activeSourceCleanup?.()
    this.activeSourceCleanup = normalized.cleanup ?? null
    this.sourceInfoValue = structuredClone(normalized.info)
  }

  private releaseResolvedSource(resolved: ResolvedPlayerSource | null | undefined): void {
    try { resolved?.cleanup?.() }
    catch (error) { this.emitWarning(`Anyo Player source cleanup failed: ${String(error)}`) }
  }

  private releaseActiveSource(): void {
    try { this.activeSourceCleanup?.() }
    catch (error) { this.emitWarning(`Anyo Player source cleanup failed: ${String(error)}`) }
    this.activeSourceCleanup = null
    this.sourceInfoValue = null
  }

  private downloadJson(value: unknown, filename: string): void {
    if (typeof document === 'undefined' || typeof URL === 'undefined') return
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.style.display = 'none'
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  private findNavigationWorldId(source: AnyoPlayerSource): string | null {
    if (!this.navigationOptions) return null
    for (const entry of this.navigationOptions.worlds.values()) {
      if (samePlayerSource(entry.source, source)) return entry.id
    }
    return null
  }

  private getNavigationWorld(worldId: string): NormalizedWorldDefinition {
    if (!this.navigationOptions) {
      throw new AnyoPlayerError('PLAYER_NAVIGATION_DISABLED', 'World navigation is not configured for this Anyo Player.')
    }
    const id = worldId.trim()
    const entry = this.navigationOptions.worlds.get(id)
    if (!entry) {
      throw new AnyoPlayerError('PLAYER_NAVIGATION_UNKNOWN_WORLD', `Unknown Anyo Player world "${id || worldId}".`)
    }
    return entry
  }

  private assertNavigationCurrent(
    sequence: number,
    controller: AbortController,
    allowCommitted = false,
  ): void {
    if (controller.signal.aborted || sequence !== this.navigationSequence) {
      throw new AnyoPlayerError('PLAYER_NAVIGATION_CANCELED', 'World navigation was superseded or canceled.', {
        cause: controller.signal.reason,
      })
    }
    if (!allowCommitted && this.navigationCommitted) {
      throw new AnyoPlayerError('PLAYER_NAVIGATION_BUSY', 'World navigation has already started committing.')
    }
  }

  private setNavigation(navigation: AnyoPlayerWorldNavigationStatus): void {
    const previous = cloneNavigationStatus(this.navigationValue)
    this.navigationValue = cloneNavigationStatus(navigation)
    this.events.emit('worldnavigationchange', { previous, navigation: cloneNavigationStatus(navigation) })
  }

  private setNavigationPresentation(
    presentation: 'none' | 'fade',
    phase: 'preparing' | 'switching' | null,
  ): void {
    const active = presentation !== 'none' && phase !== null
    if (active) {
      this.container.classList.add('anyo-player--world-transition')
      this.container.setAttribute('data-anyo-player-world-transition', phase)
    } else {
      this.container.classList.remove('anyo-player--world-transition')
      this.container.removeAttribute('data-anyo-player-world-transition')
    }
  }

  private configureInput(document: WorldDocument, runtime: PlayerRuntime): void {
    const world = runtime.world
    const exploration = this.options.exploration ?? {}
    const bindings = this.inputBindingsController.bindings
    if (this.desktopEnabled) {
      this.desktopInput.configure({
        pointerLock: exploration.pointerLock ?? document.exploration?.pointerLock ?? true,
        keys: {
          forward: keyboardCodes(bindings, 'move-forward'),
          backward: keyboardCodes(bindings, 'move-backward'),
          left: keyboardCodes(bindings, 'move-left'),
          right: keyboardCodes(bindings, 'move-right'),
          run: keyboardCodes(bindings, 'run'),
          jump: keyboardCodes(bindings, 'jump'),
        },
        interact: keyboardCodes(bindings, 'interact'),
        pause: keyboardCodes(bindings, 'pause'),
        enter: this.accessibilityController.keyboardNavigation ? ['Enter', 'Space'] : [],
        look: {
          up: keyboardCodes(bindings, 'look-up'),
          down: keyboardCodes(bindings, 'look-down'),
          left: keyboardCodes(bindings, 'look-left'),
          right: keyboardCodes(bindings, 'look-right'),
        },
        lookStep: this.options.input === false ? 8 : this.options.input?.keyboardLookSensitivity ?? 8,
        lookScale: this.viewPreference.pointerLookScale,
        invertY: this.viewPreference.invertY,
        preventDefaultKeys: exploration.preventDefaultKeys ?? true,
      })
      // Desktop Player input binds to the Player-owned camera controller when available.
      // Anyo's world.exploration facade intentionally exposes only the stable
      // base movement/look contract, so Player-specific orbit capabilities
      // (RMB drag, free-pointer preference, wheel zoom) must not be hidden behind it.
      this.desktopInput.bind(runtime.camera ?? world.exploration)
    } else {
      world.exploration.setInputEnabled(false)
    }
    this.syncAccessibilityBindings(bindings)
    if (this.touchEnabledValue) {
      this.touchInput.setLookSettings(this.viewPreference.touchLookScale, this.viewPreference.invertY)
      this.touchInput.bind(world.exploration)
    }
    if (this.gamepadInput.enabled) {
      this.gamepadInput.setLookSettings(this.viewPreference.gamepadLookScale, this.viewPreference.invertY)
      this.gamepadInput.configure(bindings)
      this.gamepadInput.bind(world.exploration)
    }
    this.applyViewPreference()
  }

  private enterFromGesture(): void {
    if (this.state !== 'ready') return
    try {
      this.enter()
    } catch (error) {
      const playerError = toPlayerError(
        error,
        'PLAYER_INVALID_STATE',
        'Anyo Player could not enter desktop controls.',
      )
      this.ui.setInputError(playerError)
      this.events.emit('inputerror', playerError)
    }
  }

  private enterTouchFromGesture(): boolean {
    if (!this.touchEnabledValue || !this.activeRuntime) return false
    if (this.state === 'running') return this.inputModeValue === 'touch'
    if (this.state !== 'ready') return false

    this.transition('entering')
    this.ui.setEntering()
    this.deactivateDesktop(true)
    this.inputModeValue = 'touch'
    this.clearInteractionPrompt()
    if (!this.touchInput.activate()) {
      this.inputModeValue = null
      this.transition('ready')
      this.ui.setReady(
        this.readyStatusValue ?? 'ready',
        this.progressValue,
        this.desktopEnabled && !this.touchEnabledValue,
      )
      return false
    }
    this.transition('running')
    this.ui.setRunning()
    this.syncInteractionPresentation()
    this.touchInput.setVisible(true)
    this.events.emit('entered', {
      world: this.activeRuntime.world,
      mode: 'touch',
      pointerLockRequested: false,
    })
    return true
  }

  private enterGamepadFromActivity(index: number): boolean {
    if (!this.gamepadInput.enabled || !this.activeRuntime) return false
    if (this.state === 'running') return this.inputModeValue === 'gamepad'
    if (this.state === 'paused') {
      try {
        this.resumeInternal(false)
      } catch {
        return false
      }
    }
    if (this.state !== 'ready') return false

    this.transition('entering')
    this.ui.setEntering()
    this.deactivateDesktop(true)
    this.touchInput.deactivate()
    this.touchInput.setVisible(false)
    this.inputModeValue = 'gamepad'
    this.clearInteractionPrompt()
    if (!this.gamepadInput.activate(index)) {
      this.inputModeValue = null
      this.transition('ready')
      this.ui.setReady(
        this.readyStatusValue ?? 'ready',
        this.progressValue,
        this.desktopEnabled && !this.touchEnabledValue,
      )
      this.touchInput.setVisible(this.touchEnabledValue)
      return false
    }
    this.transition('running')
    this.ui.setRunning()
    this.syncInteractionPresentation()
    this.events.emit('entered', {
      world: this.activeRuntime.world,
      mode: 'gamepad',
      pointerLockRequested: false,
    })
    return true
  }

  private handleGamepadExit(): void {
    if (this.inputModeValue !== 'gamepad') return
    if (this.state !== 'running' && this.state !== 'entering') return
    this.gamepadInput.deactivate()
    this.inputModeValue = null
    this.transition('ready')
    this.ui.setEnterReady('gamepad-disconnected')
    this.touchInput.setVisible(this.touchEnabledValue)
    this.clearInteractionPrompt()
    this.events.emit('exited', { reason: 'gamepad-disconnected' })
  }

  private handleBoundAction(action: 'interact' | 'pause', device: 'keyboard' | 'gamepad'): void {
    if (action === 'interact') {
      if (this.state !== 'running') return
      if (device === 'keyboard' && this.inputModeValue !== 'desktop') return
      if (device === 'gamepad' && this.inputModeValue !== 'gamepad') return
      void this.interact().catch(() => undefined)
      return
    }
    try {
      if (this.state === 'paused') this.resumeInternal(device !== 'gamepad')
      else if (['ready', 'entering', 'running'].includes(this.state)) this.pauseInternal('user')
    } catch (error) {
      const playerError = toPlayerError(
        error,
        'PLAYER_RUNTIME_CONTROL_FAILED',
        'Anyo Player could not change pause state from the input action map.',
      )
      this.ui.setControlError(playerError)
      this.events.emit('inputerror', playerError)
    }
  }

  private handleTouchTap(clientX: number, clientY: number): void {
    const runtime = this.activeRuntime
    if (!runtime || this.state !== 'running' || this.inputModeValue !== 'touch') return
    let result: ReturnType<PlayerRuntime['renderer']['pick']>
    try {
      result = runtime.renderer.pick(clientX, clientY)
    } catch (error) {
      this.emitWarning(`Anyo Player touch picking failed: ${String(error)}`)
      return
    }
    if (!result) return
    void runtime.world.selectPrimitive({ ...result, source: 'touch' }).catch(error => {
      this.emitWarning(`Anyo Player touch interaction failed: ${String(error)}`)
    })
  }

  private handleInteraction(
    trigger: AnyoPlayerInteractionContext['trigger'],
    payload: EntityInteractionPayload,
  ): void {
    const primitive = payload.primitiveId
      ? this.activeRuntime?.world.compiled?.primitiveById?.get(payload.primitiveId)
      : undefined
    const context: AnyoPlayerInteractionContext = {
      trigger,
      ...(payload.entityId === undefined ? {} : { entityId: payload.entityId }),
      ...(payload.primitiveId === undefined ? {} : { primitiveId: payload.primitiveId }),
      ...(payload.instanceId === undefined ? {} : { instanceId: payload.instanceId }),
      ...(payload.source === undefined ? {} : { source: payload.source }),
      ...(payload.data === undefined ? {} : { data: payload.data }),
      ...(primitive?.interaction?.action === undefined ? {} : { action: primitive.interaction.action }),
      ...(primitive?.interaction?.event === undefined ? {} : { event: primitive.interaction.event }),
      ...(primitive?.interaction?.params === undefined ? {} : { params: primitive.interaction.params }),
    }
    if (trigger === 'select') this.events.emit('interaction', context)
    if (!this.interactionEnabled()) return
    if (trigger === 'hover' && this.interactionPresentation.running) return

    const content = this.resolveInteractionPrompt(context)
    if (!content) {
      if (trigger === 'hover') this.restoreInteractionPrompt()
      return
    }
    this.showInteractionPrompt(content, context, false)
    if (trigger === 'select') {
      const duration = this.options.interaction === false
        ? 0
        : Math.max(0, this.options.interaction?.selectionDuration ?? 1200)
      this.clearInteractionPromptTimer()
      if (duration === 0) {
        this.restoreInteractionPrompt()
      } else {
        this.interactionPromptTimer = setTimeout(() => {
          this.interactionPromptTimer = null
          this.restoreInteractionPrompt()
        }, duration)
      }
    }
  }

  private restoreInteractionPrompt(): void {
    if (this.interactionPresentation.running && this.reticleInteractionContext) {
      const content = this.resolveInteractionPrompt(this.reticleInteractionContext)
      if (content) {
        this.showInteractionPrompt(content, this.reticleInteractionContext, true)
        return
      }
    }
    const payload = this.hoveredInteractionPayload
    if (payload) this.handleInteraction('hover', payload)
    else this.clearInteractionPrompt()
  }

  private interactionEnabled(): boolean {
    return this.options.interaction !== false && this.options.interaction?.enabled !== false
  }

  private resolveInteractionPrompt(
    context: AnyoPlayerInteractionContext,
  ): AnyoPlayerInteractionPromptContent | null {
    const options = this.options.interaction === false ? undefined : this.options.interaction
    try {
      const resolved = options?.resolvePrompt?.(context)
      const content = this.normalizeInteractionPromptContent(resolved)
      if (content) return content
      if (resolved === null) return null
    } catch (error) {
      this.emitWarning(`Anyo Player interaction prompt resolver failed: ${String(error)}`)
    }

    const dataKey = options?.dataKey ?? 'interactionPrompt'
    if (isRecord(context.data)) {
      const dataContent = this.normalizeInteractionPromptContent(context.data[dataKey])
      if (dataContent) return dataContent
    }
    const fallback = options?.defaultText
      ?? (this.options.ui === false ? DEFAULT_UI_LABELS.interactionDefault : this.options.ui?.labels?.interactionDefault)
      ?? DEFAULT_UI_LABELS.interactionDefault
    return fallback.trim() ? { text: fallback.trim() } : null
  }

  private normalizeInteractionPromptContent(value: unknown): AnyoPlayerInteractionPromptContent | null {
    if (typeof value === 'string') {
      const text = value.trim()
      return text ? { text } : null
    }
    if (!isRecord(value)) return null
    const textValue = typeof value.text === 'string' ? value.text.trim() : ''
    const titleValue = typeof value.title === 'string' ? value.title.trim() : ''
    const text = textValue || titleValue
    if (!text) return null
    return {
      text,
      ...(titleValue && titleValue !== text ? { title: titleValue } : {}),
      ...(typeof value.description === 'string' && value.description.trim()
        ? { description: value.description.trim() }
        : {}),
      ...(typeof value.actionLabel === 'string' && value.actionLabel.trim()
        ? { actionLabel: value.actionLabel.trim() }
        : {}),
      ...(typeof value.inputHint === 'string' && value.inputHint.trim()
        ? { inputHint: value.inputHint.trim() }
        : {}),
      ...(typeof value.ariaLabel === 'string' && value.ariaLabel.trim()
        ? { ariaLabel: value.ariaLabel.trim() }
        : {}),
    }
  }

  private showInteractionPrompt(
    content: AnyoPlayerInteractionPromptContent,
    context: AnyoPlayerInteractionContext,
    actionAvailable: boolean,
  ): void {
    this.clearInteractionPromptTimer()
    const labels = this.options.ui === false ? undefined : this.options.ui?.labels
    const interactBindings = this.inputBindingsController.bindings.interact
    const preferredDevice = this.inputModeValue === 'gamepad' ? 'gamepad' : 'keyboard'
    const preferredBinding = interactBindings.find(binding => preferredDevice === 'keyboard'
      ? binding.device === 'keyboard'
      : binding.device !== 'keyboard')
      ?? interactBindings[0]
    const keyLabel = describeInputBinding(preferredBinding) ?? 'E'
    const actionLabel = content.actionLabel
      ?? labels?.interactionAction
      ?? DEFAULT_UI_LABELS.interactionAction
    const inputHint = actionAvailable
      ? content.inputHint
        ?? (labels?.interactionHint ?? DEFAULT_UI_LABELS.interactionHint).replaceAll('{key}', keyLabel)
      : content.inputHint ?? null
    this.interactionPromptValue = {
      visible: true,
      text: content.text,
      title: content.title ?? null,
      description: content.description ?? null,
      actionLabel: actionAvailable ? actionLabel : content.actionLabel ?? null,
      inputHint,
      ariaLabel: content.ariaLabel ?? null,
      actionAvailable,
      trigger: context.trigger,
      entityId: context.entityId ?? null,
      primitiveId: context.primitiveId ?? null,
    }
    this.ui.setInteractionPrompt(this.interactionPromptValue)
    this.events.emit('interactionpromptchange', this.interactionPrompt)
  }

  private clearInteractionPrompt(): void {
    this.clearInteractionPromptTimer()
    if (!this.interactionPromptValue.visible && this.interactionPromptValue.text === '') return
    this.interactionPromptValue = { ...HIDDEN_INTERACTION_PROMPT }
    this.ui.setInteractionPrompt(this.interactionPromptValue)
    this.events.emit('interactionpromptchange', this.interactionPrompt)
  }

  private handleInteractionTargetChange(
    target: AnyoPlayerInteractionTargetState,
    context: AnyoPlayerInteractionContext | null,
  ): void {
    this.interactionTargetValue = { ...target }
    this.reticleInteractionContext = context
    this.reticleValue = {
      visible: this.interactionPresentation.running,
      active: target.available,
    }
    this.ui.setReticle(this.reticleValue)
    this.events.emit('interactiontargetchange', { target: this.interactionTarget })
    if (context && this.interactionEnabled()) {
      const content = this.resolveInteractionPrompt(context)
      if (content) this.showInteractionPrompt(content, context, true)
      else this.clearInteractionPrompt()
    } else if (this.interactionPresentation.running) {
      this.clearInteractionPrompt()
    }
  }

  private handleInteractionActivateStart(target: AnyoPlayerInteractionTargetState): void {
    if (!this.interactionPromptValue.visible || this.interactionPromptValue.primitiveId !== target.primitiveId) return
    this.interactionPromptValue = { ...this.interactionPromptValue, actionAvailable: false }
    this.ui.setInteractionPrompt(this.interactionPromptValue)
  }

  private handleInteractionActivateComplete(
    target: AnyoPlayerInteractionTargetState,
    selected: boolean,
  ): void {
    this.events.emit('interactionactivated', { target, selected })
    if (!selected) this.restoreInteractionPrompt()
  }

  private handleInteractionError(cause: unknown): void {
    this.restoreInteractionPrompt()
    this.emitWarning(`Anyo Player interaction presentation reported an error: ${String(cause)}`)
  }

  private syncInteractionPresentation(): void {
    const shouldRun = this.interactionEnabled()
      && this.state === 'running'
      && (this.inputModeValue === 'desktop' || this.inputModeValue === 'gamepad')
      && (
        this.inputModeValue === 'gamepad'
        || this.reticleMode === 'running'
        || this.desktopInput.pointerLocked
      )
    if (shouldRun && this.activeRuntime) {
      this.interactionPresentation.bind(this.activeRuntime.world, this.activeRuntime.renderer)
      this.interactionPresentation.start()
      const freePointerOrbit = this.inputModeValue === 'desktop' && this.activeRuntime.camera?.prefersPointerLock() === false
      this.reticleValue = {
        visible: this.interactionPresentation.running && !freePointerOrbit,
        active: this.interactionPresentation.running && !freePointerOrbit && this.interactionTargetValue.available,
      }
      this.ui.setReticle(this.reticleValue)
      return
    }
    this.stopInteractionPresentation()
  }

  private stopInteractionPresentation(): void {
    this.interactionPresentation.stop()
    this.reticleInteractionContext = null
    this.interactionTargetValue = { ...EMPTY_INTERACTION_TARGET }
    this.reticleValue = { ...HIDDEN_RETICLE }
    this.ui.setReticle(this.reticleValue)
  }

  private clearInteractionPromptTimer(): void {
    if (this.interactionPromptTimer === null) return
    clearTimeout(this.interactionPromptTimer)
    this.interactionPromptTimer = null
  }

  private handleInputExit(reason: AnyoPlayerExitReason): void {
    if (this.suppressInputExit || this.inputModeValue !== 'desktop') return
    if (this.state !== 'running' && this.state !== 'entering') return
    this.desktopInput.deactivate(reason !== 'pointer-lock-exit')
    this.inputModeValue = null
    this.transition('ready')
    this.ui.setEnterReady(reason)
    this.touchInput.setVisible(this.touchEnabledValue)
    this.clearInteractionPrompt()
    this.events.emit('exited', { reason })
  }

  private handlePointerLockError(error: unknown): void {
    const playerError = new AnyoPlayerError(
      'PLAYER_POINTER_LOCK_FAILED',
      'Anyo Player could not capture the mouse pointer. Click the player to try again.',
      { cause: error },
    )
    this.ui.setInputError(playerError)
    this.events.emit('inputerror', playerError)
  }

  private pauseInternal(reason: AnyoPlayerPauseReason, strict = true): void {
    if (this.state === 'disposing' || this.state === 'disposed') {
      if (!strict) return
      this.assertNotDisposed()
    }
    if (!this.activeRuntime || !['ready', 'entering', 'running'].includes(this.state)) {
      if (!strict) return
      throw new AnyoPlayerError(
        'PLAYER_INVALID_STATE',
        `pause() requires a ready or running world, not state "${this.state}".`,
      )
    }

    const controlsWereActive = this.state === 'running' || this.state === 'entering'
    const previousInputMode = controlsWereActive ? this.inputModeValue : null
    this.suppressInputExit = true
    try {
      this.activeRuntime.world.pause()
      if (controlsWereActive) this.deactivateActiveInput(false)
    } catch (cause) {
      const error = new AnyoPlayerError(
        'PLAYER_RUNTIME_CONTROL_FAILED',
        'Anyo Player could not pause the world runtime.',
        { cause },
      )
      if (!strict) {
        this.emitWarning(error.message)
        return
      }
      throw error
    } finally {
      this.suppressInputExit = false
    }

    this.resumeInputModeAfterPause = previousInputMode
    this.touchInput.setVisible(false)
    this.clearInteractionPrompt()
    this.pauseReasonValue = reason
    this.transition('paused')
    this.ui.setPaused(reason)
    if (controlsWereActive) {
      this.events.emit('exited', { reason: reason === 'visibility' ? 'visibility' : reason === 'offscreen' ? 'offscreen' : 'pause' })
    }
    this.events.emit('paused', { reason })
    this.vfxController.pause()
    this.mapController.pause()
    void this.audioController.pause()
    if (
      !this.sessionRestoreActive
      && (
        (reason === 'user' && this.sessionController.saveOnPause)
        || (reason === 'visibility' && this.sessionController.saveOnVisibilityHidden)
      )
    ) {
      void this.saveConfiguredSession().catch(() => undefined)
    }
  }

  private resumeInternal(requestControls: boolean, strict = true): void {
    if (this.state === 'disposing' || this.state === 'disposed') {
      if (!strict) return
      this.assertNotDisposed()
    }
    if (!this.activeRuntime || this.state !== 'paused' || !this.pauseReasonValue) {
      if (!strict) return
      throw new AnyoPlayerError(
        'PLAYER_INVALID_STATE',
        `resume() requires the player to be paused, not state "${this.state}".`,
      )
    }

    const reason = this.pauseReasonValue
    const resumeMode = requestControls ? this.resumeInputModeAfterPause : null
    const controlsRequested = resumeMode !== null
    try {
      this.activeRuntime.world.resume()
    } catch (cause) {
      const error = new AnyoPlayerError(
        'PLAYER_RUNTIME_CONTROL_FAILED',
        'Anyo Player could not resume the world runtime.',
        { cause },
      )
      if (!strict) {
        this.emitWarning(error.message)
        return
      }
      throw error
    }

    this.pauseReasonValue = null
    this.resumeInputModeAfterPause = null
    this.transition('ready')
    this.ui.setReady(
      this.readyStatusValue ?? 'ready',
      this.progressValue,
      this.desktopEnabled && !this.touchEnabledValue,
    )
    this.touchInput.setVisible(this.touchEnabledValue)
    this.events.emit('resumed', { reason, controlsRequested })
    this.vfxController.resume()
    this.mapController.resume()
    void this.audioController.resume()
    if (resumeMode === 'desktop') this.enterFromGesture()
    else if (resumeMode === 'touch') this.enterTouchFromGesture()
    else if (resumeMode === 'gamepad') {
      const gamepadIndex = this.gamepadInput.gamepads[0]?.index
      if (gamepadIndex !== undefined) this.enterGamepadFromActivity(gamepadIndex)
    }
  }

  private togglePauseFromGesture(): void {
    try {
      if (this.state === 'paused') this.resumeInternal(true)
      else this.pauseInternal('user')
    } catch (error) {
      const playerError = toPlayerError(
        error,
        'PLAYER_RUNTIME_CONTROL_FAILED',
        'Anyo Player could not change pause state.',
      )
      this.ui.setControlError(playerError)
      this.emitWarning(playerError.message)
    }
  }

  private async toggleAudioFromGesture(): Promise<void> {
    try {
      if (!this.audioController.state.unlocked || this.audioController.state.blocked) {
        await this.unlockAudio()
      } else {
        await this.toggleAudioMuted()
      }
    } catch {
      // AudioController already emitted the typed error and updated UI diagnostics.
    }
  }

  private async captureScreenshotFromMenu(): Promise<void> {
    try {
      await this.captureScreenshot()
      this.accessibilityController.announce('Screenshot captured.', 'polite')
    } catch {
      // captureScreenshot already emitted the typed error and updated UI diagnostics.
    }
  }

  private async toggleVRFromGesture(): Promise<void> {
    if (this.state === 'vr-active' || this.state === 'vr-entering') {
      await this.exitVR()
      return
    }
    await this.enterVR()
  }

  private handleVRSupportChange(
    previous: AnyoPlayerVRSupportState,
    state: AnyoPlayerVRSupportState,
  ): void {
    this.ui.setVRSupport(state)
    this.events.emit('vrsupportchange', {
      previous,
      state,
      supported: state === 'supported' ? true : state === 'unsupported' ? false : null,
    })
  }

  private handleXRStateChange(previous: XRSessionState, state: XRSessionState): void {
    this.events.emit('xrstatechange', { previous, state })
    if (state === 'entering') this.ui.setVRSession('entering', this.xrInputs.length)
    else if (state === 'active') this.activateXRSession()
    else if (state === 'exiting') this.ui.setVRSession('exiting', this.xrInputs.length)
    else if (state === 'failed' && ['vr-entering', 'vr-active', 'vr-exiting'].includes(this.state)) {
      this.finishXRSession(!this.xrExitRequested)
    } else if (state === 'idle' && ['vr-entering', 'vr-active', 'vr-exiting'].includes(this.state)) {
      this.finishXRSession(!this.xrExitRequested)
    }
  }

  private handleXRSessionStart(): void {
    this.activateXRSession()
  }

  private handleXRSessionEnd(): void {
    this.finishXRSession(!this.xrExitRequested)
  }

  private activateXRSession(): void {
    if (!this.activeRuntime || this.state !== 'vr-entering') return
    this.transition('vr-active')
    this.ui.setVRSession('active', this.xrInputs.length)
    this.ui.setXRTracking(this.xrTracking)
    this.events.emit('vrentered', {
      world: this.activeRuntime.world,
      inputs: this.xrInputs,
    })
  }

  private finishXRSession(browserEnded: boolean): void {
    if (!['vr-entering', 'vr-active', 'vr-exiting'].includes(this.state)) return
    this.xrExitRequested = false
    this.transition('ready')
    this.ui.setVRSession('idle', 0)
    this.ui.setReady(
      this.readyStatusValue ?? 'ready',
      this.progressValue,
      this.desktopEnabled && !this.touchEnabledValue,
    )
    this.ui.setVRSupport(this.xrController.supportState)
    this.touchInput.setVisible(this.touchEnabledValue)
    this.events.emit('vrexited', { browserEnded })
  }

  private handleXRInputsChange(inputs: readonly XRInputSnapshot[]): void {
    this.ui.setVRSession(this.state === 'vr-active' ? 'active' : this.state === 'vr-entering' ? 'entering' : this.state === 'vr-exiting' ? 'exiting' : 'idle', inputs.length)
    this.events.emit('xrinputchange', { inputs })
  }

  private handleXRTrackingChange(
    previous: AnyoPlayerXRTrackingState,
    state: AnyoPlayerXRTrackingState,
  ): void {
    this.ui.setXRTracking(state)
    this.events.emit('xrtrackingchange', { previous, state })
  }

  private handleXRError(cause: unknown): void {
    const entering = this.state === 'vr-entering'
    const exiting = this.state === 'vr-exiting'
    const error = new AnyoPlayerError(
      exiting ? 'PLAYER_VR_EXIT_FAILED' : entering ? 'PLAYER_VR_ENTER_FAILED' : 'PLAYER_VR_SUPPORT_FAILED',
      exiting
        ? 'Anyo Player encountered an error while exiting immersive VR.'
        : entering
          ? 'Anyo Player encountered an error while entering immersive VR.'
          : 'Anyo Player received an XR runtime error.',
      { cause },
    )
    this.ui.setControlError(error)
    if (!entering && !exiting) this.events.emit('vrerror', error)
  }

  private initializeEmbeddingLifecycle(): void {
    if (this.state === 'disposing' || this.state === 'disposed' || this.lastSource === undefined) return
    const preload = this.embeddingController.preload
    const activation = this.embeddingController.activation
    if (preload === 'source') void this.preload().catch(() => undefined)
    if (preload === 'runtime' || activation === 'immediate') {
      void this.activate().catch(() => undefined)
      return
    }
    if (activation === 'visible' && this.embeddingController.intersection === 'unsupported') {
      void this.activate().catch(() => undefined)
    }
  }

  private handleIntersectionHidden(): void {
    if (!this.embeddingController.pauseWhenOffscreen) return
    if (this.state === 'vr-entering' || this.state === 'vr-active' || this.state === 'vr-exiting') return
    this.pauseInternal('offscreen', false)
  }

  private handleIntersectionVisible(): void {
    if (this.embeddingController.activation === 'visible' && !this.activatedValue && this.lastSource !== undefined) {
      void this.activate().catch(() => undefined)
      return
    }
    if (!this.embeddingController.resumeWhenVisible) return
    if (this.state === 'paused' && this.pauseReasonValue === 'offscreen') {
      this.resumeInternal(false, false)
    }
  }

  private setActivated(activated: boolean): void {
    if (this.activatedValue === activated) return
    this.activatedValue = activated
    this.events.emit('activationchange', { activated })
    this.emitTelemetry(activated ? 'embedding.activated' : 'embedding.deactivated', undefined, 'lifecycle')
  }

  private async resolveRuntimeSource(source: AnyoPlayerSource, signal: AbortSignal): Promise<ResolvedPlayerSource> {
    if (this.preloadedSource && samePlayerSource(this.preloadedSource.source, source)) {
      const resolved = cloneResolvedSource(this.preloadedSource.resolved)
      this.preloadedSource = null
      return resolved
    }
    const pending = this.pendingPreload
    if (pending && samePlayerSource(pending.source, source)) {
      const resolved = await waitForPendingPreload(pending.promise, signal)
      if (this.pendingPreload === pending) this.pendingPreload = null
      this.preloadedSource = null
      return cloneResolvedSource(resolved)
    }
    return this.sourceResolver.resolve(source, signal)
  }

  private handleVisibilityHidden(): void {
    if (this.state === 'vr-entering' || this.state === 'vr-active' || this.state === 'vr-exiting') return
    if (!this.visibilityController.pauseWhenHidden) return
    this.pauseInternal('visibility', false)
  }

  private handleVisibilityVisible(): void {
    if (!this.visibilityController.resumeWhenVisible) return
    if (this.state === 'paused' && this.pauseReasonValue === 'visibility') {
      this.resumeInternal(false, false)
    }
  }

  private async performSessionRestore(
    snapshotInput: unknown,
    options: AnyoPlayerSessionRestoreOptions,
  ): Promise<AnyoPlayerSessionSnapshot> {
    this.assertSessionWorldAvailable('restoreSession')
    const runtime = this.activeRuntime as ManagedRuntime
    const document = this.activeDocument as WorldDocument

    if (this.state === 'running' || this.state === 'entering') {
      this.deactivateActiveInput(true)
      this.inputModeValue = null
      this.transition('ready')
      this.ui.setReady(
        this.readyStatusValue ?? 'ready',
        this.progressValue,
        this.desktopEnabled && !this.touchEnabledValue,
      )
      this.touchInput.setVisible(this.touchEnabledValue)
      this.events.emit('exited', { reason: 'session-restore' })
    }
    this.clearInteractionPrompt()
    this.sessionRestoreActive = true

    try {
      let snapshot: AnyoPlayerSessionSnapshot
      try {
        snapshot = await this.sessionController.restoreWorld({
          world: runtime.world,
          document,
          onWarning: message => this.emitWarning(message),
        }, snapshotInput, options)
      } catch (error) {
        const playerError = this.sessionError(
          error,
          'PLAYER_SESSION_RESTORE_FAILED',
          'Anyo Player could not restore the session.',
        )
        this.events.emit('sessionerror', playerError)
        throw playerError
      }

      runtime.camera?.teleport({ position: snapshot.camera.position, rotation: [snapshot.camera.yaw, snapshot.camera.pitch] })
      const restorePauseState = options.restorePauseState ?? true
      if (restorePauseState) {
        if (snapshot.player.paused) {
          if (this.state !== 'paused') this.pauseInternal(snapshot.player.pauseReason ?? 'user')
          else {
            this.pauseReasonValue = snapshot.player.pauseReason ?? 'user'
            this.ui.setPaused(this.pauseReasonValue)
          }
          this.resumeInputModeAfterPause = this.supportedSessionInputMode(snapshot.player.inputMode)
        } else if (this.state === 'paused') {
          this.resumeInternal(false)
        }
      }

      this.events.emit('sessionrestored', { snapshot: structuredClone(snapshot) })
      return structuredClone(snapshot)
    } finally {
      this.sessionRestoreActive = false
    }
  }

  private supportedSessionInputMode(mode: AnyoPlayerInputMode | null): AnyoPlayerInputMode | null {
    if (mode === 'desktop' && this.desktopEnabled) return mode
    if (mode === 'touch' && this.touchEnabledValue) return mode
    if (mode === 'gamepad' && this.gamepadInput.enabled) return mode
    return null
  }

  private applyInputBindings(bindings: AnyoPlayerInputBindingMap): void {
    const exploration = this.options.exploration ?? {}
    this.desktopInput.configure({
      pointerLock: exploration.pointerLock ?? this.activeDocument?.exploration?.pointerLock ?? true,
      keys: {
        forward: keyboardCodes(bindings, 'move-forward'),
        backward: keyboardCodes(bindings, 'move-backward'),
        left: keyboardCodes(bindings, 'move-left'),
        right: keyboardCodes(bindings, 'move-right'),
        run: keyboardCodes(bindings, 'run'),
        jump: keyboardCodes(bindings, 'jump'),
      },
      interact: keyboardCodes(bindings, 'interact'),
      pause: keyboardCodes(bindings, 'pause'),
      enter: this.accessibilityController.keyboardNavigation ? ['Enter', 'Space'] : [],
      look: {
        up: keyboardCodes(bindings, 'look-up'),
        down: keyboardCodes(bindings, 'look-down'),
        left: keyboardCodes(bindings, 'look-left'),
        right: keyboardCodes(bindings, 'look-right'),
      },
      lookStep: this.options.input === false ? 8 : this.options.input?.keyboardLookSensitivity ?? 8,
      lookScale: this.viewPreference.pointerLookScale,
      invertY: this.viewPreference.invertY,
      preventDefaultKeys: exploration.preventDefaultKeys ?? true,
    })
    this.gamepadInput.configure(bindings)
    this.syncAccessibilityBindings(bindings)
    if (this.interactionPromptValue.visible) this.restoreInteractionPrompt()
  }

  private syncAccessibilityBindings(bindings: AnyoPlayerInputBindingMap): void {
    this.ui.setKeyboardShortcuts(bindings)
    const configured = this.options.accessibility === false ? undefined : this.options.accessibility?.instructions
    if (configured !== undefined) {
      this.accessibilityController.setInstructions(configured)
      return
    }
    const movement = [
      ...keyboardCodes(bindings, 'move-forward'),
      ...keyboardCodes(bindings, 'move-backward'),
      ...keyboardCodes(bindings, 'move-left'),
      ...keyboardCodes(bindings, 'move-right'),
    ].map(code => describeInputBinding({ device: 'keyboard', code })).filter(Boolean)
    const movementKeys = [...new Set(movement)].join(', ')
    const interact = describeInputBinding(bindings.interact[0])
    const pause = describeInputBinding(bindings.pause[0])
    const instructions = [
      'Interactive 3D world.',
      this.accessibilityController.keyboardNavigation ? 'Press Enter or Space to enable world controls.' : '',
      movementKeys ? `Move with ${movementKeys}.` : '',
      interact ? `Interact with ${interact}.` : '',
      pause ? `Pause or resume with ${pause}.` : '',
      'Press Escape to release world controls. Use Tab to reach player buttons.',
    ].filter(Boolean).join(' ')
    this.accessibilityController.setInstructions(instructions)
  }

  private persistInputBindingsOnChange(): void {
    if (!this.inputBindingsController.saveOnChange || !this.inputBindingsController.storageAvailable) return
    void this.inputBindingsController.save().then(saved => {
      if (this.state === 'disposed' || this.state === 'disposing') return
      this.events.emit('inputbindingssaved', {
        key: saved.key,
        snapshot: structuredClone(saved.snapshot),
      })
    }).catch(error => {
      if (this.state === 'disposed' || this.state === 'disposing') return
      const playerError = this.inputBindingsError(
        error,
        'PLAYER_INPUT_BINDINGS_SAVE_FAILED',
        'Anyo Player could not persist the changed input bindings.',
      )
      this.events.emit('inputbindingserror', playerError)
      this.emitWarning(playerError.message)
    })
  }

  private async restoreConfiguredInputBindings(): Promise<void> {
    if (this.inputBindingsRestoreAttempted) return
    this.inputBindingsRestoreAttempted = true
    if (
      !this.inputBindingsController.restoreOnLoad
      || !this.inputBindingsController.storageAvailable
      || !this.inputBindingsController.storageKey
    ) return
    try {
      const loaded = await this.inputBindingsController.load()
      this.applyInputBindings(this.inputBindingsController.bindings)
      this.events.emit('inputbindingsloaded', {
        key: loaded?.key ?? this.inputBindingsController.storageKey,
        snapshot: loaded ? structuredClone(loaded.snapshot) : null,
      })
      if (loaded) {
        this.events.emit('inputbindingschange', {
          bindings: cloneInputBindingMap(loaded.snapshot.bindings),
          source: 'storage',
        })
      }
    } catch (error) {
      const playerError = this.inputBindingsError(
        error,
        'PLAYER_INPUT_BINDINGS_LOAD_FAILED',
        'Anyo Player could not restore the configured input bindings.',
      )
      this.events.emit('inputbindingserror', playerError)
      this.emitWarning(playerError.message)
    }
  }

  private inputBindingsError(
    error: unknown,
    fallbackCode: AnyoPlayerErrorCode,
    fallbackMessage: string,
  ): AnyoPlayerError {
    if (error instanceof AnyoPlayerError) return error
    if (error instanceof TypeError || error instanceof SyntaxError) {
      return new AnyoPlayerError('PLAYER_INPUT_BINDINGS_INVALID', error.message, { cause: error })
    }
    return new AnyoPlayerError(fallbackCode, fallbackMessage, { cause: error })
  }

  private async restoreConfiguredSessionAfterLoad(): Promise<void> {
    if (
      !this.sessionController.restoreOnLoad
      || !this.sessionController.storageAvailable
      || !this.sessionController.storageKey
      || !this.activeRuntime
      || !this.activeDocument
    ) return
    try {
      const loaded = await this.sessionController.load()
      this.events.emit('sessionloaded', {
        key: loaded?.key ?? this.sessionController.storageKey,
        snapshot: loaded ? structuredClone(loaded.snapshot) : null,
      })
      if (loaded) await this.performSessionRestore(loaded.snapshot, {})
    } catch (error) {
      const playerError = this.sessionError(
        error,
        'PLAYER_SESSION_LOAD_FAILED',
        'Anyo Player could not restore the configured saved session.',
      )
      this.events.emit('sessionerror', playerError)
      this.emitWarning(playerError.message)
    }
  }

  private async saveConfiguredSession(): Promise<void> {
    if (!this.sessionController.storageAvailable || !this.sessionController.storageKey) return
    try {
      await this.saveSession()
    } catch {
      // saveSession emits the typed sessionerror event. Automatic persistence is non-fatal.
    }
  }

  private assertSessionWorldAvailable(operation: string): void {
    this.assertNotDisposed()
    if (!this.sessionController.enabled) {
      throw new AnyoPlayerError(
        'PLAYER_SESSION_DISABLED',
        'Session support is disabled for this Anyo Player.',
      )
    }
    if (
      !this.activeRuntime
      || !this.activeDocument
      || !['ready', 'entering', 'running', 'paused', 'vr-entering', 'vr-active'].includes(this.state)
    ) {
      throw new AnyoPlayerError(
        'PLAYER_INVALID_STATE',
        `${operation}() requires a loaded world, not state "${this.state}".`,
      )
    }
  }

  private sessionError(
    error: unknown,
    fallbackCode: AnyoPlayerErrorCode,
    fallbackMessage: string,
  ): AnyoPlayerError {
    if (error instanceof AnyoPlayerError) return error
    if (error instanceof TypeError || error instanceof SyntaxError) {
      return new AnyoPlayerError('PLAYER_SESSION_INVALID', error.message, { cause: error })
    }
    return new AnyoPlayerError(fallbackCode, fallbackMessage, { cause: error })
  }

  private handleFullscreenError(error: AnyoPlayerError): void {
    this.ui.setControlError(error)
    this.events.emit('fullscreenerror', error)
  }

  private assertFullscreenState(): void {
    this.assertNotDisposed()
    if (!this.activeRuntime || !['ready', 'entering', 'running', 'paused'].includes(this.state)) {
      throw new AnyoPlayerError(
        'PLAYER_INVALID_STATE',
        `Fullscreen requires a loaded world, not state "${this.state}".`,
      )
    }
  }

  private deactivateDesktop(releasePointerLock: boolean): void {
    this.suppressInputExit = true
    try {
      this.desktopInput.deactivate(releasePointerLock)
    } finally {
      this.suppressInputExit = false
    }
  }

  private deactivateActiveInput(releasePointerLock: boolean): void {
    this.stopInteractionPresentation()
    if (this.inputModeValue === 'desktop') this.deactivateDesktop(releasePointerLock)
    else if (this.inputModeValue === 'touch') this.touchInput.deactivate()
    else if (this.inputModeValue === 'gamepad') this.gamepadInput.deactivate()
    this.inputModeValue = null
  }

  private manageRuntime(runtime: PlayerRuntime, operationId: number): ManagedRuntime {
    let resolveFatal!: (diagnostic: RendererDiagnostic) => void
    const fatalSignal = new Promise<RendererDiagnostic>(resolve => {
      resolveFatal = resolve
    })
    const managed: ManagedRuntime = {
      ...runtime,
      operationId,
      eventCleanups: [],
      actionCleanups: new Map(),
      fatalDiagnostic: null,
      fatalSignal,
      resolveFatal,
      fatalHandled: false,
      disposed: false,
    }
    managed.eventCleanups.push(
      managed.world.on<RendererAssetProgress>('assets:progress', progress => {
        if (!this.isRuntimeRelevant(managed)) return
        this.progressValue = { ...progress }
        this.emitProgress()
      }),
      managed.world.on('renderer:diagnostic', diagnosticValue => {
        if (!this.isRuntimeRelevant(managed)) return
        const diagnostic = diagnosticValue as RendererDiagnostic
        this.events.emit('diagnostic', diagnostic)
        this.recordRendererDiagnostic(diagnostic)
        this.emitTelemetry('renderer.diagnostic', {
          code: diagnostic.code,
          severity: diagnostic.severity,
          message: diagnostic.message,
          details: diagnostic.details,
        }, 'renderer')
        this.ui.handleDiagnostic(diagnostic)
        if (diagnostic.code === 'SEKAI64_WEBGPU_DEVICE_LOST') {
          this.markRuntimeFatal(managed, diagnostic)
          if (
            this.activeRuntime === managed
            && (this.state === 'ready' || this.state === 'entering' || this.state === 'running' || this.state === 'paused' || this.state === 'replacing' || this.state === 'vr-entering' || this.state === 'vr-active' || this.state === 'vr-exiting')
          ) {
            this.handleActiveRuntimeLoss(managed, diagnostic)
          }
        }
      }),
      managed.world.on<EntityInteractionPayload>('entity:hover', payload => {
        if (!this.isRuntimeRelevant(managed)) return
        this.hoveredInteractionEntity = payload.entityId ?? null
        this.hoveredInteractionPayload = payload
        this.handleInteraction('hover', payload)
      }),
      managed.world.on<EntityInteractionPayload>('entity:hover-leave', payload => {
        if (!this.isRuntimeRelevant(managed)) return
        if (payload.entityId && this.hoveredInteractionEntity !== payload.entityId) return
        this.hoveredInteractionEntity = null
        this.hoveredInteractionPayload = null
        this.clearInteractionPrompt()
      }),
      managed.world.on<EntityInteractionPayload>('entity:select', payload => {
        if (!this.isRuntimeRelevant(managed)) return
        this.handleInteraction('select', payload)
      }),
      managed.world.on('audio:blocked', () => {
        if (!this.isRuntimeRelevant(managed)) return
        this.audioController.markBlocked()
        this.ui.setAudioState(this.audioController.state)
      }),
    )
    return managed
  }

  private async awaitRuntimeStep<T>(runtime: ManagedRuntime, step: Promise<T>): Promise<T> {
    const result = await Promise.race([
      step.then(value => ({ kind: 'value' as const, value })),
      runtime.fatalSignal.then(diagnostic => ({ kind: 'fatal' as const, diagnostic })),
    ])
    if (result.kind === 'fatal') throw this.rendererLossError(result.diagnostic)
    return result.value
  }

  private markRuntimeFatal(runtime: ManagedRuntime, diagnostic: RendererDiagnostic): void {
    if (runtime.fatalDiagnostic) return
    runtime.fatalDiagnostic = diagnostic
    runtime.resolveFatal(diagnostic)
  }

  private handleActiveRuntimeLoss(
    runtime: ManagedRuntime,
    diagnostic: RendererDiagnostic,
  ): void {
    if (runtime.fatalHandled || !this.isRuntimeRelevant(runtime)) return
    runtime.fatalHandled = true
    this.rendererRecoverySnapshot = this.captureRendererRecoverySession()
    if (this.state === 'running' || this.state === 'entering') {
      this.deactivateActiveInput(true)
      this.events.emit('exited', { reason: 'runtime-error' })
    }
    if (this.state === 'vr-entering' || this.state === 'vr-active' || this.state === 'vr-exiting') {
      this.xrController.unbind()
    }
    this.pauseReasonValue = null
    this.resumeInputModeAfterPause = null
    this.inputModeValue = null
    this.desktopInput.unbind()
    this.touchInput.unbind()
    this.gamepadInput.unbind()
    this.touchInput.setVisible(false)
    this.clearInteractionPrompt()
    this.activeDocument = null
    this.replacementContext = null
    this.replacementStage = 'idle'

    const error = this.rendererLossError(diagnostic)
    this.errorValue = error
    this.readyStatusValue = null
    this.transition('error')
    this.setPhase('error')
    this.ui.setError(error)
    this.events.emit('error', error)

    try {
      runtime.world.stop()
    } catch (stopError) {
      this.emitWarning(`Anyo Player could not stop a lost renderer cleanly: ${String(stopError)}`)
    }

    const cleanup = this.operationTail.then(async () => {
      if (this.activeRuntime === runtime) this.activeRuntime = null
      await this.disposeManagedRuntime(runtime)
    })
    this.operationTail = cleanup.then(() => undefined, () => undefined)
    if (this.rendererRecoveryOptions.enabled && this.rendererRecoveryOptions.automatic) {
      this.scheduleRendererRecovery(diagnostic)
    } else {
      this.setRendererRecovery({
        state: 'idle',
        attempt: 0,
        maxAttempts: this.rendererRecoveryOptions.maxAttempts,
        automatic: false,
        diagnosticCode: diagnostic.code,
        error: null,
      })
    }
  }

  private rendererLossError(diagnostic: RendererDiagnostic): AnyoPlayerError {
    return new AnyoPlayerError(
      'PLAYER_RENDERER_LOST',
      diagnostic.code === 'SEKAI64_WEBGPU_DEVICE_LOST'
        ? 'The WebGPU device was lost. Retry to create a clean renderer and reload the world.'
        : diagnostic.message,
      { cause: diagnostic },
    )
  }

  private emitTelemetry(
    name: string,
    details?: Record<string, unknown>,
    category: AnyoPlayerTelemetryCategory = 'host',
  ): AnyoPlayerTelemetryEvent | null {
    return this.telemetryController.track(name, category, { state: this.state, phase: this.phase }, details)
  }

  private handleWebSurfaceDiagnostic(
    diagnostic: WebSurfaceDiagnostic,
    hostCallback?: (diagnostic: WebSurfaceDiagnostic) => void,
  ): void {
    try {
      this.recordWebSurfaceDiagnostic(diagnostic)
      this.emitTelemetry('web-surface.diagnostic', {
        code: diagnostic.code,
        severity: diagnostic.severity,
        message: diagnostic.message,
        entityId: diagnostic.entityId,
        primitiveId: diagnostic.primitiveId,
        details: diagnostic.details,
      }, 'renderer')
      if (diagnostic.severity !== 'info') {
        this.emitWarning(`[${diagnostic.code}] ${diagnostic.message}`)
      }
    } catch {
      // Diagnostics must never break the active world frame.
    }

    if (!hostCallback) return
    try {
      hostCallback(diagnostic)
    } catch (error) {
      try {
        this.emitWarning(`Anyo Player Web Surface diagnostic callback failed: ${String(error)}`)
      } catch {
        // Host warning callbacks are isolated from the Web Surface runtime.
      }
    }
  }

  private recordWebSurfaceDiagnostic(diagnostic: WebSurfaceDiagnostic): void {
    if (this.diagnosticHistoryLimit <= 0) return
    const record: AnyoPlayerDiagnosticRecord = {
      sequence: ++this.diagnosticSequence,
      timestamp: this.now().toISOString(),
      source: 'player',
      code: diagnostic.code,
      message: diagnostic.message,
      severity: diagnostic.severity,
      recoverable: true,
    }
    this.diagnosticsValue.push(record)
    if (this.diagnosticsValue.length > this.diagnosticHistoryLimit) {
      this.diagnosticsValue.splice(0, this.diagnosticsValue.length - this.diagnosticHistoryLimit)
    }
    this.events.emit('diagnosticrecorded', { record: structuredClone(record) })
  }

  private recordPlayerDiagnostic(error: AnyoPlayerError, recoverable: boolean): void {
    if (this.diagnosticHistoryLimit <= 0) return
    const record: AnyoPlayerDiagnosticRecord = {
      sequence: ++this.diagnosticSequence,
      timestamp: this.now().toISOString(),
      source: 'player',
      code: error.code,
      message: error.message,
      severity: 'error',
      recoverable,
    }
    this.diagnosticsValue.push(record)
    if (this.diagnosticsValue.length > this.diagnosticHistoryLimit) {
      this.diagnosticsValue.splice(0, this.diagnosticsValue.length - this.diagnosticHistoryLimit)
    }
    this.events.emit('diagnosticrecorded', { record: structuredClone(record) })
  }

  private recordRendererDiagnostic(diagnostic: RendererDiagnostic): void {
    if (this.diagnosticHistoryLimit <= 0) return
    const fatal = diagnostic.code === 'SEKAI64_WEBGPU_DEVICE_LOST'
    const recoverable = fatal
      ? this.rendererRecoveryOptions.enabled
      : diagnostic.code === 'SEKAI64_WEBGL_CONTEXT_LOST' || diagnostic.code === 'SEKAI64_WEBGL_CONTEXT_RESTORED'
    const record: AnyoPlayerDiagnosticRecord = {
      sequence: ++this.diagnosticSequence,
      timestamp: this.now().toISOString(),
      source: 'renderer',
      code: diagnostic.code,
      message: diagnostic.message,
      severity: fatal ? 'fatal' : diagnostic.severity,
      recoverable,
      diagnostic: structuredClone(diagnostic),
    }
    this.diagnosticsValue.push(record)
    if (this.diagnosticsValue.length > this.diagnosticHistoryLimit) {
      this.diagnosticsValue.splice(0, this.diagnosticsValue.length - this.diagnosticHistoryLimit)
    }
    this.events.emit('diagnosticrecorded', { record: structuredClone(record) })
  }

  private captureRendererRecoverySession(): AnyoPlayerSessionSnapshot | null {
    if (!this.rendererRecoveryOptions.restoreSession || !this.sessionController.enabled || !this.activeRuntime || !this.activeDocument) return null
    try {
      return this.sessionController.capture({
        world: this.activeRuntime.world,
        document: this.activeDocument,
        paused: this.state === 'paused',
        pauseReason: this.pauseReasonValue,
        inputMode: this.inputModeValue ?? this.resumeInputModeAfterPause,
      })
    } catch (error) {
      this.emitWarning(`Anyo Player could not capture a renderer-recovery session: ${String(error)}`)
      return null
    }
  }

  private scheduleRendererRecovery(diagnostic: RendererDiagnostic): void {
    this.clearRendererRecoveryTimer()
    this.setRendererRecovery({
      state: 'scheduled',
      attempt: 0,
      maxAttempts: this.rendererRecoveryOptions.maxAttempts,
      automatic: true,
      diagnosticCode: diagnostic.code,
      error: null,
    })
    this.scheduleNextRendererRecoveryAttempt()
  }

  private scheduleNextRendererRecoveryAttempt(): void {
    const attempt = this.rendererRecoveryValue.attempt + 1
    const delay = this.rendererRecoveryOptions.delayMs
      * Math.pow(this.rendererRecoveryOptions.backoff, Math.max(0, attempt - 1))
    this.rendererRecoveryTimer = setTimeout(() => {
      this.rendererRecoveryTimer = null
      const run = this.performRendererRecovery(true)
      const tracked = run.finally(() => {
        if (this.rendererRecoveryPromise === tracked) this.rendererRecoveryPromise = null
      })
      this.rendererRecoveryPromise = tracked
      void tracked.catch(() => undefined)
    }, delay)
  }

  private async performRendererRecovery(automatic: boolean): Promise<void> {
    const attempt = automatic ? this.rendererRecoveryValue.attempt + 1 : Math.max(1, this.rendererRecoveryValue.attempt + 1)
    this.setRendererRecovery({
      state: 'recovering',
      attempt,
      maxAttempts: this.rendererRecoveryOptions.maxAttempts,
      automatic,
      diagnosticCode: this.rendererRecoveryValue.diagnosticCode,
      error: null,
    })
    const fallback = this.rendererRecoveryOptions.fallbackBackend
    if (
      fallback
      && attempt >= this.rendererRecoveryOptions.fallbackAfterAttempt
      && this.rendererRecoveryValue.diagnosticCode === 'SEKAI64_WEBGPU_DEVICE_LOST'
    ) {
      this.recoveryRendererBackendOverride = fallback
      this.emitTelemetry('renderer.recovery-backend-fallback', { backend: fallback, attempt }, 'recovery')
    }
    try {
      await this.load(this.lastSource)
      const snapshot = this.rendererRecoverySnapshot
      if (snapshot && this.rendererRecoveryOptions.restoreSession) {
        await this.restoreSession(snapshot, { restorePauseState: true, restoreRuntimeData: true })
      }
      this.rendererRecoverySnapshot = null
      this.setRendererRecovery({
        ...this.rendererRecoveryValue,
        state: 'recovered',
        error: null,
      })
    } catch (cause) {
      const error = cause instanceof AnyoPlayerError
        ? cause
        : new AnyoPlayerError('PLAYER_RENDERER_RECOVERY_FAILED', 'Anyo Player could not rebuild the lost renderer.', { cause })
      if (automatic && attempt < this.rendererRecoveryOptions.maxAttempts && this.state === 'error') {
        this.setRendererRecovery({
          ...this.rendererRecoveryValue,
          state: 'scheduled',
          error,
        })
        this.scheduleNextRendererRecoveryAttempt()
        return
      }
      const recoveryError = error.code === 'PLAYER_RENDERER_RECOVERY_FAILED'
        ? error
        : new AnyoPlayerError('PLAYER_RENDERER_RECOVERY_FAILED', 'Anyo Player exhausted renderer recovery attempts.', { cause: error })
      this.errorValue = recoveryError
      this.ui.setError(recoveryError)
      this.recordPlayerDiagnostic(recoveryError, false)
      this.events.emit('error', recoveryError)
      this.setRendererRecovery({
        ...this.rendererRecoveryValue,
        state: 'failed',
        error: recoveryError,
      })
      throw recoveryError
    }
  }

  private setRendererRecovery(next: AnyoPlayerRendererRecoveryStatus): void {
    const previous = cloneRecoveryStatus(this.rendererRecoveryValue)
    this.rendererRecoveryValue = cloneRecoveryStatus(next)
    this.events.emit('rendererrecoverychange', {
      previous,
      recovery: cloneRecoveryStatus(next),
    })
    this.emitTelemetry(`renderer.recovery-${next.state}`, {
      attempt: next.attempt,
      maxAttempts: next.maxAttempts,
      automatic: next.automatic,
      diagnosticCode: next.diagnosticCode,
      errorCode: next.error?.code ?? null,
    }, 'recovery')
  }

  private clearRendererRecoveryTimer(): void {
    if (this.rendererRecoveryTimer === null) return
    clearTimeout(this.rendererRecoveryTimer)
    this.rendererRecoveryTimer = null
  }

  private installStagedActions(runtime: ManagedRuntime): void {
    for (const [name, registration] of this.actions) this.installAction(runtime, name, registration)
  }

  private installAction(
    runtime: ManagedRuntime | null,
    name: string,
    registration: ActionRegistration,
  ): void {
    if (!runtime || runtime.disposed) return
    runtime.actionCleanups.get(name)?.cleanup()
    runtime.actionCleanups.set(name, {
      token: registration.token,
      cleanup: runtime.world.registerAction(name, registration.handler),
    })
  }

  private removeRuntimeAction(name: string, token: symbol): void {
    for (const runtime of [this.pendingRuntime, this.activeRuntime]) {
      const installed = runtime?.actionCleanups.get(name)
      if (!runtime || !installed || installed.token !== token) continue
      installed.cleanup()
      runtime.actionCleanups.delete(name)
    }
  }

  private async disposeManagedRuntime(runtime: ManagedRuntime): Promise<void> {
    if (runtime.disposed) return
    runtime.disposed = true
    this.responsive.detach(runtime.renderer)
    if (this.activeRuntime === runtime || this.pendingRuntime === runtime) this.interactionPresentation.unbind()
    for (const cleanup of runtime.eventCleanups.splice(0)) cleanup()
    for (const installed of runtime.actionCleanups.values()) installed.cleanup()
    runtime.actionCleanups.clear()
    try {
      await runtime.world.disposeAsync()
    } catch (error) {
      this.emitWarning(`Anyo Player runtime disposal reported an error: ${String(error)}`)
    }
  }

  private isRuntimeRelevant(runtime: ManagedRuntime): boolean {
    if (runtime.disposed) return false
    if (this.activeRuntime === runtime) return true
    return this.pendingRuntime === runtime && runtime.operationId === this.operationId
  }

  private assertCanLoad(): void {
    this.assertNotDisposed()
    if (this.state === 'ready' || this.state === 'entering' || this.state === 'running' || this.state === 'paused' || this.state === 'replacing' || this.state === 'vr-entering' || this.state === 'vr-active' || this.state === 'vr-exiting') {
      throw new AnyoPlayerError(
        'PLAYER_INVALID_STATE',
        'This Anyo Player has already loaded a world. Use replaceWorld(source) for live replacement.',
      )
    }
  }

  private assertNotDisposed(): void {
    if (this.state === 'disposing' || this.state === 'disposed') {
      throw new AnyoPlayerError('PLAYER_DISPOSED', 'Anyo Player is disposing or has already been disposed.')
    }
  }

  private assertCurrentOperation(operationId: number): void {
    this.assertNotDisposed()
    if (!this.isCurrentOperation(operationId)) {
      throw new AnyoPlayerError(
        'PLAYER_OPERATION_SUPERSEDED',
        'Anyo Player loading was superseded by a newer operation.',
      )
    }
  }

  private isCurrentOperation(operationId: number): boolean {
    return operationId === this.operationId
  }

  private transition(next: AnyoPlayerState): void {
    const change = this.stateMachine.transition(next)
    if (!change) return
    this.events.emit('statechange', change)
    this.emitTelemetry('player.state-change', change, 'lifecycle')
  }

  private setPhase(phase: AnyoPlayerLoadingPhase): void {
    if (this.phaseValue === phase) return
    const previous = this.phaseValue
    this.phaseValue = phase
    this.ui.setPhase(phase)
    const change = { previous, phase }
    this.events.emit('phasechange', change)
    this.emitTelemetry('player.phase-change', change, 'lifecycle')
    if (this.options.accessibility !== false && this.options.accessibility?.announceStatusChanges === true) {
      const announcements: Partial<Record<AnyoPlayerLoadingPhase, string>> = {
        'resolving-source': 'Loading world source.',
        'creating-runtime': 'Creating renderer.',
        'loading-world': 'Loading world.',
        'replacing-world': 'Replacing world.',
        'ready': 'World ready.',
        'ready-with-warnings': 'World ready with warnings.',
        'error': 'World loading failed.',
      }
      const message = announcements[phase]
      if (message) this.accessibilityController.announce(message, phase === 'error' ? 'assertive' : 'polite')
    }
  }

  private emitProgress(): void {
    const progress = this.progress
    this.ui.setProgress(progress)
    this.events.emit('progress', progress)
  }

  private emitWarning(message: string): void {
    this.emitTelemetry('player.warning', { message }, 'lifecycle')
    this.options.onWarning?.(message)
    this.ui.handleWarning(message)
    this.events.emit('warning', { message })
  }
}
