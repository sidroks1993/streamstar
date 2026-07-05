# StreamStar — Product Requirements Document

## Original Problem Statement
> Design a web application for a movie streaming service in which anyone with permission from the super administrator can stream movies while other participants watch it together in HD, chat live, and enjoy full playback controls (quality, speed, volume). Easy to use, easy to share.

## Architecture
- **Backend:** FastAPI (Python), MongoDB via Motor, WebSocket signaling
- **Frontend:** React 19 + Tailwind + Shadcn/UI (dark cinematic theme, Outfit + Manrope fonts)
- **Real-time:** FastAPI WebSockets for signaling + chat (`/api/ws/room/{room_id}?token=…`)
- **Streaming:** WebRTC mesh — host uses `video.captureStream()`; viewers receive via `RTCPeerConnection`
- **Auth:** Dual — Email/password JWT + Emergent-managed Google OAuth (same user record; role-based)

## User Personas
1. **Super Admin (sidroks@hotmail.com)** — grants host permission, can host any room
2. **Host** — permissioned users who can create rooms and stream their local movie files
3. **Viewer** — anyone with a link can join public rooms and chat

## Core Requirements (Static)
- Landing page with 4-step "How it works" onboarding
- Dual auth (JWT email/password + Google OAuth)
- Super-admin dashboard for granting/revoking host permission
- Create/join watch rooms with shareable `/watch/:roomId` links
- Public rooms (no admin permission to join) vs private
- WebRTC HD streaming from host's local file
- Live chat, participant list, join/leave toasts
- Custom video player: play/pause, seek (host only), volume slider, mute, playback speed (0.5–2×), quality selector, Picture-in-Picture, fullscreen

## What's Been Implemented (2026-02-05)
- ✅ Backend: auth, users, rooms, WebSocket signaling + chat, seeded super admin
- ✅ Frontend: Landing, Login, Register, Dashboard, Admin, WatchRoom, custom VideoPlayer, ChatPanel
- ✅ Emergent Google OAuth callback flow via `/auth/session`
- ✅ Copy-invite-link + join-by-link/ID
- ✅ Role-based room creation enforcement
- ✅ Backend testing: 12/12 endpoints passed
- ✅ Frontend testing: login → dashboard → create room → watch room → chat over WebSocket → admin toggle all verified end-to-end

## Iteration 2 (2026-02-05)
- ✅ **Host controls:** kick + chat-mute per participant (dropdown menu on participant chips in ChatPanel)
- ✅ **Emoji reactions:** floating overlay + 12-emoji picker in the watch room; broadcast to all viewers via WebSocket
- ✅ **Stream recording:** host-only MediaRecorder toggles record on the local stream; saves as `.webm` to Downloads on stop
- ✅ Server-side mute enforcement (chat_blocked toast); kicked participants get a toast + auto-redirect to /dashboard

## Prioritized Backlog
### P0 (blocking, none)
_None_

### P1 (next iteration)
- Persist chat history to MongoDB so late joiners see prior messages
- TURN server config for viewers behind strict NATs (currently only STUN)
- Kick/mute participant controls for the host

### P2
- Emoji reactions floating over the video
- Watch-together for YouTube/Vimeo URLs
- Room passwords for private rooms
- Recording of the stream to object storage
- Multi-host handoff

## Credentials
See `/app/memory/test_credentials.md`
