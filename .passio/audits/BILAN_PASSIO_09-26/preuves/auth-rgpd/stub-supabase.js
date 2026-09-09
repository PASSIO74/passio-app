// STUB minimal du SDK supabase-js : le CDN cdn.jsdelivr.net est inaccessible depuis ce bac à sable
// (CONNECT 403 du proxy), donc l'app restait sur son client noop (_supaReal=false). Ce stub
// reproduit la surface utilisée par l'app ; chaque requête REST est un fetch réel vers l'URL du
// projet, que l'émulation INTERCEPTE par page.route — rien n'atteint la production.
(function () {
  function readSession() {
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^sb-.+-auth-token$/.test(k)) return JSON.parse(localStorage.getItem(k)); } } catch (e) {}
    return null;
  }
  function makeQuery(url, key, table) {
    var st = { method: "GET", body: null, filters: [] };
    function exec() {
      var s = readSession();
      var headers = { apikey: key, Authorization: "Bearer " + (s && s.access_token ? s.access_token : key), "Content-Type": "application/json", Prefer: "return=representation" };
      var qs = st.filters.length ? "?" + st.filters.join("&") : "";
      return fetch(url + "/rest/v1/" + table + qs, { method: st.method, headers: headers, body: st.body })
        .then(function (r) { return r.text().then(function (t) { var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = null; } return { data: d, error: r.ok ? null : { message: "HTTP " + r.status, status: r.status }, count: 0, status: r.status }; }); })
        .catch(function (e) { return { data: null, error: { message: String(e) }, count: 0 }; });
    }
    var q = {};
    var chain = function () { return q; };
    ["select", "order", "limit", "range", "in", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "or", "not", "contains", "overlaps", "match", "single", "maybeSingle", "abortSignal", "csv", "returns", "textSearch", "filter"].forEach(function (m) { q[m] = chain; });
    q.eq = function (col, val) { st.filters.push(encodeURIComponent(col) + "=eq." + encodeURIComponent(val)); return q; };
    q.insert = function (b) { st.method = "POST"; st.body = JSON.stringify(b); return q; };
    q.upsert = function (b) { st.method = "POST"; st.body = JSON.stringify(b); return q; };
    q.update = function (b) { st.method = "PATCH"; st.body = JSON.stringify(b); return q; };
    q.delete = function () { st.method = "DELETE"; return q; };
    q.then = function (res, rej) { return exec().then(res, rej); };
    q.catch = function (rej) { return exec().catch(rej); };
    q.finally = function (f) { return exec().finally(f); };
    return q;
  }
  function createClient(url, key) {
    var listeners = [];
    var client = {
      from: function (t) { return makeQuery(url, key, t); },
      rpc: function () { return makeQuery(url, key, "rpc/noop"); },
      channel: function () { var ch = { on: function () { return ch; }, subscribe: function (cb) { try { cb && cb("SUBSCRIBED"); } catch (e) {} return ch; }, unsubscribe: function () { return Promise.resolve("ok"); }, send: function () { return Promise.resolve("ok"); }, track: function () { return Promise.resolve("ok"); }, presenceState: function () { return {}; } }; return ch; },
      removeChannel: function () { return Promise.resolve("ok"); },
      removeAllChannels: function () { return Promise.resolve([]); },
      getChannels: function () { return []; },
      functions: { invoke: function () { return Promise.resolve({ data: null, error: null }); } },
      storage: { from: function () { return { upload: function () { return Promise.resolve({ data: null, error: { message: "stub" } }); }, getPublicUrl: function (p) { return { data: { publicUrl: url + "/storage/v1/object/public/x/" + p } }; }, list: function () { return Promise.resolve({ data: [], error: null }); }, remove: function () { return Promise.resolve({ data: [], error: null }); } }; } },
      auth: {
        getSession: function () { return Promise.resolve({ data: { session: readSession() }, error: null }); },
        getUser: function () { var s = readSession(); return Promise.resolve({ data: { user: s ? s.user : null }, error: s ? null : { message: "no session" } }); },
        refreshSession: function () { var s = readSession(); return Promise.resolve({ data: { session: s, user: s ? s.user : null }, error: null }); },
        onAuthStateChange: function (cb) { listeners.push(cb); return { data: { subscription: { unsubscribe: function () {} } } }; },
        signOut: function () { return Promise.resolve({ error: null }); },
        signInWithPassword: function () { return Promise.resolve({ data: { session: null, user: null }, error: { message: "stub" } }); },
        signInWithOAuth: function () { return Promise.resolve({ data: null, error: { message: "stub" } }); },
        signInAnonymously: function () { return Promise.resolve({ data: { session: null }, error: { message: "stub" } }); },
        signUp: function () { return Promise.resolve({ data: { session: null, user: null }, error: { message: "stub" } }); },
        updateUser: function () { return Promise.resolve({ data: null, error: { message: "stub" } }); },
        resetPasswordForEmail: function () { return Promise.resolve({ data: null, error: null }); },
        resend: function () { return Promise.resolve({ data: null, error: null }); },
        setSession: function () { return Promise.resolve({ data: { session: readSession() }, error: null }); },
      },
    };
    return client;
  }
  window.supabase = { createClient: createClient };
})();
