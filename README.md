# WebRTC Videoconference

This repo contains my undergraduate thesis project, a WebRTC based videoconference app.

## Description

The goal of the project was to build a videoconference app with novel tools and then investigate its performances.
This application heavily relies on WebRTC, a web standard for real-time communications, and contains both the client
and server side code required to run the app.

## Main features

- [x] Perfect negotation pattern for session establishment
- [x] Single Forward Unit for server-side stream forwarding
- [x] Room-based conferences
- [x] Optional stream forwading (only audio, only video, video and audio)
- [x] Safari compatibility

## Prerequisites

This repo follows the monorepo architecture and uses lerna to manage dependencies and deployments. **Lerna** and **npm** must be
available on your machine

## Testing locally

1. Install dependencies
```bash
  npm i
```
2. Start the server in HMR mode
```bash
   lerna run serve --scope=sfu-server
```
3. Run the clien app in HMR mode
```bash
   lerna run server --scope=sfu-client
```
