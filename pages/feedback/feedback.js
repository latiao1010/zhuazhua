const analytics = require('../../utils/analytics')
const feedback = require('../../utils/user-feedback')
const categories = Object.entries(analytics.operations.feedbackTypes).map(([value, label]) => ({ value, label }))
const modules = Object.entries(analytics.catalog.modules).map(([value, label]) => ({ value, label }))
Page({
  data: { categories, modules, categoryIndex: 0, moduleIndex: 2, message: '', sending: false, loading: false, rows: [], cursor: null, error: '', debug: true, admin: false, privacyOpen: false, enabled: true },
  onLoad() {
    this.alive = true
    this.mode = analytics.isDebug()
    this.draftKey = 'paw_feedback_draft_' + (this.mode ? 'local' : 'release')
    let draft
    try { draft = wx.getStorageSync(this.draftKey) } catch (_) {}
    if (draft && typeof draft.message === 'string') {
      this.setData({ message: draft.message.slice(0, 1000), categoryIndex: categories[draft.categoryIndex] ? draft.categoryIndex : 0, moduleIndex: modules[draft.moduleIndex] ? draft.moduleIndex : 2 })
      this.submissionId = /^[a-z0-9-]{10,70}$/.test(draft.id || '') ? draft.id : null
    }
    this.setData({ debug: this.mode, enabled: analytics.enabled() })
    analytics.access().then(access => { if (this.alive) this.setData({ admin: access.visible }) })
    this.loadRows()
  },
  onUnload() { this.alive = false },
  onShow() { if (this.shown && this.mode === analytics.isDebug()) this.loadRows(); this.shown = true },
  saveDraft() {
    try { wx.setStorageSync(this.draftKey, { message: this.data.message, categoryIndex: this.data.categoryIndex, moduleIndex: this.data.moduleIndex, id: this.submissionId }) } catch (_) {}
  },
  input(event) { this.submissionId = null; this.setData({ message: event.detail.value, error: '' }); this.saveDraft() },
  chooseCategory(event) { this.submissionId = null; this.setData({ categoryIndex: Number(event.detail.value) }); this.saveDraft() },
  chooseModule(event) { this.submissionId = null; this.setData({ moduleIndex: Number(event.detail.value) }); this.saveDraft() },
  async submit() {
    if (this.data.sending) return
    const message = this.data.message.trim()
    if (message.length < 5) { this.setData({ error: '请至少写 5 个字，描述遇到的问题或建议。' }); return }
    if (this.mode !== analytics.isDebug()) { this.setData({ error: '数据模式已变化，请重新进入反馈页面。' }); return }
    this.setData({ sending: true, error: '' })
    this.submissionId = this.submissionId || analytics.newId(); this.saveDraft()
    try {
      await feedback.submit({ id: this.submissionId, message, type: categories[this.data.categoryIndex].value, module: modules[this.data.moduleIndex].value })
      if (!this.alive) return
      this.submissionId = null; this.setData({ message: '' }); this.saveDraft()
      wx.showToast({ title: this.mode ? '已保存调试反馈' : '反馈已提交', icon: 'success' })
      await this.loadRows()
    } catch (e) {
      if (this.alive) this.setData({ error: e.message === 'feedback_limit' ? '今天已提交 5 条反馈，请明天再试。' : '暂未提交成功，内容已保留，请重试。' })
    } finally { if (this.alive) this.setData({ sending: false }) }
  },
  async loadRows(more = false) {
    if (more && this.data.loading) return
    const ticket = this.listVersion = (this.listVersion || 0) + 1
    this.setData({ loading: true, listError: '' })
    try {
      const result = await feedback.list({ local: this.mode, cursor: more ? this.data.cursor : null })
      if (this.alive && ticket === this.listVersion) this.setData({ rows: (more ? this.data.rows : []).concat(result.rows.map(feedback.view)), cursor: result.cursor })
    } catch (_) { if (this.alive && ticket === this.listVersion) this.setData({ listError: '反馈记录暂未加载，点击重试。' }) }
    finally { if (this.alive && ticket === this.listVersion) this.setData({ loading: false }) }
  },
  refreshRows() { this.loadRows() },
  moreRows() { if (this.data.cursor) this.loadRows(true) },
  togglePrivacy() { this.setData({ privacyOpen: !this.data.privacyOpen }) },
  toggleAnalytics(event) {
    const persisted = analytics.setEnabled(!!event.detail.value)
    this.setData({ enabled: analytics.enabled() })
    if (!persisted) wx.showModal({ title: '设置暂未保存', content: '本次设置已生效，但本机存储失败。重新打开小程序后，请再确认一次统计开关。', showCancel: false })
  },
  openAnalytics() { wx.navigateTo({ url: '/packages/operations/analytics' }) }
})
