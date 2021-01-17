import { EventEmitter } from 'events'

export default class Connection extends EventEmitter {
  readonly id: string | null

  constructor(uuid?: string) {
    super()
    this.id = uuid ?? null
  }

  toJSON(): { id: string } {
    return {
      id: this.id,
    }
  }
}
