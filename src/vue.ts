import {
  defineComponent,
  h,
  markRaw,
  mergeProps,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  shallowRef,
  unref,
  watch,
} from 'vue'
import type {
  ComponentPublicInstance,
  ComputedRef,
  PropType,
  Ref,
  ShallowRef,
} from 'vue'
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
  AnyoPlayerAdapterOptions as AnyoPlayerVueOptions,
} from './internal/FrameworkAdapterController.js'

export type AnyoPlayerVueResolvable<T> =
  | T
  | Ref<T>
  | ComputedRef<T>
  | (() => T)

export interface UseAnyoPlayerVueOptions extends FrameworkAdapterCallbacks {
  source?: AnyoPlayerVueResolvable<AnyoPlayerSource | null | undefined>
  options?: AnyoPlayerVueResolvable<AnyoPlayerAdapterOptions | undefined>
  pauseOnDeactivated?: boolean
}

export interface UseAnyoPlayerVueResult {
  container: ShallowRef<HTMLElement | null>
  player: ShallowRef<AnyoPlayerCore | null>
  load(source?: AnyoPlayerSource): Promise<void>
  activate(): Promise<void>
  replaceWorld(source: AnyoPlayerSource): Promise<void>
  disposeAsync(): Promise<void>
}

export interface AnyoPlayerVueExposed extends UseAnyoPlayerVueResult {}

export interface AnyoPlayerVueProps {
  source?: AnyoPlayerSource | null
  options?: AnyoPlayerAdapterOptions
  tag?: string
  pauseOnDeactivated?: boolean
}

function resolveValue<T>(value: AnyoPlayerVueResolvable<T> | undefined): T | undefined {
  if (typeof value === 'function') return (value as () => T)()
  return value === undefined ? undefined : unref(value)
}

/**
 * Low-level Vue 3 composable for mounting the framework-neutral Player into a
 * template ref. Player construction options are read when a mount generation
 * begins; source changes are applied through Player.replaceWorld().
 */
export function useAnyoPlayer(
  config: UseAnyoPlayerVueOptions = {},
): UseAnyoPlayerVueResult {
  const container = shallowRef<HTMLElement | null>(null)
  const player = shallowRef<AnyoPlayerCore | null>(null)
  let pausedForDeactivation = false

  const controller = new FrameworkAdapterController({
    playerchange: value => {
      // Player is an imperative class instance with renderer/GPU/browser state.
      // Never allow Vue's deep reactivity to proxy it.
      const rawPlayer = value ? markRaw(value) : null
      player.value = rawPlayer
      config.playerchange?.(rawPlayer)
    },
    ready: event => config.ready?.(event),
    error: error => config.error?.(error),
    statechange: event => config.statechange?.(event),
    phasechange: event => config.phasechange?.(event),
    worldreplaced: event => config.worldreplaced?.(event),
    themechange: event => config.themechange?.(event),
    disposed: () => config.disposed?.(),
  })

  onMounted(() => {
    const host = container.value
    if (!host) return
    void controller.mount(
      host,
      resolveValue(config.source),
      resolveValue(config.options) ?? {},
    ).catch(() => undefined)
  })

  watch(
    () => resolveValue(config.source),
    source => {
      void controller.setSource(source).catch(() => undefined)
    },
    { flush: 'post' },
  )

  onDeactivated(() => {
    if (!config.pauseOnDeactivated) return
    const current = controller.player
    if (!current || current.paused) return
    current.pause()
    pausedForDeactivation = true
  })

  onActivated(() => {
    if (!pausedForDeactivation) return
    pausedForDeactivation = false
    const current = controller.player
    if (current?.paused) current.resume()
  })

  onBeforeUnmount(() => {
    void controller.disposeAsync()
  })

  return {
    container,
    player,
    load: source => controller.load(source),
    activate: () => controller.activate(),
    replaceWorld: source => controller.replaceWorld(source),
    disposeAsync: () => controller.disposeAsync(),
  }
}

const vueComponent = defineComponent({
  name: 'AnyoPlayer',
  inheritAttrs: false,
  props: {
    source: {
      type: [String, Object] as PropType<AnyoPlayerSource | null>,
      default: null,
    },
    options: {
      type: Object as PropType<AnyoPlayerAdapterOptions>,
      default: () => ({}),
    },
    tag: {
      type: String,
      default: 'div',
    },
    pauseOnDeactivated: {
      type: Boolean,
      default: true,
    },
  },
  emits: {
    playerchange: (_player: AnyoPlayerCore | null) => true,
    ready: (_event: AnyoPlayerEventMap['ready']) => true,
    error: (_error: AnyoPlayerError) => true,
    statechange: (_event: AnyoPlayerEventMap['statechange']) => true,
    phasechange: (_event: AnyoPlayerEventMap['phasechange']) => true,
    worldreplaced: (_event: AnyoPlayerEventMap['worldreplaced']) => true,
    themechange: (_event: AnyoPlayerEventMap['themechange']) => true,
    disposed: () => true,
  },
  setup(props, { attrs, emit, expose }) {
    const source = (): AnyoPlayerSource | null => props.source
    const options = (): AnyoPlayerAdapterOptions => props.options
    const api = useAnyoPlayer({
      source,
      options,
      pauseOnDeactivated: props.pauseOnDeactivated,
      playerchange: value => emit('playerchange', value),
      ready: event => emit('ready', event),
      error: error => emit('error', error),
      statechange: event => emit('statechange', event),
      phasechange: event => emit('phasechange', event),
      worldreplaced: event => emit('worldreplaced', event),
      themechange: event => emit('themechange', event),
      disposed: () => emit('disposed'),
    })

    expose(api)

    return () => h(
      props.tag,
      mergeProps(attrs, {
        ref: api.container,
        'data-anyo-player-vue': '',
      }),
    )
  },
})

export const AnyoPlayer = vueComponent as typeof vueComponent & {
  new (): ComponentPublicInstance<AnyoPlayerVueProps> & AnyoPlayerVueExposed
}
