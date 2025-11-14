# WsCore Production Deployment Script - PowerShell Version

$ErrorActionPreference = "Stop"

Write-Host "=== WsCore Production Deployment Script ===" -ForegroundColor Yellow
Write-Host "Automated deployment with Docker image transfer and SSL setup" -ForegroundColor Cyan
Write-Host ""

# Check arguments
if ($args.Count -eq 0) {
    Write-Host "Usage:" -ForegroundColor Cyan
    Write-Host "  .\deploy.ps1 <user@host> [options]"
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Cyan
    Write-Host "  .\deploy.ps1 root@msk.gritsenko.biz"
    Write-Host "  .\deploy.ps1 root@example.com -Build"
    Write-Host "  .\deploy.ps1 root@example.com -Build -Platform arm64"
    Write-Host ""
    Write-Host "Options:" -ForegroundColor Cyan
    Write-Host "  -Build              Build the Docker image before deployment"
    Write-Host "  -Platform PLATFORM  Docker platform (amd64 or arm64, default: amd64)"
    Write-Host "  -Dir PATH           Deployment directory (default: ~/WsCoreServer)"
    Write-Host "  -Image NAME:TAG     Docker image name (default: wscore-game-server:latest)"
    Write-Host ""
    Write-Host "Notes:" -ForegroundColor Yellow
    Write-Host "  - Domain is automatically extracted from user@host"
    Write-Host "  - If image doesn't exist, you'll be prompted to build it"
    Write-Host "  - SSH key setup: ssh-copy-id -i ~/.ssh/id_rsa root@<your-vds-host>"
    Write-Host ""
    exit 0
}

$VDS_TARGET = $args[0]

# Extract domain from user@host (everything after @)
$DOMAIN = $VDS_TARGET -split "@" | Select-Object -Last 1

# Default values
$DEPLOY_DIR = "~/WsCoreServer"
$IMAGE_NAME = "wscore-game-server:latest"
$BUILD_IMAGE = $false
$PLATFORM = "amd64"

# Parse optional arguments
$argIndex = 1
while ($argIndex -lt $args.Count) {
    $arg = $args[$argIndex].ToLower()
    
    switch ($arg) {
        "-build" {
            $BUILD_IMAGE = $true
            $argIndex++
        }
        "-platform" {
            $PLATFORM = $args[$argIndex + 1]
            $argIndex += 2
        }
        "-dir" {
            $DEPLOY_DIR = $args[$argIndex + 1]
            $argIndex += 2
        }
        "-image" {
            $IMAGE_NAME = $args[$argIndex + 1]
            $argIndex += 2
        }
        default {
            Write-Host "Unknown option: $arg" -ForegroundColor Red
            exit 1
        }
    }
}

$IMAGE_TAR = "wscore-game-server-latest.tar"
$EMAIL = "admin@${DOMAIN}"

Write-Host "Deployment Configuration:" -ForegroundColor Yellow
Write-Host "  VDS Target: ${VDS_TARGET}"
Write-Host "  Domain: ${DOMAIN}"
Write-Host "  Deploy Dir: ${DEPLOY_DIR}"
Write-Host "  Docker Image: ${IMAGE_NAME}"
Write-Host "  Email: ${EMAIL}"
Write-Host "  Platform: linux/${PLATFORM}"
Write-Host ""

# Step 0: Check if image exists
$imageExists = docker image inspect "$IMAGE_NAME" 2>$null
if (-not $imageExists) {
    Write-Host "Docker image not found: ${IMAGE_NAME}" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Would you like to build it now?" -ForegroundColor Cyan
    $response = Read-Host "Build Docker image? (y/n)"
    Write-Host ""
    
    if ($response -eq "y" -or $response -eq "Y") {
        $BUILD_IMAGE = $true
        Write-Host "Which platform would you like to build for?" -ForegroundColor Cyan
        Write-Host "  1. amd64 (Intel/AMD servers - default)"
        Write-Host "  2. arm64 (Raspberry Pi, Apple Silicon)"
        $platformChoice = Read-Host "Choose platform (1 or 2, default 1)"
        Write-Host ""
        
        if ($platformChoice -eq "2") {
            $PLATFORM = "arm64"
        }
    } else {
        Write-Host "[FAIL] Cannot deploy without image. Please build first:" -ForegroundColor Red
        Write-Host "  .\scripts\build.ps1 wscore-game-server latest"
        exit 1
    }
}

