// 顾问的追问建议。
//
// 自由输入是这套本地知识库最脆弱的地方：意图靠正则顺序匹配，用户的口语说法
// 一变就可能被别的意图抢走（「能吃什么狗粮」曾掉进食物安全、「在用什么药吗」
// 曾掉进用药建议）。追问尤其危险，因为还叠加了主题继承和锚点。
//
// 所以这里给的按钮，文案一律用意图识别已经验证过的说法：用户点按钮就完全
// 绕开了自由输入的边界。tests/intent-corpus.js 会逐条锁住这些文案的归属。

// 按上一条回答的标题匹配。标题是回答的第一行，形如【主粮筛选】。
const FOLLOW_UPS = [
  {
    match: /主粮筛选|根据宠物推荐|零食筛选/,
    items: [
      { label: '便宜点的', text: '有便宜点的狗粮吗' },
      { label: '每月500以内', text: '一个月500以内的狗粮' },
      { label: '两款怎么比', text: '帮我对比两款主粮应该看什么' },
      { label: '配料怎么看', text: '宠物粮的蛋白、脂肪和配料表怎么看' }
    ]
  },
  {
    match: /饮食判断|饮食对比|天饮食|周饮食|昨天饮食|上周饮食|个月饮食/,
    items: [
      { label: '最近七天', text: '最近七天吃的多吗' },
      { label: '和之前比', text: '和之前比呢' },
      { label: '换粮推荐', text: '帮我筛选适合我家宠物的主粮' }
    ]
  },
  {
    match: /饮水判断|饮水对比|天饮水|周饮水|昨天饮水|上周饮水|个月饮水/,
    items: [
      { label: '最近七天', text: '最近七天喝水够吗' },
      { label: '和之前比', text: '和之前比呢' }
    ]
  },
  {
    match: /运动判断|运动对比|天运动|周运动|上周运动|个月运动/,
    items: [
      { label: '最近七天', text: '最近七天散步够不够' },
      { label: '和之前比', text: '和之前比呢' }
    ]
  },
  {
    match: /肠胃判断|便便对比|天排便|周排便|上周排便|个月排便/,
    items: [
      { label: '最近七天', text: '便便最近一周正常吗' },
      { label: '要不要担心', text: '便便偏软要不要担心？' }
    ]
  },
  {
    match: /食物安全|食物判断/,
    items: [
      { label: '换个食物', text: '苹果、鸡胸肉和酸奶能不能吃？' },
      { label: '推荐狗粮', text: '帮我筛选适合我家宠物的主粮' }
    ]
  },
  {
    match: /用药提醒|用药记录|驱虫提醒|疫苗提醒|护理/,
    items: [
      { label: '在用什么药', text: '最近在吃什么药' },
      { label: '下次护理', text: '下次驱虫什么时候' }
    ]
  }
]

// 任何时候都可以问的，用来兜底和补齐数量
function evergreen(pet) {
  const name = (pet && pet.name) || '它'
  return [
    { label: '今日状态', text: `${name}今天状态怎么样？` },
    { label: '最近七天', text: '最近七天吃的多吗' },
    { label: '推荐主粮', text: '帮我筛选适合我家宠物的主粮' },
    { label: '能不能吃', text: '苹果、鸡胸肉和酸奶能不能吃？' }
  ]
}

// lastAnswer：上一条顾问回答的全文；没有就给通用建议
function followUps(lastAnswer, pet, limit = 4) {
  const title = String(lastAnswer || '').split('\n')[0]
  const matched = title ? FOLLOW_UPS.find(group => group.match.test(title)) : null
  const items = matched ? matched.items.slice() : []
  if (items.length < limit) {
    // 标签也要去重：饮水追问是「最近七天喝水够吗」、兜底是「最近七天吃的多吗」，
    // 文案不同但标签都叫「最近七天」，并排放会出现两个一样的按钮。
    const seenText = new Set(items.map(item => item.text))
    const seenLabel = new Set(items.map(item => item.label))
    evergreen(pet).forEach(item => {
      if (items.length >= limit) return
      if (seenText.has(item.text) || seenLabel.has(item.label)) return
      seenText.add(item.text)
      seenLabel.add(item.label)
      items.push(item)
    })
  }
  return items.slice(0, limit)
}

module.exports = { followUps, evergreen, FOLLOW_UPS }
