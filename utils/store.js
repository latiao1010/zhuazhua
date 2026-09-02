const KEYS = {
  pet: 'paw_pet',
  feeds: 'paw_feeds',
  diaries: 'paw_diaries',
  chats: 'paw_chats',
  stools: 'paw_stools',
  care: 'paw_care_schedule',
  careRecords: 'paw_care_records',
  supplies: 'paw_supply_records',
  waters: 'paw_water_records',
  walks: 'paw_walk_records',
  weightRecords: 'paw_weight_records',
  growthPhotos: 'paw_growth_photos',
  familyMembers: 'paw_family_members',
  generatedAvatar: 'paw_generated_avatar',
  avatarGenerationStatus: 'paw_avatar_generation_status',
  feedGoal: 'paw_feed_goal',
  waterGoal: 'paw_water_goal',
  externalBreedKnowledge: 'paw_external_breed_knowledge',
  externalBreedKnowledgeCheckedAt: 'paw_external_breed_checked_at',
  feedTrendDemo: 'paw_feed_trend_demo_v1',
  dailyTrendDemo: 'paw_daily_trend_demo_v1',
  growthPhotoDemo: 'paw_growth_photo_demo_v1',
  twoMonthDemo: 'paw_two_month_demo_v1',
  sixMonthDemo: 'paw_six_month_demo_v1'
}

// 演示数据的历史跨度。原来是 182 天（6 个月），散落写死在四处生成器里；
// 提到 242 天（8 个月）后统一由这里控制，避免各模块跨度再次走偏。
const DEMO_HISTORY_DAYS = 242

const DEFAULT_FEED_GOAL = 260
const DEFAULT_WATER_GOAL = 600
const READ_ONLY_PROTECTED_KEYS = new Set([
  'pet', 'feeds', 'diaries', 'chats', 'stools', 'care', 'careRecords', 'supplies',
  'waters', 'walks', 'weightRecords', 'growthPhotos', 'familyMembers',
  'generatedAvatar', 'avatarGenerationStatus', 'feedGoal', 'waterGoal'
])

const ROLE_LABELS = {
  owner: '主人',
  admin: '共同照护',
  viewer: '只读查看'
}

const seedPet = {
  name: '糯米',
  breed: '柯基',
  sex: '男孩',
  birthday: '2023-03-16',
  weight: '11.2',
  togetherSince: '2023-03-16',
  avatar: '/assets/momo-chibi.png',
  tags: ['黏人精', '小吃货', '爱散步']
}

const seedGrowthPhotos = [
  { id: 'demo-growth-20260722-1', path: '/assets/growth-demo-home.jpg', dayKey: '2026-07-22', time: '09:12', createdAt: new Date('2026-07-22T09:12:00').getTime() },
  { id: 'demo-growth-20260727-1', path: '/assets/growth-demo-lawn.jpg', dayKey: '2026-07-27', time: '10:05', createdAt: new Date('2026-07-27T10:05:00').getTime() },
  { id: 'demo-growth-20260727-2', path: '/assets/growth-demo-rain.jpg', dayKey: '2026-07-27', time: '18:36', createdAt: new Date('2026-07-27T18:36:00').getTime() },
  { id: 'demo-growth-20260731-1', path: '/assets/growth-demo-home.jpg', dayKey: '2026-07-31', time: '20:18', createdAt: new Date('2026-07-31T20:18:00').getTime() },
  { id: 'demo-growth-20260802-1', path: '/assets/growth-demo-lawn.jpg', dayKey: '2026-08-02', time: '08:46', createdAt: new Date('2026-08-02T08:46:00').getTime() }
]

const seedFamilyMembers = [
  {
    id: 'owner',
    name: '我',
    relation: '主人',
    role: 'owner',
    roleLabel: ROLE_LABELS.owner,
    status: '已加入',
    joinedAt: '2026-01-01',
    lastActive: todayKey()
  }
]

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function offsetDateKey(days) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false
  const [year, month, day] = String(value).split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function normalizePet(value) {
  const pet = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const weight = Number(pet.weight)
  const birthday = isValidDateKey(pet.birthday) ? pet.birthday : seedPet.birthday
  return {
    ...seedPet,
    ...pet,
    name: typeof pet.name === 'string' && pet.name.trim() ? pet.name.trim() : seedPet.name,
    breed: typeof pet.breed === 'string' && pet.breed.trim() ? pet.breed.trim() : seedPet.breed,
    sex: typeof pet.sex === 'string' && pet.sex ? pet.sex : seedPet.sex,
    birthday,
    togetherSince: isValidDateKey(pet.togetherSince) ? pet.togetherSince : birthday,
    weight: Number.isFinite(weight) && weight > 0 ? pet.weight : seedPet.weight,
    avatar: typeof pet.avatar === 'string' && pet.avatar ? pet.avatar : seedPet.avatar,
    tags: Array.isArray(pet.tags) ? pet.tags : seedPet.tags
  }
}

