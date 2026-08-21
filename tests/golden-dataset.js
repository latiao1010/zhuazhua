/*
 * Usage:
 *   node tests/golden-dataset.js "C:\\Users\\taojiadi\\Downloads\\pet-ai-golden-dataset-500.zip"
 *
 * The golden set stays outside the mini-program source tree.  This runner reads
 * it straight from the supplied zip so it can be used again after future rules
 * changes without adding 500 test records to the release package.
 */
const assert = require('assert')
const childProcess = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const archive = process.argv[2] || process.env.PET_GOLDEN_DATASET
const archiveEntry = 'pet-ai-golden-500/pet_ai_golden_500.json'

if (!archive || !fs.existsSync(archive)) {
  throw new Error('请传入 pet-ai-golden-dataset-500.zip 的完整路径。')
}

const dataset = JSON.parse(childProcess.execFileSync('tar', ['-xOf', archive, archiveEntry], { encoding: 'utf8' }))
const cases = dataset.cases || []
assert.strictEqual(cases.length, 500, '黄金集应包含 500 条用例')

const expert = require(path.join(ROOT, 'utils/expert-system.js'))
const result = {
  total: cases.length,
  intent: [],
  species: [],
  risk: [],
  emergency: [],
  include: [],
  prohibited: [],
  categories: {}
}

function push(metric, testCase, detail) {
  result[metric].push({ id: testCase.id, query: testCase.query, expected: testCase.expected, ...detail })
}

function expectedSymptoms(expected) {
  return (expected.entities && expected.entities.symptoms) || []
}

for (const testCase of cases) {
  const expected = testCase.expected || {}
  const pet = { breed: expected.species === 'cat' ? '英短' : '柯基' }
  const entities = expert.extractEntities(testCase.query, pet)
  const intent = expert.detectIntent(testCase.query, entities)
  const answer = expert.answer(testCase.query, pet)
  const text = answer ? answer.text : ''
  const risk = answer ? answer.riskLevel : 0
  const category = testCase.category || 'unknown'
  result.categories[category] = result.categories[category] || { total: 0, intent: 0, risk: 0, emergency: 0 }
  result.categories[category].total += 1

  if (intent === expected.intent) result.categories[category].intent += 1
  else push('intent', testCase, { actualIntent: intent })

  if (entities.species !== expected.species) push('species', testCase, { actualSpecies: entities.species })

  const min = Number(expected.risk_min || 0)
  const max = Number(expected.risk_max === undefined ? 3 : expected.risk_max)
  if (risk >= min && risk <= max) result.categories[category].risk += 1
  else push('risk', testCase, { actualRisk: risk })

  if (expected.intent === 'emergency_query') {
    if (intent === 'emergency_query' && risk >= 3) result.categories[category].emergency += 1
    else push('emergency', testCase, { actualIntent: intent, actualRisk: risk })
  }

  const required = expected.must_include || []
  if (required.length && !required.every(word => text.includes(word))) {
    push('include', testCase, { actualText: text, required })
  }
  const forbidden = expected.must_not || []
  if (forbidden.some(word => text.includes(word))) {
    push('prohibited', testCase, { actualText: text, forbidden })
  }

  // Entity failures are reported in the log together with intent failures; this
  // catches missed symptoms without requiring an exact language-model response.
  const missingSymptoms = expectedSymptoms(expected).filter(symptom => {
    const aliases = { 便血: ['血便'], 喘气: ['呼吸异常'] }
    const normalized = [symptom, ...(aliases[symptom] || [])]
    return !normalized.some(value => (entities.symptoms || []).includes(value))
  })
  if (missingSymptoms.length) push('include', testCase, { actualText: `实体缺失：${missingSymptoms.join('、')}`, required: missingSymptoms })
}

const emergencyTotal = cases.filter(item => item.expected && item.expected.intent === 'emergency_query').length
const summary = {
  total: result.total,
  intentAccuracy: Number(((result.total - result.intent.length) / result.total).toFixed(3)),
  speciesAccuracy: Number(((result.total - result.species.length) / result.total).toFixed(3)),
  riskAccuracy: Number(((result.total - result.risk.length) / result.total).toFixed(3)),
  emergencyRecall: Number(((emergencyTotal - result.emergency.length) / emergencyTotal).toFixed(3)),
  missingRequiredOutput: result.include.length,
  prohibitedOutput: result.prohibited.length
}

console.log(JSON.stringify(summary, null, 2))
console.log(JSON.stringify(result.categories, null, 2))

for (const metric of ['intent', 'risk', 'emergency', 'include', 'species', 'prohibited']) {
  const failures = result[metric]
  console.log(`\n${metric}: ${failures.length} failures`)
  failures.slice(0, 12).forEach(item => {
    const actual = item.actualIntent || item.actualRisk || item.actualSpecies || item.actualText || ''
    console.log(`- ${item.id} ${item.query} => ${actual}`)
  })
}

// Safety gate: emergency misses must always be fixed; the remaining scores are
// intentionally strict enough to keep future rule changes from silently regressing.
if (summary.emergencyRecall < 1 || summary.intentAccuracy < 0.9 || summary.riskAccuracy < 0.9) process.exitCode = 1
