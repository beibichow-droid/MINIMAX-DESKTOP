import { useEffect, useRef, useState } from 'react'
import { Film, Music2 } from 'lucide-react'

const posters = new Map<string, string>()

export function MovieMediaThumbnail({ source, audio = false }: { source: string; audio?: boolean }) {
  const host = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const [poster, setPoster] = useState(() => posters.get(source))
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const element = host.current
    if (!element || audio) return
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() } }, { rootMargin: '80px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [audio])
  return <span className="movie-media-thumbnail" ref={host} aria-hidden="true">
    {audio ? <Music2 size={22} /> : poster ? <img src={poster} alt="" /> : visible && !failed ? <video src={source} muted playsInline preload="metadata" onError={() => setFailed(true)} onLoadedData={event => {
      const video = event.currentTarget
      if (!video.videoWidth || !video.videoHeight) return
      try {
        const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = Math.round(240 * video.videoHeight / video.videoWidth)
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
        const next = canvas.toDataURL('image/jpeg', .7)
        if (posters.size >= 120) posters.delete(posters.keys().next().value!)
        posters.set(source, next); setPoster(next)
      } catch { /* Cross-origin sources retain their decoded video thumbnail. */ }
    }} /> : <Film size={22} />}
  </span>
}
