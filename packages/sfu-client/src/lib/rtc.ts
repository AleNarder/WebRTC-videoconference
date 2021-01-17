import logDown from 'logdown'
import { createMessage } from '@/lib/message'
export default class RTCConnection extends EventTarget {
  private static readonly RTC_EVENTS: Array<keyof RTCPeerConnectionEventMap> = [
    'datachannel',
    'icecandidate',
    'negotiationneeded',
    'iceconnectionstatechange',
    'track',
    'signalingstatechange',
  ]

  private _peerConnection!: RTCPeerConnection | undefined
  private readonly _logger: logDown.Logger
  private readonly _config: RTCConfiguration | undefined
  private readonly _listeners: Map<
    keyof RTCPeerConnectionEventMap,
    (...args: unknown[]) => any
  >

  constructor(config?: RTCConfiguration) {
    super()
    this._config = config
    this._logger = logDown('sfu:RTCConnection')
    this._listeners = new Map()
    RTCConnection.RTC_EVENTS.forEach((event) => {
      const handlerName = `_on${event
        .charAt(0)
        .toUpperCase()
        .concat(event.slice(1))}`
      // @ts-expect-error
      const handler = this[handlerName].bind(this)
      if (handler) this._listeners.set(event, handler)
    })
    this._setupConnection()
  }

  private _getDefaultConfiguration(): RTCConfiguration {
    return {
      // @ts-expect-error
      sdpSemantics: 'unified-plan',
      iceServers: [
        {
          urls: ['stun:stun.ekiga.net'],
        },
        {
          urls: ['turn:relay.backups.cz?transport=tcp'],
          credential: 'homeo',
          username: 'homeo',
        },
      ],
    }
  }

  private _setupConnection() {
    if (!this._peerConnection) {
      this._peerConnection = new RTCPeerConnection(
        this._config ?? this._getDefaultConfiguration()
      )
      this._addListeners()
    }
  }

  _onTrack(ev: RTCTrackEvent) {
    this._logger.log('new track')
    this.dispatchEvent(
      new CustomEvent('new-track', {
        detail: createMessage('new-track', ev),
      })
    )
  }

  _onSignalingstatechange() {
    const { signalingState } = this._peerConnection!
    if (signalingState) {
      this._logger.log(signalingState)
      if (signalingState === 'stable') {
        this.dispatchEvent(
          new CustomEvent('connected', {
            detail: createMessage('connected', {}),
          })
        )
      }
    }
  }

  replaceTrack(track: MediaStreamTrack) {
    try {
      const sender = this._peerConnection!.getSenders().find((sender) => {
        return sender.track!.kind === track.kind
      })
      sender?.replaceTrack(track)
      this._logger.log('track replaced')
    } catch (e) {
      this._logger.error(e)
    }
  }

  addTrack(track: MediaStreamTrack, stream?: MediaStream) {
    if (!this._peerConnection) this._setupConnection()
    try {
      const aSenderAlreadyExists = this._peerConnection
        ?.getSenders()
        .find((sender) => sender.track?.id === track.id)
      if (!aSenderAlreadyExists) {
        if (stream) {
          this._peerConnection!.addTrack(track, stream)
          this._logger.log('added track')
        } else {
          this._peerConnection!.addTrack(track)
        }
      }
    } catch (e) {
      this._logger.error(e)
    }
  }

  async setLocalDescription(
    answer?: RTCSessionDescription | RTCSessionDescriptionInit
  ): Promise<void> {
    if (!this._peerConnection) this._setupConnection()
    try {
      const description = answer ?? (await this._peerConnection!.createOffer())
      await this._peerConnection!.setLocalDescription(description)
      this._logger.log('applied local description')
      const type = answer ? 'answer' : 'offer'
      this.dispatchEvent(
        new CustomEvent(type, {
          detail: createMessage(type, this._peerConnection!.localDescription),
        })
      )
    } catch (e) {
      this._logger.error(e)
    }
  }

  async setRemoteDescription(
    description: RTCSessionDescription | RTCSessionDescriptionInit,
    offer?: boolean
  ): Promise<void> {
    if (!this._peerConnection) this._setupConnection()
    await this._peerConnection!.setRemoteDescription(description)
    if (offer) {
      const answer = await this._peerConnection!.createAnswer()
      this.setLocalDescription(answer)
    }
    this._logger.log('applied remote description')
  }

  async close() {
    if (this._peerConnection) {
      this._peerConnection.close()
      this._removeListeners()
      delete this._peerConnection
      this._logger.log('closed rtc connection')
    }
  }

  async setIceCandidates(candidate: RTCIceCandidate | null) {
    if (candidate) {
      await this._peerConnection!.addIceCandidate(
        new RTCIceCandidate(candidate)
      )
      this._logger.log('ice candidate added!')
    } else {
      this._logger.log('ice candidate negotiation finished')
    }
  }

  private _addListeners() {
    if (this._peerConnection) {
      this._listeners.forEach((listener, event) => {
        this._peerConnection?.addEventListener(event, listener)
      })
    }
  }

  private _removeListeners() {
    if (this._peerConnection) {
      this._listeners.forEach((listener, event) => {
        this._peerConnection?.removeEventListener(event, listener)
      })
    }
  }
  // @ts-expect-error ts(6133)
  private _onDatachannel(ev: RTCDataChannelEvent) {
    this._logger.log('Received data channel')
    this.dispatchEvent(
      new CustomEvent('data-channel', {
        detail: createMessage('data-channel', ev.channel),
      })
    )
  }
  // @ts-expect-error ts(6133)
  private _onNegotiationneeded() {
    this._logger.log('negotiation needed')
    this.setLocalDescription()
  }
  // @ts-expect-error ts(6133)
  private _onIceconnectionstatechange() {
    const { iceConnectionState } = this._peerConnection!
    this._logger.log(iceConnectionState)
  }
  // @ts-expect-error ts(6133)
  private _onIcecandidate(ev: RTCPeerConnectionIceEvent) {
    this._logger.log('new ice candidate')
    const { candidate } = ev
    if (candidate) {
      this.dispatchEvent(
        new CustomEvent('ice-candidate', {
          detail: createMessage('ice-candidate', ev.candidate),
        })
      )
    } else {
      this._logger.log('ice negotiation finished')
    }
  }
}
