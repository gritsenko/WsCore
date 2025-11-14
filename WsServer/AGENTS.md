# WsServer Architecture Guidelines

## Overview

WsServer is a real-time multiplayer game server built on .NET 10 with ASP.NET Core, using WebSockets for communication and MemoryPack for high-performance message serialization. The architecture follows clean architecture principles with clear separation of concerns.

## Project Structure

```
WsServer/
├── WsServer/           # ASP.NET Core WebSocket server
├── Game/               # Game logic and domain models
├── WsServer.Shared/    # Shared abstractions and base classes
└── BenchmarkSuite1/    # Performance testing
```

## Core Architecture Patterns

### 1. **Dependency Injection & Service Registration**
All services are registered in `WsServer/Program.cs`:
```csharp
builder.Services.AddSingleton<IGameServer, GameServer>();
builder.Services.AddSingleton<GameModel>();
builder.Services.AddSingleton<IServerLogicProvider, ReflectionServerLogicProvider>();
```

### 2. **Reflection-Based Message Discovery**
The `ReflectionServerLogicProvider` automatically discovers message types and handlers via reflection:
- **Client Requests**: Classes implementing `IClientRequest` 
- **Server Events**: Classes implementing `IServerEvent`
- **Request Handlers**: Classes implementing `IRequestHandler`

### 3. **Handler Pattern**
Each client request has a corresponding handler following the pattern:
```
Game/Protocol/{Domain}/Handlers/{RequestName}Handler.cs
```

### 4. **Message Structure**
Messages are organized by domain with clear separation:
```
Game/Protocol/
├── Chat/          # Chat system
├── GameState/     # Game state management
├── Map/          # Map objects and tiles
└── Player/       # Player management
```

## Message Flow

```
Client WebSocket 
    ↓
WebSocketHandler
    ↓
MessageSerializer.Deserialize()
    ↓
ReflectionServerLogicProvider.GetHandler()
    ↓
RequestHandler.Handle()
    ↓
GameModel.UpdateState()
    ↓
GameMessenger.Broadcast()
    ↓
MessageSerializer.Serialize()
    ↓
WebSocket Send
```

## Key Components

### WebSocketHandler
- Handles raw WebSocket connections
- Manages connection lifecycle
- Processes binary message frames
- Delegates to GameServer for message processing

### GameServer (GameServerBase)
- Main game loop (33ms tick rate)
- Orchestrates connection management
- Routes messages to handlers
- Manages game state updates

### GameModel
- Core game state container
- Thread-safe collections (ConcurrentDictionary)
- Player, bullet, and world management
- Game logic and collision detection

### MessageSerializer
- Uses MemoryPack for serialization
- 1-byte message type header
- ArrayBufferWriter for efficient memory usage
- Type-safe deserialization

### ConnectionManager
- Thread-safe connection storage
- Maps connection IDs to IClientConnection
- Handles connection lifecycle

## Protocol Design Guidelines

### Message Types
1. **Client Requests** (Client → Server)
   - Implement `IClientRequest`
   - Have static `TypeId` property
   - Use `MemoryPackable` attribute

2. **Server Events** (Server → Client)
   - Implement `IServerEvent`
   - Have static `TypeId` property
   - Use `GenerateTypeScript` for client generation

### Naming Conventions
- **Requests**: `{Action}Request` (e.g., `ChatMessageRequest`)
- **Events**: `{Action}Event` (e.g., `ChatMessageEvent`)
- **Handlers**: `{Request}Handler` (e.g., `ChatMessageRequestHandler`)
- **Data Classes**: `{Purpose}Data` (e.g., `PlayerStateData`)

### Directory Structure
```
Game/Protocol/{Domain}/
├── Events/
│   ├── {Action}Event.cs
│   └── Data/{DataClass}.cs
├── Handlers/
│   └── {Action}RequestHandler.cs
└── Requests/
    └── {Action}Request.cs
```

## Concurrency Guidelines

