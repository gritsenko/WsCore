# Room-Based Communication Architecture

## Current Problem
The current implementation broadcasts all game state updates (position, movement, bullets) to all connected clients, including those in chat-only mode who don't need this spatial data. This creates unnecessary network traffic and processing overhead.

## Proposed Solution: Room-Based Architecture

### Core Concepts

#### 1. Communication Modes
- **2D Spatial**: Full game state with position updates (for 2D games)
- **3D Spatial**: Full game state with 3D position updates (for 3D games)
- **Text Chat**: Only text messages, no spatial data
- **Voice Chat**: Audio streams only
- **Video Chat**: Video streams only

#### 2. Room Entity Structure
```typescript
interface Room {
  id: string;
  name: string;
  supportedModes: CommunicationMode[];
  clients: Set<number>; // client IDs
  createdAt: Date;
  hostClientId?: number;
}

enum CommunicationMode {
  SPATIAL_2D = 'spatial_2d',
  SPATIAL_3D = 'spatial_3d', 
  TEXT_CHAT = 'text_chat',
  VOICE_CHAT = 'voice_chat',
  VIDEO_CHAT = 'video_chat'
}
```

### Architecture Components

#### Server-Side Changes

1. **RoomManager**
   - Create/join/leave rooms
   - Track room membership
   - Mode-based message filtering

2. **Room Entity**
   - Store room configuration and client lists
   - Apply communication mode restrictions

3. **Mode-Specific Message Handlers**
   - Only send relevant updates based on room modes
   - Filter out unnecessary data for chat-only rooms

#### Client-Side Changes

1. **Room Context**
   - Store current room and supported modes
   - Enable/disable features based on room configuration

2. **Adaptive UI**
   - Show/hide game components based on room modes
   - Switch between spatial and chat-only interfaces

3. **Message Filtering**
   - Process only relevant messages for current room mode
   - Ignore spatial updates in chat-only rooms

## Implementation Benefits

1. **Reduced Network Traffic**: Chat-only rooms don't receive position updates
2. **Improved Performance**: Less data processing for non-spatial modes
3. **Better User Experience**: UI adapts to available communication modes
4. **Scalability**: Different rooms can have different performance characteristics
5. **Flexibility**: Easy to add new communication modes (voice, video, etc.)

## Migration Strategy

1. **Phase 1**: Add room entity and basic room management
2. **Phase 2**: Implement mode-based message filtering on server
3. **Phase 3**: Update client to respect room modes
4. **Phase 4**: Add UI for room creation and mode selection
5. **Phase 5**: Add voice/video chat support (future)

## Default Room Configurations

### Default Chat Room
- Modes: `TEXT_CHAT`
- No spatial updates
- Only chat messages and player presence

### Default Game Room  
- Modes: `SPATIAL_2D` or `SPATIAL_3D`
- Full game state updates
- Includes chat as secondary mode

### Voice/Video Rooms
- Modes: `VOICE_CHAT`, `VIDEO_CHAT`
- Audio/video streams
- Optional text chat support