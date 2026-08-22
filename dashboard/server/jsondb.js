// Petite persistance JSON sur fichier (aucune dépendance base de données).
// Utilisée pour les données propres au dashboard : sessions de test, checklist,
// feature flags, statuts de bugs, journal d'audit. Écriture atomique.
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

fs.mkdirSync(config.dataDir, { recursive: true });

export class JsonDb {
  /** @param {string} name  @param {any} initial */
  constructor(name, initial) {
    this.file = path.join(config.dataDir, name + ".json");
    this.data = initial;
    this.loadHealthy = true;
    this.loadErrorCode = null;
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
  save() {
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
    return this;
  }
  get() { return this.data; }
  health() {
    return {
      available: this.loadHealthy === true,
      reason: this.loadHealthy === true ? null : this.loadErrorCode || "unavailable",
    };
  }
  set(d) { this.data = d; return this.save(); }
  update(fn) { fn(this.data); return this.save(); }
}
