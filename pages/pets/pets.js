const cloudData = require('../../utils/cloud-data')
const petContext = require('../../utils/pet-context')

Page({
  data: { profiles: [], loading: true, switching: '', error: '', current: 'personal' },
  onLoad(options = {}) { this.requestedScope = options.petScope || '' },
  onShow() { this.loadPets() },
  async loadPets() {
    if (this.data.switching) return
    this.setData({ loading: true, error: '', current: petContext.current() })
    const result = await cloudData.listPetProfiles()
    const profiles = result.profiles || []
    this.setData({ loading: false, error: result.ok ? '' : result.error,
      profiles: profiles.map(item => {
        // 尚未上传的真实昵称优先于旧共享名称；空白占位名不遮住云端名称。
        const cached = wx.getStorageSync(petContext.storageKey('paw_pet', item.id))
        const localName = cached && String(cached.name || '').trim()
        const hasLocalName = localName && !['我的宠物', '共享宠物'].includes(localName)
        return { ...item,
          name: !item.configured && hasLocalName ? localName : item.name,
          roleLabel: item.kind === 'own' ? '我的宠物' : item.role === 'viewer' ? '共享宠物 · 只读查看' : '共享宠物 · 共同照护'
        }
      }) })
    if (result.ok && this.requestedScope) {
      const scope = this.requestedScope
      this.requestedScope = ''
      if (profiles.some(item => item.id === scope)) await this.selectScope(scope)
    }
  },
  selectPet(event) { return this.selectScope(event.currentTarget.dataset.id) },
  async selectScope(scope) {
    if (this.data.loading || this.data.switching || !scope) return
    this.setData({ switching: scope, error: '' })
    const result = await cloudData.switchPet(scope)
    if (!result.ok) {
      this.setData({ switching: '', error: result.error })
      return
    }
    // 清掉上一只宠物的页面栈与编辑草稿，所有页面从当前档案重新读取。
    wx.reLaunch({ url: '/pages/profile/profile', fail: () => {
      this.setData({ switching: '', current: petContext.current(), error: '已切换，请返回首页查看' })
    } })
  }
})
