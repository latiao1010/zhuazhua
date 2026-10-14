const assert = require('node:assert/strict')
const { runtime, clone, NOW } = require('./helpers/analytics-runtime')
const { database } = require('./helpers/pet-data-db')
const cases = []
const test = (name, run) => cases.push([name, run])
const tick = () => new Promise(resolve => setImmediate(resolve))
function fixture() {
  const db = database()
  db.tables.pet_share_groups = [{ _id:'family-a', ownerOpenid:'a', petName:'团团', status:'active' }]
  db.tables.pet_share_members = [{ _id:'member-a', groupId:'family-a', memberOpenid:'a', ownerOpenid:'a', role:'owner', name:'甲', status:'active', updatedAt:NOW }]
  db.tables.pet_share_invites = [{ _id:'invite-a', code:'ZZ-FAMILY-A', groupId:'family-a', ownerOpenid:'a', status:'active', expiresAt:NOW+86400000 }]
  db.tables.pet_data = [
    { _id:'pet-a', _openid:'a', scopeId:'group:family-a', groupId:'family-a', key:'pet', value:{ name:'团团', weight:10 } },
    { _id:'pet-b', _openid:'b', scopeId:'user:b', key:'pet', value:{ name:'豆豆', weight:4 } },
    { _id:'waters-b', _openid:'b', scopeId:'user:b', key:'waters', value:[{ id:'same-id', amount:'20ml', note:'豆豆自己的记录' }] },
    { _id:'waters-a', _openid:'a', scopeId:'group:family-a', groupId:'family-a', key:'waters', value:[{ id:'same-id', amount:'80ml', note:'团团的记录' }] }
  ]
  const servers = new Map()
  function server(user) {
    if (!servers.has(user)) { const r=runtime({db}); r.context.OPENID=user; servers.set(user,r.load('cloudfunctions/pet-data/index.js').main) }
    return servers.get(user)
  }
  const call = (user, action, more={}) => server(user)({ action, petScope:'personal', ...more })
  return { db, call }
}
function client(f, user='b', disk={}) {
  const r=runtime()
  Object.assign(r.disk,clone(disk))
  const requests=[], state={ offline:false, before:null }
  r.wx.cloud.callFunction=async ({data}) => {
    requests.push(clone(data))
    if (state.offline) throw new Error('offline')
    if (state.before) await state.before(data)
    return { result:await f.call(user,data.action,data) }
  }
  const context=r.load('utils/pet-context.js'), store=r.load('utils/store.js'), sync=r.load('utils/cloud-data.js')
  store.ensureSeedData()
  return {r,requests,state,context,store,sync}
}
async function join(f,user='b') { const result=await f.call(user,'acceptShareInvitation',{code:'ZZ-FAMILY-A'}); assert.equal(result.ok,true,result.error); return result }
async function read(f,user,scope='personal') { const result=await f.call(user,'getAllData',{petScope:scope}); assert.equal(result.ok,true,result.error); return result }

