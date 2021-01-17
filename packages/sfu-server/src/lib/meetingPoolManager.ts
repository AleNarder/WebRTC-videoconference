import Manager from './manager'
import MeetingManager from './meetingManager'
import Debug from 'debug'
import { createMessage, WSMessage } from './../models/message'
import * as WSSocket from 'ws'

const debug = Debug('sfu:MeetingPoolManager')

class MeetingPoolManager extends Manager<MeetingManager> {
  private addMeeting(meetingName?: string): string {
    const meetingUUID = this.createUUID()
    const meeting = new MeetingManager(meetingUUID, meetingName)
    meeting.addListener('empty', this.deleteMeeting.bind(this))
    this.items.set(meetingUUID, meeting)
    return meetingUUID
  }

  private getMeeting(meetingUUID: string): MeetingManager {
    return this.items.get(meetingUUID)
  }

  join(username: string, meetingUUID: string, ws: WSSocket): WSMessage {
    const meeting = this.getMeeting(meetingUUID)
    const message = createMessage()
    if (meeting) {
      const connected = meeting.addConnection(username, ws)
      if (connected) {
        debug(`${username} joined meeting ${meetingUUID}`)
        message.type = 'joined'
        message.payload = {
          meetingId: meetingUUID,
        }
      } else {
        debug(`meeting ${meetingUUID} is full`)
        message.type = 'error'
        message.payload = 'meeting is full'
      }
    } else {
      debug(`meeting ${meetingUUID} not found`)
      message.type = 'error'
      message.payload = 'meeting not found'
    }
    return message
  }

  create(username: string, ws: WSSocket): WSMessage {
    const meetingUUID = this.addMeeting()
    return this.join(username, meetingUUID, ws)
  }

  deleteMeeting({ id }: { id: string }): void {
    const meeting = this.getMeeting(id)
    meeting.removeListener('empty', this.deleteMeeting)
    this.items.delete(id)
    debug(`meeting ${id} deleted`)
  }
}

export { MeetingPoolManager }
