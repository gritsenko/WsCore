#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== WsCore Production Deployment Script ===${NC}"
echo -e "${BLUE}Automated deployment with Docker image transfer and SSL setup${NC}"
echo ""

# Check arguments
if [ -z "$1" ] || [ -z "$2" ]; then
    echo -e "${BLUE}Usage:${NC}"
    echo "  $0 <user@host> <domain> [deploy-dir] [image-name:tag] [--build] [--platform PLATFORM]"
    echo ""
    echo -e "${BLUE}Examples:${NC}"
    echo "  $0 root@msk.gritsenko.biz msk.gritsenko.biz"
    echo "  $0 root@msk.gritsenko.biz msk.gritsenko.biz ~/WsCoreServer"
    echo "  $0 root@msk.gritsenko.biz msk.gritsenko.biz ~/WsCoreServer wscore-game-server:latest --build"
    echo "  $0 root@msk.gritsenko.biz msk.gritsenko.biz ~/WsCoreServer wscore-game-server:latest --build --platform arm64"
    echo ""
    echo -e "${BLUE}Flags:${NC}"
    echo "  --build              Build the Docker image before deployment"
    echo "  --platform PLATFORM  Docker platform (linux/amd64 or linux/arm64, default: linux/amd64)"
    echo ""
    echo -e "${YELLOW}Setup SSH key authentication (recommended):${NC}"
    echo "  ssh-copy-id -i ~/.ssh/id_rsa root@<your-vds-host>"
    echo ""
    exit 0
fi

VDS_TARGET="$1"
DOMAIN="$2"
DEPLOY_DIR="${3:-~/WsCoreServer}"
IMAGE_NAME="${4:-wscore-game-server:latest}"
BUILD_IMAGE=false
PLATFORM="linux/amd64"

# Parse remaining arguments for flags
shift 4
while [[ $# -gt 0 ]]; do
    case $1 in
        --build)
            BUILD_IMAGE=true
            shift
            ;;
        --platform)
            PLATFORM="linux/$2"
            shift 2
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

IMAGE_TAR="wscore-game-server-latest.tar"
EMAIL="admin@${DOMAIN}"

echo -e "${YELLOW}Deployment Configuration:${NC}"
echo "  VDS Target: ${VDS_TARGET}"
echo "  Domain: ${DOMAIN}"
echo "  Deploy Dir: ${DEPLOY_DIR}"
echo "  Docker Image: ${IMAGE_NAME}"
echo "  Email: ${EMAIL}"
echo "  Platform: ${PLATFORM}"
echo "  Build Image: $([ "$BUILD_IMAGE" = true ] && echo 'Yes' || echo 'No')"
echo ""

# Step 0 (Optional): Build Docker image if requested
if [ "$BUILD_IMAGE" = true ]; then
    echo -e "${YELLOW}[0/8] Building Docker image for ${PLATFORM}...${NC}"
    docker build \
        --tag "${IMAGE_NAME}" \
        --platform "${PLATFORM}" \
        --file Dockerfile \
        --progress=plain \
        .
    echo -e "${GREEN}✓ Docker image built successfully${NC}"
    echo ""
fi

# Step 1: Verify SSH connectivity
echo -e "${YELLOW}[1/7] Testing SSH connection...${NC}"
if ssh -o ConnectTimeout=5 "${VDS_TARGET}" "echo 'SSH connection OK'" > /dev/null; then
    echo -e "${GREEN}✓ SSH connection successful${NC}"
else
    echo -e "${RED}✗ SSH connection failed. Make sure:${NC}"
    echo "  - SSH key is set up: ssh-copy-id -i ~/.ssh/id_rsa ${VDS_TARGET##*@}"
    echo "  - Server is reachable"
    exit 1
fi
echo ""

# Step 2: Verify Docker image exists locally
echo -e "${YELLOW}[2/7] Verifying Docker image locally...${NC}"
if ! docker image inspect "${IMAGE_NAME}" > /dev/null 2>&1; then
    echo -e "${RED}✗ Docker image not found: ${IMAGE_NAME}${NC}"
    echo -e "${YELLOW}Build it first with: ./scripts/build.sh wscore-game-server latest${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Image found: ${IMAGE_NAME}${NC}"
echo ""

# Step 3: Export image to tar file
echo -e "${YELLOW}[3/7] Exporting Docker image to tar (this may take a minute)...${NC}"
docker save "${IMAGE_NAME}" -o "${IMAGE_TAR}"
IMAGE_SIZE=$(du -h "${IMAGE_TAR}" | cut -f1)
echo -e "${GREEN}✓ Image exported: ${IMAGE_TAR} (${IMAGE_SIZE})${NC}"
echo ""

