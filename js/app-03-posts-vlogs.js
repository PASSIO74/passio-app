function closePost() {
  const page = document.getElementById("postDetailPage");
  if (page) page.style.display = "none";
}

function sharePost(id) {
  const post = findPostAnywhere(id);
  if (!post) { toast("Le contenu original n'est plus disponible."); return; }

  const passion = passionById(post.passion) || { label: post.passion || "", emoji: "✨" };
  const txt = (post.text || post.caption || "").slice(0, 100);

  const html = `
    <div class="modal-title">${shareIconSvg(20)} Partager ce post</div>
    <div style="background:var(--bg-soft);border-radius:14px;padding:12px 14px;margin-bottom:16px;font-size:13px;color:var(--text-dim);line-height:1.5;">
      ${escapeHtml(txt)}${txt.length >= 100 ? "…" : ""}
    </div>
    <button class="btn primary block" id="_shareInFeedBtn" onclick="sharePostInFeed('${id}')" style="margin-bottom:10px;">
      ➕ Partager dans mon feed
    </button>
    <button class="btn secondary block" id="_shareOutBtn">
      ${shareIconSvg(16)} Partager en dehors
    </button>
  `;
  openModal(html);
  // Listener propre : évite l'injection de texte utilisateur dans un onclick inline
  setTimeout(() => {
    const btn = document.getElementById("_shareOutBtn");
    if (!btn) return;
    btn.addEventListener("click", function() {
      const shareUrl = "https://passio-app.netlify.app";
      if (navigator.share) {
        navigator.share({ title: "PASSIO", text: txt, url: shareUrl }).catch(() => {});
      } else {
        navigator.clipboard?.writeText(txt + "\n\n" + shareUrl)
          .then(() => toast("✅ Lien copié"))
          .catch(() => toast("Copie impossible"));
      }
    });
  }, 0);
}

async function sharePostInFeed(id) {
  const btn = document.getElementById("_shareInFeedBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Partage en cours…"; }

  if (typeof MY_UID === "undefined" || !MY_UID) {
    toast("Connexion requise pour partager ce contenu.");
    closeModal();
    return;
  }

  const post = findPostAnywhere(id);
  if (!post) { toast("Le contenu original n'est plus disponible."); closeModal(); return; }

  const prof = currentProfile();
  const g = state.user.general || {};
  let authorName = g.username || prof?.name || "Moi";

  if (!g.username && typeof supa !== "undefined" && supa && MY_UID) {
    try {
      const { data } = await supa.from("profiles").select("username").eq("id", MY_UID).maybeSingle();
      if (data?.username) { state.user.general.username = data.username; authorName = data.username; }
    } catch(e) {}
  }

  const passion = passionById(post.passion) || { label: post.passion || "", emoji: "✨" };
  const txt = post.text || post.caption || "";

  const newPost = {
    id: "post_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
    type: "text",
    authorId: MY_UID,
    authorName: authorName,
    authorEmoji: prof?.emoji || g.emoji || "✨",
    authorColor: prof?.color || g.color || "#8b5cf6",
    text: `📤 A partagé un post\n\n${passion.emoji} ${escapeHtml(post.authorName || "Passionné")} – ${passion.label}\n\n"${escapeHtml(txt).slice(0, 150)}${txt.length > 150 ? "…" : ""}"`,
    passion: post.passion || null,
    mood: post.mood || "all",
    createdAt: Date.now(),
    timestamp: Date.now(),
    likes: 0,
    comments: [],
    sharedReel: id,
    sharedReelData: {
      id: post.id,
      text: txt,
      authorName: post.authorName || "Passionné",
      authorEmoji: post.authorEmoji || "✨",
      authorColor: post.authorColor || "#8b5cf6",
      passion: post.passion
    }
  };

  if (!state.userPosts) state.userPosts = [];
  state.userPosts.push(newPost);
  saveState();

  closeModal();
  setTimeout(() => { goTo("feed"); setTimeout(() => renderFeed(), 100); }, 100);
  toast("✅ Publication partagée avec succès.");

  if (typeof supa !== "undefined" && supa) {
    try {
      const syncPromise = supaPublishPostWithRetry(newPost);
      const timeout = new Promise(resolve => setTimeout(() => resolve(false), 5000));
      const ok = await Promise.race([syncPromise, timeout]);
      if (!ok) console.warn("⚠️ [SHARE] Sync timeout — partagé localement uniquement");
    } catch(e) {
      console.warn("⚠️ [SHARE] Erreur sync:", e.message);
      toast("Impossible de partager ce contenu pour le moment.");
    }
  }
}

// Verrou anti-double-clic : empêche deux likes simultanés sur le même post
const _likePending = new Set();

function likePost(id, skipRender = false, el = null) {
  if (_likePending.has(id)) return;
  _likePending.add(id);
  setTimeout(() => _likePending.delete(id), 800);

  const post = findPostAnywhere(id);
  if (!post) { _likePending.delete(id); return; }
  const liked = state.user.likedPosts.includes(id);
  if (liked) {
    state.user.likedPosts = state.user.likedPosts.filter(x => x !== id);
    post.likes = Math.max(0, (post.likes || 1) - 1);
    post.liked = false;
  } else {
    state.user.likedPosts.push(id);
    post.likes = (post.likes || 0) + 1;
    post.liked = true;
    bumpQuest("like");
    try { supaTrack("like_post", { passion: post.passion }); } catch(_) {}
  }
  saveState();

  // Mise à jour en place : évite de reconstruire tout le fil (perte de scroll,
  // panels ouverts, états de saisie). On cherche le bouton via el (passé par
  // l'onclick inline) ou via data-postid dans le DOM.
  const nowLiked = !liked;
  var _btn = el || (function() {
    var art = document.querySelector('[data-postid="' + id + '"]');
    return art ? art.querySelector('[data-action="like"]') : null;
  })();
  if (_btn) {
    _btn.classList.toggle("liked", nowLiked);
    _btn.innerHTML = (nowLiked ? "❤️" : "🤍") + " " + (post.likes || 0);
  } else if (!skipRender) {
    renderFeed();
  }

  // Sync avec Supabase
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID) {
    supaToggleLike(id);
    if (!liked && post && post.authorId && post.authorId !== MY_UID && post.fromSupabase) {
      supaInsertNotif(post.authorId, "like", id, "a aimé ton post");
    }
  }
}

// ===== DOC VIEWER, Passia (simple + complet embarqués) =====
const DOC_PASSIA_SIMPLE = `
<span class="doc-viewer-header-tag">VERSION SIMPLE · 5 MIN DE LECTURE</span>
<h1>Passia expliqué simplement</h1>
<p style="font-style: italic; color: #6b6480;">Pour ceux qui n'y connaissent rien en crypto.</p>
<div class="doc-callout">
  <div class="doc-callout-title">Promesse de ce document</div>
  <p>• Aucun jargon technique. On utilise des comparaisons de la vie courante.</p>
  <p>• Tu peux le lire en 5 minutes.</p>
  <p>• À la fin tu sauras quoi faire (et surtout quoi NE PAS faire).</p>
  <p>• Ce n'est pas un conseil financier, c'est juste une explication.</p>
</div>

<h1>1. C'est quoi Passia, en 30 secondes ?</h1>
<p>PASSIO est une application sociale qui sort en 2026. Dedans, il y a une « monnaie interne » qui s'appelle Passia (symbole 💎).</p>
<p>Au début (en 2026), Passia c'est juste un compteur dans l'app. Tu en gagnes en publiant, tu en dépenses pour soutenir d'autres créateurs ou payer des trucs.</p>
<p>À partir de à terme, Passia devient une vraie cryptomonnaie. Concrètement : ce que tu détiens devient TIEN, transférable n'importe où, et sa valeur peut monter (ou descendre). Tu ne dépends plus de PASSIO pour la garder.</p>
<div class="doc-callout green">
  <div class="doc-callout-title">Une comparaison simple</div>
  <p>Les Carrefour Pass : tu en gagnes en faisant tes courses. Tu peux les dépenser chez Carrefour. Mais si demain Carrefour ferme, tes points valent zéro.</p>
  <p>Passia (à terme) : c'est différent. Si demain PASSIO ferme, ton Passia est toujours dans ton portefeuille personnel. Tu peux le revendre à d'autres gens.</p>
  <p>C'est cette différence qui change tout.</p>
</div>

<h1>2. Les 2 choses à bien comprendre</h1>
<h2>Niveau 1, Le moteur (fixe, automatique)</h2>
<p>C'est le système de fond. Ce sont 5 « règles automatiques » qui tournent en permanence. Tu ne les choisis pas, elles sont codées dans le programme.</p>
<p>C'est comme le moteur d'une voiture : tu n'as pas de bouton « je veux que les freins marchent ». Ils marchent, point.</p>
<h2>Niveau 2, Tes choix à toi</h2>
<p>Là tu as plein de choix. Tu décides comment toi tu utilises Passia. Combien tu en achètes, où tu le stockes, si tu veux le bloquer pour des avantages.</p>
<div class="doc-callout">
  <div class="doc-callout-title">La phrase à retenir</div>
  <p>Le moteur de Passia est UN. Tes options d'utilisation sont MULTIPLES.</p>
</div>

<h1>3. Le moteur (les 5 règles automatiques)</h1>
<h2>Règle 1, Le burn (la disparition automatique)</h2>
<p>À chaque fois que quelqu'un envoie du Passia à quelqu'un d'autre, 1 % du montant part en fumée. Définitivement. Plus l'app est utilisée, plus de Passia disparaît, plus il devient rare.</p>
<h2>Règle 2, Le buyback (le rachat automatique)</h2>
<p>PASSIO l'entreprise, quand elle gagne de l'argent, prend une partie et l'utilise pour racheter du Passia sur le marché. Ça crée une demande continue auto-financée par l'usage.</p>
<h2>Règle 3, Le staking (le blocage volontaire)</h2>
<p>Si tu veux profiter du Pass Passion (l'abonnement premium), il faut « bloquer » 200 Passia pendant 30 jours. Si 1 million de gens le font, c'est 200 millions de Passia hors circulation.</p>
<h2>Règle 4, Les cas d'usage qui se multiplient</h2>
<p>Au début, Passia sert à 5 choses. Au fil du temps, on en rajoute (marketplace, événements, crowdfunding). Plus de cas = plus de gens qui ont besoin d'en avoir.</p>
<h2>Règle 5, L'effet communauté</h2>
<p>Plus une plateforme a d'utilisateurs, plus sa monnaie interne a de la valeur. Wikipédia avec 1 article = inutile. Avec 60 millions = inestimable. C'est mathématique.</p>
<div class="doc-callout">
  <div class="doc-callout-title">Important à comprendre</div>
  <p>Ces 5 règles ne sont PAS des promesses commerciales. Elles sont CODÉES dans le programme. N'importe qui peut auditer le code à tout moment.</p>
</div>

<h1>4. Tes choix à toi</h1>
<h2>Choix 1, Comment tu acquières du Passia</h2>
<ul>
  <li><b>A. Tu achètes des packs (le plus rapide)</b>, Boutique de l'app, 6 packs de 4,99 € à 99,99 €. Plus tu prends gros, plus le bonus est gros.</li>
  <li><b>B. Tu en gagnes gratuitement (le plus malin)</b>, Publier, organiser un événement, recevoir un tip = autant de Passia en plus. Coûte juste ton temps.</li>
  <li><b>C. Tu reçois l'airdrop au lancement</b>, Au lancement crypto à terme, tous les utilisateurs PASSIO actifs reçoivent ~50 Passia gratuits.</li>
</ul>
<h2>Choix 2, Où tu stockes ton Passia</h2>
<ul>
  <li><b>A. Wallet PASSIO (simple, recommandé pour débuter)</b>, L'app gère tout. Pas besoin de comprendre techniquement. Récupération possible si tu perds ton mot de passe.</li>
  <li><b>B. Wallet personnel (souverain)</b>, Tu télécharges MetaMask, tu reçois une « phrase secrète » de 12 mots. C'est VRAIMENT à toi, indépendant de PASSIO.</li>
</ul>
<div class="doc-callout amber">
  <div class="doc-callout-title">Conseil pratique</div>
  <p>Si tu débutes : commence avec le wallet PASSIO. C'est sans risque.</p>
  <p>Si tu prends de gros montants : passe au wallet personnel mais APPRENDS d'abord les bases (1-2h de YouTube).</p>
</div>
<h2>Choix 3, Si tu veux staker (= bloquer pour des avantages)</h2>
<p>Volontaire. Si tu veux le faire, 3 niveaux :</p>
<table>
  <tr><th>Pass</th><th>Durée</th><th>Récompense</th><th>Avantages</th></tr>
  <tr><td>Pass Passion</td><td>30 jours</td><td>—</td><td>Profils illimités, badge, archives</td></tr>
  <tr><td>Pass Mécène</td><td>1 an</td><td>+5 % Passia</td><td>Tout ci-dessus + accès anticipé</td></tr>
  <tr><td>Pass Légende</td><td>3 ans</td><td>+10 % Passia</td><td>Tout + droit de vote sur l'app</td></tr>
</table>

<h1>5. À quoi ça te sert vraiment ?</h1>
<ul>
  <li><b>Soutenir un créateur</b>, Tip 1 clic sur un post (10, 50, 100 Passia)</li>
  <li><b>Payer un cours en visio</b>, Cours par un créateur, ~200 Passia (≈ 10 €)</li>
  <li><b>Aller à un événement IRL premium</b>, Atelier, dégustation, sortie photo</li>
  <li><b>Acheter dans la marketplace</b>, Livres, vinyles, créations artisanales</li>
  <li><b>Crowdfunder un projet de la communauté</b>, Festival, voyage de groupe</li>
  <li><b>Booster un événement IRL que tu organises</b></li>
  <li><b>Débloquer un profil supplémentaire</b> (au-delà du quota gratuit de 3)</li>
</ul>

<h1>6. Les questions que tu te poses sûrement</h1>
<h3>Est-ce que je vais devenir riche ?</h3>
<p>Personne ne le promet. La valeur peut monter, mais peut aussi descendre. N'achète pas avec l'idée de devenir riche.</p>
<h3>Combien je dois acheter pour démarrer ?</h3>
<p>Le minimum utile pour utiliser PASSIO confortablement : 200 Passia (≈ 10 €). N'investis JAMAIS plus que ce que tu pourrais perdre sans regret.</p>
<h3>Je peux le revendre quand je veux ?</h3>
<p>Oui, à condition d'être en wallet personnel. Tu vends sur Uniswap, virement quelques jours après.</p>
<h3>Que se passe-t-il si PASSIO ferme demain ?</h3>
<p>Si tu es en wallet personnel : rien. Ton Passia est dans ton portefeuille, tu peux le revendre à qui tu veux. C'est ça la magie de la crypto : ton argent ne dépend pas de l'entreprise.</p>
<h3>Crypto = pollution ?</h3>
<p>Passia tourne sur la blockchain Polygon, 99 % moins polluante que Bitcoin. L'empreinte d'une transaction Passia est comparable à un email.</p>

<h1>7. Les 5 règles d'or</h1>
<div class="doc-callout red">
  <div class="doc-callout-title">Règle n°1, Ne dépense jamais plus que ce que tu accepterais de perdre</div>
  <p>Si tu n'es pas OK avec l'idée de tout perdre, n'achète pas.</p>
</div>
<div class="doc-callout red">
  <div class="doc-callout-title">Règle n°2, Ne partage JAMAIS ta phrase secrète</div>
  <p>Personne (même PASSIO) n'a besoin de tes 12 mots. Toute personne qui te les demande est un escroc.</p>
</div>
<div class="doc-callout red">
  <div class="doc-callout-title">Règle n°3, Méfie-toi des « doublez votre Passia »</div>
  <p>Sur Twitter, Discord, Telegram, ces propositions sont TOUJOURS des arnaques. PASSIO n'a aucun programme de ce type.</p>
</div>
<div class="doc-callout amber">
  <div class="doc-callout-title">Règle n°4, Si tu débutes, reste simple</div>
  <p>Mode wallet PASSIO. Petits achats. Apprends pendant 6 mois avant de passer au mode souverain.</p>
</div>
<div class="doc-callout amber">
  <div class="doc-callout-title">Règle n°5, En cas de doute, demande dans la communauté</div>
  <p>Tout le monde était nouveau un jour. Pose tes questions sans complexe.</p>
</div>

<h1>8. En résumé</h1>
<div class="doc-callout">
  <div class="doc-callout-title">Ce que tu dois retenir</div>
  <p>• Passia est la « monnaie » de PASSIO, qui devient une vraie cryptomonnaie à terme.</p>
  <p>• Le système est UN moteur fixe (5 règles automatiques) + DES choix que TOI tu fais.</p>
  <p>• Tu peux acheter, gagner gratuitement, ou recevoir l'airdrop.</p>
  <p>• Plus PASSIO grandit, plus le Passia peut prendre de la valeur, pas garanti.</p>
</div>
<p>Acheter du Passia n'est pas une décision financière classique. C'est davantage un acte d'adhésion à un projet. La question à se poser n'est pas « combien je vais gagner ? », c'est « est-ce que je crois à ce projet ? ».</p>
<div class="doc-callout green">
  <div class="doc-callout-title">La phrase à retenir</div>
  <p>Tu n'achètes pas une promesse de gain. Tu participes à une communauté.</p>
  <p>Le reste, l'évolution de la valeur, est la conséquence de l'usage qu'on en fait collectivement, pas une promesse qu'on te fait.</p>
</div>
`;

