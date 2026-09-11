import {
  createElement,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import type {
  ForwardedRef,
  HTMLAttributes,
  MutableRefObject,
  ReactElement,
} from 'react'
import type { AnyoPlayerError } from './errors.js'
import {
  FrameworkAdapterController,
} from './internal/FrameworkAdapterController.js'
import type {
  AnyoPlayerAdapterOptions,
  FrameworkAdapterCallbacks,
} from './internal/FrameworkAdapterController.js'
import type {
  AnyoPlayer as AnyoPlayerCore,
  AnyoPlayerEventMap,
  AnyoPlayerSource,
} from './types.js'

export type {
  AnyoPlayerAdapterOptions as AnyoPlayerReactOptions,
} from './internal/FrameworkAdapterController.js'

export interface UseAnyoPlayerReactOptions extends FrameworkAdapterCallbacks {
  source?: AnyoPlayerSource | null
  options?: AnyoPlayerAdapterOptions
}

export interface UseAnyoPlayerReactResult {
  containerRef: (element: HTMLElement | null) => void
  playerRef: MutableRefObject<AnyoPlayerCore | null>
  load(source?: AnyoPlayerSource): Promise<void>
  activate(): Promise<void>
  replaceWorld(source: AnyoPlayerSource): Promise<void>
  disposeAsync(): Promise<void>
}

export interface AnyoPlayerReactHandle {
  readonly player: AnyoPlayerCore | null
  load(source?: AnyoPlayerSource): Promise<void>
  activate(): Promise<void>
  replaceWorld(source: AnyoPlayerSource): Promise<void>
  disposeAsync(): Promise<void>
}

export interface AnyoPlayerReactProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'children' | 'onError' | 'onReady'
> {
  source?: AnyoPlayerSource | null
  options?: AnyoPlayerAdapterOptions
  onPlayerChange?: (player: AnyoPlayerCore | null) => void
  onReady?: (event: AnyoPlayerEventMap['ready']) => void
  onError?: (error: AnyoPlayerError) => void
  onStateChange?: (event: AnyoPlayerEventMap['statechange']) => void
  onPhaseChange?: (event: AnyoPlayerEventMap['phasechange']) => void
  onWorldReplaced?: (event: AnyoPlayerEventMap['worldreplaced']) => void
  onThemeChange?: (event: AnyoPlayerEventMap['themechange']) => void
  onDisposed?: () => void
}

interface CallbackRefs {
  playerchange: MutableRefObject<FrameworkAdapterCallbacks['playerchange']>
  ready: MutableRefObject<FrameworkAdapterCallbacks['ready']>
  error: MutableRefObject<FrameworkAdapterCallbacks['error']>
  statechange: MutableRefObject<FrameworkAdapterCallbacks['statechange']>
  phasechange: MutableRefObject<FrameworkAdapterCallbacks['phasechange']>
  worldreplaced: MutableRefObject<FrameworkAdapterCallbacks['worldreplaced']>
  themechange: MutableRefObject<FrameworkAdapterCallbacks['themechange']>
  disposed: MutableRefObject<FrameworkAdapterCallbacks['disposed']>
}

function useCallbackRefs(config: UseAnyoPlayerReactOptions): CallbackRefs {
  const refs: CallbackRefs = {
    playerchange: useRef(config.playerchange),
    ready: useRef(config.ready),
    error: useRef(config.error),
    statechange: useRef(config.statechange),
    phasechange: useRef(config.phasechange),
    worldreplaced: useRef(config.worldreplaced),
    themechange: useRef(config.themechange),
    disposed: useRef(config.disposed),
  }
  refs.playerchange.current = config.playerchange
  refs.ready.current = config.ready
  refs.error.current = config.error
  refs.statechange.current = config.statechange
  refs.phasechange.current = config.phasechange
  refs.worldreplaced.current = config.worldreplaced
  refs.themechange.current = config.themechange
  refs.disposed.current = config.disposed
  return refs
}

/**
 * Low-level React hook for mounting the framework-neutral Player into a host
 * ref. The mount effect is microtask-deferred so React Strict Mode's
 * development effect replay does not create a throwaway renderer generation.
 */
export function useAnyoPlayer(
  config: UseAnyoPlayerReactOptions = {},
): UseAnyoPlayerReactResult {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const playerRef = useRef<AnyoPlayerCore | null>(null)
  const sourceRef = useRef<AnyoPlayerSource | null>(config.source ?? null)
  const optionsRef = useRef<AnyoPlayerAdapterOptions>(config.options ?? {})
  const callbacks = useCallbackRefs(config)

  sourceRef.current = config.source ?? null
  optionsRef.current = config.options ?? {}

  const controllerRef = useRef<FrameworkAdapterController | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = new FrameworkAdapterController({
      playerchange: value => {
        playerRef.current = value
        callbacks.playerchange.current?.(value)
      },
      ready: event => callbacks.ready.current?.(event),
      error: error => callbacks.error.current?.(error),
      statechange: event => callbacks.statechange.current?.(event),
      phasechange: event => callbacks.phasechange.current?.(event),
      worldreplaced: event => callbacks.worldreplaced.current?.(event),
      themechange: event => callbacks.themechange.current?.(event),
      disposed: () => callbacks.disposed.current?.(),
    })
  }
  const controller = controllerRef.current

  const containerRef = useCallback((element: HTMLElement | null) => {
    setContainer(element)
  }, [])

  useEffect(() => {
    if (!container) return
    let canceled = false
    queueMicrotask(() => {
      if (canceled) return
      void controller.mount(container, sourceRef.current, optionsRef.current)
        .catch(() => undefined)
    })
    return () => {
      canceled = true
      void controller.disposeAsync()
    }
  }, [container, controller])

  useEffect(() => {
    void controller.setSource(config.source).catch(() => undefined)
  }, [config.source, controller])

  return {
    containerRef,
    playerRef,
    load: source => controller.load(source),
    activate: () => controller.activate(),
    replaceWorld: source => controller.replaceWorld(source),
    disposeAsync: () => controller.disposeAsync(),
  }
}

function AnyoPlayerComponent(
  props: AnyoPlayerReactProps,
  ref: ForwardedRef<AnyoPlayerReactHandle>,
): ReactElement {
  const {
    source = null,
    options = {},
    onPlayerChange,
    onReady,
    onError,
    onStateChange,
    onPhaseChange,
    onWorldReplaced,
    onThemeChange,
    onDisposed,
    ...hostProps
  } = props

  const api = useAnyoPlayer({
    source,
    options,
    ...(onPlayerChange ? { playerchange: onPlayerChange } : {}),
    ...(onReady ? { ready: onReady } : {}),
    ...(onError ? { error: onError } : {}),
    ...(onStateChange ? { statechange: onStateChange } : {}),
    ...(onPhaseChange ? { phasechange: onPhaseChange } : {}),
    ...(onWorldReplaced ? { worldreplaced: onWorldReplaced } : {}),
    ...(onThemeChange ? { themechange: onThemeChange } : {}),
    ...(onDisposed ? { disposed: onDisposed } : {}),
  })

  useImperativeHandle(ref, () => ({
    get player() {
      return api.playerRef.current
    },
    load: api.load,
    activate: api.activate,
    replaceWorld: api.replaceWorld,
    disposeAsync: api.disposeAsync,
  }), [api])

  return createElement('div', {
    ...hostProps,
    ref: api.containerRef,
    'data-anyo-player-react': '',
  })
}

export const AnyoPlayer = forwardRef(AnyoPlayerComponent)
AnyoPlayer.displayName = 'AnyoPlayer'
