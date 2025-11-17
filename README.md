# WsCore

A high-performance, real-time multiplayer game server built with .NET 10 and WebSocket, designed for flexible gameplay experiences with room-based communication and dual client support (2D Phaser and 3D Three.js).

**🚀 Production Ready:** Docker setup with automated deployment scripts for VDS. See [docs/](docs/) for deployment guides.

## Screenshots

![Dashboard](docs/media/dashboard.jpg)
*WsCore Server Dashboard - Real-time server monitoring and metrics*

## Client Samples

### 2D Client (Phaser)
![2D Client](docs/media/phaser.jpg)
*Traditional 2D rendering with sprite-based gameplay*

### 3D Client (Three.js)
![3D Client](docs/media/threejs.jpg)
*Modern 3D isometric rendering with WebGL acceleration*

## Architecture Overview

WsCore implements a modular, scalable architecture with room-based communication supporting multiple interaction modes:

### Core Components

#### 1. **WebSocket Server (`WsServer/`)**
- **ASP.NET Core 10 WebSocket handler** for real-time bidirectional communication
- **Room-based communication system** supporting TextChat, VoiceChat, Spatial2D, and Spatial3D modes
- **Dependency injection** for loose coupling and testability
- **Static file serving** for web-based game clients
- **Connection lifecycle management** with proper cleanup and error handling

#### 2. **Game Engine (`GameServer`)**
- **Fixed 30 FPS game loop** using `PeriodicTimer` for consistent updates
- **Room manager** with persistent rooms for different communication modes
- **Event-driven architecture** with player join/leave and tick events
- **Automatic player management** with unique ID assignment
- **Room-aware messaging** for spatial communication filtering

#### 3. **Serialization Protocol (MemoryPack)**
- **MemoryPack** for ultra-fast, low-allocation serialization across server and client
- **1-byte message header**: leading TypeId followed by MemoryPack payload
- **TypeScript codegen**: MemoryPack generates TS reader/writer and models into `WsCore.Client/src/network/protocol`
- **Type-safe client API** matching server-side message contracts

#### 4. **Message System (`WsServer.Shared/`)**
- **Reflection-based message discovery** automatically scanning assemblies for message types
- **Type-safe message handling** with compile-time verification
- **Request/Response pattern** for client-server communication
- **Message serialization** via MemoryPack with automatic type mapping
- **Room-aware broadcasting** for efficient spatial updates

#### 5. **Client Code (Multi-Mode Support)**
- **2D Client (Phaser)**: Traditional 2D rendering and input handling
- **3D Client (Three.js)**: Modern WebGL-based isometric 3D rendering
- **Lobby Interface**: Discord-style chat room for text communication
- **Auto-generated TS models** produced by MemoryPack source generator during server build
- **Room-based navigation** allowing seamless transitions between modes
- **Binary protocol**: reads 1-byte TypeId then MemoryPack payload using generated `MemoryPackReader`

## Communication Modes & Room System

### Available Rooms
- **Lobby**: Text chat only (default starting point)
- **Voice Room**: Voice + Text chat
- **2D Game Room**: 2D spatial gameplay + Text chat
- **3D Game Room**: 3D spatial gameplay + Text chat

### Communication Modes
- **TextChat**: Text-based messaging between room members
- **VoiceChat**: Voice communication (future implementation)
- **Spatial2D**: 2D position-based updates (players see relevant 2D game state)
- **Spatial3D**: 3D position-based updates (players see relevant 3D game state)

## Base Concepts and Principles

### 1. **Performance-First Design**
- **MemoryPack binary protocol** eliminates JSON parsing overhead
- **Fixed timestep game loop** ensures consistent simulation
- **Minimal allocations** through MemoryPack + pooling where appropriate
- **Connection lifecycle optimizations** and resource management
- **Room-aware filtering** reduces unnecessary network traffic

### 2. **Type Safety**
- **Compile-time message verification** through reflection
- **Strongly-typed game models** preventing runtime errors
- **Interface-based architecture** enabling proper dependency injection
- **Generic constraints** ensuring type compatibility
- **Generated TypeScript types** for client-side type safety

### 3. **Room-Based Architecture**
- **Persistent rooms** for different communication modes
- **Automatic room joining** for new players (default: lobby)
- **Spatial communication filtering** for game-specific updates
- **Room-aware messaging** reducing bandwidth usage
- **Multi-mode support** allowing seamless transitions

