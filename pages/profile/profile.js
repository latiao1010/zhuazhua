const { buildWeightTrend } = require('../../utils/weight-trend')
const tabNavigation = require('../../utils/tab-navigation')
const store = require('../../utils/store')
const weatherService = require('../../utils/weather')
const cloudData = require('../../utils/cloud-data')

const DISCOVERY_SLIDES = [
  { tool: 'outings', label: '带狗出门', title: '下一站，也带上它', description: '按城市找吃饭、住宿和游玩的地方' },
  { tool: 'age', label: '年龄换算', title: '它相当于人类几岁？', description: '算算年龄，留下一张相伴纪念', icon: 'age' },
  { tool: 'personality', label: '性格测试', title: '读懂它的小个性', description: '回答日常小问题，发现它的性格', icon: 'heart' },
  { tool: 'bingo', label: '行为九宫格', title: '这些小习惯，它中了几个？', description: '选出同款行为，分享你家的日常', icon: 'grid' }
]

function getBirthdayInfo(birthday) {
  const birth = new Date(`${birthday}T00:00:00`)
  if (!Number.isFinite(birth.getTime())) return { birthdayDays: null, nextAge: '', birthdayLabel: '生日待完善', birthdayItems: [] }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate())
  if (next < today) next = new Date(today.getFullYear() + 1, birth.getMonth(), birth.getDate())
  const nextAge = next.getFullYear() - birth.getFullYear()
  const birthdayItems = []
  for (let age = 1; age <= Math.max(1, nextAge); age += 1) {
    const date = new Date(birth.getFullYear() + age, birth.getMonth(), birth.getDate())
    const remaining = Math.round((date - today) / 86400000)
    birthdayItems.push({
      age,
      date: formatDate(date),
      state: remaining === 0 ? 'today' : remaining > 0 ? 'upcoming' : 'done',
      status: remaining === 0 ? '就是今天' : remaining > 0 ? `还有${remaining}天` : '已度过'
    })
  }
  return {
    birthdayDays: Math.round((next - today) / 86400000),
    nextAge,
    birthdayLabel: `${birth.getMonth() + 1}月${birth.getDate()}日`,
    birthdayItems
  }
}

