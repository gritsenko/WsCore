#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== WsCore Docker Build Script ===${NC}"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    exit 1
fi

# Get image name and tag from arguments or use defaults
IMAGE_NAME="${1:-wscore-game-server}"
IMAGE_TAG="${2:-latest}"
FULL_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"
PLATFORM="${3:-amd64}"

echo -e "${YELLOW}Building Docker image: ${FULL_IMAGE}${NC}"
echo -e "${YELLOW}Platform: linux/${PLATFORM}${NC}"

# Build the image
docker build \
    --tag "${FULL_IMAGE}" \
    --platform "linux/${PLATFORM}" \
    --file Dockerfile \
    --progress=plain \
    .

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Docker image built successfully: ${FULL_IMAGE}${NC}"
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  1. Test locally: docker-compose up"
    echo "  2. Push to registry: docker push ${FULL_IMAGE}"
    echo "  3. On VDS: docker pull ${FULL_IMAGE} && docker-compose pull && docker-compose up -d"
else
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi
