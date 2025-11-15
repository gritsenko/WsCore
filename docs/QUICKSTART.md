# 🚀 Quick Start Guide - Deploy WsCore to VDS

## 5-Minute Quick Start

### 1️⃣ Test Locally (Verified ✅)
```bash
cd /Users/igor.gritsenko/Projects/WsCore

# Build and test locally (takes ~2 minutes on first run)
docker-compose up -d

# Verify it works
curl http://localhost | head -c 200

# Cleanup
docker-compose down
```
✅ **Status**: Successfully tested! Docker image (379 MB) builds with:
- Node.js 20-alpine client builder
- .NET 10 server builder  
- Runs with Nginx reverse proxy + SSL support
- Single index.html output (2,071 KB uncompressed, 481 KB gzipped)

### 2️⃣ Build & Deploy
```bash
# Make scripts executable (one-time)
chmod +x scripts/*.sh

# Deploy to your VDS (replace with your actual VDS address)
./scripts/deploy.sh deploy@msk.gritsenko.biz ~/gameserver
```

### 3️⃣ Verify & Setup HTTPS
```bash
# Check it's running
ssh deploy@msk.gritsenko.biz 'cd ~/gameserver && docker compose ps'

# Setup SSL with Let's Encrypt (replace with your domain and email)
./scripts/setup-ssl.sh deploy@msk.gritsenko.biz msk.gritsenko.biz admin@example.com

# Test HTTPS
curl -I https://msk.gritsenko.biz
```

### 4️⃣ Test Room System
After deployment, test the room-based communication system:

- **Lobby Interface**: `https://msk.gritsenko.biz/` (Discord-style chat)
- **2D Game**: `https://msk.gritsenko.biz/?mode=2d` (2D gameplay + chat)
- **3D Game**: `https://msk.gritsenko.biz/?mode=3d` (3D gameplay + chat)

**Done! 🎉 Your multiplayer game server is now live with room-based communication!**

---

## 🏗️ What You Get

### Room-Based Communication System
- **Lobby**: Text chat only (default starting point)
- **2D Game Room**: 2D Phaser gameplay with integrated chat
- **3D Game Room**: 3D Three.js gameplay with integrated chat
- **Voice Room**: Future voice chat capability

### Core Features
- **MemoryPack Protocol**: Ultra-fast binary serialization
- **WebSocket Communication**: Real-time bidirectional messaging
- **Room-Aware Broadcasting**: Spatial filtering for optimal performance
- **Auto-Generated TypeScript**: Type-safe client APIs
- **Docker Deployment**: One-command setup with SSL

---

## 📁 What Was Created

```
WsCore/
├── Dockerfile                 # Builds client + server in one image
├── docker-compose.yml         # Runs game-server, nginx, certbot
├── nginx.conf                 # Reverse proxy with WebSocket support
├── .dockerignore              # Build optimization
├── docs/DEPLOYMENT_GUIDE.md   # Full deployment guide
└── scripts/
    ├── build.sh              # Build Docker image locally
    ├── build.ps1             # PowerShell build script
    ├── deploy.sh             # Deploy to remote VDS (main script!)
    ├── deploy.ps1            # PowerShell deployment script
    ├── setup-ssl.sh          # Setup Let's Encrypt HTTPS
    └── README.md             # Script reference
```

---

## ⚙️ Common Commands

### Build Image (Local)
```bash
./scripts/build.sh wscore-game-server latest

# Expected output: Successfully built image (379 MB)
# - Vite: 56 modules, 2,071.75 kB single-file HTML
# - .NET 10: WsServer, Game, WsServer.Shared compiled
# - Docker: ~2-3 minutes first run
```

### Deploy
```bash
./scripts/deploy.sh deploy@your-vds-ip ~/gameserver
```

### Check Status
```bash
ssh deploy@your-vds-ip 'cd ~/gameserver && docker compose ps'
```

### View Logs
```bash
ssh deploy@your-vds-ip 'cd ~/gameserver && docker compose logs -f'
```

### Setup HTTPS
```bash
./scripts/setup-ssl.sh deploy@your-vds-ip your-domain.com admin@email.com
```

---

## 🌐 Testing Room Navigation

After deployment, test the room system in your browser:

### 1. Start in Lobby
```
https://your-domain.com/
```
- Discord-style chat interface
- Text chat with all lobby members
- Navigate to different rooms

