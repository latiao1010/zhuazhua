const store = require('../../utils/store')
const knowledge = require('../../utils/pet-knowledge')
const cloudData = require('../../utils/cloud-data')
const suggestions = require('../../utils/chat-suggestions')

Page({
  data: {
    pet: {},
    input: '',
    thinking: false,
    messages: [],
    scrollTo: '',
    quickQuestions: [],
    advisorQuestions: [],
    followUps: [],
    rootTopicLabel: '',
    followUpCategory: 'general',
    rootQuestionCategory: 'general',
    followUpHeading: '你还可以继续问'
  },

  onShow() {
    if (!Number.isFinite(this.replyVersion)) this.replyVersion = 0
    cloudData.seedAndSyncSixMonthDemo().then(() => {
      this.setData({ messages: this.formatMessages(store.get('chats') || []) })
      this.scrollBottom()
    })
    cloudData.syncBreedKnowledge()
    const pet = store.get('pet')
    this.setData({
      pet,
      rootTopicLabel: wx.getStorageSync('paw_chat_root_label') || '日常咨询',
      rootQuestionCategory: wx.getStorageSync('paw_chat_root_category') || 'general',
      messages: this.formatMessages(store.get('chats') || []),
      quickQuestions: [
        `${pet.name}今天状态怎么样？`,
        `${pet.name}喝水和喂食达标吗？`,
        `${pet.breed}今天运动怎么安排？`,
        '便便偏软要不要担心？'
      ],
      advisorQuestions: suggestions.allTopics(pet)
    })
    this.refreshFollowUps()
    this.scheduleQuestionReset()
    this.scrollBottom()
  },


  formatMessages(messages) {
    return messages.map(message => {
      if (message.role !== 'ai') return message
      const lines = String(message.text || '').split('\n').map(line => line.trim()).filter(Boolean)
      const title = /^【.*】$/.test(lines[0] || '') ? lines.shift().slice(1, -1) : ''
      return { ...message, answerTitle: title, answerLines: lines, needsRecord: /没有.{0,8}记录|暂无.{0,8}记录|还没.{0,8}记录|尚未.{0,8}记录|记录不足/.test(message.text) }
    })
  },

  openRecords() {
    wx.navigateTo({ url: '/pages/feed/feed' })
  },

  questionDay() {
    const date = new Date()
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
  },

  readQuestionVisits() {
    const saved = wx.getStorageSync('paw_chat_question_visits')
    return saved && saved.day === this.questionDay() && Array.isArray(saved.keys) ? saved.keys : []
  },

  questionVisitKey(category, label, text) {
    return JSON.stringify(['root', category, text])
  },

  refreshQuestionVisits() {
    const texts = this.readQuestionVisits()
    const decorate = (items, category) => items.map(item => ({ ...item, visited: item.action !== 'back' && texts.includes(this.questionVisitKey(category === 'welcome' || category === 'topics' ? item.text : category, item.label, item.text)) }))
    this.setData({
      advisorQuestions: decorate(this.data.advisorQuestions, 'welcome'),
      followUps: decorate(this.data.followUps, this.data.followUpCategory)
    })
  },

  scheduleQuestionReset() {
    clearTimeout(this.questionResetTimer)
    this.refreshQuestionVisits()
    const now = new Date()
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    this.questionResetTimer = setTimeout(() => this.scheduleQuestionReset(), midnight - now)
  },

  onHide() {
    clearTimeout(this.questionResetTimer)
  },

  // 追问按钮跟着最后一条回答走，用户点按钮就绕开了自由输入的意图识别
  refreshFollowUps() {
    const messages = this.data.messages || []
    const lastAi = [...messages].reverse().find(item => item && item.role === 'ai')
    const followUps = suggestions.followUps(lastAi && lastAi.text, this.data.pet)

    this.setData({ followUps, followUpCategory: this.data.rootQuestionCategory, followUpHeading: '你还可以继续问' })
    this.refreshQuestionVisits()
  },

  onInput(e) {
    this.setData({ input: e.detail.value })
  },

  askQuick(e) {
    const text = (e.currentTarget.dataset.text || '').trim()
    if (!text || this.data.thinking) return
    const texts = this.readQuestionVisits()
    const { category, label } = e.currentTarget.dataset
    // 只有最外层入口会切换大类目，后续回答和追问始终沿用它。
    const root = category === 'welcome' || category === 'topics' ? text : this.data.rootQuestionCategory
    this.setData({ rootQuestionCategory: root })
    if (category === 'welcome' || category === 'topics') {
      this.setData({ rootTopicLabel: label })
      wx.setStorageSync('paw_chat_root_label', label)
    }
    wx.setStorageSync('paw_chat_root_category', root)
    const key = this.questionVisitKey(root, label, text)
    if (!texts.includes(key)) texts.push(key)
    wx.setStorageSync('paw_chat_question_visits', { day: this.questionDay(), keys: texts })
    this.refreshQuestionVisits()
    this.setData({ input: text })
    this.send()
  },

  onFollowUpTap(e) {
    if (e.currentTarget.dataset.action === 'back') {
      this.setData({
        followUps: suggestions.allTopics(this.data.pet),
        followUpCategory: 'topics',
        followUpHeading: '选择一个提问主题',
        scrollTo: ''
      }, () => {
        this.setData({ scrollTo: 'followups-start' })
      })
      this.refreshQuestionVisits()
      return
    }
    this.askQuick(e)
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
    this.setData({ messages: this.formatMessages(next), thinking: false })
    this.refreshFollowUps()
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
    setTimeout(() => {
      const showFollowUps = this.data.messages.length && this.data.followUps.length && !this.data.thinking
      this.setData({ scrollTo: showFollowUps ? (this.data.followUpCategory === 'topics' ? 'followups-start' : 'followups-end') : `msg-${Math.max(0, this.data.messages.length - 1)}` })
    }, 50)
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
        this.refreshFollowUps()
      }
    })
  },

  onUnload() {
    clearTimeout(this.questionResetTimer)
    this.replyVersion = (this.replyVersion || 0) + 1
    if (this.replyTimer) clearTimeout(this.replyTimer)
    this.replyTimer = null
  },

  onShareAppMessage() {
    return { title: `和宠物顾问一起照顾${this.data.pet.name}`, path: '/pages/chat/chat' }
  }
})
