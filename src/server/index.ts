import type { Message } from "../common/type"

const EOL = "\n"

function unescape(str: string): string {
  return str
    .replace(/\\\\/g, "\\")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\c/g, ":")
}

export function decode(message: string) {
  let cursor = 0
  function getNextLine() {
    if (cursor < 0) {
      throw new Error("Unexpected EOF")
    }
    const index = message.indexOf(EOL, cursor)
    if (index === -1) {
      return message.slice(cursor)
    }
    const line = message.slice(cursor, index)
    cursor = index + EOL.length
    return line
  }
}
