# Room-Based Communication Architecture - Implementation Guide

## Overview

WsCore implements a comprehensive room-based communication system that optimizes network traffic and provides flexible interaction modes for multiplayer gaming. This architecture allows different types of communication (text chat, spatial updates, voice chat) to coexist efficiently within the same server infrastructure.

## ✅ Implemented Architecture

### Core Concepts

#### 1. Communication Modes
The system supports multiple communication modes that can be combined per room:

- **TextChat**: Text-based messaging between room members
- **Spatial2D**: 2D position-based updates (for 2D gameplay)
- **Spatial3D**: 3D position-based updates (for 3D gameplay)  
- **VoiceChat**: Voice communication (framework ready, implementation future)

#### 2. Room System Architecture
```typescript
interface Room {
  id: string;
  name: string;
  communicationModes: CommunicationMode[];
  clients: Map<uint, RoomClient>;
  isPersistent: boolean;
  createdAt: Date;
}

interface RoomClient {
  id: uint;
  name: string;
  joinedAt: Date;
  lastActivity: Date;
}

enum CommunicationMode {
  TextChat = "TextChat",
  VoiceChat = "VoiceChat", 
  Spatial2D = "Spatial2D",
  Spatial3D = "Spatial3D"
}
```

## Server-Side Implementation

### 1. RoomManager (`WsServer.Rooms.RoomManager`)
```csharp
public class RoomManager
{
    private readonly ConcurrentDictionary<string, Room> _rooms = new();
    
    public Room CreateRoom(string id, string name, CommunicationMode[] modes, bool isPersistent);
    public bool JoinRoom(uint clientId, string playerName, string roomId);
    public void LeaveRoom(uint clientId);
    public Room GetRoom(string roomId);
    public Room GetClientRoom(uint clientId);
    public IEnumerable<string> GetAllRoomIds();
}
```

**Key Features:**
- **Persistent Rooms**: 4 predefined rooms always available
- **Thread-Safe**: Uses ConcurrentDictionary for client tracking
- **Auto-Cleanup**: Removes inactive clients automatically
- **Room Statistics**: Provides real-time room member counts

### 2. GameMessengerRoomAware
```csharp
public class GameMessengerRoomAware
{
    public void BroadcastSpatialUpdates(GameTickUpdateEvent gameStateEvent);
    public void BroadcastToRoom(string roomId, IServerEvent message);
    public IEnumerable<uint> GetRoomClientIds(string roomId);
}
```

**Key Features:**
- **Spatial Filtering**: Only sends game updates to relevant room members
- **Proximity-Based**: Filters by distance for spatial modes
- **Room-Aware**: Respects room boundaries for all message types
- **Performance Optimized**: Reduces unnecessary network traffic

### 3. Default Room Configuration
```csharp
// Implemented in GameServer.InitializeDefaultRooms()
private void InitializeDefaultRooms()
{
    // Lobby room - text chat only (default for new players)
    _roomManager.CreateRoom(
        "lobby", 
        "Lobby", 
        new[] { CommunicationMode.TextChat }, 
        isPersistent: true);
    
    // Voice room - voice + text chat (future implementation)
    _roomManager.CreateRoom(
        "voice", 
        "Voice Room", 
        new[] { CommunicationMode.VoiceChat, CommunicationMode.TextChat }, 
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
}
```

## Client-Side Implementation

### 1. Room Navigation (`LobbyApp.ts`)
```typescript
export default class LobbyApp {
  private joinRoom(roomId: string): void {
    // Leave current room first
    this.gameClient.leaveRoom();
    
    // Clear UI state
    this.lobbyUI.clearMessages();
    this.lobbyUI.clearAllUsers();
    
    // Join new room
    if (this.gameClient.joinRoom(roomId, this.playerName)) {
      this.lobbyUI.setCurrentRoom(roomId);
      
      // Update UI with room members
      const currentRoom = this.gameClient.getCurrentRoom();
      if (currentRoom) {
        for (const clientId of currentRoom.getClientIds()) {
          const clientName = currentRoom.getClient(clientId)?.name || `Player ${clientId}`;
          this.lobbyUI.addUser(clientId, clientName);
        }
      }
    }
  }
}
```

