# Coding Lab — Border néon tournant

## Comportement

- **Exclusif aux cartes Coding Lab** (tuiles de langage + tuile Jupyter, dans
  `src/components/coding/CodingLab.tsx`) — aucune autre carte COVA ne l'utilise.
- Au survol (desktop, pointeur fin uniquement : `hover: hover` + `pointer: fine`),
  un faisceau lumineux apparaît sur le **contour** de la carte et **tourne**
  (3 s par tour, linéaire). Il ne recouvre jamais le contenu : le conic-gradient
  est masqué en anneau de 1 px (`mask-composite: exclude`).
- Le focus clavier (`:focus-visible`) reçoit le même traitement — l'effet n'est
  jamais une dépendance pour accéder au contenu.
- À la sortie du hover, l'anneau disparaît en fondu (250 ms).
- `prefers-reduced-motion` : l'anneau apparaît mais **sans rotation** (accent
  statique). Les navigateurs sans `@property` affichent l'anneau statique aussi.

## Implémentation

- CSS : `src/app/globals.css` (section « coding lab neon border ») —
  `@property --neon-angle`, `.cova-neon-card::before`, keyframes `neon-rotate`.
- La couleur suit la palette active via le token **`--coding-neon`**, défini
  pour chaque palette en Light et Dark (22 valeurs) dans la section
  « palette system » du même fichier.
- Performance : un seul pseudo-élément par carte, animation d'une custom
  property (compositing GPU), `pointer-events: none`, aucune lecture JS.

## Couleurs retenues par palette (approuvées et testées)

La visibilité du faisceau a été vérifiée par code (ratio ≥ 2.5:1 sur la surface
— `scripts/palette_charter.py`, recalculé par `scripts/test-palettes.ts`).

| Palette | Light | Dark | Identité |
|---|---|---|---|
| Soft Blue (défaut) | `#5FA8D3` | `#6FB7E0` | Bleu brand historique |
| Three Blue | `#2F9FD6` | `#38BDF8` | Bleu éclatant « ciel » |
| Academic Tech Premium | `#8B7FF0` | `#A79BFF` | Violet tech |
| Forest & Copper | `#E08B4E` | `#EDA36A` | Cuivre chaud |
| Midnight Lavender | `#8F76E8` | `#C3ABFF` | Lavande lumineuse |
| Arctic Minimal | `#2BA7C2` | `#63D8EA` | Cyan glaciaire |
| Burgundy & Champagne | `#C99A55` | `#E8C28A` | Or champagne |
| Sage & Stone | `#7FAE62` | `#B8D9A0` | Vert sauge clair |
| Sand & Terracotta | `#D9743A` | `#F5A878` | Terracotta solaire |
| Graphite & Electric Mint | `#0AA87D` | `#35F0B4` | Menthe électrique (identité) |
| **Mono Creative** | **`#FF6338`** | **`#FF754F`** | **Orange — approuvé définitivement** |

Règles respectées :

1. L'orange de Mono Creative n'est **pas** un néon universel : chaque autre
   palette a son propre accent, dérivé de ses couleurs de base sans les
   modifier.
2. Aucune couleur de base de palette n'a changé pour créer ces néons.
3. Les valeurs Light sont calibrées pour rester visibles sur surfaces claires ;
   les valeurs Dark pour rester lumineuses sur surfaces sombres.

## Test

`node scripts/test-palettes.ts` vérifie que `--coding-neon` est défini dans les
22 blocs et recalcule les paires de contraste texte.
