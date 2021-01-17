<template>
  <div>
    <div><slot name="meeting-navbar" /></div>
    <div>
      <div>
        <slot
          name="meeting-login"
          :attrs="attrs"
          :create="create"
          :join="join"
          v-if="!connectionStatus"
        >
          <div id="login">
            <h1>WRTC</h1>
            <input
              type="text"
              v-model="attrs.username"
              placeholder="USERNAME"
            />
            <input type="text" v-model="attrs.meetingId" placeholder="ROOM" />
            <button @click="join()" :disabled="!attrs.meetingId">JOIN</button>
            <button
              @click="create()"
              :disabled="attrs.meetingId != '' || !attrs.username"
            >
              CREATE
            </button>
          </div>
        </slot>
      </div>
      <div>
        <div v-if="connectionStatus">
          <slot name="meeting-header" :meetingId="attrs.meetingId">
            <h1 v-if="connectionStatus">Meeting: {{ attrs.meetingId }}</h1>
          </slot>
        </div>
        <div>
          <div v-for="stream of streams" :ref="stream.id" :key="stream.id">
            <slot name="meeting-video" :username="usernames[stream.id]">
              <video autoplay playsinline />
              <div>
                <p>{{ usernames[stream.id] }}</p>
              </div>
            </slot>
          </div>
        </div>
      </div>
      <div class="devices" v-if="!noDevices">
        <div
          v-for="(deviceGroup, i) in Object.keys(devices)"
          :key="i"
          class="device"
        >
          <h5>{{ deviceGroup }}</h5>
          <select v-model="selectedSources[deviceGroup]">
            <option
              v-for="(device, j) of devices[deviceGroup]"
              :key="j"
              :value="device.deviceId"
            >
              {{ device.label }}
            </option>
          </select>
        </div>
      </div>
      <div>
        <slot name="options" v-if="connectionStatus">
          <button @click="close()">QUIT</button>
          <button @click="changeTrackState('audio')">
            AUDIO {{ audio ? 'off' : 'on' }}
          </button>
          <button @click="changeTrackState('video')">
            VIDEO {{ video ? 'off' : 'on' }}
          </button>
        </slot>
      </div>
      <div v-if="error">
        <slot name="meeting-error" :error="error"></slot>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { SFUConnection } from '@/lib/sfu'
import Vue from 'vue'
import { createMessage } from '@/lib/message'

