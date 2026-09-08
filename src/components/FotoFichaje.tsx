import { useEffect, useState } from 'react'
import { getFotoDisplayUrl } from '../lib/supabase'

export function FotoFichaje({ fotoUrl, className, alt, onClick }: { fotoUrl: string | null, className?: string, alt?: string, onClick?: () => void }) {
  const [src, setSrc] = useState<string | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let cancel = false
    if (!fotoUrl) { setSrc(null); return }
    getFotoDisplayUrl(fotoUrl).then(url => { if (!cancel) setSrc(url) }).catch(() => setErr(true))
    return () => { cancel = true }
  }, [fotoUrl])
  if (!fotoUrl) return <div className={className + ' bg-gray-100 grid place-items-center text-gray-400 text-xs'}>—</div>
  if (err) return <div className={className + ' bg-red-50 grid place-items-center text-red-400 text-xs'}>Error</div>
  if (!src) return <div className={className + ' bg-gray-100 animate-pulse'} />
  return <img src={src} className={className} alt={alt ?? ''} onClick={onClick} loading="lazy" onError={()=>setErr(true)} />
}

export function useFotoUrl(fotoUrl: string | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!fotoUrl) { setUrl(null); return }
    let cancel = false
    getFotoDisplayUrl(fotoUrl).then(u => { if (!cancel) setUrl(u) })
    return () => { cancel = true }
  }, [fotoUrl])
  return url
}
