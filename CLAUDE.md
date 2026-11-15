# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

WsCore is a real-time multiplayer game server: a .NET 10 / ASP.NET Core WebSocket backend and a TypeScript (Vite) client, joined by a shared MemoryPack binary protocol. The client is a **unified single-socket app**: one `WsClient` (one WebSocket) lives the whole session, and the Discord-style lobby (text chat) and the 3D Three.js scene are **UI states** of one shell, not separate apps. (Roadmap stage 2 replaced the old 2D-Phaser / 3D / lobby split; see `.plans/`.)

## Repository layout

- `WsServer/WsServer/` — the entire server (one project; older docs describe it as several). Notable folders:
  - `Shared/` — transport-agnostic infrastructure: `MessageSerializer`, `ReflectionServerLogicProvider`, `GameMessenger`, `ConnectionManager`, `Rooms/`, `StaticFileCaching`, and `Shared/Abstract/` interfaces.
  - `Sessions/` — `SessionManager` + `ClientSession`: per-connection identity (name, slots, chat rate limit) and every room transition, incl. spawning/removing the game avatar (see [Runtime architecture](#runtime-architecture)).
  - `Game/Core/` — game simulation (`GameModel`, `Player`, `Bullet`, `World/`).
  - `Game/Protocol/{Domain}/` — message contracts grouped by domain (`Chat`, `Map`, `Player`, `GameState`, `Bullets`, `Rooms`, `Connection`), each with `Requests/`, `Events/`, `Handlers/`.
- `WsServer/WsServer.TestClient/` — a RazorConsole console app that boots an **embedded** server + interactive terminal UI. Run with `dotnet run` for local testing without the browser client.
- `WsCore.Client/src/` — TS client (unified single-socket app):
  - `app/` — the shell: `App` (owns the one `WsClient`, connects once, `lobby`↔`game` state machine, connection banner, reconnect re-init) and `LobbyState` (drives `LobbyUI` from client events; no own socket).
  - `game/` — the Three.js scene (was `3d/`): `GameScene` (scene/camera/renderer/RAF/input + full `exit()` teardown), `Player` (pure state, implements `IPlayer`), `PlayerView` (the sprite/nick visual), `World`, `MapObject`.
  - `lobby/` — `LobbyUI` + CSS only (no app logic).
  - `network/` — `WsConnection` (transport: reconnect/backoff, silence watchdog, `connectionStatus`) → `WsClient` (session state: server-driven rooms, server-confirmed joins, players only while in a spatial room; a typed `on()`/`emit()` event emitter), `rooms/`, and `network/protocol/` (**generated** — see below).
  - `utils/` — `Emitter`, `Keyboard`, `ChatUI`, `Common`, `SnapshotInterpolation` (tick-snapshot interpolation buffer + server clock).
  - `main.ts` is a thin entry that builds `App` from the name form.
  - `*.test.ts` files sit next to the code they cover (e.g. `network/rooms/RoomManager.test.ts`, `network/protocol/protocol.test.ts`) — see [Testing](#testing).
- `WsServer/WsServer.Tests/` — xUnit project: unit tests for `GameModel`/`RoomManager`/`MessageSerializer`, plus a real-WebSocket integration test in `Integration/` (see [Testing](#testing)).
- `AGENTS.md` (root) and `WsServer/AGENTS.md` — detailed prior guidance on conventions and the room system. Read them for depth; note both predate the single-project merge (see Gotchas).

## Commands

For interactive development, run server and client in **separate terminals**. For **automated testing**, bring the whole stack up in the background with `scripts/dev-up.sh` and drive the browser via the integrated-browser MCP — see [Testing](#testing).

```bash
# Server (http://localhost:5000, WebSocket at /ws, dashboard JSON at /info — connections,
# gamePlayers (avatars incl. the 10 built-in bots), per-room user counts)
cd WsServer/WsServer && dotnet run

# Client (Vite dev server at http://localhost:5001)
cd WsCore.Client && npm install && npm start

# Format TS after changes (required; enforced style)
cd WsCore.Client && npm run format        # or: npm run format:check

# Client production bundle (dist/: index.html + hashed chunks; three.js is a lazy chunk loaded on Play)
cd WsCore.Client && npm run build

# Embedded test client (server + terminal UI in one process)
cd WsServer/WsServer.TestClient && dotnet run

# --- automated testing helpers ---
scripts/dev-up.sh                  # start server + client in background (logs/pids in .run/)
CLIENT_PORT=5199 scripts/dev-up.sh # ...on an alt client port (dodge a stale :5001 service worker)
scripts/dev-down.sh                # stop both (reads the client port from .run/client.port)
```

The client is one app: it opens in the lobby; the **Play** button on a spatial room (the `game` room) enters the 3D scene, **Back to Lobby** returns, and the single WebSocket persists across those switches and across server restarts (auto-reconnect). In dev the client hard-codes the server to port 5000; in production it uses the current origin.

## Testing

Four layers, all automatable.

**Server — xUnit (`WsServer/WsServer.Tests`).** Unit tests for `GameModel` (bullet lifecycle/leak cleanup, collisions, respawn, `_playersTop` cleanup, atomic id generation), `RoomManager` (join/leave/mode/spatial-filtering), `MessageSerializer` (client-request round-trip, unknown-TypeId handling), sessions/scoping (`SessionTests`: no avatar in the lobby, avatar spawn/removal on entering/leaving `game`, who receives PlayerJoined/Left, chat, renames, heartbeats; game requests without an avatar are no-ops), wire bytes shared with the TS tests (`ProtocolWireFormatTests`), tick snapshots (`GameTickUpdateEventTests`: delta contents, stop state repeated, full-snapshot cadence, one-shot events carried across non-send ticks; `SessionTests`: send-rate divisor, idle avatar refreshed by full snapshots; `WebSocketHandlerSendQueueTests`: keyframe slot) and static-file caching. Plus integration tests (`Integration/ClientGameFlowTests.cs`) that boot the real server in-process on an OS-assigned port and drive it over real `ClientWebSocket`s: connect → join `game` → chat → observe a tick broadcast (the manual browser smoke-test flow, without a browser), and a lobby client vs a game client (lobby gets heartbeats/room list/lobby chat but no world traffic and has no avatar; after the game client returns to the lobby its avatar is gone and both share lobby chat).

```bash
cd WsServer/WsServer.Tests && dotnet test
```

**Client — Vitest (`WsCore.Client`).** Protocol round-trip tests pin fixed binary samples for a few message types (`network/protocol/protocol.test.ts`; the stage-C/D ones — incl. `MovementStateData`/`GameTickUpdateEvent` — are pinned to the same bytes on the server) so a wire-format regression breaks the test even if serialize/deserialize still agree with each other; `network/WsClient.test.ts` covers server-driven rooms, confirmed joins, the player lifecycle (none in the lobby, rebuilt on each game entry) and delta tick snapshots; `utils/SnapshotInterpolation.test.ts` the interpolation buffer and server clock; `network/WsConnection.watchdog.test.ts` the silence watchdog (fake timers); `app/LobbyState.test.ts` the lobby's room flow; `network/rooms/RoomManager.test.ts` exercises the real `RoomManager`/`Room` classes (join/leave/persistent-room/mode-switching/spatial-filtering) — this replaced the old ad-hoc `Tests/*.js` scripts at the repo root, which reimplemented room logic from scratch in plain JS against a stale pre-stage-2 model (`Spatial2D`/`Spatial3D`) and never touched real client code.

```bash
cd WsCore.Client && npm run test
```

**Server / protocol — headless load test.** `WsServer.LoadTest` spins up N bot sockets that join `game` and hammer move/shoot/chat (plus a hostile-input bot) against a real embedded server. It's the stress/soak check (memory flat, connections hold, abuse dropped, and the avatar count equals built-in bots + game-room bots — garbage bots never leave the lobby, so they have none).

```bash
cd WsServer/WsServer.LoadTest && dotnet run
```

**Client — browser smoke test via the integrated-browser MCP.** Drive the running app through the VS Code integrated browser (MCP server `integrated-browser-mcp`). Bring the stack up first:

```bash
scripts/dev-up.sh          # server :5000 + client :5001, backgrounded (logs/pids in .run/)
# ... run the browser checks below ...
scripts/dev-down.sh        # tear the stack down
```

Then, using the browser MCP tools (prefer `browser_eval` for assertions, `browser_console` for errors, `browser_screenshot` only when a visual matters):

1. `browser_navigate` → `http://localhost:5001`; click **Enter Lobby** (`#name-text-input` + the form button). Assert the lobby renders (`#lobby-container`) and `browser_console` is error-free.
2. Click **Play** on the `game` room → assert the 3D canvas exists: `document.querySelectorAll('#game canvas').length === 1`.
3. Click **Back to Lobby** → assert `document.querySelectorAll('#game canvas').length === 0`.
4. **Leak check — repeat lobby→game→lobby ~10×**, then assert *nothing accumulates*:
   - `#game canvas` ≤ 1, `#chat-overlay` ≤ 1, `#lobby-container` ≤ 1
   - back buttons: `[...document.querySelectorAll('div')].filter(d => d.textContent === 'Back to Lobby').length` ≤ 1
   - `browser_console` still clean (no per-frame errors from a dead renderer), and `performance.memory.usedJSHeapSize` is not climbing monotonically across cycles.
5. **Reconnect** — assert the banner (`#connection-banner`) shows during an outage and hides on recovery. Two ways to exercise it:
   - **Server-down-first (reliable in the integrated browser):** stop the server (`scripts/dev-down.sh server`), *then* load the app and enter the lobby → the banner reads `Connection lost — reconnecting…` while the backoff loop retries. Start the server (`scripts/dev-up.sh`) → the banner hides, the name form stays hidden, and the lobby repopulates (reconnect assigns a *new* clientId — session restoration is a later roadmap milestone).
   - Kill-while-connected also triggers the banner in a real browser, but **the VS Code integrated browser reloads the tab when an established WebSocket is killed** (the app itself never calls `location.reload`), which masks the banner — prefer the server-down-first method there.

Caveats when driving the integrated browser:
- A **service worker from another localhost project can shadow `localhost:5001`** and serve the wrong app (you'll see a foreign `document.title`). Bring the stack up on a dedicated port — `CLIENT_PORT=5199 scripts/dev-up.sh` — and navigate there; a distinct port is a distinct origin with no stray SW.
- The dev client's `getWebSocketUrl()` always targets `:5000`, so the client port doesn't affect which server it talks to.

This procedure is the acceptance check for the unified client (roadmap stage 2) — it has been run and passes (10 cycles: exactly one canvas in-game, zero leaked overlays/buttons/canvases in the lobby; reconnect banner + recovery confirmed). When adding features, extend it rather than reverting to eyeballing.

## Message protocol (the core abstraction)

Every client↔server message is framed as `[TypeId: 1 byte][MemoryPack payload]`.

- A message is a `[MemoryPackable] partial class` implementing **`IClientRequest`** (client→server) or **`IServerEvent`** (server→client), with a `static byte TypeId`. `[GenerateTypeScript]` opts it into TS codegen.
- `ReflectionServerLogicProvider` scans the assembly at startup, registering every `IClientRequest`/`IServerEvent` by its `TypeId` and wiring each request to its handler. **TypeIds must be unique** — a collision throws `DuplicateMessageIdException` at boot (a stale hand-maintained `ServerMessageType.cs` map used to promise this but had drifted out of sync with real ids and was removed; before picking a new id, grep for `TypeId =>` across `Game/Protocol/**` to see what's taken).
- Request handlers subclass `RequestHandlerBase<TRequest>` and are constructed via DI (`ClientRequestHandlerFactory`), so they can inject `IGameMessenger`, `ILogger`, etc.
- `WebSocketHandler` also accepts **JSON text frames** as a debugging fallback (it reflects fields onto the request type by name); the real client always sends binary.

### Adding a new message type

1. Create the class under the right `Game/Protocol/{Domain}/{Requests|Events}/`, mark it `[MemoryPackable]` (+ `[GenerateTypeScript]`), implement `IClientRequest`/`IServerEvent`, assign an unused `TypeId`.
2. For a request, add a `{Name}Handler : RequestHandlerBase<{Name}Request>` in that domain's `Handlers/`. Discovery is automatic — no manual registration.
3. Regenerate client TS types (below), then handle the message in the client's `WsClient`/`WsConnection` layer.

### Regenerating client TypeScript types — non-obvious

The generated files in `WsCore.Client/src/network/protocol/` (readers/writers + model classes) come from MemoryPack's TS source generator, but the generator output is **commented out** in `WsServer/WsServer/WsServer.csproj` (the `MemoryPackGenerator_TypeScriptOutputDirectory` block). The checked-in TS is the source of truth day-to-day. To regenerate after changing a `[GenerateTypeScript]` type, **uncomment that block, build the server, then re-comment it**, and run `npm run format`.

## Runtime architecture

- **A connection is not a player.** Connecting creates a `ClientSession` (name, equipment slots, chat cooldown — `Sessions/SessionManager.cs`) and puts the client in the `lobby` room; a `Player` avatar in `GameModel` (id == clientId) exists only while the client is in a room supporting `RoomCompatibility.Spatial` (the `game` room) and is removed when it leaves that room or disconnects. All room transitions go through `SessionManager.JoinRoom`, which answers the joiner with `JoinRoomResultEvent` (success or failure, before any room state). Scoping: entering the game → the joiner gets `GameStateUpdateEvent`, other spatial members `PlayerJoinedEvent`; leaving/disconnect → `PlayerLeftEvent` to spatial members; shots/slots/respawns/map changes → spatial members (`IGameMessenger.BroadcastToSpatial`); chat → the sender's room only (`BroadcastToRoom`); `SetPlayerNameEvent` → the client's room (for a client with an avatar: the spatial audience); `RoomUsersUpdateEvent` → the room's members; `RoomListEvent` → pushed to non-spatial clients on any membership change. Game requests (move/target/shoot/respawn/slots/map) from a client without an avatar are no-ops (slots are remembered on the session and applied at spawn).
- `GameServer : GameServerBase<GameModel>` owns the fixed **~30 FPS loop** (`PeriodicTimer` at 33 ms). It is a **hosted service** (`IHostedLifecycleService`): the loop starts with the host, and graceful shutdown (SIGTERM/Ctrl+C) closes every socket in `StoppingAsync`, then stops the loop and drops room state in `StopAsync` — no manual `ApplicationStopping` hook. The simulation runs every tick; a `GameTickUpdateEvent` snapshot is sent only every `SnapshotSendEveryTicks`-th tick (default 2 → ~15 Hz; 1 = every tick) via `GameMessenger.BroadcastSpatialUpdates`, which filters recipients by room so only spatial-room members receive movement updates.
- **Tick snapshots are deltas** (`GameTickUpdateEvent`, built on the tick thread): `ServerTimeMs` (sim time, for client interpolation) + `MovementStateData` (`PlayerId`, `X`, `Y`, `AnimationState` byte — 14 B; aim/target/controls/body angle/velocity are no longer replicated) for only the avatars whose position/animation changed within the last `SnapshotRepeatUnchanged + 1` snapshots (default 2 → a stopped avatar's final state is sent 3×), plus a **full snapshot** (every avatar) every `FullSnapshotIntervalSeconds` (1 s; ≤ 0 = always full). Full snapshots go out as **keyframes**: in the latest-wins slot a pending keyframe is replaced only by a newer keyframe, never by a delta, so a client that loses deltas still converges within one full-snapshot period. An avatar absent from a snapshot is unchanged. The one-shot arrays (`DestroyedBulletsIds`, `RespawnedPlayerIds`, `HitPlayersState`) are accumulated over the ticks between snapshots, but still ride the lossy slot (a replaced snapshot loses them; the client currently ignores them). `WsServer.LoadTest` prints tick bytes/sec per spatial client (`--idle 1` = mostly-idle scenario).
- **Client interpolation** (`src/utils/SnapshotInterpolation.ts`, pure + unit-tested): `WsClient` feeds each snapshot into `ServerClock` (server-time estimate from `ServerTimeMs` + arrival time; also estimates the send interval) and each avatar's `PositionBuffer` (`push` for avatars in the snapshot, `hold` for absent ones — no extrapolation; jumps > `TELEPORT_DISTANCE` snap). `GameScene` draws remote avatars at `serverNow − (1.5 × interval + 15 ms)` and our own at `serverNow − (interval + 25 ms)`; velocity (run animation, sprite facing) comes from the interpolated segment. Player input state (`controls`, aim) is client-owned and never overwritten by snapshots.
- **Single-threaded model.** Client requests, connects and disconnects are all queued from socket threads and executed on the tick thread (`GameServerBase` command queue). On connect the client id is reserved atomically and handed to `WebSocketHandler` synchronously (before its receive loop starts); registration, the session, `InitPlayerEvent` (always the client's first message) and the `lobby` auto-join (`JoinRoomResultEvent`, user list, room list) happen on the next tick — no avatar, no game state. A disconnect is queued behind its connect, so a socket that drops early never leaks a session or an avatar. On disconnect `SessionManager` cleans up room membership, removes the avatar (if any) and tells spatial members (`PlayerLeftEvent`).
- Rooms are persistent and defined **only** in `GameServer.InitializeDefaultRooms()`; clients learn them from `RoomListEvent` (id, name, supported modes, persistence, user count). Spatial state is filtered. `GameModel` uses plain collections (tick thread only; only the id generators and `PlayersCount`/`BulletsCount` are safe from other threads) — never mutate it outside the command queue. `RoomManager`/`ConnectionManager` stay concurrent (`/info` and shutdown enumerate connections off-thread).
- **Send path** (`WebSocketHandler`): one sender per socket fed by a reliable bounded FIFO (`IClientConnection.Send`; capacity `WebSocketSendQueueCapacity` — overflow **terminates** the connection rather than dropping an event) plus a single latest-wins slot for the tick snapshot (`SendLatest`, used by `BroadcastSpatialUpdates`; keyframe-aware, see above). Order between them is preserved. WebSocket keep-alive pings (`WebSocketKeepAlive{Interval,Timeout}Seconds`, 15 s each) drop half-open connections server-side. For the client side, every connection gets a tiny `HeartbeatEvent` (TypeId 7) every `HeartbeatIntervalSeconds` (5 s; sent on the tick thread via the reliable path, 0 disables), and `WsConnection`'s watchdog treats ~15 s (`WATCHDOG_TIMEOUT_MS`) without *any* message while `open` as a dead socket → normal reconnect/backoff with the banner. The watchdog opens a fresh grace window when its own timer was suspended (frozen tab / sleep) or the tab becomes visible again, so background throttling doesn't cause reconnect storms.
- **Static files** (`Program.cs` → `StaticFileCaching`): Vite's hashed chunks (`/assets/name-HASH.ext`) are served `Cache-Control: public, max-age=31536000, immutable`, `index.html` `no-cache`; unhashed public assets (`/knight`, `/map`, `/ui`, `/assets/logo.png`) get no explicit Cache-Control.
- Everything is wired by `services.AddGameServer(config)` + `app.UseGameServer()` (`/ws`, `/health`, `/info`; `WsServer/WsServer/GameServerHostingExtensions.cs`), shared by `Program.cs`, the LoadTest, the TestClient and the test fixture. `GameServer` is one singleton exposed as both `IGameServer` and the hosted service.

## Gotchas (things that will bite)

- **Folders ≠ namespaces.** Files under `Game/Protocol/Chat/` live in namespace `Game.ServerLogic.Chat.*`; `Shared/` files are in `WsServer.*` / `WsServer.Abstract.*`; rooms are in `WsServer.Rooms`. Match the existing namespace of neighboring files, not the folder path.
- **The server is one project now** (commit "Merging all server projects into one"). References to separate `Game/`, `WsServer.Shared/`, `WsServer.DataBuffer/`, and `BenchmarkSuite1/` projects in `AGENTS.md` are stale — those are now folders inside `WsServer/WsServer/`. (The `Dockerfile` has been updated to the single-project layout.)
- **Two room enums, now aligned.** The server uses `WsServer.Rooms.RoomCompatibility` (`TextChat`, `Spatial`, `VoiceChat`, `VideoChat`) and the client uses `CommunicationMode` (`TextChat`, `Spatial`, `VoiceChat`, `VideoChat`). Stage 2 collapsed the client's old `Spatial2D`/`Spatial3D` into a single `Spatial`, so they're now 1:1 — but they're still **two separate enums**, keep both in sync when adding a mode. (`RoomCompatibility` is `[Flags]`-marked yet its values aren't powers of two — a known latent bug, unrelated.)
- **Rooms come from the server.** `GameServer.InitializeDefaultRooms` (`lobby`, `voice`, `game`) is the only definition; the client has no room list of its own (`WsClient` syncs `RoomManager` from `RoomListEvent`, requested on every session init and pushed on membership changes; `LobbyUI` renders whatever arrives, with a Play button for any `Spatial` room). Joins are **server-confirmed**: `WsClient.joinRoom()` only sends the request; membership, the spatial mode and the player set change on `JoinRoomResultEvent` (`roomJoined` / `roomJoinFailed` events). The lobby state returns to the *home room* (the room the server auto-joined on connect, `WsClient.homeRoomId`); the game state (re)joins the room whose Play was clicked. The only client-side room ids left are icon lookups in `LobbyUI`.
- Keep `[MemoryPackable]` message types simple (flat, immutable-ish, no complex inheritance) — the serializer and TS generator both assume that.
