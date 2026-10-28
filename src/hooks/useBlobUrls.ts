import { useEffect, useState } from 'react'

// 把 Blob 数组转成可渲染的 object URL，并在变化/卸载时回收，避免内存泄漏
export function useBlobUrls(blobs: Blob[]): string[] {
  const [urls, setUrls] = useState<string[]>([])

  useEffect(() => {
    const us = blobs.map((b) => URL.createObjectURL(b))
    setUrls(us)
    return () => us.forEach((u) => URL.revokeObjectURL(u))
  }, [blobs])

  return urls
}
