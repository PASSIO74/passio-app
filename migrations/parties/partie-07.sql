-- ═══════════════════════════════════════════════════════════════════
-- migration_passions_plat — PARTIE 7 / 7
-- ───────────────────────────────────────────────────────────────────
-- Coller les parties DANS L'ORDRE, une par une, en attendant que chacune
-- réponde avant de passer à la suivante.
-- Chaque partie est sa propre transaction et le miroir est IDEMPOTENT :
-- si une partie échoue, corriger puis la relancer, sans reprendre depuis
-- la première.
-- ═══════════════════════════════════════════════════════════════════
begin;


insert into public.passion_relations (source_passion_id, target_passion_id, relation_type, weight)
values
  ('sante-endometriose', 'sante-sante-femme', 'broader', 3),
  ('sante-sante-femme', 'sante-endometriose', 'narrower', 3),
  ('sante-cycle', 'sante-sante-femme', 'broader', 3),
  ('sante-sante-femme', 'sante-cycle', 'narrower', 3),
  ('sante-contraception', 'sante-sante-femme', 'broader', 3),
  ('sante-sante-femme', 'sante-contraception', 'narrower', 3),
  ('sante-perinee', 'sante-sante-femme', 'broader', 3),
  ('sante-sante-femme', 'sante-perinee', 'narrower', 3),
  ('sante-sante-homme', 'sante-prevention', 'broader', 3),
  ('sante-prevention', 'sante-sante-homme', 'narrower', 3),
  ('sante-depistage', 'sante-prevention', 'broader', 3),
  ('sante-prevention', 'sante-depistage', 'narrower', 3),
  ('sante-bilan-sanguin', 'sante-prevention', 'broader', 3),
  ('sante-prevention', 'sante-bilan-sanguin', 'narrower', 3),
  ('sante-automedication', 'sante-prevention', 'broader', 3),
  ('sante-prevention', 'sante-automedication', 'narrower', 3),
  ('sante-urgences', 'sante-premiers-secours', 'broader', 3),
  ('sante-premiers-secours', 'sante-urgences', 'narrower', 3),
  ('sante-defibrillateur', 'sante-premiers-secours', 'broader', 3),
  ('sante-premiers-secours', 'sante-defibrillateur', 'narrower', 3),
  ('sante-don-organes', 'sante-don-du-sang', 'broader', 3),
  ('sante-don-du-sang', 'sante-don-organes', 'narrower', 3),
  ('sante-don-moelle', 'sante-don-du-sang', 'broader', 3),
  ('sante-don-du-sang', 'sante-don-moelle', 'narrower', 3),
  ('sante-index-glycemique', 'sante-diabete', 'broader', 3),
  ('sante-diabete', 'sante-index-glycemique', 'narrower', 3),
  ('sante-lecture-etiquettes', 'sante-nutrition', 'broader', 3),
  ('sante-nutrition', 'sante-lecture-etiquettes', 'narrower', 3),
  ('sante-ultra-transformes', 'sante-nutrition', 'broader', 3),
  ('sante-nutrition', 'sante-ultra-transformes', 'narrower', 3),
  ('sante-fer', 'sante-complements', 'broader', 3),
  ('sante-complements', 'sante-fer', 'narrower', 3),
  ('sante-vitamine-d', 'sante-complements', 'broader', 3),
  ('sante-complements', 'sante-vitamine-d', 'narrower', 3),
  ('sante-magnesium', 'sante-complements', 'broader', 3),
  ('sante-complements', 'sante-magnesium', 'narrower', 3),
  ('sante-hormones', 'sante-prevention', 'broader', 3),
  ('sante-prevention', 'sante-hormones', 'narrower', 3),
  ('sante-fibromyalgie', 'sante-douleur', 'broader', 3),
  ('sante-douleur', 'sante-fibromyalgie', 'narrower', 3),
  ('sante-fatigue-chronique', 'sante-burnout', 'broader', 3),
  ('sante-burnout', 'sante-fatigue-chronique', 'narrower', 3),
  ('sante-charge-mentale', 'sante-burnout', 'broader', 3),
  ('sante-burnout', 'sante-charge-mentale', 'narrower', 3),
  ('sante-therapie-breve', 'sante-therapie', 'broader', 3),
  ('sante-therapie', 'sante-therapie-breve', 'narrower', 3),
  ('sante-emdr', 'sante-therapie', 'broader', 3),
  ('sante-therapie', 'sante-emdr', 'narrower', 3),
  ('sante-therapie-groupe', 'sante-therapie', 'broader', 3),
  ('sante-therapie', 'sante-therapie-groupe', 'narrower', 3),
  ('sante-psychiatrie', 'sante-sante-mentale', 'broader', 3),
  ('sante-sante-mentale', 'sante-psychiatrie', 'narrower', 3),
  ('sante-bipolarite', 'sante-sante-mentale', 'broader', 3),
  ('sante-sante-mentale', 'sante-bipolarite', 'narrower', 3),
  ('sante-toc', 'sante-anxiete', 'broader', 3),
  ('sante-anxiete', 'sante-toc', 'narrower', 3),
  ('sante-phobies', 'sante-anxiete', 'broader', 3),
  ('sante-anxiete', 'sante-phobies', 'narrower', 3),
  ('sante-estime-de-soi', 'sante-sante-mentale', 'broader', 3),
  ('sante-sante-mentale', 'sante-estime-de-soi', 'narrower', 3),
  ('sante-deuil-sante', 'sante-sante-mentale', 'broader', 3),
  ('sante-sante-mentale', 'sante-deuil-sante', 'narrower', 3),
  ('sante-addiction-ecrans', 'sante-ecrans', 'broader', 3),
  ('sante-ecrans', 'sante-addiction-ecrans', 'narrower', 3),
  ('sante-jeu-excessif', 'sante-addictions', 'broader', 3),
  ('sante-addictions', 'sante-jeu-excessif', 'narrower', 3),
  ('sante-sevrage', 'sante-addictions', 'broader', 3),
  ('sante-addictions', 'sante-sevrage', 'narrower', 3),
  ('sante-reduction-risques', 'sante-addictions', 'broader', 3),
  ('sante-addictions', 'sante-reduction-risques', 'narrower', 3),
  ('sante-hypersensibilite', 'sante-neuroatypie', 'broader', 3),
  ('sante-neuroatypie', 'sante-hypersensibilite', 'narrower', 3),
  ('sante-aidant-repit', 'sante-aidants', 'broader', 3),
  ('sante-aidants', 'sante-aidant-repit', 'narrower', 3),
  ('sante-maintien-domicile', 'sante-aidants', 'broader', 3),
  ('sante-aidants', 'sante-maintien-domicile', 'narrower', 3),
  ('sante-vieillissement', 'sante-prevention', 'broader', 3),
  ('sante-prevention', 'sante-vieillissement', 'narrower', 3),
  ('sante-mobilite-reduite', 'sante-handicap', 'broader', 3),
  ('sante-handicap', 'sante-mobilite-reduite', 'narrower', 3),
  ('sante-materiel-medical', 'sante-handicap', 'broader', 3),
  ('sante-handicap', 'sante-materiel-medical', 'narrower', 3),
  ('yoga-debuter-meditation', 'yoga-meditation', 'broader', 3),
  ('yoga-meditation', 'yoga-debuter-meditation', 'narrower', 3),
  ('yoga-meditation-courte', 'yoga-meditation', 'broader', 3),
  ('yoga-meditation', 'yoga-meditation-courte', 'narrower', 3),
  ('yoga-pratique-maison', 'yoga', 'broader', 3),
  ('yoga', 'yoga-pratique-maison', 'narrower', 3),
  ('yoga-cours-en-ligne-yoga', 'yoga', 'broader', 3),
  ('yoga', 'yoga-cours-en-ligne-yoga', 'narrower', 3),
  ('yoga-professeur-yoga', 'yoga', 'broader', 3),
  ('yoga', 'yoga-professeur-yoga', 'narrower', 3),
  ('yoga-materiel-yoga', 'yoga', 'broader', 3),
  ('yoga', 'yoga-materiel-yoga', 'narrower', 3),
  ('yoga-regularite', 'yoga', 'broader', 3),
  ('yoga', 'yoga-regularite', 'narrower', 3),
  ('sante-consulter', 'sante-prevention', 'broader', 3),
  ('sante-prevention', 'sante-consulter', 'narrower', 3),
  ('sante-second-avis', 'sante-prevention', 'broader', 3),
  ('sante-prevention', 'sante-second-avis', 'narrower', 3),
  ('sante-comprendre-ordonnance', 'sante-prevention', 'broader', 3),
  ('sante-prevention', 'sante-comprendre-ordonnance', 'narrower', 3),
  ('sante-parcours-soin', 'sante-prevention', 'broader', 3),
  ('sante-prevention', 'sante-parcours-soin', 'narrower', 3),
  ('sante-hopital', 'sante-prevention', 'broader', 3),
  ('sante-prevention', 'sante-hopital', 'narrower', 3),
  ('sante-convalescence', 'sante-prevention', 'broader', 3),
  ('sante-prevention', 'sante-convalescence', 'narrower', 3),
  ('sante-maladie-chronique', 'sante-prevention', 'broader', 3),
  ('sante-prevention', 'sante-maladie-chronique', 'narrower', 3),
  ('sante-annonce-diagnostic', 'sante-sante-mentale', 'broader', 3),
  ('sante-sante-mentale', 'sante-annonce-diagnostic', 'narrower', 3),
  ('sante-motivation-sante', 'sante-prevention', 'broader', 3),
  ('sante-prevention', 'sante-motivation-sante', 'narrower', 3),
  ('sante-marche-quotidienne', 'sante-sport-sante', 'broader', 3),
  ('sante-sport-sante', 'sante-marche-quotidienne', 'narrower', 3),
  ('sante-bouger-au-quotidien', 'sante-sport-sante', 'broader', 3),
  ('sante-sport-sante', 'sante-bouger-au-quotidien', 'narrower', 3),
  ('sante-respirer-mieux', 'sante-sport-sante', 'broader', 3),
  ('sante-sport-sante', 'sante-respirer-mieux', 'narrower', 3),
  ('sante-hygiene-de-vie', 'sante-prevention', 'broader', 3),
  ('sante-prevention', 'sante-hygiene-de-vie', 'narrower', 3),
  ('sante-parler-de-sante-mentale', 'sante-sante-mentale', 'broader', 3),
  ('sante-sante-mentale', 'sante-parler-de-sante-mentale', 'narrower', 3),
  ('sante-ecoute-de-soi', 'sante-sante-mentale', 'broader', 3),
  ('sante-sante-mentale', 'sante-ecoute-de-soi', 'narrower', 3),
  ('entrepreneuriat-creation-entreprise', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-creation-entreprise', 'narrower', 3),
  ('entrepreneuriat-freelance', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-freelance', 'narrower', 3),
  ('entrepreneuriat-startup', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-startup', 'narrower', 3),
  ('entrepreneuriat-e-commerce', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-e-commerce', 'narrower', 3),
  ('entrepreneuriat-marketing', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-marketing', 'narrower', 3),
  ('entrepreneuriat-reseaux-sociaux', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-reseaux-sociaux', 'narrower', 3),
  ('entrepreneuriat-personal-branding', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-personal-branding', 'narrower', 3),
  ('entrepreneuriat-vente', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-vente', 'narrower', 3),
  ('entrepreneuriat-levee-de-fonds', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-levee-de-fonds', 'narrower', 3),
  ('entrepreneuriat-gestion', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-gestion', 'narrower', 3),
  ('entrepreneuriat-no-code', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-no-code', 'narrower', 3),
  ('entrepreneuriat-side-project', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-side-project', 'narrower', 3),
  ('entrepreneuriat-productivite', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-productivite', 'narrower', 3),
  ('entrepreneuriat-negociation', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-negociation', 'narrower', 3),
  ('entrepreneuriat-strategie', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-strategie', 'narrower', 3),
  ('entrepreneuriat-artisanat-business', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-artisanat-business', 'narrower', 3),
  ('entrepreneuriat-association', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-association', 'narrower', 3),
  ('entrepreneuriat-franchise', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-franchise', 'narrower', 3),
  ('finance-bourse', 'finance', 'broader', 3),
  ('finance', 'finance-bourse', 'narrower', 3),
  ('finance-epargne', 'finance', 'broader', 3),
  ('finance', 'finance-epargne', 'narrower', 3),
  ('finance-immobilier', 'finance', 'broader', 3),
  ('finance', 'finance-immobilier', 'narrower', 3),
  ('finance-budget', 'finance', 'broader', 3),
  ('finance', 'finance-budget', 'narrower', 3),
  ('finance-retraite-finance', 'finance', 'broader', 3),
  ('finance', 'finance-retraite-finance', 'narrower', 3),
  ('finance-fiscalite', 'finance', 'broader', 3),
  ('finance', 'finance-fiscalite', 'narrower', 3),
  ('finance-independance-financiere', 'finance', 'broader', 3),
  ('finance', 'finance-independance-financiere', 'narrower', 3),
  ('finance-etf', 'finance', 'broader', 3),
  ('finance', 'finance-etf', 'narrower', 3),
  ('finance-assurance-vie', 'finance', 'broader', 3),
  ('finance', 'finance-assurance-vie', 'narrower', 3),
  ('finance-credit', 'finance', 'broader', 3),
  ('finance', 'finance-credit', 'narrower', 3),
  ('finance-immobilier-locatif', 'finance', 'broader', 3),
  ('finance', 'finance-immobilier-locatif', 'narrower', 3),
  ('finance-education-financiere', 'finance', 'broader', 3),
  ('finance', 'finance-education-financiere', 'narrower', 3),
  ('finance-frugalite', 'finance', 'broader', 3),
  ('finance', 'finance-frugalite', 'narrower', 3),
  ('finance-revenus-passifs', 'finance', 'broader', 3),
  ('finance', 'finance-revenus-passifs', 'narrower', 3),
  ('finance-analyse-financiere', 'finance', 'broader', 3),
  ('finance', 'finance-analyse-financiere', 'narrower', 3),
  ('finance-patrimoine', 'finance', 'broader', 3),
  ('finance', 'finance-patrimoine', 'narrower', 3),
  ('parentalite-grossesse', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-grossesse', 'narrower', 3),
  ('parentalite-bebe', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-bebe', 'narrower', 3),
  ('parentalite-education', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-education', 'narrower', 3),
  ('parentalite-adolescence', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-adolescence', 'narrower', 3),
  ('parentalite-activites-enfants', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-activites-enfants', 'narrower', 3),
  ('parentalite-ecole', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-ecole', 'narrower', 3),
  ('parentalite-sorties-famille', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-sorties-famille', 'narrower', 3),
  ('parentalite-allaitement', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-allaitement', 'narrower', 3),
  ('parentalite-sommeil-enfant', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-sommeil-enfant', 'narrower', 3),
  ('parentalite-jeux-enfants', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-jeux-enfants', 'narrower', 3),
  ('parentalite-parent-solo', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-parent-solo', 'narrower', 3),
  ('parentalite-famille-recomposee', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-famille-recomposee', 'narrower', 3),
  ('parentalite-garde', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-garde', 'narrower', 3),
  ('parentalite-alimentation-enfant', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-alimentation-enfant', 'narrower', 3),
  ('parentalite-developpement-enfant', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-developpement-enfant', 'narrower', 3),
  ('parentalite-lecture-enfant', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-lecture-enfant', 'narrower', 3),
  ('entrepreneuriat-seo', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-seo', 'narrower', 3),
  ('entrepreneuriat-publicite', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-publicite', 'narrower', 3),
  ('entrepreneuriat-copywriting', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-copywriting', 'narrower', 3),
  ('entrepreneuriat-newsletter', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-newsletter', 'narrower', 3),
  ('entrepreneuriat-communaute', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-communaute', 'narrower', 3),
  ('entrepreneuriat-service-client', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-service-client', 'narrower', 3),
  ('entrepreneuriat-recrutement', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-recrutement', 'narrower', 3),
  ('entrepreneuriat-management', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-management', 'narrower', 3),
  ('entrepreneuriat-teletravail', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-teletravail', 'narrower', 3),
  ('entrepreneuriat-coworking', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-coworking', 'narrower', 3),
  ('entrepreneuriat-business-plan', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-business-plan', 'narrower', 3),
  ('entrepreneuriat-statut', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-statut', 'narrower', 3),
  ('entrepreneuriat-prix', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-prix', 'narrower', 3),
  ('entrepreneuriat-export', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-export', 'narrower', 3),
  ('entrepreneuriat-sourcing', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-sourcing', 'narrower', 3),
  ('entrepreneuriat-logistique', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-logistique', 'narrower', 3),
  ('entrepreneuriat-boutique', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-boutique', 'narrower', 3),
  ('entrepreneuriat-marches', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-marches', 'narrower', 3),
  ('entrepreneuriat-consulting', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-consulting', 'narrower', 3),
  ('entrepreneuriat-formation-en-ligne', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-formation-en-ligne', 'narrower', 3),
  ('entrepreneuriat-affiliation', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-affiliation', 'narrower', 3),
  ('entrepreneuriat-print-on-demand', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-print-on-demand', 'narrower', 3),
  ('entrepreneuriat-reprise', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-reprise', 'narrower', 3),
  ('entrepreneuriat-ess', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-ess', 'narrower', 3),
  ('finance-pea', 'finance', 'broader', 3),
  ('finance', 'finance-pea', 'narrower', 3),
  ('finance-livrets', 'finance', 'broader', 3),
  ('finance', 'finance-livrets', 'narrower', 3),
  ('finance-scpi', 'finance', 'broader', 3),
  ('finance', 'finance-scpi', 'narrower', 3),
  ('finance-crowdfunding', 'finance', 'broader', 3),
  ('finance', 'finance-crowdfunding', 'narrower', 3),
  ('finance-obligations', 'finance', 'broader', 3),
  ('finance', 'finance-obligations', 'narrower', 3),
  ('finance-matieres-premieres', 'finance', 'broader', 3),
  ('finance', 'finance-matieres-premieres', 'narrower', 3),
  ('finance-dividendes', 'finance', 'broader', 3),
  ('finance', 'finance-dividendes', 'narrower', 3),
  ('finance-dca', 'finance', 'broader', 3),
  ('finance', 'finance-dca', 'narrower', 3),
  ('finance-analyse-technique', 'finance', 'broader', 3),
  ('finance', 'finance-analyse-technique', 'narrower', 3),
  ('finance-succession', 'finance', 'broader', 3),
  ('finance', 'finance-succession', 'narrower', 3),
  ('finance-assurance', 'finance', 'broader', 3),
  ('finance', 'finance-assurance', 'narrower', 3),
  ('finance-surendettement', 'finance', 'broader', 3),
  ('finance', 'finance-surendettement', 'narrower', 3),
  ('finance-salaire', 'finance', 'broader', 3),
  ('finance', 'finance-salaire', 'narrower', 3),
  ('finance-expatriation-finance', 'finance', 'broader', 3),
  ('finance', 'finance-expatriation-finance', 'narrower', 3),
  ('parentalite-portage', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-portage', 'narrower', 3),
  ('parentalite-couches-lavables', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-couches-lavables', 'narrower', 3),
  ('parentalite-motricite', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-motricite', 'narrower', 3),
  ('parentalite-montessori', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-montessori', 'narrower', 3),
  ('parentalite-ecrans-enfants', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-ecrans-enfants', 'narrower', 3),
  ('parentalite-fratrie', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-fratrie', 'narrower', 3),
  ('parentalite-emotions', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-emotions', 'narrower', 3),
  ('parentalite-hpi', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-hpi', 'narrower', 3),
  ('parentalite-dys', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-dys', 'narrower', 3),
  ('parentalite-handicap-enfant', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-handicap-enfant', 'narrower', 3),
  ('parentalite-voyage-enfants', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-voyage-enfants', 'narrower', 3),
  ('parentalite-anniversaires', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-anniversaires', 'narrower', 3),
  ('parentalite-loisirs-creatifs', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-loisirs-creatifs', 'narrower', 3),
  ('parentalite-sport-famille', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-sport-famille', 'narrower', 3),
  ('parentalite-grands-parents', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-grands-parents', 'narrower', 3),
  ('parentalite-adoption', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-adoption', 'narrower', 3),
  ('parentalite-pma', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-pma', 'narrower', 3),
  ('parentalite-conge', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-conge', 'narrower', 3),
  ('parentalite-budget-famille', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-budget-famille', 'narrower', 3),
  ('parentalite-couple', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-couple', 'narrower', 3),
  ('parentalite-amitie', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-amitie', 'narrower', 3),
  ('parentalite-deuil', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-deuil', 'narrower', 3),
  ('parentalite-solitude', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-solitude', 'narrower', 3),
  ('parentalite-cuisine-enfants', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-cuisine-enfants', 'narrower', 3),
  ('entrepreneuriat-idee', 'entrepreneuriat-creation-entreprise', 'broader', 3),
  ('entrepreneuriat-creation-entreprise', 'entrepreneuriat-idee', 'narrower', 3),
  ('entrepreneuriat-etude-marche', 'entrepreneuriat-strategie', 'broader', 3),
  ('entrepreneuriat-strategie', 'entrepreneuriat-etude-marche', 'narrower', 3),
  ('entrepreneuriat-mvp', 'entrepreneuriat-startup', 'broader', 3),
  ('entrepreneuriat-startup', 'entrepreneuriat-mvp', 'narrower', 3),
  ('entrepreneuriat-product-market-fit', 'entrepreneuriat-startup', 'broader', 3),
  ('entrepreneuriat-startup', 'entrepreneuriat-product-market-fit', 'narrower', 3),
  ('entrepreneuriat-pivot', 'entrepreneuriat-startup', 'broader', 3),
  ('entrepreneuriat-startup', 'entrepreneuriat-pivot', 'narrower', 3),
  ('entrepreneuriat-incubateur', 'entrepreneuriat-startup', 'broader', 3),
  ('entrepreneuriat-startup', 'entrepreneuriat-incubateur', 'narrower', 3),
  ('entrepreneuriat-pitch-deck', 'entrepreneuriat-levee-de-fonds', 'broader', 3),
  ('entrepreneuriat-levee-de-fonds', 'entrepreneuriat-pitch-deck', 'narrower', 3),
  ('entrepreneuriat-valorisation', 'entrepreneuriat-levee-de-fonds', 'broader', 3),
  ('entrepreneuriat-levee-de-fonds', 'entrepreneuriat-valorisation', 'narrower', 3),
  ('entrepreneuriat-associes', 'entrepreneuriat-creation-entreprise', 'broader', 3),
  ('entrepreneuriat-creation-entreprise', 'entrepreneuriat-associes', 'narrower', 3),
  ('entrepreneuriat-sas', 'entrepreneuriat-statut', 'broader', 3),
  ('entrepreneuriat-statut', 'entrepreneuriat-sas', 'narrower', 3),
  ('entrepreneuriat-tva', 'entrepreneuriat-gestion', 'broader', 3),
  ('entrepreneuriat-gestion', 'entrepreneuriat-tva', 'narrower', 3),
  ('entrepreneuriat-tresorerie', 'entrepreneuriat-gestion', 'broader', 3),
  ('entrepreneuriat-gestion', 'entrepreneuriat-tresorerie', 'narrower', 3),
  ('entrepreneuriat-facturation', 'entrepreneuriat-gestion', 'broader', 3),
  ('entrepreneuriat-gestion', 'entrepreneuriat-facturation', 'narrower', 3),
  ('entrepreneuriat-devis-vente', 'entrepreneuriat-vente', 'broader', 3),
  ('entrepreneuriat-vente', 'entrepreneuriat-devis-vente', 'narrower', 3),
  ('entrepreneuriat-prospection', 'entrepreneuriat-vente', 'broader', 3),
  ('entrepreneuriat-vente', 'entrepreneuriat-prospection', 'narrower', 3),
  ('entrepreneuriat-fidelisation', 'entrepreneuriat-service-client', 'broader', 3),
  ('entrepreneuriat-service-client', 'entrepreneuriat-fidelisation', 'narrower', 3),
  ('entrepreneuriat-crm', 'entrepreneuriat-service-client', 'broader', 3),
  ('entrepreneuriat-service-client', 'entrepreneuriat-crm', 'narrower', 3),
  ('entrepreneuriat-avis-clients', 'entrepreneuriat-service-client', 'broader', 3),
  ('entrepreneuriat-service-client', 'entrepreneuriat-avis-clients', 'narrower', 3),
  ('entrepreneuriat-marque', 'entrepreneuriat-personal-branding', 'broader', 3),
  ('entrepreneuriat-personal-branding', 'entrepreneuriat-marque', 'narrower', 3),
  ('entrepreneuriat-storytelling-marque', 'entrepreneuriat-marketing', 'broader', 3),
  ('entrepreneuriat-marketing', 'entrepreneuriat-storytelling-marque', 'narrower', 3),
  ('entrepreneuriat-contenu', 'entrepreneuriat-marketing', 'broader', 3),
  ('entrepreneuriat-marketing', 'entrepreneuriat-contenu', 'narrower', 3),
  ('entrepreneuriat-emailing', 'entrepreneuriat-newsletter', 'broader', 3),
  ('entrepreneuriat-newsletter', 'entrepreneuriat-emailing', 'narrower', 3),
  ('entrepreneuriat-analytics', 'entrepreneuriat-seo', 'broader', 3),
  ('entrepreneuriat-seo', 'entrepreneuriat-analytics', 'narrower', 3),
  ('entrepreneuriat-referencement-local', 'entrepreneuriat-seo', 'broader', 3),
  ('entrepreneuriat-seo', 'entrepreneuriat-referencement-local', 'narrower', 3),
  ('entrepreneuriat-tunnel', 'entrepreneuriat-publicite', 'broader', 3),
  ('entrepreneuriat-publicite', 'entrepreneuriat-tunnel', 'narrower', 3)
on conflict (source_passion_id, target_passion_id, relation_type) do update set weight = excluded.weight;

insert into public.passion_relations (source_passion_id, target_passion_id, relation_type, weight)
values
  ('entrepreneuriat-partenariats', 'entrepreneuriat-strategie', 'broader', 3),
  ('entrepreneuriat-strategie', 'entrepreneuriat-partenariats', 'narrower', 3),
  ('entrepreneuriat-veille-concurrence', 'entrepreneuriat-strategie', 'broader', 3),
  ('entrepreneuriat-strategie', 'entrepreneuriat-veille-concurrence', 'narrower', 3),
  ('entrepreneuriat-propriete-industrielle', 'entrepreneuriat-strategie', 'broader', 3),
  ('entrepreneuriat-strategie', 'entrepreneuriat-propriete-industrielle', 'narrower', 3),
  ('entrepreneuriat-contrats', 'entrepreneuriat-gestion', 'broader', 3),
  ('entrepreneuriat-gestion', 'entrepreneuriat-contrats', 'narrower', 3),
  ('entrepreneuriat-embauche', 'entrepreneuriat-recrutement', 'broader', 3),
  ('entrepreneuriat-recrutement', 'entrepreneuriat-embauche', 'narrower', 3),
  ('entrepreneuriat-onboarding', 'entrepreneuriat-management', 'broader', 3),
  ('entrepreneuriat-management', 'entrepreneuriat-onboarding', 'narrower', 3),
  ('entrepreneuriat-entretien-annuel', 'entrepreneuriat-management', 'broader', 3),
  ('entrepreneuriat-management', 'entrepreneuriat-entretien-annuel', 'narrower', 3),
  ('entrepreneuriat-culture-entreprise', 'entrepreneuriat-management', 'broader', 3),
  ('entrepreneuriat-management', 'entrepreneuriat-culture-entreprise', 'narrower', 3),
  ('entrepreneuriat-reunion', 'entrepreneuriat-productivite', 'broader', 3),
  ('entrepreneuriat-productivite', 'entrepreneuriat-reunion', 'narrower', 3),
  ('entrepreneuriat-outils-collaboratifs', 'entrepreneuriat-teletravail', 'broader', 3),
  ('entrepreneuriat-teletravail', 'entrepreneuriat-outils-collaboratifs', 'narrower', 3),
  ('entrepreneuriat-asynchrone', 'entrepreneuriat-teletravail', 'broader', 3),
  ('entrepreneuriat-teletravail', 'entrepreneuriat-asynchrone', 'narrower', 3),
  ('entrepreneuriat-nomade-numerique', 'entrepreneuriat-teletravail', 'broader', 3),
  ('entrepreneuriat-teletravail', 'entrepreneuriat-nomade-numerique', 'narrower', 3),
  ('entrepreneuriat-gtd', 'entrepreneuriat-productivite', 'broader', 3),
  ('entrepreneuriat-productivite', 'entrepreneuriat-gtd', 'narrower', 3),
  ('entrepreneuriat-delegation', 'entrepreneuriat-management', 'broader', 3),
  ('entrepreneuriat-management', 'entrepreneuriat-delegation', 'narrower', 3),
  ('entrepreneuriat-automatisation-taches', 'entrepreneuriat-no-code', 'broader', 3),
  ('entrepreneuriat-no-code', 'entrepreneuriat-automatisation-taches', 'narrower', 3),
  ('entrepreneuriat-equilibre', 'entrepreneuriat-teletravail', 'broader', 3),
  ('entrepreneuriat-teletravail', 'entrepreneuriat-equilibre', 'narrower', 3),
  ('entrepreneuriat-echec', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-echec', 'narrower', 3),
  ('entrepreneuriat-cooperative', 'entrepreneuriat-ess', 'broader', 3),
  ('entrepreneuriat-ess', 'entrepreneuriat-cooperative', 'narrower', 3),
  ('entrepreneuriat-impact', 'entrepreneuriat-ess', 'broader', 3),
  ('entrepreneuriat-ess', 'entrepreneuriat-impact', 'narrower', 3),
  ('entrepreneuriat-cae', 'entrepreneuriat-statut', 'broader', 3),
  ('entrepreneuriat-statut', 'entrepreneuriat-cae', 'narrower', 3),
  ('entrepreneuriat-marche-public', 'entrepreneuriat-vente', 'broader', 3),
  ('entrepreneuriat-vente', 'entrepreneuriat-marche-public', 'narrower', 3),
  ('entrepreneuriat-subventions', 'entrepreneuriat-creation-entreprise', 'broader', 3),
  ('entrepreneuriat-creation-entreprise', 'entrepreneuriat-subventions', 'narrower', 3),
  ('finance-compte-bancaire', 'finance-budget', 'broader', 3),
  ('finance-budget', 'finance-compte-bancaire', 'narrower', 3),
  ('finance-enveloppes', 'finance-budget', 'broader', 3),
  ('finance-budget', 'finance-enveloppes', 'narrower', 3),
  ('finance-suivi-depenses', 'finance-budget', 'broader', 3),
  ('finance-budget', 'finance-suivi-depenses', 'narrower', 3),
  ('finance-epargne-precaution', 'finance-epargne', 'broader', 3),
  ('finance-epargne', 'finance-epargne-precaution', 'narrower', 3),
  ('finance-objectifs-epargne', 'finance-epargne', 'broader', 3),
  ('finance-epargne', 'finance-objectifs-epargne', 'narrower', 3),
  ('finance-interets-composes', 'finance-education-financiere', 'broader', 3),
  ('finance-education-financiere', 'finance-interets-composes', 'narrower', 3),
  ('finance-inflation', 'finance-education-financiere', 'broader', 3),
  ('finance-education-financiere', 'finance-inflation', 'narrower', 3),
  ('finance-diversification', 'finance-analyse-financiere', 'broader', 3),
  ('finance-analyse-financiere', 'finance-diversification', 'narrower', 3),
  ('finance-risque', 'finance-analyse-financiere', 'broader', 3),
  ('finance-analyse-financiere', 'finance-risque', 'narrower', 3),
  ('finance-frais', 'finance-etf', 'broader', 3),
  ('finance-etf', 'finance-frais', 'narrower', 3),
  ('finance-fiscalite-placements', 'finance-fiscalite', 'broader', 3),
  ('finance-fiscalite', 'finance-fiscalite-placements', 'narrower', 3),
  ('finance-impots', 'finance-fiscalite', 'broader', 3),
  ('finance-fiscalite', 'finance-impots', 'narrower', 3),
  ('finance-immobilier-achat', 'finance-immobilier', 'broader', 3),
  ('finance-immobilier', 'finance-immobilier-achat', 'narrower', 3),
  ('finance-pret-immobilier', 'finance-credit', 'broader', 3),
  ('finance-credit', 'finance-pret-immobilier', 'narrower', 3),
  ('finance-renegociation', 'finance-credit', 'broader', 3),
  ('finance-credit', 'finance-renegociation', 'narrower', 3),
  ('finance-copropriete', 'finance-immobilier', 'broader', 3),
  ('finance-immobilier', 'finance-copropriete', 'narrower', 3),
  ('finance-location', 'finance-immobilier', 'broader', 3),
  ('finance-immobilier', 'finance-location', 'narrower', 3),
  ('finance-gestion-locative', 'finance-immobilier-locatif', 'broader', 3),
  ('finance-immobilier-locatif', 'finance-gestion-locative', 'narrower', 3),
  ('finance-colocation', 'finance-immobilier', 'broader', 3),
  ('finance-immobilier', 'finance-colocation', 'narrower', 3),
  ('finance-meuble-touristique', 'finance-immobilier-locatif', 'broader', 3),
  ('finance-immobilier-locatif', 'finance-meuble-touristique', 'narrower', 3),
  ('finance-travaux-rentabilite', 'finance-immobilier-locatif', 'broader', 3),
  ('finance-immobilier-locatif', 'finance-travaux-rentabilite', 'narrower', 3),
  ('finance-viager', 'finance-patrimoine', 'broader', 3),
  ('finance-patrimoine', 'finance-viager', 'narrower', 3),
  ('finance-donation', 'finance-succession', 'broader', 3),
  ('finance-succession', 'finance-donation', 'narrower', 3),
  ('finance-testament', 'finance-succession', 'broader', 3),
  ('finance-succession', 'finance-testament', 'narrower', 3),
  ('finance-protection-proches', 'finance-assurance', 'broader', 3),
  ('finance-assurance', 'finance-protection-proches', 'narrower', 3),
  ('finance-mutuelle', 'finance-assurance', 'broader', 3),
  ('finance-assurance', 'finance-mutuelle', 'narrower', 3),
  ('finance-assurance-habitation', 'finance-assurance', 'broader', 3),
  ('finance-assurance', 'finance-assurance-habitation', 'narrower', 3),
  ('finance-arnaques', 'finance-education-financiere', 'broader', 3),
  ('finance-education-financiere', 'finance-arnaques', 'narrower', 3),
  ('finance-endettement', 'finance-surendettement', 'broader', 3),
  ('finance-surendettement', 'finance-endettement', 'narrower', 3),
  ('finance-minimalisme-financier', 'finance-frugalite', 'broader', 3),
  ('finance-frugalite', 'finance-minimalisme-financier', 'narrower', 3),
  ('finance-transmission-entreprise', 'finance-succession', 'broader', 3),
  ('finance-succession', 'finance-transmission-entreprise', 'narrower', 3),
  ('parentalite-preparation-naissance', 'parentalite-grossesse', 'broader', 3),
  ('parentalite-grossesse', 'parentalite-preparation-naissance', 'narrower', 3),
  ('parentalite-accouchement', 'parentalite-grossesse', 'broader', 3),
  ('parentalite-grossesse', 'parentalite-accouchement', 'narrower', 3),
  ('parentalite-post-partum', 'parentalite-bebe', 'broader', 3),
  ('parentalite-bebe', 'parentalite-post-partum', 'narrower', 3),
  ('parentalite-biberon', 'parentalite-allaitement', 'broader', 3),
  ('parentalite-allaitement', 'parentalite-biberon', 'narrower', 3),
  ('parentalite-dme', 'parentalite-alimentation-enfant', 'broader', 3),
  ('parentalite-alimentation-enfant', 'parentalite-dme', 'narrower', 3),
  ('parentalite-poussette', 'parentalite-bebe', 'broader', 3),
  ('parentalite-bebe', 'parentalite-poussette', 'narrower', 3),
  ('parentalite-siege-auto', 'parentalite-bebe', 'broader', 3),
  ('parentalite-bebe', 'parentalite-siege-auto', 'narrower', 3),
  ('parentalite-chambre-enfant', 'parentalite-bebe', 'broader', 3),
  ('parentalite-bebe', 'parentalite-chambre-enfant', 'narrower', 3),
  ('parentalite-rythmes', 'parentalite-sommeil-enfant', 'broader', 3),
  ('parentalite-sommeil-enfant', 'parentalite-rythmes', 'narrower', 3),
  ('parentalite-nuits', 'parentalite-sommeil-enfant', 'broader', 3),
  ('parentalite-sommeil-enfant', 'parentalite-nuits', 'narrower', 3),
  ('parentalite-proprete', 'parentalite-developpement-enfant', 'broader', 3),
  ('parentalite-developpement-enfant', 'parentalite-proprete', 'narrower', 3),
  ('parentalite-langage', 'parentalite-developpement-enfant', 'broader', 3),
  ('parentalite-developpement-enfant', 'parentalite-langage', 'narrower', 3),
  ('parentalite-marche', 'parentalite-motricite', 'broader', 3),
  ('parentalite-motricite', 'parentalite-marche', 'narrower', 3),
  ('parentalite-jeu-libre', 'parentalite-jeux-enfants', 'broader', 3),
  ('parentalite-jeux-enfants', 'parentalite-jeu-libre', 'narrower', 3),
  ('parentalite-jeux-exterieur', 'parentalite-activites-enfants', 'broader', 3),
  ('parentalite-activites-enfants', 'parentalite-jeux-exterieur', 'narrower', 3),
  ('parentalite-bricolage-enfants', 'parentalite-loisirs-creatifs', 'broader', 3),
  ('parentalite-loisirs-creatifs', 'parentalite-bricolage-enfants', 'narrower', 3),
  ('parentalite-sorties-culturelles', 'parentalite-sorties-famille', 'broader', 3),
  ('parentalite-sorties-famille', 'parentalite-sorties-culturelles', 'narrower', 3),
  ('parentalite-vacances-famille', 'parentalite-voyage-enfants', 'broader', 3),
  ('parentalite-voyage-enfants', 'parentalite-vacances-famille', 'narrower', 3),
  ('parentalite-devoirs', 'parentalite-ecole', 'broader', 3),
  ('parentalite-ecole', 'parentalite-devoirs', 'narrower', 3),
  ('parentalite-harcelement', 'parentalite-ecole', 'broader', 3),
  ('parentalite-ecole', 'parentalite-harcelement', 'narrower', 3),
  ('parentalite-relation-ecole', 'parentalite-ecole', 'broader', 3),
  ('parentalite-ecole', 'parentalite-relation-ecole', 'narrower', 3),
  ('parentalite-limites', 'parentalite-education', 'broader', 3),
  ('parentalite-education', 'parentalite-limites', 'narrower', 3),
  ('parentalite-crises', 'parentalite-emotions', 'broader', 3),
  ('parentalite-emotions', 'parentalite-crises', 'narrower', 3),
  ('parentalite-autonomie-enfant', 'parentalite-montessori', 'broader', 3),
  ('parentalite-montessori', 'parentalite-autonomie-enfant', 'narrower', 3),
  ('parentalite-argent-enfant', 'parentalite-adolescence', 'broader', 3),
  ('parentalite-adolescence', 'parentalite-argent-enfant', 'narrower', 3),
  ('parentalite-ado-communication', 'parentalite-adolescence', 'broader', 3),
  ('parentalite-adolescence', 'parentalite-ado-communication', 'narrower', 3),
  ('parentalite-reseaux-ados', 'parentalite-ecrans-enfants', 'broader', 3),
  ('parentalite-ecrans-enfants', 'parentalite-reseaux-ados', 'narrower', 3),
  ('parentalite-depart-maison', 'parentalite-adolescence', 'broader', 3),
  ('parentalite-adolescence', 'parentalite-depart-maison', 'narrower', 3),
  ('parentalite-jalousie', 'parentalite-fratrie', 'broader', 3),
  ('parentalite-fratrie', 'parentalite-jalousie', 'narrower', 3),
  ('parentalite-garde-alternee', 'parentalite-garde', 'broader', 3),
  ('parentalite-garde', 'parentalite-garde-alternee', 'narrower', 3),
  ('parentalite-coparentalite', 'parentalite-famille-recomposee', 'broader', 3),
  ('parentalite-famille-recomposee', 'parentalite-coparentalite', 'narrower', 3),
  ('parentalite-beau-parent', 'parentalite-famille-recomposee', 'broader', 3),
  ('parentalite-famille-recomposee', 'parentalite-beau-parent', 'narrower', 3),
  ('parentalite-conciliation', 'parentalite-conge', 'broader', 3),
  ('parentalite-conge', 'parentalite-conciliation', 'narrower', 3),
  ('parentalite-desir-enfant', 'parentalite-pma', 'broader', 3),
  ('parentalite-pma', 'parentalite-desir-enfant', 'narrower', 3),
  ('parentalite-fausse-couche', 'parentalite-deuil', 'broader', 3),
  ('parentalite-deuil', 'parentalite-fausse-couche', 'narrower', 3),
  ('parentalite-lien-grands-parents', 'parentalite-grands-parents', 'broader', 3),
  ('parentalite-grands-parents', 'parentalite-lien-grands-parents', 'narrower', 3),
  ('parentalite-repas-famille', 'parentalite-cuisine-enfants', 'broader', 3),
  ('parentalite-cuisine-enfants', 'parentalite-repas-famille', 'narrower', 3),
  ('parentalite-traditions-famille', 'parentalite-grands-parents', 'broader', 3),
  ('parentalite-grands-parents', 'parentalite-traditions-famille', 'narrower', 3),
  ('parentalite-album-famille', 'parentalite-grands-parents', 'broader', 3),
  ('parentalite-grands-parents', 'parentalite-album-famille', 'narrower', 3),
  ('parentalite-rencontres', 'parentalite-amitie', 'broader', 3),
  ('parentalite-amitie', 'parentalite-rencontres', 'narrower', 3),
  ('parentalite-amitie-adulte', 'parentalite-amitie', 'broader', 3),
  ('parentalite-amitie', 'parentalite-amitie-adulte', 'narrower', 3),
  ('parentalite-entretenir-liens', 'parentalite-amitie', 'broader', 3),
  ('parentalite-amitie', 'parentalite-entretenir-liens', 'narrower', 3),
  ('parentalite-conflit-amitie', 'parentalite-amitie', 'broader', 3),
  ('parentalite-amitie', 'parentalite-conflit-amitie', 'narrower', 3),
  ('parentalite-timidite', 'parentalite-solitude', 'broader', 3),
  ('parentalite-solitude', 'parentalite-timidite', 'narrower', 3),
  ('parentalite-couple-communication', 'parentalite-couple', 'broader', 3),
  ('parentalite-couple', 'parentalite-couple-communication', 'narrower', 3),
  ('parentalite-couple-projets', 'parentalite-couple', 'broader', 3),
  ('parentalite-couple', 'parentalite-couple-projets', 'narrower', 3),
  ('parentalite-couple-distance', 'parentalite-couple', 'broader', 3),
  ('parentalite-couple', 'parentalite-couple-distance', 'narrower', 3),
  ('parentalite-couple-separation', 'parentalite-couple', 'broader', 3),
  ('parentalite-couple', 'parentalite-couple-separation', 'narrower', 3),
  ('parentalite-celibat', 'parentalite-solitude', 'broader', 3),
  ('parentalite-solitude', 'parentalite-celibat', 'narrower', 3),
  ('parentalite-vie-commune', 'parentalite-couple', 'broader', 3),
  ('parentalite-couple', 'parentalite-vie-commune', 'narrower', 3),
  ('parentalite-taches-menageres', 'parentalite-couple', 'broader', 3),
  ('parentalite-couple', 'parentalite-taches-menageres', 'narrower', 3),
  ('parentalite-mariage', 'parentalite-couple', 'broader', 3),
  ('parentalite-couple', 'parentalite-mariage', 'narrower', 3),
  ('parentalite-organisation-mariage', 'parentalite-couple', 'broader', 3),
  ('parentalite-couple', 'parentalite-organisation-mariage', 'narrower', 3),
  ('parentalite-anniversaire-adulte', 'parentalite-amitie', 'broader', 3),
  ('parentalite-amitie', 'parentalite-anniversaire-adulte', 'narrower', 3),
  ('parentalite-voisinage', 'parentalite-amitie', 'broader', 3),
  ('parentalite-amitie', 'parentalite-voisinage', 'narrower', 3),
  ('parentalite-colocation-vie', 'parentalite-amitie', 'broader', 3),
  ('parentalite-amitie', 'parentalite-colocation-vie', 'narrower', 3),
  ('parentalite-intergenerationnel', 'parentalite-grands-parents', 'broader', 3),
  ('parentalite-grands-parents', 'parentalite-intergenerationnel', 'narrower', 3),
  ('parentalite-accompagner-fin-de-vie', 'parentalite-deuil', 'broader', 3),
  ('parentalite-deuil', 'parentalite-accompagner-fin-de-vie', 'narrower', 3),
  ('parentalite-heritage-immateriel', 'parentalite-grands-parents', 'broader', 3),
  ('parentalite-grands-parents', 'parentalite-heritage-immateriel', 'narrower', 3),
  ('entrepreneuriat-metier-passion', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-metier-passion', 'narrower', 3),
  ('entrepreneuriat-premiers-clients', 'entrepreneuriat-vente', 'broader', 3),
  ('entrepreneuriat-vente', 'entrepreneuriat-premiers-clients', 'narrower', 3),
  ('entrepreneuriat-syndrome-imposteur', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-syndrome-imposteur', 'narrower', 3),
  ('entrepreneuriat-solitude-entrepreneur', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-solitude-entrepreneur', 'narrower', 3),
  ('entrepreneuriat-reseau-pro', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-reseau-pro', 'narrower', 3),
  ('entrepreneuriat-mentorat-pro', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-mentorat-pro', 'narrower', 3),
  ('entrepreneuriat-cv', 'entrepreneuriat-recrutement', 'broader', 3),
  ('entrepreneuriat-recrutement', 'entrepreneuriat-cv', 'narrower', 3),
  ('entrepreneuriat-linkedin', 'entrepreneuriat-personal-branding', 'broader', 3),
  ('entrepreneuriat-personal-branding', 'entrepreneuriat-linkedin', 'narrower', 3),
  ('entrepreneuriat-sens-travail', 'entrepreneuriat', 'broader', 3),
  ('entrepreneuriat', 'entrepreneuriat-sens-travail', 'narrower', 3),
  ('entrepreneuriat-marche-noel', 'entrepreneuriat-marches', 'broader', 3),
  ('entrepreneuriat-marches', 'entrepreneuriat-marche-noel', 'narrower', 3),
  ('entrepreneuriat-photo-produit-vente', 'entrepreneuriat-boutique', 'broader', 3),
  ('entrepreneuriat-boutique', 'entrepreneuriat-photo-produit-vente', 'narrower', 3),
  ('entrepreneuriat-expedition', 'entrepreneuriat-logistique', 'broader', 3),
  ('entrepreneuriat-logistique', 'entrepreneuriat-expedition', 'narrower', 3),
  ('entrepreneuriat-retours', 'entrepreneuriat-service-client', 'broader', 3),
  ('entrepreneuriat-service-client', 'entrepreneuriat-retours', 'narrower', 3),
  ('finance-argent-education', 'finance-education-financiere', 'broader', 3),
  ('finance-education-financiere', 'finance-argent-education', 'narrower', 3),
  ('finance-couple-argent', 'finance-budget', 'broader', 3),
  ('finance-budget', 'finance-couple-argent', 'narrower', 3),
  ('finance-premier-salaire', 'finance-budget', 'broader', 3),
  ('finance-budget', 'finance-premier-salaire', 'narrower', 3),
  ('finance-etudiant', 'finance-budget', 'broader', 3),
  ('finance-budget', 'finance-etudiant', 'narrower', 3),
  ('finance-precarite', 'finance-surendettement', 'broader', 3),
  ('finance-surendettement', 'finance-precarite', 'narrower', 3),
  ('finance-consommation-responsable', 'finance-frugalite', 'broader', 3),
  ('finance-frugalite', 'finance-consommation-responsable', 'narrower', 3),
  ('finance-reparer-plutot', 'finance-frugalite', 'broader', 3),
  ('finance-frugalite', 'finance-reparer-plutot', 'narrower', 3),
  ('finance-abonnements', 'finance-budget', 'broader', 3),
  ('finance-budget', 'finance-abonnements', 'narrower', 3),
  ('finance-energie-facture', 'finance-budget', 'broader', 3),
  ('finance-budget', 'finance-energie-facture', 'narrower', 3),
  ('parentalite-premier-enfant', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-premier-enfant', 'narrower', 3),
  ('parentalite-doutes', 'parentalite-education', 'broader', 3),
  ('parentalite-education', 'parentalite-doutes', 'narrower', 3),
  ('parentalite-fatigue-parent', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-fatigue-parent', 'narrower', 3),
  ('parentalite-temps-pour-soi', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-temps-pour-soi', 'narrower', 3),
  ('parentalite-entraide-parents', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-entraide-parents', 'narrower', 3),
  ('parentalite-lecture-partagee', 'parentalite-lecture-enfant', 'broader', 3),
  ('parentalite-lecture-enfant', 'parentalite-lecture-partagee', 'narrower', 3),
  ('parentalite-musique-enfants', 'parentalite-activites-enfants', 'broader', 3),
  ('parentalite-activites-enfants', 'parentalite-musique-enfants', 'narrower', 3),
  ('parentalite-nature-enfants', 'parentalite-activites-enfants', 'broader', 3),
  ('parentalite-activites-enfants', 'parentalite-nature-enfants', 'narrower', 3),
  ('parentalite-cuisiner-enfants', 'parentalite-cuisine-enfants', 'broader', 3),
  ('parentalite-cuisine-enfants', 'parentalite-cuisiner-enfants', 'narrower', 3),
  ('parentalite-photos-enfants', 'parentalite-grands-parents', 'broader', 3),
  ('parentalite-grands-parents', 'parentalite-photos-enfants', 'narrower', 3),
  ('entrepreneuriat-side-business', 'entrepreneuriat-side-project', 'broader', 3),
  ('entrepreneuriat-side-project', 'entrepreneuriat-side-business', 'narrower', 3),
  ('finance-premier-placement', 'finance-education-financiere', 'broader', 3),
  ('finance-education-financiere', 'finance-premier-placement', 'narrower', 3),
  ('parentalite-transmettre-passion', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-transmettre-passion', 'narrower', 3),
  ('parentalite-moments-simples', 'parentalite', 'broader', 3),
  ('parentalite', 'parentalite-moments-simples', 'narrower', 3),
  ('photo-astrophoto', 'sciences-astronomie', 'related', 3),
  ('sciences-astronomie', 'photo-astrophoto', 'related', 3),
  ('photo-astrophoto', 'nature-ciel-nocturne', 'related', 2),
  ('nature-ciel-nocturne', 'photo-astrophoto', 'related', 2),
  ('sciences-astronomie', 'sciences-telescope', 'related', 3),
  ('sciences-telescope', 'sciences-astronomie', 'related', 3),
  ('moto-mecanique', 'auto-mecanique-auto', 'related', 2),
  ('auto-mecanique-auto', 'moto-mecanique', 'related', 2),
  ('moto-mecanique', 'metier-soudure', 'related', 1),
  ('metier-soudure', 'moto-mecanique', 'related', 1),
  ('cyclisme-mecanique-velo', 'moto-mecanique', 'related', 1),
  ('moto-mecanique', 'cyclisme-mecanique-velo', 'related', 1),
  ('musique-guitare-electrique', 'musique-rock', 'related', 3),
  ('musique-rock', 'musique-guitare-electrique', 'related', 3),
  ('musique-guitare-electrique', 'musique-metal', 'related', 2),
  ('musique-metal', 'musique-guitare-electrique', 'related', 2),
  ('musique-mao', 'ia-musique-ia', 'related', 2),
  ('ia-musique-ia', 'musique-mao', 'related', 2),
  ('musique-home-studio', 'podcast-montage-audio', 'related', 2),
  ('podcast-montage-audio', 'musique-home-studio', 'related', 2),
  ('cuisine-coreenne', 'cuisine-miso', 'related', 2),
  ('cuisine-miso', 'cuisine-coreenne', 'related', 2),
  ('cuisine-coreenne', 'voyage-coree', 'related', 2),
  ('voyage-coree', 'cuisine-coreenne', 'related', 2),
  ('cuisine-cuisine-japonaise', 'voyage-japon', 'related', 2),
  ('voyage-japon', 'cuisine-cuisine-japonaise', 'related', 2),
  ('cuisine-sushi', 'cuisine-cuisine-japonaise', 'related', 3),
  ('cuisine-cuisine-japonaise', 'cuisine-sushi', 'related', 3),
  ('cuisine-ramen', 'cuisine-cuisine-japonaise', 'related', 3),
  ('cuisine-cuisine-japonaise', 'cuisine-ramen', 'related', 3),
  ('cuisine-fermentation', 'cuisine-kombucha', 'related', 3),
  ('cuisine-kombucha', 'cuisine-fermentation', 'related', 3),
  ('cuisine-fermentation', 'cuisine-miso', 'related', 3),
  ('cuisine-miso', 'cuisine-fermentation', 'related', 3),
  ('jardinage-urbain', 'jardinage-balcon', 'related', 3),
  ('jardinage-balcon', 'jardinage-urbain', 'related', 3),
  ('jardinage-potager', 'nature-autonomie', 'related', 2),
  ('nature-autonomie', 'jardinage-potager', 'related', 2),
  ('jardinage-permaculture', 'nature-agriculture', 'related', 2),
  ('nature-agriculture', 'jardinage-permaculture', 'related', 2),
  ('moto-enduro', 'moto-motocross', 'related', 3),
  ('moto-motocross', 'moto-enduro', 'related', 3),
  ('moto-enduro', 'cyclisme-enduro-vtt', 'related', 1),
  ('cyclisme-enduro-vtt', 'moto-enduro', 'related', 1),
  ('outdoor-randonnee', 'nature-randonnee-nature', 'related', 3),
  ('nature-randonnee-nature', 'outdoor-randonnee', 'related', 3),
  ('outdoor-alpinisme', 'sport-escalade', 'related', 2),
  ('sport-escalade', 'outdoor-alpinisme', 'related', 2),
  ('outdoor-escalade-bloc', 'sport-escalade', 'related', 3),
  ('sport-escalade', 'outdoor-escalade-bloc', 'related', 3),
  ('nautisme-plongee', 'photo-sous-marine', 'related', 2),
  ('photo-sous-marine', 'nautisme-plongee', 'related', 2),
  ('nautisme-voile', 'voyage-croisiere', 'related', 2),
  ('voyage-croisiere', 'nautisme-voile', 'related', 2),
  ('aviation-parachutisme', 'aviation-wingsuit', 'related', 3),
  ('aviation-wingsuit', 'aviation-parachutisme', 'related', 3),
  ('aviation-drone-course', 'tech-drones', 'related', 3),
  ('tech-drones', 'aviation-drone-course', 'related', 3),
  ('aviation-drone-course', 'video-drone-video', 'related', 2),
  ('video-drone-video', 'aviation-drone-course', 'related', 2),
  ('tech-impression-3d', 'design-modelisation-3d', 'related', 3),
  ('design-modelisation-3d', 'tech-impression-3d', 'related', 3),
  ('tech-impression-3d', 'metier-fablab', 'related', 2),
  ('metier-fablab', 'tech-impression-3d', 'related', 2),
  ('tech-arduino', 'dev-embarque', 'related', 3),
  ('dev-embarque', 'tech-arduino', 'related', 3),
  ('tech-raspberry-pi', 'tech-serveur-maison', 'related', 2),
  ('tech-serveur-maison', 'tech-raspberry-pi', 'related', 2),
  ('ia-ia-generative', 'art-peinture-numerique', 'related', 2),
  ('art-peinture-numerique', 'ia-ia-generative', 'related', 2),
  ('ia-code-ia', 'dev-javascript', 'related', 1),
  ('dev-javascript', 'ia-code-ia', 'related', 1),
  ('dev-jeux-code', 'jeuxvideo-game-design', 'related', 3),
  ('jeuxvideo-game-design', 'dev-jeux-code', 'related', 3),
  ('dev-unity', 'jeuxvideo-game-design', 'related', 2),
  ('jeuxvideo-game-design', 'dev-unity', 'related', 2),
  ('yoga-aerien', 'theatre-tissu-aerien', 'related', 3),
  ('theatre-tissu-aerien', 'yoga-aerien', 'related', 3),
  ('yoga-meditation', 'interiorite-bouddhisme', 'related', 2),
  ('interiorite-bouddhisme', 'yoga-meditation', 'related', 2),
  ('yoga-meditation', 'sante-anxiete', 'related', 2),
  ('sante-anxiete', 'yoga-meditation', 'related', 2),
  ('fitness-musculation', 'sport-nutrition-sportive', 'related', 2),
  ('sport-nutrition-sportive', 'fitness-musculation', 'related', 2),
  ('running-trail', 'outdoor-randonnee', 'related', 2),
  ('outdoor-randonnee', 'running-trail', 'related', 2),
  ('collectif-football', 'collectif-gardien', 'related', 3),
  ('collectif-gardien', 'collectif-football', 'related', 3),
  ('langues-japonais', 'voyage-japon', 'related', 2),
  ('voyage-japon', 'langues-japonais', 'related', 2),
  ('langues-coreen', 'musique-kpop', 'related', 2),
  ('musique-kpop', 'langues-coreen', 'related', 2),
  ('histoire-genealogie', 'histoire-archives', 'related', 3),
  ('histoire-archives', 'histoire-genealogie', 'related', 3),
  ('collections-vinyles', 'musique-collection-disques', 'related', 3),
  ('musique-collection-disques', 'collections-vinyles', 'related', 3),
  ('collections-maquettes', 'collections-trains-miniatures', 'related', 2),
  ('collections-trains-miniatures', 'collections-maquettes', 'related', 2),
  ('mode-couture', 'mode-patronage', 'related', 3),
  ('mode-patronage', 'mode-couture', 'related', 3),
  ('mode-tricot', 'mode-crochet', 'related', 3),
  ('mode-crochet', 'mode-tricot', 'related', 3),
  ('metier-menuiserie', 'bricolage-meubles-diy', 'related', 2),
  ('bricolage-meubles-diy', 'metier-menuiserie', 'related', 2)
on conflict (source_passion_id, target_passion_id, relation_type) do update set weight = excluded.weight;

insert into public.passion_relations (source_passion_id, target_passion_id, relation_type, weight)
values
  ('peche-mouche', 'peche-mouche-montage', 'related', 3),
  ('peche-mouche-montage', 'peche-mouche', 'related', 3),
  ('animaux-chiens', 'animaux-education-canine', 'related', 3),
  ('animaux-education-canine', 'animaux-chiens', 'related', 3),
  ('nature-mycologie', 'nature-plantes-sauvages', 'related', 2),
  ('nature-plantes-sauvages', 'nature-mycologie', 'related', 2),
  ('litterature-ecriture', 'apprentissage-prise-de-notes', 'related', 1),
  ('apprentissage-prise-de-notes', 'litterature-ecriture', 'related', 1),
  ('entrepreneuriat-freelance', 'apprentissage-reconversion', 'related', 2),
  ('apprentissage-reconversion', 'entrepreneuriat-freelance', 'related', 2),
  ('finance-immobilier', 'bricolage-renovation', 'related', 2),
  ('bricolage-renovation', 'finance-immobilier', 'related', 2)
on conflict (source_passion_id, target_passion_id, relation_type) do update set weight = excluded.weight;

-- ═══ 4. PASSIONS D'UN COMPTE — table normalisée, en DOUBLE ÉCRITURE ════════
-- ⚠️ `profiles.passions` (jsonb) reste la source de vérité de l'affichage.
-- Cette table est remplie en parallèle. Tant que la bascule n'est pas décidée,
-- perdre cette table ne perd RIEN : c'est ce qui rend le retour arrière sûr.
create table if not exists public.user_passions (
  user_id    text not null,
  passion_id text not null references public.passions(id) on delete cascade,
  position   int  not null default 0,
  archived   boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, passion_id)
);

-- ═══ 5. DEMANDES D'AJOUT ═══════════════════════════════════════════════════
-- ⚠️ Une demande N'EST PAS une passion. Elle vit dans sa propre table, elle
-- n'entre jamais dans `public.passions`, et l'application refuse de publier
-- sous un identifiant qui n'est pas dans le référentiel — la clé étrangère de
-- `posts.passion_id` le refuserait de toute façon.
create table if not exists public.passion_requests (
  id               uuid primary key default gen_random_uuid(),
  user_id          text not null,
  label            text not null,
  normalized_label text not null,
  status           text not null default 'pending',
  resolved_passion_id text references public.passions(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint passion_requests_status_chk check (status in ('pending', 'approved', 'rejected', 'duplicate')),
  constraint passion_requests_label_chk check (char_length(label) between 2 and 60)
);

-- Une même personne ne dépose pas deux fois le même terme.
create unique index if not exists passion_requests_unique_par_personne
  on public.passion_requests (user_id, normalized_label);

-- ═══ 6. INDEX ══════════════════════════════════════════════════════════════
create index if not exists passions_normalized_idx  on public.passions (normalized_label);
create index if not exists passions_status_idx      on public.passions (status);
create index if not exists passions_popularity_idx  on public.passions (popularity desc);
create index if not exists passions_aliases_gin     on public.passions using gin (aliases);
create index if not exists passion_relations_src_idx on public.passion_relations (source_passion_id);
-- Index de RLS : les policies de la section 8 filtrent sur `user_id`.
create index if not exists user_passions_user_idx    on public.user_passions (user_id);
create index if not exists passion_requests_user_idx on public.passion_requests (user_id);
create index if not exists passion_requests_statut_idx on public.passion_requests (status, created_at desc);

-- ⚠️ `pg_trgm` sert UNIQUEMENT à la recherche approximative. S'il n'est pas
-- disponible, la migration continue : la recherche exacte, par préfixe et par
-- alias fonctionne sans lui, et `rechercher_passions` teste sa présence avant
-- de s'en servir. Une extension manquante ne doit pas faire échouer un
-- déploiement de référentiel.
do $$
begin
  begin
    create extension if not exists pg_trgm;
  exception when others then
    raise notice 'pg_trgm indisponible (%). La recherche approximative sera désactivée.', sqlerrm;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    execute 'create index if not exists passions_trgm_idx on public.passions using gin (normalized_label gin_trgm_ops)';
  end if;
end $$;

-- ═══ 7. NEUTRALISATION D'UNE ÉVENTUELLE MIGRATION HIÉRARCHIQUE ═════════════
-- Corrective et ADDITIVE : si le lot TAXO-1 (PR #231) a été appliqué sur une
-- base, ses `passion_specialties` portent EXACTEMENT les identifiants que la
-- section 2 vient d'insérer comme passions à part entière. Il n'y a donc rien
-- à convertir — seulement à cesser de lire les tables hiérarchiques, qu'on
-- laisse en place plutôt que de détruire des données.
do $$
declare n int;
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'passion_specialties') then
    select count(*) into n from public.passion_specialties s
      where not exists (select 1 from public.passions p where p.id = s.id);
    raise notice 'Modèle hiérarchique détecté. Spécialités sans équivalent plat : %. Les tables passion_universes/passion_specialties sont CONSERVÉES et ne sont plus lues.', n;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'posts' and column_name = 'specialty_id') then
    -- La colonne reste : la détruire perdrait un classement déjà écrit. Elle
    -- n'est simplement plus lue, et la section 2 garantit que sa valeur existe
    -- désormais aussi comme passion à part entière.
    raise notice 'posts.specialty_id existe. Colonne CONSERVÉE, plus lue par l''application.';
  end if;
end $$;

-- ═══ 8. RLS ════════════════════════════════════════════════════════════════
-- ⚠️ LE RÉFÉRENTIEL EST EN LECTURE SEULE POUR L'APPLICATION. Aucune policy
-- INSERT/UPDATE/DELETE sur `passions` ni sur `passion_relations` : c'est
-- exactement ce qui empêche un client d'inventer une passion, donc de
-- contourner la modération et de fabriquer des passions fantômes.
alter table public.passions          enable row level security;
alter table public.passion_relations enable row level security;
alter table public.user_passions     enable row level security;
alter table public.passion_requests  enable row level security;

drop policy if exists passions_select_all on public.passions;
create policy passions_select_all on public.passions
  for select using (true);

drop policy if exists passion_relations_select_all on public.passion_relations;
create policy passion_relations_select_all on public.passion_relations
  for select using (true);

-- `user_passions` : le propriétaire, et lui seul, en écriture.
-- ⚠️ La lecture est publique parce que les passions d'un compte sont DÉJÀ
-- publiques (elles s'affichent sous le pseudo, cf. `identitePassionsHTML`).
-- Restreindre ici et pas là donnerait une fausse impression de protection.
drop policy if exists user_passions_select_all on public.user_passions;
create policy user_passions_select_all on public.user_passions
  for select using (true);
drop policy if exists user_passions_insert_own on public.user_passions;
create policy user_passions_insert_own on public.user_passions
  for insert with check (user_id = auth.uid()::text);
drop policy if exists user_passions_update_own on public.user_passions;
create policy user_passions_update_own on public.user_passions
  for update using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
drop policy if exists user_passions_delete_own on public.user_passions;
create policy user_passions_delete_own on public.user_passions
  for delete using (user_id = auth.uid()::text);

-- `passion_requests` : chacun voit et crée SES demandes. Personne ne peut les
-- approuver depuis le client — le passage au référentiel se fait par migration
-- ou par un rôle opérateur (service_role), jamais par une session navigateur.
drop policy if exists passion_requests_select_own on public.passion_requests;
create policy passion_requests_select_own on public.passion_requests
  for select using (user_id = auth.uid()::text);
drop policy if exists passion_requests_insert_own on public.passion_requests;
create policy passion_requests_insert_own on public.passion_requests
  for insert with check (
    user_id = auth.uid()::text
    and status = 'pending'
    and resolved_passion_id is null
    -- Limitation de fréquence : 5 demandes par personne et par 24 h. Le
    -- contrôle vit dans la POLICY et non dans le client, sinon il ne contrôle
    -- rien : une requête REST directe s'en passerait.
    and (select count(*) from public.passion_requests r
          where r.user_id = auth.uid()::text
            and r.created_at > now() - interval '24 hours') < 5
  );
-- Pas de policy UPDATE ni DELETE : une demande déposée n'est plus modifiable
-- par son auteur. Sinon « status » deviendrait un champ que le client écrit.

-- ═══ 9. RECHERCHE SERVEUR ══════════════════════════════════════════════════
-- Recherche unique, plafonnée, ordonnée. Elle rend AU PLUS `lim` lignes.
-- ⚠️ SECURITY INVOKER (le défaut) : elle ne lit que `public.passions`, qui est
-- en select public. Lui donner SECURITY DEFINER n'apporterait rien et
-- ouvrirait une porte.
create or replace function public.rechercher_passions(q text, lim int default 20)
returns table (id text, label text, emoji text, color text, popularity int, score int)
language plpgsql stable as $$
declare
  n text := trim(regexp_replace(public.unaccent_immutable(coalesce(q, '')), '[^a-z0-9]+', ' ', 'g'));
  trgm boolean := exists (select 1 from pg_extension where extname = 'pg_trgm');
begin
  if n = '' then
    return query
      select p.id, p.label, p.emoji, p.color, p.popularity, 0
        from public.passions p
       where p.status = 'active'
       order by p.popularity desc, p.sort_order
       limit least(greatest(coalesce(lim, 20), 1), 50);
    return;
  end if;
  return query
    select p.id, p.label, p.emoji, p.color, p.popularity,
           (case
              when p.normalized_label = n then 0
              when p.normalized_label like n || '%' then 10
              when exists (select 1 from unnest(p.aliases) a
                            where public.unaccent_immutable(a) = n) then 20
              when exists (select 1 from unnest(p.aliases) a
                            where public.unaccent_immutable(a) like n || '%') then 30
              when p.normalized_label like '%' || n || '%' then 40
              else 60
            end + case when p.is_broad then 5 else 0 end)::int as score
      from public.passions p
     where p.status = 'active'
       and (p.normalized_label like '%' || n || '%'
            or exists (select 1 from unnest(p.aliases) a
                        where public.unaccent_immutable(a) like '%' || n || '%')
            or (trgm and similarity(p.normalized_label, n) > 0.3))
     order by score, p.popularity desc, p.sort_order
     limit least(greatest(coalesce(lim, 20), 1), 50);
end $$;

-- ⚠️ `anon` et `authenticated` sont des rôles de la PLATEFORME Supabase. Sur un
-- PostgreSQL nu — celui d'un test, d'une preview, d'une réplique locale — ils
-- n'existent pas, et un `grant` inconditionnel fait échouer TOUTE la migration
-- (elle est dans une seule transaction). On accorde à ceux qui existent.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.rechercher_passions(text, int) to %I', r);
    else
      raise notice 'Rôle % absent : grant ignoré (base hors Supabase).', r;
    end if;
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLES APRÈS APPLICATION — à exécuter et à LIRE
--
--   select count(*) from public.passions where status = 'active';
--     → attendu : 5001
--   select count(*) from public.passion_relations;
--     → attendu : 10012
--   select id from unnest(ARRAY['musique','photo','voyage','cuisine','sport',
--     'litterature','cinema','tech','art','jardinage','metier','jeuxvideo',
--     'yoga','mode','danse','podcast','moto','animaux','actu']) id
--     where id not in (select p.id from public.passions p);
--     → attendu : ZÉRO ligne. Une seule ligne ici = des publications cassées.
--   select * from public.rechercher_passions('enduro', 5);
--     → attendu : « Enduro » en première ligne, score 0.
--   select * from public.rechercher_passions('jogging', 5);
--     → attendu : « Course à pied » (correspondance par alias).
--
-- RETOUR ARRIÈRE (aucune donnée applicative détruite : ces tables ne portent
-- que du référentiel et des préférences répliquées depuis `profiles.passions`)
--
--   drop function if exists public.rechercher_passions(text, int);
--   drop table if exists public.passion_requests;
--   drop table if exists public.user_passions;
--   drop table if exists public.passion_relations;
--   -- `public.passions` n'est PAS supprimée : les 19 identifiants historiques
--   -- y sont référencés par clé étrangère. Pour revenir au socle du
--   -- 2026-08-15, retirer seulement les lignes ajoutées :
--   -- ⚠️ Ce DELETE échoue (23503) si une publication référence déjà l'une des
--   -- passions ajoutées — c'est le comportement voulu : on ne retire pas sous
--   -- les pieds d'un contenu son classement. Les passer en 'archived' plutôt
--   -- que les supprimer :
--   --   update public.passions set status = 'archived' where source <> 'legacy';
--   delete from public.passions where source <> 'legacy';
--   alter table public.passions drop column if exists normalized_label;
--   alter table public.passions drop column if exists aliases;
--   alter table public.passions drop column if exists status;
--   alter table public.passions drop column if exists source;
--   alter table public.passions drop column if exists is_broad;
--   alter table public.passions drop column if exists popularity;
-- ═══════════════════════════════════════════════════════════════════════════

commit;
