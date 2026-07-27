const store = require('../../utils/store')

const CARE_TYPES = {
  deworming: { label: '体内外驱虫', actionText: '记录驱虫', cycleKey: 'dewormingCycle', lastKey: 'dewormingLast', unit: 'month', icon: '🪱' },
  vaccine: { label: '疫苗接种', actionText: '记录接种', cycleKey: 'vaccineCycle', lastKey: 'vaccineLast', unit: 'month', icon: '💉' },
  bath: { label: '洗澡护理', actionText: '记录洗澡', cycleKey: 'bathCycle', lastKey: 'bathLast', unit: 'day', icon: '🛁' },
  dental: { label: '刷牙护理', actionText: '记录刷牙', cycleKey: 'dentalCycle', lastKey: 'dentalLast', unit: 'day', icon: '🦷' },
  nail: { label: '修剪指甲', actionText: '记录剪指甲', cycleKey: 'nailCycle', lastKey: 'nailLast', unit: 'day', icon: '✂️' }
}

const SUPPLY_TYPES = {
  dogFood: { label: '狗粮', icon: '粮', theme: 'food' },
  snack: { label: '零食', icon: '骨', theme: 'snack' }
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function nextDateKey(startKey, amount, unit) {
  const start = new Date(`${startKey}T00:00:00`)
  if (unit === 'day') {
    start.setDate(start.getDate() + amount)
    return dateKey(start)
  }
  const day = start.getDate()
  const targetMonth = start.getMonth() + amount
  const lastDay = new Date(start.getFullYear(), targetMonth + 1, 0).getDate()
  start.setDate(1)
  start.setMonth(targetMonth)
  start.setDate(Math.min(day, lastDay))
  return dateKey(start)
}

function daysUntil(targetKey) {
  const today = new Date(`${store.todayKey()}T00:00:00`)
  const target = new Date(`${targetKey}T00:00:00`)
  return Math.round((target - today) / 86400000)
}

function buildCareView(schedule) {
  const today = store.todayKey()
  return Object.keys(CARE_TYPES).reduce((view, key) => {
    const config = CARE_TYPES[key]
    const days = daysUntil(schedule[key])
    view[key] = {
      key,
      icon: config.icon,
      label: config.label,
      last: schedule[config.lastKey] || '',
      nextDate: schedule[key],
      cycle: schedule[config.cycleKey],
      unitText: config.unit === 'month' ? '个月' : '天',
      countdown: days === 0 ? '就是今天' : days > 0 ? `还有 ${days} 天` : `已超期 ${Math.abs(days)} 天`,
      countdownClass: days === 0 ? 'today' : days > 0 ? 'upcoming' : 'overdue',
      doneToday: schedule[config.lastKey] === today,
      actionText: config.actionText
    }
    return view
  }, {})
}

function buildCalendar(monthKey, selectedDate, records) {
  const [year, month] = monthKey.split('-').map(Number)
  const first = new Date(year, month - 1, 1)
  const mondayOffset = (first.getDay() + 6) % 7
  const start = new Date(year, month - 1, 1 - mondayOffset)
  const today = store.todayKey()
  const recordDates = new Set(records.map(item => item.date))
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const key = dateKey(date)
    return {
      key,
      day: date.getDate(),
      inMonth: date.getMonth() === month - 1,
      future: key > today,
      today: key === today,
      selected: key === selectedDate,
      recorded: recordDates.has(key)
    }
  })
}

function monthText(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  return `${year}年${month}月`
}

function parseGrams(amount) {
  const match = String(amount || '').match(/[\d.]+/)
  return match ? Number(match[0]) || 0 : 0
}

