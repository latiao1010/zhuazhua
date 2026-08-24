// 由评分卡提取结果同步生成；请通过同步脚本覆盖更新，不保留旧的模拟主粮目录。
const PET_FOOD_SKUS = [
  {
    "id": "scorecard-sku-001",
    "brand": "渴望",
    "name": "无谷鸡肉全犬粮",
    "fullName": "渴望 无谷鸡肉全犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "无谷",
      "高蛋白"
    ],
    "marketPrice": "43-50元/斤",
    "ingredients": "鲜鸡肉、鲜火鸡肉、鲜全蛋",
    "advantages": "原料透明、高蛋白低碳水",
    "disadvantages": "碳水化合物含量虚标",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-002",
    "brand": "渴望",
    "name": "无谷六种鱼全犬粮",
    "fullName": "渴望 无谷六种鱼全犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "无谷"
    ],
    "marketPrice": "46~60元/斤",
    "ingredients": "鲜沙丁鱼、鲜鲭鱼、鲜鳕鱼",
    "advantages": "原料透明、蛋白低碳水",
    "disadvantages": "碳水化合物和粗灰分虚标",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-003",
    "brand": "纽翠斯",
    "name": "冻干鸡肉全犬粮",
    "fullName": "纽翠斯 冻干鸡肉全犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段"
    ],
    "marketPrice": "",
    "ingredients": "去骨鸡肉、去骨火鸡、鸡肉粉",
    "advantages": "蛋白质来源优、含冻干、螯合矿物质",
    "disadvantages": "找不出",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-004",
    "brand": "纽顿",
    "name": "T28去骨鳟鱼全犬粮",
    "fullName": "纽顿 T28去骨鳟鱼全犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段"
    ],
    "marketPrice": "43-55元/斤",
    "ingredients": "去骨鳟鱼、三文鱼粉、鲱鱼粉、豌豆",
    "advantages": "气味宜人、螯合矿物质更易吸收",
    "disadvantages": "原料占比不明",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-005",
    "brand": "加卉",
    "name": "无骨鸭肉全犬粮",
    "fullName": "加卉 无骨鸭肉全犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段"
    ],
    "marketPrice": "70~110元/斤",
    "ingredients": "鸭肉、猪肝、鸡蛋、大麦芽苗菜",
    "advantages": "骗人的！全是骗人的！",
    "disadvantages": "除了番薯啥也没有…",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-006",
    "brand": "Stella&Chew",
    "name": "猎鸟冻干犬粮",
    "fullName": "Stella&Chew 猎鸟冻干犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段"
    ],
    "marketPrice": "45-81元/斤",
    "ingredients": "鸡肉、鸡肉粉、鹰嘴豆、豌豆",
    "advantages": "蛋白质来源丰富、含冻干",
    "disadvantages": "原料占比不明、未公布供应商",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-007",
    "brand": "爱肯拿",
    "name": "鸭肉梨全犬粮",
    "fullName": "爱肯拿 鸭肉梨全犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段"
    ],
    "marketPrice": "38~54元/斤",
    "ingredients": "鲜鸭肉18%、鸭肉粉17%、豌豆",
    "advantages": "原料来源及占比清晰、Ω386配比优秀",
    "disadvantages": "屎肠球菌活菌(争议)、能量虚标",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-008",
    "brand": "纽顿T28",
    "name": "全价犬粮鲑鱼&鳟鱼配方",
    "fullName": "纽顿T28 全价犬粮鲑鱼&鳟鱼配方",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段"
    ],
    "marketPrice": "41-49元/斤",
    "ingredients": "鳟鱼、鲜鱼粉、鲜鱼粉、豌豆、鹰嘴豆",
    "advantages": "营养水平和品控都不错",
    "disadvantages": "粗灰分/透明度仍有优化空间",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-009",
    "brand": "纽顿",
    "name": "S7成犬粮",
    "fullName": "纽顿 S7成犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "成年"
    ],
    "marketPrice": "40~53元/斤",
    "ingredients": "鸡肉粉、鸡肉、燕麦",
    "advantages": "品控佳，无植物蛋白粉，营养适中",
    "disadvantages": "非无粮，含甜菜",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-010",
    "brand": "纽顿",
    "name": "S11幼犬粮",
    "fullName": "纽顿 S11幼犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "幼年"
    ],
    "marketPrice": "40~55元/斤",
    "ingredients": "鸡肉粉、鸡肉、鸡蛋、燕麦",
    "advantages": "品控佳，无植物蛋白粉，营养适中",
    "disadvantages": "非无粮，含甜菜",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-011",
    "brand": "渴望",
    "name": "高龄犬粮",
    "fullName": "渴望 高龄犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "老年",
      "高蛋白"
    ],
    "marketPrice": "",
    "ingredients": "新鲜鸡肉、新鲜全蛋、新鲜火鸡肉",
    "advantages": "高蛋白低淀粉、纤维丰富、低升糖",
    "disadvantages": "争议性原料屎肠球菌",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-012",
    "brand": "奥云宝",
    "name": "鸡肉小型成犬粮",
    "fullName": "奥云宝 鸡肉小型成犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "成年"
    ],
    "marketPrice": "43元/斤",
    "ingredients": "鸡肉、大麦、燕麦粉、鸡肉粉",
    "advantages": "拥有各国人民都能读懂的原料表",
    "disadvantages": "营养价值超低、高碳水",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-013",
    "brand": "欧恩焙",
    "name": "无谷鸡肉小型全犬粮",
    "fullName": "欧恩焙 无谷鸡肉小型全犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "无谷"
    ],
    "marketPrice": "58-76元/斤",
    "ingredients": "鲜鸡肉(37%)、鸡肉粉(17.6%)",
    "advantages": "低温烘焙、营养水平较高",
    "disadvantages": "透明度待提高、使用纯粹的植物蛋白。",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-014",
    "brand": "欧恩焙",
    "name": "无谷鸡肉全猫粮",
    "fullName": "欧恩焙 无谷鸡肉全猫粮",
    "type": "主粮",
    "species": "cat",
    "tags": [
      "猫咪",
      "全阶段",
      "无谷",
      "高蛋白"
    ],
    "marketPrice": "",
    "ingredients": "鲜鸡肉、鲱鱼粉、鸡肉粉、扁豆",
    "advantages": "高蛋白、超低淀粉、低温烘焙",
    "disadvantages": "粗灰分超标",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-015",
    "brand": "欧恩焙",
    "name": "无谷鸭肉小型犬犬粮",
    "fullName": "欧恩焙 无谷鸭肉小型犬犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "无谷"
    ],
    "marketPrice": "58-76元",
    "ingredients": "鲜鸭肉、木薯粉、鸭肉粉、鲑鱼粉",
    "advantages": "低温烘焙、品控佳",
    "disadvantages": "透明度有待提高",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-016",
    "brand": "纽顿",
    "name": "T27鸡肉火鸡肉全价犬粮",
    "fullName": "纽顿 T27鸡肉火鸡肉全价犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段"
    ],
    "marketPrice": "37~45元/斤",
    "ingredients": "鸡肉粉、鸡肉、火鸡肉、豌豆",
    "advantages": "低升糖，品控优",
    "disadvantages": "透明度有待加强",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-017",
    "brand": "纽顿",
    "name": "T28鲑鱼&鳟鱼全价犬粮",
    "fullName": "纽顿 T28鲑鱼&鳟鱼全价犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段"
    ],
    "marketPrice": "37-45元/斤",
    "ingredients": "鳟鱼、鲑鱼粉、鲱鱼粉、豌豆",
    "advantages": "低升糖，美毛",
    "disadvantages": "粗灰分超标",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-018",
    "brand": "枫趣",
    "name": "鸭肉甜橙无谷成犬粮",
    "fullName": "枫趣 鸭肉甜橙无谷成犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "成年",
      "无谷"
    ],
    "marketPrice": "33~53元/斤",
    "ingredients": "新鲜鸭肉(19%)，鸡肉粉，马铃薯",
    "advantages": "卫生过关、自有工厂",
    "disadvantages": "大豆卵磷脂、粗灰分超出承诺值",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-019",
    "brand": "渴望",
    "name": "小型犬全价犬粮",
    "fullName": "渴望 小型犬全价犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段"
    ],
    "marketPrice": "80-100元/斤",
    "ingredients": "火鸡肉、鸡肉、火鸡肝、鸡肝",
    "advantages": "营养水平和品控都不错",
    "disadvantages": "添加争议性原料屎肠球菌",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-020",
    "brand": "天然百利",
    "name": "生鲜健康体态成犬粮",
    "fullName": "天然百利 生鲜健康体态成犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "成年",
      "体重管理",
      "高蛋白"
    ],
    "marketPrice": "45-68元/斤",
    "ingredients": "鸡肉、火鸡肉粉、豌豆、鸡肉粉",
    "advantages": "优质高蛋白、油脂含量适中",
    "disadvantages": "国内仓储堪忧，多发破包生虫事件",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-021",
    "brand": "百利本能",
    "name": "高蛋白鸡肉配方成猫粮",
    "fullName": "百利本能 高蛋白鸡肉配方成猫粮",
    "type": "主粮",
    "species": "cat",
    "tags": [
      "猫咪",
      "成年",
      "肠胃敏感",
      "高蛋白"
    ],
    "marketPrice": "60-90元/斤",
    "ingredients": "鸡肉、木薯淀粉、鸡脂肪、亚麻籽",
    "advantages": "高蛋白低淀粉高能量、低敏",
    "disadvantages": "高磷、缺乏动物性omega3",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-022",
    "brand": "百利本能",
    "name": "高蛋白鸡肉配方成犬粮",
    "fullName": "百利本能 高蛋白鸡肉配方成犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "成年",
      "高蛋白"
    ],
    "marketPrice": "50-75元/斤",
    "ingredients": "鸡肉、木薯淀粉、鸡脂肪、亚麻籽",
    "advantages": "蛋白质来源佳、高蛋白低淀粉",
    "disadvantages": "钙磷含量超标、粗灰分较高",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-023",
    "brand": "维采",
    "name": "火鸡三文鱼全猫粮",
    "fullName": "维采 火鸡三文鱼全猫粮",
    "type": "主粮",
    "species": "cat",
    "tags": [
      "猫咪",
      "全阶段"
    ],
    "marketPrice": "",
    "ingredients": "去骨火鸡、去骨三文鱼、鹰嘴豆",
    "advantages": "粗蛋白来源理想",
    "disadvantages": "品控不足、淀粉含量较高",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-024",
    "brand": "维采",
    "name": "原味鸡糙米全犬粮",
    "fullName": "维采 原味鸡糙米全犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段"
    ],
    "marketPrice": "",
    "ingredients": "有机脱骨鸡肉、鸡肉粉、糙米",
    "advantages": "粗蛋白来源理想",
    "disadvantages": "粗纤维来源不理想、主原料透明度低",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-025",
    "brand": "wellnesscore",
    "name": "火鸡三文鱼小型成犬粮",
    "fullName": "wellnesscore 火鸡三文鱼小型成犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "成年",
      "肠胃敏感",
      "高蛋白"
    ],
    "marketPrice": "47-67元/斤",
    "ingredients": "去骨火鸡肉、火鸡肉粉、鸡肉粉",
    "advantages": "高蛋白高能量低碳水、相对低敏",
    "disadvantages": "主要原料未提供占比和溯源信息",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-026",
    "brand": "福摩",
    "name": "无谷猎鸟全犬粮",
    "fullName": "福摩 无谷猎鸟全犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "无谷"
    ],
    "marketPrice": "40~69元/斤",
    "ingredients": "鸭肉、鸭肉粉、豌豆、火鸡",
    "advantages": "螯合矿物质、安全性高",
    "disadvantages": "含有植物蛋白原料",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-027",
    "brand": "福摩",
    "name": "三鱼蔬菜犬粮",
    "fullName": "福摩 三鱼蔬菜犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段"
    ],
    "marketPrice": "",
    "ingredients": "三文鱼、豌豆、鲱鱼、鹰嘴豆",
    "advantages": "安全性、蛋白质来源理想",
    "disadvantages": "高碳水化合物",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-028",
    "brand": "麻利",
    "name": "黑金三文鱼成犬粮",
    "fullName": "麻利 黑金三文鱼成犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "成年",
      "肠胃敏感"
    ],
    "marketPrice": "",
    "ingredients": "去骨三文鱼、三文鱼粉、白鱼粉",
    "advantages": "低敏、含冻干颗粒",
    "disadvantages": "不可溯源、添加植物蛋白",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-029",
    "brand": "麻利",
    "name": "无谷三文鱼成犬粮",
    "fullName": "麻利 无谷三文鱼成犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "成年",
      "无谷",
      "体重管理",
      "肠胃敏感",
      "高蛋白"
    ],
    "marketPrice": "32-55元/斤",
    "ingredients": "去骨三文鱼、三文鱼粉、甘薯",
    "advantages": "高蛋白低脂肪、低敏",
    "disadvantages": "未注明情况下检出BHA和BHT",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-030",
    "brand": "荒野盛宴",
    "name": "深海无谷全犬粮",
    "fullName": "荒野盛宴 深海无谷全犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "无谷"
    ],
    "marketPrice": "22-45元/斤",
    "ingredients": "野牛、羊肉粉、鸡肉粉、红薯",
    "advantages": "无谷物、益生菌产物、适口性佳",
    "disadvantages": "植物蛋白、omega3&6配比不佳",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-031",
    "brand": "天衡宝",
    "name": "鸭薯无谷小型成犬粮",
    "fullName": "天衡宝 鸭薯无谷小型成犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "成年",
      "无谷",
      "肠胃敏感"
    ],
    "marketPrice": "30~40元",
    "ingredients": "土豆、鸭肉、土豆蛋白",
    "advantages": "无谷物、低敏",
    "disadvantages": "植物蛋白、营养密度较低",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-032",
    "brand": "RAWZ",
    "name": "三文鱼脱水鸡肉白鱼全犬粮",
    "fullName": "RAWZ 三文鱼脱水鸡肉白鱼全犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "体重管理",
      "高蛋白"
    ],
    "marketPrice": "",
    "ingredients": "三文鱼、脱水去骨鸡肉、脱水鸡肉",
    "advantages": "高蛋白低脂肪低碳水、蛋白质来源佳",
    "disadvantages": "原料透明度有待加强",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-033",
    "brand": "Natural",
    "name": "Ultrami 无谷鸭肉甜薯豌豆成犬",
    "fullName": "Natural Ultrami 无谷鸭肉甜薯豌豆成犬",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "成年",
      "无谷"
    ],
    "marketPrice": "",
    "ingredients": "鸭肉、火鸡肉粉、鸡肉、羊肉粉",
    "advantages": "蛋白质来源丰富、油脂来源理想",
    "disadvantages": "",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-034",
    "brand": "安娜玛特",
    "name": "里昂无谷低脂全犬粮",
    "fullName": "安娜玛特 里昂无谷低脂全犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "无谷",
      "体重管理"
    ],
    "marketPrice": "33-50元",
    "ingredients": "鸡肉粉、豌豆、鹰嘴豆、马铃薯",
    "advantages": "无谷、超低脂、营养水平中上",
    "disadvantages": "粗脂肪和粗灰分虚标、淀粉较高",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-035",
    "brand": "Artemis雅思",
    "name": "无谷火鸡鹰嘴豆全犬粮",
    "fullName": "Artemis雅思 无谷火鸡鹰嘴豆全犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "无谷",
      "肠胃敏感"
    ],
    "marketPrice": "",
    "ingredients": "鲜火鸡肉、火鸡肉粉、鹰嘴豆",
    "advantages": "无谷、相对低敏、低GI",
    "disadvantages": "淀粉含量较高、无占比信息",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-036",
    "brand": "AvoDerm",
    "name": "无谷三文鱼马铃薯全犬粮",
    "fullName": "AvoDerm 无谷三文鱼马铃薯全犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "无谷"
    ],
    "marketPrice": "20~28元/斤",
    "ingredients": "三文鱼、鲱鱼粉、豌豆、豌豆粉",
    "advantages": "无谷、美毛、性价比高",
    "disadvantages": "钙磷含量对幼犬不足、淀粉多",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-037",
    "brand": "卡比",
    "name": "原味四种肉全犬粮",
    "fullName": "卡比 原味四种肉全犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段"
    ],
    "marketPrice": "14.20元",
    "ingredients": "鸡肉粉、火鸡肉粉、羊肉粉、糙米",
    "advantages": "粗蛋白来源理想",
    "disadvantages": "营养水平较低、淀粉含量超高",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-038",
    "brand": "素力高電",
    "name": "鸡肉&蛋粉猫粮",
    "fullName": "素力高電 鸡肉&蛋粉猫粮",
    "type": "主粮",
    "species": "cat",
    "tags": [
      "猫咪",
      "全阶段"
    ],
    "marketPrice": "40~69元/斤",
    "ingredients": "鸡肉粉、土豆、油菜籽油、豌豆",
    "advantages": "品控不错、营养水平高",
    "disadvantages": "原料透明度有待提升",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-039",
    "brand": "素力高",
    "name": "鸡肉鹰嘴豆南瓜小型犬粮",
    "fullName": "素力高 鸡肉鹰嘴豆南瓜小型犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段"
    ],
    "marketPrice": "43-60元/斤",
    "ingredients": "鲜鸡肉、鸡肉粉、鹰嘴豆、豌豆",
    "advantages": "钙磷平衡、营养水平中等",
    "disadvantages": "添加植物蛋白",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-040",
    "brand": "Zignature",
    "name": "超越无谷火鸡全犬粮",
    "fullName": "Zignature 超越无谷火鸡全犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "无谷"
    ],
    "marketPrice": "24-37元/斤",
    "ingredients": "火鸡、火鸡肉粉、鹰嘴豆、豌豆",
    "advantages": "各项均符合承诺值",
    "disadvantages": "使用豌豆蛋白与甜菜粕",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-041",
    "brand": "Fussie",
    "name": "cat 鹌鹑鸭肉全期猫粮",
    "fullName": "Fussie cat 鹌鹑鸭肉全期猫粮",
    "type": "主粮",
    "species": "cat",
    "tags": [
      "猫咪",
      "全阶段"
    ],
    "marketPrice": "30-39元/斤",
    "ingredients": "鹌鹑、鸭肉粉、豌豆、豌豆粉",
    "advantages": "动物蛋白来源佳、无虚标",
    "disadvantages": "淀粉含量较高",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-042",
    "brand": "百和Instinct",
    "name": "经典无谷全犬粮鸡肉配方",
    "fullName": "百和Instinct 经典无谷全犬粮鸡肉配方",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "无谷"
    ],
    "marketPrice": "",
    "ingredients": "鸡肉、鸡肉粉、豌豆、鸡脂肪",
    "advantages": "高营养水平、低淀粉",
    "disadvantages": "粗灰分较高、不适合大型犬幼犬",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-043",
    "brand": "卡比",
    "name": "Canidae 三文鱼甘薯配方成犬粮",
    "fullName": "卡比 Canidae 三文鱼甘薯配方成犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "成年",
      "肠胃敏感"
    ],
    "marketPrice": "33-58元/斤",
    "ingredients": "三文鱼、三文鱼粉、豌豆、甘薯",
    "advantages": "低敏、营养水平较高",
    "disadvantages": "产品透明度有待提高",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-044",
    "brand": "openfarm",
    "name": "野生三文鱼全期狗粮",
    "fullName": "openfarm 野生三文鱼全期狗粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段"
    ],
    "marketPrice": "60-80元/斤",
    "ingredients": "三文鱼、鹰嘴豆、海洋白鲑鱼粉、红豌豆",
    "advantages": "食材优秀、营养水平较高",
    "disadvantages": "产品透明度还有提高的空间",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-045",
    "brand": "openfarm",
    "name": "火鸡鸡肉全猫粮",
    "fullName": "openfarm 火鸡鸡肉全猫粮",
    "type": "主粮",
    "species": "cat",
    "tags": [
      "猫咪",
      "全阶段"
    ],
    "marketPrice": "50~60元/斤",
    "ingredients": "火鸡、鸡肉、海洋白鲑鱼粉",
    "advantages": "整体营养值较高",
    "disadvantages": "品控待加强",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-046",
    "brand": "Wellness",
    "name": "小型成犬粮(大陆特供版)",
    "fullName": "Wellness 小型成犬粮(大陆特供版)",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "成年"
    ],
    "marketPrice": "28-45元/斤",
    "ingredients": "鸡肉粉、高梁、大米、小麦",
    "advantages": "蛋白质来源较优",
    "disadvantages": "含BHA/BHT、高碳水、特供版",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-047",
    "brand": "Fresco",
    "name": "牛肉风干全犬粮",
    "fullName": "Fresco 牛肉风干全犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "高蛋白"
    ],
    "marketPrice": "125~150元/斤",
    "ingredients": "新鲜牛肉、牛心、绿牛肚",
    "advantages": "高蛋白高能量几乎零淀粉",
    "disadvantages": "品控差、多项虚标、有尖锐牛骨碎",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-048",
    "brand": "ti爱娣",
    "name": "牛肉犬粮主食肉干",
    "fullName": "ti爱娣 牛肉犬粮主食肉干",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "高蛋白"
    ],
    "marketPrice": "180+元/斤",
    "ingredients": "牛肉、牛肝、牛肺、豌豆",
    "advantages": "品控佳、鲜肉含量高、淀粉极低",
    "disadvantages": "原料透明度有待提升",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-049",
    "brand": "爱德胜",
    "name": "鹿肉全犬粮",
    "fullName": "爱德胜 鹿肉全犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "体重管理",
      "高蛋白"
    ],
    "marketPrice": "50~90元/斤",
    "ingredients": "鹿肉粉、土豆干、木薯干",
    "advantages": "含有益生菌、品控佳、高蛋白低脂",
    "disadvantages": "维生素D3不足、蛋白来源不佳",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-050",
    "brand": "黑鹰",
    "name": "羊肉大米全价成犬粮",
    "fullName": "黑鹰 羊肉大米全价成犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "成年"
    ],
    "marketPrice": "40-50元",
    "ingredients": "羊肉粉、大米、燕麦、紫花豌豆",
    "advantages": "粗脂肪来源",
    "disadvantages": "含谷物、粗蛋白来源不佳、营养密度低",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-051",
    "brand": "黑鹰",
    "name": "无谷鸡肉成犬粮",
    "fullName": "黑鹰 无谷鸡肉成犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "成年",
      "无谷",
      "肠胃敏感"
    ],
    "marketPrice": "50-60元/斤",
    "ingredients": "鸡肉粉、豌豆、鸡脂肪、木薯粉",
    "advantages": "低敏",
    "disadvantages": "维生素D3不足、淀粉含量高",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-052",
    "brand": "海洋之星",
    "name": "三文鱼幼犬粮（小颗粒）",
    "fullName": "海洋之星 三文鱼幼犬粮（小颗粒）",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "幼年",
      "肠胃敏感"
    ],
    "marketPrice": "42~73元/斤",
    "ingredients": "三文鱼粉、甘薯片、三文鱼、豌豆粉",
    "advantages": "低敏、美毛",
    "disadvantages": "淀粉含量较高，不可溯源",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-053",
    "brand": "法明娜",
    "name": "ND鲱鱼甜橙无谷成猫粮",
    "fullName": "法明娜 ND鲱鱼甜橙无谷成猫粮",
    "type": "主粮",
    "species": "cat",
    "tags": [
      "猫咪",
      "成年",
      "无谷",
      "肠胃敏感",
      "高蛋白"
    ],
    "marketPrice": "66-83元/斤",
    "ingredients": "新鲜鲱鱼、脱水鲱鱼、番薯",
    "advantages": "超高蛋白高能量、相对低敏",
    "disadvantages": "钙充足但不符合承诺值",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-054",
    "brand": "法明娜",
    "name": "ND无谷鸡肉石榴小型成犬粮",
    "fullName": "法明娜 ND无谷鸡肉石榴小型成犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "成年",
      "无谷"
    ],
    "marketPrice": "",
    "ingredients": "新鲜去骨鸡肉、脱水鸡肉、甘薯",
    "advantages": "品控佳、高营养水平",
    "disadvantages": "无法溯源",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-055",
    "brand": "法明娜",
    "name": "ND鸡肉石榴无谷幼母猫",
    "fullName": "法明娜 ND鸡肉石榴无谷幼母猫",
    "type": "主粮",
    "species": "cat",
    "tags": [
      "猫咪",
      "幼年",
      "无谷"
    ],
    "marketPrice": "86元/斤",
    "ingredients": "新鲜去骨鸡肉、脱水鸡肉、番薯",
    "advantages": "无谷、营养水平高",
    "disadvantages": "高镁、不可溯源",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-056",
    "brand": "法明娜",
    "name": "ND鸡肉石榴无谷成猫粮",
    "fullName": "法明娜 ND鸡肉石榴无谷成猫粮",
    "type": "主粮",
    "species": "cat",
    "tags": [
      "猫咪",
      "成年",
      "无谷"
    ],
    "marketPrice": "",
    "ingredients": "新鲜去骨鸡肉、脱水鸡肉、番薯",
    "advantages": "无谷、营养水平高",
    "disadvantages": "高镁、不可溯源",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-057",
    "brand": "",
    "name": "乐施",
    "fullName": "乐施",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段"
    ],
    "marketPrice": "222元/斤",
    "ingredients": "新鲜牛肉、鸡肉、昆虫",
    "advantages": "找不到",
    "disadvantages": "原料惨不忍睹、品控水平渣",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-058",
    "brand": "Alpha",
    "name": "Spirit 自由放养禽类全犬粮",
    "fullName": "Alpha Spirit 自由放养禽类全犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "高蛋白"
    ],
    "marketPrice": "65-90元/斤",
    "ingredients": "30%新鲜鸡肉、25%新鲜火鸡肉",
    "advantages": "85%鲜肉、冷压粮",
    "disadvantages": "淀粉含量不算太低",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-059",
    "brand": "滋益巅峰",
    "name": "起源系列东海角风干犬粮",
    "fullName": "滋益巅峰 起源系列东海角风干犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段"
    ],
    "marketPrice": "",
    "ingredients": "绵羊肉、山羊肉、整条卡瓦鱼、山羊肚",
    "advantages": "96%动物性原料、高营养水平",
    "disadvantages": "高脂",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-060",
    "brand": "滋益巅峰",
    "name": "起源系列奥塔哥山谷猫粮罐头",
    "fullName": "滋益巅峰 起源系列奥塔哥山谷猫粮罐头",
    "type": "主粮",
    "species": "cat",
    "tags": [
      "猫咪",
      "全阶段"
    ],
    "marketPrice": "41元",
    "ingredients": "牛肉、水、鹿肉、整条南蓝鳕、羔羊肚",
    "advantages": "食材优秀、高营养水平",
    "disadvantages": "卵磷脂未标注来源",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-061",
    "brand": "ISEGRIM极地",
    "name": "三文鱼浆果野菜成犬粮",
    "fullName": "ISEGRIM极地 三文鱼浆果野菜成犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "成年",
      "体重管理",
      "肠胃敏感"
    ],
    "marketPrice": "",
    "ingredients": "干三文鱼、新鲜三文鱼、土豆",
    "advantages": "低敏、低脂、美毛",
    "disadvantages": "添加马铃薯蛋白，透明度&承诺值有待提升",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-062",
    "brand": "WOLFSBLUT",
    "name": "鳄鱼甜薯小型犬犬粮",
    "fullName": "WOLFSBLUT 鳄鱼甜薯小型犬犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段"
    ],
    "marketPrice": "46-85元/斤",
    "ingredients": "鳄鱼、干燥的鸭肉、甜薯",
    "advantages": "动物蛋白来源理想、营养水平较高",
    "disadvantages": "无法溯源、钙含量较高",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-063",
    "brand": "Profine",
    "name": "三鱼成猫粮",
    "fullName": "Profine 三鱼成猫粮",
    "type": "主粮",
    "species": "cat",
    "tags": [
      "猫咪",
      "成年",
      "高蛋白"
    ],
    "marketPrice": "24.2~34元/斤",
    "ingredients": "脱水三文鱼42%",
    "advantages": "高蛋白高能量、低镁",
    "disadvantages": "含有谷物、没有鲜肉原料",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-064",
    "brand": "伯纳天纯",
    "name": "海洋盛宴全犬粮",
    "fullName": "伯纳天纯 海洋盛宴全犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段"
    ],
    "marketPrice": "",
    "ingredients": "金枪鱼、沙丁鱼、豌豆、鸡脂",
    "advantages": "鱼种清晰，鱼味很轻",
    "disadvantages": "蛋白质含量虚标",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-065",
    "brand": "网易严选",
    "name": "全价小型犬犬粮",
    "fullName": "网易严选 全价小型犬犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "无谷"
    ],
    "marketPrice": "",
    "ingredients": "鸡肉、鸡肉粉、牛肉、牛肉粉",
    "advantages": "无谷、品控佳、性价比高",
    "disadvantages": "淀粉含量较高，无原料占比",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-066",
    "brand": "佩玛思特",
    "name": "冰川系列全价成犬粮",
    "fullName": "佩玛思特 冰川系列全价成犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "成年"
    ],
    "marketPrice": "29~45元/斤",
    "ingredients": "鱼粉、鸡肉粉、玉米、鸡油、大米",
    "advantages": "品控不错、营养水平中上",
    "disadvantages": "非无谷粮、含口味增强剂",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-067",
    "brand": "达",
    "name": "冻干无谷红肉全犬粮",
    "fullName": "达 冻干无谷红肉全犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "无谷"
    ],
    "marketPrice": "24~34元/斤",
    "ingredients": "鸡肉粉、新鲜鸡肉、牛肉粉",
    "advantages": "品控佳",
    "disadvantages": "粗灰分超标、添加甜菜粕",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-068",
    "brand": "上乐",
    "name": "原味粮全价犬粮",
    "fullName": "上乐 原味粮全价犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段"
    ],
    "marketPrice": "19-39元/斤",
    "ingredients": "鱼粉、鸡肉粉、鸡肉、鱼肉",
    "advantages": "品控佳、营养密度较高",
    "disadvantages": "原料表极其模糊",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-069",
    "brand": "上乐",
    "name": "守护者全价成犬粮",
    "fullName": "上乐 守护者全价成犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "成年",
      "肠胃敏感"
    ],
    "marketPrice": "14-20元/斤",
    "ingredients": "鸭肉、大米、鸭肉粉、紫薯",
    "advantages": "品控佳、相对低敏",
    "disadvantages": "含谷物、淀粉含量很高",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-070",
    "brand": "上乐",
    "name": "原味粮全价小型成犬粮",
    "fullName": "上乐 原味粮全价小型成犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "成年"
    ],
    "marketPrice": "",
    "ingredients": "羊肉、三文鱼、鱼粉、鸡肉粉",
    "advantages": "高营养密度、品控佳",
    "disadvantages": "原料表模糊、添加了屎肠球菌",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-071",
    "brand": "诚实一回",
    "name": "P38全阶段全价犬粮",
    "fullName": "诚实一回 P38全阶段全价犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段"
    ],
    "marketPrice": "27-30元/斤",
    "ingredients": "鸡肉粉、冻鸡肉、鳀鱼粉、冻鸭肉",
    "advantages": "透明度高、营养水平高",
    "disadvantages": "益生菌未标註菌株号及使用量",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-072",
    "brand": "诚实一回",
    "name": "P40全阶段全价猫粮",
    "fullName": "诚实一回 P40全阶段全价猫粮",
    "type": "主粮",
    "species": "cat",
    "tags": [
      "猫咪",
      "全阶段",
      "无谷"
    ],
    "marketPrice": "26~37元/斤",
    "ingredients": "鸡肉、鸡肉粉、鳀鱼粉、三文鱼",
    "advantages": "无谷、营养配比和钙磷比佳",
    "disadvantages": "原料排序存疑、枯草芽孢桿菌",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-073",
    "brand": "久生",
    "name": "真食系列无谷成犬粮",
    "fullName": "久生 真食系列无谷成犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "成年",
      "无谷",
      "肠胃敏感"
    ],
    "marketPrice": "23元/斤",
    "ingredients": "冻鸭肉、冻鸡肉、豌豆、鸡油、红薯颗粒",
    "advantages": "低敏、透明度极高",
    "disadvantages": "灰分不符合承诺值",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-074",
    "brand": "久生",
    "name": "真食系列无谷成猫粮",
    "fullName": "久生 真食系列无谷成猫粮",
    "type": "主粮",
    "species": "cat",
    "tags": [
      "猫咪",
      "成年",
      "无谷"
    ],
    "marketPrice": "27~30元/斤",
    "ingredients": "鸡肉粉、鸭肉粉、三文鱼",
    "advantages": "无豆低淀粉、占比清晰",
    "disadvantages": "粗脂肪&粗灰分承诺值不准确",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-075",
    "brand": "海洋之星",
    "name": "低温烘焙犬粮鸭肉配方",
    "fullName": "海洋之星 低温烘焙犬粮鸭肉配方",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "肠胃敏感"
    ],
    "marketPrice": "44.545元",
    "ingredients": "鲜鸭肉、鲜鸭心、鲜鸭肝、鸡油",
    "advantages": "低敏、低温烘焙粮",
    "disadvantages": "脂肪含量略高",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-076",
    "brand": "领先",
    "name": "全价鲜肉犬粮",
    "fullName": "领先 全价鲜肉犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "高蛋白"
    ],
    "marketPrice": "26-29元/斤",
    "ingredients": "鲜鸡肉20%、鸡肉粉17.2%、鸭肉6.3%",
    "advantages": "动物蛋白来源理想",
    "disadvantages": "承诺值待优化",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-077",
    "brand": "豆柴",
    "name": "肠胃原动力全价冻干犬粮",
    "fullName": "豆柴 肠胃原动力全价冻干犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段"
    ],
    "marketPrice": "37元/斤",
    "ingredients": "新鲜鸡小胸、鸡肉粉、鸭肉粉、鸡油",
    "advantages": "透明度高、品控佳",
    "disadvantages": "含谷物",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-078",
    "brand": "胖小虎",
    "name": "全价犬粮",
    "fullName": "胖小虎 全价犬粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "高蛋白"
    ],
    "marketPrice": "32-35元/斤",
    "ingredients": "鲜鸡肉、鲜鸭肉、冷冻鹿肉",
    "advantages": "高鲜肉含量",
    "disadvantages": "含植物蛋白（鹰嘴豆)",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-079",
    "brand": "伯纳天纯",
    "name": "主时力鲜肉低温烘焙鸭肉&梨",
    "fullName": "伯纳天纯 主时力鲜肉低温烘焙鸭肉&梨",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "肠胃敏感",
      "高蛋白"
    ],
    "marketPrice": "",
    "ingredients": "新鲜带骨鸭肉、鲜鸡肉、鲜鸡",
    "advantages": "低敏、高鲜肉、低温烘焙",
    "disadvantages": "透明度&品控有待提高",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-080",
    "brand": "胖小虎",
    "name": "全价大粮",
    "fullName": "胖小虎 全价大粮",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "高蛋白"
    ],
    "marketPrice": "32-35元/斤",
    "ingredients": "鲜鸡肉、鲜鸭肉、冷冻鹿肉",
    "advantages": "高鲜肉含量",
    "disadvantages": "含植物蛋白（鹰嘴豆)",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-081",
    "brand": "K9Natural",
    "name": "羊肉帝王鲑狗主食冻干",
    "fullName": "K9Natural 羊肉帝王鲑狗主食冻干",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段"
    ],
    "marketPrice": "270-300元/斤",
    "ingredients": "羊肉、羊肚、羊心、三文鱼",
    "advantages": "营养密度高、声称人食级别原料",
    "disadvantages": "超高脂、原料无占比无法溯源",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-082",
    "brand": "STEVE'S",
    "name": "火鸡鸭鸡犬猫主食冻干",
    "fullName": "STEVE'S 火鸡鸭鸡犬猫主食冻干",
    "type": "主粮",
    "species": "cat",
    "tags": [
      "猫咪",
      "全阶段"
    ],
    "marketPrice": "250-300元/斤",
    "ingredients": "火鸡肉、鸡肉、花椰菜、鸭脖子",
    "advantages": "原料可溯源、营养密度非常高",
    "disadvantages": "不适合大型犬幼犬、粗蛋白虚标",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-083",
    "brand": "BixbiRAWBB",
    "name": "鸭肉味犬主食冻干",
    "fullName": "BixbiRAWBB 鸭肉味犬主食冻干",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "肠胃敏感"
    ],
    "marketPrice": "408元/斤",
    "ingredients": "带骨鸭肉、鸭肝、鸭心、南瓜",
    "advantages": "单一肉源低敏",
    "disadvantages": "粗蛋白不符合承诺值、粗脂肪较高、钙偏高",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-084",
    "brand": "NRG",
    "name": "犬用食品鱼肉配方",
    "fullName": "NRG 犬用食品鱼肉配方",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段"
    ],
    "marketPrice": "117元/斤",
    "ingredients": "太平洋鲐鱼、冻羊肉、冻羊肚",
    "advantages": "便宜",
    "disadvantages": "脂肪和钙含量高、不适合大型犬幼犬",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-085",
    "brand": "纽翠斯",
    "name": "菲沙河谷禽肉成犬主食罐",
    "fullName": "纽翠斯 菲沙河谷禽肉成犬主食罐",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "成年"
    ],
    "marketPrice": "21元/斤",
    "ingredients": "品鸡肉、鸡汤、鸡肝、火鸡、鲑鱼",
    "advantages": "品控佳、动物蛋白丰富",
    "disadvantages": "透明度有待提升、营养补充剂较多。",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  },
  {
    "id": "scorecard-sku-086",
    "brand": "K9",
    "name": "天然无谷犬罐·羊肉",
    "fullName": "K9 天然无谷犬罐·羊肉",
    "type": "主粮",
    "species": "dog",
    "tags": [
      "狗狗",
      "全阶段",
      "无谷"
    ],
    "marketPrice": "30元/斤",
    "ingredients": "羊肉、羊肝、羊心、羊肚、羊血",
    "advantages": "几乎无淀粉",
    "disadvantages": "高脂、磷含量和粗蛋白含量异常",
    "source": "2026狗目录_评分卡文字提取.xlsx"
  }
]

module.exports = { PET_FOOD_SKUS }
