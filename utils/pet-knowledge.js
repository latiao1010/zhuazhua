const store = require('./store')
const supplement = require('./pet-knowledge-supplement')
const recommendations = require('./pet-recommendations')
const priceUtil = require('./pet-price')

let activeReplyMeta = null
let expertSystem = null

function getExpertSystem() {
  if (expertSystem) return expertSystem
  try {
    // 专家库较大，只在普通问题需要检索时加载，不能阻塞顾问页面首屏。
    expertSystem = require('./expert-system')
  } catch (error) {
    return null
  }
  return expertSystem
}

const DANGER_WORDS = ['呼吸困难', '喘不上', '一直喘', '持续喘', '喘得厉害', '抽搐', '昏迷', '站不稳', '休克', '中毒', '老鼠药', '血便', '黑便', '尿血', '持续呕吐', '一直吐', '高烧', '严重', '瘫痪']

const FOOD_UNSAFE = [
  { keys: ['巧克力', '可可'], risk: '可可碱风险，犬猫都不建议等待观察' },
  { keys: ['葡萄', '葡萄干'], risk: '可能导致犬急性肾损伤，少量也要谨慎' },
  { keys: ['洋葱', '大葱', '葱', '韭菜', '大蒜'], risk: '可能损伤红细胞，熟的也不安全' },
  { keys: ['木糖醇', '无糖口香糖'], risk: '可能导致低血糖和肝损伤' },
  { keys: ['酒', '酒精', '啤酒'], risk: '酒精对宠物有中毒风险' },
  { keys: ['咖啡', '茶', '奶茶'], risk: '咖啡因和糖分都不适合宠物' },
  { keys: ['老鼠药', '农药', '清洁剂'], risk: '属于急诊误食' },
  { keys: ['骨头', '熟骨头', '鸡骨头', '鸭骨头'], risk: '可能划伤、堵塞或造成便秘' },
  { keys: ['澳洲坚果', '夏威夷果'], risk: '可能引起无力、呕吐、发抖' },
  { keys: ['牛油果'], risk: '高脂且部分宠物可能肠胃不适' },
  { keys: ['生鸡蛋', '生肉', '生鱼'], risk: '有细菌和寄生虫风险，肠胃敏感宠物尤其不建议' },
  { keys: ['咸菜', '腊肉', '火腿肠', '香肠', '培根'], risk: '盐分、脂肪和添加剂偏高，容易肠胃不适或诱发胰腺问题' },
  { keys: ['辣椒', '麻辣', '火锅', '烧烤'], risk: '辛辣油腻刺激肠胃，不适合作为宠物食物' },
  { keys: ['蛋糕', '奶油', '糖果', '甜品'], risk: '糖和脂肪过高，部分还可能含巧克力或木糖醇' },
  { keys: ['坚果', '瓜子', '花生'], risk: '脂肪高且可能卡喉，调味坚果更不适合' },
  { keys: ['猫粮给狗', '狗粮给猫'], risk: '偶尔误吃问题不大，但长期互换会营养失衡' }
]

const FOOD_CAREFUL = [
  { keys: ['牛奶'], tip: '多数成年犬猫乳糖耐受一般，容易软便' },
  { keys: ['酸奶', '奶酪'], tip: '只能少量、原味、无糖无木糖醇' },
  { keys: ['鸡蛋'], tip: '建议熟蛋，少量尝试' },
  { keys: ['鸡胸肉', '牛肉', '鸭肉', '火鸡肉', '三文鱼', '鳕鱼'], tip: '清水煮熟、无盐无调味，不能替代完整主粮' },
  { keys: ['苹果', '香蕉', '蓝莓', '草莓', '梨', '西瓜'], tip: '去核去籽，少量当零食；西瓜要去籽且别给太多' },
  { keys: ['南瓜', '红薯', '紫薯', '胡萝卜', '西兰花', '黄瓜', '生菜', '豌豆'], tip: '熟制或洗净少量，肠胃敏感时先暂停' },
  { keys: ['米饭', '燕麦', '土豆'], tip: '只能作为少量临时补充，不能长期替代主粮' },
  { keys: ['羊奶', '宠物羊奶粉'], tip: '比牛奶更常见于宠物补充，但仍要按说明少量' }
]

const FOOD_BENEFICIAL = [
  { keys: ['鸡胸肉', '鸭肉', '牛肉', '鱼肉', '三文鱼', '鳕鱼'], benefit: '优质蛋白，适合清水煮熟后少量加餐或训练奖励' },
  { keys: ['南瓜'], benefit: '膳食纤维较友好，偶尔可帮助调整轻微软便或便秘，但不能替代治疗' },
  { keys: ['胡萝卜', '西兰花', '黄瓜'], benefit: '低脂蔬菜，适合少量补充口感和纤维' },
  { keys: ['蓝莓', '苹果', '草莓'], benefit: '少量水果可作低负担零食，注意去核去籽' },
  { keys: ['鸡蛋'], benefit: '熟蛋能补充蛋白和脂肪，但要少量，肠胃敏感先别给' },
  { keys: ['宠物益生菌', '益生菌'], benefit: '换粮、轻微软便时可按宠物产品说明短期辅助，但严重腹泻不能只靠益生菌' },
  { keys: ['鱼油'], benefit: '可能帮助皮肤毛发状态，但要按体重剂量，胰腺炎或腹泻时先问兽医' }
]

const FOOD_ALIASES = [
  '巧克力', '葡萄', '葡萄干', '洋葱', '大葱', '葱', '韭菜', '大蒜', '木糖醇', '口香糖', '酒', '咖啡', '茶', '奶茶',
  '老鼠药', '农药', '清洁剂', '骨头', '熟骨头', '鸡骨头', '鸭骨头', '澳洲坚果', '夏威夷果', '牛油果', '生肉',
  '火腿肠', '香肠', '培根', '辣椒', '火锅', '烧烤', '蛋糕', '奶油', '糖果', '坚果', '鸡胸肉', '鸭肉', '牛肉',
  '鱼肉', '三文鱼', '鳕鱼', '苹果', '香蕉', '蓝莓', '草莓', '梨', '西瓜', '南瓜', '红薯', '紫薯', '胡萝卜',
  '西兰花', '黄瓜', '生菜', '豌豆', '米饭', '燕麦', '土豆', '羊奶', '酸奶', '奶酪', '鸡蛋', '益生菌', '鱼油'
]

const GROOMING_GUIDES = {
  bath: {
    label: '洗澡',
    frequency: '多数犬可 2-4 周一次，猫通常不需要频繁洗；具体看皮肤、气味和医生建议',
    actions: ['洗前梳毛，水温温热不烫', '避开眼耳鼻，洗后彻底吹干腹部、脚趾缝、腋下', '皮肤红痒、腹泻、刚打疫苗或应激明显时先暂停']
  },
  dental: {
    label: '刷牙',
    frequency: '理想是每天或隔天，做不到也要固定训练',
    actions: ['先让它舔宠物牙膏，再碰嘴唇，最后短时间刷外侧牙面', '不要用人用牙膏', '口臭、牙龈红肿、松牙、牙结石多时看兽医']
  },
  nail: {
    label: '剪指甲',
    frequency: '通常 2-4 周看一次，听到走路哒哒响或指甲顶地就该修',
    actions: ['先摸爪奖励，让它适应被碰脚', '每次只剪尖端，黑色指甲更要保守', '剪到血线用止血粉或纱布按压']
  },
  ear: {
    label: '耳朵清洁',
    frequency: '不臭、不红、分泌物不多时不用天天清；垂耳、洗澡后、游泳后更要检查',
    actions: ['只清洁看得到的外耳，不要用棉签深捅', '保持干爽，洗澡后擦干外耳', '臭、疼、红、黑褐分泌物多要看兽医']
  },
  coat: {
    label: '梳毛',
    frequency: '短毛每周 2-3 次，长毛或换毛季建议每天简单梳',
    actions: ['顺毛轻梳，遇到毛结不要硬扯', '换毛季增加频率', '局部掉毛、红疹、皮屑多要排查皮肤问题']
  }
}

const SYMPTOM_GUIDES = [
  { keys: ['呕吐', '吐了', '一直吐'], title: '呕吐观察', mild: '偶尔一次、精神食欲正常可先观察并记录。', actions: ['先暂停零食和新食物', '少量多次给水，别一次灌很多', '反复呕吐、吐血、精神差、腹痛要就医'], urgent: '持续呕吐、吐血、精神差、腹痛、幼宠/老年宠呕吐都要更谨慎。' },
  { keys: ['腹泻', '拉稀', '水样便'], title: '腹泻处理', mild: '轻微一次软便可先观察，但水样便或次数多要重视。', actions: ['回忆是否换粮、零食、新食物或捡食', '保持饮水，记录颜色、次数、有没有血', '血便、黑便、水样多次、精神差要就医'], urgent: '血便、黑便、频繁水样腹泻、伴随呕吐或虚弱时不要拖。' },
  { keys: ['咳嗽', '打喷嚏', '流鼻涕'], title: '呼吸道观察', mild: '轻微喷嚏可观察环境刺激，但咳嗽频繁要记录。', actions: ['避免烟味、香薰、灰尘刺激', '记录咳嗽频率和是否运动后加重', '呼吸费力、舌头发紫、精神差立即就医'], urgent: '呼吸困难、喘不上、舌色异常属于急症。' },
  { keys: ['没精神', '精神差', '嗜睡'], title: '精神状态异常', mild: '精神差要结合食欲、饮水、体温、排便一起看。', actions: ['先看是否拒食、不喝水、呕吐腹泻或疼痛', '减少运动，保持安静观察', '持续半天以上明显异常或伴随其他症状建议就医'], urgent: '站不稳、昏迷、抽搐、呼吸异常要立即就医。' },
  { keys: ['皮肤痒', '掉毛', '红疹', '皮屑', '舔爪'], title: '皮肤不适', mild: '皮肤问题常和寄生虫、过敏、潮湿、洗护刺激有关。', actions: ['检查跳蚤蜱虫和局部红肿破皮', '近期先别频繁洗澡或乱涂人用药', '持续瘙痒、破皮、脱毛扩大建议看兽医'], urgent: '大面积红肿、化脓、疼痛明显或精神差要尽快就医。' },
  { keys: ['口臭', '牙结石', '牙龈红'], title: '口腔不适', mild: '口臭常见但不该被忽略，可能和牙结石、牙龈炎有关。', actions: ['从宠物牙膏适应开始训练刷牙', '观察是否流口水、拒食、单侧咀嚼', '牙龈出血、松牙、疼痛要就医'], urgent: '明显疼痛、拒食、面部肿胀要尽快检查。' }
]

const SCENARIO_PACKS = [
  {
    title: '家庭环境安全',
    icon: '🏠',
    keys: ['家里安全', '家庭安全', '电线', '插座', '阳台', '窗户防护', '垃圾桶', '清洁剂', '消毒液', '危险物'],
    verdict: '家庭安全的核心是把“能咬、能舔、能吞、能摔”的风险提前收起来。',
    basis: ['清洁剂、消毒液、药品、蟑螂药和老鼠药都要放到宠物打不开的位置', '电线、阳台、窗户、垃圾桶是最容易被忽略的高频风险点'],
    actions: ['电线加理线管或藏到家具后面，插座不用时遮挡', '阳台和窗户做防坠网，别只依赖纱窗', '垃圾桶加盖，药品、清洁剂、香薰精油、除虫用品统一上锁收纳'],
    warning: '如果已经舔到清洁剂、药物、杀虫剂，别等症状明显再处理，尽快联系兽医并带上包装信息。'
  },
  {
    title: '新宠到家适应',
    icon: '🧸',
    keys: ['新宠到家', '刚接回家', '到家第一天', '适应新家', '刚到家', '接回家'],
    verdict: '刚到家的前 7 天重点不是训练成果，而是安全感、规律作息和稳定肠胃。',
    basis: ['环境变化容易带来应激、软便、躲藏或夜里叫', '吃喝排便和精神状态比互动多少更重要'],
    actions: ['先固定一个安静区域，水、粮、厕所和窝不要频繁挪', '前 3-7 天别频繁洗澡、换粮、带去复杂环境', '每天短时间温和互动，愿意靠近再增加训练和社交'],
    warning: '幼宠出现持续呕吐、腹泻、拒食、低精神，要比成年宠更谨慎。'
  },
  {
    title: '定点如厕训练',
    icon: '🚽',
    keys: ['定点大小便', '尿垫训练', '厕所训练', '乱拉', '定点尿尿', '随地大小便'],
    verdict: '如厕训练靠“规律带去正确地点 + 当场奖励”，事后责骂通常效果很差。',
    basis: ['饭后、睡醒、玩耍后是最容易排泄的时间', '固定气味和固定路线能帮助建立习惯'],
    actions: ['饭后 5-20 分钟带到尿垫或厕所区域，成功后立刻奖励', '失误处用酶清洁剂去味，别用刺激气味掩盖', '连续 2 周稳定后再逐步扩大活动范围'],
    warning: '如果已经会定点却突然乱尿乱拉，要排查泌尿、腹泻、疼痛、发情或环境压力。'
  },
  {
    title: '猫砂盆与乱尿',
    icon: '🐱',
    keys: ['猫砂盆', '猫厕所', '猫砂', '乱尿', '尿床', '尿沙发', '不进猫砂盆'],
    verdict: '猫乱尿不一定是“报复”，更常见是厕所不合适、压力、泌尿不适或发情标记。',
    basis: ['猫砂盆数量建议至少猫数 +1', '尿频、尿血、频繁蹲盆属于泌尿风险信号'],
    actions: ['先增加一个开放式猫砂盆，放在安静且容易到达的位置', '每天清理结团，每 1-2 周彻底换砂并清洗盆', '记录尿量、尿团大小、蹲盆次数，异常时尽快看兽医'],
    warning: '公猫尿不出、频繁蹲盆、叫痛或尿血是急症，不要只当行为问题。'
  },
  {
    title: '牵引爆冲与召回',
    icon: '🦮',
    keys: ['爆冲', '牵引训练', '随行', '召回', '叫不回来', '不回家', '拉绳子', '牵引绳'],
    verdict: '牵引问题不要靠硬拽，核心是降低兴奋、奖励回头和练习松绳走。',
    basis: ['嗅闻、突然见狗见人、出门太兴奋都会触发爆冲', '柯基这类犬尤其要保护腰背，少用猛拉方式控制'],
    actions: ['出门前先在楼道或门口做 1-2 分钟坐下、看我、等一下', '绳子一紧就停下，回头或松绳后再继续走', '召回从室内低干扰开始，用高价值零食奖励“立刻回来”'],
    warning: '不要用会勒脖子的方式长期纠正爆冲，咳嗽、喘、腰背疼要暂停并检查。'
  },
  {
    title: '护食与资源守护',
    icon: '🍖',
    keys: ['护食', '护玩具', '护窝', '抢食', '资源守护', '吃饭咬人'],
    verdict: '护食不要靠抢走和惩罚压制，应该建立“人靠近会带来更好东西”的安全预期。',
    basis: ['护食常来自不安全感、过度竞争或曾经被抢夺', '强行拿走可能把低吼升级成咬人'],
    actions: ['先隔开喂食，别让人和其他宠物围观饭盆', '远距离丢更好吃的零食，逐步让靠近和奖励绑定', '练习“放下/交换”，用更高价值食物换玩具，不硬抢'],
    warning: '已经出现扑咬或儿童在场时，要先做物理隔离，并找行为医生或专业训导师介入。'
  },
  {
    title: '外出捡食',
    icon: '🧹',
    keys: ['捡食', '乱吃地上', '翻垃圾', '吃垃圾', '路上乱吃', '吃草吃土'],
    verdict: '捡食要同时做环境管理和“离开它/吐出来”训练，不能只靠喊。',
    basis: ['地面食物可能有骨头、竹签、药物、变质食物或毒饵', '翻垃圾也容易导致胰腺和肠胃问题'],
    actions: ['出门短牵引，提前绕开垃圾桶、餐饮区和草丛食物', '在家练“离开它”，看一眼不吃就奖励', '已经含住时用高价值零食交换，别追着抢导致吞更快'],
    warning: '吃到药物、毒饵、尖锐物、腐败食物，或出现呕吐腹痛没精神，要尽快就医。'
  },
  {
    title: '多宠相处',
    icon: '🐾',
    keys: ['多宠', '二胎', '新猫', '新狗', '两只狗', '两只猫', '打架', '合不来'],
    verdict: '多宠磨合要慢，不要一见面就放一起“自己解决”。',
    basis: ['气味交换、隔门观察、短时见面比直接同住更稳', '资源不足会放大冲突'],
    actions: ['先隔离 3-7 天，交换垫子和玩具熟悉气味', '食盆、水碗、厕所、窝和玩具都准备多份', '见面从牵引或隔栏短时开始，平静就奖励，紧张就分开'],
    warning: '已经出现咬伤、追堵、持续恐惧躲藏，要暂停合笼并重新做分阶段适应。'
  },
  {
    title: '猫狗混养',
    icon: '🐶',
    keys: ['猫狗混养', '猫狗一起', '狗追猫', '猫打狗', '猫狗打架'],
    verdict: '猫狗混养的关键是给猫垂直逃生空间，并教狗冷静看猫。',
    basis: ['狗追逐会强化捕猎游戏，猫没有退路会更紧张', '猫需要高处、隐蔽处和单独厕所'],
    actions: ['给猫准备猫爬架、高处平台和狗进不去的安全房间', '狗看到猫能安静坐下或转头，就立刻奖励', '最初见面保持牵引和短时间，别让狗追成功'],
    warning: '有扑咬、压制、持续追逐时不要无人看管同处。'
  },
  {
    title: '雨天室内活动',
    icon: '🌧️',
    keys: ['雨天', '下雨', '台风', '不能出门', '室内活动', '雨天散步'],
    verdict: '雨天不能出门时，可以用嗅闻、找食和基础训练补一部分运动消耗。',
    basis: ['脑力消耗对犬猫都很有效', '下雨天路滑、脚垫潮湿和雷声应激都要注意'],
    actions: ['做 3-5 轮找零食游戏，每轮 3-5 分钟', '练坐下、趴下、等待、召回，每次短一点', '出门回来擦干脚垫和腹部，观察有没有舔脚、发红'],
    warning: '雷雨天明显发抖、躲藏、喘，要优先安抚和降噪，不要硬拉出门。'
  },
  {
    title: '夏天散步防烫脚',
    icon: '☀️',
    keys: ['夏天散步', '柏油路', '烫脚', '地面太烫', '热天出门'],
    verdict: '夏天散步要看体感和地面温度，不是只看天气预报数字。',
    basis: ['短腿犬、幼宠、老年宠和短鼻犬更容易热应激', '柏油路和水泥地中午升温很快'],
    actions: ['用手背贴地 5 秒，烫手就别让宠物走', '选择清晨或傍晚，带水，减少奔跑和暴晒', '回家检查脚垫是否发红、起皮、疼痛'],
    warning: '持续喘、流口水、站不稳、体温高、呕吐，按中暑急症处理。'
  },
  {
    title: '冬天保暖',
    icon: '🧣',
    keys: ['保暖', '冬天', '天气冷', '怕冷', '穿衣服', '冷天出门'],
    verdict: '冬天不是所有宠物都必须穿衣，但幼宠、老年、短毛、小体型和术后宠更需要保暖。',
    basis: ['湿冷、风大和雨雪天会让体感温度明显下降', '穿衣不合适也可能限制活动或磨皮肤'],
    actions: ['出门前看耳尖、脚垫、发抖和是否抗拒行走', '衣服要合身不勒腋下，回家及时脱下保持皮肤干爽', '窝垫离开地面冷源，避免电热毯无人看管'],
    warning: '发抖不止、虚弱、体温偏低或老年宠突然不愿动，需要尽快检查。'
  },
  {
    title: '坐车晕车',
    icon: '🚗',
    keys: ['晕车', '坐车吐', '坐车流口水', '坐车紧张', '车上叫'],
    verdict: '晕车常和前庭刺激、空腹/过饱、焦虑有关，要从短距离适应开始。',
    basis: ['流口水、吞咽、哼叫、发抖、呕吐都是常见表现', '突然长途更容易失败'],
    actions: ['先从停着的车里吃零食、玩 1-3 分钟开始', '出行前别吃太饱，保持通风和平稳驾驶', '长途前咨询兽医是否需要晕车或抗焦虑方案'],
    warning: '不要自行喂人用晕车药；频繁呕吐、虚弱或幼宠脱水风险高。'
  },
  {
    title: '换粮过渡',
    icon: '🥣',
    keys: ['换粮过渡', '转粮', '新粮', '换主粮', '粮不适应'],
    verdict: '换粮要慢，尤其是肠胃敏感、幼宠、老年宠，不建议突然全换。',
    basis: ['突然换粮容易软便、呕吐、胀气或食欲波动', '过渡期间粪便状态是最重要反馈'],
    actions: ['用 7-10 天逐步过渡：旧粮多到新粮多', '软便时先退回上一步比例，稳定 2 天再继续', '同一阶段不要同时加很多新零食或罐头'],
    warning: '水样腹泻、血便、持续呕吐、没精神时停止试粮并就医。'
  },
  {
    title: '训练零食与奖励',
    icon: '🍪',
    keys: ['训练零食', '奖励', '零食怎么给', '零食给多少', '奖励零食'],
    verdict: '训练零食要小颗、低负担、算进全天热量，不能把训练变成加餐过量。',
    basis: ['零食过多会影响正餐和体重', '高价值奖励适合难动作，普通奖励适合日常巩固'],
    actions: ['把零食剪成豌豆大小，训练时少量多次', '当天训练零食多，正餐可以略减一点点', '优先选择单一成分、低盐、低脂的宠物零食'],
    warning: '胰腺炎史、肥胖或肠胃敏感宠，零食种类和量要更保守。'
  },
  {
    title: '基础口令训练',
    icon: '🎓',
    keys: ['坐下训练', '趴下训练', '握手训练', '基础训练', '口令训练', '等待训练'],
    verdict: '基础训练要短、开心、可重复，比一次练很久更有效。',
    basis: ['宠物注意力有限，幼宠尤其适合短时多轮', '统一口令和手势能减少混乱'],
    actions: ['每次 3-5 分钟，一天 2-4 轮即可', '动作刚做对就奖励，别等太久', '家里稳定后再换到门口、电梯、户外等高干扰环境'],
    warning: '训练中出现躲避、哈欠、舔鼻、转头，说明压力上来了，先降低难度。'
  },
  {
    title: '笼内与航空箱训练',
    icon: '📦',
    keys: ['笼内训练', '航空箱', '笼子训练', '进笼', '关笼叫'],
    verdict: '笼子和航空箱应该变成安全窝，不应该只在惩罚或去医院前出现。',
    basis: ['正向适应能减少出行、寄养和就医压力', '强塞进去会让恐惧变重'],
    actions: ['先开门放零食和垫子，让它自由进出', '能放松进去后再短时间关门，逐步延长', '笼内给咬胶或嗅闻垫，出来时保持平静'],
    warning: '明显恐慌、撞笼、流口水严重时先停止升级训练。'
  },
  {
    title: '毛球与吐毛',
    icon: '🧶',
    keys: ['毛球', '吐毛', '化毛', '猫草', '毛球症'],
    verdict: '偶尔吐毛球常见，但频繁呕吐、干呕吐不出或食欲下降不能只当毛球。',
    basis: ['长毛猫、换毛季、过度舔毛更容易毛球增多', '毛球也可能和皮肤痒、压力有关'],
    actions: ['增加梳毛频率，换毛季每天短梳', '化毛膏或猫草按产品说明少量使用', '同时观察便便、食欲和舔毛是否异常'],
    warning: '连续呕吐、腹痛、不排便、精神差或吐血，要尽快就医排查堵塞。'
  },
  {
    title: '肛门腺与蹭屁股',
    icon: '🍑',
    keys: ['肛门腺', '蹭屁股', '拖屁股', '屁股臭', '舔屁股'],
    verdict: '蹭屁股可能是肛门腺、寄生虫、皮肤刺激或软便导致，别只盯着一种原因。',
    basis: ['软便会影响肛门腺自然排出', '频繁舔咬可能造成局部发炎'],
    actions: ['先看便便是否长期偏软，必要时调整饮食和纤维', '检查尾根、肛周是否红肿、破皮、异味重', '不会操作时不要硬挤，交给宠物店或兽医处理更安全'],
    warning: '肛周肿包、疼痛、流脓、便血或坐立不安，要尽快看兽医。'
  },
  {
    title: '脚垫与趾间炎',
    icon: '🐾',
    keys: ['脚垫', '舔脚', '趾间炎', '脚臭', '爪子红', '脚趾红', '脚掌'],
    verdict: '舔脚和脚臭常见于潮湿、过敏、真菌细菌或异物刺激，需要先保持干爽并观察皮肤。',
    basis: ['雨天、洗澡后没吹干、草地刺激都可能诱发', '柯基短腿贴地，更容易沾湿腹部和脚垫'],
    actions: ['外出回家擦干脚垫和趾缝，不要长期湿着', '检查有没有草籽、伤口、红肿、破皮', '短期戴伊丽莎白圈防舔，同时预约检查病因'],
    warning: '破皮、出血、跛行、红肿扩散或持续舔咬，不建议只靠洗护用品硬扛。'
  },
  {
    title: '耳螨跳蚤蜱虫',
    icon: '🪲',
    keys: ['耳螨', '跳蚤', '蜱虫', '体外驱虫', '黑色耳垢', '抓痒', '身上有虫'],
    verdict: '寄生虫问题要按体重、年龄和产品说明处理，不能混用或随便加量。',
    basis: ['黑褐色耳垢、频繁甩头可能见于耳螨或耳炎', '跳蚤蜱虫可能带来皮肤炎和传播疾病'],
    actions: ['先确认驱虫产品适用犬猫、体重和年龄', '蜱虫不要硬拽，最好用工具完整取出或去医院处理', '家里垫子、窝、沙发缝也要清洁，避免反复感染'],
    warning: '幼宠、孕宠、病弱宠或已经皮肤破损，驱虫前先问兽医。'
  },
  {
    title: '换牙与口腔',
    icon: '🦷',
    keys: ['换牙', '乳牙', '双排牙', '磨牙', '咬家具', '牙齿松'],
    verdict: '换牙期咬东西正常，但要提供安全咀嚼物并观察双排牙。',
    basis: ['多数幼犬幼猫会经历乳牙替换', '硬度过高的骨头、鹿角可能伤牙'],
    actions: ['准备宠物专用磨牙玩具，避免电线、鞋子、家具成为目标', '每天短看口腔，有没有红肿、流血、异味', '双排牙持续不掉或影响咬合时咨询兽医'],
    warning: '牙龈严重红肿、拒食、脸肿、流脓或疼痛明显，不要只当换牙。'
  },
  {
    title: '眼睛分泌物',
    icon: '👀',
    keys: ['眼屎', '流泪', '泪痕', '眼睛红', '眯眼', '揉眼睛'],
    verdict: '眼屎和泪痕要看颜色、量和是否眯眼疼痛，不能乱滴人用眼药水。',
    basis: ['少量浅色分泌物可能和灰尘、毛发刺激有关', '黄绿色分泌物、眯眼、怕光更像病理问题'],
    actions: ['用无菌湿巾或生理盐水轻轻擦外侧分泌物', '修剪刺激眼睛的毛发，但别贴眼操作', '记录单眼还是双眼、颜色、是否抓挠'],
    warning: '眯眼、角膜发白、眼睛红肿、黄绿色分泌物或突然看不清，尽快就医。'
  },
  {
    title: '皮肤过敏与洗护产品',
    icon: '🫧',
    keys: ['沐浴露', '人用洗发水', '洗耳液', '皮肤过敏', '过敏', '消毒水擦', '药浴'],
    verdict: '皮肤问题不要频繁乱洗，洗护产品用错可能越洗越痒。',
    basis: ['人用洗发水、刺激性消毒水不适合长期用于宠物皮肤', '过敏、寄生虫、感染表现可能很像'],
    actions: ['先停掉新换的洗护用品和香薰环境刺激', '洗澡后彻底吹干腋下、腹股沟、趾缝', '持续红痒、脱毛、皮屑多时做皮肤检查再决定药浴'],
    warning: '大面积红肿、渗液、化脓、疼痛或精神差，别自行叠加药膏。'
  },
  {
    title: '补钙与营养品',
    icon: '💊',
    keys: ['补钙', '营养膏', '卵磷脂', '软骨素', '鱼油', '益生菌怎么吃', '保健品'],
    verdict: '营养品不是越多越好，先看主粮是否完整均衡，再看具体需求。',
    basis: ['乱补钙可能影响骨骼发育或造成负担', '鱼油、益生菌、软骨素也要按体重和状态选择'],
    actions: ['健康成年宠优先保证主粮、饮水和体重管理', '肠胃敏感可短期按说明使用宠物益生菌', '关节、皮肤、毛发问题先确认病因，再决定补充方向'],
    warning: '幼宠、肾病、胰腺炎、肝病或正在用药时，营养品先问兽医。'
  },
  {
    title: '年度体检计划',
    icon: '🩺',
    keys: ['体检', '年度体检', '健康检查', '生日检查', '多久体检', '检查项目'],
    verdict: '体检频率要结合年龄和既往问题，成年宠至少每年一次，老年宠建议更密。',
    basis: ['体重、牙口、皮肤、心肺、尿检和血检能提前发现很多问题', '老年宠变化常常先体现在饮水、尿量、体重和活动意愿'],
    actions: ['成年宠每年做基础体检、疫苗评估、驱虫计划复盘', '老年宠可每 6 个月看一次，重点查血常规、生化、尿检和影像', '把平时的饮水、食欲、体重、便便记录带给医生更有价值'],
    warning: '体重快速变化、喝水尿多、长期咳喘、疼痛或精神差，不用等年度体检。'
  },
  {
    title: '寄养与上门喂养',
    icon: '🏨',
    keys: ['寄养', '上门喂养', '宠物店寄养', '朋友代养', '出差没人管'],
    verdict: '寄养前要把吃喝、用药、过敏、性格和应急联系人写清楚。',
    basis: ['环境变化会导致应激、拒食、软便或逃跑风险', '熟悉物品和固定流程能降低压力'],
    actions: ['准备粮、药、牵引、猫砂/尿垫、疫苗记录和日常作息说明', '提前短时间试寄养或让上门人员熟悉路线', '要求每天反馈吃喝、排便、精神和照片'],
    warning: '胆小、病弱、术后、需要用药的宠物，不建议随意换环境寄养。'
  },
  {
    title: '节假日烟花鞭炮',
    icon: '🎆',
    keys: ['烟花', '鞭炮', '放炮', '过年害怕', '噪音害怕'],
    verdict: '烟花鞭炮应激要提前布置安全区，不要等它吓坏了再补救。',
    basis: ['突然巨响会导致躲藏、发抖、喘、乱跑甚至逃逸', '训斥会加重恐惧'],
    actions: ['提前关窗拉窗帘，开白噪音或电视降低突发声', '准备航空箱、窝、旧衣服和嗅闻玩具', '出门牵引检查牢固，项圈胸背和联系方式都确认好'],
    warning: '如果恐惧严重到撞门、失禁、持续喘或攻击，提前咨询兽医抗焦虑方案。'
  },
  {
    title: '独自在家安排',
    icon: '🕘',
    keys: ['独自在家', '白天在家', '上班怎么办', '自己在家', '独处多久'],
    verdict: '独处安排要让宠物有事做、有水喝、有安全空间，并逐步训练离开。',
    basis: ['突然长时间独处容易焦虑、拆家、吠叫或憋尿', '饭后、散步后更容易安静休息'],
    actions: ['上班前安排一次排泄和嗅闻活动', '准备饮水、漏食玩具、耐咬玩具和安全区域', '从短离开开始练，回家和出门都保持平静'],
    warning: '持续嚎叫、破坏门窗、自伤或极端焦虑，建议做行为干预。'
  },
  {
    title: '幼宠疫苗前社交',
    icon: '🌱',
    keys: ['疫苗没打完', '幼犬社交', '幼猫社交', '能不能出门社交', '没打完疫苗'],
    verdict: '疫苗没完成前也需要温和社交，但要避开高感染风险环境。',
    basis: ['幼年期社会化窗口很宝贵', '未免疫完整时不适合接触陌生犬群和不洁地面'],
    actions: ['可以抱着或推车看人车声音，短时间低压力接触', '邀请健康、免疫明确的熟悉宠物短时见面', '地面复杂、公园犬群、宠物店地面先避开'],
    warning: '未免疫幼宠出现呕吐、腹泻、低精神或拒食，要尽快就医。'
  },
  {
    title: '老年关节与爬楼',
    icon: '🦴',
    keys: ['关节', '爬楼', '跳沙发', '腰背', '后腿无力', '跛行'],
    verdict: '关节和腰背问题要减少冲击，尤其是短腿犬、老年宠和体重偏高宠。',
    basis: ['爬楼、跳上跳下、急停急转都会增加腰背和关节压力', '体重管理会直接影响关节负担'],
    actions: ['加防滑垫、坡道或台阶，减少跳沙发跳床', '散步改成多次短距离，先热身再活动', '记录跛行、疼痛、起身困难和运动后恢复时间'],
    warning: '突然后腿无力、拖行、明显疼痛或大小便异常，尽快急诊排查神经问题。'
  },
  {
    title: '挑食与拒食',
    icon: '🍽️',
    keys: ['挑食', '不吃粮', '拒食', '只吃零食', '不吃狗粮', '不吃猫粮'],
    verdict: '挑食先分清“有食欲但挑”和“身体不舒服不想吃”。',
    basis: ['零食多、频繁换粮、喂人食会强化挑食', '疼痛、发热、肠胃不适也会导致拒食'],
    actions: ['固定开饭时间，15-20 分钟没吃就收走，减少零食干扰', '不要频繁用罐头和人食补偿每次不吃', '同时观察精神、呕吐、腹泻、口腔疼痛和饮水'],
    warning: '猫超过 24 小时明显不吃、幼宠拒食、或伴随没精神呕吐腹泻，要尽快看兽医。'
  }
]

