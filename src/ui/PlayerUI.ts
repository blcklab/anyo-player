import type { RendererAssetProgress, RendererDiagnostic } from '@blcklab/anyo'
import type { AnyoPlayerError } from '../errors.js'
import type {
  AnyoPlayerAccessibilityOptions,
  AnyoPlayerAudioState,
  AnyoPlayerCaptionState,
  AnyoPlayerExitReason,
  AnyoPlayerInputBindingMap,
  AnyoPlayerInteractionPromptState,
  AnyoPlayerReticleState,
  AnyoPlayerLoadingPhase,
  AnyoPlayerPauseReason,
  AnyoPlayerPauseMenuOptions,
  AnyoPlayerReadyStatus,
  AnyoPlayerUiAdapter,
  AnyoPlayerUiAdapterActions,
  AnyoPlayerUiLabels,
  AnyoPlayerUiOptions,
  AnyoPlayerUiSlotMap,
  AnyoPlayerUiSlotName,
  AnyoPlayerUiSnapshot,
  AnyoPlayerVRSupportState,
  AnyoPlayerXRTrackingState,
} from '../types.js'

export type PlayerUIFocusTarget = 'enter' | 'pause' | 'retry' | 'interaction' | 'vr'

export interface PlayerUIAccessibilityConfiguration {
  options: false | AnyoPlayerAccessibilityOptions | undefined
  isKeyboardModality(): boolean
}

export interface PlayerUIController {
  setPhase(phase: AnyoPlayerLoadingPhase): void
  setProgress(progress: RendererAssetProgress): void
  setReady(status: AnyoPlayerReadyStatus, progress: RendererAssetProgress, enterRequired: boolean): void
  setEntering(): void
  setRunning(): void
  setPaused(reason: AnyoPlayerPauseReason): void
  setEnterReady(reason?: AnyoPlayerExitReason): void
  setFullscreen(fullscreen: boolean): void
  setInteractionPrompt(prompt: AnyoPlayerInteractionPromptState): void
  setReticle(state: AnyoPlayerReticleState): void
  setVRSupport(state: AnyoPlayerVRSupportState): void
  setVRSession(state: 'idle' | 'entering' | 'active' | 'exiting', inputCount: number): void
  setXRTracking(state: AnyoPlayerXRTrackingState): void
  setKeyboardShortcuts(bindings: AnyoPlayerInputBindingMap): void
  setAudioState(state: AnyoPlayerAudioState): void
  setMapAttribution(text: string | null): void
  setCaption?(caption: AnyoPlayerCaptionState): void
  focusPrimaryAction(target: PlayerUIFocusTarget): void
  setInputError(error: AnyoPlayerError): void
  setControlError(error: AnyoPlayerError): void
  setError(error: AnyoPlayerError): void
  handleDiagnostic(diagnostic: RendererDiagnostic): void
  handleWarning(message: string): void
  dispose(): void
}

export const DEFAULT_UI_LABELS: Readonly<AnyoPlayerUiLabels> = {
  loadingTitle: 'Loading world',
  resolvingSource: 'Resolving world source…',
  creatingRuntime: 'Starting renderer…',
  loadingWorld: 'Building world…',
  waitingReady: 'Preparing world runtime…',
  loadingAssets: 'Loading world assets…',
  replacingWorld: 'Replacing world…',
  replacementFailed: 'The new world could not be loaded. The previous world is still available.',
  readyWithWarnings: '{failed} asset(s) failed to load. The world is ready with warnings.',
  enterTitle: 'Enter world',
  enterMessage: 'Click to focus the world and enable controls.',
  enterButton: 'Enter',
  reenterMessage: 'Click to resume world controls.',
  pointerLockFailed: 'Mouse capture was unavailable. Click to try again.',
  pause: 'Pause',
  resume: 'Resume',
  muteAudio: 'Mute audio',
  unmuteAudio: 'Unmute audio',
  unlockAudio: 'Enable audio',
  audioUnavailable: 'Audio control is unavailable.',
  takeScreenshot: 'Take screenshot',
  screenshotCaptured: 'Screenshot captured.',
  screenshotFailed: 'Screenshot could not be captured.',
  pauseMenuTitle: 'World paused',
  pauseMenuMessage: 'Choose an action or resume the world.',
  pausedTitle: 'World paused',
  pausedMessage: 'Rendering and world updates are paused.',
  visibilityPaused: 'The world paused while this page was hidden.',
  offscreenPaused: 'The world paused while it was outside the visible page area.',
  enterFullscreen: 'Enter fullscreen',
  exitFullscreen: 'Exit fullscreen',
  fullscreenFailed: 'Fullscreen was unavailable. Check browser or iframe permissions.',
  touchMove: 'Move through the world',
  touchRun: 'Run',
  touchJump: 'Jump',
  interactionDefault: 'Interact',
  interactionAction: 'Interact',
  interactionHint: 'Press {key}',
  vrChecking: 'Checking VR support…',
  enterVR: 'Enter VR',
  exitVR: 'Exit VR',
  vrUnsupported: 'VR unavailable',
  vrEntering: 'Entering VR…',
  vrActive: 'VR active',
  vrExiting: 'Exiting VR…',
  vrTrackingLost: 'Headset tracking lost. Stay still while tracking recovers.',
  vrTrackingRestored: 'Headset tracking restored.',
  vrInputs: '{count} XR input source(s) connected.',
  vrEnterFailed: 'VR could not start. Check headset, browser, and permission state.',
  vrExitFailed: 'VR could not exit cleanly.',
  errorTitle: 'Unable to load world',
  retry: 'Retry',
  webglContextLost: 'Graphics context lost. Waiting for the browser to restore it…',
  webglContextRestored: 'Graphics context restored.',
  webgpuDeviceLost: 'The graphics device was lost. Reload the world to continue.',
  worldControls: 'World controls',
  loadingProgress: 'World loading progress',
}

const LOADING_PHASES = new Set<AnyoPlayerLoadingPhase>([
  'resolving-source',
  'creating-runtime',
  'loading-world',
  'waiting-ready',
  'loading-assets',
  'replacing-world',
])

function phaseLabel(phase: AnyoPlayerLoadingPhase, labels: AnyoPlayerUiLabels): string {
  switch (phase) {
    case 'resolving-source': return labels.resolvingSource
    case 'creating-runtime': return labels.creatingRuntime
    case 'loading-world': return labels.loadingWorld
    case 'waiting-ready': return labels.waitingReady
    case 'loading-assets': return labels.loadingAssets
    case 'replacing-world': return labels.replacingWorld
    default: return ''
  }
}

function setHidden(element: HTMLElement, hidden: boolean): void {
  element.hidden = hidden
  element.setAttribute('aria-hidden', hidden ? 'true' : 'false')
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function formatProgress(progress: RendererAssetProgress): string {
  if (progress.total <= 0) return 'Preparing world assets…'
  const settled = progress.loaded + progress.failed
  const failureSuffix = progress.failed > 0 ? `, ${progress.failed} failed` : ''
  const activeSuffix = progress.loading > 0 ? `, ${progress.loading} loading` : ''
  const queuedSuffix = progress.queued > 0 ? `, ${progress.queued} queued` : ''
  return `${settled} of ${progress.total} settled${failureSuffix}${activeSuffix}${queuedSuffix}`
}

function replaceFailedToken(label: string, failed: number): string {
  return label.replaceAll('{failed}', String(failed))
}

function keyboardShortcutValue(code: string): string {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code === 'Space') return 'Space'
  return code
}

