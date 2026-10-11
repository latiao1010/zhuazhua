const { instrument } = require('../../utils/analytics-page')
const createAccountPage = require('../shared/account-controller')
Page(instrument('account', { ...createAccountPage(), openFeedback() { wx.navigateTo({ url: '/pages/feedback/feedback' }) } }))