export default Vue.extend({
  name: 'sfu-client',
  data(): {
    global: Window
    connectionStatus: boolean
    localStream: MediaStream | null
    sortedStreams: string[]
    usernames: { [key: string]: string }
    streams: { [key: string]: MediaStream }
    devices: any | null
    video: boolean
    audio: boolean
    error: string
    errorTimeout: number | null
    sfu?: SFUConnection | null
    sfuEvents: string[]
    sfuListeners: Map<string, (...args: any[]) => void>
    selectedSources: {
      audioinput: MediaDeviceInfo | null
      audiooutput: MediaDeviceInfo | null
      videoinput: MediaDeviceInfo | null
    }
    attrs: {
      username: string
      meetingId: string
    }
  } {
    return {
      global: window,
      attrs: {
        username: '',
        meetingId: '',
      },
      devices: {},
      connectionStatus: false,
      localStream: null,
      sortedStreams: [],
      usernames: {},
      streams: {},
      audio: true,
      video: true,
      error: '',
      errorTimeout: null,
      sfu: null,
      sfuEvents: ['new-track', 'connected', 'ready', 'left', 'join', 'error'],
      sfuListeners: new Map(),
      selectedSources: {
        audioinput: null,
        audiooutput: null,
        videoinput: null,
      },
    }
  },
  async created() {
    const meetingId = this.getMeetingFromUrl()
    if (meetingId) {
      this.attrs.meetingId = meetingId
    }
    await this.getDevices()
  },
  async mounted() {
    const stream = await this.getUserMedia()
    if (stream) {
      this.localStream = stream
      this.updateVideos(stream, true)
    }
  },
  computed: {
    noTracks() {
      if (this.localStream) {
        // @ts-expect-error
        const videoTracks = this.localStream.getVideoTracks().length >= 0
        // @ts-expect-error
        const audioTracks = this.localStream.getAudioTracks().length >= 0
        return !videoTracks || !audioTracks
      } else {
        return true
      }
    },
    noDevices() {
      return (
        // @ts-expect-error
        Object.keys(this.selectedSources).findIndex(
          // @ts-expect-error
          (source) => !this.selectedSources[source]
        ) >= 0
      )
    },
  },
  methods: {
    getMeetingFromUrl() {
      const queryString = this.global.location.search
      const urlParams = new URLSearchParams(queryString)
      return urlParams.get('meetingId')
    },
    setupSFU() {
      this.sfu = new SFUConnection(this.$sfuOptions)
      this.sfuEvents.forEach((event: string) => {
        const sanitizedEventName = event.split('-').join('')
        const handlerName = `on${sanitizedEventName
          .charAt(0)
          .toUpperCase()
          .concat(sanitizedEventName.slice(1))}`
        // @ts-expect-error
        const handler = this[handlerName]?.bind(this)
        if (handler) {
          this.sfuListeners.set(event, handler)
          this.sfu?.addEventListener(event, handler)
        }
      })
    },
    closeSFU() {
      this.sfu?.close()
      this.sfuListeners.forEach((listener, event) => {
        this.sfu?.removeEventListener(event, listener)
      })
      this.sfu = null
      this.global.location.reload()
    },
    async getDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        this.$set(
          this.devices,
          'videoinput',
          devices.filter(({ kind }) => kind === 'videoinput')
        )
        this.$set(
          this.devices,
          'audioinput',
          devices.filter(({ kind }) => kind === 'audioinput')
        )
        this.$set(
          this.devices,
          'audiooutput',
          devices.filter(({ kind }) => kind === 'audiooutput')
        )
        Object.keys(this.devices).forEach((device) => {
          // @ts-expect-error
          this.selectedSources[device] = this.devices[device]
            ? this.devices[device][0].deviceId
            : null
        })
      } catch (e) {
        console.error(e)
      }
    },
    async getUserMedia(
      constraints?: MediaStreamConstraints
    ): Promise<MediaStream | null> {
      // @ts-expect-error
      let stream: MediaStream = null
      if (this.global?.navigator?.mediaDevices) {
        const { mediaDevices } = this.global.navigator
        try {
          stream = await mediaDevices.getUserMedia(
            constraints ?? {
              audio: true,
              video: true,
            }
          )
        } catch (e) {
          this.noTracks = true
        }
      }
      return stream
    },
    async updateLocalTracks() {
      this.localStream?.getTracks().forEach((track) => {
        track.stop()
      })
      const { videoinput, audioinput } = this.selectedSources
      const constraints = {
        audio: {
          deviceId: audioinput ? { exact: audioinput } : undefined,
        },
        video: {
          deviceId: videoinput ? { exact: videoinput } : undefined,
        },
      }
      if (this.localStream) {
        this.$delete(this.streams, this.localStream.id)
        // @ts-expect-error
        this.localStream = await this.getUserMedia(constraints)
        this.updateVideos(this.localStream!, true)
        if (this.connectionStatus) {
          this.localStream!.getTracks().forEach((track) => {
            this.sfu?.replaceTrack(track)
          })
        }
      }
    },
    close() {
      Object.keys(this.streams).forEach((streamId) => {
        if (streamId !== this.localStream!.id) {
          this.$delete(this.streams, streamId)
        }
      })
      this.closeSFU()
      this.connectionStatus = false
      this.attrs.meetingId = ''
    },
    changeTrackState(kind: 'audio' | 'video') {
      if (this.localStream) {
        // @ts-expect-error
        const tracks: MediaStreamTrack[] = this.localStream[
          `get${kind.charAt(0).toUpperCase().concat(kind.slice(1))}Tracks`
        ]()
        tracks.forEach((track: MediaStreamTrack) => {
          track.enabled = !track.enabled
        })
        this[kind] = !this[kind]
        this.sfu?.sendMessage(
          createMessage('info', {
            action: 'mediachange',
            info: {
              kind,
              value: this[kind],
            },
          })
        )
      }
    },
    onError(ev: CustomEvent) {
      if (this.errorTimeout) {
        clearTimeout(this.errorTimeout)
        this.error = ''
      }
      this.error = ev.detail
      // @ts-expect-error
      this.errorTimeout = setTimeout(() => {
        this.error = ''
      }, 2000)
    },
    onLeft(ev: CustomEvent) {
      const { streamId } = ev.detail
      this.$delete(this.streams, streamId)
      this.$delete(this.$refs, streamId)
    },
    onJoin(ev: CustomEvent<{ [key: string]: string }>) {
      const { detail } = ev
      console.log(detail)
      Object.keys(detail).forEach((streamId) => {
        this.$set(this.usernames, streamId, detail[streamId])
      })
    },
    onConnected() {
      this.connectionStatus = true
      if (this.localStream) {
        this.localStream
          .getTracks()
          // @ts-expect-error
          .forEach((track) => this.sfu?.addTrack(track, this.localStream))
      }
    },
    onNewtrack(ev: CustomEvent) {
      const { streams } = ev.detail
      this.updateVideos(streams[0])
    },
    onReady(ev: CustomEvent) {
      const { meetingId } = ev.detail
      if (!this.attrs.meetingId) this.attrs.meetingId = meetingId
    },
    create() {
      if (!this.sfu) this.setupSFU()
      this.sfu?.connect(this.attrs.username)
      this.usernames[this.localStream!.id] = this.attrs.username
    },
    join() {
      if (!this.sfu) this.setupSFU()
      this.sfu?.connect(this.attrs.username, this.attrs.meetingId)
      this.usernames[this.localStream!.id] = this.attrs.username
    },
    updateVideos(stream: MediaStream, muted?: boolean) {
      if (!this.streams[stream.id]) {
        this.$set(this.streams, stream.id, stream)
        this.$nextTick(() => {
          // @ts-expect-error
          const video: HTMLVideoElement = this.$refs[
            stream.id
          ][0].getElementsByTagName('video')[0]
          video.srcObject = stream
          if (muted) {
            video.muted = true
          }
        })
      }
    },
  },
  watch: {
    selectedSources: {
      deep: true,
      immediate: false,
      handler() {
        this.updateLocalTracks()
      },
    },
  },
})
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.monitors {
  display: flex;
  flex-wrap: wrap;
  flex-direction: row;
}
#login {
  margin: auto;
  max-width: 500px;
  display: flex;
  text-align: center;
  flex-direction: column;
  justify-items: center;
  align-content: center;
}
#login input,
#login button {
  margin: 6px;
}

.devices {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.device {
  display: flex;
  flex-direction: row;
  width: 500px;
}

.device h5 {
  display: block;
  width: 100px;
  text-align: left;
}

.device select {
  margin-top: 6px;
  margin-bottom: 6px;
  width: 300px;
}

.device button {
  margin-top: 6px;
  margin-bottom: 6px;
  margin-left: 6px;
  width: 100px;
}
</style>
