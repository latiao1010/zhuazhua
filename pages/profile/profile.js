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
  let normalized = (records || [])
    .map(item => {
      const weight = Number(item.weight)
      const createdAt = Number(item.createdAt) || Number(item.id) || new Date(`${item.dayKey || store.todayKey()}T00:00:00`).getTime()
      return { ...item, weight, createdAt, photoPath: item.photoPath || '' }
    })
    .filter(item => item.dayKey && item.weight > 0)
    .sort((a, b) => b.createdAt - a.createdAt)
  if (!normalized.length && Number(currentWeight) > 0) {
    const createdAt = Date.now()
    normalized = [{ id: createdAt, createdAt, dayKey: store.todayKey(), time: '', weight: Number(currentWeight), photoPath: '' }]
  }
  const byDay = {}
  normalized.forEach(item => {
    if (!byDay[item.dayKey]) byDay[item.dayKey] = item
  })
  const ordered = Object.values(byDay).sort((a, b) => a.dayKey.localeCompare(b.dayKey))
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
  const first = normalized[normalized.length - 1]
  const last = normalized[0]
  const change = first && last ? Number((last.weight - first.weight).toFixed(1)) : 0
  return {
    bars,
    history: normalized.slice(0, 30).map(item => ({
      ...item,
      date: item.dayKey.replace(/-/g, '.'),
      timeText: item.time || '',
      hasPhoto: Boolean(item.photoPath)
    })),
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

function getTodayKnowledge(month, date = new Date()) {
  const seasonalKnowledge = {
    spring: [
      { icon: '🌿', title: '春天散步后为什么要检查毛发？', summary: '花粉、蜱虫和草籽容易藏进毛发、耳朵与脚趾间。', detail: ['回家后依次检查耳朵、腋下、腹部、趾间和尾巴根部。', '发现蜱虫不要直接硬拽，可联系兽医或使用合适工具处理。', '花粉较多时可用湿毛巾轻擦身体和脚垫，并保持皮肤干燥。'] },
      { icon: '🪲', title: '外出回来为什么要检查蜱虫？', summary: '蜱虫常藏在耳后、腋下和趾间，越早发现越容易处理。', detail: ['散步后重点查看皮肤褶皱和毛发浓密处。', '发现附着蜱虫时，不要挤压虫体或徒手拔除。', '出现红肿、精神不佳等情况，及时咨询兽医。'] },
      { icon: '🌼', title: '花粉季怎么减少皮肤刺激？', summary: '减少过敏原残留，能让皮肤和脚垫更舒服。', detail: ['花粉浓度高时缩短草地停留时间。', '回家后擦拭脚垫、腹部和嘴周毛发。', '频繁抓挠、红疹或耳朵发红时应留意并就诊。'] }
    ],
    summer: [
      { icon: '☀️', title: '夏天为什么要避开中午遛狗？', summary: '高温路面可能烫伤脚垫，狗狗也更容易中暑。', detail: ['中午阳光直射时，柏油和水泥路面的温度通常明显高于气温，可能在短时间内烫伤脚垫。', '狗狗主要依靠喘气散热，高温、高湿和剧烈运动叠加时，中暑风险会明显增加。', '优先选择清晨或日落后的凉爽时段，出门前可用手背接触地面数秒，感觉烫手就不要久走。'] },
      { icon: '💧', title: '夏天喝水要注意什么？', summary: '少量多次补水，比一次猛喝更舒适。', detail: ['外出时随身带干净饮水和便携水碗。', '剧烈活动后先休息片刻，再少量多次喝水。', '不要让狗狗饮用积水或来源不明的水。'] },
      { icon: '🏠', title: '空调房里也要防着凉吗？', summary: '温差过大和冷风直吹，都可能让狗狗不舒服。', detail: ['让休息区域避开空调出风口。', '从室外回家后先擦干汗水和雨水，再进入低温环境。', '室内外温差不宜过大，老年犬和幼犬更要留意。'] }
    ],
    autumn: [
      { icon: '🍂', title: '换毛季应该多久梳一次毛？', summary: '规律梳毛能减少浮毛，也方便及时发现皮肤问题。', detail: ['根据毛发长度和掉毛量安排频率，换毛明显时可每天短时梳理。', '从毛尖开始轻柔梳开，不要反复拉扯打结区域。', '梳毛时同步观察皮屑、红肿、结痂和异常掉毛。'] },
      { icon: '🪮', title: '毛发打结该怎么处理？', summary: '耐心拆结能避免拉扯皮肤和毛发断裂。', detail: ['先用手指轻轻分开结团边缘。', '从毛尖向毛根慢慢梳理，不要硬拉。', '结团贴近皮肤或范围较大时，可请专业美容师处理。'] },
      { icon: '🍽️', title: '换季食欲变好要加餐吗？', summary: '食欲变化要结合体重和活动量一起判断。', detail: ['先保持原有主粮比例，连续观察一周。', '每周记录体重，避免因加餐造成体重快速上升。', '食欲突然大增或下降并伴随精神异常时，应咨询兽医。'] }
    ],
    winter: [
      { icon: '❄️', title: '冬天遛狗需要给脚垫保暖吗？', summary: '低温、融雪剂和干燥环境都可能刺激脚垫。', detail: ['缩短严寒时段的户外停留时间，回家后擦净并检查脚垫。', '接触融雪剂后及时用清水清洁，避免舔食残留。', '出现干裂、出血或持续舔脚时，应减少刺激并咨询兽医。'] },
      { icon: '🧥', title: '哪些狗狗更需要保暖？', summary: '幼犬、老年犬和短毛犬对低温更敏感。', detail: ['出门前观察体感，发抖或蜷缩说明可能觉得冷。', '选择合身、活动方便的衣物，保持干燥。', '雨雪天回家后及时擦干腹部、脚垫和毛发。'] },
      { icon: '🏡', title: '冬天在家也要活动吗？', summary: '室外时间变短时，室内互动可以补足运动和消耗。', detail: ['用嗅闻游戏或藏零食增加脑力活动。', '根据年龄和体力安排短时、多次互动。', '避免在光滑地板上追逐急停，减少打滑风险。'] }
    ]
  }
  const season = [6, 7, 8].includes(month) ? 'summer' : [3, 4, 5].includes(month) ? 'spring' : [9, 10, 11].includes(month) ? 'autumn' : 'winter'
  const yearStart = new Date(date.getFullYear(), 0, 1)
  const dayIndex = Math.floor((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - yearStart) / 86400000)
  const tips = seasonalKnowledge[season]
  return tips[dayIndex % tips.length]
}

function getPersonalizedKnowledge({ now, pet, weather, healthScore, todayStools, waterRatio }) {
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
  const apparent = Number(weather && (weather.apparent || weather.temperature))
  const hasRain = Boolean(weather && weather.rainTime)
  const abnormalStools = (todayStools || []).filter(item => item.abnormal).length
  const needsWater = Number.isFinite(waterRatio) && waterRatio < 0.7 && now.getHours() >= 14
  const healthText = abnormalStools
    ? `今天已记录 ${abnormalStools} 次异常排便，需要重点观察肠胃`
    : needsWater
      ? '今天饮水尚未达到建议量，补水需要优先安排'
      : healthScore < 90
        ? `今日健康评分 ${healthScore} 分，建议补齐待办并继续观察`
        : '今日记录暂未发现明显健康异常'

  let weatherTitle = '天气平稳，按日常节奏活动'
  let weatherSummary = '适合把散步、饮水和休息安排得更均衡。'
  let weatherAction = '按平时节奏出门，随身带水，并在活动后检查脚垫和毛发。'
  if (hasRain) {
    weatherTitle = '有降雨提醒，散步要避开潮湿时段'
    weatherSummary = '雨天湿毛和湿脚垫更容易带来皮肤不适。'
    weatherAction = `建议避开 ${weather.rainTime} 前后的降雨；回家后擦干脚垫、腹部和趾间。`
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
    : needsWater
      ? '把水碗放在常活动的位置，分时补充干净饮水；若持续明显少喝水，建议结合精神和排尿情况观察。'
      : '继续记录饮水、排便和活动；连续数据比单次状态更能反映健康变化。'

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
    icon: abnormalStools ? '🩺' : needsWater ? '💧' : '💚',
    title: abnormalStools ? '今天肠胃有波动，先这样观察' : needsWater ? '今天的补水需要优先完成' : '今天健康记录怎样看？',
    summary: `${healthText}；结合${ageLabel}和当前天气，安排要适度。`,
    detail: [healthAction, `天气安排：${weatherAction}`, `年龄建议：${ageAction}`]
  }
  return [weatherKnowledge, ageKnowledge, healthKnowledge][dayIndex % 3]
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
    let summary
    let tone
    let priority
    if (days < 0) {
      text = `${config.label}已逾期 ${Math.abs(days)} 天，请尽快安排${config.action}并补充记录。`
      summary = `已逾期 ${Math.abs(days)} 天，尽快安排`
      tone = 'orange'
      priority = 0
    } else if (days === 0) {
      text = `今天该${config.action}了，完成后记得在“我的”中记录日期。`
      summary = `今天需要${config.action}`
      tone = 'orange'
      priority = 1
    } else {
      text = `明天要${config.action}，建议今天提前做好准备。`
      summary = `明天要${config.action}，今天提前准备`
      tone = 'purple'
      priority = 2
    }
    items.push({ id: `care-${config.key}`, icon: config.icon, title: config.label, summary, text, tone, priority, target: 'account', careKey: config.key })
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
      title: nearest.label,
      summary: `${nearest.days} 天后需要${nearest.action}`,
      text: `距离${nearest.label}还有 ${nearest.days} 天，可提前确认用品和时间。`,
      tone: 'cream',
      priority: 8,
      target: 'account',
      careKey: nearest.key
    })
  }
  return urgentItems
}

function clockToMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function minutesToClock(value) {
  const minutes = Math.max(0, Math.min(1439, Math.round(value)))
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function buildAIPredictions({ now, pet, todayWater, todayWaters, stools, weather, rainWalkTime, dogFood, healthScore, statusCards }) {
  const waterTarget = Math.round((Number(pet.weight) || 0) * 55)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const waterRecords = (todayWaters || [])
    .map(item => ({ amount: numberFromText(item.amount), minutes: clockToMinutes(item.time) }))
    .filter(item => item.amount > 0)
  const waterTimes = waterRecords.map(item => item.minutes).filter(item => item !== null).sort((a, b) => a - b)
  const averageWater = waterRecords.length ? waterRecords.reduce((sum, item) => sum + item.amount, 0) / waterRecords.length : 0
  const averageInterval = waterTimes.length > 1
    ? Math.max(90, (waterTimes[waterTimes.length - 1] - waterTimes[0]) / (waterTimes.length - 1))
    : 210
  const projectionStart = Math.max(nowMinutes, waterTimes.length ? waterTimes[waterTimes.length - 1] : nowMinutes)
  const remainingDrinks = averageWater ? Math.max(0, Math.floor((22 * 60 - projectionStart) / averageInterval)) : 0
  const projectedWater = Math.round(todayWater + remainingDrinks * averageWater)
  let waterTitle
  let waterBadge
  let waterText
  let waterTone = 'blue'
  if (!waterTarget) {
    waterTitle = '还不能预测饮水结果'
    waterBadge = '缺少体重'
    waterText = '补充体重后，模型会自动计算每日目标和预计达标时间。'
  } else if (!waterRecords.length) {
    waterTitle = '饮水模型正在学习'
    waterBadge = '待记录'
    waterText = `记录今天第一笔饮水后，将预测 ${waterTarget}ml 的达标时间。`
  } else if (todayWater >= waterTarget) {
    waterTitle = '今天饮水预计稳定达标'
    waterBadge = '趋势较高'
    waterText = `依据今天 ${waterRecords.length} 次记录，预计全天约 ${Math.max(todayWater, projectedWater)}ml。`
    waterTone = 'green'
  } else {
    const hourlyRate = averageWater / averageInterval
    const targetTime = hourlyRate > 0 ? projectionStart + (waterTarget - todayWater) / hourlyRate : Infinity
    if (targetTime <= 22 * 60) {
      waterTitle = `${minutesToClock(targetTime)} 左右可达到饮水目标`
      waterBadge = '趋势较高'
      waterText = `依据今天 ${waterRecords.length} 次饮水记录和当前饮水频率推算。`
      waterTone = 'green'
    } else {
      waterTitle = `今天可能少喝 ${Math.max(0, waterTarget - projectedWater)}ml`
      waterBadge = '趋势偏低'
      waterText = `依据今天 ${waterRecords.length} 次记录，预计全天约 ${projectedWater}ml，目标为 ${waterTarget}ml。`
    }
  }

  const recentStools = (stools || []).slice(0, 7)
  const abnormalCount = recentStools.filter(item => item.abnormal).length
  let stoolTitle
  let stoolBadge
  let stoolText
  let stoolTone = 'green'
  if (recentStools.length < 3) {
    stoolTitle = '肠胃模型还在学习'
    stoolBadge = `${recentStools.length}/3 条`
    stoolText = `再记录 ${3 - recentStools.length} 次排便，模型即可开始判断短期趋势。`
    stoolTone = 'cream'
  } else if (abnormalCount) {
    stoolTitle = '近期肠胃状态有波动'
    stoolBadge = '需观察'
    stoolText = `依据最近 ${recentStools.length} 次记录，其中 ${abnormalCount} 次出现异常。`
    stoolTone = 'orange'
  } else {
    stoolTitle = '下一次排便仍偏向正常'
    stoolBadge = '趋势稳定'
    stoolText = `最近 ${recentStools.length} 次记录均正常，短期内暂未发现明显波动。`
  }

  let walkTitle
  let walkBadge
  let walkText
  if (weather && weather.rainTime) {
    const start = clockToMinutes(rainWalkTime) || 19 * 60
    walkTitle = `${rainWalkTime}–${minutesToClock(start + 90)} 更适合散步`
    walkBadge = '天气预测'
    walkText = `依据逐小时降雨变化，避开 ${weather.rainTime} 前后的降雨时段。`
  } else if (weather && Number(weather.apparent) >= 30) {
    walkTitle = '19:00 后更适合散步'
    walkBadge = '热风险'
    walkText = `当前体感约 ${weather.apparent}℃，晚间短时出门的热风险相对更低。`
  } else {
    walkTitle = '未来 2–3 小时适合散步'
    walkBadge = '天气稳定'
    walkText = '逐小时天气暂未出现明显降雨信号，原定散步计划受影响较低。'
  }

  const attention = (statusCards || []).filter(item => item.tone === 'watch' || item.tone === 'attention')
  let stateTitle
  const stateBadge = '综合推演'
  let stateText
  let stateTone = 'purple'
  if (attention.length) {
    stateTitle = `今天整体平稳，留意${attention.map(item => item.label).join('、')}`
    stateText = `综合食欲、饮水、排便和活动四项数据，当前健康评分为 ${healthScore} 分。`
    stateTone = attention.some(item => item.tone === 'attention') ? 'orange' : 'purple'
  } else if (dogFood.configured && dogFood.daysLeft !== null) {
    stateTitle = '今天整体状态预计平稳'
    stateText = `四项日常数据未发现明显偏离；狗粮按近期消耗约可维持 ${dogFood.daysLeft} 天。`
  } else {
    stateTitle = '今天整体状态预计平稳'
    stateText = `综合食欲、饮水、排便和活动四项数据，当前健康评分为 ${healthScore} 分。`
  }

  return [
    { id: 'ai-water', icon: '💧', title: waterTitle, badge: waterBadge, text: waterText, tone: waterTone, target: 'water' },
    { id: 'ai-stool', icon: '🧬', title: stoolTitle, badge: stoolBadge, text: stoolText, tone: stoolTone, target: 'stool' },
    { id: 'ai-walk', icon: '⛅', title: walkTitle, badge: walkBadge, text: walkText, tone: 'purple', target: 'walk' },
    { id: 'ai-state', icon: '✨', title: stateTitle, badge: stateBadge, text: stateText, tone: stateTone, target: 'account' }
  ]
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
  const laterTasks = tasks
    .filter(item => !item.done && item.key !== next.key)
    .sort((a, b) => a.plannedMinutes - b.plannedMinutes)
    .slice(0, 2)
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
  const aiPredictions = buildAIPredictions({
    now,
    pet,
    todayWater,
    todayWaters,
    stools,
    weather,
    rainWalkTime,
    dogFood,
    healthScore,
    statusCards: [
      { label: '食欲', ...appetiteStatus },
      { label: '水分', ...waterStatus },
      { label: '肠胃', ...stomachStatus },
      { label: '活力', ...activityStatus }
    ]
  })
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
    laterTasks,
    statusCards: [
      { icon: '🍚', label: '食欲', action: 'feed', ...appetiteStatus },
      { icon: '💧', label: '水分', action: 'water', ...waterStatus },
      { icon: '🌿', label: '肠胃', action: 'stool', ...stomachStatus },
      { icon: '🐾', label: '活力', action: 'walk', ...activityStatus }
    ],
    findings: aiPredictions,
    knowledge: getPersonalizedKnowledge({
      now,
      pet,
      weather,
      healthScore,
      todayStools,
      waterRatio
    })
  }
}

