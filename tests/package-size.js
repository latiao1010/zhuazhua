// 主包体积检查。
//
// 本项目将主包预算控制在 1.5MB。这个项目本地带着离线知识库和演示图，很容易
// 无声无息地涨过线 —— 曾经到过 3.58MB，直到上传时才报错。所以在测试里守住。
//
// 计算规则和工具一致：miniprogramRoot 下的全部文件，减去 packOptions.ignore
// 里排除的目录和文件，并按 app.json 中的分包单独统计。

const fs = require('fs')
const path = require('path')
const assert = require('assert')

const ROOT = path.join(__dirname, '..')
const LIMIT = 1.5 * 1024 * 1024
// 留出余量，逼近上限时先报警而不是等上传失败
const WARN_AT = 1.35 * 1024 * 1024
const SKIP_DIRS = new Set(['.git', 'node_modules', 'miniprogram_npm'])

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'))
const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
const subpackages = app.subPackages || app.subpackages || []
const ignore = (config.packOptions && config.packOptions.ignore) || []
const ignoredFiles = new Set(ignore.filter(item => item.type === 'file').map(item => item.value))
const ignoredDirs = new Set(ignore.filter(item => item.type === 'folder').map(item => item.value.replace(/\/$/, '')))

function walk(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || ignoredDirs.has(rel)) return []
      return walk(path.join(dir, entry.name), rel)
    }
    if (ignoredFiles.has(rel) || entry.name === '.DS_Store') return []
    return [{ path: rel, size: fs.statSync(path.join(dir, entry.name)).size }]
  })
}

const allFiles = walk(ROOT).sort((a, b) => b.size - a.size)
const inPackage = (file, root) => file.path.startsWith(root.replace(/\/$/, '') + '/')
const files = allFiles.filter(file => !subpackages.some(pack => inPackage(file, pack.root)))
const total = files.reduce((sum, file) => sum + file.size, 0)
const mb = value => (value / 1048576).toFixed(2)

console.log(`主包 ${mb(total)} MB / 1.5 MB（${files.length} 个文件）`)
console.log('最大的 5 个：')
files.slice(0, 5).forEach(file => console.log(`  ${(file.size / 1024).toFixed(1).padStart(8)} KB  ${file.path}`))

if (total >= WARN_AT && total < LIMIT) {
  console.log(`\n⚠️  已用 ${mb(total)} MB，距上限不足 ${((LIMIT - total) / 1024).toFixed(0)} KB`)
}
assert.ok(total < LIMIT, `主包 ${mb(total)} MB 超过本项目 1.5 MB 预算`)
for (const pack of subpackages) {
  const bytes = allFiles.filter(file => inPackage(file, pack.root)).reduce((sum, file) => sum + file.size, 0)
  console.log(`分包 ${pack.root}: ${mb(bytes)} MB`)
  assert.ok(bytes < 2 * 1024 * 1024, `${pack.root} 分包超过 2 MB`)
}
console.log(`\n✓ 通过，余 ${((LIMIT - total) / 1024).toFixed(0)} KB`)