function keyboardShortcutValues(bindings: readonly { device: string; code?: string }[]): string[] {
  return bindings
    .filter(binding => binding.device === 'keyboard' && typeof binding.code === 'string')
    .map(binding => keyboardShortcutValue(binding.code as string))
}

function createUiSlot(
  document: Document,
  name: AnyoPlayerUiSlotName,
  defaultElement: HTMLElement,
): HTMLElement {
  const slot = document.createElement('div')
  slot.classList.add('anyo-player__slot')
  slot.setAttribute('data-anyo-player-slot', name)
  defaultElement.setAttribute('data-anyo-player-default-ui', '')
  slot.appendChild(defaultElement)
  return slot
}

export class NullPlayerUI implements PlayerUIController {
  setPhase(): void {}
  setProgress(): void {}
  setReady(): void {}
  setEntering(): void {}
  setRunning(): void {}
  setPaused(): void {}
  setEnterReady(): void {}
  setFullscreen(): void {}
  setInteractionPrompt(): void {}
  setReticle(): void {}
  setVRSupport(): void {}
  setVRSession(): void {}
  setXRTracking(): void {}
  setKeyboardShortcuts(): void {}
  setAudioState(): void {}
  setMapAttribution(): void {}
  setCaption(): void {}
  focusPrimaryAction(): void {}
  setInputError(): void {}
  setControlError(): void {}
  setError(): void {}
  handleDiagnostic(): void {}
  handleWarning(): void {}
  dispose(): void {}
}

