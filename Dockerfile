# Build stage 1: Build the client (Vite + Node)
FROM node:20-alpine AS client-builder

WORKDIR /app/client

# Copy client source
COPY WsCore.Client/package*.json ./
RUN npm ci

COPY WsCore.Client/src ./src
COPY WsCore.Client/public ./public
COPY WsCore.Client/index.html ./
COPY WsCore.Client/tsconfig.json ./
COPY WsCore.Client/vite.config.ts ./

# Build the client
RUN npm run build

# Build stage 2: Build the server (.NET)
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS server-builder

WORKDIR /app/server

# The server is a single self-contained project (WsServer/WsServer).
# The TestClient and any benchmark projects are intentionally not copied.
COPY WsServer/WsServer ./WsServer

# Restore and publish in Release mode
RUN dotnet restore WsServer/WsServer.csproj
RUN dotnet publish WsServer/WsServer.csproj -c Release -o /app/publish --no-restore

# Runtime stage: Create final image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime

WORKDIR /app

# curl is needed by the HEALTHCHECK below (not present in the aspnet image)
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Copy published server from builder
COPY --from=server-builder /app/publish ./

# Copy built client assets
COPY --from=client-builder /app/client/dist ./wwwroot

# Create non-root user for security (use UID 1001 to avoid conflicts)
RUN useradd -m -u 1001 gameserver && \
    chown -R gameserver:gameserver /app
USER gameserver

# Expose port (the app listens on :80; TLS/443 is terminated by the nginx sidecar)
EXPOSE 80

# Health check (app listens on :80 via ASPNETCORE_URLS set in docker-compose)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:80/health || exit 1

# Start the server
ENTRYPOINT ["dotnet", "WsServer.dll"]
