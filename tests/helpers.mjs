export class FakeClassList {
  values = new Set()
  add(...names) { for (const name of names) this.values.add(name) }
  remove(...names) { for (const name of names) this.values.delete(name) }
  contains(name) { return this.values.has(name) }
}

export class FakeStyle {
  values = new Map()
  setProperty(name, value) { this.values.set(name, value) }
  getPropertyValue(name) { return this.values.get(name) ?? '' }
  set width(value) { this.values.set('width', value) }
  get width() { return this.values.get('width') ?? '' }
}

function captureEnabled(options) {
  return options === true || Boolean(options && typeof options === 'object' && options.capture)
}

export function fakeEvent(type, properties = {}) {
  return {
    type,
    defaultPrevented: false,
    propagationStopped: false,
    immediatePropagationStopped: false,
    preventDefault() { this.defaultPrevented = true },
    stopPropagation() { this.propagationStopped = true },
    stopImmediatePropagation() {
      this.immediatePropagationStopped = true
      this.propagationStopped = true
    },
    ...properties,
  }
}

class FakeEventTarget {
  listeners = new Map()
  captureListeners = new Map()

  addEventListener(type, listener, options) {
    const map = captureEnabled(options) ? this.captureListeners : this.listeners
    let bucket = map.get(type)
    if (!bucket) map.set(type, bucket = new Set())
    bucket.add(listener)
  }

  removeEventListener(type, listener, options) {
    const map = captureEnabled(options) ? this.captureListeners : this.listeners
    const bucket = map.get(type)
    bucket?.delete(listener)
    if (bucket?.size === 0) map.delete(type)
  }

  dispatchEvent(input) {
    const event = typeof input === 'string' ? fakeEvent(input) : input
    event.target ??= this
    event.currentTarget = this
    for (const listener of [...(this.captureListeners.get(event.type) ?? [])]) {
      listener.call(this, event)
      if (event.immediatePropagationStopped) return !event.defaultPrevented
    }
    if (!event.propagationStopped) {
      for (const listener of [...(this.listeners.get(event.type) ?? [])]) {
        listener.call(this, event)
        if (event.immediatePropagationStopped) break
      }
    }
    return !event.defaultPrevented
  }
}

export class FakeElement extends FakeEventTarget {
  classList = new FakeClassList()
  style = new FakeStyle()
  parentNode = null
  nextSibling = null
  tabIndex = -1
  attributes = new Map()
  children = []
  hidden = false
  disabled = false
  textContent = ''
  clientWidth = 640
  clientHeight = 360
  fullscreenMode = 'success'
  capturedPointers = new Set()

  constructor(tagName = 'div', ownerDocument = null) {
    super()
    this.tagName = tagName.toUpperCase()
    this.ownerDocument = ownerDocument
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  setPointerCapture(pointerId) { this.capturedPointers.add(pointerId) }
  releasePointerCapture(pointerId) { this.capturedPointers.delete(pointerId) }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null }
  removeAttribute(name) { this.attributes.delete(name) }

  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      right: this.clientWidth,
      bottom: this.clientHeight,
      width: this.clientWidth,
      height: this.clientHeight,
    }
  }

  requestFullscreen() {
    if (this.fullscreenMode === 'reject') return Promise.reject(new Error('fullscreen denied'))
    if (this.fullscreenMode === 'throw') throw new Error('fullscreen failed')
    this.ownerDocument.fullscreenElement = this
    this.ownerDocument.dispatchEvent(fakeEvent('fullscreenchange', { target: this.ownerDocument }))
    return Promise.resolve()
  }

  click() { this.dispatchEvent(fakeEvent('click', { target: this })) }

  focus() {
    const previous = this.ownerDocument?.activeElement
    if (previous && previous !== this) previous.dispatchEvent(fakeEvent('blur', { target: previous }))
    if (this.ownerDocument) this.ownerDocument.activeElement = this
    this.dispatchEvent(fakeEvent('focus', { target: this }))
  }

  blur() {
    if (this.ownerDocument?.activeElement === this) this.ownerDocument.activeElement = null
    this.dispatchEvent(fakeEvent('blur', { target: this }))
  }

  insertBefore(child, before) {
    if (child.parentNode && child.parentNode !== this) child.parentNode.removeChild(child)
    const index = this.children.indexOf(before)
    if (index < 0) return this.appendChild(child)
    const existing = this.children.indexOf(child)
    if (existing >= 0) this.children.splice(existing, 1)
    this.children.splice(index, 0, child)
    child.parentNode = this
    this.updateSiblings()
    return child
  }

  appendChild(child) {
    if (child.parentNode && child.parentNode !== this) child.parentNode.removeChild(child)
    if (!this.children.includes(child)) this.children.push(child)
    child.parentNode = this
    this.updateSiblings()
    return child
  }

  removeChild(child) {
    const index = this.children.indexOf(child)
    if (index >= 0) this.children.splice(index, 1)
    child.parentNode = null
    child.nextSibling = null
    this.updateSiblings()
    return child
  }

  updateSiblings() {
    this.children.forEach((child, index) => { child.nextSibling = this.children[index + 1] ?? null })
  }
}

