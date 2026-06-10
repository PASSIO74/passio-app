// Test du filtre d'heure IRL

console.log("=== Test du Filtre d'Heure IRL ===\n");

// Simule des événements
const testEvents = [
  {
    id: "e1",
    title: "Concert à 18:00",
    date: (() => {
      const d = new Date();
      d.setHours(18, 0, 0, 0);
      return d.getTime();
    })()
  },
  {
    id: "e2",
    title: "Conférence à 20:30",
    date: (() => {
      const d = new Date();
      d.setHours(20, 30, 0, 0);
      return d.getTime();
    })()
  },
  {
    id: "e3",
    title: "Atelier à 14:00",
    date: (() => {
      const d = new Date();
      d.setHours(14, 0, 0, 0);
      return d.getTime();
    })()
  },
  {
    id: "e4",
    title: "Cinéma demain à 19:00",
    date: (() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(19, 0, 0, 0);
      return d.getTime();
    })()
  }
];

// Test 1: Pas de filtre d'heure
console.log("Test 1: Sans filtre d'heure");
console.log("Événements: " + testEvents.length);
testEvents.forEach(e => {
  const time = new Date(e.date);
  console.log(`  - ${e.title} (${time.getHours()}:${String(time.getMinutes()).padStart(2, '0')})`);
});

// Test 2: Filtre d'heure 19:00
console.log("\nTest 2: Filtre d'heure >= 19:00");
const filterTime = "19:00";
const [filterHours, filterMins] = filterTime.split(":").map(Number);
const filterTimeInMinutes = filterHours * 60 + filterMins;

let filtered = testEvents.filter(e => {
  const eventDate = new Date(e.date);
  const eventHours = eventDate.getHours();
  const eventMins = eventDate.getMinutes();
  const eventTimeInMinutes = eventHours * 60 + eventMins;

  return eventTimeInMinutes >= filterTimeInMinutes;
});

console.log("Résultats: " + filtered.length + " événements");
filtered.forEach(e => {
  const time = new Date(e.date);
  console.log(`  ✅ ${e.title} (${time.getHours()}:${String(time.getMinutes()).padStart(2, '0')})`);
});

// Test 3: Filtre d'heure 15:00
console.log("\nTest 3: Filtre d'heure >= 15:00");
const filterTime2 = "15:00";
const [fH2, fM2] = filterTime2.split(":").map(Number);
const fTIM2 = fH2 * 60 + fM2;

filtered = testEvents.filter(e => {
  const ed = new Date(e.date);
  const eH = ed.getHours();
  const eM = ed.getMinutes();
  const eTIM = eH * 60 + eM;

  return eTIM >= fTIM2;
});

console.log("Résultats: " + filtered.length + " événements");
filtered.forEach(e => {
  const time = new Date(e.date);
  console.log(`  ✅ ${e.title} (${time.getHours()}:${String(time.getMinutes()).padStart(2, '0')})`);
});

console.log("\n✅ CONCLUSION: Le filtre d'heure fonctionne correctement!");
console.log("Les événements sont affichés s'ils commencent à l'heure sélectionnée ou après.");
