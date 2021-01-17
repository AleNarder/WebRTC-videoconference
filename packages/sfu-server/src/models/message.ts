/* eslint-disable prefer-rest-params */

type messageType =
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'negotiate'
  | 'info'
  | 'error'
  | 'joined'
  | 'connected'
  | 'sync'
  | 'local-track'
  | 'close'
  | 'track'
  | 'username'

type infoAction = 'left' | 'join'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type messagePayload = any | null | { action: infoAction; info: messagePayload }

interface WSMessage {
  type: messageType
  payload: messagePayload
  datetime: number
}

function createMessage(type?: messageType, payload?: messagePayload): WSMessage {
  const message = {} as WSMessage
  message.type = type ?? null
  message.payload = payload ?? null
  return message
}

export { createMessage, WSMessage, messageType }
