const store = require('../../utils/store')
const deepseek = require('../../utils/deepseek')
const dreamina = require('../../utils/dreamina')

const replies = [
  { keys: ['虫咬', '叮咬', '蜂蜇', '蜱虫', '跳蚤'], text: pet => `${pet.name}如果只是局部轻微红肿，可以先保持安静并隔布冷敷约 10 分钟，避免抓舔。若看见蜂刺，可用卡片边缘平刮，尽量不要挤压。出现面部或颈部明显肿胀、呼吸困难、反复呕吐、虚弱，或被多只昆虫蜇伤时，应立即联系急诊兽医。不要自行给人用抗过敏药，具体药物和剂量需由兽医根据体重、病史确认。` },
  { keys: ['吃药', '用药', '药物', '药'], text: pet => `给${pet.name}用药前，需要确认药名、浓度、体重、症状和既往疾病。很多人用药对宠物并不安全，我不能在缺少兽医评估时建议具体剂量。若已误食药物，请保留包装、记录大致时间和数量，并立即联系兽医或动物急诊。` },
  { keys: ['吃', '喂', '粮'], text: pet => `结合${pet.name} ${pet.weight}kg 的体重，建议把每日主粮分成 2～3 餐，并把零食控制在全天热量的 10% 内。最近若要换粮，记得用 7 天逐步替换法哦。` },
  { keys: ['水', '喝'], text: pet => {
    const weight = Number(pet.weight) || 0
    return `${pet.name}每天基础饮水量可按每公斤 50～60ml 粗略估算，也就是约 ${Math.round(weight * 50)}～${Math.round(weight * 60)}ml。天气热、运动后或吃干粮时还要适当增加。`
  } },
  { keys: ['拉', '便', '肚子'], text: pet => `可以先记录${pet.name}的精神、食欲、排便形态、颜色和持续时间。如果出现反复呕吐、红色或黑色便、明显没精神，或症状持续，请尽快联系兽医。你也可以在“日常”页记录本次排便，方便观察趋势。` },
  { keys: ['散步', '运动'], text: pet => `${pet.breed}的运动需要结合年龄和身体情况。建议每天分次温和散步；如果是柯基，要减少频繁爬楼和高处跳跃。炎热天气尽量安排在清晨或傍晚。` }
]

