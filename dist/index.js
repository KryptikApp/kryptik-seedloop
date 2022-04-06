
'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./hdseedloop.cjs.production.min.js')
} else {
  module.exports = require('./hdseedloop.cjs.development.js')
}