const DOC_PASSIA_FULL = `
<span class="doc-viewer-header-tag">DOCUMENT COMPLET · 24 PAGES</span>
<h1>PASSIA, La cryptomonnaie des passions</h1>
<p style="font-style: italic; color: #6b6480;">Tokenomics, mécanique de valeur, gouvernance, conformité MiCA, Document utilisateur, version 1.0.</p>

<div class="doc-callout red">
  <div class="doc-callout-title">⚠️ Avertissement légal, à lire avant tout</div>
  <p>Ce document décrit le fonctionnement du token Passia. Il ne constitue PAS un conseil financier ni une garantie de retour. La valeur d'un token crypto peut monter, mais peut AUSSI baisser fortement. Tout achat se fait à votre propre risque.</p>
  <p><b>Les 4 vérités à intégrer</b> : (1) un wallet n'est pas un compte bancaire ; (2) le prix peut chuter de 50-90 % en heures ; (3) PASSIO ne promet AUCUN retour ; (4) n'achetez jamais plus que ce que vous accepteriez de perdre.</p>
</div>

<h1>1. Pourquoi Passia devient une cryptomonnaie</h1>
<p>Dans la version 1 de PASSIO (avril 2026), Passia était un jeton interne stable à 0,05 €. Dans la version 2 (à terme), Passia devient un vrai token crypto sur la blockchain Polygon.</p>
<h2>Raison 1, Donner aux créateurs une vraie souveraineté</h2>
<p>Avec Passia stable interne, le créateur dépend de PASSIO. Avec Passia crypto, son token est dans son wallet personnel, transférable n'importe où, échangeable contre euros ou autres cryptos. PASSIO ne contrôle plus l'argent.</p>
<h2>Raison 2, Aligner les incentives utilisateurs ↔ plateforme</h2>
<p>Quand un utilisateur achète du Passia crypto, il devient mécaniquement bénéficiaire de la croissance, plus la communauté grandit, plus le token devient demandé, plus son Passia prend de valeur. Le succès de la plateforme est partagé.</p>
<h2>Raison 3, Créer une réserve de valeur passion</h2>
<p>Bitcoin = réserve contre la défiance bancaire. Ethereum = confiance smart contract. Passia ambitionne d'être la réserve de valeur de l'économie créateur passion.</p>
<h2>Raison 4, Préparer la décentralisation progressive</h2>
<p>À terme, les décisions clés sont votées par les détenteurs (DAO en année 5+). PASSIO devient l'infrastructure, la communauté devient le pilote.</p>

<h1>2. Le token PASSIA, caractéristiques techniques</h1>
<h2>Carte d'identité</h2>
<table>
  <tr><th>Attribut</th><th>Valeur</th></tr>
  <tr><td>Nom / symbole</td><td>PASSIA / PSI</td></tr>
  <tr><td>Blockchain</td><td>Polygon (Layer 2 Ethereum)</td></tr>
  <tr><td>Standard</td><td>ERC-20</td></tr>
  <tr><td>Supply totale capée</td><td>1 000 000 000 PSI (jamais plus)</td></tr>
  <tr><td>Décimales</td><td>18</td></tr>
  <tr><td>Audit smart contract</td><td>Trail of Bits + CertiK avant mainnet</td></tr>
  <tr><td>Code</td><td>100 % open source sur GitHub</td></tr>
</table>
<h2>Distribution des 1 milliard PSI</h2>
<table>
  <tr><th>Allocation</th><th>Quantité</th><th>Détail</th></tr>
  <tr><td>Récompenses communauté</td><td>40 %</td><td>Distribuées sur 8 ans</td></tr>
  <tr><td>Vente publique</td><td>25 %</td><td>Achat utilisateurs, libération sur 5 ans</td></tr>
  <tr><td>Trésorerie écosystème</td><td>15 %</td><td>Liquidité, partenariats, événements</td></tr>
  <tr><td>Équipe & fondateurs</td><td>15 %</td><td>Vesting 4 ans + cliff 1 an</td></tr>
  <tr><td>Investisseurs early</td><td>5 %</td><td>Vesting 3 ans</td></tr>
  <tr><td>Liquidité d'amorçage</td><td>5 %</td><td>Premier marché secondaire</td></tr>
</table>
<div class="doc-callout green">
  <div class="doc-callout-title">Le supply cap est inscrit dans le smart contract</div>
  <p>Une fois le contrat déployé, AUCUN nouveau PSI ne peut être créé. C'est ce qui distingue Passia des Stars Facebook ou Coins Twitch (créables à volonté par leur émetteur).</p>
</div>

<h1>3. Comment la valeur du Passia augmente avec les utilisateurs</h1>
<p>5 mécaniques précises codées dans le contrat. Aucune promesse marketing : règles automatiques vérifiables on-chain.</p>
<h2>Mécanique 1, Le burn automatique (déflation)</h2>
<p>1 % de chaque transaction Passia détruit pour toujours. À 1 milliard de transactions/an, ce sont des millions de PSI qui partent en fumée.</p>
<h2>Mécanique 2, Le buyback PASSIO</h2>
<p>10 % du volume des transactions est utilisé pour racheter du PSI sur le marché. Demande continue auto-financée. À 50 M$ de volume mensuel, 5 M$/mois de pression à l'achat.</p>
<h2>Mécanique 3, Le staking Pass Passion</h2>
<p>200 PSI bloqués 30 jours pour le Pass Passion. À 1 M abonnés, 200 M PSI hors circulation = 20 % du supply.</p>
<h2>Mécanique 4, Cas d'usage en expansion</h2>
<p>Plus le réseau grandit, plus les cas d'usage se multiplient (tip, cours, événements, marketplace, crowdfunding, badges). Plus de demande pour le PSI.</p>
<h2>Mécanique 5, Effet réseau (Metcalfe)</h2>
<p>Valeur d'un réseau ∝ utilisateurs². ×10 utilisateurs = ×100 connexions économiques.</p>
<h2>Calcul théorique</h2>
<table>
  <tr><th>Phase</th><th>Utilisateurs</th><th>Valeur PSI*</th><th>Capitalisation</th></tr>
  <tr><td>Lancement</td><td>10 k</td><td>0,05 €</td><td>5 M€</td></tr>
  <tr><td>Année 1</td><td>100 k</td><td>0,12 €</td><td>18 M€</td></tr>
  <tr><td>Année 3</td><td>1 M</td><td>0,40 €</td><td>120 M€</td></tr>
  <tr><td>Année 5</td><td>5 M</td><td>1,20 €</td><td>600 M€</td></tr>
  <tr><td>Année 10</td><td>30 M</td><td>4,80 €</td><td>3,1 Md€</td></tr>
</table>
<p style="font-size: 12px; font-style: italic; color: #6b6480;">* Estimations théoriques basées sur la loi de Metcalfe et les comparables crypto sociaux. PAS une promesse.</p>

<h1>4. Comment acheter et utiliser du Passia</h1>
<h2>Voie 1, Achat in-app (débutants)</h2>
<p>Wallet → Boutique → pack. Carte ou Apple Pay. Passia dans wallet PASSIO en 60 sec. Aucune connaissance crypto requise.</p>
<h2>Voie 2, Wallet personnel (intermédiaires)</h2>
<p>MetaMask, Coinbase Wallet ou Rainbow. PASSIO migre votre solde. Souveraineté totale, mais perte définitive si seed perdue.</p>
<h2>Voie 3, Gagner gratuitement</h2>
<p>40 % du supply distribué progressivement aux utilisateurs actifs sur 8 ans (création, IRL, mentor, modération communautaire).</p>

<h1>5. Le staking, gagner en bloquant son Passia</h1>
<table>
  <tr><th>Niveau</th><th>Durée</th><th>Récompense annuelle</th><th>Avantages</th></tr>
  <tr><td>Pass Passion</td><td>30 jours</td><td>—</td><td>Profils illimités, archives, badge</td></tr>
  <tr><td>Pass Mécène</td><td>1 an</td><td>+5 % en PSI</td><td>Tout ci-dessus + accès anticipé features</td></tr>
  <tr><td>Pass Légende</td><td>3 ans</td><td>+10 % en PSI</td><td>Tout + droit de vote en gouvernance</td></tr>
</table>
<div class="doc-callout amber">
  <div class="doc-callout-title">Le staking n'est PAS un placement à rendement garanti</div>
  <p>Le rendement est en PSI, pas en euros. Si le PSI baisse, votre récompense aussi. Le staking impose une période de blocage.</p>
</div>

<h1>6. La gouvernance progressive vers une DAO</h1>
<h2>Phase 1 (année 1-3), Centralisée transparente</h2>
<p>PASSIO décide. Détenteurs PSI peuvent voter sur des propositions consultatives.</p>
<h2>Phase 2 (année 3-6), Hybride</h2>
<p>Conseil consultatif des détenteurs (7 sièges élus), droit de veto sur 5 catégories de décisions.</p>
<h2>Phase 3 (année 6+), DAO complète</h2>
<p>Toutes les décisions structurantes votées par détenteurs. PASSIO devient opérateur technique sous mandat.</p>

<h1>7. Sécurité, protéger votre Passia</h1>
<h2>Les 7 règles d'or</h2>
<ul>
  <li>Ne partagez JAMAIS votre seed phrase. PASSIO ne vous la demandera jamais.</li>
  <li>Stockez votre seed phrase hors ligne (papier, coffre). JAMAIS sur cloud.</li>
  <li>Activez la 2FA partout (authentificateur, pas SMS).</li>
  <li>Wallet matériel pour > 5 000 € de Passia (Ledger ou Trezor).</li>
  <li>Vérifiez TOUJOURS l'adresse du contrat.</li>
  <li>Méfiez-vous des « giveaway » et « doublez vos PSI », toujours des arnaques.</li>
  <li>Limitez les autorisations smart contract (revoke.cash).</li>
</ul>
<h2>Ce que PASSIO met en place</h2>
<ul>
  <li>Multi-sig pour la trésorerie (5 signatures sur 9).</li>
  <li>Time-lock 7 jours sur le contrat principal.</li>
  <li>Bug bounty 500 k$.</li>
  <li>Assurance Nexus Mutual sur 50 % du flottant.</li>
</ul>

<h1>8. Conformité réglementaire, MiCA</h1>
<p>L'Europe a adopté le règlement MiCA en 2024. PASSIO se conforme dès le lancement.</p>
<h2>Catégorisation MiCA du Passia</h2>
<p>Passia = utility token. Pas de promesse de rendement. White paper publié et notifié à l'AMF. Réserve de liquidité minimale 50 % du flottant.</p>
<h2>Conformité KYC / AML</h2>
<p>Achats > 1 000 € : KYC obligatoire (pièce d'identité + selfie via Sumsub, 24h). Conversion crypto → euros nécessite compte bancaire personnel vérifié.</p>
<h2>Fiscalité France</h2>
<p>Plus-values imposées au PFU 30 % au-delà de 305 € de cessions/an. Détention seule pas imposable. Conversion crypto → euros déclenche l'imposition. PASSIO fournit récap fiscal annuel.</p>
<div class="doc-callout amber">
  <div class="doc-callout-title">Juridictions exclues au lancement</div>
  <p>États-Unis (incertitude SEC), Chine (interdiction crypto), Pays sous sanctions.</p>
</div>

<h1>9. Les 6 risques à comprendre</h1>
<h2>Risque 1, Volatilité du marché crypto</h2>
<p>Tous les tokens subissent les mouvements du marché global. Si Bitcoin chute, PSI suivra probablement.</p>
<h2>Risque 2, Adoption insuffisante</h2>
<p>Si PASSIO échoue à gagner les utilisateurs prévus, le PSI perdra de la valeur. Risque produit avant tout.</p>
<h2>Risque 3, Risques techniques (hack, bug)</h2>
<p>Bugs smart contract possibles malgré audits. Mitigation : audits multiples + assurance + multi-sig + time-lock.</p>
<h2>Risque 4, Évolution réglementaire</h2>
<p>MiCA peut évoluer. Crypto utility aujourd'hui peut être requalifiée demain.</p>
<h2>Risque 5, Liquidité limitée au lancement</h2>
<p>Marché secondaire restreint au début. Vendre du gros volume peut faire chuter le prix temporairement.</p>
<h2>Risque 6, Risque de gouvernance</h2>
<p>Transition vers DAO peut mal se passer. Votes destructeurs possibles.</p>
<div class="doc-callout red">
  <div class="doc-callout-title">La règle de bon sens absolue</div>
  <p>N'achetez JAMAIS plus de Passia que ce que vous accepteriez de perdre intégralement. Pour un utilisateur normal, 1 % à 5 % de votre capacité d'épargne mensuelle est raisonnable.</p>
</div>

<h1>10. Roadmap, du lancement à la DAO</h1>
<ul>
  <li><b>Phase 0, Beta MVP (avril 2026, livré)</b>, Wallet visuel, Passia stablecoin interne 0,05 €</li>
  <li><b>Phase 1, Conformité MiCA (en phase de préparation)</b>, Audit juridique, white paper, audit smart contract</li>
  <li><b>Phase 2, Private sale (en amont du lancement)</b>, Pré-vente PSI à 0,03 €, levée 3 à 5 M€</li>
  <li><b>Phase 3, Lancement public (à terme)</b>, Mainnet Polygon, listing Uniswap, airdrop</li>
  <li><b>Phase 4, Pass Passion en staking (dans une version future)</b>, Migration abonnement vers staking PSI</li>
  <li><b>Phase 5, Conseil consultatif (plus tard)</b>, Élection 7 sièges, droit de veto sur 5 catégories</li>
  <li><b>Phase 6, DAO complète (Q1 2030)</b>, Tous paramètres clés deviennent votables par la communauté</li>
</ul>

<h1>11. FAQ utilisateur</h1>
<h3>Est-ce que je vais devenir riche avec Passia ?</h3>
<p>Personne ne peut le promettre. Les mécaniques créent un potentiel, pas une garantie. N'achetez pas avec l'idée de devenir riche.</p>
<h3>Combien dois-je acheter pour démarrer ?</h3>
<p>Minimum utile : 200 PSI (≈ 10 €). N'allez pas au-delà de ce que vous accepteriez de perdre.</p>
<h3>Puis-je vendre mon Passia quand je veux ?</h3>
<p>Wallet personnel : oui, sur Uniswap à tout moment. Wallet PASSIO custodial : il faut migrer d'abord (24-72h).</p>
<h3>Que se passe-t-il si PASSIO ferme ?</h3>
<p>Le contrat smart sur Polygon continue de fonctionner. Vous gardez accès à votre Passia dans votre wallet personnel.</p>
<h3>Pourquoi Polygon et pas Ethereum direct ?</h3>
<p>Transactions ultra-rapides (2-3 sec), frais faibles (centimes), empreinte carbone 99 % inférieure à Ethereum historique.</p>
<h3>Est-ce que Passia est légal en France ?</h3>
<p>Oui. Conformité MiCA, enregistrement PSAN, white paper notifié AMF.</p>

<h1>12. Conclusion, le pacte Passia</h1>
<h2>Ce que nous nous engageons à respecter</h2>
<ul>
  <li>Transparence radicale, toutes les transactions et votes publics, trésorerie auditable on-chain</li>
  <li>Éthique avant valorisation, refus de toute décision contraire à l'ADN PASSIO même si elle ferait monter le prix</li>
  <li>Progressivité de la décentralisation, DAO progressive selon maturité de la communauté</li>
  <li>Protection des plus vulnérables, plafonds, mode mineur, KYC, conformité MiCA</li>
</ul>
<h2>Ce que nous attendons de vous</h2>
<ul>
  <li>L'achat conscient, comprenez ce que vous achetez, ne dépensez pas plus que vous acceptez de perdre</li>
  <li>La participation au-delà de l'achat, créez, partagez, organisez. L'usage est la valeur</li>
  <li>Le respect du long terme, marathon de 10 ans, pas un sprint</li>
  <li>La défense de la mission, alertez la communauté si quelqu'un tente de la trahir</li>
</ul>
<div class="doc-callout">
  <div class="doc-callout-title">La phrase qui résume tout</div>
  <p>Acheter du Passia n'est pas un investissement financier au sens classique. C'est un acte d'adhésion à un projet : faire émerger un réseau social européen géré par sa communauté.</p>
  <p>La question à se poser n'est pas « combien je vais gagner ? » mais « est-ce que je crois à ce projet et est-ce que j'y participe ? ».</p>
</div>
`;