const SCENARIO_FIRST_TITLES = [
  '家庭环境安全',
  '新宠到家适应',
  '定点如厕训练',
  '猫砂盆与乱尿',
  '牵引爆冲与召回',
  '护食与资源守护',
  '外出捡食',
  '多宠相处',
  '猫狗混养',
  '雨天室内活动',
  '夏天散步防烫脚',
  '冬天保暖',
  '坐车晕车',
  '换粮过渡',
  '训练零食与奖励',
  '基础口令训练',
  '笼内与航空箱训练',
  '毛球与吐毛',
  '肛门腺与蹭屁股',
  '脚垫与趾间炎',
  '耳螨跳蚤蜱虫',
  '换牙与口腔',
  '眼睛分泌物',
  '皮肤过敏与洗护产品',
  '补钙与营养品',
  '年度体检计划',
  '节假日烟花鞭炮',
  '独自在家安排',
  '幼宠疫苗前社交',
  '老年关节与爬楼',
  '挑食与拒食'
]

const SCENARIO_DETAIL_EXTRAS = {
  '家庭环境安全': {
    check: ['把宠物高度能碰到的地方扫一遍：桌面、床头柜、垃圾桶、阳台、窗台、厨房地面', '重点找四类东西：小而能吞的、尖锐的、有毒的、会缠绕的'],
    routine: ['把药品、清洁剂、杀虫剂、香薰精油统一放进柜子', '电线做理线，垃圾桶加盖，厨房和阳台尽量设置门槛或围栏'],
    record: ['记录它最爱翻的位置、最常咬的东西、独自在家时容易出问题的时间段']
  },
  '新宠到家适应': {
    check: ['先看吃喝、排便、睡眠和是否愿意探索，不要急着判断“亲不亲人”', '到家前三天减少访客、洗澡、换粮、外出和高强度互动'],
    routine: ['固定喂食、饮水、厕所、睡觉区域，让它知道家里规则是稳定的', '每天短时间叫名字、给奖励、轻柔触碰，愿意靠近再升级互动'],
    record: ['记录每天食量、饮水、便便形态、躲藏时长、夜里叫不叫']
  },
  '定点如厕训练': {
    check: ['先判断是不是不会定点，还是原本会但突然失误；突然失误要先排查身体和压力', '饭后、睡醒、玩完、喝水后是最容易排泄的窗口'],
    routine: ['在高概率时间带去固定厕所，成功后 2 秒内奖励', '失误不要骂，安静清理并用酶清洁剂去味'],
    record: ['记录排泄时间、地点、成功/失败次数，连续 7-14 天看趋势']
  },
  '猫砂盆与乱尿': {
    check: ['先数猫砂盆够不够、干不干净、位置吵不吵、猫进出是否方便', '再看尿团大小、蹲盆次数、有没有叫痛和舔尿道'],
    routine: ['猫砂盆建议猫数 +1，分开放，别都挤在同一角落', '每天铲砂，定期整盆换砂，尽量别频繁更换砂型'],
    record: ['记录尿团数量和大小、乱尿地点、是否只尿软物/床/沙发']
  },
  '牵引爆冲与召回': {
    check: ['判断爆冲发生在见狗、见人、闻味、出门前还是回家路上', '先降低环境难度，不要一上来就在最兴奋的场景硬练'],
    routine: ['松绳才前进，绳子紧就停；回头看你就奖励', '召回从室内开始练，再到楼道、小区安静处、户外高干扰处'],
    record: ['记录触发点、距离多远开始爆冲、哪种奖励能让它回头']
  },
  '护食与资源守护': {
    check: ['分清是护饭盆、护零食、护玩具、护窝，还是对其他宠物资源竞争', '如果已经咬人，先停止近距离训练，先做隔离管理'],
    routine: ['人靠近时丢更好吃的，不抢、不吓、不强行掰嘴', '练“交换”：用更高价值奖励换回玩具或咬胶'],
    record: ['记录护什么、对谁护、低吼距离、有没有升级到扑咬']
  },
  '外出捡食': {
    check: ['先看它捡的是食物、纸巾、骨头、草土，还是特定地点垃圾', '捡食频繁也要看是不是运动不足、嗅闻不足或饥饿感太强'],
    routine: ['走垃圾桶和餐饮区附近缩短牵引，提前绕开诱惑', '在家练“离开它”和“吐出来”，成功就换高价值奖励'],
    record: ['记录捡食地点、类型、是否吞下、之后有没有呕吐腹泻']
  },
  '多宠相处': {
    check: ['先看冲突是追逐、抢资源、堵路、打架，还是一方一直躲', '资源不够、空间太小、直接见面太快，都会放大矛盾'],
    routine: ['先隔离熟悉气味，再隔门见面，再短时同处', '食盆、水碗、厕所、窝和玩具都多准备，减少竞争'],
    record: ['记录冲突发生在吃饭、睡觉、主人回家、玩具出现还是空间交汇处']
  },
  '猫狗混养': {
    check: ['先判断狗是好奇闻、兴奋追、还是捕猎式盯视；猫是躲避、哈气还是主动攻击', '猫必须有狗到不了的高处和安全房间'],
    routine: ['狗看到猫能冷静，就奖励；一追就中断，不让追逐成功', '猫的厕所、粮水放到狗够不到的地方'],
    record: ['记录狗看到猫后的距离、反应强度、猫是否敢出来活动']
  },
  '雨天室内活动': {
    check: ['先看是不能出门，还是可以短出门但需要避雨避雷', '雨天重点补嗅闻和脑力，不追求跑累'],
    routine: ['找零食、嗅闻垫、藏玩具、基础口令轮流做', '短腿犬雨后要擦干腹部、脚垫、趾缝'],
    record: ['记录室内活动轮数、排便是否受影响、雨后有没有舔脚']
  },
  '夏天散步防烫脚': {
    check: ['出门前用手背贴地 5 秒，烫手就不适合走', '看喘息恢复速度、舌色、精神和是否主动找阴凉'],
    routine: ['改成清晨/傍晚，带水，选择草地或阴凉路段', '回家检查脚垫有没有发红、起泡、脱皮'],
    record: ['记录出门时间、温度体感、走了多久、喘多久恢复']
  },
  '冬天保暖': {
    check: ['看是否发抖、缩成团、不愿走、耳尖脚垫冰冷', '短毛、小体型、幼宠、老年宠、术后宠更要保暖'],
    routine: ['衣服要合身，别磨腋下；回家脱下，避免闷湿', '窝垫远离冷地面，雨雪天回家擦干'],
    record: ['记录冷天出门时长、是否发抖、穿衣后皮肤有没有摩擦红']
  },
  '坐车晕车': {
    check: ['看是晕车还是坐车焦虑：流口水、吞咽、发抖、叫、吐分别记录', '长途前不要第一次才练车'],
    routine: ['从停在车里吃零食开始，再短距离 3-5 分钟适应', '出行前别吃太饱，车内通风，避免急刹急转'],
    record: ['记录上车多久开始流口水/叫/吐、空腹还是饭后、路程多久']
  },
  '换粮过渡': {
    check: ['先确认换粮原因：挑食、过敏、软便、减肥、年龄阶段变化', '肠胃敏感不要同时换粮、换零食、加罐头'],
    routine: ['7-10 天过渡：旧粮 75%→50%→25%→新粮 100%', '软便就退回上一步比例，稳定后再推进'],
    record: ['记录每天新粮比例、便便形态、呕吐、放屁、抓痒情况']
  },
  '训练零食与奖励': {
    check: ['先看训练目标难不难、环境干扰高不高，再决定奖励价值', '零食多的日子要把正餐稍微纳入总量考虑'],
    routine: ['奖励切小粒，动作刚对就给，保持节奏快', '简单动作普通零食，难场景用高价值奖励'],
    record: ['记录哪种奖励最有效、训练时长、当天零食是否影响正餐']
  },
  '基础口令训练': {
    check: ['先选一个口令练到稳定，再加新口令，不要全家人说法不一样', '训练环境从低干扰开始，不要直接户外开练'],
    routine: ['每次 3-5 分钟，一天多轮，成功率高时结束', '用手势引导，做对立刻标记和奖励，再逐步减少引导'],
    record: ['记录哪个口令成功率高、在哪个环境失效、是否需要零食才能做']
  },
  '笼内与航空箱训练': {
    check: ['先看它是抗拒进笼、关门就叫，还是已经有恐慌表现', '航空箱大小要能站起、转身、趴下'],
    routine: ['先开门放零食和垫子，让它自己进去探索', '再练短时间关门，逐步延长，不把笼子当惩罚'],
    record: ['记录能安静待多久、关门后是否抓门叫、哪种垫子或咬胶能帮助放松']
  },
  '毛球与吐毛': {
    check: ['先区分吐毛球、吐食物、吐黄水、干呕吐不出', '频繁吐不一定都是毛球，也可能是肠胃或异物问题'],
    routine: ['换毛季增加梳毛，长毛猫每天短梳', '化毛膏、猫草按说明少量用，别过量'],
    record: ['记录吐的频率、内容物、食欲、便便和舔毛是否增加']
  },
  '肛门腺与蹭屁股': {
    check: ['看是偶尔蹭一下，还是频繁拖地、舔屁股、肛周红肿', '长期软便会影响肛门腺自然排出'],
    routine: ['先把便便调到稳定成形，别频繁乱挤', '不会挤肛门腺就交给兽医或靠谱美容师'],
    record: ['记录蹭屁股频率、便便形态、肛周气味、是否疼痛']
  },
  '脚垫与趾间炎': {
    check: ['先检查趾缝有没有红、湿、臭、破皮、异物和跛行', '雨天、草地、洗澡后没吹干都容易诱发'],
    routine: ['外出回家擦干趾缝，保持干爽', '短期防舔，别让它越舔越湿越痒'],
    record: ['记录舔脚发生时间、哪只脚、是否和雨天/草地/新清洁剂有关']
  },
  '耳螨跳蚤蜱虫': {
    check: ['耳朵看黑褐色耳垢、臭味、甩头；皮肤看黑点、抓痒、虫体', '驱虫药必须确认犬猫、体重、年龄适用'],
    routine: ['按周期做体外驱虫，窝垫和家里缝隙一起清洁', '蜱虫不要徒手硬拽，尽量完整取出'],
    record: ['记录上次驱虫日期、产品名、抓痒位置、是否同住宠物也有症状']
  },
  '换牙与口腔': {
    check: ['看年龄是否处于换牙期，牙龈是否红肿、有没有双排牙', '咬家具可能是换牙，也可能是无聊和缺少咀嚼出口'],
    routine: ['提供安全磨牙玩具，收好电线鞋子', '每天轻看口腔，逐步适应刷牙触碰'],
    record: ['记录掉牙时间、口臭、牙龈红肿、是否单侧咀嚼']
  },
  '眼睛分泌物': {
    check: ['看分泌物颜色、量、单眼还是双眼、有没有眯眼怕光', '眯眼和揉眼比普通眼屎更需要重视'],
    routine: ['用宠物湿巾或生理盐水擦外侧，不乱滴人用眼药水', '修剪刺激眼睛的毛，但别贴眼操作'],
    record: ['记录分泌物颜色、出现时间、是否伴随打喷嚏或抓脸']
  },
  '皮肤过敏与洗护产品': {
    check: ['先回忆最近是否换了沐浴露、洗衣液、消毒水、粮、零食或环境', '红痒脱毛可能是过敏，也可能是寄生虫或感染'],
    routine: ['停掉可疑新用品，洗澡后彻底吹干', '不要同时叠加多种药膏，避免掩盖症状'],
    record: ['记录红痒位置、扩散速度、洗护产品、饮食变化和驱虫日期']
  },
  '补钙与营养品': {
    check: ['先看主粮是否完整均衡、年龄阶段是否特殊、有没有疾病史', '健康宠物不是所有营养品都需要长期吃'],
    routine: ['益生菌偏短期辅助，鱼油按体重剂量，补钙不要随意叠加', '皮肤、关节、肠胃问题先找原因，再决定补充方向'],
    record: ['记录产品名、剂量、开始日期、便便/皮肤/食欲变化']
  },
  '年度体检计划': {
    check: ['成年宠看年度基础体检，老年宠看半年复查', '体重、饮水、尿量、牙口和活动意愿是日常早期信号'],
    routine: ['体检前整理近 1-2 个月吃喝拉撒、体重、用药和护理记录', '老年宠优先关注血检、尿检、牙口、心肺、关节'],
    record: ['记录检查日期、异常指标、医生建议、下次复查时间']
  },
  '寄养与上门喂养': {
    check: ['先判断适合寄养还是上门：胆小、病弱、术后、猫咪通常更适合熟悉环境', '确认照护人是否能处理喂药、牵引、异常反馈'],
    routine: ['写清楚粮量、喂食时间、禁食清单、散步方式、应急医院和联系人', '每天要求反馈照片、食量、饮水、便便和精神'],
    record: ['记录交接清单、照护人反馈、异常发生时间和处理结果']
  },
  '节假日烟花鞭炮': {
    check: ['看它是躲藏、发抖、喘、流口水，还是会冲门逃跑', '噪音应激要提前准备，不要事发时才找办法'],
    routine: ['关窗拉帘，开白噪音，准备安全窝和嗅闻玩具', '出门牵引双重确认，门口防止受惊冲出'],
    record: ['记录最害怕的声音、持续多久恢复、哪些安抚方式有效']
  },
  '独自在家安排': {
    check: ['先看能独处多久不叫、不拆、不自伤、不乱尿', '上班前是否已经排泄和消耗精力很关键'],
    routine: ['出门前安排散步/逗猫和厕所，留水、漏食玩具、安全咬胶', '离开和回家都保持平静，逐步延长独处时间'],
    record: ['记录独处时长、监控里叫多久、是否拆家、是否影响吃喝排便']
  },
  '幼宠疫苗前社交': {
    check: ['先确认疫苗进度、年龄、驱虫情况和当地传染病风险', '社交不等于直接去犬群和脏地面玩'],
    routine: ['可以抱着看人车声音、接触健康且免疫明确的熟悉宠', '避免宠物店地面、公园犬群、不明排泄物区域'],
    record: ['记录接触对象、环境、回家后精神食欲和便便']
  },
  '老年关节与爬楼': {
    check: ['看起身困难、跛行、后腿无力、跳跃犹豫、运动后第二天变差', '短腿犬和体重偏高宠更要保护腰背'],
    routine: ['加防滑垫和坡道，减少跳床跳沙发和频繁爬楼', '散步多次短距离，控制体重，避免急停急转'],
    record: ['记录疼痛表现、跛行侧、运动量、体重变化和恢复时间']
  },
  '挑食与拒食': {
    check: ['先分清是挑食还是没食欲：愿不愿吃零食、精神怎样、有没有呕吐腹泻', '猫和幼宠拒食更需要谨慎'],
    routine: ['固定饭点，15-20 分钟不吃就收走，减少人食和零食补偿', '不要每天换更香的东西哄吃，否则会强化挑食'],
    record: ['记录吃了多少、拒食多久、零食量、精神、便便和口腔疼痛迹象']
  }
}

