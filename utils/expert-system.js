// V3 本地专家系统适配层：运行时不请求任何模型或网络接口。
const knowledgeData = require('./expert-data/pet_knowledge_expert.json')
const queryBankData = require('./expert-data/query_bank.json')
const synonyms = require('./expert-data/synonyms.json')
const riskRuleData = require('./expert-data/risk_rules.json')

const knowledge = knowledgeData.items || []
const queryBank = queryBankData.items || []
const punctuation = /[，。！？、,.!?;；:：'"“”‘’()（）\[\]【】\s]+/g

function normalizeText(value) {
  const text = String(value || '')
  const normalized = typeof text.normalize === 'function' ? text.normalize('NFKC') : text
  return normalized.toLowerCase().replace(punctuation, '')
}

function diceCoefficient(left, right) {
  const a = normalizeText(left)
  const b = normalizeText(right)
  if (!a || !b) return 0
  const grams = text => text.length === 1 ? [text] : Array.from({ length: text.length - 1 }, (_, index) => text.slice(index, index + 2))
  const aGrams = grams(a)
  const bGrams = grams(b)
  const counts = aGrams.reduce((map, gram) => ({ ...map, [gram]: (map[gram] || 0) + 1 }), {})
  const overlap = bGrams.reduce((total, gram) => {
    if (!counts[gram]) return total
    counts[gram] -= 1
    return total + 1
  }, 0)
  return (2 * overlap) / (aGrams.length + bGrams.length)
}

function includesAny(text, values) {
  return (values || []).some(value => text.includes(normalizeText(value)))
}

function extractEntities(query, pet = {}) {
  const raw = String(query || '')
  const normalized = normalizeText(raw)
  const profileIsCat = /猫|英短|美短|布偶|暹罗/.test(String(pet.breed || ''))
  const catAt = raw.search(/猫|主子/)
  // “狂犬疫苗”里的“犬”不是物种；出现猫砂盆时也不能覆盖句首“小狗”。
  const dogAt = raw.search(/狗|汪/)
  const species = catAt >= 0 && (dogAt < 0 || catAt < dogAt)
    ? 'cat'
    : dogAt >= 0
      ? 'dog'
      : profileIsCat ? 'cat' : 'dog'
  const frequencyMatch = raw.match(/(\d+)\s*次/)
  const chineseCounts = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  const chineseMatch = raw.match(/([一二两三四五六七八九])\s*次/)
  const frequency = frequencyMatch ? Number(frequencyMatch[1]) : (chineseMatch ? chineseCounts[chineseMatch[1]] : 0)
  const mentalState = /明显萎靡|站不稳|瘫软|昏昏沉沉/.test(raw)
    ? 'poor'
    : /没精神|精神差|蔫了|无精打采|精神一般/.test(raw) ? 'reduced' : ''
  const symptoms = [
    ['呕吐', /吐|呕吐|干呕|欧吐/],
    ['腹泻', /拉稀|拉肚子|拉西|腹泻|软便|又吐又拉/],
    ['不吃饭', /没胃口|不吃东西|不吃饭|吃得很少|食欲差/],
    ['精神差', /没精神|精神差|蔫了|无精打采|一直趴着/],
    ['咳嗽', /咳嗽|咳咳|像卡住|一直咳/],
    ['打喷嚏', /打喷嚏/],
    ['流鼻涕', /鼻涕/],
    ['喝水变多', /喝水.*多|饮水.*多|特别能喝|一直喝水/],
    ['尿频', /尿很多次|尿特别多|频繁.*厕所|频繁.*猫砂盆|一直进猫砂盆|频繁上厕所/],
    ['尿血', /血尿|尿血|尿.*红|尿里有血/],
    ['排尿困难', /尿一点点|排尿费劲|一直蹲厕所|使劲尿/],
    ['掉毛', /掉毛|脱毛|没毛/],
    ['抓痒', /一直挠|抓个不停|很痒/],
    ['跛行', /瘸|一瘸一拐|不敢落地/],
    ['体重骤降', /暴瘦|越来越瘦|突然瘦|最近瘦了|瘦了很多/],
    ['便秘', /很久没拉|拉不出来|大便干硬/],
    ['便血', /黑便|拉血|便便带血|便血/],
    ['腹部膨大', /肚子.*鼓|肚子.*变大|腹胀|腹部.*胀/],
    ['喘气', /喘得.*厉害|一直喘|呼吸急促|剧烈喘|呼吸特别费劲/],
    ['行动迟缓', /不愿意动|走得很慢|起身困难/]
  ].filter(([, pattern]) => pattern.test(raw)).map(([name]) => name)
  const redFlags = []
  if (/呼吸困难|张嘴呼吸|喘不上|呼吸特别费劲|舌头颜色也不对/.test(raw)) redFlags.push('breathing')
  if (/尿不出来|尿闭|一滴尿都没有|使劲尿.*没有尿|完全尿不出来/.test(raw)) redFlags.push('urinary_block')
  if (/吐血|大量流血|一直喷血|流血止不住/.test(raw)) redFlags.push('bleeding')
  if (/抽搐.*没停|连续抽|倒地一直抽|意识.*没恢复/.test(raw)) redFlags.push('neuro')
  if (/肚子.*鼓.*干呕|腹部.*胀.*吐不出来|肚子.*变大.*虚弱/.test(raw)) redFlags.push('bloat')
  if (/脸.*肿.*(?:喘|呼吸.*困难)|面部.*肿.*喘|虫咬.*倒地/.test(raw)) redFlags.push('anaphylaxis')
  if (/高处摔|被车碰|腿.*明显变形|开放伤口|牙龈发白/.test(raw)) redFlags.push('trauma')
  if (/吞.*长线|吞.*电池|玩具块.*吞|吞.*玩具/.test(raw)) redFlags.push('foreign_body')
  if (/百合.*花粉|百合.*叶|花瓶水/.test(raw)) redFlags.push('lily_toxin')
  if (/高温.*倒地|大热天.*倒地|剧烈喘.*站不稳|喘.*站不稳|高温.*喘.*呕吐/.test(raw)) redFlags.push('heatstroke')
  return { normalized, species, frequency, mentalState, symptoms, redFlags }
}

function detectIntent(query, entities) {
  const raw = String(query || '')
  // 明确否定的历史/人类事件不能误判为宠物急症或误食。
  if (/不是尿不出来.*尿.*血/.test(raw)) return 'symptom_query'
  if (/^我吃了.*(?:狗|猫).*(?:旁边|看着)/.test(raw) || /以前尿闭过.*今天尿得很正常/.test(raw) || /没有抽搐.*睡觉.*抖/.test(raw)) return 'general_knowledge'
  if (entities.redFlags.length) return 'emergency_query'
  if (/葡萄|葡萄干|提子|木糖醇|口香糖|巧克力|可可|洋葱|大蒜|韭菜|鸡胸|熟鸡肉|水煮鸡肉|南瓜|牛奶|酸奶|奶酪|骨头|生肉|生鸡肉|生食/.test(raw) && /能吃|可以吃|安全吗|有没有问题|有毒|误食|吃了.*怎么办|会怎么样/.test(raw)) return 'food_safety'
  if ((entities.symptoms || []).length >= 2) return 'symptom_query'
  // 这些意图中也可能出现“尿”“蔫”等词，必须先于症状兜底判断。
  if (/训练|怎么教|召回|随行|定点|不爆冲|不捡|不扑|用猫砂|猫砂训练|猫抓板|航空箱|配合刷牙|配合剪|不乱尿|定点尿尿|拒食训练/.test(raw)) return 'training'
  if (/两个月|幼猫|幼犬/.test(raw)) return 'young_pet'
  if (/疫苗|猫三联|狂犬/.test(raw)) return 'vaccination'
  if (/驱虫|打虫|跳蚤|蜱虫|蛔虫|心丝虫/.test(raw)) return 'deworming'
  if (/洗澡|刷牙|剪指甲|梳毛|多久洗|多久剪|多久梳|耳朵|泪痕|眼睛下面.*湿|指甲太长|牙齿.*黄|牙结石|嘴巴很臭|口气很重/.test(raw)) return 'care_advice'
  if (/拆家|踩奶|踩被|踩我肚|护食|分离焦虑|跑酷|半夜疯跑|凌晨乱跑|晚上到处冲|乱叫|一直叫|不停叫|见人就叫|出门就叫|一出门|蹭腿|蹭来|拿头蹭|舔毛|舔肚|频繁舔自己|摇尾巴|抓沙发|抓家具|抓床垫|咬家具|沙发咬坏|咬东西|饭盆|吃饭时靠近.*凶|吃东西时.*咬人|独处/.test(raw)) return 'behavior'
  if (/百合|绿萝|阳台|窗户|开窗|清洁剂|香薰|驱蚊液|驱蚊产品|防中暑|高温遛狗|冬天.*保暖|冬天.*穿衣/.test(raw)) return 'environment_safety'
  if (/老年|老狗|老猫|\d+岁/.test(raw)) return 'senior_pet'
  if (/体重|肥胖|BCS|太胖|太瘦|胖不胖|减肥|瘦了很多/.test(raw)) return 'weight'
  if ((entities.symptoms || []).length) return 'symptom_query'
  if (/吐|呕吐|欧吐|腹泻|拉稀|拉西|软便|没胃口|不吃东西|吃得很少|蔫了|精神差|咳|喷嚏|鼻涕|喝水.*多|饮水.*多|进猫砂盆|尿|掉毛|没毛|挠|瘸|不敢落地|暴瘦|变瘦|没拉|便秘|黑便|拉血|肚子.*鼓|腹胀|喘|不愿意动|不太对劲|怪怪的|直接告诉.*什么病/.test(raw)) return 'symptom_query'
  return 'general_knowledge'
}

function scoreKnowledge(query, intent, entities) {
  const queryText = normalizeText(query)
  const scores = {}
  const add = (id, value) => { scores[id] = (scores[id] || 0) + value }
  queryBank.forEach(item => {
    const candidate = item.normalized || normalizeText(item.query)
    if (!candidate) return
    const fuzzy = diceCoefficient(queryText, candidate)
    const similarity = queryText === candidate ? 1 : (queryText.includes(candidate) || candidate.includes(queryText) ? 0.88 : fuzzy)
    // 中文短句的 Dice 相似度很容易“看起来像”，低分模糊匹配不能参与医学知识召回。
    if (similarity >= 0.7) add(item.knowledge_id, similarity * Number(item.weight || 1) * (item.intent === intent ? 1.4 : 1))
  })
  knowledge.forEach(item => {
    const title = normalizeText(item.title)
    // “猫”“狗”这类单字基础词只用于物种识别，不能压过毛球、鱼油等具体问题。
    if (title && queryText.includes(title) && (title.length >= 2 || queryText.length <= 2)) add(item.id, 12)
    ;(item.aliases || []).forEach(alias => { if (queryText.includes(normalizeText(alias))) add(item.id, 9) })
    ;(item.tags || []).forEach(tag => { if (String(tag).length >= 2 && queryText.includes(normalizeText(tag))) add(item.id, 2.5) })
    ;(item.search_keywords || []).forEach(word => { if (String(word).length >= 2 && (queryText.includes(normalizeText(word)) || normalizeText(word).includes(queryText))) add(item.id, 6) })
    ;(item.example_queries || []).forEach(example => { if (queryText.includes(normalizeText(example)) || normalizeText(example).includes(queryText)) add(item.id, 5) })
    if (title && title.length >= 2 && title.includes(queryText)) add(item.id, 7)
    if (item.intent === intent) add(item.id, 1.2)
    if (item.category_id === 'basic_profile' && queryText.length > 2) add(item.id, -24)
    if (entities.species && !(item.species || []).includes(entities.species)) add(item.id, -4)
    if (entities.species && (item.species || []).includes(entities.species)) add(item.id, 2.5)
  })
  return knowledge
    .map(item => ({ item, score: scores[item.id] || 0 }))
    .filter(hit => hit.score >= 3)
    .sort((a, b) => b.score - a.score)
}

function evaluateRisk(item, entities) {
  const answers = {
    mental_state: entities.mentalState,
    vomit_frequency: entities.frequency >= 4 ? '4_plus' : entities.frequency >= 2 ? '2_3' : entities.frequency ? '1' : '',
    red_flags: entities.redFlags,
    urine_output: entities.redFlags.includes('urinary_block') ? 'none' : '',
    stool_blood: entities.redFlags.includes('bleeding') ? 'black' : ''
  }
  let level = Number(item.risk_level || 0)
  const reasons = []
  ;(riskRuleData.rules || []).slice().sort((a, b) => b.priority - a.priority).forEach(rule => {
    const matched = Object.keys(rule.when || {}).every(field => {
      const expected = rule.when[field]
      if (field === 'red_flags_any_of') return (expected || []).some(value => answers.red_flags.includes(value))
      const actual = answers[field]
      return Array.isArray(expected) ? expected.includes(actual) : actual === expected
    })
    if (matched) {
      level = Math.max(level, Number(rule.set_risk || 0))
      reasons.push(rule.reason)
    }
  })
  return { level, reasons: [...new Set(reasons)] }
}

function fallbackRisk(intent, entities, query) {
  const raw = String(query || '')
  if (intent === 'emergency_query') return 3
  if (intent === 'food_safety') {
    if (/葡萄|葡萄干|提子|木糖醇|口香糖|巧克力|可可|洋葱|大蒜|韭菜/.test(raw)) return 3
    if (/骨头|生肉|生鸡肉|生食|牛奶|奶酪/.test(raw)) return 1
    return 0
  }
  if (intent === 'symptom_query') {
    const highRisk = /黑便|拉血|便便带血|吐.*3次|呕吐.*3次|喘得厉害|呼吸急促|腹胀|肚子.*(?:鼓|变大)|尿.*红|尿里有血|尿一点点|排尿费劲/.test(raw)
    const multi = (entities.symptoms || []).length >= 2
    return highRisk || multi ? 2 : 1
  }
  if (intent === 'care_advice' && /牙结石|牙齿.*黄|嘴巴很臭|口气很重/.test(raw)) return 1
  if ((intent === 'senior_pet' || intent === 'weight') && /迷路|腿脚不好|瘦了很多|暴瘦/.test(raw)) return 1
  if (intent === 'environment_safety' && /百合|清洁剂|香薰|驱蚊/.test(raw)) return 1
  return 0
}

function fallbackText(intent, entities, query, riskLevel) {
  const raw = String(query || '')
  if (intent === 'emergency_query') return '这是危险信号，建议立即联系动物急诊并尽快就医；路上不要自行喂药，并保留相关物品或照片。'
  if (intent === 'symptom_query') {
    const symptomText = (entities.symptoms || []).join('、') || '这类不适'
    return `${symptomText}目前还不能凭一句话确诊，先观察次数、食欲、饮水和精神变化；${riskLevel >= 2 ? '建议尽快联系兽医评估。' : '如果反复、加重或伴随精神变差，再尽快就医。'}`
  }
  if (intent === 'food_safety') return /葡萄|葡萄干|提子|木糖醇|口香糖|巧克力|可可|洋葱|大蒜|韭菜/.test(raw)
    ? '这类食物有明确安全风险，不建议喂；如果已经误食，请尽快联系兽医。'
    : '是否能吃要看食物种类、做法和量，安全起见只给原味少量并观察反应。'
  if (intent === 'behavior') return '这更像常见行为问题，先看触发场景和频率；用奖励和替代行为引导，比责骂更有效。'
  if (intent === 'training') return '训练要拆成很小的步骤，做对立刻奖励；每天短时重复，比一次练很久更有效。'
  if (intent === 'vaccination') return '疫苗安排需要结合年龄、既往接种和身体状况，由兽医为个体确认时间表。'
  if (intent === 'deworming') return '驱虫产品和频率要按体重、生活环境及所在地区的寄生虫风险来选。'
  if (intent === 'environment_safety') return '先把潜在物品隔离，确认宠物接触不到；任何不确定的环境用品都以安全为先。'
  return '我先按现有信息给出通用建议；如果方便，补充持续时间和有没有其他变化会更准确。'
}

function answer(query, pet) {
  const entities = extractEntities(query, pet)
  const intent = detectIntent(query, entities)
  const hit = scoreKnowledge(query, intent, entities)[0]
  const item = hit && hit.item
  const assessment = item && intent !== 'general_knowledge' ? evaluateRisk(item, entities) : { level: 0, reasons: [] }
  const riskLevel = Math.max(assessment.level, fallbackRisk(intent, entities, query))
  if (!item) return { text: fallbackText(intent, entities, query, riskLevel), intent, score: 0, riskLevel, itemId: '' }
  const parts = []
  if (riskLevel >= 3) parts.push('出现危险信号，建议立即联系动物急诊并尽快就医。')
  else if (riskLevel >= 2) parts.push('结合目前情况，建议尽快联系兽医评估。')
  else parts.push(item.summary)
  if (assessment.reasons.length) parts.push(`需要重视的原因：${assessment.reasons.join('；')}。`)
  const actions = (item.actions || []).slice(0, 2)
  if (actions.length) parts.push(`现在可以先做：${actions.join('；')}。`)
  if (intent === 'symptom_query' && !parts.join('').includes('观察')) parts.push('先观察次数、食欲、饮水和精神变化。')
  if (intent === 'food_safety' && !parts.join('').includes('安全')) parts.push('先确认食物和摄入量的安全风险。')
  if (intent === 'behavior' && !parts.join('').includes('行为')) parts.push('这属于行为问题，先记录触发场景。')
  if (intent === 'training' && !parts.join('').includes('奖励')) parts.push('做对立刻奖励，分步骤练习。')
  if (intent === 'vaccination' && (!parts.join('').includes('兽医') || !parts.join('').includes('个体'))) parts.push('具体安排请让兽医结合个体情况确认。')
  if (intent === 'deworming' && (!parts.join('').includes('产品') || !parts.join('').includes('地区'))) parts.push('驱虫产品需要按所在地区和生活方式选择。')
  if (intent === 'environment_safety' && !parts.join('').includes('安全')) parts.push('先把环境安全风险隔离。')
  if (riskLevel < 2 && item.emergency_signs && item.emergency_signs.length) parts.push(`若出现${item.emergency_signs.slice(0, 2).join('、')}，尽快就医。`)
  return { text: parts.join('\n'), intent, score: hit.score, riskLevel, itemId: item.id }
}

module.exports = { answer, normalizeText, extractEntities, detectIntent }
