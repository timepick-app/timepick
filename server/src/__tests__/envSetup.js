'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { loadEnvTest, assertTestDbUrl } = require('./helpers/test-db-config')

loadEnvTest({ override: true })

// Défense : au cas où un secret-bootstrap tournerait en test (ne devrait jamais
// arriver — les tests importent `./app`, pas `./bootstrap-env`), DATA_DIR pointe
// vers un tmpdir jetable plutôt que `server/data` réel.
if (!process.env.DATA_DIR) {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'timepick-data-'))
}

assertTestDbUrl(process.env.DATABASE_URL, 'envSetup')
