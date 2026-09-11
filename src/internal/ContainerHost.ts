import { AnyoPlayerError } from '../errors.js'

function isElementLike(value: unknown): value is HTMLElement {
  return Boolean(
    value
      && typeof value === 'object'
      && 'appendChild' in value
      && typeof value.appendChild === 'function'
      && 'removeChild' in value
      && typeof value.removeChild === 'function'
      && 'ownerDocument' in value,
  )
}

function isCanvasLike(value: unknown): value is HTMLCanvasElement {
  return Boolean(
    value
      && typeof value === 'object'
      && 'getContext' in value
      && typeof value.getContext === 'function',
  )
}

function readAttribute(element: Element, name: string): string | null {
  return typeof element.getAttribute === 'function' ? element.getAttribute(name) : null
}

function restoreAttribute(element: Element, name: string, value: string | null): void {
  if (value === null) element.removeAttribute?.(name)
  else element.setAttribute?.(name, value)
}

export class ContainerHost {
  readonly container: HTMLElement
  readonly canvas: HTMLCanvasElement
  private readonly ownsCanvas: boolean
  private readonly containerHadClass: boolean
  private readonly canvasHadClass: boolean
  private readonly originalTabIndex: number
  private readonly originalRole: string | null
  private readonly originalAriaLabel: string | null
  private readonly originalMarker: string | null
  private readonly originalParent: ParentNode | null
  private readonly originalNextSibling: ChildNode | null
  private disposed = false

  constructor(container: HTMLElement, canvas: HTMLCanvasElement | undefined, ariaLabel: string) {
    if (!isElementLike(container)) {
      throw new AnyoPlayerError(
        'PLAYER_INVALID_CONTAINER',
        'createAnyoPlayer() requires a valid HTMLElement container.',
      )
    }

    let selectedCanvas: HTMLCanvasElement
    let ownsCanvas: boolean
    if (canvas !== undefined) {
      if (!isCanvasLike(canvas)) {
        throw new AnyoPlayerError('PLAYER_INVALID_CONTAINER', 'The supplied canvas is not a valid HTMLCanvasElement.')
      }
      selectedCanvas = canvas
      ownsCanvas = false
    } else {
      const created = container.ownerDocument?.createElement?.('canvas')
      if (!isCanvasLike(created)) {
        throw new AnyoPlayerError(
          'PLAYER_INVALID_CONTAINER',
          'The player container cannot create an HTMLCanvasElement.',
        )
      }
      selectedCanvas = created
      ownsCanvas = true
    }

    this.container = container
    this.canvas = selectedCanvas
    this.ownsCanvas = ownsCanvas
    this.containerHadClass = this.container.classList?.contains('anyo-player') ?? false
    this.canvasHadClass = this.canvas.classList?.contains('anyo-player__canvas') ?? false
    this.originalTabIndex = this.canvas.tabIndex
    this.originalRole = readAttribute(this.canvas, 'role')
    this.originalAriaLabel = readAttribute(this.canvas, 'aria-label')
    this.originalMarker = readAttribute(this.canvas, 'data-anyo-player-canvas')
    this.originalParent = this.canvas.parentNode
    this.originalNextSibling = this.canvas.nextSibling

    this.container.classList?.add('anyo-player')
    if (this.canvas.parentNode !== this.container) this.container.appendChild(this.canvas)
    this.canvas.classList?.add('anyo-player__canvas')
    if (this.canvas.tabIndex < 0) this.canvas.tabIndex = 0
    this.canvas.setAttribute?.('role', 'application')
    this.canvas.setAttribute?.('aria-label', ariaLabel)
    this.canvas.setAttribute?.('data-anyo-player-canvas', '')
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true

    this.canvas.tabIndex = this.originalTabIndex
    restoreAttribute(this.canvas, 'role', this.originalRole)
    restoreAttribute(this.canvas, 'aria-label', this.originalAriaLabel)
    restoreAttribute(this.canvas, 'data-anyo-player-canvas', this.originalMarker)
    if (!this.canvasHadClass) this.canvas.classList?.remove('anyo-player__canvas')

    if (this.ownsCanvas) {
      if (this.canvas.parentNode === this.container) this.container.removeChild(this.canvas)
    } else if (this.originalParent && this.canvas.parentNode !== this.originalParent) {
      if (this.originalNextSibling && this.originalNextSibling.parentNode === this.originalParent) {
        this.originalParent.insertBefore(this.canvas, this.originalNextSibling)
      } else {
        this.originalParent.appendChild(this.canvas)
      }
    } else if (!this.originalParent && this.canvas.parentNode === this.container) {
      this.container.removeChild(this.canvas)
    }

    if (!this.containerHadClass) this.container.classList?.remove('anyo-player')
  }
}
