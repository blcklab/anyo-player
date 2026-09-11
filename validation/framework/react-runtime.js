const version = globalThis.__FRAMEWORK_VERSION__ || '19.2.8'
const result = document.querySelector('#result')
const world = id => ({ version: '0.6', entities: [{ id, type: 'box', position: [0, 1, -3] }], exploration: { pointerLock: false } })
const waitFor = async predicate => { for (let index = 0; index < 200; index += 1) { const value = predicate(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 20)) } throw new Error('React runtime condition timed out.') }
try {
  const [{ createElement, StrictMode, createRef }, { createRoot }, { AnyoPlayer }] = await Promise.all([import('react'), import('react-dom/client'), import('@blcklab/anyo-player/react')])
  const component = createRef()
  const root = createRoot(document.querySelector('#app'))
  const options = { renderer: { backend: 'webgl2' }, exploration: { desktop: false, touch: false }, ui: false }
  root.render(createElement(StrictMode, null, createElement(AnyoPlayer, { ref: component, source: world('react-first'), options })))
  await waitFor(() => component.current?.load)
  await component.current.load()
  root.render(createElement(StrictMode, null, createElement(AnyoPlayer, { ref: component, source: world('react-second'), options })))
  await waitFor(() => component.current?.player?.state === 'ready')
  const ready = component.current.player?.state === 'ready'
  root.unmount()
  await new Promise(resolve => setTimeout(resolve, 80))
  const clean = document.querySelectorAll('canvas').length === 0
  if (!ready || !clean) throw new Error(`ready=${ready}; clean=${clean}`)
  document.documentElement.dataset.framework = 'pass'
  result.textContent = JSON.stringify({ framework: 'react', version, ready, clean, strictMode: true })
} catch (error) {
  document.documentElement.dataset.framework = 'fail'
  result.textContent = error?.stack || String(error)
}
