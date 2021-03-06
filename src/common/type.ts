export interface GenericFrame {
  command: string
  headers?: Record<string, string | undefined>
  body?: Uint8Array
}

// Client Frames
export interface ConnectFrame {
  command: "CONNECT"
  headers: {
    "accept-version": "1.2"
    host: string
    login?: string
    passcode?: string
    "heart-beat"?: string
  }
  body?: undefined
}

export interface SendFrame {
  command: "SEND"
  headers: {
    destination: string
    transaction?: string
    receipt?: string
    "content-type"?: string
    [additional: string]: string | undefined
  }
  body?: Uint8Array
}

export interface SubscribeFrame {
  command: "SUBSCRIBE"
  headers: {
    destination: string
    id: string
    ack?: "auto" | "client" | "client-individual"
    receipt?: string
  }
  body?: undefined
}

export interface UnsubscribeFrame {
  command: "UNSUBSCRIBE"
  headers: {
    id: string
    receipt?: string
  }
  body?: undefined
}

export interface AckFrame {
  command: "ACK"
  headers: {
    id: string
    transaction?: string
    receipt?: string
  }
  body?: undefined
}

export interface NackFrame {
  command: "NACK"
  headers: {
    id: string
    transaction?: string
    receipt?: string
  }
  body?: undefined
}

export interface BeginFrame {
  command: "BEGIN"
  headers: {
    transaction: string
    receipt?: string
  }
  body?: undefined
}

export interface CommitFrame {
  command: "COMMIT"
  headers: {
    transaction: string
    receipt?: string
  }
  body?: undefined
}

export interface AbortFrame {
  command: "ABORT"
  headers: {
    transaction: string
    receipt?: string
  }
  body?: undefined
}

export interface DisconnectFrame {
  command: "DISCONNECT"
  headers: {
    receipt?: string
  }
  body?: undefined
}

export type ClientFrame =
  | ConnectFrame
  | SendFrame
  | SubscribeFrame
  | UnsubscribeFrame
  | AckFrame
  | NackFrame
  | BeginFrame
  | CommitFrame
  | AbortFrame
  | DisconnectFrame

// Server Frames
export interface ConnectedFrame {
  command: "CONNECTED"
  headers: {
    version: "1.2"
    session?: string
    server?: string
    "heart-beat"?: string
  }
  body?: undefined
}

export interface MessageFrame {
  command: "MESSAGE"
  headers: {
    destination: string
    "message-id": string
    subscription: string
    ack?: string
    "content-type"?: string
    [additional: string]: string | undefined
  }
  body?: Uint8Array
}

export interface ReceiptFrame {
  command: "RECEIPT"
  headers: {
    "receipt-id": string
  }
  body?: undefined
}

export interface ErrorFrame {
  command: "ERROR"
  headers: {
    message?: string
    "content-type"?: string
    [additional: string]: string | undefined
  }
  body?: Uint8Array
}

export type ServerFrame =
  | ConnectedFrame
  | MessageFrame
  | ReceiptFrame
  | ErrorFrame

export type Frame = ClientFrame | ServerFrame
