// 顾问的追问建议。
//
// 自由输入是这套本地知识库最脆弱的地方：意图靠正则顺序匹配，用户的口语说法
// 一变就可能被别的意图抢走（「能吃什么狗粮」曾掉进食物安全、「在用什么药吗」
// 曾掉进用药建议）。追问尤其危险，因为还叠加了主题继承和锚点。
//
// 所以这里给的按钮，文案一律用意图识别已经验证过的说法：用户点按钮就完全
// 绕开了自由输入的边界。tests/intent-corpus.js 会逐条锁住这些文案的归属。

// 按上一条回答的标题匹配。标题是回答的第一行，形如【主粮筛选】。
// 知识库有 100 多种回答，这里按大类覆盖：记录、护理、商品、食物、症状、
// 场景、生命阶段。匹配不上才退到 evergreen。
const FOLLOW_UPS = [
  // —— 紧急：不引导继续浏览，只给下一步该做的事 ——
  {
    match: /紧急判断|急症卡|误吞异物|次数增加/,
    // 急症后面不补通用建议：刚判完危险信号就引导「推荐主粮」「能不能吃」，
    // 语气不对，也会把注意力从该做的事上带走。
    noPadding: true,
    items: [
      { label: '呕吐观察', text: '呕吐要观察什么' },
      { label: '今天记什么', text: '今天要记录什么' }
    ]
  },

  // —— 商品选购 ——
  {
    match: /主粮筛选|根据宠物推荐|零食筛选|玩具筛选/,
    items: [
      { label: '便宜点的', text: '有便宜点的狗粮吗' },
      { label: '每月500以内', text: '一个月500以内的狗粮' },
      { label: '好一点的', text: '有好一点的狗粮吗' },
      { label: '两款怎么比', text: '帮我对比两款主粮应该看什么' },
      { label: '配料怎么看', text: '宠物粮的蛋白、脂肪和配料表怎么看' },
      { label: '训练零食', text: '帮我筛选适合训练的零食' }
    ]
  },
  {
    match: /商品对比|营养\/配料解释/,
    items: [
      { label: '按档案推荐', text: '帮我筛选适合我家宠物的主粮' },
      { label: '便宜点的', text: '有便宜点的狗粮吗' },
      { label: '换粮怎么换', text: '换粮要怎么过渡' }
    ]
  },

  // —— 记录类 ——
  {
    match: /饮食判断|饮食对比|天饮食|周饮食|昨天饮食|上周饮食|个月饮食|挑食|拒食/,
    items: [
      { label: '最近七天', text: '最近七天吃的多吗' },
      { label: '和之前比', text: '和之前比呢' },
      { label: '上周呢', text: '上周吃了多少' },
      { label: '换粮推荐', text: '帮我筛选适合我家宠物的主粮' },
      { label: '喝水够吗', text: '最近七天喝水够吗' }
    ]
  },
  {
    match: /饮水判断|饮水对比|天饮水|周饮水|昨天饮水|上周饮水|个月饮水|尿尿观察/,
    items: [
      { label: '最近七天', text: '最近七天喝水够吗' },
      { label: '和之前比', text: '和之前比呢' },
      { label: '昨天呢', text: '昨天喝了多少' },
      { label: '吃得够吗', text: '最近七天吃的多吗' }
    ]
  },
  {
    match: /运动判断|运动对比|天运动|周运动|上周运动|个月运动|老年关节/,
    items: [
      { label: '最近七天', text: '最近七天散步够不够' },
      { label: '和之前比', text: '和之前比呢' },
      { label: '雨天怎么办', text: '雨天在室内怎么消耗精力' },
      { label: '夏天遛狗', text: '夏天散步要注意什么' }
    ]
  },
  {
    match: /肠胃判断|便便对比|天排便|周排便|上周排便|个月排便|腹泻处理/,
    items: [
      { label: '最近七天', text: '便便最近一周正常吗' },
      { label: '要不要担心', text: '便便偏软要不要担心？' },
      { label: '和之前比', text: '和之前比呢' },
      { label: '吃得对吗', text: '最近七天吃的多吗' }
    ]
  },
  {
    match: /体重趋势|体重管理/,
    items: [
      { label: '吃得多吗', text: '最近七天吃的多吗' },
      { label: '运动够吗', text: '最近七天散步够不够' },
      { label: '控制体重的粮', text: '有控制体重的狗粮吗' }
    ]
  },

  // —— 护理与用药 ——
  {
    match: /疫苗提醒|驱虫提醒|洗澡提醒|刷牙提醒|剪指甲提醒|护理提醒|年度体检/,
    items: [
      { label: '下次驱虫', text: '下次驱虫什么时候' },
      { label: '下次疫苗', text: '下次疫苗什么时候' },
      { label: '在用什么药', text: '最近在吃什么药' },
      { label: '洗澡怎么洗', text: '洗澡和吹干要注意什么' }
    ]
  },
  {
    match: /用药提醒|用药记录/,
    items: [
      { label: '在用什么药', text: '最近在吃什么药' },
      { label: '下次驱虫', text: '下次驱虫什么时候' },
      { label: '今日状态', text: '今天状态怎么样？' }
    ]
  },

  // —— 食物安全 ——
  {
    match: /食物安全|食物判断|禁食清单|友好食物|可少量尝试|食物补充库/,
    items: [
      { label: '换个食物', text: '苹果、鸡胸肉和酸奶能不能吃？' },
      { label: '哪些不能吃', text: '哪些食物是禁食的' },
      { label: '推荐狗粮', text: '帮我筛选适合我家宠物的主粮' },
      { label: '训练零食', text: '帮我筛选适合训练的零食' }
    ]
  },

  // —— 症状与观察 ——
  {
    match: /呕吐观察|呼吸道观察|精神状态|皮肤不适|口腔不适|耳朵观察|眼部观察|口腔观察|睡眠观察|叮咬|皮肤提醒|常见不适|症状索引/,
    items: [
      { label: '呕吐观察', text: '呕吐要观察什么' },
      { label: '今日状态', text: '今天状态怎么样？' },
      { label: '便便正常吗', text: '便便最近一周正常吗' },
      { label: '吃得正常吗', text: '最近七天吃的多吗' }
    ]
  },

  // —— 场景包 ——
  {
    match: /出行\/寄养|寄养与上门|坐车晕车|节假日烟花|独自在家/,
    items: [
      { label: '带什么', text: '出门要带哪些东西' },
      { label: '疫苗齐了吗', text: '下次疫苗什么时候' },
      { label: '今日状态', text: '今天状态怎么样？' }
    ]
  },
  {
    match: /雨天|夏天|冬天|防烫脚|保暖/,
    items: [
      { label: '室内怎么玩', text: '雨天在室内怎么消耗精力' },
      { label: '运动够吗', text: '最近七天散步够不够' },
      { label: '推荐玩具', text: '帮我筛选适合室内的玩具' }
    ]
  },
  {
    match: /日常洗护|洗护|脚垫|趾间炎|肛门腺|换牙|毛球|耳螨|跳蚤|蜱虫/,
    items: [
      { label: '多久洗一次', text: '下次洗澡什么时候' },
      { label: '刷牙提醒', text: '下次刷牙什么时候' },
      { label: '皮肤观察', text: '皮肤问题要观察什么' }
    ]
  },
  {
    match: /训练|口令|牵引|召回|护食|如厕|猫砂盆|航空箱|笼内/,
    items: [
      { label: '训练零食', text: '帮我筛选适合训练的零食' },
      { label: '益智玩具', text: '帮我筛选适合室内的玩具' },
      { label: '运动够吗', text: '最近七天散步够不够' }
    ]
  },

  // —— 生命阶段 ——
  {
    match: /幼年照护|幼宠|新宠到家|老年照护/,
    items: [
      { label: '吃什么粮', text: '帮我筛选适合我家宠物的主粮' },
      { label: '疫苗安排', text: '下次疫苗什么时候' },
      { label: '运动怎么安排', text: '最近七天散步够不够' }
    ]
  },

  // —— 综合 ——
  {
    match: /今日状态|记录建议|品种补充|知识库补充|提醒规则补充/,
    items: [
      { label: '吃得够吗', text: '最近七天吃的多吗' },
      { label: '喝水够吗', text: '最近七天喝水够吗' },
      { label: '散步够吗', text: '最近七天散步够不够' },
      { label: '便便正常吗', text: '便便最近一周正常吗' },
      { label: '推荐主粮', text: '帮我筛选适合我家宠物的主粮' }
    ]
  },
  {
    match: /用品余量/,
    items: [
      { label: '推荐主粮', text: '帮我筛选适合我家宠物的主粮' },
      { label: '便宜点的', text: '有便宜点的狗粮吗' },
      { label: '吃得多吗', text: '最近七天吃的多吗' }
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
function followUps(lastAnswer, pet, limit = 6) {
  const title = String(lastAnswer || '').split('\n')[0]
  const matched = title ? FOLLOW_UPS.find(group => group.match.test(title)) : null
  const items = matched ? matched.items.slice() : []
  if (matched && matched.noPadding) return items.slice(0, limit)
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