function normalizeFamilyMembers(value) {
  const records = Array.isArray(value) ? value : []
  const normalized = records
    .filter(item => item && typeof item === 'object')
    .map((item, index) => {
      const role = ROLE_LABELS[item.role] ? item.role : index === 0 ? 'owner' : 'admin'
      const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 16) : index === 0 ? '我' : '家庭成员'
      const relation = typeof item.relation === 'string' && item.relation.trim() ? item.relation.trim().slice(0, 12) : role === 'owner' ? '主人' : '家人'
      return {
        id: item.id || `member-${Date.now()}-${index}`,
        name,
        relation,
        role,
        roleLabel: ROLE_LABELS[role],
        status: typeof item.status === 'string' && item.status ? item.status : '已加入',
        joinedAt: isValidDateKey(item.joinedAt) ? item.joinedAt : todayKey(),
        lastActive: isValidDateKey(item.lastActive) ? item.lastActive : ''
      }
    })
  const members = normalized.length ? normalized : seedFamilyMembers
  if (!members.some(item => item.role === 'owner')) return [...seedFamilyMembers, ...members]
  return members.map((item, index) => index === 0 && item.role !== 'owner' ? { ...item, role: 'owner', roleLabel: ROLE_LABELS.owner, relation: item.relation || '主人' } : item)
}

function getDefaultCareSchedule() {
  return {
    deworming: offsetDateKey(7), dewormingCycle: 3, dewormingLast: '',
    vaccine: offsetDateKey(30), vaccineCycle: 12, vaccineLast: '',
    bath: offsetDateKey(7), bathCycle: 14, bathLast: '',
    dental: todayKey(), dentalCycle: 1, dentalLast: '',
    nail: todayKey(), nailCycle: 30, nailLast: '',
    medicine: offsetDateKey(30), medicineCycle: 30, medicineLast: ''
  }
}

function normalizeCareSchedule(schedule) {
  const defaults = getDefaultCareSchedule()
  const value = schedule && typeof schedule === 'object' && !Array.isArray(schedule) ? schedule : {}
  const result = { ...defaults }
  ;['deworming', 'vaccine', 'bath', 'dental', 'nail', 'medicine'].forEach(key => {
    result[key] = isValidDateKey(value[key]) ? value[key] : defaults[key]
    const lastKey = `${key}Last`
    result[lastKey] = value[lastKey] === '' || value[lastKey] === undefined
      ? ''
      : isValidDateKey(value[lastKey]) ? value[lastKey] : defaults[lastKey]
    const cycleKey = `${key}Cycle`
    const cycle = Number(value[cycleKey])
    result[cycleKey] = Number.isFinite(cycle) && cycle > 0 ? cycle : defaults[cycleKey]
  })
  return result
}

function getDefaultSupplies() {
  return {
    dogFood: { productName: '', openedDate: '', packageAmount: '', history: [] },
    snack: { productName: '', openedDate: '', packageAmount: '', history: [] }
  }
}

function normalizeSupplies(supplies) {
  const defaults = getDefaultSupplies()
  const value = supplies && typeof supplies === 'object' && !Array.isArray(supplies) ? supplies : {}
  const normalizeItem = (item, fallback) => {
    const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {}
    const amount = Number(source.packageAmount)
    const history = Array.isArray(source.history)
      ? source.history.filter(record => record && typeof record === 'object').map(record => {
        const recordAmount = Number(record.packageAmount)
        return {
          ...record,
          productName: typeof record.productName === 'string' ? record.productName : String(record.productName || ''),
          openedDate: isValidDateKey(record.openedDate) ? record.openedDate : '',
          packageAmount: Number.isFinite(recordAmount) && recordAmount > 0 ? recordAmount : ''
        }
      })
      : []
    return {
      ...fallback,
      ...source,
      productName: typeof source.productName === 'string' ? source.productName : String(source.productName || ''),
      openedDate: isValidDateKey(source.openedDate) ? source.openedDate : '',
      packageAmount: Number.isFinite(amount) && amount > 0 ? amount : '',
      history
    }
  }
  return {
    dogFood: normalizeItem(value.dogFood, defaults.dogFood),
    snack: normalizeItem(value.snack, defaults.snack)
  }
}

const seedTodayFeeds = [
  { id: 3, dayKey: todayKey(), date: '今天', time: '18:30', type: '晚餐', food: '低敏犬粮', amount: '95g', icon: '🥣' },
  { id: 2, dayKey: todayKey(), date: '今天', time: '12:15', type: '零食', food: '鸡胸肉干', amount: '18g', icon: '🦴' },
  { id: 1, dayKey: todayKey(), date: '今天', time: '07:40', type: '早餐', food: '低敏犬粮', amount: '90g', icon: '🥣' }
]

