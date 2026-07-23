#!/usr/bin/env node

/**
 * Générateur de CHANGELOG basé sur l'historique Git
 *
 * Usage:
 *   node scripts/generate-changelog.js [options]
 *
 * Options:
 *   --all             Génère le CHANGELOG complet (défaut)
 *   --since=<date>    Depuis une date (ex: "2024-01-01" ou "1 week ago")
 *   --until=<date>    Jusqu'à une date
 *   --output=<path>   Fichier de sortie (défaut: docs/CHANGELOG.md)
 *   --tag-note        Génère un corps d'annotation de tag (stdout ou --output)
 *   --range=<a..b>    Plage de commits pour --tag-note (défaut: tout l'historique)
 *   --version=<x.y.z> Version pour --tag-note (requis avec --tag-note)
 *   --theme=<texte>   Ligne de thème ajoutée au titre du tag
 *   --public                Avec --tag-note : filtre pour une note publique (couches
 *                           1+2+3 du plan de filtrage des notes de release publiques) —
 *                           types feat/fix/perf/ux/revert, hors commits marqués [no-public]
 *   --exclude-dir=<d>       Répertoire à traiter comme privé (préfixe de chemin) en mode
 *                           --public — répétable, fourni par l'appelant (générique)
 *   --exclude-file=<n>      Fichier à traiter comme privé (chemin complet ou nom de base)
 *                           en mode --public — répétable, fourni par l'appelant
 *
 * Examples:
 *   node scripts/generate-changelog.js
 *   node scripts/generate-changelog.js --since="1 month ago"
 *   node scripts/generate-changelog.js --output CHANGELOG.md
 *   node scripts/generate-changelog.js --tag-note --range v0.30.0..HEAD --version 0.31.0 --theme "Sujet"
 *   node scripts/generate-changelog.js --tag-note --public --range v0.30.0..v0.31.0 \
 *     --version 0.31.0 --theme "Sujet" --exclude-dir <dossier-privé> --exclude-file <fichier-privé>
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Parse les arguments de ligne de commande
 */
function parseArgs(args) {
  const parsed = {
    output: null,
    tagNote: false,
    range: null,
    version: null,
    theme: '',
    public: false,
    excludeDirs: [],
    excludeFiles: []
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    const takeValue = (name) => {
      if (arg.startsWith(name + '=')) return arg.substring(arg.indexOf('=') + 1);
      if (arg === name && i + 1 < args.length) return args[++i];
      return undefined;
    };

    if (arg === '--tag-note') {
      parsed.tagNote = true;
      continue;
    }

    if (arg === '--public') {
      parsed.public = true;
      continue;
    }

    let value;
    if ((value = takeValue('--output')) !== undefined) {
      parsed.output = path.isAbsolute(value) ? value : path.join(process.cwd(), value);
    } else if ((value = takeValue('--range')) !== undefined) {
      parsed.range = value;
    } else if ((value = takeValue('--version')) !== undefined) {
      parsed.version = value;
    } else if ((value = takeValue('--theme')) !== undefined) {
      parsed.theme = value;
    } else if ((value = takeValue('--exclude-dir')) !== undefined) {
      parsed.excludeDirs.push(value);
    } else if ((value = takeValue('--exclude-file')) !== undefined) {
      parsed.excludeFiles.push(value);
    }
  }

  return parsed;
}

/**
 * Exécute une commande git et retourne le résultat
 */
function gitLog(range) {
  const args = ['log', '--pretty=format:%H|%s|%an|%ad', '--date=short'];
  if (range) args.push(range);

  try {
    const output = execFileSync('git', args, { encoding: 'utf-8' });
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    return [];
  }
}

/**
 * Parse un commit au format conventional commits.
 *
 * Capture aussi le `!` optionnel de rupture après type/scope (`feat!:`,
 * `feat(api)!:`) → flag `breaking`. Normalise la casse du type (`Revert "…"`
 * de `git revert` → type `revert`). Le token exact `[no-public]` est détecté
 * puis systématiquement retiré de la description (tous les modes).
 */
