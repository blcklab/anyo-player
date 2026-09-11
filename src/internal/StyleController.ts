import type {
  AnyoPlayerThemeTokens,
  AnyoPlayerUiStyleOptions,
} from '../types.js'
import { ANYO_PLAYER_CSS_TEXT } from '../styleText.js'

const TOKEN_PROPERTIES: Readonly<Record<keyof AnyoPlayerThemeTokens, string>> = {
  background: '--anyo-player-ui-background',
  surface: '--anyo-player-ui-surface',
  text: '--anyo-player-ui-text',
  muted: '--anyo-player-ui-muted',
  border: '--anyo-player-ui-border',
  accent: '--anyo-player-ui-accent',
  accentText: '--anyo-player-ui-accent-text',
  warning: '--anyo-player-ui-warning',
  error: '--anyo-player-ui-error',
  panelRadius: '--anyo-player-ui-panel-radius',
  controlRadius: '--anyo-player-ui-control-radius',
  fontFamily: '--anyo-player-ui-font-family',
  backdropBlur: '--anyo-player-ui-backdrop-blur',
}

function isAppendableRoot(value: unknown): value is Document | ShadowRoot {
  return Boolean(value && typeof value === 'object' && 'appendChild' in value && typeof value.appendChild === 'function')
}

function isDocumentRoot(value: Document | ShadowRoot): value is Document {
  return 'createElement' in value && typeof value.createElement === 'function'
}

function isShadowLike(value: unknown, ownerDocument: Document): value is ShadowRoot {
  return Boolean(value && value !== ownerDocument && isAppendableRoot(value) && 'host' in (value as object))
}

function discoverRoot(container: HTMLElement, configured: Document | ShadowRoot | null | undefined): Document | ShadowRoot {
  if (configured) return configured
  const discovered = typeof container.getRootNode === 'function' ? container.getRootNode() : null
  if (isAppendableRoot(discovered)) return discovered
  return container.ownerDocument
}

function styleParent(root: Document | ShadowRoot): ParentNode | null {
  if (!isDocumentRoot(root)) return root
  return root.head ?? root.documentElement ?? null
}

function normalizeTheme(input: AnyoPlayerThemeTokens | null | undefined): AnyoPlayerThemeTokens {
  if (!input) return {}
  const output: AnyoPlayerThemeTokens = {}
  for (const key of Object.keys(TOKEN_PROPERTIES) as (keyof AnyoPlayerThemeTokens)[]) {
    const value = input[key]
    if (value === undefined) continue
    const normalized = String(value).trim()
    if (!normalized) throw new TypeError(`ui.theme.${key} must not be empty.`)
    output[key] = normalized
  }
  return output
}

export class StyleController {
  private readonly container: HTMLElement
  private readonly originalValues = new Map<string, string>()
  private styleElement: HTMLStyleElement | null = null
  private themeValue: AnyoPlayerThemeTokens = {}
  private disposed = false

  constructor(
    container: HTMLElement,
    styles: false | AnyoPlayerUiStyleOptions | undefined,
    theme: AnyoPlayerThemeTokens | undefined,
  ) {
    this.container = container
    this.installStyles(styles)
    this.setTheme(theme ?? {})
  }

  get theme(): Readonly<AnyoPlayerThemeTokens> {
    return Object.freeze({ ...this.themeValue })
  }

  setTheme(input: AnyoPlayerThemeTokens | null): Readonly<AnyoPlayerThemeTokens> {
    if (this.disposed) return this.theme
    const next = normalizeTheme(input)
    for (const [key, property] of Object.entries(TOKEN_PROPERTIES) as [keyof AnyoPlayerThemeTokens, string][]) {
      if (!this.originalValues.has(property)) {
        this.originalValues.set(property, this.container.style.getPropertyValue(property))
      }
      const value = next[key]
      this.container.style.setProperty(property, value ?? this.originalValues.get(property) ?? '')
    }
    this.themeValue = next
    return this.theme
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const [property, value] of this.originalValues) {
      this.container.style.setProperty(property, value)
    }
    this.originalValues.clear()
    if (this.styleElement?.parentNode) this.styleElement.parentNode.removeChild(this.styleElement)
    this.styleElement = null
  }

  private installStyles(styles: false | AnyoPlayerUiStyleOptions | undefined): void {
    if (styles === false) return
    const options = styles ?? {}
    const mode = options.mode ?? 'auto'
    const root = discoverRoot(this.container, options.root)
    const shouldInject = mode === 'inject' || (mode === 'auto' && isShadowLike(root, this.container.ownerDocument))
    if (!shouldInject) return
    const parent = styleParent(root)
    const document = isDocumentRoot(root) ? root : this.container.ownerDocument
    if (!parent || typeof document.createElement !== 'function') return
    const style = document.createElement('style')
    style.setAttribute('data-anyo-player-styles', '')
    if (options.nonce) style.setAttribute('nonce', options.nonce)
    style.textContent = ANYO_PLAYER_CSS_TEXT
    parent.appendChild(style)
    this.styleElement = style
  }
}
