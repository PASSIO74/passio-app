// Lien MÉTIER entre l'émetteur d'une push et son destinataire (MSG-04, 2026-09-14).
// En .js et non .ts, comme `plafond.js` : Deno l'importe tel quel dans
// `notify-call`, et `node --test tests/unit/lien-metier.test.mjs` charge le MÊME
// fichier — le verrou mesure ce qui est déployé, pas une copie.
//
// CE QUI MANQUAIT. `notify-call` authentifiait l'appelant (jeton), bornait sa
// cadence et refusait un blocage — mais n'exigeait AUCUN lien entre lui et le
// destinataire : tout compte connecté pouvait réveiller n'importe quel membre,
// avec un texte libre (`text`) et sous un nom libre (`fromName`). Le push est
// un canal qui perce tout (écran verrouillé, appli fermée) : il doit être
// l'ÉCHO d'un fait que la base a accepté, jamais une parole en l'air.
//
// LA RÈGLE, en trois points :
//   · APPEL : l'appelant et l'appelé partagent une conversation 1:1 — c'est la
//     seule surface d'où un appel peut partir (`startCall` refuse un groupe).
//   · NOTIFICATION : une ligne `notifications` de l'émetteur vers le
//     destinataire existe, écrite dans les deux dernières minutes — donc
//     acceptée par la RLS (`from_id = auth.uid()`, `not is_blocked_with`,
//     `trg_rate_limit`) ou par un trigger serveur (`follows_notifier`). Le
//     TEXTE poussé est celui de cette ligne, jamais celui du corps de requête.
//   · IDENTITÉ : le nom et l'emoji viennent de `profiles`, jamais du corps.
// Un lien absent rend exactement la réponse d'un blocage (« aucun appareil
// abonné ») : ni l'un ni l'autre ne doit apprendre pourquoi.

const FENETRE_NOTIF_MS = 2 * 60_000;

/** Les cinq entités que `escapeHtml` (app-02) pose : le push affiche du texte brut. */
export function decoderEntites(s) {
  return String(s == null ? "" : s)
    .replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function borneTexte(v, max) {
  const s = String(v == null ? "" : v).trim();
  return s ? Array.from(s).slice(0, max).join("") : "";
}

/** Nom et emoji de l'émetteur, lus en base. Repli neutre si la ligne manque. */
export async function identiteAppelant(admin, fromUid) {
  const repli = { name: "Quelqu'un", emoji: "📞" };
  try {
    const { data, error } = await admin.from("profiles").select("username, emoji").eq("id", fromUid).maybeSingle();
    if (error || !data) return repli;
    return { name: borneTexte(data.username, 60) || repli.name, emoji: borneTexte(data.emoji, 8) || repli.emoji };
  } catch (_e) { return repli; }
}

/** Appel : les deux comptes partagent au moins une conversation 1:1. */
export async function lienAppel(admin, fromUid, toUserId) {
  try {
    const miennes = await admin.from("conv_members").select("conv_id").eq("user_id", fromUid);
    if (miennes.error) return { ok: false, raison: "lecture conv_members" };
    const ids = (miennes.data || []).map((r) => r.conv_id).filter(Boolean);
    if (!ids.length) return { ok: false, raison: "aucune conversation" };
    const siennes = await admin.from("conv_members").select("conv_id").eq("user_id", toUserId).in("conv_id", ids);
    if (siennes.error) return { ok: false, raison: "lecture conv_members" };
    const communes = (siennes.data || []).map((r) => r.conv_id).filter(Boolean);
    if (!communes.length) return { ok: false, raison: "aucune conversation commune" };
    const un_a_un = await admin.from("conversations").select("id").in("id", communes).eq("is_group", false).limit(1);
    if (un_a_un.error) return { ok: false, raison: "lecture conversations" };
    if (!(un_a_un.data || []).length) return { ok: false, raison: "aucune conversation 1:1 commune" };
    return { ok: true, raison: "" };
  } catch (_e) { return { ok: false, raison: "exception" }; }
}

/**
 * Notification : une ligne `notifications` récente de l'émetteur vers le
 * destinataire. Rend le texte et le genre de CETTE ligne — la base est la
 * source, le corps de requête n'est qu'un signal.
 */
export async function lienNotification(admin, fromUid, toUserId, maintenantMs, fenetreMs) {
  const maintenant = typeof maintenantMs === "number" ? maintenantMs : Date.now();
  const fenetre = typeof fenetreMs === "number" ? fenetreMs : FENETRE_NOTIF_MS;
  try {
    const depuis = new Date(maintenant - fenetre).toISOString();
    const r = await admin.from("notifications").select("content, kind, created_at")
      .eq("from_id", fromUid).eq("user_id", toUserId).gte("created_at", depuis)
      .order("created_at", { ascending: false }).limit(1);
    if (r.error) return { ok: false, raison: "lecture notifications" };
    const ligne = (r.data || [])[0];
    if (!ligne) return { ok: false, raison: "aucune notification récente" };
    return { ok: true, raison: "", texte: borneTexte(decoderEntites(ligne.content), 200), kind: borneTexte(ligne.kind, 32) };
  } catch (_e) { return { ok: false, raison: "exception" }; }
}