### 2. 2D Game Mode
```
https://your-domain.com/?mode=2d
```
- 2D Phaser gameplay
- Spatial updates for nearby players
- Integrated text chat

### 3. 3D Game Mode
```
https://your-domain.com/?mode=3d
```
- 3D Three.js isometric view
- Spatial updates for nearby players
- Integrated text chat

---

## ⚠️ Known Fixes Applied

✅ **Room-Based Architecture**: Updated from single-mode to multi-room system  
✅ **Lobby Default**: New players start in lobby (text chat) by default  
✅ **Vite Output Path**: Changed from `../dist` to `./dist` to output in correct location  
✅ **.NET 10 Support**: Upgraded Docker SDK to 10.0 (was 9.0)  
✅ **Non-root User**: Using UID 1001 to avoid conflicts with base image  
✅ **Server Restore**: Restoring specific project instead of solution (avoids BenchmarkSuite1 error)  
✅ **MemoryPack Protocol**: Updated to use 1-byte header + MemoryPack payload  

---

## 🆘 Troubleshooting

**Build fails with "dotnet restore"?**  
→ Check Dockerfile uses .NET 10 SDK: `FROM mcr.microsoft.com/dotnet/sdk:10.0`

**Build fails with "UID 1000 not unique"?**  
→ Check runtime user uses UID 1001: `useradd -m -u 1001 gameserver`

**Client not serving?**  
→ Verify Vite config: `outDir: './dist'` (in WsCore.Client/vite.config.ts)

**Container exits after docker-compose up?**  
→ Check logs: `docker-compose logs game-server`

**Room navigation not working?**  
→ Check WebSocket connection: `ws://your-domain/ws` should connect

### Restart Services
```bash
ssh deploy@your-vds-ip 'cd ~/gameserver && docker compose restart'
```

---

## 🔧 Configuration

### Update Docker Image Name
In `docker-compose.yml`, change:
```yaml
game-server:
  build:
    context: .
    dockerfile: Dockerfile
```

To use a registry image:
```yaml
game-server:
  image: docker.io/yourusername/wscore-game-server:latest
```

### Update Domain for SSL
Edit `nginx.conf` before running `setup-ssl.sh`, or the script will do it:
```bash
./scripts/setup-ssl.sh deploy@vds your-domain.com admin@example.com
```

---

## 🐛 Troubleshooting

**Containers not starting?**
```bash
ssh deploy@your-vds-ip 'cd ~/gameserver && docker compose logs'
```

**Check if ports are available:**
```bash
ssh deploy@your-vds-ip 'sudo netstat -tlnp | grep 80'
```

**Room system not working?**
```bash
# Check WebSocket endpoint
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: test" \
  -H "Sec-WebSocket-Version: 13" \
  http://your-domain/ws
```

**Rebuild from scratch:**
```bash
ssh deploy@your-vds-ip 'cd ~/gameserver && docker compose down -v && docker compose up -d'
```

---

## 📖 Full Guide

See `DEPLOYMENT_GUIDE.md` for:
- Detailed room architecture explanation
- MemoryPack protocol details
- Backup strategies
- CI/CD integration
- Performance tuning
- Security hardening
- Multiple server scaling

---

## 🎯 Next Steps

1. ✅ Review the files created above
2. ✅ Replace `deploy@msk.gritsenko.biz` with your actual VDS credentials
3. ✅ Run `./scripts/deploy.sh ...` to deploy
4. ✅ Run `./scripts/setup-ssl.sh ...` for HTTPS
5. ✅ Test room navigation: lobby → 2d-game → 3d-game
6. ✅ Use `ssh` commands to manage services

**Questions?** Check `scripts/README.md` for detailed script documentation.

---

## 🏗️ Architecture Quick Overview

```
WsServer (ASP.NET Core 10)
├── WebSocket Handler (/ws)
├── Room Manager (4 persistent rooms)
│   ├── lobby (TextChat only)
│   ├── 2d-game (Spatial2D + TextChat)  
│   ├── 3d-game (Spatial3D + TextChat)
│   └── voice (VoiceChat + TextChat)
├── Game Loop (30 FPS)
└── MemoryPack Protocol (1-byte header)

Client (TypeScript)
├── Lobby App (Discord-style UI)
├── 2D Client (Phaser)
└── 3D Client (Three.js)
```

All clients use the same WebSocket connection and switch between rooms seamlessly.
