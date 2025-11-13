#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== WsCore Deployment Script ===${NC}"
echo -e "${BLUE}Deploy Docker image directly to any server (root or non-root user)${NC}"
echo ""

# Check arguments
if [ -z "$1" ]; then
    echo -e "${BLUE}Usage:${NC}"
    echo "  $0 <user@host> [deploy-dir] [image-name:tag]"
    echo ""
    echo -e "${BLUE}Examples:${NC}"
    echo "  $0 root@msk.gritsenko.biz"
    echo "  $0 root@msk.gritsenko.biz ~/WsCoreServer"
    echo "  $0 root@msk.gritsenko.biz ~/WsCoreServer wscore-game-server:latest"
    echo "  $0 deploy@msk.gritsenko.biz ~/gameserver"
    echo ""
    echo -e "${YELLOW}Setup SSH key authentication (optional but recommended):${NC}"
    echo "  ssh-copy-id -i ~/.ssh/id_rsa root@msk.gritsenko.biz"
    echo ""
    echo -e "${YELLOW}For root-only deployments, create a non-root user later for regular management.${NC}"
    exit 0
fi

VDS_TARGET="$1"
DEPLOY_DIR="${2:-~/WsCoreServer}"
IMAGE_NAME="${3:-wscore-game-server:latest}"
IMAGE_TAR="wscore-game-server-latest.tar"

echo -e "${YELLOW}Deployment Configuration:${NC}"
echo "  VDS Target: ${VDS_TARGET}"
echo "  Deploy Dir: ${DEPLOY_DIR}"
echo "  Docker Image: ${IMAGE_NAME}"
echo ""

# Step 1: Verify SSH connectivity
echo -e "${YELLOW}[1/6] Testing SSH connection...${NC}"
if ssh -o ConnectTimeout=5 "${VDS_TARGET}" "echo 'SSH connection OK'" > /dev/null; then
    echo -e "${GREEN}✓ SSH connection successful${NC}"
else
    echo -e "${RED}✗ SSH connection failed. Make sure:${NC}"
    echo "  - SSH key is set up: ssh-copy-id -i ~/.ssh/id_rsa root@${VDS_TARGET##*@}"
    echo "  - Server is reachable"
    exit 1
fi
echo ""

# Step 2: Verify Docker image exists locally
echo -e "${YELLOW}[2/6] Verifying Docker image locally...${NC}"
if ! docker image inspect "${IMAGE_NAME}" > /dev/null 2>&1; then
    echo -e "${RED}✗ Docker image not found: ${IMAGE_NAME}${NC}"
    echo -e "${YELLOW}Build it first with: ./scripts/build.sh wscore-game-server latest${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Image found: ${IMAGE_NAME}${NC}"
echo ""

# Step 3: Export image to tar file
echo -e "${YELLOW}[3/6] Exporting Docker image to tar (this may take a minute)...${NC}"
docker save "${IMAGE_NAME}" -o "${IMAGE_TAR}"
IMAGE_SIZE=$(du -h "${IMAGE_TAR}" | cut -f1)
echo -e "${GREEN}✓ Image exported: ${IMAGE_TAR} (${IMAGE_SIZE})${NC}"
echo ""

# Step 4: Create deploy directory and upload files
echo -e "${YELLOW}[4/6] Creating deploy directory and uploading files...${NC}"
ssh "${VDS_TARGET}" "mkdir -p ${DEPLOY_DIR} && echo 'Directory created'"
scp docker-compose.yml "${VDS_TARGET}:${DEPLOY_DIR}/"
scp nginx.conf "${VDS_TARGET}:${DEPLOY_DIR}/"
echo -e "${GREEN}✓ Configuration files uploaded${NC}"
echo ""

# Step 5: Transfer image and load it
echo -e "${YELLOW}[5/6] Transferring image to server (this may take several minutes)...${NC}"
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

# Step 6: Create necessary directories and start containers
echo -e "${YELLOW}[6/6] Setting up directories and starting containers...${NC}"
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
    
    docker compose ps
"
echo ""
echo -e "${GREEN}✓ Deployment completed!${NC}"
echo ""

# Cleanup local tar file
rm -f "${IMAGE_TAR}"
echo -e "${YELLOW}Local tar file cleaned up${NC}"
echo ""

echo -e "${YELLOW}Next steps:${NC}"
echo "  1. SSH into server: ssh root@${VDS_TARGET##*@}"
echo "  2. Check status: cd ${DEPLOY_DIR} && docker compose ps"
echo "  3. View logs: docker compose logs -f game-server"
echo "  4. Restart services: docker compose restart"
echo ""
echo -e "${YELLOW}For HTTPS with Let's Encrypt:${NC}"
echo "  1. Edit nginx.conf - uncomment HTTPS sections and set domain"
echo "  2. Run: ssh root@${VDS_TARGET##*@} 'cd ${DEPLOY_DIR} && docker compose exec certbot certbot certonly --webroot -w /var/www/certbot -d yourdomain.com'"
echo "  3. Restart: docker compose restart nginx"
echo ""
echo -e "${YELLOW}To update the app later:${NC}"
echo "  1. Build new image: ./scripts/build.sh wscore-game-server latest"
echo "  2. Re-run this script: ./scripts/deploy-root.sh root@msk.gritsenko.biz ~/WsCoreServer"
echo ""
