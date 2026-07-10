type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type PresetDoc = {
  id: string;
  name: string;
  payload: Record<string, JsonValue>;
  createdAt: string;
  updatedAt: string;
};

interface Env {
  ALLOWED_ORIGIN?: string;
  ANON_ID_SALT?: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
};

const corsHeaders = (request: Request, env: Env): Record<string, string> => {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigin = env.ALLOWED_ORIGIN?.trim();

  const allowOrigin = !allowedOrigin || allowedOrigin === '*'
    ? '*'
    : origin === allowedOrigin
      ? allowedOrigin
      : 'null';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Anonymous-Id',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
};

const applyCors = (response: Response, request: Request, env: Env) => {
  const headers = new Headers(response.headers);
  const cors = corsHeaders(request, env);
  Object.entries(cors).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    headers,
  });
};

const normalizeAnonId = (request: Request) => {
  const raw = request.headers.get('X-Anonymous-Id')?.trim() || '';
  if (!raw) throw new Error('missing_anon_id');
  if (raw.length < 8 || raw.length > 128) throw new Error('invalid_anon_id');
  if (!/^[a-zA-Z0-9._:-]+$/.test(raw)) throw new Error('invalid_anon_id');
  return raw;
};

const b64Url = (input: string | ArrayBuffer) => {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const hashAnonId = async (anonId: string, salt: string) => {
  const data = new TextEncoder().encode(`${salt}:${anonId}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
};

const firestoreCollectionPath = (projectId: string, anonHash: string) => {
  return `projects/${projectId}/databases/(default)/documents/anon_profiles/${anonHash}/presets`;
};

const getPrivateKey = (env: Env) => env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

const getAccessToken = async (env: Env) => {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    sub: env.FIREBASE_CLIENT_EMAIL,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore',
  };

  const encodedHeader = b64Url(JSON.stringify(header));
  const encodedClaim = b64Url(JSON.stringify(claim));
  const message = `${encodedHeader}.${encodedClaim}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    (() => {
      const pem = getPrivateKey(env);
      const body = pem.replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\s+/g, '');
      const raw = atob(body);
      const out = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
      return out.buffer;
    })(),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(message));
  const jwt = `${message}.${b64Url(signature)}`;

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    throw new Error('firebase_token_error');
  }

  const tokenJson = await tokenResponse.json() as Record<string, unknown>;
  const accessToken = tokenJson.access_token;
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new Error('firebase_token_missing');
  }

  return accessToken;
};

const safeParseJson = async (request: Request): Promise<Record<string, JsonValue>> => {
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('invalid_payload');
  }
  return payload as Record<string, JsonValue>;
};

const parsePresetPayload = (value: JsonValue): Record<string, JsonValue> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_preset_payload');
  }
  return value as Record<string, JsonValue>;
};

const encodeFields = (doc: PresetDoc) => ({
  id: { stringValue: doc.id },
  name: { stringValue: doc.name },
  payload_json: { stringValue: JSON.stringify(doc.payload) },
  created_at: { stringValue: doc.createdAt },
  updated_at: { stringValue: doc.updatedAt },
});

const decodeFieldString = (field: any) => (field && typeof field.stringValue === 'string' ? field.stringValue : '');

const decodeDocument = (doc: any): PresetDoc | null => {
  const fields = doc?.fields;
  if (!fields || typeof fields !== 'object') return null;
  const id = decodeFieldString(fields.id);
  const name = decodeFieldString(fields.name);
  const payloadJson = decodeFieldString(fields.payload_json);
  const createdAt = decodeFieldString(fields.created_at);
  const updatedAt = decodeFieldString(fields.updated_at);
  if (!id || !name) return null;

  let payload: Record<string, JsonValue> = {};
  try {
    const parsed = JSON.parse(payloadJson);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      payload = parsed as Record<string, JsonValue>;
    }
  } catch {
    payload = {};
  }

  return { id, name, payload, createdAt, updatedAt };
};

const firestoreRequest = async (env: Env, accessToken: string, path: string, init?: RequestInit) => {
  const url = `https://firestore.googleapis.com/v1/${path}`;
  const headers = new Headers(init?.headers || {});
  headers.set('Authorization', `Bearer ${accessToken}`);
  headers.set('Content-Type', 'application/json; charset=utf-8');

  const response = await fetch(url, {
    ...init,
    headers,
  });

  return response;
};

