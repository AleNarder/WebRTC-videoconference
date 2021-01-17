import Connection from './connection'
import * as wrtc from 'wrtc'
import Debug from 'debug'
import { createMessage, WSMessage } from './message'

const debug = Debug('sfu:RTCConnection')

type RTCEvent = WSMessage

class RTCConnection extends Connection {
  private static readonly DEFAULT_CONFIGURATION: RTCConfiguration = RTCConnection.getDefaultConfiguration()
  private static readonly TIME_TO_CONNECTED = 10000
  private static readonly TIME_TO_RECONNECTED = 1000
  private static readonly RTC_EVENTS: Array<keyof RTCPeerConnectionEventMap> = [
    'connectionstatechange',
    'icecandidate',
    'iceconnectionstatechange',
    'negotiationneeded',
    'track',
    'signalingstatechange',
  ]

  private readonly peerConnection: RTCPeerConnection
  private readonly peerListeners: Map<keyof RTCPeerConnectionEventMap, (this: RTCPeerConnection, ev: Event) => unknown>
  private connectionTimer: NodeJS.Timeout | null
  private reconnectionTimer: NodeJS.Timeout | null
  private userTracks: RTCTrackEvent[]

  constructor(config?: RTCConfiguration) {
    super()
    this.userTracks = []
    this.peerConnection = new wrtc.RTCPeerConnection(config ?? RTCConnection.DEFAULT_CONFIGURATION)
    this.peerListeners = new Map()
    this.addPeerListeners()
    this.connectionTimer = this.reconnectionTimer = null
    this.waitForConnection()
  }

  private addPeerListeners() {
    RTCConnection.RTC_EVENTS.forEach((event) => {
      const handler = this[`on${event[0].toUpperCase().concat(event.slice(1))}`].bind(this)
      this.peerConnection.addEventListener(event, handler)
      this.peerListeners.set(event, handler)
    })
  }

  private removePeerListeners() {
    this.peerListeners.forEach((listener, event) => {
      this.peerConnection.removeEventListener(event, listener)
    })
    this.peerListeners.clear()
  }

  getDataChannel(id: string): RTCDataChannel {
    return this.peerConnection.createDataChannel(id)
  }

  private onConnectionstatechange(): void {
    const { connectionState } = this.peerConnection
    debug(connectionState)
    if (connectionState === 'closed' || connectionState === 'disconnected') {
      this.close()
    }
  }

  onSignalingstatechange(): void {
    debug(this.peerConnection.signalingState)
  }

  private onNegotiationneeded(): void {
    debug('negotiation needed')
    this.setLocalDescription()
  }

  async setLocalDescription(answer?: RTCSessionDescription | RTCSessionDescriptionInit): Promise<void> {
    try {
      debug('setting local description...')
      const description = answer ?? (await this.peerConnection.createOffer())
      await this.peerConnection.setLocalDescription(description)
      const type = answer ? 'answer' : 'offer'
      this.emit(type, {
        type,
        payload: this.peerConnection.localDescription,
      })
    } catch (e) {
      console.error(e)
      this.close()
    }
  }
  async setRemoteDescription(
    description: RTCSessionDescription | RTCSessionDescriptionInit,
    offer?: boolean
  ): Promise<void> {
    try {
      debug('setting remote description...')
      await this.peerConnection.setRemoteDescription(new wrtc.RTCSessionDescription(description))
      if (offer) {
        debug('creating answer...')
        const answer = await this.peerConnection.createAnswer()
        this.setLocalDescription(answer)
      }
    } catch (e) {
      console.error(e)
      this.close()
    }
  }

  private onIceconnectionstatechange(): void {
    const { iceConnectionState } = this.peerConnection
    if (iceConnectionState === 'completed' || iceConnectionState === 'connected') {
      this.deleteTimers(this.reconnectionTimer, this.connectionTimer)
    } else if (iceConnectionState === 'failed' || iceConnectionState === 'disconnected') {
      if (!this.connectionTimer && !this.reconnectionTimer) {
        this.reconnectionTimer = setTimeout(() => {
          this.close()
        }, RTCConnection.TIME_TO_RECONNECTED)
      }
    }
  }
  private onIcecandidate(ev: RTCPeerConnectionIceEvent) {
    const { candidate } = ev
    if (candidate) {
      debug('new ice candidate')
      this.emit('ice-candidate', createMessage('ice-candidate', candidate))
    } else {
      debug('ice candidate negotiation finished')
    }
  }

  async addIceCandidate(candidate: RTCIceCandidate): Promise<void> {
    try {
      // firefox specific: https://github.com/webrtc/samples/issues/1202
      if (candidate && candidate.candidate) {
        await this.peerConnection.addIceCandidate(new wrtc.RTCIceCandidate(candidate))
        debug('added ice candidate!')
      }
    } catch (e) {
      console.error(candidate)
      this.close()
    }
  }

  private waitForConnection() {
    this.connectionTimer = setTimeout(() => {
      const { iceConnectionState } = this.peerConnection
      if (iceConnectionState !== 'completed' && iceConnectionState !== 'connected') {
        debug('connetion timed out')
        this.close()
      }
    }, RTCConnection.TIME_TO_CONNECTED)
  }

  private deleteTimers(...timers: NodeJS.Timeout[]) {
    timers
      .filter((timer) => timer)
      .forEach((timer, i, timers) => {
        clearTimeout(timer)
        timers[i] = null
      })
  }

  addTrack(ev: RTCTrackEvent): void {
    debug('adding track...')
    const { streams, track } = ev
    if (streams && streams[0]) {
      const [stream] = streams
      track.addEventListener('mute', () => debug('muted'))
      this.peerConnection.addTrack(track, stream)
    } else {
      this.peerConnection.addTrack(track)
    }
  }

  private onTrack(ev: RTCTrackEvent) {
    if (ev.streams && ev.streams[0]) {
      const [stream] = ev.streams
      const isBySameStream = stream.id === this.userTracks[0]?.streams[0]?.id
      if (this.userTracks.length === 0 || isBySameStream) {
        if (this.userTracks.length === 0) {
          this.emit('sync', createMessage('username', { streamId: stream.id }))
        }
        this.userTracks.push(ev)
        debug('Added local stream track')
      }
    }
    this.emit('sync', createMessage('track', ev))
  }

  private static getDefaultConfiguration(): RTCConfiguration {
    return {
      // @ts-expect-error ts(2322)
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

  close(): void {
    if (this.peerConnection && this.peerConnection.iceConnectionState !== 'closed') {
      this.deleteTimers(this.connectionTimer, this.reconnectionTimer)
      this.removePeerListeners()
      this.peerConnection.close()
      debug('connection closed')
      this.emit('close', createMessage('close', null))
    }
  }

  get userTrackList(): RTCTrackEvent[] {
    return this.userTracks
  }

  get connectionState(): RTCPeerConnectionState {
    return this.peerConnection.connectionState
  }
}

export { RTCEvent, RTCConnection }
