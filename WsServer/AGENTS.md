# WsServer Architecture Guidelines

## Overview

WsServer is a real-time multiplayer game server built on .NET 10 with ASP.NET Core, using WebSockets for communication and MemoryPack for high-performance message serialization. The architecture follows clean architecture principles with clear separation of concerns and implements a room-based communication system for flexible gameplay experiences.

## Project Structure

```
WsServer/
├── WsServer/           # ASP.NET Core WebSocket server with room management
├── Game/               # Game logic, domain models, and room configurations
├── WsServer.Shared/    # Shared abstractions, MemoryPack messaging, and reflection registry
└── BenchmarkSuite1/    # Performance testing and benchmarking
```

## Core Architecture Patterns

### 1. **Dependency Injection & Service Registration**
All services are registered in `WsServer/Program.cs`:
```csharp
builder.Services.AddSingleton<IGameServer, GameServer>();
builder.Services.AddSingleton<GameModel>();
builder.Services.AddSingleton<IServerLogicProvider, ReflectionServerLogicProvider>();
builder.Services.AddSingleton<WsServer.Rooms.RoomManager>();  // Room system
```

### 2. **Reflection-Based Message Discovery**
The `ReflectionServerLogicProvider` automatically discovers message types and handlers via reflection:
- **Client Requests**: Classes implementing `IClientRequest` 
- **Server Events**: Classes implementing `IServerEvent`
- **Request Handlers**: Classes implementing `IRequestHandler`

### 3. **Room-Based Communication System**
WsServer implements a persistent room system with multiple communication modes:
- **Room Manager**: `WsServer.Rooms.RoomManager` for room lifecycle management
- **Room-Aware Messenger**: `GameMessengerRoomAware` for spatial communication filtering
- **Communication Modes**: TextChat, VoiceChat (future), Spatial2D, Spatial3D

### 4. **Handler Pattern**
Each client request has a corresponding handler following the pattern:
```
Game/Protocol/{Domain}/Handlers/{RequestName}Handler.cs
```

### 5. **Message Structure**
Messages are organized by domain with clear separation:
```
Game/Protocol/
├── Chat/          # Chat system
├── GameState/     # Game state management
├── Map/          # Map objects and tiles
├── Player/       # Player management
└── Rooms/        # Room management system
```

## Room System Architecture

### Room Manager (`WsServer.Rooms.RoomManager`)
- **Persistent Rooms**: 4 predefined rooms with different communication modes
- **Room Configuration**: Each room specifies supported communication modes
- **Client Management**: Tracks which room each client is in
- **Room Events**: Handles player joins/leaves per room

### Communication Modes
```csharp
public enum CommunicationMode
{
    TextChat,    // Text-based messaging
    VoiceChat,   // Voice communication (future)
    Spatial2D,   // 2D position-based updates
    Spatial3D    // 3D position-based updates
}
```

### Default Rooms Configuration
```csharp
// Lobby room - text chat only (default for new players)
_roomManager.CreateRoom(
    "lobby", 
    "Lobby", 
    new[] { CommunicationMode.TextChat }, 
    isPersistent: true);

// 2D Game room - 2D gameplay + chat
_roomManager.CreateRoom(
    "2d-game", 
    "2D Game Room", 
    new[] { CommunicationMode.Spatial2D, CommunicationMode.TextChat }, 
    isPersistent: true);

// 3D Game room - 3D gameplay + chat
_roomManager.CreateRoom(
    "3d-game", 
    "3D Game Room", 
    new[] { CommunicationMode.Spatial3D, CommunicationMode.TextChat }, 
    isPersistent: true);
```

## Message Flow

```
Client WebSocket Connection
    ↓
WebSocketHandler
    ↓
MessageSerializer.Deserialize()  // MemoryPack with 1-byte header
    ↓
ReflectionServerLogicProvider.GetHandler()
    ↓
RequestHandler.Handle()
    ↓
RoomManager.JoinRoom()  // Auto-join lobby for new players
    ↓
GameModel.UpdateState()
    ↓
GameMessengerRoomAware.Broadcast()  // Room-aware filtering
    ↓
MessageSerializer.Serialize()
    ↓
WebSocket Send
```

## Key Components

### WebSocketHandler
- Handles raw WebSocket connections
- Manages connection lifecycle
- Processes binary message frames with MemoryPack
- Delegates to GameServer for message processing

### GameServer (extends GameServerBase)
- Main game loop (33ms tick rate)
- Room system integration with RoomManager
- Orchestrates connection management
- Routes messages to handlers
- Manages room-aware broadcasting via GameMessengerRoomAware