function buildSeedFeedHistory() {
  const records = []
  for (let daysBack = 1; daysBack <= DEMO_HISTORY_DAYS; daysBack += 1) {
    const dayKey = offsetDateKey(-daysBack)
    const [, month, day] = dayKey.split('-').map(Number)
    const daily = [
      { time: '07:35', type: '早餐', food: '低敏犬粮', amount: `${82 + daysBack % 5 * 3}g`, icon: '🥣' },
      { time: '18:25', type: '晚餐', food: '低敏犬粮', amount: `${92 + daysBack % 4 * 4}g`, icon: '🥣' }
    ]
    if (daysBack % 2 === 0) daily.push({ time: '10:20', type: '零食', food: '鸡胸肉干', amount: `${12 + daysBack % 3 * 2}g`, icon: '🦴' })
    if (daysBack % 3 === 0) daily.push({ time: '12:10', type: '午餐', food: '南瓜鸡肉餐', amount: `${48 + daysBack % 4 * 3}g`, icon: '🥣' })
    if (daysBack % 7 === 0) {
      daily.push(
        { time: '09:30', type: '零食', food: '训练奖励', amount: '6g', icon: '🦴' },
        { time: '15:10', type: '零食', food: '磨牙零食', amount: '9g', icon: '🦴' },
        { time: '20:20', type: '零食', food: '睡前奖励', amount: '5g', icon: '🦴' }
      )
    }
    daily.forEach((item, index) => records.push({
      ...item,
      id: `demo-feed-${dayKey}-${index}`,
      dayKey,
      date: `${month}月${day}日`
    }))
  }
  return records
}

const seedFeedHistory = buildSeedFeedHistory()
const seedFeeds = [...seedTodayFeeds, ...seedFeedHistory]

// 与 seedFeeds 统一含义：seedXxxFull 一律是「当天 + 完整历史」。
// 之前只有 feeds 在定义时拼好历史，另外三个要等 develop 环境的补种分支才补，
// 结果体验版和正式版上喂食有 243 天，饮水/排便/散步只有 1 天。

function buildSeedDiaries() {
  const templates = [
    { mood: '开心', weather: '☀️ 28℃', title: '今天也是元气满满的一天', content: '早上听见饭碗的声音就跑到厨房，傍晚散步也很配合，回家以后主动喝了水。', highlight: '今日高光：准时吃完三餐，还多走了 1,200 步。' },
    { mood: '平静', weather: '🌤️ 26℃', title: '慢慢悠悠的小日子', content: '今天精神状态稳定，白天大多在垫子上休息，晚间散步闻了很久草坪，没有明显不舒服。', highlight: '今日高光：排便状态正常，喝水比前几天更主动。' },
    { mood: '开心', weather: '🌦️ 24℃', title: '雨停后的散步很好闻', content: '午后雨停了，路面还湿湿的，所以只走了短路线。回家后胃口不错，零食奖励也控制住了。', highlight: '今日高光：没有乱冲，牵引训练进步明显。' },
    { mood: '委屈', weather: '🔥 31℃', title: '热天需要温柔一点', content: '今天气温偏高，散步改到清晨和傍晚，中午主要在家休息。食欲略慢，但最后还是把主粮吃完了。', highlight: '今日高光：高温天没有硬走，精神恢复得不错。' }
  ]
  return [176, 162, 148, 134, 120, 106, 92, 78, 64, 50, 36, 22, 12, 5].map((daysBack, index) => {
    const dayKey = offsetDateKey(-daysBack)
    const [, month, day] = dayKey.split('-').map(Number)
    const template = templates[index % templates.length]
    return {
      id: `demo-diary-${dayKey}`,
      dayKey,
      date: `${month}月${day}日 · 记录`,
      ...template
    }
  })
}

const seedDiaries = buildSeedDiaries()

const seedStools = [
  { id: 2, dayKey: todayKey(), date: '今天', time: '16:40', condition: '正常成形', color: '棕色', note: '状态很好', icon: '💩', abnormal: false },
  { id: 1, dayKey: todayKey(), date: '今天', time: '08:05', condition: '正常成形', color: '棕色', note: '', icon: '💩', abnormal: false }
]

const seedWaters = [
  { id: 2, dayKey: todayKey(), date: '今天', time: '15:20', amount: '160ml', note: '', icon: '💧' },
  { id: 1, dayKey: todayKey(), date: '今天', time: '09:10', amount: '180ml', note: '散步回来喝的', icon: '💧' }
]

const seedWalks = [
  { id: 1, dayKey: todayKey(), date: '今天', time: '08:20', duration: 35, distance: '1.6', note: '小区一圈', icon: '🐾' }
]

