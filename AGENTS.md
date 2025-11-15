# Agent Instructions for WsCore Project

## Key Guidelines

### 📝 Documentation
- **Do NOT create boilerplate markdown files** to document code changes unless the developer explicitly requests it
- Only create documentation when:
  - The developer specifically asks for it
  - New feature is complex and truly needs explanation
  - Contributing to existing documentation structure

### 💻 Code Changes
- Implement changes directly rather than just suggesting them
- Use `multi_replace_string_in_file` for multiple independent edits to improve efficiency
- Do not announce which tools are being used in responses

### 🎯 Task Management
- Use the `manage_todo_list` tool for complex multi-step work
- Track progress through completion to ensure all tasks are finished
- Update task status consistently (not-started → in-progress → completed)

### 🔍 Efficiency
- Parallelize independent tool calls (reads, searches) when possible
- Gather sufficient context before implementing
- Don't over-search; make targeted queries
- Balance thorough understanding with forward momentum

### ✅ Quality Standards
- Ensure no TypeScript errors after code changes
- Test that implementations work with existing codebase
- Keep code idiomatic and follow existing patterns
- Verify file structure and organization
- Run `npm run format` on the client project to normalize code formatting after changes

### 🚀 Development Environment
- **dotnet server** and **vite dev serve** are typically run manually by the developer
- Do not attempt to start these services from the agent
- Assume the developer has these running when needed

### 📢 Communication
- Keep responses brief and direct
- Avoid unnecessary framing or introductions
- Confirm completion concisely
- Only provide detailed explanations when complexity requires it

## Project Structure Overview

```
WsCore.Client/
├── src/
│   ├── 2d/              # 2D game mode (Phaser) - Spatial2D + TextChat
│   ├── 3d/              # 3D game mode (Three.js) - Spatial3D + TextChat
│   ├── lobby/           # Discord-style lobby chat - TextChat only
│   ├── network/         # WebSocket client & protocol (MemoryPack)
│   │   └── protocol/    # Auto-generated TypeScript types
│   ├── utils/           # Shared utilities (Chat, Keyboard, etc.)
│   └── main.ts          # Entry point with mode routing

WsServer/
├── WsServer/            # Main server with room system
├── Game/                # Game logic and room management
└── WsServer.Shared/     # Shared utilities and MemoryPack protocol
```

## Connection Modes & Room System

- **2d**: 2D game with Phaser + Spatial2D communication
- **3d**: 3D game with Three.js + Spatial3D communication  
- **chat**: Discord-style lobby with TextChat only
- **All modes support TextChat** regardless of spatial communication type

### Room Architecture
- **lobby**: TextChat only (default starting point)
- **voice**: VoiceChat + TextChat (future implementation)
- **2d-game**: Spatial2D + TextChat (2D Phaser gameplay)
- **3d-game**: Spatial3D + TextChat (3D Three.js gameplay)

All modes connect to same WebSocket server and use shared MemoryPack-based protocol with room-aware broadcasting.

## MemoryPack Protocol

### Message Structure
```
[TypeId: byte][MemoryPack payload]
```

### Auto-Generated Types
- TypeScript types generated during server build
- Located in `WsCore.Client/src/network/protocol/`
- Includes MemoryPackReader/MemoryPackWriter classes
- All message types implement IClientRequest or IServerEvent

### Room-Aware Messaging
- Server uses `GameMessengerRoomAware` for spatial filtering
- Spatial updates only sent to relevant room members
- Text messages broadcast to all room members
- Room manager handles persistent room state

## Core Components

### Server Architecture (WsServer)
- **WebSocket Handler**: ASP.NET Core `/ws` endpoint
- **Room Manager**: 4 persistent rooms with communication modes
- **Game Loop**: 30 FPS fixed timestep
- **MemoryPack Protocol**: 1-byte header + binary payload
- **Reflection System**: Auto-discovers message handlers

### Client Architecture (WsCore.Client)
- **Multi-Mode Support**: Lobby, 2D, 3D in single application
- **WebSocket Client**: Connects to `/ws` endpoint
- **Room Navigation**: Seamless switching between rooms
- **Auto-Generated Types**: Type-safe protocol implementation
- **Shared Network Layer**: Common WebSocket and messaging logic

### Communication Flow
```
Client Connection
  ↓
WebSocket (/ws)
  ↓
Join Default Lobby (TextChat)
  ↓
Navigate Rooms (based on mode)
  ↓
Receive Room-Aware Updates
  ├── Spatial Updates (filtered by proximity)
  └── Text Messages (all room members)
```

## Development Guidelines

### Adding New Rooms
1. Update `GameServer.InitializeDefaultRooms()` with new room configuration
2. Add room navigation UI in client if needed
3. Update room documentation
4. Test room persistence and communication

### Adding New Message Types
1. Create message class in appropriate `Game/Protocol/` domain
2. Implement `IClientRequest` or `IServerEvent`
3. Add static `TypeId` property
4. Apply MemoryPack attributes (`[MemoryPackable]`, `[GenerateTypeScript]`)
5. Create handler for requests in `Handlers/` directory
6. Rebuild server to generate TypeScript types

### Adding New Communication Modes
1. Extend `CommunicationMode` enum
2. Update room configurations to include new mode
3. Implement mode-specific logic in `GameMessengerRoomAware`
4. Add client-side support for new mode
5. Test mode integration with existing rooms

### Testing Room System
1. Verify WebSocket connection: `ws://localhost:5000/ws`
2. Test room joining: lobby → game rooms
3. Check spatial filtering: only nearby players in game rooms
4. Verify text chat: works across all rooms
5. Test room persistence: players remain in rooms across reconnections

## Performance Considerations

### Room-Based Optimization
- Spatial filtering reduces network traffic
- Room-aware broadcasting minimizes unnecessary updates
- Persistent rooms reduce overhead of room creation
- MemoryPack binary protocol eliminates JSON parsing

### Memory Management
- ArrayBufferWriter for efficient serialization
- ConcurrentDictionary for thread-safe room storage
- Minimal allocations in hot paths
- Buffer pooling where appropriate

## Common Patterns

### Room Navigation
```typescript
// Client-side room switching
app.joinRoom('2d-game');  // Switch to 2D game room
app.joinRoom('lobby');    // Return to lobby
```

### Message Broadcasting
```csharp
// Server-side room-aware broadcasting
_roomAwareMessenger.BroadcastSpatialUpdates(gameStateEvent);
Messenger.Broadcast(new ChatMessageEvent(message)); // All room members
```

### Player Management
```csharp
// Auto-join lobby on connection
_roomManager.JoinRoom(clientId, playerName, "lobby");
```

## Deployment Notes

### Docker Build
- Multi-stage build: Node.js client + .NET server
- Single HTML output with room routing
- TypeScript types auto-generated during build
- Non-root user (gameserver UID 1001)

### Production Deployment
- Nginx reverse proxy with WebSocket support
- SSL/TLS with Let's Encrypt auto-renewal
- Health checks and auto-restart
- Room system fully functional in production
