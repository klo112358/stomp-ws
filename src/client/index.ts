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

  constructor(readonly url: string, readonly options?: Options) {}

  send(frame: ClientFrame): void {
    const socket = this.ws
    if (!socket) {
      return
    }
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
      socket.addEventListener("close", onclose)
      socket.addEventListener("message", (data) => {
        try {
          const frame = toServerFrame(data as any)
          if (!frame) {
            return
          }
          Promise.resolve(fn(frame))
            .then((processed) => {
              if (processed) {
                socket.removeEventListener("close", onclose)
                resolve(frame)
              }
            })
            .catch((err) => {
              socket.removeEventListener("close", onclose)
              reject(err)
            })
        } catch (err) {
          socket.removeEventListener("close", onclose)
          reject(err)
        }
      })
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
            resolve()
          } catch (e) {
            console.error(e)
            ws.close()
            reject(e)
          }
        }

        ws.addEventListener("message", onmessage)

        const send = () => {
          ws.send(
            encode({
              command: "CONNECT",
              headers: {
                "accept-version": "1.2",
                host: this.host,
              },
            }),
          )
        }

        if (ws.readyState === WebSocket.OPEN) {
          send()
        } else {
          ws.onopen = send
        }

        ws.onclose = () => {
          this.ws = undefined
          this._connected = false
          this.connect()
        }
      })
    }
  }
}

export default Connection
