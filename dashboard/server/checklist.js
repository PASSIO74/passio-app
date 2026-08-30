// Checklist fonctionnelle de Passio + feature flags. Persistés en JSON.
import { JsonDb } from "./jsondb.js";
import { audit } from "./audit.js";

const DEFAULT_ITEMS = [
  ["auth", "Création de compte"], ["auth", "Connexion"], ["auth", "Déconnexion"],
  ["auth", "Récupération de mot de passe"], ["profil", "Modification du profil"],
  ["profil", "Profils liés aux passions"], ["profil", "Compte privé"], ["nav", "Navigation entre écrans"],
  ["feed", "Fil d'actualité (classement pertinence)"], ["contenu", "Création de post"],
  ["contenu", "Publication de bobine"], ["contenu", "Story"], ["contenu", "Modification de contenu"],
  ["contenu", "Suppression de contenu"], ["social", "Commentaire"], ["social", "Réaction / emoji / GIF"],
  ["social", "Like"], ["social", "Partage"], ["recherche", "Recherche"], ["messagerie", "Envoi message texte"],
  ["messagerie", "Message vocal"], ["messagerie", "Pièces jointes"], ["messagerie", "Appel audio/vidéo"],
  ["notifs", "Notifications"], ["notifs", "Notifications push"], ["irl", "Créer un événement"],
  ["irl", "RSVP / rejoindre"], ["irl", "Check-in QR"], ["irl", "Carte"], ["cdv", "Nouveau voyage (live)"],
  ["cdv", "Carnet"], ["cdv", "Étapes géolocalisées"], ["cdv", "Passeport / stats"],
  ["live", "Live vidéo"], ["params", "Paramètres"], ["params", "Confidentialité"],
  ["rgpd", "Suppression de compte"],
];

const clDb = new JsonDb("checklist", {
  items: DEFAULT_ITEMS.map(([category, name], i) => ({
    id: "chk_" + i, category, name, status: "non_teste",
    tester: null, device: null, expected: "", actual: "", notes: "", bugId: null, updatedAt: null,
  })),
});

export function listChecklist() { return clDb.get().items; }
export function updateChecklistItem(id, patch, actor) {
  const d = clDb.get(); const it = d.items.find((x) => x.id === id);
  if (!it) return null;
  const allowed = ["status", "tester", "device", "expected", "actual", "notes", "bugId"];
  for (const k of allowed) if (k in patch) it[k] = patch[k];
  it.updatedAt = Date.now();
  clDb.save();
  audit("checklist_update", { id, status: it.status }, actor);
  return it;
}

// ─── Feature flags ────────────────────────────────────────────────────────────
const flagsDb = new JsonDb("flags", {
  items: [
    { id: "ff_feed_rank", key: "feed_ranking", label: "Classement du fil par pertinence", enabled: true, rollout: 100, targetUsers: [], targetDevices: [], startAt: null, endAt: null, history: [] },
    { id: "ff_live_video", key: "live_video", label: "Live vidéo (WebRTC)", enabled: true, rollout: 100, targetUsers: [], targetDevices: [], startAt: null, endAt: null, history: [] },
    { id: "ff_realtime_v3", key: "realtime_v3", label: "Realtime v3 (topic par utilisateur)", enabled: true, rollout: 100, targetUsers: [], targetDevices: [], startAt: null, endAt: null, history: [] },
  ],
});

export function listFlags() { return flagsDb.get().items; }
export function createFlag(input, actor) {
  const f = { id: "ff_" + Date.now().toString(36), key: input.key, label: input.label || input.key, enabled: !!input.enabled, rollout: Number(input.rollout ?? 0), targetUsers: input.targetUsers || [], targetDevices: input.targetDevices || [], startAt: input.startAt || null, endAt: input.endAt || null, history: [{ ts: Date.now(), actor, action: "created" }] };
  flagsDb.update((d) => d.items.push(f));
  audit("flag_create", { key: f.key }, actor);
  return f;
}
export function updateFlag(id, patch, actor) {
  const d = flagsDb.get(); const f = d.items.find((x) => x.id === id);
  if (!f) return null;
  const before = { enabled: f.enabled, rollout: f.rollout };
  // Mêmes coercitions qu'à la création : un formulaire envoie « 50 » et « on »,
  // pas 50 et true. Sans ça, `enabled` finissait par valoir la CHAÎNE "false"
  // (donc vrai) et `rollout` une chaîne, selon qu'un drapeau avait été créé ou
  // modifié — deux chemins pour un même objet, deux formes de données.
  for (const k of ["targetUsers", "targetDevices", "startAt", "endAt", "label"]) if (k in patch) f[k] = patch[k];
  if ("enabled" in patch) f.enabled = Boolean(patch.enabled) && patch.enabled !== "false";
  if ("rollout" in patch) f.rollout = Math.min(100, Math.max(0, Number(patch.rollout) || 0));
  f.history.push({ ts: Date.now(), actor, action: "updated", before, after: { enabled: f.enabled, rollout: f.rollout } });
  if (f.history.length > 50) f.history.shift();
  flagsDb.save();
  audit("flag_update", { key: f.key, enabled: f.enabled, rollout: f.rollout }, actor);
  return f;
}