Page({
  data: {
    pet: {}, festivalOpen: false, healthTipOpen: false, knowledgeOpen: false, weightTrendOpen: false, feedDetailOpen: false, stoolDetailOpen: false, weightTrend: { bars: [], history: [] }, selectedHealthTip: { careItems: [] }, careSchedule: {}, ageText: '', daysTogether: 0,
    todayFeeds: [], todayFeedCount: 0, todayFeedTotal: 0, todayStools: [], todayStoolCount: 0, todayStoolAbnormalCount: 0, todayStoolStatus: '等待记录', waterTarget: 0, birthdayDays: 0, nextAge: 0, birthdayLabel: '',
    weatherLoading: true, weather: { icon: '🌤️', temperature: '--', apparent: '--', condition: '加载天气', location: '正在定位', rainText: '正在获取逐小时降雨预报', rainTime: '', live: false },
    seasonName: '', seasonTip: '', lifeStage: '', healthTips: [],
    homeDashboard: { greeting: '', healthScore: 100, healthSummary: '', tasks: [], statusCards: [], completedCount: 0, totalTasks: 6, progress: 0, nextTask: {}, laterTasks: [], findings: [], knowledge: { detail: [] } }
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
  previewWeightPhoto(e) {
    const item = this.data.weightTrend.history[e.currentTarget.dataset.index]
    if (!item || !item.photoPath) return wx.showToast({ title: '这次称重没有添加照片', icon: 'none' })
    const urls = this.data.weightTrend.history.filter(record => record.photoPath).map(record => record.photoPath)
    wx.previewImage({ current: item.photoPath, urls })
  },
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
