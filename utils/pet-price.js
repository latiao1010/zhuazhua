// 主粮价格解析与筛选。
//
// 数据现状（来自评分卡同步）：单位基本是「元/斤」，但有三个坑：
//   1. 区间分隔符 `-` 和 `~` 混用，也有单值和 `180+` 这种开区间；
//   2. 有 8 条只写「元」漏了「/斤」—— 同品牌同系列存在带单位的对照条目
//      （欧恩焙 鸡肉 58-76元/斤 vs 欧恩焙 鸭肉 58-76元），所以按元/斤处理；
//   3. 个别数值明显是提取错误（三位小数、低到不合常理），标记出来不参与排序。
//
// 表里没有包装规格，所以无法换算整包价。对外一律用「元/斤」和「每月粮费」
// 两种口径，后者用宠物每日喂食目标折算，比整包价更能反映真实开销。

const GRAMS_PER_JIN = 500
const DAYS_PER_MONTH = 30
// 低于这个单价的干粮在本目录里不合常理（最低的正常值是 17 元/斤）
const IMPLAUSIBLE_PER_JIN = 16
// 高出中位数这个倍数的单独归一档：主食冻干普遍是干粮的 5-8 倍，
// 混在一起比价会让它们在任何预算下都垫底。按价格分层而不是按名称，
// 因为名称不可靠（「达 冻干无谷红肉全犬粮」只要 24~34 元/斤）。
const PREMIUM_MEDIAN_RATIO = 3

function parsePrice(raw) {
  const text = String(raw || '').trim()
  if (!text) return null
  const nums = (text.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(n => n > 0)
  if (!nums.length) return null
  const openEnded = /\+/.test(text)
  const low = nums[0]
  const high = openEnded ? Infinity : nums[nums.length - 1]
  const mid = openEnded ? low : (low + high) / 2
  // 三位及以上小数几乎肯定是表格里两个数字粘在了一起
  const malformed = /\d+\.\d{3,}/.test(text)
  return {
    raw: text,
    low,
    high,
    mid,
    openEnded,
    unitGuessed: !/斤|kg|公斤/.test(text),
    suspect: malformed || mid < IMPLAUSIBLE_PER_JIN
  }
}

function attachPrices(items) {
  const withPrice = (items || []).map(item => ({ ...item, price: parsePrice(item.marketPrice) }))
  const mids = withPrice
    .filter(item => item.price && !item.price.suspect && Number.isFinite(item.price.mid))
    .map(item => item.price.mid)
    .sort((a, b) => a - b)
  const median = mids.length ? mids[Math.floor(mids.length / 2)] : 0
  const at = ratio => (mids.length ? mids[Math.min(mids.length - 1, Math.floor(mids.length * ratio))] : 0)
  const bands = { median, p33: at(0.33), p67: at(0.67), premium: median * PREMIUM_MEDIAN_RATIO }
  return {
    items: withPrice.map(item => ({ ...item, tier: tierOf(item.price, bands) })),
    bands
  }
}

function tierOf(price, bands) {
  if (!price || price.suspect || !Number.isFinite(price.mid)) return 'unknown'
  if (bands.premium && price.mid >= bands.premium) return 'premium'
  if (price.mid >= bands.p67) return 'high'
  if (price.mid <= bands.p33) return 'low'
  return 'mid'
}

// 元/斤 → 每月粮费，按宠物的每日喂食目标折算
function monthlyCost(price, dailyGrams) {
  if (!price || !(dailyGrams > 0)) return null
  const jinPerMonth = dailyGrams / GRAMS_PER_JIN * DAYS_PER_MONTH
  return {
    low: Math.round(price.low * jinPerMonth),
    high: Number.isFinite(price.high) ? Math.round(price.high * jinPerMonth) : null
  }
}

function monthlyToPerJin(monthly, dailyGrams) {
  if (!(monthly > 0) || !(dailyGrams > 0)) return 0
  return monthly / (dailyGrams / GRAMS_PER_JIN * DAYS_PER_MONTH)
}

function formatMonthly(cost) {
  if (!cost) return ''
  return cost.high && cost.high !== cost.low ? `约 ${cost.low}-${cost.high} 元/月` : `约 ${cost.low} 元/月起`
}

// 从问句里解析价格意图。认不出就返回 null，走原来的推荐逻辑。
// 先定口径（斤 / 月），再抽数字，否则「40-60元一斤」会被单价正则先吃掉上限、丢掉下限。
function parsePriceIntent(question) {
  const text = String(question || '').replace(/\s+/g, '')
  if (!text) return null
  const cheaper = /便宜|太贵|贵了|贵点|贵些|省点|划算|性价比|预算有限|便宜点|便宜些|低一点|降一点/.test(text)
  const pricier = /贵一点|贵一些|好一点|好一些|高端|更好的|不差钱/.test(text)

  const range = text.match(/(\d+(?:\.\d+)?)(?:元|块)?[-~到至](\d+(?:\.\d+)?)/)
  const single = text.match(/(\d+(?:\.\d+)?)(?:元|块)?(?:以内|以下|左右|之内|封顶|上下)/) ||
                 text.match(/预算\D{0,3}(\d+(?:\.\d+)?)/) ||
                 text.match(/(\d+(?:\.\d+)?)(?:元|块)?(?:一斤|每斤|\/斤)/) ||
                 text.match(/(?:一个月|每个月|每月|月)\D{0,4}(\d+(?:\.\d+)?)/)
  if (!range && !single) return cheaper || pricier ? { frame: null, cheaper, pricier } : null

  const min = range ? Number(range[1]) : undefined
  const max = range ? Number(range[2]) : Number(single[1])
  const perJinWord = /一斤|每斤|\/斤|元\/斤/.test(text)
  const monthWord = /一个月|每个月|每月|\/月|月费|月花/.test(text)
  let frame = perJinWord ? 'perJin' : monthWord ? 'monthly' : null
  let guessed = false
  if (!frame) {
    // 没写单位时按量级判断：单价通常几十，月费通常上百。判断结果要在回复里说明，
    // 让用户能一眼看出口径对不对。
    frame = max >= 100 ? 'monthly' : 'perJin'
    guessed = true
  }
  const intent = { frame, max, cheaper, pricier }
  if (min !== undefined) intent.min = min
  if (guessed) intent.guessed = true
  return intent
}

module.exports = {
  GRAMS_PER_JIN,
  parsePrice,
  attachPrices,
  tierOf,
  monthlyCost,
  monthlyToPerJin,
  formatMonthly,
  parsePriceIntent
}
