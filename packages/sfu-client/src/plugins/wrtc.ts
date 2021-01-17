import Vue from "vue";
export default function(
  vue: typeof Vue,
  options: {
    socketOptions: {
      url: string;
      protocols?: string | string[];
    };
    rtcOptions?: RTCConfiguration;
    debug: boolean;
  }
) {
  vue.prototype.$sfuOptions = options;
}