function openDoc(which) {
  const html = which === 'simple' ? DOC_PASSIA_SIMPLE : DOC_PASSIA_FULL;
  document.getElementById('docViewerBody').innerHTML = html;
  document.getElementById('docViewer').classList.add('open');
  document.getElementById('docViewer').setAttribute('aria-hidden', 'false');
  document.body.classList.add('doc-open');
  document.body.style.overflow = 'hidden';
  // Reset scroll en haut
  document.getElementById('docViewer').scrollTop = 0;
}

function closeDocViewer() {
  document.getElementById('docViewer').classList.remove('open');
  document.getElementById('docViewer').setAttribute('aria-hidden', 'true');
  document.body.classList.remove('doc-open');
  document.body.style.overflow = '';
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const v = document.getElementById('docViewer');
    if (v && v.classList.contains('open')) closeDocViewer();
  }
});

// ===== CARNET DE VOYAGE (VLOG) =====
const vlogState = {
  cover: null,
  steps: [],
};

// Templates de pré-remplissage
const VLOG_TEMPLATES = {
  weekend: {
    nbDays: 3,
    placeholders: ["Centre-ville", "Quartier alternatif", "Sortie matinale + retour"],
    transport: "Train + métro",
    lodging: "Hôtel ou Airbnb",
    season: "toute l'année",
    tip: "Réserve les restos populaires 48h à l'avance, c'est l'astuce qu'on oublie sur les week-ends courts."
  },
  roadtrip: {
    nbDays: 5,
    placeholders: ["Ville de départ", "Étape nature", "Ville étape", "Sentier panoramique", "Retour"],
    transport: "Voiture + parfois ferry",
    lodging: "Auberges + 1 camping",
    season: "mai-septembre",
    tip: "Trace ton parcours sur Google Maps offline avant de partir, coupures de réseau garanties."
  },
  etranger: {
    nbDays: 7,
    placeholders: ["Arrivée capitale", "Quartier historique", "Excursion 1 jour", "Ville secondaire", "Site naturel", "Plage / détente", "Retour"],
    transport: "Avion + train local",
    lodging: "Mix hôtel + auberge",
    season: "à confirmer",
    tip: "Achète une carte SIM locale dès l'aéroport, beaucoup moins cher que le roaming et plus rapide."
  },
  nature: {
    nbDays: 4,
    placeholders: ["Camp de base", "Sommet du jour 1", "Lac d'altitude", "Retour vallée"],
    transport: "Voiture + marche",
    lodging: "Refuge + bivouac",
    season: "juin-septembre",
    tip: "Vérifie la météo en montagne 3 jours avant, un orage peut tout changer."
  },
  culturel: {
    nbDays: 5,
    placeholders: ["Musée principal", "Vieille ville", "Monument emblématique", "Quartier des arts", "Site archéologique"],
    transport: "Train + à pied",
    lodging: "Hôtel central",
    season: "avril-octobre",
    tip: "Pass culturel acheté en ligne avant le départ : économie 30 % et tu coupes la queue."
  },
  blank: {
    nbDays: 0, placeholders: [], transport: "", lodging: "", season: "", tip: ""
  }
};

function applyVlogTemplate(kind) {
  const tpl = VLOG_TEMPLATES[kind];
  if (!tpl) return;

  // Marquer le template actif
  document.querySelectorAll(".vlog-template-btn").forEach(function(btn) { btn.classList.remove("active"); });
  var clickedBtn = document.querySelector('.vlog-template-btn[onclick*="' + kind + '"]');
  if (clickedBtn) clickedBtn.classList.add("active");

  // Pré-remplir les champs si vides
  if (tpl.transport && $("#vlogTransport") && !$("#vlogTransport").value) $("#vlogTransport").value = tpl.transport;
  if (tpl.lodging && $("#vlogLodging") && !$("#vlogLodging").value) $("#vlogLodging").value = tpl.lodging;
  if (tpl.season && $("#vlogSeason") && !$("#vlogSeason").value) $("#vlogSeason").value = tpl.season;
  if (tpl.tip && $("#vlogTip") && !$("#vlogTip").value) $("#vlogTip").value = tpl.tip;

  // Générer les étapes templates (en remplaçant celles existantes si vides)
  const isEmpty = (vlogState.steps || []).every(s => !s.place && !s.text && !s.photo);
  if (kind === "blank") {
    if (isEmpty) {
      vlogState.steps = [{ id: uid(), place: "", text: "", tip: "", photo: null }];
    }
  } else if (isEmpty || !vlogState.steps || vlogState.steps.length === 0) {
    vlogState.steps = (tpl.placeholders || []).map((ph) => ({
      id: uid(), place: ph, text: "", tip: "", photo: null
    }));
  }
  renderVlogSteps();
  toast(`✨ Modèle « ${kind === "weekend" ? "Week-end" : kind === "roadtrip" ? "Road trip" : kind === "etranger" ? "Voyage étranger" : kind === "nature" ? "Aventure nature" : kind === "culturel" ? "Voyage culturel" : "Vierge"} » appliqué`);
}

function moveVlogStep(stepId, direction) {
  const idx = vlogState.steps.findIndex(s => s.id === stepId);
  if (idx === -1) return;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= vlogState.steps.length) return;
  const tmp = vlogState.steps[idx];
  vlogState.steps[idx] = vlogState.steps[newIdx];
  vlogState.steps[newIdx] = tmp;
  renderVlogSteps();
}

// Carnets sauvegardés (favoris)
function savedCarnets() {
  return state.user.savedCarnets || [];
}
function isCarnetSaved(postId) {
  return savedCarnets().includes(postId);
}
function toggleCarnetSave(postId) {
  state.user.savedCarnets = state.user.savedCarnets || [];
  const idx = state.user.savedCarnets.indexOf(postId);
  if (idx === -1) {
    state.user.savedCarnets.push(postId);
    toast("⭐ Carnet sauvegardé dans tes favoris");
  } else {
    state.user.savedCarnets.splice(idx, 1);
    toast("Carnet retiré des favoris");
  }
  saveState();
  // Re-render le viewer s'il est ouvert
  const vw = $("#vlogViewer");
  if (vw && vw.classList.contains("open")) {
    const currentId = vw.getAttribute("data-current-post");
    if (currentId) openVlogViewer(currentId);
  }
}

// "M'inspirer", duplique la STRUCTURE (pas le contenu) pour démarrer un nouveau carnet
function inspireFromCarnet(postId) {
  const post = state.userPosts.find(p => p.id === postId)
            || state.seed.posts.find(p => p.id === postId);
  if (!post || post.type !== "vlog") return;
  closeVlogViewer();
  // Remettre dans l'éditeur
  setTimeout(() => {
    goTo("studio");
    setTimeout(() => {
      // Bascule en vue Carnet (onglet retiré → fonction dédiée)
      activateStudioVlog();
      // Remplit avec la structure
      if ($("#vlogDestination")) $("#vlogDestination").value = "Mon " + (post.destination || "voyage");
      if ($("#vlogTransport")) $("#vlogTransport").value = post.transport || "";
      if ($("#vlogLodging")) $("#vlogLodging").value = post.lodging || "";
      if ($("#vlogSeason")) $("#vlogSeason").value = post.season || "";
      vlogState.cover = null;
      if ($("#vlogCoverPreview")) $("#vlogCoverPreview").innerHTML = "";
      vlogState.steps = (post.steps || []).map(s => ({
        id: uid(),
        place: s.place || "",
        text: "", tip: "", photo: null  // on copie SEULEMENT la structure / lieux, pas le contenu perso
      }));
      renderVlogSteps();
      toast("📔 Structure copiée. À toi d'écrire ton histoire.");
    }, 200);
  }, 200);
}

// Organiser un voyage groupé à partir d'un carnet
function organizeGroupTrip(postId) {
  const post = state.userPosts.find(p => p.id === postId)
            || state.seed.posts.find(p => p.id === postId);
  if (!post || post.type !== "vlog") return;
  closeVlogViewer();
  setTimeout(() => {
    if (typeof openCreateEvent === "function") {
      openCreateEvent();
      // Pré-remplir si on peut accéder aux champs
      setTimeout(() => {
        // 🔧 FIX AUDIT 2026-06-10 : les vrais IDs du modal sont evTitle/
        // evCity/evDesc — le pré-remplissage "Voyage groupé" ne marchait jamais.
        const titleInput = document.getElementById("evTitle");
        const cityInput = document.getElementById("evCity");
        const descInput = document.getElementById("evDesc");
        if (titleInput) titleInput.value = "Voyage groupé : " + (post.destination || "destination");
        if (cityInput) cityInput.value = (post.destination || "").split(/[·,]/)[0].trim();
        if (descInput) descInput.value = "Inspiré du carnet de voyage de la communauté. " + ((post.steps || []).length) + " jours, " + (post.budget ? "budget ~" + post.budget : "à définir ensemble") + ". " + (post.tip || "");
      }, 250);
    } else {
      goTo("irl");
      toast("Crée un événement IRL pour organiser ce voyage groupé.");
    }
  }, 200);
}

// Stats calculées du carnet
function vlogStats(post) {
  const nbDays = (post.steps || []).length;
  let durée = nbDays;
  if (post.dateStart && post.dateEnd) {
    const ms = new Date(post.dateEnd).getTime() - new Date(post.dateStart).getTime();
    durée = Math.max(1, Math.round(ms / 86400000) + 1);
  }
  // Coût moyen par jour si budget connu
  let coutJour = null;
  if (post.budget) {
    const m = String(post.budget).match(/(\d[\d\s]*)/);
    if (m) {
      const total = parseInt(m[1].replace(/\s/g, ""), 10);
      if (!isNaN(total) && durée > 0) coutJour = Math.round(total / durée);
    }
  }
  // Photos
  const nbPhotos = (post.steps || []).filter(s => s.photo).length + (post.cover ? 1 : 0);
  return { nbDays, durée, coutJour, nbPhotos };
}

