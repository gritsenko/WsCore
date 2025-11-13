# Quick Start - 3D Client

## Installation & Setup

```bash
cd WsCore.Client
npm install
npm start
```

## Access the 3D Version

Once the dev server is running:

**2D Version (Default):**
```
http://localhost:5173/
```

**3D Version (Three.js):**
```
http://localhost:5173/?mode=3d
```

## Controls

| Action | Key |
|--------|-----|
| Move Up | ↑ Arrow |
| Move Down | ↓ Arrow |
| Move Left | ← Arrow |
| Move Right | → Arrow |
| Set Target | Click |
| Add Tree | E |
| Remove Tree | Q |

## What's Included

✅ **3D Client with Three.js**
- Isometric orthographic camera
- WebGL rendering
- Sprite-based animation system
- Canvas-based sprite rendering
- Full multiplayer support

✅ **Shared with 2D Version**
- Same network protocol
- Same assets (knight sprites, trees)
- Same gameplay mechanics
- Same UI integration

## File Structure

```
src/3d/
├── App3D.ts           # Main application
├── World3D.ts         # World and map
├── Player3D.ts        # Player entity
├── MapObject3D.ts     # Map objects (trees)
├── AnimationDef3D.ts  # Animation data
└── README.md          # Full documentation
```

## Key Features

- Real-time multiplayer movement
- Smooth position interpolation
- Sprite-based character animation
- Map object management
- WebSocket synchronization
- Keyboard and mouse input

## Testing

1. Start the server: `npm start`
2. Open `http://localhost:5173/?mode=3d`
3. Enter a name and click Start
4. Try moving, clicking to target, and placing trees
5. Open another tab to test multiplayer

## Documentation

- **Full Documentation**: `src/3d/README.md`
- **Implementation Guide**: `3D_IMPLEMENTATION.md`
- **Complete Summary**: `3D_SUMMARY.md`

## Build Status

✅ Production build: `npm run build`  
✅ Build size: 2,047.58 kB (gzip: 474.99 kB)  
✅ All modules: 53 transformed  

Enjoy! 🎮
