import { EventEmitter } from 'events'
import * as WebSocket from 'ws'
import { WSMessage } from './message'
import Debug from 'debug'

const debug = Debug('sfu:SignalingChannel')
type signalingEvent = keyof RTCDataChannelEventMap & keyof WebSocketEventMap

/**
 *
 */
export default class SignalingChannel extends EventEmitter {
  private dc: RTCDataChannel
  private ws: WebSocket
  private channel: WebSocket | RTCDataChannel
  private static readonly SIGNALING_EVENTS: Array<signalingEvent> = ['close', 'error', 'message', 'open']
  private handlers: Map<signalingEvent, EventListenerOrEventListenerObject>
  private upgraded: boolean

  constructor(ws: WebSocket, dc: RTCDataChannel) {
    super()
    this.ws = ws
    this.dc = dc
    this.channel = this.ws
    this.handlers = new Map()
    this.upgraded = false
    SignalingChannel.SIGNALING_EVENTS.forEach((event) => {
      const handlerName = `on${event[0].toUpperCase().concat(event.slice(1))}`
      const handler = this[handlerName]?.bind(this)
      if (handler) this.handlers.set(event, handler)
    })
    this.dc.addEventListener('open', this.handlers.get('open'))
    this.addListeners(this.ws)
  }

  /**
   * Sends a message to the client
   * @param { WSMessage } message - the message to send
   */
  sendMessage(message: WSMessage): void {
    this.channel.send(JSON.stringify(message))
    debug(`sent message ${message.type}`)
  }

  /**
   * Force channel close
   */
  close(): void {
    debug('closing channel...')
    this.channel.close()
  }

  /**
   * The handler for the 'open' event. Attached only to the datachannel 'open' event
   */
  private onOpen() {
    if (this.channel) {
      this.channel = this.dc
      this.upgraded = true
      this.addListeners(this.dc)
      debug('channel upgraded')
    } else {
      debug('opened channel')
    }
  }

  /**
   * The handler for the 'error' event
   * @param { ErrorEvent } err - the error event
   */
  private onError(err: ErrorEvent) {
    const { type, message, target } = err
    if (target === this.channel) {
      debug(`Current channel encountered an ${type} error, ${message}`, err)
      this.channel.close()
    } else {
      debug(`Old channel ${type} error, ${message}`, err)
    }
  }

  /**
   * The handler for the 'message' event
   * @param { MessageEvent<string> } ev - message event
   */
  private onMessage(ev: MessageEvent<string>) {
    const message: WSMessage = JSON.parse(ev.data)
    debug(`new message, ${message.type}`)
    this.emit('message', message)
  }

  /**
   * Handler for the 'close' event.
   * @param { CloseEvent | { type: string } } ev - the close event
   */
  private onClose(ev: CloseEvent | { type: string }): void {
    try {
      if (this.upgraded) {
        const channel = 'target' in ev ? this.ws : this.dc
        this.removeListeners(channel)
        if (channel === this.ws) {
          // The old channel is closed but the signaling process continues over datachannel
          debug('oldchannel closed')
        } else {
          // The upgraded channel (dc) is closed. We must close the connection
          this.emit('close')
          debug('channel closed')
        }
      } else {
        // Channel was not upgraded, so there is not a signaling channel to use
        this.emit('close')
        debug('channel closed')
      }
    } catch (e) {
      debug('Close event not handled, %o', e)
      this.emit('close')
    }
  }

  /**
   * Simple utility function which adds event listeners to a channel
   * @param { WebSocket | RTCDataChannel } channel - the channel to add the listeners to
   */
  private addListeners(channel: WebSocket | RTCDataChannel) {
    this.handlers.forEach((handler: EventListenerOrEventListenerObject, event: signalingEvent) => {
      if (!(this.upgraded && event === 'open')) {
        // We don't listen to the 'open' event on ws, since it is already in the 'open' state
        // when this object is istantiated
        // @ts-expect-error ts(2349)
        channel.addEventListener(event, handler)
      }
    })
  }

  /**
   * Simple utility function which removes event listeners from the channel
   * @param { WebSocket | RTCDataChannel } channel - the channel to remove the listeners to
   */
  private removeListeners(channel: WebSocket | RTCDataChannel) {
    this.handlers.forEach((handler: EventListenerOrEventListenerObject, event: signalingEvent) => {
      // @ts-expect-error ts(2349)
      channel.removeEventListener(event, handler)
    })
  }

  get status(): number | RTCDataChannelState {
    return this.channel.readyState
  }
}
