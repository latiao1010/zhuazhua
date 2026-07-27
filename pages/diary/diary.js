const store = require('../../utils/store')

Page({
  data: { pet: {}, diaries: [], streak: 1, creating: false, generating: false, todayFeedCount: 0, draft: { mood: '开心', note: '' }, moods: [{ name: '开心', icon: '😄' }, { name: '平静', icon: '😌' }, { name: '委屈', icon: '🥺' }] },
  onShow() { this.refresh() },
  refresh() {
    const diaries = store.get('diaries')
    const todayFeedCount = store.get('feeds').filter(item => item.dayKey === store.todayKey()).length
    this.setData({ pet: store.get('pet'), diaries, todayFeedCount, streak: Math.max(1, diaries.length) })
  },
  openCreate() { this.setData({ creating: true, draft: { mood: '开心', note: '' } }) },
  closeCreate() { if (!this.data.generating) this.setData({ creating: false }) },
  noop() {},
  chooseMood(e) { this.setData({ 'draft.mood': e.currentTarget.dataset.name }) },
  onNote(e) { this.setData({ 'draft.note': e.detail.value }) },
  generateDiary() {
    this.setData({ generating: true })
    // MVP 本地生成；生产版在此把结构化记录发送给服务端大模型。
    setTimeout(() => {
      const pet = store.get('pet')
      const feeds = store.get('feeds').filter(item => item.dayKey === store.todayKey())
      const foods = [...new Set(feeds.map(item => item.food))]
      const note = this.data.draft.note.trim()
      const mood = this.data.draft.mood
      const content = `今天我是${mood}的${pet.name}！${foods.length ? `铲屎官给我准备了${foods.join('和')}，每一口都认真吃掉啦。` : '虽然还没来得及记录吃饭，但我一直期待着香喷喷的一餐。'}${note ? `${note}，这件事我要偷偷珍藏起来。` : '傍晚我趴在熟悉的地方，觉得被好好爱着真幸福。'}`
      const d = new Date()
      const diary = { id: Date.now(), date: `${d.getMonth() + 1}月${d.getDate()}日 · 今天`, title: mood === '开心' ? '尾巴摇成小风扇的一天' : mood === '平静' ? '慢悠悠的温柔一天' : '今天也想要一个抱抱', weather: '☀️ 今日', mood, content, highlight: `今日高光：完成 ${feeds.length} 次喂食记录，认真生活的一天！` }
      const diaries = [diary, ...this.data.diaries]
      store.set('diaries', diaries)
      this.setData({ diaries, generating: false, creating: false, streak: diaries.length })
      wx.showToast({ title: '日记生成成功' })
    }, 1100)
  },
  copyDiary(e) { wx.setClipboardData({ data: e.currentTarget.dataset.content }) },
  removeDiary(e) {
    const id = e.currentTarget.dataset.id
    wx.showActionSheet({ itemList: ['删除这篇日记'], success: () => { store.set('diaries', this.data.diaries.filter(x => x.id !== id)); this.refresh() } })
  }
})
