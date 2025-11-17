# WsCore Docker Deployment Guide

Complete guide for building, deploying, and managing your WsCore room-based multiplayer game server on a remote VDS.

## Architecture Overview

### Core System Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                     WsCore Architecture                      │
├─────────────────────────────────────────────────────────────┤
│  WsServer (ASP.NET Core 10)                               │
│  ├── WebSocket Handler (/ws)                              │
│  ├── Room Manager (4 persistent rooms)                     │
│  │   ├── lobby (TextChat only)                             │
│  │   ├── voice (VoiceChat + TextChat)                      │
│  │   ├── 2d-game (Spatial2D + TextChat)                    │
│  │   └── 3d-game (Spatial3D + TextChat)                    │
│  ├── Game Loop (30 FPS)                                   │
│  ├── MemoryPack Protocol (1-byte header)                   │
│  └── Message Discovery (Reflection-based)                  │
├─────────────────────────────────────────────────────────────┤
│  Client Applications (TypeScript)                         │
│  ├── Lobby Interface (Discord-style chat)                  │
│  ├── 2D Client (Phaser) - Spatial2D mode                   │
│  └── 3D Client (Three.js) - Spatial3D mode                 │
├─────────────────────────────────────────────────────────────┤
│  Deployment Stack (VDS)                                   │
│  ├── Nginx (Reverse Proxy + SSL)                          │
│  ├── Game Server (Single container)                       │
│  └── Certbot (Auto SSL renewal)                           │
└─────────────────────────────────────────────────────────────┘
```

### Room-Based Communication Flow
```
Client Connection
    ↓
WebSocket (/ws)
    ↓
Join Default Lobby (TextChat)
    ↓
Navigate Rooms (Spatial + TextChat)
    ↓
Receive Room-Aware Updates
    ├── Spatial Updates (filtered by proximity)
    └── Text Messages (all room members)
