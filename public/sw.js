/*
 * 芭蕾手账的离线缓存。
 * 装到主屏幕后，舞房没信号也能打开；有网时照样拿最新版。
 *
 * 策略：
 * - 打开页面：先联网，拿不到就用上次存下的那份；
 * - 打包出来的 js/css/图片：文件名带哈希、内容不会再变，直接吃缓存。
 * 数据一点都没碰——记录仍然只在这台手机里。
 */

const CACHE = 'ballet-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await cache.addAll(['/manifest.webmanifest', '/icon.svg', '/icon-180.png']).catch(() => {})
      try {
        // 把当前这一版的页面和它引用的 js/css 一起存下来，
        // 这样第一次联网打开过，之后就能离线开
        const res = await fetch('/index.html', { cache: 'reload' })
        const html = await res.clone().text()
        await cache.put('/index.html', res)
        const files = [...html.matchAll(/["'](\/assets\/[^"']+)["']/g)].map((m) => m[1])
        await cache.addAll([...new Set(files)])
      } catch {
        // 没网就等下次再说
      }
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('ballet-') && k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // 页面本身：联网优先，断了网回落到来过的那一版
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put('/index.html', copy))
          }
          return res
        })
        .catch(() =>
          caches.match('/index.html').then((hit) => hit || caches.match('/')),
        ),
    )
    return
  }

  // 其他同源文件：有缓存先用，没有就取一份顺手存下
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
    }),
  )
})
