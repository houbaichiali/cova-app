# COVA — Audit Phase 0 : récompenses, badges, saisie de points et Coding Lab

**Branche :** `feat/community-rewards-badges-overhaul` — **Commit de départ :** `c17cc20cecfaf6dfeb7731a2710fb45fe5cd3294` (origin/main, 2026-11-14)
**Date :** 2026-11-15 · **Portée :** audit statique, aucune modification fonctionnelle.

Ce document prépare la refonte en 13 phases (0 → 12) décrite dans la spécification « Refonte complète des fonctionnalités communautaires, du système de récompenses et de l'Administration ». Il complète l'audit communautaire précédent (106 fonctionnalités, catégories A–J, rapport livré séparément et résumé dans `docs/profile-portfolio-audit.md`).

## 1. Architecture XP actuelle

| Objet | Définition | Points clés |
|---|---|---|
| `xp_ledger` | `20261101000001_gamification.sql:65-74` | `unique (user_id, event_key)` = idempotence ; montants négatifs réservés à `admin:%` ; RLS : lecture de ses lignes seulement |
| `grant_xp` | `gamification.sql:83-97` | SECURITY DEFINER, **révoquée** à public/authenticated/anon ; no-op si `amount <= 0` ; no-op silencieux sur doublon |
| `quiz_grant_xp` | `20261103000002_quiz_hardening.sql:265-278` | Clone sans le `revoke` → exécutable par les clients via PostgREST : **faille à corriger (Phase 1)** |
| `profiles.xp` | colonne live (hors migrations, `05_base_schema_stub.sql:118-120`) | source de vérité ; trigger `profile_level_up` → notification `level_up` |
| Courbe | `level_for_xp` (`20261104000001_xp_analytics.sql:9-28`) + miroir `src/lib/level-curve.ts` | `50n² + 450n` (L1=500 … L10=9500) ; délibérément non configurable (`admin_gamification.sql:12-14`) |
| Analytics | `xp_period_sums` | somme du **ledger** — donc aveugle au XP des défis (voir §5) |

**Clés d'événement produites aujourd'hui (toutes côté SQL, jamais côté client) :** `badge:<key>` (trigger badge), `quiz:<attempt_id>`, `quiz:<game_id>`, `admin:<idempotency_key>`. Le XP des défis ne produit **aucune** ligne de ledger.

## 2. Badges actuels

- `badge_definitions` (`gamification.sql:10-27` + colonne `image_url` ajoutée en `20261105000003`) : clé PK immuable, `metric` (liste blanche de 12 métriques), `threshold`, `rarity` (5 valeurs), `xp_reward` (défaut 20), `secret`, `limited`, fenêtre de disponibilité.
- `user_badges` : `unique (user_id, badge_key)`, `recipient_number` (éditions limitées uniquement), `pinned` (max 3 côté app). **Pas de colonne `edition_number`, pas de modèle de rang.** Les paliers progressifs sont des clés distinctes (`bookworm`, `bookworm-unc`, …).
- **44 badges semés** dans 8 catégories (`getting-started` 3, `learning` 10, `consistency` 9, `excellence` 4, `challenges` 4, `community` 2, `coding` 3, `special` 9) — inventaire complet dans le code source (`gamification.sql:595-651`).
- Moteur `evaluate_badges` (révoqué aux clients) déclenché par 5 triggers (leçons, défis, tentatives de devoirs, amitiés acceptées, profil) + cron anniversaire + backfill initial. Chaque attribution → `grant_xp('badge:<key>')` + notification `badge_unlocked`.
- 12 métriques : `registered`, `profile_complete`, `lessons_done`, `modules_done`, `streak`, `friends`, `challenges_done`, `assessments_done`, `perfect_scores`, `high_scores`, `code_done`, `badges_count`. **Aucune métrique sociale au-delà des amitiés.**
- Admin : `GamificationCenter.tsx` via `admin_badge_save` / `admin_badges_list` / `admin_badge_recipients` / `admin_xp_adjust` / `admin_xp_history`, permissions `gamification.badges.manage` et `gamification.xp.adjust`. Les badges ne sont jamais supprimés (désactivation) — les `user_badges` historiques restent valides.