const CARE_LABELS = {
  deworming: '驱虫',
  medicine: '用药',
  vaccine: '疫苗',
  bath: '洗澡',
  dental: '刷牙',
  nail: '剪指甲'
}

// 护理不是一个笼统的意图。问“下次疫苗”时，只能读取疫苗这一项，
// 不能因为刷牙更临近，就把刷牙提醒当作答案。
const CARE_QUERY_META = {
  vaccine: { label: '疫苗', cycleKey: 'vaccineCycle', lastKey: 'vaccineLast', unit: '个月', title: '💉 疫苗提醒' },
  deworming: { label: '驱虫', cycleKey: 'dewormingCycle', lastKey: 'dewormingLast', unit: '个月', title: '🪱 驱虫提醒' },
  bath: { label: '洗澡', cycleKey: 'bathCycle', lastKey: 'bathLast', unit: '天', title: '🛁 洗澡提醒' },
  dental: { label: '刷牙', cycleKey: 'dentalCycle', lastKey: 'dentalLast', unit: '天', title: '🦷 刷牙提醒' },
  nail: { label: '剪指甲', cycleKey: 'nailCycle', lastKey: 'nailLast', unit: '天', title: '✂️ 剪指甲提醒' },
  medicine: { label: '用药', cycleKey: 'medicineCycle', lastKey: 'medicineLast', unit: '天', title: '💊 用药提醒' }
}

function number(value) {
  const result = Number(String(value === undefined || value === null ? '' : value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(result) ? result : 0
}

function sum(records, key) {
  return (records || []).reduce((total, item) => total + number(item && item[key]), 0)
}

function getRecords(key) {
  try {
    const value = store.get(key)
    return Array.isArray(value) ? value : []
  } catch (error) {
    return []
  }
}

function safeGet(key, fallback) {
  try {
    const value = store.get(key)
    return value === undefined || value === null || value === '' ? fallback : value
  } catch (error) {
    return fallback
  }
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dayKeys(count) {
  const today = store.todayKey()
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(`${today}T00:00:00`)
    date.setDate(date.getDate() - index)
    return dateKey(date)
  })
}

function dayKeysFrom(startOffset, count) {
  const today = store.todayKey()
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(`${today}T00:00:00`)
    date.setDate(date.getDate() - startOffset - index)
    return dateKey(date)
  })
}

function totalOnDay(records, key, day) {
  return Math.round((records || [])
    .filter(item => item && item.dayKey === day)
    .reduce((total, item) => total + number(item[key]), 0))
}

function averageWindow(records, key, startOffset, days = 7) {
  const keys = dayKeysFrom(startOffset, days)
  const totals = groupTotals(records, key)
  return Math.round(keys.reduce((total, day) => total + (totals[day] || 0), 0) / days)
}

function countWindow(records, startOffset, days = 7, predicate = () => true) {
  const keys = new Set(dayKeysFrom(startOffset, days))
  return (records || []).filter(item => item && keys.has(item.dayKey) && predicate(item)).length
}

function daysBetween(targetDay) {
  if (!targetDay) return 999
  const today = new Date(`${store.todayKey()}T00:00:00`)
  const target = new Date(`${targetDay}T00:00:00`)
  if (Number.isNaN(target.getTime())) return 999
  return Math.round((target - today) / 86400000)
}

function ageMonths(birthday) {
  const date = new Date(`${String(birthday || '')}T00:00:00`)
  if (Number.isNaN(date.getTime())) return 0
  const now = new Date()
  let months = (now.getFullYear() - date.getFullYear()) * 12 + now.getMonth() - date.getMonth()
  if (now.getDate() < date.getDate()) months -= 1
  return Math.max(0, months)
}

function ageText(birthday) {
  const months = ageMonths(birthday)
  if (!months) return '年龄未记录'
  if (months < 12) return `${months}个月`
  const years = Math.floor(months / 12)
  const restMonths = months % 12
  return restMonths ? `${years}岁${restMonths}个月` : `${years}岁`
}

function lifeStage(months) {
  if (!months) return 'unknown'
  if (months < 12) return 'puppy'
  if (months >= 96) return 'senior'
  return 'adult'
}

function groupTotals(records, key) {
  return (records || []).reduce((totals, item) => {
    const day = item && item.dayKey
    if (!day) return totals
    totals[day] = (totals[day] || 0) + number(item[key])
    return totals
  }, {})
}

function averageDaily(records, key, days = 7) {
  const keys = dayKeys(days)
  const totals = groupTotals(records, key)
  return Math.round(keys.reduce((total, day) => total + (totals[day] || 0), 0) / days)
}

function countDaysWith(records, days = 7) {
  const keys = new Set(dayKeys(days))
  return new Set((records || []).filter(item => item && keys.has(item.dayKey)).map(item => item.dayKey)).size
}

function lastRecord(records, field) {
  return (records || [])
    .filter(item => item && item[field])
    .sort((a, b) => String(b.dayKey || '').localeCompare(String(a.dayKey || '')) || String(b.time || '').localeCompare(String(a.time || '')))[0]
}

function normalizeText(value) {
  return String(value || '').trim()
}

function buildPetContext(pet = {}) {
  const today = store.todayKey()
  const feedsAll = getRecords('feeds')
  const watersAll = getRecords('waters')
  const walksAll = getRecords('walks')
  const stoolsAll = getRecords('stools')
  const careRecords = getRecords('careRecords')
  const recentKeySet = new Set(dayKeys(7))
  const feeds = feedsAll.filter(item => item && item.dayKey === today)
  const waters = watersAll.filter(item => item && item.dayKey === today)
  const walks = walksAll.filter(item => item && item.dayKey === today)
  const stools = stoolsAll.filter(item => item && item.dayKey === today)
  const recentFeeds = feedsAll.filter(item => item && recentKeySet.has(item.dayKey))
  const recentWaters = watersAll.filter(item => item && recentKeySet.has(item.dayKey))
  const recentWalks = walksAll.filter(item => item && recentKeySet.has(item.dayKey))
  const recentStools = stoolsAll.filter(item => item && recentKeySet.has(item.dayKey))
  const recentWeights = getRecords('weightRecords')
    .filter(item => item && item.dayKey && number(item.weight) > 0)
    .sort((a, b) => String(b.dayKey).localeCompare(String(a.dayKey)) || number(b.createdAt) - number(a.createdAt))
    .slice(0, 8)
    .map(item => ({ date: item.dayKey, weightKg: number(item.weight) }))
  const weight = number(pet.weight)
  const feedGoal = number(safeGet('feedGoal', 0))
  const waterGoal = number(safeGet('waterGoal', 0)) || (weight ? Math.round(weight * 55) : 0)
  const todayFeed = Math.round(sum(feeds, 'amount'))
  const todayWater = Math.round(sum(waters, 'amount'))
  const todayWalk = Math.round(sum(walks, 'duration'))
  const abnormalStools = stools.filter(item => item.abnormal).length
  const recentAbnormalStools = recentStools.filter(item => item.abnormal).length
  const age = ageMonths(pet.birthday)
  const trend = recentWeights.length >= 2
    ? {
      latestKg: recentWeights[0].weightKg,
      previousKg: recentWeights[1].weightKg,
      deltaKg: Number((recentWeights[0].weightKg - recentWeights[1].weightKg).toFixed(1)),
      recordsCount: recentWeights.length
    }
    : { latestKg: weight, previousKg: 0, deltaKg: 0, recordsCount: recentWeights.length }

  return {
    name: normalizeText(pet.name) || '宝贝',
    breed: normalizeText(pet.breed) || '宠物',
    sex: normalizeText(pet.sex),
    birthday: normalizeText(pet.birthday),
    ageMonths: age,
    ageText: ageText(pet.birthday),
    stage: lifeStage(age),
    weight,
    today: {
      date: today,
      feed: { count: feeds.length, totalGrams: todayFeed, targetGrams: Math.round(feedGoal), ratio: feedGoal ? todayFeed / feedGoal : 0, records: feeds },
      water: { count: waters.length, totalMl: todayWater, targetMl: Math.round(waterGoal), ratio: waterGoal ? todayWater / waterGoal : 0, records: waters },
      walk: { count: walks.length, totalMinutes: todayWalk, totalKm: Number(sum(walks, 'distance').toFixed(1)), records: walks },
      stool: { count: stools.length, abnormalCount: abnormalStools, records: stools }
    },
    recentSevenDays: {
      feedAverageGrams: averageDaily(recentFeeds, 'amount', 7),
      waterAverageMl: averageDaily(recentWaters, 'amount', 7),
      walkAverageMinutes: averageDaily(recentWalks, 'duration', 7),
      feedDays: countDaysWith(recentFeeds),
      waterDays: countDaysWith(recentWaters),
      walkDays: countDaysWith(recentWalks),
      abnormalStools: recentAbnormalStools
    },
    recentWeights,
    weightTrend: trend,
    care: safeGet('care', {}),
    careRecords,
    supplies: safeGet('supplies', {}),
    lastFeed: lastRecord(feedsAll, 'amount'),
    lastWater: lastRecord(watersAll, 'amount'),
    lastWalk: lastRecord(walksAll, 'duration'),
    lastStool: lastRecord(stoolsAll, 'condition'),
    allRecords: { feeds: feedsAll, waters: watersAll, walks: walksAll, stools: stoolsAll }
  }
}

function profileText(ctx) {
  const weight = ctx.weight ? `${ctx.weight}kg` : '体重未记录'
  return `${ctx.name}，${ctx.ageText}，${ctx.breed}，${weight}`
}

function percent(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.round(value * 100))
}

function trendWord(delta) {
  if (delta > 0.2) return `比上次重 ${delta}kg，属于上升趋势`
  if (delta < -0.2) return `比上次轻 ${Math.abs(delta)}kg，属于下降趋势`
  return '和上次基本持平'
}

function stageAdvice(ctx) {
  if (ctx.stage === 'puppy') return '还没完全成年，饮食和运动要更稳定，避免突然加量。'
  if (ctx.stage === 'senior') return '年纪偏大时更要看关节、牙口、饮水、体重和恢复速度。'
  return '成年阶段重点是规律饮食、稳定体重、足量饮水和持续运动。'
}

function breedAdvice(ctx) {
  if (/柯基|corgi/i.test(ctx.breed)) return '柯基要少爬楼、少跳高，注意腰背和关节。'
  if (/泰迪|贵宾|poodle/i.test(ctx.breed)) return '贵宾类要注意牙结石、耳道和髌骨问题。'
  if (/英短|美短|猫|布偶|暹罗/.test(ctx.breed)) return '猫咪尤其要关注饮水、尿量、毛球和应激。'
  return '不同品种风险不同，先按体重、年龄和当天记录做基础判断。'
}

function seasonAdvice() {
  const month = new Date(`${store.todayKey()}T00:00:00`).getMonth() + 1
  if ([6, 7, 8].includes(month)) return '现在偏夏季，重点防中暑、补水，散步尽量放清晨或傍晚。'
  if ([11, 12, 1, 2].includes(month)) return '天气偏冷时，洗澡后要彻底吹干，老年或短毛宠物注意保暖。'
  if ([3, 4, 5].includes(month)) return '春季外出增多，留意跳蚤蜱虫、花粉刺激和驱虫计划。'
  return '换季时肠胃和皮肤容易波动，新食物、洗护和运动强度都别突然变化。'
}

function riskLine(ctx, question) {
  const text = String(question || '')
  const matchedDanger = DANGER_WORDS.find(word => text.includes(word))
  if (matchedDanger) return `⚠️ 你提到“${matchedDanger}”，这类情况不要只靠观察：请尽快联系兽医或动物急诊，并带上误食物/药物包装、时间和大概数量。`
  if (ctx.today.stool.abnormalCount >= 2 || ctx.recentSevenDays.abnormalStools >= 3) {
    return `⚠️ ${ctx.name}近期排便异常记录偏多，如果同时有呕吐、精神差、拒食、血便或黑便，建议尽快就医。`
  }
  return ''
}

function percentText(value) {
  if (!Number.isFinite(value)) return '0%'
  return `${Math.max(0, Math.round(value * 100))}%`
}

function safeJoin(parts) {
  return parts.filter(Boolean).join('；')
}

function careDueHints(ctx) {
  const care = ctx && ctx.care ? ctx.care : {}
  const labels = {
    deworming: '驱虫',
    medicine: '用药',
    vaccine: '疫苗',
    bath: '洗澡',
    dental: '刷牙',
    nail: '剪指甲'
  }
  return Object.keys(labels).map(key => {
    const day = care[key]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) return ''
    const left = daysBetween(day)
    if (left < 0) return `${labels[key]}已逾期 ${Math.abs(left)} 天`
    if (left <= 7) return `${labels[key]}还有 ${left} 天`
    return ''
  }).filter(Boolean).slice(0, 2)
}

function topicOf(text) {
  const value = String(text || '')
  if (/吐|呕吐/.test(value)) return 'vomit'
  if (/拉稀|腹泻|软便|便便|排便/.test(value)) return 'stool'
  if (/喝水|喝.*水|饮水|水量|补水|尿|喝了|喝多少|喝够|喝得多|喝的多/.test(value)) return 'water'
  if (/喂食|饮食|吃饭|吃的多|吃得多|吃了多少|食量|食欲|挑食|粮|零食/.test(value)) return 'feed'
  if (/散步|运动|活动|出门/.test(value)) return 'walk'
  if (/体重|胖|瘦|减肥/.test(value)) return 'weight'
  if (/疫苗|驱虫|洗澡|刷牙|剪指甲|护理|用药/.test(value)) return 'care'
  return 'general'
}

function personalizedNotes(ctx, question) {
  if (!ctx || !ctx.today) return []
  const topic = topicOf(question)
  const notes = []
  const feed = ctx.today.feed || {}
  const water = ctx.today.water || {}
  const walk = ctx.today.walk || {}
  const stool = ctx.today.stool || {}

  if (topic === 'vomit') {
    if ((water.totalMl || 0) === 0) {
      notes.push(`我看${ctx.name}今天还没记到饮水，呕吐时先别一次喂太多水，少量多次更稳；如果喝水也吐，就别只在家观察了。`)
    } else {
      notes.push(`我顺手看了下，${ctx.name}今天饮水记了 ${water.totalMl}ml；如果接下来连喝水都吐，风险就比单次呕吐高。`)
    }
    if ((feed.totalGrams || 0) > 0) notes.push(`今天已经有进食记录，后面先暂停零食和新食物，重点看还会不会继续吐。`)
  } else if (topic === 'stool') {
    notes.push(`便便这块我会多看最近几天：近 7 天异常记录是 ${ctx.recentSevenDays.abnormalStools || 0} 次，今天饮水大概 ${water.totalMl || 0}ml。`)
  } else if (topic === 'walk') {
    const walked = walk.totalMinutes || 0
    if (walked > 0) {
      notes.push(`${ctx.name}今天已经动了 ${walked} 分钟，后面就别一下子加太猛，先看回来喘不喘、第二天精神怎么样。`)
    } else {
      notes.push(`${ctx.name}现在是${ctx.ageText}、${ctx.breed || '当前品种'}，运动可以安排，但先从轻松散步开始，不要突然拉强度。`)
    }
    if ((stool.abnormalCount || 0) > 0) notes.push(`今天便便有异常记录，运动就先保守一点，别用剧烈活动刺激肠胃。`)
  } else if (topic === 'feed') {
    notes.push(`喂食我会对着近 7 天看：最近日均大概 ${ctx.recentSevenDays.feedAverageGrams || 0}g，今天目前是 ${feed.totalGrams || 0}g${feed.targetGrams ? `，约完成 ${percentText(feed.ratio)}` : ''}。`)
  } else if (topic === 'water') {
    notes.push(`喝水这块我会看趋势，不只看一口两口：近 7 天日均约 ${ctx.recentSevenDays.waterAverageMl || 0}ml，今天目前 ${water.totalMl || 0}ml${water.targetMl ? `，约完成 ${percentText(water.ratio)}` : ''}。`)
  }

  const trend = ctx.weightTrend || {}
  if (Number.isFinite(trend.deltaKg) && Math.abs(trend.deltaKg) >= 0.3) {
    notes.push(`另外体重最近比上次${trend.deltaKg > 0 ? '重' : '轻'}了 ${Math.abs(trend.deltaKg)}kg，这种变化值得和饮食、运动一起盯一下。`)
  } else if (ctx.weight && ['walk', 'feed', 'water', 'weight'].includes(topic)) {
    notes.push(`我也会把当前 ${ctx.weight}kg 算进去，毕竟同样的食量和运动量，对不同体重的宠物意义不一样。`)
  }

  const due = careDueHints(ctx)
  if (due.length && ['care', 'general'].includes(topic)) notes.push(`顺带提醒一下，${due.join('、')}，这类事别堆到过期后再处理。`)
  return notes.slice(0, 2)
}

function followupPrompt(question) {
  const topic = topicOf(question)
  if (topic === 'vomit') return '你再补一句：今天一共吐了几次、吐出来像食物/黄水/白沫，精神还好吗？'
  if (topic === 'stool') return '你再补一句：是软便、水样，还是带血/黏液？今天几次？'
  if (topic === 'water') return '你再补一句：尿量和尿色怎么样，有没有频繁蹲尿？'
  return ''
}

function shortText(value, limit = 18) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function cleanItems(items) {
  return (items || [])
    .map(item => String(item || '').replace(/\s+/g, ' ').trim().replace(/[。；;]+$/g, ''))
    .filter(Boolean)
}

function joinNatural(items, limit = 4) {
  return cleanItems(items).slice(0, limit).join('；')
}

function naturalTitle(title) {
  return String(title || '').replace(/^[^\u4e00-\u9fa5A-Za-z0-9]+/g, '').trim()
}

function isHealthTopic(question) {
  return ['vomit', 'stool', 'water'].includes(topicOf(question)) || /疼|痛|血|吐|拉稀|腹泻|咳|没精神|发烧|中毒|虫咬|尿/.test(String(question || ''))
}

function isScenarioStyle(title) {
  return SCENARIO_PACKS.some(pack => String(title || '').includes(pack.title))
}

function chatLead(title, verdict) {
  const softTitle = naturalTitle(title)
  if (!softTitle) return verdict
  const coreTitle = softTitle.split(/[｜|]/)[0].trim()
  const label = coreTitle.split('：')[0].trim()
  const titleTail = coreTitle.includes('：') ? coreTitle.split('：').slice(1).join('：') : ''
  const displayTitle = titleTail && /，/.test(titleTail) && /(kg|体重未记录|岁|个月|年龄未记录)/.test(titleTail)
    ? label
    : coreTitle
  // 标题单独占一行：用户先看结论，不必在资料、年龄和数值里找重点。
  return `【${displayTitle || label || softTitle}】\n${verdict}`
}

function compactRecordLine(ctx, question, basis, title = '') {
  const titleText = String(title || '')
  if (!ctx) return ''
  // 问的是一段时间时，证据行必须跟着那段时间走，不能回落成“今天”。
  const askedRange = activeReplyMeta && activeReplyMeta.range
  if (askedRange && askedRange.evidence) return `参考：${shortText(askedRange.evidence, 60)}`
  if (/对比/.test(titleText)) {
    const details = cleanItems(basis).slice(0, 2)
    return details.length ? `参考：${details.join(' · ')}` : ''
  }
  const topic = topicOf(question)
  if (/今日状态/.test(titleText)) {
    const stool = (ctx.today.stool.records || [])[0] || ctx.lastStool || {}
    return `参考：喂食 ${ctx.today.feed.totalGrams || 0}g · 饮水 ${ctx.today.water.totalMl || 0}ml · 便便 ${stool.condition || '暂无记录'}`
  }
  if (/用品余量/.test(titleText)) {
    const supplies = ctx.supplies || {}
    const dailyFeed = ctx.recentSevenDays.feedAverageGrams || ctx.today.feed.totalGrams || ctx.today.feed.targetGrams || 0
    const food = supplies.dogFood || {}
    const snack = supplies.snack || {}
    // 原先这里只显示包装规格，用户看不到最关心的“还剩多少”。
    // 按问题优先展示对应用品；未指明时同时给主粮和零食的估算。
    if (/零食|冻干|磨牙棒/.test(String(question || ''))) {
      return `参考：${snack.productName || '零食'}，${supplyEstimate(snack, Math.max(5, Math.round(dailyFeed * 0.08)))}`
    }
    if (/狗粮|猫粮|主粮|粮还剩|粮剩/.test(String(question || ''))) {
      return `参考：${food.productName || '主粮'}，${supplyEstimate(food, dailyFeed)}`
    }
    return `参考：主粮 ${supplyEstimate(food, dailyFeed)}；零食 ${supplyEstimate(snack, Math.max(5, Math.round(dailyFeed * 0.08)))}`
  }
  if (/每周品种补充/.test(titleText)) {
    const details = cleanItems(basis).filter(item => /来源|体重区间|寿命|性格关键词|当前/.test(item)).slice(0, 4)
    return details.length ? `参考：${details.join('；')}` : ''
  }
  if (/知识库补充/.test(titleText)) {
    const details = cleanItems(basis).filter(item => /来源补充包分类|相关主题/.test(item))
    return details.length ? `参考：${shortText(details.join('；'), 96)}` : ''
  }
  if (/日常洗护|护理操作|洗澡护理|刷牙护理|耳朵护理|修剪指甲/.test(titleText)) {
    const details = cleanItems(basis).filter(item => /洗澡|刷牙|剪指甲/.test(item)).slice(0, 3)
    return details.length ? `参考：${details.join(' · ')}` : ''
  }
  if (isScenarioStyle(titleText)) {
    const first = cleanItems(basis).slice(0, 2)
    return first.length ? `参考：${shortText(first.join('；'), 64)}` : ''
  }
  if (topic === 'feed') {
    const feed = ctx.today.feed || {}
    return `参考：今天 ${feed.totalGrams || 0}g${feed.targetGrams ? ` / 目标 ${feed.targetGrams}g` : ''}`
  }
  if (topic === 'water') {
    const water = ctx.today.water || {}
    return `参考：今天 ${water.totalMl || 0}ml${water.targetMl ? ` / 目标 ${water.targetMl}ml` : ''}`
  }
  if (topic === 'walk') {
    const stool = (ctx.today.stool.records || [])[0] || ctx.lastStool || {}
    const stoolHint = ctx.today.stool.abnormalCount ? `；便便${stool.condition || '有异常'}` : ''
    const activity = cleanItems(basis).find(item => /建议活动量/.test(item)) || ''
    const protect = cleanItems(basis).find(item => /腰背|关节/.test(item)) || cleanItems(basis).find(item => /建议活动量/.test(item)) || ''
    return `参考：${shortText(activity, 34)}；${shortText(protect, 28)}${stoolHint}`
  }
  if (topic === 'stool') {
    const stool = (ctx.today.stool.records || [])[0] || ctx.lastStool || {}
    return `参考：今天异常便便 ${ctx.today.stool.abnormalCount || 0} 次${stool.condition ? `，${stool.condition}` : ''}`
  }
  if (topic === 'weight') return `参考：当前 ${ctx.weight || '未记录'}kg`
  const first = cleanItems(basis)[0]
  return first ? `参考：${shortText(first, 36)}` : ''
}

