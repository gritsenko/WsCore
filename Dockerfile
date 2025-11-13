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

# Copy solution and main projects (skip benchmarks)
COPY WsServer/WsServer.sln ./
COPY WsServer/WsServer ./WsServer
COPY WsServer/Game ./Game
COPY WsServer/WsServer.Shared ./WsServer.Shared
COPY WsServer/WsServer.DataBuffer ./WsServer.DataBuffer

# Restore and build in Release mode (only main projects)
RUN dotnet restore WsServer/WsServer.csproj
RUN dotnet publish WsServer/WsServer.csproj -c Release -o /app/publish --no-restore

# Runtime stage: Create final image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime

WORKDIR /app

# Copy published server from builder
COPY --from=server-builder /app/publish ./

# Copy built client assets
COPY --from=client-builder /app/client/dist ./wwwroot

# Create non-root user for security (use UID 1001 to avoid conflicts)
RUN useradd -m -u 1001 gameserver && \
    chown -R gameserver:gameserver /app
USER gameserver

# Expose ports
EXPOSE 80 443

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

# Start the server
ENTRYPOINT ["dotnet", "WsServer.dll"]
