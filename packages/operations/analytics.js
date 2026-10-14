const analytics = require('../../utils/analytics')
const feedback = require('../../utils/user-feedback')
const releases = require('./release-actions')
const kindNames = { view: '访问', click: '点击', complete: '完成', error: '失败', share: '分享入口' }
const actionNames = { page: '进入模块', save_local: '保存到本机', save_cloud: '云端同步', reply: '生成回答', poster: '生成带码图片', save_image: '保存到相册', export_file: '导出文件', summary: '生成摘要', favorite: '收藏操作', copy_address: '复制地址', tool_result: '生成结果', image_menu: '打开图片分享', message_menu: '打开微信分享', timeline_menu: '打开朋友圈分享', unexpected: '操作异常', weather_load: '获取天气' }
const reasonNames = { permission: '权限不足', timeout: '超时', network: '网络异常', validation: '输入无效', unavailable: '服务或存储异常' }
Page({
  data: { ...releases.data, loading: false, allowed: false, debug: false, source: 'cloud', days: 30, summary: null, rows: [], actions: [], daily: [], error: '', selectedModule: '', moduleLabel: '', showEmpty: false,
    exposureRows: [], versionOptions: [], versionA: 0, versionB: 1, comparisonRows: [], health: null, healthError: '', healthLoading: false, historyRows: [], historyCursor: null, historyLoading: false, historyError: '',
    quality: null, qualityLoading: false, qualityError: '', feedbackEdit: null, replyError: '', replyStates: Object.entries(analytics.operations.feedbackStates).map(([value, label]) => ({ value, label })),
    tab: 'overview', operations: null, operationsError: '', feedbackRows: [], feedbackLoading: false, feedbackError: '', feedbackStatus: '', feedbackCursor: null, feedbackSaving: false,
    feedbackStates: [{ value: '', label: '全部' }, ...Object.entries(analytics.operations.feedbackStates).map(([value, label]) => ({ value, label }))] },
  ...releases.methods,
  onLoad() { this.alive = true; this.replyDrafts = {}; this.refresh() },
  onUnload() { this.alive = false; this.version = (this.version || 0) + 1 },
  onPullDownRefresh() { this.refresh().finally(() => wx.stopPullDownRefresh()) },
  async refresh() {
    if (this.data.feedbackSaving || this.data.releaseSaving) return
    this.releaseTicket = (this.releaseTicket || 0) + 1
    this.setData({ releaseRows: [], releaseCursor: null, releaseLoading: false, releaseError: '' })
    const version = this.version = (this.version || 0) + 1
    this.feedbackVersion = (this.feedbackVersion || 0) + 1
    this.healthVersion = (this.healthVersion || 0) + 1
    this.historyVersion = (this.historyVersion || 0) + 1
    this.qualityVersion = (this.qualityVersion || 0) + 1
    this.setData({ quality: null, qualityLoading: false, qualityError: '' })
    this.setData({ health: null, healthError: '', healthLoading: false, historyRows: [], historyCursor: null, historyError: '', historyLoading: false })
    this.setData({ loading: true, error: '', operations: null, operationsError: '', feedbackRows: [], feedbackCursor: null, feedbackLoading: false })
    try {
      const access = await analytics.access()
      if (!this.alive || version !== this.version) return
      if (!access.visible) throw new Error('forbidden')
      const source = this.sourceChosen ? this.data.source : access.debug ? 'local' : 'cloud'
      this.setData({ allowed: true, debug: access.debug, source })
      const local = source === 'local' && access.debug
      const [result, ops] = await Promise.all([
        local ? analytics.localSummary(this.data.days) : analytics.request({ action: 'summary', days: this.data.days }),
        local ? { operations: analytics.localOperations(this.data.days) } : analytics.request({ action: 'operations', days: this.data.days }).catch(() => ({ error: true }))
      ])
      if (!this.alive || version !== this.version) return
      this.result = result
      const totals = result.rows.reduce((sum, row) => { for (const key of ['views', 'clicks', 'completes', 'errors', 'shares']) sum[key] += row[key]; return sum }, { users: result.users, views: 0, clicks: 0, completes: 0, errors: 0, shares: 0 })
      const peak = Math.max(1, ...result.daily.map(day => day.clicks))
      this.setData({ summary: totals, range: result.start + ' 至 ' + result.end, updated: new Date().toLocaleTimeString(), daily: result.daily.map(day => ({ ...day, label: day.day.slice(5), height: Math.max(2, Math.round(day.clicks / peak * 100)) })) })
      this.renderRows(); this.renderActions()
      if (ops.error) this.setData({ operationsError: '运营汇总暂未连接，基础点击统计仍可查看。请确认新版统计云函数已部署。' })
      else this.renderOperations(ops.operations)
      if (this.data.tab === 'feedback') this.loadFeedback()
      if (this.data.tab === 'versions') this.loadReleases()
      this.loadHealth()
      if (this.data.tab === 'health') { this.loadHistory(); this.loadQuality() }
    } catch (error) {
      if (!this.alive || version !== this.version) return
      this.result = null
      this.setData({ summary: null, operations: null, rows: [], actions: [], daily: [], error: error.message === 'forbidden' ? '当前微信账号没有查看正式统计的权限。' : '统计服务暂未连接，请稍后重试。' })
    } finally { if (this.alive && version === this.version) this.setData({ loading: false }) }
  },
  changeRange(event) { const days = Number(event.currentTarget.dataset.days); if (![1, 7, 30].includes(days) || days === this.data.days) return; this.setData({ days }); this.refresh() },
  changeSource(event) { const source = event.currentTarget.dataset.source; if (this.data.feedbackSaving || this.data.releaseSaving || this.data.releaseEdit || !this.data.debug || !['local', 'cloud'].includes(source) || source === this.data.source) return; this.sourceChosen = true; this.setData({ source, selectedModule: '', moduleLabel: '', feedbackEdit: null, replyError: '' }); this.refresh() },
  toggleEmpty() { this.setData({ showEmpty: !this.data.showEmpty }); this.renderRows() },
  changeTab(event) {
    const tab = event.currentTarget.dataset.tab
    if (!['overview', 'exposures', 'funnels', 'channels', 'versions', 'health', 'modules', 'feedback'].includes(tab)) return
    this.setData({ tab })
    if (tab === 'versions' && !this.data.releaseRows.length) this.loadReleases()
    if (tab === 'feedback' && !this.data.feedbackRows.length) this.loadFeedback()
    if (tab === 'health') { this.loadHealth(); this.loadQuality(); if (!this.data.historyRows.length) this.loadHistory() }
  },
  renderOperations(ops) {
    const peak = Math.max(1, ...ops.daily.map(d => d.users))
    const percent = (n, total) => total ? Math.round(n / total * 100) + '%' : '—'
    this.setData({ operations: { ...ops,
      measures: (ops.measures || []).map(r => ({ ...r, moduleLabel: analytics.catalog.modules[r.module] || r.module })),
      retention: ops.retention.map(row => ({ ...row, rate: row.eligible ? percent(row.returned, row.eligible) : row.pending ? '待观察' : '暂无样本' })),
      channels: ops.channels.map(row => ({ ...row, label: analytics.operations.channels[row.channel] || '未识别来源', activation: percent(row.recordUsers, row.users), retention: percent(row.returned7 || 0, row.eligible7 || 0) })),
      daily: ops.daily.map(day => ({ ...day, label: day.day.slice(5), height: Math.max(2, Math.round(day.users / peak * 100)) })) } })
    const grouped = Object.fromEntries(Object.entries(analytics.metrics.entries).map(([entry, spec]) => [entry, { entry, label: spec.label, impressions: 0, clicks: 0 }]))
    for (const row of ops.exposures || []) if (grouped[row.entry]) { grouped[row.entry].impressions += row.impressions; grouped[row.entry].clicks += row.clicks }
    this.setData({ exposureRows: Object.values(grouped).map(r => ({ ...r, rate: percent(r.clicks, r.impressions) })),
      versionOptions: (ops.versionComparison || []).map(r => r.version), versionA: 0, versionB: (ops.versionComparison || []).length > 1 ? 1 : 0 })
    this.renderComparison()
  },
  chooseVersion(event) {
    const field = event.currentTarget.dataset.field, index = Number(event.detail.value)
    if (!['versionA', 'versionB'].includes(field) || !this.data.versionOptions[index]) return
    this.setData({ [field]: index }); this.renderComparison()
  },
  renderComparison() {
    const versions = this.data.operations?.versionComparison || []
    const a = versions[this.data.versionA], b = versions[this.data.versionB]
    const rate = n => n === null || n === undefined ? '—' : n + '%'
    const rows = []
    if (a && b) {
      for (const [name, spec] of Object.entries(analytics.operations.flows)) {
        const x = a.flows.find(r => r.name === name), y = b.flows.find(r => r.name === name)
        rows.push({ key: name, label: spec.label + ' · 完成率', a: rate(x?.rate), b: rate(y?.rate), noteA: `${x?.completed || 0} / ${x?.started || 0} 次`, noteB: `${y?.completed || 0} / ${y?.started || 0} 次`, small: (x?.started || 0) < 20 || (y?.started || 0) < 20 })
      }
      const keys = [...new Set([...a.measures, ...b.measures].map(m => m.module + ':' + m.operation))]
      for (const key of keys) {
        const x = a.measures.find(m => m.module + ':' + m.operation === key), y = b.measures.find(m => m.module + ':' + m.operation === key), ref = x || y
        const label = analytics.catalog.modules[ref.module] + ' · ' + ref.label
        rows.push({ key, label: label + '失败率', a: rate(x?.failureRate), b: rate(y?.failureRate), noteA: `${x?.failure || 0} / ${x?.attempts || 0} 次`, noteB: `${y?.failure || 0} / ${y?.attempts || 0} 次`, small: (x?.attempts || 0) < 20 || (y?.attempts || 0) < 20 })
        rows.push({ key: key + ':time', label: label + '平均耗时', a: x?.avgMs == null ? '—' : x.avgMs + ' ms', b: y?.avgMs == null ? '—' : y.avgMs + ' ms', noteA: '', noteB: '', small: false })
      }
    }
    this.setData({ comparisonRows: rows })
  },
  async loadHealth() {
    if (!this.data.allowed || this.data.healthLoading) return
    const ticket = this.healthVersion = (this.healthVersion || 0) + 1
    this.setData({ healthLoading: true, healthError: '' })
    try {
      const local = this.data.source === 'local'
      const result = local ? { alerts: this.data.operations?.alerts || [], maintenance: null } : await analytics.request({ action: 'maintenance_status' })
      if (this.alive && ticket === this.healthVersion) this.setData({ health: { ...result, lastRun: result.maintenance?.lastSuccessAt ? new Date(result.maintenance.lastSuccessAt).toLocaleString() : '' } })
    } catch (_) { if (this.alive && ticket === this.healthVersion) this.setData({ healthError: '告警与维护状态暂未加载，请重试。' }) }
    finally { if (this.alive && ticket === this.healthVersion) this.setData({ healthLoading: false }) }
  },
  async loadHistory(more = false) {
    if (!this.data.allowed || this.data.historyLoading || this.data.source === 'local') return
    const ticket = this.historyVersion = (this.historyVersion || 0) + 1
    this.setData({ historyLoading: true, historyError: '' })
    try {
      const result = await analytics.request({ action: 'history', cursor: more ? this.data.historyCursor : null })
      if (this.alive && ticket === this.historyVersion) this.setData({ historyRows: (more ? this.data.historyRows : []).concat(result.rows), historyCursor: result.cursor })
    } catch (_) { if (this.alive && ticket === this.historyVersion) this.setData({ historyError: '历史日报暂未加载。' }) }
    finally { if (this.alive && ticket === this.historyVersion) this.setData({ historyLoading: false }) }
  },
  refreshHistory() { this.loadHistory() },
  moreHistory() { if (this.data.historyCursor) this.loadHistory(true) },
  async loadQuality() {
    if (!this.data.allowed || this.data.qualityLoading || this.data.source === 'local') return
    const ticket = this.qualityVersion = (this.qualityVersion || 0) + 1
    this.setData({ qualityLoading: true, qualityError: '' })
    try {
      const result = await analytics.request({ action: 'delivery_summary', days: this.data.days })
      if (!this.alive || ticket !== this.qualityVersion) return
      const time = value => value ? new Date(value).toLocaleString() : '暂无记录'
      const duration = value => value === null ? '暂无样本' : value < 1000 ? value + ' ms' : value < 60000 ? (value / 1000).toFixed(1) + ' 秒' : (value / 60000).toFixed(1) + ' 分钟'
      const totals = result.rows.reduce((s, r) => ({ received: s.received + r.received, dropped: s.dropped + r.overflow + r.expired + r.rejected, failedBatches: s.failedBatches + r.failedBatches, snapshots: s.snapshots + r.snapshots }), { received: 0, dropped: 0, failedBatches: 0, snapshots: 0 })
      this.setData({ quality: { ...result, ...totals, rows: result.rows.map(r => ({ ...r, lastReceivedLabel: time(r.lastReceivedAt), lastReportLabel: time(r.lastReportAt), latencyLabel: duration(r.avgLatencyMs), maxLatencyLabel: duration(r.maxLatencyMs) })) } })
    } catch (_) { if (this.alive && ticket === this.qualityVersion) this.setData({ qualityError: '发送诊断暂未加载，请确认新版云函数已部署后重试。' }) }
    finally { if (this.alive && ticket === this.qualityVersion) this.setData({ qualityLoading: false }) }
  },
  async loadFeedback(more = false) {
    if (!this.data.allowed || this.data.feedbackLoading) return
    const ticket = this.feedbackVersion = (this.feedbackVersion || 0) + 1, source = this.data.source
    this.setData({ feedbackLoading: true, feedbackError: '' })
    try {
      const result = await feedback.list({ local: source === 'local' && this.data.debug, admin: true, status: this.data.feedbackStatus, cursor: more ? this.data.feedbackCursor : null })
      if (this.alive && ticket === this.feedbackVersion) this.setData({ feedbackRows: (more ? this.data.feedbackRows : []).concat(result.rows.map(feedback.view)), feedbackCursor: result.cursor })
    } catch (e) { if (this.alive && ticket === this.feedbackVersion) this.setData({ feedbackError: e.message === 'forbidden' ? '当前账号没有反馈管理权限。' : '反馈加载失败，请重试。' }) }
    finally { if (this.alive && ticket === this.feedbackVersion) this.setData({ feedbackLoading: false }) }
  },
  refreshFeedback() { this.loadFeedback() },
  moreFeedback() { if (this.data.feedbackCursor) this.loadFeedback(true) },
  filterFeedback(event) {
    const status = event.currentTarget.dataset.status
    if (status !== '' && !analytics.operations.has(analytics.operations.feedbackStates, status)) return
    this.feedbackVersion = (this.feedbackVersion || 0) + 1
    this.setData({ feedbackStatus: status, feedbackLoading: false, feedbackRows: [], feedbackCursor: null }); this.loadFeedback()
  },
  changeFeedback(event) {
    if (this.data.feedbackSaving) return
    const row = this.data.feedbackRows.find(r => r.id === event.currentTarget.dataset.id)
    if (!row) return
    const key = this.data.source + ':' + row.id, draft = this.replyDrafts[key]
    this.setData({ feedbackEdit: draft || { id: row.id, updatedAt: row.updatedAt, reply: row.reply || '', fixVersion: row.fixVersion || '', statusIndex: Math.max(0, this.data.replyStates.findIndex(s => s.value === row.status)), source: this.data.source }, replyError: draft && draft.updatedAt !== row.updatedAt ? '反馈已有更新，草稿已保留。请核对上方最新回复后，再确认继续处理。' : '' })
  },
  editReply(event) {
    if (!this.data.feedbackEdit || this.data.feedbackSaving) return
    const field = event.currentTarget.dataset.field
    if (!['reply', 'fixVersion'].includes(field)) return
    this.setData({ ['feedbackEdit.' + field]: event.detail.value, replyError: '' })
    this.rememberReply()
  },
  chooseReplyStatus(event) {
    const index = Number(event.detail.value)
    if (!this.data.feedbackEdit || this.data.feedbackSaving || !this.data.replyStates[index]) return
    this.setData({ 'feedbackEdit.statusIndex': index, replyError: '' })
    this.rememberReply()
  },
  rememberReply() { const edit = this.data.feedbackEdit; if (edit) this.replyDrafts[edit.source + ':' + edit.id] = { ...edit } },
  acceptLatestReply() {
    const edit = this.data.feedbackEdit, row = this.data.feedbackRows.find(r => r.id === edit?.id)
    if (!row || this.data.feedbackSaving) return
    wx.showModal({ title: '继续处理最新反馈', content: '请确认已核对上方最新回复。继续后，你的草稿将用于更新这条反馈。', confirmText: '继续编辑', success: result => {
      if (!result.confirm || !this.alive || this.data.feedbackEdit?.id !== edit.id || this.data.source !== edit.source) return
      this.setData({ 'feedbackEdit.updatedAt': row.updatedAt, replyError: '' }); this.rememberReply()
    } })
  },
  cancelReply() { if (!this.data.feedbackSaving) this.setData({ feedbackEdit: null, replyError: '' }) },
  async saveReply() {
    const edit = this.data.feedbackEdit
    if (!edit || this.data.feedbackSaving || edit.source !== this.data.source) return
    const status = this.data.replyStates[edit.statusIndex].value
    if ((status === 'resolved' || edit.fixVersion.trim()) && !edit.reply.trim()) { this.setData({ replyError: '请填写处理说明，让用户了解结果。' }); return }
    if (edit.fixVersion.trim() && !/^[a-zA-Z0-9._-]{1,32}$/.test(edit.fixVersion.trim())) { this.setData({ replyError: '版本请使用字母、数字、点、横线或下划线，最多 32 字。' }); return }
    this.setData({ feedbackSaving: true, replyError: '' })
    try {
      await feedback.update(edit, status, edit.source === 'local', edit)
      if (this.alive) { delete this.replyDrafts[edit.source + ':' + edit.id]; this.setData({ feedbackEdit: null }); wx.showToast({ title: '处理结果已保存' }); this.loadFeedback() }
    } catch (error) {
      if (this.alive) this.setData({ replyError: error.message === 'feedback_changed' ? '这条反馈已被更新。内容已保留，请先刷新核对，重新打开处理。' : error.message === 'invalid_feedback_reply' ? '回复或修复版本格式不正确。' : '暂未保存，内容已保留，请重试。' })
    } finally { if (this.alive) this.setData({ feedbackSaving: false }) }
  },
  renderRows() {
    if (!this.result) return
    this.setData({ rows: this.result.rows.filter(row => this.data.showEmpty || row.views + row.clicks + row.completes + row.errors + row.shares > 0).sort((a, b) => b.clicks - a.clicks || b.views - a.views) })
  },
  chooseModule(event) {
    const module = event.currentTarget.dataset.module
    if (!analytics.catalog.modules[module]) return
    this.setData({ selectedModule: this.data.selectedModule === module ? '' : module, moduleLabel: this.data.selectedModule === module ? '' : analytics.catalog.modules[module] }); this.renderActions()
  },
  renderActions() {
    if (!this.result) return
    const actions = this.result.actions.filter(row => !this.data.selectedModule || row.module === this.data.selectedModule).sort((a, b) => b.count - a.count).slice(0, 30).map(row => ({ ...row, id: [row.module, row.action, row.kind, row.reason || ''].join(':'), moduleLabel: analytics.catalog.modules[row.module], actionLabel: actionNames[row.action] || analytics.catalog.actionLabels[row.action] || '模块操作', kindLabel: kindNames[row.kind], reasonLabel: reasonNames[row.reason] || '' }))
    this.setData({ actions, actionsLimited: !!this.result.actionsLimited })
  }
})
