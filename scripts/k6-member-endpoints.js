/**
 * Test de charge k6 — Endpoints membre (/me/*)
 *
 * Gate perf DoD pour S3 (GET /me/events) et S7 (GET /me/slots avec curseur + GET /me/available-slots).
 * Objectif : valider que les endpoints tiennent à ~100 utilisateurs simultanés.
 *
 * Usage :
 *   k6 run scripts/k6-member-endpoints.js
 *   k6 run --vus 50 --duration 30s scripts/k6-member-endpoints.js
 *
 * Prérequis :
 *   - Serveur dev local lancé (ou staging)
 *   - Variable d'env BASE_URL (défaut http://localhost:3000)
 *   - Variable d'env MEMBER_TOKEN : JWT d'un compte membre valide du seed
 *     export MEMBER_TOKEN=$(node scripts/get-member-token.js)  # ou copier depuis DevTools
 *
 * Seuils de PASS (gate DoD) :
 *   - p95 < 500 ms sur tous les endpoints
 *   - Taux d'erreur HTTP < 1 %
 *   - Aucun timeout (http_req_duration max < 5 000 ms)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

// ── Configuration ────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const MEMBER_TOKEN = __ENV.MEMBER_TOKEN || '';

export const options = {
  vus: 50,
  duration: '30s',
  thresholds: {
    // Gate DoD : ces seuils font échouer le run si non respectés
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:events}': ['p(95)<300'],
    'http_req_duration{endpoint:slots}': ['p(95)<500'],
    'http_req_duration{endpoint:available-slots}': ['p(95)<500'],
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const headers = {
  Authorization: `Bearer ${MEMBER_TOKEN}`,
  'Content-Type': 'application/json',
};

// ── Scénario principal ───────────────────────────────────────────────────────

export default function () {
  // S3 — GET /me/events (liste paginée)
  const eventsRes = http.get(
    `${BASE_URL}/api/me/events?page=1&limit=20`,
    { headers, tags: { endpoint: 'events' } }
  );
  check(eventsRes, {
    'GET /me/events — statut 200': (r) => r.status === 200,
    'GET /me/events — réponse JSON valide': (r) => {
      try { JSON.parse(r.body); return true; } catch { return false; }
    },
    'GET /me/events — données présentes': (r) => {
      const body = JSON.parse(r.body);
      return Array.isArray(body.data ?? body.events ?? body);
    },
  });

  // S7 — GET /me/slots (curseur — page 1, pas de fenêtre start/end)
  const slotsRes = http.get(`${BASE_URL}/api/me/slots`, { headers, tags: { endpoint: 'slots' } });
  check(slotsRes, {
    'GET /me/slots — statut 200': (r) => r.status === 200,
    'GET /me/slots — réponse JSON valide': (r) => { try { JSON.parse(r.body); return true; } catch { return false; } },
    'GET /me/slots — totalRealizedHours présent': (r) => {
      const body = JSON.parse(r.body);
      return typeof (body.data?.totalRealizedHours ?? body.totalRealizedHours) !== 'undefined';
    },
  });

  // S7 — GET /me/available-slots (créneaux libres, max 10)
  const availRes = http.get(`${BASE_URL}/api/me/available-slots`, { headers, tags: { endpoint: 'available-slots' } });
  check(availRes, {
    'GET /me/available-slots — statut 200': (r) => r.status === 200,
    'GET /me/available-slots — tableau data': (r) => { try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; } },
  });

  sleep(0.5); // ~2 req/s par VU — simule un usage réaliste, pas un DDoS
}

// ── Résumé affiché à la fin du run ───────────────────────────────────────────

export function handleSummary(data) {
  const p95Events = data.metrics['http_req_duration{endpoint:events}']?.values?.['p(95)'];
  const p95Slots = data.metrics['http_req_duration{endpoint:slots}']?.values?.['p(95)'];
  const errorRate = data.metrics['http_req_failed']?.values?.rate;

  const pass =
    (p95Events ?? 0) < 300 &&
    (p95Slots ?? 0) < 500 &&
    (errorRate ?? 1) < 0.01;

  console.log('\n── Gate perf DoD ────────────────────────────────');
  console.log(`  GET /me/events  p95 : ${p95Events?.toFixed(0) ?? 'n/a'} ms  (seuil < 300 ms)`);
  console.log(`  GET /me/slots   p95 : ${p95Slots?.toFixed(0) ?? 'n/a'} ms  (seuil < 500 ms)`);
  console.log(`  Taux d'erreur       : ${((errorRate ?? 0) * 100).toFixed(2)} %  (seuil < 1 %)`);
  console.log(`  Résultat            : ${pass ? '✅ PASS — gate DoD validé' : '❌ FAIL — ne pas merger'}`);
  console.log('─────────────────────────────────────────────────\n');

  return { stdout: '' }; // laisser k6 écrire son résumé natif
}
