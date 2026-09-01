// 审核版离线推荐目录：只做信息整理和筛选，不替代兽医或商品详情页。
const { PET_FOOD_SKUS } = require('./pet-food-skus')
const price = require('./pet-price')

// 命中区间的上限最多允许超预算这么多倍。1.5 是权衡：太严候选所剩无几，
// 太松就会出现“要300、给你296-608”的矛盾显示。
const PRICE_RANGE_TOLERANCE = 1.5

// 评分卡提取偶尔会整行错位：品牌掉空、产品名位置串进品牌、优点栏留着「找不到」
// 这种占位符。这类记录信息不足以支撑购买判断，不参与推荐（数据本身保留）。
function isWellFormed(item) {
  if (!item) return false
  if (item.type !== '主粮') return true
  const placeholder = /^(找不到|无|暂无|未知|-|—|\/)$/
  if (!String(item.brand || '').trim()) return false
  if (String(item.fullName || '').trim().length <= 3) return false
  if (placeholder.test(String(item.advantages || '').trim())) return false
  return true
}

const CATALOG = {
  // 主粮 SKU 由评分卡提取结果覆盖同步；字段包括名称、市场价格、主要原料、优点和缺点。
  mainFood: PET_FOOD_SKUS,
  snack: [
    { id: 'snack-freeze-dried', brand: 'K9 Natural', name: 'Freeze-Dried 冻干肉粒', type: '零食', tags: ['训练', '单一成分', '低添加'], note: '适合掰小做奖励，算入全天热量，肠胃敏感时从极少量开始。' },
    { id: 'snack-air-dried', brand: 'ZIWI Peak', name: 'Air-Dried 风干肉粒', type: '零食', tags: ['训练', '单一成分', '低添加'], note: '适合做高价值奖励，但风干类能量密度可能较高，要控制份量。' },
    { id: 'snack-low-fat', brand: '冠能 Purina Pro Plan', name: 'Training Treats 训练奖励系列', type: '零食', tags: ['训练', '低脂', '小颗粒'], note: '适合频繁训练，重点看配料表、热量和每天实际用量。' },
    { id: 'snack-veg', brand: 'ZIWI Peak', name: 'Air-Dried 蔬果搭配小份', type: '零食', tags: ['低负担', '少量', '蔬果'], note: '只能少量补充，不能替代主粮；首次尝试要观察便便。' },
    { id: 'snack-dental', brand: 'GREENIES', name: 'Original Dental Treats 洁齿零食', type: '零食', tags: ['口腔', '咀嚼', '洁齿'], note: '选择对应体重尺寸并监护食用，不能替代刷牙和口腔检查。' }
  ],
  toy: [
    { id: 'toy-sniff', brand: 'Nina Ottosson by Outward Hound', name: '嗅闻/益智找食玩具', type: '玩具', tags: ['嗅闻', '消耗精力', '室内'], note: '适合雨天、室内和需要低冲击消耗的宠物，第一次使用要看是否撕咬吞食。' },
    { id: 'toy-rubber', brand: 'KONG', name: 'Classic 天然橡胶互动玩具', type: '玩具', tags: ['互动', '耐咬', '召回'], note: '选大于喉咙、无易脱落小件的尺寸，出现裂口就及时更换。' },
    { id: 'toy-puzzle', brand: 'LickiMat', name: '慢食舔食益智垫', type: '玩具', tags: ['益智', '慢食', '独处'], note: '把一部分主粮或湿粮放进去即可，避免为了玩具额外增加热量。' },
    { id: 'toy-chew', brand: 'KONG', name: '安全磨牙咀嚼系列', type: '玩具', tags: ['磨牙', '咀嚼', '口腔'], note: '不能用易碎骨头、绳头或会掉小块的物品替代。' }
  ]
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '')
}

function isCat(ctx) {
  const text = normalize(`${ctx && ctx.species || ''} ${ctx && ctx.breed || ''}`)
  return /猫|英短|美短|布偶|暹罗|橘猫|狸花|缅因|无毛猫/.test(text)
}

function profileTags(ctx) {
  const tags = []
  const stage = String(ctx && ctx.stage || '')
  if (stage === 'puppy') tags.push('幼年')
  if (stage === 'senior') tags.push('老年')
  if (ctx && Number(ctx.weight) > 0 && Number(ctx.weight) >= 13) tags.push('体重管理')
  if (ctx && Number(ctx.today && ctx.today.stool && ctx.today.stool.abnormalCount) > 0) tags.push('肠胃敏感')
  return tags
}

function scoreItem(item, ctx, question) {
  const text = normalize(question)
  const tags = profileTags(ctx)
  const detail = normalize([item.fullName, item.brand, item.name, item.marketPrice, item.ingredients, item.advantages, item.disadvantages, item.note].join(' '))
  let score = 0
  tags.forEach(tag => { if (item.tags.includes(tag)) score += 4 })
  if (item.species && item.species !== (isCat(ctx) ? 'cat' : 'dog')) score -= 100
  else if (isCat(ctx) && /犬/.test(item.name)) score -= 100
  else if (!isCat(ctx) && /猫/.test(item.name)) score -= 100
  if (/低脂|减肥|控制体重|太胖/.test(text) && item.tags.includes('体重管理')) score += 7
  if (/肠胃|软便|敏感|过敏/.test(text) && (item.tags.includes('肠胃敏感') || /低敏|敏感|易消化/.test(detail))) score += 7
  if (/高蛋白|鲜肉/.test(text) && /高蛋白|高鲜|鲜肉/.test(detail)) score += 6
  if (/无谷/.test(text) && /无谷/.test(detail)) score += 6
  if (/训练|奖励/.test(text) && item.tags.includes('训练')) score += 5
  if (/雨天|室内|无聊|独处/.test(text) && item.tags.includes('室内')) score += 5
  if (/磨牙|口腔|牙/.test(text) && (item.tags.includes('口腔') || item.tags.includes('磨牙'))) score += 5
  return score
}

