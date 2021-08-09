import WebSocket from "ws"
import http from "http"
import {
  decode,
  verifyClient,
  MalformedFrameError,
  encode,
} from "../common/frame"
import { ClientFrame, ConnectFrame, ServerFrame } from "../common/type"

interface Options {
  readonly server: http.Server
  readonly path?: string
  readonly clientHeartBeat?: number
  readonly serverHeartBeat?: number
  readonly getSession: (frame: ConnectFrame) => string | Promise<string>
  readonly onClose: (session: string) => void
}

type Listener = (
  frame: ClientFrame,
  session: string,
) => boolean | Promise<boolean>
type ListenerObj = [Listener, (frame: ClientFrame) => void, (err: any) => void]

function toClientFrame(data: any): ClientFrame | null {
  if (data.length > 1) {
    const decoded = decode(data)
    if (!verifyClient(decoded)) {
      throw new MalformedFrameError("Unknown command: " + decoded.command)
    }
    return decoded
  } else if (data[0] !== "\n" && data[0] !== 10) {
    throw new Error("Unknown message: " + data)
  }
  return null
}

class Server {
  private wss?: WebSocket.Server
  private readonly _sockets: Record<string, WebSocket> = {}
  private readonly _listeners: ListenerObj[] = []
  private readonly _sessionListeners: Record<string, ListenerObj[]> = {}

  constructor(readonly options: Options) {}

  send(session: string, frame: ServerFrame): void {
    const socket = this._getSocket(session)
    if (!socket) {
      return
    }
    socket.send(encode(frame))
  }

  async listen(session: string, fn: Listener): Promise<ClientFrame>
  async listen(fn: Listener): Promise<ClientFrame>
  async listen(arg0: string | Listener, arg1?: Listener): Promise<ClientFrame> {
    return new Promise((resolve, reject) => {
      if (typeof arg0 === "string") {
        if (this._sessionListeners[arg0]) {
          this._sessionListeners[arg0].push([arg1 as Listener, resolve, reject])
        } else {
          this._sessionListeners[arg0] = [[arg1 as Listener, resolve, reject]]
        }
      } else {
        this._listeners.push([arg0, resolve, reject])
      }
    })
  }

  close(session: string): void {
    const socket = this._getSocket(session)
    if (!socket) {
      return
    }
    socket.close()
  }

  private _getSocket(session: string): WebSocket | undefined {
    return this._sockets[session]
  }

  private heartBeat(
    ws: WebSocket,
    heartBeat: string,
    status: { lastSend: number; lastRecv: number },
  ) {
    const parts = heartBeat.split(",")
    const cx = parseInt(parts[0], 10)
    const cy = parseInt(parts[1], 10)
    const sx = this.options.serverHeartBeat || 0
    const sy = this.options.clientHeartBeat || 0

    const clientHeartBeat = cx && sy ? Math.max(cx, sy) : 0
    const serverHeartBeat = sx && cy ? Math.max(sx, cy) : 0

    if (serverHeartBeat) {
      const interval = setInterval(() => {
        if (Date.now() - status.lastSend > serverHeartBeat / 2) {
          ws.send("\n")
        }
      }, serverHeartBeat / 2)

      const origSend = ws.send

      ws.send = (...args: any) => {
        status.lastSend = Date.now()
        origSend.apply(ws, args)
      }

      ws.addEventListener("close", () => {
        clearInterval(interval)
      })
    }

    if (clientHeartBeat) {
      const interval = setInterval(() => {
        if (Date.now() - status.lastRecv > clientHeartBeat * 1.5) {
          ws.close()
        }
      }, clientHeartBeat)

      ws.addEventListener("message", () => {
        status.lastRecv = Date.now()
      })

      ws.addEventListener("close", () => {
        clearInterval(interval)
      })
    }
  }

  start() {
    const wss = new WebSocket.Server({
      server: this.options.server,
      path: this.options.path,
    })

    wss.on("connection", (ws) => {
      const status = {
        lastSend: 0,
        lastRecv: 0,
      }

      const terminate = setTimeout(() => {
        ws.close()
      }, this.options.clientHeartBeat || 5000)

      const onconnect = (data: WebSocket.Data) => {
        try {
          const frame = toClientFrame(data as any)
          if (!frame) {
            throw new Error("Unexpected heart beat before CONNECT.")
          }
          if (frame.command !== "CONNECT") {
            throw new Error(
              "Unexpected frame " + frame.command + " before CONNECT.",
            )
          }
          clearTimeout(terminate)
          ws.off("message", onconnect)

          Promise.resolve(this.options.getSession(frame))
            .then((session) => {
              this._sockets[session] = ws
              const sx = this.options.serverHeartBeat || 0
              const sy = this.options.clientHeartBeat || 0

              status.lastRecv = Date.now()
              status.lastSend = Date.now()

              ws.send(
                encode({
                  command: "CONNECTED",
                  headers: {
                    version: "1.2",
                    session: session,
                    "heart-beat": `${sx},${sy}`,
                  },
                }),
              )

              this.heartBeat(ws, frame.headers["heart-beat"] || "0,0", status)

              const onmessage = (data: WebSocket.Data) => {
                try {
                  const frame = toClientFrame(data as any)
                  if (!frame) {
                    return
                  }

                  function listen(list: ListenerObj[]) {
                    if (!frame) {
                      return
                    }
                    for (const obj of list) {
                      const [fn, resolve, reject] = obj
                      const off = () => {
                        const index = list.indexOf(obj)
                        if (index !== -1) {
                          list.splice(index, 1)
                        }
                      }
                      Promise.resolve(fn(frame, session))
                        .then((processed) => {
                          if (processed) {
                            resolve(frame)
                            off()
                          }
                        })
                        .catch((err) => {
                          reject(err)
                          off()
                        })
                    }
                  }

                  listen(this._listeners)

                  const listeners = this._sessionListeners[session]
                  if (listeners) {
                    listen(listeners)
                  }
                } catch (err) {
                  ws.send(
                    encode({
                      command: "ERROR",
                      headers: {
                        message: err.message,
                      },
                    }),
                  )
                  ws.close()
                }
              }
              ws.on("message", onmessage)

              ws.on("close", () => {
                this.options.onClose(session)
                if (this._sessionListeners[session]) {
                  for (const obj of this._sessionListeners[session]) {
                    obj[2](new Error("Socket closed"))
                  }
                }
                delete this._sessionListeners[session]
                delete this._sockets[session]
                clearTimeout(terminate)
              })
            })
            .catch((err) => {
              ws.send(
                encode({
                  command: "ERROR",
                  headers: {
                    message: err.message,
                  },
                }),
              )
              ws.close()
            })
        } catch (err) {
          ws.send(
            encode({
              command: "ERROR",
              headers: {
                message: err.message,
              },
            }),
          )
          ws.close()
        }
      }

      ws.on("message", onconnect)
    })
    this.wss = wss
  }

  stop() {
    if (this.wss) {
      this.wss.close()
    }
  }
}

export default Server
