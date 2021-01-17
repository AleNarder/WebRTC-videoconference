import logDown from 'logdown'
import { WSMessage } from '@/lib/message'

type socketOptions = {
  url: string
  protocols?: string | string[]
}

type signalingEvent = keyof RTCDataChannelEventMap & keyof WebSocketEventMap
class SignalingChannel extends EventTarget {
  private static readonly SIGNALING_EVENTS: Array<signalingEvent> = [
    'close',
    'error',
    'message',
    'open',
  ]
  private readonly _options: socketOptions
  private readonly _logger: logDown.Logger
  // @ts-expect-error
  private _channel: WebSocket | RTCDataChannel
  private handlers: Map<string, EventListenerOrEventListenerObject>

  constructor(socketOptions: socketOptions) {
    super()
    this._options = socketOptions
    this._logger = logDown('sfu:SignalingChannel')
    this.handlers = new Map()
    SignalingChannel.SIGNALING_EVENTS.forEach((event) => {
      const handlerName = `_on${event[0].toUpperCase().concat(event.slice(1))}`
      // @ts-expect-error
      const handler = this[handlerName]?.bind(this)
      if (handler) this.handlers.set(event, handler)
    })
  }

  private _addListeners(channel: RTCDataChannel | WebSocket) {
    this.handlers.forEach(
      (handler: EventListenerOrEventListenerObject, event: string) => {
        channel.addEventListener(event, handler)
      }
    )
  }

  private _removeListeners(channel: RTCDataChannel | WebSocket) {
    this.handlers.forEach(
      (handler: EventListenerOrEventListenerObject, event: string) => {
        channel.removeEventListener(event, handler)
      }
    )
  }
  // @ts-expect-error ts(6133)
  private _onOpen(ev: Event) {
    this._logger.log('connection opened')
    this.dispatchEvent(new Event('open'))
  }
  // @ts-expect-error ts(6133)
  private _onClose() {
    this._removeListeners(this._channel)
    this._logger.log('signaling connection closed')
    this.dispatchEvent(new Event('close'))
  }
  // @ts-expect-error ts(6133)
  private _onMessage(ev: MessageEvent) {
    try {
      const message = JSON.parse(ev.data)
      this._logger.log(`received message, ${message.type}`)
      this.dispatchEvent(new CustomEvent('message', { detail: message }))
    } catch (e) {
      this._logger.error(e)
    }
  }
  // @ts-expect-error ts(6133)
  private _onError() {
    this._logger.error('Connection failed')
    this.dispatchEvent(new Event('error'))
  }

  connect(username: string, meetingId?: string) {
    if (!this._channel) {
      this._logger.log('connecting...')
      const { url, protocols } = this._options
      const upgradedUrl = `${url}/?payload=${encodeURI(
        JSON.stringify({ username, meetingId })
      )}`
      this._channel = new WebSocket(upgradedUrl, protocols)
      this._addListeners(this._channel)
    }
  }

  upgrade(channel: RTCDataChannel) {
    const oldChannel = this._channel
    this._addListeners(channel)
    this._removeListeners(oldChannel)
    this._channel = channel
    this._logger.log('Channel upgraded')
    oldChannel.close()
  }

  sendMessage(message: WSMessage): void {
    this._logger.log('send message', message.type)
    this._channel.send(JSON.stringify(message))
  }

  close(): void {
    this._channel.close()
  }
}

export { socketOptions, SignalingChannel }