### 4. **Extensibility**
- **Plugin-based message handlers** for easy feature addition
- **Abstract base classes** allowing custom game logic
- **Modular component design** for flexible architecture
- **Assembly scanning** for automatic feature discovery

### 5. **Real-Time Communication**
- **WebSocket-based** full-duplex communication
- **Room-aware broadcasting** for efficient state synchronization
- **Connection state management** with automatic cleanup
- **Binary message framing**: `[TypeId:byte][MemoryPack payload]`

## Working Principles

### Room Management
```csharp
// Create persistent rooms with different communication modes
_roomManager.CreateRoom(
    "lobby", 
    "Lobby", 
    new[] { CommunicationMode.TextChat }, 
    isPersistent: true);

_roomManager.CreateRoom(
    "2d-game", 
    "2D Game Room", 
    new[] { CommunicationMode.Spatial2D, CommunicationMode.TextChat }, 
    isPersistent: true);
```

### Game Loop
```csharp
// 30 FPS fixed timestep with room-aware updates
private async Task RunGameLoopAsync()
{
    var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(33));
    while (await timer.WaitForNextTickAsync())
    {
        GameModel.UpdateGameState(DateTime.Now, () => OnTick?.Invoke());
    }
}
```

### Message Processing
1. **Client connects** to WebSocket and joins default lobby room
2. **Client navigates** to different rooms based on desired communication mode
3. **Server routes messages** to appropriate room members based on spatial relevance
4. **Room-aware messenger** filters updates for optimal performance

### Room-Based Communication Flow
```
Client Connection
    ↓
Join Default Lobby Room (TextChat)
    ↓
Navigate to Game Room (Spatial2D/Spatial3D + TextChat)
    ↓
Receive Spatial Updates (filtered by proximity)
    ↓
Receive Text Messages (all room members)
```

## Project Structure

```
WsCore/
├── WsCore.Client/               # Multi-mode client TypeScript (Vite)
│   ├── src/
│   │   ├── 2d/                 # 2D Phaser client (Spatial2D mode)
│   │   ├── 3d/                 # 3D Three.js client (Spatial3D mode)
│   │   ├── lobby/              # Discord-style lobby (TextChat mode)
│   │   ├── network/protocol    # Auto-generated MemoryPack TS files
│   │   └── main.ts             # Entry point with mode routing
├── WsServer/
│   ├── WsServer/               # ASP.NET Core 10 WebSocket host
│   ├── Game/                   # Game logic and protocol definitions
│   └── WsServer.Shared/        # Messaging, serialization, reflection registry
```

## Client Quickstart

Run client and server separately during development:

```bash
# Terminal 1: server
cd WsServer/WsServer
dotnet run

# Terminal 2: client
cd WsCore.Client
npm install
npm start
```

### Client Access & Room Navigation
- **Lobby Interface**: `http://localhost:5173/` (default - Discord-style chat)
- **2D Game**: `http://localhost:5173/?mode=2d` (2D Phaser gameplay)
- **3D Game**: `http://localhost:5173/?mode=3d` (3D Three.js gameplay)

**Room Navigation Flow:**
1. Start in Lobby (text chat only)
2. Navigate to game rooms for spatial gameplay
3. Switch between 2D and 3D modes seamlessly
4. All rooms maintain text chat functionality

Note: The server and client are intentionally started manually (no auto-run from tools). MemoryPack-generated TS files will appear under `WsCore.Client/src/network/protocol` after building the server.

## Key Interfaces

- **`IGameServer`**: Core server functionality
- **`IGameModel`**: Game state management
- **`IGameMessenger`**: Message broadcasting
- **`IMessageSerializer`**: MemoryPack header + payload serialization/deserialization
- **`IClientConnection`**: WebSocket connection abstraction
- **`RoomManager`**: Room creation and management
- **`GameMessengerRoomAware`**: Room-aware message filtering

## Usage Example

The server automatically discovers game logic from assemblies and manages rooms for different communication modes:

```csharp
// Server automatically discovers and registers all message types
builder.Services.AddSingleton<IServerLogicProvider, ReflectionServerLogicProvider>(
    sc => new ReflectionServerLogicProvider(typeof(ChatMessageEvent).Assembly,
    new ClientRequestHandlerFactory(sc)));

// Room-based communication with spatial filtering
var roomAwareMessenger = new GameMessengerRoomAware(connectionManager, serverLogicProvider, roomManager);
roomAwareMessenger.BroadcastSpatialUpdates(gameStateEvent);
```

