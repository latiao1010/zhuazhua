// 独立内存数据库：集合之间隔离，不连接真实云环境。
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
function database() {
  const tables = {}, writes = []
  let sequence = 0
  function collection(name) {
    const table = tables[name] || (tables[name] = [])
    let query = {}, offset = 0, maximum = Infinity, order = null
    const matches = row => Object.entries(query).every(([key, value]) => row[key] === value)
    const rows = () => {
      const list = table.filter(matches)
      if (order) list.sort((a,b) => (a[order[0]] > b[order[0]] ? 1 : a[order[0]] < b[order[0]] ? -1 : 0) * (order[1] === 'desc' ? -1 : 1))
      return list.slice(offset, offset + maximum)
    }
    const api = {
      where(value) { query = value; return api }, skip(value) { offset = value; return api }, limit(value) { maximum = value; return api },
      orderBy(key, direction) { order = [key, direction]; return api },
      async get() { return { data: clone(rows()) } },
      async add({ data }) { const row = { ...clone(data), _id: data._id || `${name}-${++sequence}` }; table.push(row); writes.push([name, 'add', row._id]); return { _id: row._id } },
      async update({ data }) { const selected = rows(); selected.forEach(row => Object.assign(row, clone(data))); writes.push([name, 'update', selected.length]); return { stats: { updated: selected.length } } },
      async remove() { const selected = rows(); selected.forEach(row => table.splice(table.indexOf(row),1)); return { stats: { removed: selected.length } } },
      doc(id) { return {
        async get() { const row = table.find(row => row._id === id); if (!row) throw new Error('document not exist'); return { data: clone(row) } },
        async set({ data }) { const row = { ...clone(data), _id: id }, index = table.findIndex(row => row._id === id); if (index < 0) table.push(row); else table[index] = row; writes.push([name,'set',id]); return {} },
        async update({ data }) { const row = table.find(row => row._id === id); if (!row) throw new Error('document not exist'); Object.assign(row, clone(data)); writes.push([name,'update',id]); return { stats:{updated:1} } },
        async remove() { const index = table.findIndex(row => row._id === id); if (index >= 0) table.splice(index,1); return { stats:{removed:index >= 0 ? 1 : 0} } }
      } }
    }
    return api
  }
  return { tables, writes, collection, createCollection: async name => { if (!tables[name]) tables[name] = [] } }
}
module.exports = { database }
