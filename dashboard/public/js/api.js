// Client API + flux SSE. Toutes les requêtes portent le cookie de session.
async function req(method, path, body) {
  const res = await fetch("/api" + path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  if (res.status === 401 && path !== "/me" && path !== "/login") {
    window.dispatchEvent(new CustomEvent("dash:unauth"));
  }
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw Object.assign(new Error((data && data.error) || res.statusText), { status: res.status, data });
  return data;
}
export const api = {
  get: (p) => req("GET", p),
  post: (p, b) => req("POST", p, b),
  patch: (p, b) => req("PATCH", p, b),
  del: (p) => req("DELETE", p),
};

/** Connexion SSE avec reconnexion automatique. handlers: { event, alert, test, ping, open, error } */
export function connectStream(handlers) {
  let es;
  function open() {
    es = new EventSource("/api/stream", { withCredentials: true });
    es.addEventListener("hello", (e) => handlers.open && handlers.open(JSON.parse(e.data)));
    es.addEventListener("event", (e) => handlers.event && handlers.event(JSON.parse(e.data)));
    es.addEventListener("interaction", (e) => handlers.interaction && handlers.interaction(JSON.parse(e.data)));
    es.addEventListener("alert", (e) => handlers.alert && handlers.alert(JSON.parse(e.data)));
    es.addEventListener("trace", (e) => handlers.trace && handlers.trace(JSON.parse(e.data)));
    // Sentinelle : diagnostic automatique terminé / changement d'état du moteur.
    es.addEventListener("sentinel", (e) => handlers.sentinel && handlers.sentinel(JSON.parse(e.data)));
    es.addEventListener("sentinel_state", (e) => handlers.sentinelState && handlers.sentinelState(JSON.parse(e.data)));
    es.addEventListener("test", (e) => handlers.test && handlers.test(JSON.parse(e.data)));
    es.addEventListener("ping", (e) => handlers.ping && handlers.ping(JSON.parse(e.data)));
    es.onerror = () => { handlers.error && handlers.error(); /* EventSource se reconnecte seul */ };
  }
  open();
  return { close: () => es && es.close() };
}
