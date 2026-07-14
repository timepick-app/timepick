import request from 'supertest'
import { testServer } from '../helpers/test-server'
import { query } from '../../db'
import { generateTestToken } from '../helpers/auth'

describe('GET /api/admin/users/export', () => {
  let adminToken: string
  let testUserId: string

  beforeAll(async () => {
    // Créer un utilisateur admin pour les tests
    const result = await query(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET role = $3
       RETURNING id`,
      ['export-test@example.com', 'Admin Test', 'admin']
    )
    testUserId = result.rows[0].id
    adminToken = generateTestToken(testUserId)
  })

  beforeEach(async () => {
    // Nettoyer les données de test (utilisateurs, réservations et créneaux)
    await query("DELETE FROM bookings WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'export-user-%')")
    await query("DELETE FROM slots WHERE start_time >= '2026-01-01' AND start_time < '2026-02-01' AND capacity = 5")
    await query("DELETE FROM users WHERE email LIKE 'export-user-%'")
  })

  afterAll(async () => {
    // Nettoyer
    await query("DELETE FROM users WHERE email = 'export-test@example.com'")
    await query("DELETE FROM users WHERE email LIKE 'export-user-%'")
  })

  it('utilise le point-virgule comme délimiteur', async () => {
    // Créer des utilisateurs de test
    await query(
      `INSERT INTO users (email, first_name, phone, role) VALUES
       ('export-user-1@example.com', 'Dupont', '0612345678', 'user'),
       ('export-user-2@example.com', 'Martin', '0698765432', 'user')`
    )

    const res = await request(testServer())
      .get('/api/admin/users/export')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')

    // Vérifier que le point-virgule est utilisé comme délimiteur
    const lines = res.text.split('\n')
    const headerLine = lines[0]
    expect(headerLine).toContain(';')
    // Vérifier qu'il n'y a pas de virgule comme délimiteur
    expect(headerLine).toMatch(/[^,];[^,]/) // Au moins un point-virgule entre des champs
  })

  it('inclut l UTF-8 BOM pour Excel', async () => {
    const res = await request(testServer())
      .get('/api/admin/users/export')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    // Le BOM UTF-8 est \uFEFF (3 octets: EF BB BF)
    expect(res.text).toMatch(/^\uFEFF/)
  })


  it('génère le bon nom de fichier', async () => {
    const res = await request(testServer())
      .get('/api/admin/users/export')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)

    const contentDisposition = res.headers['content-disposition']
    expect(contentDisposition).toBeDefined()
    // Vérifier le format: YYYY-MM-DD-utilisateurs.csv
    expect(contentDisposition).toMatch(/\d{4}-\d{2}-\d{2}-utilisateurs\.csv/)
  })

  it('respecte le filtre de rôle (admin)', async () => {
    // Créer nos utilisateurs de test
    await query(
      `INSERT INTO users (email, first_name, role) VALUES
       ('export-user-admin@example.com', 'Admin User', 'admin'),
       ('export-user-regular@example.com', 'User User', 'user')`
    )

    const res = await request(testServer())
      .get('/api/admin/users/export?role=admin')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.text).toContain('Admin User')
    expect(res.text).not.toContain('User User')

    // Compter les lignes qui correspondent à nos utilisateurs de test uniquement
    const lines = res.text.split('\n').filter(l => l.trim() && l.includes('export-user-'))
    // On doit avoir exactement 1 ligne (Admin User)
    expect(lines.length).toBe(1)
  })

  it('respecte le filtre de rôle (user)', async () => {
    // Créer nos utilisateurs de test
    await query(
      `INSERT INTO users (email, first_name, role) VALUES
       ('export-user-admin2@example.com', 'Admin User 2', 'admin'),
       ('export-user-regular2@example.com', 'User User 2', 'user')`
    )

    const res = await request(testServer())
      .get('/api/admin/users/export?role=user')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.text).toContain('User User 2')
    expect(res.text).not.toContain('Admin User 2')

    // Compter les lignes qui correspondent à nos utilisateurs de test uniquement
    const lines = res.text.split('\n').filter(l => l.trim() && l.includes('export-user-'))
    // On doit avoir exactement 1 ligne (User User 2)
    expect(lines.length).toBe(1)
  })

  it('respecte la recherche par email', async () => {
    await query(
      `INSERT INTO users (email, first_name, role) VALUES
       ('export-user-marie@example.com', 'Marie Dupont', 'user'),
       ('export-user-jean@example.com', 'Jean Martin', 'user')`
    )

    const res = await request(testServer())
      .get('/api/admin/users/export?search=marie')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.text.toLowerCase()).toContain('marie')
    expect(res.text.toLowerCase()).not.toContain('jean')
  })

  it('respecte la recherche par nom', async () => {
    await query(
      `INSERT INTO users (email, first_name, role) VALUES
       ('export-user-3@example.com', 'Sophie Bernard', 'user'),
       ('export-user-4@example.com', 'Pierre Durand', 'user')`
    )

    const res = await request(testServer())
      .get('/api/admin/users/export?search=sophie')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.text).toContain('Sophie')
    expect(res.text).not.toContain('Pierre')
  })

  it('gère les téléphones null comme champ vide', async () => {
    await query(
      `INSERT INTO users (email, first_name, phone, role) VALUES
       ('export-user-nophone@example.com', 'No Phone', NULL, 'user')`
    )

    const res = await request(testServer())
      .get('/api/admin/users/export')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)

    const lines = res.text.split('\n')
    const userLine = lines.find(l => l.includes('No Phone'))
    expect(userLine).toBeDefined()

    // Vérifier que le champ téléphone est vide (pas de "null" ou "undefined")
    const parts = userLine!.split(';')
    // Téléphone est le 4ème champ (index 3) dans l'ordre email;first_name;last_name;phone;role
    expect(parts[3]).toBe('')
  })

  it('aligne Prénom/Nom en colonnes distinctes + en-tête exact (D5)', async () => {
    await query(
      `INSERT INTO users (email, first_name, last_name, role) VALUES
       ('export-split-name@example.com', 'Jean', 'Dupont', 'user')`
    )

    const res = await request(testServer())
      .get('/api/admin/users/export')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    const textWithoutBOM = res.text.replace(/^\uFEFF/, '')
    const lines = textWithoutBOM.split('\n')

    // En-tête exact, jamais asservi auparavant (décision 5 : 2 colonnes séparées)
    expect(lines[0]).toBe('email;first_name;last_name;phone;role;profession;informations')

    // Valeurs distinctes : détecte un swap Prénom↔Nom (Prénom=index 1, Nom=index 2)
    const userLine = lines.find(l => l.includes('export-split-name@example.com'))
    expect(userLine).toBeDefined()
    const parts = userLine!.split(';')
    expect(parts[1]).toBe('Jean')
    expect(parts[2]).toBe('Dupont')
  })

  it('exporte profession et informations', async () => {
    await query(
      "INSERT INTO users (email, first_name, role, profession, informations) VALUES ('export-user-profinfo@example.com', 'Pi', 'user', 'Menuisier', 'Dispo le samedi')"
    )
    const res = await request(testServer())
      .get('/api/admin/users/export?search=export-user-profinfo')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    const line = res.text.split('\n').find((l) => l.includes('export-user-profinfo@example.com'))!
    const parts = line.replace('\r', '').split(';')
    expect(parts[5]).toBe('Menuisier')     // profession
    expect(parts[6]).toBe('Dispo le samedi') // informations
  })

  it('exporte le rôle brut (user/admin, jamais un label FR)', async () => {
    await query(
      `INSERT INTO users (email, first_name, role) VALUES
       ('export-user-roleraw@example.com', 'Role Raw', 'admin')`
    )

    const res = await request(testServer())
      .get('/api/admin/users/export?search=export-user-roleraw')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)

    const lines = res.text.replace(/^\uFEFF/, '').split('\n')
    const userLine = lines.find(l => l.includes('export-user-roleraw@example.com'))
    expect(userLine).toBeDefined()

    const parts = userLine!.split(';')
    // Rôle = index 4 dans email;first_name;last_name;phone;role
    expect(parts[4]).toBe('admin')
    expect(parts[4]).not.toBe('Administrateur')
    expect(parts[4]).not.toBe('Utilisateur')
  })


  it('combine les filtres recherche et rôle', async () => {
    await query(
      `INSERT INTO users (email, first_name, role) VALUES
       ('export-user-admin3@example.com', 'Admin Marie', 'admin'),
       ('export-user-parent3@example.com', 'User Marie', 'user')`
    )

    const res = await request(testServer())
      .get('/api/admin/users/export?search=marie&role=user')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.text).toContain('User Marie')
    expect(res.text).not.toContain('Admin Marie')
  })

  it('retourne 401 sans authentification', async () => {
    const res = await request(testServer())
      .get('/api/admin/users/export')

    expect(res.status).toBe(401)
  })

  it('a les en-têtes CSV corrects', async () => {
    const res = await request(testServer())
      .get('/api/admin/users/export')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8')
    expect(res.headers['content-disposition']).toMatch(/attachment/)
    expect(res.headers['content-disposition']).toMatch(/\.csv/)
  })
})
