// 审核版离线推荐目录：只做信息整理和筛选，不替代兽医或商品详情页。
const CATALOG = {
  mainFood: [
    { id: 'main-adult-balanced', brand: '皇家 Royal Canin', name: 'Size Health Nutrition 成犬系列', type: '主粮', tags: ['成年', '均衡', '日常'], protein: '中等', fat: '中等', note: '按体型和年龄选具体规格，适合作为日常主粮候选。' },
    { id: 'main-sensitive', brand: '冠能 Purina Pro Plan', name: 'Sensitive Skin & Stomach 敏感肠胃系列', type: '主粮', tags: ['肠胃敏感', '皮肤敏感', '单一蛋白'], protein: '中等', fat: '中低', note: '适合需要减少变量的阶段，换粮仍要渐进，不能凭名称诊断过敏。' },
    { id: 'main-weight', brand: '皇家 Royal Canin', name: 'Weight Care 体重管理系列', type: '主粮', tags: ['体重管理', '低脂', '控制热量'], protein: '中等偏高', fat: '偏低', note: '更适合体况偏胖或需要控制热量的宠物，先结合体况和兽医意见。' },
    { id: 'main-weight-proplan', brand: '冠能 Purina Pro Plan', name: 'Weight Management 体重管理系列', type: '主粮', tags: ['体重管理', '低脂', '控制热量'], protein: '中等偏高', fat: '偏低', note: '适合作为体重管理候选，实际喂量要按体况和包装建议调整。' },
    { id: 'main-puppy', brand: '希尔思 Hill’s Science Diet', name: 'Puppy 幼年成长系列', type: '主粮', tags: ['幼年', '成长', '高营养'], protein: '中等偏高', fat: '中等', note: '幼宠优先选择对应物种和年龄阶段的完整均衡配方。' },
    { id: 'main-senior', brand: '希尔思 Hill’s Science Diet', name: 'Adult 7+ 老年系列', type: '主粮', tags: ['老年', '温和', '体重管理'], protein: '中等', fat: '中低', note: '老年宠要同时看牙口、肾脏和体重，处方需求应由兽医判断。' },
    { id: 'main-premium', brand: '渴望 ORIJEN', name: 'Original 全阶段系列', type: '主粮', tags: ['成年', '高蛋白', '日常'], protein: '偏高', fat: '中高', note: '适合作为高动物性原料候选，但高能量配方不一定适合每只宠物。' }
  ],
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
  let score = 0
  tags.forEach(tag => { if (item.tags.includes(tag)) score += 4 })
  if (isCat(ctx) && /犬/.test(item.name)) score -= 6
  if (!isCat(ctx) && /猫/.test(item.name)) score -= 6
  if (/低脂|减肥|控制体重|太胖/.test(text) && item.tags.includes('体重管理')) score += 7
  if (/肠胃|软便|敏感|过敏/.test(text) && item.tags.includes('肠胃敏感')) score += 7
  if (/训练|奖励/.test(text) && item.tags.includes('训练')) score += 5
  if (/雨天|室内|无聊|独处/.test(text) && item.tags.includes('室内')) score += 5
  if (/磨牙|口腔|牙/.test(text) && (item.tags.includes('口腔') || item.tags.includes('磨牙'))) score += 5
  return score
}

function recommend(category, ctx, question, limit = 3) {
  const list = CATALOG[category] || [...CATALOG.mainFood, ...CATALOG.snack, ...CATALOG.toy]
  return list
    .map(item => ({ ...item, score: scoreItem(item, ctx, question) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit)
}

function allItems() {
  return [...CATALOG.mainFood, ...CATALOG.snack, ...CATALOG.toy]
}

function findItems(question) {
  const text = normalize(question)
  const hits = allItems().filter(item => [item.brand, item.name].some(value => text.includes(normalize(value))) || item.tags.some(tag => text.includes(normalize(tag))))
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

module.exports = { catalog, recommend, findItems, ingredientAdvice, profileTags }
