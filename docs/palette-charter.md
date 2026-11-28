# COVA — Charte des palettes (11 palettes × Light/Dark)

> Générée depuis `scripts/palette_charter.py` — ne pas éditer à la main :
> modifier la charte puis régénérer (`python scripts/gen_palette_doc.py` depuis
> le sandbox) ou mettre à jour `scripts/palette_charter.py` ET ce fichier ensemble.

## Règles

1. **Soft Blue est la palette par défaut** de tous les comptes ; sa valeur claire
   vit dans le bloc `@theme` de `src/app/globals.css`, sa valeur sombre dans
   `html.dark`. Elle est l'identité historique de l'application (inchangée).
2. Chaque autre palette est activée par `html[data-palette="<slug>"]` et
   surcharge les mêmes tokens sémantiques ; son mode sombre est le sélecteur
   composé `html[data-palette="<slug>"].dark`.
3. `--color-white` suit la surface en mode sombre (compatibilité `bg-white`).
4. Le token néon du Coding Lab (`--coding-neon`) suit sa palette. L'orange de
   **Mono Creative** (`#FF6338` clair / `#FF754F` sombre) est approuvé tel quel ;
   l'anneau de focus clair utilise une déclinaison plus sombre (`#D94E27`) pour
   respecter le minimum 3:1 de visibilité du focus — l'accent, lui, reste approuvé.
5. **Contraste vérifié par code** : chaque combinaison passe les seuils
   WCAG 2.1 — texte primaire ≥ 7:1, texte secondaire ≥ 4.5:1, texte sur
   surface active (`pale`) ≥ 4.5:1, focus ≥ 3:1, accents décoratifs ≥ 2.5:1.
   `scripts/test-palettes.ts` recalcule ces ratios à chaque exécution : toute
   régression hex casse le test.

## Table complète (22 combinaisons)

Dernière colonne : ratios ink/bg, mute/bg, ink/surface, ink/pale.

