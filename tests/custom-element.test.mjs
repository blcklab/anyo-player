import test from 'node:test'
import assert from 'node:assert/strict'

class TestEventTarget {
  listeners = new Map()
  addEventListener(type, listener) {
    let bucket = this.listeners.get(type)
    if (!bucket) this.listeners.set(type, bucket = new Set())
    bucket.add(listener)
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener) }
  dispatchEvent(event) {
    event.target ??= this
    event.currentTarget = this
    for (const listener of this.listeners.get(event.type) ?? []) listener.call(this, event)
    return true
  }
}

class TestNode extends TestEventTarget {
  constructor(tagName = 'div', ownerDocument = null) {
    super()
    this.tagName = tagName.toUpperCase()
    this.ownerDocument = ownerDocument
    this.parentNode = null
    this.children = []
    this.attributes = new Map()
    this.style = { setProperty() {}, getPropertyValue() { return '' } }
    this.classList = { add() {}, remove() {}, contains() { return false } }
  }
  appendChild(child) {
    child.parentNode?.removeChild?.(child)
    this.children.push(child)
    child.parentNode = this
    return child
  }
  removeChild(child) {
    const index = this.children.indexOf(child)
    if (index >= 0) this.children.splice(index, 1)
    child.parentNode = null
    return child
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  hasAttribute(name) { return this.attributes.has(name) }
  removeAttribute(name) { this.attributes.delete(name) }
}

class TestShadowRoot extends TestNode {
  constructor(host) {
    super('#shadow-root', host.ownerDocument)
    this.host = host
  }
  getRootNode() { return this }
}

class TestHTMLElement extends TestNode {
  constructor() {
    super('anyo-player', testDocument)
    this.isConnected = false
    this.shadowRoot = null
  }
  attachShadow() {
    this.shadowRoot = new TestShadowRoot(this)
    return this.shadowRoot
  }
  setAttribute(name, value) {
    const oldValue = this.getAttribute(name)
    super.setAttribute(name, value)
    if (this.constructor.observedAttributes?.includes(name)) {
      this.attributeChangedCallback?.(name, oldValue, String(value))
    }
  }
  removeAttribute(name) {
    const oldValue = this.getAttribute(name)
    super.removeAttribute(name)
    if (oldValue !== null && this.constructor.observedAttributes?.includes(name)) {
      this.attributeChangedCallback?.(name, oldValue, null)
    }
  }
}

class TestCustomEvent {
  constructor(type, options = {}) {
    this.type = type
    this.detail = options.detail
    this.bubbles = options.bubbles ?? false
    this.composed = options.composed ?? false
  }
}

const testDocument = {
  defaultView: { CustomEvent: TestCustomEvent },
  createElement(name) { return new TestNode(name, this) },
  createEvent() {
    return {
      initCustomEvent(type, bubbles, _cancelable, detail) {
        this.type = type
        this.bubbles = bubbles
        this.detail = detail
      },
    }
  },
}

class TestRegistry {
  values = new Map()
  constructors = new Set()
  define(name, constructor) {
    if (this.values.has(name) || this.constructors.has(constructor)) throw new Error('already defined')
    this.values.set(name, constructor)
    this.constructors.add(constructor)
  }
  get(name) { return this.values.get(name) }
}

const registry = new TestRegistry()
globalThis.HTMLElement = TestHTMLElement
globalThis.CustomEvent = TestCustomEvent
globalThis.customElements = registry

const {
  ANYO_PLAYER_ELEMENT_TAG,
  AnyoPlayerElement,
  defineAnyoPlayerElement,
} = await import('../dist/element.js')

function deferred() {
  let resolve
  const promise = new Promise(res => { resolve = res })
  return { promise, resolve }
}

class FakePlayer {
  constructor(options, disposal = Promise.resolve()) {
    this.options = options
    this.container = options.container
    this.canvas = new TestNode('canvas', testDocument)
    this.listeners = new Map()
    this.disposeCount = 0
    this.disposal = disposal
    this.loads = []
    this.replacements = []
    this.activationCount = 0
  }
  on(event, listener) {
    let bucket = this.listeners.get(event)
    if (!bucket) this.listeners.set(event, bucket = new Set())
    bucket.add(listener)
    return () => bucket.delete(listener)
  }
  emit(event, payload) { for (const listener of this.listeners.get(event) ?? []) listener(payload) }
  async load(source) { this.loads.push(source) }
  async activate() { this.activationCount += 1 }
  async replaceWorld(source) { this.replacements.push(source) }
  async disposeAsync() { this.disposeCount += 1; await this.disposal }
}

function createTestElement(disposals = []) {
  const players = []
  class ElementUnderTest extends AnyoPlayerElement {
    createPlayer(options) {
      const player = new FakePlayer(options, disposals[players.length] ?? Promise.resolve())
      players.push(player)
      return player
    }
  }
  return { element: new ElementUnderTest(), players }
}

function connect(element) {
  element.isConnected = true
  element.connectedCallback()
}

function disconnect(element) {
  element.isConnected = false
  element.disconnectedCallback()
}

async function tick() {
  await new Promise(resolve => setImmediate(resolve))
}

test('element subpath is side-effect free and registration is explicit and idempotent', () => {
  assert.equal(registry.values.size, 0)
  assert.equal(ANYO_PLAYER_ELEMENT_TAG, 'anyo-player')
  assert.equal(defineAnyoPlayerElement(), AnyoPlayerElement)
  assert.equal(defineAnyoPlayerElement(), AnyoPlayerElement)
  assert.equal(registry.get('anyo-player'), AnyoPlayerElement)
  assert.throws(() => defineAnyoPlayerElement('invalid'), /hyphen/)
})

test('custom tag registration is supported', () => {
  const constructor = defineAnyoPlayerElement('virtual-world')
  assert.notEqual(constructor, AnyoPlayerElement)
  assert.equal(constructor.prototype instanceof AnyoPlayerElement, true)
  assert.equal(registry.get('virtual-world'), constructor)
  assert.equal(defineAnyoPlayerElement('virtual-world'), constructor)
})

test('connection creates one player in an open Shadow Root with merged attributes and properties', async () => {
  const { element, players } = createTestElement()
  element.options = {
    renderer: { antialias: true },
    exploration: { desktop: true },
    embedding: { resumeWhenVisible: false },
    ui: { styles: { nonce: 'test-nonce' } },
  }
  element.source = { version: '0.6', nodes: [] }
  element.setAttribute('activation', 'visible')
  element.setAttribute('preload', 'source')
  element.setAttribute('backend', 'webgpu')
  element.setAttribute('poster', '/poster.webp')
  element.setAttribute('pause-when-offscreen', '')
  element.setAttribute('aria-label', 'Virtual gallery')

  connect(element)
  await tick()

  assert.equal(players.length, 1)
  assert.equal(element.player, players[0])
  assert(element.shadowRoot)
  assert.equal(element.shadowRoot.children.length, 2)
  assert.equal(element.shadowRoot.children[0].getAttribute('nonce'), 'test-nonce')
  assert.equal(players[0].options.container.getAttribute('part'), 'container')
  assert.equal(players[0].options.source.version, '0.6')
  assert.deepEqual(players[0].options.renderer, { antialias: true, backend: 'webgpu' })
  assert.deepEqual(players[0].options.embedding, {
    resumeWhenVisible: false,
    activation: 'visible',
    preload: 'source',
    poster: '/poster.webp',
    pauseWhenOffscreen: true,
  })
  assert.equal(players[0].options.ariaLabel, 'Virtual gallery')

  element.connectedCallback()
  assert.equal(players.length, 1)
})

test('synchronous property configuration after connection wins before deferred mounting', async () => {
  const { element, players } = createTestElement()
  connect(element)
  element.source = '/configured-after-connect.json'
  element.options = { renderer: { backend: 'webgl2' } }
  await tick()

  assert.equal(players.length, 1)
  assert.equal(players[0].options.source, '/configured-after-connect.json')
  assert.equal(players[0].options.renderer.backend, 'webgl2')
})

test('element methods delegate to the same framework-neutral player', async () => {
  const { element, players } = createTestElement()
  element.source = '/world-a.json'
  connect(element)

  await element.load()
  await element.activate()
  await element.replaceWorld('/world-b.json')

  assert.deepEqual(players[0].loads, ['/world-a.json'])
  assert.equal(players[0].activationCount, 1)
  assert.deepEqual(players[0].replacements, ['/world-b.json'])
  assert.equal(element.source, '/world-b.json')
})

test('curated player events are forwarded as composed DOM CustomEvents', async () => {
  const { element, players } = createTestElement()
  const received = []
  element.addEventListener('anyo-player-ready', event => received.push(event))
  connect(element)
  await tick()

  const detail = { status: 'ready' }
  players[0].emit('ready', detail)

  assert.equal(received.length, 1)
  assert.equal(received[0].detail, detail)
  assert.equal(received[0].bubbles, true)
  assert.equal(received[0].composed, true)
})

test('moving a connected element does not dispose or recreate its player', async () => {
  const { element, players } = createTestElement()
  connect(element)
  await tick()
  disconnect(element)
  connect(element)
  await tick()

  assert.equal(players.length, 1)
  assert.equal(players[0].disposeCount, 0)
  assert.equal(element.player, players[0])
})

test('genuine disconnection disposes the player and dispatches a terminal event', async () => {
  const { element, players } = createTestElement()
  let disposed = 0
  element.addEventListener('anyo-player-disposed', () => { disposed += 1 })
  connect(element)
  await tick()
  disconnect(element)
  await tick()

  assert.equal(players[0].disposeCount, 1)
  assert.equal(element.player, null)
  assert.equal(disposed, 1)
})

test('reconnection waits for old async disposal before mounting a new generation', async () => {
  const pending = deferred()
  const { element, players } = createTestElement([pending.promise])
  connect(element)
  await tick()
  disconnect(element)
  await tick()
  assert.equal(players[0].disposeCount, 1)

  connect(element)
  assert.equal(players.length, 1)
  pending.resolve()
  await tick()

  assert.equal(players.length, 2)
  assert.equal(element.player, players[1])
})

test('invalid declarative values surface through anyo-player-error without mounting', async () => {
  const { element, players } = createTestElement()
  const errors = []
  element.addEventListener('anyo-player-error', event => errors.push(event.detail))
  element.setAttribute('backend', 'canvas2d')
  connect(element)
  await tick()

  assert(errors.length >= 1)
  assert.equal(players.length, 0)
})
