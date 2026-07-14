import { importUsersCsv, parseUsersCsv, CsvFormatError } from '../../services/user-import.service'
import { query } from '../../db'
import { exportService } from '../../services/export.service'
import request from 'supertest'
import { testServer } from '../helpers/test-server'
import { generateTestToken } from '../helpers/auth'
import { sendWelcomeInvitation } from '../../services/email.service'
jest.mock('../../services/email.service', () => {
  const actual = jest.requireActual('../../services/email.service')
  return { ...actual, sendWelcomeInvitation: jest.fn() }
})
const mockedInvite = sendWelcomeInvitation as jest.MockedFunction<typeof sendWelcomeInvitation>

const BOM = '\uFEFF'

describe('user-import.service', () => {
  beforeEach(async () => {
    mockedInvite.mockReset()
    await query("DELETE FROM users WHERE email LIKE 'import-user-%'")
  })
  afterAll(async () => {
    await query("DELETE FROM users WHERE email LIKE 'import-user-%'")
  })

  it('parse `;` + BOM et normalise les en-têtes en minuscule', () => {
    const { headers, records } = parseUsersCsv(`${BOM}Email;First_Name\nimport-user-a@x.fr;Alice`)
    expect(headers).toEqual(['email', 'first_name'])
    expect(records[0]).toEqual({ email: 'import-user-a@x.fr', first_name: 'Alice' })
  })

  it('lève CsvFormatError si en-tête email manquant', () => {
    expect(() => parseUsersCsv('nom;prenom\nx;y')).toThrow(CsvFormatError)
  })

  it("dryRun n'écrit rien et rapporte create/update", async () => {
    await query("INSERT INTO users (email, first_name, role) VALUES ('import-user-exist@x.fr', 'Old', 'user')")
    const csv = `${BOM}email;first_name;last_name;phone;role\n` +
      `import-user-new@x.fr;New;Nom;;user\n` +
      `import-user-exist@x.fr;Updated;;0612345678;user\n`
    const res = await importUsersCsv(csv, { dryRun: true, sendInvitation: false, currentUserId: undefined })
    expect(res.summary).toMatchObject({ total: 2, created: 1, updated: 1, invited: 0, errors: 0 })
    const created = await query("SELECT 1 FROM users WHERE email = 'import-user-new@x.fr'")
    expect(created.rows.length).toBe(0)
    const stillOld = await query("SELECT first_name FROM users WHERE email = 'import-user-exist@x.fr'")
    expect(stillOld.rows[0].first_name).toBe('Old')
  })

  it('marque en erreur les doublons intra-fichier (même email répété)', async () => {
    const csv = `${BOM}email;first_name;role\n` +
      `import-user-dup@x.fr;Un;user\n` +
      `import-user-dup@x.fr;Deux;user\n`
    const res = await importUsersCsv(csv, { dryRun: true, sendInvitation: false, currentUserId: undefined })
    const errs = res.rows.filter((r) => r.action === 'error')
    expect(errs).toHaveLength(1)
    expect(errs[0].line).toBe(3)
    expect(errs[0].error).toMatch(/double/i)
  })

  it('crée et met à jour réellement (dryRun=false)', async () => {
    await query("INSERT INTO users (email, first_name, role) VALUES ('import-user-exist@x.fr', 'Old', 'user')")
    const csv = `email;first_name;last_name;phone;role\n` +
      `import-user-new@x.fr;New;Nom;0612345678;user\n` +
      `import-user-exist@x.fr;Updated;Dupont;;user\n`
    const res = await importUsersCsv(csv, { dryRun: false, sendInvitation: false, currentUserId: undefined })
    expect(res.summary).toMatchObject({ created: 1, updated: 1, invited: 0, errors: 0 })
    const created = await query("SELECT first_name, role FROM users WHERE email = 'import-user-new@x.fr'")
    expect(created.rows[0]).toMatchObject({ first_name: 'New', role: 'user' })
    const updated = await query("SELECT first_name, last_name, phone FROM users WHERE email = 'import-user-exist@x.fr'")
    expect(updated.rows[0]).toMatchObject({ first_name: 'Updated', last_name: 'Dupont', phone: null })
    expect(mockedInvite).not.toHaveBeenCalled()
  })

  it('atomique : une ligne invalide bloque toute écriture', async () => {
    const csv = `email;first_name;role\n` +
      `import-user-ok@x.fr;Bon;user\n` +
      `pas-un-email;Mauvais;user\n`
    const res = await importUsersCsv(csv, { dryRun: false, sendInvitation: false, currentUserId: undefined })
    expect(res.summary.errors).toBe(1)
    const written = await query("SELECT 1 FROM users WHERE email = 'import-user-ok@x.fr'")
    expect(written.rows.length).toBe(0)
  })

  it('autorise création et promotion admin (le rôle est une simple donnée)', async () => {
    await query("INSERT INTO users (email, first_name, role) VALUES ('import-user-admin@x.fr', 'A', 'admin')")
    await query("INSERT INTO users (email, first_name, role) VALUES ('import-user-promo@x.fr', 'P', 'user')")
    const csv = `email;first_name;role\n` +
      `import-user-createadmin@x.fr;Nouv;admin\n` +
      `import-user-promo@x.fr;P;admin\n` +
      `import-user-admin@x.fr;A;admin\n`
    const res = await importUsersCsv(csv, { dryRun: false, sendInvitation: false, currentUserId: undefined })
    const byEmail = (e: string) => res.rows.find((r) => r.email === e)!
    expect(byEmail('import-user-createadmin@x.fr').action).toBe('create')
    expect(byEmail('import-user-promo@x.fr').action).toBe('update')
    expect(byEmail('import-user-admin@x.fr').action).toBe('update')
    expect(res.summary.errors).toBe(0)
    const created = await query("SELECT role FROM users WHERE email = 'import-user-createadmin@x.fr'")
    expect(created.rows[0].role).toBe('admin')
    const promo = await query("SELECT role FROM users WHERE email = 'import-user-promo@x.fr'")
    expect(promo.rows[0].role).toBe('admin')
  })

  it("interdit à l'admin courant de changer son propre rôle", async () => {
    const me = await query("INSERT INTO users (email, first_name, role) VALUES ('import-user-self@x.fr', 'Me', 'admin') RETURNING id")
    const csv = `email;first_name;role\nimport-user-self@x.fr;Me;user\n`
    const res = await importUsersCsv(csv, { dryRun: true, sendInvitation: false, currentUserId: me.rows[0].id })
    expect(res.rows[0].action).toBe('error')
    expect(res.rows[0].error).toMatch(/propre rôle/)
  })

  it('phone vide en update → NULL ; en-tête profession absent → non touché', async () => {
    await query("INSERT INTO users (email, first_name, phone, profession, role) VALUES ('import-user-keep@x.fr', 'K', '0600000000', 'Dev', 'user')")
    const csv = `email;first_name;phone\nimport-user-keep@x.fr;K;\n`
    await importUsersCsv(csv, { dryRun: false, sendInvitation: false, currentUserId: undefined })
    const r = await query("SELECT phone, profession FROM users WHERE email = 'import-user-keep@x.fr'")
    expect(r.rows[0].phone).toBeNull()
    expect(r.rows[0].profession).toBe('Dev')
  })

  it('invitation envoyée aux CRÉATIONS uniquement quand sendInvitation=true', async () => {
    await query("INSERT INTO users (email, first_name, role) VALUES ('import-user-upd@x.fr', 'U', 'user')")
    mockedInvite.mockResolvedValue(true)
    const csv = `email;first_name;role\n` +
      `import-user-fresh@x.fr;Fraise;user\n` +
      `import-user-upd@x.fr;U;user\n`
    const res = await importUsersCsv(csv, { dryRun: false, sendInvitation: true, currentUserId: undefined })
    expect(res.summary.invited).toBe(1)
    expect(mockedInvite).toHaveBeenCalledTimes(1)
    expect(mockedInvite).toHaveBeenCalledWith('import-user-fresh@x.fr', 'Fraise', null, false)
  })

  it('crée un admin via import avec invitation isAdmin=true', async () => {
    mockedInvite.mockResolvedValue(true)
    const csv = `email;first_name;role\nimport-user-newadmin@x.fr;Chef;admin\n`
    const res = await importUsersCsv(csv, { dryRun: false, sendInvitation: true, currentUserId: undefined })
    expect(res.summary).toMatchObject({ created: 1, invited: 1, errors: 0 })
    expect(mockedInvite).toHaveBeenCalledWith('import-user-newadmin@x.fr', 'Chef', null, true)
  })

  it('aucune invitation en dryRun même si sendInvitation=true', async () => {
    const csv = `email;first_name;role\nimport-user-dry@x.fr;D;user\n`
    const res = await importUsersCsv(csv, { dryRun: true, sendInvitation: true, currentUserId: undefined })
    expect(res.summary.invited).toBe(0)
    expect(mockedInvite).not.toHaveBeenCalled()
  })

  it('round-trip : la sortie de generateUsersCSV (7 colonnes) se ré-importe sans erreur', async () => {
    await query(
      "INSERT INTO users (email, first_name, last_name, phone, role, profession, informations) " +
        "VALUES ('import-user-rt@x.fr', 'Rose', 'Tremière', NULL, 'user', 'Jardinière', 'Dispo week-end')"
    )
    const csv = exportService.generateUsersCSV([
      {
        email: 'import-user-rt@x.fr',
        first_name: 'Rose',
        last_name: 'Tremière',
        phone: null,
        role: 'user',
        profession: 'Jardinière',
        informations: 'Dispo week-end',
      },
    ])
    const res = await importUsersCsv(csv, { dryRun: false, sendInvitation: false, currentUserId: undefined })
    expect(res.summary).toMatchObject({ updated: 1, errors: 0 })
    const r = await query("SELECT last_name, phone, profession, informations FROM users WHERE email = 'import-user-rt@x.fr'")
    expect(r.rows[0]).toMatchObject({
      last_name: 'Tremière',
      phone: null,
      profession: 'Jardinière',
      informations: 'Dispo week-end',
    })
  })

  it('validation : rôle invalide', async () => {
    const res = await importUsersCsv('email;first_name;role\nimport-user-valrole@x.fr;X;moderateur', { dryRun: true, sendInvitation: false, currentUserId: undefined })
    expect(res.rows[0].error).toMatch(/user.*admin/i)
  })

  it('validation : téléphone invalide', async () => {
    const res = await importUsersCsv('email;first_name;phone\nimport-user-valphone@x.fr;X;abc', { dryRun: true, sendInvitation: false, currentUserId: undefined })
    expect(res.rows[0].error).toMatch(/téléphone/i)
  })

  it('validation : profession trop longue (>150)', async () => {
    const longPro = 'x'.repeat(151)
    const res = await importUsersCsv(`email;first_name;profession\nimport-user-valpro@x.fr;X;${longPro}`, { dryRun: true, sendInvitation: false, currentUserId: undefined })
    expect(res.rows[0].error).toMatch(/150/)
  })

  it('validation : first_name trop long en création (>100)', async () => {
    const longFn = 'x'.repeat(101)
    const res = await importUsersCsv(`email;first_name\nimport-user-valfn@x.fr;${longFn}`, { dryRun: true, sendInvitation: false, currentUserId: undefined })
    expect(res.rows[0].error).toMatch(/100/)
  })

  it('validation : first_name absent en création', async () => {
    const res = await importUsersCsv('email;first_name\nimport-user-valfnmiss@x.fr;', { dryRun: true, sendInvitation: false, currentUserId: undefined })
    expect(res.rows[0].error).toMatch(/prénom/i)
  })

  it('first_name préservé en update si champ vide dans le CSV', async () => {
    await query("INSERT INTO users (email, first_name, role) VALUES ('import-user-keepfn@x.fr', 'Bob', 'user')")
    const csv = 'email;first_name\nimport-user-keepfn@x.fr;\n'
    const res = await importUsersCsv(csv, { dryRun: false, sendInvitation: false, currentUserId: undefined })
    expect(res.rows[0].action).toBe('update')
    expect(res.summary.errors).toBe(0)
    const r = await query("SELECT first_name FROM users WHERE email = 'import-user-keepfn@x.fr'")
    expect(r.rows[0].first_name).toBe('Bob')
  })

  it('colonnes clearables vidées → NULL en base', async () => {
    await query(
      "INSERT INTO users (email, first_name, last_name, profession, informations, role) " +
        "VALUES ('import-user-clear@x.fr', 'A', 'Dupont', 'Dev', 'Notes', 'user')"
    )
    const csv = 'email;last_name;profession;informations\nimport-user-clear@x.fr;;;\n'
    const res = await importUsersCsv(csv, { dryRun: false, sendInvitation: false, currentUserId: undefined })
    expect(res.summary.errors).toBe(0)
    const r = await query("SELECT last_name, profession, informations FROM users WHERE email = 'import-user-clear@x.fr'")
    expect(r.rows[0].last_name).toBeNull()
    expect(r.rows[0].profession).toBeNull()
    expect(r.rows[0].informations).toBeNull()
  })

  it('round-trip : caractères spéciaux dans informations (a;b"c\\nd)', async () => {
    await query(
      "INSERT INTO users (email, first_name, role) VALUES ('import-user-rt2@x.fr', 'Z', 'user')"
    )
    const csv = exportService.generateUsersCSV([
      { email: 'import-user-rt2@x.fr', first_name: 'Z', last_name: null, phone: null, role: 'user', profession: null, informations: 'a;b"c\nd' },
    ])
    const res = await importUsersCsv(csv, { dryRun: false, sendInvitation: false, currentUserId: undefined })
    expect(res.summary.errors).toBe(0)
    const r = await query("SELECT informations FROM users WHERE email = 'import-user-rt2@x.fr'")
    expect(r.rows[0].informations).toBe('a;b"c\nd')
  })

  it("invitation best-effort n'avorte pas l'import si SMTP échoue (M6)", async () => {
    mockedInvite
      .mockRejectedValueOnce(new Error('SMTP'))
      .mockResolvedValueOnce(true)
    const csv = 'email;first_name;role\nimport-user-smtp1@x.fr;Un;user\nimport-user-smtp2@x.fr;Deux;user\n'
    const res = await importUsersCsv(csv, { dryRun: false, sendInvitation: true, currentUserId: undefined })
    expect(res.summary.invited).toBe(1)
    const r1 = await query("SELECT 1 FROM users WHERE email = 'import-user-smtp1@x.fr'")
    const r2 = await query("SELECT 1 FROM users WHERE email = 'import-user-smtp2@x.fr'")
    expect(r1.rows.length).toBe(1)
    expect(r2.rows.length).toBe(1)
  })

  it('invited reflète les envois réels : sendWelcomeInvitation false → invited 0 (#1)', async () => {
    mockedInvite.mockResolvedValue(false)
    const csv = 'email;first_name;role\nimport-user-noinv@x.fr;X;user\n'
    const res = await importUsersCsv(csv, { dryRun: false, sendInvitation: true, currentUserId: undefined })
    expect(res.summary.created).toBe(1)
    expect(res.summary.invited).toBe(0)
    const r = await query("SELECT 1 FROM users WHERE email = 'import-user-noinv@x.fr'")
    expect(r.rows.length).toBe(1)
  })

  it('matching email insensible à la casse : maj dans CSV → update, pas create (#2)', async () => {
    await query("INSERT INTO users (email, first_name, role) VALUES ('import-user-case@x.fr', 'Avant', 'user')")
    const csv = 'email;first_name;role\nIMPORT-USER-CASE@X.FR;NouveauPrenom;user\n'
    const res = await importUsersCsv(csv, { dryRun: false, sendInvitation: false, currentUserId: undefined })
    expect(res.rows[0].action).toBe('update')
    expect(res.summary.errors).toBe(0)
    const cnt = await query("SELECT count(*) FROM users WHERE LOWER(email) = 'import-user-case@x.fr'")
    expect(Number(cnt.rows[0].count)).toBe(1)
    const fn = await query("SELECT first_name FROM users WHERE LOWER(email) = 'import-user-case@x.fr'")
    expect(fn.rows[0].first_name).toBe('NouveauPrenom')
  })

  it('lève CsvFormatError si encodage non UTF-8 (caractère de remplacement)', () => {
    expect(() => parseUsersCsv('email;first_name\nx@x.fr;Jos\uFFFD')).toThrow(CsvFormatError)
  })

  it('lève CsvFormatError si largeur de ligne incohérente (trop courte)', () => {
    expect(() => parseUsersCsv('email;first_name;role\nx@x.fr;Jean')).toThrow(CsvFormatError)
  })

  it('ligne entièrement vide ignorée (skip_records_with_empty_values)', () => {
    expect(parseUsersCsv('email;first_name\nx@x.fr;Jean\n;').records.length).toBe(1)
  })
})

