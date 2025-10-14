# WsCore

A high-performance, real-time game server built with .NET 9 and WebSocket, designed for multiplayer game development with an efficient MemoryPack-based binary protocol.

## Architecture Overview

WsCore implements a modular, scalable architecture that separates concerns across multiple layers:

### Core Components

#### 1. **WebSocket Server (`WsServer/`)**
- **ASP.NET Core WebSocket handler** for real-time bidirectional communication
- **Dependency injection** for loose coupling and testability
- **Static file serving** for web-based game clients
- **Connection lifecycle management** with proper cleanup and error handling

#### 2. **Game Engine (`GameServerBase`)**
- **Fixed 30 FPS game loop** using `PeriodicTimer` for consistent updates
- **Abstract game model** pattern allowing custom game logic implementation
- **Event-driven architecture** with player join/leave and tick events
- **Automatic player management** with unique ID assignment

#### 3. **Serialization Protocol (MemoryPack)**
- **MemoryPack** for ultra-fast, low-allocation serialization across server and client
- **1-byte message header**: leading TypeId followed by MemoryPack payload
- **TypeScript codegen**: MemoryPack generates TS reader/writer and models into `WsCore.Client/src/network/protocol`
- Legacy DataBuffer layer is deprecated and removed from runtime

#### 4. **Message System (`WsServer.Shared/`)**
- **Reflection-based message discovery** automatically scanning assemblies for message types
- **Type-safe message handling** with compile-time verification
- **Request/Response pattern** for client-server communication
- **Message serialization** via MemoryPack with automatic type mapping

#### 5. **Client Code (Phaser + TypeScript + MemoryPack)**
- **Phaser 3** for 2D rendering and input handling
- **Auto-generated TS models** produced by MemoryPack source generator during server build (see `WsServer/Game/Game.csproj`)
- **Type-safe client API** matching server-side message contracts
- **Binary protocol**: reads 1-byte TypeId then MemoryPack payload using generated `MemoryPackReader`
- **Real-time message handling** with event callbacks

## Base Concepts and Principles

### 1. **Performance-First Design**
- **MemoryPack binary protocol** eliminates JSON parsing overhead
- **Fixed timestep game loop** ensures consistent simulation
- **Minimal allocations** through MemoryPack + pooling where appropriate
- **Connection lifecycle optimizations** and resource management

### 2. **Type Safety**
- **Compile-time message verification** through reflection
- **Strongly-typed game models** preventing runtime errors
- **Interface-based architecture** enabling proper dependency injection
- **Generic constraints** ensuring type compatibility

### 3. **Extensibility**
- **Plugin-based message handlers** for easy feature addition
- **Abstract base classes** allowing custom game logic
- **Modular component design** for flexible architecture
- **Assembly scanning** for automatic feature discovery

### 4. **Real-Time Communication**
- **WebSocket-based** full-duplex communication
- **Broadcast messaging** for efficient state synchronization
- **Connection state management** with automatic cleanup
- **Binary message framing**: `[TypeId:byte][MemoryPack payload]`

## Working Principles

### Game Loop
```csharp
// 30 FPS fixed timestep
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
1. **Client sends binary message** via WebSocket as `[TypeId][MemoryPack payload]`
2. **Server reads header** to determine message type, then MemoryPack-deserializes payload
3. **Reflection system** finds appropriate handler (request handlers and event registrations)
4. **Handler processes** request and updates game state
5. **Server broadcasts** state changes to relevant clients using the same header + MemoryPack format

### Client Code Generation (MemoryPack)
1. **Assembly scanning** discovers all `[MemoryPackable]` message types
2. **MemoryPack source generator** outputs TypeScript classes/readers/writers
3. **Client uses generated reader/writer** to serialize/deserialize payloads
4. **Client API** provides type-safe message sending/receiving

## Project Structure

```
WsCore/
├── WsCore.Client/            # TypeScript client (Vite)
│   └── src/network/protocol  # Auto-generated MemoryPack TS files
└── WsServer/
    ├── WsServer/             # ASP.NET Core WebSocket host
    ├── Game/                 # Game logic and protocol definitions
    └── WsServer.Shared/      # Messaging, serialization, reflection registry

## Client (Phaser) Quickstart

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

Note: The server and client are intentionally started manually (no auto-run from tools). MemoryPack-generated TS files will appear under `WsCore.Client/src/network/protocol` after building the server.
```

## Key Interfaces

- **`IGameServer`**: Core server functionality
- **`IGameModel`**: Game state management
- **`IGameMessenger`**: Message broadcasting
- **`IMessageSerializer`**: MemoryPack header + payload serialization/deserialization
- **`IClientConnection`**: WebSocket connection abstraction

## Usage Example

The server automatically discovers game logic from assemblies containing message and handler definitions, making it easy to extend with new features without modifying core server code.

```csharp
// Server automatically discovers and registers
// all IClientRequest and IServerEvent implementations
builder.Services.AddSingleton<IServerLogicProvider, ReflectionServerLogicProvider>(
    sc => new ReflectionServerLogicProvider(typeof(ChatMessageEvent).Assembly,
    new ClientRequestHandlerFactory(sc)));
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