export class DefaultPlayerUI implements PlayerUIController {
  private readonly root: HTMLDivElement
  private readonly loadingPanel: HTMLDivElement
  private readonly phaseText: HTMLParagraphElement
  private readonly progressTrack: HTMLDivElement
  private readonly progressFill: HTMLDivElement
  private readonly progressDetails: HTMLParagraphElement
  private readonly diagnosticPanel: HTMLDivElement
  private readonly diagnosticMessage: HTMLParagraphElement
  private readonly reticle: HTMLDivElement
  private readonly interactionPrompt: HTMLDivElement
  private readonly interactionPromptTitle: HTMLParagraphElement
  private readonly interactionPromptMessage: HTMLParagraphElement
  private readonly interactionPromptDescription: HTMLParagraphElement
  private readonly interactionPromptHint: HTMLSpanElement
  private readonly interactionPromptAction: HTMLButtonElement
  private readonly enterPanel: HTMLDivElement
  private readonly enterMessage: HTMLParagraphElement
  private readonly enterButton: HTMLButtonElement
  private readonly pausedPanel: HTMLDivElement
  private readonly pausedMessage: HTMLParagraphElement
  private readonly pauseMenuActions: HTMLDivElement
  private readonly pauseResumeButton: HTMLButtonElement
  private readonly pauseAudioButton: HTMLButtonElement
  private readonly pauseFullscreenButton: HTMLButtonElement
  private readonly pauseScreenshotButton: HTMLButtonElement
  private readonly controls: HTMLDivElement
  private readonly pauseButton: HTMLButtonElement
  private readonly audioButton: HTMLButtonElement
  private readonly fullscreenButton: HTMLButtonElement
  private readonly vrButton: HTMLButtonElement
  private readonly xrStatus: HTMLDivElement
  private readonly xrStatusMessage: HTMLParagraphElement
  private readonly errorPanel: HTMLDivElement
  private readonly mapAttribution: HTMLDivElement
  private readonly captionPanel: HTMLDivElement
  private readonly captionSpeaker: HTMLSpanElement
  private readonly captionText: HTMLSpanElement
  private readonly errorMessage: HTMLParagraphElement
  private readonly retryButton: HTMLButtonElement
  private readonly labels: AnyoPlayerUiLabels
  private readonly adapter: AnyoPlayerUiAdapter | null
  private readonly slots: AnyoPlayerUiSlotMap
  private readonly onAdapterError: (error: unknown) => void
  private adapterCleanup: (() => void) | null = null
  private adapterMounted = false
  private readonly options: Required<Pick<
    AnyoPlayerUiOptions,
    | 'showProgress'
    | 'showProgressDetails'
    | 'showDiagnostics'
    | 'showErrors'
    | 'showEnterPrompt'
    | 'showControls'
    | 'showPauseControl'
    | 'showAudioControl'
    | 'showFullscreenControl'
    | 'showTouchControls'
    | 'showInteractionPrompt'
    | 'showInteractionAction'
    | 'showReticle'
    | 'showVRControl'
    | 'showXRStatus'
    | 'allowRetry'
  >>
  private readonly onRetry: () => Promise<void>
  private readonly onEnter: () => void
  private readonly onPauseToggle: () => void
  private readonly onFullscreenToggle: () => Promise<void>
  private readonly onVRToggle: () => Promise<void>
  private readonly onInteract: () => Promise<boolean>
  private readonly onAudioToggle: () => Promise<void>
  private readonly onScreenshot: () => Promise<void>
  private readonly pauseMenu: Required<Omit<AnyoPlayerPauseMenuOptions, 'title' | 'message'>> & { title: string; message: string }
  private readonly keyboardNavigation: boolean
  private readonly focusManagement: boolean
  private readonly isKeyboardModality: () => boolean
  private diagnosticTimer: ReturnType<typeof setTimeout> | null = null
  private paused = false
  private fullscreen = false
  private vrSupport: AnyoPlayerVRSupportState = 'disabled'
  private vrSession: 'idle' | 'entering' | 'active' | 'exiting' = 'idle'
  private xrTracking: AnyoPlayerXRTrackingState = 'unavailable'
  private xrInputCount = 0
  private audioState: AnyoPlayerAudioState
  private currentPhase: AnyoPlayerLoadingPhase = 'idle'
  private currentProgress: RendererAssetProgress = { queued: 0, loading: 0, loaded: 0, failed: 0, total: 0, ratio: 1 }
  private currentReadyStatus: AnyoPlayerReadyStatus | null = null
  private currentPauseReason: AnyoPlayerPauseReason | null = null
  private currentInteractionPrompt: AnyoPlayerInteractionPromptState = {
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
  private currentReticle: AnyoPlayerReticleState = { visible: false, active: false }
  private currentCaption: AnyoPlayerCaptionState = {
    visible: false,
    text: '',
    speaker: null,
    language: null,
    startedAt: null,
    expiresAt: null,
  }
  private currentError: AnyoPlayerError | null = null
  private currentDiagnostic: AnyoPlayerUiSnapshot['diagnostic'] = null
  private disposed = false

  constructor(
    container: HTMLElement,
    options: AnyoPlayerUiOptions,
    onRetry: () => Promise<void>,
    onEnter: () => void,
    onPauseToggle: () => void,
    onFullscreenToggle: () => Promise<void>,
    onVRToggle: () => Promise<void>,
    onInteract: () => Promise<boolean>,
    onAudioToggle: () => Promise<void>,
    onScreenshot: () => Promise<void>,
    pauseMenu: false | AnyoPlayerPauseMenuOptions | undefined,
    audioState: AnyoPlayerAudioState,
    accessibility: PlayerUIAccessibilityConfiguration,
    onAdapterError: (error: unknown) => void = () => undefined,
  ) {
    const document = container.ownerDocument
    this.options = {
      showProgress: options.showProgress ?? true,
      showProgressDetails: options.showProgressDetails ?? true,
      showDiagnostics: options.showDiagnostics ?? true,
      showErrors: options.showErrors ?? true,
      showEnterPrompt: options.showEnterPrompt ?? true,
      showControls: options.showControls ?? true,
      showPauseControl: options.showPauseControl ?? true,
      showAudioControl: options.showAudioControl ?? true,
      showFullscreenControl: options.showFullscreenControl ?? true,
      showTouchControls: options.showTouchControls ?? true,
      showInteractionPrompt: options.showInteractionPrompt ?? true,
      showInteractionAction: options.showInteractionAction ?? true,
      showReticle: options.showReticle ?? true,
      showVRControl: options.showVRControl ?? true,
      showXRStatus: options.showXRStatus ?? true,
      allowRetry: options.allowRetry ?? true,
    }
    this.labels = { ...DEFAULT_UI_LABELS, ...options.labels }
    this.adapter = options.adapter ?? null
    this.onAdapterError = onAdapterError
    this.onRetry = onRetry
    this.onEnter = onEnter
    this.onPauseToggle = onPauseToggle
    this.onFullscreenToggle = onFullscreenToggle
    this.onVRToggle = onVRToggle
    this.onInteract = onInteract
    this.onAudioToggle = onAudioToggle
    this.onScreenshot = onScreenshot
    this.pauseMenu = {
      enabled: pauseMenu !== false && (pauseMenu?.enabled ?? true),
      title: pauseMenu === false ? this.labels.pausedTitle : pauseMenu?.title ?? this.labels.pauseMenuTitle,
      message: pauseMenu === false ? this.labels.pausedMessage : pauseMenu?.message ?? this.labels.pauseMenuMessage,
      showResume: pauseMenu !== false && (pauseMenu?.showResume ?? true),
      showAudio: pauseMenu !== false && (pauseMenu?.showAudio ?? true),
      showFullscreen: pauseMenu !== false && (pauseMenu?.showFullscreen ?? true),
      showScreenshot: pauseMenu !== false && (pauseMenu?.showScreenshot ?? true),
    }
    this.audioState = { ...audioState }
    this.keyboardNavigation = accessibility.options !== false && accessibility.options?.keyboardNavigation !== false
    this.focusManagement = accessibility.options !== false && accessibility.options?.focusManagement !== false
    this.isKeyboardModality = accessibility.isKeyboardModality

    this.root = document.createElement('div')
    this.root.classList.add('anyo-player__ui')
    for (const className of options.className?.split(/\s+/).filter(Boolean) ?? []) {
      this.root.classList.add(className)
    }
    this.root.setAttribute('data-anyo-player-ui', '')

    this.loadingPanel = document.createElement('div')
    this.loadingPanel.classList.add('anyo-player__panel', 'anyo-player__panel--loading')
    this.loadingPanel.setAttribute('role', 'status')
    this.loadingPanel.setAttribute('aria-live', 'polite')
    this.loadingPanel.setAttribute('aria-atomic', 'true')
    const loadingTitle = document.createElement('p')
    loadingTitle.classList.add('anyo-player__title')
    loadingTitle.textContent = this.labels.loadingTitle
    this.loadingPanel.appendChild(loadingTitle)
    this.phaseText = document.createElement('p')
    this.phaseText.classList.add('anyo-player__message')
    this.loadingPanel.appendChild(this.phaseText)
    this.progressTrack = document.createElement('div')
    this.progressTrack.classList.add('anyo-player__progress')
    this.progressTrack.setAttribute('role', 'progressbar')
    this.progressTrack.setAttribute('aria-label', this.labels.loadingProgress)
    this.progressTrack.setAttribute('aria-valuemin', '0')
    this.progressTrack.setAttribute('aria-valuemax', '100')
    this.progressTrack.setAttribute('aria-valuenow', '0')
    setHidden(this.progressTrack, !this.options.showProgress)
    this.progressFill = document.createElement('div')
    this.progressFill.classList.add('anyo-player__progress-fill')
    this.progressFill.style.width = '0%'
    this.progressTrack.appendChild(this.progressFill)
    this.loadingPanel.appendChild(this.progressTrack)
    this.progressDetails = document.createElement('p')
    this.progressDetails.classList.add('anyo-player__progress-details')
    setHidden(this.progressDetails, !this.options.showProgressDetails)
    this.loadingPanel.appendChild(this.progressDetails)

    this.diagnosticPanel = document.createElement('div')
    this.diagnosticPanel.classList.add('anyo-player__diagnostic')
    this.diagnosticPanel.setAttribute('role', 'status')
    this.diagnosticPanel.setAttribute('aria-live', 'polite')
    this.diagnosticPanel.setAttribute('aria-atomic', 'true')
    this.diagnosticPanel.setAttribute('data-severity', 'info')
    this.diagnosticMessage = document.createElement('p')
    this.diagnosticMessage.classList.add('anyo-player__diagnostic-message')
    this.diagnosticPanel.appendChild(this.diagnosticMessage)

    this.xrStatus = document.createElement('div')
    this.xrStatus.classList.add('anyo-player__xr-status')
    this.xrStatus.setAttribute('data-anyo-player-xr-status', '')
    this.xrStatus.setAttribute('role', 'status')
    this.xrStatus.setAttribute('aria-live', 'polite')
    this.xrStatus.setAttribute('aria-atomic', 'true')
    this.xrStatusMessage = document.createElement('p')
    this.xrStatusMessage.classList.add('anyo-player__xr-status-message')
    this.xrStatus.appendChild(this.xrStatusMessage)

    this.reticle = document.createElement('div')
    this.reticle.classList.add('anyo-player__reticle')
    this.reticle.setAttribute('data-anyo-player-reticle', '')
    this.reticle.setAttribute('aria-hidden', 'true')
    this.reticle.setAttribute('data-active', 'false')

    this.interactionPrompt = document.createElement('div')
    this.interactionPrompt.classList.add('anyo-player__interaction-prompt')
    this.interactionPrompt.setAttribute('data-anyo-player-interaction-prompt', '')
    this.interactionPrompt.setAttribute('role', 'status')
    this.interactionPrompt.setAttribute('aria-live', 'polite')
    this.interactionPrompt.setAttribute('aria-atomic', 'true')
    this.interactionPromptMessage = document.createElement('p')
    this.interactionPromptMessage.classList.add('anyo-player__interaction-prompt-message')
    this.interactionPrompt.appendChild(this.interactionPromptMessage)
    this.interactionPromptTitle = document.createElement('p')
    this.interactionPromptTitle.classList.add('anyo-player__interaction-prompt-title')
    this.interactionPrompt.appendChild(this.interactionPromptTitle)
    this.interactionPromptDescription = document.createElement('p')
    this.interactionPromptDescription.classList.add('anyo-player__interaction-prompt-description')
    this.interactionPrompt.appendChild(this.interactionPromptDescription)
    const interactionPromptFooter = document.createElement('div')
    interactionPromptFooter.classList.add('anyo-player__interaction-prompt-footer')
    this.interactionPromptHint = document.createElement('span')
    this.interactionPromptHint.classList.add('anyo-player__interaction-prompt-hint')
    interactionPromptFooter.appendChild(this.interactionPromptHint)
    this.interactionPromptAction = document.createElement('button')
    this.interactionPromptAction.type = 'button'
    this.interactionPromptAction.classList.add('anyo-player__interaction-action')
    this.interactionPromptAction.addEventListener('click', this.handleInteractionAction)
    interactionPromptFooter.appendChild(this.interactionPromptAction)
    this.interactionPrompt.appendChild(interactionPromptFooter)

    this.enterPanel = document.createElement('div')
    this.enterPanel.classList.add('anyo-player__panel', 'anyo-player__panel--enter')
    this.enterPanel.setAttribute('role', 'group')
    this.enterPanel.setAttribute('aria-label', this.labels.enterTitle)
    const enterTitle = document.createElement('p')
    enterTitle.classList.add('anyo-player__title')
    enterTitle.textContent = this.labels.enterTitle
    this.enterPanel.appendChild(enterTitle)
    this.enterMessage = document.createElement('p')
    this.enterMessage.classList.add('anyo-player__message')
    this.enterMessage.textContent = this.labels.enterMessage
    this.enterPanel.appendChild(this.enterMessage)
    this.enterButton = document.createElement('button')
    this.enterButton.classList.add('anyo-player__button')
    this.enterButton.setAttribute('type', 'button')
    this.enterButton.setAttribute('data-anyo-player-enter', '')
    this.enterButton.textContent = this.labels.enterButton
    this.enterButton.addEventListener('click', this.handleEnter)
    this.enterPanel.appendChild(this.enterButton)

    this.pausedPanel = document.createElement('div')
    this.pausedPanel.classList.add('anyo-player__panel', 'anyo-player__panel--paused')
    this.pausedPanel.setAttribute('role', this.pauseMenu.enabled ? 'dialog' : 'status')
    this.pausedPanel.setAttribute('aria-live', 'polite')
    this.pausedPanel.setAttribute('aria-label', this.pauseMenu.title)
    const pausedTitle = document.createElement('p')
    pausedTitle.classList.add('anyo-player__title')
    pausedTitle.textContent = this.pauseMenu.title
    this.pausedPanel.appendChild(pausedTitle)
    this.pausedMessage = document.createElement('p')
    this.pausedMessage.classList.add('anyo-player__message')
    this.pausedPanel.appendChild(this.pausedMessage)
    this.pauseMenuActions = document.createElement('div')
    this.pauseMenuActions.classList.add('anyo-player__pause-actions')
    this.pauseResumeButton = this.createPauseAction(document, 'resume', this.labels.resume, this.handlePauseToggle)
    this.pauseAudioButton = this.createPauseAction(document, 'audio', this.labels.muteAudio, this.handleAudioToggle)
    this.pauseFullscreenButton = this.createPauseAction(document, 'fullscreen', this.labels.enterFullscreen, this.handleFullscreenToggle)
    this.pauseScreenshotButton = this.createPauseAction(document, 'screenshot', this.labels.takeScreenshot, this.handleScreenshot)
    setHidden(this.pauseResumeButton, !this.pauseMenu.enabled || !this.pauseMenu.showResume)
    setHidden(this.pauseAudioButton, !this.pauseMenu.enabled || !this.pauseMenu.showAudio || !this.audioState.enabled)
    setHidden(this.pauseFullscreenButton, !this.pauseMenu.enabled || !this.pauseMenu.showFullscreen || !this.options.showFullscreenControl)
    setHidden(this.pauseScreenshotButton, !this.pauseMenu.enabled || !this.pauseMenu.showScreenshot)
    this.pauseMenuActions.appendChild(this.pauseResumeButton)
    this.pauseMenuActions.appendChild(this.pauseAudioButton)
    this.pauseMenuActions.appendChild(this.pauseFullscreenButton)
    this.pauseMenuActions.appendChild(this.pauseScreenshotButton)
    this.pausedPanel.appendChild(this.pauseMenuActions)

    this.controls = document.createElement('div')
    this.controls.classList.add('anyo-player__controls')
    this.controls.setAttribute('role', 'toolbar')
    this.controls.setAttribute('aria-label', this.labels.worldControls)
    this.pauseButton = document.createElement('button')
    this.pauseButton.classList.add('anyo-player__control')
    this.pauseButton.setAttribute('type', 'button')
    this.pauseButton.setAttribute('data-anyo-player-pause', '')
    this.pauseButton.textContent = this.labels.pause
    this.pauseButton.addEventListener('click', this.handlePauseToggle)
    setHidden(this.pauseButton, !this.options.showPauseControl)
    this.audioButton = document.createElement('button')
    this.audioButton.classList.add('anyo-player__control', 'anyo-player__control--audio')
    this.audioButton.setAttribute('type', 'button')
    this.audioButton.setAttribute('data-anyo-player-audio', '')
    this.audioButton.addEventListener('click', this.handleAudioToggle)
    setHidden(this.audioButton, !this.options.showAudioControl || !this.audioState.enabled)
    this.fullscreenButton = document.createElement('button')
    this.fullscreenButton.classList.add('anyo-player__control')
    this.fullscreenButton.setAttribute('type', 'button')
    this.fullscreenButton.setAttribute('data-anyo-player-fullscreen', '')
    this.fullscreenButton.setAttribute('aria-pressed', 'false')
    this.fullscreenButton.textContent = this.labels.enterFullscreen
    this.fullscreenButton.addEventListener('click', this.handleFullscreenToggle)
    setHidden(this.fullscreenButton, !this.options.showFullscreenControl)
    this.vrButton = document.createElement('button')
    this.vrButton.classList.add('anyo-player__control', 'anyo-player__control--vr')
    this.vrButton.setAttribute('type', 'button')
    this.vrButton.setAttribute('data-anyo-player-vr', '')
    this.vrButton.setAttribute('aria-pressed', 'false')
    this.vrButton.textContent = this.labels.enterVR
    this.vrButton.addEventListener('click', this.handleVRToggle)
    setHidden(this.vrButton, true)
    this.controls.appendChild(this.pauseButton)
    this.controls.appendChild(this.fullscreenButton)
    this.controls.appendChild(this.audioButton)
    this.controls.appendChild(this.vrButton)
    this.controls.addEventListener('keydown', this.handleControlsKeyDown)
    this.updateAudioButtons()
    this.updateControlTabStops()

    this.errorPanel = document.createElement('div')
    this.errorPanel.classList.add('anyo-player__panel', 'anyo-player__panel--error')
    this.errorPanel.setAttribute('role', 'alert')
    this.errorPanel.setAttribute('aria-live', 'assertive')
    this.errorPanel.setAttribute('aria-atomic', 'true')
    const errorTitle = document.createElement('p')
    errorTitle.classList.add('anyo-player__title')
    errorTitle.textContent = this.labels.errorTitle
    this.errorPanel.appendChild(errorTitle)
    this.errorMessage = document.createElement('p')
    this.errorMessage.classList.add('anyo-player__message')
    this.errorPanel.appendChild(this.errorMessage)
    this.retryButton = document.createElement('button')
    this.retryButton.classList.add('anyo-player__button')
    this.retryButton.setAttribute('type', 'button')
    this.retryButton.setAttribute('data-anyo-player-retry', '')
    this.retryButton.textContent = this.labels.retry
    this.retryButton.addEventListener('click', this.handleRetry)
    setHidden(this.retryButton, !this.options.allowRetry)
    this.errorPanel.appendChild(this.retryButton)

    this.mapAttribution = document.createElement('div')
    this.mapAttribution.classList.add('anyo-player__map-attribution')
    this.mapAttribution.setAttribute('data-anyo-player-map-attribution', '')
    this.mapAttribution.setAttribute('aria-label', 'Map data attribution')
    setHidden(this.mapAttribution, true)

    this.captionPanel = document.createElement('div')
    this.captionPanel.classList.add('anyo-player__caption')
    this.captionPanel.setAttribute('data-anyo-player-caption', '')
    this.captionPanel.setAttribute('role', 'status')
    this.captionPanel.setAttribute('aria-live', 'off')
    this.captionPanel.setAttribute('aria-atomic', 'true')
    this.captionSpeaker = document.createElement('span')
    this.captionSpeaker.classList.add('anyo-player__caption-speaker')
    this.captionText = document.createElement('span')
    this.captionText.classList.add('anyo-player__caption-text')
    this.captionPanel.appendChild(this.captionSpeaker)
    this.captionPanel.appendChild(this.captionText)
    setHidden(this.captionPanel, true)

    this.slots = Object.freeze({
      loading: createUiSlot(document, 'loading', this.loadingPanel),
      diagnostic: createUiSlot(document, 'diagnostic', this.diagnosticPanel),
      'xr-status': createUiSlot(document, 'xr-status', this.xrStatus),
      reticle: createUiSlot(document, 'reticle', this.reticle),
      interaction: createUiSlot(document, 'interaction', this.interactionPrompt),
      enter: createUiSlot(document, 'enter', this.enterPanel),
      pause: createUiSlot(document, 'pause', this.pausedPanel),
      controls: createUiSlot(document, 'controls', this.controls),
      error: createUiSlot(document, 'error', this.errorPanel),
    })
    for (const slot of Object.values(this.slots)) this.root.appendChild(slot)
    this.root.appendChild(this.mapAttribution)
    this.root.appendChild(this.captionPanel)
    if (this.adapter) this.root.setAttribute('data-anyo-player-adapter-mode', this.adapter.mode ?? 'augment')
    container.appendChild(this.root)

    setHidden(this.loadingPanel, true)
    setHidden(this.diagnosticPanel, true)
    setHidden(this.xrStatus, true)
    setHidden(this.reticle, true)
    setHidden(this.interactionPrompt, true)
    setHidden(this.enterPanel, true)
    setHidden(this.pausedPanel, true)
    setHidden(this.controls, true)
    setHidden(this.errorPanel, true)
    setHidden(this.root, true)
    this.mountAdapter()
  }

  setPhase(phase: AnyoPlayerLoadingPhase): void {
    if (this.disposed) return
    this.currentPhase = phase
    if (LOADING_PHASES.has(phase)) this.currentError = null
    const loading = LOADING_PHASES.has(phase)
    setHidden(this.loadingPanel, !loading)
    if (loading) {
      this.phaseText.textContent = phaseLabel(phase, this.labels)
      setHidden(this.enterPanel, true)
      setHidden(this.pausedPanel, true)
      setHidden(this.controls, true)
      setHidden(this.errorPanel, true)
      this.updateRootVisibility()
      return
    }
    if (phase === 'disposing' || phase === 'disposed' || phase === 'idle') {
      setHidden(this.loadingPanel, true)
      setHidden(this.enterPanel, true)
      setHidden(this.pausedPanel, true)
      setHidden(this.controls, true)
      setHidden(this.errorPanel, true)
      this.updateRootVisibility()
    }
  }

  setProgress(progress: RendererAssetProgress): void {
    if (this.disposed) return
    this.currentProgress = { ...progress }
    const ratio = clampRatio(progress.ratio)
    const percentage = Math.round(ratio * 100)
    this.progressFill.style.width = `${percentage}%`
    this.progressTrack.setAttribute('aria-valuenow', String(percentage))
    const details = formatProgress(progress)
    this.progressTrack.setAttribute('aria-valuetext', details)
    this.progressDetails.textContent = details
    this.notifyAdapter()
  }

  setReady(status: AnyoPlayerReadyStatus, progress: RendererAssetProgress, enterRequired: boolean): void {
    if (this.disposed) return
    this.currentReadyStatus = status
    this.currentProgress = { ...progress }
    this.currentError = null
    this.currentPauseReason = null
    this.paused = false
    this.updatePauseButton()
    setHidden(this.loadingPanel, true)
    setHidden(this.pausedPanel, true)
    setHidden(this.errorPanel, true)
    this.setEnterPanelVisible(enterRequired)
    this.setControlsVisible(true)
    this.enterButton.disabled = false
    this.enterMessage.textContent = this.labels.enterMessage
    if (status === 'ready-with-warnings' && this.options.showDiagnostics) {
      this.showDiagnostic(replaceFailedToken(this.labels.readyWithWarnings, progress.failed), 'warning', false)
    } else {
      this.clearDiagnostic()
    }
    this.updateRootVisibility()
    if (enterRequired) this.maybeFocus('enter')
  }

  setEntering(): void {
    if (this.disposed) return
    this.currentPauseReason = null
    this.enterButton.disabled = true
    this.enterMessage.textContent = this.labels.enterMessage
    this.setEnterPanelVisible(true)
    this.setControlsVisible(true)
  }

  setRunning(): void {
    if (this.disposed) return
    this.currentPauseReason = null
    this.paused = false
    this.updatePauseButton()
    this.enterButton.disabled = false
    setHidden(this.enterPanel, true)
    setHidden(this.pausedPanel, true)
    this.setControlsVisible(true)
    this.updateRootVisibility()
  }

  setPaused(reason: AnyoPlayerPauseReason): void {
    if (this.disposed) return
    this.currentPauseReason = reason
    this.paused = true
    this.updatePauseButton()
    setHidden(this.loadingPanel, true)
    setHidden(this.enterPanel, true)
    setHidden(this.errorPanel, true)
    this.pausedMessage.textContent = reason === 'visibility'
      ? this.labels.visibilityPaused
      : reason === 'offscreen'
        ? this.labels.offscreenPaused
        : this.pauseMenu.message
    setHidden(this.pausedPanel, false)
    this.setControlsVisible(true)
    this.updateRootVisibility()
    this.maybeFocus('pause')
  }

  setEnterReady(reason?: AnyoPlayerExitReason): void {
    if (this.disposed) return
    this.currentPauseReason = null
    this.paused = false
    this.updatePauseButton()
    setHidden(this.pausedPanel, true)
    this.enterButton.disabled = false
    this.enterMessage.textContent = reason === 'pointer-lock-error'
      ? this.labels.pointerLockFailed
      : this.labels.reenterMessage
    this.setEnterPanelVisible(true)
    this.setControlsVisible(true)
    this.maybeFocus('enter')
  }

  setFullscreen(fullscreen: boolean): void {
    if (this.disposed) return
    this.fullscreen = fullscreen
    this.fullscreenButton.textContent = fullscreen
      ? this.labels.exitFullscreen
      : this.labels.enterFullscreen
    this.fullscreenButton.setAttribute('aria-pressed', fullscreen ? 'true' : 'false')
    this.pauseFullscreenButton.textContent = fullscreen ? this.labels.exitFullscreen : this.labels.enterFullscreen
    this.pauseFullscreenButton.setAttribute('aria-pressed', fullscreen ? 'true' : 'false')
    this.notifyAdapter()
  }

  setInteractionPrompt(prompt: AnyoPlayerInteractionPromptState): void {
    if (this.disposed) return
    this.currentInteractionPrompt = { ...prompt }
    const visible = this.options.showInteractionPrompt && prompt.visible && prompt.text.length > 0
    this.interactionPromptTitle.textContent = visible ? (prompt.title ?? '') : ''
    this.interactionPromptMessage.textContent = visible ? prompt.text : ''
    this.interactionPromptDescription.textContent = visible ? (prompt.description ?? '') : ''
    this.interactionPromptHint.textContent = visible ? (prompt.inputHint ?? '') : ''
    this.interactionPromptAction.textContent = visible ? (prompt.actionLabel ?? this.labels.interactionAction) : ''
    this.interactionPromptAction.disabled = !prompt.actionAvailable
    this.interactionPromptAction.setAttribute('aria-label', prompt.ariaLabel ?? prompt.actionLabel ?? prompt.text)
    setHidden(this.interactionPromptTitle, !visible || !prompt.title)
    setHidden(this.interactionPromptDescription, !visible || !prompt.description)
    setHidden(this.interactionPromptHint, !visible || !prompt.inputHint)
    setHidden(
      this.interactionPromptAction,
      !visible || !this.options.showInteractionAction || !prompt.actionAvailable,
    )
    this.interactionPrompt.setAttribute('data-trigger', prompt.trigger ?? '')
    setHidden(this.interactionPrompt, !visible)
    this.updateRootVisibility()
  }

  setReticle(state: AnyoPlayerReticleState): void {
    if (this.disposed) return
    this.currentReticle = { ...state }
    this.reticle.setAttribute('data-active', state.active ? 'true' : 'false')
    setHidden(this.reticle, !this.options.showReticle || !state.visible)
    this.updateRootVisibility()
  }

  setVRSupport(state: AnyoPlayerVRSupportState): void {
    if (this.disposed) return
    this.vrSupport = state
    this.updateVRButton()
    this.setControlsVisible(true)
  }

  setVRSession(state: 'idle' | 'entering' | 'active' | 'exiting', inputCount: number): void {
    if (this.disposed) return
    this.vrSession = state
    this.xrInputCount = inputCount
    this.updateVRButton()
    this.updateXRStatus()
    if (state !== 'idle') {
      setHidden(this.loadingPanel, true)
      setHidden(this.enterPanel, true)
      setHidden(this.pausedPanel, true)
      setHidden(this.errorPanel, true)
    }
    const desktopControlsVisible = state === 'idle'
    setHidden(this.pauseButton, !desktopControlsVisible || !this.options.showPauseControl)
    setHidden(this.audioButton, !desktopControlsVisible || !this.options.showAudioControl || !this.audioState.enabled)
    setHidden(this.fullscreenButton, !desktopControlsVisible || !this.options.showFullscreenControl)
    this.setControlsVisible(true)
  }

  setXRTracking(state: AnyoPlayerXRTrackingState): void {
    if (this.disposed) return
    const previous = this.xrTracking
    this.xrTracking = state
    this.updateXRStatus()
    if (previous === 'lost' && state === 'tracked' && this.options.showDiagnostics) {
      this.showDiagnostic(this.labels.vrTrackingRestored, 'info', true)
    }
  }

  setKeyboardShortcuts(bindings: AnyoPlayerInputBindingMap): void {
    if (this.disposed) return
    const pause = keyboardShortcutValues(bindings.pause)
    const interact = keyboardShortcutValues(bindings.interact)
    this.enterButton.setAttribute('aria-keyshortcuts', 'Enter Space')
    if (pause.length > 0) this.pauseButton.setAttribute('aria-keyshortcuts', pause.join(' '))
    else this.pauseButton.removeAttribute('aria-keyshortcuts')
    if (interact.length > 0) this.interactionPromptAction.setAttribute('aria-keyshortcuts', interact.join(' '))
    else this.interactionPromptAction.removeAttribute('aria-keyshortcuts')
  }

  setAudioState(state: AnyoPlayerAudioState): void {
    if (this.disposed) return
    this.audioState = { ...state }
    this.updateAudioButtons()
    this.updateControlTabStops()
    this.updateRootVisibility()
  }

  setMapAttribution(text: string | null): void {
    if (this.disposed) return
    const value = text?.trim() ?? ''
    this.mapAttribution.textContent = value
    setHidden(this.mapAttribution, !value)
    this.updateRootVisibility()
  }

  setCaption(caption: AnyoPlayerCaptionState): void {
    if (this.disposed) return
    this.currentCaption = { ...caption }
    if (!caption.visible) {
      this.captionSpeaker.textContent = ''
      this.captionText.textContent = ''
      this.captionPanel.removeAttribute('lang')
      setHidden(this.captionPanel, true)
      this.updateRootVisibility()
      return
    }
    this.captionSpeaker.textContent = caption.speaker ? `${caption.speaker}: ` : ''
    this.captionText.textContent = caption.text
    if (caption.language) this.captionPanel.setAttribute('lang', caption.language)
    else this.captionPanel.removeAttribute('lang')
    setHidden(this.captionPanel, false)
    this.updateRootVisibility()
  }

  focusPrimaryAction(target: PlayerUIFocusTarget): void {
    if (this.disposed) return
    const element = target === 'enter'
      ? this.enterButton
      : target === 'pause'
        ? this.pauseButton
        : target === 'retry'
          ? this.retryButton
          : target === 'interaction'
            ? this.interactionPromptAction
            : this.vrButton
    if (element.hidden || element.disabled) return
    element.focus?.({ preventScroll: true })
  }

  setInputError(error: AnyoPlayerError): void {
    if (this.disposed || !this.options.showDiagnostics) return
    this.showDiagnostic(
      error.code === 'PLAYER_POINTER_LOCK_FAILED' ? this.labels.pointerLockFailed : error.message,
      'warning',
      true,
    )
  }

  setControlError(error: AnyoPlayerError): void {
    if (this.disposed || !this.options.showDiagnostics) return
    const message = error.code === 'PLAYER_FULLSCREEN_FAILED' || error.code === 'PLAYER_FULLSCREEN_UNAVAILABLE'
      ? this.labels.fullscreenFailed
      : error.code === 'PLAYER_VR_ENTER_FAILED' || error.code === 'PLAYER_VR_UNSUPPORTED'
        ? this.labels.vrEnterFailed
        : error.code === 'PLAYER_VR_EXIT_FAILED'
          ? this.labels.vrExitFailed
          : error.message
    this.showDiagnostic(message, 'warning', true)
  }

  setError(error: AnyoPlayerError): void {
    if (this.disposed) return
    this.currentError = error
    setHidden(this.loadingPanel, true)
    setHidden(this.enterPanel, true)
    setHidden(this.pausedPanel, true)
    setHidden(this.controls, true)
    this.clearDiagnostic()
    if (this.options.showErrors) {
      this.errorMessage.textContent = error.code === 'PLAYER_RENDERER_LOST'
        ? this.labels.webgpuDeviceLost
        : error.message
      setHidden(this.errorPanel, false)
    } else {
      setHidden(this.errorPanel, true)
    }
    this.updateRootVisibility()
    this.maybeFocus('retry')
  }

  handleDiagnostic(diagnostic: RendererDiagnostic): void {
    if (this.disposed || !this.options.showDiagnostics) return
    if (diagnostic.code === 'SEKAI64_WEBGL_CONTEXT_LOST') {
      this.showDiagnostic(this.labels.webglContextLost, 'error', false)
      return
    }
    if (diagnostic.code === 'SEKAI64_WEBGL_CONTEXT_RESTORED') {
      this.showDiagnostic(this.labels.webglContextRestored, 'info', true)
      return
    }
    if (diagnostic.code === 'SEKAI64_WEBGPU_DEVICE_LOST') {
      this.showDiagnostic(this.labels.webgpuDeviceLost, 'error', false)
      return
    }
    if (diagnostic.severity === 'warning' || diagnostic.severity === 'error') {
      this.showDiagnostic(diagnostic.message, diagnostic.severity, false)
    }
  }

  handleWarning(message: string): void {
    if (this.disposed || !this.options.showDiagnostics) return
    this.showDiagnostic(message, 'warning', false)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.clearDiagnosticTimer()
    this.enterButton.removeEventListener('click', this.handleEnter)
    this.retryButton.removeEventListener('click', this.handleRetry)
    this.pauseButton.removeEventListener('click', this.handlePauseToggle)
    this.audioButton.removeEventListener('click', this.handleAudioToggle)
    this.pauseResumeButton.removeEventListener('click', this.handlePauseToggle)
    this.pauseAudioButton.removeEventListener('click', this.handleAudioToggle)
    this.pauseFullscreenButton.removeEventListener('click', this.handleFullscreenToggle)
    this.pauseScreenshotButton.removeEventListener('click', this.handleScreenshot)
    this.fullscreenButton.removeEventListener('click', this.handleFullscreenToggle)
    this.vrButton.removeEventListener('click', this.handleVRToggle)
    this.interactionPromptAction.removeEventListener('click', this.handleInteractionAction)
    this.controls.removeEventListener('keydown', this.handleControlsKeyDown)
    this.disposeAdapter()
    if (this.root.parentNode) this.root.parentNode.removeChild(this.root)
  }

  private readonly handleEnter = (): void => {
    if (!this.disposed) this.onEnter()
  }

  private readonly handleRetry = (): void => {
    if (this.disposed) return
    this.retryButton.disabled = true
    void this.onRetry().catch(() => undefined).finally(() => {
      if (!this.disposed) this.retryButton.disabled = false
    })
  }

  private readonly handlePauseToggle = (): void => {
    if (!this.disposed) this.onPauseToggle()
  }

  private readonly handleAudioToggle = (): void => {
    if (this.disposed) return
    this.audioButton.disabled = true
    this.pauseAudioButton.disabled = true
    void this.onAudioToggle().finally(() => {
      if (!this.disposed) {
        this.audioButton.disabled = false
        this.pauseAudioButton.disabled = false
      }
    })
  }

  private readonly handleScreenshot = (): void => {
    if (this.disposed) return
    this.pauseScreenshotButton.disabled = true
    void this.onScreenshot().finally(() => {
      if (!this.disposed) this.pauseScreenshotButton.disabled = false
    })
  }

  private readonly handleFullscreenToggle = (): void => {
    if (this.disposed) return
    this.fullscreenButton.disabled = true
    void this.onFullscreenToggle().catch(() => undefined).finally(() => {
      if (!this.disposed) this.fullscreenButton.disabled = false
    })
  }

  private readonly handleInteractionAction = (): void => {
    if (this.disposed || this.interactionPromptAction.disabled) return
    this.interactionPromptAction.disabled = true
    void this.onInteract().catch(() => false).finally(() => {
      if (!this.disposed) this.interactionPromptAction.disabled = false
    })
  }

  private readonly handleVRToggle = (): void => {
    if (this.disposed) return
    this.vrButton.disabled = true
    void this.onVRToggle().catch(() => undefined).finally(() => {
      if (!this.disposed) this.updateVRButton()
    })
  }

  private setEnterPanelVisible(visible: boolean): void {
    setHidden(this.enterPanel, !visible || !this.options.showEnterPrompt)
    this.updateRootVisibility()
  }

  private setControlsVisible(visible: boolean): void {
    const noVisibleControls = !this.options.showPauseControl
      && (!this.options.showAudioControl || !this.audioState.enabled)
      && !this.options.showFullscreenControl
      && (!this.options.showVRControl || this.vrSupport === 'disabled')
    setHidden(this.controls, !visible || !this.options.showControls || noVisibleControls)
    this.updateControlTabStops()
    this.updateRootVisibility()
  }

  private readonly handleControlsKeyDown = (event: KeyboardEvent): void => {
    if (!this.keyboardNavigation) return
    const buttons = this.visibleControlButtons()
    if (buttons.length === 0) return
    const current = this.controls.ownerDocument?.activeElement
    const index = buttons.indexOf(current as HTMLButtonElement)
    let nextIndex = index < 0 ? 0 : index
    if (event.code === 'ArrowRight' || event.code === 'ArrowDown') nextIndex = (nextIndex + 1) % buttons.length
    else if (event.code === 'ArrowLeft' || event.code === 'ArrowUp') nextIndex = (nextIndex - 1 + buttons.length) % buttons.length
    else if (event.code === 'Home') nextIndex = 0
    else if (event.code === 'End') nextIndex = buttons.length - 1
    else return
    event.preventDefault()
    buttons[nextIndex]?.focus?.({ preventScroll: true })
    this.updateControlTabStops(buttons[nextIndex])
  }

  private visibleControlButtons(): HTMLButtonElement[] {
    return [this.pauseButton, this.fullscreenButton, this.audioButton, this.vrButton]
      .filter(button => !button.hidden && !button.disabled)
  }

  private updateControlTabStops(active?: HTMLButtonElement): void {
    const buttons = this.visibleControlButtons()
    const selected = active && buttons.includes(active) ? active : buttons[0]
    for (const button of [this.pauseButton, this.fullscreenButton, this.audioButton, this.vrButton]) {
      button.tabIndex = button === selected ? 0 : -1
    }
  }

  private maybeFocus(target: PlayerUIFocusTarget): void {
    if (!this.focusManagement || !this.isKeyboardModality()) return
    this.focusPrimaryAction(target)
  }

  private createPauseAction(
    document: Document,
    name: string,
    label: string,
    listener: () => void,
  ): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.classList.add('anyo-player__button', 'anyo-player__pause-action')
    button.setAttribute(`data-anyo-player-pause-${name}`, '')
    button.textContent = label
    button.addEventListener('click', listener)
    return button
  }

