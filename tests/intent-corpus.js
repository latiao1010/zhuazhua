// 意图路由语料测试。
//
// 这套顾问的意图靠正则顺序匹配，先命中先返回，所以每次放宽一个说法都可能
// 抢走别的意图，每次收紧又可能漏掉常见口语。真实踩过的坑：
//   「帮我对比两款主粮」被记录对比抢走、「下周寄养」被当成「最近一周」、
//   「在用什么药吗」掉进用药建议、「能吃什么狗粮」掉进食物安全。
//
// 所以每条语料都写两件事：该命中什么（expect），以及不能被谁抢走（reject）。
// 语料来自用户真实提问，修一个锁一个。

const assert = require('assert')
const path = require('path')

const DB = {
  paw_pet: { name: '糯米', breed: '柯基', sex: '男孩', birthday: '2023-03-16', weight: '11.2', togetherSince: '2023-03-16', avatar: '' },
  paw_feeds: [], paw_water_records: [], paw_walk_records: [], paw_stools: [],
  paw_feed_goal: 260, paw_care_schedule: {}, paw_care_records: [], paw_supply_records: {},
  paw_weight_records: [], paw_diaries: [], paw_chats: [], paw_growth_photos: [], paw_family_members: []
}
global.wx = {
  getStorageSync: key => (DB[key] !== undefined ? DB[key] : ''),
  setStorageSync: (key, value) => { DB[key] = value },
  getSystemInfoSync: () => ({})
}

const knowledge = require(path.join(__dirname, '..', 'utils', 'pet-knowledge'))
const suggestions = require(path.join(__dirname, '..', 'utils', 'chat-suggestions'))

// [问句, 期望意图, 不能是的意图]
const CORPUS = [
  // 商品选购：问「什么 + 商品类目」
  ['能吃什么狗粮', 'recommendation:mainFood', 'foodSafety'],
  ['吃什么狗粮好', 'recommendation:mainFood', 'supply'],
  ['狗粮能吃什么牌子', 'recommendation:mainFood', 'foodSafety'],
  ['什么零食好', 'recommendation:snack', 'foodSafety'],
  ['帮我筛选适合我家宠物的主粮', 'recommendation:mainFood', null],
  ['帮我对比两款主粮应该看什么', 'recommendation:compare', 'recommendation:mainFood'],
  ['宠物粮的蛋白、脂肪和配料表怎么看', 'recommendation:ingredient', 'recommendation:mainFood'],

  // 食物安全：问「能不能吃 + 具体食材」，没有商品类目
  ['能吃巧克力吗', 'foodSafety', 'recommendation:mainFood'],
  ['能吃什么水果', 'foodSafety', 'recommendation:mainFood'],
  ['苹果、鸡胸肉和酸奶能不能吃？', 'foodSafety', 'recommendation:mainFood'],

  // 用药：查档案 vs 要建议
  ['在用什么药吗', 'medicineRecord', 'medicine'],
  ['最近在吃什么药', 'medicineRecord', 'medicine'],
  ['有在用药吗', 'medicineRecord', 'medicine'],
  ['该吃什么药', 'medicine', 'medicineRecord'],
  ['拉肚子吃什么药', 'medicine', 'medicineRecord'],

  // 价格：带预算的问句本身就是选购
  ['一个月500以内的狗粮', 'recommendation:mainFood', 'supply'],
  ['300以内的狗粮', 'recommendation:mainFood', 'supply'],
  ['有便宜点的狗粮吗', 'recommendation:mainFood', 'supply'],

  // 未来时间不是历史区间
  ['下周寄养要准备什么', 'travel', null],
  ['下个月要打疫苗吗', 'care', null]
]

let passed = 0
let failed = 0

console.log('意图语料')
CORPUS.forEach(([question, expect, reject]) => {
  const actual = knowledge.detectIntent(question)
  const okExpect = actual === expect
  const okReject = reject === null || actual !== reject
  if (okExpect && okReject) {
    passed++
    return
  }
  failed++
  console.log(`  ✗ ${question}`)
  console.log(`      期望 ${expect}${reject ? `（且不能是 ${reject}）` : ''}，实际 ${actual}`)
})

