// Display names are relative to the current account; never save them as shared nicknames.
function buildFamilyMemberViews(members, share = {}) {
  return (members || []).map(item => {
    const name = String(item.name || '').trim()
    const isSelf = share.shared
      ? !!share.currentMemberId && item.id === share.currentMemberId
      : item.role === 'owner' && name === '我'
    const fallbackName = item.role === 'owner' ? '主人' : item.relation || '家人'
    const defaultName = !name || ['我', '家庭成员', '家人'].includes(name)
    const displayName = isSelf ? (defaultName ? '我' : `${name}（我）`)
      : defaultName ? fallbackName : name
    const detailText = item.relation && item.relation !== item.roleLabel
      ? `${item.relation} · ${item.roleLabel}` : item.roleLabel
    return { ...item, isSelf, displayName, detailText, initial: displayName.slice(0, 1) || '家' }
  })
}

module.exports = { buildFamilyMemberViews }