## 3. Saisie manuelle de points — inventaire complet

Sites où un humain saisit un montant qui influence le scoring ou le XP :

| Site | Fichier:ligne | Champ | Colonne écrite | Validation serveur |
|---|---|---|---|---|
| Création de défi | `src/components/learning/ChallengesBoard.tsx:184` | points (1–1000) | `challenges.points` | CHECK DB seulement ; **insérable par tout utilisateur authentifié** |
| Création de devoir (externe) | `src/components/learning/AssignmentCreate.tsx:345` | points (1–10000) | `assignments.points` | CHECK DB ; RLS propriétaire de cours |
| Devoir interactif | `AssignmentCreate.tsx:110-113` | total **auto** par type (2/4/5 pts) | `assignments.points` | idem — déjà « moteur », lecture seule à l'écran |
| TP de cours | `CourseDetail.tsx:326` | **100 codé en dur** | `assignments.points` | — |
| Notation tentative | `AttemptGrading.tsx:181` | note ≤ points | `assignment_attempts.score` | RPC `grade_assignment_attempt` (borne vérifiée) |
| Notation devoir externe | `AssignmentDetailView.tsx:452` | note ≤ points | `assignment_submissions.grade` | RLS + trigger anti-retard |
| TP — review | `CourseDetail.tsx:1165` | note /100 | `tp_submissions.grade` | **table hors migrations**, contrôle client seulement |
| Admin — XP badge | `GamificationCenter.tsx:582` | xp_reward | `badge_definitions.xp_reward` | **pas de contrôle de plage** dans `admin_badge_save` |
| Admin — ajustement XP | `GamificationCenter.tsx:716` | ±montant | `xp_ledger` + `profiles.xp` | **légitime** : permission + raison + clé d'idempotence + borne |

Faux positifs vérifiés (non récompenses) : durées en minutes (cours/leçons/modules/devoirs), index de bonne réponse, progression d'objectif %, mode `scoring` du quiz. `QuizCreateWizard` n'a **aucun** champ de points ; Coding Lab **lit** seulement `assignments.points`.

**Sites d'affichage informatif à conserver** (non exhaustif) : `ChallengeDetailView.tsx:171`, `QuizResults.tsx:122`, `LeaderboardPageContent.tsx:74`, `AchievementsCard.tsx:41`, clés i18n `challenges.points`, `quiz.xp`, `quiz.xpEarned`, `notif.xp_earned`.

## 4. Coding Lab