function buildSeedDailyTrendHistory() {
  const histories = { stools: [], waters: [], walks: [] }
  for (let daysBack = 1; daysBack <= DEMO_HISTORY_DAYS; daysBack += 1) {
    const dayKey = offsetDateKey(-daysBack)
    const [, month, day] = dayKey.split('-').map(Number)
    const date = `${month}月${day}日`

    const stoolTimes = ['08:05', '17:10']
    if (daysBack % 5 === 0) stoolTimes.splice(1, 0, '12:35')
    if (daysBack % 11 === 0) stoolTimes.push('21:15')
    stoolTimes.forEach((time, index) => {
      const abnormal = (daysBack % 8 === 0 && index === 0) || (daysBack % 13 === 0 && index === stoolTimes.length - 1)
      histories.stools.push({
        id: `demo-stool-${dayKey}-${index}`,
        dayKey,
        date,
        time,
        condition: abnormal ? (daysBack % 2 ? '偏软' : '稀便') : '正常成形',
        color: abnormal && daysBack % 13 === 0 ? '黄色' : '棕色',
        note: abnormal ? '已标记观察' : '',
        icon: '💩',
        abnormal
      })
    })

    const waterTimes = ['07:50', '11:25', '15:20', '19:40']
    if (daysBack % 6 === 0) waterTimes.push('21:10', '22:00')
    waterTimes.forEach((time, index) => {
      histories.waters.push({
        id: `demo-water-${dayKey}-${index}`,
        dayKey,
        date,
        time,
        amount: `${95 + (daysBack + index * 3) % 6 * 12}ml`,
        note: index === 0 && daysBack % 4 === 0 ? '早餐后主动饮水' : '',
        icon: '💧'
      })
    })

    const walkEntries = [
      { time: '08:15', duration: 18 + daysBack % 5 * 2, distance: (0.8 + daysBack % 4 * 0.1).toFixed(1), note: '晨间散步' }
    ]
    if (daysBack % 4 !== 0) {
      walkEntries.push({ time: '18:45', duration: 25 + daysBack % 6 * 3, distance: (1.1 + daysBack % 5 * 0.2).toFixed(1), note: '晚间散步' })
    }
    if (daysBack % 9 === 0) {
      walkEntries.push({ time: '13:30', duration: 12, distance: '0.5', note: '午后短途活动' })
    }
    walkEntries.forEach((item, index) => histories.walks.push({
      ...item,
      id: `demo-walk-${dayKey}-${index}`,
      dayKey,
      date,
      icon: '🐾'
    }))
  }
  return histories
}

const seedDailyTrendHistory = buildSeedDailyTrendHistory()
const seedStoolsFull = [...seedStools, ...seedDailyTrendHistory.stools]
const seedWatersFull = [...seedWaters, ...seedDailyTrendHistory.waters]
const seedWalksFull = [...seedWalks, ...seedDailyTrendHistory.walks]

function buildSeedWeightHistory() {
  const records = []
  for (let daysBack = 0; daysBack <= DEMO_HISTORY_DAYS; daysBack += 7) {
    const dayKey = offsetDateKey(-daysBack)
    const createdAt = new Date(`${dayKey}T08:30:00`).getTime()
    records.push({
      id: `demo-weight-${dayKey}`,
      createdAt,
      dayKey,
      time: '08:30',
      weight: Number((10.8 + (DEMO_HISTORY_DAYS - daysBack) / DEMO_HISTORY_DAYS * 0.4 + (daysBack % 3) * 0.06).toFixed(1)),
      photoPath: ''
    })
  }
  return records
}

function buildSeedCareRecords() {
  const records = []
  const configs = [
    { key: 'deworming', label: '体内外驱虫', icon: '🪱', days: [240, 180, 90, 2] },
    { key: 'medicine', label: '宠物用药', icon: '💊', days: [238, 210, 182, 168, 140, 112, 84, 56, 28, 7] },
    { key: 'vaccine', label: '疫苗接种', icon: '💉', days: [230, 165] },
    { key: 'bath', label: '洗澡护理', icon: '🛁', days: [238, 224, 210, 196, 182, 168, 154, 140, 126, 112, 98, 84, 70, 56, 42, 28, 14, 2] },
    { key: 'dental', label: '刷牙护理', icon: '🦷', days: [231, 217, 203, 189, 175, 161, 147, 133, 119, 105, 91, 77, 63, 49, 35, 21, 14, 7, 1] },
    { key: 'nail', label: '修剪指甲', icon: '✂️', days: [230, 200, 170, 140, 110, 80, 50, 20] }
  ]
  configs.forEach(config => config.days.forEach(daysBack => {
    const date = offsetDateKey(-daysBack)
    records.push({ id: `demo-care-${config.key}-${date}`, key: config.key, label: config.label, icon: config.icon, date, nextDate: storeNextDemoDate(date, config.key) })
  }))
  return records
}