### RoomManager
- Creates and manages persistent rooms
- Tracks client room assignments
- Handles room join/leave events
- Provides room statistics and client lists

### GameMessengerRoomAware
- Filters spatial updates based on room and proximity
- Reduces network traffic by only sending relevant updates
- Extends GameMessenger with room-awareness
- Handles communication mode-specific broadcasting

### GameModel
- Core game state container
- Thread-safe collections (ConcurrentDictionary)
- Player, bullet, and world management
- Game logic and collision detection
- Room-agnostic (works with any room configuration)

### MessageSerializer
- Uses MemoryPack for ultra-fast serialization
- 1-byte message type header + MemoryPack payload
- ArrayBufferWriter for efficient memory usage
- Type-safe deserialization with reflection-based type mapping

### ConnectionManager
- Thread-safe connection storage
- Maps connection IDs to IClientConnection
- Handles connection lifecycle
- Integrated with room system for client tracking

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

3. **Room Messages** (Room-aware communication)
   - `JoinRoomRequest` - Client requests room change
   - `RoomUsersUpdateEvent` - Server notifies room members of user changes
   - `RoomListEvent` - Available rooms and user counts

### Naming Conventions
- **Requests**: `{Action}Request` (e.g., `ChatMessageRequest`)
- **Events**: `{Action}Event` (e.g., `ChatMessageEvent`)
- **Handlers**: `{Request}Handler` (e.g., `ChatMessageRequestHandler`)
- **Data Classes**: `{Purpose}Data` (e.g., `PlayerStateData`)
- **Rooms**: `{mode}-{type}` (e.g., `2d-game`, `3d-game`)

### Directory Structure
```
Game/Protocol/{Domain}/
├── Events/
│   ├── {Action}Event.cs
│   └── Data/{DataClass}.cs
├── Handlers/
│   └── {Action}RequestHandler.cs
├── Requests/
│   └── {Action}Request.cs
└── Rooms/                    # Room-specific protocols
    ├── Events/
    ├── Handlers/
    └── Requests/
```

## Room-Based Communication Guidelines

### Spatial Filtering
```csharp
// Only send game state updates to relevant room members
_roomAwareMessenger.BroadcastSpatialUpdates(gameStateEvent);

// Send chat messages to all room members
Messenger.Broadcast(new ChatMessageEvent(message));
```

### Room Navigation
```csharp
// Auto-join lobby for new players
_roomManager.JoinRoom(clientId, playerName, "lobby");

// Switch rooms
_roomManager.LeaveRoom(clientId);
_roomManager.JoinRoom(clientId, playerName, "2d-game");
```

### Communication Mode Handling
- **TextChat**: Broadcast to all room members
- **Spatial2D**: Filter by 2D proximity within room
- **Spatial3D**: Filter by 3D proximity within room
- **VoiceChat**: Future implementation for voice communication

## Concurrency Guidelines

### Thread Safety
- Use `ConcurrentDictionary` for player/bullet storage
- RoomManager uses thread-safe collections for client tracking
- Lock protected collections for bulk room operations
- Use `ThreadPool` for async operations
- Avoid locks in game loop when possible

### Game Loop with Room System
- 33ms tick rate (30 FPS equivalent)
- Update all players and bullets regardless of room
- Filter game state updates via room-aware messenger
- Handle room-specific events (joins/leaves)
- Clear temporary lists after each tick

## Performance Guidelines

### Room-Based Optimization
- **Spatial Filtering**: Only send updates to relevant room members
- **Room-Aware Broadcasting**: Reduce unnecessary network traffic
- **Persistent Rooms**: Minimize room creation/destruction overhead
- **MemoryPack Binary Protocol**: Eliminate JSON parsing overhead

### Memory Management
- Use `ArrayBufferWriter<byte>` for message serialization
- Reuse buffer collections where possible
- Clear lists instead of creating new instances
- Use struct types for small data (Vector2, etc.)
- Room state is ephemeral - no persistent storage needed

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
- Monitor game loop performance with room filtering
- Profile memory allocation patterns
- Test room system overhead

## Error Handling

### WebSocket Connections
- Handle WebSocketException gracefully
- Clean up room assignments on disconnect
- Log connection errors with appropriate levels
- Always cleanup on disconnect (including room state)
- Use cancellation tokens for graceful shutdown

