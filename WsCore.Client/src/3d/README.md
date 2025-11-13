# 3D Version (Three.js Implementation)

This directory contains the Three.js-based 3D version of the WsCore client with an isometric top-down camera view. The 3D version communicates with the .NET 10 server using the same MemoryPack binary protocol as the 2D version.

## Features

The 3D version implements the same core features as the 2D version (Phaser):

- **Isometric Top-Down Camera**: Orthographic camera positioned for isometric viewing
- **Player Movement**: Real-time player position updates with smooth interpolation
- **Animation System**: Sprite-based animations using canvas texture mapping
- **Map Objects**: Tree rendering with proper depth sorting
- **Network Integration**: Full WebSocket support for multiplayer gameplay with .NET 10 server
- **Keyboard Controls**: Arrow keys for movement, E/Q for map object manipulation
- **.NET 10 Server Integration**: Uses MemoryPack binary protocol for high-performance communication

## Key Components

### App3D.ts

Main application class handling Three.js initialization, scene setup, camera configuration, and game client management.

- Isometric orthographic camera setup
- WebGL renderer initialization
- Asset loading system
- Mouse click and keyboard input handling
- Connection to .NET 10 WebSocket server

### World3D.ts

Manages the game world including ground plane and map object updates.

- Checkerboard ground plane with canvas texture
- Lighting setup (ambient and directional)
- Map object management
- World bounds

### Player3D.ts

Represents individual players with sprite-based rendering and animation.

- Canvas-based sprite animation (frame-by-frame animation from spritesheets)
- Player state machine (Idle/Run/Attack/Die)
- Smooth position interpolation (lerping)
- Player name display
- Direction flip based on movement

### MapObject3D.ts

Renders map objects (trees) using sprite materials.

- Three.js sprite rendering with texture mapping
- Depth-based sorting for proper rendering order
- Object destruction and cleanup

### AnimationDef3D.ts

Helper class for animation definitions (frame count, dimensions, etc.)

## Usage

To use the 3D version instead of the 2D version, add `?mode=3d` to the URL:

```
http://localhost:5173/?mode=3d
```

Without the parameter or with `?mode=2d`, the 2D (Phaser) version will load:

```
http://localhost:5173/
http://localhost:5173/?mode=2d
```

## .NET 10 Server Integration

The 3D client connects to the same .NET 10 server as the 2D client:

- **Server**: ASP.NET Core 10 WebSocket host
- **Protocol**: MemoryPack binary serialization
- **Port**: 5000 (default)
- **Connection**: `ws://localhost:5000`
- **Models**: Auto-generated TypeScript models from C# server code

### Server Requirements

- **.NET 10 SDK** required
- **MemoryPack source generator** in server project
- **WebSocket support** enabled

## Technical Details

### Sprite Animation System

The 3D version uses canvas-based sprite animation to avoid needing a separate animation system:

1. Sprite sheets are loaded as textures
2. A canvas is created to draw the current frame
3. Canvas is converted to a Three.js texture
4. Sprite material uses this canvas texture
5. Frame updates trigger texture re-rendering

This approach allows pixel-perfect sprite rendering while working with Three.js' sprite system.

### MemoryPack Protocol

Communication with the .NET 10 server uses MemoryPack binary protocol:

```
[TypeId:byte][MemoryPack payload]
```

- **Type Safety**: Auto-generated TypeScript models ensure type compatibility
- **Performance**: Ultra-fast, low-allocation serialization
- **WebSocket**: Full-duplex real-time communication

### Coordinate System

- X-axis: Left/Right
- Y-axis: Up/Down (inverted for rendering as -y)
- Z-axis: Depth sorting (based on world Y position / 100)

### Camera System

The camera uses THREE.OrthographicCamera for a proper isometric view:

- Position: (0, 0, 1000)
- Looking at: (0, 0, 0)
- Provides true isometric projection without perspective distortion

## Assets Used

All assets are shared with the 2D version:

- Ground texture: `/map/ground/Ground.png`
- Tree textures: `/map/objects/trees/tree_1.png` through `tree_4.png`
- Knight sprites: `/knight/01_idle_sword.png`, `/knight/01_run_sword.png`

## Differences from 2D Version

| Feature       | 2D (Phaser)             | 3D (Three.js)           | Server (.NET 10) |
| ------------- | ----------------------- | ----------------------- | ---------------- |
| Rendering     | Canvas 2D               | WebGL                   | ✅               |
| Animation     | Phaser animation system | Canvas sprite rendering | ✅               |
| Camera        | Perspective following   | Orthographic isometric  | ✅               |
| Depth Sorting | Automatic (y + height)  | Manual (z = y / 100)    | ✅               |
| Objects       | Physics-based           | Transform-based         | ✅               |
| Network       | MemoryPack WebSocket    | MemoryPack WebSocket    | Native           |

## Performance Considerations

- Canvas textures are updated every frame for animation, which can be optimized further
- Sprite materials use canvas textures instead of texture atlases for simplicity
- Consider using vertex/fragment shaders for larger scale deployments
- WebGL rendering provides better performance for larger player counts
- MemoryPack protocol provides excellent performance for network communication

## Future Optimizations

1. Texture atlases with UV mapping instead of canvas rendering
2. Instancing for identical objects (trees)
3. LOD (Level of Detail) system for distant objects
4. Shader-based animations instead of canvas updates
5. GLTF model support for more complex objects
6. .NET 10 server-side optimizations
7. Enhanced MemoryPack serialization techniques

## Server Integration Example

```typescript
// Connection to .NET 10 server
const wsConnection = new WsConnection('ws://localhost:5000');
wsConnection.connect();

// MemoryPack message handling
wsConnection.on('message', data => {
  // Auto-generated TypeScript models ensure type safety
  const playerUpdate = PlayerStateData.deserialize(data);
  // Process update...
});
```

---

**Note**: This 3D implementation is designed to work seamlessly with the .NET 10 server and provides the same gameplay experience as the 2D version while offering modern WebGL-based rendering.
