export class CdpSession {
  constructor(url) {
    this.url = url
    this.socket = null
    this.nextId = 0
    this.pending = new Map()
    this.listeners = new Map()
  }

  async connect(timeoutMs = 10_000) {
    const socket = new WebSocket(this.url)
    this.socket = socket
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`CDP WebSocket timed out: ${this.url}`)), timeoutMs)
      socket.addEventListener('open', () => {
        clearTimeout(timeout)
        resolve()
      }, { once: true })
      socket.addEventListener('error', event => {
        clearTimeout(timeout)
        reject(new Error(`CDP WebSocket failed: ${String(event?.message ?? event)}`))
      }, { once: true })
    })
    socket.addEventListener('message', event => this.#handleMessage(event.data))
    socket.addEventListener('close', () => {
      for (const { reject, timeout } of this.pending.values()) {
        clearTimeout(timeout)
        reject(new Error('CDP WebSocket closed before the command completed.'))
      }
      this.pending.clear()
    })
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set()
    listeners.add(listener)
    this.listeners.set(method, listeners)
    return () => listeners.delete(listener)
  }

  async send(method, params = {}, timeoutMs = 15_000) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error(`Cannot send CDP command before connection: ${method}`)
    }
    const id = ++this.nextId
    const response = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP command timed out: ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timeout })
    })
    this.socket.send(JSON.stringify({ id, method, params }))
    return response
  }

  close() {
    this.socket?.close()
  }

  #handleMessage(raw) {
    let message
    try {
      message = JSON.parse(typeof raw === 'string' ? raw : String(raw))
    } catch {
      return
    }
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      clearTimeout(pending.timeout)
      if (message.error) pending.reject(new Error(`${message.error.message} (${message.error.code})`))
      else pending.resolve(message.result)
      return
    }
    if (typeof message.method !== 'string') return
    for (const listener of this.listeners.get(message.method) ?? []) {
      try { listener(message.params) } catch {}
    }
  }
}

export async function evaluate(session, expression, options = {}) {
  const result = await session.send('Runtime.evaluate', {
    expression,
    awaitPromise: options.awaitPromise ?? true,
    returnByValue: options.returnByValue ?? true,
    userGesture: options.userGesture ?? false,
  }, options.timeoutMs ?? 20_000)
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description
      ?? result.exceptionDetails.text
      ?? 'Browser evaluation failed.'
    throw new Error(description)
  }
  return result.result?.value
}
