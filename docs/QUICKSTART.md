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
./scripts/deploy-vds.sh deploy@msk.gritsenko.biz ~/gameserver
```

### 3️⃣ Verify & Setup HTTPS
```bash
# Check it's running
./scripts/manage-vds.sh deploy@msk.gritsenko.biz status

# Setup SSL with Let's Encrypt (replace with your domain and email)
./scripts/setup-ssl.sh deploy@msk.gritsenko.biz msk.gritsenko.biz admin@example.com

# Test HTTPS
curl -I https://msk.gritsenko.biz
```

**Done! 🎉 Your game server is now live!**

---

## 📁 What Was Created

```
WsCore/
├── Dockerfile                 # Builds client + server in one image
├── docker-compose.yml         # Runs game-server, nginx, certbot
├── nginx.conf                 # Reverse proxy with WebSocket support
├── .dockerignore              # Build optimization
├── DEPLOYMENT_GUIDE.md        # Full deployment guide (this directory)
└── scripts/
    ├── build.sh              # Build Docker image locally
    ├── push.sh               # Push to Docker Hub/GHCR
    ├── deploy-vds.sh         # Deploy to remote VDS (main script!)
    ├── manage-vds.sh         # Manage running services
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
./scripts/deploy-vds.sh deploy@your-vds-ip ~/gameserver
```

### Check Status
```bash
./scripts/manage-vds.sh deploy@your-vds-ip status
```

### View Logs
```bash
./scripts/manage-vds.sh deploy@your-vds-ip logs
```

### Setup HTTPS
```bash
./scripts/setup-ssl.sh deploy@your-vds-ip your-domain.com admin@email.com
```

---

## ⚠️ Known Fixes Applied

✅ **Vite Output Path**: Changed from `../dist` to `./dist` to output in correct location  
✅ **.NET 10 Support**: Upgraded Docker SDK to 10.0 (was 9.0)  
✅ **Non-root User**: Using UID 1001 to avoid conflicts with base image  
✅ **Server Restore**: Restoring specific project instead of solution (avoids BenchmarkSuite1 error)

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

### Restart Services
```bash
./scripts/manage-vds.sh deploy@your-vds-ip restart
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
./scripts/setup-ssl.sh deploy@vds msk.gritsenko.biz admin@example.com
```

---

## 🐛 Troubleshooting

**Containers not starting?**
```bash
./scripts/manage-vds.sh deploy@your-vds-ip logs
```

**Check if ports are available:**
```bash
ssh deploy@your-vds-ip 'sudo netstat -tlnp | grep 80'
```

**Rebuild from scratch:**
```bash
ssh deploy@your-vds-ip 'cd ~/gameserver && docker compose down -v && docker compose up -d'
```

---

## 📖 Full Guide

See `DEPLOYMENT_GUIDE.md` for:
- Detailed architecture
- Backup strategies
- CI/CD integration
- Performance tuning
- Security hardening
- Multiple server scaling

---

## 🎯 Next Steps

1. ✅ Review the files created above
2. ✅ Replace `deploy@msk.gritsenko.biz` with your actual VDS credentials
3. ✅ Run `./scripts/deploy-vds.sh ...` to deploy
4. ✅ Run `./scripts/setup-ssl.sh ...` for HTTPS
5. ✅ Use `./scripts/manage-vds.sh ...` to manage

**Questions?** Check `scripts/README.md` for detailed script documentation.
