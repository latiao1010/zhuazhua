const store = require('../../utils/store')
const cloudData = require('../../utils/cloud-data')
const cloud = require('../../utils/cloud')
const summary = require('../../utils/visit-summary')
const exportCache = require('../../utils/export-cache')
const VISIT_RECORD_KEYS = ['feeds', 'waters', 'stools', 'walks', 'careRecords', 'weightRecords']
function rangeStart(end, preset) {
  const date = new Date(`${end}T00:00:00`)
  if (preset === 'halfYear') {
    const day = date.getDate()
    date.setDate(1)
    date.setMonth(date.getMonth() - 6)
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
    date.setDate(Math.min(day, lastDay))
    date.setDate(date.getDate() + 1)
  } else date.setDate(date.getDate() - (preset === '30' ? 29 : 6))
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}
const careLabels = { deworming: '体内外驱虫', medicine: '用药提醒', vaccine: '疫苗接种', bath: '洗澡护理', dental: '刷牙护理', nail: '修剪指甲' }
function changeSummary(value) {
  if (value == null) return '无'
  if (typeof value !== 'object') return String(value)
  const fields = ['name','type','food','amount','condition','color','duration','weight','date','dayKey','time','productName']
  const text = fields.filter(key => value[key] !== undefined && value[key] !== '').map(key => value[key]).join(' · ')
  return text || (Array.isArray(value) ? `${value.length} 项` : '配置已更新')
}
Page({
  data: { pageVisible: true, demo: false, showDemoSwitch: false, syncing: false, previewLoading: false, remoteChanges: [], renderedRemoteChanges: [], remoteVisibleCount: 20, syncText: '', start: '', end: '', today: '', summaryText: '', summaryHeader: '', summarySections: [], recordCount: 0, activeRange: '7', rangePreset: '7', rangeError: '', exporting: false, redact: false, reminderTime: '09:00', reminderReady: false, reminderMessage: '正在检查提醒服务…', careItems: [], reminderBusy: false },
  onShow() {
    exportCache.cleanup()
    this.setData({ pageVisible:true })
    const today = store.todayKey()
    const preset = this.data.rangePreset
    const start = preset ? rangeStart(today, preset) : this.data.start
    const end = preset ? today : this.data.end
    const care = store.get('care')
    let showDemoSwitch = false
    try { showDemoSwitch = wx.getAccountInfoSync().miniProgram.envVersion === 'develop' } catch (_) {}
    this.setData({ demo: store.isDemoMode(), showDemoSwitch, today, start, end, careItems: Object.keys(careLabels).map(key => ({ key, label: careLabels[key], date: care[key] || '未设置' })) })
    this.refreshSync()
    this.loadRemoteChanges()
    this.loadReminder()
  },
  onHide() { this.setData({ pageVisible:false }) },
  async loadRemoteChanges() {
    if (this.data.demo || this.data.previewLoading) return
    this.setData({ previewLoading:true })
    const result = await cloudData.previewRemoteChanges()
    const remoteChanges = (result.changes || []).map(item => ({ ...item, selected:true, localText:changeSummary(item.localValue), remoteText:changeSummary(item.remoteValue), timeText:item.time ? new Date(item.time).toLocaleString() : '' }))
    this.setData({ previewLoading:false, remoteChanges, renderedRemoteChanges:remoteChanges.slice(0, 20), remoteVisibleCount:20, remoteChangeCount:remoteChanges.length })
  },
  toggleRemoteChange(e) {
    const index=Number(e.currentTarget.dataset.index)
    const remoteChanges = this.data.remoteChanges.map((item, itemIndex) => itemIndex === index ? { ...item, selected: !item.selected } : item)
    this.setData({ remoteChanges, renderedRemoteChanges:remoteChanges.slice(0, this.data.remoteVisibleCount) })
  },
  loadMoreRemoteChanges() {
    const remoteVisibleCount = Math.min(this.data.remoteChanges.length, this.data.remoteVisibleCount + 20)
    this.setData({ remoteVisibleCount, renderedRemoteChanges:this.data.remoteChanges.slice(0, remoteVisibleCount) })
  },
  async applySelectedChanges() {
    const selected=this.data.remoteChanges.filter(item=>item.selected)
    if (!selected.length) return wx.showToast({ title:'请先选择要应用的修改', icon:'none' })
    this.setData({ syncing:true })
    const result=await cloudData.applyRemoteChanges(selected)
    const applied = new Set((result.appliedChanges || []).map(item => `${item.key}:${item.recordId}`))
    const remoteChanges = this.data.remoteChanges.filter(item => !applied.has(`${item.key}:${item.recordId}`))
    const remoteVisibleCount = Math.min(Math.max(20, this.data.remoteVisibleCount), remoteChanges.length)
    this.setData({ syncing:false, remoteChanges, renderedRemoteChanges:remoteChanges.slice(0, remoteVisibleCount), remoteVisibleCount, remoteChangeCount:remoteChanges.length })
    this.refreshSync()
    wx.showToast({ title:result.skipped ? '部分记录有本机待同步修改' : `已应用 ${result.applied} 项`, icon:'none' })
  },
  refreshSync() {
    this.refreshVisitData()
    const s = cloudData.getSyncStatus()
    this.setData({ syncText: ({ demo:'演示数据',success:'数据已安全同步',pending:'正在等待同步',syncing:'正在同步',fail:'同步失败',conflict:'发现记录冲突' })[s.status] || '等待首次同步', pendingCount:s.pending, syncDetail: s.status === 'demo' ? '演示记录仅保存在本机，不会上传到正式云档案。' : s.error || (s.updatedAt ? `最近同步：${new Date(s.updatedAt).toLocaleString()}` : '连接网络后会自动同步') })
  },
  async retrySync() {
    if (this.data.syncing || this.data.demo) return
    this.setData({ syncing:true })
    await cloudData.retryPending()
    this.setData({ syncing:false })
    this.refreshSync()
    this.loadRemoteChanges()
  },
  useCloudVersion() {
    wx.showModal({ title:'使用云端最新记录', content:'当前设备尚未同步的冲突修改会被放弃，并重新载入其他成员已经保存的版本。', confirmText:'使用云端版本', success:async result=> {
      if (!result.confirm) return
      this.setData({ syncing:true })
      await cloudData.discardPendingAndSync()
      this.setData({ syncing:false })
      this.refreshSync()
    } })
  },
  switchMode(e) {
    if (this.data.syncing || cloudData.getSyncStatus().status === 'syncing') return wx.showToast({ title:'请等待同步完成', icon:'none' })
    const enabled = e.detail.value
    store.setDemoMode(enabled)
    wx.reLaunch({ url:'/pages/profile/profile' })
  },
  refreshVisitCount() {
    const { start, end } = this.data
    const error = summary.rangeError(start, end, store.todayKey())
    if (error) {
      this.setData({ recordCount:0, rangeError:error, activeRange:'' })
      return 0
    }
    const recordCount = VISIT_RECORD_KEYS.reduce((count, key) => count + (store.get(key) || []).filter(record => (record.dayKey || record.date) >= start && (record.dayKey || record.date) <= end).length, 0)
    const today = store.todayKey()
    const activeRange = end === today ? ['7', '30', 'halfYear'].find(preset => rangeStart(today, preset) === start) || '' : ''
    this.setData({ recordCount, activeRange, rangeError:'' })
    return recordCount
  },
  refreshVisitData() {
    const count = this.refreshVisitCount()
    if (!this.data.summaryText) return
    if (!count) return this.setData({ summaryText:'' })
    try { this.updateSummaryPreview() }
    catch (_) { this.setData({ summaryText:'' }) }
  },
  selectVisitRange(e) {
    const preset = e.currentTarget.dataset.range
    if (!['7', '30', 'halfYear'].includes(preset)) return
    const end = store.todayKey()
    this.setData({ start:rangeStart(end, preset), end, today:end, rangePreset:preset, summaryText:'' })
    this.refreshVisitCount()
  },
  onStart(e) { this.setData({ start:e.detail.value, rangePreset:'', summaryText:'' }); this.refreshVisitCount() },
  onEnd(e) { this.setData({ end:e.detail.value, rangePreset:'', summaryText:'' }); this.refreshVisitCount() },
  onRedact(e) { this.setData({ redact: e.detail.value, summaryText:'' }) },
  updateSummaryPreview() {
    const options = { redact:this.data.redact }
    const report = summary.buildReport(this.data.start, this.data.end, options)
    this._visitSections = report.sections
    const expanded = new Set((this.data.summarySections || []).filter(section => section.expanded).map(section => section.key))
    this.setData({
      summaryText:summary.buildSummary(this.data.start, this.data.end, options),
      summaryHeader:report.header,
      summarySections:report.sections.map(section => ({ key:section.key, label:section.label, count:section.count, expanded:expanded.has(section.key), visibleCount:20, entries:expanded.has(section.key) ? section.entries.slice(0, 20) : [] }))
    })
  },
  toggleSummarySection(e) {
    const key = e.currentTarget.dataset.key
    const source = (this._visitSections || []).find(section => section.key === key)
    if (!source) return
    this.setData({ summarySections:this.data.summarySections.map(section => section.key === key ? { ...section, expanded:!section.expanded, visibleCount:20, entries:section.expanded ? [] : source.entries.slice(0, 20) } : section) })
  },
  moreSummaryRecords(e) {
    const key = e.currentTarget.dataset.key
    const source = (this._visitSections || []).find(section => section.key === key)
    if (!source) return
    this.setData({ summarySections:this.data.summarySections.map(section => section.key === key ? { ...section, visibleCount:section.visibleCount + 20, entries:source.entries.slice(0, section.visibleCount + 20) } : section) })
  },
  generateSummary() {
    if (!this.refreshVisitCount()) return wx.showToast({ title:this.data.rangeError || '该时间段暂无记录，请调整日期', icon:'none' })
    try { this.updateSummaryPreview() }
    catch(e) { wx.showToast({ title:e.message, icon:'none' }) }
  },
  copySummary() { if(this.data.summaryText) wx.setClipboardData({ data:this.data.summaryText }) },
  exportVisitData() {
    if (this.data.exporting) return
    if (!this.refreshVisitCount()) return wx.showToast({ title:this.data.rangeError || '该时间段暂无记录，请调整日期', icon:'none' })
    try {
      const content = summary.buildSummary(this.data.start, this.data.end, { redact:this.data.redact })
      this.shareTextFile(`就诊记录_${this.data.start}_${this.data.end}.txt`, content)
    } catch (error) { wx.showToast({ title:error.message || '资料生成失败', icon:'none' }) }
  },
  shareTextFile(name, content) {
    if (this.data.exporting) return
    this.setData({ exporting:true })
    let path
    const failed = (error, writing) => {
      if (path) exportCache.end(path)
      this.setData({ exporting:false })
      const message = String(error && (error.errMsg || error.message) || '')
      if (/cancel/i.test(message)) return
      wx.showModal({ title:writing ? '文件生成失败' : '导出未完成', content:writing ? '请检查设备存储空间后重新导出。' : '当前环境未能导出文件，请在手机微信中重试，或更新微信后再试。', showCancel:false })
    }
    try {
      path = `${wx.env.USER_DATA_PATH}/${name}`
      exportCache.begin(path)
      wx.getFileSystemManager().writeFile({ filePath:path, data:content, encoding:'utf8', success:()=> {
        exportCache.remember(path)
        let platform = ''
        try { platform = wx.getDeviceInfo ? wx.getDeviceInfo().platform : wx.getSystemInfoSync().platform } catch (_) {}
        const saveToDisk = ['windows', 'mac', 'devtools'].includes(platform) && typeof wx.saveFileToDisk === 'function'
        const exportFile = saveToDisk ? wx.saveFileToDisk : wx.shareFileMessage
        if (typeof exportFile !== 'function') return failed(new Error('unsupported'))
        try {
          exportFile.call(wx, { filePath:path, ...(saveToDisk ? {} : { fileName:name }),
            success:()=> { exportCache.end(path); this.setData({ exporting:false }); wx.showToast({ title:'导出成功', icon:'success' }) },
            fail:error=>failed(error, false)
          })
        } catch (error) { failed(error, false) }
      }, fail:error=>failed(error, true) })
    } catch (error) { failed(error, true) }
  },
  async loadReminder() {
    if (this.data.demo || !cloud.isAvailable()) return this.setData({ reminderReady:false, reminderMessage:'当前模式不发送微信通知，可在护理详情调整提醒日期。' })
    try {
      const result = await cloud.callFunction('pet-data',{ action:'getCareReminderConfig' })
      this.templateId = result.templateId
      this.setData({ reminderReady:!!result.ready, reminderMessage:result.ready ? '每次订阅一条提醒；调整日期后需重新订阅。' : '微信通知暂未配置，页面内护理日期提醒仍可使用。', reminderJobs:result.jobs || [] })
    } catch(e) { this.setData({ reminderReady:false, reminderMessage:'提醒服务尚未就绪，页面内护理日期提醒仍可使用。' }) }
  },
  onReminderTime(e) { this.setData({ reminderTime:e.detail.value }) },
  subscribeCare(e) {
    if (!this.data.reminderReady || this.data.reminderBusy) return
    const key = e.currentTarget.dataset.key
    this.setData({ reminderBusy:true })
    wx.requestSubscribeMessage({ tmplIds:[this.templateId], success:async result=> {
      if (result[this.templateId] !== 'accept') { this.setData({ reminderBusy:false }); return wx.showToast({ title:'未授权，未开启通知', icon:'none' }) }
      try {
        await cloud.callFunction('pet-data',{ action:'scheduleCareReminder', key, time:this.data.reminderTime })
        wx.showToast({ title:'已订阅本次提醒', icon:'success' })
        await this.loadReminder()
      } catch(error) { wx.showToast({ title:error.message || '订阅保存失败', icon:'none' }) }
      finally { this.setData({ reminderBusy:false }) }
    }, fail:()=>{ this.setData({ reminderBusy:false }); wx.showToast({ title:'暂时无法订阅，请稍后重试', icon:'none' }) } })
  },
  async pauseReminder(e) {
    try { await cloud.callFunction('pet-data',{ action:'pauseCareReminder', id:e.currentTarget.dataset.id }); await this.loadReminder() }
    catch(error) { wx.showToast({ title:'暂停失败，请重试', icon:'none' }) }
  }
})
