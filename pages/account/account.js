const store = require('../../utils/store')
const cloudAlbum = require('../../utils/cloud-album')
const cloud = require('../../utils/cloud')
const cloudData = require('../../utils/cloud-data')

function showNativeTabBar() {
  if (!wx.showTabBar) return
  wx.showTabBar({ animation: false, fail() {} })
}

function hideNativeTabBar() {
  if (!wx.hideTabBar) return
  wx.hideTabBar({ animation: false, fail() {} })
}

const CARE_TYPES = {
  deworming: { label: '体内外驱虫', actionText: '记录驱虫', cycleKey: 'dewormingCycle', lastKey: 'dewormingLast', unit: 'month', icon: '🪱' },
  medicine: { label: '宠物用药', actionText: '记录用药', cycleKey: 'medicineCycle', lastKey: 'medicineLast', unit: 'day', icon: '💊' },
  vaccine: { label: '疫苗接种', actionText: '记录接种', cycleKey: 'vaccineCycle', lastKey: 'vaccineLast', unit: 'month', icon: '💉' },
  bath: { label: '洗澡护理', actionText: '记录洗澡', cycleKey: 'bathCycle', lastKey: 'bathLast', unit: 'day', icon: '🛁' },
  dental: { label: '刷牙护理', actionText: '记录刷牙', cycleKey: 'dentalCycle', lastKey: 'dentalLast', unit: 'day', icon: '🦷' },
  nail: { label: '修剪指甲', actionText: '记录剪指甲', cycleKey: 'nailCycle', lastKey: 'nailLast', unit: 'day', icon: '✂️' }
}

const SUPPLY_TYPES = {
  dogFood: { label: '狗粮', icon: '粮', theme: 'food' },
  snack: { label: '零食', icon: '骨', theme: 'snack' }
}

const PROFILE_FIELDS = {
  name: { title: '昵称' },
  breed: { title: '品种' },
  sex: { title: '性别' },
  weight: { title: '体重' },
  birthday: { title: '生日' }
}

const BREED_OPTIONS = ['柯基', '金毛', '拉布拉多', '泰迪', '贵宾', '比熊', '博美', '柴犬', '边牧', '萨摩耶', '哈士奇', '雪纳瑞', '法斗', '英斗', '巴哥', '吉娃娃', '约克夏', '腊肠犬', '马尔济斯', '中华田园犬', '混血犬', '橘猫', '狸花猫', '英短', '美短', '布偶', '暹罗', '缅因猫', '加菲猫', '其他']
const WEIGHT_INTEGER_OPTIONS = Array.from({ length: 80 }, (_, index) => String(index + 1))
const WEIGHT_DECIMAL_OPTIONS = Array.from({ length: 10 }, (_, index) => String(index))
const WEIGHT_PICKER_RANGES = [WEIGHT_INTEGER_OPTIONS, WEIGHT_DECIMAL_OPTIONS]
const FAMILY_ROLE_OPTIONS = [
  { label: '共同照护', value: 'admin', desc: '可记录喂食、散步、护理和照片' },
  { label: '只读查看', value: 'viewer', desc: '只能查看宠物状态和历史记录' }
]
const FAMILY_ROLE_LABELS = { owner: '主人', admin: '共同照护', viewer: '只读查看' }
const FAMILY_RELATION_OPTIONS = ['铲屎官', '爸爸', '妈妈', '爷爷', '奶奶', '外公', '外婆', '哥哥', '姐姐', '朋友', '宠物店', '医生']

function buildBreedOptions(currentBreed) {
  const breed = String(currentBreed || '').trim()
  if (breed && !BREED_OPTIONS.includes(breed)) return [breed, ...BREED_OPTIONS]
  return BREED_OPTIONS
}

function buildWeightPickerValue(weight) {
  const value = Number(weight)
  const safe = Number.isFinite(value) && value > 0 ? Math.round(value * 10) / 10 : 10
  const integer = Math.max(1, Math.min(80, Math.floor(safe)))
  const decimal = Math.max(0, Math.min(9, Math.round((safe - integer) * 10)))
  return [integer - 1, decimal]
}

function weightTextFromPicker(value) {
  const indexes = Array.isArray(value) ? value : [0, 0]
  const integer = Number(WEIGHT_INTEGER_OPTIONS[Number(indexes[0]) || 0]) || 1
  const decimal = Number(WEIGHT_DECIMAL_OPTIONS[Number(indexes[1]) || 0]) || 0
  return `${integer}.${decimal}`
}

function shortInviteCode(petName) {
  const nameCode = String(petName || 'PET').replace(/\s/g, '').slice(0, 2).toUpperCase()
  return `ZZ-${nameCode || 'PET'}-${String(Date.now()).slice(-6)}`
}

