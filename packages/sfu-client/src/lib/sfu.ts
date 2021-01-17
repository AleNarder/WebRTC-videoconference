// @ts-expect-error ts(6133)
import adapter from 'webrtc-adapter'
import logDown from 'logdown'
import { WSMessage } from '@/lib/message'
import RTCConnection from '@/lib/rtc'
import { socketOptions, SignalingChannel } from '@/lib/signalingChannel'

type sfuOptions = {
  socketOptions: socketOptions
  rtcOptions?: RTCConfiguration
  debug: boolean
}

class SFUConnection extends EventTarget {
  private static readonly SIGNALING_CHANNEL_EVENTS = [
    'message',
    'error',
    'close',
  ]
  private static readonly RTC_CONNECTION_EVENTS = [
    'data-channel',
    'new-track',
    'connected',
    'answer',
    'offer',
    'ice-candidate',
    'close',
  ]

  private _channel?: SignalingChannel
  private _rtcConn?: RTCConnection

  private readonly _options: sfuOptions
  private readonly _logger: logDown.Logger
  private readonly _sigListeners: Map<string, (...args: any[]) => void>
  private readonly _rtcListeners: Map<string, (...args: any[]) => void>
  constructor(options: sfuOptions) {
    super()
    this._options = options
    if (process.env.NODE_ENV === 'development' && this._options.debug) {
      window.localStorage.debug = 'sfu:*'
    }
    this._logger = logDown('sfu:SFUconnection')
    this._sigListeners = new Map()
    this._rtcListeners = new Map()
    this.setupConnection()
  }

  setupConnection() {
    try {
      const { rtcOptions, socketOptions } = this._options
      this._rtcConn = new RTCConnection(rtcOptions)
      this._channel = new SignalingChannel(socketOptions)
      this._connectChannels()
    } catch (e) {
      this._logger.error(e)
    }
  }

  connect(username: string, meetingId?: string) {
    if (!this._channel || !this._rtcConn) {
      this.setupConnection()
    }
    this._channel?.connect(username, meetingId)
  }

  addTrack(track: MediaStreamTrack, stream: MediaStream) {
    if (this._rtcConn) {
      this._rtcConn.addTrack(track, stream)
    } else {
      this._logger.error('Unable to find rtcConnection')
    }
  }

  replaceTrack(track: MediaStreamTrack) {
    if (this._rtcConn) {
      this._rtcConn!.replaceTrack(track)
    } else {
      this._logger.error('Unable to find rtcConnection')
    }
  }

  close() {
    this._channel?.close()
    delete this._channel
  }

  sendMessage(message: WSMessage) {
    this._channel?.sendMessage(message)
  }

  private onChannelClosed() {
    try {
      this._rtcConn!.close()
      this._disconnectChannels()
      delete this._rtcConn
    } catch (e) {
      this._logger.error(e)
    }
  }

  private _disconnectChannels() {
    this._disconnectRTCtoWS()
    this._disconnectWStoRTC()
  }

  private _connectChannels() {
    this._connectRTCtoWS()
    this._connectWStoRTC()
  }

  private _connectRTCtoWS() {
    if (this._rtcConn) {
      const handler = this._dispatchRTCEvent.bind(this)
      SFUConnection.RTC_CONNECTION_EVENTS.forEach((event) => {
        this._rtcListeners.set(event, handler)
        // @ts-expect-error
        this._rtcConn?.addEventListener(event, handler)
      })
    }
  }

  private _connectWStoRTC() {
    if (this._channel) {
      const handler = this._dispatchSigEvent.bind(this)
      SFUConnection.SIGNALING_CHANNEL_EVENTS.forEach((event) => {
        this._sigListeners.set(event, handler)
        this._channel?.addEventListener(event, handler)
      })
    }
  }

  private _disconnectRTCtoWS() {
    this._rtcListeners.forEach((listener, ev) => {
      this._rtcConn?.removeEventListener(ev, listener)
    })
  }

  private _disconnectWStoRTC() {
    this._sigListeners.forEach((listener, ev) => {
      this._channel?.removeEventListener(ev, listener)
    })
  }

  private _dispatchSigEvent(ev: Event | CustomEvent) {
    const { type } = ev
    switch (type) {
      case 'message':
        if ('detail' in ev) this._dispatchMessage(ev)
        break
      case 'error':
        this.close()
        break
      case 'close':
        this.onChannelClosed()
        break
      default:
        break
    }
  }

  private async _dispatchMessage(ev: CustomEvent<WSMessage>) {
    if (this._rtcConn) {
      try {
        const { type, payload } = ev.detail
        switch (type) {
          case 'joined':
            this.dispatchEvent(
              new CustomEvent('ready', {
                detail: payload,
              })
            )
            break
          case 'offer':
            await this._rtcConn.setRemoteDescription(payload, true)
            break
          case 'answer':
            await this._rtcConn.setRemoteDescription(payload)
            break
          case 'ice-candidate':
            this._rtcConn.setIceCandidates(payload)
            break
          case 'info':
            this._dispatchInfo(payload)
            break
          case 'error':
            this.dispatchEvent(
              new CustomEvent('error', {
                detail: payload,
              })
            )
            this.close()
            break
          default:
            break
        }
      } catch (e) {
        this._logger.error(e)
      }
    }
  }

  private _dispatchRTCEvent(ev: CustomEvent<WSMessage>) {
    if (this._channel) {
      try {
        const { type, payload } = ev.detail
        switch (type) {
          case 'data-channel':
            this._channel.upgrade(payload)
            break
          case 'offer':
            this._channel.sendMessage(ev.detail)
            break
          case 'answer':
            this._channel.sendMessage(ev.detail)
            break
          case 'ice-candidate':
            this._channel.sendMessage(ev.detail)
            break
          case 'connected':
            this.dispatchEvent(new Event('connected'))
            break
          case 'new-track':
            this.dispatchEvent(
              new CustomEvent('new-track', {
                detail: payload,
              })
            )
            break
          case 'close':
            this.close()
            break
          default:
            console.log(type)
            break
        }
      } catch (e) {
        this._logger.error(e)
      }
    } else {
      this._logger.error('Unable to find rtcConnection')
      this.close()
    }
  }

  private _dispatchInfo(payload: any) {
    const { info, action } = payload
    this.dispatchEvent(
      new CustomEvent(action, {
        detail: info,
      })
    )
  }
}

export { SFUConnection }
