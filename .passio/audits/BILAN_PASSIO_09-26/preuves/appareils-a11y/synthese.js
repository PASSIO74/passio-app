// Synthèse lisible de matrice.json → matrice-synthese.md
const fs = require("fs");
const path = require("path");
const R = JSON.parse(fs.readFileSync(path.join(__dirname, "matrice.json"), "utf8"));
const L = [];
L.push("# Matrice appareils × écrans — ÉMULATION Chromium (" + R.date + ")\n");
L.push("| viewport | écran | capture (Ko) | overflow doc | éléments hors écran | nav visible | bouton principal visible | cibles <44 / total (nav <44) | champs <16px | img sans alt | contraste échecs/textes | icônes sans nom | role=button sans tabindex |");
L.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const agg = { small: {}, contrast: {}, noName: {}, roleNoTab: {}, imgNoAlt: {}, overflow: [] };
for (const m of R.matrice) {
  if (m.erreur) { L.push(`| ${m.vp} | ${m.screen || "-"} | ERREUR ${m.erreur} |`); continue; }
  const ov = m.overflowing.map((o) => `${o.sel} (right ${o.right})`).join("; ");
  L.push(`| ${m.vp} | ${m.screen} | ${m.cap.file} (${Math.round(m.cap.size / 1024)}) | ${m.docOverflow ? "OUI " + m.docScrollWidth : "non"} | ${m.overflowing.length ? m.overflowing.length + " : " + ov.slice(0, 160) : "0"} | ${m.navVisible ? "oui" : "NON"} | ${m.mainBtn ? (m.mainBtn.inViewport ? "oui" : "NON") + " " + m.mainBtn.sel + " " + m.mainBtn.w + "×" + m.mainBtn.h : "ABSENT"} | ${m.n44}/${m.nClickables} (${m.navSmall.length}) | ${m.inputsSmall.length} | ${m.imgNoAlt.length}/${m.nImgs} | ${m.contrast.nFail}/${m.contrast.nText} | ${m.nNoName} | ${m.nRoleBtnNoTab} |`);
  if (m.overflowing.length || m.docOverflow) agg.overflow.push({ vp: m.vp, screen: m.screen, doc: m.docOverflow, els: m.overflowing });
  for (const s of m.small10) { const k = s.sel + " " + s.w + "×" + s.h; agg.small[k] = (agg.small[k] || 0) + 1; }
  for (const c of m.contrast.pires) { const k = `${c.sel} | "${c.txt}" | ${c.color} sur ${c.bg} | ${c.ratio}:1 (seuil ${c.seuil}, ${c.fs}px${c.opacity < 1 ? ", opacité " + c.opacity : ""})`; agg.contrast[k] = (agg.contrast[k] || 0) + 1; }
  for (const n of m.noName) { const k = n.sel + " [" + n.txt + "]"; agg.noName[k] = (agg.noName[k] || 0) + 1; }
  for (const n of m.roleBtnNoTab) agg.roleNoTab[n] = (agg.roleNoTab[n] || 0) + 1;
  for (const n of m.imgNoAlt) agg.imgNoAlt[n] = (agg.imgNoAlt[n] || 0) + 1;
}
const top = (o, n = 40) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `- (${v}×) ${k}`).join("\n");
L.push("\n## Débordements horizontaux (éléments visibles dont right > innerWidth)\n" + (agg.overflow.length ? agg.overflow.map((o) => `- ${o.vp} / ${o.screen} : doc=${o.doc} ; ${o.els.map((e) => e.sel + " right=" + e.right + " left=" + e.left).join(" ; ")}`).join("\n") : "aucun"));
L.push("\n## Cibles < 44 px les plus fréquentes (sélecteur w×h)\n" + top(agg.small, 60));
L.push("\n## Échecs de contraste les plus fréquents\n" + top(agg.contrast, 60));
L.push("\n## Commandes sans nom accessible (icône/emoji seul, sans aria-label/title)\n" + top(agg.noName, 40));
L.push("\n## role=button sans tabindex (non atteignables au clavier)\n" + top(agg.roleNoTab, 30));
L.push("\n## Images visibles sans alt\n" + top(agg.imgNoAlt, 30));
const m390 = R.matrice.filter((m) => m.vp === "390x844" && !m.erreur);
L.push("\n## Titres visibles par écran (390×844)\n" + m390.map((m) => `- ${m.screen} : ${m.headings.length ? m.headings.join(" · ") : "AUCUN titre h1–h6"}`).join("\n"));
L.push("\n## Champs < 16 px (390×844)\n" + m390.map((m) => `- ${m.screen} : ${m.inputsSmall.map((i) => i.sel + " " + i.fs + "px").join("; ") || "aucun"}`).join("\n"));
L.push("\n## Focus clavier (390×844, Tab ×10 depuis le Fil)\n" + (R.focus ? R.focus.steps.map((s, i) => `${i + 1}. ${s.el} "${s.label || ""}" focus-visible=${s.focusVisible} indicateur=${s.indicateur} outline=${s.outline} inViewport=${s.inViewport} dansÉcranActif=${s.inActive}`).join("\n") + "\n\nClavier : " + JSON.stringify(R.focus.kb) : "non mesuré"));
L.push("\n## prefers-reduced-motion\n- no-preference : " + JSON.stringify(R["reducedMotion_no-preference"]) + "\n- reduce : " + JSON.stringify(R["reducedMotion_reduce"]));
L.push("\n## Zoom 200 % (desktop 1280 → viewport 640×400 CSS px)\n" + R.zoom200_desktop640x400.map((z) => `- ${z.screen} : overflow=${z.docOverflow} horsÉcran=${z.overflowing.length} nav=${z.navVisible} (${JSON.stringify(z.navRect)}) bouton=${z.mainBtn ? z.mainBtn.inViewport : "absent"} → ${z.cap.file}`).join("\n"));
L.push("\n## Texte 200 % (390×844, font-size racine 200 %)\n" + R.texte200.map((z) => `- ${z.screen} : overflow=${z.docOverflow} horsÉcran=${z.overflowing.length} ${z.overflowing.map((e) => e.sel).join("; ")} nav=${z.navVisible} bouton=${z.mainBtn ? z.mainBtn.inViewport : "absent"} tronqués(ellipsis)=${z.tronques} → ${z.cap.file}`).join("\n"));
L.push("\n## Desktop 1280×800\n- shell : " + JSON.stringify(R.desktopShell) + "\n- hover : " + JSON.stringify(R.desktopHover));
L.push("\n## Erreurs JS par viewport\n" + Object.keys(R).filter((k) => k.startsWith("errs_")).map((k) => `- ${k.slice(5)} : ${R[k].length ? R[k].join(" | ") : "aucune"}`).join("\n"));
fs.writeFileSync(path.join(__dirname, "matrice-synthese.md"), L.join("\n"));
console.log(L.join("\n"));