  private updateAudioButtons(): void {
    const label = !this.audioState.unlocked || this.audioState.blocked
      ? this.labels.unlockAudio
      : this.audioState.muted
        ? this.labels.unmuteAudio
        : this.labels.muteAudio
    for (const button of [this.audioButton, this.pauseAudioButton]) {
      button.textContent = label
      button.setAttribute('aria-pressed', this.audioState.muted ? 'true' : 'false')
      button.setAttribute('data-audio-unlocked', this.audioState.unlocked ? 'true' : 'false')
    }
    setHidden(this.audioButton, !this.options.showAudioControl || !this.audioState.enabled)
    setHidden(this.pauseAudioButton, !this.pauseMenu.enabled || !this.pauseMenu.showAudio || !this.audioState.enabled)
  }

  private updatePauseButton(): void {
    this.pauseButton.textContent = this.paused ? this.labels.resume : this.labels.pause
    this.pauseButton.setAttribute('aria-pressed', this.paused ? 'true' : 'false')
  }

  private updateVRButton(): void {
    const visible = this.options.showVRControl && this.vrSupport !== 'disabled'
    setHidden(this.vrButton, !visible)
    this.vrButton.setAttribute('aria-pressed', this.vrSession === 'active' ? 'true' : 'false')
    if (this.vrSession === 'entering') {
      this.vrButton.textContent = this.labels.vrEntering
      this.vrButton.disabled = true
      return
    }
    if (this.vrSession === 'exiting') {
      this.vrButton.textContent = this.labels.vrExiting
      this.vrButton.disabled = true
      return
    }
    if (this.vrSession === 'active') {
      this.vrButton.textContent = this.labels.exitVR
      this.vrButton.disabled = false
      return
    }
    if (this.vrSupport === 'checking' || this.vrSupport === 'unknown') {
      this.vrButton.textContent = this.labels.vrChecking
      this.vrButton.disabled = true
      return
    }
    if (this.vrSupport === 'unsupported' || this.vrSupport === 'error') {
      this.vrButton.textContent = this.labels.vrUnsupported
      this.vrButton.disabled = true
      return
    }
    this.vrButton.textContent = this.labels.enterVR
    this.vrButton.disabled = this.vrSupport !== 'supported'
  }

