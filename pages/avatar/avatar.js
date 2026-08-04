const store = require('../../utils/store')
const dreamina = require('../../utils/dreamina')

Page({
  data: {
    pet: {}, photo: '', generatedImage: '', generatedStyle: '', generationError: '',
    styleId: 'soft3d', style: '软萌公仔', generated: false, generating: false,
    styles: [
      { id: 'soft3d', name: '软萌公仔', icon: '🐶', bg: 'linear-gradient(135deg,#ffe4d4,#ffd2bc)' },
      { id: 'anime', name: '治愈漫画', icon: '🌸', bg: 'linear-gradient(135deg,#f4e7ff,#e8d6ff)' },
      { id: 'crayon', name: '蜡笔绘本', icon: '🖍️', bg: 'linear-gradient(135deg,#fff0b8,#ffe087)' },
      { id: 'pixel', name: '复古像素', icon: '👾', bg: 'linear-gradient(135deg,#d9efff,#bde1f7)' }
    ]
  },
  onShow() {
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
    this.generationVersion = (this.generationVersion || 0) + 1
    if (this.pollTimer) clearTimeout(this.pollTimer)
    if (this.avatarRequest) this.avatarRequest.abort()
    this.pollTimer = null
    this.avatarRequest = null
  },
  onShareAppMessage() {
    const pet = store.get('pet')
    return { title: `看看${pet.name}的 AI Q 版头像`, path: '/pages/avatar/avatar' }
  }
})
