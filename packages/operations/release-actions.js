const analytics = require('../../utils/analytics')
const stamp = time => new Date(time + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ')
const data = { releaseRows: [], releaseCursor: null, releaseLoading: false, releaseError: '', releaseEdit: null, releaseSaving: false, releaseFormError: '' }
const methods = {
  async loadReleases(more = false) {
    if (!this.data.allowed || this.data.source !== 'cloud' || this.data.releaseLoading) return
    const ticket = this.releaseTicket = (this.releaseTicket || 0) + 1
    this.setData({ releaseLoading: true, releaseError: '' })
    try {
      const result = await analytics.request({ action: 'release_list', cursor: more ? this.data.releaseCursor : null })
      if (this.alive && ticket === this.releaseTicket) this.setData({ releaseRows: (more ? this.data.releaseRows : []).concat(result.rows.map(r => ({ ...r, dateLabel: stamp(r.publishedAt) }))), releaseCursor: result.cursor })
    } catch (_) { if (this.alive && ticket === this.releaseTicket) this.setData({ releaseError: '上线记录暂未加载，请重试。' }) }
    finally { if (this.alive && ticket === this.releaseTicket) this.setData({ releaseLoading: false }) }
  },
  refreshReleases() { this.loadReleases() },
  moreReleases() { if (this.data.releaseCursor) this.loadReleases(true) },
  editRelease(event) {
    if (this.data.releaseSaving || this.data.source !== 'cloud') return
    const id = event.currentTarget.dataset.id
    const row = id ? this.data.releaseRows.find(r => r.id === id) : null
    if (id && !row) return
    if (this.data.releaseEdit) { this.setData({ releaseFormError: '请先保存或收起当前编辑，再编辑其他记录。' }); return }
    const [date, time] = stamp(row ? row.publishedAt : Date.now()).split(' ')
    this.setData({ releaseEdit: { id: row?.id || '', version: row?.version || '', date, time, notes: row?.notes || '', goal: row?.goal || '', updatedAt: row?.updatedAt || 0 }, releaseFormError: '' })
  },
  inputRelease(event) {
    const field = event.currentTarget.dataset.field
    if (!this.data.releaseEdit || this.data.releaseSaving || !['version', 'date', 'time', 'notes', 'goal'].includes(field) || (field === 'version' && this.data.releaseEdit.id)) return
    this.setData({ ['releaseEdit.' + field]: event.detail.value, releaseFormError: '' })
  },
  cancelRelease() {
    if (this.data.releaseSaving || !this.data.releaseEdit) return
    wx.showModal({ title: '收起编辑', content: '未保存的上线记录内容会丢失，确定收起吗？', success: r => { if (r.confirm && this.alive && !this.data.releaseSaving) this.setData({ releaseEdit: null, releaseFormError: '' }) } })
  },
  async saveRelease() {
    const edit = this.data.releaseEdit
    if (!edit || this.data.releaseSaving || this.data.source !== 'cloud') return
    const publishedAt = Date.parse(edit.date + 'T' + edit.time + ':00+08:00'), notes = edit.notes.trim(), goal = edit.goal.trim(), version = edit.version.trim()
    if (!/^[a-zA-Z0-9._-]{1,32}$/.test(version)) { this.setData({ releaseFormError: '版本号限 32 字，可填写字母、数字、点、横线或下划线。' }); return }
    if (!Number.isSafeInteger(publishedAt) || publishedAt < Date.UTC(2020, 0, 1) || publishedAt > Date.now() || stamp(publishedAt) !== edit.date + ' ' + edit.time) { this.setData({ releaseFormError: '请填写有效的实际上线时间，不能晚于现在。' }); return }
    if (!notes || notes.length > 1000 || !goal || goal.length > 200) { this.setData({ releaseFormError: '请填写改动内容（最多 1000 字）和目标指标（最多 200 字）。' }); return }
    this.setData({ releaseSaving: true, releaseFormError: '' })
    try {
      await analytics.request({ action: 'release_save', release: { id: edit.id, version, publishedAt, notes, goal, updatedAt: edit.updatedAt } })
      if (this.alive) { this.setData({ releaseEdit: null }); wx.showToast({ title: '上线记录已保存' }); await this.loadReleases() }
    } catch (error) {
      if (this.alive) this.setData({ releaseFormError: error.message === 'release_changed' ? '该版本已存在或已被修改。草稿已保留，请复制后刷新核对最新记录。' : error.message === 'forbidden' ? '当前账号没有登记权限。' : '暂未保存，内容已保留，请检查填写内容后重试。' })
    } finally { if (this.alive) this.setData({ releaseSaving: false }) }
  }
}
module.exports = { data, methods }