  private updateXRStatus(): void {
    if (!this.options.showXRStatus) {
      setHidden(this.xrStatus, true)
      return
    }
    let text = ''
    let severity = 'info'
    if (this.xrTracking === 'lost') {
      text = this.labels.vrTrackingLost
      severity = 'error'
    } else if (this.vrSession === 'entering') {
      text = this.labels.vrEntering
    } else if (this.vrSession === 'exiting') {
      text = this.labels.vrExiting
    } else if (this.vrSession === 'active') {
      text = this.xrInputCount > 0
        ? this.labels.vrInputs.replaceAll('{count}', String(this.xrInputCount))
        : this.labels.vrActive
    }
    this.xrStatusMessage.textContent = text
    this.xrStatus.setAttribute('data-severity', severity)
    setHidden(this.xrStatus, text.length === 0)
    this.updateRootVisibility()
  }

  private showDiagnostic(
    message: string,
    severity: RendererDiagnostic['severity'],
    dismissAutomatically: boolean,
  ): void {
    this.clearDiagnosticTimer()
    this.currentDiagnostic = { message, severity }
    this.diagnosticMessage.textContent = message
    this.diagnosticPanel.setAttribute('data-severity', severity)
    setHidden(this.diagnosticPanel, false)
    this.updateRootVisibility()
    if (dismissAutomatically) {
      this.diagnosticTimer = setTimeout(() => this.clearDiagnostic(), 3500)
    }
  }

