import { ClientFrame, Frame, GenericFrame, ServerFrame } from "./type"

export class MalformedFrameError extends Error {
  constructor(message: string) {
    super(message)
    Object.setPrototypeOf(this, MalformedFrameError.prototype)
  }
}

const EOL = "\n"
const EOLCode = EOL.charCodeAt(0)

const textDecoder = new TextDecoder()

const textEncoder = new TextEncoder()

function escape(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/:/g, "\\c")
}

function unescape(str: string): string {
  return str
    .replace(/\\\\/g, "\\")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\c/g, ":")
}

export function encode(frame: Frame): Uint8Array {
  const { command, headers, body } = frame
  let str = command + EOL
  if (headers) {
    for (const key in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, key)) {
        str +=
          escape(key) +
          ":" +
          escape((headers as Record<string, string>)[key]) +
          EOL
      }
    }
  }
  if (body) {
    const length = body.length
    const s = textEncoder.encode(str + "content-length:" + length + EOL + EOL)
    const combined = new Uint8Array(s.length + length + 1)
    combined.set(s)
    combined.set(body, s.length)
    combined[s.length + length] = 0
    return combined
  } else {
    return textEncoder.encode(str + EOL + "\0")
  }
}

export function decode(bytes: ArrayBuffer | string): GenericFrame {
  const buffer =
    typeof bytes === "string"
      ? textEncoder.encode(bytes)
      : new Uint8Array(bytes)
  if (buffer[buffer.length - 1] !== 0) {
    throw new MalformedFrameError(
      "Frame is not terminated with a NULL character.",
    )
  }
  let cursor = 0
  function getLine() {
    let index = cursor
    while (index < buffer.length && buffer[index] !== EOLCode) {
      index += 1
    }
    if (index >= buffer.length) {
      return textDecoder.decode(buffer.slice(cursor))
    }
    const line = textDecoder.decode(buffer.slice(cursor, index))
    cursor = index + EOL.length
    return line
  }

  const command = getLine()
  let headerLine = getLine()
  const msg: GenericFrame = { command }

  while (headerLine) {
    const parts = headerLine.split(":")
    if (parts.length !== 2) {
      throw new MalformedFrameError("Contain an invalid header.")
    }
    const key = unescape(parts[0])
    if (!msg.headers) {
      msg.headers = {}
    }
    if (!msg.headers[key]) {
      const value = unescape(parts[1])
      msg.headers[key] = value
    }
    headerLine = getLine()
  }

  const body = buffer.slice(cursor, -1)
  if (body.length) {
    msg.body = body
  }
  return msg
}

function verifyHeader(
  frame: GenericFrame,
  required: string[],
  optional?: true | string[],
) {
  const h = { ...frame.headers }
  for (const key of required) {
    if (h[key] !== undefined) {
      delete h[key]
    } else {
      throw new MalformedFrameError("Did not contain " + key + " header.")
    }
  }
  if (optional === true) {
    return
  } else if (optional) {
    for (const key of optional) {
      if (h[key] !== undefined) {
        delete h[key]
      }
    }
  }

  const extra = Object.keys(h)
  if (extra.length > 0) {
    throw new MalformedFrameError(
      "Contain extra header: " + extra.join(", ") + ".",
    )
  }
}

function noBody(frame: GenericFrame) {
  if (frame.body) {
    throw new MalformedFrameError("Contain body in " + frame.command + ".")
  }
}

export function verifyClient(frame: GenericFrame): frame is ClientFrame {
  const { command } = frame
  if (command === "CONNECT") {
    noBody(frame)
    verifyHeader(
      frame,
      ["accept-version", "host"],
      ["login", "passcode", "heart-beat"],
    )
  } else if (command === "SEND") {
    verifyHeader(frame, ["destination"], true)
  } else if (command === "SUBSCRIBE") {
    noBody(frame)
    verifyHeader(frame, ["destination", "id"], ["ack", "receipt"])
    if (
      frame.headers?.ack &&
      !["auto", "client", "client-individual"].includes(frame.headers.ack)
    ) {
      throw new MalformedFrameError(
        "Contain unknown ack option: " + frame.headers.ack + ".",
      )
    }
  } else if (command === "UNSUBSCRIBE") {
    noBody(frame)
    verifyHeader(frame, ["id"], ["receipt"])
  } else if (command === "ACK" || command === "NACK") {
    noBody(frame)
    verifyHeader(frame, ["id"], ["transaction", "receipt"])
  } else if (
    command === "BEGIN" ||
    command === "COMMIT" ||
    command === "ABORT"
  ) {
    noBody(frame)
    verifyHeader(frame, ["transaction"], ["receipt"])
  } else if (command === "DISCONNECT") {
    noBody(frame)
    verifyHeader(frame, [], ["receipt"])
  } else {
    return false
  }
  return true
}

export function verifyServer(frame: GenericFrame): frame is ServerFrame {
  const { command } = frame
  if (command === "CONNECTED") {
    noBody(frame)
    verifyHeader(frame, ["version"], ["session", "server", "heart-beat"])
  } else if (command === "MESSAGE") {
    verifyHeader(frame, ["destination"], true)
  } else if (command === "RECEIPT") {
    noBody(frame)
    verifyHeader(frame, ["receipt-id"])
  } else if (command === "ERROR") {
    verifyHeader(frame, [], true)
  } else {
    return false
  }
  return true
}
