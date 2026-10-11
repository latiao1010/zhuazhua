// Regenerate with Node.js and sharp available on NODE_PATH.
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const icons = {
  home: '<path d="M3.5 10 12 3l8.5 7M5.5 8.5v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-11M9.5 20.5v-7h5v7"/>',
  records: '<rect x="5" y="3.5" width="15" height="17" rx="3"/><path d="M3 8h4M3 16h4M10.5 8.5H16M10.5 12H16M10.5 15.5H14"/>',
  account: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2c0-3.5 3.5-5.5 8-5.5s8 2 8 5.5v2"/>'
}
const output = path.resolve(__dirname, '../../assets/tabbar')
fs.mkdirSync(output, { recursive: true })

async function main() {
  for (const [name, shape] of Object.entries(icons)) {
    for (const selected of [false, true]) {
      const color = selected ? '#52785e' : '#819087'
      const tint = selected ? '<rect x="1" y="1" width="22" height="22" rx="7" fill="#edf4ee"/>' : ''
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="81" height="81" viewBox="0 0 24 24">' + tint + '<g fill="none" stroke="' + color + '" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' + shape + '</g></svg>'
      await sharp(Buffer.from(svg)).png().toFile(path.join(output, name + (selected ? '-selected' : '') + '.png'))
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