  private clearDiagnostic(): void {
    this.clearDiagnosticTimer()
    setHidden(this.diagnosticPanel, true)
    this.currentDiagnostic = null
    this.diagnosticMessage.textContent = ''
    this.updateRootVisibility()
  }

  private clearDiagnosticTimer(): void {
    if (this.diagnosticTimer === null) return
    clearTimeout(this.diagnosticTimer)
    this.diagnosticTimer = null
  }

  private updateRootVisibility(): void {
    const visible = !this.loadingPanel.hidden
      || !this.diagnosticPanel.hidden
      || !this.xrStatus.hidden
      || !this.reticle.hidden
      || !this.interactionPrompt.hidden
      || !this.enterPanel.hidden
      || !this.pausedPanel.hidden
      || !this.controls.hidden
      || !this.errorPanel.hidden
      || !this.mapAttribution.hidden
      || !this.captionPanel.hidden
    setHidden(this.root, !visible)
    this.notifyAdapter()
  }

  private mountAdapter(): void {
    if (!this.adapter || this.adapterMounted || this.disposed) return
    this.adapterMounted = true
    const actions: AnyoPlayerUiAdapterActions = Object.freeze({
      retry: () => this.onRetry(),
      enter: () => this.onEnter(),
      togglePause: () => this.onPauseToggle(),
      toggleFullscreen: () => this.onFullscreenToggle(),
      toggleVR: () => this.onVRToggle(),
      interact: () => this.onInteract(),
      toggleAudio: () => this.onAudioToggle(),
      captureScreenshot: () => this.onScreenshot(),
    })
    try {
      const cleanup = this.adapter.mount({
        root: this.root,
        slots: this.slots,
        actions,
        labels: Object.freeze({ ...this.labels }),
        getSnapshot: () => this.snapshot(),
      })
      if (typeof cleanup === 'function') this.adapterCleanup = cleanup
      this.adapter.update?.(this.snapshot())
    } catch (error) {
      this.onAdapterError(error)
    }
  }

