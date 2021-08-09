import type { ClientFrame, ServerFrame } from "../common/type"
import {
  encode,
  decode,
  verifyServer,
  MalformedFrameError,
} from "../common/frame"

interface Options {
  readonly host?: string
  readonly clientHeartBeat?: number
  readonly serverHeartBeat?: number
}

function toServerFrame(ev: MessageEvent): ServerFrame | null {
  const data = ev.data
  const length = data.length || data.byteLength
  if (length > 1) {
    const decoded = decode(data)
    if (!verifyServer(decoded)) {
      throw new MalformedFrameError("Unknown command: " + decoded.command)
    }
    return decoded
  } else if (data[0] !== "\n" && data[0] !== 10) {
    throw new Error("Unknown message: " + data)
  }
  return null
}

type Listener = (frame: ServerFrame) => boolean | Promise<boolean>

class Connection {
  private ws?: WebSocket
  private _connected: boolean = false
  private _lastSend: number = 0
  private _lastRecv: number = 0

  constructor(readonly url: string, readonly options?: Options) {}

  send(frame: ClientFrame): void {
    const socket = this.ws
    if (!socket) {
      return
    }
    this._lastSend = Date.now()
    socket.send(encode(frame))
  }

  async listen(fn: Listener): Promise<ServerFrame | undefined> {
    const socket = this.ws
    if (!socket) {
      return undefined
    }

    return new Promise((resolve, reject) => {
      const onclose = () => {
        reject(new Error("Socket closed."))
      }
      const onmessage = (ev: MessageEvent) => {
        try {
          const frame = toServerFrame(ev.data)
          if (!frame) {
            return
          }
          Promise.resolve(fn(frame))
            .then((processed) => {
              if (processed) {
                off()
                resolve(frame)
              }
            })
            .catch((err) => {
              off()
              reject(err)
            })
        } catch (err) {
          off()
          reject(err)
        }
      }
      const off = () => {
        socket.removeEventListener("close", onclose)
        socket.removeEventListener("message", onmessage)
      }
      socket.addEventListener("close", onclose)
      socket.addEventListener("message", onmessage)
    })
  }

  close(): void {
    const socket = this.ws
    if (!socket) {
      return
    }
    socket.close()
  }

  get connected(): boolean {
    return this._connected
  }

  private get host(): string {
    if (this.options?.host) {
      return this.options.host
    }
    const url = new URL(this.url)
    return url.host
  }

  private handleError(frame: ServerFrame | null) {
    if (frame?.command === "ERROR") {
      this.ws?.close()
      throw new Error(frame.headers.message)
    }
  }

  private heartBeat(ws: WebSocket, heartBeat: string) {
    const parts = heartBeat.split(",")
    const sx = parseInt(parts[0], 10)
    const sy = parseInt(parts[1], 10)
    const cx = this.options?.clientHeartBeat || 0
    const cy = this.options?.serverHeartBeat || 0

    const clientHeartBeat = cx && sy ? Math.max(cx, sy) : 0
    const serverHeartBeat = sx && cy ? Math.max(sx, cy) : 0

    if (clientHeartBeat) {
      const interval = setInterval(() => {
        if (Date.now() - this._lastSend > clientHeartBeat / 2) {
          this._lastSend = Date.now()
          ws.send("\n")
        }
      }, clientHeartBeat / 2)

      ws.addEventListener("close", () => {
        clearInterval(interval)
      })
    }

    if (serverHeartBeat) {
      const interval = setInterval(() => {
        if (Date.now() - this._lastRecv > serverHeartBeat * 1.5) {
          ws.close()
        }
      }, serverHeartBeat)

      ws.addEventListener("message", () => {
        this._lastRecv = Date.now()
      })

      ws.addEventListener("close", () => {
        clearInterval(interval)
      })
    }
  }

  async connect() {
    if (
      !this.ws ||
      this.ws.readyState === WebSocket.CLOSING ||
      this.ws.readyState === WebSocket.CLOSED
    ) {
      const ws = new WebSocket(this.url)
      this.ws = ws
      ws.binaryType = "arraybuffer"

      await new Promise<void>((resolve, reject) => {
        const onmessage = (ev: MessageEvent) => {
          try {
            const frame = toServerFrame(ev)
            if (!frame) return

            ws.removeEventListener("message", onmessage)
            this.handleError(frame)

            if (frame.command !== "CONNECTED") {
              throw new Error("Expect CONNECTED frame. Got " + frame.command)
            }
            this._connected = true
            this._lastRecv = Date.now()
            this.heartBeat(ws, frame.headers["heart-beat"] || "0,0")
            resolve()
          } catch (e) {
            console.error(e)
            ws.close()
            reject(e)
          }
        }

        ws.addEventListener("message", onmessage)

        const send = () => {
          this._lastSend = Date.now()
          const cx = this.options?.clientHeartBeat || 0
          const cy = this.options?.serverHeartBeat || 0
          ws.send(
            encode({
              command: "CONNECT",
              headers: {
                "accept-version": "1.2",
                host: this.host,
                "heart-beat": `${cx},${cy}`,
              },
            }),
          )
        }

        if (ws.readyState === WebSocket.OPEN) {
          send()
        } else {
          ws.onopen = send
        }

        ws.addEventListener("close", () => {
          this.ws = undefined
          this._connected = false
          setTimeout(() => {
            this.connect()
          }, 500)
        })
      })
    }
  }
}

export default Connection
