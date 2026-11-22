# COVA — Typographie & espacement (Academic Tech Premium)

## Deux visages, un seul système

| Rôle | Face | Token | Usage |
|---|---|---|---|
| Interface, boutons, navigation, formulaires, données | **Manrope** (`--font-sans`) | `font-sans` (défaut) | Tout le chrome applicatif |
| Grands titres & accents de marque | **Playfair Display** (`--font-display`) | `font-display` | Titres de page (`PageHeader`), hero marketing |

- Les deux sont **auto-hébergées** via `next/font` (`src/app/layout.tsx`) : aucune
  requête externe à l'exécution, aucun CLS, `display: swap`.
- Manrope couvre le latin ; l'arabe et les autres scripts basculent sur la pile
  système (déjà le cas avant cette phase — aucun changement de rendu arabe).

## Hiérarchie (tokens Tailwind 4 `--text-*`)

| Token | Classe | Taille (clamp) | Interligne |
|---|---|---|---|
| Display | `text-display` | 36 → 56 px responsive | 1.08 |
| H1 | `text-h1` | 28 → 40 px | 1.15 |
| H2 | `text-h2` | 22 → 28 px | 1.2 |
| H3 | `text-h3` | 18 → 21 px | 1.3 |
| H4 | `text-h4` | 17 px | 1.35 |
| Body Large | `text-body-lg` | 17 px | 1.6 |
| Body | `text-base` (Tailwind défaut) | 16 px | — |
| Body Small | `text-body-sm` | 15 px | 1.55 |
| Caption | `text-caption` | 13 px | 1.45 |
| Label | `text-label` | 12 px, interlettrage 0.06em | 1.4 |
| Data / Numeric | `text-data` | 15 px, `font-mono` recommandé | 1.4 |

Règles : le corps de texte reste sur `text-base`/`text-sm` ; `text-h2` est la
classe des titres de page (`PageHeader`) ; `text-display` est réservé au hero et
aux accents de marque. Toutes les tailles sont en `rem`/`clamp` et suivent donc
la préférence de taille de texte (Settings → small/medium/large).

## Espacement « Fibonacci intelligent »

| Token | Valeur (racine 16 px) | Exemples |
|---|---|---|
| `fib-1` | 4 px | micro-gap, icône/texte |
| `fib-2` | 8 px | gap interne de composant |
| `fib-3` | 13 px | gap de liste compacte |
| `fib-4` | 21 px | padding de carte, gap de section |
| `fib-5` | 34 px | marge sous un titre de page |
| `fib-6` | 55 px | séparation de sections |
| `fib-7` | 89 px | hero, respirations majeures |

Utilisation : `p-fib-4`, `gap-fib-2`, `mb-fib-5`, … La grille de 4 px par défaut
de Tailwind reste disponible pour les ajustements fins — **le Fibonacci fixe le
rythme, il n'est pas un carcan** : on ne dégrade jamais une densité ergonomique
connue pour « coller » à l'échelle (ex. le `gap-4` titre/actions de `PageHeader`
est volontairement conservé).

## Fichiers

- Tokens : `src/app/globals.css` (bloc `@theme`).
- Fonts : `src/app/layout.tsx` (`next/font`, variables `--font-manrope` /
  `--font-playfair`).
- Application de référence : `src/components/ui/PageHeader.tsx`,
  `src/app/(marketing)/page.tsx` (hero). Le rhabillage global des titres est
  traité en Phase 6 (cohérence transversale).