  private notifyAdapter(): void {
    if (!this.adapter || !this.adapterMounted || this.disposed) return
    try {
      this.adapter.update?.(this.snapshot())
    } catch (error) {
      this.onAdapterError(error)
    }
  }

  private disposeAdapter(): void {
    if (!this.adapter || !this.adapterMounted) return
    this.adapterMounted = false
    try {
      this.adapterCleanup?.()
    } catch (error) {
      this.onAdapterError(error)
    } finally {
      this.adapterCleanup = null
    }
    try {
      this.adapter.dispose?.()
    } catch (error) {
      this.onAdapterError(error)
    }
  }

  private snapshot(): AnyoPlayerUiSnapshot {
    return Object.freeze({
      phase: this.currentPhase,
      progress: Object.freeze({ ...this.currentProgress }),
      readyStatus: this.currentReadyStatus,
      paused: this.paused,
      pauseReason: this.currentPauseReason,
      fullscreen: this.fullscreen,
      interactionPrompt: Object.freeze({ ...this.currentInteractionPrompt }),
      reticle: Object.freeze({ ...this.currentReticle }),
      vrSupport: this.vrSupport,
      vrSession: this.vrSession,
      xrTracking: this.xrTracking,
      xrInputCount: this.xrInputCount,
      audio: Object.freeze({ ...this.audioState }),
      caption: Object.freeze({ ...this.currentCaption }),
      error: this.currentError,
      diagnostic: this.currentDiagnostic ? Object.freeze({ ...this.currentDiagnostic }) : null,
    })
  }
}


export function createPlayerUI(
  container: HTMLElement,
  options: false | AnyoPlayerUiOptions | undefined,
  onRetry: () => Promise<void>,
  onEnter: () => void,
  onPauseToggle: () => void,
  onFullscreenToggle: () => Promise<void>,
  onVRToggle: () => Promise<void>,
  onInteract: () => Promise<boolean>,
  onAudioToggle: () => Promise<void>,
  onScreenshot: () => Promise<void>,
  pauseMenu: false | AnyoPlayerPauseMenuOptions | undefined,
  audioState: AnyoPlayerAudioState,
  accessibility: PlayerUIAccessibilityConfiguration,
  onAdapterError: (error: unknown) => void = () => undefined,
): PlayerUIController {
  if (options === false) return new NullPlayerUI()
  return new DefaultPlayerUI(
    container,
    options ?? {},
    onRetry,
    onEnter,
    onPauseToggle,
    onFullscreenToggle,
    onVRToggle,
    onInteract,
    onAudioToggle,
    onScreenshot,
    pauseMenu,
    audioState,
    accessibility,
    onAdapterError,
  )
}