function buildSupplyView(supplies, feeds) {
  const today = store.todayKey()
  return Object.keys(SUPPLY_TYPES).reduce((view, key) => {
    const item = supplies[key] || {}
    const config = SUPPLY_TYPES[key]
    const packageAmount = Number(item.packageAmount) || 0
    if (!item.openedDate || packageAmount <= 0) {
      view[key] = {
        key, ...config, configured: false, productName: '尚未记录拆封',
        daysText: '去设置', remainingText: '填写包装重量和拆封日期', progress: 0, level: 'unset'
      }
      return view
    }
    const matched = feeds.filter(feed => {
      const inRange = feed.dayKey && feed.dayKey >= item.openedDate && feed.dayKey <= today
      const isSnack = feed.type === '零食'
      return inRange && (key === 'snack' ? isSnack : !isSnack)
    })
    const consumed = Math.round(matched.reduce((sum, feed) => sum + parseGrams(feed.amount), 0))
    const recordedDays = new Set(matched.map(feed => feed.dayKey)).size
    const dailyAverage = recordedDays ? consumed / recordedDays : 0
    const remaining = Math.max(0, Math.round(packageAmount - consumed))
    const daysLeft = dailyAverage > 0 ? Math.max(0, Math.ceil(remaining / dailyAverage)) : null
    const level = remaining === 0 ? 'empty' : daysLeft !== null && daysLeft <= 3 ? 'urgent' : daysLeft !== null && daysLeft <= 7 ? 'low' : 'normal'
    view[key] = {
      key, ...config, configured: true, productName: item.productName || config.label,
      daysText: remaining === 0 ? '建议补货' : daysLeft === null ? '等待记录' : `约 ${daysLeft} 天`,
      remainingText: dailyAverage > 0 ? `剩余约 ${remaining}g · 日均 ${Math.round(dailyAverage)}g` : `剩余 ${remaining}g · 等待喂食记录`,
      consumed, remaining, dailyAverage: Math.round(dailyAverage), daysLeft,
      progress: Math.min(100, Math.round(consumed / packageAmount * 100)), level
    }
    return view
  }, {})
}

