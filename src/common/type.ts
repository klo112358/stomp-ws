export interface Message {
  command: string
  headers?: Record<string, string>
  body?: string
}
