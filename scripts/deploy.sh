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
if [ -z "$1" ]; then
    echo -e "${BLUE}Usage:${NC}"
    echo "  $0 <user@host> [options]"
    echo ""
    echo -e "${BLUE}Examples:${NC}"
    echo "  $0 root@msk.gritsenko.biz"
    echo "  $0 root@example.com --build"
    echo "  $0 root@example.com --build --platform arm64"
    echo ""
    echo -e "${BLUE}Options:${NC}"
    echo "  --build              Build the Docker image before deployment"
    echo "  --platform PLATFORM  Docker platform (amd64 or arm64, default: amd64)"
    echo "  --dir PATH           Deployment directory (default: ~/WsCoreServer)"
    echo "  --image NAME:TAG     Docker image name (default: wscore-game-server:latest)"
    echo ""
    echo -e "${YELLOW}Notes:${NC}"
    echo "  - Domain is automatically extracted from user@host"
    echo "  - If image doesn't exist, you'll be prompted to build it"
    echo "  - SSH key setup: ssh-copy-id -i ~/.ssh/id_rsa root@<your-vds-host>"
    echo ""
    exit 0
fi

VDS_TARGET="$1"
shift

# Extract domain from user@host (everything after @)
DOMAIN="${VDS_TARGET##*@}"

# Default values
DEPLOY_DIR="~/WsCoreServer"
IMAGE_NAME="wscore-game-server:latest"
BUILD_IMAGE=false
PLATFORM="amd64"

# Parse optional arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --build)
            BUILD_IMAGE=true
            shift
            ;;
        --platform)
            PLATFORM="$2"
            shift 2
            ;;
        --dir)
            DEPLOY_DIR="$2"
            shift 2
            ;;
        --image)
            IMAGE_NAME="$2"
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
echo "  Platform: linux/${PLATFORM}"
echo ""

# Step 0: Check if image exists
if ! docker image inspect "${IMAGE_NAME}" > /dev/null 2>&1; then
    echo -e "${YELLOW}Docker image not found: ${IMAGE_NAME}${NC}"
    echo ""
    echo -e "${BLUE}Would you like to build it now?${NC}"
    read -p "Build Docker image? (y/n) " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        BUILD_IMAGE=true
        echo -e "${BLUE}Which platform would you like to build for?${NC}"
        echo "  1. amd64 (Intel/AMD servers - default)"
        echo "  2. arm64 (Raspberry Pi, Apple Silicon)"
        read -p "Choose platform (1 or 2, default 1): " -n 1 -r
        echo ""
        
        if [[ $REPLY == "2" ]]; then
            PLATFORM="arm64"
        fi
    else
        echo -e "${RED}✗ Cannot deploy without image. Please build first:${NC}"
        echo "  ./scripts/build.sh wscore-game-server latest"
        exit 1
    fi
fi

# Step 1 (Optional): Build Docker image if requested
if [ "$BUILD_IMAGE" = true ]; then
    echo -e "${YELLOW}[1/8] Building Docker image for linux/${PLATFORM}...${NC}"
    docker build \
        --tag "${IMAGE_NAME}" \
        --platform "linux/${PLATFORM}" \
        --file Dockerfile \
        --progress=plain \
        .
    echo -e "${GREEN}✓ Docker image built successfully${NC}"
    echo ""
fi

# Verify SSH connectivity
echo -e "${YELLOW}[2/7] Testing SSH connection...${NC}"
if ssh -o ConnectTimeout=5 "${VDS_TARGET}" "echo 'SSH connection OK'" > /dev/null; then
    echo -e "${GREEN}✓ SSH connection successful${NC}"
else
    echo -e "${RED}✗ SSH connection failed. Make sure:${NC}"
    echo "  - SSH key is set up: ssh-copy-id -i ~/.ssh/id_rsa ${VDS_TARGET##*@}"
    echo "  - Server is reachable"
    exit 1
fi
echo ""

# Verify Docker image exists locally
echo -e "${YELLOW}[3/7] Verifying Docker image locally...${NC}"
if ! docker image inspect "${IMAGE_NAME}" > /dev/null 2>&1; then
    echo -e "${RED}✗ Docker image not found: ${IMAGE_NAME}${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Image found: ${IMAGE_NAME}${NC}"
echo ""

# Export image to tar file
echo -e "${YELLOW}[4/7] Exporting Docker image to tar (this may take a minute)...${NC}"
docker save "${IMAGE_NAME}" -o "${IMAGE_TAR}"
IMAGE_SIZE=$(du -h "${IMAGE_TAR}" | cut -f1)
echo -e "${GREEN}✓ Image exported: ${IMAGE_TAR} (${IMAGE_SIZE})${NC}"
echo ""

# Create deploy directory and upload files
echo -e "${YELLOW}[5/7] Creating deploy directory and uploading files...${NC}"
ssh "${VDS_TARGET}" "mkdir -p ${DEPLOY_DIR} && echo 'Directory created'"
scp docker-compose.yml "${VDS_TARGET}:${DEPLOY_DIR}/"
scp nginx.conf "${VDS_TARGET}:${DEPLOY_DIR}/"
echo -e "${GREEN}✓ Configuration files uploaded${NC}"
echo ""

# Transfer image and load it
echo -e "${YELLOW}[6/7] Transferring image to server (this may take several minutes)...${NC}"
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

# Setup directories and start containers
echo -e "${YELLOW}[7/7] Setting up directories and starting containers...${NC}"
ssh "${VDS_TARGET}" "
    cd ${DEPLOY_DIR}
    mkdir -p ssl certbot/conf certbot/www
    echo 'Directories created'
    
    # Create a docker-compose override file to use the image instead of building
    cat > docker-compose.override.yml << 'COMPOSE_EOF'
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

# Setup SSL Certificate
echo -e "${YELLOW}[8/7] Setting up SSL certificate with Let's Encrypt...${NC}"
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
    
    # Update nginx.conf to use actual domain (replace placeholder)
    sed -i 's/DOMAIN_PLACEHOLDER/${DOMAIN}/g' nginx.conf
    
    # Restart nginx container to pick up updated nginx.conf from the volume
    docker compose restart nginx
    
    sleep 2
    echo 'HTTPS configured and nginx restarted'
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
echo "  1. Make changes to code"
echo "  2. Re-run this script: ./scripts/deploy.sh ${VDS_TARGET}"
echo ""