function contextLine(ctx, question, basis, title = '') {
  const topic = topicOf(question)
  const useful = cleanItems(basis)
  if (/今日状态/.test(String(title || ''))) {
    return `今天记录是：${joinNatural(useful, 6)}。`
  }
  if (/用品余量/.test(String(title || '')) && useful.length) {
    return `我看了用品记录：${joinNatural(useful, 4)}。`
  }
  if (topic === 'water') {
    const water = ctx.today.water
    return `我看了一下记录，今天喝了 ${water.totalMl}ml${water.targetMl ? `，目标大概 ${water.targetMl}ml` : ''}；近 7 天日均约 ${ctx.recentSevenDays.waterAverageMl}ml。`
  }
  if (topic === 'feed') {
    const feed = ctx.today.feed
    return `今天喂食记了 ${feed.totalGrams}g${feed.targetGrams ? `，目标 ${feed.targetGrams}g` : ''}；近 7 天日均约 ${ctx.recentSevenDays.feedAverageGrams}g。`
  }
  if (topic === 'walk') {
    const walk = ctx.today.walk
    const main = useful.find(item => item.includes('建议活动量')) || `近 7 天日均散步约 ${ctx.recentSevenDays.walkAverageMinutes} 分钟`
    const protect = useful.find(item => /腰背|关节|少爬楼|少跳高/.test(item))
    return `我会按${main}来安排，今天已经记了 ${walk.totalMinutes} 分钟、约 ${walk.totalKm || 0}km${protect ? `；另外${protect}` : ''}。`
  }
  if (topic === 'stool') {
    const latest = useful.find(item => item.includes('最近一次')) || ''
    return `便便这块我会多看形态和次数：今天 ${ctx.today.stool.count} 次，近 7 天异常 ${ctx.recentSevenDays.abnormalStools} 次${latest ? `，${latest.replace('最近一次状态：', '最近一次是')}` : ''}。`
  }
  if (topic === 'weight') {
    return `我会把最近体重、今天喂食 ${ctx.today.feed.totalGrams}g、饮水 ${ctx.today.water.totalMl}ml、散步 ${ctx.today.walk.totalMinutes} 分钟放在一起看。`
  }
  if (topic === 'care') {
    const careBits = useful.filter(item => /洗澡|刷牙|剪指甲|疫苗|驱虫|用药|护理/.test(item)).slice(0, 3)
    return careBits.length ? `护理时间我顺手看了：${careBits.join('；')}。` : ''
  }
  if (isHealthTopic(question) && useful.length) {
    return `我会先看这几件事：${joinNatural(useful, 3)}。`
  }
  if (/品种|犬种|猫种|寿命|性格|TheDogAPI|TheCatAPI/i.test(String(question || '')) && useful.length) {
    return `这条我按${joinNatural(useful, 5)}来参考。`
  }
  if (/余量|狗粮|猫粮|用品/.test(String(question || '')) && useful.length) {
    return `我看了用品记录：${joinNatural(useful, 4)}。`
  }
  if (/风险等级|结合档案|今天记录/.test(useful.join(' '))) {
    return `我会结合档案看：${joinNatural(useful, 4)}。`
  }
  return useful.length && !/。$/.test(useful[0]) ? `我先按${joinNatural(useful, 2)}来判断。` : ''
}

function compose({ title, verdict, basis = [], actions = [], warning = '' }) {
  // 聊天页固定为“标题、结论、可选记录、一个动作”：便于快速扫读。
  // 详细数据仍在记录页，避免顾问回复像体检报告一样堆成一团。
  const parts = [chatLead(title, verdict)]
  const meta = activeReplyMeta || {}
  const titleText = String(title || '')
  const isSkuReply = /根据宠物推荐|主粮筛选|商品对比|营养\/配料解释/.test(titleText)
  // SKU 数据本身就是用户要查看的商品信息，不能再被通用聊天摘要截断。
  const evidence = isSkuReply
    ? cleanItems(basis).slice(0, /商品对比/.test(titleText) ? 2 : 1).map(item => `参考：${item}`).join('\n')
    : meta.ctx
      ? compactRecordLine(meta.ctx, meta.question, basis, title)
      : (cleanItems(basis)[0] ? `参考：${shortText(cleanItems(basis)[0], 36)}` : '')
  const actionItems = cleanItems(actions)
  const action = (/绝育/.test(titleText) && actionItems.find(item => /术后/.test(item)))
    || (/洗澡|剪指甲|刷牙|洗护/.test(titleText) && actionItems.find(item => /奖励|吹干/.test(item)))
    || (/食物安全|食物补充库|友好食物/.test(titleText) && actionItems.find(item => /少量|一点点/.test(item)))
    || actionItems.find(item => /不要|别|暂停|尽快|立即/.test(item))
    || actionItems[0]
  if (evidence) parts.push(evidence)
  if (action) parts.push(`建议：${shortText(action, 54)}`)
  if (warning) parts.push(`⚠️ ${shortText(warning, 64)}`)
  return parts.join('\n')
}

function normalizeSearchText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '')
}

function getExternalBreedKnowledge() {
  const data = safeGet('externalBreedKnowledge', null)
  if (!data || typeof data !== 'object' || !Array.isArray(data.items)) return { items: [], updatedAt: 0, sources: [] }
  return data
}

function shouldUseExternalBreed(question) {
  const text = String(question || '')
  return /品种|犬种|猫种|寿命|性格|体型|体重区间|来源|资料|thecatapi|thedogapi/i.test(text)
}

function breedSearchKeys(item) {
  return [item && item.name, ...((item && item.aliases) || [])]
    .map(key => String(key || '').trim())
    .filter(Boolean)
}

function matchExternalBreed(ctx, question) {
  const knowledge = getExternalBreedKnowledge()
  const items = knowledge.items || []
  if (!items.length) return null
  const text = normalizeSearchText(`${question || ''} ${ctx.breed || ''}`)
  return items
    .map(item => {
      const keys = breedSearchKeys(item)
      const hit = keys
        .map(key => normalizeSearchText(key))
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)
        .find(key => text.includes(key))
      return hit ? { item, score: hit.length } : null
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)[0]?.item || null
}

function scoreText(label, value) {
  const score = Number(value)
  if (!Number.isFinite(score) || score <= 0) return ''
  if (score >= 4) return `${label}偏高`
  if (score <= 2) return `${label}偏低`
  return `${label}中等`
}

function answerExternalBreed(ctx, question) {
  if (!shouldUseExternalBreed(question)) return ''
  const item = matchExternalBreed(ctx, question)
  if (!item) return ''
  const knowledge = getExternalBreedKnowledge()
  const updatedDate = knowledge.updatedAt ? new Date(Number(knowledge.updatedAt)).toISOString().slice(0, 10) : '待同步'
  const temperament = (item.temperament || []).slice(0, 6)
  const scoreHints = item.scores
    ? [
        scoreText('精力', item.scores.energy),
        scoreText('洗护需求', item.scores.grooming),
        scoreText('健康问题关注度', item.scores.healthIssues),
        scoreText('社交需求', item.scores.socialNeeds),
        scoreText('叫声倾向', item.scores.vocalisation)
      ].filter(Boolean)
    : []
  const bodyHint = item.weight ? `体重区间约 ${item.weight}kg` : ''
  const lifeHint = item.lifeSpan ? `常见寿命 ${item.lifeSpan}` : ''
  const source = item.source || (item.species === 'cat' ? 'TheCatAPI' : 'TheDogAPI')
  return compose({
    title: `📚 每周品种补充：${item.name}`,
    verdict: `${ctx.name}档案里是 ${ctx.breed || item.name}，我会把这个品种资料和它当前 ${ctx.ageText}、${ctx.weight || '未记录'}kg 的状态一起看。`,
    basis: [
      `来源 ${source}，云端每周更新，本地缓存日期 ${updatedDate}`,
      item.origin ? `常见来源/地区 ${item.origin}` : '',
      bodyHint,
      lifeHint,
      temperament.length ? `性格关键词 ${temperament.join('、')}` : '',
      item.summary || '',
      scoreHints.length ? scoreHints.join('、') : ''
    ],
    actions: [
      item.species === 'cat' ? '猫咪重点看饮水、尿量、应激、毛球和体重变化' : '狗狗重点看运动量、关节压力、体重曲线和散步后的恢复',
      ctx.stage === 'puppy' ? '幼年阶段别用成年犬猫强度硬套，训练、运动和换粮都慢一点' : '',
      ctx.stage === 'senior' ? '年纪偏大时把高冲击运动降下来，观察关节、牙口和恢复速度' : '',
      ctx.weight ? `结合当前 ${ctx.weight}kg，继续盯住喂食、饮水、散步和体重趋势，不要只看品种平均值` : '先补一条当前体重，品种资料和日常记录结合后会更准'
    ],
    warning: '这些是品种级参考，不是诊断；如果出现拒食、呕吐、腹泻、尿血、跛行、喘得厉害或精神明显变差，要优先问兽医。'
  })
}

function findCatalog(text, catalog) {
  return catalog.find(item => item.keys.some(key => text.includes(key)))
}

function matchByName(text, items, fields = ['name', 'title']) {
  return (items || [])
    .map(item => {
      const names = fields.map(field => item[field]).filter(Boolean)
      const key = names.filter(name => text.includes(name)).sort((a, b) => b.length - a.length)[0]
      return key ? { item, key } : null
    })
    .filter(Boolean)
    .sort((a, b) => b.key.length - a.key.length)[0]?.item
}

function supplementNames(items, fields = ['name', 'title']) {
  return (items || []).flatMap(item => fields.map(field => item[field]).filter(Boolean))
}

function matchSupplementEmergency(text) {
  return matchByName(text, supplement.emergencies, ['title'])
}

function matchSupplementSymptom(text) {
  return matchByName(text, supplement.symptoms, ['name'])
}

function matchSupplementFood(text) {
  return matchByName(text, supplement.foods, ['name'])
}

function matchSupplementTip(text) {
  return matchByName(text, supplement.tips, ['title'])
}

function matchSupplementReminder(text) {
  return matchByName(text, supplement.reminders, ['name'])
}

function matchScenario(text) {
  return SCENARIO_PACKS
    .map(item => {
      const key = item.keys.filter(word => text.includes(word)).sort((a, b) => b.length - a.length)[0]
      return key ? { item, key } : null
    })
    .filter(Boolean)
    .sort((a, b) => b.key.length - a.key.length)[0]?.item
}

function shouldUseScenarioFirst(text) {
  const pack = matchScenario(text)
  if (!pack) return false
  if (pack.title === '寄养与上门喂养') return /上门喂养|朋友代养|出差没人管/.test(text)
  return SCENARIO_FIRST_TITLES.includes(pack.title)
}

function listFoodNames(catalog, limit = 12) {
  return catalog.flatMap(item => item.keys.slice(0, 2)).slice(0, limit).join('、')
}

function activityTarget(ctx) {
  const isCorgi = /柯基|corgi/i.test(ctx.breed)
  if (/猫|英短|美短|布偶|暹罗/.test(ctx.breed)) {
    return { minutes: '每天 2-4 轮、每轮 5-10 分钟逗猫/追逐游戏', note: '猫更适合短时间多轮互动，重点是消耗狩猎欲和减少无聊' }
  }
  if (ctx.stage === 'puppy') return { minutes: '每天 2-4 次，每次 10-20 分钟轻松活动', note: '幼犬骨骼还在发育，少跳高、少爬楼、不要长时间疯跑' }
  if (ctx.stage === 'senior') return { minutes: '每天 2-3 次，每次 10-20 分钟低冲击散步', note: '老年宠物看关节、喘息恢复和第二天精神，不追求强度' }
  if (isCorgi) return { minutes: '每天约 45-70 分钟，拆成 2-3 次', note: '柯基需要运动，但要保护腰背，少爬楼少跳高' }
  if (ctx.weight && ctx.weight < 8) return { minutes: '每天约 30-50 分钟，拆成 2 次', note: '小体型犬注意别在高温下硬拉长距离' }
  if (ctx.weight && ctx.weight > 25) return { minutes: '每天约 60-90 分钟，拆成 2-3 次', note: '大体型犬更要热身和控制关节冲击' }
  return { minutes: '每天约 40-70 分钟，拆成 2 次以上', note: '成年犬适合规律中等强度活动，再加一点嗅闻和训练' }
}

function answerFoodList(ctx, question) {
  const text = String(question || '')
  if (/不能吃|不可以吃|禁食|危险|中毒/.test(text)) {
    return compose({
      title: `🚫 禁食清单：${profileText(ctx)}`,
      verdict: `常见不建议吃的包括：${listFoodNames(FOOD_UNSAFE, 18)}。`,
      basis: ['这些食物可能有中毒、肠胃损伤、划伤堵塞、盐脂过高等风险'],
      actions: ['如果已经吃了，记录食物、数量、时间和症状', '巧克力、葡萄、木糖醇、老鼠药、清洁剂不要等观察', '不确定的食物先别给'],
      warning: riskLine(ctx, question)
    })
  }
  if (/对.*好|毛发|皮肤|肠胃|有益|补充|吃什么好/.test(text)) {
    return compose({
      title: `🌱 友好食物：${profileText(ctx)}`,
      verdict: `可作为少量辅助的常见食物有：${listFoodNames(FOOD_BENEFICIAL, 14)}。`,
      basis: FOOD_BENEFICIAL.slice(0, 5).map(item => `${item.keys[0]}：${item.benefit}`),
      actions: ['主粮仍然是基础，不要把辅食当正餐', '第一次只给一点点，看 24 小时便便、皮肤和精神', '肠胃不舒服、腹泻或正在换粮时先别加新食物'],
      warning: riskLine(ctx, question)
    })
  }
  return compose({
    title: `✅ 可少量尝试食物：${profileText(ctx)}`,
    verdict: `常见可少量尝试的包括：${listFoodNames(FOOD_CAREFUL, 18)}。`,
    basis: ['前提是原味、少量、无盐无糖无调味，并且宠物当前肠胃状态稳定'],
    actions: ['肉类和鸡蛋建议熟制', '水果去核去籽，蔬菜洗净或熟制', '任何新食物第一次都只给少量，观察 24 小时'],
    warning: riskLine(ctx, question)
  })
}

function answerWater(ctx, question) {
  const water = ctx.today.water
  const remaining = Math.max(0, water.targetMl - water.totalMl)
  const verdict = water.targetMl
    ? water.ratio >= 1
      ? `${ctx.name}今天饮水已经达标，完成约 ${percent(water.ratio)}%。`
      : `${ctx.name}今天饮水还差约 ${remaining}ml，当前完成约 ${percent(water.ratio)}%。`
    : `${ctx.name}还没有设置饮水目标，我先按体重给你估算。`
  return compose({
    title: `💧 饮水判断：${profileText(ctx)}`,
    verdict,
    basis: [
      `今天 ${water.count} 次饮水，共 ${water.totalMl}ml`,
      water.targetMl ? `目标 ${water.targetMl}ml` : `按体重粗估约 ${Math.round((ctx.weight || 0) * 55)}ml`,
      `近 7 天日均约 ${ctx.recentSevenDays.waterAverageMl}ml`,
      seasonAdvice()
    ],
    actions: [
      remaining > 0 ? '把剩余量拆成 3-4 次给，不要一次灌太多' : '继续保持新鲜水，饭后和散步后主动补水',
      '吃干粮、天气热、运动后饮水需求会更高',
      '如果明显少尿、不喝水、反复呕吐或精神差，别拖'
    ],
    warning: riskLine(ctx, question)
  })
}

function compareWord(current, previous, unit = '') {
  if (!previous && current) return `之前几乎没记录到，现在是 ${current}${unit}`
  if (!previous && !current) return '之前和现在都还没什么记录'
  const diff = Math.round(current - previous)
  if (Math.abs(diff) <= Math.max(1, Math.round(previous * 0.08))) return `和之前差不多，都是 ${current}${unit} 左右`
  return diff > 0 ? `比之前多约 ${diff}${unit}` : `比之前少约 ${Math.abs(diff)}${unit}`
}

function isComparisonQuestion(text) {
  return /和之前比|比之前|跟之前比|和上次比|比上次|之前呢|以前呢|比呢|变化|趋势|最近比|相比|对比|比起来|比一比|环比|跟上(周|个?月|次)比|和上(周|个?月|次)比|比上(周|个?月)/.test(String(text || ''))
}

function comparisonTopicOf(question) {
  const direct = topicOf(question)
  if (direct !== 'general') return direct
  const meta = activeReplyMeta || {}
  const turns = normalizeHistory(meta.history)
  const currentIndex = turns.map(item => item.text).lastIndexOf(meta.originalQuestion || question)
  const previousTurns = turns.slice(0, currentIndex >= 0 ? currentIndex : turns.length)

  // “和之前呢”应接住上一条用户的问题。不能扫描整段顾问回答，
  // 因为饮食回答里也常会顺带提到饮水、体重，容易把主题带偏。
  const previousUsers = previousTurns.filter(item => item.role === 'user').reverse()
  for (const turn of previousUsers) {
    const topic = topicOf(turn.text)
    if (topic !== 'general') return topic
  }

  // 只有用户上文完全没有主题时，才参考上一条顾问回答的标题行。
  const previousAi = previousTurns.filter(item => item.role === 'ai').reverse()[0]
  if (previousAi) {
    const title = String(previousAi.text || '').split('\n')[0]
    if (/饮食判断|饮食对比|喂食|吃饭|食量|主粮|狗粮|猫粮/.test(title)) return 'feed'
    if (/饮水判断|饮水对比|喝水|饮水|补水/.test(title)) return 'water'
    if (/运动判断|运动对比|散步|运动|活动/.test(title)) return 'walk'
    if (/肠胃判断|便便对比|便便|排便|软便|腹泻|拉稀/.test(title)) return 'stool'
    if (/体重趋势|体重|胖|瘦/.test(title)) return 'weight'
  }
  return 'weight'
}

const RANGE_TOPICS = ['feed', 'water', 'walk', 'stool']
const CN_DIGITS = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }

function parseCountWord(text) {
  const value = String(text || '').trim()
  if (!value) return 0
  if (/^\d+$/.test(value)) return Number(value)
  if (value === '十') return 10
  let match = value.match(/^十([一二三四五六七八九])$/)
  if (match) return 10 + CN_DIGITS[match[1]]
  match = value.match(/^([一二两三四五六七八九])十([一二三四五六七八九])?$/)
  if (match) return CN_DIGITS[match[1]] * 10 + (match[2] ? CN_DIGITS[match[2]] : 0)
  return CN_DIGITS[value] || 0
}

// “最近七天吃得多吗”问的是一段时间，不是今天。认不出范围就返回 null，
// 走原来的当日逻辑，避免误伤普通提问。
function detectTimeRange(question) {
  const text = String(question || '').replace(/\s+/g, '')
  if (!text) return null
  if (/^(今天|今日)/.test(text) && !/最近|过去/.test(text)) return null
  // 「下周寄养」「下个月体检」问的是将来的安排，不是历史区间统计
  if (/下(一)?(周|个?月|次)|明天|后天/.test(text)) return null
  // 「上周/上个月/昨天」指的是往前推的那一段，不是最近 N 天，要带偏移。
  if (/前天/.test(text)) return { days: 1, offset: 2, label: '前天' }
  if (/昨天|昨日/.test(text)) return { days: 1, offset: 1, label: '昨天' }
  if (/上(一)?(周|星期|礼拜)/.test(text)) return { days: 7, offset: 7, label: '上周' }
  if (/上(一)?个?月/.test(text)) return { days: 30, offset: 30, label: '上个月' }
  let match = text.match(/(?:最近|近|过去|这|前)?(\d+|[一二两三四五六七八九十]+)(?:天|日)/)
  if (match) {
    const days = parseCountWord(match[1])
    if (days >= 2 && days <= 90) return { days: days, offset: 0, label: `最近 ${days} 天` }
  }
  if (/半个?月/.test(text)) return { days: 15, offset: 0, label: '最近半个月' }
  // 前缀和数字都可选的话，光一个「周」字就能命中（「下周寄养」被当成「最近一周」），
  // 所以要么带过去/当前的前缀，要么带数字。
  match = text.match(/(?:最近|近|过去|这|本)(\d+|[一二两三四五六七八九十]+)?(?:个)?(?:周|星期|礼拜)/) ||
          text.match(/(\d+|[一二两三四五六七八九十]+)(?:个)?(?:周|星期|礼拜)/)
  if (match) {
    const weeks = match[1] ? parseCountWord(match[1]) : 1
    if (weeks >= 1 && weeks <= 12) return { days: weeks * 7, offset: 0, label: weeks === 1 ? '最近一周' : `最近 ${weeks} 周` }
  }
  match = text.match(/(?:最近|近|过去|这|本)(\d+|[一二两三四五六七八九十]+)?(?:个)?月/)
  if (match) {
    const months = match[1] ? parseCountWord(match[1]) : 1
    if (months >= 1 && months <= 6) return { days: months * 30, offset: 0, label: months === 1 ? '最近一个月' : `最近 ${months} 个月` }
  }
  return null
}

// 当前这句没有主题词时（“那上周呢”），从上一轮用户提问继承；
// 句子本身已有主题（“最近三天一直吐”）就不继承，避免被上文带偏。
function rangeTopicOf(question, intent) {
  const meta = activeReplyMeta || {}
  // 当前这句自己说了主题就以它为准；intent 是在拼接了上一轮的句子上算的，
  // 直接信它会让“昨天喝了多少”被上一轮的“吃了多少”带偏。
  const own = topicOf(meta.originalQuestion || question)
  if (RANGE_TOPICS.indexOf(own) >= 0) return own
  if (own !== 'general') return ''
  if (RANGE_TOPICS.indexOf(intent) >= 0) return intent
  const direct = topicOf(question)
  if (RANGE_TOPICS.indexOf(direct) >= 0) return direct
  const turns = normalizeHistory(meta.history)
  const currentIndex = turns.map(item => item.text).lastIndexOf(meta.originalQuestion || question)
  const previous = turns.slice(0, currentIndex >= 0 ? currentIndex : turns.length)
    .filter(item => item.role === 'user').reverse()
  for (const turn of previous) {
    const topic = topicOf(turn.text)
    if (RANGE_TOPICS.indexOf(topic) >= 0) return topic
  }
  return ''
}

