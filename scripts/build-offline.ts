/**
 * Builds a single self-contained index.html that runs straight off disk.
 *
 * Browsers refuse to load ES modules over file:// (opaque origin -> CORS
 * failure -> blank page), so the normal code-split, module-based build cannot
 * be opened by double-clicking. This produces one classic script with the CSS
 * and JS inlined, leaving no code for the browser to fetch at all.
 *
 * Audio stays external, so keep the audio/ folder next to the html file.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './lib/compile.ts'

const OUT = join(ROOT, 'dist-offline')

// Always start clean; a half-inlined index.html from a previous run would be
// rebuilt over and produce duplicate script tags.
rmSync(OUT, { recursive: true, force: true })

execFileSync('npx', ['vite', 'build'], {
  cwd: ROOT,
  env: { ...process.env, VERBA_OFFLINE: '1' },
  stdio: 'inherit',
})

const htmlPath = join(OUT, 'index.html')
const jsPath = join(OUT, 'app.js')
const cssPath = join(OUT, 'app.css')

let html = readFileSync(htmlPath, 'utf8')

// A literal </script> inside the bundle would close the tag early.
const guard = (s: string) => s.replace(/<\/script/gi, '<\\/script')

if (existsSync(cssPath)) {
  const css = readFileSync(cssPath, 'utf8')
  // Replacer *function*, not a string: in a string replacement `$&`, `$1` and
  // `` $` `` are substitution patterns, and bundles are full of them inside
  // their own .replace() calls — a string replacement silently corrupts them.
  html = html.replace(/<link[^>]*rel="stylesheet"[^>]*>/i, () => `<style>\n${css}\n</style>`)
  rmSync(cssPath)
}

if (existsSync(jsPath)) {
  const js = readFileSync(jsPath, 'utf8')
  // Keep type="module": the code is ES modules, and an inline module runs
  // without any network fetch.
  html = html.replace(
    /<script[^>]*src="[^"]*app\.js"[^>]*><\/script>/i,
    () => `<script type="module">\n${guard(js)}\n</script>`
  )
  rmSync(jsPath)
}

writeFileSync(htmlPath, html)

// Verify nothing is left for the browser to fetch. Only look at real tags —
// scanning raw src="..." would match strings inside the inlined bundle itself.
const leftovers = [
  ...html.matchAll(/<script[^>]+src="([^"]+)"/gi),
  ...html.matchAll(/<link[^>]+href="([^"]+)"/gi),
].map((m) => m[1])

const kb = (n: number) => `${Math.round(n / 1024)} KB`
console.log(`\noffline build -> ${htmlPath.slice(ROOT.length + 1)}  ${kb(Buffer.byteLength(html))}`)
console.log(leftovers.length
  ? `  WARNING: still references ${leftovers.join(', ')}`
  : `  self-contained: no external css/js to fetch`)
console.log(`\nOpen it directly:\n  open dist-offline/index.html\n`)
