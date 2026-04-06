import type { Server } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { verifyAccessToken } from './jwt.js'

const byUser = new Map<number, Set<WebSocket>>()

export const realtimeHub = {
  register(ws: WebSocket, userId: number) {
    let set = byUser.get(userId)
    if (!set) {
      set = new Set()
      byUser.set(userId, set)
    }
    set.add(ws)
    ws.on('close', () => {
      set!.delete(ws)
      if (set!.size === 0) byUser.delete(userId)
    })
  },

  emitNotificationRefresh(userIds: number[]) {
    const msg = JSON.stringify({ v: 1, t: 'vecindario:notifications', a: 'refresh' })
    for (const uid of new Set(userIds)) {
      if (!Number.isInteger(uid) || uid < 1) continue
      const set = byUser.get(uid)
      if (!set) continue
      for (const sock of set) {
        try {
          if (sock.readyState === WebSocket.OPEN) sock.send(msg)
        } catch {
          /* ignore */
        }
      }
    }
  },
}

/** Upgrade path: `/api/realtime` (JWT en primer mensaje JSON `{ type: 'auth', token }`). */
export function attachRealtimeConnections(server: Server) {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    const host = req.headers.host ?? 'localhost'
    let pathname: string
    try {
      pathname = new URL(req.url ?? '/', `http://${host}`).pathname
    } catch {
      return
    }
    if (pathname !== '/api/realtime') {
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      handleNewSocket(ws)
    })
  })
}

function handleNewSocket(ws: WebSocket) {
  let authed = false
  const t = setTimeout(() => {
    if (!authed) {
      try {
        ws.close()
      } catch {
        /* ignore */
      }
    }
  }, 12_000)

  ws.on('message', (data) => {
    if (authed) return
    try {
      const j = JSON.parse(String(data)) as { type?: string; token?: string }
      if (j.type !== 'auth' || !j.token || typeof j.token !== 'string') return
      const payload = verifyAccessToken(j.token)
      const id = Number(payload.sub)
      if (!Number.isInteger(id) || id < 1) {
        ws.close()
        return
      }
      authed = true
      clearTimeout(t)
      realtimeHub.register(ws, id)
      ws.send(JSON.stringify({ v: 1, t: 'vecindario:realtime', a: 'ready' }))
    } catch {
      try {
        ws.close()
      } catch {
        /* ignore */
      }
    }
  })

  ws.on('close', () => clearTimeout(t))
}
