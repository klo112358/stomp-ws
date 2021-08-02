import type { Message } from "../common/type"

const EOL = "\n"

function escape(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/:/g, "\\c")
}

export function encode(message: Message) {
  const { command, headers, body } = message
  let str = command + EOL
  if (headers) {
    for (const key in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, key)) {
        str += escape(key) + ":" + escape(headers[key]) + "\n"
      }
    }
  }
  return str + "\n" + (body || "") + "\0"
}
