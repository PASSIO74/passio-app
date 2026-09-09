# Allumer l'admission 18+ — guide pas à pas

**Rien n'est allumé aujourd'hui.** `access_policies.irl_adult_only = false`.
La fondation serveur est en place depuis le 2026-09-08 (fonctions, triggers, RLS) ;
il ne reste que l'interrupteur.

---

## ⚠️ À lire avant : ce que cet interrupteur fait, et ce qu'il ne fait PAS

**Il garde l'IRL, et RIEN D'AUTRE.** Une fois allumé, un compte qui n'a pas déclaré
sa majorité ne peut plus : créer une rencontre, s'y inscrire, changer son RSVP,
pointer à l'arrivée, rejoindre la conversation d'un événement.

**Il ne garde NI le fil, NI les messages, NI les publications.** Ces surfaces n'ont
aucune barrière serveur de majorité. « PASSIO est réservé aux 18 ans » y est une
règle **contractuelle** (CGU), appliquée par une saisie d'âge **déclarative** que
rien ne vérifie. Ne jamais dire l'inverse à un utilisateur ni dans un document.

**Se retirer n'est jamais bloqué.** Passer en `declined` et supprimer son inscription
restent permis à tous : un compte rattrapé par la règle doit pouvoir sortir.

---

## Ce que ça coûte AUJOURD'HUI, mesuré

| | |
|---|---|
| Comptes en base | **6** |
| Comptes ayant déclaré leur majorité | **2** |
| Comptes qui perdraient l'IRL à l'allumage | **4** |
| Mineurs déclarés | 0 |

⚠️ Les 4 comptes ne sont pas perdus définitivement : `admissionRappelServeur()`
pousse au démarrage l'année déjà saisie localement. Un compte qui rouvre l'app
est admis **sans rien ressaisir**. Ceux qui n'ont jamais saisi d'année verront
la fenêtre de déclaration à leur prochaine action IRL.

---

## L'ordre, et il n'est pas négociable

1. ✅ Migration appliquée (fait le 2026-09-08)
2. ✅ Contrôles verts (banc CI : 133 contrôles)
3. ⏳ **Client 18+ déployé en production** ← l'étape en cours
4. ⏳ **PUIS** seulement, allumer

**Allumer avant l'étape 3 couperait l'IRL à tout le monde** : le client ne saurait
pas expliquer le refus, et la porte cliente n'existerait pas pour proposer la
déclaration d'âge.

---

## Le geste — SQL Editor de Supabase (canal ③ d'ADR-012)

```sql
update public.access_policies
   set enabled = true
 where key = 'irl_adult_only';
```

### Le contrôle, juste après

```sql
select key, enabled from public.access_policies where key = 'irl_adult_only';
-- attendu : irl_adult_only | true
```

### Éteindre, si ça tourne mal

```sql
update public.access_policies set enabled = false where key = 'irl_adult_only';
```

⚠️ **NE JAMAIS SUPPRIMER LA LIGNE pour éteindre.** `adult_access_enforced()` est
**fail-closed** : ligne absente = admission **EXIGÉE** pour tout le monde. Supprimer
la ligne fait exactement l'inverse de l'éteindre.

---

## Ce qu'il reste ouvert, et que l'interrupteur ne réglera pas

- **L'âge n'est pas vérifié.** Quelqu'un qui déclare 1990 en ayant 15 ans passe.
  Le fermer demande une vérification d'identité — un autre chantier, avec ses
  propres obligations RGPD.
- **Le parcours Google ne demande pas l'âge séparément** : il retombe sur
  l'onboarding (`onbSteps` contient `age`), donc la porte s'applique — mais c'est
  la même porte déclarative.
- **`skipToApp()`** (raccourci de démo) fabrique `birthYear = 1995`. Sans effet en
  production, mais à ne pas exposer.
- **Partie B du lot Storage** : passer le seau `attachments` en privé exige un lot
  client d'URL signées. L'appliquer avant ferait disparaître toutes les pièces
  jointes.
