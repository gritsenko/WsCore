# WsCore Docker Build Script - PowerShell Version

Write-Host "=== WsCore Docker Build Script ===" -ForegroundColor Yellow

# Check if Docker is installed
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Docker is not installed" -ForegroundColor Red
    exit 1
}

# Get image name and tag from arguments or use defaults
$IMAGE_NAME = if ($args.Count -gt 0) { $args[0] } else { "wscore-game-server" }
$IMAGE_TAG = if ($args.Count -gt 1) { $args[1] } else { "latest" }
$FULL_IMAGE = "$IMAGE_NAME`:$IMAGE_TAG"

Write-Host "Building Docker image: $FULL_IMAGE" -ForegroundColor Yellow

# Build the image
docker build `
    --tag "$FULL_IMAGE" `
    --file Dockerfile `
    --progress=plain `
    .

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Docker image built successfully: $FULL_IMAGE" -ForegroundColor Green
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Test locally: docker-compose up"
    Write-Host "  2. Push to registry: docker push $FULL_IMAGE"
    Write-Host "  3. On VDS: docker pull $FULL_IMAGE; docker-compose pull; docker-compose up -d"
} else {
    Write-Host "[FAIL] Build failed" -ForegroundColor Red
    exit 1
}