### Development: Run server and client
Start the server manually from `WsServer/WsServer` and the client from `WsCore.Client`.

```bash
# Terminal 1
dotnet run

# Terminal 2 (default Vite URL: http://localhost:5173)
npm start
```

Note: In development, the server and client are started separately. Automated tools should not start them.

## Client Features Comparison

| Feature | 2D (Phaser) | 3D (Three.js) | Lobby |
|---------|-------------|---------------|-------|
| Rendering | Traditional 2D sprites | WebGL 3D isometric | Web UI |
| Communication | Spatial2D + TextChat | Spatial3D + TextChat | TextChat only |
| Camera | Following camera | Orthographic isometric | N/A |
| Performance | GPU-accelerated | GPU-accelerated | Minimal |
| Controls | Arrow keys + mouse | Arrow keys + mouse | Text input |
| Room Support | ✅ 2D Game Room | ✅ 3D Game Room | ✅ All Rooms |
| Multiplayer | ✅ Full support | ✅ Full support | ✅ Full support |

The multi-client approach allows developers to choose the visual style that best fits their game concept while maintaining the same core gameplay mechanics, room system, and server infrastructure.

## 🐳 Docker & Deployment

WsCore includes production-ready Docker setup with fully automated deployment scripts.

### Quick Deploy (One Command!)

```bash
# Make scripts executable
chmod +x scripts/*.sh

# 1. Build the image locally
./scripts/build.sh wscore-game-server latest

# 2. Deploy to your server (includes SSL setup automatically!)
./scripts/deploy.sh root@your-vds-host your-domain.com

# That's it! Your app is live at https://your-domain.com 🎉
```

**The deploy script handles everything:**
- ✅ Docker image export and secure transfer
- ✅ Container orchestration with docker-compose
- ✅ SSL certificate acquisition (Let's Encrypt) or self-signed fallback
- ✅ HTTPS configuration and HTTP→HTTPS redirect
- ✅ Nginx reverse proxy setup
- ✅ All in one command!

### Documentation
- 📖 **[docs/QUICKSTART.md](docs/QUICKSTART.md)** - 5-minute quick start
- 📖 **[docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)** - Complete deployment guide
- 📖 **[docs/INDEX.md](docs/INDEX.md)** - Full documentation index
- ⚙️ **[docs/CONFIG_EXAMPLES.md](docs/CONFIG_EXAMPLES.md)** - Advanced configurations

### Docker Image Details
- **Base Images**: Node.js 20-alpine (client), .NET 10 (server)
- **Size**: ~98 MB (optimized for amd64 production)
- **Output**: Single optimized container with client + server
- **Features**: Nginx reverse proxy, SSL/TLS, health checks, automatic restarts

### Managing Deployments

Once deployed, manage your running instance with these commands:

#### Check Server Status
```bash
ssh <user>@<your-vds-host> 'cd <deploy-dir> && docker compose ps'
```

#### View Application Logs
```bash
ssh <user>@<your-vds-host> 'cd <deploy-dir> && docker compose logs -f game-server'
```

#### Update Application (New Version)
```bash
# 1. Build new image locally
./scripts/build.sh wscore-game-server latest

# 2. Deploy updated image to server
./scripts/deploy.sh <user>@<your-vds-host> <domain> [deploy-dir]
```

#### Restart Services
```bash
ssh <user>@<your-vds-host> 'cd <deploy-dir> && docker compose restart'
```

#### View Nginx Logs
```bash
ssh <user>@<your-vds-host> 'cd <deploy-dir> && docker compose logs -f nginx-proxy'
```

#### SSL Certificate Renewal
```bash
# For Let's Encrypt certificates (auto-renewed by certbot)
ssh <user>@<your-vds-host> 'cd <deploy-dir> && docker compose exec certbot certbot renew'
```

**Placeholders:**
- `<user>` - SSH user (e.g., `root` or `deploy`)
- `<your-vds-host>` - Server hostname/IP (e.g., `example.com`)
- `<deploy-dir>` - Deployment directory (default: `~/WsCoreServer`)
- `<domain>` - Your domain name (e.g., `example.com`)