### 2. Room-Aware WebSocket Client (`WsClient.ts`)
```typescript
export class WsClient<TPlayer extends Player> {
  public joinRoom(roomId: string, playerName: string): boolean {
    // Send join request
    this.sendMessage(new JoinRoomRequest(roomId, playerName));
    
    // Update client state
    this.currentRoomId = roomId;
    this.myPlayerName = playerName;
    
    return true;
  }
  
  public leaveRoom(): void {
    if (this.currentRoomId) {
      this.sendMessage(new LeaveRoomRequest(this.currentRoomId));
      this.currentRoomId = null;
    }
  }
}
```

### 3. Mode-Specific Applications

#### Lobby Mode (TextChat only)
- **UI**: Discord-style interface with text chat and room navigation
- **Communication**: TextChat to all room members
- **Features**: User lists, room switching, presence indicators

#### 2D Game Mode (Spatial2D + TextChat)
- **Rendering**: Phaser 3D sprites with following camera
- **Communication**: Spatial2D updates + TextChat
- **Features**: Real-time position updates for nearby players only

#### 3D Game Mode (Spatial3D + TextChat)
- **Rendering**: Three.js WebGL isometric view
- **Communication**: Spatial3D updates + TextChat  
- **Features**: 3D spatial awareness with orbit controls

## Message Flow Architecture

### 1. Connection and Room Joining
```
Client WebSocket Connection
    ↓
Server assigns client ID
    ↓  
Auto-join Lobby Room (TextChat)
    ↓
Client receives RoomUsersUpdateEvent
    ↓
Client UI shows lobby interface
```

### 2. Room Navigation Flow
```
User selects room in lobby UI
    ↓
Client sends JoinRoomRequest
    ↓
Server processes room change:
  - Leave current room
  - Join new room
  - Update room member lists
    ↓
All room members receive RoomUsersUpdateEvent
    ↓
Client UI switches to new mode
```

### 3. Message Broadcasting Logic
```
Game Tick Event (30 FPS)
    ↓
Server processes game state updates
    ↓
GameMessengerRoomAware filters by room and mode:
    ├── TextChat → All room members
    ├── Spatial2D → Room members within 2D range
    ├── Spatial3D → Room members within 3D range
    └── VoiceChat → Future implementation
    ↓
Filtered messages sent to relevant clients only
```

## Performance Optimizations

### 1. Spatial Filtering
```csharp
// In GameMessengerRoomAware.BroadcastSpatialUpdates()
foreach (var clientId in room.GetClientIds())
{
    var player = gameModel.GetPlayer(clientId);
    if (player != null && IsPlayerInRange(player, targetPlayer, spatialRange))
    {
        // Send update only to players in range
        SendUpdateToClient(clientId, gameStateEvent);
    }
}
```

### 2. Room-Aware Broadcasting
- **Text Messages**: Broadcast to all room members
- **Spatial Updates**: Filter by proximity within room
- **System Events**: Room-specific notifications only
- **Connection Management**: Clean room assignments on disconnect

### 3. Memory Management
- **Ephemeral State**: Room membership is temporary
- **Auto-Cleanup**: Remove inactive clients after timeout
- **Efficient Collections**: ConcurrentDictionary for thread safety
- **Message Pooling**: Reuse message objects where possible

## API Reference

### Server Messages

#### Client → Server
- `JoinRoomRequest(roomId, playerName)` - Navigate to room
- `LeaveRoomRequest(roomId)` - Leave current room
- `ChatMessageRequest(message)` - Send text message

#### Server → Client  
- `RoomUsersUpdateEvent(roomId, users)` - Update room member list
- `RoomListEvent(rooms)` - Available rooms with user counts
- `ChatMessageEvent(senderId, message)` - Text message broadcast

### Client-Side APIs

