const store = require('../../utils/store')
const { getWeather } = require('../../utils/weather')

function getBirthdayInfo(birthday) {
  const birth = new Date(`${birthday}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate())
  if (next < today) next = new Date(today.getFullYear() + 1, birth.getMonth(), birth.getDate())
  return {
    birthdayDays: Math.round((next - today) / 86400000),
    nextAge: next.getFullYear() - birth.getFullYear(),
    birthdayLabel: `${birth.getMonth() + 1}月${birth.getDate()}日`
  }
}

function formatDate(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

function getFestivalInfo(togetherSince, daysTogether) {
  const start = new Date(`${togetherSince}T00:00:00`)
  const currentHundred = Math.ceil(daysTogether / 100) * 100
  const isMilestoneToday = daysTogether % 100 === 0
  const nextMilestone = isMilestoneToday ? daysTogether : currentHundred
  const nextMilestoneDays = isMilestoneToday ? 0 : currentHundred - daysTogether
  const lastMilestone = Math.max(200, currentHundred + 200)
  const festivalItems = []

  for (let days = 100; days <= lastMilestone; days += 100) {
    const date = new Date(start)
    date.setDate(date.getDate() + days - 1)
    const remaining = days - daysTogether
    festivalItems.push({
      days,
      date: formatDate(date),
      state: remaining === 0 ? 'today' : remaining > 0 ? 'upcoming' : 'done',
      status: remaining === 0 ? '就是今天' : remaining > 0 ? `还有${remaining}天` : '已达成'
    })
  }
  return { togetherLabel: formatDate(start), nextMilestone, nextMilestoneDays, festivalItems }
}

function getSeasonInfo(month, weather) {
  if ([3, 4, 5].includes(month)) return { seasonName: '春季', seasonTip: '花粉和寄生虫逐渐活跃，散步后检查皮肤、耳朵与脚垫，并按兽医方案做好驱虫。' }
  if ([6, 7, 8].includes(month)) return { seasonName: '夏季', seasonTip: weather.apparent >= 30 ? '体感温度较高，避开正午和滚烫路面，优先清晨或晚间短时散步。' : '留意中暑与蚊虫叮咬，保证饮水，避免长时间暴晒和闷热环境。' }
  if ([9, 10, 11].includes(month)) return { seasonName: '秋季', seasonTip: '昼夜温差增大，注意保暖与换毛期梳理，也要继续做好跳蚤和蜱虫防护。' }
  return { seasonName: '冬季', seasonTip: '减少寒冷时段久留，关注脚垫干裂；运动量下降时注意体重和零食摄入。' }
}

function daysUntil(dateKey) {
  const target = new Date(`${dateKey}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target - today) / 86400000)
}

function shortDate(dateKey) {
  const parts = dateKey.split('-')
  return `${Number(parts[1])}月${Number(parts[2])}日`
}

function careStatus(label, dateKey, todayText) {
  const days = daysUntil(dateKey)
  if (days === 0) return todayText
  if (days > 0) return `还有 ${days} 天`
  return `已逾期 ${Math.abs(days)} 天`
}

function getCareItems(schedule) {
  return [
    { key: 'deworming', icon: '🪱', label: '体内外驱虫', last: schedule.dewormingLast, dateKey: schedule.deworming, date: shortDate(schedule.deworming), status: careStatus('驱虫', schedule.deworming, '今天该驱虫了'), cycle: `每 ${schedule.dewormingCycle} 个月` },
    { key: 'vaccine', icon: '💉', label: '疫苗接种', last: schedule.vaccineLast, dateKey: schedule.vaccine, date: shortDate(schedule.vaccine), status: careStatus('疫苗', schedule.vaccine, '今天该接种了'), cycle: `每 ${schedule.vaccineCycle} 个月` },
    { key: 'bath', icon: '🛁', label: '洗澡护理', last: schedule.bathLast, dateKey: schedule.bath, date: shortDate(schedule.bath), status: careStatus('洗澡', schedule.bath, '今天可以洗澡'), cycle: `每 ${schedule.bathCycle} 天` },
    { key: 'dental', icon: '🦷', label: '刷牙护理', last: schedule.dentalLast, dateKey: schedule.dental, date: shortDate(schedule.dental), status: careStatus('刷牙', schedule.dental, '今天建议刷牙'), cycle: `每 ${schedule.dentalCycle} 天` },
    { key: 'nail', icon: '✂️', label: '修剪指甲', last: schedule.nailLast, dateKey: schedule.nail, date: shortDate(schedule.nail), status: careStatus('剪指甲', schedule.nail, '今天可以修剪'), cycle: `每 ${schedule.nailCycle} 天` }
  ]
}

