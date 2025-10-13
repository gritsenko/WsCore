# WsCore

A high-performance, real-time game server built with .NET Core and WebSocket technology, designed for multiplayer game development with custom binary protocol optimization.

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

#### 3. **Binary Protocol System (`WsServer.DataBuffer/`)**
- **Custom binary serialization** with zero-copy optimization
- **Type-safe data buffers** supporting primitives, strings, and complex types
- **Efficient network protocol** minimizing bandwidth usage
- **Buffer pooling** for memory efficiency

#### 4. **Message System (`WsServer.Shared/`)**
- **Reflection-based message discovery** automatically scanning assemblies for message types
- **Type-safe message handling** with compile-time verification
- **Request/Response pattern** for client-server communication
- **Message serialization** with automatic type mapping

#### 5. **Client Code Generation (`WsClientBuilder/`)**
- **Automated TypeScript client generation** from server message definitions
- **Type-safe client API** matching server-side message contracts
- **Binary protocol abstraction** hiding low-level serialization details
- **Real-time message handling** with event callbacks

## Base Concepts and Principles

### 1. **Performance-First Design**
- **Binary protocol** eliminates JSON parsing overhead
- **Fixed timestep game loop** ensures consistent simulation
- **Memory-efficient buffers** with minimal allocations
- **Connection pooling** and resource management

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
- **Binary message framing** for protocol efficiency

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
1. **Client sends binary message** via WebSocket
2. **Server deserializes** message type and data
3. **Reflection system** finds appropriate handler
4. **Handler processes** request and updates game state
5. **Server broadcasts** state changes to relevant clients

### Client Code Generation
1. **Assembly scanning** discovers all message types
2. **TypeScript classes** generated for each message type
3. **Reader/Writer methods** created for binary serialization
4. **Client API** provides type-safe message sending/receiving

## Project Structure

```
Source/
├── WsCore.ClientSample/        # Sample client implementation
└── WsServer/                   # Main server project
    ├── WsServer/               # ASP.NET Core WebSocket server
    ├── WsClientBuilder/        # TypeScript client generator
    ├── WsServer.DataBuffer/    # Binary serialization system
    └── WsServer.Shared/        # Shared abstractions and interfaces
```

## Key Interfaces

- **`IGameServer`**: Core server functionality
- **`IGameModel`**: Game state management
- **`IGameMessenger`**: Message broadcasting
- **`IDataBuffer`**: Binary serialization
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