function rangeStats(records, key, days, offset) {
  const keys = dayKeysFrom(offset || 0, days)
  const totals = groupTotals(records, key)
  const total = keys.reduce((sum, day) => sum + (totals[day] || 0), 0)
  const activeDays = keys.filter(day => (totals[day] || 0) > 0).length
  return {
    total: Math.round(total),
    average: Math.round(total / days),
    activeDays: activeDays,
    count: countWindow(records, offset || 0, days)
  }
}

function levelWord(diff, target) {
  if (!target) return ''
  if (Math.abs(diff) <= target * 0.12) return '基本持平'
  return diff > 0 ? '偏多' : '偏少'
}

function coverageNote(stats, days) {
  if (!stats.activeDays) return ''
  if (stats.activeDays >= days) return ''
  return `只有 ${stats.activeDays}/${days} 天有记录，日均会被没记录的日子拉低`
}

function answerRange(ctx, question, topic, range) {
  const days = range.days
  const label = range.label
  const all = ctx.allRecords || {}

  if (topic === 'feed') {
    const stats = rangeStats(all.feeds, 'amount', days, range.offset)
    const target = ctx.today.feed.targetGrams
    const diff = target ? stats.average - target : 0
    const word = levelWord(diff, target)
    const verdict = !stats.count
      ? `${ctx.name}${label}没有喂食记录，先补上才能判断吃得多不多。`
      : target
        ? `${ctx.name}${label}日均 ${stats.average}g，目标 ${target}g，${word}${word === '基本持平' ? '' : `约 ${Math.abs(diff)}g`}。`
        : `${ctx.name}${label}日均 ${stats.average}g、共 ${stats.total}g；还没设每日目标，设一个判断会更准。`
    if (activeReplyMeta) activeReplyMeta.range = { evidence: `${label}共 ${stats.total}g / ${stats.count} 次，日均 ${stats.average}g${target ? ` / 目标 ${target}g` : ''}` }
    return compose({
      title: `🍚 ${label}饮食：${profileText(ctx)}`,
      verdict: verdict,
      basis: [coverageNote(stats, days)],
      actions: [
        coverageNote(stats, days) ? '尽量每天都记一笔，日均才有参考价值' : '',
        word === '偏多' ? '先收零食，再看主粮分量要不要下调' : '',
        word === '偏少' ? '观察是不是天气、零食吃多了或身体状态影响食欲' : '',
        '主粮固定餐次，零食别超过全天摄入的一小部分'
      ],
      warning: /不吃|拒食|没食欲|挑食/.test(question) ? '如果连续 24 小时明显拒食，或伴随呕吐、腹泻、精神差，请尽快咨询兽医。' : riskLine(ctx, question)
    })
  }

  if (topic === 'water') {
    const stats = rangeStats(all.waters, 'amount', days, range.offset)
    const target = ctx.today.water.targetMl
    const diff = target ? stats.average - target : 0
    const word = levelWord(diff, target)
    const verdict = !stats.count
      ? `${ctx.name}${label}没有饮水记录，先补上才能看出喝得够不够。`
      : target
        ? `${ctx.name}${label}日均喝 ${stats.average}ml，目标 ${target}ml，${word}${word === '基本持平' ? '' : `约 ${Math.abs(diff)}ml`}。`
        : `${ctx.name}${label}日均喝 ${stats.average}ml、共 ${stats.total}ml。`
    if (activeReplyMeta) activeReplyMeta.range = { evidence: `${label}共 ${stats.total}ml / ${stats.count} 次，日均 ${stats.average}ml${target ? ` / 目标 ${target}ml` : ''}` }
    return compose({
      title: `💧 ${label}饮水：${profileText(ctx)}`,
      verdict: verdict,
      basis: [coverageNote(stats, days)],
      actions: [
        word === '偏少' ? '多放几个水碗、换新鲜水，湿粮或泡粮也能补水' : '',
        word === '偏多' ? '持续明显多饮多尿要留意，必要时查一下' : '',
        '固定位置固定水碗，观察每天大致喝多少'
      ],
      warning: riskLine(ctx, question)
    })
  }

  if (topic === 'walk') {
    const stats = rangeStats(all.walks, 'duration', days, range.offset)
    const verdict = !stats.count
      ? `${ctx.name}${label}没有散步记录。`
      : `${ctx.name}${label}共散步 ${stats.count} 次、${stats.total} 分钟，日均约 ${stats.average} 分钟。`
    if (activeReplyMeta) activeReplyMeta.range = { evidence: `${label}共 ${stats.total} 分钟 / ${stats.count} 次，日均 ${stats.average} 分钟` }
    return compose({
      title: `🐕 ${label}运动：${profileText(ctx)}`,
      verdict: verdict,
      basis: [coverageNote(stats, days)],
      actions: [
        stats.average < 30 ? '可以每天补一次 15-25 分钟的轻松散步或嗅闻游戏' : '运动量已有基础，保持规律即可',
        '运动后看喘息恢复、脚垫和有没有跛行'
      ],
      warning: riskLine(ctx, question)
    })
  }

  const keySet = new Set(dayKeysFrom(range.offset || 0, days))
  const inRange = (all.stools || []).filter(item => item && keySet.has(item.dayKey))
  const abnormal = inRange.filter(item => item.abnormal).length
  const activeDays = new Set(inRange.map(item => item.dayKey)).size
  const verdict = !inRange.length
    ? `${ctx.name}${label}没有排便记录。`
    : abnormal
      ? `${ctx.name}${label}共排便 ${inRange.length} 次，其中 ${abnormal} 次需要观察。`
      : `${ctx.name}${label}共排便 ${inRange.length} 次，都是正常记录。`
  if (activeReplyMeta) activeReplyMeta.range = { evidence: `${label}共 ${inRange.length} 次，异常 ${abnormal} 次，${activeDays}/${days} 天有记录` }
  return compose({
    title: `💩 ${label}排便：${profileText(ctx)}`,
    verdict: verdict,
    basis: [`${activeDays}/${days} 天有记录`],
    actions: [
      abnormal ? '异常集中出现时先暂停新食物和零食，观察 1-2 天' : '继续保持规律饮食和记录',
      '记录形态、颜色、次数和当天精神食欲'
    ],
    warning: abnormal >= 3 ? '如果血便、黑便、水样腹泻、频繁呕吐或精神差，请尽快就医。' : riskLine(ctx, question)
  })
}

function answerComparison(ctx, question) {
  const topic = comparisonTopicOf(question)
  const yesterday = dayKeysFrom(1, 1)[0]
  const feeds = getRecords('feeds')
  const waters = getRecords('waters')
  const walks = getRecords('walks')
  const stools = getRecords('stools')

  if (topic === 'water') {
    const today = ctx.today.water.totalMl
    const yest = totalOnDay(waters, 'amount', yesterday)
    const recent = ctx.recentSevenDays.waterAverageMl
    const previous = averageWindow(waters, 'amount', 7, 7)
    return compose({
      title: '💧 饮水对比',
      verdict: `和之前比，今天 ${today}ml，${compareWord(today, yest, 'ml')}。近 7 天日均 ${recent}ml，${compareWord(recent, previous, 'ml')}。`,
      basis: [
        `昨天约 ${yest}ml`,
        `上一个 7 天日均约 ${previous}ml`,
        ctx.today.water.targetMl ? `当前目标 ${ctx.today.water.targetMl}ml` : ''
      ],
      actions: [
        today < (ctx.today.water.targetMl || 0) * 0.7 ? '今天先分几次补水，别一次灌太多' : '今天不用硬灌水，保持新鲜水就行',
        '如果喝水突然明显变多或变少，再一起看尿量、精神和食欲'
      ],
      warning: riskLine(ctx, question)
    })
  }

  if (topic === 'feed') {
    const today = ctx.today.feed.totalGrams
    const yest = totalOnDay(feeds, 'amount', yesterday)
    const recent = ctx.recentSevenDays.feedAverageGrams
    const previous = averageWindow(feeds, 'amount', 7, 7)
    return compose({
      title: '🍚 饮食对比',
      verdict: `和之前比，今天吃了 ${today}g，${compareWord(today, yest, 'g')}。近 7 天日均 ${recent}g，${compareWord(recent, previous, 'g')}。`,
      basis: [
        `昨天约 ${yest}g`,
        `上一个 7 天日均约 ${previous}g`,
        ctx.today.feed.targetGrams ? `当前目标 ${ctx.today.feed.targetGrams}g` : ''
      ],
      actions: [
        '如果只是一天少一点，先看天气、零食和运动量',
        '如果连续几天明显少吃，重点看精神、便便和有没有呕吐'
      ],
      warning: /不吃|拒食|没食欲/.test(question) ? '如果连续 24 小时明显拒食，或伴随呕吐、腹泻、精神差，请尽快咨询兽医。' : riskLine(ctx, question)
    })
  }

  if (topic === 'walk') {
    const today = ctx.today.walk.totalMinutes
    const yest = totalOnDay(walks, 'duration', yesterday)
    const recent = ctx.recentSevenDays.walkAverageMinutes
    const previous = averageWindow(walks, 'duration', 7, 7)
    return compose({
      title: '🐕 运动对比',
      verdict: `和之前比，今天 ${today} 分钟，${compareWord(today, yest, ' 分钟')}。近 7 天日均 ${recent} 分钟，${compareWord(recent, previous, ' 分钟')}。`,
      basis: [activityTarget(ctx).note, breedAdvice(ctx), seasonAdvice()],
      actions: [
        today < 30 ? '今天可以补一次轻松散步或嗅闻游戏' : '今天运动量已经有基础，不用硬加',
        '回来后看喘息、脚垫、精神和第二天状态'
      ],
      warning: riskLine(ctx, question)
    })
  }

  if (topic === 'stool') {
    const todayAbnormal = ctx.today.stool.abnormalCount
    const yestAbnormal = countWindow(stools, 1, 1, item => item.abnormal)
    const recent = ctx.recentSevenDays.abnormalStools
    const previous = countWindow(stools, 7, 7, item => item.abnormal)
    return compose({
      title: '💩 便便对比',
      verdict: `和之前比，今天异常便便 ${todayAbnormal} 次，昨天是 ${yestAbnormal} 次；近 7 天异常 ${recent} 次，上一个 7 天是 ${previous} 次。`,
      basis: [
        ctx.lastStool && ctx.lastStool.condition ? `最近一次状态：${ctx.lastStool.condition}` : '',
        `今天喂食 ${ctx.today.feed.totalGrams}g、饮水 ${ctx.today.water.totalMl}ml`
      ],
      actions: [
        '如果异常次数比之前增加，先暂停新食物和零食',
        '继续记录形态、颜色、次数和精神食欲'
      ],
      warning: todayAbnormal || recent >= 3 ? '如果血便、黑便、水样腹泻、频繁呕吐或精神差，请尽快就医。' : riskLine(ctx, question)
    })
  }

  return answerWeight(ctx, question)
}

function answerFeed(ctx, question) {
  const feed = ctx.today.feed
  const target = feed.targetGrams
  const diff = target ? Math.round(feed.totalGrams - target) : 0
  const verdict = target
    ? Math.abs(diff) <= target * 0.12
      ? `${ctx.name}今天食量整体接近目标，先保持稳定。`
      : diff > 0
        ? `${ctx.name}今天已经比目标多约 ${diff}g，后面零食要收一收。`
        : `${ctx.name}今天比目标少约 ${Math.abs(diff)}g，可以观察是不是天气、零食或身体状态影响。`
    : `${ctx.name}今天记录了 ${feed.totalGrams}g，建议先设置每日目标，后续判断会更准。`
  return compose({
    title: `🍚 饮食判断：${profileText(ctx)}`,
    verdict,
    basis: [
      `今天 ${feed.count} 次喂食，共 ${feed.totalGrams}g`,
      target ? `目标 ${target}g，完成 ${percent(feed.ratio)}%` : '未设置喂食目标',
      `近 7 天日均约 ${ctx.recentSevenDays.feedAverageGrams}g`,
      stageAdvice(ctx)
    ],
    actions: [
      '主粮优先固定餐次，零食尽量不超过全天摄入的一小部分',
      '挑食时先减少零食和频繁换粮，观察 1-2 天食欲、精神和便便',
      '换粮建议 7 天过渡，别突然全换'
    ],
    warning: /不吃|拒食|没食欲|挑食/.test(question) ? '如果连续 24 小时明显拒食，或伴随呕吐、腹泻、精神差，请尽快咨询兽医。' : riskLine(ctx, question)
  })
}

function answerWalk(ctx, question) {
  const walk = ctx.today.walk
  const target = activityTarget(ctx)
  const ageNote = ctx.stage === 'puppy'
    ? '幼年宠物运动要短时多次，少跳跃，别追求跑很久'
    : ctx.stage === 'senior'
      ? '老年宠物更适合低冲击散步，看喘息恢复和关节反应'
      : '成年宠物可以保持规律中等强度活动'
  return compose({
    title: `🐕 运动判断：${profileText(ctx)}`,
    verdict: walk.count ? `${ctx.name}今天已散步 ${walk.count} 次，共 ${walk.totalMinutes} 分钟。` : `${ctx.name}今天还没有散步记录。`,
    basis: [
      `建议活动量：${target.minutes}`,
      `近 7 天日均散步约 ${ctx.recentSevenDays.walkAverageMinutes} 分钟`,
      `今天距离约 ${walk.totalKm || 0}km`,
      ageNote,
      target.note,
      breedAdvice(ctx),
      seasonAdvice()
    ],
    actions: [
      walk.totalMinutes < 30 ? '今天可以补一次 15-25 分钟的轻松散步或嗅闻游戏' : '今天运动量已经有基础，不必硬加量',
      '运动后观察喘息恢复、脚垫、精神和有没有跛行',
      '天气热就放到清晨/傍晚，雨天回家擦干脚垫和腹部',
      '除了走路，也可以用嗅闻垫、找零食、基础训练做低冲击消耗'
    ],
    warning: /跛|瘸|不走|疼|关节/.test(question) ? '如果跛行、不愿落脚、碰触疼痛或突然不愿走，先停止运动并联系兽医。' : riskLine(ctx, question)
  })
}

function answerStool(ctx, question) {
  const stool = ctx.today.stool
  const abnormal = stool.abnormalCount
  const latest = stool.records[0] || ctx.lastStool || {}
  const verdict = abnormal
    ? `${ctx.name}今天有 ${abnormal} 次异常便便，需要重点观察。`
    : stool.count
      ? `${ctx.name}今天排便 ${stool.count} 次，记录上暂时没有异常标记。`
      : `${ctx.name}今天还没有排便记录，先别急，可以继续观察。`
  return compose({
    title: `💩 肠胃判断：${profileText(ctx)}`,
    verdict,
    basis: [
      `今天排便 ${stool.count} 次`,
      `近 7 天异常便便 ${ctx.recentSevenDays.abnormalStools} 次`,
      latest.condition ? `最近一次状态：${latest.condition}${latest.color ? `、${latest.color}` : ''}` : '暂无最近状态',
      `今天喂食 ${ctx.today.feed.totalGrams}g，饮水 ${ctx.today.water.totalMl}ml`
    ],
    actions: [
      '先回看今天有没有新食物、零食增多、换粮或捡食',
      '轻微一次偏软可记录并观察，饮水和精神正常时先别乱用药',
      '接下来 24 小时继续记录形态、颜色、次数和食欲'
    ],
    warning: /血|黑|水样|拉稀|呕吐|吐/.test(question) || abnormal ? '如果出现血便、黑便、水样腹泻、频繁呕吐、明显虚弱或腹痛，请尽快就医。' : riskLine(ctx, question)
  })
}

function answerWeight(ctx, question) {
  const trend = ctx.weightTrend || {}
  const records = ctx.recentWeights || []
  if (!records.length) {
    return compose({
      title: `⚖️ 体重趋势判断：${profileText(ctx)}`,
      verdict: '目前还没有足够的体重历史记录。',
      actions: ['建议每周固定时间称重一次', '连续 3-4 周后再看趋势，会比单次体重更可靠']
    })
  }
  const delta = Number(trend.deltaKg || 0)
  return compose({
    title: `⚖️ 体重趋势判断：${profileText(ctx)}`,
    verdict: `最新 ${trend.latestKg || ctx.weight}kg，${trendWord(delta)}。`,
    basis: [
      `最近保留 ${trend.recordsCount || records.length} 条体重记录`,
      `上次 ${trend.previousKg || 0}kg`,
      `今天喂食 ${ctx.today.feed.totalGrams}g、饮水 ${ctx.today.water.totalMl}ml、散步 ${ctx.today.walk.totalMinutes} 分钟`,
      stageAdvice(ctx)
    ],
    actions: [
      Math.abs(delta) > 0.3 ? '短期变化有点明显，建议连续复称并结合食欲、饮水、排便看' : '当前变化不算突兀，保持每周记录即可',
      '称重尽量固定同一时间、同一台秤',
      '不要只看一天，至少看 3-4 次连续记录'
    ],
    warning: /突然|暴瘦|暴胖|不吃/.test(question) ? '如果短期明显消瘦/增重，并伴随食欲、饮水或精神异常，建议咨询兽医。' : riskLine(ctx, question)
  })
}

function answerMedicine(ctx, question) {
  return compose({
    title: `💊 用药提醒：${profileText(ctx)}`,
    verdict: '用药不能按经验估剂量，尤其不要直接套用人用药。',
    basis: ['安全用药需要药名、浓度、体重、症状、既往病史和兽医判断'],
    actions: [
      '如果是兽医开的药，按医嘱时间和剂量执行，并在记录里补一条用药',
      '如果是误食药物，保留包装，记录时间和大概数量',
      '不要自行给止痛药、退烧药或抗过敏药'
    ],
    warning: '误食药物、农药、清洁剂、老鼠药等情况，请立刻联系兽医或动物急诊。'
  })
}

// “最近在吃什么药”是在查档案，不是在索要用药建议。护理记录目前可以
// 标记一次用药，但早期记录未必包含药名，所以这里必须如实说明已记录的内容。
function answerMedicationRecord(ctx) {
  const records = (ctx.careRecords || [])
    .filter(item => item && item.key === 'medicine')
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || Number(b.createdAt || b.id || 0) - Number(a.createdAt || a.id || 0))

  if (!records.length) {
    return `我查了${ctx.name}的记录，目前没有“宠物用药”记录，所以没法判断最近在吃什么药。`
  }

  const latest = records[0]
  const medicineName = [latest.medicineName, latest.drugName, latest.name, latest.medicine, latest.drug]
    .map(value => String(value || '').trim())
    .find(Boolean)
  const detail = [latest.dose, latest.dosage, latest.note, latest.content]
    .map(value => String(value || '').trim())
    .find(Boolean)
  const date = latest.date || '日期未填写'

  if (medicineName) {
    const suffix = detail ? `，备注：${detail}` : ''
    return `记录里最新一条是 ${date}：${medicineName}${suffix}。`
  }

  const next = latest.nextDate ? `，下次提醒是 ${latest.nextDate}` : ''
  return `我查到最近一条用药记录是 ${date} 的“${latest.label || '宠物用药'}”${next}；这条没有填写药名和剂量，所以无法确认具体吃的是哪一种药。`
}

function answerBite(ctx, question) {
  return compose({
    title: `🦟 叮咬/皮肤提醒：${profileText(ctx)}`,
    verdict: '轻微局部红肿可以先冷静观察，但全身反应要马上处理。',
    basis: ['虫咬常见表现是局部红、痒、舔咬；严重过敏会影响呼吸和精神', seasonAdvice()],
    actions: [
      '轻微红肿可隔布冷敷 10 分钟，戴伊丽莎白圈防舔咬',
      '如果看见蜂刺，用卡片边缘平刮，不要用手挤',
      '检查是否有蜱虫、跳蚤，后续补做体外驱虫记录'
    ],
    warning: '如果面部/颈部肿胀、呼吸困难、反复呕吐、虚弱或被多处蜇咬，请立即就医。'
  })
}

function answerSupplementEmergency(ctx, question) {
  const text = String(question || '')
  const card = matchSupplementEmergency(text)
  if (!card) return answerGeneric(ctx, question)
  return [
    compose({
      title: `🚑 急症卡：${card.title}｜${profileText(ctx)}`,
      verdict: card.summary,
      basis: [
        `风险等级 ${card.risk || 1}/3`,
        `结合档案：${ctx.name} ${ctx.ageText}，体重 ${ctx.weight || '未记录'}kg`,
        `今天记录：喂食 ${ctx.today.feed.totalGrams}g、饮水 ${ctx.today.water.totalMl}ml、排便异常 ${ctx.today.stool.abnormalCount} 次`
      ],
      actions: card.actions,
      warning: '这类情况不要只依赖本地知识库判断，出现危险信号或摄入量不明时请尽快联系兽医/动物急诊。'
    }),
    `先观察：${(card.observe || []).join('；')}。`,
    `不要做：${(card.doNot || []).join('；')}。`,
    `危险信号：${(card.emergency || []).join('；')}。`
  ].join('\n')
}

function answerSupplementSymptom(ctx, question) {
  const text = String(question || '')
  const symptom = matchSupplementSymptom(text)
  if (!symptom) return answerSymptomList(ctx, question)
  return [
    compose({
      title: `🩺 症状索引：${symptom.name}｜${profileText(ctx)}`,
      verdict: symptom.summary,
      basis: [
        `风险等级 ${symptom.risk || 1}/3`,
        `今天饮水 ${ctx.today.water.totalMl}ml/${ctx.today.water.targetMl}ml`,
        `今天喂食 ${ctx.today.feed.totalGrams}g/${ctx.today.feed.targetGrams || '未设目标'}g`,
        `今天便便 ${ctx.today.stool.count} 次，异常 ${ctx.today.stool.abnormalCount} 次`
      ],
      actions: symptom.actions,
      warning: riskLine(ctx, question)
    }),
    `观察重点：${(symptom.observe || []).join('；')}。`,
    `危险信号：${(symptom.emergency || []).join('；')}。`
  ].join('\n')
}

function answerSupplementFood(ctx, question) {
  const text = String(question || '')
  const food = matchSupplementFood(text)
  if (!food) return answerFoodSafety(ctx, question)
  const safetyText = food.safety === 'unsafe' ? '不建议喂，误食按风险处理' : food.safety === 'careful' ? '可以谨慎少量，先看做法和状态' : '可作为少量辅助，不能替代主粮'
  return [
    compose({
      title: `🍽️ 食物补充库：${food.name}｜${profileText(ctx)}`,
      verdict: `${safetyText}。${food.summary}`,
      basis: [
        `风险等级 ${food.risk || 1}/3`,
        `${ctx.name} 当前体重 ${ctx.weight || '未记录'}kg`,
        `今天主粮/喂食已记录 ${ctx.today.feed.totalGrams}g`
      ],
      actions: food.actions || ['第一次只给极少量，并观察 24 小时便便、呕吐和皮肤反应'],
      warning: riskLine(ctx, question)
    }),
    food.doNot && food.doNot.length ? `不要做：${food.doNot.join('；')}。` : ''
  ].filter(Boolean).join('\n')
}

