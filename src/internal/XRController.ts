import type {
  RendererXREnterOptions,
  World,
  XRInputSnapshot,
  XRSessionState,
} from '@blcklab/anyo'
import type {
  AnyoPlayerVROptions,
  AnyoPlayerVRSupportState,
  AnyoPlayerXRTrackingState,
} from '../types.js'

export interface XRControllerCallbacks {
  onSupportChange(previous: AnyoPlayerVRSupportState, state: AnyoPlayerVRSupportState): void
  onStateChange(previous: XRSessionState, state: XRSessionState): void
  onSessionStart(): void
  onSessionEnd(): void
  onInputsChange(inputs: readonly XRInputSnapshot[]): void
  onTrackingChange(previous: AnyoPlayerXRTrackingState, state: AnyoPlayerXRTrackingState): void
  onReferenceSpaceReset(): void
  onError(error: unknown): void
}

function cloneInputs(inputs: readonly XRInputSnapshot[]): readonly XRInputSnapshot[] {
  return inputs.map(input => ({
    ...input,
    profiles: [...input.profiles],
    buttons: input.buttons.map(button => ({ ...button })),
    axes: [...input.axes],
    targetRay: input.targetRay ? {
      ...input.targetRay,
      matrix: [...input.targetRay.matrix],
      position: [...input.targetRay.position] as [number, number, number],
      direction: [...input.targetRay.direction] as [number, number, number],
    } : null,
    grip: input.grip ? {
      ...input.grip,
      matrix: [...input.grip.matrix],
      position: [...input.grip.position] as [number, number, number],
      direction: [...input.grip.direction] as [number, number, number],
    } : null,
  }))
}

export class XRController {
  private world: World | null = null
  private cleanups: Array<() => void> = []
  private supportGeneration = 0
  private supportStateValue: AnyoPlayerVRSupportState
  private trackingValue: AnyoPlayerXRTrackingState = 'unavailable'
  private inputsValue: readonly XRInputSnapshot[] = []
  private disposed = false

  constructor(
    readonly enabled: boolean,
    private readonly options: AnyoPlayerVROptions,
    private readonly callbacks: XRControllerCallbacks,
  ) {
    this.supportStateValue = enabled ? 'unknown' : 'disabled'
  }

  get supportState(): AnyoPlayerVRSupportState {
    return this.supportStateValue
  }

  get supported(): boolean | null {
    if (this.supportStateValue === 'supported') return true
    if (this.supportStateValue === 'unsupported') return false
    return null
  }

  get state(): XRSessionState {
    return this.world?.xr.state ?? 'idle'
  }

  get tracking(): AnyoPlayerXRTrackingState {
    return this.trackingValue
  }

  get inputs(): readonly XRInputSnapshot[] {
    return cloneInputs(this.inputsValue)
  }

  get checkSupportOnLoad(): boolean {
    return this.options.checkSupportOnLoad !== false
  }

  bind(world: World): void {
    this.assertAlive()
    this.unbind()
    this.world = world
    this.trackingValue = 'unavailable'
    this.inputsValue = cloneInputs(world.xr.inputs)
    this.cleanups.push(
      world.on<{ previous: XRSessionState; state: XRSessionState }>('xr:state-change', payload => {
        this.callbacks.onStateChange(payload.previous, payload.state)
      }),
      world.on('xr:session-start', () => {
        this.setTracking('tracked')
        this.inputsValue = cloneInputs(world.xr.inputs)
        this.callbacks.onSessionStart()
        this.callbacks.onInputsChange(this.inputs)
      }),
      world.on('xr:session-end', () => {
        this.setTracking('unavailable')
        this.inputsValue = []
        this.callbacks.onInputsChange(this.inputs)
        this.callbacks.onSessionEnd()
      }),
      world.on<{ inputs: readonly XRInputSnapshot[] }>('xr:input-sources-change', payload => {
        this.inputsValue = cloneInputs(payload.inputs)
        this.callbacks.onInputsChange(this.inputs)
      }),
      world.on('xr:tracking-lost', () => this.setTracking('lost')),
      world.on('xr:tracking-restored', () => this.setTracking('tracked')),
      world.on('xr:reference-space-reset', () => this.callbacks.onReferenceSpaceReset()),
      world.on<{ error: unknown }>('xr:error', payload => this.callbacks.onError(payload.error)),
    )
  }

  async checkSupport(): Promise<boolean> {
    this.assertAlive()
    if (!this.enabled) {
      this.setSupportState('disabled')
      return false
    }
    const world = this.requireWorld()
    const generation = ++this.supportGeneration
    this.setSupportState('checking')
    try {
      const supported = await world.xr.isSupported('immersive-vr')
      if (generation !== this.supportGeneration || this.disposed || this.world !== world) return false
      this.setSupportState(supported ? 'supported' : 'unsupported')
      return supported
    } catch (error) {
      if (generation !== this.supportGeneration || this.disposed || this.world !== world) return false
      this.setSupportState('error')
      throw error
    }
  }

  async enter(): Promise<void> {
    this.assertAlive()
    if (!this.enabled) throw new Error('VR is disabled for this Anyo Player.')
    const world = this.requireWorld()
    const options: Partial<RendererXREnterOptions> = {
      mode: this.options.mode ?? 'immersive-vr',
      ...(this.options.referenceSpace === undefined ? {} : { referenceSpace: this.options.referenceSpace }),
      ...(this.options.requiredFeatures === undefined ? {} : { requiredFeatures: this.options.requiredFeatures }),
      ...(this.options.optionalFeatures === undefined ? {} : { optionalFeatures: this.options.optionalFeatures }),
      ...(this.options.domOverlayRoot === undefined ? {} : { domOverlayRoot: this.options.domOverlayRoot }),
    }
    await world.xr.enter(options)
  }

  async exit(): Promise<void> {
    this.assertAlive()
    await this.requireWorld().xr.exit()
  }

  unbind(): void {
    ++this.supportGeneration
    for (const cleanup of this.cleanups.splice(0)) cleanup()
    this.world = null
    this.inputsValue = []
    this.trackingValue = 'unavailable'
    if (this.enabled) this.setSupportState('unknown')
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    ++this.supportGeneration
    for (const cleanup of this.cleanups.splice(0)) cleanup()
    this.world = null
    this.inputsValue = []
    this.trackingValue = 'unavailable'
  }

  private setSupportState(state: AnyoPlayerVRSupportState): void {
    if (this.supportStateValue === state) return
    const previous = this.supportStateValue
    this.supportStateValue = state
    this.callbacks.onSupportChange(previous, state)
  }

  private setTracking(state: AnyoPlayerXRTrackingState): void {
    if (this.trackingValue === state) return
    const previous = this.trackingValue
    this.trackingValue = state
    this.callbacks.onTrackingChange(previous, state)
  }

  private requireWorld(): World {
    if (!this.world) throw new Error('Load an Anyo world before using VR.')
    return this.world
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error('The Anyo Player XR controller is disposed.')
  }
}