test('第二账号先有豆豆，加入团团后两个云端档案都保留',async()=>{
  const f=fixture(); await join(f)
  const result=await f.call('b','getPetProfiles')
  assert.deepEqual(clone(result.profiles.map(p=>[p.id,p.name,p.kind])),[['personal','豆豆','own'],['family-a','团团','shared']])
  assert.equal((await read(f,'b')).data.pet.name,'豆豆')
  assert.equal((await read(f,'b','family-a')).data.pet.name,'团团')
})
test('旧共享缺完整档案时，使用共享名称且不补写云端档案',async()=>{
  const f=fixture(); f.db.tables.pet_data=f.db.tables.pet_data.filter(p=>p._id!=='pet-a'); await join(f)
  const writes=f.db.writes.length
  const list=await f.call('b','getPetProfiles'), shared=list.profiles.find(p=>p.id==='family-a')
  assert.equal(shared.name,'团团'); assert.equal(shared.configured,false)
  assert.equal((await read(f,'b','family-a')).share.petName,'团团')
  assert.equal((await read(f,'b','family-a')).data.pet,undefined)
  assert.equal(f.db.writes.length,writes)
  const c=client(f); await c.sync.syncAll(); await c.sync.switchPet('family-a')
  assert.equal(c.store.get('pet').name,'团团')
  await c.sync.switchPet('personal'); assert.equal(c.store.get('pet').name,'豆豆')
  assert.equal(f.db.tables.pet_data.some(p=>p.key==='pet'&&p.scopeId==='group:family-a'),false)
})
test('旧共享名称不会覆盖当前宠物已有的完整本机资料',async()=>{
  const f=fixture(); f.db.tables.pet_data=f.db.tables.pet_data.filter(p=>p._id!=='pet-a'); await join(f)
  const c=client(f); c.context.select('family-a'); c.store.ensureSeedData()
  await c.store.set('pet',{...c.store.get('pet'),name:'团团的新昵称',weight:9,birthday:'2022-03-01'},{skipCloud:true})
  await c.sync.syncAll()
  assert.equal(c.store.get('pet').name,'团团的新昵称'); assert.equal(c.store.get('pet').weight,9)
  assert.equal(c.store.get('pet').birthday,'2022-03-01')
  assert.equal(c.sync.getSyncStatus().pending,0)
})
test('未同步的占位昵称编辑也不会被共享名称覆盖',async()=>{
  const f=fixture(); f.db.tables.pet_data=f.db.tables.pet_data.filter(p=>p._id!=='pet-a'); await join(f)
  const c=client(f); await c.sync.syncAll(); await c.sync.switchPet('family-a')
  c.state.offline=true
  await c.store.set('pet',{...c.store.get('pet'),name:'我的宠物'})
  c.state.offline=false
  await c.sync.switchPet('personal'); await c.sync.switchPet('family-a')
  assert.equal(c.store.get('pet').name,'我的宠物')
  assert.ok(c.sync.getSyncStatus().pending>0)
})
test('列表中的占位缓存不遮住云端共享名称，真实本机昵称保留',async()=>{
  const f=fixture(); f.db.tables.pet_data=f.db.tables.pet_data.filter(p=>p._id!=='pet-a'); await join(f)
  const c=client(f,'a'); c.r.load('pages/pets/pets.js')
  const p={...c.r.page,data:clone(c.r.page.data),setData(values){Object.assign(this.data,clone(values))}}
  await p.loadPets(); assert.equal(p.data.profiles[0].name,'团团')
  await c.store.set('pet',{...c.store.get('pet'),name:'本机的新名字'},{skipCloud:true})
  await p.loadPets(); assert.equal(p.data.profiles[0].name,'本机的新名字')
})
test('自己的宠物已分享给别人时，加入另一家庭仍保留自己的主人身份',async()=>{
  const f=fixture(); const invite=await f.call('b','createShareInvitation',{petName:'豆豆'})
  assert.equal(invite.ok,true,invite.error); await join(f)
  const own=await read(f,'b'), shared=await read(f,'b','family-a')
  assert.equal(own.data.pet.name,'豆豆'); assert.equal(own.share.role,'owner')
  assert.equal(shared.share.role,'admin'); assert.notEqual(own.share.groupId,shared.share.groupId)
})
test('自己的记录与共享记录即使 ID 相同，修改和删除也相互独立',async()=>{
  const f=fixture(); await join(f)
  await f.call('b','mutateDataRecord',{key:'waters',operation:'update',recordId:'same-id',record:{id:'same-id',amount:'30ml'}})
  assert.equal((await read(f,'b')).data.waters[0].amount,'30ml')
  assert.equal((await read(f,'a')).data.waters[0].amount,'80ml')
  await f.call('b','mutateDataRecord',{key:'waters',operation:'delete',recordId:'same-id'})
  assert.equal((await read(f,'b')).data.waters.length,0)
  assert.equal((await read(f,'a')).data.waters.length,1)
})
test('共同照护新增的共享记录只出现在团团里',async()=>{
  const f=fixture(); await join(f)
  assert.equal((await f.call('b','mutateDataRecord',{petScope:'family-a',key:'waters',operation:'upsert',recordId:'shared-new',record:{id:'shared-new',amount:'15ml'}})).ok,true)
  assert.equal((await read(f,'a')).data.waters.some(r=>r.id==='shared-new'),true)
  assert.equal((await read(f,'b')).data.waters.some(r=>r.id==='shared-new'),false)
})
test('只读共享权限不影响修改自己的宠物，不能伪造身份提权',async()=>{
  const f=fixture(); await join(f)
  f.db.tables.pet_share_members.find(m=>m.memberOpenid==='b').role='viewer'
  assert.equal((await f.call('b','setDataItem',{petScope:'family-a',key:'pet',value:{name:'冒充'},role:'owner',openid:'a'})).ok,false)
  assert.equal((await f.call('b','setDataItem',{key:'pet',value:{name:'豆豆更新'}})).ok,true)
  assert.equal((await read(f,'a')).data.pet.name,'团团')
})
test('陌生人或被移除成员不能用 groupId 读取、写入或操作照片',async()=>{
  const f=fixture(); await join(f)
  f.db.tables.pet_share_members.find(m=>m.memberOpenid==='b').status='removed'
  for (const user of ['b','stranger']) for (const action of ['getAllData','setDataItem','listGrowthPhotos','addGrowthPhotos','deleteGrowthPhoto','mutateDataRecord']) {
    const result=await f.call(user,action,{petScope:'family-a',key:'pet',value:{},photos:[],recordId:'x'})
    assert.equal(result.ok,false,`${user}:${action}`)
  }
  assert.equal((await read(f,'b')).data.pet.name,'豆豆')
})
test('私人数据查询不会混入本人替共享宠物写的数据或照片',async()=>{
  const f=fixture(); await join(f)
  await f.call('b','setDataItem',{petScope:'family-a',key:'waterGoal',value:900})
  f.db.tables.growth_photos=[{_id:'own-photo',_openid:'b',scopeId:'user:b',path:'own.jpg'},{_id:'shared-photo',_openid:'b',scopeId:'group:family-a',groupId:'family-a',path:'shared.jpg'}]
  assert.equal((await read(f,'b')).data.waterGoal,undefined)
  const photos=await f.call('b','listGrowthPhotos')
  assert.deepEqual(clone(photos.photos.map(p=>p.id)),['own-photo'])
  await f.call('b','deleteGrowthPhoto',{id:'shared-photo',path:'shared.jpg'})
  assert.equal(f.db.tables.growth_photos.some(p=>p._id==='shared-photo'),true)
})
test('第一次分享自己的宠物会完整带上私人记录修改、删除及相册',async()=>{
  const f=fixture()
  await f.call('b','mutateDataRecord',{key:'waters',operation:'delete',recordId:'same-id'})
  await f.call('b','mutateDataRecord',{key:'waters',operation:'upsert',recordId:'new-own',record:{id:'new-own',amount:'42ml'}})
  f.db.tables.growth_photos=[{_id:'own-photo',_openid:'b',scopeId:'user:b',path:'own.jpg'}]
  const invite=await f.call('b','createShareInvitation',{petName:'豆豆'})
  assert.equal(invite.ok,true,invite.error)
  const own=await read(f,'b')
  assert.equal(own.data.waters.length,1); assert.equal(own.data.waters[0].id,'new-own')
  assert.equal((await f.call('b','listGrowthPhotos')).photos[0].id,'own-photo')
})
test('重复加入保留既有只读角色、自定义名字且不重复列出宠物',async()=>{
  const f=fixture(); await join(f)
  const member=f.db.tables.pet_share_members.find(m=>m.memberOpenid==='b')
  Object.assign(member,{role:'viewer',name:'豆豆家长'})
  const result=await f.call('b','acceptShareInvitation',{code:'ZZ-FAMILY-A',profile:{name:'覆盖',role:'owner'}})
  assert.equal(result.alreadyJoined,true); assert.equal(member.role,'viewer'); assert.equal(member.name,'豆豆家长')
  assert.equal(result.profiles.length,2)
})
test('客户端完整流程：自己有宠物→加入→查看共享→切回，数据和权限正确',async()=>{
  const f=fixture(),c=client(f)
  assert.equal((await c.sync.syncAll()).ok,true)
  assert.equal(c.store.get('pet').name,'豆豆')
  assert.equal((await c.sync.acceptShareInvitation('ZZ-FAMILY-A')).ok,true)
  assert.equal(c.context.current(),'personal'); assert.equal(c.store.get('pet').name,'豆豆')
  assert.equal((await c.sync.switchPet('family-a')).ok,true)
  assert.equal(c.store.get('pet').name,'团团'); assert.equal(c.sync.getShareStatus().role,'admin')
  assert.equal(c.store.get('waters')[0].amount,'80ml')
  assert.equal((await c.sync.switchPet('personal')).ok,true)
  assert.equal(c.store.get('pet').name,'豆豆'); assert.equal(c.sync.getShareStatus().shared,false)
  assert.equal(c.store.get('waters')[0].amount,'20ml')
})
test('尚无自有宠物的账号，加入后仍可建立自己的独立档案',async()=>{
  const f=fixture(),c=client(f,'new-user')
  await c.sync.syncAll(); await c.sync.acceptShareInvitation('ZZ-FAMILY-A')
  assert.equal(c.store.get('pet').name,'我的宠物')
  await c.store.set('pet',{...c.store.get('pet'),name:'新宠物'})
  await c.sync.switchPet('family-a'); assert.equal(c.store.get('pet').name,'团团')
  await c.sync.switchPet('personal'); assert.equal(c.store.get('pet').name,'新宠物')
  assert.equal((await read(f,'a')).data.pet.name,'团团')
})
test('原宠物离线修改在切换中保留，恢复后只传回原宠物',async()=>{
  const f=fixture(),c=client(f); await c.sync.syncAll(); await c.sync.acceptShareInvitation('ZZ-FAMILY-A')
  c.state.offline=true
  await c.store.set('waters',[{id:'offline',amount:'55ml'}])
  assert.equal(c.sync.getSyncStatus().pending>0,true)
  c.state.offline=false; await c.sync.switchPet('family-a')
  assert.equal(c.sync.getSyncStatus().pending,0)
  await c.sync.switchPet('personal')
  assert.equal(c.store.get('waters')[0].amount,'55ml')
  assert.equal((await c.sync.retryPending()).ok,true)
  assert.equal((await read(f,'b')).data.waters[0].amount,'55ml')
  assert.equal((await read(f,'a')).data.waters.some(r=>r.id==='offline'),false)
})
test('旧版共享缓存和队列迁到共享空间，自己的云端宠物重新恢复',async()=>{
  const f=fixture(); await join(f)
  const disk={paw_share_status:{shared:true,role:'admin',groupId:'family-a'},paw_pet:{name:'团团'},paw_water_records:[{id:'old',amount:'19ml'}],paw_pending_sync_v1:{old:{type:'record',key:'waters',operation:'upsert',recordId:'old',record:{id:'old',amount:'19ml'},scope:'family-a',version:'old-1'}}}
  const c=client(f,'b',disk)
  assert.equal(c.context.current(),'personal'); await c.sync.syncAll()
  assert.equal(c.store.get('pet').name,'豆豆')
  assert.equal(c.r.disk.paw_pet.name,'团团','原始迁移备份保留')
  await c.sync.switchPet('family-a'); assert.equal(c.store.get('waters')[0].id,'old')
  await c.sync.retryPending()
  assert.equal((await read(f,'a')).data.waters.some(r=>r.id==='old'),true)
  assert.equal((await read(f,'b')).data.waters.some(r=>r.id==='old'),false)
})
test('旧云函数未支持多宠物时，写操作在能力预检阶段阻止',async()=>{
  const f=fixture(),c=client(f)
  const calls=[]; c.r.wx.cloud.callFunction=async ({data})=>{calls.push(data.action);return {result:{ok:true,data:{pet:{name:'错误宠物'}}}}}
  const result=await c.store.set('pet',{name:'豆豆本机'})
  assert.equal(result.ok,false); assert.deepEqual(calls,['getPetProfiles'])
  assert.equal(c.store.get('pet').name,'豆豆本机'); assert.equal(c.sync.getSyncStatus().pending,1)
})
test('目标权限不足或云请求失败时保持原宠物及记录',async()=>{
  const f=fixture(),c=client(f); await c.sync.syncAll()
  assert.equal((await c.sync.switchPet('family-a')).ok,false)
  assert.equal(c.context.current(),'personal'); assert.equal(c.store.get('pet').name,'豆豆')
})
test('迟到的旧宠物云响应不能覆盖切换后的档案',async()=>{
  const f=fixture(),c=client(f); await c.sync.syncAll()
  let release; c.state.before=data=>data.action==='getAllData'?new Promise(resolve=>{release=resolve}):null
  const syncing=c.sync.syncAll(); await tick()
  c.context.select('family-a'); c.store.ensureSeedData()
  await c.store.set('pet',{name:'当前共享本机'},{skipCloud:true})
  release(); assert.equal((await syncing).ok,false)
  assert.equal(c.store.get('pet').name,'当前共享本机')
})
test('切换写入本机失败时恢复原宠物，避免页面与保存范围错位',async()=>{
  const f=fixture(),c=client(f); await c.sync.syncAll(); await c.sync.acceptShareInvitation('ZZ-FAMILY-A')
  const save=c.r.wx.setStorageSync
  c.r.wx.setStorageSync=(key,value)=>{if(key.startsWith('paw_pet_space:family-a:'))throw new Error('storage full');save(key,value)}
  assert.equal((await c.sync.switchPet('family-a')).ok,false)
  assert.equal(c.context.current(),'personal'); assert.equal(c.store.get('pet').name,'豆豆')
})

;(async()=>{
  let passed=0
  for(const [name,run] of cases){try{await run();passed++;console.log('✓ '+name)}catch(error){process.exitCode=1;console.error('✗ '+name,error)}}
  console.log(`多宠物隔离 ${passed}/${cases.length} 通过（模拟两个账号，不替代真实手机验收）`)
})()
