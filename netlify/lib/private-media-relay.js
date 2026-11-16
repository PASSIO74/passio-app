// Relais HTTP borné. L'autorisation appartient au broker Supabase, à chaque GET/HEAD.
// Aucune clé privilégiée ici, aucun cookie, URL libre, redirection ou cache partagé.
export const MAX_MEDIA_BYTES = 26 * 1024 * 1024;
const MIME = new Set(['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/mp4','audio/webm','audio/ogg','audio/mpeg']);
const PATH = /^\/private-media\/(posts|stories)\/[A-Za-z0-9_-]{1,120}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(original|v720|poster)$/;
const SECURITY = Object.freeze({
  'Cache-Control':'private, no-store', 'Netlify-CDN-Cache-Control':'no-store',
  'CDN-Cache-Control':'no-store', 'Vary':'Authorization',
  'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':"sandbox; default-src 'none'",
  'Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer',
});
function empty(status, extra = {}) { return new Response(null,{status,headers:{...SECURITY,...extra}}); }
function length(value) { return /^(0|[1-9][0-9]{0,8})$/.test(value || '') ? Number(value) : NaN; }
function validRange(value) {
  const m = /^bytes=(\d{0,9})-(\d{0,9})$/.exec(value || '');
  return !!m && !!(m[1] || m[2]) && (!m[1] || !m[2] || Number(m[1]) <= Number(m[2]));
}
function checkedLength(upstream, range) {
  const n = length(upstream.headers.get('Content-Length'));
  if (!(n > 0 && n <= MAX_MEDIA_BYTES)) return null;
  if (range === null) return upstream.status === 200 && !upstream.headers.has('Content-Range') ? {n} : null;
  const m = /^bytes (\d{1,9})-(\d{1,9})\/(\d{1,9})$/.exec(upstream.headers.get('Content-Range') || '');
  if (upstream.status !== 206 || !m) return null;
  const [start,end,total] = m.slice(1).map(Number);
  const wanted = /^bytes=(\d*)-(\d*)$/.exec(range);
  const wantedStart = wanted[1] ? Number(wanted[1]) : Math.max(0,total-Number(wanted[2]));
  const wantedEnd = wanted[1] && wanted[2] ? Math.min(total-1,Number(wanted[2])) : total-1;
  return start === wantedStart && end === wantedEnd && start <= end && end < total && total <= MAX_MEDIA_BYTES && n === end-start+1
    ? {n,contentRange:`bytes ${start}-${end}/${total}`} : null;
}
async function capabilities(upstream, signal) {
  if (upstream.status !== 200 || upstream.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json' || !upstream.body) return null;
  const reader = upstream.body.getReader(); let bytes=0, text=''; const decoder=new TextDecoder('utf-8',{fatal:true});
  const stop=()=>{void reader.cancel().catch(()=>{});};
  signal.addEventListener('abort',stop,{once:true});
  try {
    while (true) { const part=await reader.read(); if(part.done) break; bytes+=part.value.byteLength; if(bytes>512) return null; text+=decoder.decode(part.value,{stream:true}); }
    text+=decoder.decode(); const value=JSON.parse(text);
    if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'max_bytes,min_client,protocol,reads_enabled,uploads_enabled') return null;
    if (value.protocol !== 1 || value.min_client !== 1 || value.max_bytes !== MAX_MEDIA_BYTES || typeof value.reads_enabled !== 'boolean' || typeof value.uploads_enabled !== 'boolean') return null;
    return {protocol:1,uploads_enabled:value.uploads_enabled,reads_enabled:value.reads_enabled,min_client:1,max_bytes:MAX_MEDIA_BYTES};
  } catch { return null; } finally { signal.removeEventListener('abort',stop); await reader.cancel().catch(()=>{}); }
}
export function createPrivateMediaRelay({target, fetchImpl=fetch, deadlineMs=60000}) {
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 60000) throw new Error('relay_deadline');
  return async function relay(request) {
    if (!['GET','HEAD'].includes(request.method)) return empty(405,{'Allow':'GET, HEAD'});
    const url=new URL(request.url), cap=url.pathname==='/private-media/capabilities';
    if (url.search || (!cap && !PATH.test(url.pathname))) return empty(404);
    if (!target || !/^https:\/\/(njkiyoklssvefstljemx|fcksxofaelcdmmifnwjo)\.supabase\.co$/.test(target.url) || typeof target.anon !== 'string' || !target.anon) return empty(503);
    const auth=request.headers.get('Authorization');
    if (auth !== null && (auth.length > 8192 || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(auth))) return empty(401);
    const range=request.headers.get('Range');
    if (range !== null && (cap || !validRange(range))) return empty(416);
    if (request.signal.aborted) return empty(408);
    const abort=new AbortController(); let upstream, reader;
    function stop() { abort.abort(); if(reader) void reader.cancel().catch(()=>{}); }
    const timer=setTimeout(stop,deadlineMs); timer.unref?.();
    request.signal.addEventListener('abort',stop,{once:true});
    function cleanup() { clearTimeout(timer); request.signal.removeEventListener('abort',stop); }
    function discard() { if(upstream?.body && !upstream.body.locked) void upstream.body.cancel().catch(()=>{}); }
    try {
      const headers=new Headers({apikey:target.anon,Accept:cap?'application/json':'*/*'});
      if (!cap && auth !== null) headers.set('Authorization',auth);
      if (range !== null) headers.set('Range',range);
      upstream=await fetchImpl(target.url+'/functions/v1'+url.pathname,{
        method:cap?'GET':request.method,headers,signal:abort.signal,redirect:'error',cache:'no-store',credentials:'omit',
      });
      if (abort.signal.aborted) { discard(); cleanup(); return empty(408); }
      if (cap) {
        const value=await capabilities(upstream,abort.signal); cleanup();
        if(!value || abort.signal.aborted) return empty(503);
        return new Response(request.method==='HEAD'?null:JSON.stringify(value),{status:200,headers:{...SECURITY,'Content-Type':'application/json'}});
      }
      if (![200,206].includes(upstream.status)) {
        const status=[400,401,403,404,408,429].includes(upstream.status)?upstream.status:502;
        const cr=upstream.headers.get('Content-Range'); discard(); cleanup();
        if(upstream.status===416 && /^bytes \*\/[1-9]\d{0,8}$/.test(cr || '') && Number(cr.split('/')[1])<=MAX_MEDIA_BYTES) return empty(416,{'Content-Range':cr});
        return empty(status);
      }
      const mime=(upstream.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
      const encoding=upstream.headers.get('Content-Encoding'); const size=checkedLength(upstream,range);
      if(!MIME.has(mime) || (encoding && encoding!=='identity') || !size) { stop(); discard(); cleanup(); return empty(502); }
      const responseHeaders={...SECURITY,'Content-Type':mime,'Content-Length':String(size.n),'Accept-Ranges':'bytes',...(size.contentRange?{'Content-Range':size.contentRange}:{})};
      if(request.method==='HEAD') { discard(); cleanup(); return new Response(null,{status:upstream.status,headers:responseHeaders}); }
      if(!upstream.body) { cleanup(); return empty(502); }
      reader=upstream.body.getReader(); let received=0;
      const body=new ReadableStream({
        async pull(controller) {
          try {
            const part=await reader.read();
            if(abort.signal.aborted) throw new Error('relay_abort');
            if(part.done) { if(received!==size.n) throw new Error('relay_length'); cleanup(); controller.close(); return; }
            if(!(part.value instanceof Uint8Array) || received+part.value.byteLength>size.n || received+part.value.byteLength>MAX_MEDIA_BYTES) throw new Error('relay_length');
            received+=part.value.byteLength; controller.enqueue(part.value);
          } catch { stop(); cleanup(); controller.error(new Error('media_unavailable')); }
        },
        cancel() { stop(); cleanup(); },
      });
      return new Response(body,{status:upstream.status,headers:responseHeaders});
    } catch { stop(); discard(); cleanup(); return empty(request.signal.aborted?408:503); }
  };
}
