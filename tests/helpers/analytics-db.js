// 内存测试替身：只支持本项目实际使用的文档/聚合操作，不连接云端。
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
const field = (row, path) => path.split('.').reduce((v, k) => v == null ? undefined : v[k], row)
class Predicate {
  constructor(test) { this.test = test }
  and(other) { return new Predicate(v => this.test(v) && other.test(v)) }
}
function matches(row, query) {
  if (query instanceof Predicate) return query.test(row)
  return Object.entries(query).every(([key, value]) => value instanceof Predicate ? value.test(field(row, key)) : field(row, key) === value)
}
function database() {
  const data = new Map(), removed = [], aggregateNames = ['sum', 'cond', 'gte', 'lte', 'gt', 'eq', 'and', 'size', 'filter', 'max', 'subtract']
  let tail = Promise.resolve(), failTransactions = 0
  const command = {
    gte: n => new Predicate(v => v >= n), gt: n => new Predicate(v => v > n), lte: n => new Predicate(v => v <= n), lt: n => new Predicate(v => v < n),
    in: a => new Predicate(v => a.includes(v)), exists: yes => new Predicate(v => (v !== undefined) === yes),
    and: a => new Predicate(v => a.every(q => matches(v, q))), or: a => new Predicate(v => a.some(q => matches(v, q))),
    aggregate: Object.fromEntries(aggregateNames.map(name => [name, value => ({ op: name, value })]))
  }
  function evaluate(value, row, variables = {}) {
    if (typeof value === 'string' && value.startsWith('$$')) return variables[value.slice(2)]
    if (typeof value === 'string' && value.startsWith('$')) return field(row, value.slice(1))
    if (value === null || typeof value !== 'object') return value
    if (Array.isArray(value)) return value.map(v => evaluate(v, row, variables))
    if (!value.op) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, evaluate(v, row, variables)]))
    const raw = value.value
    if (value.op === 'filter') return evaluate(raw.input, row, variables).filter(v => evaluate(raw.cond, row, { ...variables, [raw.as]: v }))
    if (value.op === 'cond') return evaluate(raw.if, row, variables) ? evaluate(raw.then, row, variables) : evaluate(raw.else, row, variables)
    const args = evaluate(raw, row, variables)
    if (value.op === 'subtract') return args[0] - args[1]
    if (value.op === 'size') return args.length
    if (value.op === 'gte') return args[0] >= args[1]
    if (value.op === 'lte') return args[0] <= args[1]
    if (value.op === 'gt') return args[0] > args[1]
    if (value.op === 'eq') return args[0] === args[1]
    if (value.op === 'and') return args.every(Boolean)
    throw new Error('Unknown expression: ' + value.op)
  }
  class Query {
    constructor(conditions = {}) { this.conditions = conditions; this.orders = []; this.maximum = Infinity; this.projection = null }
    where(conditions) { this.conditions = conditions; return this }
    orderBy(key, direction) { this.orders.push([key, direction === 'asc' ? 1 : -1]); return this }
    limit(n) { this.maximum = n; return this }
    field(fields) { this.projection = fields; return this }
    rows() {
      const rows = [...data.values()].filter(r => matches(r, this.conditions)).map(clone)
      rows.sort((a, b) => { for (const [key, order] of this.orders) { if (field(a, key) < field(b, key)) return -order; if (field(a, key) > field(b, key)) return order } return 0 })
      return rows.slice(0, this.maximum)
    }
    async get() { return { data: this.rows().map(r => this.projection ? Object.fromEntries(Object.keys(this.projection).map(k => [k, r[k]])) : r) } }
    async count() { return { total: this.rows().length } }
    async update({ data: patch }) { const rows = this.rows(); for (const row of rows) data.set(row._id, { ...row, ...clone(patch) }); return { stats: { updated: rows.length } } }
    async remove() { const rows = this.rows(); for (const row of rows) { removed.push(row._id); data.delete(row._id) } return { stats: { removed: rows.length } } }
    doc(id) { return { get: async () => { if (!data.has(id)) throw new Error('document not exist'); return { data: clone(data.get(id)) } },
      set: async ({ data: value }) => { if (value._id) throw new Error('set should not include _id'); data.set(id, { ...clone(value), _id: id }); return {} },
      update: async ({ data: patch }) => { if (!data.has(id)) throw new Error('document not exist'); data.set(id, { ...data.get(id), ...clone(patch) }); return { stats: { updated: 1 } } } }
    }
    async add({ data: row }) { if (data.has(row._id)) throw new Error('duplicate'); data.set(row._id, clone(row)); return { _id: row._id } }
    aggregate() {
      let rows = [...data.values()].map(clone)
      const chain = {
        match(query) { rows = rows.filter(r => matches(r, query)); return chain },
        group(spec) {
          const groups = new Map()
          for (const row of rows) {
            const id = evaluate(spec._id, row), key = JSON.stringify(id)
            let group = groups.get(key)
            if (!group) { group = { _id: id }; groups.set(key, group) }
            for (const [name, expr] of Object.entries(spec).filter(([k]) => k !== '_id')) {
              const v = evaluate(expr.value, row)
              if (expr.op === 'sum') group[name] = (group[name] || 0) + (Number(v) || 0)
              else if (expr.op === 'max') group[name] = Math.max(group[name] ?? -Infinity, v)
              else throw new Error('Unknown accumulator: ' + expr.op)
            }
          }
          rows = [...groups.values()]; return chain
        },
        unwind(path) { const key = path.replace(/^\$/, ''); rows = rows.flatMap(r => r[key].map(v => ({ ...r, [key]: v }))); return chain },
        sort(order) { rows.sort((a, b) => { for (const [k, d] of Object.entries(order)) if (a[k] !== b[k]) return a[k] < b[k] ? -d : d; return 0 }); return chain },
        limit(n) { rows = rows.slice(0, n); return chain }, count(key) { rows = rows.length ? [{ [key]: rows.length }] : []; return chain },
        async end() { return { list: clone(rows) } }
      }; return chain
    }
  }
  const db = { command, collection: () => new Query(), createCollection: async () => {},
    runTransaction(fn) {
      const work = tail.then(async () => {
        if (failTransactions) { failTransactions--; throw new Error('injected transaction failure') }
        const before = new Map([...data.entries()].map(([k, v]) => [k, clone(v)]))
        try { return { result: await fn(db) } } catch (e) { data.clear(); for (const [k, v] of before) data.set(k, v); throw e }
      }); tail = work.catch(() => {}); return work
    }, data, removed, failNextTransaction() { failTransactions++ } }
  return db
}
module.exports = { database }