- **Registre réel : 13 langages** codés en dur dans `src/components/coding/CodingLab.tsx:14,36-50` — `python, javascript, typescript, html, css, c, cpp, java, csharp, php, go, rust, sql` (+ Jupyter Notebook Python séparé). `src/lib/langs.ts` est un autre registre (52 langues humaines de traduction) — ne pas confondre. Aucune table DB pour les langages.
- **Exécution** : worker navigateur (JS/TS), API publique Wandbox (Python/C/C++/Java/C#/PHP/Go/Rust), sql.js WASM (SQL), iframe sandboxée (HTML/CSS). Aucune exécution serveur ; les « défis de code » sont corrigés par **égalité de réponses JSONB**, pas par exécution.
- **Persistance : aucune** (localStorage `cova-coding-projects-v1`). Le langage ne survit que comme texte libre dans `assignment_submissions.submission_text` lors d'un devoir de code.
- **Trophées par langage : inexistants** (grep `trophy|skill_xp` : uniquement des icônes). Construction additive nécessaire : registre en DB + table de tentatives + compteurs par langage.

## 5. Écarts de sécurité et d'intégrité liés aux récompenses

1. **`public.quiz_grant_xp` sans `revoke`** (`quiz_hardening.sql:265-278`) : sous les privilèges PostgreSQL par défaut, tout utilisateur connecté peut probablement l'appeler via PostgREST et se forger du XP avec une clé arbitraire. *Correction Phase 1.*
2. **`submit_challenge` court-circuite le ledger** (`20261031000001_notifications_and_xp.sql:131`) : `profiles.xp` est incrémenté directement, sans ligne `xp_ledger` — XP invisible pour `xp_period_sums` (classements) et `admin_xp_history`. Conséquence : `sum(xp_ledger) != profiles.xp` ; **ne jamais recalculer `profiles.xp` depuis le ledger** (le XP historique des défis disparaîtrait). *Correction Phase 1 : routage via `grant_xp` avec clé `challenge:<challenge_id>` (idempotent).*
3. **`challenges.points` convertible 1:1 en XP par tout utilisateur** (création ouverte + `submit_challenge`). Le verrouillage complet arrive en Phase 5/6 (moteur de règles) ; la Phase 1 documente le risque et route le XP dans le ledger pour traçabilité.
4. **`admin_badge_save` n'encode pas la plage de `p_xp_reward`** (négatifs acceptés jusqu'à la garde `<=0` de `grant_xp`). *Serrage en Phase 5.*
5. **`tp_submissions` hors chaîne de migrations** (référencé par `CourseDetail.tsx:567`, aucune migration) — zone grise à documenter ; ne pas la supprimer.

## 6. Listes conservées / corrigées / ajoutées

**Conservées (inchangées)** : courbe de niveaux `50n²+450n` et niveaux acquis ; `xp_ledger`, `grant_xp`, `learning_days`, badges et éditions limitées existants ; notifications `xp_earned`/`badge_unlocked`/`level_up` ; chaîne d'amitiés, profils/portefeuilles, MP, espaces et publications (audit communautaire) ; l'outil admin d'ajustement XP.

**Corrigées (Phase 1)** : exposition de `quiz_grant_xp` ; XP des défis hors ledger ; buckets `dm-media`/`space-media` publics et sans validation ; insert média sans contrainte de chemin ; sanctions (restriction/suspension) sans effet côté serveur ; privilège UPDATE manquant sur `portfolio_skills` ; 4 erreurs lint préexistantes (`useVoiceMesh.ts:209`, `spaces-client.ts:174-176`).

**Ajoutées (Phases 2 → 12)** : gestion complète des groupes (départ, membres, rôles, édition/suppression) ; signalement accessible aux élèves + blocage utilisateur ; likes/commentaires/mentions/favoris/abonnements ; Q&A avec votes et meilleures réponses ; collaboration (partenaires, mentorat, projets partagés) ; moteur Reward Rules configurable (catégories, difficultés, Global XP vs Skill Trophies) ; suppression de toute saisie manuelle de points ; modules Admin Reward Rules et Badge Management (8 rangs, visibilité, événementiels) ; progression Coding Lab par langage + Coding Mastery ; intégration finale.

## 7. Plan des migrations (toutes additives, jamais destructives)

