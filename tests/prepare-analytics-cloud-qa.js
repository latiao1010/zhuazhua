// 生成独立联调部署包；业务模块与正式源文件一致，仅使用专用集合。
// 生成本地文件不会部署、联网或写入云数据库。
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const root = path.resolve(__dirname, '..'), source = path.join(root, 'cloudfunctions/pet-analytics')
const destination = path.join(root, '.codex-temp/pet-analytics-qa')
const collection = 'pet_usage_qa_20261010_v32', expiresAt = Date.now() + 7 * 86400000
fs.mkdirSync(destination, { recursive: true })
const hashes = {}
for (const name of fs.readdirSync(source)) {
  if (!/\.(js|json)$/.test(name) || ['config.json', 'package.json'].includes(name)) continue
  let content = fs.readFileSync(path.join(source, name), 'utf8')
  hashes[name] = crypto.createHash('sha256').update(content).digest('hex')
  if (name === 'index.js') content = content.replace("const COLLECTION = 'pet_usage_events_v1'", `const COLLECTION = '${collection}'`)
  fs.writeFileSync(path.join(destination, name === 'index.js' ? 'core.js' : name), content)
}
const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json')))
fs.writeFileSync(path.join(destination, 'package.json'), JSON.stringify({ ...pkg, name: 'pet-analytics-qa' }, null, 2))
fs.writeFileSync(path.join(destination, 'config.json'), JSON.stringify({ permissions: { openapi: [] } }, null, 2))
fs.writeFileSync(path.join(destination, 'index.js'), `const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const admins = require('./admins.json')
const core = require('./core')
const actions = new Set(['status', 'collect', 'summary', 'operations', 'delivery_summary', 'feedback_submit', 'feedback_mine', 'feedback_list', 'feedback_update', 'release_list', 'release_save'])
exports.main = async event => {
  const c = cloud.getWXContext(), uid = crypto.createHash('sha256').update(c.APPID + ':' + c.OPENID).digest('hex')
  if (!c.OPENID || !c.APPID || !admins.includes(uid) || Date.now() > ${expiresAt} || !actions.has(event && event.action)) return { ok: false, error: 'forbidden' }
  return core.main(event)
}
`)
fs.writeFileSync(path.join(destination, 'qa-manifest.json'), JSON.stringify({ collection, expiresAt, hashes }, null, 2))
console.log(JSON.stringify({ path: destination, collection, expiresAt, timer: false }))