```

## Prerequisites

### Local Machine (Mac/Windows)
- Docker Desktop installed
- Docker CLI available
- `git` for version control
- SSH key for VDS access
- PowerShell (Windows, optional for PS1 scripts)

### Remote VDS
- Linux (Ubuntu 20.04+ or similar)
- Docker & Docker Compose installed
- 2+ CPU cores, 2GB+ RAM
- Open ports: 22 (SSH), 80 (HTTP), 443 (HTTPS)
- Domain name pointing to VDS IP

## Step 1: Make Scripts Executable

```bash
cd /Users/igor.gritsenko/Projects/WsCore
chmod +x scripts/*.sh
```

## Step 2: Build Docker Image (Local)

### Option A: Build Locally and Test ✅
```bash
# Shell script (Mac/Linux)
./scripts/build.sh wscore-game-server latest

# PowerShell (Windows)
.\scripts\build.ps1 wscore-game-server latest

# Expected output:
# ✓ Vite built 56 modules into single 2,071.75 kB HTML file
# ✓ .NET 10 compiled successfully with room system
# ✓ Docker image: ~379 MB
# ✓ MemoryPack TypeScript generation complete
# Build time: ~2-3 minutes on first run (downloads SDKs)
```

This builds a multi-stage Docker image that:
1. **Stage 1**: Node.js 20-alpine → builds TypeScript client with Vite (single index.html with room routing)
2. **Stage 2**: .NET 10 SDK → builds server with WsServer, Game, WsServer.Shared projects (room system included)
3. **Stage 3**: .NET 10 aspnet runtime → combines both into single production image

### Option B: Let docker-compose Build
Docker-compose can also build on first `up`:
```bash
docker-compose up --build
```

### Build Details
- **Client build output**: WsCore.Client/dist/index.html (2,071.75 KB uncompressed, 481.48 KB gzipped)
- **Room routing**: All three modes (lobby, 2d, 3d) in single HTML file
- **Server projects**: WsServer (main + room manager), Game (logic), WsServer.Shared (messaging)
- **MemoryPack**: Auto-generated TypeScript types in WsCore.Client/src/network/protocol
- **Runtime base**: mcr.microsoft.com/dotnet/aspnet:10.0
- **Non-root user**: gameserver (UID 1001)

## Step 3: Test Locally ✅

```bash
docker-compose up -d

# Verify services started
docker-compose ps

# Test the application
curl http://localhost | head -c 200

# Check game server logs
docker-compose logs game-server | tail -20

# Test room system (WebSocket)
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: test" \
  -H "Sec-WebSocket-Version: 13" \
  http://localhost/ws

# Cleanup
docker-compose down
```

**Expected**: All 3 containers running (game-server, nginx, certbot), HTTP response from localhost shows HTML client with room navigation.

You should see:
```
NAME          IMAGE                STATUS
certbot       certbot/certbot      Up
game-server   wscore-game-server   Up (health: starting)
nginx-proxy   nginx:alpine         Up
```

## Step 4: Optional - Push to Registry

### Docker Hub
```bash
docker login
./scripts/push.sh wscore-game-server latest docker.io/yourusername
```

### GitHub Container Registry
```bash
echo $CR_PAT | docker login ghcr.io -u yourusername --password-stdin
./scripts/push.sh wscore-game-server latest ghcr.io/yourusername
```

This step is optional. If you push, the VDS will pull from the registry instead of building locally.

## Step 5: Deploy to VDS

### Initial Setup (One Time)

```bash
# SSH into VDS first and create deploy user (if needed)
ssh root@your-vds-ip
useradd -m -s /bin/bash deploy
usermod -aG docker deploy
su - deploy
```

### Deploy Application

```bash
# Shell script (Mac/Linux)
./scripts/deploy.sh deploy@your-vds-ip ~/gameserver

# PowerShell (Windows)
.\scripts\deploy.ps1 deploy@your-vds-ip ~/gameserver
```

This script:
1. Creates `~/gameserver` directory
2. Copies `docker-compose.yml` and `nginx.conf`
3. Creates SSL/certbot directories
4. Pulls and starts containers
5. Sets up room-based communication system

### What Gets Deployed

```
~/gameserver/
├── docker-compose.yml    (pulled from your local copy)
├── nginx.conf            (pulled from your local copy)
├── ssl/                  (for manual SSL certs, optional)
└── certbot/
    ├── conf/             (Let's Encrypt certs)
    └── www/              (ACME challenge validation)
```

### Room System Verification
After deployment, verify the room system is working:
```bash
# Check WebSocket endpoint
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: test" \
  -H "Sec-WebSocket-Version: 13" \
  https://your-domain.com/ws
```

## Step 6: Verify Deployment

```bash
# Shell script
./scripts/manage-vds.sh deploy@your-vds-ip status

# Direct SSH
ssh deploy@your-vds-ip 'cd ~/gameserver && docker compose ps'
```

Output should show:
```
CONTAINER ID   IMAGE                          STATUS
xxxxx          game-server                    Up 2 minutes
xxxxx          nginx:alpine                   Up 2 minutes
xxxxx          certbot/certbot                Up 2 minutes
```

## Step 7: Setup HTTPS/TLS

### Prerequisites
- Domain name pointing to your VDS IP
- Email for Let's Encrypt renewal notifications

### Run SSL Setup Script

```bash
# Shell script
./scripts/setup-ssl.sh deploy@your-vds-ip your-domain.com admin@email.com

# PowerShell alternative
ssh deploy@your-vds-ip 'cd ~/gameserver && ./setup-ssl.sh your-domain.com admin@email.com'
```

This script:
1. Updates `nginx.conf` with your domain
2. Enables HTTP for Let's Encrypt validation
3. Runs certbot to obtain certificate
4. Enables HTTPS in nginx
5. Sets up auto-renewal (certbot service watches for expiration)

### Verify HTTPS

```bash
curl -I https://your-domain.com
```

Should show `HTTP/1.1 200 OK` with SSL certificate info.

## Step 8: Test Room Navigation

### Verify Room System
After HTTPS setup, test all room modes:

1. **Lobby Interface**:
   ```
   https://your-domain.com/
   ```
   - Discord-style chat interface
   - Text chat with lobby members
   - Room navigation buttons

2. **2D Game Room**:
   ```
   https://your-domain.com/?mode=2d
   ```
   - 2D Phaser gameplay
   - Spatial updates for nearby players
   - Integrated text chat

3. **3D Game Room**:
   ```
   https://your-domain.com/?mode=3d
   ```
   - 3D Three.js isometric view
   - Spatial updates for nearby players
   - Integrated text chat

## Step 9: Ongoing Management

### Check Status
```bash
# Shell script
./scripts/manage-vds.sh deploy@your-vds-ip status

# Direct SSH
ssh deploy@your-vds-ip 'cd ~/gameserver && docker compose ps'
```

### View Logs
```bash
# Shell script
./scripts/manage-vds.sh deploy@your-vds-ip logs

# Game server logs only
ssh deploy@your-vds-ip 'cd ~/gameserver && docker compose logs -f game-server'

# Room system logs
ssh deploy@your-vds-ip 'cd ~/gameserver && docker compose logs game-server | grep -i room'
```

### Restart Services
```bash
# Shell script
./scripts/manage-vds.sh deploy@your-vds-ip restart

# Direct SSH
ssh deploy@your-vds-ip 'cd ~/gameserver && docker compose restart'
```

### Update to Latest Image
```bash
# Rebuild locally first
./scripts/build.sh wscore-game-server latest

# Deploy update
./scripts/deploy.sh deploy@your-vds-ip ~/gameserver

# Or pull from registry (if you pushed)
ssh deploy@your-vds-ip 'cd ~/gameserver && docker pull yourusername/wscore-game-server:latest && docker compose up -d'
```

### SSH into VDS
```bash
# Shell script
./scripts/manage-vds.sh deploy@your-vds-ip shell

# Direct SSH
ssh deploy@your-vds-ip
cd ~/gameserver
```

## Room System Maintenance

### Check Room Statistics
```bash
# Check active connections
ssh deploy@your-vds-ip 'cd ~/gameserver && docker compose exec game-server dotnet /app/WsServer.dll --check-rooms'

# Monitor room traffic
ssh deploy@your-vds-ip 'cd ~/gameserver && docker compose logs -f game-server | grep -E "(JoinRoom|LeaveRoom|Broadcast)"'
```

### Room System Debugging
```bash
# Enable verbose room logging
ssh deploy@your-vds-ip 'cd ~/gameserver && docker compose exec game-server dotnet /app/WsServer.dll --room-logging'

# Check WebSocket connections
ssh deploy@your-vds-ip 'cd ~/gameserver && docker compose exec game-server netstat -an | grep :80'
```

## MemoryPack Protocol Details

### Message Structure
```
[TypeId: byte][MemoryPack payload]
```

### Generated TypeScript Types
After building the server, TypeScript types are auto-generated:
```
WsCore.Client/src/network/protocol/
├── MemoryPackReader.ts
├── MemoryPackWriter.ts
├── ChatMessageEvent.ts
├── JoinRoomRequest.ts
├── RoomUsersUpdateEvent.ts
└── [other auto-generated types]
```

### Room-Aware Broadcasting
The server uses `GameMessengerRoomAware` to filter spatial updates:
```csharp
// Only send spatial updates to relevant room members
_roomAwareMessenger.BroadcastSpatialUpdates(gameStateEvent);
```

## Troubleshooting

### Containers Not Starting
```bash
# Check all logs
./scripts/manage-vds.sh deploy@your-vds-ip logs

# Specific service
ssh deploy@your-vds-ip 'cd ~/gameserver && docker compose logs game-server'
```

### Room System Issues
```bash
# Check WebSocket endpoint
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: test" \
  -H "Sec-WebSocket-Version: 13" \
  https://your-domain.com/ws

# Check room manager logs
ssh deploy@your-vds-ip 'cd ~/gameserver && docker compose logs game-server | grep -i "room\|lobby"'
```

### SSL Certificate Issues
```bash
# Check certbot logs
ssh deploy@your-vds-ip 'docker compose logs certbot'

# Manual certificate renewal
ssh deploy@your-vds-ip 'docker compose exec certbot certbot renew --dry-run'
```

### MemoryPack Type Generation Issues
```bash
# Check if TypeScript types were generated
ssh deploy@your-vds-ip 'docker compose exec game-server ls -la /app/wwwroot/network/protocol/'

# Regenerate types (rebuild server)
./scripts/build.sh wscore-game-server latest
./scripts/deploy.sh deploy@your-vds-ip ~/gameserver
```

### Game Server Not Responding
```bash
ssh deploy@your-vds-ip 'docker compose logs game-server'
```

### Port Already in Use
```bash
ssh deploy@your-vds-ip 'sudo lsof -i :80 -i :443'
```

### Client Not Loading Room Interface
```bash
# Check nginx logs
ssh deploy@your-vds-ip 'docker compose logs nginx'

# Check static files
ssh deploy@your-vds-ip 'docker compose exec game-server ls -la /app/wwwroot/'

# Test client files
curl https://your-domain.com/ | head -50
```

### Rebuild From Scratch
```bash
ssh deploy@your-vds-ip 'cd ~/gameserver && docker compose down -v && docker compose up -d'
```

## Performance Optimization

### For Stable Production

1. **Update docker-compose.yml** resource limits:
```yaml
game-server:
  deploy:
    resources:
      limits:
        cpus: '1.5'
        memory: 1G
      reservations:
        cpus: '1'
        memory: 512M
```

2. **Enable nginx caching** in nginx.conf:
```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=game_cache:10m;
```

3. **Monitor with docker stats**:
```bash
ssh deploy@your-vds-ip 'docker stats'
```

4. **Room System Optimization**:
```bash
# Monitor room traffic
ssh deploy@your-vds-ip 'cd ~/gameserver && docker compose exec game-server dotnet /app/WsServer.dll --room-stats'
```

## Backup Strategy

### Backup Configuration Files
```bash
ssh deploy@your-vds-ip 'cd ~/gameserver && tar czf backup-config-$(date +%Y%m%d).tar.gz docker-compose.yml nginx.conf'
```

### Backup SSL Certificates
```bash
ssh deploy@your-vds-ip 'sudo tar czf backup-ssl-$(date +%Y%m%d).tar.gz /etc/letsencrypt'
```

### Backup Room State (if needed)
```bash
# Room state is ephemeral, but you can backup configuration
ssh deploy@your-vds-ip 'cd ~/gameserver && tar czf backup-room-config-$(date +%Y%m%d).tar.gz .'
```

## Scaling

### Multiple Game Server Instances with Room Affinity

Update docker-compose.yml:
```yaml
game-server:
  deploy:
    replicas: 3
```

For room-based scaling, use nginx upstream with sticky sessions:
```nginx
upstream game_backend {
    ip_hash;  # Ensure same client always hits same server (for room consistency)
    server game-server-1:80;
    server game-server-2:80;
    server game-server-3:80;
}
```

## File Structure

```
WsCore/
├── Dockerfile                 # Multi-stage build (client + server + room system)
├── docker-compose.yml         # Service orchestration
├── nginx.conf                 # Reverse proxy config (WebSocket support)
├── .dockerignore              # Build optimization
├── scripts/
│   ├── build.sh              # Build image locally (shell)
│   ├── build.ps1             # Build image locally (PowerShell)
│   ├── deploy.sh             # Deploy to remote VDS (shell) ⭐
│   ├── deploy.ps1            # Deploy to remote VDS (PowerShell)
│   ├── setup-ssl.sh          # Setup Let's Encrypt HTTPS
│   ├── push.sh               # Push to registry
│   └── README.md             # Script reference
├── WsCore.Client/            # Multi-mode web client (TypeScript + Vite)
│   ├── src/
│   │   ├── lobby/            # Discord-style lobby interface
│   │   ├── 2d/               # 2D Phaser client (Spatial2D)
│   │   ├── 3d/               # 3D Three.js client (Spatial3D)
│   │   └── network/protocol  # Auto-generated MemoryPack types
│   └── dist/                 # Built single HTML with room routing
└── WsServer/                 # .NET 10 game server with room system
    ├── WsServer/             # ASP.NET Core WebSocket host
    ├── Game/                 # Game logic and room management
    └── WsServer.Shared/      # MemoryPack messaging system
```

## Security Considerations

1. **SSH Key Authentication**
   ```bash
   ssh-copy-id deploy@your-vds-ip
   ```

2. **Firewall Rules**
   ```bash
   ssh deploy@your-vds-ip 'sudo ufw enable && sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp'
   ```

3. **No Root Docker**
   - User should be in docker group, not running containers as root

4. **Container Security**
   - Images run as non-root user (`gameserver`)
   - No privileged mode

5. **Network Security**
   - Only necessary ports exposed
   - Private docker network for inter-container communication

6. **WebSocket Security**
   - Rate limiting for room joins
   - Input validation for room names
   - Message size limits

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to VDS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build and Push
        run: |
          docker build -t yourusername/wscore:${{ github.sha }} .
          echo ${{ secrets.DOCKER_TOKEN }} | docker login -u yourusername --password-stdin
          docker push yourusername/wscore:${{ github.sha }}
      
      - name: Deploy to VDS
        uses: appleboy/ssh-action@v0.1.8
        with:
          host: ${{ secrets.VDS_HOST }}
          username: deploy
          key: ${{ secrets.VDS_SSH_KEY }}
          script: |
            cd ~/gameserver
            docker pull yourusername/wscore:${{ github.sha }}
            docker tag yourusername/wscore:${{ github.sha }} wscore-game-server:latest
            docker compose up -d
```

### Room System Integration Testing
```bash
# Test room navigation in CI
curl -f https://your-domain.com/ || exit 1
curl -f "https://your-domain.com/?mode=2d" || exit 1
curl -f "https://your-domain.com/?mode=3d" || exit 1
```

## Support & Debugging

### Build Troubleshooting

**Error: "The current .NET SDK does not support targeting .NET 10.0"**
- ✅ **Fixed**: Dockerfile now uses `.NET 10.0` SDK and runtime
- Check Dockerfile lines:
  - Line 20: `FROM mcr.microsoft.com/dotnet/sdk:10.0`
  - Line 36: `FROM mcr.microsoft.com/dotnet/aspnet:10.0`

**Error: "UID 1000 is not unique"**
- ✅ **Fixed**: Changed user UID to 1001
- Verify line 47 in Dockerfile: `useradd -m -u 1001 gameserver`

**Error: "project file was not found" (BenchmarkSuite1)**
- ✅ **Fixed**: Restoring specific project instead of solution
- Verify Dockerfile line 33: `RUN dotnet restore WsServer/WsServer.csproj`

**Error: "dist folder not found during Docker build"**
- ✅ **Fixed**: Vite config outputs to correct path `./dist`
- Check WsCore.Client/vite.config.ts: `outDir: './dist'`

**Error: "Room manager not found"**
- ✅ **Verified**: Room manager is properly integrated in GameServer.cs
- Check server logs for room initialization messages

### Room System Troubleshooting

**Issue: "Room navigation not working"**
- Check browser console for JavaScript errors
- Verify WebSocket connection: `ws://your-domain.com/ws`
- Check room names: lobby, voice, 2d-game, 3d-game

**Issue: "Players not appearing in rooms"**
- Check server logs for player join events
- Verify room-aware broadcasting is working
- Check WebSocket connection state

**Issue: "MemoryPack types not generated"**
- Rebuild server with TypeScript generation
- Check WsServer/Game/Game.csproj for MemoryPack settings
- Verify generated files in WsCore.Client/src/network/protocol/

### Common Issues

**Issue: Image pull fails**
- Check registry credentials
- Verify image name and tag
- Check internet connectivity on VDS

**Issue: Port 80/443 already in use**
- Check running containers: `docker ps`
- Kill conflicting service: `sudo systemctl stop nginx`

**Issue: Certbot renewal fails**
- Check DNS records
- Verify domain resolves to VDS IP
- Check nginx is running and responsive

**Issue: Game client not loading room interface**
- Verify nginx logs: `docker-compose logs nginx`
- Check static files copied: `docker exec game-server ls /app/wwwroot/`
- Verify Vite built single index.html: `ls -lh WsCore.Client/dist/`

### Getting Help

1. Check script output for error messages
2. View container logs: `docker-compose logs`
3. Test room system: Check all three modes (lobby, 2d, 3d)
4. SSH into VDS and inspect manually
5. Check VDS system logs: `sudo journalctl -xe`

---

**Ready to deploy with room-based architecture?** Start with Step 1 and follow in order. Happy multiplayer gaming!
