# PASSIO — Plan de lancement gratuit et de monétisation

> 2026-11-01. Réponse à la demande de Benjamin : « un plan complet comme un vrai monétiseur pro pour
> lancer l'app gratuitement, puis comment gagner de l'argent — quelles options payantes ».
> Ce document distingue ce qui est **mesuré** (production, 01/11), ce qui est **estimé** (et le dit),
> et ce qui est **recommandé**. Il respecte ADR-009 : aucune monnaie interne, seulement des paiements
> directs en euros.

---

## 0. Le constat, chiffré — avant toute idée de prix

Mesuré en production le 2026-11-01 (canal ① lecture seule) :

| Indicateur | Valeur |
|---|---|
| Comptes depuis le premier (23/06/2026) | **14** |
| Comptes créés sur 30 jours / sur 7 jours | 4 / **0** |
| Comptes connectés sur 30 jours / sur 7 jours | 6 / **0** |
| Publications au total / sur 30 jours | 37 / 3 |
| Rencontres IRL au total / inscriptions | 10 / 12 |
| Rencontres payantes | **0** |
| Organisateurs distincts / villes distinctes | 4 / **5** |
| Appareils du **public** (hors équipe et robots), semaine du 19/10 puis du 26/10 | **1**, puis **3** (contre 97 et 118 appareils au total) |

**Ce que dirait un monétiseur pro :** le problème n'est pas encore *comment faire payer*, c'est
*comment avoir de la densité*. Un réseau social ne se monétise pas à 14 comptes, et 10 rencontres
réparties sur 5 villes, c'est une dilution : personne ne trouve quelqu'un près de chez lui. Chaque
euro demandé avant la densité ralentit la croissance sans rien rapporter.

L'ordre ne se discute pas : **densité → habitude → transaction → abonnement.**

La bonne nouvelle : la technique est très en avance pour un produit de cette taille (RLS, modération,
pilotage, autoréparation, sauvegardes, délestage). C'est rare. Le goulot est **100 % l'acquisition et
la communauté**, et ça se travaille sans écrire de code.

---

## 1. Le modèle économique en une phrase

> **Gratuit pour se rencontrer. Payant pour organiser, et pour vivre des expériences.**

On monétise le côté **IRL** (une transaction réelle, compatible ADR-009), jamais l'accès au lien
social. **Ton premier client payant n'est pas l'utilisateur : c'est l'organisateur et le lieu.**

### Les quatre sources de revenu, par ordre de priorité

| # | Source | Qui paie | Pourquoi ça colle à PASSIO | Quand |
|---|---|---|---|---|
| ① | **Commission sur la billetterie et les ateliers** | le participant (frais de service) | prolonge la boucle Passion → rencontre ; le champ `events.price`, `fmtEventPrice`, la liste d'attente et le check-in QR existent déjà | phase 2 |
| ② | **PASSIO Orga** — abonnement organisateurs, assos, coachs | l'organisateur | revenu récurrent ; l'outil (RSVP, rappels J-1/H-2, QR, séries, co-organisateurs) est déjà construit | phase 3 |
| ③ | **Lieux partenaires** — bars à jeux, salles d'escalade, boutiques spécialisées | le lieu | B2B local ; c'est le levier le plus rentable au début, à densité égale | phase 3 |
| ④ | **PASSIO+** — abonnement utilisateur | l'utilisateur | complément de confort, jamais le moteur (1 à 3 % de conversion dans un réseau social hors rencontre amoureuse) | phase 3, à partir de ~2 000 actifs/mois |

