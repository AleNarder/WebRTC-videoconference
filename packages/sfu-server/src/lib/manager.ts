import { v4 as uuid } from 'uuid'
import { EventEmitter } from 'events'

export default abstract class Manager<V> extends EventEmitter {
  protected readonly items: Map<string, V>
  protected readonly id: string | null

  constructor(id?: string) {
    super()
    this.items = new Map()
    this.id = id ?? null
  }

  protected createUUID(): string {
    let id = uuid()
    while (this.items.has(id)) {
      id = uuid()
    }
    return id
  }
}
