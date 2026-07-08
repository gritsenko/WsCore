# WsCore.Client - Unified Multiplayer Game Client

## Overview

WsCore.Client is a modern TypeScript client for the WsCore multiplayer game server. It is a **unified single-socket app**: one `WsClient` (one WebSocket) lives the whole session, and the Discord-style lobby (text chat) and the 3D Three.js scene are **UI states** of one shell, not separate apps. The client communicates with the .NET 10 server using a high-performance MemoryPack-based binary protocol and features auto-generated TypeScript models for all network messages.

## Features

- Fast, real-time multiplayer networking (WebSocket, MemoryPack)
- **Room-based communication system** supporting multiple interaction modes
- **One WebSocket for the whole session**: entering/leaving the 3D scene never reconnects or recreates the client
- **Three.js** 3D isometric rendering for spatial gameplay
- **Discord-style Lobby** for text chat and room navigation
- **Reconnect with backoff** and a connection-lost banner
- Auto-generated protocol models (from C# server)
- Modern build system (Vite)

## Client States & Rooms

### 🏠 Lobby (Default)
- **Access**: `http://localhost:5173/` (default)
- **Communication**: TextChat only
- **Features**: Discord-style chat interface, room navigation, user lists
- **Purpose**: Starting point, social chat, room discovery

### 🎯 Game Room
- **Access**: click **Play** on the `game` room from the lobby
- **Communication**: Spatial + TextChat
- **Rendering**: Three.js WebGL isometric view
- **Features**: 3D gameplay with spatial updates for nearby players
- **Return**: click **Back to Lobby** — the same WebSocket persists across the switch, any number of times

### 🎤 Voice Room (Future)
- **Planned**: Voice chat integration
- **Communication**: VoiceChat + TextChat
- **Purpose**: Voice communication for social gaming

## Room-Based Architecture

### Communication Modes
- **TextChat**: Text-based messaging between room members
- **Spatial**: Position-based updates for the 3D scene (players see relevant game state)
- **VoiceChat**: Voice communication (future implementation)

### Room Flow
```
Client Connection
    ↓
Join Default Lobby (TextChat)
    ↓
Navigate to Game Room (Spatial + TextChat)
    ↓
Receive Room-Aware Updates
    ├── Spatial Updates (filtered by proximity)
    └── Text Messages (all room members)
```

## Project Structure

```
WsCore.Client/
├── src/
│   ├── main.ts              # Thin entry point building App from the name form
│   ├── app/                 # Shell: owns the one WsClient, lobby↔game state machine
│   │   ├── App.ts           # Connects once, drives the lobby/game switch, connection banner
│   │   └── LobbyState.ts    # Drives LobbyUI from client events; no own socket
│   ├── game/                 # Three.js scene (entered via Play)
│   │   ├── GameScene.ts     # Scene/camera/renderer/RAF/input + full exit() teardown
│   │   ├── Player.ts        # Pure state, implements IPlayer
│   │   ├── PlayerView.ts    # The sprite/nick visual
│   │   ├── World.ts         # World/map management
│   │   └── MapObject.ts     # Map objects
│   ├── lobby/                # Discord-style lobby UI + CSS only (no app logic)
│   │   └── LobbyUI.ts       # Lobby user interface
│   ├── network/             # WebSocket client & protocol
│   │   ├── WsConnection.ts  # Transport: reconnect/backoff, connectionStatus
│   │   ├── WsClient.ts      # Session state + typed on()/emit() event emitter
│   │   ├── protocol/        # Auto-generated MemoryPack types
│   │   │   ├── MemoryPackReader.ts
│   │   │   ├── MemoryPackWriter.ts
│   │   │   ├── ChatMessageEvent.ts
│   │   │   ├── JoinRoomRequest.ts
│   │   │   ├── RoomUsersUpdateEvent.ts
│   │   │   └── [auto-generated message types]
│   │   └── rooms/           # Room management
│   │       ├── CommunicationMode.ts
│   │       ├── Room.ts      # Room data structure
│   │       ├── RoomClient.ts # Room client representation
│   │       └── RoomManager.ts # Room management logic
│   └── utils/               # Shared utilities
│       ├── ChatUI.ts        # Chat interface
│       ├── Keyboard.ts      # Input handling
│       └── Common.ts        # Utility functions
├── public/                  # Static assets
│   ├── knight/              # Player sprite sheets
│   ├── map/                 # Map textures and objects
│   └── ui/                  # UI elements and icons
└── dist/                    # Built single HTML file (vite-plugin-singlefile)
```

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Run the development server:**
   ```bash
   npm start
   ```
3. **Access the client:**
   - **Lobby**: `http://localhost:5173/` (default — Discord-style chat)
   - **Game**: click **Play** on the `game` room from the lobby

## Server Requirements

- **.NET 10 server** with room system (WsServer project)
- WebSocket connection to `ws://localhost:5000`
- MemoryPack protocol support
- Room manager support for multiple communication modes

## Dependencies

### Core Dependencies
- **[three](https://threejs.org/)** — 3D WebGL engine for the game scene

### Build Tools
- **[vite](https://vitejs.dev/)** — Fast build tool and dev server
- **[vite-plugin-singlefile](https://github.com/salvoravida/vite-plugin-singlefile)** — Bundle to single HTML file
- **[TypeScript](https://www.typescriptlang.org/)** — Type safety (`strict: true`), `npm run typecheck`
- **[ESLint](https://eslint.org/)** + **[Prettier](https://prettier.io/)** — Linting (`npm run lint`) and formatting (`npm run format`)

## Controls

| Action | Key/Mouse |
|--------|-----------|
| Move Up | ↑ Arrow |
| Move Down | ↓ Arrow |
| Move Left | ← Arrow |
| Move Right | → Arrow |
| Set Target | Click (game room) |
| Add Object | E (game room) |
| Remove Object | Q (game room) |
| Send Message | Enter (lobby and chat) |
| Switch Rooms | UI Buttons (Play / Back to Lobby) |

## Architecture

### One Client, Two UI States
There is no URL-based mode routing. The app always starts in the lobby; clicking **Play** on the `game` room switches the same shell into the 3D scene, and **Back to Lobby** switches it back. The single `WsClient` created at startup lives across every switch and across server reconnects.

### Room-Aware Communication

#### Lobby State
- **TextChat only**: All lobby members receive messages
- **Room Management**: Users can see other lobby members
- **Room Navigation**: Buttons to join different room types

#### Game State
- **Spatial Communication**: Only receive updates from nearby players
- **TextChat**: All room members receive chat messages
- **Room Awareness**: Players see only other players in their current room

### Shared Components
Both states share:
- The single `WsClient`/`WsConnection` (`network/`)
- Room management system (`network/rooms/`)
- Utility functions (`utils/`)
- WebSocket communication with MemoryPack protocol
- Auto-generated TypeScript protocol types

## Room System Implementation

### Client-Side Room Management
```typescript
// Room navigation example
app.joinRoom('game');   // Enter the game room (Play)
app.joinRoom('lobby');  // Return to lobby
```

### Room-Aware Message Handling
- **Spatial Updates**: Filtered by proximity within the room
- **Chat Messages**: Broadcast to all room members
- **Player Events**: Only relevant to current room context

### Communication Mode Support
- **TextChat**: Implemented in both states
- **Spatial**: Distance-based filtering in the game room
- **VoiceChat**: Future implementation planned

## Network Protocol

### MemoryPack Integration
- **Auto-Generated Types**: TypeScript classes from C# server
- **Binary Protocol**: `[TypeId: byte][MemoryPack payload]`
- **Type Safety**: Compile-time verification of message types
- **Performance**: Minimal serialization overhead

### Room-Specific Messages
- `JoinRoomRequest` - Navigate between rooms
- `RoomUsersUpdateEvent` - Update room member lists
- `ChatMessageEvent` - Text chat
- `GameTickUpdateEvent` - Spatial updates (game room)

## Build & Deploy

### Development
```bash
npm start
```

### Production Build
```bash
npm run build          # Single HTML file bundle (vite-plugin-singlefile)
```

### Verification
See the browser smoke-test procedure in the root [CLAUDE.md](../CLAUDE.md#testing) — it drives the lobby↔game cycle via the integrated-browser MCP and checks for leaked canvases/listeners/DOM nodes and clean reconnect behavior.

## Auto-Generated Protocol

### MemoryPack Type Generation
All TypeScript types in `src/network/protocol/` are **auto-generated** from the C# server:
- **Do not edit manually** - Changes will be overwritten on server rebuild
- **Server rebuild required** for type updates (see root CLAUDE.md for the regeneration steps)
- **Type safety guaranteed** through generated interfaces

### Generated Files
```
src/network/protocol/
├── MemoryPackReader.ts     # Binary deserialization
├── MemoryPackWriter.ts     # Binary serialization
├── ChatMessageEvent.ts     # Chat system
├── JoinRoomRequest.ts      # Room navigation
├── RoomUsersUpdateEvent.ts # Room member updates
├── GameTickUpdateEvent.ts  # Game state (spatial)
└── [all other message types]
```

## Documentation

### Client-Specific Guides
- **Lobby UI**: `src/lobby/` - Discord-style chat and room navigation
- **Game Scene**: `src/game/` - Three.js implementation with spatial updates
- **Network Layer**: `src/network/README.md` - WebSocket and protocol details

### Room System
- **Architecture**: Built-in room management with communication modes
- **Protocol**: MemoryPack-based messages with room awareness
- **Client Integration**: Seamless room navigation from one shell

### Server Integration
The client is designed for use with the WsCore .NET 10 server with room system. See the main project documentation for server setup and room configuration details.

## Troubleshooting

### Room System Issues
- **Room Navigation**: Check WebSocket connection (`ws://localhost:5000/ws`)
- **Spatial Updates**: Verify you're in the `game` room (not the lobby)
- **Chat Issues**: Ensure TextChat is supported in current room

### Development Issues
- **Type Generation**: Rebuild server to update TypeScript types
- **Asset Loading**: Check public folder structure for shared assets
- **Build Issues**: Run `npm run typecheck` and `npm run lint` before `npm run build`
- **Stale service worker**: a service worker from another localhost project can shadow `localhost:5173`; use `CLIENT_PORT=5199 scripts/dev-up.sh` to dodge it (see root CLAUDE.md)

### Network Issues
- **Connection Failed**: Check server is running on port 5000 (dev client always targets `:5000` regardless of client port)
- **Protocol Mismatch**: Ensure server and client use same MemoryPack version
- **Room Errors**: Verify room names match server configuration (`lobby`, `voice`, `game`)

## Performance Considerations

### Room-Based Optimization
- **Spatial Filtering**: Only receive relevant game state updates
- **Room Awareness**: Network traffic optimized per communication mode
- **Shared Connection**: Single WebSocket for all room operations, the whole session

### Memory Management
- **Full scene teardown**: leaving the game room stops the RAF loop, disposes geometries/materials/textures, and removes listeners — verified leak-free across repeated lobby↔game cycles
- **Protocol Optimization**: Binary serialization with MemoryPack

---

## Room System Summary

🏠 **Lobby**: Text chat, room navigation, user management
🎯 **Game**: Spatial + TextChat, Three.js rendering
🎤 **Voice**: VoiceChat + TextChat (future)

**Single WebSocket connection for the whole session → Multiple communication modes → Optimized room-based updates**

© 2025 WsCore Project