const listPresets = async (env: Env, accessToken: string, anonHash: string) => {
  const path = firestoreCollectionPath(env.FIREBASE_PROJECT_ID, anonHash);
  const response = await firestoreRequest(env, accessToken, path, { method: 'GET' });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error('firestore_list_error');

  const body = await response.json() as any;
  const docs = Array.isArray(body.documents) ? body.documents : [];
  const mapped = docs
    .map((doc: any) => decodeDocument(doc))
    .filter((doc: PresetDoc | null): doc is PresetDoc => !!doc)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return mapped;
};

const insertOrUpdatePreset = async (env: Env, accessToken: string, anonHash: string, body: Record<string, JsonValue>) => {
  const nameValue = body.name;
  const payloadValue = body.payload;
  const idValue = body.id;

  if (typeof nameValue !== 'string') throw new Error('invalid_name');
  const name = nameValue.trim();
  if (!name || name.length > 80) throw new Error('invalid_name');

  const payload = parsePresetPayload(payloadValue);

  const now = new Date().toISOString();
  const presetId = typeof idValue === 'string' && idValue.trim() ? idValue.trim() : crypto.randomUUID();
  const collectionPath = firestoreCollectionPath(env.FIREBASE_PROJECT_ID, anonHash);
  const docPath = `${collectionPath}/${encodeURIComponent(presetId)}`;

  let createdAt = now;
  const getExisting = await firestoreRequest(env, accessToken, docPath, { method: 'GET' });
  if (getExisting.ok) {
    const existing = decodeDocument(await getExisting.json() as any);
    if (existing?.createdAt) createdAt = existing.createdAt;
  }

  const preset: PresetDoc = {
    id: presetId,
    name,
    payload,
    createdAt,
    updatedAt: now,
  };

  const write = await firestoreRequest(env, accessToken, docPath, {
    method: 'PATCH',
    body: JSON.stringify({ fields: encodeFields(preset) }),
  });

  if (!write.ok) throw new Error('firestore_write_error');

  return {
    id: presetId,
    name,
    payload,
    updatedAt: now,
  };
};

const deletePreset = async (env: Env, accessToken: string, anonHash: string, id: string) => {
  if (!id || id.length > 120) throw new Error('invalid_id');

  const docPath = `${firestoreCollectionPath(env.FIREBASE_PROJECT_ID, anonHash)}/${encodeURIComponent(id)}`;
  const response = await firestoreRequest(env, accessToken, docPath, { method: 'DELETE' });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error('firestore_delete_error');
  return true;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return applyCors(new Response(null, { status: 204 }), request, env);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'GET' && path === '/api/health') {
      const health = json({ ok: true, service: 'timbr3-presets-api', now: new Date().toISOString() });
      return applyCors(health, request, env);
    }

    if (!path.startsWith('/api/presets')) {
      return applyCors(json({ error: 'not_found' }, 404), request, env);
    }

    let anonHash = '';
    let accessToken = '';
    try {
      const anonId = normalizeAnonId(request);
      anonHash = await hashAnonId(anonId, env.ANON_ID_SALT || 'timbr3-default-salt-change-me');
      accessToken = await getAccessToken(env);
    } catch {
      return applyCors(json({ error: 'invalid_anonymous_identity' }, 400), request, env);
    }

    try {
      if (request.method === 'GET' && path === '/api/presets') {
        const items = await listPresets(env, accessToken, anonHash);
        return applyCors(json(items), request, env);
      }

      if (request.method === 'POST' && path === '/api/presets') {
        const body = await safeParseJson(request);
        const saved = await insertOrUpdatePreset(env, accessToken, anonHash, body);
        return applyCors(json(saved, 200), request, env);
      }

      if (request.method === 'DELETE' && path.startsWith('/api/presets/')) {
        const presetId = decodeURIComponent(path.replace('/api/presets/', '').trim());
        const removed = await deletePreset(env, accessToken, anonHash, presetId);
        if (!removed) {
          return applyCors(json({ error: 'preset_not_found' }, 404), request, env);
        }
        return applyCors(new Response(null, { status: 204 }), request, env);
      }

      return applyCors(json({ error: 'method_not_allowed' }, 405), request, env);
    } catch (err) {
      const code = err instanceof Error ? err.message : 'internal_error';
      const status = code.startsWith('invalid_') ? 400 : 500;
      return applyCors(json({ error: code }, status), request, env);
    }
  },
};
