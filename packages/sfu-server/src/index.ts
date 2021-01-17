import WsManager from './lib/wsManager'
import { ServerOptions } from 'ws'
export default function (options?: ServerOptions): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const wssManager = new WsManager(options)
  } catch (e) {
    console.log(e)
  }
}
