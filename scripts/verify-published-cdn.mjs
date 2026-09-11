const version = process.argv[2] || '0.5.0'
const root = `https://cdn.jsdelivr.net/npm/@blcklab/anyo-player@${version}`
const required = ['package.json', 'dist/index.js', 'dist/element.js', 'dist/element-define.js', 'dist/vue.js', 'dist/react.js', 'dist/styles.css']
const evidence = []
for (const path of required) {
  const url = `${root}/${path}`
  const response = await fetch(url, { redirect: 'follow' })
  evidence.push({ path, url, status: response.status, contentType: response.headers.get('content-type'), bytes: response.ok ? (await response.arrayBuffer()).byteLength : 0 })
}
const failed = evidence.filter(item => item.status !== 200 || item.bytes === 0)
console.log(JSON.stringify({ format: '@blcklab/anyo-player/published-cdn-check', packageVersion: version, createdAt: new Date().toISOString(), evidence }, null, 2))
if (failed.length) throw new Error(`Published CDN verification failed for ${failed.map(item => item.path).join(', ')}. Publish ${version} before running V10.`)
