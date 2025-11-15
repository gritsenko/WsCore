# WsCore Documentation - Complete Index

## 📖 Documentation (Start Here!)

| Document | Purpose | Read Time |
|----------|---------|-----------|
| **[QUICKSTART.md](QUICKSTART.md)** | 5-minute quick start guide (tested ✅) | 5 min |
| **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** | Complete step-by-step guide with architecture | 15 min |
| **[CONFIG_EXAMPLES.md](CONFIG_EXAMPLES.md)** | Advanced configurations & customization | 10 min |
| **[ROOM_ARCHITECTURE.md](ROOM_ARCHITECTURE.md)** | Room-based communication system | 10 min |

### Quick Navigation
- 🚀 Want to deploy NOW? → [QUICKSTART.md](QUICKSTART.md)
- 📚 Need complete guide? → [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- 🏗️ Understanding rooms? → [ROOM_ARCHITECTURE.md](ROOM_ARCHITECTURE.md)
- ⚙️ Need advanced configs? → [CONFIG_EXAMPLES.md](CONFIG_EXAMPLES.md)

---

## 🏗️ Architecture Overview

### Core System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     WsCore Architecture                      │
├─────────────────────────────────────────────────────────────┤
│  WsServer (ASP.NET Core 10)                               │
│  ├── WebSocket Handler (/ws)                              │
│  ├── Room Manager (4 persistent rooms)                     │
│  ├── Game Loop (30 FPS)                                   │
│  ├── MemoryPack Protocol (1-byte header)                   │
│  └── Message Discovery (Reflection-based)                  │
├─────────────────────────────────────────────────────────────┤
│  Client Applications (TypeScript)                         │
│  ├── 2D Client (Phaser) - Spatial2D + TextChat            │
│  ├── 3D Client (Three.js) - Spatial3D + TextChat          │
│  └── Lobby Interface (Discord-style) - TextChat only      │
└─────────────────────────────────────────────────────────────┘
```

### Room-Based Communication System

| Room Name | Communication Modes | Purpose |
|-----------|-------------------|---------|
| **lobby** | TextChat | Default starting room, text chat only |
| **voice** | VoiceChat + TextChat | Voice communication (future) |
| **2d-game** | Spatial2D + TextChat | 2D Phaser gameplay with chat |
| **3d-game** | Spatial3D + TextChat | 3D Three.js gameplay with chat |

---

## 🐳 Docker Core Files

| File | Purpose | Size |
|------|---------|------|
| **[Dockerfile](Dockerfile)** | Multi-stage build: Node.js client + .NET server | 1.4K |
| **[docker-compose.yml](docker-compose.yml)** | Service orchestration (game-server, nginx, certbot) | 1.3K |
| **[nginx.conf](nginx.conf)** | Reverse proxy with WebSocket & SSL support | 3.0K |
| **[.dockerignore](.dockerignore)** | Build optimization | 360B |

### Key Features
- ✅ Multi-stage build (optimized image size)
- ✅ Client + Server in single container
- ✅ Automatic SSL/TLS with Let's Encrypt
- ✅ Nginx reverse proxy with WebSocket support
- ✅ Health checks & auto-restart
- ✅ Non-root security
- ✅ Auto-renewal of SSL certificates

---

## 🛠️ Deployment Scripts (In `scripts/` directory)

| Script | Purpose | Usage |
|--------|---------|-------|
| **[build.sh](scripts/build.sh)** | Build Docker image locally | `./scripts/build.sh [name] [tag]` |
| **[deploy.sh](scripts/deploy.sh)** | ⭐ Deploy to remote VDS | `./scripts/deploy.sh <user@host> <domain>` |
| **[deploy.ps1](scripts/deploy.ps1)** | PowerShell deployment script | `.\scripts\deploy.ps1 <user@host> <domain>` |
| **[build.ps1](scripts/build.ps1)** | PowerShell build script | `.\scripts\build.ps1 [name] [tag]` |

### Main Commands
```bash
# Make scripts executable (one-time)
chmod +x scripts/*.sh

# Deploy to VDS
./scripts/deploy.sh deploy@your-vds-ip ~/gameserver

# Check status after deployment
ssh deploy@your-vds-ip 'cd ~/gameserver && docker compose ps'

# View logs
ssh deploy@your-vds-ip 'cd ~/gameserver && docker compose logs -f'
```

---

## 🏗️ Server Architecture Details

### Core Components

#### 1. **WebSocket Handler (`WsServer/WsServer/`)**
- **Framework**: ASP.NET Core 10
- **Endpoint**: `/ws`
- **Features**: Connection lifecycle, binary message processing, static file serving

#### 2. **Room Manager (`WsServer.WsServer/GameServer.cs`)**
- **Persistent Rooms**: 4 predefined rooms with different communication modes
- **Auto-join**: New players automatically join lobby
- **Spatial Filtering**: Game updates filtered by room and proximity
- **Communication Modes**: TextChat, VoiceChat (future), Spatial2D, Spatial3D

#### 3. **Game Loop (`WsServer.Game/Core/GameModel.cs`)**
- **Fixed Timestep**: 30 FPS (33ms intervals)
- **Game State**: Player management, bullet physics, collision detection
- **Concurrency**: Thread-safe collections (ConcurrentDictionary)
- **Events**: Player join/leave, tick updates, hits, respawns

#### 4. **MemoryPack Protocol (`WsServer.WsServer.Shared/`)**
- **Binary Format**: `[TypeId:byte][MemoryPack payload]`
- **Type Safety**: Compile-time message verification
- **Performance**: Pooled buffers, minimal allocations
- **TypeScript Generation**: Auto-generated client types

### Message Flow

```
Client WebSocket Connection
    ↓
Join Default Lobby Room (TextChat)
    ↓
Navigate to Game Rooms (Spatial + TextChat)
    ↓
Receive Room-Aware Updates
    ├── Spatial Updates (filtered by proximity)
    └── Text Messages (all room members)
```

---

## 🚀 Deployment Flow

### Option 1: Quick Deployment (Recommended)
```bash
# 1. Make scripts executable
chmod +x scripts/*.sh

# 2. Build and deploy
./scripts/build.sh wscore-game-server latest
./scripts/deploy.sh deploy@your-vds-ip ~/gameserver

# 3. Setup HTTPS (automatic)
# Script handles Let's Encrypt automatically
```

### Option 2: PowerShell (Windows)
```powershell
# Build with PowerShell
.\scripts\build.ps1 wscore-game-server latest

# Deploy with PowerShell
.\scripts\deploy.ps1 deploy@your-vds-ip ~/gameserver
```

---

## 📊 Files Created

### Core Docker Files
```
WsCore/
├── Dockerfile              (1.4K) - Multi-stage build
├── docker-compose.yml      (1.3K) - Service orchestration
├── nginx.conf              (3.0K) - Reverse proxy config
└── .dockerignore           (360B) - Build optimization
```

### Deployment Scripts
```
scripts/
├── build.sh                (1.0K) - Build image
├── build.ps1               (1.1K) - PowerShell build
├── deploy.sh               (2.8K) - Main deployment script ⭐
├── deploy.ps1              (2.9K) - PowerShell deployment
└── README.md               (2.5K) - Script reference
```

### Documentation
```
docs/
├── QUICKSTART.md           (3.5K) - 5-min quick start
├── DEPLOYMENT_GUIDE.md     (12K)  - Complete guide
├── CONFIG_EXAMPLES.md      (4.4K) - Advanced configs
├── ROOM_ARCHITECTURE.md    (5.2K) - Room system details
└── INDEX.md                (this) - File index
```

---

## ✅ Quick Checklist

### Before Deployment
- [ ] Review [QUICKSTART.md](QUICKSTART.md)
- [ ] Make scripts executable: `chmod +x scripts/*.sh`
- [ ] Have VDS credentials (user@host)
- [ ] Have domain name (for SSL)
- [ ] Have SSH key configured

### After Deployment
- [ ] Check status: `ssh <user>@<host> 'cd <dir> && docker compose ps'`
- [ ] View logs: `ssh <user>@<host> 'cd <dir> && docker compose logs -f'`
- [ ] Test HTTPS: `curl -I https://your-domain.com`
- [ ] Verify rooms: Access lobby, 2d-game, 3d-game rooms

---

## 🎯 Common Tasks

### Deploy
```bash
./scripts/deploy.sh deploy@192.168.1.100 ~/gameserver
```

### Check Status
```bash
ssh deploy@192.168.1.100 'cd ~/gameserver && docker compose ps'
```

### View Live Logs
```bash
ssh deploy@192.168.1.100 'cd ~/gameserver && docker compose logs -f'
```

### Restart Services
```bash
ssh deploy@192.168.1.100 'cd ~/gameserver && docker compose restart'
```

### Update Application
```bash
./scripts/build.sh wscore-game-server latest
./scripts/deploy.sh deploy@192.168.1.100 ~/gameserver
```

---

## 🔐 Security Features

✅ **Implemented**
- Non-root user (gameserver)
- SSH key authentication
- Private docker network
- HTTPS/TLS with Let's Encrypt
- Health checks
- Container resource limits

✅ **Recommended** (see [CONFIG_EXAMPLES.md](CONFIG_EXAMPLES.md))
- Firewall rules (ufw)
- SSL certificate backups
- Log monitoring
- Regular image updates
- Strong SSH keys

---

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| Containers not starting | `ssh <vds> 'cd <dir> && docker compose logs'` |
| SSL certificate error | `ssh <vds> 'docker compose logs certbot'` |
| Port already in use | `ssh <vds> 'sudo lsof -i :80'` |
| Game server not responding | `ssh <vds> 'cd <dir> && docker compose logs game-server'` |
| Room navigation issues | Check browser console for WebSocket errors |
| Full restart needed | `ssh <vds> 'cd <dir> && docker compose down -v && docker compose up -d'` |

See [DEPLOYMENT_GUIDE.md#troubleshooting](DEPLOYMENT_GUIDE.md#troubleshooting) for more.

---

## 📚 Resources

| Type | Link |
|------|------|
| 📖 Quick Start | [QUICKSTART.md](QUICKSTART.md) |
| 📚 Full Guide | [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) |
| 🏗️ Room System | [ROOM_ARCHITECTURE.md](ROOM_ARCHITECTURE.md) |
| ⚙️ Advanced Config | [CONFIG_EXAMPLES.md](CONFIG_EXAMPLES.md) |
| 🛠️ Scripts Ref | [scripts/README.md](scripts/README.md) |

---

## 🎯 Getting Started

1. **Read** [QUICKSTART.md](QUICKSTART.md) (5 min)
2. **Make scripts executable**: `chmod +x scripts/*.sh`
3. **Deploy**: `./scripts/deploy.sh deploy@your-vds-ip ~/gameserver`
4. **Test**: Access `https://your-domain.com` and navigate rooms
5. **Verify**: Check lobby → 2d-game → 3d-game room transitions

**Ready?** Start with [QUICKSTART.md](QUICKSTART.md) now! 🚀

---

## 🌐 Room Navigation Guide

After deployment, test the room system:

1. **Lobby** (`/`) - Text chat interface (Discord-style)
2. **2D Game** (`/?mode=2d`) - 2D Phaser gameplay with chat
3. **3D Game** (`/?mode=3d`) - 3D Three.js gameplay with chat

Each room maintains persistent text chat while providing different gameplay modes.

---

**Created**: 2025-11-15  
**Technologies**: Docker, Docker Compose, .NET 10, Node.js 20, nginx, Let's Encrypt, MemoryPack  
**Status**: ✅ Ready for deployment with room-based architecture