function parseCommit(line) {
  const [hash, subject, author, date] = line.split('|');

  // Pattern pour conventional commits avec scope et rupture optionnels
  // feat(epic-1): message, fix: message, feat(api)!: message
  const match = subject.match(/^(\w+)(?:\(([^)]+)\))?(!)?:?\s*(.+)$/);

  if (!match) {
    return null;
  }

  const [, rawType, scope, breakingMark, rawDescription] = match;
  const noPublic = /\[no-public\]/.test(subject);
  const description = rawDescription
    .replace(/\[no-public\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return {
    hash,
    type: rawType.toLowerCase(),
    scope: scope || null,
    breaking: Boolean(breakingMark),
    noPublic,
    description,
    author,
    date
  };
}

/**
 * Map les types de commit vers les catégories françaises.
 * `ux` et `revert` ajoutés après `perf` (types user-facing, cf. plan de
 * filtrage des notes de release publiques) — ordre des types pré-existants
 * inchangé.
 */
const TYPE_CATEGORIES = {
  feat: { label: 'Nouvelles fonctionnalités', order: 1 },
  fix: { label: 'Corrections de bugs', order: 2 },
  docs: { label: 'Documentation', order: 3 },
  test: { label: 'Tests', order: 4 },
  refactor: { label: 'Refactorisation', order: 5 },
  perf: { label: 'Performance', order: 6 },
  ux: { label: 'Améliorations UX', order: 7 },
  revert: { label: 'Retours arrière', order: 8 },
  style: { label: 'Style', order: 9 },
  chore: { label: 'Tâches diverses', order: 10 },
  ci: { label: 'CI/CD', order: 11 },
  build: { label: 'Build', order: 12 }
};

/** Types conservés en mode `--public` (couche 2, §3 du plan). */
const PUBLIC_TYPES = new Set(['feat', 'fix', 'perf', 'ux', 'revert']);

/**
 * Types reconnus par le mode CHANGELOG historique (`--output` seul, sans
 * `--tag-note`) — volontairement NON étendu à `ux`/`revert` : ces ajouts
 * (§3.2 du plan) ne concernent que `--tag-note`, pour préserver la STRUCTURE
 * (sections + ordre) de docs/CHANGELOG.md. Nuance : la normalisation de casse
 * du type (parseCommit, partagée) peut désormais faire remonter un commit
 * freeform à type capitalisé jadis ignoré (ex. « Fix … » sans `:`) ; la
 * structure reste identique, le contenu n'est donc pas byte-exact — dérive
 * bénigne (le CHANGELOG est de toute façon régénéré à chaque release).
 */
const CHANGELOG_TYPES = new Set(Object.keys(TYPE_CATEGORIES).filter((t) => t !== 'ux' && t !== 'revert'));

/**
 * Catégorise les commits par type
 */
function categorizeCommits(commits) {
  const categories = {};

  for (const commit of commits) {
    const category = TYPE_CATEGORIES[commit.type];
    if (!category) continue;

    if (!categories[commit.type]) {
      categories[commit.type] = [];
    }

    categories[commit.type].push(commit);
  }

  return categories;
}

/**
 * Récupère les fichiers touchés par un commit (chemins relatifs, séparateur
 * `/`). Ensemble vide pour un merge/commit vide (comportement `git show`).
 */
function getCommitFiles(hash) {
  try {
    const output = execFileSync('git', ['show', '--name-only', '--format=', hash], { encoding: 'utf-8' });
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    return [];
  }
}

/**
 * True si `filePath` est « privé » selon les listes génériques reçues en
 * argument : sous un `excludeDirs` (préfixe de chemin) ou dont le chemin
 * complet/nom de base matche un `excludeFiles`. Ne connaît AUCUN nom de
 * dossier/fichier privé en dur — valeurs fournies par l'appelant (le script
 * public reste sans littéral privé, cf. plan de filtrage des notes de release).
 */
function isPrivateFile(filePath, excludeDirs, excludeFiles) {
  const isUnderExcludedDir = excludeDirs.some((d) => filePath === d || filePath.startsWith(`${d}/`));
  if (isUnderExcludedDir) return true;

  const basename = filePath.split('/').pop();
  return excludeFiles.some((f) => filePath === f || basename === f);
}

/**
 * Couche 1 (§3 du plan) : conserve le commit si au moins un fichier touché
 * n'est pas privé. Ensemble de fichiers vide (merge, commit vide) → jeté par
 * vacuité. Sans `excludeDirs`/`excludeFiles`, couche 1 est un no-op (tout passe).
 */
function passesFileLayer(commit, excludeDirs, excludeFiles) {
  if (excludeDirs.length === 0 && excludeFiles.length === 0) return true;
  const files = getCommitFiles(commit.hash);
  if (files.length === 0) return false;
  return files.some((f) => !isPrivateFile(f, excludeDirs, excludeFiles));
}

/**
 * Prédicat combiné du mode `--public` (§3.3 du plan, ordre et précédence
 * figés) : couche 1 (empreinte fichiers) puis couche 2 (type) puis couche 3
 * (marqueur `[no-public]`).
 */
function passesPublicFilter(commit, excludeDirs, excludeFiles) {
  if (!passesFileLayer(commit, excludeDirs, excludeFiles)) return false;
  if (!PUBLIC_TYPES.has(commit.type)) return false;
  if (commit.noPublic) return false;
  return true;
}

/**
 * Formate un commit pour le markdown
 */
function formatCommit(commit) {
  const scope = commit.scope ? `(${commit.scope})` : '';
  const hashShort = commit.hash.substring(0, 7);
  return `- ${commit.type}${scope}: ${commit.description} (${hashShort}, ${commit.date})`;
}

/**
 * Génère le markdown du CHANGELOG
 */
function generateMarkdown(commitsByCategory) {
  let markdown = '# Changelog\n\n## [Unreleased]\n\n';

  // Trier les catégories par ordre
  const sortedTypes = Object.keys(commitsByCategory).sort(
    (a, b) => TYPE_CATEGORIES[a].order - TYPE_CATEGORIES[b].order
  );

  if (sortedTypes.length === 0) {
    markdown += '_Aucun commit trouvé._\n';
    return markdown;
  }

  // Générer chaque section
  for (const type of sortedTypes) {
    const commits = commitsByCategory[type];
    const categoryInfo = TYPE_CATEGORIES[type];

    markdown += `### ${categoryInfo.label}\n\n`;

    // Trier par date (plus récent en premier)
    commits.sort((a, b) => new Date(b.date) - new Date(a.date));

    for (const commit of commits) {
      markdown += formatCommit(commit) + '\n';
    }

    markdown += '\n';
  }

  return markdown;
}

/**
 * Détecte les commits de release (bump de version / régénération du CHANGELOG)
 * à exclure des notes de version.
 */
function isReleaseChore(commit) {
  if (commit.type !== 'chore') return false;
  return (
    /^bump version/i.test(commit.description) ||
    /régénère le CHANGELOG/i.test(commit.description)
  );
}

/**
 * Génère le corps d'annotation d'un tag de version (feat/fix/… groupés).
 * `commits` = liste PLATE (déjà filtrée en amont si besoin — ex. `--public`,
 * `isReleaseChore`) : la catégorisation par type est faite ici.
 *
 * Les commits `breaking` (§3.1 du plan) sont extraits en tête dans une
 * section dédiée « Ruptures / Breaking changes » et ne réapparaissent pas
 * dans leur section de type habituelle (évite le doublon).
 */
function generateTagNote(version, theme, commits) {
  const title = theme ? `v${version} ${theme}` : `v${version}`;
  let body = `${title}\n`;

  const breakingCommits = commits.filter((commit) => commit.breaking);
  if (breakingCommits.length > 0) {
    body += '\nRuptures / Breaking changes\n';
    for (const commit of breakingCommits) {
      const scope = commit.scope ? `(${commit.scope}) ` : '';
      body += `- ${scope}${commit.description}\n`;
    }
  }

  const commitsByCategory = categorizeCommits(commits.filter((commit) => !commit.breaking));
  const sortedTypes = Object.keys(commitsByCategory).sort(
    (a, b) => TYPE_CATEGORIES[a].order - TYPE_CATEGORIES[b].order
  );

  for (const type of sortedTypes) {
    const typeCommits = commitsByCategory[type];
    if (!typeCommits || typeCommits.length === 0) continue;

    body += `\n${TYPE_CATEGORIES[type].label}\n`;
    for (const commit of typeCommits) {
      const scope = commit.scope ? `(${commit.scope}) ` : '';
      body += `- ${scope}${commit.description}\n`;
    }
  }

  return body;
}

/**
 * Point d'entrée principal
 */
function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.tagNote) {
    mainTagNote(args);
    return;
  }

  console.log('📝 Génération du CHANGELOG...');

  // Récupérer les commits
  const commitsRaw = gitLog();

  if (commitsRaw.length === 0) {
    console.log('⚠️  Aucun commit trouvé.');
    return;
  }

  console.log(`📊 ${commitsRaw.length} commits trouvés.`);

  // Parser et catégoriser
  const commits = commitsRaw.map(parseCommit).filter(Boolean).filter((commit) => CHANGELOG_TYPES.has(commit.type));
  const commitsByCategory = categorizeCommits(commits);

  console.log(`✅ ${commits.length} commits conventionnels reconnus.`);

  // Afficher les stats par catégorie
  for (const [type, list] of Object.entries(commitsByCategory)) {
    console.log(`   ${TYPE_CATEGORIES[type].label}: ${list.length}`);
  }

  // Générer le markdown
  const markdown = generateMarkdown(commitsByCategory);

  // Créer le dossier de sortie si nécessaire
  const outputPath = args.output || path.join(process.cwd(), 'docs', 'CHANGELOG.md');
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Écrire le fichier
  fs.writeFileSync(outputPath, markdown, 'utf-8');

  console.log(`\n✅ CHANGELOG généré: ${outputPath}`);
}

