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

type Listener = (frame: ClientFrame) => boolean | Promise<boolean>

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

  constructor(readonly options: Options) {}

  send(session: string, frame: ServerFrame): void {
    const socket = this._getSocket(session)
    if (!socket) {
      return
    }
    socket.send(encode(frame))
  }

  async listen(
    session: string,
    fn: Listener,
  ): Promise<ClientFrame | undefined> {
    const socket = this._getSocket(session)
    if (!socket) {
      return undefined
    }

    return new Promise((resolve, reject) => {
      const onclose = () => {
        reject(new Error("Socket closed."))
      }
      socket.on("close", onclose)
      socket.on("message", (data) => {
        try {
          const frame = toClientFrame(data as any)
          if (!frame) {
            return
          }
          Promise.resolve(fn(frame))
            .then((processed) => {
              if (processed) {
                resolve(frame)
                socket.off("close", onclose)
              }
            })
            .catch((err) => {
              reject(err)
              socket.off("close", onclose)
            })
        } catch (err) {
          socket.send(
            encode({
              command: "ERROR",
              headers: {
                message: err.message,
              },
            }),
          )
          socket.close()
          reject(err)
        }
      })
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

  start() {
    const wss = new WebSocket.Server({
      server: this.options.server,
      path: this.options.path,
    })

    wss.on("connection", (ws) => {
      const status = {
        connected: false,
        lastSeen: Date.now(),
      }

      const terminate = setTimeout(() => {
        if (!status.connected) {
          ws.close()
        }
      }, this.options.clientHeartBeat || 5000)

      ws.on("message", (data) => {
        try {
          const frame = toClientFrame(data as any)
          status.lastSeen = Date.now()
          if (!frame) {
            return
          }
          console.log(frame)
          if (frame.command === "CONNECT") {
            if (status.connected) {
              throw new Error("Unexpected frame CONNECT.")
            }
            Promise.resolve(this.options.getSession(frame))
              .then((session) => {
                this._sockets[session] = ws
                status.connected = true
                const serverHeartBeat = this.options.serverHeartBeat || 0
                const clientHeartBeat = this.options.clientHeartBeat || 0

                ws.send(
                  encode({
                    command: "CONNECTED",
                    headers: {
                      version: "1.2",
                      session: session,
                      "heart-beat": `${serverHeartBeat},${clientHeartBeat}`,
                    },
                  }),
                )

                ws.on("close", () => {
                  this.options.onClose(session)
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
          } else if (!status.connected) {
            throw new Error(
              "Unexpected frame " + frame.command + " before CONNECT.",
            )
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
      })
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
