const assert = require('assert')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

function fresh(relativePath) {
  const target = path.join(ROOT, relativePath)
  delete require.cache[require.resolve(target)]
  return require(target)
}

async function run() {
  const calls = { init: [], functions: [], uploads: [] }
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
        if (options.data.action === 'chat') {
          return Promise.resolve({ result: { ok: true, content: '云端回答', model: 'deepseek-chat' } })
        }
        if (options.data.action === 'avatar') {
          return Promise.resolve({ result: { ok: true, imageFileID: 'cloud://env/generated.jpg' } })
        }
        if (options.data.action === 'weather') {
          return Promise.resolve({ result: { ok: true, data: {
            current: { temperature_2m: 29, apparent_temperature: 31, weather_code: 1 },
            hourly: { time: ['2026-08-04T14:00'], precipitation_probability: [10], precipitation: [0] }
          } } })
        }
        return Promise.resolve({ result: { ok: false, error: 'unexpected call' } })
      },
      uploadFile(options) {
        calls.uploads.push(options)
        return Promise.resolve({ fileID: `cloud://env/${options.cloudPath}` })
      }
    },
    getLocation(options) { options.success({ latitude: 31.2, longitude: 121.4 }) },
    getStorageSync() { return '' },
    request() { throw new Error('cloud mode should not call wx.request') },
    getFileSystemManager() { return {} }
  }

  ;['utils/cloud.js', 'utils/deepseek.js', 'utils/dreamina.js', 'utils/weather.js', 'utils/cloud-album.js'].forEach(relativePath => {
    const target = path.join(ROOT, relativePath)
    delete require.cache[require.resolve(target)]
  })

  const deepseek = fresh('utils/deepseek.js')
  const chat = await deepseek.createChatRequest({ messages: [{ role: 'user', text: '今天喝多少水' }], pet: { name: '糯米', breed: '柯基', weight: 11.2 } }).promise
  assert.strictEqual(chat.content, '云端回答')
  assert.strictEqual(calls.functions.find(item => item.data.action === 'chat').name, 'pet-ai')

  const dreamina = fresh('utils/dreamina.js')
  const avatar = await dreamina.createAvatarTask({ filePath: 'wxfile://dog.jpg', styleId: 'soft3d', style: '软萌公仔', pet: { name: '糯米' } }).promise
  assert.strictEqual(avatar.imageFileID, 'cloud://env/generated.jpg')
  assert.ok(calls.uploads.some(item => item.cloudPath.startsWith('avatar-inputs/')))

  const weather = fresh('utils/weather.js')
  const forecast = await weather.getWeather()
  assert.strictEqual(forecast.temperature, 29)
  assert.strictEqual(forecast.live, true)

  const album = fresh('utils/cloud-album.js')
  const loaded = await album.loadGrowthPhotos([{ id: 'local-1', path: '/assets/demo.png', dayKey: '2026-08-03', time: '08:00', createdAt: 9 }])
  assert.strictEqual(loaded.length, 2)
  const saved = await album.saveGrowthPhotos(['wxfile://one.jpg', 'wxfile://two.jpg'], { dayKey: '2026-08-04', time: '10:30', createdAt: 100 })
  assert.strictEqual(saved.length, 2)
  assert.ok(saved.every(item => item.path.startsWith('cloud://')))

  assert.strictEqual(calls.init.length, 1)
  assert.strictEqual(calls.init[0].env, 'cloudbase-d3glshm6n124d98a4')
  console.log('✓ 云端聊天调用')
  console.log('✓ 云端头像上传与生成调用')
  console.log('✓ 云端天气调用')
  console.log('✓ 成长相册云同步与多图上传')
  console.log('4/4 cloud scenarios passed.')
}

run().catch(error => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