function answerSupplementTip(ctx, question) {
  const text = String(question || '')
  const direct = matchSupplementTip(text)
  const categoryMatched = /营养|饮食|主粮|干粮|湿粮|蛋白|脂肪|钙磷|牛磺酸/.test(text)
    ? 'nutrition'
    : /洗护|梳毛|掉毛|打结|洗澡|剪指甲|耳朵|泪痕|刷牙|口臭/.test(text)
      ? 'daily_care'
      : /疫苗|接种|加强针|漏打/.test(text)
        ? 'vaccination'
        : /驱虫|跳蚤|蜱虫|螨虫|心丝虫/.test(text)
          ? 'deworming'
          : /行为|训练|社会化|护食|乱叫|拆家|召回|随行|笼内|奖励/.test(text)
            ? 'training'
            : /运动|活动|嗅闻|益智|肥胖宠运动|老年宠运动/.test(text)
              ? 'exercise'
              : /老年|认知障碍|适老化|肾脏|心脏/.test(text)
                ? 'senior_pet'
                : /幼宠|幼犬|幼猫|断奶|生长|乱咬/.test(text)
                  ? 'young_pet'
                  : /安全|阳台|窗户|清洁剂|香薰|驱蚊|百合|绿萝|托运|酒店|中暑|保暖/.test(text)
                    ? 'environment_safety'
                    : ''
  const related = direct
    ? [direct, ...supplement.tips.filter(item => item.category === direct.category && item.title !== direct.title).slice(0, 5)]
    : supplement.tips.filter(item => item.category === categoryMatched).slice(0, 6)
  if (!related.length) return answerGeneric(ctx, question)
  const main = direct || related[0]
  return compose({
    title: `📚 知识库补充：${main.title}｜${profileText(ctx)}`,
    verdict: main.text,
    basis: [
      `来源补充包分类：${main.category}`,
      `结合档案：${ctx.name} ${ctx.ageText}，体重 ${ctx.weight || '未记录'}kg`,
      `相关主题：${related.map(item => item.title).join('、')}`
    ],
    actions: related.slice(0, 5).map(item => `${item.title}：${item.text}`),
    warning: riskLine(ctx, question)
  })
}

function answerSupplementReminder(ctx, question) {
  const text = String(question || '')
  const reminder = matchSupplementReminder(text)
  if (!reminder) return answerCare(ctx, question)
  return compose({
    title: `⏰ 提醒规则补充：${reminder.name}｜${profileText(ctx)}`,
    verdict: reminder.description,
    basis: [
      `默认间隔约 ${reminder.days} 天`,
      `规则类型：${reminder.type}`,
      `当前护理计划：疫苗 ${careDueText((ctx.care || {}).vaccine)}，驱虫 ${careDueText((ctx.care || {}).deworming)}，刷牙 ${careDueText((ctx.care || {}).dental)}`
    ],
    actions: ['可以按默认间隔建立提醒，也可以根据兽医建议、年龄和健康状态调整', '每次完成后补一条记录，系统才能继续推算下次时间', '异常期不要只按固定周期，优先按身体状态处理'],
    warning: ''
  })
}

function answerFoodSafety(ctx, question) {
  const text = String(question || '')
  if (/不能吃|不可以吃|禁食|危险|中毒|能吃的|常见.*能吃|对.*好|好的食物|吃什么好|毛发.*食物|肠胃.*食物/.test(text)) {
    return answerFoodList(ctx, question)
  }
  const unsafe = findCatalog(text, FOOD_UNSAFE)
  const careful = findCatalog(text, FOOD_CAREFUL)
  const beneficial = findCatalog(text, FOOD_BENEFICIAL)
  if (unsafe) {
    const food = unsafe.keys.find(key => text.includes(key)) || unsafe.keys[0]
    return compose({
      title: `🍫 食物安全：${profileText(ctx)}`,
      verdict: `${food}不建议给${ctx.name}吃；如果已经吃了，要按误食处理。`,
      basis: [`你提到了“${food}”`, unsafe.risk, `${ctx.name}体重 ${ctx.weight || '未记录'}kg，误食风险需要结合数量判断`],
      actions: ['先别自行催吐，记录吃了多少、什么时候吃的', '保留包装或照片', '尽快联系兽医确认是否需要处理'],
      warning: '巧克力、葡萄/葡萄干、洋葱、大蒜、木糖醇、酒精、老鼠药等都不要等待观察。'
    })
  }
  if (careful) {
    const food = careful.keys.find(key => text.includes(key)) || careful.keys[0]
    return compose({
      title: `🍎 食物安全：${profileText(ctx)}`,
      verdict: `${food}通常要看做法和量，不能当主食。`,
      basis: [`你提到了“${food}”`, careful.tip, `今天主粮已记录 ${ctx.today.feed.totalGrams}g`],
      actions: ['只给原味、少量、无盐无糖无调味版本', '第一次吃先给一点点，看 24 小时便便和皮肤反应', '有肠胃敏感或正在腹泻时先别尝试'],
      warning: riskLine(ctx, question)
    })
  }
  if (beneficial) {
    const food = beneficial.keys.find(key => text.includes(key)) || beneficial.keys[0]
    return compose({
      title: `🌱 友好食物：${profileText(ctx)}`,
      verdict: `${food}对${ctx.name}可以作为少量辅助，但不能替代主粮。`,
      basis: [`你提到了“${food}”`, beneficial.benefit, `今天主粮已记录 ${ctx.today.feed.totalGrams}g`],
      actions: ['按体重少量给，第一次观察 24 小时', '腹泻、呕吐、胰腺问题或皮肤过敏期先别乱加', '任何补充都不要超过主粮的地位'],
      warning: riskLine(ctx, question)
    })
  }
  return compose({
    title: `🍽️ 食物判断：${profileText(ctx)}`,
    verdict: '我没有在本地禁食清单里识别到明确食物名，所以先按保守原则处理。',
    basis: ['本地知识库只能识别常见高风险和常见可少量尝试食物', `今天喂食 ${ctx.today.feed.totalGrams}g，便便异常 ${ctx.today.stool.abnormalCount} 次`],
    actions: ['先不要给调味、油炸、含糖、含盐、带骨、来路不明的食物', '如果想尝试新食物，第一次只给极少量，并观察 24 小时', '你可以直接问“能不能吃苹果/鸡胸肉/巧克力”这种具体食物'],
    warning: riskLine(ctx, question)
  })
}

function careDueText(date) {
  const days = daysBetween(date)
  if (days === 999) return '未设置'
  if (days < 0) return `已逾期 ${Math.abs(days)} 天`
  if (days === 0) return '今天到期'
  return `还有 ${days} 天`
}

function requestedCareKey(question) {
  const text = String(question || '')
  const matches = []
  // 疫苗和驱虫要优先于“用药”等宽泛词，避免“驱虫药”被当成普通用药。
  if (/疫苗|猫三联|犬五联|狂犬/.test(text)) matches.push('vaccine')
  if (/驱虫|跳蚤|蜱虫|体内外/.test(text)) matches.push('deworming')
  if (/洗澡|洗护/.test(text)) matches.push('bath')
  if (/刷牙|牙齿护理|口腔护理/.test(text)) matches.push('dental')
  if (/剪指甲|修剪指甲|剪爪|修爪/.test(text)) matches.push('nail')
  if (/用药|吃药|药物|药剂/.test(text) && !matches.includes('deworming')) matches.push('medicine')
  // 一次问两个以上项目时交给总览，避免只答第一个而漏答另一个。
  return matches.length === 1 ? matches[0] : ''
}

function careCycleText(care, meta) {
  const value = number(care && care[meta.cycleKey])
  return value > 0 ? `周期 ${value} ${meta.unit}` : ''
}

function latestCareRecord(ctx, careKey) {
  return (ctx.careRecords || [])
    .filter(item => item && item.key === careKey && item.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.createdAt || b.id || 0) - Number(a.createdAt || a.id || 0))[0] || null
}

function asksPreviousCare(question) {
  return /上次|最近一次|上回|最后一次|历史.*(刷牙|洗澡|疫苗|驱虫|剪指甲|用药)|记录.*(刷牙|洗澡|疫苗|驱虫|剪指甲|用药)/.test(String(question || ''))
}

function answerSpecificCare(ctx, careKey, question) {
  const care = ctx.care || {}
  const meta = CARE_QUERY_META[careKey]
  if (!meta) return answerCare(ctx, '')
  const date = String(care[careKey] || '')
  const due = careDueText(date)
  const cycle = careCycleText(care, meta)
  const latestRecord = latestCareRecord(ctx, careKey)
  const last = String((latestRecord && latestRecord.date) || care[meta.lastKey] || '')
  const asksLast = asksPreviousCare(question)
  if (asksLast) {
    const verdict = last
      ? `上次${meta.label}：${last}。`
      : `还没有找到${meta.label}的历史记录。`
    const basis = [
      latestRecord && latestRecord.nextDate ? `当时计算的下次提醒：${latestRecord.nextDate}` : '',
      cycle,
      !latestRecord && last ? '来自当前护理计划的上次日期' : ''
    ]
    return compose({
      title: `${meta.title.replace('提醒', '记录')}`,
      verdict,
      basis,
      actions: [last ? '完成护理后及时补一条记录，下一次提醒才会跟着更新' : `在“我的 > ${meta.label}”中补记完成日期`]
    })
  }
  const hasDate = due !== '未设置'
  const verdict = hasDate
    ? `下次${meta.label}：${date}（${due}）。`
    : `还没有设置下次${meta.label}日期。`
  const basis = [
    last ? `上次记录：${last}` : '',
    cycle,
    hasDate ? `${meta.label}计划：${date}` : ''
  ]
  const actions = {
    vaccine: ['接种前确认精神、食欲和便便正常；不舒服时先联系兽医改期'],
    deworming: ['按产品说明和体重确认剂量；腹泻、呕吐或正在生病时先咨询兽医'],
    bath: ['皮肤无异常时再洗，洗后彻底吹干'],
    dental: ['用宠物牙膏轻刷或从短时间适应开始，不用人用牙膏'],
    nail: ['只剪透明指甲尖端；看不清血线就少剪一点'],
    medicine: ['按兽医医嘱核对药名、剂量和时间，不用提醒日期替代用药方案']
  }
  const warning = hasDate && daysBetween(date) < 0
    ? `${meta.label}已逾期；尤其是疫苗和驱虫，确认是否需要补做或重新安排。`
    : ''
  return compose({ title: meta.title, verdict, basis, actions: actions[careKey], warning })
}

function answerCare(ctx, question) {
  const careKey = requestedCareKey(question)
  if (careKey) return answerSpecificCare(ctx, careKey, question)
  const care = ctx.care || {}
  const lines = Object.keys(CARE_LABELS).map(key => `${CARE_LABELS[key]}：${careDueText(care[key])}`)
  const dueSoon = Object.keys(CARE_LABELS).filter(key => daysBetween(care[key]) <= 3)
  return compose({
    title: `📅 护理提醒：${profileText(ctx)}`,
    verdict: dueSoon.length ? `近期要优先看：${dueSoon.map(key => CARE_LABELS[key]).join('、')}。` : `当前护理计划整体不紧张：${lines.join('；')}。`,
    basis: [`护理记录共 ${ctx.careRecords.length} 条`, ...lines.slice(0, 4), `今天排便异常 ${ctx.today.stool.abnormalCount} 次`],
    actions: [
      '驱虫和疫苗尽量按兽医建议周期执行',
      '洗澡、剪指甲、刷牙可以按状态微调',
      '身体不舒服、刚打疫苗或腹泻时，洗澡和高强度运动先缓一缓'
    ],
    warning: riskLine(ctx, question)
  })
}

function supplyEstimate(item, dailyAmount) {
  if (!item || !number(item.packageAmount)) return '未记录规格'
  const amount = number(item.packageAmount)
  const used = Math.max(0, dailyAmount * Math.max(1, daysBetween(item.openedDate) * -1 || 1))
  const remaining = Math.max(0, amount - used)
  if (!dailyAmount) return `约剩 ${Math.round(remaining)}g`
  return `约剩 ${Math.round(remaining)}g，可用约 ${Math.ceil(remaining / dailyAmount)} 天`
}

function answerSupply(ctx, question) {
  const supplies = ctx.supplies || {}
  const dogFood = supplies.dogFood || {}
  const snack = supplies.snack || {}
  const dailyFeed = ctx.recentSevenDays.feedAverageGrams || ctx.today.feed.totalGrams || ctx.today.feed.targetGrams || 0
  return compose({
    title: `🛒 用品余量：${profileText(ctx)}`,
    verdict: '我按最近喂食记录给你估算余量，实际还要看包装规格和零食消耗。',
    basis: [
      `狗粮 ${dogFood.productName || '未填写'}：${supplyEstimate(dogFood, dailyFeed)}`,
      `零食 ${snack.productName || '未填写'}：${supplyEstimate(snack, Math.max(5, Math.round(dailyFeed * 0.08)))}`,
      `近 7 天主粮日均约 ${dailyFeed}g`
    ],
    actions: ['余量少于 7 天建议提前补货', '拆封日期和规格填得越准，估算越靠谱', '零食不要替代主粮，尤其挑食阶段先收紧零食'],
    warning: riskLine(ctx, question)
  })
}

function recommendationIntent(question) {
  const text = String(question || '')
  const hasRecommendWord = /推荐|怎么选|筛选|挑选|适合|买什么|哪个好|对比|比较|配料|营养|成分|原料/.test(text)
  // 带价格的问句本身就是在选购：「一个月500以内的狗粮」没有“推荐”二字，
  // 「太贵了有便宜点的吗」连主题都没有 —— 后者只在刚推过主粮时才接，避免误伤。
  const priceIntent = priceUtil.parsePriceIntent(text)
  const mentionsFood = /主粮|狗粮|猫粮|干粮|湿粮|粮/.test(text)
  if (priceIntent && mentionsFood) return 'mainFood'
  if (priceIntent && (priceIntent.cheaper || priceIntent.pricier) && lastRecommended.length && topicOf(text) === 'general') return 'mainFood'
  if (!hasRecommendWord) return ''
  if (/宠物粮推荐|根据宠物|根据我家|推荐.*主粮.*零食|推荐.*零食.*玩具/.test(text)) return 'pet'
  if (/对比|比较|哪个好|二选一|区别/.test(text) && /主粮|狗粮|猫粮|零食|玩具|粮/.test(text)) return 'compare'
  if (/配料表|成分表|原料表|配方.*(营养|蛋白|脂肪)|主粮.*(营养|蛋白|脂肪|热量)|粮.*(营养|蛋白|脂肪|热量)|商品.*(配料|成分)|蛋白.*(粮|配方)|脂肪.*(粮|配方)/.test(text)) return 'ingredient'
  if (/玩具|磨牙|嗅闻|益智/.test(text)) return 'toy'
  if (/零食|冻干|奖励|咬胶/.test(text)) return 'snack'
  if (/主粮|狗粮|猫粮|干粮|湿粮|粮/.test(text)) return 'mainFood'
  if (/推荐.*吃|推荐.*买|吃什么粮|粮怎么选/.test(text)) return 'pet'
  return ''
}

function recommendationProfile(ctx) {
  const tags = recommendations.profileTags(ctx)
  const details = [ctx.ageText, ctx.breed, ctx.weight ? `${ctx.weight}kg` : '体重未记录']
  if (tags.length) details.push(tags.join('、'))
  return details.join(' · ')
}

// 记住上一轮推了什么：用户说“太贵了/便宜点”时没有具体数字，
// 只能以上一轮的价格为基准来找更便宜的。
let lastRecommended = []

function priceFrameNote(intent, dailyGrams) {
  if (!intent || !intent.frame || !intent.guessed) return ''
  const unit = intent.frame === 'monthly' ? '元/月' : '元/斤'
  const range = intent.min ? `${intent.min}-${intent.max}` : `${intent.max}`
  return `已按${range}${unit}筛选${intent.frame === 'monthly' ? `（按每天 ${dailyGrams}g 折算）` : ''}，按区间最低价命中，口径不对可以直接说`
}

function itemPriceLine(item, dailyGrams) {
  const parsed = item.price || priceUtil.parsePrice(item.marketPrice)
  if (!parsed) return ''
  const monthly = priceUtil.monthlyCost(parsed, dailyGrams)
  const suspect = parsed.suspect ? '，该价格疑似录入有误' : ''
  return monthly ? `${item.marketPrice}（${priceUtil.formatMonthly(monthly)}）${suspect}` : `${item.marketPrice}${suspect}`
}

function activeDailyGrams() {
  const meta = activeReplyMeta || {}
  return Number(meta.ctx && meta.ctx.today && meta.ctx.today.feed && meta.ctx.today.feed.targetGrams) || 0
}

function formatRecommendationItem(item) {
  const label = item.fullName || `${item.brand ? `${item.brand} ` : ''}${item.name}`.trim()
  // 评分卡 SKU 优先展示已同步的真实字段；零食/玩具仍沿用原有标签和说明。
  if (item.marketPrice || item.ingredients || item.advantages || item.disadvantages) {
    const fields = [
      item.marketPrice ? `价格 ${itemPriceLine(item, activeDailyGrams())}` : '',
      item.ingredients ? `原料 ${item.ingredients}` : '',
      item.advantages ? `优点 ${item.advantages}` : '',
      item.disadvantages ? `注意 ${item.disadvantages}` : ''
    ].filter(Boolean)
    return `${label}：${fields.join('；')}`
  }
  return `${label}：${item.tags.slice(0, 3).join('、')}；${item.note}`
}

function answerRecommendation(ctx, question, kind) {
  if (kind === 'ingredient') {
    const matched = recommendations.findItems(question)
    return compose({
      title: '🥣 营养/配料解释',
      verdict: recommendations.ingredientAdvice(question),
      basis: matched.length ? matched.slice(0, 2).map(item => `你提到的${formatRecommendationItem(item)}`) : [`当前档案：${recommendationProfile(ctx)}`],
      actions: ['把商品配料表前 5 位、保证分析值和每 100g 热量发来，我可以按同一标准帮你看', '换粮或新增零食要留出 7-10 天观察期']
    })
  }

  if (kind === 'compare') {
    const matched = recommendations.findItems(question)
    const items = matched.length >= 2 ? matched.slice(0, 3) : recommendations.recommend(/零食|冻干/.test(question) ? 'snack' : /玩具/.test(question) ? 'toy' : 'mainFood', ctx, question, 2)
    return compose({
      title: '📊 商品对比',
      verdict: items.length >= 2 ? `先按${items.map(item => item.fullName || `${item.brand || ''} ${item.name}`.trim()).join('、')}比较：优先看适用年龄/物种、配料透明度、热量和你家宠物吃后的稳定性。` : '先把要比较的两个商品名称或配料表发来，我再逐项比较。',
      basis: items.map(formatRecommendationItem),
      actions: ['不要只按价格或“高蛋白”排序，先排除不适合物种、年龄和体况的产品', '如果是处方粮或有慢性病，先让兽医确认']
    })
  }

  const category = kind === 'pet' ? 'mainFood' : kind
  const intent = priceUtil.parsePriceIntent(question)
  const dailyGrams = Number(ctx.today && ctx.today.feed && ctx.today.feed.targetGrams) || 0
  // 只有“便宜点/太贵了”这类没带数字的说法才需要锚点
  const anchor = intent && !intent.max && (intent.cheaper || intent.pricier) ? lastRecommended[0] : null
  const options = { intent: intent, anchor: anchor }
  const items = kind === 'pet'
    ? [
      ...recommendations.recommend('mainFood', ctx, question, 2, options),
      ...recommendations.recommend('snack', ctx, question, 1),
      ...recommendations.recommend('toy', ctx, question, 1)
    ]
    : recommendations.recommend(category, ctx, question, 3, options)
  if (category === 'mainFood') lastRecommended = items.filter(item => item.price && !item.price.suspect)
  const label = category === 'mainFood' ? '主粮' : category === 'snack' ? '零食' : '玩具'
  const profile = recommendationProfile(ctx)
  return compose({
    title: `🐾 ${kind === 'pet' ? '根据宠物推荐' : `${label}筛选`}`,
    verdict: kind === 'pet'
      ? `按${profile}，主粮先看${items.slice(0, 2).map(item => item.fullName || `${item.brand} ${item.name}`).join('、')}；零食和玩具再按用途补充。`
      : `按${profile}，${label}可以优先看：${items.map(item => item.fullName || `${item.brand} ${item.name}`).join('、')}。`,
    basis: items.map(formatRecommendationItem),
    actions: category === 'mainFood'
      ? [priceFrameNote(intent, dailyGrams), '先确认适用物种和年龄，并按体重、体况、活动量计算喂食量', '换粮用 7-10 天过渡，软便或呕吐时先退回上一步并观察']
      : category === 'snack'
        ? ['零食控制在全天热量的一小部分，训练时掰小粒使用', '第一次给新零食只给一点，观察便便、皮肤和精神 24 小时']
        : ['玩具要选不会吞下的小件，出现裂口、掉屑就更换', '每天短时互动，按年龄和关节状态安排强度']
  })
}

function answerStatus(ctx, question) {
  const issues = []
  const latestStool = ctx.today.stool.records[0] || ctx.lastStool || {}
  if (ctx.today.water.targetMl && ctx.today.water.ratio < 0.6) issues.push('饮水偏少')
  if (ctx.today.feed.targetGrams && ctx.today.feed.ratio < 0.7) issues.push('进食偏少')
  if (ctx.today.stool.abnormalCount) issues.push('有异常便便')
  if (!ctx.today.walk.count) issues.push('还没有散步记录')
  const verdict = issues.length
    ? `${ctx.name}今天有 ${issues.join('、')} 这几项需要留意。`
    : `${ctx.name}今天记录看起来比较平稳，没有明显异常信号。`
  return compose({
    title: `🩺 今日状态：${profileText(ctx)}`,
    verdict,
    basis: [
      `喂食 ${ctx.today.feed.totalGrams}g/${ctx.today.feed.targetGrams || '未设目标'}g`,
      `饮水 ${ctx.today.water.totalMl}ml/${ctx.today.water.targetMl || '未设目标'}ml`,
      `散步 ${ctx.today.walk.count} 次 ${ctx.today.walk.totalMinutes} 分钟`,
      `排便 ${ctx.today.stool.count} 次，异常 ${ctx.today.stool.abnormalCount} 次`,
      latestStool.condition ? `最近一次便便：${latestStool.condition}${latestStool.color ? `、${latestStool.color}` : ''}` : '最近一次便便：暂无记录',
      breedAdvice(ctx)
    ],
    actions: [
      issues.includes('饮水偏少') ? '下午和晚饭后分几次补水' : '继续保持饮水记录',
      issues.includes('进食偏少') ? '先减少零食，观察下一餐食欲' : '喂食节奏保持稳定',
      issues.includes('还没有散步记录') ? '天气允许的话补一次短散步' : '运动后检查脚垫和精神'
    ],
    warning: riskLine(ctx, question)
  })
}

function answerBehavior(ctx, question) {
  let topic = '行为'
  let action = '先记录触发场景、持续时间和恢复方式，再逐步调整环境。'
  if (/叫|吠/.test(question)) {
    topic = '吠叫'
    action = '先判断是门铃/陌生人、无聊、分离焦虑还是需求触发；不要靠大声呵斥，改用安静奖励和嗅闻消耗。'
  } else if (/咬|拆|啃/.test(question)) {
    topic = '啃咬/拆家'
    action = '增加咀嚼玩具和嗅闻游戏，收起危险物；如果只在独处时发生，要考虑分离焦虑。'
  } else if (/害怕|焦虑|发抖|躲/.test(question)) {
    topic = '紧张害怕'
    action = '降低刺激强度，给安全角落，不要强迫接触；用短时、低强度、可退出的方式慢慢脱敏。'
  }
  return compose({
    title: `🐾 ${topic}建议：${profileText(ctx)}`,
    verdict: `${ctx.name}的${topic}问题要先看触发条件，不建议只靠惩罚。`,
    basis: [`今天散步 ${ctx.today.walk.totalMinutes} 分钟`, `近 7 天日均散步 ${ctx.recentSevenDays.walkAverageMinutes} 分钟`, `年龄：${ctx.ageText}`],
    actions: [action, '每天安排 5-10 分钟基础训练，成功就及时奖励', '如果突然行为大变，同时食欲或精神异常，也要排除身体不适'],
    warning: riskLine(ctx, question)
  })
}