function getHealthTips(pet, ageYears, careSchedule) {
  let lifeStage = '青年期'
  let ageTip
  if (ageYears < 1) {
    lifeStage = '幼年期'
    ageTip = { type: 'age', icon: '🌱', title: '幼年期养护建议', desc: '少量多餐、按计划体检与免疫，并留意换牙和口腔发育。', badge: '按年龄', detail: ['喂食：选择适合幼犬生长阶段的完整主粮，按年龄和体重分成多次少量喂食，换粮应逐步过渡。', '体检：带齐免疫和驱虫记录，按兽医计划复诊，并持续记录体重、食欲与精神状态。', '口腔：观察乳牙脱落、恒牙萌出和牙龈情况，逐步建立使用宠物牙膏刷牙的习惯。'] }
  } else if (ageYears < 7) {
    ageTip = { type: 'age', icon: '🩺', title: '成年期养护建议', desc: '控制体重与零食，定期全面体检，并坚持日常口腔护理。', badge: '按年龄', detail: ['喂食：根据体重、体况和活动量调整每日主粮，零食不替代正餐，持续观察体重趋势。', '体检：建议与兽医讨论每 6～12 个月一次的全面检查，并携带近期喂食、排便和活动记录。', '口腔：定期查看牙龈、牙结石和口气，规律刷牙，并向兽医确认洁牙检查安排。'] }
  } else {
    lifeStage = '老年期'
    ageTip = { type: 'age', icon: '❤️', title: '老年期养护建议', desc: '关注体重与食欲变化，增加体检频率，并加强牙齿和牙龈检查。', badge: '按年龄', detail: ['喂食：结合兽医建议选择适合老年阶段的饮食，记录体重、饮水和食欲变化，不要自行大幅调整营养。', '体检：建议至少每 6 个月复查，并讨论血液、尿液及必要的影像筛查，保存结果用于趋势比较。', '口腔：观察牙龈、牙结石、口气和咀嚼习惯；若流口水、拒食或单侧咀嚼，应及时就诊。'] }
  }
  const careItems = getCareItems(careSchedule)
  const careSummary = careItems.map(item => `${item.label}${item.status.replace('还有 ', '').replace(' 天', '天')}`).join(' · ')
  const careTip = { type: 'care', icon: '📅', title: '护理与疫苗提醒', desc: careSummary, badge: '倒计时', careItems, detail: ['疫苗和驱虫产品需结合宠物体重、生活环境及既往记录，由兽医确认具体计划。', '洗澡频率应结合皮肤、毛发和天气调整；身体不适或刚完成医疗操作时先咨询兽医。', '刷牙使用宠物专用牙膏；剪指甲少量分次，避开血线，不确定时请专业人员处理。'] }
  const behaviorTip = { type: 'behavior', icon: '🐕', title: '读懂狗狗的行为语言', desc: '摇尾巴、舔嘴、打哈欠和露肚皮，需要结合全身姿态理解。', badge: '行为语言', detail: ['放松摇尾：身体柔软、尾巴自然摆动，通常表示友好或期待互动；僵硬快速摇尾也可能是警觉。', '舔嘴或频繁打哈欠：不一定是饿或困，也可能是在紧张、压力下尝试让自己平静。', '夹尾、耳朵向后、身体压低：常见于害怕或不安，应拉开距离并提供安全空间。', '前肢伏低、臀部抬高：通常是邀请玩耍；如果身体僵硬或伴随低吼，则要结合现场判断。', '露出肚皮：可能是信任放松，也可能是示弱和回避冲突，不要仅凭这个动作强行抚摸。'] }
  return { lifeStage, healthTips: [ageTip, careTip, behaviorTip] }
}

Page({
  data: {
    pet: {}, festivalOpen: false, healthTipOpen: false, selectedHealthTip: { careItems: [] }, careSchedule: {}, ageText: '', daysTogether: 0,
    todayFeedCount: 0, todayStoolCount: 0, waterTarget: 0, birthdayDays: 0, nextAge: 0, birthdayLabel: '',
    weatherLoading: true, weather: { icon: '🌤️', temperature: '--', apparent: '--', condition: '加载天气', location: '正在定位', rainText: '正在获取逐小时降雨预报', rainTime: '', live: false },
    seasonName: '', seasonTip: '', lifeStage: '', healthTips: []
  },
  onShow() { this.refresh(); this.loadWeather() },
  refresh() {
    const pet = store.get('pet')
    const start = new Date(pet.birthday)
    const togetherSince = pet.togetherSince || pet.birthday
    const togetherStart = new Date(`${togetherSince}T00:00:00`)
    const now = new Date()
    const months = Math.max(1, Math.floor((now - start) / 2629800000))
    const ageText = months >= 12 ? `${Math.floor(months / 12)}岁${months % 12 ? months % 12 + '个月' : ''}` : `${months}个月`
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const daysTogether = Math.max(1, Math.floor((today - togetherStart) / 86400000) + 1)
    const dayKey = store.todayKey()
    const todayFeedCount = store.get('feeds').filter(item => item.dayKey === dayKey).length
    const todayStoolCount = store.get('stools').filter(item => item.dayKey === dayKey).length
    const waterTarget = Math.round((Number(pet.weight) || 0) * 55)
    const birthday = getBirthdayInfo(pet.birthday)
    const festivals = getFestivalInfo(togetherSince, daysTogether)
    const careSchedule = store.normalizeCareSchedule(store.get('care'))
    store.set('care', careSchedule)
    const health = getHealthTips(pet, months / 12, careSchedule)
    this.setData({ pet: { ...pet, togetherSince }, careSchedule, ageText, daysTogether, todayFeedCount, todayStoolCount, waterTarget, ...birthday, ...festivals, ...health })
  },
  loadWeather() {
    this.setData({ weatherLoading: true })
    getWeather().then(weather => {
      const season = getSeasonInfo(new Date().getMonth() + 1, weather)
      this.setData({ weather, weatherLoading: false, ...season })
    })
  },
  openFestivals() { this.setData({ festivalOpen: true }) },
  closeFestivals() { this.setData({ festivalOpen: false }) },
  openHealthTip(e) { this.setData({ healthTipOpen: true, selectedHealthTip: this.data.healthTips[e.currentTarget.dataset.index] }) },
  closeHealthTip() { this.setData({ healthTipOpen: false }) },
  goAccount() { this.setData({ healthTipOpen: false }); wx.switchTab({ url: '/pages/account/account' }) },
  noop() {}
})
