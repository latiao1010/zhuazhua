const store = require('../../utils/store')
const { getWeather } = require('../../utils/weather')

function getBirthdayInfo(birthday) {
  const birth = new Date(`${birthday}T00:00:00`)
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

function buildWeightTrend(records, currentWeight) {
  const byDay = {}
  ;(records || []).forEach(item => {
    const weight = Number(item.weight)
    if (item.dayKey && weight > 0 && !byDay[item.dayKey]) byDay[item.dayKey] = { ...item, weight }
  })
  let ordered = Object.values(byDay).sort((a, b) => a.dayKey.localeCompare(b.dayKey))
  if (!ordered.length && Number(currentWeight) > 0) {
    ordered = [{ id: Date.now(), dayKey: store.todayKey(), weight: Number(currentWeight) }]
  }
  const recent = ordered.slice(-8)
  const weights = recent.map(item => item.weight)
  const min = Math.min(...weights)
  const max = Math.max(...weights)
  const range = max - min
  const bars = recent.map(item => {
    const parts = item.dayKey.split('-')
    return {
      ...item,
      dateLabel: `${Number(parts[1])}/${Number(parts[2])}`,
      height: range ? Math.round(42 + (item.weight - min) / range * 78) : 76
    }
  })
  const first = ordered[0]
  const last = ordered[ordered.length - 1]
  const change = first && last ? Number((last.weight - first.weight).toFixed(1)) : 0
  return {
    bars,
    history: ordered.slice(-10).reverse().map(item => ({ ...item, date: item.dayKey.replace(/-/g, '.') })),
    current: last ? last.weight : Number(currentWeight) || 0,
    change,
    changeText: change === 0 ? '保持稳定' : `${change > 0 ? '增加' : '减少'} ${Math.abs(change).toFixed(1)}kg`,
    changeClass: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
    min: min || Number(currentWeight) || 0,
    max: max || Number(currentWeight) || 0,
    hasTrend: ordered.length > 1
  }
}

function buildTodayFeeds(records) {
  const todayFeeds = (records || [])
    .filter(item => item.dayKey === store.todayKey())
    .map(item => ({
      ...item,
      foodText: item.food || '未填写食物',
      amountText: item.amount || '--',
      timeText: item.time || '--:--',
      iconText: item.icon || (item.type === '零食' ? '🦴' : '🥣')
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
      statusText: item.abnormal ? '需要留意' : '状态正常'
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

function formatTaskWait(targetMinutes, now) {
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const diff = targetMinutes - currentMinutes
  if (diff <= 0) return '建议现在完成'
  if (diff < 60) return `还有 ${diff} 分钟`
  return `还有 ${Math.floor(diff / 60)} 小时`
}

function timeAfterRain(rainTime) {
  const match = String(rainTime || '').match(/(\d{1,2}):(\d{2})/)
  if (!match) return '雨停后'
  const minutes = (Number(match[1]) * 60 + Number(match[2]) + 150) % 1440
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function getDogFoodDays(supplies, feeds) {
  const item = (supplies && supplies.dogFood) || {}
  const packageAmount = Number(item.packageAmount) || 0
  if (!item.openedDate || packageAmount <= 0) return { configured: false, daysLeft: null }
  const today = store.todayKey()
  const matched = (feeds || []).filter(feed => feed.dayKey && feed.dayKey >= item.openedDate && feed.dayKey <= today && feed.type !== '零食')
  const consumed = matched.reduce((sum, feed) => sum + numberFromText(feed.amount), 0)
  const recordedDays = new Set(matched.map(feed => feed.dayKey)).size
  const dailyAverage = recordedDays ? consumed / recordedDays : 0
  const remaining = Math.max(0, packageAmount - consumed)
  return { configured: true, daysLeft: dailyAverage ? Math.max(0, Math.ceil(remaining / dailyAverage)) : null }
}

function getTodayKnowledge(month) {
  if ([6, 7, 8].includes(month)) {
    return {
      icon: '☀️',
      title: '夏天为什么要避开中午遛狗？',
      summary: '高温路面可能烫伤脚垫，狗狗也更容易中暑。',
      detail: [
        '中午阳光直射时，柏油和水泥路面的温度通常明显高于气温，可能在短时间内烫伤脚垫。',
        '狗狗主要依靠喘气散热，高温、高湿和剧烈运动叠加时，中暑风险会明显增加。',
        '优先选择清晨或日落后的凉爽时段，出门前可用手背接触地面数秒，感觉烫手就不要久走。'
      ]
    }
  }
  if ([3, 4, 5].includes(month)) {
    return {
      icon: '🌿',
      title: '春天散步后为什么要检查毛发？',
      summary: '花粉、蜱虫和草籽容易藏进毛发、耳朵与脚趾间。',
      detail: ['回家后依次检查耳朵、腋下、腹部、趾间和尾巴根部。', '发现蜱虫不要直接硬拽，可联系兽医或使用合适工具处理。', '花粉较多时可用湿毛巾轻擦身体和脚垫，并保持皮肤干燥。']
    }
  }
  if ([9, 10, 11].includes(month)) {
    return {
      icon: '🍂',
      title: '换毛季应该多久梳一次毛？',
      summary: '规律梳毛能减少浮毛，也方便及时发现皮肤问题。',
      detail: ['根据毛发长度和掉毛量安排频率，换毛明显时可每天短时梳理。', '从毛尖开始轻柔梳开，不要反复拉扯打结区域。', '梳毛时同步观察皮屑、红肿、结痂和异常掉毛。']
    }
  }
  return {
    icon: '❄️',
    title: '冬天遛狗需要给脚垫保暖吗？',
    summary: '低温、融雪剂和干燥环境都可能刺激脚垫。',
    detail: ['缩短严寒时段的户外停留时间，回家后擦净并检查脚垫。', '接触融雪剂后及时用清水清洁，避免舔食残留。', '出现干裂、出血或持续舔脚时，应减少刺激并咨询兽医。']
  }
}

function buildCareFindings(careSchedule) {
  const careTypes = [
    { key: 'deworming', icon: '🪱', label: '体内外驱虫', action: '驱虫' },
    { key: 'medicine', icon: '💊', label: '宠物用药', action: '用药' },
    { key: 'vaccine', icon: '💉', label: '疫苗接种', action: '接种疫苗' },
    { key: 'bath', icon: '🛁', label: '洗澡护理', action: '洗澡' },
    { key: 'dental', icon: '🦷', label: '刷牙护理', action: '刷牙' },
    { key: 'nail', icon: '✂️', label: '修剪指甲', action: '修剪指甲' }
  ]
  const urgentItems = careTypes.reduce((items, config) => {
    const dateKey = careSchedule && careSchedule[config.key]
    if (!dateKey) return items
    const days = daysUntil(dateKey)
    if (days > 1) return items
    let text
    let tone
    let priority
    if (days < 0) {
      text = `${config.label}已逾期 ${Math.abs(days)} 天，请尽快安排${config.action}并补充记录。`
      tone = 'orange'
      priority = 0
    } else if (days === 0) {
      text = `今天该${config.action}了，完成后记得在“我的”中记录日期。`
      tone = 'orange'
      priority = 1
    } else {
      text = `明天要${config.action}，建议今天提前做好准备。`
      tone = 'purple'
      priority = 2
    }
    items.push({ id: `care-${config.key}`, icon: config.icon, text, tone, priority, target: 'account', careKey: config.key })
    return items
  }, [])
  const nearest = careTypes
    .map(config => ({ ...config, days: careSchedule && careSchedule[config.key] ? daysUntil(careSchedule[config.key]) : Infinity }))
    .filter(item => item.days > 1 && Number.isFinite(item.days))
    .sort((a, b) => a.days - b.days)[0]
  if (nearest) {
    urgentItems.push({
      id: `care-next-${nearest.key}`,
      icon: nearest.icon,
      text: `距离${nearest.label}还有 ${nearest.days} 天，可提前确认用品和时间。`,
      tone: 'cream',
      priority: 8,
      target: 'account',
      careKey: nearest.key
    })
  }
  return urgentItems
}

function buildHomeDashboard({ pet, feeds, stools, waters, walks, careSchedule, careRecords, supplies, weather }) {
  const now = new Date()
  const today = store.todayKey()
  const todayFeeds = (feeds || []).filter(item => item.dayKey === today)
  const todayStools = (stools || []).filter(item => item.dayKey === today)
  const todayWaters = (waters || []).filter(item => item.dayKey === today)
  const todayWalks = (walks || []).filter(item => item.dayKey === today)
  const todayWater = todayWaters.reduce((sum, item) => sum + numberFromText(item.amount), 0)
  const waterTarget = Math.round((Number(pet.weight) || 0) * 55)
  const dentalDone = careSchedule.dentalLast === today || (careRecords || []).some(item => item.key === 'dental' && item.date === today)
  const rainWalkTime = weather && weather.rainTime ? timeAfterRain(weather.rainTime) : '19:00'
  const walkParts = rainWalkTime.match(/(\d{1,2}):(\d{2})/)
  const walkMinutes = walkParts ? Number(walkParts[1]) * 60 + Number(walkParts[2]) : 19 * 60
  const tasks = [
    { key: 'breakfast', icon: '🥣', label: '早餐', detail: todayFeeds.some(item => item.type === '早餐') ? '已记录' : '等待记录', done: todayFeeds.some(item => item.type === '早餐'), action: 'feed', time: '08:00', plannedMinutes: 480 },
    { key: 'water', icon: '💧', label: `喝水 ${todayWater}ml`, detail: waterTarget ? `建议 ${waterTarget}ml` : '记录饮水量', done: todayWater > 0, action: 'water', time: '12:00', plannedMinutes: 720 },
    { key: 'stool', icon: '💩', label: `排便 ${todayStools.length} 次`, detail: todayStools.some(item => item.abnormal) ? '有异常需留意' : todayStools.length ? '状态正常' : '等待记录', done: todayStools.length > 0, action: 'stool', time: '13:00', plannedMinutes: 780 },
    { key: 'dinner', icon: '🍚', label: '晚餐', detail: todayFeeds.some(item => item.type === '晚餐') ? '已记录' : '18:00', done: todayFeeds.some(item => item.type === '晚餐'), action: 'feed', time: '18:00', plannedMinutes: 1080 },
    { key: 'walk', icon: '🐾', label: '散步', detail: todayWalks.length ? `${todayWalks.reduce((sum, item) => sum + numberFromText(item.duration), 0)} 分钟` : rainWalkTime, done: todayWalks.length > 0, action: 'walk', time: rainWalkTime, plannedMinutes: walkMinutes },
    { key: 'dental', icon: '🦷', label: '刷牙', detail: dentalDone ? '已完成' : '21:00', done: dentalDone, action: 'account', time: '21:00', plannedMinutes: 1260 }
  ].map(item => ({ ...item, stateIcon: item.done ? '✓' : '' }))
  const completedCount = tasks.filter(item => item.done).length
  const nextTask = tasks.filter(item => !item.done).sort((a, b) => a.plannedMinutes - b.plannedMinutes)[0]
  const next = nextTask
    ? { ...nextTask, waitText: formatTaskWait(nextTask.plannedMinutes, now), actionText: '去记录' }
    : { key: 'done', icon: '🎉', label: '今天的任务都完成啦', detail: '做得真棒', time: '今日', waitText: '全部完成', actionText: '查看', action: 'feed', done: true }
  let healthScore = 100
  if (now.getHours() >= 14 && waterTarget && todayWater < waterTarget * 0.7) healthScore -= 4
  if (todayStools.some(item => item.abnormal)) healthScore -= 8
  if (now.getHours() >= 10 && !tasks[0].done) healthScore -= 5
  if (now.getHours() >= 20 && !tasks[4].done) healthScore -= 3
  healthScore = Math.max(70, healthScore)
  const weatherAdvice = weather && weather.rainTime
    ? `${weather.rainTime}前后可能下雨，建议${rainWalkTime}后再出去散步。`
    : '天气暂无明显降雨提醒，可以按计划安排散步。'
  const dogFood = getDogFoodDays(supplies, feeds)
  const waterFinding = waterTarget && todayWater < waterTarget
    ? `今天饮水偏少，距离建议值还差 ${Math.max(0, waterTarget - todayWater)}ml。`
    : `今天已喝水 ${todayWater}ml，达到建议饮水量。`
  const supplyFinding = !dogFood.configured
    ? '还未设置狗粮拆封记录，设置后可自动估算余量。'
    : dogFood.daysLeft === null
      ? '狗粮余量还无法估算，继续记录喂食克数后会更准确。'
      : dogFood.daysLeft <= 7
        ? `狗粮预计还能吃 ${dogFood.daysLeft} 天，建议本周补货。`
        : `狗粮预计还能吃 ${dogFood.daysLeft} 天，目前余量充足。`
  const breakfastDone = tasks[0].done
  const dinnerDone = tasks[3].done
  const walkDuration = todayWalks.reduce((sum, item) => sum + numberFromText(item.duration), 0)
  const appetiteStatus = !breakfastDone && now.getHours() >= 10
    ? { value: '早餐待补', tone: 'watch' }
    : dinnerDone || now.getHours() < 17
      ? { value: '节奏正常', tone: 'good' }
      : { value: '晚餐待记', tone: 'neutral' }
  const waterRatio = waterTarget ? todayWater / waterTarget : 0
  const waterStatus = waterRatio >= 1
    ? { value: '已经达标', tone: 'good' }
    : waterRatio >= 0.7
      ? { value: '接近目标', tone: 'neutral' }
      : { value: '需要补水', tone: 'watch' }
  const stomachStatus = todayStools.some(item => item.abnormal)
    ? { value: '需要留意', tone: 'attention' }
    : todayStools.length
      ? { value: '状态正常', tone: 'good' }
      : { value: '等待观察', tone: 'neutral' }
  const activityStatus = todayWalks.length
    ? { value: `${walkDuration}分钟`, tone: 'good' }
    : weather && weather.rainTime
      ? { value: '雨后再出门', tone: 'neutral' }
      : { value: '等待散步', tone: 'watch' }
  const findingCandidates = [
    ...buildCareFindings(careSchedule),
    {
      id: 'water',
      icon: '💧',
      text: waterFinding,
      tone: todayWater < waterTarget ? 'blue' : 'green',
      priority: todayWater < waterTarget ? 7 : 12,
      target: 'water'
    },
    {
      id: 'weather',
      icon: '🌦',
      text: weather && weather.rainTime ? `${weather.rainText} 建议 ${rainWalkTime} 后遛狗。` : weatherAdvice,
      tone: 'purple',
      priority: weather && weather.rainTime ? 6 : 11
    },
    {
      id: 'supply',
      icon: '📦',
      text: supplyFinding,
      tone: dogFood.daysLeft !== null && dogFood.daysLeft <= 7 ? 'orange' : 'cream',
      priority: dogFood.daysLeft !== null && dogFood.daysLeft <= 3 ? 3 : dogFood.daysLeft !== null && dogFood.daysLeft <= 7 ? 5 : 10,
      target: 'account'
    }
  ]
  return {
    greeting: getGreeting(now.getHours()),
    healthScore,
    scoreLevel: healthScore >= 90 ? 'good' : healthScore >= 80 ? 'watch' : 'attention',
    healthSummary: `${healthScore >= 90 ? '今天状态不错' : '今天有几项需要留意'}，${weatherAdvice}`,
    tasks,
    completedCount,
    totalTasks: tasks.length,
    progress: Math.round(completedCount / tasks.length * 100),
    nextTask: next,
    statusCards: [
      { icon: '🍚', label: '食欲', action: 'feed', ...appetiteStatus },
      { icon: '💧', label: '水分', action: 'water', ...waterStatus },
      { icon: '🌿', label: '肠胃', action: 'stool', ...stomachStatus },
      { icon: '🐾', label: '活力', action: 'walk', ...activityStatus }
    ],
    findings: findingCandidates.sort((a, b) => a.priority - b.priority).slice(0, 4),
    knowledge: getTodayKnowledge(now.getMonth() + 1)
  }
}

Page({
  data: {
    pet: {}, festivalOpen: false, healthTipOpen: false, knowledgeOpen: false, weightTrendOpen: false, feedDetailOpen: false, stoolDetailOpen: false, weightTrend: { bars: [], history: [] }, selectedHealthTip: { careItems: [] }, careSchedule: {}, ageText: '', daysTogether: 0,
    todayFeeds: [], todayFeedCount: 0, todayFeedTotal: 0, todayStools: [], todayStoolCount: 0, todayStoolAbnormalCount: 0, todayStoolStatus: '等待记录', waterTarget: 0, birthdayDays: 0, nextAge: 0, birthdayLabel: '',
    weatherLoading: true, weather: { icon: '🌤️', temperature: '--', apparent: '--', condition: '加载天气', location: '正在定位', rainText: '正在获取逐小时降雨预报', rainTime: '', live: false },
    seasonName: '', seasonTip: '', lifeStage: '', healthTips: [],
    homeDashboard: { greeting: '', healthScore: 100, healthSummary: '', tasks: [], statusCards: [], completedCount: 0, totalTasks: 6, progress: 0, nextTask: {}, findings: [], knowledge: { detail: [] } }
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
    const feeds = store.get('feeds')
    const stools = store.get('stools')
    const waters = store.get('waters')
    const walks = store.get('walks')
    const careRecords = store.get('careRecords')
    const supplies = store.normalizeSupplies(store.get('supplies'))
    const feedSummary = buildTodayFeeds(feeds)
    const todayFeedCount = feedSummary.todayFeeds.length
    const stoolSummary = buildTodayStools(stools)
    const todayStoolCount = stoolSummary.todayStools.length
    const waterTarget = Math.round((Number(pet.weight) || 0) * 55)
    const todayWater = waters.filter(item => item.dayKey === dayKey).reduce((sum, item) => sum + (parseInt(item.amount, 10) || 0), 0)
    const birthday = getBirthdayInfo(pet.birthday)
    const festivals = getFestivalInfo(togetherSince, daysTogether)
    const careSchedule = store.normalizeCareSchedule(store.get('care'))
    store.set('care', careSchedule)
    const health = getHealthTips(pet, months / 12, careSchedule)
    const weightTrend = buildWeightTrend(store.get('weightRecords'), pet.weight)
    const homeDashboard = buildHomeDashboard({ pet, feeds, stools, waters, walks, careSchedule, careRecords, supplies, weather: this.data.weather })
    this.setData({ pet: { ...pet, togetherSince }, careSchedule, weightTrend, homeDashboard, ageText, daysTogether, todayFeedCount, ...feedSummary, todayStoolCount, ...stoolSummary, waterTarget, todayWater, ...birthday, ...festivals, ...health })
  },
  loadWeather() {
    this.setData({ weatherLoading: true })
    getWeather().then(weather => {
      const season = getSeasonInfo(new Date().getMonth() + 1, weather)
      this.setData({ weather, weatherLoading: false, ...season })
      this.refresh()
    })
  },
  openFestivals() { this.setData({ festivalOpen: true }) },
  closeFestivals() { this.setData({ festivalOpen: false }) },
  openWeightTrend() { this.setData({ weightTrendOpen: true }) },
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
  goDailyRecord(type, autoAdd, mealType) {
    const query = [`type=${type || 'feed'}`, 'single=1']
    if (autoAdd) query.push('add=1')
    if (type === 'feed' && mealType) query.push(`meal=${mealType === '早餐' ? 'breakfast' : 'dinner'}`)
    wx.navigateTo({ url: `/pages/feed/feed?${query.join('&')}` })
  },
  goNextTask() {
    const task = this.data.homeDashboard.nextTask || {}
    if (task.action === 'account') return wx.switchTab({ url: '/pages/account/account' })
    const mealType = task.key === 'breakfast' ? '早餐' : task.key === 'dinner' ? '晚餐' : ''
    this.goDailyRecord(task.action || 'feed', !task.done, mealType)
  },
  openStatusDetail(e) {
    const status = this.data.homeDashboard.statusCards[e.currentTarget.dataset.index]
    if (!status) return
    this.goDailyRecord(status.action || 'feed', false)
  },
  openKnowledge() { this.setData({ knowledgeOpen: true }) },
  closeKnowledge() { this.setData({ knowledgeOpen: false }) },
  openHealthTip(e) { this.setData({ healthTipOpen: true, selectedHealthTip: this.data.healthTips[e.currentTarget.dataset.index] }) },
  closeHealthTip() { this.setData({ healthTipOpen: false }) },
  goAccount() { this.setData({ healthTipOpen: false }); wx.switchTab({ url: '/pages/account/account' }) },
  noop() {}
})