function initialOf(name) {
  return String(name || '家').trim().slice(0, 1) || '家'
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false
  const [year, month, day] = String(value).split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function avatarExtension(filePath) {
  if (/\.png(?:\?|$)/i.test(String(filePath || ''))) return 'png'
  if (/\.webp(?:\?|$)/i.test(String(filePath || ''))) return 'webp'
  return 'jpg'
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

const SUPPLY_COUNTDOWN_CLASS = { unset: 'upcoming', normal: 'upcoming', low: 'today', urgent: 'overdue', empty: 'overdue' }

function buildSupplyView(supplies, feeds) {
  const today = store.todayKey()
  return Object.keys(SUPPLY_TYPES).reduce((view, key) => {
    const item = supplies[key] || {}
    const config = SUPPLY_TYPES[key]
    const packageAmount = Number(item.packageAmount) || 0
    if (!item.openedDate || packageAmount <= 0) {
      view[key] = {
        key, ...config, configured: false, productName: '尚未记录拆封',
        daysText: '去设置', remainingText: '填写包装重量和拆封日期', progress: 0, level: 'unset',
        countdownClass: SUPPLY_COUNTDOWN_CLASS.unset
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
      progress: Math.min(100, Math.round(consumed / packageAmount * 100)), level,
      countdownClass: SUPPLY_COUNTDOWN_CLASS[level]
    }
    return view
  }, {})
}

function getGrowthPhotos() {
  const saved = store.get('growthPhotos')
    .filter(item => item && item.path)
    .map(item => ({
      id: item.id || `${item.createdAt || Date.now()}-${item.path}`,
      path: item.path,
      dayKey: item.dayKey || store.todayKey(),
      time: item.time || '',
      createdAt: Number(item.createdAt) || 0
    }))
  const knownPaths = new Set(saved.map(item => item.path))
  const legacy = store.get('weightRecords')
    .filter(item => item && item.photoPath && !knownPaths.has(item.photoPath))
    .map(item => ({
      id: `weight-photo-${item.id || item.createdAt || item.photoPath}`,
      path: item.photoPath,
      dayKey: item.dayKey || store.todayKey(),
      time: item.time || '',
      createdAt: Number(item.createdAt) || Number(item.id) || 0
    }))
  const photos = [...saved, ...legacy].sort((a, b) => b.createdAt - a.createdAt)
  if (legacy.length || saved.length !== store.get('growthPhotos').length) store.set('growthPhotos', photos)
  return photos
}

function timeText(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function sameGrowthPhoto(left, right) {
  if (!left || !right) return false
  if (left.id && right.id && left.id === right.id) return true
  return !!left.path && left.path === right.path
}

Page({
  data: {
    pet: {}, draft: {}, profileEditOpen: false, careDraft: {}, careView: {}, careRecords: [],
    careDetailOpen: false, careMenuOpen: false, careSubView: '', selectedCare: {}, selectedCareRecords: [],
    selectedRecordDate: '', selectedMonth: '', selectedMonthText: '', careCalendar: [], weekNames: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    supplies: {}, supplyView: {}, supplyOpen: false, selectedSupplyKey: '', selectedSupply: {}, supplyDraft: {}, supplyHistory: [],
    growthPhotos: [], growthAlbumOpen: false, uploadingGrowthPhotos: false,
    newAvatarTemp: '', saving: false, changed: false, today: '', sexOptions: ['男孩', '女孩'], sexIndex: 0,
    profileFieldEditOpen: false, profileField: '', profileFieldTitle: '', profileFieldValue: '',
    profileFieldSexIndex: 0, profileFieldBreedIndex: 0, breedOptions: BREED_OPTIONS,
    weightPickerRanges: WEIGHT_PICKER_RANGES, weightPickerValue: [9, 0], profileFieldSaving: false,
    familyMembers: [], familyOpen: false, familyInviteCode: '', familyDraftOpen: false, familyDraft: {},
    familyEditingIndex: -1, familyRoleOptions: FAMILY_ROLE_OPTIONS, familyRelationOptions: FAMILY_RELATION_OPTIONS,
    familyRoleIndex: 0, familyRelationIndex: 0, familySaving: false, familyInviteLoading: false,
    pendingShareCode: '', shareAccepting: false, shareShared: false, shareRole: 'owner',
    shareRoleLabel: '主人', shareReadOnly: false
  },
  onLoad(options = {}) {
    const code = options.shareCode ? decodeURIComponent(options.shareCode) : ''
    if (code) this.setData({ pendingShareCode: code })
  },
  onShow() {
    showNativeTabBar()
    if (store.ensureSeedData) store.ensureSeedData()
    const pet = store.get('pet')
    const draft = { ...pet, togetherSince: pet.togetherSince || pet.birthday, sex: pet.sex || '男孩' }
    const careDraft = store.normalizeCareSchedule(store.get('care'))
    const supplies = store.normalizeSupplies(store.get('supplies'))
    const supplyView = buildSupplyView(supplies, store.get('feeds'))
    const growthPhotos = getGrowthPhotos()
    const familyMembers = store.get('familyMembers').map(item => ({ ...item, initial: initialOf(item.name) }))
    const today = store.todayKey()
    const breedOptions = buildBreedOptions(draft.breed)
    const pendingShareCode = this.data.pendingShareCode
    const shareStatus = cloudData.getShareStatus()
    const shareRole = shareStatus.role || 'owner'
    this.setData({ pet, draft, profileEditOpen: false, careDraft, careView: buildCareView(careDraft), careRecords: store.get('careRecords'), careDetailOpen: false, careMenuOpen: false, careSubView: '', selectedCare: {}, selectedCareRecords: [], selectedRecordDate: today, selectedMonth: today.slice(0, 7), selectedMonthText: monthText(today.slice(0, 7)), careCalendar: [], supplies, supplyView, supplyOpen: false, selectedSupplyKey: '', selectedSupply: {}, supplyDraft: {}, supplyHistory: [], growthPhotos, growthAlbumOpen: false, uploadingGrowthPhotos: false, newAvatarTemp: '', saving: false, changed: false, today, sexIndex: draft.sex === '女孩' ? 1 : 0, profileFieldEditOpen: false, profileField: '', profileFieldTitle: '', profileFieldValue: '', profileFieldSexIndex: draft.sex === '女孩' ? 1 : 0, profileFieldBreedIndex: Math.max(0, breedOptions.indexOf(draft.breed)), breedOptions, weightPickerRanges: WEIGHT_PICKER_RANGES, weightPickerValue: buildWeightPickerValue(draft.weight), profileFieldSaving: false, familyMembers, familyOpen: false, familyInviteCode: this.data.familyInviteCode || shortInviteCode(pet.name), familyDraftOpen: false, familyDraft: {}, familyEditingIndex: -1, familyRoleIndex: 0, familyRelationIndex: 0, familySaving: false, familyInviteLoading: false, pendingShareCode, shareShared: !!shareStatus.shared, shareRole, shareRoleLabel: FAMILY_ROLE_LABELS[shareRole] || '主人', shareReadOnly: !!shareStatus.shared && shareRole === 'viewer' })
    if (pendingShareCode) this.promptAcceptShare(pendingShareCode)
  },
  onHide() {
    showNativeTabBar()
  },
  onUnload() {
    showNativeTabBar()
  },
  openFamilyManager() {
    hideNativeTabBar()
    const familyMembers = store.get('familyMembers').map(item => ({ ...item, initial: initialOf(item.name) }))
    this.setData({ familyOpen: true, familyMembers, familyInviteCode: this.data.familyInviteCode || shortInviteCode(this.data.pet.name), familyDraftOpen: false })
    if (!this.data.shareShared || this.data.shareRole === 'owner') this.generateFamilyInvite()
  },
  closeFamilyManager() {
    this.setData({ familyOpen: false, familyDraftOpen: false, familySaving: false })
    showNativeTabBar()
  },
  ensureWritable(message = '只读成员不能修改共享档案', showToast = true) {
    if (!this.data.shareReadOnly) return true
    if (showToast) wx.showToast({ title: message, icon: 'none' })
    return false
  },
  ensureOwnerPermission(message = '只有主人可以管理家庭共享', showToast = true) {
    if (!this.data.shareShared || this.data.shareRole === 'owner') return true
    if (showToast) wx.showToast({ title: message, icon: 'none' })
    return false
  },
  openAddFamilyMember() {
    if (!this.ensureOwnerPermission('只有主人可以添加家庭成员')) return
    this.setData({
      familyDraftOpen: true,
      familyEditingIndex: -1,
      familyDraft: { name: '', relation: FAMILY_RELATION_OPTIONS[0], role: 'admin' },
      familyRoleIndex: 0,
      familyRelationIndex: 0
    })
  },
  editFamilyMember(e) {
    if (!this.ensureOwnerPermission('只有主人可以编辑成员权限')) return
    const index = Number(e.currentTarget.dataset.index)
    const member = this.data.familyMembers[index]
    if (!member || member.role === 'owner') return wx.showToast({ title: '主人权限不可修改', icon: 'none' })
    const roleIndex = Math.max(0, FAMILY_ROLE_OPTIONS.findIndex(item => item.value === member.role))
    const relationIndex = Math.max(0, FAMILY_RELATION_OPTIONS.indexOf(member.relation))
    this.setData({
      familyDraftOpen: true,
      familyEditingIndex: index,
      familyDraft: { name: member.name, relation: member.relation, role: member.role },
      familyRoleIndex: roleIndex,
      familyRelationIndex: relationIndex
    })
  },
  closeFamilyDraft() {
    this.setData({ familyDraftOpen: false, familyDraft: {}, familyEditingIndex: -1, familySaving: false })
  },
  onFamilyNameInput(e) {
    this.setData({ familyDraft: { ...this.data.familyDraft, name: e.detail.value } })
  },
  onFamilyRelation(e) {
    const familyRelationIndex = Number(e.detail.value)
    this.setData({ familyRelationIndex, familyDraft: { ...this.data.familyDraft, relation: this.data.familyRelationOptions[familyRelationIndex] } })
  },
  onFamilyRole(e) {
    const familyRoleIndex = Number(e.detail.value)
    const option = this.data.familyRoleOptions[familyRoleIndex] || this.data.familyRoleOptions[0]
    this.setData({ familyRoleIndex, familyDraft: { ...this.data.familyDraft, role: option.value } })
  },
  saveFamilyMembers(members, toastTitle) {
    if (!this.ensureOwnerPermission('只有主人可以管理家庭成员')) return Promise.resolve({ ok: false })
    const normalized = store.normalizeFamilyMembers(members).map(item => ({ ...item, initial: initialOf(item.name) }))
    this.setData({ familySaving: true })
    return store.set('familyMembers', normalized.map(({ initial, ...item }) => item)).finally(() => {
      this.setData({ familyMembers: normalized, familyDraftOpen: false, familyEditingIndex: -1, familySaving: false })
      wx.showToast({ title: toastTitle || '家庭共享已更新', icon: 'none' })
    })
  },
  saveFamilyMember() {
    const name = String(this.data.familyDraft.name || '').trim()
    const relation = this.data.familyDraft.relation || FAMILY_RELATION_OPTIONS[0]
    const role = this.data.familyDraft.role || 'admin'
    if (!name) return wx.showToast({ title: '请填写成员昵称', icon: 'none' })
    const members = this.data.familyMembers.map(({ initial, ...item }) => item)
    const member = {
      id: this.data.familyEditingIndex >= 0 && members[this.data.familyEditingIndex] ? members[this.data.familyEditingIndex].id : `member-${Date.now()}`,
      name: name.slice(0, 16),
      relation,
      role,
      roleLabel: FAMILY_ROLE_LABELS[role] || FAMILY_ROLE_LABELS.admin,
      status: this.data.familyEditingIndex >= 0 ? '已加入' : '待邀请',
      joinedAt: store.todayKey(),
      lastActive: ''
    }
    if (this.data.familyEditingIndex >= 0) members[this.data.familyEditingIndex] = { ...members[this.data.familyEditingIndex], ...member }
    else members.push(member)
    return this.saveFamilyMembers(members, this.data.familyEditingIndex >= 0 ? '成员已更新' : '成员已添加')
  },
  changeFamilyMemberRole(e) {
    if (!this.ensureOwnerPermission('只有主人可以修改成员权限')) return Promise.resolve({ ok: false })
    const index = Number(e.currentTarget.dataset.index)
    const member = this.data.familyMembers[index]
    if (!member || member.role === 'owner') return
    const option = this.data.familyRoleOptions[Number(e.detail.value)] || this.data.familyRoleOptions[0]
    const members = this.data.familyMembers.map(({ initial, ...item }) => item)
    members[index] = { ...members[index], role: option.value, roleLabel: option.label }
    return this.saveFamilyMembers(members, '权限已更新')
  },
  removeFamilyMember(e) {
    if (!this.ensureOwnerPermission('只有主人可以移除家庭成员')) return
    const index = Number(e.currentTarget.dataset.index)
    const member = this.data.familyMembers[index]
    if (!member || member.role === 'owner') return wx.showToast({ title: '主人不能删除', icon: 'none' })
    wx.showModal({
      title: '移除家庭成员',
      content: `确定移除 ${member.name} 吗？移除后对方将不再显示在该宠物的共享管理里。`,
      confirmText: '移除',
      success: res => {
        if (!res.confirm) return
        const members = this.data.familyMembers.filter((_, itemIndex) => itemIndex !== index).map(({ initial, ...item }) => item)
        this.saveFamilyMembers(members, '成员已移除')
      }
    })
  },
  copyInviteCode() {
    if (!this.ensureOwnerPermission('只有主人可以生成共享邀请')) return
    const copyCode = code => {
      if (!wx.setClipboardData) return wx.showToast({ title: `共享码 ${code}`, icon: 'none' })
      wx.setClipboardData({ data: code, success: () => wx.showToast({ title: '共享码已复制', icon: 'none' }) })
    }
    if (this.data.familyInviteCode && !this.data.familyInviteLoading) return copyCode(this.data.familyInviteCode)
    this.generateFamilyInvite().then(result => copyCode((result && result.code) || this.data.familyInviteCode))
  },
  generateFamilyInvite() {
    if (!this.ensureOwnerPermission('只有主人可以生成共享邀请', false)) return Promise.resolve({ ok: false })
    if (this.data.familyInviteLoading) return Promise.resolve({ code: this.data.familyInviteCode })
    this.setData({ familyInviteLoading: true })
    return cloudData.createShareInvitation({ petName: this.data.pet.name, code: this.data.familyInviteCode })
      .then(result => {
        if (result && result.ok !== false && result.code) {
          const members = Array.isArray(result.members) && result.members.length
            ? result.members.map(item => ({ ...item, initial: initialOf(item.name) }))
            : this.data.familyMembers
          this.setData({ familyInviteCode: result.code, familyMembers: members, familyInviteLoading: false })
          store.set('familyMembers', members.map(({ initial, ...item }) => item), { skipCloud: true })
        } else {
          this.setData({ familyInviteLoading: false })
        }
        return result
      })
      .catch(() => {
        this.setData({ familyInviteLoading: false })
        return { ok: false }
      })
  },
  promptAcceptShare(code) {
    if (this.data.shareAccepting) return
    wx.showModal({
      title: '加入家庭共享',
      content: `收到共享码 ${code}，是否加入这只宠物的家庭档案？`,
      confirmText: '加入',
      cancelText: '稍后',
      success: res => {
        if (!res.confirm) return this.setData({ pendingShareCode: '' })
        this.acceptShareInvitation(code)
      }
    })
  },
  acceptShareInvitation(code) {
    this.setData({ shareAccepting: true })
    return cloudData.acceptShareInvitation(code, { name: '我', relation: '家人' })
      .then(result => {
        if (!result || result.ok === false) {
          wx.showToast({ title: result && result.error ? result.error : '加入失败，请检查共享码', icon: 'none' })
          this.setData({ shareAccepting: false, pendingShareCode: '' })
          return result
        }
        const pet = store.get('pet')
        const careDraft = store.normalizeCareSchedule(store.get('care'))
        const supplies = store.normalizeSupplies(store.get('supplies'))
        const familyMembers = store.get('familyMembers').map(item => ({ ...item, initial: initialOf(item.name) }))
        this.setData({
          pet,
          draft: { ...pet, togetherSince: pet.togetherSince || pet.birthday, sex: pet.sex || '男孩' },
          careDraft,
          careView: buildCareView(careDraft),
          supplies,
          supplyView: buildSupplyView(supplies, store.get('feeds')),
          growthPhotos: getGrowthPhotos(),
          familyMembers,
          familyOpen: true,
          shareAccepting: false,
          pendingShareCode: '',
          shareShared: true,
          shareRole: result.share && result.share.role || 'admin',
          shareRoleLabel: FAMILY_ROLE_LABELS[result.share && result.share.role || 'admin'] || '共同照护',
          shareReadOnly: result.share && result.share.role === 'viewer'
        })
        hideNativeTabBar()
        wx.showToast({ title: '已加入家庭共享', icon: 'none' })
        return result
      })
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
    if (!this.ensureWritable()) return
    const key = this.data.selectedSupplyKey
    const config = SUPPLY_TYPES[key]
    const draft = { ...this.data.supplyDraft }
    const amount = Number(draft.packageAmount)
    const productName = String(draft.productName || '').trim()
    if (!config) return
    if (!productName) return wx.showToast({ title: `请填写${config.label}名称`, icon: 'none' })
    if (!Number.isFinite(amount) || amount <= 0) return wx.showToast({ title: '请填写正确的包装重量', icon: 'none' })
    if (!isValidDateKey(draft.openedDate) || draft.openedDate > store.todayKey()) return wx.showToast({ title: '请选择正确的拆封日期', icon: 'none' })
    const record = { id: Date.now(), productName, packageAmount: amount, openedDate: draft.openedDate }
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
  openGrowthAlbum() {
    hideNativeTabBar()
    const localPhotos = getGrowthPhotos()
    this.setData({ growthAlbumOpen: true, growthPhotos: localPhotos })
    cloudAlbum.loadGrowthPhotos(localPhotos).then(growthPhotos => {
      store.set('growthPhotos', growthPhotos)
      if (this.data.growthAlbumOpen) this.setData({ growthPhotos })
    }).catch(() => {})
  },
  closeGrowthAlbum() {
    this.setData({ growthAlbumOpen: false, uploadingGrowthPhotos: false })
    showNativeTabBar()
  },
  chooseGrowthPhotos() {
    if (this.data.uploadingGrowthPhotos) return
    if (!this.ensureWritable()) return
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      sizeType: ['compressed'],
      success: res => {
        const tempPaths = (res.tempFiles || []).map(item => item.tempFilePath).filter(Boolean)
        if (!tempPaths.length) return
        this.setData({ uploadingGrowthPhotos: true })
        const createdAt = Date.now()
        const captured = new Date(createdAt)
        const dayKey = store.todayKey()
        cloudAlbum.saveGrowthPhotos(tempPaths, { createdAt, dayKey, time: timeText(captured) })
          .then(savedPhotos => {
            const growthPhotos = [...savedPhotos, ...getGrowthPhotos()].sort((a, b) => b.createdAt - a.createdAt)
            store.set('growthPhotos', growthPhotos)
            this.setData({ growthPhotos, uploadingGrowthPhotos: false })
            wx.showToast({ title: savedPhotos.length ? `已添加 ${savedPhotos.length} 张成长照片` : '成长照片保存失败', icon: 'none' })
          })
          .catch(() => {
            this.setData({ uploadingGrowthPhotos: false })
            wx.showToast({ title: '云端保存失败，请稍后重试', icon: 'none' })
          })
      }
    })
  },
  previewGrowthPhoto(e) {
    const index = Number(e.currentTarget.dataset.index)
    const current = this.data.growthPhotos[index]
    if (!current) return
    wx.previewImage({ current: current.path, urls: this.data.growthPhotos.map(item => item.path) })
  },
  deleteGrowthPhoto(e) {
    if (!this.ensureWritable()) return
    const index = Number(e.currentTarget.dataset.index)
    const photo = this.data.growthPhotos[index]
    if (!photo) return
    wx.showModal({
      title: '删除照片',
      content: '确定从成长相册里删除这张照片吗？删除后不会再显示在相册里。',
      confirmText: '删除',
      confirmColor: '#ff674a',
      success: res => {
        if (!res.confirm) return
        const removeFromAlbum = toastTitle => {
          const growthPhotos = this.data.growthPhotos.filter(item => !sameGrowthPhoto(item, photo))
          store.set('growthPhotos', growthPhotos)
          this.setData({ growthPhotos })
          wx.showToast({ title: toastTitle || '已删除照片', icon: 'none' })
        }
        cloudAlbum.deleteGrowthPhoto(photo)
          .then(() => removeFromAlbum('已删除照片'))
          .catch(error => {
            const message = String(error && error.message || error || '')
            if (/readonly|permission|只读|权限|主人|鍙|鏉冮檺|涓讳汉/i.test(message)) {
              wx.showToast({ title: message.slice(0, 18) || '没有删除权限', icon: 'none' })
              return
            }
            removeFromAlbum('已从相册移除，云端稍后同步')
          })
      }
    })
  },
  openProfileEdit() {
    const draft = { ...this.data.pet, togetherSince: this.data.pet.togetherSince || this.data.pet.birthday, sex: this.data.pet.sex || '男孩' }
    hideNativeTabBar()
    this.setData({ profileEditOpen: true, draft, sexIndex: draft.sex === '女孩' ? 1 : 0, newAvatarTemp: '', changed: false })
  },
  closeProfileEdit() {
    const draft = { ...this.data.pet, togetherSince: this.data.pet.togetherSince || this.data.pet.birthday, sex: this.data.pet.sex || '男孩' }
    this.setData({ profileEditOpen: false, draft, sexIndex: draft.sex === '女孩' ? 1 : 0, newAvatarTemp: '', saving: false, changed: false })
    showNativeTabBar()
  },
  chooseAvatar() {
    wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'], success: res => this.setData({ newAvatarTemp: res.tempFiles[0].tempFilePath, changed: true }) })
  },
  editAvatar() {
    if (this.data.profileFieldSaving || this.data.saving) return
    if (!this.ensureWritable()) return
    return new Promise(resolve => {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        success: res => {
          const tempFilePath = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath
          if (!tempFilePath) return resolve()
          this.setData({ profileFieldSaving: true })
          const cloudPath = `pet-avatars/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${avatarExtension(tempFilePath)}`
          const task = cloud.uploadFile(cloudPath, tempFilePath)
            .then(fileID => this.saveProfilePatch({ avatar: fileID }, { toast: '头像已更新', oldAvatar: this.data.pet.avatar }))
            .catch(() => {
              this.setData({ profileFieldSaving: false })
              wx.showToast({ title: '头像保存失败', icon: 'none' })
            })
          resolve(task)
        },
        fail: () => resolve()
      })
    })
  },
  openProfileFieldEdit(e) {
    if (!this.ensureWritable()) return
    const field = e.currentTarget.dataset.field
    const config = PROFILE_FIELDS[field]
    if (!config) return
    const value = this.data.pet[field]
    const breedOptions = buildBreedOptions(field === 'breed' ? value : this.data.pet.breed)
    const weightPickerValue = field === 'weight' ? buildWeightPickerValue(value) : this.data.weightPickerValue
    this.setData({
      profileFieldEditOpen: true,
      profileField: field,
      profileFieldTitle: config.title,
      profileFieldValue: value === undefined || value === null ? '' : String(value),
      profileFieldSexIndex: this.data.pet.sex === '女孩' ? 1 : 0,
      profileFieldBreedIndex: Math.max(0, breedOptions.indexOf(String(value || ''))),
      breedOptions,
      weightPickerValue,
      profileFieldSaving: false
    })
  },
  closeProfileFieldEdit() {
    this.setData({ profileFieldEditOpen: false, profileField: '', profileFieldTitle: '', profileFieldValue: '', profileFieldSaving: false })
  },
  onProfileFieldInput(e) {
    this.setData({ profileFieldValue: e.detail.value })
  },
  onProfileFieldSex(e) {
    const profileFieldSexIndex = Number(e.detail.value)
    this.setData({ profileFieldSexIndex, profileFieldValue: this.data.sexOptions[profileFieldSexIndex] })
  },
  onProfileFieldBreed(e) {
    const profileFieldBreedIndex = Number(e.detail.value)
    this.setData({ profileFieldBreedIndex, profileFieldValue: this.data.breedOptions[profileFieldBreedIndex] })
  },
  onProfileFieldWeight(e) {
    const weightPickerValue = e.detail.value
    this.setData({ weightPickerValue, profileFieldValue: weightTextFromPicker(weightPickerValue) })
  },
  onProfileFieldDate(e) {
    this.setData({ profileFieldValue: e.detail.value })
  },
  saveProfilePatch(patch, options = {}) {
    const pet = { ...this.data.pet, ...patch }
    const tasks = [store.set('pet', pet)]
    const weightChanged = patch.weight !== undefined && Number(patch.weight) !== Number(this.data.pet.weight)
    if (weightChanged) {
      const capturedAt = Date.now()
      const capturedDate = new Date(capturedAt)
      const dayKey = store.todayKey()
      const time = `${String(capturedDate.getHours()).padStart(2, '0')}:${String(capturedDate.getMinutes()).padStart(2, '0')}`
      const weightRecord = { id: capturedAt, createdAt: capturedAt, dayKey, time, weight: Number(pet.weight) }
      tasks.push(store.set('weightRecords', [weightRecord, ...store.get('weightRecords')].slice(0, 100)))
    }
    return Promise.all(tasks).finally(() => {
      this.setData({
        pet,
        draft: { ...pet, togetherSince: pet.togetherSince || pet.birthday, sex: pet.sex || '男孩' },
        sexIndex: pet.sex === '女孩' ? 1 : 0,
        profileFieldEditOpen: false,
        profileField: '',
        profileFieldTitle: '',
        profileFieldValue: '',
        profileFieldSaving: false,
        changed: false
      })
      const oldAvatar = options.oldAvatar
      if (oldAvatar && oldAvatar.indexOf('wxfile://') === 0 && oldAvatar !== pet.avatar && wx.removeSavedFile) wx.removeSavedFile({ filePath: oldAvatar })
      wx.showToast({ title: options.toast || '资料已保存', icon: 'none' })
    })
  },
  saveProfileFieldEdit() {
    const field = this.data.profileField
    if (!PROFILE_FIELDS[field]) return
    const raw = String(this.data.profileFieldValue || '').trim()
    const patch = {}
    if (field === 'name') {
      if (!raw) return wx.showToast({ title: '请填写昵称', icon: 'none' })
      patch.name = raw
    } else if (field === 'breed') {
      patch.breed = this.data.breedOptions[this.data.profileFieldBreedIndex] || raw || '其他'
    } else if (field === 'sex') {
      patch.sex = this.data.sexOptions[this.data.profileFieldSexIndex] || '男孩'
    } else if (field === 'weight') {
      const weight = Number(weightTextFromPicker(this.data.weightPickerValue))
      if (!Number.isFinite(weight) || weight <= 0) return wx.showToast({ title: '请填写正确体重', icon: 'none' })
      patch.weight = weight
    } else if (field === 'birthday') {
      if (!isValidDateKey(raw) || raw > this.data.today) return wx.showToast({ title: '请选择正确的生日', icon: 'none' })
      patch.birthday = raw
      if (!this.data.pet.togetherSince || this.data.pet.togetherSince < raw) patch.togetherSince = raw
    }
    this.setData({ profileFieldSaving: true })
    return this.saveProfilePatch(patch)
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
    hideNativeTabBar()
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
    showNativeTabBar()
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
    if (!this.ensureWritable()) return
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
    if (!this.ensureWritable()) return
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
    const weight = Number(draft.weight)
    draft.name = String(draft.name || '').trim()
    draft.breed = String(draft.breed || '').trim()
    if (!draft.name) return wx.showToast({ title: '请填写昵称', icon: 'none' })
    if (!draft.breed) return wx.showToast({ title: '请填写品种', icon: 'none' })
    if (!Number.isFinite(weight) || weight <= 0) return wx.showToast({ title: '请填写正确体重', icon: 'none' })
    if (!isValidDateKey(draft.birthday) || draft.birthday > this.data.today) return wx.showToast({ title: '请选择正确的生日', icon: 'none' })
    if (!isValidDateKey(draft.togetherSince) || draft.togetherSince > this.data.today) return wx.showToast({ title: '请选择正确的相遇日', icon: 'none' })
    if (draft.togetherSince < draft.birthday) return wx.showToast({ title: '相遇日不能早于生日', icon: 'none' })
    draft.weight = weight
    const cycleKeys = ['dewormingCycle', 'vaccineCycle', 'bathCycle', 'dentalCycle', 'nailCycle', 'medicineCycle']
    if (cycleKeys.some(key => !Number.isFinite(Number(careDraft[key])) || Number(careDraft[key]) <= 0)) return wx.showToast({ title: '护理周期需填写正确数字', icon: 'none' })
    cycleKeys.forEach(key => { careDraft[key] = Number(careDraft[key]) })

    const weightChanged = Number(draft.weight) !== Number(this.data.pet.weight)
    const commit = avatar => {
      const oldAvatar = this.data.pet.avatar
      const pet = { ...draft, avatar }
      const tasks = [store.set('pet', pet), store.set('care', careDraft)]
      if (weightChanged) {
        const capturedAt = Date.now()
        const capturedDate = new Date(capturedAt)
        const dayKey = store.todayKey()
        const time = `${String(capturedDate.getHours()).padStart(2, '0')}:${String(capturedDate.getMinutes()).padStart(2, '0')}`
        const weightRecord = { id: capturedAt, createdAt: capturedAt, dayKey, time, weight: Number(pet.weight) }
        const allWeightRecords = [weightRecord, ...store.get('weightRecords')]
        const weightRecords = allWeightRecords.slice(0, 100)
        tasks.push(store.set('weightRecords', weightRecords))
      }
      Promise.all(tasks).finally(() => {
        this.setData({ pet, draft: { ...pet }, profileEditOpen: false, careDraft: { ...careDraft }, newAvatarTemp: '', saving: false, changed: false })
        showNativeTabBar()
        if (oldAvatar && oldAvatar.indexOf('wxfile://') === 0 && oldAvatar !== avatar && wx.removeSavedFile) wx.removeSavedFile({ filePath: oldAvatar })
        wx.showToast({ title: '资料已保存', icon: 'none' })
      })
    }

    const saveAvatar = () => {
      if (!this.data.newAvatarTemp) return commit(draft.avatar)
      const cloudPath = `pet-avatars/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${avatarExtension(this.data.newAvatarTemp)}`
      cloud.uploadFile(cloudPath, this.data.newAvatarTemp)
        .then(fileID => commit(fileID))
        .catch(() => {
          this.setData({ saving: false })
          wx.showToast({ title: '头像保存失败', icon: 'none' })
        })
    }

    if (!this.data.newAvatarTemp) return commit(draft.avatar)
    this.setData({ saving: true })
    saveAvatar()
  },
  onShareAppMessage() {
    if (this.data.familyOpen) {
      const code = this.data.familyInviteCode || shortInviteCode(this.data.pet.name)
      return {
        title: `邀请你一起照顾${this.data.pet.name || '宠物'}`,
        path: `/pages/account/account?shareCode=${encodeURIComponent(code)}`,
        imageUrl: this.data.pet.avatar
      }
    }
    return {
      title: `${this.data.pet.name || '我的宠物'}的爪爪日常`,
      path: '/pages/profile/profile'
    }
  }
})