export class FakeWindow extends FakeEventTarget {
  constructor() {
    super()
    this.devicePixelRatio = 1
    this.navigator = { maxTouchPoints: 0 }
    this.mediaQueries = []
  }

  matchMedia(query) {
    const media = new FakeMediaQueryList(query)
    this.mediaQueries.push(media)
    return media
  }
}

export class FakeMediaQueryList extends FakeEventTarget {
  constructor(media) {
    super()
    this.media = media
    this.matches = true
  }

  addListener(listener) { this.addEventListener('change', listener) }
  removeListener(listener) { this.removeEventListener('change', listener) }
  trigger() { this.dispatchEvent(fakeEvent('change', { matches: this.matches, media: this.media })) }
}

export class FakeIntersectionObserver {
  static instances = []

  constructor(callback, options = {}) {
    this.callback = callback
    this.options = options
    this.targets = new Set()
    this.disconnected = false
    FakeIntersectionObserver.instances.push(this)
  }

  observe(target) { this.targets.add(target) }
  unobserve(target) { this.targets.delete(target) }
  disconnect() { this.disconnected = true; this.targets.clear() }
  trigger(target, isIntersecting, intersectionRatio = isIntersecting ? 1 : 0) {
    this.callback([{ target, isIntersecting, intersectionRatio }], this)
  }
}

export class FakeResizeObserver {
  static instances = []

  constructor(callback) {
    this.callback = callback
    this.targets = new Set()
    this.disconnected = false
    FakeResizeObserver.instances.push(this)
  }

  observe(target) { this.targets.add(target) }
  disconnect() { this.disconnected = true; this.targets.clear() }
  trigger() { this.callback([], this) }
}


export class FakeDocument extends FakeEventTarget {
  constructor() {
    super()
    this.defaultView = new FakeWindow()
    this.activeElement = null
    this.pointerLockElement = null
    this.fullscreenElement = null
    this.hidden = false
    this.visibilityState = 'visible'
  }

  createElement(name) {
    if (name === 'canvas') return new FakeCanvas(this)
    return new FakeElement(name, this)
  }

  exitPointerLock() {
    if (!this.pointerLockElement) return
    this.pointerLockElement = null
    this.dispatchEvent(fakeEvent('pointerlockchange', { target: this }))
  }

  exitFullscreen() {
    if (!this.fullscreenElement) return Promise.resolve()
    this.fullscreenElement = null
    this.dispatchEvent(fakeEvent('fullscreenchange', { target: this }))
    return Promise.resolve()
  }

  setHidden(hidden) {
    this.hidden = hidden
    this.visibilityState = hidden ? 'hidden' : 'visible'
    this.dispatchEvent(fakeEvent('visibilitychange', { target: this }))
  }
}

export class FakeCanvas extends FakeElement {
  constructor(ownerDocument = null) {
    super('canvas', ownerDocument)
    this.pointerLockMode = 'success'
    this.width = 640
    this.height = 360
    this.toBlobResult = new Blob(['fake-canvas'], { type: 'image/png' })
    this.lastToBlob = null
  }

  getContext() { return null }

  toBlob(callback, type = 'image/png', quality) {
    this.lastToBlob = { type, quality }
    const result = typeof this.toBlobResult === 'function'
      ? this.toBlobResult({ type, quality })
      : this.toBlobResult
    queueMicrotask(() => callback(result))
  }

  requestPointerLock() {
    if (this.pointerLockMode === 'reject') return Promise.reject(new Error('pointer lock denied'))
    if (this.pointerLockMode === 'throw') throw new Error('pointer lock failed')
    this.ownerDocument.pointerLockElement = this
    this.ownerDocument.dispatchEvent(fakeEvent('pointerlockchange', { target: this.ownerDocument }))
    return Promise.resolve()
  }
}

export class FakeContainer extends FakeElement {
  constructor(ownerDocument = new FakeDocument()) {
    super('div', ownerDocument)
  }
}

export function findElement(root, predicate) {
  if (predicate(root)) return root
  for (const child of root.children ?? []) {
    const found = findElement(child, predicate)
    if (found) return found
  }
  return null
}

export function findByAttribute(root, name) {
  return findElement(root, element => element.getAttribute?.(name) !== null)
}

