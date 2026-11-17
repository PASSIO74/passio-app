// Adaptateur déployé et testé sans SDK réseau : createClient/fetch sont injectés.
export function createSupabaseMediaDependencies({ projectUrl, anonKey, serviceKey, createClient, fetchImpl = fetch }) {
  let origin;
  try { origin = new URL(projectUrl); } catch { throw new Error('private_media_configuration'); }
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || !anonKey || !serviceKey) throw new Error('private_media_configuration');
  return {
    anonKey,
    createActor({ mode, bearer, signal }) {
      const client = createClient(origin.origin, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: {
          headers: mode === 'user' ? { Authorization: 'Bearer ' + bearer } : {},
          fetch: (input, init) => fetchImpl(input, { ...init, signal }),
        },
      });
      return {
        async verify() {
          const { data, error } = await client.auth.getUser(bearer);
          if (error && Number(error.status) >= 500) throw new Error('private_media_auth_unavailable');
          return !error && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data?.user?.id || '');
        },
        async sessionActive() {
          const { data, error } = await client.rpc('media_session_active').abortSignal(signal);
          if (error) throw new Error('private_media_session_unavailable');
          return data === true;
        },
        async enabled() {
          const { data, error } = await client.rpc('media_proteges_actifs').abortSignal(signal);
          if (error) throw new Error('private_media_capabilities_unavailable');
          return data === true;
        },
        async resolve(locator) {
          const { data, error } = await client.rpc('media_resoudre', {
            p_type: locator.sourceType, p_affichant_id: locator.displayId,
            p_asset_id: locator.assetId, p_variante: locator.variant,
          }).abortSignal(signal);
          if (error) throw new Error('private_media_resolver_unavailable');
          return Array.isArray(data) && data.length === 1 ? data[0] : null;
        },
      };
    },
    async openObject({ objectKey, method, range, signal }) {
      // Cette URL n'utilise que l'origine de configuration et une clé canonique.
      if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/(original|v720|poster)\.(jpg|png|webp|gif|mp4|webm|m4a|ogg|mp3)$/.test(objectKey) || !['GET', 'HEAD'].includes(method)) throw new Error('private_media_object');
      const url = new URL('/storage/v1/object/authenticated/content-protected/' + objectKey.split('/').map(encodeURIComponent).join('/'), origin.origin);
      const headers = new Headers({ Authorization: 'Bearer ' + serviceKey, apikey: serviceKey });
      if (range) headers.set('Range', range.header);
      return fetchImpl(url, { method, headers, redirect: 'error', cache: 'no-store', credentials: 'omit', signal });
    },
  };
}
