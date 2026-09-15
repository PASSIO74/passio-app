# ASTRA-24 — mention sans destinataire légitime, texte libre de push

Dossier de preuve du 2026-09-15. Mesures faites au **canal ① d'ADR-012**
(connecteur `supabase-passio-readonly`, lecture seule) sur la production.
Aucune écriture, aucun compte réel touché, aucun exercice sur cible.

---

## 1. Ce qui est ÉTABLI, et comment

### 1.1 La RLS de `notifications` laisse écrire vers n'importe qui (mesuré)

```sql
select policyname, cmd, qual, with_check from pg_policies where tablename='notifications';
```

| policy | cmd | expression |
|---|---|---|
| `notifications_insert_own_author` | INSERT | `with_check ((from_id = auth.uid()) AND (NOT is_blocked_with(user_id)))` |
| `Lecture propre` | SELECT | `user_id = auth.uid()` |
| `Update propre` | UPDATE | `user_id = auth.uid()` |
| `Suppression propre` | DELETE | `user_id = auth.uid()` |

Les deux seules conditions à l'écriture sont **« je signe de mon propre nom »**
et **« il ne m'a pas bloqué »**. Aucun lien préalable n'est exigé, et `content`
comme `kind` sont libres. C'est délibéré et nécessaire au produit — c'est ainsi
que les j'aime et les commentaires notifient — mais cela signifie que **la ligne
`notifications` n'est pas une preuve : c'est une déclaration**.

Un seul trigger sur la table : `trg_rate_limit` (60 insertions/minute, tous
genres confondus). Il borne le débit, pas le destinataire.

### 1.2 La branche « mention » ne regardait jamais le destinataire (lu dans le code)

`supabase/functions/_shared/lien-metier.js`, avant ce lot :

```js
if (k === "mention") {
  const com = await unSeul(admin, "post_comments", [["post_id", ref], ["author_id", fromUid]]);
  if (com.erreur) return { ok: false, raison: "lecture post_comments" };
  if (com.ligne && recent(com.ligne, "created_at", maintenant, fenetre)) return { ok: true, raison: "" };
}
```

`toUserId` n'apparaît pas. Le commentaire du fichier l'écrivait lui-même — « le
mentionné n'en est pas forcément l'auteur » — sans voir qu'il ne restait alors
**aucune** condition sur le destinataire.

### 1.3 La chaîne complète

1. commenter une publication publique (geste autorisé, `post_comments`) ;
2. insérer `notifications { from_id: moi, user_id: <n'importe qui>, kind: 'mention',
   ref_id: <la publication>, content: <texte libre> }` — accepté par §1.1 ;
3. invoquer `notify-call` : `lienNotification` retrouve **ma propre** ligne et en
   prend le texte ; `lienEvenement` trouve **mon** commentaire et dit oui.

Le texte libre ressort sur l'écran verrouillé d'un inconnu. **Le garde-fou de
MSG-04 du 14/09 — « le texte vient de la ligne, plus du corps de requête » — ne
déplaçait le texte libre que d'un champ à l'autre** ; c'est le lien métier
(15/09) qui devait l'arrêter, et sa branche `mention` ne l'arrêtait pas.

### 1.4 État de la table (mesuré)

139 lignes, 8 genres (`comment, event_invite, event_join, follow,
follow_request, like, live_video, mention`), **1 seule** de genre `mention`.

⚠️ **Ce chiffre n'établit ni exploitation ni absence d'exploitation.** Rien dans
la table ne distingue une mention légitime d'une mention fabriquée : c'est
précisément ce que le défaut rend indiscernable. Il est écrit ici pour dire la
taille du sujet, pas pour conclure.

---

## 2. Ce qui est REPORTÉ et NON établi

Aucun envoi réel n'a été tenté : cela aurait demandé un compte et une cible, donc
une autorisation d'exercice qui n'a pas été demandée. L'exploitabilité est
établie **par lecture du code et des policies**, pas par exécution. Le banc
unitaire reproduit la règle sur un faux client ; ce n'est pas une reproduction
de production, et elle n'est pas renommée comme telle.

---

## 3. Ce qui reste OUVERT après ce lot, et pourquoi

**La notification IN-APP reste écrivable par un inconnu, avec un texte libre.**
Ce lot ferme la **push** (le lien métier refuse désormais une mention qui ne
désigne personne). Il ne touche pas §1.1 : n'importe quel compte non bloqué peut
toujours faire apparaître le texte de son choix dans la cloche de n'importe qui.

Pourquoi ce n'est pas fait ici, et ce n'est pas une omission :

- La règle qui sépare le légitime de l'illégitime vit en **JavaScript**
  (`lien-metier.js`, une douzaine de genres, lectures croisées). La porter en SQL
  serait **une seconde copie**, et deux copies de la même règle finissent
  toujours par diverger sur celle qu'on oublie de corriger.
- Des **triggers** écrivent aussi dans cette table (`follows_notifier`) : un
  prédicat trop strict poserait une garde qui coupe le service qu'elle protège.
- Le risque résiduel est borné : texte **échappé à l'affichage** (les
  notifications sont rendues sûres par défaut), **60/minute**, **blocage
  honoré**, et l'émetteur est **nommé** (`from_id`), donc signalable.

Le geste qui le fermerait vraiment est de faire écrire ces lignes par le
**serveur**, genre par genre, comme `follows_notifier` le fait déjà pour les
abonnements — et de retirer alors l'INSERT client. C'est un lot à part entière.

**La mention EN GROUPE** n'exige pas que le message nomme la personne : dans un
groupe, les deux comptes peuvent déjà s'écrire, donc la push n'ouvre aucun canal
neuf. Exiger la concordance serait de surcroît faux — le nom affiché d'un membre
(`_groupMemberName`) n'est pas `profiles.username`, et la garde refuserait des
mentions légitimes. Choix écrit, pas oubli.

**`profiles.username` n'a pas d'index unique** : deux comptes homonymes passeront
tous deux la garde. Ce n'est pas un contournement, c'est la sémantique du
produit — une mention est ambiguë dès son écriture. Ce qui est fermé, c'est le
destinataire **arbitraire**.
