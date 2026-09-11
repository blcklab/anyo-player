import type {
  AnyoPlayerAccessibilityOptions,
  AnyoPlayerAnnouncementPriority,
  AnyoPlayerInputModality,
  AnyoPlayerReducedMotionPreference,
} from '../types.js'

let accessibilityId = 0

function restoreAttribute(element: Element, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name)
  else element.setAttribute(name, value)
}

function appendDescribedBy(current: string | null, id: string): string {
  const values = new Set((current ?? '').split(/\s+/).filter(Boolean))
  values.add(id)
  return [...values].join(' ')
}

function isModifierOnly(code: string): boolean {
  return code === 'ShiftLeft'
    || code === 'ShiftRight'
    || code === 'ControlLeft'
    || code === 'ControlRight'
    || code === 'AltLeft'
    || code === 'AltRight'
    || code === 'MetaLeft'
    || code === 'MetaRight'
}

export interface AccessibilityCallbacks {
  onReducedMotionChange(previous: boolean, reducedMotion: boolean, preference: AnyoPlayerReducedMotionPreference): void
  onInputModalityChange(previous: AnyoPlayerInputModality, modality: AnyoPlayerInputModality): void
}

export class AccessibilityController {
  private readonly document: Document | null
  private readonly window: Window | null
  private readonly mediaQuery: MediaQueryList | null
  private readonly instructionsElement: HTMLDivElement | null
  private readonly politeRegion: HTMLDivElement | null
  private readonly assertiveRegion: HTMLDivElement | null
  private readonly originalDescribedBy: string | null
  private readonly originalRoleDescription: string | null
  private readonly originalReducedMotionMarker: string | null
  private readonly originalModalityMarker: string | null
  private readonly announcementsEnabled: boolean
  private readonly keyboardNavigationEnabled: boolean
  private readonly focusManagementEnabled: boolean
  private preferenceValue: AnyoPlayerReducedMotionPreference
  private reducedMotionValue = false
  private modalityValue: AnyoPlayerInputModality = 'unknown'
  private announcementTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = false

  constructor(
    private readonly container: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    options: false | AnyoPlayerAccessibilityOptions | undefined,
    private readonly callbacks: AccessibilityCallbacks,
  ) {
    this.document = canvas.ownerDocument ?? (typeof document === 'undefined' ? null : document)
    this.window = this.document?.defaultView ?? (typeof window === 'undefined' ? null : window)
    const disabled = options === false
    const resolved = disabled ? {} : options ?? {}
    this.preferenceValue = disabled ? false : resolved.reducedMotion ?? 'system'
    this.announcementsEnabled = !disabled && resolved.announcements !== false
    this.keyboardNavigationEnabled = !disabled && resolved.keyboardNavigation !== false
    this.focusManagementEnabled = !disabled && resolved.focusManagement !== false
    this.originalDescribedBy = canvas.getAttribute('aria-describedby')
    this.originalRoleDescription = canvas.getAttribute('aria-roledescription')
    this.originalReducedMotionMarker = container.getAttribute('data-anyo-player-reduced-motion')
    this.originalModalityMarker = container.getAttribute('data-anyo-player-input-modality')

    this.mediaQuery = this.window?.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null
    this.reducedMotionValue = this.resolveReducedMotion()
    this.applyReducedMotion()
    this.applyModality()

    const doc = this.document
    if (!disabled && doc?.createElement) {
      const id = `anyo-player-instructions-${++accessibilityId}`
      const instructions = doc.createElement('div')
      instructions.classList.add('anyo-player__sr-only')
      instructions.setAttribute('data-anyo-player-instructions', '')
      instructions.setAttribute('id', id)
      instructions.textContent = resolved.instructions ?? ''
      this.instructionsElement = instructions
      this.container.appendChild(instructions)
      this.canvas.setAttribute('aria-describedby', appendDescribedBy(this.originalDescribedBy, id))
      this.canvas.setAttribute('aria-roledescription', resolved.roleDescription ?? 'Interactive 3D world')

      if (this.announcementsEnabled) {
        this.politeRegion = this.createLiveRegion('polite')
        this.assertiveRegion = this.createLiveRegion('assertive')
      } else {
        this.politeRegion = null
        this.assertiveRegion = null
      }

      doc.addEventListener('keydown', this.handleKeyDown, { capture: true })
      doc.addEventListener('pointerdown', this.handlePointerDown, { capture: true })
      doc.addEventListener('touchstart', this.handleTouchStart, { capture: true })
      this.mediaQuery?.addEventListener?.('change', this.handleReducedMotionChange)
      this.mediaQuery?.addListener?.(this.handleReducedMotionChange)
    } else {
      this.instructionsElement = null
      this.politeRegion = null
      this.assertiveRegion = null
    }
  }

