// Petite persistance JSON sur fichier (aucune dépendance base de données).
// Utilisée pour les données propres au dashboard : sessions de test, checklist,
// feature flags, statuts de bugs, journal d'audit. Écriture atomique.
//
// ⚠️ UNE ÉCRITURE QUI ÉCHOUE NE TUE PLUS LE SERVEUR (2026-09-13). `save()` était
// appelée sans garde par des minuteurs (battement SSE toutes les 25 s,
// historique de contrôle, observation) et par `alerts.emit` : à disque plein,
// `writeFileSync` levait ENOSPC hors de tout try, et Node arrêtait le processus
// — 22 fois entre le 1er et le 10 septembre 2026, le superviseur relançant à
// chaque fois un serveur qui replantait à la première écriture. La mémoire est
// désormais la vérité : la donnée est posée AVANT la tentative d'écriture, une
// écriture ratée est comptée et exposée (`health()`), et la prochaine qui
// réussit remet l'état à sain. Rien n'est perdu tant que le processus vit ; ce
// qui manque au disque sera réécrit au prochain `save()`.
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

try { fs.mkdirSync(config.dataDir, { recursive: true }); }
catch (e) { console.error("[jsondb] dossier data impossible à créer :", e.message); }

// Journal borné des échecs d'écriture : une ligne par CHANGEMENT d'état par
// fichier, pas une par tentative (à 25 s de battement ce serait 3 500 lignes
// par jour dans supervise.log, sur un disque déjà plein).
const _bruyants = new Set();

export class JsonDb {
  /** @param {string} name  @param {any} initial */
  constructor(name, initial) {
    this.name = name;
    this.file = path.join(config.dataDir, name + ".json");
    this.data = initial;
    this.loadHealthy = true;
    this.loadErrorCode = null;
    this.lastWriteError = null;   // { code, message, at } de la dernière écriture ratée, null si la dernière a réussi
    this.writeFailures = 0;       // échecs consécutifs
    try {
      if (fs.existsSync(this.file)) {
        this.data = JSON.parse(fs.readFileSync(this.file, "utf8"));
      } else {
        this.save();
      }
    } catch (e) {
      this.loadHealthy = false;
      this.loadErrorCode = "read_or_parse_failed";
      console.error("[jsondb] lecture échouée pour", name, e.message);
    }
  }
  /** Écrit sur disque. Ne lève JAMAIS : retourne `this`, l'échec est dans `health()`. */
  save() {
    const tmp = this.file + ".tmp";
    try {
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
      if (this.lastWriteError) {
        console.error(`[jsondb] ${this.name}.json : écriture de nouveau possible (après ${this.writeFailures} échec(s), dernier : ${this.lastWriteError.code})`);
        _bruyants.delete(this.name);
      }
      this.lastWriteError = null;
      this.writeFailures = 0;
    } catch (e) {
      this.writeFailures++;
      this.lastWriteError = { code: e.code || "write_failed", message: e.message, at: new Date().toISOString() };
      if (!_bruyants.has(this.name)) {
        _bruyants.add(this.name);
        console.error(`[jsondb] ${this.name}.json : écriture impossible (${this.lastWriteError.code}) — la donnée reste en mémoire, prochaine tentative au prochain save(). ${e.code === "ENOSPC" ? "DISQUE PLEIN." : ""}`);
      }
      try { fs.rmSync(tmp, { force: true }); } catch {}
    }
    return this;
  }
  get() { return this.data; }
  health() {
    if (this.loadHealthy !== true) return { available: false, reason: this.loadErrorCode || "unavailable" };
    if (this.lastWriteError) return { available: false, reason: "write_failed:" + this.lastWriteError.code, writeFailures: this.writeFailures, lastWriteAt: this.lastWriteError.at };
    return { available: true, reason: null };
  }
  set(d) { this.data = d; return this.save(); }
  update(fn) { fn(this.data); return this.save(); }
}
