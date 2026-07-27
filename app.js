const { ensureSeedData } = require('./utils/store')

App({
  onLaunch() {
    ensureSeedData()
  },
  globalData: {
    theme: '#FF7D5A'
  }
})
