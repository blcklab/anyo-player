import test from 'node:test'
import assert from 'node:assert/strict'
import { VfxController } from '../dist/internal/VfxController.js'

test('Player VFX controller forwards pause and resume without owning simulation', () => {
  const calls=[];const controller=new VfxController();const unregister=controller.register({onPause(){calls.push('pause')},onResume(){calls.push('resume')}});controller.pause();controller.resume();assert.deepEqual(calls,['pause','resume']);unregister();controller.pause();assert.deepEqual(calls,['pause','resume'])
})
test('Player VFX controller validates targets and clears them on dispose',()=>{const controller=new VfxController();assert.throws(()=>controller.register({}),TypeError);controller.register({onPause(){}});controller.dispose();assert.equal(controller.size,0);assert.throws(()=>controller.register({onPause(){}}),/disposed/)})
