/* Shared by the page and classic service worker. No fetching or precaching
 * happens merely by loading this file. */
(() => {
  const PREFIX = 'relic-film-v1-';
  const REGISTRY = 'relic-film-registry-v1';
  const readyURL = scope => new URL('__relic_film_offline__/ready.json', scope).href;
  const isFilmCache = name => name === REGISTRY || name.startsWith(PREFIX);

  function rangeResponse(response, request, size) {
    const headers = new Headers(response.headers);
    headers.delete('Content-Encoding');
    headers.delete('Content-Range');
    headers.delete('Transfer-Encoding');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('X-RELIC-Film-Offline', '1');
    const range = request.headers.get('Range');
    if (!range) {
      headers.set('Content-Length', String(size));
      return new Response(response.body, { status: 200, headers });
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    let start = 0, end = size - 1;
    if (match && (match[1] || match[2])) {
      start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
      end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
    } else start = size;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) {
      response.body?.cancel().catch(() => {});
      headers.set('Content-Range', `bytes */${size}`);
      headers.set('Content-Length', '0');
      return new Response(null, { status: 416, headers });
    }
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    headers.set('Content-Length', String(end - start + 1));
    // Read only the requested interval. A late MP4 seek never allocates the
    // entire downloaded movie inside the service worker's memory limit.
    const reader = response.body.getReader();
    let offset = 0, finished = false;
    const body = new ReadableStream({
      async pull(controller) {
        if (finished) return;
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) { finished = true; controller.close(); return; }
            const first = offset;
            offset += chunk.value.byteLength;
            if (offset <= start) continue;
            const from = Math.max(0, start - first);
            const to = Math.min(chunk.value.byteLength, end + 1 - first);
            if (to > from) controller.enqueue(chunk.value.subarray(from, to));
            if (offset > end) {
              finished = true;
              controller.close();
              reader.cancel().catch(() => {});
            }
            return;
          }
        } catch (error) { finished = true; controller.error(error); }
      },
      cancel(reason) { finished = true; return reader.cancel(reason); },
    });
    return new Response(body, { status: 206, headers });
  }

  async function findAsset(url, scope) {
    const names = (await caches.keys()).filter(name => name.startsWith(PREFIX)).reverse();
    for (const name of names) {
      const cache = await caches.open(name);
      const marker = await cache.match(readyURL(scope));
      if (!marker) continue;
      let plan;
      try { plan = await marker.json(); } catch { continue; }
      if (plan.scope !== scope || !plan.complete) continue;
      const file = plan.files?.find(item => item.url === url);
      if (!file) continue;
      const response = await cache.match(url);
      if (response && Number(response.headers.get('Content-Length')) === file.bytes) return { response, file };
    }
    return null;
  }

  async function serve(request, scope) {
    const saved = await findAsset(request.url, scope);
    if (saved && globalThis.navigator?.onLine === false) return rangeResponse(saved.response, request, saved.file.bytes);
    // Current online releases come from the network. An authentication error
    // is returned as-is; an old cached film must not mask a 401 or sign-in page.
    try { return await fetch(request); }
    catch (error) {
      if (saved) return rangeResponse(saved.response, request, saved.file.bytes);
      throw error;
    }
  }

  globalThis.RELICFilmCache = Object.freeze({ PREFIX, REGISTRY, readyURL, isFilmCache, rangeResponse, findAsset, serve });
})();
