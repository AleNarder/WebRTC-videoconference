import MeetingConnection from '../models/meetingConnection'
import Debug from 'debug'
import * as WSSocket from 'ws'
import Manager from './manager'
import { createMessage, WSMessage } from '../models/message'

const debug = Debug('sfu:MeetingManager')

export default class MeetingManager extends Manager<MeetingConnection> {
  static readonly MAX_CONNECTIONS_ALLOWED = 255
  readonly meetingName: string
  private readonly closeListeners: Map<string, (...args: unknown[]) => void>
  private readonly syncListeners: Map<string, (...args: unknown[]) => void>

  constructor(meetingUUID: string, meetingName?: string) {
    super(meetingUUID)
    this.meetingName = meetingName
    this.closeListeners = new Map()
    this.syncListeners = new Map()
  }

  addConnection(username: string, ws: WSSocket): boolean {
    let inserted = false
    if (this.items.size < MeetingManager.MAX_CONNECTIONS_ALLOWED) {
      const connectionUUID = this.createUUID()
      const connection = new MeetingConnection(connectionUUID, ws, username)
      const closedListener = this.closeConnection.bind(this)
      const syncListener = this.syncConnections.bind(this)
      connection.addListener('sync', syncListener)
      connection.addListener('close', closedListener)
      this.items.set(connectionUUID, connection)
      this.closeListeners.set(connectionUUID, closedListener)
      this.syncListeners.set(connectionUUID, syncListener)
      this.initConnection(connection)
      inserted = true
    }
    return inserted
  }

  getConnection(connectionUUID: string): MeetingConnection {
    return this.items.get(connectionUUID)
  }

  deleteConnection(connectionUUID: string, username: string): boolean {
    const connection = this.getConnection(connectionUUID)
    let deleted = true
    if (connection) {
      try {
        const { id: streamId } = connection.localStream
        const closedListener = this.closeListeners.get(connectionUUID)
        const syncListener = this.syncListeners.get(connectionUUID)
        connection.removeListener('sync', syncListener)
        connection.removeListener('close', closedListener)
        this.items.delete(connectionUUID)
        this.closeListeners.delete(connectionUUID)
        this.syncListeners.delete(connectionUUID)
        if (this.items.size === 0) {
          this.emit('empty', { id: this.id })
        } else {
          this.broadcast(
            createMessage('info', {
              action: 'left',
              info: {
                streamId,
                username,
              },
            })
          )
        }
      } catch (e) {
        debug('error, %o', e)
      }
    } else {
      deleted = false
    }
    return deleted
  }

  private initConnection(sourceConnection: MeetingConnection) {
    const usernames = {}
    this.items.forEach((connection: MeetingConnection) => {
      if (connection.id !== sourceConnection.id) {
        connection.localTracks.forEach((track) => sourceConnection.addTrack(track))
        usernames[connection.localStream.id] = connection.username
      }
    })
    if (Object.keys(usernames).length > 0) {
      sourceConnection.sendMessage(
        createMessage('info', {
          action: 'join',
          info: {
            ...usernames,
          },
        })
      )
    }
  }

  private syncConnections(ev: WSMessage) {
    const { type, payload } = ev
    switch (type) {
      case 'track':
        this.syncTracks(payload)
        break
      case 'username':
        this.syncUsernames(payload)
        break
      default:
        break
    }
  }

  private syncTracks<T extends RTCTrackEvent>(payload: T) {
    debug('syncing connection streams...')
    // @ts-expect-error ts(2339)
    const { id: sourceConnectionUUID } = payload
    this.items.forEach((connection: MeetingConnection) => {
      if (connection.id !== sourceConnectionUUID) {
        connection.addTrack(payload)
      }
    })
  }

  private syncUsernames(payload: { username: string; streamId: string; id: string }) {
    const { username, streamId, id } = payload
    const info = {}
    info[streamId] = username
    this.broadcast(
      createMessage('info', {
        action: 'join',
        info,
      }),
      id
    )
  }

  private broadcast(message: WSMessage, sourceConnectionUUID?: string) {
    this.items.forEach((connection) => {
      if (connection.id !== sourceConnectionUUID) connection.sendMessage(message)
    })
  }

  private closeConnection({ id, username }: { id: string; username: string }) {
    this.deleteConnection(id, username)
    debug(`${username} left meeting ${this.id}`)
  }

  close(): void {
    ;[...this.items.values()].forEach(({ id, username }) => this.deleteConnection(id, username))
  }
}