// 追问按钮的文案必须落在它自己承诺的意图上，否则点了按钮也会答错
console.log('追问按钮文案')
const BUTTON_EXPECT = [
  ['有便宜点的狗粮吗', /recommendation/],
  ['一个月500以内的狗粮', /recommendation/],
  ['帮我对比两款主粮应该看什么', /recommendation:compare/],
  ['宠物粮的蛋白、脂肪和配料表怎么看', /recommendation:ingredient/],
  ['最近七天吃的多吗', /^feed$/],
  ['最近七天喝水够吗', /^water$/],
  ['最近七天散步够不够', /^walk$/],
  ['便便最近一周正常吗', /^stool$/],
  ['最近在吃什么药', /medicineRecord/],
  ['下次驱虫什么时候', /^care$/],
  ['苹果、鸡胸肉和酸奶能不能吃？', /foodSafety/],
  ['帮我筛选适合我家宠物的主粮', /recommendation:mainFood/]
]
BUTTON_EXPECT.forEach(([text, pattern]) => {
  const actual = knowledge.detectIntent(text)
  if (pattern.test(actual)) {
    passed++
    return
  }
  failed++
  console.log(`  ✗ 按钮「${text}」→ ${actual}，不符合 ${pattern}`)
})

// 所有追问文案都必须落到明确的回答上。新增按钮时最容易犯的错就是写一句
// 意图识别接不住的话，用户点了却得到兜底的「今日状态」。
// 「和之前比呢」依赖上文，单独带历史验证。
console.log('追问文案有归属')
const CONTEXT_ONLY = new Set(['和之前比呢'])
const allTexts = new Map()
suggestions.FOLLOW_UPS.forEach(group => group.items.forEach(item => allTexts.set(item.text, item.label)))
suggestions.evergreen(DB.paw_pet).forEach(item => allTexts.set(item.text, item.label))
allTexts.forEach((label, text) => {
  if (CONTEXT_ONLY.has(text)) return
  const title = knowledge.createReply(text, DB.paw_pet, { history: [{ role: 'user', text }] }).split('\n')[0]
  if (/^【今日状态】/.test(title) && !/状态/.test(text)) {
    failed++
    console.log(`  ✗ 按钮「${label}」的文案「${text}」落到兜底：${title}`)
    return
  }
  passed++
})
{
  const history = [
    { role: 'user', text: '一周的喝水呢' },
    { role: 'ai', text: '【最近一周饮水】' },
    { role: 'user', text: '和之前比呢' }
  ]
  const title = knowledge.createReply('和之前比呢', DB.paw_pet, { history }).split('\n')[0]
  if (/对比/.test(title)) passed++
  else { failed++; console.log(`  ✗ 带上文的「和之前比呢」→ ${title}`) }
}

// 每种回答都要能给出追问，且文案不能重复
console.log('追问生成')
const TITLES = ['【主粮筛选】', '【饮食判断】', '【最近 7 天饮水】', '【上周运动】', '【肠胃判断】',
  '【食物安全】', '【用药提醒】', '【体重趋势判断】', '【疫苗提醒】', '【出行/寄养准备】',
  '【雨天室内活动】', '【日常洗护】', '【幼年照护】', '【今日状态】', '【用品余量】',
  '【症状索引：呕吐】', '【紧急判断】', '【商品对比】', '']
TITLES.forEach(title => {
  const items = suggestions.followUps(title, DB.paw_pet)
  const texts = items.map(item => item.text)
  try {
    assert.ok(items.length > 0, `${title} 没有生成追问`)
    assert.strictEqual(new Set(texts).size, texts.length, `${title} 追问文案重复`)
    const labels = items.map(item => item.label)
    assert.strictEqual(new Set(labels).size, labels.length, `${title} 追问标签重复（用户会看到两个一样的按钮）`)
    items.forEach(item => assert.ok(item.label && item.text, `${title} 追问缺字段`))
    passed++
  } catch (error) {
    failed++
    console.log(`  ✗ ${error.message}`)
  }
})

console.log(`\n${passed}/${passed + failed} 通过`)
process.exit(failed ? 1 : 0)
