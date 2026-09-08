// Celebración sutil prolija - confetti + vibración
export function celebrarFichaje() {
  try { navigator.vibrate?.(40) } catch {}
  // confetti ligero sin librería
  const colors = ['#163A5F', '#2E6F9E', '#14C3B0', '#F4791E']
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.inset = '0'
  container.style.pointerEvents = 'none'
  container.style.zIndex = '9998'
  document.body.appendChild(container)
  for (let i = 0; i < 18; i++) {
    const el = document.createElement('div')
    el.style.position = 'absolute'
    el.style.left = Math.random() * 100 + '%'
    el.style.top = '-10px'
    el.style.width = '6px'
    el.style.height = '10px'
    el.style.background = colors[i % colors.length]
    el.style.opacity = '0.9'
    el.style.borderRadius = '2px'
    el.style.transform = `rotate(${Math.random() * 360}deg)`
    el.style.transition = `transform 900ms ease-out, top 900ms ease-out, opacity 900ms`
    container.appendChild(el)
    requestAnimationFrame(() => {
      el.style.top = 60 + Math.random() * 40 + '%'
      el.style.transform = `rotate(${720 + Math.random() * 360}deg) translateX(${(Math.random() - 0.5) * 100}px)`
      el.style.opacity = '0'
    })
  }
  setTimeout(() => container.remove(), 1000)
}
