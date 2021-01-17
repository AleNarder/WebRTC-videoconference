import Vue from 'vue'

declare module 'vue/types/vue' {
  interface Vue {
    $sfuOptions: {
      socketOptions: {
        url: string
        protocols?: string | string[]
      }
      rtcOptions?: RTCConfiguration
      debug: boolean
    }
  }
}
