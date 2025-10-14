# WsCore.Client (Phaser Edition)

## Overview

WsCore.Client is a modern TypeScript client for the WsCore multiplayer game server, built with [Phaser 3](https://phaser.io/) for 2D rendering and real-time gameplay. It communicates with the server using a high-performance MemoryPack-based binary protocol and features auto-generated TypeScript models for all network messages.

## Features

- Fast, real-time multiplayer networking (WebSocket, MemoryPack)
- Modular, event-driven architecture
- Phaser 3 for 2D game rendering and input
- Auto-generated protocol models (from C# server)
- Modern build system (Vite)

## Project Structure

- `src/` — Main TypeScript source code
  - `game/` — Game logic, world, player, and map objects
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
3. **Build for production:**
   ```sh
   npm run build
   ```

## Main Dependencies

- [phaser](https://phaser.io/) — 2D game engine
- [vite](https://vitejs.dev/) — Fast build tool
- [vite-plugin-singlefile](https://github.com/salvoravida/vite-plugin-singlefile) — Bundle to single HTML file
- [base64-arraybuffer](https://github.com/niklasvh/base64-arraybuffer) — Binary utils
- [jszip](https://stuk.github.io/jszip/) — Zip file support

## Notes

- All network protocol models are auto-generated from the C# server using MemoryPack. Do not edit files in `src/network/protocol/` manually.
- The client is designed for use with the WsCore server. See the main project README for server setup and protocol details.

---

© 2025 WsCore Project