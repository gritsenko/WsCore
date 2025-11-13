# WsCore Docker Deployment - Complete Index

## 📖 Documentation (Start Here!)

| Document | Purpose | Read Time |
|----------|---------|-----------|
| **[QUICKSTART.md](QUICKSTART.md)** | 5-minute quick start guide (tested ✅) | 5 min |
| **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** | Complete step-by-step guide with architecture | 15 min |
| **[CONFIG_EXAMPLES.md](CONFIG_EXAMPLES.md)** | Advanced configurations & customization | 10 min |

### Quick Navigation
- 🚀 Want to deploy NOW? → [QUICKSTART.md](QUICKSTART.md)
- 📚 Need complete guide? → [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- ⚙️ Need advanced configs? → [CONFIG_EXAMPLES.md](CONFIG_EXAMPLES.md)

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
| **[push.sh](scripts/push.sh)** | Push to Docker registry | `./scripts/push.sh [name] [tag] [registry]` |
| **[deploy-vds.sh](scripts/deploy-vds.sh)** | ⭐ Deploy to remote VDS | `./scripts/deploy-vds.sh <user@host> [dir]` |
| **[manage-vds.sh](scripts/manage-vds.sh)** | Manage running services | `./scripts/manage-vds.sh <user@host> <cmd>` |
| **[setup-ssl.sh](scripts/setup-ssl.sh)** | Setup HTTPS with Let's Encrypt | `./scripts/setup-ssl.sh <user@host> <domain>` |
| **[README.md](scripts/README.md)** | Script reference & examples | (in scripts/) |

### Main Commands
```bash
# Make scripts executable (one-time)
chmod +x scripts/*.sh

# Deploy to VDS
./scripts/deploy-vds.sh deploy@your-vds-ip ~/gameserver

# Setup HTTPS
./scripts/setup-ssl.sh deploy@your-vds-ip your-domain.com admin@example.com

# Manage services
./scripts/manage-vds.sh deploy@your-vds-ip status      # Check status
./scripts/manage-vds.sh deploy@your-vds-ip logs        # View logs
./scripts/manage-vds.sh deploy@your-vds-ip restart     # Restart
./scripts/manage-vds.sh deploy@your-vds-ip update      # Update image
./scripts/manage-vds.sh deploy@your-vds-ip shell       # SSH into VDS
```

---

## 🏗️ Architecture

### Docker Image (Single Build)
```
Dockerfile (Multi-stage)
├── Stage 1: Node.js Builder
│   ├── Base: node:20-alpine
│   ├── Install npm dependencies
│   ├── Build TypeScript/Vite client
│   └── Output: /app/client/dist (single index.html)
├── Stage 2: .NET Builder
│   ├── Base: mcr.microsoft.com/dotnet/sdk:10.0
│   ├── Restore NuGet packages
│   ├── Build .NET 10 solution (Release)
│   └── Output: published DLLs
└── Stage 3: Runtime
    ├── Base: mcr.microsoft.com/dotnet/aspnet:10.0
    ├── Copy server (Stage 2) → /app
    ├── Copy client (Stage 1) → /app/wwwroot
    ├── User: gameserver:1001 (non-root)
    ├── Health check: HTTP monitoring
    └── Ports: 80, 443
```

### Deployment Stack (VDS)
```
┌─ Docker Compose Network ─────────────────┐
│                                          │
│  ┌──────────┐      ┌──────────┐        │
│  │ nginx    │◄────►│ game-    │        │
│  │ (443)    │      │ server   │        │
│  │ (80)     │      │ (80)     │        │
│  └──────────┘      └──────────┘        │
│       │                                  │
│  ┌────┴──────────────────────┐         │
│  │  certbot (SSL renewal)    │         │
│  │  (auto-renew every 12h)   │         │
│  └──────────────────────────┘         │
│                                        │
└────────────────────────────────────────┘
         ▲
         │ Port 443 (HTTPS)
         │ Port 80 (HTTP)
    Internet
```

---

## 🚀 Deployment Flow

### Option 1: Quick Deployment (Recommended)
```bash
# 1. Deploy to VDS
./scripts/deploy-vds.sh deploy@your-vds-ip ~/gameserver

# 2. Setup HTTPS
./scripts/setup-ssl.sh deploy@your-vds-ip your-domain.com admin@example.com

# 3. Done!
```

### Option 2: Build & Push (For Registry)
```bash
# 1. Build locally
./scripts/build.sh wscore-game-server latest

# 2. Push to registry
./scripts/push.sh wscore-game-server latest docker.io/yourusername

# 3. Deploy from registry
./scripts/deploy-vds.sh deploy@your-vds-ip ~/gameserver docker.io/yourusername/wscore-game-server:latest
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
├── push.sh                 (1.4K) - Push to registry
├── deploy-vds.sh           (2.6K) - Main deployment script ⭐
├── manage-vds.sh           (2.2K) - Service management
├── setup-ssl.sh            (2.8K) - SSL setup
└── README.md               (3.2K) - Script reference
```

### Documentation
```
├── QUICKSTART.md           (3.5K) - 5-min quick start
├── DEPLOYMENT_GUIDE.md     (11K)  - Complete guide
├── CONFIG_EXAMPLES.md      (4.4K) - Advanced configs
├── DOCKER_SETUP_SUMMARY.txt (6K)  - Setup summary
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
- [ ] Check status: `./scripts/manage-vds.sh <vds> status`
- [ ] View logs: `./scripts/manage-vds.sh <vds> logs`
- [ ] Setup SSL: `./scripts/setup-ssl.sh <vds> <domain> <email>`
- [ ] Test HTTPS: `curl -I https://your-domain.com`

---

## 🎯 Common Tasks

### Deploy
```bash
./scripts/deploy-vds.sh deploy@192.168.1.100 ~/gameserver
```

### Check Status
```bash
./scripts/manage-vds.sh deploy@192.168.1.100 status
```

### View Live Logs
```bash
./scripts/manage-vds.sh deploy@192.168.1.100 logs
```

### Setup HTTPS
```bash
./scripts/setup-ssl.sh deploy@192.168.1.100 msk.gritsenko.biz admin@example.com
```

### Update Image
```bash
./scripts/manage-vds.sh deploy@192.168.1.100 update
```

### SSH into VDS
```bash
./scripts/manage-vds.sh deploy@192.168.1.100 shell
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
| Containers not starting | `./scripts/manage-vds.sh <vds> logs` |
| SSL certificate error | `ssh <vds> 'docker compose logs certbot'` |
| Port already in use | `ssh <vds> 'sudo lsof -i :80'` |
| Game server not responding | `./scripts/manage-vds.sh <vds> logs game-server` |
| Full restart needed | `ssh <vds> 'cd ~/gameserver && docker compose down -v && docker compose up -d'` |

See [DEPLOYMENT_GUIDE.md#troubleshooting](DEPLOYMENT_GUIDE.md#troubleshooting) for more.

---

## 📚 Resources

| Type | Link |
|------|------|
| 📖 Quick Start | [QUICKSTART.md](QUICKSTART.md) |
| 📚 Full Guide | [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) |
| ⚙️ Advanced Config | [CONFIG_EXAMPLES.md](CONFIG_EXAMPLES.md) |
| 📋 Summary | [DOCKER_SETUP_SUMMARY.txt](DOCKER_SETUP_SUMMARY.txt) |
| 🛠️ Scripts Ref | [scripts/README.md](scripts/README.md) |

---

## 🎯 Getting Started

1. **Read** [QUICKSTART.md](QUICKSTART.md) (5 min)
2. **Make scripts executable**: `chmod +x scripts/*.sh`
3. **Deploy**: `./scripts/deploy-vds.sh deploy@your-vds-ip ~/gameserver`
4. **Setup HTTPS**: `./scripts/setup-ssl.sh deploy@your-vds-ip your-domain.com admin@example.com`
5. **Manage**: `./scripts/manage-vds.sh deploy@your-vds-ip status`

**Ready?** Start with [QUICKSTART.md](QUICKSTART.md) now! 🚀

---

## 📞 Support

- 🚀 Deployment issues? → [DEPLOYMENT_GUIDE.md#troubleshooting](DEPLOYMENT_GUIDE.md#troubleshooting)
- ⚙️ Configuration help? → [CONFIG_EXAMPLES.md](CONFIG_EXAMPLES.md)
- 🛠️ Script help? → [scripts/README.md](scripts/README.md)
- 📚 Full overview? → [DOCKER_SETUP_SUMMARY.txt](DOCKER_SETUP_SUMMARY.txt)

---

**Created**: 2025-11-13  
**Technologies**: Docker, Docker Compose, .NET 8, Node.js 20, nginx, Let's Encrypt  
**Status**: ✅ Ready for deployment

