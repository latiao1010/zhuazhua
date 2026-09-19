const assert = require('assert')
const fs = require('fs')
const vm = require('vm')
const path = require('path')
const root = path.resolve(__dirname, '..')
const copy = value => value == null ? value : JSON.parse(JSON.stringify(value))
function load(file, deps = {}, extra = {}) {
  const module = { exports:{} }
  vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'), { module, exports:module.exports, require: name => deps[name] || require(name), console, Date, Math, Set, Map, Promise, ...extra }, { filename:file })
  return module.exports
}
async function main() {
  const disk = {}
  const wx = { getStorageSync:key=>copy(disk[key]), setStorageSync:(key,value)=>{ disk[key]=copy(value) } }
  const store = load('utils/store.js', {}, { wx })
  store.ensureSeedData()
  for (const key of ['feeds','waters','stools','walks','careRecords','weightRecords','growthPhotos','chats']) assert.strictEqual(store.get(key).length,0,key)
  assert.strictEqual(store.get('pet').birthday,'')
  assert.strictEqual(store.get('care').medicine,'')
  await store.set('feeds',[{ id:1,dayKey:store.todayKey(),amount:'30g' }],{ skipCloud:true })
  store.setDemoMode(true)
  assert.ok(store.get('feeds').length > 600)
  assert.strictEqual(disk.paw_feeds.length,1)
  store.setDemoMode(false)
  assert.strictEqual(store.get('feeds').length,1)
  console.log('✓ 正式新用户为空记录，演示切换不污染正式档案')

  let available = false, fail = false
  const calls = []
  const cloud = { isAvailable:()=>available, callFunction:async(name,data)=>{ calls.push(copy(data)); if(fail) throw new Error('offline'); return { ok:true, data:{} } } }
  const local = {}
  const sync = load('utils/cloud-data.js', { './cloud':cloud,'./store':{ isDemoMode:()=>false, get:key=>local[key], set:(key,value)=>{ local[key]=value } } }, { wx })
  await sync.saveKey('waters',[{ id:1,amount:'100ml' }])
  assert.strictEqual(sync.getSyncStatus().pending,1)
  available = true; fail = true
  assert.strictEqual((await sync.retryPending()).ok,false)
  assert.strictEqual(sync.getSyncStatus().pending,1)
  fail = false
  await sync.retryPending()
  assert.strictEqual(sync.getSyncStatus().pending,0)
  assert.strictEqual(calls[calls.length-1].action,'mutateDataRecord')
  assert.strictEqual(calls[calls.length-1].record.amount,'100ml')
  console.log('✓ 离线保存持久排队，失败保留，重试成功后清除')

  let releaseRead
  cloud.callFunction = (name,data) => data.action === 'getAllData' ? new Promise(resolve=>{ releaseRead=resolve }) : Promise.resolve({ok:true})
  const reading = sync.syncAll()
  while(!releaseRead) await Promise.resolve()
  local.waters=[{id:2,amount:'200ml'}]
  await sync.saveKey('waters',local.waters)
  releaseRead({ok:true,data:{waters:[{id:1,amount:'100ml'}]}})
  await reading
  assert.strictEqual(local.waters[0].id,2)
  console.log('✓ 读取期间新保存的记录不会被迟到的云端结果覆盖')

  cloud.callFunction = async(name,data) => data.action === 'getAllData'
    ? { ok:true, data:{ waters:[{ id:3,amount:'300ml',recordedByName:'妈妈',recordedByRole:'admin',_syncUpdatedAt:10 }] }, share:{ shared:true,role:'owner' } }
    : { ok:true }
  const preview = await sync.previewRemoteChanges()
  assert.strictEqual(preview.changes[0].actor,'妈妈')
  assert.strictEqual(local.waters[0].id,2)
  console.log('✓ 同步前预览共享修改，不会提前覆盖主人本地记录')
  disk.paw_pending_sync_v1={}
  const appliedPreview=await sync.applyRemoteChanges([preview.changes[0]])
  assert.strictEqual(appliedPreview.applied,1)
  assert.strictEqual(local.waters[0].id,3)
  console.log('✓ 主人可以逐条选择并应用共享修改')

  disk.paw_share_status={shared:true,role:'owner',groupId:'group-1'}
  let ownerPulled=false
  cloud.callFunction=async(name,data)=>{ if(data.action==='getAllData') ownerPulled=true; return {ok:true,data:{}} }
  await sync.syncOnResume()
  assert.strictEqual(ownerPulled,false)
  console.log('✓ 主人回到前台不会绕过确认自动覆盖共享修改')

  available=false
  await sync.saveKey('feeds',[{id:2}])
  const invitation=await sync.acceptShareInvitation('code')
  assert.strictEqual(invitation.ok,false)
  console.log('✓ 存在待同步记录时阻止切换共享档案')

  const report = load('utils/visit-summary.js', {'./store':store})
  const today=store.todayKey()
  const text=report.buildSummary(today,today)
  assert.ok(text.includes('30g'))
  assert.ok(text.includes('饮水（0条）'))
  assert.throws(()=>report.buildSummary('2099-01-01',today))
  store.setDemoMode(true)
  assert.ok(report.buildSummary(today,today).startsWith('【演示数据'))
  console.log('✓ 摘要只汇总所选日期记录，并明确空记录和演示数据')

  const reminder = load('cloudfunctions/pet-data/care-reminders.js', {}, {process:{env:{}}})
  assert.strictEqual(reminder.configuration().ready,false)
  const configured = load('cloudfunctions/pet-data/care-reminders.js',{}, {process:{env:{ CARE_REMINDER_TEMPLATE_ID:'test', CARE_REMINDER_FIELDS:'{"label":"thing1","date":"time2"}' }}})
  assert.strictEqual(configured.configuration().ready,true)
  console.log('✓ 无模板配置不会将通知误报为可用')
}
main().catch(error=>{ console.error(error);process.exitCode=1 })
