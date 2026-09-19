const store = require('../../utils/store')
const cloudData = require('../../utils/cloud-data')
const cloud = require('../../utils/cloud')
const summary = require('../../utils/visit-summary')
const careLabels = { deworming: '体内外驱虫', medicine: '用药提醒', vaccine: '疫苗接种', bath: '洗澡护理', dental: '刷牙护理', nail: '修剪指甲' }
function changeSummary(value) {
  if (value == null) return '无'
  if (typeof value !== 'object') return String(value)
  const fields = ['name','type','food','amount','condition','color','duration','weight','date','dayKey','time','productName']
  const text = fields.filter(key => value[key] !== undefined && value[key] !== '').map(key => value[key]).join(' · ')
  return text || (Array.isArray(value) ? `${value.length} 项` : '配置已更新')
}
Page({
  data: { demo: false, showDemoSwitch: false, syncing: false, previewLoading: false, remoteChanges: [], syncText: '', start: '', end: '', today: '', summaryText: '', redact: false, reminderTime: '09:00', reminderReady: false, reminderMessage: '正在检查提醒服务…', careItems: [], reminderBusy: false },
  onShow() {
    const today = store.todayKey()
    const startDate = new Date(`${today}T00:00:00`)
    startDate.setDate(startDate.getDate() - 6)
    const start = `${startDate.getFullYear()}-${String(startDate.getMonth()+1).padStart(2,'0')}-${String(startDate.getDate()).padStart(2,'0')}`
    const care = store.get('care')
    let showDemoSwitch = false
    try { showDemoSwitch = wx.getAccountInfoSync().miniProgram.envVersion === 'develop' } catch (_) {}
    this.setData({ demo: store.isDemoMode(), showDemoSwitch, today, start: this.data.start || start, end: this.data.end || today, careItems: Object.keys(careLabels).map(key => ({ key, label: careLabels[key], date: care[key] || '未设置' })) })
    this.refreshSync()
    this.loadRemoteChanges()
    this.loadReminder()
  },
  async loadRemoteChanges() {
    if (this.data.demo || this.data.previewLoading) return
    this.setData({ previewLoading:true })
    const result = await cloudData.previewRemoteChanges()
    const remoteChanges = (result.changes || []).slice(0,20).map(item => ({ ...item, selected:true, localText:changeSummary(item.localValue), remoteText:changeSummary(item.remoteValue), timeText:item.time ? new Date(item.time).toLocaleString() : '' }))
    this.setData({ previewLoading:false, remoteChanges })
  },
  toggleRemoteChange(e) {
    const index=Number(e.currentTarget.dataset.index)
    this.setData({ [`remoteChanges[${index}].selected`]:!this.data.remoteChanges[index].selected })
  },
  async applySelectedChanges() {
    const selected=this.data.remoteChanges.filter(item=>item.selected)
    if (!selected.length) return wx.showToast({ title:'请先选择要应用的修改', icon:'none' })
    this.setData({ syncing:true })
    const result=await cloudData.applyRemoteChanges(selected)
    this.setData({ syncing:false, remoteChanges:this.data.remoteChanges.filter(item=>!item.selected) })
    this.refreshSync()
    wx.showToast({ title:result.skipped ? '部分记录有本机待同步修改' : `已应用 ${result.applied} 项`, icon:'none' })
  },
  refreshSync() {
    const s = cloudData.getSyncStatus()
    this.setData({ syncText: ({ demo:'演示数据',success:'数据已安全同步',pending:'正在等待同步',syncing:'正在同步',fail:'同步失败',conflict:'发现记录冲突' })[s.status] || '等待首次同步', pendingCount:s.pending, syncDetail: s.error || (s.updatedAt ? `最近同步：${new Date(s.updatedAt).toLocaleString()}` : '连接网络后会自动同步') })
  },
  async retrySync() {
    if (this.data.syncing || this.data.demo) return
    this.setData({ syncing:true })
    await cloudData.syncAll()
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
  onStart(e) { this.setData({ start:e.detail.value, summaryText:'' }) },
  onEnd(e) { this.setData({ end:e.detail.value, summaryText:'' }) },
  onRedact(e) { this.setData({ redact: e.detail.value, summaryText:'' }) },
  generateSummary() {
    try { this.setData({ summaryText:summary.buildSummary(this.data.start,this.data.end,{ redact:this.data.redact }) }) }
    catch(e) { wx.showToast({ title:e.message, icon:'none' }) }
  },
  copySummary() { if(this.data.summaryText) wx.setClipboardData({ data:this.data.summaryText }) },
  shareSummary() {
    if (!this.data.summaryText) return
    const path = `${wx.env.USER_DATA_PATH}/pet-visit-summary.txt`
    wx.getFileSystemManager().writeFile({ filePath:path, data:this.data.summaryText, encoding:'utf8', success:()=> {
      if (wx.shareFileMessage) wx.shareFileMessage({ filePath:path, fileName:`就诊记录_${this.data.start}_${this.data.end}.txt`, fail:()=>wx.showToast({ title:'分享未完成，可复制文本', icon:'none' }) })
      else this.copySummary()
    }, fail:()=>wx.showToast({ title:'导出失败，请复制文本', icon:'none' }) })
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