function addVlogStep() {
  vlogState.steps = vlogState.steps || [];
  vlogState.steps.push({ id: uid(), place: "", text: "", tip: "", photo: null });
  renderVlogSteps();
}

function removeVlogStep(stepId) {
  vlogState.steps = (vlogState.steps || []).filter(s => s.id !== stepId);
  renderVlogSteps();
}

function updateVlogStep(stepId, field, value) {
  const s = (vlogState.steps || []).find(x => x.id === stepId);
  if (!s) return;
  s[field] = value;
}

function renderVlogSteps() {
  const list = $("#vlogStepsList");
  if (!list) return;
  const steps = vlogState.steps || [];
  if (steps.length === 0) {
    list.innerHTML = `<div class="empty" style="padding:14px;"><div class="empty-text">Aucune étape pour le moment. Tap « + Ajouter un jour » pour commencer.</div></div>`;
    return;
  }
  list.innerHTML = steps.map((s, i) => `
    <div class="vlog-step" data-stepid="${s.id}">
      <div class="vlog-step-head">
        <span class="vlog-step-num">${i + 1}</span>
        <span class="vlog-step-title">Jour ${i + 1}</span>
        <div class="vlog-step-reorder">
          <button class="vlog-step-arrow" onclick="moveVlogStep('${s.id}', -1)" ${i === 0 ? "disabled" : ""} aria-label="Monter">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14 L12 8 L18 14"/></svg>
          </button>
          <button class="vlog-step-arrow" onclick="moveVlogStep('${s.id}', 1)" ${i === steps.length - 1 ? "disabled" : ""} aria-label="Descendre">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10 L12 16 L18 10"/></svg>
          </button>
        </div>
        <button class="vlog-step-remove" onclick="removeVlogStep('${s.id}')" aria-label="Supprimer ce jour">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5 L19 19"/><path d="M19 5 L5 19"/></svg>
        </button>
      </div>
      <input type="text" class="input" placeholder="Lieu (ex: Lisbonne · Alfama)" value="${escapeHtml(s.place || '')}" maxlength="60" oninput="updateVlogStep('${s.id}', 'place', this.value)" style="margin-bottom:6px;" />
      ${s.photo ? `<img loading="lazy" decoding="async" class="vlog-step-photo-thumb" src="${s.photo}" alt=""/>` : ''}
      ${s.video ? `<video class="vlog-step-photo-thumb" src="${s.video}" controls playsinline preload="metadata" style="max-height:160px;"></video>` : ''}
      ${s.audio ? `<audio src="${s.audio}" controls style="width:100%;margin:6px 0;"></audio>` : ''}
      <div class="vlog-step-media-row">
        <button class="vlog-step-media-btn" onclick="document.getElementById('vlogStepPhoto_${s.id}').click()" title="Ajouter / changer la photo">
          <span style="font-size:14px;">📷</span>
          <span>${s.photo ? "Changer photo" : "Photo"}</span>
        </button>
        <button class="vlog-step-media-btn" onclick="document.getElementById('vlogStepVideo_${s.id}').click()" title="Ajouter / changer la vidéo">
          <span style="font-size:14px;">🎥</span>
          <span>${s.video ? "Changer vidéo" : "Vidéo"}</span>
        </button>
        <button class="vlog-step-media-btn" onclick="document.getElementById('vlogStepAudio_${s.id}').click()" title="Ajouter / changer l'audio">
          <span style="font-size:14px;">🎙</span>
          <span>${s.audio ? "Changer audio" : "Audio"}</span>
        </button>
        ${s.photo || s.video || s.audio ? `<button class="vlog-step-media-btn vlog-step-media-clear" onclick="clearVlogStepMedia('${s.id}')" title="Retirer le média">✕</button>` : ''}
      </div>
      <input type="file" id="vlogStepPhoto_${s.id}" accept="image/*" style="display:none;" onchange="onVlogStepMediaChange(event, '${s.id}', 'photo')" />
      <input type="file" id="vlogStepVideo_${s.id}" accept="video/*" style="display:none;" onchange="onVlogStepMediaChange(event, '${s.id}', 'video')" />
      <input type="file" id="vlogStepAudio_${s.id}" accept="audio/*" style="display:none;" onchange="onVlogStepMediaChange(event, '${s.id}', 'audio')" />
      <textarea class="textarea" placeholder="Note du jour : ce que tu as vu, ressenti, mangé…" maxlength="400" style="min-height:60px;margin-top:6px;" oninput="updateVlogStep('${s.id}', 'text', this.value)">${escapeHtml(s.text || '')}</textarea>
      <input type="text" class="input" placeholder="💡 Conseil pratique (optionnel)" value="${escapeHtml(s.tip || '')}" maxlength="160" oninput="updateVlogStep('${s.id}', 'tip', this.value)" style="margin-top:6px;font-size:12px;" />
    </div>
  `).join("");
}

function onVlogStepMediaChange(e, stepId, kind) {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const limit = kind === "video" ? 12 * 1024 * 1024 : kind === "audio" ? 5 * 1024 * 1024 : 3 * 1024 * 1024;
  if (f.size > limit) { toast(`Fichier ${kind} trop gros (limite ${limit / 1024 / 1024} Mo).`); return; }
  const reader = new FileReader();
  reader.onload = (ev) => {
    updateVlogStep(stepId, kind, ev.target.result);
    // Pour ne pas accumuler les médias sur une étape, on garde l'ancienne logique : photo, video et audio peuvent coexister
    renderVlogSteps();
  };
  reader.readAsDataURL(f);
}

function clearVlogStepMedia(stepId) {
  updateVlogStep(stepId, "photo", null);
  updateVlogStep(stepId, "video", null);
  updateVlogStep(stepId, "audio", null);
  renderVlogSteps();
}

function onVlogStepPhotoChange(e, stepId) {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  if (f.size > 3 * 1024 * 1024) { toast("Photo > 3 Mo, compresse-la"); return; }
  const reader = new FileReader();
  reader.onload = (ev) => {
    updateVlogStep(stepId, "photo", ev.target.result);
    renderVlogSteps();
  };
  reader.readAsDataURL(f);
}

// Cover du carnet
document.addEventListener("click", (e) => {
  if (e.target.closest("#vlogCoverZone")) {
    const inp = $("#vlogCoverInput");
    if (inp) inp.click();
  }
});

document.addEventListener("change", (e) => {
  if (e.target && e.target.id === "vlogCoverInput") {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) { toast("Cover > 4 Mo, compresse-la"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      vlogState.cover = ev.target.result;
      const prev = $("#vlogCoverPreview");
      if (prev) prev.innerHTML = `<img loading="lazy" decoding="async" class="vlog-cover-preview" src="${ev.target.result}" alt="Cover"/>`;
    };
    reader.readAsDataURL(f);
  }
});

// Viewer plein écran d'un carnet
function openVlogViewer(postId) {
  const post = state.userPosts.find(p => p.id === postId)
            || state.seed.posts.find(p => p.id === postId);
  if (!post || post.type !== "vlog") return;
  const author = post._source === "me" || post.profileId
    ? { name: state.user.name || "Toi", profileEmoji: "🌍", avatar: "#7c3aed" }
    : (userById(post.authorId) || { name: "Anonyme", profileEmoji: "🌍", avatar: "#7c3aed" });

  const fmtRange = (a, b) => {
    if (!a && !b) return "";
    const da = a ? new Date(a) : null;
    const db = b ? new Date(b) : null;
    const opts = { day: "numeric", month: "short", year: "numeric" };
    if (da && db) return `${da.toLocaleDateString("fr-FR", opts)} → ${db.toLocaleDateString("fr-FR", opts)}`;
    return (da || db).toLocaleDateString("fr-FR", opts);
  };

  const stepsHTML = (post.steps || []).map((st, i) => `
    <div class="vlog-viewer-step">
      <span class="vlog-viewer-step-day">JOUR ${i + 1}</span>
      ${st.place ? `<div class="vlog-viewer-step-place">📍 ${escapeHtml(st.place)}</div>` : ""}
      ${st.photo ? `<img loading="lazy" decoding="async" class="vlog-viewer-step-photo" src="${st.photo}" alt="" onerror="this.onerror=null;this.src='https://picsum.photos/seed/vlog-step-${i}-${postId}/720/480';"/>` : ""}
      ${st.video ? `<video class="vlog-viewer-step-photo" src="${st.video}" controls playsinline preload="metadata" style="background:#000;"></video>` : ""}
      ${st.audio ? `<audio src="${st.audio}" controls style="width:100%;margin:6px 0;"></audio>` : ""}
      ${st.text ? `<div class="vlog-viewer-step-text">${escapeHtml(st.text)}</div>` : ""}
      ${st.tip ? `<div class="vlog-viewer-step-tip">💡 ${escapeHtml(st.tip)}</div>` : ""}
    </div>
  `).join("");

  const practical = [];
  if (post.budget) practical.push(["Budget", post.budget]);
  if (post.transport) practical.push(["Transport", post.transport]);
  if (post.lodging) practical.push(["Logement", post.lodging]);
  if (post.season) practical.push(["Saison", post.season]);

  const stats = vlogStats(post);
  // Conserve l'index original de l'étape pour le numéro affiché sur la carte
  const mapPlaces = (post.steps || [])
    .map((s, i) => ({ place: s.place || "", dayNum: i + 1, ll: s.place ? cityToLatLng(s.place) : null }))
    .filter(s => s.ll);
  // Fallback : si aucune étape n'a pu être géolocalisée, on essaie la destination du carnet
  if (mapPlaces.length === 0 && post.destination) {
    const destLL = cityToLatLng(post.destination);
    if (destLL) mapPlaces.push({ place: post.destination, dayNum: 1, ll: destLL });
  }
  const hasMap = mapPlaces.length > 0;
  const isSaved = isCarnetSaved(postId);

  const html = `
    ${post.cover ? `<img loading="lazy" decoding="async" class="vlog-viewer-cover" src="${post.cover}" alt="${escapeHtml(post.destination || '')}" onerror="this.onerror=null;this.src='https://picsum.photos/seed/vlog-${postId}/1280/720';"/>` : `<div class="vlog-viewer-cover"></div>`}
    <div class="vlog-viewer-body">
      <div class="vlog-viewer-title">${escapeHtml(post.destination || "Carnet de voyage")}</div>
      <div class="vlog-viewer-dates">${escapeHtml(fmtRange(post.dateStart, post.dateEnd))}</div>
      <div class="vlog-viewer-author">par ${escapeHtml(author.name)}</div>

      <div class="vlog-stats-bar">
        <div class="vlog-stat"><div class="vlog-stat-num">${stats.durée}</div><div class="vlog-stat-label">Jours</div></div>
        <div class="vlog-stat"><div class="vlog-stat-num">${stats.nbDays}</div><div class="vlog-stat-label">Étapes</div></div>
        <div class="vlog-stat"><div class="vlog-stat-num">${stats.coutJour ? stats.coutJour + "€" : "—"}</div><div class="vlog-stat-label">Coût/jour</div></div>
        <div class="vlog-stat"><div class="vlog-stat-num">${stats.nbPhotos}</div><div class="vlog-stat-label">Photos</div></div>
      </div>

      ${hasMap ? `<div class="vlog-mini-map" id="vlogViewerMap"></div>` : `<div class="vlog-map-empty">📍 Lieux non géolocalisables sur la carte</div>`}

      ${post.tip ? `<div class="vlog-viewer-tip">
        <div class="vlog-viewer-tip-label">⭐ LE CONSEIL CLÉ</div>
        ${escapeHtml(post.tip)}
      </div>` : ""}

      ${stepsHTML}

      ${practical.length > 0 ? `
        <div class="section-title" style="margin-top:24px;font-size:14px;">Bilan pratique</div>
        <div class="vlog-viewer-practical">
          ${practical.map(([l, v]) => `<div class="vlog-viewer-practical-item">
            <div class="vlog-viewer-practical-label">${escapeHtml(l)}</div>
            <div class="vlog-viewer-practical-value">${escapeHtml(v)}</div>
          </div>`).join("")}
        </div>` : ""}

      <div class="vlog-viewer-actions">
        <button class="vlog-action-btn ${isSaved ? "saved" : ""}" onclick="toggleCarnetSave('${postId}')">
          ${isSaved ? "⭐ Sauvegardé" : "☆ Sauvegarder"}
        </button>
        <button class="vlog-action-btn" onclick="inspireFromCarnet('${postId}')">
          📔 M'en inspirer
        </button>
        <button class="vlog-action-btn primary" onclick="organizeGroupTrip('${postId}')">
          🤝 Organiser un voyage groupé
        </button>
      </div>

      <div class="vlog-viewer-comments" style="margin-top:24px;border-top:1px solid var(--border);padding-top:16px;">
        <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:12px;">💬 Commentaires</div>
        <div id="vlogCommentsList" style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px;">
          <div style="font-size:12px;color:var(--muted);">Chargement…</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <input type="text" class="input" id="vlogCommentInput" placeholder="Écris un commentaire…" maxlength="500" style="flex:1;font-size:13px;padding:10px 12px;" onkeypress="if(event.key==='Enter')submitVlogComment('${postId}')"/>
          ${_cmtComposerToolsHtml("vlogCommentInput", "submitVlogComment", postId)}
          <button class="btn primary" onclick="submitVlogComment('${postId}')" style="font-size:13px;padding:10px 14px;">Envoyer</button>
        </div>
      </div>
    </div>
  `;
  $("#vlogViewerContent").innerHTML = html;
  $("#vlogViewer").classList.add("open");
  $("#vlogViewer").setAttribute("aria-hidden", "false");
  $("#vlogViewer").setAttribute("data-current-post", postId);
  // Bloque le scroll sous-jacent (app + body), scroll uniquement à l'intérieur du viewer
  document.body.classList.add("vlog-open");
  document.body.style.overflow = "hidden";
  // Reset du scroll du viewer en haut
  $("#vlogViewer").scrollTop = 0;

  // Charge / rend les commentaires du carnet (même système que le fil/IRL)
  _renderVlogComments(postId);

  // Initialise la mini-carte si on a des points géolocalisés
  if (hasMap) {
    setTimeout(() => initVlogMiniMap(mapPlaces), 200);
  }
}

