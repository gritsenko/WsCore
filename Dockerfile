# Build stage 1: Build the client (Vite + Node)
FROM node:24-alpine AS client-builder

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
# Copy only the project file first and restore, so the NuGet restore layer stays cached
# until the csproj (package references) changes rather than on every source edit.
COPY WsServer/WsServer/WsServer.csproj ./WsServer/
RUN dotnet restore WsServer/WsServer.csproj

# Then the sources, and publish in Release mode. No --no-restore: .dockerignore's `obj/`
# only matches the context root, so a host-side WsServer/WsServer/obj can be copied over
# the restore output; publish's implicit restore is a no-op when the assets are current
# and otherwise re-resolves from the NuGet cache filled by the layer above.
COPY WsServer/WsServer ./WsServer
RUN dotnet publish WsServer/WsServer.csproj -c Release -o /app/publish

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

# The chat history / known-users database (GameServer:ChatDatabasePath = data/chat.db,
# relative to /app) and the uploaded game builds (GameServer:GamesDataPath = data/games)
# are the only things the server writes. Give the non-root user that one directory and
# make it a volume so they survive container re-creation (mount a named volume or a host
# directory there — see docker-compose.yml).
RUN mkdir -p /app/data && chown $APP_UID /app/data
VOLUME /app/data

# Run as the non-root `app` user built into the .NET images (UID in $APP_UID, 1654).
# Copied files are root-owned but world-readable, which is all the server needs: apart
# from /app/data it doesn't write under /app. Binding :80 as non-root works because Docker sets
# net.ipv4.ip_unprivileged_port_start=0 in the container (it already ran as UID 1001).
USER $APP_UID

# Expose port (the app listens on :80; TLS/443 is terminated by the nginx sidecar)
EXPOSE 80

# Health check (app listens on :80 via ASPNETCORE_URLS set in docker-compose)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:80/health || exit 1

# Start the server
ENTRYPOINT ["dotnet", "WsServer.dll"]
