const store = require('../../utils/store')

Page({
  data: {
    pet: {}, photo: '', style: '软萌 3D', generated: true, generating: false,
    styles: [
      { name: '软萌 3D', icon: '🐶', bg: 'linear-gradient(135deg,#ffe4d4,#ffd2bc)' },
      { name: '日系漫画', icon: '🌸', bg: 'linear-gradient(135deg,#f4e7ff,#e8d6ff)' },
      { name: '蜡笔涂鸦', icon: '🖍️', bg: 'linear-gradient(135deg,#fff0b8,#ffe087)' },
      { name: '复古像素', icon: '👾', bg: 'linear-gradient(135deg,#d9efff,#bde1f7)' }
    ]
  },
  onShow() { this.setData({ pet: store.get('pet') }) },
  choosePhoto() {
    wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], success: res => this.setData({ photo: res.tempFiles[0].tempFilePath, generated: false }) })
  },
  chooseStyle(e) { this.setData({ style: e.currentTarget.dataset.name, generated: false }) },
  generate() {
    this.setData({ generating: true })
    // MVP 使用内置原创成品模拟生成；生产版在此调用服务端图像生成 API。
    setTimeout(() => { this.setData({ generating: false, generated: true }); wx.vibrateShort({ type: 'light' }) }, 1400)
  },
  saveAvatar() {
    const pet = { ...this.data.pet, avatar: '/assets/momo-chibi.png' }
    store.set('pet', pet)
    this.setData({ pet })
    wx.showToast({ title: '头像已更新' })
  },
  onShareAppMessage() {
    const pet = store.get('pet')
    return { title: `看看${pet.name}的 AI Q 版头像`, path: '/pages/avatar/avatar' }
  }
})
