'use strict'

const { loadEnvTest, assertTestDbUrl } = require('./helpers/test-db-config')

loadEnvTest({ override: true })

assertTestDbUrl(process.env.DATABASE_URL, 'envSetup')