| Palette | Mode | Background | Surface | Elevated | Primary | Secondary (soft) | Accent | Text primary | Text secondary | Muted | Border | Success | Warning | Error | Info | Focus ring | Coding Lab neon | Contrastes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `soft-blue` | light | `#f7fafc` | `#ffffff` | `#ffffff` | `#3e6c99` | `#a9cfe5` | `#6f9fba` | `#243447` | `#64748b` | `#6f9fba` | `#e5edf3` | `#2f9e44` | `#b45309` | `#dc2626` | `#2563eb` | `#243447` | `#5fa8d3` | 12.1 / 4.5 / 12.7 / 10.5 |
| `soft-blue` | dark | `#0b1220` | `#101b2d` | `#17253a` | `#8fb8d9` | `#2f5d7c` | `#6f9fba` | `#e7eef6` | `#94a8bc` | `#6f9fba` | `#223247` | `#4fc968` | `#fcc419` | `#ff7070` | `#74c0fc` | `#8fb8d9` | `#6fb7e0` | 16.0 / 7.7 / 14.8 / 12.8 |
| `three-blue` | light | `#f3f7fb` | `#ffffff` | `#ffffff` | `#1f5a96` | `#a5c4e0` | `#3e9ad2` | `#14273d` | `#4f6a85` | `#3e76ad` | `#dfe8f1` | `#2f9e44` | `#b45309` | `#dc2626` | `#1f5a96` | `#1f5a96` | `#2f9fd6` | 14.1 / 5.2 / 15.1 / 12.4 |
| `three-blue` | dark | `#0c1520` | `#14212f` | `#1c2c3d` | `#6fb1e0` | `#2c4f74` | `#5aa9dc` | `#e6eef6` | `#9db4c9` | `#5f9ecb` | `#25384c` | `#51cf66` | `#fcc419` | `#ff6b6b` | `#74c0fc` | `#6fb1e0` | `#38bdf8` | 15.7 / 8.6 / 13.9 / 11.4 |
| `academic-tech-premium` | light | `#f8f7f4` | `#ffffff` | `#fbfaf8` | `#23486f` | `#b9c6d8` | `#6455d8` | `#1d2b3a` | `#5c6b7a` | `#52708f` | `#e6e4de` | `#2f9e44` | `#b45309` | `#d64545` | `#23486f` | `#23486f` | `#8b7ff0` | 13.4 / 5.1 / 14.4 / 11.8 |
| `academic-tech-premium` | dark | `#12161d` | `#1a212b` | `#232c38` | `#93b0d0` | `#3a4f66` | `#9d8ff0` | `#e9ecef` | `#a2b0bd` | `#7c95b0` | `#2c3745` | `#51cf66` | `#fcc419` | `#ff7070` | `#91caff` | `#93b0d0` | `#a79bff` | 15.3 / 8.2 / 13.7 / 11.6 |
| `forest-copper` | light | `#f5f8f3` | `#ffffff` | `#fbfcf9` | `#2e5c3a` | `#acc9a9` | `#b26a35` | `#1f2f25` | `#56685a` | `#4f7f52` | `#e1e8dc` | `#2f9e44` | `#b45309` | `#d64545` | `#2c7a8c` | `#2e5c3a` | `#e08b4e` | 13.1 / 5.6 / 14.1 / 11.4 |
| `forest-copper` | dark | `#111813` | `#19221b` | `#222d23` | `#7fbd85` | `#38513c` | `#d8925d` | `#e8efe7` | `#9fb3a1` | `#6fa571` | `#2b3a2d` | `#51cf66` | `#fcc419` | `#ff7070` | `#66c2cf` | `#7fbd85` | `#eda36a` | 15.4 / 8.1 / 13.9 / 11.7 |
| `midnight-lavender` | light | `#f6f5fa` | `#ffffff` | `#fcfbfe` | `#5e4fa3` | `#c2b8e2` | `#9d7be0` | `#262038` | `#5f5a75` | `#8574b8` | `#e7e4ef` | `#2f9e44` | `#b45309` | `#d64545` | `#5e4fa3` | `#5e4fa3` | `#8f76e8` | 14.4 / 6.0 / 15.6 / 12.4 |
| `midnight-lavender` | dark | `#13111e` | `#1c192b` | `#262238` | `#a58fe0` | `#3f3660` | `#b593f2` | `#ece9f6` | `#a89fc6` | `#8f7fc2` | `#2f2a44` | `#51cf66` | `#fcc419` | `#ff7070` | `#b197fc` | `#a58fe0` | `#c3abff` | 15.6 / 7.5 / 14.3 / 12.8 |
| `arctic-minimal` | light | `#fafbfc` | `#ffffff` | `#ffffff` | `#2e6f96` | `#b5d0e0` | `#38a3c5` | `#1e2831` | `#5a6b78` | `#4f88ab` | `#e4eaee` | `#2f9e44` | `#b45309` | `#d64545` | `#2e6f96` | `#2e6f96` | `#2ba7c2` | 14.4 / 5.3 / 15.0 / 12.8 |
| `arctic-minimal` | dark | `#0f1417` | `#171d21` | `#20282d` | `#74b3d6` | `#2e4859` | `#58b8d4` | `#e7edf1` | `#9aabb8` | `#5f97b8` | `#273138` | `#51cf66` | `#fcc419` | `#ff7070` | `#74c0fc` | `#74b3d6` | `#63d8ea` | 15.7 / 7.8 / 14.4 / 12.7 |
| `burgundy-champagne` | light | `#faf5f3` | `#ffffff` | `#fdfaf8` | `#6e1f3b` | `#d6b0bb` | `#b9965c` | `#2e2126` | `#6b555e` | `#96566b` | `#ebe0dc` | `#2f9e44` | `#b45309` | `#d64545` | `#4a6d8c` | `#6e1f3b` | `#c99a55` | 14.3 / 6.3 / 15.4 / 12.1 |
| `burgundy-champagne` | dark | `#1b1216` | `#261a1f` | `#302329` | `#cf7f95` | `#523440` | `#d9b87e` | `#f3e8eb` | `#b59aa4` | `#a5627b` | `#3c2b33` | `#51cf66` | `#fcc419` | `#ff7070` | `#89b3d1` | `#cf7f95` | `#e8c28a` | 15.3 / 7.1 / 14.0 / 12.5 |
| `sage-stone` | light | `#f6f7f3` | `#ffffff` | `#fcfcfa` | `#4e6b48` | `#bcc9b2` | `#9a8670` | `#272e26` | `#5d665b` | `#71876a` | `#e3e6dd` | `#2f9e44` | `#b45309` | `#d64545` | `#4a6d8c` | `#4e6b48` | `#7fae62` | 13.0 / 5.5 / 14.0 / 11.4 |
| `sage-stone` | dark | `#141613` | `#1d201b` | `#262a24` | `#8fb28a` | `#3c4a38` | `#b3a089` | `#eaeee7` | `#a5b0a1` | `#7e977a` | `#30362d` | `#51cf66` | `#fcc419` | `#ff7070` | `#89b3d1` | `#8fb28a` | `#b8d9a0` | 15.5 / 8.1 / 14.0 / 12.1 |
| `sand-terracotta` | light | `#faf4ec` | `#ffffff` | `#fdf9f4` | `#a34f30` | `#dcbfa2` | `#d97b46` | `#31261e` | `#6d5c4e` | `#ad7345` | `#ecdfcf` | `#2f9e44` | `#b45309` | `#d64545` | `#3e7291` | `#a34f30` | `#d9743a` | 13.5 / 5.8 / 14.7 / 11.8 |
| `sand-terracotta` | dark | `#1c1410` | `#271e18` | `#31261e` | `#dc8f63` | `#4d3a2e` | `#e6905c` | `#f4eadd` | `#bda694` | `#a97a52` | `#3e3026` | `#51cf66` | `#fcc419` | `#ff7070` | `#8ab6d4` | `#dc8f63` | `#f5a878` | 15.3 / 7.8 / 13.7 / 12.3 |
| `graphite-mint` | light | `#f5f6f7` | `#ffffff` | `#fbfcfc` | `#34424e` | `#b4c6c0` | `#0ca678` | `#1f262b` | `#5c6870` | `#3f7a68` | `#e2e6e9` | `#0ca678` | `#b45309` | `#d64545` | `#3b6c94` | `#34424e` | `#0aa87d` | 14.2 / 5.3 / 15.3 / 12.5 |
| `graphite-mint` | dark | `#101315` | `#181d20` | `#22282c` | `#8298a5` | `#2f4a43` | `#2ee6ac` | `#eaf0f2` | `#9babb4` | `#4fae94` | `#2c353b` | `#2ee6ac` | `#fcc419` | `#ff7070` | `#74c0fc` | `#8298a5` | `#35f0b4` | 16.2 / 7.9 / 14.8 / 12.7 |
| `mono-creative` | light | `#F5F5F3` | `#FFFFFF` | `#FFFFFF` | `#252525` | `#D9D9D6` | `#FF6338` | `#252525` | `#5c5c5a` | `#B8B8B8` | `#E4E4E1` | `#2f9e44` | `#d97706` | `#e03131` | `#1c7ed6` | `#D94E27` | `#FF6338` | 14.0 / 6.1 / 15.3 / 13.4 |
| `mono-creative` | dark | `#090909` | `#191919` | `#292929` | `#ECECEA` | `#363636` | `#FF754F` | `#FFFFFF` | `#B8B8B8` | `#B8B8B8` | `#2A2A2A` | `#4fc968` | `#fcc419` | `#ff6b6b` | `#74c0fc` | `#FF754F` | `#FF754F` | 19.9 / 10.0 / 17.6 / 15.7 |
## Application technique

- Tokens : `src/app/globals.css` (section « palette system »).
- Identités/labels : `src/lib/palettes.ts` (+ sélecteur `PalettePicker`).
- Application/persistance : `src/lib/theme.ts` (`usePalette`) et
  `src/lib/user-settings.ts` (Supabase `user_settings.palette`, migration
  `20261115000014_user_settings_palette.sql` à appliquer manuellement ;
  fallback localStorage avant migration).
- Script anti-flash : `src/app/layout.tsx` (applique palette + mode + taille
  de texte avant le premier rendu).
- Test : `node scripts/test-palettes.ts`.
