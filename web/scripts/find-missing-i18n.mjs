// Reports t() keys used by a set of source files that are missing from the
// locale files. Run from web/ so the relative paths resolve.
import fs from 'node:fs'

const files = process.argv.slice(2)
const texts = new Set()
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8')
  for (const match of source.matchAll(/\bt\(\s*'([^']+)'/g)) {
    texts.add(match[1])
  }
}
const en = JSON.parse(
  fs.readFileSync('src/i18n/locales/en.json', 'utf8')
).translation
const missing = [...texts].filter((key) => !(key in en)).sort()
console.log('used:', texts.size, 'missing:', missing.length)
for (const key of missing) console.log(key)