// Rend les commentaires d'un carnet dans le viewer plein écran (#vlogCommentsList).
// Le carnet EST un post (findPostAnywhere), donc on réutilise tel quel le renderer
// et le pipeline Supabase du fil (même fonctionnalité, mêmes commentaires).
async function _renderVlogComments(postId) {
  var box = document.getElementById("vlogCommentsList");
  if (!box) return;
  var post = (typeof findPostAnywhere === "function") ? findPostAnywhere(postId) : null;
  var empty = '<div style="font-size:12px;color:var(--muted);">Aucun commentaire — sois le premier 💬</div>';
  var comments = (post && post.comments) || [];
  box.innerHTML = comments.length ? _renderCommentsList(comments, postId) : empty;
  // Charge les commentaires Supabase (cross-compte) puis re-rend.
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID && typeof supaLoadComments === "function") {
    try {
      var supaComments = await supaLoadComments(postId);
      if (supaComments && post) {
        var supaIds = supaComments.map(function(c){ return c.id; });
        var localOnly = comments.filter(function(c){ return supaIds.indexOf(c.id) < 0 && !c.fromSupabase; });
        var merged = supaComments.map(function(c){ return Object.assign({}, c, { text: c.content || c.text || "" }); })
          .concat(localOnly)
          .sort(function(a, b){ return (b.createdAt || 0) - (a.createdAt || 0); });
        post.comments = merged;
        if (typeof hydrateCommentInteractions === "function") { try { await hydrateCommentInteractions(post); } catch(e) {} }
        var box2 = document.getElementById("vlogCommentsList");
        var vv = document.getElementById("vlogViewer");
        if (box2 && vv && vv.getAttribute("data-current-post") === postId) {
          box2.innerHTML = post.comments.length ? _renderCommentsList(post.comments, postId) : empty;
        }
      }
    } catch(e) {}
  }
}

// Publie un commentaire sur un carnet — calque exact de submitComment (fil).
function submitVlogComment(postId) {
  var inp = document.getElementById("vlogCommentInput");
  if (!inp) return;
  var text = inp.value.trim();
  if (text.length < 2) { toast("Trop court"); return; }
  var post = (typeof findPostAnywhere === "function") ? findPostAnywhere(postId) : null;
  if (!post) return;
  if (!post.comments) post.comments = [];
  var realAuthorId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  var p = (typeof currentProfile === "function") ? currentProfile() : null;
  var _cid = "c_" + uid();
  post.comments.unshift({
    id: _cid, authorId: realAuthorId,
    authorName: (p && p.name) || state.user.name || "Moi",
    authorEmoji: (p && p.emoji) || "✨",
    text: text, content: text, createdAt: Date.now(),
  });
  // S'assure que l'auteur est dans seed.users pour userById()
  var meEntry = { id: realAuthorId, name: (p && p.name) || state.user.name || "Moi", profileEmoji: (p && p.emoji) || "✨", avatar: (p && p.color) || "#8b5cf6" };
  state.seed.users = state.seed.users.filter(function(u){ return u.id !== realAuthorId; });
  state.seed.users.push(meEntry);
  if (typeof grantReward === "function") grantReward("comment");
  // Sync Supabase + notif auteur (mêmes règles que submitComment)
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID && typeof supaAddComment === "function") {
    supaAddComment(postId, text, _cid);
    if (post.authorId && post.authorId !== MY_UID && post.fromSupabase && typeof supaInsertNotif === "function") {
      supaInsertNotif(post.authorId, "comment", postId, "a commenté ton carnet");
    }
  }
  inp.value = "";
  _renderVlogComments(postId);
  if (typeof renderCdvScreen === "function") { try { renderCdvScreen(); } catch(e) {} }
}

