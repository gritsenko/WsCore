# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

WsCore is a real-time multiplayer game server: a .NET 10 / ASP.NET Core WebSocket backend and a TypeScript (Vite) client, joined by a shared MemoryPack binary protocol. The client runs three modes from one entry point — a Discord-style lobby (text chat), a 2D Phaser game, and a 3D Three.js game.

## Repository layout

- `WsServer/WsServer/` — the entire server (one project; older docs describe it as several). Notable folders:
  - `Shared/` — transport-agnostic infrastructure: `MessageSerializer`, `ReflectionServerLogicProvider`, `GameMessenger`, `ConnectionManager`, `Rooms/`, and `Shared/Abstract/` interfaces.
  - `Game/Core/` — game simulation (`GameModel`, `Player`, `Bullet`, `World/`).
  - `Game/Protocol/{Domain}/` — message contracts grouped by domain (`Chat`, `Map`, `Player`, `GameState`, `Bullets`, `Rooms`), each with `Requests/`, `Events/`, `Handlers/`.
- `WsServer/WsServer.TestClient/` — a RazorConsole console app that boots an **embedded** server + interactive terminal UI. Run with `dotnet run` for local testing without the browser client.
- `WsCore.Client/src/` — TS client: `2d/` (Phaser), `3d/` (Three.js), `lobby/`, `network/` (`WsConnection` → `WsClient`, `rooms/`), and `network/protocol/` (**generated** — see below). `main.ts` routes between modes.
- `Tests/*.js` — standalone Node simulation scripts (they reimplement room logic in JS to reason about it; they are not integration tests against a running server). Run with `node Tests/test-rooms.js`.
- `AGENTS.md` (root) and `WsServer/AGENTS.md` — detailed prior guidance on conventions and the room system. Read them for depth; note both predate the single-project merge (see Gotchas).

## Commands

Server and client run in **separate terminals** and are started **manually** — do not auto-start them from tooling.

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
```

Client modes: `/` = lobby, `/?mode=2d`, `/?mode=3d`. In dev the client hard-codes the server to port 5000; in production it uses the current origin.

There is no automated test suite (no client test runner, no xUnit project). Verify changes by running server + client and exercising the flow.

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
- **Two different room enums exist.** The server uses `WsServer.Rooms.RoomCompatibility` (`TextChat`, `Spatial`, `VoiceChat`, `VideoChat`); the client uses `CommunicationMode` (`TextChat`, `VoiceChat`, `Spatial2D`, `Spatial3D`). They are not 1:1.
- **Server vs client rooms diverge.** The server creates `lobby`, `voice`, `2d-game`; the client also defines a `3d-game` room. Docs claiming four symmetric rooms are aspirational.
- Keep `[MemoryPackable]` message types simple (flat, immutable-ish, no complex inheritance) — the serializer and TS generator both assume that.
