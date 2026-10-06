/**
 * Minimal ERPNext (Frappe v16) REST client: token auth, JSON, the four calls the
 * sync needs. Errors carry the HTTP status so callers can tell a duplicate (409)
 * from a real failure.
 */

export class ErpError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export function createErpClient({ baseUrl, apiKey, apiSecret, fetchImpl = fetch, timeoutMs = 15000 }) {
  const root = baseUrl.replace(/\/+$/, '');
  const headers = {
    Authorization: `token ${apiKey}:${apiSecret}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  async function call(method, path, body) {
    const res = await fetchImpl(`${root}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text.slice(0, 500) };
    }
    if (!res.ok) {
      const detail = json?.exception || json?.exc_type || json?.message || json?.raw || '';
      throw new ErpError(`${method} ${path} -> ${res.status} ${String(detail).slice(0, 300)}`, res.status, json);
    }
    return json;
  }

  const enc = encodeURIComponent;

  return {
    async list(doctype, { filters = [], fields = ['name'], limit = 20 } = {}) {
      const q = `filters=${enc(JSON.stringify(filters))}&fields=${enc(JSON.stringify(fields))}&limit_page_length=${limit}`;
      return (await call('GET', `/api/resource/${enc(doctype)}?${q}`)).data ?? [];
    },
    async insert(doctype, doc) {
      return (await call('POST', `/api/resource/${enc(doctype)}`, doc)).data;
    },
    async update(doctype, name, patch) {
      return (await call('PUT', `/api/resource/${enc(doctype)}/${enc(name)}`, patch)).data;
    },
    async exists(doctype, name) {
      try {
        await call('GET', `/api/resource/${enc(doctype)}/${enc(name)}`);
        return true;
      } catch (err) {
        if (err instanceof ErpError && err.status === 404) return false;
        throw err;
      }
    },
  };
}
