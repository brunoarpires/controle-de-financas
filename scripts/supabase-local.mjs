// Gateway de TESTE que imita a API do Supabase em http://localhost:54321, para testes ponta a ponta
// sem Docker: /auth/v1 → GoTrue (9999), /rest/v1 → PostgREST (3000) e um emulador mínimo de
// /storage/v1 que grava os arquivos em disco e aplica as políticas RLS de storage.objects no Postgres.
// NÃO é usado em produção (lá o Supabase de verdade faz tudo isso).
import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const SEGREDO = process.env.JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long'
const PASTA = process.env.STORAGE_DIR ?? '/tmp/sb/storage'
const pool = new pg.Pool({ connectionString: process.env.PG_URL ?? 'postgres://postgres@127.0.0.1:54322/postgres' })
const b64 = (b) => Buffer.from(b).toString('base64url')
export const assinar = (payload) => { const h = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), p = b64(JSON.stringify(payload)); return `${h}.${p}.${crypto.createHmac('sha256', SEGREDO).update(`${h}.${p}`).digest('base64url')}` }
function verificar(tok) {
  const [h, p, s] = (tok ?? '').split('.'); if (!s) return null
  if (crypto.createHmac('sha256', SEGREDO).update(`${h}.${p}`).digest('base64url') !== s) return null
  const c = JSON.parse(Buffer.from(p, 'base64url')); return c.exp && c.exp < Date.now() / 1000 ? null : c
}
const ANON = assinar({ role: 'anon', iss: 'supabase-demo', iat: 1700000000, exp: 2000000000 })
if (process.argv.includes('--anon')) { console.log(ANON); process.exit(0) }

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'access-control-expose-headers': '*' }
const json = (res, st, o) => { res.writeHead(st, { ...CORS, 'content-type': 'application/json' }); res.end(JSON.stringify(o)) }
const ler = (req) => new Promise((r) => { const b = []; req.on('data', (c) => b.push(c)); req.on('end', () => r(Buffer.concat(b))) })
const tokens = new Map()

async function comoUsuario(claims, fn) { // roda SQL com o papel/claims do usuário → RLS vale
  const c = await pool.connect()
  try {
    await c.query('begin'); await c.query(`set local role ${claims.role === 'authenticated' ? 'authenticated' : 'anon'}`)
    await c.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [JSON.stringify(claims), claims.sub ?? ''])
    const r = await fn(c); await c.query('commit'); return r
  } catch (e) { await c.query('rollback'); throw e } finally { c.release() }
}

async function storage(req, res, rota) {
  const claims = verificar((req.headers.authorization ?? '').replace(/^Bearer /i, ''))
  let m
  if (req.method === 'GET' && (m = rota.match(/^\/object\/sign\/([^/]+)\/(.+)$/))) {
    const t = tokens.get(new URL(req.url, 'http://x').searchParams.get('token'))
    if (!t || t.exp < Date.now() || t.chave !== `${m[1]}/${decodeURIComponent(m[2])}`) return json(res, 400, { error: 'InvalidSignature' })
    const arq = path.join(PASTA, t.chave); if (!fs.existsSync(arq)) return json(res, 404, { error: 'not_found' })
    res.writeHead(200, { ...CORS, 'content-type': fs.existsSync(arq + '.tipo') ? fs.readFileSync(arq + '.tipo', 'utf8') : 'image/jpeg' }); return res.end(fs.readFileSync(arq))
  }
  if (!claims) return json(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'invalid jwt' })
  if (req.method === 'POST' && (m = rota.match(/^\/object\/sign\/([^/]+)\/(.+)$/))) {
    const [bucket, nome] = [m[1], decodeURIComponent(m[2])]
    const ok = await comoUsuario(claims, (c) => c.query('select 1 from storage.objects where bucket_id=$1 and name=$2', [bucket, nome]))
    if (!ok.rowCount) return json(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' })
    const { expiresIn = 60 } = JSON.parse((await ler(req)).toString() || '{}'); const tok = crypto.randomBytes(16).toString('hex')
    tokens.set(tok, { chave: `${bucket}/${nome}`, exp: Date.now() + expiresIn * 1000 })
    return json(res, 200, { signedURL: `/object/sign/${bucket}/${m[2]}?token=${tok}` })
  }
  if ((req.method === 'POST' || req.method === 'PUT') && (m = rota.match(/^\/object\/([^/]+)\/(.+)$/))) {
    const [bucket, nome] = [m[1], decodeURIComponent(m[2])]
    const corpo = await ler(req); let dados = corpo, tipo = req.headers['content-type'] ?? 'application/octet-stream'
    if (/multipart\/form-data/.test(tipo)) { const fd = await new Request('http://x', { method: 'POST', headers: { 'content-type': tipo }, body: corpo }).formData(); const f = [...fd.values()].find((v) => typeof v !== 'string'); dados = Buffer.from(await f.arrayBuffer()); tipo = f.type || 'image/jpeg' }
    const upsert = req.headers['x-upsert'] === 'true' || req.method === 'PUT'
    try {
      await comoUsuario(claims, async (c) => {
        const ex = await c.query('select id from storage.objects where bucket_id=$1 and name=$2', [bucket, nome])
        if (ex.rowCount) {
          if (!upsert) throw Object.assign(new Error('The resource already exists'), { st: 409 })
          const u = await c.query('update storage.objects set metadata=$3 where bucket_id=$1 and name=$2', [bucket, nome, { size: dados.length }])
          if (!u.rowCount) throw Object.assign(new Error('new row violates row-level security policy'), { st: 403 })
        } else await c.query('insert into storage.objects (bucket_id, name, owner, metadata) values ($1,$2,$3,$4)', [bucket, nome, claims.sub, { size: dados.length }])
      })
    } catch (e) { return json(res, e.st ?? 403, { statusCode: String(e.st ?? 403), error: 'Unauthorized', message: e.message }) }
    const arq = path.join(PASTA, bucket, nome); fs.mkdirSync(path.dirname(arq), { recursive: true }); fs.writeFileSync(arq, dados); fs.writeFileSync(arq + '.tipo', tipo)
    return json(res, 200, { Key: `${bucket}/${nome}`, path: nome })
  }
  json(res, 404, { error: 'rota de storage não emulada: ' + rota })
}

function repassar(req, res, porta, prefixo) {
  const p = http.request({ host: '127.0.0.1', port: porta, path: req.url.slice(prefixo.length) || '/', method: req.method, headers: { ...req.headers, host: `127.0.0.1:${porta}` } }, (r) => {
    res.writeHead(r.statusCode, { ...r.headers, ...CORS }); r.pipe(res)
  })
  p.on('error', (e) => json(res, 502, { error: e.message })); req.pipe(p)
}

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end() }
  const u = req.url
  if (u.startsWith('/auth/v1')) return repassar(req, res, 9999, '/auth/v1')
  if (u.startsWith('/rest/v1')) return repassar(req, res, 3000, '/rest/v1')
  if (u.startsWith('/storage/v1')) return storage(req, res, new URL(u, 'http://x').pathname.slice('/storage/v1'.length)).catch((e) => json(res, 500, { error: e.message }))
  if (u.startsWith('/realtime/v1')) { res.writeHead(404, CORS); return res.end() } // tempo real não emulado (o app sincroniza por intervalo)
  json(res, 404, { error: 'not found' })
}).listen(54321, () => console.log('Supabase local de teste em http://localhost:54321 — anon key:\n' + ANON))