function initVlogMiniMap(places) {
  const el = document.getElementById("vlogViewerMap");
  if (!el || !places.length) return;
  if (typeof L === "undefined") { ensureLeaflet().then(function(){ initVlogMiniMap(places); }).catch(function(){}); return; }
  // Évite double init
  if (el._leafletMap) { try { el._leafletMap.remove(); } catch(e) {} el._leafletMap = null; }

  try {
    // Zoom adapté : 13 pour un seul point (échelle ville), sinon fitBounds couvrira tout
    const initialZoom = places.length === 1 ? 13 : 11;
    const map = L.map(el, { zoomControl: true, attributionControl: false })
      .setView(places[0].ll, initialZoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);

    const bounds = [];
    places.forEach((p) => {
      const icon = L.divIcon({
        className: "passio-marker-wrap",
        html: `<div class="passio-marker">${p.dayNum || 1}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -16],
      });
      const m = L.marker(p.ll, { icon }).addTo(map);
      m.bindPopup(`<b>Jour ${p.dayNum || 1}</b><br/>${escapeHtml(p.place)}`);
      bounds.push(p.ll);
    });

    if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 12 });
    }
    el._leafletMap = map;
    // 2 invalidateSize successifs pour gérer le délai d'apparition du modal
    setTimeout(() => { try { map.invalidateSize(); } catch(e) {} }, 100);
    setTimeout(() => { try { map.invalidateSize(); } catch(e) {} }, 400);
  } catch (e) {
    console.warn("Carte vlog : init impossible", e);
  }
}

function closeVlogViewer() {
  $("#vlogViewer").classList.remove("open");
  $("#vlogViewer").setAttribute("aria-hidden", "true");
  document.body.classList.remove("vlog-open");
  document.body.style.overflow = "";
}

// Renvoie tous les carnets disponibles (seed + perso), triés par date desc
function allCarnets() {
  const seed = (state.seed.posts || []).filter(p => p.type === "vlog").map(p => ({ ...p, _source: "seed" }));
  const mine = (state.userPosts || []).filter(p => p.type === "vlog").map(p => ({ ...p, _source: "me" }));
  return [...mine, ...seed].sort((a, b) => b.createdAt - a.createdAt);
}

// Rendu de la section "Carnets" dans Explorer (avec recherche)
function renderCarnetsExplore() {
  const list = $("#carnetsExploreList");
  if (!list) return;
  const q = (($("#carnetSearch") && $("#carnetSearch").value) || "").toLowerCase().trim();
  let carnets = allCarnets();
  if (q) {
    carnets = carnets.filter(c =>
      (c.destination || "").toLowerCase().includes(q) ||
      (c.text || "").toLowerCase().includes(q) ||
      (c.steps || []).some(s => (s.place || "").toLowerCase().includes(q))
    );
  }
  if (!carnets.length) {
    list.innerHTML = `<div class="empty" style="padding:20px;"><div class="empty-icon">📔</div><div class="empty-title">${q ? "Aucun carnet trouvé" : "Aucun carnet pour le moment"}</div><div class="empty-text">${q ? "Essaie une autre destination." : "Sois le premier à publier un carnet de voyage."}</div></div>`;
    return;
  }
  list.innerHTML = carnets.map(c => {
    const stats = vlogStats(c);
    const author = c._source === "me" ? state.user.name : (userById(c.authorId) || { name: "Anonyme" }).name;
    return `<div class="carnet-explore-card" onclick="openVlogViewer('${c.id}')">
      ${c.cover ? `<img loading="lazy" decoding="async" class="carnet-explore-cover" src="${c.cover}" alt=""/>` : `<div class="carnet-explore-cover" style="background:linear-gradient(135deg,#4c1d95,#7c3aed);"></div>`}
      <div class="carnet-explore-body">
        <div class="carnet-explore-dest">📍 ${escapeHtml(c.destination || "Carnet")}</div>
        <div class="carnet-explore-meta">
          <span>${stats.durée} jours</span>
          <span>•</span>
          <span>${stats.nbDays} étapes</span>
          ${c.budget ? `<span>•</span><span>💰 ${escapeHtml(c.budget)}</span>` : ""}
          <span>•</span>
          <span>par ${escapeHtml(author)}</span>
        </div>
      </div>
    </div>`;
  }).join("");
}

// Helper : aller direct au Studio en mode vlog
// ===== CDV LIVE =====
// ===== CDV LIVE SYSTEM (complet et fonctionnel) =====
function getCdvLives() {
  try { return JSON.parse(localStorage.getItem("passio_cdv_lives") || "[]"); } catch(e) { return []; }
}
function saveCdvLives(lives) { localStorage.setItem("passio_cdv_lives", JSON.stringify(lives)); }

// Un live publié localement a authorId "me" ; rechargé depuis Supabase il a MY_UID.
function isMyLive(l) {
  return !!l && (l.authorId === "me" || (typeof MY_UID !== "undefined" && MY_UID && l.authorId === MY_UID));
}

// Récupérer les lives actifs (global, pour tous)
function getActiveCdvLives() {
  return getCdvLives().filter(l => l.status === "live" && l.visibility !== "private"
    && !(typeof isBlocked === "function" && isBlocked(l.authorId)));
}

// Récupérer les lives des people qu'on suit
function getFollowingCdvLives() {
  const allLives = getCdvLives();
  const myFollowing = state.following || [];
  return allLives.filter(l => l.status === "live" && myFollowing.includes(l.authorId));
}

// Incrémenter le compteur de spectateurs
function addCdvLiveViewer(liveId) {
  const lives = getCdvLives();
  const live = lives.find(l => l.id === liveId);
  if (!live) return;
  if (!live.currentViewers) live.currentViewers = 0;
  if (!live.viewers) live.viewers = [];

  const userId = state.user?.id || "me";
  if (!live.viewers.includes(userId)) {
    live.viewers.push(userId);
    live.currentViewers = live.viewers.length;
  }
  saveCdvLives(lives);
}

// Retirer un spectateur
function removeCdvLiveViewer(liveId) {
  const lives = getCdvLives();
  const live = lives.find(l => l.id === liveId);
  if (!live) return;

  const userId = state.user?.id || "me";
  live.viewers = (live.viewers || []).filter(v => v !== userId);
  live.currentViewers = live.viewers.length;
  saveCdvLives(lives);
}

// Auto-refresh du CDV Live toutes les 5 secondes (tant que la modal est ouverte)
let cdvLiveRefreshInterval = null;
function startCdvLiveRefresh(liveId) {
  if (cdvLiveRefreshInterval) clearInterval(cdvLiveRefreshInterval);
  cdvLiveRefreshInterval = setInterval(() => {
    const modal = document.querySelector(".modal");
    if (!modal || !modal.classList.contains("modal-fullscreen") || modal.getAttribute("data-live-id") !== liveId) {
      clearInterval(cdvLiveRefreshInterval);
      cdvLiveRefreshInterval = null;
      return;
    }
    // Ne pas rafraîchir pendant la saisie d'un commentaire (sinon on efface le texte).
    const ci = document.getElementById("cdvLiveComment");
    if (ci && document.activeElement === ci && ci.value) return;

    // Recharger ce live depuis Supabase (étapes/commentaires/réactions/suivis cross-compte).
    if (typeof supaLoadCdvLive === "function") {
      supaLoadCdvLive(liveId).then(fresh => {
        if (!fresh) return;
        const lives = getCdvLives();
        const idx = lives.findIndex(l => l.id === liveId);
        const prev = idx >= 0 ? lives[idx] : null;
        if (idx >= 0) lives[idx] = fresh; else lives.unshift(fresh);
        saveCdvLives(lives);
        const stillOpen = document.querySelector(".modal.modal-fullscreen[data-live-id='" + liveId + "']");
        if (!stillOpen) return;
        // Rebuild COMPLET seulement si la structure change (nouvelle étape / statut)
        // — rare. Sinon on PATCHE en place (compteurs, réactions, et bloc commentaires
        // uniquement s'ils ont changé) pour NE PAS détruire le scroll, les réponses
        // ouvertes et les photos d'étapes à chaque tick de 5s. C'était la cause du
        // "ça bug / ça lag" sur les commentaires CDV.
        const structuralChange = !prev
          || (prev.steps || []).length !== (fresh.steps || []).length
          || prev.status !== fresh.status;
        if (structuralChange) { openCdvLiveViewer(liveId); return; }
        const commentsChanged = (prev.comments || []).length !== (fresh.comments || []).length;
        // Ne pas écraser le bloc commentaires si l'utilisateur a déplié des réponses
        // ou est en train d'interagir : on ne le re-rend QUE si un commentaire est
        // réellement apparu/disparu.
        if (typeof _patchCdvLiveViewer === "function") _patchCdvLiveViewer(fresh, commentsChanged);
      }).catch(() => {});
    } else {
      const lives = getCdvLives();
      if (lives.find(l => l.id === liveId)) openCdvLiveViewer(liveId);
    }
  }, 5000);
}

function startCdvLive() {
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">📡 Démarrer un CDV Live</div>
    <p class="section-subtitle" style="margin-top:-4px;">Tes abonnés te suivent en direct.</p>

    <label class="field"><span>🌍 Destination</span>
      <input type="text" class="input" id="cdvLiveDest" placeholder="Ex : Lisbonne, Road trip Écosse…" maxlength="60"/>
    </label>

    <label class="field"><span>📝 Description du voyage</span>
      <textarea class="textarea" id="cdvLiveDesc" placeholder="De quoi parle ce voyage ? Quel est le plan ?" maxlength="300" style="min-height:60px;"></textarea>
    </label>

    <label class="field"><span>📅 Durée prévue</span>
      <div style="display:flex;gap:8px;">
        <button class="pill cdv-dur-btn" onclick="selectCdvDuration(this,'1j')">1 jour</button>
        <button class="pill cdv-dur-btn" onclick="selectCdvDuration(this,'weekend')">Weekend</button>
        <button class="pill cdv-dur-btn active" onclick="selectCdvDuration(this,'semaine')">1 semaine</button>
        <button class="pill cdv-dur-btn" onclick="selectCdvDuration(this,'long')">+ long</button>
      </div>
    </label>

    <label class="field"><span>🔒 Visibilité</span>
      <div style="display:flex;gap:8px;">
        <button class="pill cdv-vis-btn active" onclick="selectCdvVisibility(this,'public')">🌍 Public</button>
        <button class="pill cdv-vis-btn" onclick="selectCdvVisibility(this,'followers')">👥 Abonnés</button>
        <button class="pill cdv-vis-btn" onclick="selectCdvVisibility(this,'private')">🔒 Privé</button>
      </div>
    </label>

    <div style="display:flex;gap:8px;margin-top:14px;">
      <button class="btn ghost" onclick="closeModal()">Annuler</button>
      <button class="btn primary" style="flex:1;background:linear-gradient(135deg,#ef4444,#f59e0b);" onclick="createCdvLive()">🔴 Lancer le Live</button>
    </div>
  `);
}

var _cdvDuration = "semaine";
var _cdvVisibility = "public";
function selectCdvDuration(btn, val) { _cdvDuration = val; document.querySelectorAll(".cdv-dur-btn").forEach(function(b){b.classList.remove("active");}); btn.classList.add("active"); }
function selectCdvVisibility(btn, val) { _cdvVisibility = val; document.querySelectorAll(".cdv-vis-btn").forEach(function(b){b.classList.remove("active");}); btn.classList.add("active"); }

function createCdvLive() {
  const dest = document.getElementById("cdvLiveDest")?.value.trim();
  if (!dest) { toast("Indique une destination"); return; }
  const desc = document.getElementById("cdvLiveDesc")?.value.trim() || "";
  const live = {
    id: "live_" + uid(),
    authorId: "me",
    destination: dest,
    description: desc,
    duration: _cdvDuration,
    visibility: _cdvVisibility,
    status: "live",
    steps: [],
    followers: Math.floor(Math.random()*10+1),
    reactions: [],
    comments: [],
    createdAt: Date.now(),
  };
  const lives = getCdvLives();
  lives.unshift(live);
  saveCdvLives(lives);
  if (typeof supaPublishCdvLive === "function") supaPublishCdvLive(live);
  closeModal();
  toast("📡 CDV Live démarré !");
  renderCdvLives();
  setTimeout(() => addCdvLiveStep(live.id), 300);
}

function addCdvLiveStep(liveId) {
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">📍 Ajouter une étape live</div>

    <label class="field"><span>📍 Où es-tu ?</span>
      <input type="text" class="input" id="liveStepCity" placeholder="Ville, lieu, spot…" maxlength="60"/>
    </label>

    <label class="field"><span>🎭 Type d'étape</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="pill step-type-btn active" onclick="selectStepType(this,'📍')">📍 Lieu</button>
        <button class="pill step-type-btn" onclick="selectStepType(this,'🍽')">🍽 Restaurant</button>
        <button class="pill step-type-btn" onclick="selectStepType(this,'🏨')">🏨 Hébergement</button>
        <button class="pill step-type-btn" onclick="selectStepType(this,'🎯')">🎯 Activité</button>
        <button class="pill step-type-btn" onclick="selectStepType(this,'🚗')">🚗 Transport</button>
        <button class="pill step-type-btn" onclick="selectStepType(this,'💡')">💡 Conseil</button>
        <button class="pill step-type-btn" onclick="selectStepType(this,'⚠️')">⚠️ Alerte</button>
      </div>
    </label>

    <label class="field"><span>✍️ Raconte ce moment</span>
      <textarea class="textarea" id="liveStepContent" placeholder="Ce que tu vois, ressens, fais… tes conseils pour ceux qui viendront après toi" maxlength="500" style="min-height:80px;"></textarea>
    </label>

    <label class="field"><span>⭐ Note ce lieu (optionnel)</span>
      <div style="display:flex;gap:4px;" id="liveStepRating">
        <span class="rating-star" onclick="setStepRating(1)" style="font-size:24px;cursor:pointer;">☆</span>
        <span class="rating-star" onclick="setStepRating(2)" style="font-size:24px;cursor:pointer;">☆</span>
        <span class="rating-star" onclick="setStepRating(3)" style="font-size:24px;cursor:pointer;">☆</span>
        <span class="rating-star" onclick="setStepRating(4)" style="font-size:24px;cursor:pointer;">☆</span>
        <span class="rating-star" onclick="setStepRating(5)" style="font-size:24px;cursor:pointer;">☆</span>
      </div>
    </label>

    <label class="field"><span>💰 Budget (optionnel)</span>
      <div style="display:flex;gap:6px;">
        <button class="pill budget-btn" onclick="selectBudget(this,'free')">Gratuit</button>
        <button class="pill budget-btn" onclick="selectBudget(this,'€')">€</button>
        <button class="pill budget-btn" onclick="selectBudget(this,'€€')">€€</button>
        <button class="pill budget-btn" onclick="selectBudget(this,'€€€')">€€€</button>
      </div>
    </label>

    <label class="field"><span>📷 Photos (optionnel)</span>
      <div id="liveStepPhotoPreview" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;"></div>
      <div class="upload-zone" onclick="document.getElementById('liveStepPhotoInput').click()" style="padding:12px;">
        <div class="upload-zone-icon" style="font-size:18px;">📷</div>
        <div class="upload-zone-title" style="font-size:12px;">Ajouter des photos</div>
      </div>
      <input type="file" id="liveStepPhotoInput" accept="image/*" multiple style="display:none;" onchange="previewLiveStepPhotos(event)"/>
    </label>

    <div style="display:flex;gap:8px;margin-top:14px;">
      <button class="btn ghost" onclick="closeModal()">Plus tard</button>
      <button class="btn primary" style="flex:1;" onclick="saveCdvLiveStep('${liveId}')">📡 Publier l'étape</button>
    </div>
  `);
}

var _stepEmoji = "📍";
var _stepRating = 0;
var _stepBudget = "";
function selectStepType(btn, emoji) { _stepEmoji = emoji; document.querySelectorAll(".step-type-btn").forEach(function(b){b.classList.remove("active");}); btn.classList.add("active"); }
function selectBudget(btn, val) { _stepBudget = val; document.querySelectorAll(".budget-btn").forEach(function(b){b.classList.remove("active");}); btn.classList.add("active"); }
function setStepRating(n) {
  _stepRating = n;
  document.querySelectorAll(".rating-star").forEach(function(s, i) { s.textContent = i < n ? "★" : "☆"; s.style.color = i < n ? "#f59e0b" : "var(--muted)"; });
}

let _liveStepPhotos = [];
function previewLiveStepPhotos(event) {
  var files = event.target.files;
  if (!files || !files.length) return;
  Array.from(files).forEach(function(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      _liveStepPhotos.push(e.target.result);
      var prev = document.getElementById("liveStepPhotoPreview");
      if (prev) {
        prev.innerHTML = _liveStepPhotos.map(function(p, i) {
          return '<div style="position:relative;display:inline-block;"><img loading="lazy" decoding="async" src="' + p + '" style="width:70px;height:70px;border-radius:10px;object-fit:cover;"/><span onclick="_liveStepPhotos.splice(' + i + ',1);previewLiveStepPhotosRefresh();" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:#ef4444;color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;">×</span></div>';
        }).join("");
      }
    };
    reader.readAsDataURL(file);
  });
}
function previewLiveStepPhotosRefresh() {
  var prev = document.getElementById("liveStepPhotoPreview");
  if (prev) {
    prev.innerHTML = _liveStepPhotos.map(function(p, i) {
      return '<div style="position:relative;display:inline-block;"><img loading="lazy" decoding="async" src="' + p + '" style="width:70px;height:70px;border-radius:10px;object-fit:cover;"/><span onclick="_liveStepPhotos.splice(' + i + ',1);previewLiveStepPhotosRefresh();" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:#ef4444;color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;">×</span></div>';
    }).join("");
  }
}

function saveCdvLiveStep(liveId) {
  const city = document.getElementById("liveStepCity")?.value.trim();
  const content = document.getElementById("liveStepContent")?.value.trim();
  if (!city && !content) { toast("Ajoute au moins un lieu ou un texte"); return; }

  const step = {
    id: "ls_" + uid(),
    city: city || "Quelque part",
    emoji: _stepEmoji || "📍",
    content: content || "",
    photos: _liveStepPhotos.length ? [..._liveStepPhotos] : [],
    photo: _liveStepPhotos[0] || null,
    rating: _stepRating || 0,
    budget: _stepBudget || "",
    createdAt: Date.now(),
  };
  _liveStepPhotos = [];
  _stepEmoji = "📍";
  _stepRating = 0;
  _stepBudget = "";

  const lives = getCdvLives();
  const live = lives.find(l => l.id === liveId);
  if (!live) return;
  live.steps.push(step);
  saveCdvLives(lives);
  if (typeof supaAddCdvLiveStep === "function") supaAddCdvLiveStep(liveId, step);
  closeModal();
  toast("📍 Étape publiée en direct !");
  renderCdvLives();
}

function endCdvLive(liveId) {
  const lives = getCdvLives();
  const live = lives.find(l => l.id === liveId);
  if (!live) return;
  live.status = "ended";
  saveCdvLives(lives);
  if (typeof supaUpdateCdvLiveStatus === "function") supaUpdateCdvLiveStatus(liveId, "ended");
  toast("✅ CDV Live terminé — il apparaît maintenant comme un carnet complet");
  renderCdvLives();
  renderCdvScreen();
}

// Convertit un Live (de préférence terminé) en brouillon de carnet éditable
// dans le Studio : destination + étapes (lieu/texte/photo) pré-remplies.
function convertLiveToCarnet(liveId) {
  const live = getCdvLives().find(l => l.id === liveId);
  if (!live) return;
  closeModal();
  goTo("studio");
  setTimeout(() => {
    activateStudioVlog();
    setTimeout(() => {
      if ($("#vlogDestination")) $("#vlogDestination").value = live.destination || "";
      vlogState.cover = null;
      if ($("#vlogCoverPreview")) $("#vlogCoverPreview").innerHTML = "";
      vlogState.steps = (live.steps || []).map(s => ({
        id: uid(),
        place: s.city || "",
        text: s.content || "",
        tip: "",
        photo: s.photo || (s.photos && s.photos[0]) || null,
      }));
      if (typeof renderVlogSteps === "function") renderVlogSteps();
      toast("📔 Live converti en brouillon de carnet — complète-le puis publie");
    }, 250);
  }, 200);
}

// Construit le bloc commentaires d'un live (barre de tri + likes), re-rendable
// seul (#cdvCommentsBox) sans ré-ouvrir toute la modale.
function _cdvCommentsBoxHtml(live) {
  if (!live) return "";
  var comments = (live.comments || []);
  // Normalise EN PLACE (id stable + forme « post ») pour que le renderer unifié
  // et ses handlers (like/répondre/emoji/GIF/⋯) retrouvent le bon commentaire.
  comments.forEach(function(c) {
    if (!c.id) c.id = "lc_" + (c.at || Date.now()) + "_" + Math.random().toString(36).slice(2, 7);
    if (typeof _normalizeThreadComment === "function") _normalizeThreadComment(c);
    else { if (!c.authorName && c.author) c.authorName = c.author; if (c.createdAt == null && c.at != null) c.createdAt = c.at; }
  });
  if (!comments.length) return '<div style="font-size:11px;color:var(--muted);padding:8px;">Aucun commentaire — lance la conversation !</div>';
  var mode = window._cdvCommentSort || "recent";
  var bar = comments.length > 1 ? commentSortBarHtml(mode, "setCdvCommentSort") : "";
  return bar + _renderCommentsList(sortComments(comments, mode), live.id);
}
// Barre de réactions (❤️🔥😍 + partage) du viewer de live — extraite pour pouvoir
// la patcher en place lors du refresh 5s sans reconstruire tout le viewer.
function _cdvReactBarHtml(liveId, live) {
  var cnt = function(e){ return (live.reactions || []).filter(function(r){ return r === e; }).length || ""; };
  return '<button class="btn ghost" onclick="reactCdvLive(\'' + liveId + '\',\'❤️\')" style="flex:1;font-size:13px;padding:8px;">❤️ ' + cnt("❤️") + '</button>'
    + '<button class="btn ghost" onclick="reactCdvLive(\'' + liveId + '\',\'🔥\')" style="flex:1;font-size:13px;padding:8px;">🔥 ' + cnt("🔥") + '</button>'
    + '<button class="btn ghost" onclick="reactCdvLive(\'' + liveId + '\',\'😍\')" style="flex:1;font-size:13px;padding:8px;">😍 ' + cnt("😍") + '</button>'
    + '<button class="btn ghost" onclick="shareCdvLive(\'' + liveId + '\')" style="flex:1;font-size:13px;padding:8px;" title="Partager ce live">' + shareIconSvg(16) + '</button>';
}
// Patch LÉGER du viewer de live ouvert (compteur de suivis, réactions, et bloc
// commentaires si demandé) — SANS reconstruire les étapes/photos ni perdre le
// scroll / les réponses ouvertes. Utilisé par le refresh 5s quand seuls les
// commentaires/réactions/suivis ont changé (pas les étapes ni le statut).
function _patchCdvLiveViewer(live, patchComments) {
  if (!live) return;
  var vc = document.getElementById("cdvViewerCount");
  if (vc) vc.textContent = "👁 " + ((live.followers || live.viewers || []).length) + " suivent";
  var rb = document.getElementById("cdvReactBar");
  if (rb) rb.innerHTML = _cdvReactBarHtml(live.id, live);
  if (patchComments) {
    var box = document.getElementById("cdvCommentsBox");
    if (box) box.innerHTML = _cdvCommentsBoxHtml(live);
  }
}
function setCdvCommentSort(mode) {
  window._cdvCommentSort = mode;
  var modalEl = document.querySelector(".modal[data-live-id]");
  var liveId = modalEl && modalEl.getAttribute("data-live-id");
  var box = document.getElementById("cdvCommentsBox");
  if (!liveId || !box) return;
  var live = getCdvLives().find(function(l){ return l.id === liveId; });
  if (live) box.innerHTML = _cdvCommentsBoxHtml(live);
}

function openCdvLiveViewer(liveId) {
  const lives = getCdvLives();
  const live = lives.find(l => l.id === liveId);
  if (!live) return;

  const isMine = isMyLive(live);
  const isLive = live.status === "live";

  // Ajouter le spectateur actuel au compteur
  if (isLive && !isMine) {
    addCdvLiveViewer(liveId);
  }

  // Nombre réel de personnes qui suivent (plus de valeur fictive aléatoire).
  var viewerCount = (live.followers || live.viewers || []).length;

  let stepsHTML = live.steps.map(function(s) {
    var photosHTML = "";
    if (s.photos && s.photos.length > 1) {
      photosHTML = '<div style="display:flex;gap:4px;overflow-x:auto;margin-top:6px;scrollbar-width:none;">' + s.photos.map(function(p) { return '<img loading="lazy" decoding="async" src="' + p + '" style="height:120px;border-radius:8px;object-fit:cover;flex-shrink:0;"/>'; }).join("") + '</div>';
    } else if (s.photo) {
      photosHTML = '<img loading="lazy" decoding="async" src="' + s.photo + '" style="width:100%;border-radius:10px;margin-top:6px;max-height:200px;object-fit:cover;"/>';
    }
    var ratingHTML = s.rating ? '<span style="font-size:12px;color:#f59e0b;margin-left:8px;">' + "★".repeat(s.rating) + "☆".repeat(5-s.rating) + '</span>' : "";
    var budgetHTML = s.budget ? '<span style="font-size:10px;background:var(--bg-deep);border-radius:6px;padding:2px 6px;margin-left:6px;">' + s.budget + '</span>' : "";
    return '<div style="display:flex;gap:10px;padding:12px 0;border-bottom:1px solid var(--border);">\
      <div style="font-size:24px;flex-shrink:0;">' + s.emoji + '</div>\
      <div style="flex:1;min-width:0;">\
        <div style="display:flex;align-items:center;flex-wrap:wrap;">\
          <span style="font-weight:700;font-size:13px;color:var(--text);">' + escapeHtml(s.city) + '</span>' + ratingHTML + budgetHTML + '\
        </div>\
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">' + fmtTime(s.createdAt) + '</div>\
        ' + (s.content ? '<div style="font-size:12px;color:var(--text-dim);line-height:1.5;">' + escapeHtml(s.content) + '</div>' : "") + '\
        ' + photosHTML + '\
      </div>\
    </div>';
  }).join("");

  if (!live.steps.length) stepsHTML = '<div style="text-align:center;padding:30px;color:var(--muted);"><div style="font-size:32px;margin-bottom:8px;">🧳</div>L\'aventure commence bientôt…</div>';

  var commentsHTML = _cdvCommentsBoxHtml(live);

  const html = '\
    <span class="modal-close" onclick="closeModal()">×</span>\
    \
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">\
      ' + (isLive ? '<span class="cdv-live-badge">🔴 EN DIRECT</span>' : '<span style="font-size:10px;font-weight:700;color:var(--muted);background:var(--bg-deep);padding:3px 8px;border-radius:6px;">✅ TERMINÉ</span>') + '\
      <div style="font-weight:800;font-size:18px;color:var(--text);">📡 ' + escapeHtml(live.destination) + '</div>\
    </div>\
    ' + (live.description ? '<div style="font-size:12px;color:var(--text-dim);margin-bottom:8px;">' + escapeHtml(live.description) + '</div>' : '') + '\
    \
    <div style="display:flex;gap:12px;margin-bottom:14px;font-size:11px;color:var(--muted);">\
      <span>📍 ' + live.steps.length + ' étape' + (live.steps.length>1?"s":"") + '</span>\
      <span id="cdvViewerCount">👁 ' + viewerCount + ' suivent</span>\
      <span>🕐 ' + fmtTime(live.createdAt) + '</span>\
      ' + (live.duration ? '<span>📅 ' + live.duration + '</span>' : '') + '\
    </div>\
    \
    <div id="cdvReactBar" style="display:flex;gap:6px;margin-bottom:14px;">' + _cdvReactBarHtml(liveId, live) + '</div>\
    \
    <div style="font-weight:800;font-size:13px;color:var(--text);margin-bottom:8px;">📍 Étapes</div>\
    ' + stepsHTML + '\
    \
    <div style="font-weight:800;font-size:13px;color:var(--text);margin:14px 0 8px;">💬 Commentaires</div>\
    <div id="cdvCommentsBox">' + commentsHTML + '</div>\
    <div style="display:flex;gap:6px;margin-top:8px;align-items:center;">\
      <input type="text" class="input" id="cdvLiveComment" placeholder="Écris un commentaire…" style="flex:1;font-size:12px;padding:8px 12px;" onkeypress="if(event.key===\'Enter\')addCdvLiveComment(\'' + liveId + '\')"/>\
      ' + _cmtComposerToolsHtml("cdvLiveComment", "addCdvLiveComment", liveId) + '\
      <button class="btn primary" onclick="addCdvLiveComment(\'' + liveId + '\')" style="font-size:12px;padding:8px 12px;">Envoyer</button>\
    </div>\
    \
    ' + (isMine && isLive ? '\
      <div style="display:flex;gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid var(--border);">\
        <button class="btn primary" style="flex:1;" onclick="closeModal();addCdvLiveStep(\'' + liveId + '\')">📍 Ajouter une étape</button>\
        <button class="btn ghost" style="border-color:rgba(239,68,68,0.4);color:#ef4444;" onclick="closeModal();endCdvLive(\'' + liveId + '\')">Terminer</button>\
      </div>' : (!isMine ? '\
      <div style="margin-top:14px;">\
        <button class="btn primary block" onclick="toggleFollowCdvLive(\'' + liveId + '\',this)" style="background:linear-gradient(135deg,#ef4444,#f59e0b);">📡 Suivre ce voyage</button>\
        <button onclick="reportCdvLive(\'' + liveId + '\')" style="display:block;margin:10px auto 0;background:none;border:none;color:var(--muted);font-size:11px;cursor:pointer;">⚠️ Signaler ce live</button>\
      </div>' : (isMine && !isLive ? '\
      <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border);">\
        <button class="btn primary block" onclick="convertLiveToCarnet(\'' + liveId + '\')">📔 Convertir en carnet de voyage</button>\
      </div>' : ''))) + '\
  ';
  openModal(html);
  var modalEl = document.querySelector(".modal");
  if (modalEl) {
    modalEl.classList.add("modal-fullscreen");
    modalEl.setAttribute("data-live-id", liveId);
    // Lancer le refresh en temps réel si c'est un live
    if (isLive) {
      startCdvLiveRefresh(liveId);
    }
  }
  // Interactions cross-compte des commentaires (likes + réponses + emojis) via
  // comment_interactions : hydrate puis re-render le bloc seul.
  if (typeof hydrateCommentInteractions === "function" && (live.comments || []).length) {
    // S'assure que chaque commentaire a un id stable avant l'hydratation.
    (live.comments || []).forEach(function(c){ if (!c.id) c.id = "lc_" + (c.at || Date.now()) + "_" + Math.random().toString(36).slice(2, 7); });
    hydrateCommentInteractions({ comments: live.comments }).then(function(){
      var box = document.getElementById("cdvCommentsBox");
      if (box && document.querySelector('.modal[data-live-id="' + liveId + '"]')) box.innerHTML = _cdvCommentsBoxHtml(live);
    });
  }
}

function toggleFollowCdvLive(liveId, btn) {
  const lives = getCdvLives();
  const live = lives.find(l => l.id === liveId);
  if (!live) return;

  if (!Array.isArray(live.followers)) live.followers = [];
  const userId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : (state.user?.id || "me");
  const isFollowing = live.followers.includes(userId);

  if (isFollowing) {
    live.followers = live.followers.filter(f => f !== userId);
    if (typeof supaUnfollowCdvLive === "function") supaUnfollowCdvLive(liveId);
    toast("✖️ Tu ne suis plus ce voyage");
  } else {
    live.followers.push(userId);
    if (typeof supaFollowCdvLive === "function") supaFollowCdvLive(liveId);
    toast("📡 Tu suis ce voyage en direct !");
  }
  live.currentViewers = live.followers.length;
  saveCdvLives(lives);
  openCdvLiveViewer(liveId);
}

// Partage d'un Live CDV : Web Share API si dispo, sinon copie du lien (réel,
// plus de faux toast). Le lien #cdv-live-<id> est repris au boot par le routage.
function shareCdvLive(liveId) {
  var lives = getCdvLives();
  var live = lives.find(function(l) { return l.id === liveId; });
  if (!live) return;
  var url = location.origin + location.pathname + "#cdv-live-" + liveId;
  var title = "📡 " + (live.destination || "Carnet de voyage en direct") + " sur PASSIO";
  var text = (live.destination ? live.destination + " · " : "") + (live.steps ? live.steps.length : 0) + " étape" + ((live.steps && live.steps.length > 1) ? "s" : "");
  if (navigator.share) {
    navigator.share({ title: title, text: text, url: url }).catch(function() {});
    return;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(
      function() { toast("🔗 Lien du live copié"); },
      function() { toast("🔗 " + url); }
    );
  } else {
    toast("🔗 " + url);
  }
}

// Signalement d'un Live (modération) — réutilise supaReport (table reports).
function reportCdvLive(liveId) {
  if (!liveId) return;
  if (typeof supaReport === "function") supaReport("cdv_live", liveId, "");
  toast("🚩 Live signalé. Merci, on s'en occupe.");
}

function reactCdvLive(liveId, emoji) {
  var lives = getCdvLives();
  var live = lives.find(function(l) { return l.id === liveId; });
  if (!live) return;
  if (!live.reactions) live.reactions = [];
  live.reactions.push(emoji);
  saveCdvLives(lives);
  if (typeof supaReactCdvLive === "function") supaReactCdvLive(liveId, emoji);
  toast(emoji);
  // Patch la barre de réactions en place (compteurs) plutôt que reconstruire tout
  // le viewer (étapes/photos/commentaires) à chaque tap → plus de scroll perdu ni
  // de lag, et les réponses dépliées restent ouvertes.
  if (typeof _patchCdvLiveViewer === "function") _patchCdvLiveViewer(live, false);
  else openCdvLiveViewer(liveId);
}

// Like ❤️ d'une CARTE live en TOGGLE STRICT (1 par compte, comme les événements).
// Ne rouvre PAS le viewer ; patch le compteur en place. Cache window._liveLikes +
// état optimiste state.user.likedLives ; sync cdv_live_reactions (emoji '❤️').
function likeCdvLiveCard(liveId, el) {
  state.user.likedLives = state.user.likedLives || [];
  window._liveLikes = window._liveLikes || {};
  var cur = window._liveLikes[liveId] || { likes: 0, liked: false };
  var liked = state.user.likedLives.indexOf(liveId) > -1;
  if (liked) {
    state.user.likedLives = state.user.likedLives.filter(function(x){ return x !== liveId; });
    cur.likes = Math.max(0, (cur.likes || 1) - 1); cur.liked = false;
  } else {
    state.user.likedLives.push(liveId);
    cur.likes = (cur.likes || 0) + 1; cur.liked = true;
  }
  window._liveLikes[liveId] = cur;
  if (typeof saveState === "function") saveState();
  if (el) { el.classList.toggle("liked", cur.liked); el.innerHTML = (cur.liked ? "❤️" : "🤍") + " " + (cur.likes || 0); }
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID && window._supaReal && typeof supaToggleCdvLiveLike === "function") {
    supaToggleCdvLiveLike(liveId);
    if (cur.liked) {
      var lv = getCdvLives().find(function(l){ return l.id === liveId; });
      if (lv && lv.authorId && lv.authorId !== MY_UID && typeof supaInsertNotif === "function") {
        supaInsertNotif(lv.authorId, "like", liveId, "a aimé ton live");
      }
    }
  }
}

// 😊 Réagir depuis une CARTE live : popover d'emojis → reactions (sans rouvrir le viewer).
// Le ❤️ du popover route vers le toggle de like (cohérent avec le bouton ❤️).
function reactCdvLivePicker(liveId, event) {
  // Panneau segmenté unifié, emoji uniquement (les lives ne stockent que des emojis).
  var _picker = (typeof emojiReactPanel === "function") ? emojiReactPanel : _emojiReactPopover;
  return _picker(event, function(emoji){
    if (emoji === "❤️") {
      var el = document.querySelector('[data-livelike="' + liveId + '"]');
      if ((state.user.likedLives || []).indexOf(liveId) < 0) likeCdvLiveCard(liveId, el);
      return;
    }
    var lives = getCdvLives();
    var live = lives.find(function(l) { return l.id === liveId; });
    if (!live) return;
    if (!live.reactions) live.reactions = [];
    live.reactions.push(emoji);
    saveCdvLives(lives);
    if (typeof supaReactCdvLive === "function") supaReactCdvLive(liveId, emoji);
    // Met à jour EN PLACE la pastille « 😍 N » de la/les carte(s) de ce live.
    if (typeof _liveReactChipHtml === "function") {
      document.querySelectorAll('[data-livechip="' + liveId + '"]').forEach(function(h){ h.innerHTML = _liveReactChipHtml(liveId); });
    }
    if (typeof toast === "function") toast(emoji);
  });
}

// Span ❤️ de like d'une carte live (toggle), lu depuis le cache _liveLikes +
// l'état optimiste state.user.likedLives. Mutualisé entre cartes en cours/terminées.
function _liveLikeSpanHtml(l) {
  var c = (window._liveLikes && window._liveLikes[l.id]) || { likes: 0, liked: false };
  var liked = (state.user.likedLives || []).indexOf(l.id) > -1 || c.liked;
  return '<span class="post-action ' + (liked ? "liked" : "") + '" data-livelike="' + l.id
    + '" onclick="event.stopPropagation();likeCdvLiveCard(\'' + l.id + '\', this)">'
    + (liked ? "❤️" : "🤍") + " " + (c.likes || 0) + '</span>';
}

// Charge en une requête les likes ❤️ (par utilisateur distinct) des lives visibles
// puis met à jour les pastilles ❤️ en place (cache window._liveLikes).
async function _loadCdvLiveLikes(ids) {
  window._liveLikes = window._liveLikes || {};
  if (!ids || !ids.length) return;
  if (typeof supaLoadCdvLiveLikes !== "function" || !window._supaReal) return;
  try {
    var data = await supaLoadCdvLiveLikes(ids);
    if (!data) return;
    Object.keys(data).forEach(function(id){
      var d = data[id];
      if ((state.user.likedLives || []).indexOf(id) > -1) d.liked = true;
      window._liveLikes[id] = d;
      var lk = document.querySelector('[data-livelike="' + id + '"]');
      if (lk) { lk.classList.toggle("liked", d.liked); lk.innerHTML = (d.liked ? "❤️" : "🤍") + " " + (d.likes || 0); }
    });
  } catch (e) {}
}

function addCdvLiveComment(liveId) {
  var inp = document.getElementById("cdvLiveComment") || document.getElementById("cmtThreadInput");
  if (!inp) return;
  var text = inp.value.trim();
  if (!text) return;
  var lives = getCdvLives();
  var live = lives.find(function(l) { return l.id === liveId; });
  if (!live) return;
  if (!live.comments) live.comments = [];
  var _author = (state.user.general && state.user.general.username) || state.user.name || "Moi";
  var _myId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  var _c = { id: "lc_local_" + Date.now(), authorId: _myId, author: _author, authorName: _author, text: text, at: Date.now(), createdAt: Date.now(), replies: [], likes: 0, likedBy: [] };
  live.comments.push(_c);
  saveCdvLives(lives);
  if (typeof supaAddCdvLiveComment === "function") supaAddCdvLiveComment(liveId, text);
  // Notifie l'auteur du live (interaction cross-compte sur SON carnet).
  if (live.authorId && live.authorId !== _myId && live.authorId !== "me" && typeof supaInsertNotif === "function") {
    try { supaInsertNotif(live.authorId, "comment", liveId, "a commenté ton live"); } catch (e) {}
  }
  // Re-render le bloc commentaires seul (évite de ré-ouvrir toute la modale et de
  // perdre la position de défilement).
  if (inp) inp.value = "";
  var box = document.getElementById("cdvCommentsBox");
  if (box) box.innerHTML = _cdvCommentsBoxHtml(live);
  else if (typeof _refreshCommentThreadUI === "function" && document.getElementById("cmtThreadList")) _refreshCommentThreadUI(liveId);
  else if (document.querySelector(".modal[data-live-id]")) openCdvLiveViewer(liveId);
}

// renderCdvLives() n'est plus utilisée - les lives s'affichent uniquement dans cdvList via renderCdvScreen()
// Cette fonction est conservée vide pour compatibilité
function renderCdvLives() {
  const el = document.getElementById("cdvLiveList");
  if (el) el.innerHTML = "";
}

function setStudioToVlog() {
  goTo("studio");
  setTimeout(() => {
    activateStudioVlog();
  }, 200);
}

// Filtre actif sur l'écran CDV - multi-select (saved / mine / live)
let cdvFilters = new Set(); // Vide par défaut = affiche TOUS les carnets

function renderCdvScreen() {
  const list = document.getElementById("cdvList");
  if (!list) return;

  // Vider cdvLiveList (ne pas afficher les lives en haut)
  const liveListEl = document.getElementById("cdvLiveList");
  if (liveListEl) liveListEl.innerHTML = "";

  // Sync filter pills (multi-select)
  document.querySelectorAll("#cdvFilterRow .pill").forEach(p => {
    const filterType = p.getAttribute("data-cdvfilter");
    p.classList.toggle("active", cdvFilters && cdvFilters.has(filterType));
  });

  // Filtre multi-select: affiche seulement si "live" est l'UNIQUE filtre actif
  const showLiveOnly = cdvFilters && cdvFilters.size === 1 && cdvFilters.has("live");
  if (showLiveOnly) {
    // Affiche les lives en cours ET les lives terminés
    const lives = getCdvLives().filter(l =>
      !(typeof isBlocked === "function" && isBlocked(l.authorId)) &&
      (isMyLive(l) || (state.following || []).includes(l.authorId) || l.visibility === "public"));
    if (!lives.length) {
      list.innerHTML = "";
      document.getElementById("cdvEmpty").style.display = "block";
      return;
    }
    document.getElementById("cdvEmpty").style.display = "none";

    // Dédupliquer par ID pour éviter les doublons
    const seenIds = new Set();
    const uniqueLives = lives.filter(l => {
      if (seenIds.has(l.id)) return false;
      seenIds.add(l.id);
      return true;
    });

    // Lives en cours d'abord
    const active = uniqueLives.filter(l => l.status === "live");
    const ended = uniqueLives.filter(l => l.status === "ended");

    let html = active.length ? `<div style="font-weight:700;font-size:13px;color:var(--text);margin:14px 0 8px;">✨ ${active.length} live${active.length>1?"s":""} en cours</div>` : "";
    html += active.map(l => {
      const isNew = l.createdAt && Date.now() - l.createdAt < 60000;
      const seedAuthor = userById(l.authorId);
      const authorName = isMyLive(l) ? (state.user.name || "Toi") : (seedAuthor && seedAuthor.name) || "Passionné";
      const viewerCount = (l.followers || l.viewers || []).length;
      const myId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
      const isFollowing = (l.followers || []).includes(myId);

      return `<div class="cdv-live-card" onclick="openCdvLiveViewer('${l.id}')" style="border-color:rgba(239,68,68,0.3);position:relative;">
        ${isNew ? '<div style="position:absolute;top:10px;right:10px;background:#ef4444;color:#fff;font-size:9px;font-weight:700;padding:3px 7px;border-radius:12px;">NOUVEAU</div>' : ''}
        <div class="cdv-live-header">
          <span class="cdv-live-badge">🔴 EN DIRECT</span>
          <div style="flex:1;">
            <div class="cdv-live-dest">${escapeHtml(l.destination)}</div>
            <div class="cdv-live-author">par ${escapeHtml(authorName)} · ${l.steps.length} étape${l.steps.length>1?"s":""}</div>
          </div>
        </div>
        ${l.steps.length ? `
          <div class="cdv-live-steps">
            ${l.steps.slice(-5).map(s => `
              <div class="cdv-live-step">
                <div class="cdv-live-step-emoji">${s.emoji}</div>
                <div class="cdv-live-step-city">${escapeHtml(s.city)}</div>
                <div class="cdv-live-step-time">${fmtTime(s.createdAt)}</div>
              </div>`).join("")}
          </div>` : `<div style="text-align:center;padding:10px;color:var(--muted);font-size:11px;">En attente de la première étape…</div>`}
        <div class="cdv-live-footer">
          <div class="cdv-live-count">👁 ${viewerCount} regardent</div>
          ${isMyLive(l) ? `<button class="cdv-live-follow-btn" onclick="event.stopPropagation();addCdvLiveStep('${l.id}')">+ Étape</button>` : `<button class="cdv-live-follow-btn" onclick="event.stopPropagation();toggleFollowCdvLive('${l.id}',this)" style="background:${isFollowing ? '#8b5cf6' : 'var(--border)'};color:${isFollowing ? '#fff' : 'var(--text)'};">${isFollowing ? '✓ En suivi' : '📡 Suivre'}</button>`}
        </div>
        <div class="post-actions" onclick="event.stopPropagation()">
          ${_liveLikeSpanHtml(l)}
          <span class="post-action" onclick="event.stopPropagation();openCommentSheet('${l.id}','💬 ${escapeHtml((l.destination||'').replace(/'/g,'’')).slice(0,40)}')">💬 ${commentThreadCount(l.comments)}</span>
          <span class="post-action" onclick="return reactCdvLivePicker('${l.id}', event);" title="Réagir">😊</span>
          <span class="post-action" onclick="event.stopPropagation();shareCdvLive('${l.id}')" title="Partager" aria-label="Partager">${shareIconSvg(18)}</span>
          <span class="post-react-chip-holder" data-livechip="${l.id}" style="margin-left:auto;">${_liveReactChipHtml(l.id)}</span>
        </div>
      </div>`;
    }).join("");

    if (ended.length) html += `<div style="font-weight:700;font-size:13px;color:var(--text);margin:14px 0 8px;">✅ Lives terminés</div>`;
    html += ended.map(l => `
      <div class="cdv-live-card" onclick="openCdvLiveViewer('${l.id}')" style="border-color:var(--border);">
        <div class="cdv-live-header">
          <span style="font-size:10px;font-weight:700;color:var(--muted);background:var(--bg-deep);padding:3px 8px;border-radius:6px;">✅ TERMINÉ</span>
          <div style="flex:1;">
            <div class="cdv-live-dest">${escapeHtml(l.destination)}</div>
            <div class="cdv-live-author">${l.steps.length} étape${l.steps.length>1?"s":""}</div>
          </div>
        </div>
        <div class="post-actions" onclick="event.stopPropagation()">
          ${_liveLikeSpanHtml(l)}
          <span class="post-action" onclick="event.stopPropagation();openCommentSheet('${l.id}','💬 ${escapeHtml((l.destination||'').replace(/'/g,'’')).slice(0,40)}')">💬 ${commentThreadCount(l.comments)}</span>
          <span class="post-action" onclick="return reactCdvLivePicker('${l.id}', event);" title="Réagir">😊</span>
          <span class="post-action" onclick="event.stopPropagation();shareCdvLive('${l.id}')" title="Partager" aria-label="Partager">${shareIconSvg(18)}</span>
          <span class="post-react-chip-holder" data-livechip="${l.id}" style="margin-left:auto;">${_liveReactChipHtml(l.id)}</span>
        </div>
      </div>`).join("");

    list.innerHTML = html;
    // Likes ❤️ par utilisateur distinct (chargés en lot, patch DOM sans re-render).
    _loadCdvLiveLikes(active.concat(ended).map(function(l){ return l.id; }));
    return;
  }

  const q = (($("#cdvSearchInput") && $("#cdvSearchInput").value) || "").toLowerCase().trim();
  let carnets = allCarnets();

  // Filtre multi-select: si des filtres sont sélectionnés, afficher UNIQUEMENT ceux-ci
  if (cdvFilters && cdvFilters.size > 0) {
    const saved = cdvFilters.has("saved") ? savedCarnets() : [];
    const myCarnets = cdvFilters.has("mine") ? carnets.filter(c => c._source === "me") : [];

    // Combiner les résultats de TOUS les filtres sélectionnés
    const filtered = new Set();

    if (cdvFilters.has("saved")) {
      saved.forEach(id => {
        const c = carnets.find(x => x.id === id);
        if (c) filtered.add(c);
      });
    }

    if (cdvFilters.has("mine")) {
      myCarnets.forEach(c => filtered.add(c));
    }

    carnets = Array.from(filtered);
  }

  if (q) {
    carnets = carnets.filter(c =>
      (c.destination || "").toLowerCase().includes(q) ||
      (c.text || "").toLowerCase().includes(q) ||
      (c.steps || []).some(s => (s.place || "").toLowerCase().includes(q))
    );
  }

  if (!carnets.length) {
    list.innerHTML = "";
    const empty = document.getElementById("cdvEmpty");
    if (empty) {
      let icon = "📔", title = "Aucun carnet trouvé", text = "", cta = "";
      if (q) {
        title = "Aucun résultat";
        text = "Aucun carnet ne correspond à « " + escapeHtml(q) + " ». Essaie une autre destination.";
      } else if (cdvFilters && cdvFilters.size > 0) {
        title = "Aucun carnet dans ce filtre";
        text = "Retire les filtres ou crée ton premier carnet.";
        cta = '<button class="btn primary" style="margin-top:12px;" onclick="setStudioToVlog()">📔 Créer un carnet</button>';
      } else {
        title = "Aucun carnet pour le moment";
        text = "Raconte ton prochain voyage, étape par étape.";
        cta = '<button class="btn primary" style="margin-top:12px;" onclick="setStudioToVlog()">📔 Créer un carnet</button>';
      }
      empty.innerHTML = '<div class="empty-icon">' + icon + '</div><div class="empty-title">' + title + '</div><div class="empty-text">' + text + '</div>' + cta;
      empty.style.display = "block";
    }
    return;
  }
  document.getElementById("cdvEmpty").style.display = "none";

  // Format "fil d'actualité" : chaque carnet est un post complet
  list.innerHTML = carnets.map(c => {
    const stats = vlogStats(c);
    const isMine = c._source === "me";
    const seedAuthor = userById(c.authorId);
    const authorName = isMine ? (state.user.name || "Toi") : (seedAuthor && seedAuthor.name) || "Anonyme";
    const authorEmoji = isMine ? "🌍" : (seedAuthor && seedAuthor.profileEmoji) || "🌍";
    const authorColor = isMine ? "#7c3aed" : (seedAuthor && seedAuthor.avatar) || "#7c3aed";
    const isSaved = isCarnetSaved(c.id);
    const isLiked = state.user.likedPosts && state.user.likedPosts.includes(c.id);

    const fmtRange = (a, b) => {
      const o = { day: "numeric", month: "short", year: "numeric" };
      if (a && b) return new Date(a).toLocaleDateString("fr-FR", o) + " → " + new Date(b).toLocaleDateString("fr-FR", o);
      if (a) return new Date(a).toLocaleDateString("fr-FR", o);
      return "";
    };
    const dates = fmtRange(c.dateStart, c.dateEnd);
    const since = c.createdAt ? fmtTime(c.createdAt) : "";

    return `<article class="cdv-feed-card" onclick="openVlogViewer('${c.id}')">
      <div class="cdv-feed-header">
        <div class="avatar" style="background:${authorColor};">${authorEmoji}</div>
        <div class="cdv-feed-author">
          <div class="cdv-feed-author-name">
            ${escapeHtml(authorName)}
            ${isMine ? '<span class="pill" style="padding:2px 7px;font-size:9px;border-color:rgba(139,92,246,0.5);">Moi</span>' : ""}
          </div>
          <div class="cdv-feed-author-meta">a publié un carnet de voyage · ${escapeHtml(since)}</div>
        </div>
        ${isSaved ? `<span class="cdv-feed-saved-badge">⭐ Sauvegardé</span>` : ""}
      </div>

      <div class="cdv-feed-cover-wrap">
        ${c.cover ? `<img loading="lazy" decoding="async" class="cdv-feed-cover" src="${c.cover}" alt="" onerror="this.onerror=null;this.src='https://picsum.photos/seed/cdv-${c.id}/1280/720';"/>` : ""}
        <div class="cdv-feed-cover-overlay"></div>
        <div class="cdv-feed-cover-meta">
          <span class="cdv-feed-tag">📔 CARNET DE VOYAGE</span>
          <div class="cdv-feed-dest">${escapeHtml(c.destination || "Voyage")}</div>
          ${dates ? `<div class="cdv-feed-dates">${escapeHtml(dates)}</div>` : ""}
        </div>
      </div>

      <div class="cdv-feed-body">
        <div class="cdv-feed-stats">
          <span>📍 ${stats.durée} jours</span>
          <span>•</span>
          <span>🎒 ${stats.nbDays} étapes</span>
          ${c.budget ? `<span>•</span><span>💰 ${escapeHtml(c.budget)}</span>` : ""}
          ${c.transport ? `<span>•</span><span>🚆 ${escapeHtml(c.transport)}</span>` : ""}
        </div>
        ${c.tip ? `<div class="cdv-feed-tip">
          <div class="cdv-feed-tip-label">⭐ LE CONSEIL CLÉ</div>
          ${escapeHtml(c.tip.length > 140 ? c.tip.slice(0, 140) + "…" : c.tip)}
        </div>` : ""}
      </div>

      <div class="post-actions" onclick="event.stopPropagation()">
        <span class="post-action ${isLiked ? "liked" : ""}" onclick="likePost('${c.id}')">
          ${isLiked ? "❤️" : "🤍"} ${c.likes || 0}
        </span>
        <span class="post-action" onclick="openComments('${c.id}')">💬 ${commentThreadCount(c.comments)}</span>
        <span class="post-action" onclick="return showEmojiPickerForPost('${c.id}', event);" title="Emoji & GIF">😊</span>
        <span class="post-action" onclick="event.stopPropagation();sharePost('${c.id}')" title="Partager" aria-label="Partager">${shareIconSvg(18)}</span>
        <span class="post-action" onclick="toggleCarnetSave('${c.id}');renderCdvScreen()" title="${isSaved ? "Sauvegardé" : "Sauvegarder"}">${isSaved ? "⭐" : "☆"}</span>
        <span class="post-react-chip-holder" data-postchip="${c.id}" style="margin-left:auto;">${_postReactChipHtml(c.id)}</span>
      </div>
    </article>`;
  }).join("");
}