function formatDate(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

function getFestivalInfo(togetherSince, daysTogether) {
  const start = new Date(`${togetherSince}T00:00:00`)
  if (!Number.isFinite(start.getTime())) return { togetherLabel: '待完善', nextMilestone: 100, nextMilestoneDays: '', festivalItems: [] }
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

function offsetDateKey(days) {
  const date = new Date(`${store.todayKey()}T00:00:00`)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
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
    { key: 'medicine', icon: '💊', label: '宠物用药', last: schedule.medicineLast, dateKey: schedule.medicine, date: shortDate(schedule.medicine), status: careStatus('用药', schedule.medicine, '今天该用药了'), cycle: `每 ${schedule.medicineCycle} 天` },
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
  const careTip = { type: 'care', icon: '📅', title: '护理到期提醒', desc: careSummary, badge: '倒计时', careItems, detail: ['疫苗和驱虫产品需结合宠物体重、生活环境及既往记录，由兽医确认具体计划。', '洗澡频率应结合皮肤、毛发和天气调整；身体不适或刚完成医疗操作时先咨询兽医。', '刷牙使用宠物专用牙膏；剪指甲少量分次，避开血线，不确定时请专业人员处理。'] }
  const behaviorTip = { type: 'behavior', icon: '🐕', title: '读懂狗狗的行为语言', desc: '摇尾巴、舔嘴、打哈欠和露肚皮，需要结合全身姿态理解。', badge: '行为语言', detail: ['放松摇尾：身体柔软、尾巴自然摆动，通常表示友好或期待互动；僵硬快速摇尾也可能是警觉。', '舔嘴或频繁打哈欠：不一定是饿或困，也可能是在紧张、压力下尝试让自己平静。', '夹尾、耳朵向后、身体压低：常见于害怕或不安，应拉开距离并提供安全空间。', '前肢伏低、臀部抬高：通常是邀请玩耍；如果身体僵硬或伴随低吼，则要结合现场判断。', '露出肚皮：可能是信任放松，也可能是示弱和回避冲突，不要仅凭这个动作强行抚摸。'] }
  return { lifeStage, healthTips: [ageTip, careTip, behaviorTip] }
}


function buildTodayFeeds(records) {
  const todayFeeds = (records || [])
    .filter(item => item.dayKey === store.todayKey())
    .map(item => ({
      ...item,
      foodText: item.food || '未填写食物',
      amountText: item.amount || '--',
      timeText: item.time || '--:--',
      iconText: item.icon || (item.type === '零食' ? '🦴' : '🥣'),
      attributionText: item.recordedByName ? `${item.recordedByName} · ${item.recordedByRole === 'owner' ? '主人' : '共同照护'}` : ''
    }))
  const todayFeedTotal = todayFeeds.reduce((sum, item) => {
    const amount = String(item.amount || '').match(/[\d.]+/)
    return sum + (amount ? Number(amount[0]) || 0 : 0)
  }, 0)
  return { todayFeeds, todayFeedTotal }
}

function buildTodayStools(records) {
  const todayStools = (records || [])
    .filter(item => item.dayKey === store.todayKey())
    .map(item => ({
      ...item,
      conditionText: item.condition || '未填写状态',
      colorText: item.color || '未填写颜色',
      noteText: item.note || '',
      timeText: item.time || '--:--',
      statusText: item.abnormal ? '需要留意' : '状态正常',
      attributionText: item.recordedByName ? `${item.recordedByName} · ${item.recordedByRole === 'owner' ? '主人' : '共同照护'}` : ''
    }))
  const todayStoolAbnormalCount = todayStools.filter(item => item.abnormal).length
  return {
    todayStools,
    todayStoolAbnormalCount,
    todayStoolStatus: todayStoolAbnormalCount ? `${todayStoolAbnormalCount} 条需要留意` : todayStools.length ? '今日状态正常' : '等待记录'
  }
}

function numberFromText(value) {
  const match = String(value || '').match(/[\d.]+/)
  return match ? Number(match[0]) || 0 : 0
}

function getGreeting(hour) {
  if (hour < 6) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

function getPersonalizedKnowledge({ now, pet, weather, todayStools, todayWater, waterRecordCount }) {
  const dayStart = new Date(now.getFullYear(), 0, 1)
  const dayIndex = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - dayStart) / 86400000)
  const birthday = pet && pet.birthday ? new Date(`${pet.birthday}T00:00:00`) : null
  const ageMonths = birthday && !Number.isNaN(birthday.getTime())
    ? Math.max(1, Math.floor((now - birthday) / 2629800000))
    : null
  const ageLabel = ageMonths ? (ageMonths >= 12 ? `${Math.floor(ageMonths / 12)}岁${ageMonths % 12 ? `${ageMonths % 12}个月` : ''}` : `${ageMonths}个月`) : '年龄待完善'
  const lifeStage = !ageMonths ? '宠物' : ageMonths < 12 ? '幼年宠物' : ageMonths >= 84 ? '老年宠物' : '成年宠物'
  const isPuppy = ageMonths !== null && ageMonths < 12
  const isSenior = ageMonths !== null && ageMonths >= 84
  const apparent = weather && weather.live === true ? Number(weather.apparent) : NaN
  const hasRain = Boolean(weather && weather.live === true && weather.rainTime)
  const abnormalStools = (todayStools || []).filter(item => item.abnormal).length
  const healthText = abnormalStools
    ? `今天有 ${abnormalStools} 条排便记录标记了异常，可回顾具体状态与备注`
    : waterRecordCount
      ? `今天已记录饮水 ${todayWater} ml；记录量不一定等于实际饮水量`
      : '今天还没有饮水记录，可以从记下一次饮水开始'

  let weatherTitle = '出门前，留意当地天气'
  let weatherSummary = '出门前查看当地天气，再安排今天的外出。'
  let weatherAction = '结合当地天气与平时习惯安排活动，准备好牵绳和饮水。'
  if (hasRain) {
    weatherTitle = '有降水提醒，散步留意路面'
    weatherSummary = '雨天湿毛和湿脚垫更容易带来皮肤不适。'
    weatherAction = `${weather.rainTime}可能有降水，外出留意路面；回家后擦干脚垫、腹部和趾间。`
  } else if (Number.isFinite(apparent) && apparent >= 30) {
    weatherTitle = '体感偏热，今天优先防暑和补水'
    weatherSummary = `当前体感约 ${apparent}℃，高温会增加中暑和脚垫烫伤风险。`
    weatherAction = '避开中午外出，优先在清晨或日落后短时散步，并少量多次补水。'
  } else if (Number.isFinite(apparent) && apparent <= 5) {
    weatherTitle = '体感偏冷，今天注意保暖和脚垫护理'
    weatherSummary = `当前体感约 ${apparent}℃，低温会让关节和脚垫更不舒服。`
    weatherAction = '缩短户外停留，回家后擦干脚垫；怕冷的宠物可穿合身衣物。'
  }

  const ageAction = isPuppy
    ? '幼年阶段精力旺盛，但活动应分成多次短时进行，避免一次过度消耗。'
    : isSenior
      ? '老年阶段更要避免突然加量运动，留意起身、上下楼和散步后的关节反应。'
      : '成年阶段可保持规律散步和互动，并用每周体重变化校准食量。'
  const healthAction = abnormalStools
    ? '今天先保持饮食简单稳定，记录排便次数、形态和精神状态；持续异常或伴随呕吐、无力时尽快咨询兽医。'
    : '记录饮水、排便和活动时，也可以补充当时的状态；忘记记录不代表没有发生。'

  const weatherKnowledge = {
    icon: hasRain ? '🌧️' : Number.isFinite(apparent) && apparent >= 30 ? '☀️' : Number.isFinite(apparent) && apparent <= 5 ? '❄️' : '🌤️',
    title: weatherTitle,
    summary: `${weatherSummary} ${ageLabel}的${lifeStage}，${healthText}。`,
    detail: [weatherAction, `健康记录：${healthText}。`, `年龄建议：${ageAction}`]
  }
  const ageKnowledge = {
    icon: isPuppy ? '🐶' : isSenior ? '🦮' : '🐾',
    title: `${ageLabel}${lifeStage}的今日护理重点`,
    summary: `${ageAction} 同时，${weatherSummary}`,
    detail: [`年龄建议：${ageAction}`, `天气安排：${weatherAction}`, `健康观察：${healthText}。`]
  }
  const healthKnowledge = {
    icon: abnormalStools ? '🩺' : '💧',
    title: abnormalStools ? '怎样回顾异常排便记录？' : '用记录了解它的日常',
    summary: `${healthText}。`,
    detail: [healthAction, `天气安排：${weatherAction}`, `年龄建议：${ageAction}`]
  }
  return [weatherKnowledge, ageKnowledge, healthKnowledge][dayIndex % 3]
}

function buildCareFindings(careSchedule, careRecords) {
  const today = store.todayKey()
  const types = [
    { key: 'deworming', label: '驱虫' }, { key: 'medicine', label: '用药' },
    { key: 'vaccine', label: '疫苗' }, { key: 'bath', label: '洗澡' },
    { key: 'dental', label: '刷牙' }, { key: 'nail', label: '剪指甲' }
  ]
  return types.reduce((items, item) => {
    const date = careSchedule[item.key]
    if (!date) return items
    const days = daysUntil(date)
    const completedToday = careSchedule[`${item.key}Last`] === today ||
      (careRecords || []).some(record => record.key === item.key && record.date === today)
    if (!Number.isFinite(days) || days > 0 || completedToday) return items
    items.push({ ...item, days, overdue: days < 0,
      summary: days < 0 ? `提醒已过 ${Math.abs(days)} 天` : '今天到期',
      detail: days < 0 ? '查看原计划，确认是否需要补记' : '按你的照护计划安排，完成后记一笔' })
    return items
  }, []).sort((a, b) => a.days - b.days)
}

function buildWeatherTip(weather) {
  if (!weather || weather.live !== true) return ''
  if (weather.rainTime) return '外出备好雨具，回家擦干脚垫'
  if (Number(weather.apparent) >= 30) return '体感偏热，避开高温时段外出'
  return '外出带好牵绳和饮水'
}

function buildRecentFindings(waters, stools, rangeDays) {
  const today = store.todayKey()
  const start = offsetDateKey(-(rangeDays - 1))
  const inRange = item => item.dayKey >= start && item.dayKey <= today
  const waterRecords = (waters || []).filter(item => inRange(item) && numberFromText(item.amount) > 0)
  const waterDays = new Set(waterRecords.map(item => item.dayKey)).size
  const total = Math.round(waterRecords.reduce((sum, item) => sum + numberFromText(item.amount), 0) * 10) / 10
  const average = waterDays ? Math.round(total / waterDays) : 0
  const stoolRecords = (stools || []).filter(inRange)
  const stoolDays = new Set(stoolRecords.map(item => item.dayKey)).size
  const abnormalCount = stoolRecords.filter(item => item.abnormal).length
  return [
    {
      id: 'water', target: 'water', label: '饮水', icon: 'water', tone: 'mint',
      title: waterDays ? `记录日均 ${average} ml` : `近 ${rangeDays} 天暂无饮水记录`,
      compactTitle: waterDays ? `日均 ${average} ml` : '暂无记录',
      compactSummary: `已记录 ${waterDays}/${rangeDays} 天`,
      text: `累计 ${total} ml · 已记录 ${waterDays}/${rangeDays} 天`,
      note: waterDays < rangeDays ? `${rangeDays - waterDays} 天未记录，不计入日均` : '日均按有记录的天数计算',
      total, average, recordedDays: waterDays, missingDays: rangeDays - waterDays
    },
    {
      id: 'stool', target: 'stool', label: '排便', icon: 'record', tone: abnormalCount ? 'attention' : 'mint',
      title: stoolRecords.length ? `${stoolRecords.length} 次记录 · ${abnormalCount} 次标记异常` : `近 ${rangeDays} 天暂无排便记录`,
      compactTitle: stoolRecords.length ? (abnormalCount ? `${abnormalCount} 次标记异常` : '未标记异常') : '暂无记录',
      compactSummary: `共 ${stoolRecords.length} 次 · ${stoolDays}/${rangeDays} 天`,
      text: `已记录 ${stoolDays}/${rangeDays} 天`,
      note: abnormalCount ? '查看记录中的形态、颜色和备注' : '仅汇总已保存记录，不代表健康判断',
      recordedDays: stoolDays, abnormalCount
    }
  ]
}

function buildHomeDashboard({ pet, feeds, stools, waters, walks, careSchedule, careRecords, weather, rangeDays = 7 }) {
  const now = new Date()
  const today = store.todayKey()
  const todayRecords = records => (records || []).filter(item => item.dayKey === today)
  const todayFeeds = todayRecords(feeds)
  const todayStools = todayRecords(stools)
  const todayWaters = todayRecords(waters)
  const todayWalks = todayRecords(walks)
  const total = (records, field) => Math.round(records.reduce((sum, item) => sum + numberFromText(item[field]), 0) * 10) / 10
  const todayWater = total(todayWaters, 'amount')
  const waterTarget = Number(store.get('waterGoal')) || Math.round((Number(pet.weight) || 0) * 55)
  const abnormalCount = todayStools.filter(item => item.abnormal).length
  return {
    greeting: getGreeting(now.getHours()),
    dateLabel: `${now.getMonth() + 1}月${now.getDate()}日 · 星期${'日一二三四五六'[now.getDay()]}`,
    statusCards: [
      { label: '喂食', action: 'feed', value: todayFeeds.length ? total(todayFeeds, 'amount') : '—', unit: 'g', detail: todayFeeds.length ? `${todayFeeds.length} 次喂食记录` : '今天还没有记录', compactDetail: todayFeeds.length ? `${todayFeeds.length} 次记录` : '未记录', tone: 'neutral' },
      { label: '饮水', action: 'water', value: todayWaters.length ? todayWater : '—', unit: 'ml', detail: !todayWaters.length ? '今天还没有记录' : waterTarget ? `参考目标 ${waterTarget} ml` : `${todayWaters.length} 次饮水记录`, compactDetail: todayWaters.length ? `${todayWaters.length} 次记录` : '未记录', tone: 'neutral' },
      { label: '排便', action: 'stool', value: todayStools.length || '—', unit: '次', detail: abnormalCount ? `${abnormalCount} 次标记异常` : todayStools.length ? '已记录，未标记异常' : '今天还没有记录', compactDetail: abnormalCount ? `${abnormalCount} 次异常` : todayStools.length ? '未标记异常' : '未记录', tone: abnormalCount ? 'attention' : 'neutral' },
      { label: '散步', action: 'walk', value: todayWalks.length ? total(todayWalks, 'duration') : '—', unit: '分钟', detail: todayWalks.length ? `${todayWalks.length} 次散步记录` : '今天还没有记录', compactDetail: todayWalks.length ? `${todayWalks.length} 次记录` : '未记录', tone: 'neutral' }
    ],
    careReminders: buildCareFindings(careSchedule, careRecords),
    weatherTip: buildWeatherTip(weather),
    findings: buildRecentFindings(waters, stools, rangeDays),
    knowledge: getPersonalizedKnowledge({ now, pet, weather, todayStools, todayWater, waterRecordCount: todayWaters.length })
  }
}

Page({
  data: {
    pet: {}, festivalOpen: false, healthTipOpen: false, knowledgeOpen: false, weightTrendOpen: false, feedDetailOpen: false, stoolDetailOpen: false, weightTrend: { bars: [], history: [] }, selectedHealthTip: { careItems: [] }, careSchedule: {}, ageText: '', daysTogether: 0,
    todayFeeds: [], todayFeedCount: 0, todayFeedTotal: 0, todayStools: [], todayStoolCount: 0, todayStoolAbnormalCount: 0, todayStoolStatus: '等待记录', waterTarget: 0, birthdayDays: 0, nextAge: 0, birthdayLabel: '',
    weatherLoading: false, weather: weatherService.emptyWeather(),
    seasonName: '', seasonTip: '', lifeStage: '', healthTips: [],
    homeDashboard: { greeting: '', dateLabel: '', statusCards: [], careReminders: [], weatherTip: '', findings: [], knowledge: { detail: [] } },
    insightRange: 7, demoMode: false, readOnly: false, careRemindersOpen: false, recentOpen: false, largeText: false,
    discoverySlides: DISCOVERY_SLIDES, discoveryIndex: 0
  },
  setInsightRange(event) {
    const range = Number(event.currentTarget.dataset.range)
    if (![7, 14].includes(range) || range === this.data.insightRange) return
    this.setData({ insightRange: range })
    this.refresh()
  },
  goRecords() { tabNavigation.openTab('records') },
  openOutings() {
    wx.navigateTo({ url: '/packages/outings/index', fail: () => wx.showToast({ title: '页面暂时无法打开，请重试', icon: 'none' }) })
  },
  onDiscoveryChange(event) {
    const index = Number(event.detail.current)
    if (Number.isInteger(index) && index >= 0 && index < DISCOVERY_SLIDES.length) this.setData({ discoveryIndex: index })
  },
  openDiscovery(event) {
    const tool = event.currentTarget.dataset.tool
    if (tool === 'outings') return this.openOutings()
    if (DISCOVERY_SLIDES.some(item => item.tool === tool)) this.openPlay(event)
  },
  openPlay(e) {
    const tool = ['age','personality','bingo'].includes(e.currentTarget.dataset.tool) ? e.currentTarget.dataset.tool : 'age'
    wx.navigateTo({ url: '/pages/play/play?tool=' + tool })
  },
  onShow() {
    this.pageVisible = true
    this.syncFontPreference()
    this.refresh()
    cloudData.syncOnResume().then(() => { if (this.pageVisible) this.refresh() })
    this.loadWeather()
    clearInterval(this.weatherTimer)
    this.weatherTimer = setInterval(() => { if (this.pageVisible) this.loadWeather() }, 15 * 60 * 1000)
  },
  syncFontPreference() {
    let largeText = false
    try {
      const info = typeof wx.getAppBaseInfo === 'function' ? wx.getAppBaseInfo() : wx.getSystemInfoSync()
      largeText = Number(info.fontSizeSetting) >= 19 || Number(info.fontSizeScaleFactor) >= 1.15
    } catch (_) {}
    if (largeText !== this.data.largeText) this.setData({ largeText })
  },
  onHide() {
    this.pageVisible = false
    this.weatherRequest = (this.weatherRequest || 0) + 1
    clearInterval(this.weatherTimer)
    this.setData({ festivalOpen: false, healthTipOpen: false, knowledgeOpen: false, weightTrendOpen: false, feedDetailOpen: false, stoolDetailOpen: false, careRemindersOpen: false, recentOpen: false })
  },
  onUnload() {
    this.pageVisible = false
    this.weatherRequest = (this.weatherRequest || 0) + 1
    clearInterval(this.weatherTimer)
  },
  refresh() {
    const pet = store.get('pet')
    const start = new Date(pet.birthday)
    const togetherSince = pet.togetherSince || pet.birthday
    const togetherStart = new Date(`${togetherSince}T00:00:00`)
    const now = new Date()
    const months = Number.isFinite(start.getTime()) ? Math.max(1, Math.floor((now - start) / 2629800000)) : 0
    const ageText = !months ? '年龄待完善' : months >= 12 ? `${Math.floor(months / 12)}岁${months % 12 ? months % 12 + '个月' : ''}` : `${months}个月`
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const daysTogether = Number.isFinite(togetherStart.getTime()) ? Math.max(1, Math.floor((today - togetherStart) / 86400000) + 1) : 0
    const dayKey = store.todayKey()
    const feeds = store.get('feeds')
    const stools = store.get('stools')
    const waters = store.get('waters')
    const walks = store.get('walks')
    const careRecords = store.get('careRecords')
    const feedSummary = buildTodayFeeds(feeds)
    const todayFeedCount = feedSummary.todayFeeds.length
    const stoolSummary = buildTodayStools(stools)
    const todayStoolCount = stoolSummary.todayStools.length
    const waterTarget = Number(store.get('waterGoal')) || Math.round((Number(pet.weight) || 0) * 55)
    const todayWater = Math.round(waters.filter(item => item.dayKey === dayKey).reduce((sum, item) => sum + numberFromText(item.amount), 0) * 10) / 10
    const birthday = getBirthdayInfo(pet.birthday)
    const festivals = getFestivalInfo(togetherSince, daysTogether)
    const careSchedule = store.normalizeCareSchedule(store.get('care'))
    const health = getHealthTips(pet, months / 12, careSchedule)
    const weightTrend = buildWeightTrend(store.get('weightRecords'), pet.weight, store.todayKey())
    const homeDashboard = buildHomeDashboard({ pet, feeds, stools, waters, walks, careSchedule, careRecords, weather: this.data.weather, rangeDays: this.data.insightRange || 7 })
    const syncStatus = cloudData.getSyncStatus ? cloudData.getSyncStatus() : {}
    const shareStatus = cloudData.getShareStatus ? cloudData.getShareStatus() : {}
    const demoMode = !!(store.isDemoMode && store.isDemoMode())
    const readOnly = !demoMode && !!shareStatus.shared && shareStatus.role === 'viewer'
    const syncLabel = syncStatus.status === 'conflict' ? '记录有冲突，点此处理' : syncStatus.status === 'fail' ? '同步异常' : syncStatus.status === 'pending' ? '待同步' : ''
    this.setData({ pet: { ...pet, togetherSince }, demoMode, readOnly, careSchedule, weightTrend, homeDashboard, ageText, daysTogether, todayFeedCount, ...feedSummary, todayStoolCount, ...stoolSummary, waterTarget, todayWater, syncLabel, ...birthday, ...festivals, ...health })
  },
  loadWeather(force = false) {
    const request = this.weatherRequest = (this.weatherRequest || 0) + 1
    this.setData({ weatherLoading: true, weather: weatherService.emptyWeather() })
    this.refresh()
    weatherService.getWeather({ force }).then(weather => {
      if (!this.pageVisible || request !== this.weatherRequest) return
      const season = getSeasonInfo(new Date().getMonth() + 1, weather)
      this.setData({ weather, weatherLoading: false, ...season })
      this.refresh()
    }).catch(() => {
      if (!this.pageVisible || request !== this.weatherRequest) return
      this.setData({ weather: weatherService.emptyWeather('unavailable'), weatherLoading: false })
      this.refresh()
    })
  },
  refreshWeather() { if (!this.data.weatherLoading) this.loadWeather(true) },
  openWeatherDetails() {
    const weather = this.data.weather
    if (this.data.weatherLoading) return
    const content = weather.live
      ? [`${weather.location} · ${weather.condition} ${weather.temperature}℃`, `体感 ${weather.apparent}℃`, weather.rainText, this.data.homeDashboard.weatherTip, `${weather.updatedLabel} 更新 · 数据来源 Open-Meteo`].filter(Boolean).join('\n\n')
      : weather.rainText
    wx.showModal({ title: '本地天气与外出建议', content, showCancel: false, confirmText: '知道了' })
  },
  onWeatherPrivacyAgreed() { this.loadWeather(true) },
  onWeatherSettings(event) {
    if ((event.detail.authSetting || {})[weatherService.LOCATION_SCOPE]) this.loadWeather(true)
  },
  openWeatherPrivacy() {
    wx.openPrivacyContract({ fail: () => wx.showToast({ title: '隐私指引暂时无法打开', icon: 'none' }) })
  },
  copyWeatherSources() {
    wx.setClipboardData({ data: '天气：Open-Meteo https://open-meteo.com/（CC BY 4.0）\n城市识别：BigDataCloud https://www.bigdatacloud.com/' })
  },
  openFestivals() {
    if (!this.data.pet.togetherSince) return this.goAccount()
    this.setData({ festivalOpen: true })
  },
  closeFestivals() { this.setData({ festivalOpen: false }) },
  openWeightTrend() {
    if (!this.data.pet.weight) return tabNavigation.openTab('account', 'weight')
    this.setData({ weightTrendOpen: true })
  },
  closeWeightTrend() { this.setData({ weightTrendOpen: false }) },
  openFeedDetail() { this.refresh(); this.setData({ feedDetailOpen: true }) },
  closeFeedDetail() { this.setData({ feedDetailOpen: false }) },
  goFeed() {
    this.setData({ feedDetailOpen: false })
    wx.navigateTo({ url: '/pages/feed/feed?type=feed&single=1' })
  },
  openStoolDetail() { this.refresh(); this.setData({ stoolDetailOpen: true }) },
  closeStoolDetail() { this.setData({ stoolDetailOpen: false }) },
  goStool() {
    this.setData({ stoolDetailOpen: false })
    wx.navigateTo({ url: '/pages/feed/feed?type=stool&single=1' })
  },
  goDailyRecord(type) {
    if (!['feed', 'water', 'stool', 'walk'].includes(type)) return
    wx.navigateTo({ url: `/pages/feed/feed?type=${type}&single=1` })
  },
  openStatusDetail(e) {
    const status = this.data.homeDashboard.statusCards[e.currentTarget.dataset.index]
    if (!status) return
    this.goDailyRecord(status.action || 'feed')
  },
  openFinding(event) {
    const finding = this.data.homeDashboard.findings[Number(event.currentTarget.dataset.index)]
    if (!finding) return
    this.setData({ recentOpen: false })
    this.goDailyRecord(finding.target)
  },
  openRecent() { this.refresh(); this.setData({ recentOpen: true }) },
  closeRecent() { this.setData({ recentOpen: false }) },
  openCareReminders() {
    this.refresh()
    this.setData({ careRemindersOpen: true })
  },
  closeCareReminders() { this.setData({ careRemindersOpen: false }) },
  openCareReminder(event) {
    const key = event.currentTarget.dataset.key
    if (!(this.data.homeDashboard.careReminders || []).some(item => item.key === key)) return
    this.setData({ careRemindersOpen: false })
    tabNavigation.openTab('care', key)
  },
  openKnowledge() { this.setData({ knowledgeOpen: true }) },
  closeKnowledge() { this.setData({ knowledgeOpen: false }) },
  openHealthTip(e) { this.setData({ healthTipOpen: true, selectedHealthTip: this.data.healthTips[e.currentTarget.dataset.index] }) },
  closeHealthTip() { this.setData({ healthTipOpen: false }) },
  goCare() { this.setData({ healthTipOpen: false, careRemindersOpen: false }); tabNavigation.openTab('care') },
  goAccount() { this.setData({ healthTipOpen: false }); wx.switchTab({ url: '/pages/account/account' }) },
  noop() {}
})
