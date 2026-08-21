const store = require('../../utils/store')
const knowledge = require('../../utils/pet-knowledge')
const cloudData = require('../../utils/cloud-data')

Page({
  data: {
    pet: {},
    input: '',
    thinking: false,
    messages: [],
    scrollTo: '',
    quickQuestions: [],
    advisorGroups: []
  },

  onShow() {
    if (!Number.isFinite(this.replyVersion)) this.replyVersion = 0
    cloudData.seedAndSyncSixMonthDemo().then(() => {
      this.setData({ messages: store.get('chats') || [] })
      this.scrollBottom()
    })
    cloudData.syncBreedKnowledge()
    const pet = store.get('pet')
    this.setData({
      pet,
      messages: store.get('chats') || [],
      quickQuestions: [
        `${pet.name}今天状态怎么样？`,
        `${pet.name}喝水和喂食达标吗？`,
        `${pet.breed}今天运动怎么安排？`,
        '便便偏软要不要担心？'
      ],
      advisorGroups: [
        { title: '宠物档案', desc: '年龄、体重、喂食和护理记录', items: [{ label: '查看档案建议', text: '结合我的宠物档案给今天的照护建议' }] },
        { title: '每日知识', desc: '每天一条和当前状态相关的小知识', items: [{ label: '今日养宠知识', text: '给我一条结合年龄、天气和记录的今日养宠知识' }] },
        { title: '宠物问答', desc: '直接问饮食、运动、排便和健康问题', items: [{ label: '今日状态', text: `${pet.name}今天状态怎么样？` }, { label: '运动安排', text: `${pet.breed}今天运动怎么安排？` }] },
        { title: '食物能不能吃', desc: '先判断安全性，再看喂法和分量', items: [{ label: '食物判断', text: '苹果、鸡胸肉和酸奶能不能吃？' }] },
        { title: '宠物粮推荐', desc: '按档案筛选主粮、零食和玩具', items: [
          { label: '根据宠物推荐', text: '根据我家宠物推荐主粮、零食和玩具' },
          { label: '主粮筛选', text: '帮我筛选适合我家宠物的主粮' },
          { label: '零食筛选', text: '帮我筛选适合训练的零食' },
          { label: '商品对比', text: '帮我对比两款主粮应该看什么' },
          { label: '营养/配料解释', text: '宠物粮的蛋白、脂肪和配料表怎么看' }
        ] }
      ]
    })
    this.scrollBottom()
  },

  onInput(e) {
    this.setData({ input: e.detail.value })
  },

  askQuick(e) {
    this.setData({ input: e.currentTarget.dataset.text })
    this.send()
  },

  now() {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  },

  finishReply(replyVersion, answer) {
    if (replyVersion !== this.replyVersion) return
    const next = [...this.data.messages, {
      id: Date.now() + 1,
      role: 'ai',
      text: answer,
      time: this.now(),
      source: 'local-knowledge'
    }]
    this.setData({ messages: next, thinking: false })
    store.set('chats', next)
    this.replyTimer = null
    this.scrollBottom()
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
    this.replyTimer = setTimeout(() => {
      const answer = knowledge.createReply(text, store.get('pet'), { history: messages })
      this.finishReply(replyVersion, answer)
    }, 260)
  },

  scrollBottom() {
    setTimeout(() => this.setData({ scrollTo: `msg-${Math.max(0, this.data.messages.length - 1)}` }), 50)
  },

  clearChat() {
    wx.showActionSheet({
      itemList: ['清空聊天记录'],
      success: () => {
        this.replyVersion = (this.replyVersion || 0) + 1
        if (this.replyTimer) clearTimeout(this.replyTimer)
        this.replyTimer = null
        store.set('chats', [])
        this.setData({ messages: [], scrollTo: '', thinking: false })
      }
    })
  },

  onUnload() {
    this.replyVersion = (this.replyVersion || 0) + 1
    if (this.replyTimer) clearTimeout(this.replyTimer)
    this.replyTimer = null
  },

  onShareAppMessage() {
    return { title: `和宠物顾问一起照顾${this.data.pet.name}`, path: '/pages/chat/chat' }
  }
})
