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

## Iteration 5 (2026-02-05)
- ✅ **Resend verification email button on login failure**: backend endpoint `POST /api/auth/resend-verification` (rate-safe, returns `{ok:true}` regardless to prevent enumeration); frontend shows a purple banner + "Resend verification email" button whenever login returns the "please verify" 403 error.
- ⏸ **DNS-verified sender for production** — deferred. User does not own a domain yet. Current sender `onboarding@resend.dev` is fine for beta (~100 emails/day). When user buys a domain (Namecheap/Cloudflare ~$10/yr), the switch is a single-line env change: update `SENDER_EMAIL` in `/app/backend/.env` after verifying SPF/DKIM/DMARC/Return-Path DNS records in the Resend dashboard.
- ✅ **Neon purple palette**: primary `#A855F7`, hover `#C026D3`, accent `#EC4899` / cyan `#22D3EE`. All red replaced across the app; CSS vars + Tailwind ring updated.
- ✅ **Original logo** (`/app/frontend/src/components/Logo.js`): four-point starburst with inner play triangle + orbiting cyan spark, rendered via SVG gradient (purple → pink → cyan). Original geometry — no derivative resemblance to known brand marks.
- ✅ **Landing marketing** now highlights HD recording: hero subheading + "Record in HD, keep forever" feature card explicitly mentions saving the whole session as a `.webm` file, with host-approved viewer recording.
- ✅ **Viewer request-to-record**: viewers see a "Request record" button in the top bar of a watch room. Sends `record_request` via WS to the host; host gets a native confirm dialog + `record_response` broadcast. On approve, viewer's `MediaRecorder` starts on the incoming remote stream and saves the HD file on their computer.
- ✅ **Resend email integration** (`RESEND_API_KEY` in `/app/backend/.env`; sender `onboarding@resend.dev`):
  - Registration sends verification email; login blocked with clear "please check inbox and spam folder" message until verified
  - `GET /api/auth/verify?token=...`
  - `POST /api/auth/forgot-password` + `POST /api/auth/reset-password` (token-based, 1h expiry) + `/forgot-password` frontend page + link on Login
- ⏸ **YouTube URL support** — deferred to next iteration (WS `yt_state` relay hook already wired on backend, frontend player integration pending)
- ✅ Admin password rotated to `streamstar@1` (see test_credentials.md); backend auto-updates hash on startup
- ✅ Register: **show/hide password toggle** + **confirm password** field with live match/mismatch indicator; submit disabled until match+valid
- ✅ Login: show/hide password toggle
- ✅ Logo always routes to `/` (landing)
- ✅ Non-host click on "New watch room" → **Request Host** dialog with 60-second countdown + progress bar; auto-approve on timeout, super admin gets a notification
- ✅ Super-admin **Command Center**: 4 stat tiles (users / hosts / pending / notifs), live Recent Activity feed (auto-refreshes every 15s), enriched Users table with **login count**, **last login**, **joined date**, **auth provider**; search box; per-user actions: host toggle, **reset password**, **delete user**
- ✅ Self-profile endpoints: `PATCH /api/users/me` (name+email), `POST /api/users/me/change-password`
- ⏸ **Email verification via Resend** — deferred; user opted to skip email for now, will wire later (backend has `email_verified` field ready; register + login flow simply defaults to `true` until email provider is configured)

## Iteration 6 (2026-02-05)
- ✅ **Dashboard room cards — prominent code + invite link**: each card now displays a purple-gradient share block with the room CODE (uppercase monospace) and LINK on separate rows. Both rows and their trailing copy icons are clickable to copy. Hosts can share instantly the moment a room is created without opening the watch room. Test IDs: `share-block-<room_id>`, `room-code-<room_id>`, `copy-code-<room_id>`, `room-link-<room_id>`, `copy-room-<room_id>`.
- ✅ **Landing "How it works" — first step rewrite**: replaced generic "Get invited / super admin grants access" copy with **"Claim your director's chair"** — customer-control-forward vocabulary ("design your own private theater, set the vibe, invite your crew, call the shots"). Reinforces StreamStar's promise of frictionless self-serve hosting.

## Iteration 7 (2026-02-05)
- ✅ **Legacy rename**: "AdminRoom" → "Super Admin Room" via idempotent startup migration.
- ✅ **Host-request UX simplified**: viewers no longer see the 60s auto-approve countdown. Pending state shows: "Requested the SuperAdmin for host access. You'll shortly be notified!"
- ✅ **Notification system**: `notifications` collection now supports per-user targeting (`recipient_id`). New endpoints: `GET /api/notifications/me`, `POST /api/notifications/{id}/read`, `POST /api/notifications/me/read-all`. A `<NotificationBell />` component lives in the navbar with an unread badge, polls every 15s, and auto-refreshes `/auth/me` when a `host_granted` notification arrives. Triggers: host_granted (manual + auto-approve), host_revoked, join_knock (to host), join_approved / join_denied (to guest).
- ✅ **7-day Activity log**: new `events` collection with a native-datetime `created_at` and a 7-day TTL index. Logged events: room_created, participant_joined, participant_left, stream_started, stream_ended (with duration_ms), host_granted / host_revoked, join_knock, guest_admitted, guest_denied. New endpoint `GET /api/events` (super-admin only, filterable). Admin panel has an "Activity log" section with filter chips.
- ✅ **Code visibility**: `RoomOut.code` field is now conditionally populated. Super-admin sees all codes; a host sees codes for rooms they host; general users see codes only for rooms they've previously joined (tracked in the new `room_visits` collection). Dashboard cards render the share-block only when `r.code` is present, and the join button says "Knock to join" otherwise.
- ✅ **Knock-to-enter**: WebSocket handler now routes non-host / non-admin / first-time visitors into a `PENDING` queue with `pending_admission` message. Host sees a floating "N people knocking" panel with Check/X buttons; sends `join_response` back. Approvals emit `admission_granted` + persist `room_visits`; denials emit `admission_denied` and close the socket (4403). Auto-admit on reconnect for previously admitted users. Stream sessions logged with duration when host toggles `host_streaming` on/off (also captures host-disconnect while streaming).

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