| Phase | Migration(s) prévue(s) | Contenu |
|---|---|---|
| 1 | `20261115000001_security_hardening.sql` | revoke `quiz_grant_xp` ; buckets médias privés + limite 25 Mo ; lectures réservées aux authentifiés ; inserts contraints (dossier espace adhérent / dossier utilisateur) ; gating `me_sanctions()` sur insertions sociales ; grant/policy UPDATE `portfolio_skills` ; `submit_challenge` routé vers le ledger |
| 1 | `20261115000002_spaces_schema_reconciliation.sql` | DDL réconcilié (source : `05_base_schema_stub.sql` + usages code) pour `spaces`, `space_members`, `space_posts`, `join_codes`, gardé `if not exists` + re-création idempotente des policies v3 — **à valider par `pg_dump` avant application** |
| 2 | `20261116xxxxxx_community_foundations.sql` | départ de groupe (RLS delete self existe déjà), rôles/gestion membres, file d'approbation, signalement utilisateur (`content_ref` structuré) |
| 3 | `20261117xxxxxx_social_interactions.sql` | `post_reactions` (unique user/post/kind), `post_comments` (parent_id), `user_blocks`, `follows`, triggers de notification |
| 4 | `20261118xxxxxx_qa_collaboration.sql` | `qa_questions`, `qa_answers`, `qa_votes`, tags/catégories, partenaires/mentorat/projets partagés |
| 5 | `20261119xxxxxx_reward_engine.sql` | `reward_rules` (catégorie, activité, difficulté, Global XP, Skill Trophies, actif), `reward_rule_history`, registre `coding_languages`, `skill_trophy_ledger` (ou compteur + ledger), backfill projeté du XP défis |
| 8 | `20261120xxxxxx_badge_overhaul.sql` | colonnes rang/trophées sur `badge_definitions`, `badge_rank_awards` (unique user/badge/rang), 8 rangs configurables, 3 modes de visibilité serveur |
| 10 | `20261121xxxxxx_coding_progression.sql` | `coding_attempts` (langage, résultat), compteurs par langage, seuils configurables |

Invariants : jamais de recalcul de `profiles.xp` depuis le ledger ; clés d'événement à préfixes nouveaux (`rule:`, `trophy:`, `rank:`) sans collision ; badges jamais re-clés ; suppression remplacée par désactivation/archivage.

## 8. Plan de tests

| Test | Commande | État au commit de départ (c17cc20) |
|---|---|---|
| TypeScript | `npm run typecheck` | ✅ 0 erreur |
| ESLint | `npm run lint` | ❌ **4 erreurs préexistantes** (introduites par fa423fe/c17cc20, pas par ce travail) : `useVoiceMesh.ts:209` setState dans effet ; `spaces-client.ts:174,175,176` accès ref pendant le rendu. + 8 avertissements. Correction planifiée Phase 1 |
| Build production | `npm run build` | ✅ réussi (toutes routes générées, proxy inclus) |
| Régression XP/niveaux | `node --experimental-strip-types scripts/test-xp-levels.ts` | ✅ **29/29** |
| Harnais SQL RLS (141+ vérifications) | `createdb covatest && psql -d covatest -f supabase/tests/00_mock_supabase.sql && psql -d covatest -f supabase/migrations/<chaîne complète> && psql -d covatest -f supabase/tests/10_rls_tests.sql` puis `20_admin_tests.sql`, `30_profile_tests.sql` | ⚠️ **Non exécutable dans ce bac à sable (aucun PostgreSQL disponible)** — à exécuter par le propriétaire ; les nouvelles migrations de Phase 1 seront accompagnées d'un fichier `40_security_hardening_tests.sql` documenté de la même façon |

## 9. Risques et données à préserver

