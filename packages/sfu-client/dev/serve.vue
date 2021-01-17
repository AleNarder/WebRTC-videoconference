<script lang="ts">
import Vue from 'vue'
import SfuClient from '@/sfu-client.vue'

export default Vue.extend({
  name: 'ServeDev',
  components: {
    SfuClient,
  },
  data() {
    return {
      config: {
        socketOptions: {
          url: process.env.VUE_APP_WS_SERVER_HOST,
        },
        debug: true,
      },
    }
  },
})
</script>

<template>
  <div id="app">
    <sfu-client :config="config" />
  </div>
</template>
