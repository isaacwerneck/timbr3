# Cloudflare Presets API (No Login)

This Worker stores TIMBR3 presets in Firestore using service account credentials.

## 1) Firestore prerequisites

1. Create a Firebase service account with Firestore access.
2. Download the JSON key.
3. Copy these fields from JSON:
   - project_id
   - client_email
   - private_key

## 2) Configure Worker vars/secrets

Edit [wrangler.toml](wrangler.toml):

1. Set FIREBASE_PROJECT_ID
2. Set FIREBASE_CLIENT_EMAIL
3. Set ALLOWED_ORIGIN to your frontend domain

Set secrets:

```bash
npx wrangler secret put FIREBASE_PRIVATE_KEY --config cloudflare/wrangler.toml
npx wrangler secret put ANON_ID_SALT --config cloudflare/wrangler.toml
```

## 3) Deploy Worker

```bash
npx wrangler deploy --config cloudflare/wrangler.toml
```

## 4) Connect frontend

Set VITE_PRESET_API_BASE in your frontend env:

VITE_PRESET_API_BASE="https://timbr3-presets-api.<your-subdomain>.workers.dev"

## Endpoints

1. GET /api/health
2. GET /api/presets
3. POST /api/presets
4. DELETE /api/presets/:id

All preset endpoints require header X-Anonymous-Id.

### POST body example

{
  "name": "Bass Wide",
  "payload": { "masterGain": 80 }
}

Optional id can be sent for update/upsert.