/**
 * Mode note de tag : imprime (stdout) ou écrit (--output) le corps
 * d'annotation d'une version, dérivé d'une plage de commits.
 * `--public` applique en plus le prédicat combiné (§3.3 du plan) — couches
 * 1 (`--exclude-dir`/`--exclude-file`) + 2 (type) + 3 (`[no-public]`).
 */
function mainTagNote(args) {
  if (!args.version) {
    console.error('❌ --tag-note requiert --version <X.Y.Z>');
    process.exitCode = 1;
    return;
  }

  let commits = gitLog(args.range)
    .map(parseCommit)
    .filter(Boolean)
    .filter((commit) => !isReleaseChore(commit));

  if (args.public) {
    commits = commits.filter((commit) => passesPublicFilter(commit, args.excludeDirs, args.excludeFiles));
  }

  const note = generateTagNote(args.version, args.theme, commits);

  if (args.output) {
    fs.writeFileSync(args.output, note, 'utf-8');
  } else {
    process.stdout.write(note);
  }
}

// Exécuter si appelé directement
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { parseArgs, gitLog, parseCommit, categorizeCommits, generateMarkdown, generateTagNote, isReleaseChore, getCommitFiles, isPrivateFile, passesPublicFilter, PUBLIC_TYPES, CHANGELOG_TYPES };
