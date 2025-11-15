# WsCore.Client - Multi-Mode Multiplayer Game Client

## Overview

WsCore.Client is a modern TypeScript client for the WsCore multiplayer game server, featuring **room-based communication** with support for multiple interaction modes. The client communicates with the .NET 10 server using a high-performance MemoryPack-based binary protocol and features auto-generated TypeScript models for all network messages.

## Features

- Fast, real-time multiplayer networking (WebSocket, MemoryPack)
- **Room-based communication system** supporting multiple interaction modes
- **Multi-mode rendering engine support:**
  - **Phaser 3** for 2D gameplay with spatial communication
  - **Three.js** for 3D isometric gameplay with spatial communication
  - **Discord-style Lobby** for text chat and room navigation
- Auto-generated protocol models (from C# server)
- Modern build system (Vite)
- Shared assets and game logic across all modes
- Seamless room navigation and switching

## Client Modes & Rooms

### 🏠 Lobby Interface (Default)
- **Access**: `http://localhost:5173/` (default)
- **Communication**: TextChat only
- **Features**: Discord-style chat interface, room navigation, user lists
- **Purpose**: Starting point, social chat, room discovery

### 🎮 2D Game Room
- **Access**: `http://localhost:5173/?mode=2d`
- **Communication**: Spatial2D + TextChat
- **Rendering**: Phaser 3 traditional 2D sprites
- **Camera**: Following camera system
- **Features**: 2D gameplay with spatial updates for nearby players

### 🎯 3D Game Room
- **Access**: `http://localhost:5173/?mode=3d`
- **Communication**: Spatial3D + TextChat
- **Rendering**: Three.js WebGL isometric view
- **Camera**: Orthographic isometric with orbit controls
- **Features**: 3D gameplay with spatial updates for nearby players

### 🎤 Voice Room (Future)
- **Planned**: Voice chat integration
- **Communication**: VoiceChat + TextChat
- **Purpose**: Voice communication for social gaming

## Room-Based Architecture

### Communication Modes
- **TextChat**: Text-based messaging between room members
- **Spatial2D**: 2D position-based updates (players see relevant 2D game state)
- **Spatial3D**: 3D position-based updates (players see relevant 3D game state)
- **VoiceChat**: Voice communication (future implementation)

### Room Flow
```
Client Connection
    ↓
Join Default Lobby (TextChat)
    ↓
Navigate to Game Rooms (Spatial + TextChat)
    ↓
Receive Room-Aware Updates
    ├── Spatial Updates (filtered by proximity)
    └── Text Messages (all room members)
```

## Project Structure

```
WsCore.Client/
├── src/
│   ├── main.ts              # Entry point with mode routing
│   ├── 2d/                  # 2D Phaser client (Spatial2D mode)
│   │   ├── App.ts           # 2D application logic
│   │   ├── Player.ts        # 2D player representation
│   │   ├── World.ts         # 2D world/map management
│   │   └── MapObject.ts     # 2D map objects
│   ├── 3d/                  # 3D Three.js client (Spatial3D mode)
│   │   ├── App3D.ts         # 3D application logic
│   │   ├── Player3D.ts      # 3D player representation
│   │   ├── World3D.ts       # 3D world/map management
│   │   └── MapObject3D.ts   # 3D map objects
│   ├── lobby/               # Discord-style lobby (TextChat mode)
│   │   ├── LobbyApp.ts      # Lobby application logic
│   │   ├── LobbyUI.ts       # Lobby user interface
│   │   └── LobbyPlayer.ts   # Lobby player representation
│   ├── network/             # WebSocket client & protocol
│   │   ├── WsClient.ts      # Main WebSocket client
│   │   ├── WsConnection.ts  # WebSocket connection management
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
│       ├── ChatUI.ts        # Chat interface (all modes)
│       ├── Keyboard.ts      # Input handling
│       ├── Common.ts        # Utility functions
│       └── TypeState.ts     # Type definitions
├── public/                  # Static assets (shared across modes)
│   ├── knight/              # Player sprite sheets
│   ├── map/                 # Map textures and objects
│   └── ui/                  # UI elements and icons
└── dist/                    # Built single HTML with room routing
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
   - **Lobby**: `http://localhost:5173/` (default - Discord-style chat)
   - **2D Game**: `http://localhost:5173/?mode=2d`
   - **3D Game**: `http://localhost:5173/?mode=3d`

## Server Requirements

- **.NET 10 server** with room system (WsServer project)
- WebSocket connection to `ws://localhost:5000`
- MemoryPack protocol support
- Room manager support for multiple communication modes

## Dependencies

### Core Dependencies
- **[phaser](https://phaser.io/)** — 2D game engine for Spatial2D mode
- **[three](https://threejs.org/)** — 3D WebGL engine for Spatial3D mode

### Build Tools
- **[vite](https://vitejs.dev/)** — Fast build tool and dev server
- **[vite-plugin-singlefile](https://github.com/salvoravida/vite-plugin-singlefile)** — Bundle to single HTML file
- **[TypeScript](https://www.typescriptlang.org/)** — Type safety

### Utilities
- **[base64-arraybuffer](https://github.com/niklasvh/base64-arraybuffer)** — Binary data handling
- **[jszip](https://stuk.github.io/jszip/)** — ZIP file support for assets

## Controls (All Modes)

| Action | Key/Mouse |
|--------|-----------|
| Move Up | ↑ Arrow |
| Move Down | ↓ Arrow |
| Move Left | ← Arrow |
| Move Right | → Arrow |
| Set Target | Click (game rooms) |
| Add Object | E (game rooms) |
| Remove Object | Q (game rooms) |
| Send Message | Enter (lobby and chat) |
| Switch Rooms | UI Buttons (lobby) |

## Architecture

### Mode Selection & Room Navigation
The application uses URL parameters and room navigation:
- **`/`**: Lobby interface (text chat, room navigation)
- **`/?mode=2d`**: 2D Phaser game room (spatial + chat)
- **`/?mode=3d`**: 3D Three.js game room (spatial + chat)

### Room-Aware Communication
Each mode handles communication differently:

#### Lobby Mode
- **TextChat only**: All lobby members receive messages
- **Room Management**: Users can see other lobby members
- **Room Navigation**: Buttons to join different room types

#### 2D/3D Game Modes
- **Spatial Communication**: Only receive updates from nearby players
- **TextChat**: All room members receive chat messages
- **Room Awareness**: Players see only other players in their current room

### Shared Components
All modes share:
- Network layer (`network/`)
- Room management system (`network/rooms/`)
- Utility functions (`utils/`)
- Game logic and assets
- Input handling (keyboard/mouse events)
- WebSocket communication with MemoryPack protocol
- Auto-generated TypeScript protocol types

## Room System Implementation

### Client-Side Room Management
```typescript
// Room navigation example
app.joinRoom('2d-game');  // Switch to 2D game room
app.joinRoom('lobby');    // Return to lobby
```

### Room-Aware Message Handling
- **Spatial Updates**: Filtered by proximity within the room
- **Chat Messages**: Broadcast to all room members
- **Player Events**: Only relevant to current room context

### Communication Mode Support
- **TextChat**: Implemented across all modes
- **Spatial2D**: 2D distance-based filtering
- **Spatial3D**: 3D distance-based filtering
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
- `ChatMessageEvent` - Text chat (all modes)
- `GameStateUpdateEvent` - Spatial updates (game rooms)

## Build & Deploy

### Development
```bash
npm start
```

### Production Build
```bash
npm run build          # Standard build
npm run build:single   # Single HTML file bundle (includes room routing)
```

### Room System Verification
After building, verify room functionality:
1. **Lobby**: Check text chat and room navigation
2. **2D Mode**: Verify spatial updates and integrated chat
3. **3D Mode**: Verify spatial updates and integrated chat
4. **Room Switching**: Test transitions between all modes

## Auto-Generated Protocol

### MemoryPack Type Generation
All TypeScript types in `src/network/protocol/` are **auto-generated** from the C# server:
- **Do not edit manually** - Changes will be overwritten on server rebuild
- **Server rebuild required** for type updates
- **Type safety guaranteed** through generated interfaces

### Generated Files
```
src/network/protocol/
├── MemoryPackReader.ts     # Binary deserialization
├── MemoryPackWriter.ts     # Binary serialization
├── ChatMessageEvent.ts     # Chat system
├── JoinRoomRequest.ts      # Room navigation
├── RoomUsersUpdateEvent.ts # Room member updates
├── GameStateUpdateEvent.ts # Game state (spatial)
└── [all other message types]
```

## Multi-Client Architecture

### Shared Server Infrastructure
All client modes connect to the same .NET 10 server and use:
- **Identical game logic** regardless of rendering mode
- **Same MemoryPack protocol** for all communication
- **Shared room system** with consistent behavior
- **Common WebSocket connection** with room-aware filtering

### Mode-Specific Implementation
- **Rendering**: Different engines for 2D vs 3D vs UI
- **Spatial Communication**: Filtered updates based on communication mode
- **Input Handling**: Adapted for each interaction pattern
- **Asset Usage**: Shared sprites and textures across all modes

## Documentation

### Client-Specific Guides
- **Lobby Interface**: `src/lobby/` - Discord-style chat and room navigation
- **2D Documentation**: `src/2d/` - Phaser implementation with spatial updates
- **3D Documentation**: `src/3d/README.md` - Three.js implementation guide
- **Network Layer**: `src/network/README.md` - WebSocket and protocol details

### Room System
- **Architecture**: Built-in room management with communication modes
- **Protocol**: MemoryPack-based messages with room awareness
- **Client Integration**: Seamless room navigation across all modes

### Server Integration
The client is designed for use with the WsCore .NET 10 server with room system. See the main project documentation for server setup and room configuration details.

## Troubleshooting

### Room System Issues
- **Room Navigation**: Check WebSocket connection (`ws://localhost:5000/ws`)
- **Spatial Updates**: Verify room mode matches URL parameter
- **Chat Issues**: Ensure TextChat is supported in current room

### Development Issues
- **Type Generation**: Rebuild server to update TypeScript types
- **Asset Loading**: Check public folder structure for shared assets
- **Build Issues**: Verify Vite configuration for single-file output

### Network Issues
- **Connection Failed**: Check server is running on port 5000
- **Protocol Mismatch**: Ensure server and client use same MemoryPack version
- **Room Errors**: Verify room names match server configuration

## Performance Considerations

### Room-Based Optimization
- **Spatial Filtering**: Only receive relevant game state updates
- **Room Awareness**: Network traffic optimized per communication mode
- **Shared Connection**: Single WebSocket for all room operations

### Memory Management
- **Efficient Asset Loading**: Shared resources across modes
- **Protocol Optimization**: Binary serialization with MemoryPack
- **Room State**: Ephemeral state management per room

---

## Room System Summary

🏠 **Lobby**: Text chat, room navigation, user management  
🎮 **2D Game**: Spatial2D + TextChat, Phaser rendering  
🎯 **3D Game**: Spatial3D + TextChat, Three.js rendering  
🎤 **Voice**: VoiceChat + TextChat (future)  

**Single WebSocket connection → Multiple communication modes → Optimized room-based updates**

© 2025 WsCore Project