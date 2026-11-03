// sync-i18n.mjs obfuscates one attribution key so stray search-and-replace
// passes over the repo do not rewrite it. A JSON round-trip undoes that, so
// re-apply it after any programmatic locale edit.
import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES = path.resolve('src/i18n/locales')
const RUNTIME = ['footer', 'new' + 'api', 'projectAttributionSuffix'].join('.')
const SERIALIZED = 'footer.new\\u0061pi.projectAttributionSuffix'

for (const name of await fs.readdir(LOCALES)) {
  if (!name.endsWith('.json')) continue
  const file = path.join(LOCALES, name)
  const raw = await fs.readFile(file, 'utf8')
  if (!raw.includes(`"${RUNTIME}":`)) {
    console.log(`${name}: ok (nothing to do)`)
    continue
  }
  const fixed = raw.replaceAll(`"${RUNTIME}":`, `"${SERIALIZED}":`)
  await fs.writeFile(file, fixed, 'utf8')
  console.log(`${name}: restored obfuscated key`)
}
