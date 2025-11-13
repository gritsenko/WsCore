# WsCore Docker Deployment Guide

Complete guide for building, deploying, and managing your WsCore game server on a remote VDS.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Your VDS                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────┐    ┌──────────────────────────┐   │
│  │     nginx        │◄──►│    game-server           │   │
│  │  (Reverse Proxy) │    │  (dotnet WsServer +      │   │
│  │                  │    │   built web client)      │   │
│  │ • TLS/SSL        │    │                          │   │
│  │ • Static files   │    │ • WebSocket support      │   │
│  │ • Load balance   │    │ • Game logic             │   │
│  └──────────────────┘    └──────────────────────────┘   │
│         │                                                │
│         └────────────────────────┬────────────────────┘  │
│                                  │                       │
│  ┌──────────────────────────────┴────────────────────┐  │
│  │          certbot (SSL auto-renewal)              │  │
│  │     (Let's Encrypt certificate management)      │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
         ▲
         │ (80, 443)
    ┌────┴─────┐
    │  Internet │
    └──────────┘
```

## Prerequisites

### Local Machine (Mac)
- Docker Desktop installed
- Docker CLI available
- `git` for version control
- SSH key for VDS access

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
./scripts/build.sh wscore-game-server latest

# Expected output:
# ✓ Vite built 56 modules into single 2,071.75 kB HTML file
# ✓ .NET 10 compiled successfully
# ✓ Docker image: ~379 MB
# Build time: ~2-3 minutes on first run (downloads SDKs)
```

This builds a multi-stage Docker image that:
1. **Stage 1**: Node.js 20-alpine → builds TypeScript client with Vite (single index.html)
2. **Stage 2**: .NET 10 SDK → builds server with WsServer, Game, WsServer.Shared projects
3. **Stage 3**: .NET 10 aspnet runtime → combines both into single production image

### Option B: Let docker-compose Build
Docker-compose can also build on first `up`:
```bash
docker-compose up --build
```

### Build Details
- **Client build output**: WsCore.Client/dist/index.html (2,071.75 KB uncompressed, 481.48 KB gzipped)
- **Server projects**: WsServer (main), Game (logic), WsServer.Shared (messaging), WsServer.DataBuffer (skipped in restore)
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

# Cleanup
docker-compose down
```

**Expected**: All 3 containers running (game-server, nginx, certbot), HTTP response from localhost shows HTML client.

You should see:
```
NAME          IMAGE                STATUS
certbot       certbot/certbot      Up
game-server   wscore-game-server   Up (health: starting)
nginx-proxy   nginx:alpine         Up
```

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
./scripts/deploy-vds.sh deploy@your-vds-ip ~/gameserver
```

This script:
1. Creates `~/gameserver` directory
2. Copies `docker-compose.yml` and `nginx.conf`
3. Creates SSL/certbot directories
4. Pulls and starts containers

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

## Step 6: Verify Deployment

```bash
./scripts/manage-vds.sh deploy@your-vds-ip status
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
./scripts/setup-ssl.sh deploy@your-vds-ip msk.gritsenko.biz admin@example.com ~/gameserver
```

This script:
1. Updates `nginx.conf` with your domain
2. Enables HTTP for Let's Encrypt validation
3. Runs certbot to obtain certificate
4. Enables HTTPS in nginx
5. Sets up auto-renewal (certbot service watches for expiration)

### Verify HTTPS

```bash
curl -I https://msk.gritsenko.biz
```

Should show `HTTP/1.1 200 OK` with SSL certificate info.

## Step 8: Ongoing Management

### Check Status
```bash
./scripts/manage-vds.sh deploy@your-vds-ip status
```

### View Logs
```bash
./scripts/manage-vds.sh deploy@your-vds-ip logs
```

### Restart Services
```bash
./scripts/manage-vds.sh deploy@your-vds-ip restart
```

### Update to Latest Image
```bash
./scripts/manage-vds.sh deploy@your-vds-ip update ~/gameserver
```

### SSH into VDS
```bash
./scripts/manage-vds.sh deploy@your-vds-ip shell ~/gameserver
```

## Maintenance Tasks

### Check Certificate Expiration
```bash
ssh deploy@your-vds-ip 'docker compose exec certbot certbot certificates'
```

### View Certificate Renewal Logs
```bash
./scripts/manage-vds.sh deploy@your-vds-ip logs certbot
```

### Restart nginx After Config Change
```bash
ssh deploy@your-vds-ip 'cd ~/gameserver && docker compose restart nginx'
```

### View nginx Error Logs
```bash
ssh deploy@your-vds-ip 'docker logs nginx-proxy'
```

## Troubleshooting

### Containers Not Starting
```bash
./scripts/manage-vds.sh deploy@your-vds-ip logs
```

### SSL Certificate Issues
```bash
ssh deploy@your-vds-ip 'docker compose logs certbot'
```

### Game Server Not Responding
```bash
ssh deploy@your-vds-ip 'docker compose logs game-server'
```

### Port Already in Use
```bash
ssh deploy@your-vds-ip 'sudo lsof -i :80 -i :443'
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

## Backup Strategy

### Backup Configuration Files
```bash
ssh deploy@your-vds-ip 'cd ~/gameserver && tar czf backup-config-$(date +%Y%m%d).tar.gz docker-compose.yml nginx.conf'
```

### Backup SSL Certificates
```bash
ssh deploy@your-vds-ip 'sudo tar czf backup-ssl-$(date +%Y%m%d).tar.gz /etc/letsencrypt'
```

## Scaling

### Multiple Game Server Instances

Update docker-compose.yml:
```yaml
game-server:
  deploy:
    replicas: 3
```

Then use nginx upstream for load balancing:
```nginx
upstream game_backend {
    server game-server:80;
}
```

## File Structure

```
WsCore/
├── Dockerfile                 # Multi-stage build
├── docker-compose.yml         # Service orchestration
├── nginx.conf                 # Reverse proxy config
├── .dockerignore              # Build optimization
├── scripts/
│   ├── build.sh              # Build image locally
│   ├── push.sh               # Push to registry
│   ├── deploy-vds.sh         # Deploy to remote VDS
│   ├── manage-vds.sh         # Manage running services
│   ├── setup-ssl.sh          # Setup Let's Encrypt
│   └── README.md             # Script reference
├── WsCore.Client/            # Web client (TypeScript + Vite)
└── WsServer/                 # .NET game server
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
            docker tag yourusername/wscore:${{ github.sha }} wscore:latest
            docker compose up -d
```

## Support & Debugging

### Build Troubleshooting

**Error: "The current .NET SDK does not support targeting .NET 10.0"**
- ✅ **Fixed**: Dockerfile now uses `.NET 10.0` SDK and runtime (was 9.0)
- Check Dockerfile lines:
  - Line 20: `FROM mcr.microsoft.com/dotnet/sdk:10.0`
  - Line 36: `FROM mcr.microsoft.com/dotnet/aspnet:10.0`

**Error: "UID 1000 is not unique"**
- ✅ **Fixed**: Changed user UID to 1001 (was 1000, conflicts with base image)
- Verify line 47 in Dockerfile: `useradd -m -u 1001 gameserver`

**Error: "project file was not found" (BenchmarkSuite1)**
- ✅ **Fixed**: Restoring specific project instead of solution
- Verify Dockerfile line 33: `RUN dotnet restore WsServer/WsServer.csproj`

**Error: dist folder not found during Docker build**
- ✅ **Fixed**: Vite config outputs to correct path `./dist`
- Check WsCore.Client/vite.config.ts: `outDir: './dist'`

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

**Issue: Game client not loading**
- Verify nginx logs: `docker-compose logs nginx`
- Check static files copied: `docker exec game-server ls /app/wwwroot/`
- Verify Vite built single index.html: `ls -lh WsCore.Client/dist/`

### Getting Help

1. Check script output for error messages
2. View container logs: `docker-compose logs`
3. SSH into VDS and inspect manually
4. Check VDS system logs: `sudo journalctl -xe`

---

**Ready to deploy?** Start with Step 1 and follow in order. Happy gaming!
