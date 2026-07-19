# Pre-E4 Email Baselines

**Created:** 2026-05-02 (audit story 25-0/T3, AC3 — closes Epic 24/P3 + Epic 22/A5 carry-over).
**Captured by:** direct extraction of HTML literals from `server/src/services/email.service.ts` HEAD (commit `198593e4`) with deterministic sample variable substitution.
**Purpose:** reference HTML for visual diff comparison against post-E4 `renderEmail()` output (E4.S4).

---

## Why direct extraction (not Mailpit roundtrip)

Two methods were considered:

1. **Live Mailpit roundtrip** — start dev server + Mailpit, trigger each flow, scrape API. Faithful to runtime delivery (transport-level mutations included), but operationally heavy (requires admin login, event setup, booking flow) and non-reproducible without the same DB state.
2. **Direct extraction from source (chosen)** — read the HTML literal in `email.service.ts`, substitute variables with deterministic sample values, write to file. Bit-perfect reproducibility ; the HTML produced is **identical** to what nodemailer would receive as `mailOptions.html` because the inline literal is the email body.

The legacy code path constructs HTML inline (no compilation, no sanitization, no shell injection). The "transport" only adds RFC 2822 headers — irrelevant for visual diff. **Direct extraction is the canonical baseline** ; Mailpit would only add noise.

## File inventory (4 baselines)

| File | Source function | Source lines | TemplateKey (post-E4) |
|------|------------------|--------------|------------------------|
| `email-magic_link_login-admin-pre-e4.html` | `sendAdminMagicLinkEmail` | `email.service.ts:321-361` (HTML 344-357) | `magic_link_login` (admin variant — `is_admin=true`) |
| `email-magic_link_login-user-pre-e4.html` | `sendUserMagicLinkEmail` | `email.service.ts:371-409` (HTML 392-405) | `magic_link_login` (user variant — `is_admin=false`) |
| `email-invitation-pre-e4.html` | `sendEventInvitation` (default-template path) | `email.service.ts:574-643` (uses `DEFAULT_INVITATION_TEMPLATE` 254-291) | `invitation` |
| `email-reservation_confirmation-pre-e4.html` | `sendReservationEmail` | `email.service.ts:759-813` (HTML 787-809) | `reservation_confirmation` |

`magic_link_recovery` was never tracked here: the recovery email template was dropped in migration `027_drop_magic_link_recovery.sql`.

Each file embeds:
- **HTML body** (the `mailOptions.html` value at send time)
- **TEXT-PART** in a comment block (the `mailOptions.text` plain-text counterpart, for non-HTML clients)
- **Header comment** with source line refs + sample variables used for substitution

## Sample variables used

For reproducibility, the same sample inputs are reused across baselines where applicable:

```yaml
admin_email: jensen.siu@example.com
user_email: user@example.com
admin_link: https://timepick.example.com/auth/verify?token=abc123def456
user_link: https://timepick.example.com/auth/verify?token=user789xyz
expirationDate: 2026-12-31T18:00:00Z (formatted "31 décembre 2026 a 18h00" via date-fns/fr)
fullName: "Jean Dupont"
recoveryCodes:
  - A1B2-C3D4
  - E5F6-G7H8
  - J9K0-L1M2
  - N3P4-Q5R6
  - S7T8-U9V0
  - W1X2-Y3Z4
  - 4A5B-6C7D
  - 8E9F-0G1H
event:
  name: "Soirée Annuelle 2026"
  description: "Notre événement phare"
event_invitation_link: https://timepick.example.com/event/abc?token=invite789
slot:
  date: "15 juin 2026"
  time: "14h00 - 15h00"
```

## Out-of-scope baselines (per 25-0/AC5 disposition)

The following 2 functions are DEFERRED out of E4 scope and **do not have a baseline** here (no comparison expected post-E4):

- `sendWelcomeInvitation` (`email.service.ts:522-563`) — non-transactional admin onboarding email, no FR demands brand-tokenized welcome
- `sendSlotCancellationEmail` (`email.service.ts:690-741`) — FR63 covers reservation **confirmation**, not cancellation

These remain inline post-E4 with JSDoc tag `// hors scope E4 — voir 25-0/AC5`.

## Comparison plan for E4.S4

Per 25-0/AC3 Dev Notes T3 + the E4.S4 story scope (`prd.md`):

1. **Capture method** for post-E4 baselines: same direct extraction OR Mailpit roundtrip (E4.S4 author's call). The post-E4 HTML is the output of `renderEmail({ templateKey, eventId?, variables })`.
2. **Comparison surface**:
   - **Body-level diff** (CTA, event_name, magic_link, expiration_date placement + encoding) → **must remain semantically equivalent**
   - **Brand chrome** (header logo + footer mentions + brand-token color/font) → **expected to diverge** (the legacy templates have NO shell ; post-E4 wraps in the global brand-tokenized shell)
3. **Acceptance**: 5/5 baselines reviewed manually side-by-side ; reviewer confirms "body cohérent, brand chrome attendu". The reviewer screenshots both versions in the E4.S4 PR description.
4. **No automated pixel-diff threshold** — the brand chrome divergence is large by design (D-ext4 « single global shell shared across system + invitation emails »). Manual judgment is the gate.

## Reproduction procedure (post-E4)

To regenerate a baseline post-E4 wiring:

**Method A — Direct extraction from `renderEmail()`** (recommended for static comparison):
```bash
# In server/, write a small Jest test that calls:
#   const { html, text } = await renderEmail({ templateKey, eventId?, variables: TEST_VARS })
# Then writes html to server/src/__tests__/fixtures/email-baselines/post-e4/email-{templateKey}-post-e4.html
```

**Method B — Mailpit roundtrip** (faithful to runtime delivery):
```bash
# Terminal 1 — start Mailpit
mailpit
# (or as a service: brew services start mailpit
#  or via docker: docker run -d --name mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit)

# Terminal 2 — start dev server (uses the 127.0.0.1:1025 fallback of buildTransport() in email-transport.service.ts)
npm run dev

# Terminal 3 — trigger flows via admin UI or curl
# Then fetch the latest message's HTML part (Mailpit REST API v1 serves it already decoded):
MSG_ID=$(curl -s http://localhost:8025/api/v1/messages | jq -r '.messages[0].ID')
curl -s "http://localhost:8025/api/v1/message/$MSG_ID" | jq -r '.HTML' > captured.html
```

## References

- Story 25-0 audit (pre-E4 audit of email wiring and cleanup)
- Mapping decisions: 25-0 Dev Notes T5 (9 functions → 4 templateKeys, magic-link variant decision)
- E4 PRD breakdown (Stories breakdown — Epic E4)
- E4.S4 spec (Story E4.S4 — Visual diff verification + Playwright Mailpit E2E)
- Source of truth (legacy email service): `server/src/services/email.service.ts` (commit `198593e4`)
