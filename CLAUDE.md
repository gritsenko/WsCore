# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

WsCore is a real-time multiplayer game server: a .NET 10 / ASP.NET Core WebSocket backend and a TypeScript (Vite) client, joined by a shared MemoryPack binary protocol. The client is a **unified single-socket app**: one `WsClient` (one WebSocket) lives the whole session, and the Discord-style lobby (text chat) and the 3D Three.js scene are **UI states** of one shell, not separate apps. (Roadmap stage 2 replaced the old 2D-Phaser / 3D / lobby split; see `.plans/`.)

## Repository layout

- `WsServer/WsServer/` — the entire server (one project; older docs describe it as several). Notable folders:
  - `Shared/` — transport-agnostic infrastructure: `MessageSerializer`, `ReflectionServerLogicProvider`, `GameMessenger`, `ConnectionManager`, `Rooms/`, and `Shared/Abstract/` interfaces.
  - `Game/Core/` — game simulation (`GameModel`, `Player`, `Bullet`, `World/`).
  - `Game/Protocol/{Domain}/` — message contracts grouped by domain (`Chat`, `Map`, `Player`, `GameState`, `Bullets`, `Rooms`), each with `Requests/`, `Events/`, `Handlers/`.
- `WsServer/WsServer.TestClient/` — a RazorConsole console app that boots an **embedded** server + interactive terminal UI. Run with `dotnet run` for local testing without the browser client.
- `WsCore.Client/src/` — TS client (unified single-socket app):
  - `app/` — the shell: `App` (owns the one `WsClient`, connects once, `lobby`↔`game` state machine, connection banner, reconnect re-init) and `LobbyState` (drives `LobbyUI` from client events; no own socket).
  - `game/` — the Three.js scene (was `3d/`): `GameScene` (scene/camera/renderer/RAF/input + full `exit()` teardown), `Player` (pure state, implements `IPlayer`), `PlayerView` (the sprite/nick visual), `World`, `MapObject`.
  - `lobby/` — `LobbyUI` + CSS only (no app logic).
  - `network/` — `WsConnection` (transport: reconnect/backoff, `connectionStatus`) → `WsClient` (session state + a typed `on()`/`emit()` event emitter), `rooms/`, and `network/protocol/` (**generated** — see below).
  - `utils/` — `Emitter`, `Keyboard`, `ChatUI`, `Common`, `TypeState`.
  - `main.ts` is a thin entry that builds `App` from the name form.
- `Tests/*.js` — standalone Node simulation scripts (they reimplement room logic in JS to reason about it; they are not integration tests against a running server, and they predate stage 2 — they still say `2d-game`/`Spatial2D`). Run with `node Tests/test-rooms.js`.
- `AGENTS.md` (root) and `WsServer/AGENTS.md` — detailed prior guidance on conventions and the room system. Read them for depth; note both predate the single-project merge (see Gotchas).

## Commands

