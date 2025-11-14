# Agent Instructions for WsCore Project

## Key Guidelines

### 📝 Documentation
- **Do NOT create boilerplate markdown files** to document code changes unless the developer explicitly requests it
- Only create documentation when:
  - The developer specifically asks for it
  - New feature is complex and truly needs explanation
  - Contributing to existing documentation structure

### 💻 Code Changes
- Implement changes directly rather than just suggesting them
- Use `multi_replace_string_in_file` for multiple independent edits to improve efficiency
- Do not announce which tools are being used in responses

### 🎯 Task Management
- Use the `manage_todo_list` tool for complex multi-step work
- Track progress through completion to ensure all tasks are finished
- Update task status consistently (not-started → in-progress → completed)

### 🔍 Efficiency
- Parallelize independent tool calls (reads, searches) when possible
- Gather sufficient context before implementing
- Don't over-search; make targeted queries
- Balance thorough understanding with forward momentum

### ✅ Quality Standards
- Ensure no TypeScript errors after code changes
- Test that implementations work with existing codebase
- Keep code idiomatic and follow existing patterns
- Verify file structure and organization
- Run `npm run format` on the client project to normalize code formatting after changes

### 🚀 Development Environment
- **dotnet server** and **vite dev serve** are typically run manually by the developer
- Do not attempt to start these services from the agent
- Assume the developer has these running when needed

### 📢 Communication
- Keep responses brief and direct
- Avoid unnecessary framing or introductions
- Confirm completion concisely
- Only provide detailed explanations when complexity requires it

## Project Structure Overview

```
WsCore.Client/
├── src/
│   ├── 2d/          # 2D game mode
│   ├── 3d/          # 3D game mode
│   ├── lobby/       # Discord-style lobby chat
│   ├── network/     # WebSocket client & protocol
│   ├── utils/       # Shared utilities (Chat, Keyboard, etc.)
│   └── main.ts      # Entry point with mode routing

WsServer/
├── WsServer/        # Main server
├── Game/            # Game logic
└── WsServer.Shared/ # Shared utilities
```

## Connection Modes

- **2d**: 2D game with Phaser
- **3d**: 3D game
- **chat**: Discord-style lobby without game engine

All modes connect to same WebSocket server and use shared protocol.
