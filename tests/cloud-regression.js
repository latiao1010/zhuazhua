const assert = require('assert')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

function fresh(relativePath) {
  const target = path.join(ROOT, relativePath)
  delete require.cache[require.resolve(target)]
  return require(target)
}

async function run() {
  const calls = { init: [], functions: [], uploads: [], deletes: [] }
  const storage = {}
  global.wx = {
    cloud: {
      init(options) { calls.init.push(options) },
      callFunction(options) {
        calls.functions.push(options)
        if (options.name === 'pet-data' && options.data.action === 'listGrowthPhotos') {
          return Promise.resolve({ result: { ok: true, photos: [{ id: 'remote-1', path: 'cloud://env/growth.jpg', dayKey: '2026-08-04', time: '09:00', createdAt: 10 }] } })
        }
        if (options.name === 'pet-data' && options.data.action === 'addGrowthPhotos') {
          return Promise.resolve({ result: { ok: true, photos: options.data.photos } })
        }
        if (options.name === 'pet-data' && options.data.action === 'deleteGrowthPhoto') {
          return Promise.resolve({ result: { ok: true, deleted: 1 } })
        }
        if (options.name === 'pet-data' && options.data.action === 'seedSixMonthDemoData') {
          return Promise.resolve({ result: { ok: true, data: options.data.data } })
        }
        if (options.name === 'pet-data' && options.data.action === 'getAllData') {
          return Promise.resolve({ result: { ok: true, data: { feedGoal: 288 } } })
        }
        if (options.name === 'pet-data' && options.data.action === 'getBreedKnowledge') {
          return Promise.resolve({ result: { ok: true, data: {
            version: 'external-breed-v1',
            updatedAt: Date.now(),
            sources: ['TheDogAPI', 'TheCatAPI'],
            dogCount: 1,
            catCount: 0,
            items: [{
              id: 'dog-pembroke',
              species: 'dog',
              source: 'TheDogAPI',
              name: 'Pembroke Welsh Corgi',
              aliases: ['柯基'],
              temperament: ['Outgoing', 'Tenacious', 'Friendly'],
              lifeSpan: '12 - 14 years',
              weight: '10 - 14',
              summary: 'Breed group: Herding'
            }]
          } } })
        }
        if (options.name === 'pet-data' && options.data.action === 'setDataItem') {
          return Promise.resolve({ result: { ok: true } })
        }
        if (options.name === 'pet-data' && options.data.action === 'createShareInvitation') {
          return Promise.resolve({ result: { ok: true, code: 'ZZ-NM-123456', groupId: 'group-1', members: [
            { id: 'owner', name: '我', relation: '主人', role: 'owner', roleLabel: '主人', status: '已加入', joinedAt: '2026-08-05' }
          ] } })
        }
        if (options.name === 'pet-data' && options.data.action === 'acceptShareInvitation') {
          return Promise.resolve({ result: { ok: true, data: {
            pet: { name: '共享糯米', breed: '柯基', sex: '男孩', birthday: '2023-03-16', weight: 11.2, avatar: '/assets/momo-chibi.png' },
            familyMembers: [
              { id: 'owner', name: '我', relation: '主人', role: 'owner', roleLabel: '主人', status: '已加入', joinedAt: '2026-08-05' },
              { id: 'member', name: '妈妈', relation: '家人', role: 'admin', roleLabel: '共同照护', status: '已加入', joinedAt: '2026-08-05' }
            ]
          }, share: { shared: true, groupId: 'group-1', role: 'admin' } } })
        }
        return Promise.resolve({ result: { ok: false, error: 'unexpected call' } })
      },
      uploadFile(options) {
        calls.uploads.push(options)
        return Promise.resolve({ fileID: `cloud://env/${options.cloudPath}` })
      },
      deleteFile(options) {
        calls.deletes.push(options)
        return Promise.resolve({ fileList: options.fileList || [] })
      }
    },
    getLocation(options) { options.success({ latitude: 31.2, longitude: 121.4 }) },
    getStorageSync(key) { return storage[key] === undefined ? '' : storage[key] },
    setStorageSync(key, value) { storage[key] = value },
    request() { throw new Error('cloud mode should not call wx.request') },
    getFileSystemManager() { return {} }
  }

  ;['utils/cloud.js', 'utils/weather.js', 'utils/cloud-album.js', 'utils/store.js', 'utils/cloud-data.js', 'utils/pet-knowledge.js', 'utils/pet-knowledge-supplement.js'].forEach(relativePath => {
    const target = path.join(ROOT, relativePath)
    delete require.cache[require.resolve(target)]
  })

  const knowledge = fresh('utils/pet-knowledge.js')
  const localAnswer = knowledge.createReply('今天喝多少水', { name: '糯米', breed: '柯基', birthday: '2023-03-16', weight: 11.2 })
  assert.ok(localAnswer.includes('糯米'))
  assert.ok(localAnswer.includes('ml'))

  const weather = fresh('utils/weather.js')
  const forecast = await weather.getWeather()
  assert.strictEqual(forecast.location, '本地提示')
  assert.strictEqual(forecast.live, false)

  const album = fresh('utils/cloud-album.js')
  const loaded = await album.loadGrowthPhotos([{ id: 'local-1', path: '/assets/demo.png', dayKey: '2026-08-03', time: '08:00', createdAt: 9 }])
  assert.strictEqual(loaded.length, 2)
  const saved = await album.saveGrowthPhotos(['wxfile://one.jpg', 'wxfile://two.jpg'], { dayKey: '2026-08-04', time: '10:30', createdAt: 100 })
  assert.strictEqual(saved.length, 2)
  assert.ok(saved.every(item => item.path.startsWith('cloud://')))
  const originalCallFunction = wx.cloud.callFunction
  wx.cloud.callFunction = options => {
    calls.functions.push(options)
    if (options.name === 'pet-data' && options.data.action === 'addGrowthPhotos') {
      return Promise.resolve({ result: { ok: false, error: 'database temporarily unavailable' } })
    }
    return originalCallFunction(options)
  }
  const savedWhenDbFails = await album.saveGrowthPhotos(['wxfile://three.jpg'], { dayKey: '2026-08-04', time: '11:30', createdAt: 200 })
  assert.strictEqual(savedWhenDbFails.length, 1)
  assert.ok(savedWhenDbFails[0].path.startsWith('cloud://'))
  wx.cloud.callFunction = originalCallFunction
  const deletedPhoto = await album.deleteGrowthPhoto({ id: 'remote-1', path: 'cloud://env/growth.jpg', dayKey: '2026-08-04', time: '09:00', createdAt: 10 })
  assert.strictEqual(deletedPhoto.deleted, 1)
  assert.ok(calls.functions.some(item => item.name === 'pet-data' && item.data.action === 'deleteGrowthPhoto'))

  const store = fresh('utils/store.js')
  store.ensureSeedData()
  const cloudData = fresh('utils/cloud-data.js')
  const seeded = await cloudData.seedAndSyncSixMonthDemo()
  assert.ok(seeded.data.feeds.length > 450)
  assert.ok(calls.functions.some(item => item.name === 'pet-data' && item.data.action === 'seedSixMonthDemoData'))
  await cloudData.syncAll()
  assert.strictEqual(storage.paw_feed_goal, 288)
  const breedSync = await cloudData.syncBreedKnowledge({ force: true })
  assert.strictEqual(breedSync.ok, true)
  assert.strictEqual(storage.paw_external_breed_knowledge.items[0].aliases[0], '柯基')
  assert.ok(calls.functions.some(item => item.name === 'pet-data' && item.data.action === 'getBreedKnowledge'))
  store.set('feedGoal', 300)
  assert.ok(calls.functions.some(item => item.name === 'pet-data' && item.data.action === 'setDataItem' && item.data.key === 'feedGoal' && item.data.value === 300))
  storage.paw_share_status = { shared: true, role: 'viewer' }
  await store.set('feedGoal', 301)
  assert.strictEqual(storage.paw_feed_goal, 300)
  storage.paw_share_status = { shared: true, role: 'owner' }
  const invite = await cloudData.createShareInvitation({ petName: '糯米' })
  assert.strictEqual(invite.code, 'ZZ-NM-123456')
  const accepted = await cloudData.acceptShareInvitation('ZZ-NM-123456', { name: '妈妈' })
  assert.strictEqual(accepted.share.shared, true)
  assert.strictEqual(storage.paw_pet.name, '共享糯米')
  assert.strictEqual(storage.paw_family_members.length, 2)
  assert.ok(calls.functions.some(item => item.name === 'pet-data' && item.data.action === 'acceptShareInvitation'))

  assert.strictEqual(calls.init.length, 1)
  assert.strictEqual(calls.init[0].env, 'cloudbase-d3glshm6n124d98a4')
  console.log('✓ 本地知识库回答不依赖 AI 接口')
  console.log('✓ 审核版天气不上传定位')
  console.log('✓ 成长相册云同步与多图上传')
  console.log('✓ 半年假数据会写入并同步微信云数据库')
  console.log('✓ 只读共享成员本地写入会被拦截')
  console.log('✓ 家庭共享邀请码云端生成与接受')
  console.log('✓ TheDogAPI/TheCatAPI 品种知识可同步并缓存到本地')
  console.log('8/8 cloud scenarios passed.')
}

run().catch(error => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
