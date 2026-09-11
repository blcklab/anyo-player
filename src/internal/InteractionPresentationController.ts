import type { InteractionSelection, PickResult, RendererAdapter, World } from '@blcklab/anyo'
import type {
  AnyoPlayerInteractionContext,
  AnyoPlayerInteractionReticleOptions,
  AnyoPlayerInteractionTargetState,
} from '../types.js'

const EMPTY_TARGET: AnyoPlayerInteractionTargetState = {
  available: false,
  entityId: null,
  primitiveId: null,
  instanceId: null,
  distance: null,
  source: null,
}

interface InteractionPresentationCallbacks {
  onTargetChange(target: AnyoPlayerInteractionTargetState, context: AnyoPlayerInteractionContext | null): void
  onActivateStart(target: AnyoPlayerInteractionTargetState): void
  onActivateComplete(target: AnyoPlayerInteractionTargetState, selected: boolean): void
  onError(error: unknown): void
}

interface BoundInteractionRuntime {
  world: World
  renderer: RendererAdapter
}

function normalizeInterval(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 100
  return Math.max(32, Math.min(1000, value))
}

function normalizeDistance(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value)) return null
  return Math.max(0, value)
}

function sameTarget(a: AnyoPlayerInteractionTargetState, b: AnyoPlayerInteractionTargetState): boolean {
  return a.available === b.available
    && a.entityId === b.entityId
    && a.primitiveId === b.primitiveId
    && a.instanceId === b.instanceId
    && a.distance === b.distance
    && a.source === b.source
}

function distanceBetween(a: readonly number[], b: readonly number[]): number {
  const x = (a[0] ?? 0) - (b[0] ?? 0)
  const y = (a[1] ?? 0) - (b[1] ?? 0)
  const z = (a[2] ?? 0) - (b[2] ?? 0)
  return Math.hypot(x, y, z)
}

export class InteractionPresentationController {
  private runtime: BoundInteractionRuntime | null = null
  private active = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private targetValue: AnyoPlayerInteractionTargetState = { ...EMPTY_TARGET }
  private selection: InteractionSelection | null = null
  private activating = false
  private disposed = false
  private readonly enabled: boolean
  private readonly sampleInterval: number
  private readonly maxDistance: number | null

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: AnyoPlayerInteractionReticleOptions,
    private readonly callbacks: InteractionPresentationCallbacks,
  ) {
    this.enabled = options.enabled !== false
    this.sampleInterval = normalizeInterval(options.sampleInterval)
    this.maxDistance = normalizeDistance(options.maxDistance)
  }

  get target(): AnyoPlayerInteractionTargetState {
    return { ...this.targetValue }
  }

  get running(): boolean {
    return this.active
  }

  bind(world: World, renderer: RendererAdapter): void {
    this.runtime = { world, renderer }
    if (this.active) this.refreshNow()
  }

  unbind(): void {
    this.stop()
    this.runtime = null
  }

  start(): void {
    if (!this.enabled || this.disposed || this.active) return
    this.active = true
    this.refreshNow()
    this.schedule()
  }

  stop(): void {
    this.active = false
    this.activating = false
    this.clearTimer()
    this.setTarget(EMPTY_TARGET, null, null)
  }

  refreshNow(): AnyoPlayerInteractionTargetState {
    if (this.disposed || !this.active || !this.runtime) {
      this.setTarget(EMPTY_TARGET, null, null)
      return this.target
    }

    try {
      const rect = this.canvas.getBoundingClientRect()
      const result = this.runtime.renderer.pick(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      )
      this.applyPick(result)
    } catch (error) {
      this.callbacks.onError(error)
      this.setTarget(EMPTY_TARGET, null, null)
    }
    return this.target
  }

  async activate(): Promise<boolean> {
    if (this.disposed || this.activating || !this.runtime || !this.selection || !this.targetValue.available) {
      return false
    }
    const target = this.target
    this.activating = true
    this.callbacks.onActivateStart(target)
    try {
      const selected = await this.runtime.world.selectPrimitive({ ...this.selection, source: 'crosshair' })
      this.callbacks.onActivateComplete(target, selected)
      return selected
    } catch (error) {
      this.callbacks.onError(error)
      throw error
    } finally {
      this.activating = false
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.stop()
    this.runtime = null
  }


  private applyPick(result: PickResult | null): void {
    const runtime = this.runtime
    if (!runtime || !result) {
      this.setTarget(EMPTY_TARGET, null, null)
      return
    }

    const primitive = runtime.world.compiled?.primitiveById.get(result.primitiveId)
    if (!primitive?.interaction) {
      this.setTarget(EMPTY_TARGET, null, null)
      return
    }

    const distance = result.distance
      ?? distanceBetween(runtime.renderer.camera.getPosition(), primitive.transform.position ?? [0, 0, 0])
    const authoredLimit = primitive.interaction.distance
    const effectiveLimit = this.maxDistance === null
      ? authoredLimit
      : authoredLimit === undefined
        ? this.maxDistance
        : Math.min(authoredLimit, this.maxDistance)
    if (effectiveLimit !== undefined && distance > effectiveLimit) {
      this.setTarget(EMPTY_TARGET, null, null)
      return
    }

    const target: AnyoPlayerInteractionTargetState = {
      available: true,
      entityId: primitive.entityId ?? null,
      primitiveId: primitive.id,
      instanceId: result.instanceId ?? null,
      distance,
      source: 'reticle',
    }
    const context: AnyoPlayerInteractionContext = {
      trigger: 'reticle',
      ...(primitive.entityId === undefined ? {} : { entityId: primitive.entityId }),
      primitiveId: primitive.id,
      ...(result.instanceId === undefined ? {} : { instanceId: result.instanceId }),
      source: 'crosshair',
      ...(primitive.data === undefined ? {} : { data: primitive.data }),
      ...(primitive.interaction.action === undefined ? {} : { action: primitive.interaction.action }),
      ...(primitive.interaction.event === undefined ? {} : { event: primitive.interaction.event }),
      ...(primitive.interaction.params === undefined ? {} : { params: primitive.interaction.params }),
      distance,
    }
    const selection: InteractionSelection = {
      primitiveId: result.primitiveId,
      ...(primitive.entityId === undefined ? {} : { entityId: primitive.entityId }),
      ...(result.instanceId === undefined ? {} : { instanceId: result.instanceId }),
      ...(result.point === undefined ? {} : { point: result.point }),
      ...(result.normal === undefined ? {} : { normal: result.normal }),
      distance,
      source: 'crosshair',
    }
    this.setTarget(target, context, selection)
  }

  private setTarget(
    target: AnyoPlayerInteractionTargetState,
    context: AnyoPlayerInteractionContext | null,
    selection: InteractionSelection | null,
  ): void {
    this.selection = selection
    if (sameTarget(this.targetValue, target)) return
    this.targetValue = { ...target }
    this.callbacks.onTargetChange(this.target, context)
  }

  private schedule(): void {
    this.clearTimer()
    if (!this.active || this.disposed) return
    this.timer = setTimeout(() => {
      this.timer = null
      if (!this.active || this.disposed) return
      this.refreshNow()
      this.schedule()
    }, this.sampleInterval)
    if (typeof this.timer === 'object' && this.timer !== null && 'unref' in this.timer) {
      ;(this.timer as ReturnType<typeof setTimeout> & { unref(): void }).unref()
    }
  }

  private clearTimer(): void {
    if (this.timer === null) return
    clearTimeout(this.timer)
    this.timer = null
  }
}