Page({
  data: {
    pet: {}, draft: {}, profileEditOpen: false, careDraft: {}, careView: {}, careRecords: [],
    careDetailOpen: false, careMenuOpen: false, careSubView: '', selectedCare: {}, selectedCareRecords: [],
    selectedRecordDate: '', selectedMonth: '', selectedMonthText: '', careCalendar: [], weekNames: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    supplies: {}, supplyView: {}, supplyOpen: false, selectedSupplyKey: '', selectedSupply: {}, supplyDraft: {}, supplyHistory: [],
    newAvatarTemp: '', saving: false, changed: false, today: '', sexOptions: ['男孩', '女孩'], sexIndex: 0
  },
  onShow() {
    const pet = store.get('pet')
    const draft = { ...pet, togetherSince: pet.togetherSince || pet.birthday, sex: pet.sex || '男孩' }
    const careDraft = store.normalizeCareSchedule(store.get('care'))
    const supplies = store.normalizeSupplies(store.get('supplies'))
    const supplyView = buildSupplyView(supplies, store.get('feeds'))
    const today = store.todayKey()
    this.setData({ pet, draft, profileEditOpen: false, careDraft, careView: buildCareView(careDraft), careRecords: store.get('careRecords'), careDetailOpen: false, careMenuOpen: false, careSubView: '', selectedCare: {}, selectedCareRecords: [], selectedRecordDate: today, selectedMonth: today.slice(0, 7), selectedMonthText: monthText(today.slice(0, 7)), careCalendar: [], supplies, supplyView, supplyOpen: false, selectedSupplyKey: '', selectedSupply: {}, supplyDraft: {}, supplyHistory: [], newAvatarTemp: '', saving: false, changed: false, today, sexIndex: draft.sex === '女孩' ? 1 : 0 })
  },
  openSupply(e) {
    const key = e.currentTarget.dataset.key
    const current = this.data.supplies[key]
    const selectedSupply = this.data.supplyView[key]
    if (!current || !selectedSupply) return
    this.setData({
      supplyOpen: true,
      selectedSupplyKey: key,
      selectedSupply,
      supplyDraft: {
        productName: current.productName || '',
        packageAmount: current.packageAmount || '',
        openedDate: store.todayKey()
      },
      supplyHistory: (current.history || []).slice(0, 10)
    })
  },
  closeSupply() {
    this.setData({ supplyOpen: false })
  },
  onSupplyInput(e) {
    this.setData({ supplyDraft: { ...this.data.supplyDraft, [e.currentTarget.dataset.key]: e.detail.value } })
  },
  onSupplyDate(e) {
    this.setData({ supplyDraft: { ...this.data.supplyDraft, openedDate: e.detail.value } })
  },
  saveSupplyOpening() {
    const key = this.data.selectedSupplyKey
    const config = SUPPLY_TYPES[key]
    const draft = { ...this.data.supplyDraft }
    const amount = Number(draft.packageAmount)
    if (!config) return
    if (!draft.productName.trim()) return wx.showToast({ title: `请填写${config.label}名称`, icon: 'none' })
    if (!amount || amount <= 0) return wx.showToast({ title: '请填写正确的包装重量', icon: 'none' })
    if (!draft.openedDate || draft.openedDate > store.todayKey()) return wx.showToast({ title: '请选择正确的拆封日期', icon: 'none' })
    const record = { id: Date.now(), productName: draft.productName.trim(), packageAmount: amount, openedDate: draft.openedDate }
    const supplies = store.normalizeSupplies(this.data.supplies)
    supplies[key] = {
      ...supplies[key],
      productName: record.productName,
      packageAmount: amount,
      openedDate: record.openedDate,
      history: [record, ...(supplies[key].history || [])].slice(0, 30)
    }
    store.set('supplies', supplies)
    const supplyView = buildSupplyView(supplies, store.get('feeds'))
    this.setData({ supplies, supplyView, supplyOpen: false, selectedSupply: supplyView[key], supplyHistory: supplies[key].history.slice(0, 10) })
    wx.showToast({ title: `${config.label}拆封记录已保存`, icon: 'none' })
  },
  openProfileEdit() {
    const draft = { ...this.data.pet, togetherSince: this.data.pet.togetherSince || this.data.pet.birthday, sex: this.data.pet.sex || '男孩' }
    if (wx.hideTabBar) wx.hideTabBar({ animation: false })
    this.setData({ profileEditOpen: true, draft, sexIndex: draft.sex === '女孩' ? 1 : 0, newAvatarTemp: '', changed: false })
  },
  closeProfileEdit() {
    const draft = { ...this.data.pet, togetherSince: this.data.pet.togetherSince || this.data.pet.birthday, sex: this.data.pet.sex || '男孩' }
    this.setData({ profileEditOpen: false, draft, sexIndex: draft.sex === '女孩' ? 1 : 0, newAvatarTemp: '', saving: false, changed: false })
    if (wx.showTabBar) wx.showTabBar({ animation: false })
  },
  chooseAvatar() {
    wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'], success: res => this.setData({ newAvatarTemp: res.tempFiles[0].tempFilePath, changed: true }) })
  },
  onInput(e) { this.setData({ [`draft.${e.currentTarget.dataset.key}`]: e.detail.value, changed: true }) },
  onSex(e) {
    const sexIndex = Number(e.detail.value)
    this.setData({ sexIndex, 'draft.sex': this.data.sexOptions[sexIndex], changed: true })
  },
  onDate(e) {
    const birthday = e.detail.value
    this.setData({ draft: { ...this.data.draft, birthday, togetherSince: this.data.draft.togetherSince || birthday }, changed: true })
  },
  onCareDate(e) {
    const careDraft = { ...this.data.careDraft, [e.currentTarget.dataset.key]: e.detail.value }
    this.setData({ careDraft, careView: buildCareView(careDraft), changed: true })
  },
  onCareCycle(e) {
    this.setData({ careDraft: { ...this.data.careDraft, [e.currentTarget.dataset.key]: e.detail.value }, changed: true })
  },
  openCareDetail(e) {
    const key = e.currentTarget.dataset.key
    const selectedCare = buildCareView(this.data.careDraft)[key]
    if (!selectedCare) return
    const selectedRecordDate = store.todayKey()
    const selectedMonth = selectedRecordDate.slice(0, 7)
    const selectedCareRecords = this.data.careRecords.filter(item => item.key === key).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50)
    if (wx.hideTabBar) wx.hideTabBar({ animation: false })
    this.setData({
      careDetailOpen: true,
      careMenuOpen: false,
      careSubView: '',
      selectedCare,
      selectedRecordDate,
      selectedMonth,
      selectedMonthText: monthText(selectedMonth),
      selectedCareRecords,
      careCalendar: buildCalendar(selectedMonth, selectedRecordDate, selectedCareRecords)
    })
  },
  closeCareDetail() {
    this.setData({ careDetailOpen: false, careMenuOpen: false, careSubView: '' })
    if (wx.showTabBar) wx.showTabBar({ animation: false })
  },
  noop() {},
  backCareView() {
    this.closeCareDetail()
  },
  toggleCareMenu() {
    this.setData({ careMenuOpen: !this.data.careMenuOpen })
  },
  showCareHistory() {
    this.setData({ careSubView: 'history', careMenuOpen: false })
  },
  showCareSettings() {
    this.setData({ careSubView: 'settings', careMenuOpen: false })
  },
  onCareMonth(e) {
    const selectedMonth = e.detail.value.slice(0, 7)
    this.setData({ selectedMonth, selectedMonthText: monthText(selectedMonth), careCalendar: buildCalendar(selectedMonth, this.data.selectedRecordDate, this.data.selectedCareRecords) })
  },
  selectCareDay(e) {
    const key = e.currentTarget.dataset.key
    if (!key || key > this.data.today) return
    this.setData({ selectedRecordDate: key, careCalendar: buildCalendar(this.data.selectedMonth, key, this.data.selectedCareRecords) })
  },
  onSelectedCareDate(e) {
    const key = this.data.selectedCare.key
    const careDraft = { ...this.data.careDraft, [key]: e.detail.value }
    const careView = buildCareView(careDraft)
    this.setData({ careDraft, careView, selectedCare: careView[key], changed: true })
  },
  onSelectedCareCycle(e) {
    const key = this.data.selectedCare.key
    const config = CARE_TYPES[key]
    if (!config) return
    const careDraft = { ...this.data.careDraft, [config.cycleKey]: e.detail.value }
    const careView = buildCareView(careDraft)
    this.setData({ careDraft, careView, selectedCare: careView[key], changed: true })
  },
  saveCareSettings() {
    const key = this.data.selectedCare.key
    const config = CARE_TYPES[key]
    if (!config) return
    const cycle = Number(this.data.careDraft[config.cycleKey])
    if (!cycle || cycle <= 0) return wx.showToast({ title: '请填写正确的提醒周期', icon: 'none' })
    const careDraft = { ...this.data.careDraft, [config.cycleKey]: cycle }
    const careView = buildCareView(careDraft)
    store.set('care', careDraft)
    this.setData({ careDraft, careView, selectedCare: careView[key] })
    wx.showToast({ title: '提醒设置已保存' })
  },
  markCareDone(e) {
    const key = e.currentTarget.dataset.key
    const config = CARE_TYPES[key]
    if (!config) return
    const cycle = Number(this.data.careDraft[config.cycleKey])
    if (!cycle || cycle <= 0) return wx.showToast({ title: '请先填写正确的提醒周期', icon: 'none' })
    const recordDate = this.data.selectedRecordDate || store.todayKey()
    if (recordDate > store.todayKey()) return wx.showToast({ title: '完成日期不能晚于今天', icon: 'none' })
    const calculatedNextDate = nextDateKey(recordDate, cycle, config.unit)
    wx.showModal({
      title: config.actionText,
      content: `完成日期：${recordDate}\n按每 ${cycle} ${config.unit === 'month' ? '个月' : '天'}计算，下次为 ${calculatedNextDate}`,
      confirmText: '确认记录',
      success: res => {
        if (!res.confirm) return
        const previousLast = this.data.careDraft[config.lastKey]
        const isLatestRecord = !previousLast || recordDate >= previousLast
        const careDraft = isLatestRecord ? {
          ...this.data.careDraft,
          [config.lastKey]: recordDate,
          [config.cycleKey]: cycle,
          [key]: calculatedNextDate
        } : { ...this.data.careDraft, [config.cycleKey]: cycle }
        const record = { id: Date.now(), key, label: config.label, icon: config.icon, date: recordDate, nextDate: calculatedNextDate }
        const careRecords = [record, ...store.get('careRecords')].slice(0, 100)
        store.set('care', careDraft)
        store.set('careRecords', careRecords)
        const careView = buildCareView(careDraft)
        const selectedCareRecords = careRecords.filter(item => item.key === key).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50)
        this.setData({
          careDraft,
          careView,
          careRecords,
          selectedCare: careView[key],
          selectedCareRecords,
          careCalendar: buildCalendar(this.data.selectedMonth, recordDate, selectedCareRecords)
        })
        wx.showToast({ title: isLatestRecord ? `已记录，下次 ${calculatedNextDate}` : '历史记录已补充', icon: 'none' })
      }
    })
  },
  savePet() {
    const draft = { ...this.data.draft, togetherSince: this.data.draft.togetherSince || this.data.draft.birthday }
    const careDraft = { ...this.data.careDraft }
    if (!draft.name.trim()) return wx.showToast({ title: '请填写昵称', icon: 'none' })
    if (!draft.breed.trim()) return wx.showToast({ title: '请填写品种', icon: 'none' })
    if (!draft.weight || Number(draft.weight) <= 0) return wx.showToast({ title: '请填写正确体重', icon: 'none' })
    if (draft.birthday > this.data.today) return wx.showToast({ title: '生日不能晚于今天', icon: 'none' })
    if (draft.togetherSince > this.data.today) return wx.showToast({ title: '相遇日不能晚于今天', icon: 'none' })
    const cycleKeys = ['dewormingCycle', 'vaccineCycle', 'bathCycle', 'dentalCycle', 'nailCycle']
    if (cycleKeys.some(key => !careDraft[key] || Number(careDraft[key]) <= 0)) return wx.showToast({ title: '护理周期需大于 0', icon: 'none' })
    cycleKeys.forEach(key => { careDraft[key] = Number(careDraft[key]) })

    const commit = avatar => {
      const oldAvatar = this.data.pet.avatar
      const pet = { ...draft, avatar }
      store.set('pet', pet)
      store.set('care', careDraft)
      this.setData({ pet, draft: { ...pet }, profileEditOpen: false, careDraft: { ...careDraft }, newAvatarTemp: '', saving: false, changed: false })
      if (wx.showTabBar) wx.showTabBar({ animation: false })
      if (oldAvatar && oldAvatar.indexOf('wxfile://') === 0 && oldAvatar !== avatar) wx.removeSavedFile({ filePath: oldAvatar })
      wx.showToast({ title: '资料已保存' })
    }

    if (!this.data.newAvatarTemp) return commit(draft.avatar)
    this.setData({ saving: true })
    wx.saveFile({ tempFilePath: this.data.newAvatarTemp, success: res => commit(res.savedFilePath), fail: () => { this.setData({ saving: false }); wx.showToast({ title: '头像保存失败', icon: 'none' }) } })
  }
})
