import WsManager from './lib/wsManager';
export default function main(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const wssManager = new WsManager();
  } catch (e) {
    console.log(e);
  }
}

main();
