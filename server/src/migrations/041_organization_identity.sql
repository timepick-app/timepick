-- Chantier A1 — façade d'instance & identité d'organisation
-- (docs/2026-07-26-note-page-racine-identite-organisation.md).
--
-- organization_name / organization_description ont été seedées en 001 avec des
-- valeurs placeholder ("Mon Association" / "Plateforme de participation") qu'aucune
-- UI n'a jamais permis d'éditer avant ce chantier — une instance qui n'a jamais
-- configuré son organisation affichait donc un texte figé non voulu plutôt qu'un
-- champ vide. On neutralise ce seed hérité en le vidant, mais UNIQUEMENT quand la
-- valeur est encore le placeholder d'origine : idempotente, et n'écrase jamais une
-- personnalisation déjà faite par un admin entre le seed initial et cette migration.
UPDATE app_config SET value = '', updated_at = NOW() WHERE key = 'organization_name' AND value = 'Mon Association';
UPDATE app_config SET value = '', updated_at = NOW() WHERE key = 'organization_description' AND value = 'Plateforme de participation';

-- homepage_mode ('facade' | 'login') pilote l'aiguilleur de la page racine `/`
-- (contrat chantier A1, décision Q3) : 'facade' (défaut) affiche l'identité de
-- l'organisation aux visiteurs anonymes ; 'login' revient au comportement
-- historique (redirection directe vers /login). Seedée ici à 'facade' pour que les
-- instances existantes ET les nouvelles installs démarrent façade activée.
-- ON CONFLICT DO NOTHING : idempotente si la clé existe déjà (rejeu de la migration).
INSERT INTO app_config (key, value) VALUES ('homepage_mode', 'facade') ON CONFLICT (key) DO NOTHING;
