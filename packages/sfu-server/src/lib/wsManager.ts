import * as WSSocket from 'ws'
import Debug from 'debug'
import { createMessage } from '../models/message'
import { IncomingMessage } from 'http'
import { MeetingPoolManager } from './meetingPoolManager'

const debug = Debug('sfu:wss')

export default class WSManager {
  private static readonly DEFAULT_OPTIONS = getDefaultServerOptions()

  private readonly wss: WSSocket.Server
  private readonly options: WSSocket.ServerOptions
  private readonly meetingPoolManager: MeetingPoolManager

  constructor(options?: WSSocket.ServerOptions) {
    this.options = options ?? WSManager.DEFAULT_OPTIONS
    this.wss = new WSSocket.Server(this.options)
    this.meetingPoolManager = new MeetingPoolManager()
    this.wss.on('connection', this.onConnection.bind(this))
    this.wss.on('close', this.onClose.bind(this))
    this.wss.on('error', this.onError.bind(this))
    this.wss.on('listening', this.onListening.bind(this))
  }

  private onConnection(ws: WSSocket, request: IncomingMessage) {
    debug('new connection')
    let message = createMessage()
    const { searchParams } = new URL(`http://t/${request.url}`)
    const payloadParam = searchParams.get('payload')
    let payload = null
    try {
      payload = JSON.parse(decodeURI(payloadParam))
    } catch (e) {}
    if (payloadParam && !payload) {
      message.type = 'error'
      message.payload = 'payload cannot be empty'
    } else if (payload) {
      const { meetingId, username } = payload
      if (meetingId) {
        message = this.meetingPoolManager.join(username, meetingId, ws)
      } else {
        message = this.meetingPoolManager.create(username, ws)
      }
    } else {
      debug('invalid request')
      message.type = 'error'
      message.payload = 'missing required param payload'
    }
    ws.send(JSON.stringify(message))
  }

  private onClose() {
    debug('closing')
  }

  private onError(error: Error) {
    debug('error, %o', error)
    this.wss.close()
  }

  private onListening() {
    debug(`listening on ${this.wss.path ?? `ws://localhost:${this.options.port}`}`)
  }
}

function getDefaultServerOptions(): WSSocket.ServerOptions {
  return {
    port: parseInt(process.env.PORT, 10) || 5000,
  }
}
