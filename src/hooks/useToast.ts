import { useCallback, useRef, useState } from 'react'

export function useToast() {
  const [msg, setMsg] = useState('')
  const timer = useRef<number | undefined>(undefined)

  const show = useCallback((text: string) => {
    setMsg(text)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(''), 2200)
  }, [])

  return { msg, show }
}
