import { io, type Socket } from 'socket.io-client'
import { getAccessToken } from './http'

let socket: Socket | null = null

/**
 * One socket per tab, created outside components. The token is read lazily so
 * reconnects always use the current access token.
 */
export function getRealtimeSocket(): Socket {
  if (!socket) {
    socket = io(import.meta.env.VITE_WS_URL || window.location.origin, {
      autoConnect: false,
      auth: (callback) => callback({ token: getAccessToken() ?? '' }),
    })
  }

  return socket
}
