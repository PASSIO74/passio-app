// ═══════════════════════════════════════════════════════════════════════════
// VERROU STATIQUE — SRV-02 (2026-11-13) : aucune notification soumise à la
// preuve de l'événement ne part EN PARALLÈLE de son écriture.
//
// `trg_notifications_preuve` (migration du 13/11) refuse une notification
// `like`, `comment`, `event_join`, `event_comment`, `event_feedback`,
// `event_invite`, `live_video` dont le fait n'existe pas encore en base. Un
// appel direct `supaInsertNotif(…, "<genre>", …)` posé à côté de l'écriture —
// sans attendre son verdict — se ferait refuser : notification légitime perdue.
//
// Ce banc recense CHAQUE appel direct à genre littéral de ces genres dans js/,
// et exige qu'il soit l'un des sites connus, chacun avec la PREUVE écrite de
// son ordonnancement dans les lignes qui le précèdent. Un nouveau site passe par
// `notifierApresEcriture` (app-08), ou s'ajoute ici avec sa preuve.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GENRES_PROUVES = new Set(["like", "comment", "event_join", "event_comment", "event_feedback", "event_invite",
  "live_video", "reaction", "event_reminder", "cdv_live_step"]);

// fichier, genre, motif qui doit apparaître dans les 20 lignes AVANT l'appel (le verdict).
const SITES_CONNUS = [
  { fichier: "app-03-posts-vlogs.js", genre: "like", preuve: /if \(res && res\.ok\)/ },                    // j'aime de publication
  { fichier: "app-07-ia-explore-irl.js", genre: "like", preuve: /supaSetEventLike\(id, voulu\)\)\.then/ },  // PARC-01
  { fichier: "app-07-ia-explore-irl.js", genre: "event_join", preuve: /rsvpOk === true && rsvp === "going"/ },
  { fichier: "app-07-ia-explore-irl.js", genre: "event_comment", preuve: /if \(realId && ev/ },
  { fichier: "app-05-config-profil.js", genre: "live_video", preuve: /async function _vliveNotifyFollowers/ }, // appelée après l'insert du direct
  { fichier: "app-07-ia-explore-irl.js", genre: "event_invite", preuve: /_rememberEventInvite/ },          // l'invitation EST la notification
];

function appelsDirects() {
  const dir = join(RACINE, "js");
  const out = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".js"))) {
    const lignes = readFileSync(join(dir, f), "utf8").split(/\r?\n/);
    lignes.forEach((l, i) => {
      for (const m of l.matchAll(/supaInsertNotif\(\s*[^,()]+,\s*"([a-z_]+)"/g)) {
        if (GENRES_PROUVES.has(m[1])) out.push({ fichier: f, genre: m[1], ligne: i + 1, avant: lignes.slice(Math.max(0, i - 20), i + 1).join("\n") });
      }
    });
  }
  return out;
}

test("chaque notification soumise à la preuve attend le verdict de son écriture", () => {
  const appels = appelsDirects();
  const inconnus = appels.filter((a) => !SITES_CONNUS.some((s) => s.fichier === a.fichier && s.genre === a.genre));
  assert.deepEqual(inconnus.map((a) => a.fichier + ":" + a.ligne + " (" + a.genre + ")"), [],
    "appel direct à supaInsertNotif en parallèle de son écriture : passer par notifierApresEcriture (app-08)");
  for (const s of SITES_CONNUS) {
    const trouves = appels.filter((a) => a.fichier === s.fichier && a.genre === s.genre);
    assert.equal(trouves.length, 1, s.fichier + " / " + s.genre + " : un seul site attendu, " + trouves.length + " trouvé(s)");
    assert.match(trouves[0].avant, s.preuve, s.fichier + ":" + trouves[0].ligne + " (" + s.genre + ") : la preuve d'ordonnancement a disparu");
  }
});

test("le motif PREREQUIS-CLIENT de la migration est porté par le client", () => {
  const sql = readFileSync(join(RACINE, "migrations", "migration_notifications_preuve_evenement_2026-11-13.sql"), "utf8");
  const motif = (sql.match(/^-- PREREQUIS-CLIENT: (\S+)$/m) || [])[1];
  assert.equal(motif, "notifications:apres-ecriture");
  assert.ok(readFileSync(join(RACINE, "js", "app-08-ui-modals-tour.js"), "utf8").includes('"' + motif + '"'));
});

test("la file des commentaires notifie à la CONFIRMATION de l'envoi", () => {
  const src = readFileSync(join(RACINE, "js", "app-04-comments-shop.js"), "utf8");
  assert.match(src, /if \(ok\) \{[^\n]*_cmtObSetStatus\(op\.threadId, op\.nodeId, true\); _cmtObNotifier\(op\); \}/);
  // Les trois appels de mise en file portent leur notification, aucun ne notifie à côté.
  for (const [f, re] of [["app-04-comments-shop.js", /_enqueueCommentSync\(\{ type: "post_comment", threadId: postId, commentId: _cid, nodeId: _cid, text: text, notif: _notifCmt \}\)/],
    ["emoji-misc.js", /_enqueueCommentSync\(\{ type: "reply",[^\n]*notif: _notifRep \}\)/],
    ["emoji-misc.js", /_enqueueCommentSync\(\{ type: "post_comment",[^\n]*notif: _notifGif \}\)/],
    ["app-05-config-profil.js", /_enqueueCommentSync\(Object\.assign\(\{ threadId: postId \}, op, \{ notif: notif \}\)\)/]]) {
    assert.match(readFileSync(join(RACINE, "js", f), "utf8"), re, f);
  }
});