export function findByClass(root, name) {
  return findElement(root, element => element.classList?.contains(name))
}

export function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

export class FakeWorld {
  constructor(options = {}) {
    this.options = options
    this.sequence = []
    this.events = new Map()
    this.actions = new Map()
    this.selections = []
    this.disposeCount = 0
    this.progress = options.progress ?? { queued: 0, loading: 0, loaded: 0, failed: 0, total: 0, ratio: 1 }
    this.currentRoom = options.currentRoom ?? null
    this.runtimeData = structuredClone(options.runtimeData ?? {})
    this.cameraPosition = [...(options.cameraPosition ?? [0, 1.65, 0])]
    this.cameraRotation = [...(options.cameraRotation ?? [0, 0])]
    this.xrRig = structuredClone(options.xrRig ?? { position: [0, 0, 0], yaw: 0 })
    this.compiled = {
      roomById: new Map((options.rooms ?? ['room']).map(roomId => [roomId, { id: roomId }])),
      primitiveById: new Map((options.primitives ?? []).map(primitive => [primitive.id, primitive])),
    }
    this.xr = {
      state: 'idle',
      inputs: options.xrInputs ?? [],
      viewer: null,
      capabilities: null,
      isSupported: async mode => {
        this.sequence.push(`xr-support:${mode}`)
        if (options.xrSupportError) throw options.xrSupportError
        if (options.isXRSupported) return options.isXRSupported(mode)
        return options.xrSupported ?? false
      },
      getSupport: async () => ({ inline: false, immersiveVR: options.xrSupported ?? false, immersiveAR: false }),
      enter: async enterOptions => {
        this.sequence.push('xr-enter')
        this.xr.state = 'entering'
        this.emit('xr:state-change', { previous: 'idle', state: 'entering' })
        try {
          if (options.xrEnter) await options.xrEnter(enterOptions)
        } catch (error) {
          this.xr.state = 'failed'
          this.emit('xr:error', { error })
          this.emit('xr:state-change', { previous: 'entering', state: 'failed' })
          throw error
        }
        this.xr.state = 'active'
        this.emit('xr:session-start', { mode: enterOptions?.mode ?? 'immersive-vr' })
        this.emit('xr:state-change', { previous: 'entering', state: 'active' })
      },
      exit: async () => {
        this.sequence.push('xr-exit')
        const previous = this.xr.state
        this.xr.state = 'exiting'
        this.emit('xr:state-change', { previous, state: 'exiting' })
        try {
          if (options.xrExit) await options.xrExit()
        } catch (error) {
          this.xr.state = 'active'
          this.emit('xr:error', { error })
          this.emit('xr:state-change', { previous: 'exiting', state: 'active' })
          throw error
        }
        this.xr.state = 'idle'
        this.emit('xr:session-end', { mode: 'immersive-vr' })
        this.emit('xr:state-change', { previous: 'exiting', state: 'idle' })
      },
      getPlayerRigTransform: () => structuredClone(this.xrRig),
      setPlayerRigTransform: value => { this.xrRig = structuredClone(value) },
    }
    this.exploration = {
      available: true,
      inputEnabled: true,
      moveAxes: [0, 0],
      running: false,
      lookDeltas: [],
      jumpCount: 0,
      clearCount: 0,
      releaseCount: 0,
      setInputEnabled: enabled => {
        this.sequence.push(`input:${enabled}`)
        this.exploration.inputEnabled = enabled
      },
      setMoveAxes: (right, forward) => {
        this.sequence.push(`move:${right},${forward}`)
        this.exploration.moveAxes = [right, forward]
      },
      setRun: running => {
        this.sequence.push(`run:${running}`)
        this.exploration.running = running
      },
      requestJump: () => {
        this.sequence.push('jump')
        this.exploration.jumpCount += 1
      },
      addLookDelta: (x, y) => {
        this.sequence.push(`look:${x},${y}`)
        this.exploration.lookDeltas.push([x, y])
      },
      clearInput: () => {
        this.sequence.push('clear-input')
        this.exploration.clearCount += 1
        this.exploration.moveAxes = [0, 0]
        this.exploration.running = false
      },
      releasePointerLock: () => {
        this.sequence.push('release-pointer-lock')
        this.exploration.releaseCount += 1
        if (this.canvas?.ownerDocument?.pointerLockElement === this.canvas) {
          this.canvas.ownerDocument.exitPointerLock()
        }
      },
    }
  }

  on(event, listener) {
    let bucket = this.events.get(event)
    if (!bucket) this.events.set(event, bucket = new Set())
    bucket.add(listener)
    return () => bucket.delete(listener)
  }