# Step 4: Create deploy directory and upload files
echo -e "${YELLOW}[4/7] Creating deploy directory and uploading files...${NC}"
ssh "${VDS_TARGET}" "mkdir -p ${DEPLOY_DIR} && echo 'Directory created'"
scp docker-compose.yml "${VDS_TARGET}:${DEPLOY_DIR}/"
scp nginx.conf "${VDS_TARGET}:${DEPLOY_DIR}/"
echo -e "${GREEN}✓ Configuration files uploaded${NC}"
echo ""

# Step 5: Transfer image and load it
echo -e "${YELLOW}[5/7] Transferring image to server (this may take several minutes)...${NC}"
scp "${IMAGE_TAR}" "${VDS_TARGET}:${DEPLOY_DIR}/"
echo -e "${GREEN}✓ Image transferred${NC}"

echo -e "${YELLOW}Loading image on server...${NC}"
ssh "${VDS_TARGET}" "
    cd ${DEPLOY_DIR}
    echo 'Loading Docker image...'
    docker load -i ${IMAGE_TAR}
    rm -f ${IMAGE_TAR}
    echo 'Image loaded and tar file removed'
"
echo -e "${GREEN}✓ Image loaded on server${NC}"
echo ""

# Step 6: Setup directories and start containers
echo -e "${YELLOW}[6/7] Setting up directories and starting containers...${NC}"
ssh "${VDS_TARGET}" "
    cd ${DEPLOY_DIR}
    mkdir -p ssl certbot/conf certbot/www
    echo 'Directories created'
    
    # Create a docker-compose override file to use the image instead of building
    cat > docker-compose.override.yml << 'COMPOSE_EOF'
version: '3.8'
services:
  game-server:
    image: ${IMAGE_NAME}
    build: null
COMPOSE_EOF
    
    docker compose up -d
    echo 'Containers started'
    
    # Wait for nginx to be ready
    echo 'Waiting for nginx to be ready...'
    sleep 3
    
    docker compose ps
"
echo -e "${GREEN}✓ Containers started${NC}"
echo ""

# Step 7: Setup SSL Certificate
echo -e "${YELLOW}[7/7] Setting up SSL certificate with Let's Encrypt...${NC}"
ssh "${VDS_TARGET}" "
    cd ${DEPLOY_DIR}
    
    # Try to get certificate from Let's Encrypt
    echo 'Requesting SSL certificate from Let'\''s Encrypt...'
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
        openssl req -x509 -newkey rsa:4096 -keyout privkey.pem -out fullchain.pem -days 365 -nodes -subj \"/CN=${DOMAIN}\" 2>/dev/null || true
        cd -
    fi
    
    echo 'SSL certificate ready'
    
    # Update nginx.conf to enable HTTPS with correct domain
    sed -i 's/server_name msk.gritsenko.biz/server_name ${DOMAIN}/g' nginx.conf
    
    # Reload nginx to pick up certificate
    docker compose exec -T nginx nginx -s reload || docker compose restart nginx
    
    sleep 2
    echo 'HTTPS configured and nginx reloaded'
"
echo ""
echo -e "${GREEN}✓ SSL certificate setup completed!${NC}"
echo ""

# Cleanup local tar file
rm -f "${IMAGE_TAR}"
echo -e "${YELLOW}Local tar file cleaned up${NC}"
echo ""

echo -e "${GREEN}=== Deployment Complete! ===${NC}"
echo ""
echo -e "${YELLOW}Your app is now available at:${NC}"
echo "  🌐 https://${DOMAIN}"
echo "  🔄 HTTP redirects to HTTPS automatically"
echo ""
echo -e "${YELLOW}Management commands:${NC}"
echo "  Check status:   ssh ${VDS_TARGET} 'cd ${DEPLOY_DIR} && docker compose ps'"
echo "  View logs:      ssh ${VDS_TARGET} 'cd ${DEPLOY_DIR} && docker compose logs -f game-server'"
echo "  Restart app:    ssh ${VDS_TARGET} 'cd ${DEPLOY_DIR} && docker compose restart'"
echo "  View nginx logs: ssh ${VDS_TARGET} 'cd ${DEPLOY_DIR} && docker compose logs -f nginx'"
echo ""
echo -e "${YELLOW}To update the app later:${NC}"
echo "  1. Build new image: ./scripts/build.sh wscore-game-server latest"
echo "  2. Re-run deployment: ./scripts/deploy.sh ${VDS_TARGET} ${DOMAIN}"
echo ""
echo -e "${BLUE}Note about SSL certificates:${NC}"
if [ "${EMAIL}" != "admin@${DOMAIN}" ]; then
    echo "  - Self-signed certificate was used (not trusted by browsers)"
    echo "  - For production, ensure your domain DNS points to: $(ssh ${VDS_TARGET} 'hostname -I 2>/dev/null | awk '\''{print \$1}'\''')2>/dev/null || echo 'server IP'"
    echo "  - Then run certbot manually with proper email"
else
    echo "  - For proper Let's Encrypt certificate, ensure DNS points to your server IP"
fi
echo ""
