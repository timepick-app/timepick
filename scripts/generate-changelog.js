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
 *
 * Examples:
 *   node scripts/generate-changelog.js
 *   node scripts/generate-changelog.js --since="1 month ago"
 *   node scripts/generate-changelog.js --output CHANGELOG.md
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Parse les arguments de ligne de commande
 */
function parseArgs(args) {
  const parsed = {
    output: path.join(process.cwd(), 'docs', 'CHANGELOG.md')
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--output=')) {
      const eqIndex = arg.indexOf('=');
      parsed.output = arg.substring(eqIndex + 1);
      if (!path.isAbsolute(parsed.output)) {
        parsed.output = path.join(process.cwd(), parsed.output);
      }
    } else if (arg === '--output' && i + 1 < args.length) {
      parsed.output = args[++i];
      if (!path.isAbsolute(parsed.output)) {
        parsed.output = path.join(process.cwd(), parsed.output);
      }
    }
  }

  return parsed;
}

/**
 * Exécute une commande git et retourne le résultat
 */
function gitLog() {
  const cmd = 'git log --pretty=format:"%H|%s|%an|%ad" --date=short';

  try {
    const output = execSync(cmd, { encoding: 'utf-8' });
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    return [];
  }
}

/**
 * Parse un commit au format conventional commits
 */
function parseCommit(line) {
  const [hash, subject, author, date] = line.split('|');

  // Pattern pour conventional commits avec scope optionnel
  // feat(epic-1): message ou fix: message
  const match = subject.match(/^(\w+)(?:\(([^)]+)\))?:?\s*(.+)$/);

  if (!match) {
    return null;
  }

  const [, type, scope, description] = match;

  return {
    hash,
    type,
    scope: scope || null,
    description: description.trim(),
    author,
    date
  };
}

/**
 * Map les types de commit vers les catégories françaises
 */
const TYPE_CATEGORIES = {
  feat: { label: 'Nouvelles fonctionnalités', order: 1 },
  fix: { label: 'Corrections de bugs', order: 2 },
  docs: { label: 'Documentation', order: 3 },
  test: { label: 'Tests', order: 4 },
  refactor: { label: 'Refactorisation', order: 5 },
  perf: { label: 'Performance', order: 6 },
  style: { label: 'Style', order: 7 },
  chore: { label: 'Tâches diverses', order: 8 },
  ci: { label: 'CI/CD', order: 9 },
  build: { label: 'Build', order: 10 }
};

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
 * Point d'entrée principal
 */
function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log('📝 Génération du CHANGELOG...');

  // Récupérer les commits
  const commitsRaw = gitLog();

  if (commitsRaw.length === 0) {
    console.log('⚠️  Aucun commit trouvé.');
    return;
  }

  console.log(`📊 ${commitsRaw.length} commits trouvés.`);

  // Parser et catégoriser
  const commits = commitsRaw.map(parseCommit).filter(Boolean);
  const commitsByCategory = categorizeCommits(commits);

  console.log(`✅ ${commits.length} commits conventionnels reconnus.`);

  // Afficher les stats par catégorie
  for (const [type, commits] of Object.entries(commitsByCategory)) {
    console.log(`   ${TYPE_CATEGORIES[type].label}: ${commits.length}`);
  }

  // Générer le markdown
  const markdown = generateMarkdown(commitsByCategory);

  // Créer le dossier de sortie si nécessaire
  const outputDir = path.dirname(args.output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Écrire le fichier
  fs.writeFileSync(args.output, markdown, 'utf-8');

  console.log(`\n✅ CHANGELOG généré: ${args.output}`);
}

// Exécuter si appelé directement
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { parseArgs, gitLog, parseCommit, categorizeCommits, generateMarkdown };
