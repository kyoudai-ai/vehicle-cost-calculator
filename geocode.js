/* Isolated candidate. Geolonia normalize-japanese-addresses 3.1.3 (MIT). */
(function (root) {
  const cache = new Map();
  let lastSearch = 0;
  let searchQueue = Promise.resolve();
  function cleanAddress(value) {
    return String(value).normalize('NFKC').replace(/〒?\s*\d{3}-\d{4}\s*/g, '')
      .replace(/[‐‑‒–—―−]/g, '-').replace(/(?<=\d)[ーｰ](?=\d)/g, '-').replace(/\s+/g, ' ').trim();
  }
  function validPoint(lon, lat) {
    return typeof lon === 'number' && typeof lat === 'number' &&
      Number.isFinite(lon) && Number.isFinite(lat) && lon >= 122 && lon <= 154 && lat >= 20 && lat <= 46;
  }
  function abortable(promise, signal) {
    if (signal.aborted) return Promise.reject(new DOMException('中止', 'AbortError'));
    return new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException('中止', 'AbortError'));
      signal.addEventListener('abort', abort, { once: true });
      promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  }
  async function locate(address, signal, stage) {
    const query = cleanAddress(address);
    if (!query || query.length > 200) throw new Error('住所の入力を確認してください');
    if (signal.aborted) throw new DOMException("中止", "AbortError");
    if (cache.has(query)) return cache.get(query);
    const detailed = /\d|[一二三四五六七八九十]+(?:丁目|番|号)/.test(query);
    let normal;
    let normalizationFailure;
    try {
      normal = await abortable(root.normalize.normalize(query), signal);
      if (!detailed && !normal.other && normal.level >= 2 && normal.point?.level >= 2 &&
          validPoint(normal.point.lng, normal.point.lat)) {
        const result = { coordinates: [normal.point.lng, normal.point.lat],
          label: normal.pref + normal.city + (normal.town || ''), source: 'Geolonia住所データ',
          precision: '地域の代表点（番地位置ではありません）', level: normal.point.level };
        cache.set(query, result);
        return result;
      }
      if (normal.point?.level === 8 && normal.level === 8 &&
          validPoint(normal.point.lng, normal.point.lat) && !/\d/.test(normal.other || '')) {
        const result = { coordinates: [normal.point.lng, normal.point.lat],
          label: normal.pref + normal.city + normal.town + normal.addr,
          source: 'Geolonia住所データ', precision: '番地・号／地番', level: 8 };
        cache.set(query, result);
        return result;
      }
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      normalizationFailure = error;
    }
    // Never silently replace a detailed address with a town/city representative point.
    // Nominatim remains available for city names and landmarks; exact-house fallback
    // requires a parsed municipality/town and matching addr:housenumber.
    const task = async () => {
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 1100 - (Date.now() - lastSearch))));
      if (signal.aborted) throw new DOMException('中止', 'AbortError');
      lastSearch = Date.now();
      const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
        q: query + ', 日本', format: 'jsonv2', limit: '5', countrycodes: 'jp', addressdetails: '1'
      });
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(stage + '：HTTP ' + response.status);
      const results = await response.json();
      const point = results.find(p => {
        const lon = Number(p.lon), lat = Number(p.lat);
        if (!p.lon || !p.lat || !validPoint(lon, lat)) return false;
        if (!detailed) return true;
        const expected = normal?.addr || normal?.other;
        return normal?.level >= 3 && /^\d+(?:-\d+)*$/.test(expected || '') &&
          cleanAddress(p.address?.house_number || '').replace(/番地?|号/g, '-').replace(/-$/, '') === expected &&
          cleanAddress(p.display_name).includes(normal.city) &&
          cleanAddress(p.display_name).includes(normal.town);
      });
      if (!point) throw new Error(detailed ? '番地まで一致する位置が見つかりませんでした。住所を確認してください。' :
        (normalizationFailure ? '住所データの通信と住所検索を確認してください。' : '住所が見つかりませんでした'));
      const result = { coordinates: [Number(point.lon), Number(point.lat)], label: point.display_name,
        source: 'Nominatim', precision: detailed ? '番地一致' : '施設・地域の代表点', level: detailed ? 8 : 2 };
      cache.set(query, result);
      return result;
    };
    const job = searchQueue.then(task, task);
    searchQueue = job.catch(() => {});
    return job;
  }
  root.KyoudaiGeocoder = { locate, cleanAddress, validPoint };
})(globalThis);
