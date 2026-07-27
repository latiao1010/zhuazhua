const store = require('../../utils/store')

const replies = [
  { keys: ['虫咬', '叮咬', '蜂蜇', '蜱虫', '跳蚤'], text: pet => `${pet.name}如果只是局部轻微红肿，可以先保持安静并隔布冷敷约 10 分钟，避免抓舔。若看见蜂刺，可用卡片边缘平刮，尽量不要挤压。出现面部或颈部明显肿胀、呼吸困难、反复呕吐、虚弱，或被多只昆虫蜇伤时，应立即联系急诊兽医。不要自行给人用抗过敏药，具体药物和剂量需由兽医根据体重、病史确认。` },
  { keys: ['吃药', '用药', '药物', '药'], text: pet => `给${pet.name}用药前，需要确认药名、浓度、体重、症状和既往疾病。很多人用药对宠物并不安全，我不能在缺少兽医评估时建议具体剂量。若已误食药物，请保留包装、记录大致时间和数量，并立即联系兽医或动物急诊。` },
  { keys: ['吃', '喂', '粮'], text: pet => `结合${pet.name} ${pet.weight}kg 的体重，建议把每日主粮分成 2～3 餐，并把零食控制在全天热量的 10% 内。最近若要换粮，记得用 7 天逐步替换法哦。` },
  { keys: ['水', '喝'], text: pet => {
    const weight = Number(pet.weight) || 0
    return `${pet.name}每天基础饮水量可按每公斤 50～60ml 粗略估算，也就是约 ${Math.round(weight * 50)}～${Math.round(weight * 60)}ml。天气热、运动后或吃干粮时还要适当增加。`
  } },
  { keys: ['拉', '便', '肚子'], text: pet => `可以先记录${pet.name}的精神、食欲、排便形态、颜色和持续时间。如果出现反复呕吐、红色或黑色便、明显没精神，或症状持续，请尽快联系兽医。你也可以在“日常”页记录本次排便，方便观察趋势。` },
  { keys: ['散步', '运动'], text: pet => `${pet.breed}的运动需要结合年龄和身体情况。建议每天分次温和散步；如果是柯基，要减少频繁爬楼和高处跳跃。炎热天气尽量安排在清晨或傍晚。` }
]

Page({
  data: { pet: {}, input: '', thinking: false, messages: [], scrollTo: '', quickQuestions: [] },
  onShow() {
    const pet = store.get('pet')
    this.setData({
      pet,
      messages: store.get('chats') || [],
      quickQuestions: [`${pet.name}今天应该喝多少水？`, '最近有点挑食怎么办？', `${pet.breed}每天散步多久合适？`, '被虫咬了怎么办，可以吃药吗？']
    })
    this.scrollBottom()
  },
  onInput(e) { this.setData({ input: e.detail.value }) },
  askQuick(e) { this.setData({ input: e.currentTarget.dataset.text }); this.send() },
  now() { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` },
  send() {
    const text = this.data.input.trim()
    if (!text || this.data.thinking) return
    const messages = [...this.data.messages, { id: Date.now(), role: 'user', text, time: this.now() }]
    this.setData({ messages, input: '', thinking: true })
    store.set('chats', messages)
    this.scrollBottom()
    setTimeout(() => {
      const found = replies.find(rule => rule.keys.some(key => text.includes(key)))
      const pet = store.get('pet')
      const answer = found ? found.text(pet) : `我记得${pet.name}是一只${pet.breed}，今年正是活泼的时候。这个问题可以结合它最近的食欲、精神和排便一起判断。你能再告诉我具体持续多久了吗？`
      const next = [...this.data.messages, { id: Date.now() + 1, role: 'ai', text: answer, time: this.now() }]
      this.setData({ messages: next, thinking: false })
      store.set('chats', next)
      this.scrollBottom()
    }, 700)
  },
  scrollBottom() { setTimeout(() => this.setData({ scrollTo: `msg-${Math.max(0, this.data.messages.length - 1)}` }), 50) },
  clearChat() {
    wx.showActionSheet({ itemList: ['清空聊天记录'], success: () => { store.set('chats', []); this.setData({ messages: [], scrollTo: '' }) } })
  }
})