describe('POST /api/admin/users/import (HTTP)', () => {
  let adminToken: string
  let userToken: string

  beforeAll(async () => {
    const admin = await query(
      "INSERT INTO users (email, first_name, role) VALUES ('import-admin-http@example.com', 'Admin', 'admin') ON CONFLICT (email) DO UPDATE SET role = 'admin' RETURNING id"
    )
    adminToken = generateTestToken(admin.rows[0].id)
    const user = await query(
      "INSERT INTO users (email, first_name, role) VALUES ('import-nonadmin-http@example.com', 'User', 'user') ON CONFLICT (email) DO UPDATE SET role = 'user' RETURNING id"
    )
    userToken = generateTestToken(user.rows[0].id)
  })

  beforeEach(async () => {
    await query("DELETE FROM users WHERE email LIKE 'import-user-%'")
  })

  afterAll(async () => {
    await query("DELETE FROM users WHERE email LIKE 'import-user-%'")
    await query("DELETE FROM users WHERE email IN ('import-admin-http@example.com', 'import-nonadmin-http@example.com')")
  })

  it('401 sans token', async () => {
    const res = await request(testServer())
      .post('/api/admin/users/import')
      .attach('file', Buffer.from('email;first_name\nimport-user-z@x.fr;Z'), 'u.csv')
    expect(res.status).toBe(401)
  })

  it('403 pour un non-admin', async () => {
    const res = await request(testServer())
      .post('/api/admin/users/import')
      .set('Authorization', `Bearer ${userToken}`)
      .attach('file', Buffer.from('email;first_name\nimport-user-z@x.fr;Z'), 'u.csv')
    expect(res.status).toBe(403)
  })

  it('400 sans fichier', async () => {
    const res = await request(testServer())
      .post('/api/admin/users/import')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(400)
  })

  it('aperçu dryRun → 200 + rapport, aucune écriture', async () => {
    const res = await request(testServer())
      .post('/api/admin/users/import?dryRun=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from('email;first_name;role\nimport-user-http@x.fr;H;user'), 'u.csv')
    expect(res.status).toBe(200)
    expect(res.body.summary).toMatchObject({ created: 1, errors: 0 })
    const w = await query("SELECT 1 FROM users WHERE email = 'import-user-http@x.fr'")
    expect(w.rows.length).toBe(0)
  })

  it('import réel avec erreur → 422 + rapport, rien écrit', async () => {
    const res = await request(testServer())
      .post('/api/admin/users/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from('email;first_name\nbad-email;X'), 'u.csv')
    expect(res.status).toBe(422)
    expect(res.body.summary.errors).toBe(1)
  })

  it('import réel valide → 200 + écriture', async () => {
    const res = await request(testServer())
      .post('/api/admin/users/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from('email;first_name;role\nimport-user-ok2@x.fr;Ok;user'), 'u.csv')
    expect(res.status).toBe(200)
    const w = await query("SELECT first_name FROM users WHERE email = 'import-user-ok2@x.fr'")
    expect(w.rows[0].first_name).toBe('Ok')
  })

  it('413 pour un fichier trop volumineux', async () => {
    const res = await request(testServer())
      .post('/api/admin/users/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.alloc(6 * 1024 * 1024), 'big.csv')
    expect(res.status).toBe(413)
    expect(res.body.error).toMatch(/trop volumineux/i)
  })
})