# Step 1 (Optional): Build Docker image if requested
if ($BUILD_IMAGE) {
    Write-Host "[1/8] Building Docker image for linux/${PLATFORM}..." -ForegroundColor Yellow
    docker build `
        --tag "$IMAGE_NAME" `
        --platform "linux/$PLATFORM" `
        --file Dockerfile `
        --progress=plain `
        .
    Write-Host "[OK] Docker image built successfully" -ForegroundColor Green
    Write-Host ""
}

# Verify SSH connectivity
Write-Host "[2/7] Testing SSH connection..." -ForegroundColor Yellow
try {
    ssh -o ConnectTimeout=5 "$VDS_TARGET" "echo 'SSH connection OK'" | Out-Null
    Write-Host "[OK] SSH connection successful" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] SSH connection failed. Make sure:" -ForegroundColor Red
    Write-Host "  - SSH key is set up: ssh-copy-id -i ~/.ssh/id_rsa $($VDS_TARGET -split "@" | Select-Object -Last 1)"
    Write-Host "  - Server is reachable"
    exit 1
}
Write-Host ""

# Verify Docker image exists locally
Write-Host "[3/7] Verifying Docker image locally..." -ForegroundColor Yellow
$imageExists = docker image inspect "$IMAGE_NAME" 2>$null
if (-not $imageExists) {
    Write-Host "[FAIL] Docker image not found: ${IMAGE_NAME}" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Image found: ${IMAGE_NAME}" -ForegroundColor Green
Write-Host ""

# Export image to tar file
Write-Host "[4/7] Exporting Docker image to tar (this may take a minute)..." -ForegroundColor Yellow
docker save "$IMAGE_NAME" -o "$IMAGE_TAR"
$imageSize = (Get-Item "$IMAGE_TAR").Length / 1MB
Write-Host "[OK] Image exported: ${IMAGE_TAR} (~${imageSize:F2}MB)" -ForegroundColor Green
Write-Host ""

# Create deploy directory and upload files
Write-Host "[5/7] Creating deploy directory and uploading files..." -ForegroundColor Yellow
ssh "$VDS_TARGET" "mkdir -p ${DEPLOY_DIR} && echo 'Directory created'"
scp docker-compose.yml "${VDS_TARGET}:${DEPLOY_DIR}/"
scp nginx.conf "${VDS_TARGET}:${DEPLOY_DIR}/"
Write-Host "[OK] Configuration files uploaded" -ForegroundColor Green
Write-Host ""

# Transfer image and load it
Write-Host "[6/7] Transferring image to server (this may take several minutes)..." -ForegroundColor Yellow
scp "$IMAGE_TAR" "${VDS_TARGET}:${DEPLOY_DIR}/"
Write-Host "[OK] Image transferred" -ForegroundColor Green

Write-Host "Loading image on server..." -ForegroundColor Yellow
$remoteCommands = @"
cd ${DEPLOY_DIR}
echo 'Loading Docker image...'
docker load -i ${IMAGE_TAR}
rm -f ${IMAGE_TAR}
echo 'Image loaded and tar file removed'
"@
ssh "$VDS_TARGET" $remoteCommands
Write-Host "[OK] Image loaded on server" -ForegroundColor Green
Write-Host ""

# Setup directories and start containers
Write-Host "[7/7] Setting up directories and starting containers..." -ForegroundColor Yellow
$setupCommands = @"
cd ${DEPLOY_DIR}
mkdir -p ssl certbot/conf certbot/www
echo 'Directories created'

docker compose up -d
echo 'Containers started'

sleep 3

docker compose ps
"@
ssh "$VDS_TARGET" $setupCommands
Write-Host "[OK] Containers started" -ForegroundColor Green
Write-Host ""

# Setup SSL Certificate
Write-Host "[8/7] Setting up SSL certificate with Let's Encrypt..." -ForegroundColor Yellow
$sslCommands = @"
cd ${DEPLOY_DIR}

echo 'Requesting SSL certificate from Let's Encrypt...'
if docker compose exec -T certbot certbot certonly \
    --webroot \
    -w /var/www/certbot \
    -d ${DOMAIN} \
    --non-interactive \
    --agree-tos \
    --email ${EMAIL} \
    --quiet 2>/dev/null; then
    echo 'Let'\''s Encrypt certificate acquired successfully'
else
    echo 'Let'\''s Encrypt certificate request failed, creating self-signed certificate...'
    mkdir -p ./certbot/conf/live/${DOMAIN}
    cd ./certbot/conf/live/${DOMAIN}
    openssl req -x509 -newkey rsa:4096 -keyout privkey.pem -out fullchain.pem -days 365 -nodes -subj "/CN=${DOMAIN}" 2>/dev/null || true
    cd -
fi

echo 'SSL certificate ready'

sed -i 's/DOMAIN_PLACEHOLDER/${DOMAIN}/g' nginx.conf

docker compose restart nginx

sleep 2
echo 'HTTPS configured and nginx restarted'
"@
ssh "$VDS_TARGET" $sslCommands
Write-Host ""
Write-Host "[OK] SSL certificate setup completed!" -ForegroundColor Green
Write-Host ""

# Cleanup local tar file
Remove-Item -Force "$IMAGE_TAR" -ErrorAction SilentlyContinue
Write-Host "Local tar file cleaned up" -ForegroundColor Yellow
Write-Host ""

Write-Host "=== Deployment Complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Your app is now available at:" -ForegroundColor Yellow
Write-Host "  Web: https://${DOMAIN}"
Write-Host "  HTTP redirects to HTTPS automatically"
Write-Host ""
Write-Host "Management commands:" -ForegroundColor Yellow
Write-Host "  Check status:   ssh ${VDS_TARGET} 'cd ${DEPLOY_DIR}; docker compose ps'"
Write-Host "  View logs:      ssh ${VDS_TARGET} 'cd ${DEPLOY_DIR}; docker compose logs -f game-server'"
Write-Host "  Restart app:    ssh ${VDS_TARGET} 'cd ${DEPLOY_DIR}; docker compose restart'"
Write-Host "  View nginx logs: ssh ${VDS_TARGET} 'cd ${DEPLOY_DIR}; docker compose logs -f nginx'"
Write-Host ""
Write-Host "To update the app later:" -ForegroundColor Yellow
Write-Host "  1. Make changes to code"
Write-Host "  2. Re-run this script: .\deploy.ps1 ${VDS_TARGET}"
Write-Host ""
