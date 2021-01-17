import * as WebSocket from 'ws'
import Debug from 'debug'
import { RTCConnection, RTCEvent } from './rtcconnection'
import Connection from './connection'
import { createMessage, WSMessage, messageType } from './message'
import SignalingChannel from './signalingChannel'

const debug = Debug('sfu:MeetingConnection')

export default class MeetingConnection extends Connection {
  private static readonly RTC_EVENTS = [
    'sync',
    'negotiate',
    'new-track',
    'offer',
    'ice-candidate',
    'answer',
    'close',
    'local-track',
  ]
  private static readonly SIGNALING_EVENTS = ['message', 'error', 'open']
  private readonly channel: SignalingChannel
  private readonly rtc: RTCConnection
  readonly username: string

  constructor(uuid: string, ws: WebSocket, username: string) {
    super(uuid)
    this.rtc = new RTCConnection()
    this.channel = new SignalingChannel(ws, this.rtc.getDataChannel(uuid))
    this.username = username
    this.connectChannels()
  }

  private connectChannels() {
    this.connectRTCtoWS()
    this.connectWStoRTC()
  }

  private connectRTCtoWS() {
    MeetingConnection.RTC_EVENTS.forEach((event) => {
      this.rtc.addListener(event, this.dispatchRTCEvent.bind(this))
    })
  }

  private connectWStoRTC() {
    this.channel.addListener('message', this.dispatchMessage.bind(this))
    this.channel.addListener('error', this.close.bind(this))
    this.channel.addListener('close', this.close.bind(this))
  }

  private dispatchRTCEvent(ev: RTCEvent) {
    try {
      const { type, payload } = ev
      switch (type) {
        case 'track':
        case 'username':
          this.emit('sync', createMessage(type, { ...payload, id: this.id, username: this.username }))
          break
        case 'offer':
          this.channel.sendMessage(createMessage('offer', payload))
          break
        case 'answer':
          this.channel.sendMessage(createMessage('answer', payload))
          break
        case 'ice-candidate':
          this.channel.sendMessage(createMessage('ice-candidate', payload))
          break
        case 'close':
          this.close()
          break
        case 'local-track':
          this.emit('sync', createMessage('username', { ...payload, username: this.username, id: this.id }))
          break
        default:
          debug('unknown message', ev)
          break
      }
    } catch (e) {
      debug(e)
    }
  }

  private async dispatchMessage(message: WSMessage) {
    try {
      const { type, payload } = message
      switch (type) {
        case 'offer':
          this.rtc.setRemoteDescription(payload, true)
          break
        case 'answer':
          this.rtc.setRemoteDescription(payload)
          break
        case 'ice-candidate':
          this.rtc.addIceCandidate(payload)
          break
        default:
          debug('unknown message', message)
          break
      }
    } catch (e) {
      debug(e)
    }
  }

  private disconnectChannels() {
    MeetingConnection.RTC_EVENTS.forEach((event) => {
      this.rtc.removeAllListeners(event)
    })
    MeetingConnection.SIGNALING_EVENTS.forEach((event) => {
      this.channel.removeAllListeners(event)
    })
  }

  sendMessage(msg: WSMessage): void {
    this.channel.sendMessage(msg)
  }

  addTrack(ev: RTCTrackEvent): void {
    this.rtc.addTrack(ev)
  }

  close(): void {
    if (this.rtc.connectionState === 'connected' || this.rtc.connectionState === 'connecting') {
      this.rtc.close()
      this.disconnectChannels()
      debug('connection closed')
      this.emit('close', {
        username: this.username,
        id: this.id,
      })
    }
  }

  get localTracks(): RTCTrackEvent[] {
    return this.rtc.userTrackList
  }

  get localStream(): MediaStream {
    return this.rtc.userTrackList[0]?.streams[0]
  }
}