function answerSymptom(ctx, question) {
  const text = String(question || '')
  if (/耳|耳朵|甩头/.test(text)) {
    return compose({
      title: `👂 耳朵观察：${profileText(ctx)}`,
      verdict: '频繁甩头、抓耳、耳道异味或分泌物增多，都不建议只靠洗耳液硬冲。',
      basis: [breedAdvice(ctx), `近期洗澡：${careDueText((ctx.care || {}).bath)}`],
      actions: ['先看是否红肿、异味、黑褐色分泌物', '保持耳道干爽，洗澡后擦干外耳', '如果疼、臭、分泌物多或头歪，尽快看兽医'],
      warning: riskLine(ctx, question)
    })
  }
  if (/眼|眼屎|流泪/.test(text)) {
    return compose({
      title: `👀 眼部观察：${profileText(ctx)}`,
      verdict: '少量眼屎可观察，但红肿、睁不开、黄绿分泌物或突然大量流泪要重视。',
      basis: ['眼部问题可能和过敏、倒睫、异物、感染有关'],
      actions: ['用干净湿巾轻轻擦外侧，不要乱滴人用眼药水', '观察是否眯眼、怕光、抓脸', '持续超过 24 小时或明显疼痛就医'],
      warning: riskLine(ctx, question)
    })
  }
  if (/牙|口臭|牙结石/.test(text)) {
    return compose({
      title: `🦷 口腔观察：${profileText(ctx)}`,
      verdict: '口臭、牙结石、牙龈红肿会影响进食，也可能让炎症长期存在。',
      basis: [`刷牙计划：${careDueText((ctx.care || {}).dental)}`, breedAdvice(ctx)],
      actions: ['能接受的话从舔牙膏、碰嘴唇开始慢慢训练刷牙', '不要用人用牙膏', '牙龈出血、松牙、拒食或疼痛建议看兽医'],
      warning: riskLine(ctx, question)
    })
  }
  return answerStatus(ctx, question)
}

function answerUrine(ctx, question) {
  const text = String(question || '')
  const urgent = /尿血|血尿|尿不出|一直蹲|频繁蹲|憋尿|痛/.test(text)
  return compose({
    title: `🚽 尿尿观察：${profileText(ctx)}`,
    verdict: urgent ? '你描述的尿尿情况有泌尿急症风险，尤其猫咪尿不出不能拖。' : '尿色、尿量和频率要结合饮水、天气和精神状态一起看。',
    basis: [
      `今天饮水 ${ctx.today.water.totalMl}ml/${ctx.today.water.targetMl || '未设目标'}ml`,
      `近 7 天日均饮水约 ${ctx.recentSevenDays.waterAverageMl}ml`,
      '尿少、尿黄可能和饮水不足、天气热有关，但尿血/尿不出是另一回事'
    ],
    actions: urgent
      ? ['立刻联系兽医，说明多久没尿、是否疼痛、是否频繁蹲猫砂盆/尿垫', '不要自行按压肚子，也不要先等到明天', '带上最近饮水、排便和精神状态记录']
      : ['先把今天饮水补到目标附近，并记录下一次尿的颜色和量', '如果连续尿少、精神差、频繁舔尿道口，要尽快问兽医', '猫咪可以多用湿粮、流动饮水机帮助增加摄水'],
    warning: urgent ? '尿不出、尿血、明显疼痛、频繁蹲却没有尿，建议按急症处理。' : riskLine(ctx, question)
  })
}

function answerHeat(ctx, question) {
  return compose({
    title: `🌡️ 中暑/体温提醒：${profileText(ctx)}`,
    verdict: '高温下如果出现急促喘、流口水、站不稳、呕吐、精神差，要优先按中暑风险处理。',
    basis: [seasonAdvice(), `今天散步 ${ctx.today.walk.totalMinutes} 分钟`, `今天饮水 ${ctx.today.water.totalMl}ml`],
    actions: [
      '立刻停止运动，转到阴凉通风处',
      '用常温水打湿脚垫、腹股沟、腋下辅助降温，不要用冰水猛冲',
      '如果站不稳、持续喘、呕吐、意识异常，马上联系兽医'
    ],
    warning: '中暑可能发展很快，不要等“自己缓一缓”。'
  })
}

function answerTravel(ctx, question) {
  return compose({
    title: `🧳 出行/寄养准备：${profileText(ctx)}`,
    verdict: '出行和寄养的重点是减少应激、保证饮食连续、把健康记录交代清楚。',
    basis: [
      `当前年龄 ${ctx.ageText}`,
      `近 7 天饮水日均 ${ctx.recentSevenDays.waterAverageMl}ml、散步日均 ${ctx.recentSevenDays.walkAverageMinutes} 分钟`,
      `护理提醒：疫苗 ${careDueText((ctx.care || {}).vaccine)}，驱虫 ${careDueText((ctx.care || {}).deworming)}`
    ],
    actions: [
      '提前准备主粮、常用零食、牵引/胸背、尿垫、常用药和病史说明',
      '寄养前确认疫苗、驱虫、洗澡时间，不要临出门突然换粮',
      '容易焦虑的宠物先做短时间适应，带熟悉毯子或玩具'
    ],
    warning: riskLine(ctx, question)
  })
}

function answerReproductive(ctx, question) {
  const text = String(question || '')
  const isNeuter = /绝育|手术/.test(text)
  const topic = isNeuter ? '绝育' : '发情'
  return compose({
    title: `🐶 ${topic}提醒：${profileText(ctx)}`,
    verdict: isNeuter ? '绝育要结合年龄、体重、发育、体检和兽医建议，不建议只按月份拍板。' : '发情期常见情绪、食欲、排尿和行为变化，但异常出血/精神差要警惕。',
    basis: [`年龄：${ctx.ageText}`, `体重：${ctx.weight || '未记录'}kg`, `今天食量 ${ctx.today.feed.totalGrams}g、饮水 ${ctx.today.water.totalMl}ml`],
    actions: isNeuter
      ? ['术前确认禁食禁水要求、基础体检和麻醉风险评估', '术后准备伊丽莎白圈，限制跳跃和剧烈运动', '观察伤口红肿、渗液、精神和食欲']
      : ['外出一定牵引，避免走失和意外交配', '记录出血天数、颜色、精神和食欲', '如果分泌物臭、发热、精神差或腹痛，尽快就医'],
    warning: riskLine(ctx, question)
  })
}

function answerGrooming(ctx, question) {
  const text = String(question || '')
  let title = '护理操作'
  let verdict = '护理要按状态来，不舒服、腹泻、刚打疫苗或应激明显时先缓一缓。'
  let actions = ['动作拆小，每次只做一点，完成就奖励', '不要强按硬掰，避免形成长期抗拒', '记录完成日期，系统才能自动算下次提醒']
  let guide
  if (/洗澡/.test(text)) guide = GROOMING_GUIDES.bath
  else if (/剪|指甲/.test(text)) guide = GROOMING_GUIDES.nail
  else if (/刷牙|牙/.test(text)) guide = GROOMING_GUIDES.dental
  else if (/耳/.test(text)) guide = GROOMING_GUIDES.ear
  else if (/梳毛|掉毛|毛/.test(text)) guide = GROOMING_GUIDES.coat
  if (guide) {
    title = guide.label === '洗澡' ? '洗澡护理' : guide.label
    verdict = `${guide.label}频率建议：${guide.frequency}。`
    actions = guide.actions
  }
  return compose({
    title: `🧼 ${title}：${profileText(ctx)}`,
    verdict,
    basis: [
      `洗澡 ${careDueText((ctx.care || {}).bath)}`,
      `刷牙 ${careDueText((ctx.care || {}).dental)}`,
      `剪指甲 ${careDueText((ctx.care || {}).nail)}`,
      '洗护不是越频繁越好，要看皮肤、气味、活动和应激'
    ],
    actions,
    warning: riskLine(ctx, question)
  })
}

function answerGroomingList(ctx, question) {
  const lines = Object.keys(GROOMING_GUIDES).map(key => {
    const item = GROOMING_GUIDES[key]
    return `${item.label}：${item.frequency}`
  })
  return compose({
    title: `🧴 日常洗护：${profileText(ctx)}`,
    verdict: '日常洗护建议按项目管理，不要把洗澡当成唯一护理。',
    basis: lines,
    actions: [
      '洗澡、刷牙、剪指甲、耳朵、梳毛分开记录',
      '刚打疫苗、腹泻、皮肤红痒、明显应激时先暂停洗澡',
      '任何护理都用短时多次和奖励建立配合'
    ],
    warning: riskLine(ctx, question)
  })
}

function answerSymptomList(ctx, question) {
  return compose({
    title: `🧯 常见不适处理：${profileText(ctx)}`,
    verdict: '常见不适可以先分级：轻微可记录观察，反复/加重/伴随精神差就要问兽医。',
    basis: SYMPTOM_GUIDES.map(item => `${item.title}：${item.mild}`).slice(0, 6),
    actions: [
      '先记录时间、次数、颜色/形态、有没有新食物或新环境',
      '同时看精神、食欲、饮水、排尿排便',
      '血便黑便、呼吸困难、抽搐昏迷、尿不出、持续呕吐不要在家硬扛'
    ],
    warning: riskLine(ctx, question)
  })
}

function normalizeHealthQuestion(question) {
  return String(question || '')
    .trim()
    .replace(/我家猫咪?|小猫咪?|猫猫/g, '猫')
    .replace(/我家狗狗?|小狗狗?|狗子/g, '狗')
    .replace(/吐了|吐过|吐出来|干呕/g, '呕吐')
    .replace(/没精神|精神不好|无精打采|蔫了/g, '精神差')
    .replace(/拉肚子|拉稀了/g, '腹泻')
    .replace(/便便软|软软的便/g, '软便')
}

function chineseNumber(value) {
  const map = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  return map[value] || 0
}

function extractHealthEntities(question, ctx) {
  const normalized = normalizeHealthQuestion(question)
  const numberMatch = normalized.match(/(\d+)\s*次/)
  const chineseMatch = normalized.match(/([一二两三四五六七八九十])\s*次/)
  const symptoms = [
    ['呕吐', /呕吐/],
    ['精神差', /精神差|嗜睡|虚弱/],
    ['腹泻', /腹泻|水样便/],
    ['软便', /软便/],
    ['血便', /血便|黑便/],
    ['呼吸异常', /呼吸困难|喘不上|喘得厉害/]
  ].filter(([, pattern]) => pattern.test(normalized)).map(([name]) => name)
  const species = /猫/.test(normalized) ? 'cat' : /狗/.test(normalized) ? 'dog' : (/猫|英短|美短|布偶|暹罗/.test(ctx.breed) ? 'cat' : 'dog')
  return {
    normalized,
    species,
    symptoms,
    frequency: numberMatch ? Number(numberMatch[1]) : (chineseMatch ? chineseNumber(chineseMatch[1]) : 0)
  }
}

function retrieveSymptomKnowledge(entities) {
  return SYMPTOM_GUIDES.filter(guide => entities.symptoms.some(symptom =>
    (symptom === '呕吐' && guide.title === '呕吐观察') ||
    (symptom === '精神差' && guide.title === '精神状态异常') ||
    ((symptom === '腹泻' || symptom === '软便' || symptom === '血便') && guide.title === '腹泻处理') ||
    (symptom === '呼吸异常' && guide.title === '呼吸道观察')
  ))
}

function assessSymptomRisk(entities, ctx) {
  const symptoms = entities.symptoms
  const hasGut = symptoms.includes('呕吐') || symptoms.includes('腹泻') || symptoms.includes('软便') || symptoms.includes('血便')
  const emergency = symptoms.includes('血便') || symptoms.includes('呼吸异常') || /昏迷|抽搐|站不稳|腹痛|肚子胀|尿不出/.test(entities.normalized)
  const combined = hasGut && symptoms.includes('精神差')
  const repeated = entities.frequency >= 2
  const recordRisk = ctx.today.stool.abnormalCount >= 2 || ctx.recentSevenDays.abnormalStools >= 3
  if (emergency) return 3
  if ((repeated && combined) || (combined && recordRisk) || (repeated && recordRisk)) return 2
  if (combined || repeated || recordRisk) return 1
  return 0
}

function analyzeHealthQuestion(ctx, question) {
  const entities = extractHealthEntities(question, ctx)
  const knowledge = retrieveSymptomKnowledge(entities)
  return {
    intent: knowledge.length ? 'symptom_query' : 'generic',
    entities,
    knowledge,
    riskLevel: assessSymptomRisk(entities, ctx)
  }
}

function answerStructuredSymptom(ctx, question) {
  const analysis = analyzeHealthQuestion(ctx, question)
  const { entities, knowledge, riskLevel } = analysis
  // 只有提取到组合症状或明确次数时才进入模板，普通单一问题仍走原有知识卡。
  if (!knowledge.length || (entities.symptoms.length < 2 && !entities.frequency)) return ''
  const animal = entities.species === 'cat' ? '猫咪' : '狗狗'
  const symptomText = entities.symptoms.filter(item => item !== '血便').join('、') || '不适'
  const primarySymptom = entities.symptoms.includes('呕吐') ? '呕吐' : symptomText
  const times = entities.frequency ? `已经${primarySymptom} ${entities.frequency} 次` : ''
  const recordHint = ctx.today.stool.abnormalCount ? `，今天还有 ${ctx.today.stool.abnormalCount} 次异常便便记录` : ''

  if (riskLevel >= 3) {
    return `${animal}${times ? `今天${times}` : `出现${symptomText}`}${entities.symptoms.includes('精神差') ? '，并伴随精神变差' : ''}${recordHint}，属于高风险信号，建议马上联系动物急诊。\n去前不要自行喂人药或催吐，带上误食物/药物包装、症状照片和发生时间。`
  }
  if (riskLevel === 2) {
    return `${animal}今天${times || `反复出现${symptomText}`}${entities.symptoms.includes('精神差') ? '，并伴随精神变差' : ''}${recordHint}，不建议继续在家反复观察，建议尽快联系兽医。\n先暂停零食和新食物，保持可自由饮水，并记录每次发生的时间和内容。`
  }
  if (riskLevel === 1) {
    return `${animal}${times ? `今天${times}` : ''}出现${symptomText}，需要密切观察变化。\n先暂停新食物和零食，保持饮水；如果继续发生，或出现拒食、精神变差、血便/黑便，就尽快联系兽医。`
  }
  return `${animal}目前是${symptomText}，先按轻微情况记录观察。\n今天重点看次数、食欲、饮水和精神；如果症状重复或加重，再及时联系兽医。`
}

function symptomTriage(ctx, question) {
  const text = String(question || '')
  const vomiting = /吐|呕吐|干呕/.test(text)
  const diarrhea = /拉稀|腹泻|软便|水样|便血|黑便/.test(text)
  const redFlag = /血|黑便|咖啡渣|黄绿|呼吸困难|站不稳|昏迷|抽搐|腹痛|肚子胀|尿不出|吞了|误食/.test(text)
  const systemic = /没精神|精神差|虚弱|不吃|拒食|发烧|发热|脱水/.test(text)
  const repeated = /反复|一直|持续|又吐|再吐|多次|第二次|第三次|[2-9]\s*次/.test(text)
  const recordRisk = ctx.today.stool.abnormalCount >= 2 || ctx.recentSevenDays.abnormalStools >= 3

  if (redFlag || (repeated && (vomiting || diarrhea)) || (systemic && (vomiting || diarrhea)) || recordRisk) {
    return {
      level: 'urgent',
      verdict: `${ctx.name}这次不建议只按轻微不适处理，${redFlag || systemic || repeated ? '出现了需要尽快评估的信号' : '近期异常记录偏多'}。`,
      action: '尽快联系兽医，并带上发生时间、次数、照片以及当天饮食和排便记录',
      warning: '出现血便/黑便、吐血、持续呕吐或腹泻、明显虚弱、呼吸异常、腹痛或尿不出时，请按急症处理。'
    }
  }

  if (vomiting || diarrhea) {
    return {
      level: 'observe',
      verdict: `目前更像需要密切观察的单次肠胃不适，先看${ctx.name}接下来有没有重复发生、精神变差或拒食。`,
      action: '先暂停新食物和零食，保持可自由饮水，不要自行喂人药'
    }
  }
  return null
}

function symptomFollowUp(question) {
  const text = String(question || '')
  if (/吐|呕吐|干呕/.test(text) && !/\d|一次|两次|多次|血|黄绿|精神|食欲/.test(text)) return '为了判断得更准：今天吐了几次，吐的是食物、黄水还是白沫？'
  if (/拉稀|腹泻|软便|便血|黑便/.test(text) && !/\d|血|黑|水样|精神|食欲/.test(text)) return '为了判断得更准：今天便便几次，是偏软、水样，还是有血/黑便？'
  return ''
}

function answerSymptomGuide(ctx, question) {
  const text = String(question || '')
  const guide = SYMPTOM_GUIDES.find(item => item.keys.some(key => text.includes(key)))
  if (!guide) return answerSymptomList(ctx, question)
  const triage = symptomTriage(ctx, question)
  const followUp = symptomFollowUp(question)
  return compose({
    title: `🩹 ${guide.title}：${profileText(ctx)}`,
    verdict: triage ? triage.verdict : guide.mild,
    basis: [`今天喂食 ${ctx.today.feed.totalGrams}g`, `饮水 ${ctx.today.water.totalMl}ml`, `便便异常 ${ctx.today.stool.abnormalCount} 次`],
    actions: [triage && triage.action, ...guide.actions, followUp],
    warning: triage && triage.warning ? triage.warning : guide.urgent
  })
}

function answerRecordGuide(ctx, question) {
  return compose({
    title: `📝 记录建议：${profileText(ctx)}`,
    verdict: '本地知识库越聪明，越依赖你每天留下的关键记录；不用写很多，但要稳定。',
    basis: [
      `今天已有喂食 ${ctx.today.feed.count} 条、饮水 ${ctx.today.water.count} 条、散步 ${ctx.today.walk.count} 条、便便 ${ctx.today.stool.count} 条`,
      `近 7 天有饮水记录 ${ctx.recentSevenDays.waterDays} 天、散步记录 ${ctx.recentSevenDays.walkDays} 天`
    ],
    actions: [
      '每天至少记：主粮总量、饮水总量、便便形态、散步时长',
      '异常时补充：时间、持续多久、有没有新食物、精神和食欲',
      '体重每周固定时间记一次，比每天随机称更有参考价值'
    ],
    warning: ''
  })
}

function answerPostCare(ctx, question) {
  const text = String(question || '')
  let title = '护理后观察'
  let verdict = '护理或医疗操作后，重点看精神、食欲、局部反应和持续时间。'
  let actions = ['当天减少剧烈运动', '记录时间、反应、食欲和精神', '异常持续或加重就联系兽医']
  if (/疫苗|打针/.test(text)) {
    title = '疫苗后观察'
    verdict = '疫苗后短时间轻微困倦、食欲略降可能出现，但严重过敏要马上处理。'
    actions = ['当天不要洗澡和剧烈运动', '观察脸肿、呼吸困难、频繁呕吐、虚弱等过敏信号', '精神差超过 24 小时或症状加重，联系兽医']
  } else if (/驱虫/.test(text)) {
    title = '驱虫后观察'
    verdict = '驱虫后可短暂软便或食欲波动，但频繁呕吐、血便、明显虚弱不正常。'
    actions = ['按体重和说明使用，不要叠加多种驱虫药', '观察 24-48 小时便便、食欲和精神', '如果吐药、严重腹泻或疑似过量，联系兽医']
  } else if (/术后|手术|伤口|拆线/.test(text)) {
    title = '术后伤口观察'
    verdict = '术后最重要是防舔咬、限制跳跃，并每天看伤口变化。'
    actions = ['戴好伊丽莎白圈，不让舔伤口', '限制跑跳爬楼，保持伤口干燥', '红肿加重、渗液、开裂、发热或明显疼痛要复诊']
  }
  return compose({
    title: `🩹 ${title}：${profileText(ctx)}`,
    verdict,
    basis: [`疫苗 ${careDueText((ctx.care || {}).vaccine)}`, `驱虫 ${careDueText((ctx.care || {}).deworming)}`, `今天食量 ${ctx.today.feed.totalGrams}g、饮水 ${ctx.today.water.totalMl}ml`],
    actions,
    warning: riskLine(ctx, question)
  })
}

function answerWeightPlan(ctx, question) {
  const target = ctx.today.feed.targetGrams || Math.round((ctx.weight || 10) * 22)
  return compose({
    title: `🎯 体重管理：${profileText(ctx)}`,
    verdict: '减肥不要靠突然断食，核心是稳定主粮、减少零食、增加低冲击活动。',
    basis: [`当前体重 ${ctx.weight || '未记录'}kg`, `今日喂食 ${ctx.today.feed.totalGrams}g，目标 ${target}g`, `近 7 天日均运动 ${ctx.recentSevenDays.walkAverageMinutes} 分钟`],
    actions: [
      '先把零食、餐桌食物和额外加餐减下来',
      '主粮按目标分餐，连续 2-4 周观察体重趋势',
      '增加嗅闻散步、找零食游戏等低冲击消耗，不建议突然高强度跑跳'
    ],
    warning: '如果短期快速消瘦、食欲异常、喝水明显变多或精神差，不要当成普通减肥处理。'
  })
}

function answerLifeStage(ctx, question) {
  const text = String(question || '')
  const isSenior = /老年|年纪大|高龄/.test(text) || ctx.stage === 'senior'
  const isPuppy = /幼犬|幼猫|小狗|小猫|刚到家|社会化/.test(text) || ctx.stage === 'puppy'
  if (isPuppy) {
    return compose({
      title: `🌱 幼年照护：${profileText(ctx)}`,
      verdict: '幼年阶段重点是规律作息、疫苗驱虫、社会化和温和训练。',
      basis: [`年龄 ${ctx.ageText}`, `今天喂食 ${ctx.today.feed.totalGrams}g`, `护理计划：疫苗 ${careDueText((ctx.care || {}).vaccine)}`],
      actions: ['少量多餐，别频繁换粮', '疫苗未完成前避免高风险犬群和不洁环境', '每天短时间做名字回应、召回、笼内/独处适应训练'],
      warning: '幼宠呕吐、腹泻、拒食、低血糖样虚弱要比成年宠更谨慎。'
    })
  }
  if (isSenior) {
    return compose({
      title: `🍂 老年照护：${profileText(ctx)}`,
      verdict: '老年宠物重点看体重、牙口、关节、饮水排尿、睡眠和恢复速度。',
      basis: [`年龄 ${ctx.ageText}`, `最近体重 ${ctx.weightTrend.latestKg || ctx.weight || '未记录'}kg`, `近 7 天日均饮水 ${ctx.recentSevenDays.waterAverageMl}ml`],
      actions: ['运动改成短时低冲击，避免跳高爬楼', '固定记录体重、饮水、尿量和精神', '建议定期体检，尤其牙齿、肾脏、心脏、关节'],
      warning: '突然消瘦、喝水尿尿明显变多、咳喘、跛行或夜间不安，要尽快检查。'
    })
  }
  return answerStatus(ctx, question)
}

function answerSleep(ctx, question) {
  return compose({
    title: `😴 睡眠观察：${profileText(ctx)}`,
    verdict: '睡得多不一定异常，但突然嗜睡、夜里烦躁或睡眠习惯大变要结合其他症状看。',
    basis: [`今天运动 ${ctx.today.walk.totalMinutes} 分钟`, `今天食量 ${ctx.today.feed.totalGrams}g、饮水 ${ctx.today.water.totalMl}ml`, stageAdvice(ctx)],
    actions: ['先看是否运动过量、天气热、应激或作息变化', '记录睡眠变化是否伴随拒食、呕吐、腹泻、咳喘或疼痛', '老年宠夜间徘徊、叫、睡眠颠倒建议检查疼痛、认知和内科问题'],
    warning: riskLine(ctx, question)
  })
}