#### Room Management
```typescript
// Join room
gameClient.joinRoom('2d-game', 'PlayerName');

// Leave room  
gameClient.leaveRoom();

// Get current room
const room = gameClient.getCurrentRoom();

// Get room statistics
const stats = gameClient.getRoomStats('lobby');
```

#### Room-Aware Events
```typescript
// Room member updates
gameClient.onRoomUsersUpdateCallback = (event) => {
  // Update UI with new room member list
};

// Room switching
gameClient.onRoomChanged = (newRoomId) => {
  // Switch rendering mode based on room
  if (newRoomId === '2d-game') {
    switchTo2DMode();
  } else if (newRoomId === '3d-game') {
    switchTo3DMode();
  }
};
```

## Testing Room System

### 1. Connection Testing
```bash
# Test WebSocket connection
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: test" \
  -H "Sec-WebSocket-Version: 13" \
  http://localhost:5000/ws
```

### 2. Room Navigation Testing
```typescript
// Test script
async function testRoomSystem() {
  // Connect to lobby
  const lobby = new LobbyApp('ws://localhost:5000/ws');
  lobby.setPlayerName('TestPlayer');
  
  // Test room switching
  await lobby.joinRoom('2d-game');
  await lobby.joinRoom('3d-game');  
  await lobby.joinRoom('lobby');
  
  // Verify spatial filtering
  verifySpatialUpdatesOnlyInGameRooms();
}
```

### 3. Performance Testing
```csharp
// Server-side performance monitoring
public class RoomPerformanceMonitor 
{
    public void LogRoomStatistics()
    {
        foreach (var room in _roomManager.GetAllRooms())
        {
            _logger.LogInformation($"Room {room.Id}: {room.Clients.Count} clients, modes: {string.Join(",", room.CommunicationModes)}");
        }
    }
}
```

## Deployment Considerations

### 1. Docker Configuration
```yaml
# Room system environment variables
services:
  game-server:
    environment:
      - ROOM_MAX_CLIENTS_PER_ROOM=50
      - ROOM_CLEANUP_INTERVAL=300
      - ROOM_ENABLE_SPATIAL_FILTERING=true
      - ROOM_SPATIAL_RANGE_2D=500
      - ROOM_SPATIAL_RANGE_3D=500
```

### 2. Load Balancing with Room Affinity
```nginx
# Nginx configuration for room-aware load balancing
upstream game_backend {
    ip_hash;  # Ensure room consistency
    server game-server-1:80;
    server game-server-2:80;
}
```

### 3. Monitoring Room System
```bash
# Check room statistics
curl http://localhost:5000/rooms/stats

# Monitor room traffic
docker logs game-server | grep -E "(Room|JoinRoom|LeaveRoom)"
```

## Future Enhancements

### 1. Voice Chat Integration
- WebRTC implementation for VoiceChat mode
- Audio streaming between room members
- Voice activation detection

### 2. Video Chat Support  
- WebRTC video streams
- Screen sharing capabilities
- Video conferencing features

### 3. Advanced Room Features
- Room passwords and private rooms
- Room moderation and admin controls
- Custom room configurations
- Room events and achievements

### 4. Scalability Improvements
- Cross-server room replication
- Dynamic room allocation
- Room-based server clustering

## Troubleshooting

### Common Issues

#### Room Not Found
- Verify room ID matches server configuration
- Check room exists in RoomManager
- Ensure proper case sensitivity

#### Spatial Updates Not Filtering
- Verify communication mode includes Spatial2D/Spatial3D
- Check GameMessengerRoomAware implementation
- Monitor room member distances

#### Client Disconnection Issues
- Verify proper room cleanup on disconnect
- Check ConnectionManager integration
- Monitor room assignment persistence

### Debug Commands
```bash
# List all rooms and members
curl http://localhost:5000/rooms

# Get specific room info
curl http://localhost:5000/rooms/lobby

# Monitor room events
docker logs -f game-server | grep -i room
```

---

**Implementation Status**: ✅ **Complete**  
The room-based communication system is fully implemented and operational in WsCore with support for TextChat, Spatial2D, Spatial3D communication modes and seamless room navigation across all client interfaces.