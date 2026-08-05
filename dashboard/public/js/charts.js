// Graphiques légers sur <canvas> (aucune dépendance). Thème via variables CSS.
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#8b5cf6"; }
function prep(canvas, h = 160) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
  canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
  return { ctx, w, h };
}

/** Graphe en aires multi-séries. series:[{key,color,label}] data:[{t,..}] */
export function lineChart(canvas, data, series, opts = {}) {
  const { ctx, w, h } = prep(canvas, opts.height || 160);
  ctx.clearRect(0, 0, w, h);
  const pad = { l: 34, r: 8, t: 10, b: 20 };
  const maxV = Math.max(1, ...data.flatMap((d) => series.map((s) => d[s.key] || 0)));
  const gx = (i) => pad.l + (i / Math.max(1, data.length - 1)) * (w - pad.l - pad.r);
  const gy = (v) => pad.t + (1 - v / maxV) * (h - pad.t - pad.b);
  // grille
  ctx.strokeStyle = cssVar("--border-soft"); ctx.lineWidth = 1; ctx.fillStyle = cssVar("--muted-2"); ctx.font = "10px system-ui";
  for (let g = 0; g <= 2; g++) { const v = (maxV / 2) * g; const y = gy(v); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke(); ctx.fillText(Math.round(v), 4, y + 3); }
  for (const s of series) {
    const color = s.color || cssVar("--accent");
    ctx.beginPath();
    data.forEach((d, i) => { const x = gx(i), y = gy(d[s.key] || 0); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
    if (s.fill !== false) {
      ctx.lineTo(gx(data.length - 1), gy(0)); ctx.lineTo(gx(0), gy(0)); ctx.closePath();
      const grad = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
      grad.addColorStop(0, color + "44"); grad.addColorStop(1, color + "00");
      ctx.fillStyle = grad; ctx.fill();
    }
  }
  // axe X (premier / dernier)
  ctx.fillStyle = cssVar("--muted-2");
  if (data[0]) ctx.fillText(data[0].t, pad.l, h - 6);
  if (data.length > 1) ctx.fillText(data[data.length - 1].t, w - pad.r - 28, h - 6);
}

/** Mini sparkline. */
export function sparkline(canvas, values, color) {
  const { ctx, w, h } = prep(canvas, 34);
  ctx.clearRect(0, 0, w, h);
  const max = Math.max(1, ...values), min = Math.min(0, ...values);
  ctx.beginPath();
  values.forEach((v, i) => { const x = (i / Math.max(1, values.length - 1)) * w; const y = h - 2 - ((v - min) / (max - min || 1)) * (h - 4); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.strokeStyle = color || cssVar("--accent"); ctx.lineWidth = 1.5; ctx.stroke();
}

/** Jauge circulaire (score de préparation). */
export function gauge(canvas, pct) {
  const dpr = window.devicePixelRatio || 1; const size = 150;
  canvas.width = size * dpr; canvas.height = size * dpr;
  const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
  const c = size / 2, r = 60;
  ctx.clearRect(0, 0, size, size);
  ctx.lineWidth = 12; ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.strokeStyle = cssVar("--card-2"); ctx.stroke();
  const col = pct >= 80 ? cssVar("--ok") : pct >= 55 ? cssVar("--warn") : cssVar("--err");
  ctx.beginPath(); ctx.arc(c, c, r, -Math.PI / 2, -Math.PI / 2 + (pct / 100) * Math.PI * 2); ctx.strokeStyle = col; ctx.stroke();
}

/** Barres horizontales. items:[{label,value,max,color}] dans un conteneur. */
export function bars(el, items) {
  el.innerHTML = items.map((it) => `
    <div style="margin:9px 0">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
        <span>${it.label}</span><span class="progress-num muted">${it.display ?? it.value}</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, (it.value / (it.max || 100)) * 100)}%;${it.color ? "background:" + it.color : ""}"></div></div>
    </div>`).join("");
}
