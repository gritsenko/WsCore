# WsCore.Client - Dual Rendering Engine Support

## Overview

WsCore.Client is a modern TypeScript client for the WsCore multiplayer game server, offering both **2D (Phaser)** and **3D (Three.js)** rendering engines. The client communicates with the .NET 10 server using a high-performance MemoryPack-based binary protocol and features auto-generated TypeScript models for all network messages.

## Features

- Fast, real-time multiplayer networking (WebSocket, MemoryPack)
- Modular, event-driven architecture
- **Dual rendering engine support:**
  - **Phaser 3** for traditional 2D rendering and input
  - **Three.js** for modern 3D isometric rendering
- Auto-generated protocol models (from C# server)
- Modern build system (Vite)
- Shared assets and game logic across both engines

## Rendering Engines

### 2D Client (Phaser)
- Traditional sprite-based 2D rendering
- Following camera system
- Canvas-based animation system
- Optimized for classic 2D gameplay

### 3D Client (Three.js)
- Modern WebGL-based 3D rendering
- Isometric orthographic camera view
- Canvas-based sprite animation in 3D space
- GPU-accelerated rendering
- **Access**: `http://localhost:5173/?mode=3d`

## Project Structure

- `src/` — Main TypeScript source code
  - `2d/` — 2D Phaser client implementation
  - `3d/` — 3D Three.js client implementation
  - `network/` — WebSocket connection, protocol, and auto-generated models
  - `types/` — Shared type definitions
  - `utils/` — Utility functions
- `public/` — Static assets (sprites, maps, UI)
- `index.html` — Entry point
- `vite.config.ts` — Vite build configuration
- `package.json` — Project metadata and scripts

## Getting Started

1. **Install dependencies:**
   ```sh
   npm install
   ```
2. **Run the development server:**
   ```sh
   npm start
   ```
3. **Access the client:**
   - **2D (Phaser)**: `http://localhost:5173/`
   - **3D (Three.js)**: `http://localhost:5173/?mode=3d`

## Server Requirements

- **.NET 10 server** required (WsServer project)
- WebSocket connection to `ws://localhost:5000`
- MemoryPack protocol support

## Main Dependencies

- **Rendering:**
  - [phaser](https://phaser.io/) — 2D game engine
  - [three](https://threejs.org/) — 3D WebGL engine
- **Build:**
  - [vite](https://vitejs.dev/) — Fast build tool
  - [vite-plugin-singlefile](https://github.com/salvoravida/vite-plugin-singlefile) — Bundle to single HTML file
- **Utilities:**
  - [base64-arraybuffer](https://github.com/niklasvh/base64-arraybuffer) — Binary utils
  - [jszip](https://stuk.github.io/jszip/) — Zip file support

## Controls (Both Engines)

| Action | Key |
|--------|-----|
| Move Up | ↑ Arrow |
| Move Down | ↓ Arrow |
| Move Left | ← Arrow |
| Move Right | → Arrow |
| Set Target | Click |
| Add Tree | E |
| Remove Tree | Q |

## Architecture

### Mode Selection
The application automatically selects between 2D and 3D rendering based on URL parameter:
- **No parameter or `?mode=2d`**: 2D Phaser rendering
- **`?mode=3d`**: 3D Three.js rendering

### Shared Components
Both rendering engines share:
- Network layer (`network/`)
- Utility functions (`utils/`)
- Game logic and assets
- Input handling (keyboard/mouse events)
- WebSocket communication

## Documentation

### Client-Specific
- **2D Documentation**: Inline code comments and Phaser docs
- **3D Documentation**: `src/3d/README.md` - Comprehensive 3D implementation guide
- **Implementation Guide**: `3D_IMPLEMENTATION.md` - Integration details
- **Quick Reference**: `QUICKSTART_3D.md` - Fast 3D setup guide

### Server
The client is designed for use with the WsCore .NET 10 server. See the main project README for server setup and protocol details.

## Notes

- All network protocol models are auto-generated from the C# server using MemoryPack. Do not edit files in `src/network/protocol/` manually.
- Both 2D and 3D clients connect to the same .NET 10 server and use identical game logic
- Assets are shared between both rendering engines
- The 3D client provides a more modern WebGL-based experience while maintaining the same gameplay mechanics

## Build & Deploy

```bash
# Development
npm start

# Production build
npm run build

# Single file bundle (includes everything)
npm run build:single
```

---

© 2025 WsCore Project