Page({
  data: {
    hubTab: 'chat', pet: {}, input: '', thinking: false, messages: [], scrollTo: '', quickQuestions: [],
    photo: '', generatedImage: '', generatedStyle: '', generationError: '',
    styleId: 'soft3d', style: '软萌公仔', generated: false, generating: false,
    styles: [
      { id: 'soft3d', name: '软萌公仔', icon: '🐶', bg: 'linear-gradient(135deg,#ffe4d4,#ffd2bc)' },
      { id: 'anime', name: '治愈漫画', icon: '🌸', bg: 'linear-gradient(135deg,#f4e7ff,#e8d6ff)' },
      { id: 'crayon', name: '蜡笔绘本', icon: '🖍️', bg: 'linear-gradient(135deg,#fff0b8,#ffe087)' },
      { id: 'pixel', name: '复古像素', icon: '👾', bg: 'linear-gradient(135deg,#d9efff,#bde1f7)' }
    ]
  },
  onLoad(options) {
    if (options && options.mode === 'avatar') this.setData({ hubTab: 'avatar' })
  },
  onShow() {
    if (!Number.isFinite(this.replyVersion)) this.replyVersion = 0
    const pet = store.get('pet')
    this.setData({
      pet,
      messages: store.get('chats') || [],
      quickQuestions: [`${pet.name}今天应该喝多少水？`, '最近有点挑食怎么办？', `${pet.breed}每天散步多久合适？`, '被虫咬了怎么办，可以吃药吗？']
    })
    this.scrollBottom()
    this.refreshAvatarState()
  },
  onInput(e) { this.setData({ input: e.detail.value }) },
  switchHubTab(e) {
    const hubTab = e.currentTarget.dataset.tab === 'avatar' ? 'avatar' : 'chat'
    this.setData({ hubTab })
    if (hubTab === 'avatar') this.refreshAvatarState()
    else this.scrollBottom()
  },
  askQuick(e) { this.setData({ input: e.currentTarget.dataset.text }); this.send() },
  now() { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` },
  getOfflineAnswer(text) {
    const found = replies.find(rule => rule.keys.some(key => text.includes(key)))
    const pet = store.get('pet')
    return found ? found.text(pet) : `我记得${pet.name}是一只${pet.breed}，今年正是活泼的时候。这个问题可以结合它最近的食欲、精神和排便一起判断。你能再告诉我具体持续多久了吗？`
  },
  finishReply(replyVersion, answer, source) {
    if (replyVersion !== this.replyVersion) return
    const next = [...this.data.messages, {
      id: Date.now() + 1,
      role: 'ai',
      text: answer,
      time: this.now(),
      source: source || 'offline'
    }]
    this.setData({ messages: next, thinking: false })
    store.set('chats', next)
    this.replyTimer = null
    this.aiRequest = null
    this.scrollBottom()
  },
  scheduleOfflineReply(text, replyVersion, delay = 700) {
    this.replyTimer = setTimeout(() => {
      if (replyVersion !== this.replyVersion) return
      this.finishReply(replyVersion, this.getOfflineAnswer(text), 'offline')
    }, delay)
  },
  send() {
    const text = this.data.input.trim()
    if (!text || this.data.thinking) return
    const replyVersion = (this.replyVersion || 0) + 1
    this.replyVersion = replyVersion
    const messages = [...this.data.messages, { id: Date.now(), role: 'user', text, time: this.now() }]
    this.setData({ messages, input: '', thinking: true })
    store.set('chats', messages)
    this.scrollBottom()
    if (!deepseek.isAvailable()) {
      this.scheduleOfflineReply(text, replyVersion)
      return
    }
    this.aiRequest = deepseek.createChatRequest({ messages, pet: this.data.pet })
    this.aiRequest.promise
      .then(result => this.finishReply(replyVersion, result.content, result.model))
      .catch(() => {
        if (replyVersion !== this.replyVersion) return
        this.aiRequest = null
        wx.showToast({ title: 'AI 服务暂时不可用，已使用离线建议', icon: 'none' })
        this.scheduleOfflineReply(text, replyVersion, 150)
      })
  },
  scrollBottom() { setTimeout(() => this.setData({ scrollTo: `msg-${Math.max(0, this.data.messages.length - 1)}` }), 50) },
  clearChat() {
    wx.showActionSheet({
      itemList: ['清空聊天记录'],
      success: () => {
        this.replyVersion = (this.replyVersion || 0) + 1
        if (this.replyTimer) clearTimeout(this.replyTimer)
        if (this.aiRequest) this.aiRequest.abort()
        this.replyTimer = null
        this.aiRequest = null
        store.set('chats', [])
        this.setData({ messages: [], scrollTo: '', thinking: false })
      }
    })
  },
  refreshAvatarState() {
    const pet = store.get('pet')
    const latest = store.get('generatedAvatar')
    const generationStatus = store.get('avatarGenerationStatus')
    const update = { pet }
    if (!this.data.photo && !this.data.generating && latest && latest.path) {
      update.generated = true
      update.generatedImage = latest.path
      update.generatedStyle = latest.style
    }
    if (!this.data.generating && generationStatus && generationStatus.status === 'fail') {
      update.generationError = generationStatus.error || '上一次生成没有成功，请重新选择照片再试。'
    }
    if (!this.data.generating && generationStatus && generationStatus.status === 'querying') {
      update.style = generationStatus.style || this.data.style
      update.styleId = generationStatus.styleId || this.data.styleId
    }
    this.setData(update)
    if (
      !this.data.generating &&
      generationStatus &&
      generationStatus.status === 'querying' &&
      generationStatus.submitId
    ) {
      this.generationVersion = (this.generationVersion || 0) + 1
      const version = this.generationVersion
      this.setData({ generating: true, generationError: '' })
      this.pollAvatar(generationStatus.submitId, version, 0)
    }
  },
  choosePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: res => this.setData({
        photo: res.tempFiles[0].tempFilePath,
        generated: false,
        generatedImage: '',
        generatedStyle: '',
        generationError: ''
      })
    })
  },
  chooseStyle(e) {
    this.setData({
      styleId: e.currentTarget.dataset.id,
      style: e.currentTarget.dataset.name
    })
  },
  generate() {
    if (this.data.generating) return
    if (!this.data.photo) return wx.showToast({ title: '请先选择一张宠物照片', icon: 'none' })
    if (!dreamina.isAvailable()) return wx.showToast({ title: '云端图片服务暂不可用', icon: 'none' })
    wx.showModal({
      title: '使用云端 AI 生成',
      content: '本次生成会临时上传照片至微信云存储，并调用图片模型。是否继续？',
      confirmText: '继续生成',
      success: result => {
        if (result.confirm) this.startGenerate()
      }
    })
  },
  startGenerate() {
    if (this.data.generating) return
    this.generationVersion = (this.generationVersion || 0) + 1
    const version = this.generationVersion
    this.setData({ generating: true, generated: false, generatedImage: '', generatedStyle: '', generationError: '' })
    this.avatarRequest = dreamina.createAvatarTask({
      filePath: this.data.photo,
      styleId: this.data.styleId,
      style: this.data.style,
      pet: this.data.pet
    })
    this.avatarRequest.promise
      .then(result => {
        if (version !== this.generationVersion) return
        this.avatarRequest = null
        if (result.status === 'success' && (result.imageFileID || result.imageUrl)) {
          dreamina.downloadImage(result.imageFileID || result.imageUrl)
            .then(imagePath => this.persistGeneratedImage(imagePath, version))
            .catch(error => this.failGenerate(error, version))
          return
        }
        if (!result.submitId) {
          this.failGenerate(new Error('生成服务没有返回有效结果'), version)
          return
        }
        store.set('avatarGenerationStatus', {
          status: 'querying',
          submitId: result.submitId,
          styleId: this.data.styleId,
          style: this.data.style,
          error: '',
          createdAt: Date.now()
        })
        this.pollAvatar(result.submitId, version, 0)
      })
      .catch(error => this.failGenerate(error, version))
  },
  pollAvatar(submitId, version, attempts) {
    if (version !== this.generationVersion) return
    this.pollTimer = null
    if (attempts >= 90) {
      this.failGenerate(new Error('生成时间较长，请稍后重试'), version)
      return
    }
    this.avatarRequest = dreamina.queryAvatarTask(submitId)
    this.avatarRequest.promise
      .then(result => {
        if (version !== this.generationVersion) return
        this.avatarRequest = null
        if (result.status === 'success' && result.imageUrl) {
          dreamina.downloadImage(result.imageUrl)
            .then(tempFilePath => {
              if (version !== this.generationVersion) return
              this.persistGeneratedImage(tempFilePath, version)
            })
            .catch(error => this.failGenerate(error, version))
          return
        }
        if (result.status === 'fail') {
          this.failGenerate(new Error(result.error || '云端图片生成失败'), version)
          return
        }
        this.pollTimer = setTimeout(() => this.pollAvatar(submitId, version, attempts + 1), 2000)
      })
      .catch(error => this.failGenerate(error, version))
  },
  persistGeneratedImage(tempFilePath, version) {
    const showResult = imagePath => {
      if (version !== this.generationVersion) return
      this.setData({
        generating: false,
        generated: true,
        generatedImage: imagePath,
        generatedStyle: this.data.style
      })
      wx.vibrateShort({ type: 'light' })
    }
    const saveRecord = imagePath => {
      const saved = {
        path: imagePath,
        styleId: this.data.styleId,
        style: this.data.style,
        createdAt: Date.now()
      }
      store.set('generatedAvatar', saved)
      store.set('avatarGenerationStatus', {
        status: 'success',
        submitId: '',
        styleId: saved.styleId,
        style: saved.style,
        error: '',
        createdAt: saved.createdAt
      })
      showResult(saved.path)
      return saved
    }
    if (/^cloud:\/\//.test(String(tempFilePath || ''))) {
      saveRecord(tempFilePath)
      return
    }
    wx.saveFile({
      tempFilePath,
      success: result => {
        if (version !== this.generationVersion) return
        const previous = store.get('generatedAvatar')
        const saved = saveRecord(result.savedFilePath)
        if (
          previous && previous.path &&
          previous.path.indexOf('wxfile://') === 0 &&
          previous.path !== saved.path &&
          previous.path !== this.data.pet.avatar &&
          wx.removeSavedFile
        ) {
          wx.removeSavedFile({ filePath: previous.path })
        }
      },
      fail: () => {
        store.set('avatarGenerationStatus', {
          status: 'success',
          submitId: '',
          styleId: this.data.styleId,
          style: this.data.style,
          error: '',
          createdAt: Date.now()
        })
        showResult(tempFilePath)
      }
    })
  },
  failGenerate(error, version) {
    if (version !== this.generationVersion) return
    this.avatarRequest = null
    const message = this.formatGenerationError(error)
    const latest = store.get('generatedAvatar')
    const update = { generating: false, generationError: message }
    if (latest && latest.path) {
      update.generated = true
      update.generatedImage = latest.path
      update.generatedStyle = latest.style
    }
    store.set('avatarGenerationStatus', {
      status: 'fail',
      submitId: '',
      styleId: this.data.styleId,
      style: this.data.style,
      error: message,
      createdAt: Date.now()
    })
    this.setData(update)
    wx.showToast({ title: '本次生成未成功', icon: 'none' })
  },
  formatGenerationError(error) {
    const raw = String(error && error.message || error || '')
    if (/task was deleted/i.test(raw)) return '云端未生成出图片：任务已被服务端删除，请重新选择照片后再试。'
    if (/time|超时|时间较长/i.test(raw)) return '云端仍未返回图片，稍后回到本页会继续查询结果。'
    return raw ? `云端未生成出图片：${raw}` : '云端未生成出图片，请稍后重新尝试。'
  },
  saveAvatar() {
    if (!this.data.generatedImage) return
    const commit = avatar => {
      const previous = this.data.pet.avatar
      const pet = { ...this.data.pet, avatar }
      store.set('pet', pet)
      this.setData({ pet, generatedImage: avatar })
      if (
        previous && previous.startsWith('wxfile://') &&
        previous !== avatar &&
        (!store.get('generatedAvatar') || store.get('generatedAvatar').path !== previous) &&
        wx.removeSavedFile
      ) {
        wx.removeSavedFile({ filePath: previous })
      }
      wx.showToast({ title: '头像已更新' })
    }
    const latest = store.get('generatedAvatar')
    if (latest && latest.path === this.data.generatedImage) {
      commit(latest.path)
      return
    }
    wx.saveFile({
      tempFilePath: this.data.generatedImage,
      success: result => {
        const saved = {
          path: result.savedFilePath,
          styleId: this.data.styleId,
          style: this.data.generatedStyle || this.data.style,
          createdAt: Date.now()
        }
        store.set('generatedAvatar', saved)
        commit(saved.path)
      },
      fail: () => wx.showToast({ title: '头像保存失败', icon: 'none' })
    })
  },
  previewGenerated() {
    if (!this.data.generatedImage) return
    wx.previewImage({
      current: this.data.generatedImage,
      urls: [this.data.generatedImage]
    })
  },
  onUnload() {
    this.replyVersion = (this.replyVersion || 0) + 1
    if (this.replyTimer) clearTimeout(this.replyTimer)
    if (this.aiRequest) this.aiRequest.abort()
    this.replyTimer = null
    this.aiRequest = null
    this.generationVersion = (this.generationVersion || 0) + 1
    if (this.pollTimer) clearTimeout(this.pollTimer)
    if (this.avatarRequest) this.avatarRequest.abort()
    this.pollTimer = null
    this.avatarRequest = null
  },
  onShareAppMessage() {
    if (this.data.hubTab === 'avatar') {
      const pet = store.get('pet')
      return { title: `看看${pet.name}的 AI Q 版头像`, path: '/pages/chat/chat?mode=avatar' }
    }
    return { title: `和爪爪 AI 一起照顾${this.data.pet.name}`, path: '/pages/chat/chat' }
  }
})
