
'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./kryptik-seedloop.cjs.production.min.js')
} else {
  module.exports = require('./kryptik-seedloop.cjs.development.js')
}