Plus tard (phase 4) : sponsors d'événements (une marque de running finance la sortie du dimanche),
affiliation sur le matériel par passion (étiquetée comme telle), **Passio : Voyage** (séjours passion
avec commission — l'extraction du carnet de voyage prévue par ADR-009 en est le point de départ).

### Avantage décisif de la PWA

Pas d'App Store, donc **pas de commission Apple/Google de 15 à 30 %** : le paiement passe par Stripe
sur le web. Et même dans une future app native, un billet pour une activité réelle consommée hors de
l'app n'entre pas dans l'achat intégré obligatoire ; seul un abonnement numérique (PASSIO+) y serait
soumis. → **Garder les abonnements sur le web.**

---

## 2. La grille : ce qui reste gratuit, ce qui devient payant

### Gratuit pour toujours — tout ce qui crée du lien

Profil, fil, publier, commenter, aimer, messagerie et groupes, partager, **rejoindre une rencontre
gratuite**, **organiser des rencontres gratuites**, signaler et bloquer. On ne met jamais de péage
devant une conversation ou une inscription : c'est ce qui fait la valeur du réseau pour tous les
autres.

### PASSIO+ (utilisateur) — 3,99 €/mois ou 29 €/an

- Passions illimitées et changements illimités (le mur `openPassionPaywall` existe déjà) ;
- filtres avancés des rencontres : rayon, jour, horaire, niveau ;
- alerte « nouvelle rencontre de ta passion près de chez toi » et accès anticipé de 24 h aux places
  limitées ;
- personnalisation du profil (couverture, thème) et « ta saison PASSIO » (bilan de tes rencontres).

Interdit dans PASSIO+ : voir qui a consulté ton profil, un score public, toute mécanique qui
transforme la confiance en statut payant (ADR-009, point 6).

### PASSIO Orga (organisateurs)

| Formule | Prix | Contenu |
|---|---|---|
| **Découverte** | 0 € | rencontres gratuites illimitées, inscriptions, liste d'attente, rappels, check-in QR, discussion de groupe — **tout ce qui existe aujourd'hui reste gratuit** |
| **Orga** | 9,90 €/mois ou 99 €/an | billetterie payante à frais réduits, export des participants, statistiques (présence, absences, fidélité), page organisateur publique avec lien court, message aux participants des éditions passées, 1 mise en avant locale par mois |
| **Club / Lieu** | 29 €/mois | plusieurs organisateurs, cotisations et adhésions, plusieurs lieux, badge « lieu partenaire » sur la carte, mise en avant permanente |

Règle : **on ne fait jamais payer une fonction qui est gratuite aujourd'hui** — on fait payer les
fonctions neuves. Retirer un acquis fait fuir l'offre qu'on a mis des mois à recruter.

### Commission billetterie

| Cas | Frais |
|---|---|
| Rencontre gratuite | **0 €, toujours** |
| Rencontre payante | 5 % + 0,49 € par billet, payés par le participant ; l'organisateur touche 100 % de son prix (il peut choisir de les absorber) |
| Atelier / cours (mood *Apprendre*) | 10 % — PASSIO lui amène des élèves, la valeur est plus forte |
| Associations | tarif réduit (3 % + 0,49 €) |
| **Offre fondateurs** | 0 % de commission pour les 20 premiers organisateurs pendant 6 mois — seuls les frais Stripe restent |

Ordre de grandeur sur un billet de 15 € : le participant paie 16,24 €, Stripe prend environ 0,49 €
(≈ 1,5 % + 0,25 € pour une carte européenne standard), il reste ≈ **0,75 € net** à PASSIO.
Démarrer avec le mode Stripe Connect où **Stripe facture ses frais directement aux organisateurs** :
pas de frais fixes par compte connecté pour PASSIO tant que le volume est faible. ⚠️ Barème Connect à
relire sur `stripe.com/fr/connect/pricing` au moment de signer (non vérifiable depuis la session du
01/11 : domaine hors réseau autorisé).

---

## 3. Le plan de lancement gratuit — par phases, avec des seuils, pas des dates

### Phase 0 — Préparer (novembre, 2 semaines)

1. **Une ville, trois passions.** Concentrer TOUT l'effort sur une seule ville. Le dépôt s'appelle
   `PASSIO74` : si c'est la Haute-Savoie, Annecy est un terrain idéal (randonnée, trail, escalade,
   paddle, jeux de société l'hiver). Critère d'une bonne passion de lancement : elle se pratique **en
   groupe, chaque semaine, pour pas cher**. Proposition : randonnée/trail, jeux de société, photo.
2. **Lever le mur des 3 passions pendant le lancement** (`PASSIONS_OFFERTES = 3` dans app-06). À
   14 comptes, ce mur ne rapporte rien et freine la découverte — plus de passions = plus de
   croisements = plus de rencontres. Le garder en réserve pour PASSIO+ (phase 3). Une constante et
   ses verrous de test (`passions-plates.spec.js`).
3. **Vérifier la marque « PASSIO »** (antériorités sur la base INPI et TMview), puis la déposer :
   190 € pour une classe + 40 € par classe supplémentaire. Classes conseillées : 9 (application),
   41 (organisation d'événements, loisirs), 45 (réseautage social en ligne), éventuellement 42 —
   soit **270 € pour 9/41/45**. À faire AVANT toute dépense de communication : les CGU affirment déjà
   la propriété d'une marque non déposée.
4. **Cinq chiffres suivis chaque lundi** dans le pilotage (section 6).

### Phase 1 — Lancement gratuit « une ville, trois passions » (M1 → M3 : novembre → janvier)

Objectif unique : **la densité**. Aucune monétisation.

1. **Recruter l'offre d'abord : 15 à 20 hôtes.** Clubs, associations, groupes Facebook/WhatsApp,
   coachs indépendants, boutiques spécialisées. Le pitch : *« un outil gratuit pour remplir tes
   sorties : page d'inscription, liste d'attente, rappels automatiques, check-in QR, discussion de
   groupe — et des nouveaux qui te trouvent par passion »*. Accompagnement à la main : tu crées toi-même
   leurs trois premières rencontres.
2. **Ton propre rituel : « les Sessions PASSIO »**, chaque semaine, même jour, même lieu. C'est la
   régularité qui crée l'habitude, pas la nouveauté.
3. **Le calendrier joue pour toi** : janvier est le mois des bonnes résolutions (pic d'intérêt pour le
   sport et les loisirs). Novembre-décembre = recruter et roder les hôtes ; **lancement fort la semaine
   du 4 janvier 2027**.
4. **Acquisition à 0 €** : QR codes dans les lieux partenaires (en caisse, sur les tables), groupes
   locaux, vidéos courtes (« on a fait une rando avec 12 inconnus trouvés sur une app »), presse et
   radios locales (un lancement local est une info locale), offices de tourisme, BDE et associations
   étudiantes.
5. **La boucle virale de chaque rencontre** : inscription → « viens avec un ami » → photos publiées
   après la rencontre → lien partagé (les aperçus de liens existent) → nouvel inscrit.
6. **Contenu de démonstration** : dès qu'une ville a du vrai contenu, y réduire la place des 550
   publications d'exemple — un fil fabriqué se voit, et il tue la confiance.

**Seuils pour passer en phase 2 (la densité est atteinte) :**

- ≥ 300 utilisateurs actifs par semaine dans la ville ;
- ≥ 8 rencontres réelles par semaine, dont ≥ 60 % avec au moins 5 présents (check-in) ;
- rétention à 4 semaines ≥ 25 % ;
- ≥ 20 % des inscrits participent à au moins une rencontre dans leurs 30 premiers jours ;
- **≥ 3 organisateurs qui demandent d'eux-mêmes « je peux faire payer ? »** — c'est LE signal.

### Phase 2 — Premiers euros : la billetterie (M3 → M6)

**Prérequis légaux, avant le premier euro** (détail : `docs/CHECKLIST_COMMERCIALISATION.md`, seuil B) :

- [ ] structure : micro-entreprise (gratuite, en ligne, la plus simple) ou SASU si associé ou levée ;
      SIRET, compte bancaire professionnel, expert-comptable ;
- [ ] `PASSIO_EDITEUR.regime` → `"societe"` — ⚠️ adapter d'abord la branche pour un micro-entrepreneur
      (pas de capital, de RCS ni de TVA intracommunautaire en franchise) ;
- [ ] CGU **articles 2 et 10 réécrits** (le bouclier « service gratuit » tombe au premier euro) et
      `PASSIO_CGU_VERSION` incrémentée ;
- [ ] CGV, information précontractuelle, bouton « Commande avec obligation de paiement » ;
      un billet pour une activité de loisirs à date fixe n'ouvre **pas** de droit de rétractation
      (art. L221-28 12°) — en revanche une politique de remboursement en cas d'annulation par
      l'organisateur est à écrire ;
- [ ] adhésion à un **médiateur de la consommation** (obligatoire pour vendre à des particuliers) ;
- [ ] obligations de plateforme : dire comment les rencontres sont classées et si l'organisateur est
      un professionnel ou un particulier (L111-7) ; déclaration annuelle des revenus des organisateurs
      à l'administration fiscale (DAC7, art. 242 bis CGI) — **à valider avec le comptable** ;
- [ ] assurance responsabilité civile professionnelle adaptée à une plateforme d'événements.

**Construction (lot à risque : revue indépendante + red team obligatoires) :**

- Stripe Checkout + Stripe Connect (comptes des organisateurs, vérification d'identité par Stripe) ;
- Edge Functions : création de session de paiement (le **prix est relu en base côté serveur**, jamais
  celui du client) et webhook à **signature vérifiée**, idempotent ;
- table `billets` : RLS lecture par le propriétaire, écriture par le seul `service_role` ;
- billet = QR de check-in existant ; annulation d'une rencontre → remboursement automatique ;
- drapeau d'interface (`passio_ui_billetterie`), télémétrie `billet_*` filtrée PII.

**Lancement** : offre fondateurs (0 % pendant 6 mois pour les 20 premiers), puis la grille normale.

### Phase 3 — Revenus récurrents (M6 → M12)

1. **PASSIO Orga** payant, avec un **tarif fondateur à vie** (−50 %) pour les premiers abonnés ;
   paiement Stripe Billing, portail client pour résilier en un clic.
2. **Lieux partenaires** : 49 à 149 €/mois — fiche « lieu partenaire » sur la carte, rencontres
   hébergées mises en avant, QR en caisse, statistiques de fréquentation apportée.
3. **PASSIO+** — seulement au-delà de ~2 000 actifs par mois (en dessous, 1 à 3 % de conversion ne
   paie même pas le temps de construction).
4. **Villes 2 et 3** avec le même playbook, portées par des **ambassadeurs locaux** rémunérés à la
   commission (par exemple 20 % du revenu de leur ville pendant 12 mois).

### Phase 4 — Échelle (12 mois et plus)

National, sponsors d'événements, affiliation matériel, Passio : Voyage. Financement possible sans
céder de parts au départ : prêt d'honneur (réseaux Initiative France, Réseau Entreprendre), Bourse
French Tech de Bpifrance.

---

## 4. Ce que ça peut rapporter — scénarios, PAS des promesses

Hypothèses par tranche de **1 000 actifs mensuels** (à remplacer par les mesures réelles dès la
phase 2) :

| Source | Hypothèse | Net / mois |
|---|---|---|
| Billetterie | 15 % des actifs vont à 1,5 rencontre/mois, 30 % payantes, billet moyen 12 €, ≈ 0,64 € net/billet | ≈ 43 € |
| Ateliers | 2 % des actifs achètent un atelier à 30 €/mois, 10 % de commission moins Stripe | ≈ 46 € |
| PASSIO Orga | 1 organisateur payant pour 150 actifs, 9,90 € | ≈ 66 € |
| Lieux partenaires | 1 lieu pour 300 actifs, 79 € | ≈ 263 € |
| PASSIO+ | 1,5 % de conversion, ≈ 3,50 € net | ≈ 52 € |
| **Total** | **≈ 0,47 € par actif et par mois** | **≈ 470 €** |

| Actifs mensuels | Revenu brut estimé | Lecture |
|---|---|---|
| 1 000 | ≈ 470 €/mois | couvre l'infrastructure, pas un revenu |
| 10 000 | ≈ 4 700 €/mois | un revenu modeste pour une personne |
| 100 000 | ≈ 47 000 €/mois (≈ 560 k€/an) | une entreprise, + sponsors et affiliation |

Trois enseignements :

1. **Le B2B (lieux + organisateurs) pèse les deux tiers du revenu**. Les utilisateurs paient peu ; ce
   sont eux qui font venir les organisateurs et les lieux qui, eux, paient.
2. **L'infrastructure ne sera jamais le problème** : quelques dizaines d'euros aujourd'hui, ~60 à
   150 €/mois de plus à 100 000 personnes (`docs/PASSIO_100K_AUTONOMIE.md`). Le vrai coût, c'est ton
   temps et l'acquisition.
3. **Un réseau de niche ne se rentabilise qu'à l'échelle d'une ville dense, puis de plusieurs** :
   viser 10 000 à 15 000 actifs mensuels pour un revenu d'une personne.

---

## 5. Ce qu'il ne faut PAS faire

| À éviter | Pourquoi |
|---|---|
| Faire payer avant la densité (phase 1) | chaque euro demandé à 14 comptes coûte des inscriptions et ne rapporte rien |
| Péage sur la messagerie, l'inscription à une rencontre ou le nombre d'amis | c'est la valeur du réseau pour TOUS les autres ; on taxe ce qui le fait grandir |
| Publicité programmatique | revenus négligeables sous 100 000 actifs, consentement CNIL, et elle dégrade le produit |
| Vendre des données | RGPD, et la confiance est l'actif n°1 d'une app qui fait se rencontrer des inconnus |
| Monnaie virtuelle, points, jetons | ADR-009 : complexité réglementaire et UX pour rien |
| Mécaniques « appli de rencontre » payantes (qui t'a liké, qui a vu ton profil) | change la nature du produit et attire les mauvais usages |
| Offre « à vie » pour les utilisateurs | hypothèque le revenu futur ; réserver le « tarif fondateur » aux organisateurs |
| Retirer une fonction gratuite pour la rendre payante | on perd l'offre recrutée à la main |
| Sortir sur les stores avant d'avoir prouvé la PWA | 15 à 30 % de commission sur les abonnements, des semaines de revue, pour la même audience |

---

## 6. Le tableau de bord du monétiseur

Phase 1 (chaque lundi) : **actifs/semaine de la ville**, **rencontres réelles/semaine**, **taux de
présence** (check-in ÷ inscrits), **rétention à 4 semaines**, **part des inscrits qui vont à une
rencontre en 30 jours**.

À partir de la phase 2 : **volume de billets vendus** (GMV), **taux de prélèvement** (revenu ÷ GMV),
part des rencontres payantes, taux de remplissage, absences, **coût d'acquisition** d'un organisateur
et d'un utilisateur, **valeur vie client** (LTV), résiliation mensuelle des abonnements, revenu par
actif (ARPU).

Toujours compter le **public seulement** (`meta.trafic`), et regarder la production en
`?equipe=1` — sinon nos propres contrôles gonflent l'audience (15 « visiteurs » sur 19 la semaine du
28/09).

---

## 7. Les 90 prochains jours

| Quand | Quoi |
|---|---|
| Semaine 1 | choisir la ville et les 3 passions ; lever le mur des passions ; recherche d'antériorités « PASSIO » |
| Semaine 2 | dépôt INPI ; liste de 50 hôtes potentiels (clubs, assos, coachs, boutiques) ; kit QR imprimable |
| Semaines 3 à 6 | 20 rendez-vous d'hôtes, 15 signés ; 1re Session PASSIO hebdomadaire ; 3 lieux qui affichent le QR |
| Semaines 7 à 9 (fêtes comprises) | roder : 2 à 4 rencontres réelles par semaine ; corriger ce qui bloque l'inscription |
| Semaine 10 (lundi 4 janvier) | **lancement « résolutions de janvier »** : presse locale, vidéos, chaque hôte invite sa liste |
| Semaines 11 à 13 | mesurer chaque lundi contre les seuils de la phase 2 ; en parallèle, créer la structure et préparer les textes juridiques |

---

## 8. Ce qui se construit, dans l'ordre

| Lot | Contenu | Risque |
|---|---|---|
| L1 | lever le plafond de passions pendant le lancement | faible |
| L2 | page organisateur publique + lien court + kit QR | faible |
| L3 | télémétrie des seuils de la phase 2 dans le pilotage | faible |
| L4 | billetterie Stripe Connect (après les prérequis légaux) | **élevé** — revue indépendante, red team |
| L5 | PASSIO Orga (Stripe Billing, portail client) | moyen |
| L6 | lieux partenaires sur la carte | moyen |
| L7 | PASSIO+ (le mur des passions devient son premier avantage) | moyen |

Ce qui reste un geste humain, par nature : créer la structure, signer Stripe et l'assureur, déposer la
marque, et **rencontrer les hôtes** — aucun code ne remplace les 20 premiers rendez-vous.

---

Sources des chiffres externes (consultées le 01/11/2026, sites tiers — barèmes officiels à relire au
moment de signer) :

- Stripe, cartes européennes standard ≈ 1,5 % + 0,25 € :
  [Sellfy](https://sellfy.com/fr/outils/calculateur-de-frais-stripe/),
  [Indy](https://www.indy.fr/guide/comptabilite-en-ligne/commerce/stripe-comptabilite/frais-stripe/)
  — page officielle : [stripe.com/fr/pricing](https://www.stripe.com/fr/pricing/)
- INPI, 190 € pour une classe + 40 € par classe supplémentaire :
  [Captain Contrat](https://www.captaincontrat.com/protection-des-creations/depot-de-marque/cout-depot-marque-inpi),
  [Keobiz](https://www.keobiz.fr/le-mag/deposer-une-marque-prix),
  [Legalstart (choix des classes)](https://www.legalstart.fr/fiches-pratiques/depot-marque/deposer-une-marque-comment-choisir-vos-classes/)
- Billetterie concurrente : frais généralement payés par le participant, gratuits sur les billets
  gratuits — [aide Eventbrite](https://www.eventbrite.ca/help/fr-ca/articles/193833/[slug]/)