  get reducedMotion(): boolean { return this.reducedMotionValue }
  get preference(): AnyoPlayerReducedMotionPreference { return this.preferenceValue }
  get inputModality(): AnyoPlayerInputModality { return this.modalityValue }
  get keyboardNavigation(): boolean { return this.keyboardNavigationEnabled }
  get focusManagement(): boolean { return this.focusManagementEnabled }
  get keyboardActive(): boolean { return this.modalityValue === 'keyboard' }

  setReducedMotion(preference: AnyoPlayerReducedMotionPreference): boolean {
    if (this.disposed) return this.reducedMotionValue
    if (preference !== true && preference !== false && preference !== 'system') {
      throw new TypeError('Reduced-motion preference must be true, false, or "system".')
    }
    this.preferenceValue = preference
    this.refreshReducedMotion()
    return this.reducedMotionValue
  }

  setInputModality(modality: AnyoPlayerInputModality): void {
    if (this.disposed || modality === this.modalityValue) return
    const previous = this.modalityValue
    this.modalityValue = modality
    this.applyModality()
    this.callbacks.onInputModalityChange(previous, modality)
  }

  setInstructions(instructions: string): void {
    if (this.disposed || !this.instructionsElement) return
    this.instructionsElement.textContent = instructions.trim()
  }

  announce(message: string, priority: AnyoPlayerAnnouncementPriority = 'polite'): void {
    if (this.disposed || !this.announcementsEnabled) return
    const text = message.trim()
    if (!text) return
    const region = priority === 'assertive' ? this.assertiveRegion : this.politeRegion
    if (!region) return
    if (this.announcementTimer !== null) clearTimeout(this.announcementTimer)
    region.textContent = ''
    this.announcementTimer = setTimeout(() => {
      this.announcementTimer = null
      if (!this.disposed) region.textContent = text
    }, 0)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.announcementTimer !== null) clearTimeout(this.announcementTimer)
    this.announcementTimer = null
    this.document?.removeEventListener('keydown', this.handleKeyDown, { capture: true })
    this.document?.removeEventListener('pointerdown', this.handlePointerDown, { capture: true })
    this.document?.removeEventListener('touchstart', this.handleTouchStart, { capture: true })
    this.mediaQuery?.removeEventListener?.('change', this.handleReducedMotionChange)
    this.mediaQuery?.removeListener?.(this.handleReducedMotionChange)
    this.instructionsElement?.parentNode?.removeChild(this.instructionsElement)
    this.politeRegion?.parentNode?.removeChild(this.politeRegion)
    this.assertiveRegion?.parentNode?.removeChild(this.assertiveRegion)
    restoreAttribute(this.canvas, 'aria-describedby', this.originalDescribedBy)
    restoreAttribute(this.canvas, 'aria-roledescription', this.originalRoleDescription)
    restoreAttribute(this.container, 'data-anyo-player-reduced-motion', this.originalReducedMotionMarker)
    restoreAttribute(this.container, 'data-anyo-player-input-modality', this.originalModalityMarker)
  }

  private createLiveRegion(priority: AnyoPlayerAnnouncementPriority): HTMLDivElement {
    const element = this.document!.createElement('div')
    element.classList.add('anyo-player__sr-only')
    element.setAttribute(`data-anyo-player-live-${priority}`, '')
    element.setAttribute('role', priority === 'assertive' ? 'alert' : 'status')
    element.setAttribute('aria-live', priority)
    element.setAttribute('aria-atomic', 'true')
    this.container.appendChild(element)
    return element
  }

  private resolveReducedMotion(): boolean {
    return this.preferenceValue === 'system'
      ? Boolean(this.mediaQuery?.matches)
      : this.preferenceValue
  }

  private refreshReducedMotion(): void {
    const next = this.resolveReducedMotion()
    if (next === this.reducedMotionValue) {
      this.applyReducedMotion()
      return
    }
    const previous = this.reducedMotionValue
    this.reducedMotionValue = next
    this.applyReducedMotion()
    this.callbacks.onReducedMotionChange(previous, next, this.preferenceValue)
  }

  private applyReducedMotion(): void {
    this.container.setAttribute('data-anyo-player-reduced-motion', this.reducedMotionValue ? 'true' : 'false')
  }

  private applyModality(): void {
    this.container.setAttribute('data-anyo-player-input-modality', this.modalityValue)
  }

  private readonly handleReducedMotionChange = (): void => {
    if (this.preferenceValue === 'system') this.refreshReducedMotion()
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.keyboardNavigationEnabled || isModifierOnly(event.code)) return
    this.setInputModality('keyboard')
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.setInputModality(event.pointerType === 'touch' ? 'touch' : 'pointer')
  }

  private readonly handleTouchStart = (): void => {
    this.setInputModality('touch')
  }
}