function storeNextDemoDate(date, key) {
  const cycles = { deworming: 90, medicine: 30, vaccine: 365, bath: 14, dental: 1, nail: 30 }
  const next = new Date(`${date}T00:00:00`)
  next.setDate(next.getDate() + cycles[key])
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

function buildSeedGrowthPhotoHistory() {
  const records = []
  const paths = ['/assets/growth-demo-home.jpg', '/assets/growth-demo-lawn.jpg', '/assets/growth-demo-rain.jpg']
  ;[240, 225, 210, 195, 180, 165, 150, 135, 120, 105, 90, 75, 60, 45, 30, 15, 7, 3].forEach((daysBack, index) => {
    const dayKey = offsetDateKey(-daysBack)
    const time = `${String(8 + index % 4 * 3).padStart(2, '0')}:20`
    records.push({ id: `demo-growth-history-${dayKey}-1`, path: paths[index % paths.length], dayKey, time, createdAt: new Date(`${dayKey}T${time}:00`).getTime() })
    if (daysBack === 120 || daysBack === 60 || daysBack === 15) {
      const secondTime = '18:40'
      records.push({ id: `demo-growth-history-${dayKey}-2`, path: paths[(index + 1) % paths.length], dayKey, time: secondTime, createdAt: new Date(`${dayKey}T${secondTime}:00`).getTime() })
    }
  })
  return records
}

function buildSeedChats() {
  const conversations = [
    { daysBack: 150, user: '糯米最近有点挑食怎么办？', ai: '糯米已经是成年犬，先保持主粮稳定，零食不要替代正餐。可以把当天喂食记录、排便和精神状态一起看：如果连续 24 小时明显拒食，或伴随呕吐、腹泻、精神差，需要及时咨询兽医。' },
    { daysBack: 118, user: '今天下雨，还要出去散步吗？', ai: '结合糯米的年龄和柯基体型，雨天可以改成短时多次，优先选地面不滑的路线。回家后擦干脚垫和腹部，今天如果运动不足，可以在家做 5 到 10 分钟嗅闻游戏。' },
    { daysBack: 86, user: '糯米每天喝多少水合适？', ai: '按 11.2kg 体重大致可参考每天 560 到 672ml。天气热、吃干粮、散步后会增加需求，建议少量多次补水，并观察尿量、精神和口腔湿润程度。' },
    { daysBack: 54, user: '便便有点偏软，是不是吃多了？', ai: '可以先看今天零食和新食物是否增加。若只是一次偏软、精神和食欲正常，可以记录并观察；如果连续偏软、带血、呕吐或明显没精神，就要尽快联系兽医。' },
    { daysBack: 23, user: '最近天气很热，散步多久合适？', ai: '高温天建议避开中午，安排清晨和傍晚，每次 15 到 25 分钟更稳妥。糯米是柯基，注意减少爬楼和高处跳跃，散步后优先补水和降温休息。' },
    { daysBack: 3, user: '糯米今天应该喝多少水？', ai: '结合糯米 11.2kg 体重，今天目标可以按 616ml 左右观察。如果当前已喝水偏少，就把水碗放在活动区附近，散步后分几次补，不要一次灌太多。' }
  ]
  return conversations.flatMap((item, index) => {
    const dayKey = offsetDateKey(-item.daysBack)
    const baseTime = new Date(`${dayKey}T${String(9 + index).padStart(2, '0')}:20:00`).getTime()
    return [
      { id: `demo-chat-user-${dayKey}`, role: 'user', text: item.user, time: `${String(9 + index).padStart(2, '0')}:20`, createdAt: baseTime },
      { id: `demo-chat-ai-${dayKey}`, role: 'ai', text: item.ai, time: `${String(9 + index).padStart(2, '0')}:21`, createdAt: baseTime + 60000, source: 'local-knowledge' }
    ]
  })
}

function buildSeedSupplies() {
  const dogFoodHistory = [14, 52, 110, 170].map((daysBack, index) => ({
    id: `demo-supply-dogFood-${offsetDateKey(-daysBack)}`,
    productName: index % 2 ? '低敏成犬粮 鸡肉配方' : '低敏成犬粮 三文鱼配方',
    packageAmount: index % 2 ? 2500 : 3000,
    openedDate: offsetDateKey(-daysBack)
  }))
  const snackHistory = [9, 43, 97, 156].map((daysBack, index) => ({
    id: `demo-supply-snack-${offsetDateKey(-daysBack)}`,
    productName: index % 2 ? '冻干鸡胸肉粒' : '南瓜磨牙棒',
    packageAmount: index % 2 ? 500 : 420,
    openedDate: offsetDateKey(-daysBack)
  }))
  return {
    dogFood: { ...dogFoodHistory[0], history: dogFoodHistory },
    snack: { ...snackHistory[0], history: snackHistory }
  }
}

function buildSeedCareSchedule() {
  const lastDates = { deworming: 2, medicine: 7, vaccine: 165, bath: 2, dental: 1, nail: 20 }
  const care = getDefaultCareSchedule()
  Object.keys(lastDates).forEach(key => {
    const last = offsetDateKey(-lastDates[key])
    care[`${key}Last`] = last
    care[key] = storeNextDemoDate(last, key)
  })
  return care
}

const seedWeightHistory = buildSeedWeightHistory()
const seedCareHistory = buildSeedCareRecords()
const seedGrowthPhotoHistory = buildSeedGrowthPhotoHistory()
const seedChats = buildSeedChats()
const seedSupplies = buildSeedSupplies()
const seedCareSchedule = buildSeedCareSchedule()
// 跨度变了就要升版本，否则已经播过种的设备不会重新生成
const SIX_MONTH_DEMO_VERSION = 'eight-month-v1'

function isDemoRecord(item, key) {
  if (!item || typeof item !== 'object') return true
  const id = item.id
  if (typeof id === 'string' && id.startsWith('demo-')) return true
  if (key === 'feeds') return [1, 2, 3].includes(id) && item.date === '今天'
  if (key === 'stools' || key === 'waters') return [1, 2].includes(id) && item.date === '今天'
  if (key === 'walks') return id === 1 && item.date === '今天'
  if (key === 'diaries') return id === 1 && typeof item.title === 'string' && item.title.includes('元气满满')
  if (key === 'weightRecords') return id === 1 && item.dayKey === '2026-07-01'
  return false
}

function applySixMonthDemoData() {
  const replaceArray = (key, records) => {
    const existing = wx.getStorageSync(KEYS[key])
    const kept = Array.isArray(existing) ? existing.filter(item => !isDemoRecord(item, key)) : []
    const demoIds = new Set(records.map(item => item.id))
    wx.setStorageSync(KEYS[key], [...records, ...kept.filter(item => !demoIds.has(item.id))])
  }

  replaceArray('feeds', seedFeeds)
  replaceArray('stools', seedStoolsFull)
  replaceArray('waters', seedWatersFull)
  replaceArray('walks', seedWalksFull)
  replaceArray('weightRecords', seedWeightHistory)
  replaceArray('careRecords', seedCareHistory)
  replaceArray('growthPhotos', [...seedGrowthPhotoHistory, ...seedGrowthPhotos])
  replaceArray('diaries', seedDiaries)
  replaceArray('chats', seedChats)

  wx.setStorageSync(KEYS.supplies, seedSupplies)
  wx.setStorageSync(KEYS.care, seedCareSchedule)
  wx.setStorageSync(KEYS.feedGoal, DEFAULT_FEED_GOAL)
  wx.setStorageSync(KEYS.waterGoal, Math.round((Number(seedPet.weight) || 0) * 55) || DEFAULT_WATER_GOAL)
  wx.setStorageSync(KEYS.familyMembers, seedFamilyMembers)
  wx.setStorageSync(KEYS.feedTrendDemo, true)
  wx.setStorageSync(KEYS.dailyTrendDemo, true)
  wx.setStorageSync(KEYS.growthPhotoDemo, true)
  wx.setStorageSync(KEYS.twoMonthDemo, true)
  wx.setStorageSync(KEYS.sixMonthDemo, SIX_MONTH_DEMO_VERSION)
}

function hasCompleteSixMonthDemoData() {
  const feeds = wx.getStorageSync(KEYS.feeds)
  const stools = wx.getStorageSync(KEYS.stools)
  const waters = wx.getStorageSync(KEYS.waters)
  const walks = wx.getStorageSync(KEYS.walks)
  const weightRecords = wx.getStorageSync(KEYS.weightRecords)
  const careRecords = wx.getStorageSync(KEYS.careRecords)
  const growthPhotos = wx.getStorageSync(KEYS.growthPhotos)
  const diaries = wx.getStorageSync(KEYS.diaries)
  const chats = wx.getStorageSync(KEYS.chats)
  const supplies = normalizeSupplies(wx.getStorageSync(KEYS.supplies))
  return wx.getStorageSync(KEYS.sixMonthDemo) === SIX_MONTH_DEMO_VERSION &&
    Array.isArray(feeds) && feeds.length > 450 &&
    Array.isArray(stools) && stools.length > 380 &&
    Array.isArray(waters) && waters.length > 740 &&
    Array.isArray(walks) && walks.length > 310 &&
    Array.isArray(weightRecords) && weightRecords.length >= 27 &&
    Array.isArray(careRecords) && careRecords.length >= 40 &&
    Array.isArray(growthPhotos) && growthPhotos.length >= 17 &&
    Array.isArray(diaries) && diaries.length >= 14 &&
    Array.isArray(chats) && chats.length >= 12 &&
    Array.isArray(supplies.dogFood.history) && supplies.dogFood.history.length >= 4 &&
    Array.isArray(supplies.snack.history) && supplies.snack.history.length >= 4
}

function ensureSeedData() {
  const pet = normalizePet(wx.getStorageSync(KEYS.pet))
  wx.setStorageSync(KEYS.pet, pet)

  const arrayDefaults = {
    feeds: seedFeeds,
    diaries: seedDiaries,
    chats: seedChats,
    stools: seedStoolsFull,
    waters: seedWatersFull,
    walks: seedWalksFull,
    careRecords: seedCareHistory,
    growthPhotos: seedGrowthPhotoHistory
  }
  Object.keys(arrayDefaults).forEach(key => {
    const records = wx.getStorageSync(KEYS[key])
    if (!Array.isArray(records)) wx.setStorageSync(KEYS[key], arrayDefaults[key])
    else if (records.some(item => !item || typeof item !== 'object')) {
      wx.setStorageSync(KEYS[key], records.filter(item => item && typeof item === 'object'))
    }
  })

  const weightRecords = wx.getStorageSync(KEYS.weightRecords)
  if (!Array.isArray(weightRecords)) {
    const createdAt = Date.now()
    wx.setStorageSync(KEYS.weightRecords, [{ id: createdAt, createdAt, dayKey: todayKey(), time: '', weight: Number(pet.weight) || 0, photoPath: '' }])
  } else if (weightRecords.some(item => !item || typeof item !== 'object')) {
    wx.setStorageSync(KEYS.weightRecords, weightRecords.filter(item => item && typeof item === 'object'))
  }

  const supplies = wx.getStorageSync(KEYS.supplies)
  const normalizedSupplies = normalizeSupplies(supplies)
  wx.setStorageSync(KEYS.supplies, normalizedSupplies)

  const familyMembers = normalizeFamilyMembers(wx.getStorageSync(KEYS.familyMembers))
  wx.setStorageSync(KEYS.familyMembers, familyMembers)

  const care = wx.getStorageSync(KEYS.care)
  const normalizedCare = normalizeCareSchedule(care)
  wx.setStorageSync(KEYS.care, normalizedCare)

  const storedFeedGoal = Number(wx.getStorageSync(KEYS.feedGoal))
  const feedGoal = Number.isFinite(storedFeedGoal) && storedFeedGoal > 0 && storedFeedGoal <= 5000
    ? Math.round(storedFeedGoal)
    : DEFAULT_FEED_GOAL
  wx.setStorageSync(KEYS.feedGoal, feedGoal)

  const storedWaterGoal = Number(wx.getStorageSync(KEYS.waterGoal))
  const suggestedWaterGoal = Math.round((Number(pet.weight) || 0) * 55) || DEFAULT_WATER_GOAL
  const waterGoal = Number.isFinite(storedWaterGoal) && storedWaterGoal > 0 && storedWaterGoal <= 10000
    ? Math.round(storedWaterGoal)
    : suggestedWaterGoal
  wx.setStorageSync(KEYS.waterGoal, waterGoal)

  ;['feeds', 'stools', 'waters', 'walks'].forEach(key => {
    const records = wx.getStorageSync(KEYS[key])
    if (records.some(item => !item.dayKey)) {
      wx.setStorageSync(KEYS[key], records.map(item => ({ ...item, dayKey: item.dayKey || todayKey() })))
    }
  })

  if (wx.getAccountInfoSync) {
    try {
      const account = wx.getAccountInfoSync()
      if (account && account.miniProgram && account.miniProgram.envVersion === 'develop') {
        if (!hasCompleteSixMonthDemoData()) {
          applySixMonthDemoData()
        }
        if (!wx.getStorageSync(KEYS.feedTrendDemo)) {
          const feeds = wx.getStorageSync(KEYS.feeds)
          const ids = new Set(feeds.map(item => item.id))
          const missingHistory = seedFeedHistory.filter(item => !ids.has(item.id))
          if (missingHistory.length) wx.setStorageSync(KEYS.feeds, [...feeds, ...missingHistory])
          wx.setStorageSync(KEYS.feedTrendDemo, true)
        }
        if (!wx.getStorageSync(KEYS.dailyTrendDemo)) {
          ;['stools', 'waters', 'walks'].forEach(key => {
            const records = wx.getStorageSync(KEYS[key])
            const ids = new Set(records.map(item => item.id))
            const missingHistory = seedDailyTrendHistory[key].filter(item => !ids.has(item.id))
            if (missingHistory.length) wx.setStorageSync(KEYS[key], [...records, ...missingHistory])
          })
          wx.setStorageSync(KEYS.dailyTrendDemo, true)
        }
        if (!wx.getStorageSync(KEYS.growthPhotoDemo)) {
          const growthPhotos = wx.getStorageSync(KEYS.growthPhotos)
          if (Array.isArray(growthPhotos) && !growthPhotos.length) wx.setStorageSync(KEYS.growthPhotos, seedGrowthPhotos)
          wx.setStorageSync(KEYS.growthPhotoDemo, true)
        }
        if (!wx.getStorageSync(KEYS.twoMonthDemo)) {
          const appendMissing = (key, records) => {
            const existing = wx.getStorageSync(KEYS[key])
            const ids = new Set((Array.isArray(existing) ? existing : []).map(item => item.id))
            const missing = records.filter(item => !ids.has(item.id))
            if (missing.length) wx.setStorageSync(KEYS[key], [...existing, ...missing])
          }
          appendMissing('feeds', seedFeedHistory)
          appendMissing('stools', seedDailyTrendHistory.stools)
          appendMissing('waters', seedDailyTrendHistory.waters)
          appendMissing('walks', seedDailyTrendHistory.walks)
          appendMissing('weightRecords', seedWeightHistory)
          appendMissing('careRecords', seedCareHistory)
          appendMissing('growthPhotos', seedGrowthPhotoHistory)

          const care = normalizeCareSchedule(wx.getStorageSync(KEYS.care))
          Object.keys({ deworming: 24, medicine: 12, vaccine: 49, bath: 2, dental: 1, nail: 22 }).forEach(key => {
            const lastKey = `${key}Last`
            if (care[lastKey]) return
            const last = offsetDateKey(-({ deworming: 24, medicine: 12, vaccine: 49, bath: 2, dental: 1, nail: 22 }[key]))
            care[lastKey] = last
            care[key] = storeNextDemoDate(last, key)
          })
          wx.setStorageSync(KEYS.care, care)

          const supplies = normalizeSupplies(wx.getStorageSync(KEYS.supplies))
          if (!supplies.dogFood.openedDate) supplies.dogFood = { ...supplies.dogFood, productName: '低敏成犬粮', packageAmount: 2500, openedDate: offsetDateKey(-14), history: [{ id: 'demo-food-open', productName: '低敏成犬粮', packageAmount: 2500, openedDate: offsetDateKey(-14) }] }
          if (!supplies.snack.openedDate) supplies.snack = { ...supplies.snack, productName: '冻干鸡胸肉粒', packageAmount: 500, openedDate: offsetDateKey(-9), history: [{ id: 'demo-snack-open', productName: '冻干鸡胸肉粒', packageAmount: 500, openedDate: offsetDateKey(-9) }] }
          wx.setStorageSync(KEYS.supplies, supplies)
          wx.setStorageSync(KEYS.twoMonthDemo, true)
        }
      }
    } catch (error) {}
  }
}

const ARRAY_KEYS = new Set(['feeds', 'diaries', 'chats', 'stools', 'careRecords', 'waters', 'walks', 'weightRecords', 'growthPhotos'])
const get = key => {
  const value = wx.getStorageSync(KEYS[key])
  if (key === 'pet') return normalizePet(value)
  if (key === 'care') return normalizeCareSchedule(value)
  if (key === 'supplies') return normalizeSupplies(value)
  if (key === 'familyMembers') return normalizeFamilyMembers(value)
  if (key === 'externalBreedKnowledge') return value && typeof value === 'object' && !Array.isArray(value) ? value : { items: [], updatedAt: 0, sources: [] }
  if (key === 'feedGoal') {
    const goal = Number(value)
    return Number.isFinite(goal) && goal > 0 && goal <= 5000 ? Math.round(goal) : DEFAULT_FEED_GOAL
  }
  if (key === 'waterGoal') {
    const goal = Number(value)
    if (Number.isFinite(goal) && goal > 0 && goal <= 10000) return Math.round(goal)
    const pet = normalizePet(wx.getStorageSync(KEYS.pet))
    return Math.round((Number(pet.weight) || 0) * 55) || DEFAULT_WATER_GOAL
  }
  if (key === 'generatedAvatar') {
    if (!value || typeof value !== 'object' || typeof value.path !== 'string' || !value.path) return null
    return {
      path: value.path,
      styleId: typeof value.styleId === 'string' ? value.styleId : '',
      style: typeof value.style === 'string' ? value.style : '',
      createdAt: Number(value.createdAt) || 0
    }
  }
  if (key === 'avatarGenerationStatus') {
    if (!value || typeof value !== 'object') return null
    const status = ['querying', 'success', 'fail'].includes(value.status) ? value.status : ''
    if (!status) return null
    return {
      status,
      submitId: typeof value.submitId === 'string' ? value.submitId : '',
      styleId: typeof value.styleId === 'string' ? value.styleId : '',
      style: typeof value.style === 'string' ? value.style : '',
      error: typeof value.error === 'string' ? value.error : '',
      createdAt: Number(value.createdAt) || 0
    }
  }
  if (ARRAY_KEYS.has(key)) return Array.isArray(value) ? value : []
  return value || []
}
const set = (key, value, options = {}) => {
  if (!options.skipCloud && READ_ONLY_PROTECTED_KEYS.has(key)) {
    try {
      const status = wx.getStorageSync('paw_share_status')
      if (status && status.shared && status.role === 'viewer') {
        if (wx.showToast) wx.showToast({ title: '只读成员不能修改共享档案', icon: 'none' })
        return Promise.resolve({ ok: false, error: 'readonly' })
      }
    } catch (error) {}
  }
  wx.setStorageSync(KEYS[key], value)
  if (!options.skipCloud) {
    try {
      return require('./cloud-data').saveKey(key, value)
    } catch (error) {}
  }
  return Promise.resolve({ ok: true, skipped: true })
}

module.exports = { KEYS, ensureSeedData, get, set, todayKey, getDefaultCareSchedule, normalizeCareSchedule, getDefaultSupplies, normalizeSupplies, normalizeFamilyMembers }