  emit(event, payload) {
    for (const listener of this.events.get(event) ?? []) listener(payload)
  }

  registerAction(name, handler) {
    this.sequence.push(`action:${name}`)
    this.actions.set(name, handler)
    return () => this.actions.delete(name)
  }

  async selectPrimitive(selection) {
    this.sequence.push(`select:${selection.source ?? 'unknown'}`)
    this.selections.push(selection)
    if (this.options.selectPrimitive) return this.options.selectPrimitive(selection)
    this.emit('entity:select', {
      entityId: this.options.selectedEntityId ?? 'entity-1',
      primitiveId: selection.primitiveId,
      instanceId: selection.instanceId,
      source: selection.source,
      data: this.options.selectedData,
    })
    return true
  }

  async load(document) {
    this.sequence.push('load')
    this.loadedDocument = document
    if (this.options.load) await this.options.load(document)
    return this
  }

  async whenReady() {
    this.sequence.push('ready')
    if (this.options.whenReady) await this.options.whenReady()
  }

  start() {
    this.sequence.push('start')
    this.running = true
    if (this.options.start) this.options.start()
  }

  stop() {
    this.sequence.push('stop')
    this.running = false
    if (this.options.stop) this.options.stop()
  }

  pause() {
    this.sequence.push('pause')
    this.running = false
    this.exploration.clearInput()
    this.exploration.releasePointerLock()
    if (this.options.pause) this.options.pause()
  }

  resume() {
    this.sequence.push('resume')
    this.running = true
    if (this.options.resume) this.options.resume()
  }

  async whenIdle() {
    this.sequence.push('idle')
    if (this.options.whenIdle) await this.options.whenIdle()
  }

  getAssetProgress() { return this.progress }

  getCurrentRoom() { return this.currentRoom }

  setCurrentRoom(roomId) { this.currentRoom = roomId }

  getData(path) {
    if (!path) return structuredClone(this.runtimeData)
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
    let current = this.runtimeData
    for (const part of parts) {
      if (current === null || typeof current !== 'object' || !(part in current)) return undefined
      current = current[part]
    }
    return structuredClone(current)
  }

  async setData(path, value) {
    this.sequence.push(`data:${path}`)
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
    let current = this.runtimeData
    for (const part of parts.slice(0, -1)) {
      if (!current[part] || typeof current[part] !== 'object') current[part] = {}
      current = current[part]
    }
    current[parts.at(-1)] = structuredClone(value)
  }

  setXRInputs(inputs) {
    this.xr.inputs = inputs
    this.emit('xr:input-sources-change', { inputs })
  }

  loseXRTracking() { this.emit('xr:tracking-lost', undefined) }
  restoreXRTracking() { this.emit('xr:tracking-restored', undefined) }

  endXRFromBrowser() {
    const previous = this.xr.state
    this.xr.state = 'idle'
    this.emit('xr:session-end', { mode: 'immersive-vr' })
    this.emit('xr:state-change', { previous, state: 'idle' })
  }

  async disposeAsync() {
    this.sequence.push('dispose')
    this.disposeCount += 1
    if (this.options.dispose) await this.options.dispose()
  }
}

export class FakeRuntimeFactory {
  constructor(worlds = []) {
    this.worlds = worlds
    this.created = []
  }
  create(options) {
    const world = this.worlds.shift() ?? new FakeWorld()
    world.canvas = options.canvas
    const renderer = {
      canvas: options.canvas,
      camera: {
        getPosition: () => [...world.cameraPosition],
        setPosition: position => { world.cameraPosition = [...position] },
        getRotation: () => [...world.cameraRotation],
        setRotation: (yaw, pitch) => { world.cameraRotation = [yaw, pitch] },
        getForward: () => [0, 0, -1],
        getRight: () => [1, 0, 0],
      },
      resizeCalls: [],
      renderCalls: [],
      pickCalls: [],
      pickResult: world.options.pickResult ?? null,
      resize(width, height, pixelRatio) {
        this.resizeCalls.push({ width, height, pixelRatio })
      },
      render(delta = 0) {
        this.renderCalls.push(delta)
      },
      pick(clientX, clientY) {
        this.pickCalls.push({ clientX, clientY })
        return typeof this.pickResult === 'function'
          ? this.pickResult(clientX, clientY)
          : this.pickResult
      },
    }
    world.renderer = renderer
    this.created.push({ options, world, renderer })
    return { world, renderer }
  }
}

export class StaticSourceResolver {
  constructor(document = { version: '0.6' }) { this.document = document }
  async resolve(_source, signal) {
    if (signal.aborted) throw signal.reason
    return { document: structuredClone(this.document) }
  }
}
