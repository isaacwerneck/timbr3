gerador de synths

## frontend

1. npm install
2. npm run dev

## presets anonimos (sem login)

o app usa X-Anonymous-Id gerado localmente e persiste presets no cloudflare worker + firestore.

### arquivos importantes

1. cloudflare/wrangler.toml
2. cloudflare/src/index.ts
3. firestore.rules

### setup completo

1. criar service account no firebase com acesso ao firestore e copiar project_id, client_email e private_key

2. preencher FIREBASE_PROJECT_ID e FIREBASE_CLIENT_EMAIL em cloudflare/wrangler.toml

3. definir secrets no worker

```bash
npm run cf:secret:key
npm run cf:secret:salt
```

4. deploy da api

```bash
npm run cf:deploy
```

5. no frontend, configurar .env com a url do worker

```env
VITE_PRESET_API_BASE="https://timbr3-presets-api.<seu-subdominio>.workers.dev"
```

6. executar frontend normalmente

```bash
npm run dev
```

## endpoints da api

1. GET /api/health
2. GET /api/presets
3. POST /api/presets
4. DELETE /api/presets/:id

todos os endpoints de preset exigem header `X-Anonymous-Id`.