### Thread Safety
- Use `ConcurrentDictionary` for player/bullet storage
- Lock protected collections for bulk operations
- Use `ThreadPool` for async operations
- Avoid locks in game loop when possible

### Game Loop
- 33ms tick rate (30 FPS equivalent)
- Update all players and bullets
- Check collisions and hits
- Clear temporary lists after each tick
- Trigger server events after state updates

## Performance Guidelines

### Memory Management
- Use `ArrayBufferWriter<byte>` for message serialization
- Reuse buffer collections where possible
- Clear lists instead of creating new instances
- Use struct types for small data (Vector2, etc.)

### Serialization
- Always use MemoryPack attributes:
  ```csharp
  [GenerateTypeScript]
  [MemoryPackable]
  public partial class MyMessage : IServerEvent { }
  ```
- Keep message types immutable
- Use struct types for small data objects
- Avoid complex inheritance in message types

### Benchmarking
- Use BenchmarkSuite1 for performance testing
- Test message serialization/deserialization
- Monitor game loop performance
- Profile memory allocation patterns

## Error Handling

### WebSocket Connections
- Handle WebSocketException gracefully
- Log connection errors with appropriate levels
- Always cleanup on disconnect
- Use cancellation tokens for graceful shutdown

### Message Processing
- Validate message data in handlers
- Log processing errors with context
- Don't crash server on malformed messages
- Use try-catch in critical paths

## Testing Guidelines

### Unit Testing
- Test GameModel logic independently
- Mock IClientConnection for handler testing
- Test message serialization/deserialization
- Validate game state transitions

### Integration Testing
- Test WebSocket message flow
- Validate connection lifecycle
- Test concurrent player scenarios
- Monitor memory leaks

## Extension Guidelines

### Adding New Message Types
1. Create message class in appropriate Protocol domain
2. Implement `IClientRequest` or `IServerEvent`
3. Add static `TypeId` property
4. Apply MemoryPack attributes
5. Create corresponding handler (for requests)
6. Register in DI container if needed

### Adding New Game Features
1. Extend GameModel with new state
2. Add update logic to game loop
3. Create message protocol for client communication
4. Update client-side TypeScript types
5. Add appropriate handlers

### Adding New Protocols
1. Create new directory in `Game/Protocol/`
2. Follow existing domain structure
3. Update `ReflectionServerLogicProvider` assembly scanning if needed
4. Test message flow end-to-end

## Common Patterns

### Player Management
```csharp
public Player GetPlayer(uint id)
{
    _players.TryGetValue(id, out var p);
    return p;
}

public void UpdatePlayerActivity(uint id)
{
    var p = GetPlayer(id);
    p.UpdateActivity();
}
```

### Message Broadcasting
```csharp
public void Broadcast(IServerEvent eventMessage)
{
    var serialized = messenger.Serialize(eventMessage);
    foreach (var connection in connectionManager.Connections)
    {
        connection.Send(serialized);
    }
}
```

### Game State Updates
```csharp
public void UpdateGameState(DateTime time, Action onUpdatedAction)
{
    // Update all game objects
    foreach (var player in _players)
    {
        player.Value.Update(dt);
    }
    
    // Process collisions and effects
    ProcessCollisions();
    
    // Trigger events
    onUpdatedAction.Invoke();
}
```

## Best Practices

### Code Organization
- Keep handlers small and focused
- Separate game logic from protocol logic
- Use dependency injection for all dependencies
- Follow single responsibility principle

### Performance
- Minimize allocations in hot paths
- Use structs for small data types
- Cache reflection results when possible
- Monitor GC pressure

### Maintainability
- Use clear, descriptive names
- Document complex game logic
- Keep message types versioned if needed
- Test message compatibility

### Security
- Validate all client input
- Sanitize chat messages
- Implement rate limiting if needed
- Monitor for suspicious patterns

This architecture provides a solid foundation for a scalable, maintainable multiplayer game server with clear separation of concerns and high performance characteristics.