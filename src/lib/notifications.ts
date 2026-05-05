export interface VortexNotification {
  id: string
  title: string
  message: string
  type: 'info' | 'success' | 'error' | 'warning'
  timestamp: number
}

export function notify(
  title: string,
  message: string,
  type: VortexNotification['type'] = 'info'
) {
  const detail: VortexNotification = { 
    id: Math.random().toString(36).substring(2, 11) + Date.now(), 
    title, 
    message, 
    type, 
    timestamp: Date.now() 
  }
  window.dispatchEvent(new CustomEvent('vortex-notify', { detail }))
}