For interactive development, run server and client in **separate terminals**. For **automated testing**, bring the whole stack up in the background with `scripts/dev-up.sh` and drive the browser via the integrated-browser MCP — see [Testing](#testing).

```bash
# Server (http://localhost:5000, WebSocket at /ws, dashboard JSON at /info)
cd WsServer/WsServer && dotnet run

# Client (Vite dev server at http://localhost:5173)
cd WsCore.Client && npm install && npm start

# Format TS after changes (required; enforced style)
cd WsCore.Client && npm run format        # or: npm run format:check

# Client production bundle (single-file build via vite-plugin-singlefile)
cd WsCore.Client && npm run build

# Embedded test client (server + terminal UI in one process)
cd WsServer/WsServer.TestClient && dotnet run

# --- automated testing helpers ---
scripts/dev-up.sh                  # start server + client in background (logs/pids in .run/)
CLIENT_PORT=5199 scripts/dev-up.sh # ...on an alt client port (dodge a stale :5173 service worker)
scripts/dev-down.sh                # stop both (reads the client port from .run/client.port)
```

The client is one app: it opens in the lobby; the **Play** button on the `game` room enters the 3D scene, **Back to Lobby** returns, and the single WebSocket persists across those switches and across server restarts (auto-reconnect). In dev the client hard-codes the server to port 5000; in production it uses the current origin.

## Testing

Two layers, both automatable — there is no xUnit/Vitest project yet (planned for roadmap stage 4).

**Server / protocol — headless load test.** `WsServer.LoadTest` spins up N bot sockets that join `game` and hammer move/shoot/chat (plus a hostile-input bot) against a real embedded server. It's the stress/soak check (memory flat, connections hold, abuse dropped).

```bash
cd WsServer/WsServer.LoadTest && dotnet run
```

**Client — browser smoke test via the integrated-browser MCP.** Drive the running app through the VS Code integrated browser (MCP server `integrated-browser-mcp`). Bring the stack up first:

```bash
scripts/dev-up.sh          # server :5000 + client :5173, backgrounded (logs/pids in .run/)
# ... run the browser checks below ...
scripts/dev-down.sh        # tear the stack down
```

Then, using the browser MCP tools (prefer `browser_eval` for assertions, `browser_console` for errors, `browser_screenshot` only when a visual matters):

1. `browser_navigate` → `http://localhost:5173`; click **Enter Lobby** (`#name-text-input` + the form button). Assert the lobby renders (`#lobby-container`) and `browser_console` is error-free.
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
- A **service worker from another localhost project can shadow `localhost:5173`** and serve the wrong app (you'll see a foreign `document.title`). Bring the stack up on a dedicated port — `CLIENT_PORT=5199 scripts/dev-up.sh` — and navigate there; a distinct port is a distinct origin with no stray SW.
- The dev client's `getWebSocketUrl()` always targets `:5000`, so the client port doesn't affect which server it talks to.

This procedure is the acceptance check for the unified client (roadmap stage 2) — it has been run and passes (10 cycles: exactly one canvas in-game, zero leaked overlays/buttons/canvases in the lobby; reconnect banner + recovery confirmed). When adding features, extend it rather than reverting to eyeballing.

## Message protocol (the core abstraction)

Every client↔server message is framed as `[TypeId: 1 byte][MemoryPack payload]`.

- A message is a `[MemoryPackable] partial class` implementing **`IClientRequest`** (client→server) or **`IServerEvent`** (server→client), with a `static byte TypeId`. `[GenerateTypeScript]` opts it into TS codegen.
- `ReflectionServerLogicProvider` scans the assembly at startup, registering every `IClientRequest`/`IServerEvent` by its `TypeId` and wiring each request to its handler. **TypeIds must be unique** — a collision throws `DuplicateMessageIdException` at boot. `Game/Protocol/ServerMessageType.cs` is the human-readable map of assigned IDs; consult it before picking a new one.
- Request handlers subclass `RequestHandlerBase<TRequest>` and are constructed via DI (`ClientRequestHandlerFactory`), so they can inject `IGameMessenger`, `ILogger`, etc.
- `WebSocketHandler` also accepts **JSON text frames** as a debugging fallback (it reflects fields onto the request type by name); the real client always sends binary.

### Adding a new message type

1. Create the class under the right `Game/Protocol/{Domain}/{Requests|Events}/`, mark it `[MemoryPackable]` (+ `[GenerateTypeScript]`), implement `IClientRequest`/`IServerEvent`, assign an unused `TypeId`.
2. For a request, add a `{Name}Handler : RequestHandlerBase<{Name}Request>` in that domain's `Handlers/`. Discovery is automatic — no manual registration.
3. Regenerate client TS types (below), then handle the message in the client's `WsClient`/`WsConnection` layer.

### Regenerating client TypeScript types — non-obvious

The generated files in `WsCore.Client/src/network/protocol/` (readers/writers + model classes) come from MemoryPack's TS source generator, but the generator output is **commented out** in `WsServer/WsServer/WsServer.csproj` (the `MemoryPackGenerator_TypeScriptOutputDirectory` block). The checked-in TS is the source of truth day-to-day. To regenerate after changing a `[GenerateTypeScript]` type, **uncomment that block, build the server, then re-comment it**, and run `npm run format`.

## Runtime architecture

- `GameServer : GameServerBase<GameModel>` owns the fixed **~30 FPS loop** (`PeriodicTimer` at 33 ms). Each tick builds a `GameTickUpdateEvent` snapshot and broadcasts it via `GameMessenger.BroadcastSpatialUpdates`, which filters recipients by room/proximity so only spatial-room members receive movement updates.
- `GameServer` also handles connection lifecycle: on connect it auto-joins the `lobby` room, assigns a client id, and sends `InitPlayerEvent` + current game state; on disconnect it cleans up room membership and broadcasts `PlayerLeftEvent`.
- Rooms are persistent and defined in `GameServer.InitializeDefaultRooms()`. Chat broadcasts to all members; spatial state is filtered. `GameModel` state uses `ConcurrentDictionary`; avoid locks in the tick loop.
- Everything is wired in `WsServer/WsServer/Program.cs` via singleton DI (`IServerLogicProvider`, `RoomManager`, `IGameMessenger`, `GameModel`, `IGameServer`).

## Gotchas (things that will bite)

- **Folders ≠ namespaces.** Files under `Game/Protocol/Chat/` live in namespace `Game.ServerLogic.Chat.*`; `Shared/` files are in `WsServer.*` / `WsServer.Abstract.*`; rooms are in `WsServer.Rooms`. Match the existing namespace of neighboring files, not the folder path.
- **The server is one project now** (commit "Merging all server projects into one"). References to separate `Game/`, `WsServer.Shared/`, `WsServer.DataBuffer/`, and `BenchmarkSuite1/` projects in `AGENTS.md` are stale — those are now folders inside `WsServer/WsServer/`. (The `Dockerfile` has been updated to the single-project layout.)
- **Two room enums, now aligned.** The server uses `WsServer.Rooms.RoomCompatibility` (`TextChat`, `Spatial`, `VoiceChat`, `VideoChat`) and the client uses `CommunicationMode` (`TextChat`, `Spatial`, `VoiceChat`, `VideoChat`). Stage 2 collapsed the client's old `Spatial2D`/`Spatial3D` into a single `Spatial`, so they're now 1:1 — but they're still **two separate enums**, keep both in sync when adding a mode. (`RoomCompatibility` is `[Flags]`-marked yet its values aren't powers of two — a known latent bug, unrelated.)
- **Rooms are symmetric now.** Both sides define exactly `lobby`, `voice`, `game` (the old `2d-game` was renamed to `game`; `3d-game` was removed). `GameServer.InitializeDefaultRooms` (server) and `WsClient.initializeDefaultRooms` (client) must stay in sync; the client `LobbyUI` and `LobbyState` room lists too.
- Keep `[MemoryPackable]` message types simple (flat, immutable-ish, no complex inheritance) — the serializer and TS generator both assume that.