// 把价格意图折算成「元/斤」的上下限。用户说的月费要用宠物每日喂食量反推，
// 因为目录里只有单价，没有包装规格。
function priceBoundsPerJin(intent, dailyGrams) {
  if (!intent || !intent.frame) return null
  if (intent.frame === 'perJin') return { min: intent.min || 0, max: intent.max || Infinity }
  const grams = dailyGrams > 0 ? dailyGrams : 0
  if (!grams) return null
  return {
    min: intent.min ? price.monthlyToPerJin(intent.min, grams) : 0,
    max: intent.max ? price.monthlyToPerJin(intent.max, grams) : Infinity
  }
}

// anchor：上一轮推过的商品，用户说“太贵了”时以它为基准找更便宜的。
function recommend(category, ctx, question, limit = 3, options = {}) {
  const list = CATALOG[category] || [...CATALOG.mainFood, ...CATALOG.snack, ...CATALOG.toy]
  const { items } = price.attachPrices(list.filter(isWellFormed))
  const intent = options.intent !== undefined ? options.intent : price.parsePriceIntent(question)
  const dailyGrams = Number(ctx && ctx.today && ctx.today.feed && ctx.today.feed.targetGrams) || 0
  const bounds = priceBoundsPerJin(intent, dailyGrams)
  const anchor = options.anchor && options.anchor.price ? options.anchor.price.mid : 0

  let pool = items
  if (intent) {
    // 数据有问题的条目不参与价格筛选，避免用错误数字误导购买决策
    const priced = pool.filter(item => item.price && !item.price.suspect)
    let filtered = priced
    if (bounds) {
      // 按价格区间下限判断：最低价落进预算就算命中（宽松口径）。
      // 但只用下限会放进 19-39元/斤 这种上限翻倍的条目，说“300以内”却显示
      // “296-608元/月”，观感自相矛盾。所以再排除区间过宽的：上限超预算 1.5 倍
      // 就踢掉，保住命中率的同时不至于离谱。
      filtered = priced.filter(item => item.price.low >= bounds.min && item.price.low <= bounds.max)
      if (bounds.max !== Infinity) {
        const ceiling = bounds.max * PRICE_RANGE_TOLERANCE
        const within = filtered.filter(item => !Number.isFinite(item.price.high) ? false : item.price.high <= ceiling)
        if (within.length) filtered = within
      }
    }
    if (anchor && intent.cheaper) filtered = filtered.filter(item => item.price.mid <= anchor * 0.8)
    if (anchor && intent.pricier) filtered = filtered.filter(item => item.price.mid >= anchor * 1.2)
    // 没给具体数字、只说“便宜点”时，退到低价档
    if (!bounds && !anchor && intent.cheaper) filtered = priced.filter(item => item.tier === 'low')
    if (!bounds && !anchor && intent.pricier) filtered = priced.filter(item => item.tier === 'high')
    // 主食冻干单价是干粮的几倍，除非用户预算本来就够高，否则不混进来比价
    if (!intent.pricier) {
      const keepPremium = bounds && bounds.max !== Infinity && filtered.some(item => item.tier === 'premium' && item.price.mid <= bounds.max)
      if (!keepPremium) filtered = filtered.filter(item => item.tier !== 'premium')
    }
    if (filtered.length) pool = filtered
  }

  return pool
    .map(item => ({ ...item, score: scoreItem(item, ctx, question) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit)
}

function allItems() {
  // 同样要滤掉残缺记录：findItems 走的是「你提到的…」这条路径，
  // 不过滤的话脏数据仍会被当成商品信息展示出来。
  return [...CATALOG.mainFood, ...CATALOG.snack, ...CATALOG.toy].filter(isWellFormed)
}

function findItems(question) {
  const text = normalize(question)
  const hits = allItems().filter(item => [item.brand, item.name, item.fullName].some(value => text.includes(normalize(value))) || item.tags.some(tag => text.includes(normalize(tag))))
  return hits.slice(0, 4)
}

function ingredientAdvice(question) {
  const text = normalize(question)
  if (/蛋白|肉含量|第一位/.test(text)) return '先看配料表前 3 位：动物性原料应清楚标明来源；蛋白比例不能脱离年龄、活动量和疾病史单独比较。'
  if (/脂肪|热量|减肥/.test(text)) return '体重管理先看每 100g 热量和实际喂食量，再看脂肪；只写“低脂”不等于适合所有宠物。'
  if (/钙磷|矿物质|牛磺酸/.test(text)) return '钙磷、牛磺酸等要结合物种和年龄看，猫尤其不能缺少牛磺酸；不要自行长期叠加营养补充剂。'
  if (/添加剂|防腐|诱食剂/.test(text)) return '不要只按“无添加”四个字判断，重点看原料是否清楚、营养是否完整、宠物吃后便便和体重是否稳定。'
  return '看配料时先确认适用物种和年龄，再看完整均衡声明、热量、蛋白/脂肪和前几位原料，最后结合宠物实际状态。'
}

function catalog() {
  return JSON.parse(JSON.stringify(CATALOG))
}

module.exports = { catalog, recommend, findItems, ingredientAdvice, profileTags, priceBoundsPerJin, isWellFormed }