function answerForeignBody(ctx, question) {
  return compose({
    title: `🧸 误吞异物/卡住：${profileText(ctx)}`,
    verdict: '误吞玩具、袜子、塑料、骨头或线绳，不建议在家盲目催吐或硬拉。',
    basis: ['异物可能造成卡喉、胃肠堵塞或划伤', `今天排便 ${ctx.today.stool.count} 次，异常 ${ctx.today.stool.abnormalCount} 次`],
    actions: ['记录吞了什么、大小、材质、时间', '如果线头露在嘴里或肛门，不要硬拽', '出现呕吐、腹痛、没精神、不排便、流口水或呼吸异常，马上就医'],
    warning: '卡住喘不上、持续呕吐、腹痛、吞了尖锐物/线绳/电池/磁铁，都要按急症处理。'
  })
}

function answerStress(ctx, question) {
  const text = String(question || '')
  let topic = '应激'
  let action = '减少刺激，给安全空间，用短时可退出的方式慢慢适应。'
  if (/雷|打雷|烟花|鞭炮/.test(text)) {
    topic = '雷雨/烟花应激'
    action = '提前关窗拉帘，开白噪音，准备躲藏点；不要强行抱出来面对声音。'
  } else if (/独处|分离|上班|离开/.test(text)) {
    topic = '分离焦虑'
    action = '从几分钟独处开始训练，离开和回来都保持平静，增加嗅闻玩具和安全咀嚼。'
  } else if (/新家|搬家|寄养|陌生/.test(text)) {
    topic = '环境变化应激'
    action = '先固定小范围安全区，保留旧垫子/玩具/气味，饮食不要同时变化。'
  }
  return compose({
    title: `🌧️ ${topic}：${profileText(ctx)}`,
    verdict: `${ctx.name}遇到${topic}时，重点是降低刺激和建立可预测感。`,
    basis: [`今天运动 ${ctx.today.walk.totalMinutes} 分钟`, `近 7 天日均运动 ${ctx.recentSevenDays.walkAverageMinutes} 分钟`, stageAdvice(ctx)],
    actions: [action, '不要用惩罚处理害怕行为', '如果伴随拒食、腹泻、持续躲藏或攻击行为，建议咨询兽医或行为医生'],
    warning: riskLine(ctx, question)
  })
}

function answerScenarioPack(ctx, question) {
  const text = String(question || '')
  const pack = matchScenario(text)
  if (!pack) return answerGeneric(ctx, question)
  const extras = SCENARIO_DETAIL_EXTRAS[pack.title] || {}
  const base = compose({
    title: `${pack.icon || '📌'} ${pack.title}：${profileText(ctx)}`,
    verdict: pack.verdict,
    basis: [
      ...pack.basis,
      `结合档案：${ctx.name} ${ctx.ageText}，当前体重 ${ctx.weight || '未记录'}kg`,
      `今天记录：喂食 ${ctx.today.feed.totalGrams}g、饮水 ${ctx.today.water.totalMl}ml、运动 ${ctx.today.walk.totalMinutes} 分钟、异常便便 ${ctx.today.stool.abnormalCount} 次`
    ],
    actions: pack.actions,
    warning: pack.warning || riskLine(ctx, question)
  })
  const detailParts = []
  if (extras.check && extras.check.length) detailParts.push(`先判断：${extras.check.join('；')}。`)
  if (extras.routine && extras.routine.length) detailParts.push(`日常做法：${extras.routine.join('；')}。`)
  if (extras.record && extras.record.length) detailParts.push(`记录重点：${extras.record.join('；')}。`)
  return [base, ...detailParts].join('\n')
}

function answerGeneric(ctx, question) {
  const expert = getExpertSystem()
  const expertAnswer = expert && expert.answer(question, ctx)
  if (expertAnswer && expertAnswer.score >= 12) return expertAnswer.text
  const status = answerStatus(ctx, question)
  return `${status}\n如果你想让我再细看，可以直接问喝水、体重、便便、能不能吃，或者下一次护理时间。`
}

function normalizeHistory(history) {
  return (Array.isArray(history) ? history : [])
    .filter(item => item && typeof item === 'object' && item.text)
    .map(item => ({ role: item.role || '', text: String(item.text || '').trim() }))
    .filter(item => item.text)
    .slice(-10)
}

function hasStandaloneTopic(text) {
  return /饮水|喝水|喂食|吃|食物|狗粮|猫粮|零食|散步|运动|活动|便便|拉稀|软便|吐|呕吐|干呕|体重|洗澡|疫苗|驱虫|刷牙|剪指甲|耳朵|眼睛|口臭|尿|发烧|中暑|绝育|术后|咬|虫|蜱|跳蚤|应激|睡|嗜睡|睡觉|睡眠|吞|误吞|异物|玩具|被子|塑料|品种|寿命|性格|照片|相册|记录|提醒|用品|余量|天气|夏天|冬天|雨天|出门|上班|独自在家/.test(text)
}

function isFollowUpQuestion(text) {
  const cleaned = String(text || '').trim()
  if (!cleaned) return false
  if (/^(那|这个|这些|它|他|她|这种|这样|刚才|上面|前面)/.test(cleaned)) return true
  if (/^(还要|还需|继续|后面|之后|接下来|然后)/.test(cleaned) && cleaned.length <= 18 && !hasStandaloneTopic(cleaned)) return true
  return cleaned.length <= 8 && /呢|吗|咋办|怎么办|多少|多久/.test(cleaned) && !hasStandaloneTopic(cleaned)
}

function enrichQuestionWithContext(question, history) {
  const current = String(question || '').trim()
  if (!current || !isFollowUpQuestion(current)) return current
  const turns = normalizeHistory(history)
  const lastTurn = turns[turns.length - 1]
  const previousUsers = turns
    .slice(0, lastTurn && lastTurn.role === 'user' && lastTurn.text === current ? -1 : turns.length)
    .filter(item => item.role === 'user' && item.text !== current)
  const lastUser = previousUsers[previousUsers.length - 1]
  if (!lastUser) return current
  return `${lastUser.text}。追问：${current}`
}

function isAdditiveSymptomUpdate(question, history) {
  const current = String(question || '').trim()
  if (!/(也|又|还|再次|早上|中午|晚上|刚才|刚刚|刚|第二次|第三次)/.test(current)) return false
  if (!/(吐|呕吐|拉稀|腹泻|软便|咳|咳嗽|喷嚏|没精神|嗜睡)/.test(current)) return false
  const turns = normalizeHistory(history)
  // 当前这句在发送时已写入聊天记录，不能把它自己当成“前文症状”。
  const recentText = turns.filter(item => item.text !== current).slice(-6).map(item => item.text).join(' ')
  return /(吐|呕吐|拉稀|腹泻|软便|咳|咳嗽|喷嚏|没精神|嗜睡|不适|观察)/.test(recentText)
}

function answerAdditiveSymptomUpdate(ctx, question) {
  const text = String(question || '')
  if (/吐|呕吐/.test(text)) {
    return compose({
      title: `⚠️ 呕吐次数增加：${profileText(ctx)}`,
      verdict: `${ctx.name}不是“偶尔吐了一次”了，你补充说“${text}”，说明同一天或近段时间有反复呕吐倾向，风险要按更高一档看。`,
      basis: [
        `今天喂食 ${ctx.today.feed.totalGrams}g`,
        `饮水 ${ctx.today.water.totalMl}ml`,
        `便便异常 ${ctx.today.stool.abnormalCount} 次`,
        `年龄 ${ctx.ageText}，体重 ${ctx.weight || '未记录'}kg`
      ],
      actions: [
        '先暂停零食、新食物和大餐，别继续喂复杂东西',
        '少量多次给水，别一次灌很多；如果喝水也吐，别硬喂',
        '记录每次呕吐时间、内容物颜色、是否有血/异物、精神和腹部疼痛',
        '如果今天已经吐 2 次以上，建议尽快联系兽医确认是否需要检查或止吐补液'
      ],
      warning: '持续呕吐、吐血、黄绿色液体、明显腹痛、精神差、拒食、幼宠/老年宠反复吐，都不要只在家观察。'
    })
  }
  if (/拉稀|腹泻|软便/.test(text)) {
    return compose({
      title: `⚠️ 排便异常次数增加：${profileText(ctx)}`,
      verdict: `你补充说“${text}”，如果不是单次软便，而是反复拉稀/软便，就要重点看脱水、精神和是否伴随呕吐。`,
      basis: [`今天喂食 ${ctx.today.feed.totalGrams}g`, `饮水 ${ctx.today.water.totalMl}ml`, `近 7 天异常便便 ${ctx.recentSevenDays.abnormalStools} 次`],
      actions: ['暂停新零食和新食物', '记录次数、颜色、是否水样/带血/带黏液', '保持饮水，别乱用人药', '次数增加或伴随呕吐、没精神时联系兽医'],
      warning: '血便、黑便、水样多次、幼宠/老年宠腹泻、同时呕吐或虚弱，都要尽快就医。'
    })
  }
  return answerSymptomGuide(ctx, question)
}

function hasEscalatingSymptomText(question) {
  const text = String(question || '')
  const gutSymptom = /吐|呕吐|干呕|拉稀|腹泻|软便|水样|便血|黑便/.test(text)
  const escalation = /反复|一直|持续|又吐|再吐|多次|第二次|第三次|[2-9]\s*次|没精神|精神差|虚弱|不吃|拒食|血|黑便|咖啡渣|黄绿|腹痛|肚子胀/.test(text)
  return gutSymptom && escalation
}

function isMedicationIngestion(text) {
  return /误食.*药|吃了.*药|吞了.*药|人药|药片|胶囊/.test(String(text || ''))
}

function isMedicationRecordQuery(text) {
  const value = String(text || '')
  // 「该吃什么药」「能用什么药」是在要建议，不是查档案。这类词一出现就不算记录查询，
  // 否则下面放宽线索词之后会把求助误判成查记录。
  if (/该吃|该用|应该吃|应该用|能吃|能用|可以吃|可以用|能不能|可不可以|要不要|推荐|怎么用|用多少|剂量/.test(value)) return false
  const asksWhichMedicine = /什么药|哪种药|哪个药|药名|有没有.*药|用的什么药|在吃药吗|吃药吗|用药吗|在用药/.test(value)
  // 「在用什么药吗」没有“最近/现在”这种显式时间词，但“在用/在吃”同样是在问当下的状态
  const recordCue = /记录|档案|历史|最近|目前|现在|正在|在用|在吃|查一下|查查|找一下|找找/.test(value)
  return asksWhichMedicine && recordCue
}

function isUrinaryEmergency(text) {
  return /尿不出|尿闭|频繁蹲.*无尿|蹲猫砂盆.*尿不出|公猫.*尿不出/.test(String(text || ''))
}

function isPostCareQuestion(text) {
  return /疫苗后|打完疫苗|打针后|驱虫后|吃完驱虫|术后|手术后|伤口|拆线/.test(String(text || ''))
}

function hasCompoundHealthConcern(text) {
  const value = String(text || '')
  const vomitingWithLowWater = /(吐|呕吐|干呕)/.test(value) && /(不喝水|没喝水|喝不下水)/.test(value)
  const anorexiaWithLowEnergy = /(不吃饭|没吃饭|不吃东西|拒食|没胃口)/.test(value) && /(没精神|精神差|虚弱|嗜睡)/.test(value)
  return vomitingWithLowWater || anorexiaWithLowEnergy
}

function detectIntent(question) {
  const text = String(question || '').trim()
  if (!text) return 'generic'
  // 高风险和明确医疗语义必须先于“吃”“场景包”等宽泛关键词。
  if (isMedicationIngestion(text)) return 'danger'
  if (isUrinaryEmergency(text)) return 'urine'
  if (/中暑|高温|太热|热晕/.test(text) && /一直喘|持续喘|喘得厉害|呼吸困难/.test(text)) return 'heat'
  if (/木糖醇|老鼠药|清洁剂/.test(text)) return 'supplementEmergency'
  if (DANGER_WORDS.some(word => text.includes(word))) return 'danger'
  if (isMedicationRecordQuery(text)) return 'medicineRecord'
  if (isPostCareQuestion(text)) return 'postCare'
  // “上次/下次刷牙、疫苗、驱虫”等是在查护理档案，必须早于“牙痛/口腔症状”等健康词。
  if (requestedCareKey(text) && /上次|最近一次|上回|最后一次|下次|什么时候|何时|到期|提醒|周期|历史|记录/.test(text)) return 'care'
  if (/吃什么药|用什么药|吃药|用药|药物|药剂|剂量|驱虫药|消炎药|止痛药/.test(text)) return 'medicine'
  if (FOOD_UNSAFE.some(item => item.keys.some(key => text.includes(key)))) return 'foodSafety'
  if (hasCompoundHealthConcern(text)) return 'symptomGuide'
  if (hasEscalatingSymptomText(text) && !/症状索引|观察什么|观察哪些|危险信号|风险|要看什么/.test(text)) return 'symptomGuide'
  if (/感冒|着凉|流清鼻涕|鼻塞/.test(text)) return 'symptomGuide'
  if (matchSupplementEmergency(text)) return 'supplementEmergency'
  // 带“筛选/推荐/对比”的购物问题要先进入推荐目录；普通训练零食问题仍走原有知识场景。
  const recommendation = recommendationIntent(text)
  if (recommendation) return `recommendation:${recommendation}`
  if (shouldUseScenarioFirst(text)) return 'scenarioPack'
  if (matchSupplementFood(text)) return 'supplementFood'
  const asksFoodSafety = /能不能吃|可以吃|能吃|不能吃|能吃的|不能吃的|禁食|食物|水果|蔬菜|对.*好|吃什么好|好的食物|毛发.*食物|肠胃.*食物|巧克力|葡萄|洋葱|牛奶|鸡蛋|南瓜|骨头|木糖醇|牛油果|鸡胸肉|苹果|香蕉|酸奶|红薯|蓝莓|西瓜|胡萝卜|西兰花|鱼油|益生菌/.test(text)
  if (asksFoodSafety) return 'foodSafety'
  if (/吃了|误食/.test(text) && FOOD_UNSAFE.some(item => item.keys.some(key => text.includes(key)))) return 'foodSafety'
  if (matchSupplementReminder(text) && /提醒|多久|周期|计划|检查|记录/.test(text)) return 'supplementReminder'
  if (matchSupplementSymptom(text) && /索引|观察什么|观察哪些|危险信号|风险|要看什么/.test(text)) return 'supplementSymptom'
  if (/尿血|血尿|尿不出|尿闭|尿少|尿黄|尿尿|小便|频繁蹲|猫砂|尿垫|舔尿道/.test(text)) return 'urine'
  if (/饮水|喝水|水分|补水/.test(text)) return 'water'
  if (/中暑|体温|发烧|高温|太热|热晕|一直喘|喘得厉害/.test(text)) return 'heat'
  if (/出行|旅行|寄养|坐车|托运|搬家|应激/.test(text)) return 'travel'
  if (isPostCareQuestion(text)) return 'postCare'
  if (/绝育|发情|来姨妈|配种|怀孕|生宝宝/.test(text)) return 'reproductive'
  if (/减肥|减重|太胖|肥胖|控制体重|瘦身/.test(text)) return 'weightPlan'
  if (/不吃饭|不吃东西|拒食|没胃口/.test(text)) return 'feed'
  if (/老年|年纪大|高龄|幼犬|幼猫|小狗|小猫|刚到家|社会化/.test(text)) return 'lifeStage'
  if (/睡觉|睡眠|嗜睡|睡太多|不睡|夜里|半夜/.test(text)) return 'sleep'
  if (/误吞|吞了|吃了玩具|吃了袜子|卡住|异物|塑料|线绳|电池|磁铁/.test(text)) return 'foreignBody'
  if (/打雷|雷雨|烟花|鞭炮|分离焦虑|独处|上班|离开|新家|搬家应激/.test(text)) return 'stress'
  if (/怎么记|记录什么|记录哪些|要记|日志|数据不够/.test(text)) return 'recordGuide'
  if (/狗粮|猫粮|余量|补货|用品|零食(?:还|有|剩|能).*(?:多少|几天|余)|零食.*(?:还|有|剩|多少|余)|(?:还|剩).*(?:零食|狗粮|猫粮|主粮)|(?:狗粮|猫粮|主粮|零食).*(?:还有|还剩|剩余|多少|几天)|还剩多少|剩多少|能吃几天/.test(text)) return 'supply'
  if (/喂|吃|粮|饭|挑食|食欲|零食|换粮|主粮/.test(text)) return 'feed'
  if (/散步|运动|活动|遛|出门|跑|走多久|运动量|活动时间|玩多久/.test(text)) return 'walk'
  if (/常见.*不适|不适症状|解决方法|怎么处理|处理方法/.test(text)) return 'symptomList'
  if (/呕吐|吐了|咳嗽|打喷嚏|流鼻涕|没精神|精神差|嗜睡|皮肤痒|掉毛|红疹|皮屑|舔爪/.test(text)) return 'symptomGuide'
  if (matchSupplementSymptom(text)) return 'supplementSymptom'
  if (/便|拉|腹泻|肚子|软便|稀便|便秘|肠胃/.test(text)) return 'stool'
  if (/体重|胖|瘦|增重|减重|趋势/.test(text)) return 'weight'
  if (/吃药|用药|药|剂量|驱虫药|消炎|止痛/.test(text)) return 'medicine'
  if (/虫咬|叮咬|蜱|跳蚤|蚊|皮肤|红肿|痒/.test(text)) return 'bite'
  if (/耳朵|甩头|眼屎|流泪|口臭|牙结石|牙龈|眼|耳|牙/.test(text)) return 'symptom'
  if (/什么时候|多久|到期|提醒|计划|下次/.test(text) && /驱虫|疫苗|洗澡|刷牙|牙|指甲|护理/.test(text)) return 'care'
  if (/日常洗护|洗护项目|洗护有哪些|洗护怎么安排/.test(text)) return 'groomingList'
  if (/怎么洗|怎么剪|怎么刷|洗澡怎么|剪指甲怎么|刷牙怎么|操作|步骤|梳毛|耳朵清洁/.test(text)) return 'grooming'
  if (/驱虫|疫苗|牙|护理|生日|用药记录/.test(text)) return 'care'
  if (matchScenario(text)) return 'scenarioPack'
  if (matchSupplementTip(text) || /营养|饮食|主粮|干粮|湿粮|蛋白|脂肪|钙磷|牛磺酸|社会化|适老化|益智游戏|嗅闻游戏|宠物友好酒店|托运/.test(text)) return 'supplementTip'
  if (/叫|吠|咬|拆|害怕|焦虑|发抖|躲|行为|训练/.test(text)) return 'behavior'
  if (/今天|状态|健康|怎么样|正常吗|建议|安排|计划/.test(text)) return 'status'
  return 'generic'
}

function createReply(question, pet, options = {}) {
  const ctx = buildPetContext(pet)
  const originalQuestion = String(question || '').trim()
  const history = normalizeHistory(options.history)
  const structuredSymptomReply = answerStructuredSymptom(ctx, originalQuestion)
  if (structuredSymptomReply) return structuredSymptomReply
  if (isAdditiveSymptomUpdate(originalQuestion, history)) {
    activeReplyMeta = { ctx, question: originalQuestion, originalQuestion, history, additive: true }
    return answerAdditiveSymptomUpdate(ctx, originalQuestion)
  }
  question = enrichQuestionWithContext(originalQuestion, history)
  activeReplyMeta = { ctx, question, originalQuestion, history, followup: question !== originalQuestion }
  const intent = detectIntent(question)
  // 只能由当前这句话触发“对比”，不能带入上一轮的对比关键词。
  // 「对比两款主粮」问的是商品，不是记录。加入“对比”一词后这类问句会被
  // 记录对比截胡，所以商品对比优先。
  if (isComparisonQuestion(originalQuestion) && intent !== 'recommendation:compare') return answerComparison(ctx, originalQuestion)
  // 问句自带时间范围（最近七天/这周/近一个月）时，按那段时间统计，而不是回落成今天。
  const askedRange = detectTimeRange(originalQuestion)
  if (askedRange) {
    const rangeTopic = rangeTopicOf(question, intent)
    if (rangeTopic) return answerRange(ctx, originalQuestion, rangeTopic, askedRange)
  }
  if (intent === 'danger') {
    return compose({
      title: `⚠️ 紧急判断：${profileText(ctx)}`,
      verdict: '你描述里出现了高风险信号，本地知识库不能替代急诊判断。',
      basis: [`今天记录：喂食 ${ctx.today.feed.totalGrams}g、饮水 ${ctx.today.water.totalMl}ml、排便异常 ${ctx.today.stool.abnormalCount} 次`],
      actions: ['立即联系兽医或动物急诊', '带上误食物/药物包装或照片', '记录发生时间、数量、症状变化'],
      warning: '如果有呼吸困难、抽搐、昏迷、持续呕吐、血便/黑便，不要等。'
    })
  }
  if (intent === 'supplementEmergency') return answerSupplementEmergency(ctx, question)
  const breedKnowledgeAnswer = answerExternalBreed(ctx, question)
  if (breedKnowledgeAnswer) return breedKnowledgeAnswer
  if (intent === 'supplementFood') return answerSupplementFood(ctx, question)
  if (intent === 'foodSafety') return answerFoodSafety(ctx, question)
  if (intent.indexOf('recommendation:') === 0) return answerRecommendation(ctx, question, intent.slice('recommendation:'.length))
  if (intent === 'water') return answerWater(ctx, question)
  if (intent === 'feed') return answerFeed(ctx, question)
  if (intent === 'walk') return answerWalk(ctx, question)
  if (intent === 'stool') return answerStool(ctx, question)
  if (intent === 'weight') return answerWeight(ctx, question)
  if (intent === 'medicineRecord') return answerMedicationRecord(ctx)
  if (intent === 'medicine') return answerMedicine(ctx, question)
  if (intent === 'bite') return answerBite(ctx, question)
  if (intent === 'urine') return answerUrine(ctx, question)
  if (intent === 'heat') return answerHeat(ctx, question)
  if (intent === 'travel') return answerTravel(ctx, question)
  if (intent === 'postCare') return answerPostCare(ctx, question)
  if (intent === 'reproductive') return answerReproductive(ctx, question)
  if (intent === 'weightPlan') return answerWeightPlan(ctx, question)
  if (intent === 'lifeStage') return answerLifeStage(ctx, question)
  if (intent === 'sleep') return answerSleep(ctx, question)
  if (intent === 'foreignBody') return answerForeignBody(ctx, question)
  if (intent === 'stress') return answerStress(ctx, question)
  if (intent === 'grooming') return answerGrooming(ctx, question)
  if (intent === 'groomingList') return answerGroomingList(ctx, question)
  if (intent === 'recordGuide') return answerRecordGuide(ctx, question)
  if (intent === 'symptomList') return answerSymptomList(ctx, question)
  if (intent === 'symptomGuide') return answerSymptomGuide(ctx, question)
  if (intent === 'supplementSymptom') return answerSupplementSymptom(ctx, question)
  if (intent === 'symptom') return answerSymptom(ctx, question)
  if (intent === 'care') return answerCare(ctx, question)
  if (intent === 'supplementReminder') return answerSupplementReminder(ctx, question)
  if (intent === 'supply') return answerSupply(ctx, question)
  if (intent === 'scenarioPack') return answerScenarioPack(ctx, question)
  if (intent === 'supplementTip') return answerSupplementTip(ctx, question)
  if (intent === 'status') return answerStatus(ctx, question)
  if (intent === 'behavior') return answerBehavior(ctx, question)
  return answerGeneric(ctx, question)
}

module.exports = {
  buildPetContext,
  createReply,
  detectIntent,
  normalizeHealthQuestion,
  extractHealthEntities,
  analyzeHealthQuestion
}
