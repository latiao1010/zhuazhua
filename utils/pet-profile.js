const PERSONALITY_OPTIONS = [
  '亲人', '怕生', '黏人', '独立', '温和', '精力旺盛',
  '安静', '爱叫', '喜欢同伴', '怕狗', '护食', '容易兴奋'
]
const MAX_PERSONALITY_TAGS = 6

function normalizePersonalityTags(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter(tag => typeof tag === 'string')
    .map(tag => tag.trim()).filter(tag => tag && tag.length <= 24))]
    .slice(0, MAX_PERSONALITY_TAGS)
}

module.exports = { PERSONALITY_OPTIONS, MAX_PERSONALITY_TAGS, normalizePersonalityTags }
