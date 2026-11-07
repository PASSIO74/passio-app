// ═══════════════════════════════════════════════════════════════════════════
// BARRIÈRE D'HÔTE ET D'ORIGINE, EN-TÊTES DE SÉCURITÉ (audit de sécurité 2026-11-06, F-01, F-06, F-14).
//
// « localhost » n'est pas une frontière : une page web visitée par l'opérateur peut viser le
// serveur par rebinding DNS (Host étranger) ou depuis un autre port local (même site, donc le
// cookie part). Trois règles :
//   · un Host hors de la liste est refusé (421) : ferme le rebinding ;
//   · une mutation venue d'une autre origine est refusée (403). Un navigateur envoie toujours
//     Origin sur un POST, et une page ne peut pas le retirer. Sans Origin ni Sec-Fetch-Site,
//     ce n'est pas un navigateur : la session reste exigée par les routes ;
//   · une CSP : si une interpolation venait à manquer d'échappement, le script ne pourrait
//     rien envoyer à l'extérieur. Elle n'empêche pas les appels à l'API locale.
// ═══════════════════════════════════════════════════════════════════════════

// `unsafe-inline` reste nécessaire tant que la page porte des gestionnaires onclick.
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";

export function entetesSecurite(req, res, next) {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  next();
}

export function hotesAutorises({ port, allowedHosts = [] }) {
  return new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`, ...allowedHosts]);
}

function memeOrigine(origine, hote) {
  try { return new URL(origine).host.toLowerCase() === hote; } catch { return false; }
}

const SURES = new Set(["GET", "HEAD", "OPTIONS"]);

export function barriereOrigine(cfg) {
  const hotes = hotesAutorises(cfg);
  return (req, res, next) => {
    const hote = String(req.headers.host || "").toLowerCase();
    // La sonde d'un hébergeur ne porte pas forcément le nom public, et /api/health ne dit rien.
    if (!hotes.has(hote) && req.path !== "/api/health") return res.status(421).json({ error: "Hôte refusé." });
    if (!SURES.has(req.method)) {
      const origine = req.headers.origin;
      const site = req.headers["sec-fetch-site"];
      if (origine !== undefined && !memeOrigine(origine, hote)) return res.status(403).json({ error: "Origine refusée." });
      if (site !== undefined && site !== "same-origin" && site !== "none") return res.status(403).json({ error: "Origine refusée." });
    }
    next();
  };
}
