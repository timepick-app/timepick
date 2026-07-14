import mjml2html from 'mjml'
import DOMPurify from 'isomorphic-dompurify'

export interface MjmlError {
  line: number
  message: string
  tagName?: string
}

export interface MjmlCompileResult {
  html: string
  errors: MjmlError[]
}

// `data-part-kind` is a write-path policy marker (enforced by Zod on shell-part
// upserts); MJML 5.x rejects custom data-* attributes on mj-section even in
// soft mode, and the marker has no rendering role, so strip it before compile.
// Shared with scripts/verify-mjml-strict.ts so the verifier validates the same
// MJML actually compiled (otherwise it false-fails on the policy marker).
export const DATA_PART_KIND_RE = /\s+data-part-kind="(?:header|body|footer)"/g

export async function compileMjml(source: string): Promise<MjmlCompileResult> {
  const cleaned = source.replace(DATA_PART_KIND_RE, '')
  const result = await mjml2html(cleaned, { validationLevel: 'soft' })
  return {
    html: result.html,
    errors: (result.errors ?? []).map((e) => ({
      line: e.line,
      message: e.message,
      tagName: e.tagName,
    })),
  }
}

const SAFE_URI = /^(https?:\/\/|\/uploads\/)/i

// Strip `data:` URIs from src/href ahead of DOMPurify. ALLOWED_URI_REGEXP alone
// is not enough: DOMPurify v3's hard-coded DATA_URI_TAGS (img/audio/video/source/
// image/track) allows `data:` on <img src> regardless of the regex, and the
// allowlist has no public override (only ADD_DATA_URI_TAGS exists). Doing this
// pre-pass keeps the call thread-safe — no `addHook` / `removeAllHooks` mutation
// of the DOMPurify singleton (per F5 trade-off).
function stripDataUris(html: string): string {
  // Quoted attributes: src="data:..." / src='data:...'
  let out = html.replace(
    /\s(src|href|xlink:href)\s*=\s*(['"])\s*data:[\s\S]*?\2/gi,
    ' $1=""'
  )
  // F2 fix: also match UNQUOTED attributes (src=data:...) — DOMPurify v3's
  // hard-coded DATA_URI_TAGS allows data: on <img src> regardless of
  // ALLOWED_URI_REGEXP, so we have to neutralize them before sanitize runs.
  out = out.replace(
    /\s(src|href|xlink:href)\s*=\s*data:[^\s>"'`]*/gi,
    ' $1=""'
  )
  return out
}

export function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(stripDataUris(html), {
    ALLOWED_TAGS: [
      'html', 'head', 'body', 'meta', 'title', 'style',
      'table', 'tbody', 'thead', 'tr', 'td', 'th',
      'div', 'span', 'p', 'a', 'img',
      'strong', 'em', 'b', 'i', 'u', 'br', 'hr',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'center',
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'width', 'height',
      'style', 'class', 'colspan', 'rowspan',
      'align', 'valign', 'bgcolor', 'border',
      'cellpadding', 'cellspacing', 'target', 'rel',
    ],
    ALLOWED_URI_REGEXP: SAFE_URI,
    ADD_ATTR: ['target'],
    // ALLOWED_URI_REGEXP is applied to *every* attribute value unless the
    // attribute name is in DOMPurify's URI_SAFE_ATTRIBUTES list. The default
    // list (alt, class, id, name, role, style, title, value, xmlns, …) does
    // NOT include the email-table presentational attrs we need, so values
    // like `align="center"` or `cellpadding="0"` get rejected against the
    // https://-only regex and stripped. ADD_URI_SAFE_ATTR opts these into
    // the URI-safe bypass without weakening the URI regex for href/src,
    // which still go through the URI/data: protocol checks (lines ~1116 of
    // dompurify/dist/purify.cjs.js).
    ADD_URI_SAFE_ATTR: [
      'align', 'valign', 'bgcolor', 'border',
      'cellpadding', 'cellspacing',
      'width', 'height', 'colspan', 'rowspan',
      'target', 'rel',
    ],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input'],
    // KEEP_CONTENT defaults to true. Setting it to false caused DOMPurify v3
    // to strip text nodes inside allowed tags whenever the input was a full
    // <html>/<head>/<body> document (which mjml2html always produces),
    // resulting in emails with visible structure but no text content.
    // FORBID_TAGS already drops the dangerous wrappers; their inner content
    // becomes plain text, which cannot execute.
    KEEP_CONTENT: true,
  })
}

// Clés réellement interpolées comme placeholders {{...}} dans le HTML compilé.
// Source UNIQUE : la regex VAR_RE en dérive — impossible de désynchroniser le
// type et le moteur d'interpolation (un champ ajouté au type sans l'être à la
// regex resterait littéral dans l'email).
const SUBSTITUTABLE_KEYS = [
  'event_name',
  'event_description',
  'magic_link',
  'expiration_date',
  'slot_date',
  'slot_time',
  'user_first_name',
  'user_last_name',
  'user_full_name',
  // Motif d'annulation pré-formaté côté service (HTML `<strong>Motif :</strong> …`
  // ou ''). Le moteur ne gère pas les blocs conditionnels : un
  // {{cancellation_reason}} vide laisse un <td> vide (perte ~8px, négligeable).
  'cancellation_reason',
  'login_url',
  // Bloc(s) HTML email-safe pré-assemblés côté service (slot_modification) :
  // horaire ancien→nouveau et/ou nouvelle description, selon le diff réel.
  'changes_blocks',
  // URL ABSOLUE du calendrier public (CTA « Gérer ma réservation »).
  'calendar_url',
] as const

type SubstitutableKey = (typeof SUBSTITUTABLE_KEYS)[number]

const VAR_RE = new RegExp(`\\{\\{(${SUBSTITUTABLE_KEYS.join('|')})\\}\\}`, 'g')

export type VariablesPayload = Partial<Record<SubstitutableKey, string>> & {
  // E4.S1 : drapeaux passés par les send-functions, consommés HORS interpolation
  // (jamais des placeholders {{...}}). Les templates DB peuvent ne pas tous les
  // référencer — substituteVariables ignore silencieusement les clés absentes.
  is_admin?: string
}

export function substituteVariables(html: string, vars: VariablesPayload): string {
  // F16 fix : replacer fonction pour que des valeurs contenant `$1`/`$&`/`$'`
  // soient insérées littéralement (sinon un event_name « Pay $50 » corromprait
  // la sortie).
  return html.replace(VAR_RE, (_match, key: SubstitutableKey) => vars[key] ?? '')
}
