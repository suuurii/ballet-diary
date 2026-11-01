/**
 * 芭蕾手账 · 云备份后端
 * 运行在 Cloudflare Workers 上，备份文件存进 R2 存储桶。
 *
 * 设计要点：
 *   - 没有账号、没有密码。唯一的凭证是手机上的「恢复码」。
 *   - 服务器只把恢复码算成一串乱码（SHA-256）当文件夹名，**不保存恢复码本身**。
 *     所以就算有人拿到这堆备份文件，也反推不出它是谁的。
 *   - 每次上传覆盖「最新」那份，另外留最近 KEEP 份历史，旧的自动清掉。
 */

const KEEP = 5 // 保留几份历史
const MAX_BYTES = 30 * 1024 * 1024 // 单次上传上限 30MB（压缩后足够几千张照片）
const ALPHABET = /^[0-9A-HJKMNP-TV-Z]{20}$/ // 恢复码：20 位，不含 I L O U

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Backup-Gzip',
    'Access-Control-Expose-Headers': 'X-Backup-Gzip, X-Backup-Updated',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function reply(body, status, origin, extra) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(origin),
      ...(extra || {}),
    },
  })
}

/** 把恢复码揉成一段不可反推的乱码，当作这个人的文件夹名 */
async function folderFor(code) {
  const data = new TextEncoder().encode('ballet-diary:v1:' + code)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function codeFrom(request) {
  const auth = request.headers.get('Authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (!m) return ''
  const raw = m[1].toUpperCase().replace(/[^0-9A-Z]/g, '')
  const body = raw.length > 20 && raw.startsWith('BAL') ? raw.slice(3) : raw
  const clean = body
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V')
    .slice(0, 20)
  return ALPHABET.test(clean) ? clean : ''
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin')
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    const url = new URL(request.url)
    const bucket = env.BACKUP
    if (!bucket) return reply({ error: 'bucket not bound' }, 500, origin)

    if (url.pathname === '/' || url.pathname === '') {
      return reply('ballet-diary backup service', 200, origin)
    }

    const code = codeFrom(request)
    if (!code) return reply({ error: 'no valid recovery code' }, 401, origin)
    const id = await folderFor(code)
    const latestKey = `u/${id}/latest`
    const metaKey = `u/${id}/meta.json`

    /* ---------- 上传一份 ---------- */
    if (request.method === 'POST' && url.pathname === '/backup') {
      const buf = await request.arrayBuffer()
      if (buf.byteLength === 0) return reply({ error: 'empty body' }, 400, origin)
      if (buf.byteLength > MAX_BYTES) return reply({ error: 'too large' }, 413, origin)

      const gz = request.headers.get('X-Backup-Gzip') === '1' ? '1' : '0'
      const updatedAt = new Date().toISOString()
      const stamp = updatedAt.replace(/[:.]/g, '-')

      await bucket.put(latestKey, buf, {
        httpMetadata: { contentType: 'application/octet-stream' },
        customMetadata: { gzip: gz, updatedAt },
      })
      await bucket.put(`u/${id}/snap/${stamp}`, buf, {
        httpMetadata: { contentType: 'application/octet-stream' },
        customMetadata: { gzip: gz },
      })
      await bucket.put(metaKey, JSON.stringify({ updatedAt, size: buf.byteLength, gzip: gz === '1' }), {
        httpMetadata: { contentType: 'application/json' },
      })

      // 只留最近 KEEP 份历史
      const list = await bucket.list({ prefix: `u/${id}/snap/` })
      const keys = list.objects.map((o) => o.key).sort()
      for (const key of keys.slice(0, Math.max(0, keys.length - KEEP))) {
        await bucket.delete(key)
      }

      return reply({ ok: true, updatedAt }, 200, origin)
    }

    /* ---------- 取回最新一份 ---------- */
    if (request.method === 'GET' && url.pathname === '/backup') {
      const obj = await bucket.get(latestKey)
      if (!obj) return reply({ error: 'nothing here' }, 404, origin)
      return new Response(obj.body, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'no-store',
          'X-Backup-Gzip': obj.customMetadata?.gzip || '0',
          'X-Backup-Updated': obj.customMetadata?.updatedAt || '',
          ...corsHeaders(origin),
        },
      })
    }

    /* ---------- 只看有没有、多久前的 ---------- */
    if (request.method === 'GET' && url.pathname === '/backup/meta') {
      const obj = await bucket.get(metaKey)
      if (!obj) return reply({ exists: false }, 200, origin)
      return reply(await obj.text(), 200, origin)
    }

    return reply({ error: 'not found' }, 404, origin)
  },
}
