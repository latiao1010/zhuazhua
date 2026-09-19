const store = require('../../utils/store')
const knowledge = require('../../utils/pet-knowledge')
const cloudData = require('../../utils/cloud-data')
const suggestions = require('../../utils/chat-suggestions')

const TOPIC_CATEGORIES = ['日常记录', '健康观察', '护理提醒', '行为活动', '用品选择']
function topicCategory(label) {
  if (/喂食|饮水|运动|排便|体重|状态/.test(label)) return '日常记录'
  if (/护理|用药/.test(label)) return '护理提醒'
  if (/食物安全|身体异常/.test(label)) return '健康观察'
  if (/训练|雨天/.test(label)) return '行为活动'
  if (/用品|主粮/.test(label)) return '用品选择'
  return '健康观察'
}
function topicGroups(items) {
  const categorized = items.map(item => ({ ...item, category: topicCategory(item.label) }))
  return TOPIC_CATEGORIES.map(category => ({ category, items: categorized.filter(item => item.category === category) }))
}

function dateLabel(message) {
  const timestamp = Number(message && message.createdAt)
  const date = Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp) : new Date()
  const today = new Date()
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  if (day === todayKey) return '今天'
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
  if (day === yesterdayKey) return '昨天'
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

Page({
  data: {
    pet: {},
    input: '',
    thinking: false,
    replyError: '',
    messages: [],
    scrollTo: '',
    advisorGroups: [],
    featuredTopics: [],
    showAllTopics: false,
    browsingTopics: false,
    historySearch: '',
    searchMatchCount: 0,
    followUps: [],
    rootTopicLabel: '',
    followUpCategory: 'general',
    rootQuestionCategory: 'general',
    followUpHeading: '你还可以继续问'
  },

  onShow() {
    if (!Number.isFinite(this.replyVersion)) this.replyVersion = 0
    const shownReplyVersion = this.replyVersion
    cloudData.seedAndSyncSixMonthDemo().then(() => {
      if (this.data.thinking || shownReplyVersion !== this.replyVersion) return
      this.setData({ messages: this.formatMessages(store.get('chats') || []) })
      this.applyHistoryFilters()
      this.refreshFollowUps()
      this.scrollBottom()
    })
    cloudData.syncBreedKnowledge()
    const pet = store.get('pet')
    this.setData({
      pet,
      rootTopicLabel: wx.getStorageSync('paw_chat_root_label') || '日常咨询',
      rootQuestionCategory: wx.getStorageSync('paw_chat_root_category') || 'general',
      messages: this.formatMessages(store.get('chats') || []),
      advisorGroups: topicGroups(suggestions.allTopics(pet)),
      featuredTopics: suggestions.allTopics(pet).slice(0, 6),
      showAllTopics: false
    })
    this.refreshFollowUps()
    this.applyHistoryFilters()
    this.scheduleQuestionReset()
    this.scrollBottom()
  },


  formatMessages(messages) {
    let previousDate = ''
    return messages.map(message => {
      const currentDate = dateLabel(message)
      const base = { ...message, dateLabel: currentDate, showDate: currentDate !== previousDate }
      previousDate = currentDate
      if (message.role !== 'ai') return { ...base, visible:true }
      const lines = String(message.text || '').split('\n').map(line => line.trim()).filter(Boolean)
      const title = /^【.*】$/.test(lines[0] || '') ? lines.shift().slice(1, -1) : ''
      return { ...base, visible:true, answerTitle: title, answerLines: lines, needsRecord: /没有.{0,8}记录|暂无.{0,8}记录|还没.{0,8}记录|尚未.{0,8}记录|记录不足/.test(message.text) }
    })
  },

  toggleAllTopics() {
    this.setData({ showAllTopics: !this.data.showAllTopics })
  },

  applyHistoryFilters() {
    const keyword = String(this.data.historySearch || '').trim().toLowerCase()
    const groups = []
    this.data.messages.forEach((message, index) => {
      if (message.role === 'user' || !groups.length) groups.push([])
      groups[groups.length - 1].push(index)
    })
    const visibleIndices = new Set()
    let searchMatchCount = 0
    groups.forEach((indices, groupIndex) => {
      const matched = indices.some(index => String(this.data.messages[index].text || '').toLowerCase().includes(keyword))
      if (keyword && matched) searchMatchCount += 1
      if (!keyword || groupIndex === groups.length - 1 || matched) {
        indices.forEach(index => visibleIndices.add(index))
      }
    })
    let previousVisibleDate = ''
    const messages = this.data.messages.map((message, index) => {
      // 当前提问和回答不能被历史搜索隐藏，否则用户会误以为顾问没有回复。
      const visible = visibleIndices.has(index)
      const showDate = visible && message.dateLabel !== previousVisibleDate
      if (visible) previousVisibleDate = message.dateLabel
      return { ...message, visible, showDate, currentConversation: !!keyword && groups.length > 0 && index === groups[groups.length - 1][0] }
    })
    this.setData({ messages, searchMatchCount })
  },
  clearHistorySearch() { this.onHistorySearch({ detail: { value: '' } }) },
  onHistorySearch(e) {
    this.setData({ historySearch:e.detail.value })
    this.applyHistoryFilters()
    const first = this.data.messages.findIndex(message => message.visible)
    this.setData({ scrollTo: '' }, () => this.setData({ scrollTo: `msg-${Math.max(0, first)}` }))
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
      advisorGroups: this.data.advisorGroups.map(group => ({ ...group, items: decorate(group.items, 'welcome') })),
      featuredTopics: decorate(this.data.featuredTopics, 'welcome'),
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
        browsingTopics: true,
        showAllTopics: false,
        historySearch: '',
        scrollTo: ''
      }, () => {
        this.setData({ scrollTo: 'welcome-start' })
      })
      this.refreshQuestionVisits()
      return
    }
    this.askQuick(e)
  },
  returnToConversation() {
    this.setData({ browsingTopics:false })
    this.applyHistoryFilters()
    this.scrollBottom()
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
      createdAt: Date.now(),
      source: 'local-knowledge'
    }]
    this.setData({ messages: this.formatMessages(next), thinking: false, replyError: '' })
    this.applyHistoryFilters()
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
    const messages = this.formatMessages([...this.data.messages, { id: Date.now(), role: 'user', text, time: this.now(), createdAt: Date.now() }])
    this.setData({ messages, browsingTopics:false, input: '', thinking: true, replyError: '' })
    this.applyHistoryFilters()
    store.set('chats', messages)
    this.scrollBottom()
    this.generateReply(replyVersion, text, messages)
  },

  generateReply(replyVersion, text, messages) {
    this.replyTimer = setTimeout(() => {
      try {
        const answer = knowledge.createReply(text, store.get('pet'), { history: messages })
        if (typeof answer !== 'string' || !answer.trim()) throw new Error('empty_reply')
        this.finishReply(replyVersion, answer)
      } catch (error) {
        if (replyVersion !== this.replyVersion) return
        this.replyTimer = null
        this.setData({ thinking: false, replyError: '这次回答未能生成，请点击重试。' })
        this.scrollBottom()
      }
    }, 260)
  },

  retryReply() {
    if (this.data.thinking) return
    const last = this.data.messages[this.data.messages.length - 1]
    if (!last || last.role !== 'user') return
    this.replyVersion = (this.replyVersion || 0) + 1
    this.setData({ thinking: true, replyError: '' })
    this.generateReply(this.replyVersion, last.text, this.data.messages)
  },

  scrollBottom() {
    if (this.data.browsingTopics) return
    setTimeout(() => {
      if (this.data.browsingTopics) return
      const target = this.data.replyError ? 'reply-error' : `msg-${Math.max(0, this.data.messages.length - 1)}`
      this.setData({ scrollTo: '' }, () => this.setData({ scrollTo: target }))
    }, 50)
  },

  clearChat() {
    wx.showActionSheet({
      itemList: ['清空聊天记录'],
      success: () => {
        if (cloudData.isReadOnly()) return wx.showToast({ title: '只读成员不能清空聊天', icon: 'none' })
        wx.showModal({ title: '清空聊天记录？', content: '全部聊天记录将被清空，无法撤销。', confirmText: '清空', success: result => {
        if (!result.confirm) return
        let saved
        try { saved = store.set('chats', []) } catch (error) {
          wx.showToast({ title: '清空失败，请重试', icon: 'none' })
          return
        }
        this.replyVersion = (this.replyVersion || 0) + 1
        if (this.replyTimer) clearTimeout(this.replyTimer)
        this.replyTimer = null
        this.setData({ messages: [], scrollTo: '', thinking: false, replyError: '', historySearch: '' })
        this.refreshFollowUps()
        Promise.resolve(saved).then(result => {
          if (result && result.ok === false) {
            this.setData({ messages: this.formatMessages(store.get('chats') || []) })
            this.applyHistoryFilters()
            this.refreshFollowUps()
            wx.showToast({ title: result.error === 'readonly' ? '只读成员不能清空聊天' : '本机已清空，云端待同步', icon: 'none' })
          }
        }).catch(() => wx.showToast({ title: '请检查数据保存状态', icon: 'none' }))
        } })
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
