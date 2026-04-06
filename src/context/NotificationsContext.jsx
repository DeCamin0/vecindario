/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useAuth } from './AuthContext'
import { apiUrl, jsonAuthHeaders, realtimeWsUrl } from '../config/api.js'
import { tryRegisterWebPush } from '../lib/webPushRegister.js'

const NotificationsContext = createContext(null)

const POLL_MS = 120000

export function NotificationsProvider({ children }) {
  const { accessToken } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const [items, setItems] = useState([])
  const [loadingList, setLoadingList] = useState(false)

  const refreshUnread = useCallback(async () => {
    if (!accessToken) {
      setUnreadCount(0)
      return
    }
    try {
      const res = await fetch(apiUrl('/api/notifications/unread-count'), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && typeof data.count === 'number') setUnreadCount(data.count)
    } catch {
      /* ignore */
    }
  }, [accessToken])

  const refreshList = useCallback(async () => {
    if (!accessToken) {
      setItems([])
      return
    }
    setLoadingList(true)
    try {
      const res = await fetch(apiUrl('/api/notifications?limit=50'), {
        headers: jsonAuthHeaders(accessToken),
      })
      const data = await res.json().catch(() => [])
      if (res.ok && Array.isArray(data)) setItems(data)
    } catch {
      /* ignore */
    } finally {
      setLoadingList(false)
    }
  }, [accessToken])

  useEffect(() => {
    if (!accessToken) {
      setUnreadCount(0)
      setItems([])
      return
    }
    void refreshUnread()
    void tryRegisterWebPush(accessToken)
    const id = window.setInterval(() => void refreshUnread(), POLL_MS)
    const onVis = () => {
      if (!document.hidden) void refreshUnread()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [accessToken, refreshUnread])

  useEffect(() => {
    if (!accessToken) return
    let ws
    let alive = true
    let reconnectTimer
    const connect = () => {
      if (!alive) return
      try {
        ws = new WebSocket(realtimeWsUrl())
      } catch {
        reconnectTimer = window.setTimeout(connect, 4000)
        return
      }
      ws.onopen = () => {
        try {
          ws.send(JSON.stringify({ type: 'auth', token: accessToken }))
        } catch {
          /* ignore */
        }
      }
      ws.onmessage = (ev) => {
        try {
          const j = JSON.parse(ev.data)
          if (j.t === 'vecindario:notifications' && j.a === 'refresh') {
            void refreshUnread()
            void refreshList()
          }
        } catch {
          /* ignore */
        }
      }
      ws.onclose = () => {
        if (!alive) return
        reconnectTimer = window.setTimeout(connect, 3500)
      }
      ws.onerror = () => {
        try {
          ws.close()
        } catch {
          /* ignore */
        }
      }
    }
    connect()
    return () => {
      alive = false
      window.clearTimeout(reconnectTimer)
      try {
        ws?.close()
      } catch {
        /* ignore */
      }
    }
  }, [accessToken, refreshUnread, refreshList])

  const markRead = useCallback(
    async (notificationId) => {
      if (!accessToken) return
      try {
        const res = await fetch(apiUrl(`/api/notifications/${notificationId}/read`), {
          method: 'PATCH',
          headers: jsonAuthHeaders(accessToken),
        })
        if (res.ok) {
          setItems((prev) =>
            prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n)),
          )
          await refreshUnread()
        }
      } catch {
        /* ignore */
      }
    },
    [accessToken, refreshUnread],
  )

  const markAllRead = useCallback(async () => {
    if (!accessToken) return
    try {
      const res = await fetch(apiUrl('/api/notifications/mark-all-read'), {
        method: 'POST',
        headers: jsonAuthHeaders(accessToken),
      })
      if (res.ok) {
        setItems((prev) => prev.map((n) => ({ ...n, read: true })))
        setUnreadCount(0)
      }
    } catch {
      /* ignore */
    }
  }, [accessToken])

  const value = useMemo(
    () => ({
      unreadCount,
      items,
      loadingList,
      refreshUnread,
      refreshList,
      markRead,
      markAllRead,
    }),
    [unreadCount, items, loadingList, refreshUnread, refreshList, markRead, markAllRead],
  )

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) {
    throw new Error('useNotifications debe usarse dentro de NotificationsProvider')
  }
  return ctx
}
