type messageType =
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'data-channel'
  | 'negotiate'
  | 'info'
  | 'error'
  | 'joined'
  | 'new-track'
  | 'connected'
  | 'close'
  | null

type messagePayload = any | null

interface WSMessage {
  type: messageType
  payload: messagePayload
  datetime: number
}

function createMessage(
  type?: messageType,
  payload?: messagePayload
): WSMessage {
  const message = {} as WSMessage
  message.type = type ?? null
  message.payload = payload ?? null
  return message
}

export { createMessage, WSMessage }
