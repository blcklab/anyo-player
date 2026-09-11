const version = globalThis.__FRAMEWORK_VERSION__ || '3.5.40'
/* Static import map is declared by the versioned HTML fixture. */
const map = null
const result = document.querySelector('#result')
const world = id => ({ version: '0.6', entities: [{ id, type: 'box', position: [0, 1, -3] }], exploration: { pointerLock: false } })
const waitFor = async predicate => { for (let index = 0; index < 200; index += 1) { const value = predicate(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 20)) } throw new Error('Vue runtime condition timed out.') }
try {
  const [{ createApp, h, nextTick, ref }, { AnyoPlayer }] = await Promise.all([import('vue'), import('@blcklab/anyo-player/vue')])
  const source = ref(world('vue-first'))
  const component = ref(null)
  const app = createApp({
    setup() { return () => h(AnyoPlayer, { ref: component, source: source.value, options: { renderer: { backend: 'webgl2' }, exploration: { desktop: false, touch: false }, ui: false } }) }
  })
  app.mount('#app')
  await nextTick()
  await waitFor(() => component.value?.load)
  await component.value.load()
  source.value = world('vue-second')
  await nextTick()
  await waitFor(() => component.value?.player?.state === 'ready')
  const ready = component.value.player?.state === 'ready'
  app.unmount()
  await new Promise(resolve => setTimeout(resolve, 40))
  const clean = document.querySelectorAll('canvas').length === 0
  if (!ready || !clean) throw new Error(`ready=${ready}; clean=${clean}`)
  document.documentElement.dataset.framework = 'pass'
  result.textContent = JSON.stringify({ framework: 'vue', version, ready, clean })
} catch (error) {
  document.documentElement.dataset.framework = 'fail'
  result.textContent = error?.stack || String(error)
}