1. **`profiles.xp` reste la source de vérité** (le XP défis historique n'est pas dans le ledger) — toute logique « somme du ledger » (classements, analytics) est déjà incomplète ; la correction Phase 1 n'ajoute que le futur.
2. **Clés de badges immuables** : la refonte 8 rangs doit ajouter une dimension additive, jamais re-cléer `bookworm` → rangs.
3. **`user_badges.recipient_number`** : séquences d'éditions limitées à préserver telles quelles.
4. **Registre langages côté client** : à dupliquer en table avec politique administrative « ajout/désactivation » sans retirer les rangs déjà gagnés.
5. **Écart de schéma live vs dépôt** (spaces/join_codes, colonnes `bio`/`user_code`/`xp`, `tp_submissions`) : migrations réconciliées écrites à partir du stub et du code, à valider par `pg_dump --schema-only` avant application — aucune application en production pendant ces phases.
6. **Confirmations d'autorisation requises (règles du mandat)** : toute migration touchant des données existantes sera présentée avant application ; aucune exécution en production.

## 10. Ordre d'exécution et dépendances

Phase 1 (sécurité) → Phase 2 (fondations groupes + signalement) → Phase 3 (interactions) → Phase 4 (Q&A/collaboration) → Phase 5 (moteur Reward Rules + séparation Global XP / Skill Trophies) → Phase 6 (suppression de la saisie manuelle dans les formulaires) → Phase 7 (Admin Reward Rules) → Phase 8 (refonte badges 8 rangs) → Phase 9 (Admin Badge Management) → Phase 10 (Coding Lab/Coding Mastery) → Phase 11 (intégration) → Phase 12 (validation finale). Les phases 5/6/7 dépendent de la réconciliation de schéma (Phase 1) et du registre langages ; la Phase 10 dépend du moteur (Phase 5) ; la Phase 11 dépend de tout le reste.

## 11. État d'implémentation (Phase 12)

Statut après exécution des phases 0 → 12 sur la branche `feat/community-rewards-badges-overhaul` (13 commits, base c17cc20) :

| Phase | Contenu livré | Migrations |
|---|---|---|
| 0 | Audit + plan (ce document) | — |
| 1 | Buckets médias privés (25 Mo), sanctions serveur, revoke quiz_grant_xp, portfolio UPDATE, XP défis dans le ledger, réconciliation espaces | `20261115000001`–`000002` |
| 2 | Signalement élève (`report_content`), départ/rôles/membres/suppression de groupe, rang dashboard réel, 19 kinds notifiés, cron préférences | `20261115000003` |
| 3a | Réactions (4 types), commentaires imbriqués, blocage bidirectionnel RLS | `20261115000004` |
| 3b | Abonnements + notifications, marque-pages privés + page /saved, UI bloquer/suivre | `20261115000005` |
| 4 | Q&A (votes, meilleure réponse atomique par RPC), partenaires/mentorat | `20261115000006` |
| 5 | Moteur Reward Rules : `reward_rules` + `grant_activity_reward` (idempotent, Global XP + Skill Trophies), registre 13 langages, `admin_rules_save` + historique | `20261115000007` |
| 6 | Fin de la saisie manuelle : `challenges.points` dérivé serveur (trigger), `submit_challenge` payé par règles (crédit partiel conservé, repli legacy), champ points retiré des formulaires défi/devoir externe (devoir externe noté /100 fixe) | `20261115000008` |
| 7 | Module Admin « Reward rules » (`/admin/reward-rules`, permission `gamification.rules.manage`) | — |
| 8 | Badges : `visibility_mode` (public/privé/caché), échelle de 8 rangs par badge (`ranks` jsonb), `badge_rank_awards` + XP ledger + notifications, triggers sur les 5 événements du moteur de badges, seed bookworm (10→1600) | `20261115000009` |
| 9 | Admin Badge Management : éditeur visibilité + paliers JSON avec validation SQL, `admin_badge_save/list` étendus (compat. conservée) | `20261115000010` |
| 10 | Coding Lab : `coding_attempts` (1 par devoir, idempotent), trophée par langage via le moteur, `my_coding_mastery()` (8 niveaux), panneau Maîtrise dans Coding Lab | `20261115000011` |
| 11 | Câblage : devoirs (soumission → 25 XP), leçons (complétion → 10 XP), réponses Q&A (→ 5 XP) via le moteur ; préférences notifications étendues aux nouveaux kinds | `20261115000012` |

**Chemins de récompenses restés hors moteur (choix documentés)** : XP quiz (déjà serveur, config par quiz via quiz_settings — à migrer si souhaité), ajustements XP admin (outil légitime), XP de badges (`badge:<key>` via `xp_reward`, piloté par la config badge = légitime). **Jamais exécuté en production ; aucune base contactée ; `profiles.xp` jamais recalculé depuis le ledger.**

**Tests** : harnais SQL étendu de 40 à 90 (`40`, `50`, `55`, `60`, `65`, `70`, `75`, `80`, `85`, `90` — ~110 vérifications additionnelles, **non exécutées ici faute de PostgreSQL**, commandes dans chaque en-tête) ; typecheck/lint/build/i18n/XP 29-29 verts à chaque commit.