### Message Processing
- Validate message data in handlers
- Handle room-related errors (invalid room names, etc.)
- Log processing errors with context
- Don't crash server on malformed messages
- Use try-catch in critical paths

### Room System Errors
- Handle room full scenarios gracefully
- Validate room join/leave operations
- Clean up orphaned room assignments
- Log room system issues for debugging

## Testing Guidelines

### Unit Testing
- Test GameModel logic independently
- Mock IClientConnection for handler testing
- Test message serialization/deserialization
- Validate game state transitions
- Test RoomManager functionality in isolation

### Integration Testing
- Test WebSocket message flow with room system
- Validate room navigation and persistence
- Test concurrent player scenarios across rooms
- Monitor memory leaks in room system
- Test room-aware broadcasting logic

### Room System Testing
- Test room creation and configuration
- Validate client room assignments
- Test spatial filtering in game rooms
- Verify chat functionality across rooms
- Test room persistence during reconnections

## Extension Guidelines

### Adding New Message Types
1. Create message class in appropriate Protocol domain
2. Implement `IClientRequest` or `IServerEvent`
3. Add static `TypeId` property
4. Apply MemoryPack attributes
5. Create corresponding handler (for requests)
6. Register in DI container if needed

### Adding New Rooms
1. Update `GameServer.InitializeDefaultRooms()` with new room configuration
2. Define communication modes for the room
3. Add room navigation UI in client if needed
4. Update documentation for new room type
5. Test room creation and client joining

### Adding New Communication Modes
1. Extend `CommunicationMode` enum
2. Update room configurations to include new mode
3. Implement mode-specific logic in `GameMessengerRoomAware`
4. Add client-side support for new mode
5. Update broadcasting logic for new mode
6. Test mode integration with existing rooms

### Adding New Game Features
1. Extend GameModel with new state
2. Add update logic to game loop
3. Create message protocol for client communication
4. Update client-side TypeScript types
5. Add appropriate handlers
6. Consider room-aware broadcasting if needed

## Common Patterns

### Player Management with Rooms
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
    
    // Notify room members of player activity
    var room = _roomManager.GetClientRoom(id);
    if (room != null)
    {
        // Send activity update to room members
    }
}
```

### Room-Aware Message Broadcasting
```csharp
// Spatial updates (filtered by room and proximity)
_roomAwareMessenger.BroadcastSpatialUpdates(gameStateEvent);

// Chat messages (all room members)
Messenger.Broadcast(new ChatMessageEvent(message));

// Room-specific notifications
var room = _roomManager.GetRoom(roomId);
foreach (var clientId in room.GetClientIds())
{
    Messenger.Send(clientId, roomUpdateEvent);
}
```

### Room Navigation Handling
```csharp
public void JoinRoom(uint clientId, string roomId, string playerName)
{
    // Leave current room
    var currentRoom = _roomManager.GetClientRoom(clientId);
    if (currentRoom != null)
    {
        _roomManager.LeaveRoom(clientId);
    }
    
    // Join new room
    if (_roomManager.JoinRoom(clientId, playerName, roomId))
    {
        // Notify room members
        BroadcastRoomUserUpdate(roomId);
    }
}
```

### Game State Updates with Room Awareness
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
    
    // Trigger room-aware events
    onUpdatedAction.Invoke();
    
    // Room-aware broadcasting will handle filtering
}
```

## Best Practices

### Code Organization
- Keep handlers small and focused
- Separate game logic from room logic
- Use dependency injection for all dependencies
- Follow single responsibility principle
- Isolate room system concerns

### Room System Design
- Keep rooms persistent for better performance
- Use clear, descriptive room names
- Validate room configurations
- Document communication modes per room
- Test room system thoroughly

### Performance
- Minimize allocations in hot paths
- Use structs for small data types
- Cache reflection results when possible
- Monitor GC pressure
- Profile room system overhead

### Maintainability
- Use clear, descriptive names for rooms
- Document communication modes
- Keep message types versioned if needed
- Test message compatibility across rooms
- Maintain separation between game logic and room management

### Security
- Validate all client input including room names
- Sanitize chat messages
- Implement rate limiting for room joins
- Monitor for suspicious room navigation patterns
- Validate communication mode combinations

### Room System Specific
- Always clean up room assignments on disconnect
- Validate room existence before operations
- Handle room full scenarios gracefully
- Monitor room system performance
- Test room persistence across server restarts

This room-based architecture provides a scalable, maintainable foundation for multiplayer game servers with flexible communication modes and optimal network performance through intelligent message filtering.