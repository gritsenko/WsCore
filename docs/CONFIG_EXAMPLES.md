# Configuration Examples - WsCore Room-Based System

## Environment Configuration Examples

### .env.vds (For VDS Deployment)

Copy this to your VDS `~/gameserver/.env` if you need environment-specific config:

```bash
# VDS Deployment Environment Variables

# Domain Configuration
DOMAIN=msk.gritsenko.biz
EMAIL=admin@example.com

# Server Configuration
ASPNETCORE_ENVIRONMENT=Production
ASPNETCORE_URLS=http://+:80

# Logging
LOG_LEVEL=Information

# Game Configuration with Room System
GAME_TICK_RATE=30
GAME_MAX_PLAYERS=100
GAME_PORT=5000

# Room System Configuration
ROOM_MAX_CLIENTS=50
ROOM_SPATIAL_RANGE_2D=500
ROOM_SPATIAL_RANGE_3D=500
ROOM_AUTO_JOIN_LOBBY=true

# MemoryPack Protocol
MEMORYPACK_TYPE_GENERATION=true
```

### docker-compose.override.yml (Local Development)

Create this file locally for development without SSL:

```yaml
version: "3.8"

services:
  game-server:
    environment:
      - ASPNETCORE_ENVIRONMENT=Development
      - ROOM_DEBUG_LOGGING=true

  certbot:
    profiles:
      - disabled
```

Usage:
```bash
# Uses both docker-compose.yml and docker-compose.override.yml
docker-compose up -d
```

## Room System Configuration

### Default Room Setup

The server automatically creates these persistent rooms:

```csharp
// Room configurations (GameServer.cs)
_roomManager.CreateRoom(
    "lobby", 
    "Lobby", 
    new[] { CommunicationMode.TextChat }, 
    isPersistent: true);

_roomManager.CreateRoom(
    "voice", 
    "Voice Room", 
    new[] { CommunicationMode.VoiceChat, CommunicationMode.TextChat }, 
    isPersistent: true);

_roomManager.CreateRoom(
    "2d-game", 
    "2D Game Room", 
    new[] { CommunicationMode.Spatial2D, CommunicationMode.TextChat }, 
    isPersistent: true);

_roomManager.CreateRoom(
    "3d-game", 
    "3D Game Room", 
    new[] { CommunicationMode.Spatial3D, CommunicationMode.TextChat }, 
    isPersistent: true);
```

### Custom Room Configuration

For custom rooms, update `GameServer.InitializeDefaultRooms()`:

```csharp
// Custom room with specific communication modes
_roomManager.CreateRoom(
    "custom-spatial", 
    "Custom Spatial Room", 
    new[] { CommunicationMode.Spatial2D, CommunicationMode.Spatial3D, CommunicationMode.TextChat }, 
    isPersistent: true);
```

### Room-Based Environment Variables

Add to your `.env` file for room system tuning:

```bash
# Room System Settings
ROOM_CLEANUP_INTERVAL=300  # 5 minutes
ROOM_MAX_INACTIVE_TIME=1800  # 30 minutes
ROOM_ENABLE_SPATIAL_FILTERING=true
ROOM_SPATIAL_UPDATE_RATE=10  # Hz for spatial updates

# Communication Mode Settings
TEXT_CHAT_ENABLED=true
VOICE_CHAT_ENABLED=false  # Future feature
SPATIAL_2D_ENABLED=true
SPATIAL_3D_ENABLED=true
```

## nginx.conf Variations

### Local Development (HTTP only)
Already configured in `nginx.conf` - just use as-is for local testing.

### Production with Self-Signed Certificate
If you can't use Let's Encrypt:

```nginx
server {
    listen 443 ssl;
    server_name msk.gritsenko.biz;

    ssl_certificate /etc/nginx/ssl/server.crt;
    ssl_certificate_key /etc/nginx/ssl/server.key;

    location / {
        proxy_pass http://game-server;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
    
    # WebSocket support for room system
    location /ws {
        proxy_pass http://game-server;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

Generate self-signed cert:
```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
# Copy to VDS ./ssl/ directory
```

### WebSocket Configuration for Room System

Enhanced nginx configuration for optimal room performance:

```nginx
upstream game_backend {
    server game-server:80;
}

# Room-aware WebSocket configuration
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80;
    server_name your-domain.com;
    
    # Enable WebSocket upgrades
    location /ws {
        proxy_pass http://game_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $connection_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        
        # Room system optimizations
        proxy_buffering off;
        proxy_cache off;
    }
    
    # Static files for client
    location / {
        proxy_pass http://game_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Caching for client assets
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## Scaling Configuration

### For Heavy Load with Room System

Update `docker-compose.yml` for room-aware scaling:

```yaml
version: "3.8"

services:
  game-server-1:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      - ASPNETCORE_ENVIRONMENT=Production
      - SERVER_INSTANCE=1
      - ROOM_HASH_RING_POSITION=1  # For consistent room hashing
    expose:
      - "80"
    networks:
      - game-network

  game-server-2:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      - ASPNETCORE_ENVIRONMENT=Production
      - SERVER_INSTANCE=2
      - ROOM_HASH_RING_POSITION=2  # For consistent room hashing
    expose:
      - "80"
    networks:
      - game-network

  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx-lb.conf:/etc/nginx/nginx.conf:ro
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - game-server-1
      - game-server-2
    networks:
      - game-network

networks:
  game-network:
    driver: bridge
```

With `nginx-lb.conf` for room-aware load balancing:

```nginx
# Room-aware load balancing with sticky sessions
upstream game_backend {
    ip_hash;  # Ensure same client hits same server (room consistency)
    least_conn;
    server game-server-1:80;
    server game-server-2:80;
}

server {
    listen 80;
    
    location / {
        proxy_pass http://game_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        
        # Room system optimizations
        proxy_buffering off;
        proxy_cache off;
    }
    
    location /ws {
        proxy_pass http://game_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

## Resource Limits with Room System

Add to `docker-compose.yml` for room-optimized resource allocation:

```yaml
game-server:
  deploy:
    resources:
      limits:
        cpus: '2'
        memory: 2G
      reservations:
        cpus: '1'
        memory: 1G
    # Room system specific limits
    labels:
      - "room.max-clients=100"
      - "room.max-rooms=20"

nginx:
  deploy:
    resources:
      limits:
        cpus: '0.5'
        memory: 512M
      reservations:
        cpus: '0.25'
        memory: 256M
    # WebSocket connection limits
    labels:
      - "nginx.max-connections=1000"
      - "nginx.websocket-timeout=86400"
```

## Monitoring & Logging for Room System

### Enhanced ELK Stack Configuration

Add to `docker-compose.yml` for room-aware logging:

```yaml
elasticsearch:
  image: docker.elastic.co/elasticsearch/elasticsearch:8.0.0
  environment:
    - discovery.type=single-node
    - "ES_JAVA_OPTS=-Xms1g -Xmx1g"

kibana:
  image: docker.elastic.co/kibana/kibana:8.0.0
  ports:
    - "5601:5601"
  environment:
    - ELASTICSEARCH_HOSTS=http://elasticsearch:9200

logstash:
  image: docker.elastic.co/logstash/logstash:8.0.0
  volumes:
    - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf
    - ./room-patterns.json:/usr/share/logstash/patterns/room-patterns.json

# Room system monitoring
grafana:
  image: grafana/grafana
  ports:
    - "3000:3000"
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=admin
  volumes:
    - ./grafana-dashboards:/var/lib/grafana/dashboards
    - ./grafana-datasources:/etc/grafana/provisioning/datasources
```

Room-aware logstash configuration (`logstash.conf`):

```ruby
input {
  tcp {
    port => 5000
    codec => json
  }
}

filter {
  # Room system specific parsing
  if [message] =~ /RoomManager/ {
    grok {
      match => { "message" => "Room %{WORD:room_action}: %{WORD:room_id}" }
    }
  }
  
  if [message] =~ /SpatialUpdate/ {
    grok {
      match => { "message" => "Room %{WORD:room_id} - Spatial update for client %{NUMBER:client_id}" }
    }
  }
  
  # Add room context
  if [room_id] {
    mutate {
      add_field => { "room_context" => "room-%{room_id}" }
    }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "wscore-logs-%{+YYYY.MM.dd}"
  }
}
```

### Room System Prometheus Metrics

Add to `docker-compose.yml`:

```yaml
prometheus:
  image: prom/prometheus
  volumes:
    - ./prometheus.yml:/etc/prometheus/prometheus.yml
    - ./room-metrics.yml:/etc/prometheus/room-metrics.yml
  ports:
    - "9090:9090"

grafana:
  image: grafana/grafana
  ports:
    - "3000:3000"
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=admin
  volumes:
    - ./grafana-dashboards:/var/lib/grafana/dashboards
```

Prometheus configuration (`prometheus.yml`):

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'wscore-room-system'
    static_configs:
      - targets: ['game-server:80']
    metrics_path: '/metrics'
    scrape_interval: 10s
    
  - job_name: 'nginx-websocket'
    static_configs:
      - targets: ['nginx:80']
    metrics_path: '/nginx_status'
    scrape_interval: 30s
```

## Room System Development Configuration

### Development Environment Variables

```bash
# Room system development settings
ROOM_DEBUG_LOGGING=true
ROOM_VERBOSE_SPATIAL_FILTERING=true
ROOM_ENABLE_TEST_ROOMS=true
ROOM_SIMULATE_LATENCY=false
ROOM_TEST_CLIENT_COUNT=5

# MemoryPack development
MEMORYPACK_DEBUG_SERIALIZATION=true
MEMORYPACK_GENERATE_EXTRA_TYPES=true

# WebSocket development
WS_DEBUG_MESSAGES=true
WS_SHOW_RAW_DATA=false  # Set to true for binary data debugging
```

### Testing Room System

Test script for room functionality:

```bash
#!/bin/bash
# test-room-system.sh

echo "Testing Room System..."

# Test WebSocket connection
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: test" \
  -H "Sec-WebSocket-Version: 13" \
  http://localhost:5000/ws

# Test room endpoints
curl http://localhost:5000/rooms
curl http://localhost:5000/rooms/lobby/stats
curl http://localhost:5000/rooms/2d-game/stats

echo "Room system test complete"
```

## VDS SSH Config

Add to your local `~/.ssh/config`:

```
Host wscore-vds
    HostName msk.gritsenko.biz
    User deploy
    IdentityFile ~/.ssh/id_rsa
    StrictHostKeyChecking accept-new
    UserKnownHostsFile ~/.ssh/known_hosts
    
    # Room system monitoring
    LocalForward 3000 localhost:3000  # Grafana
    LocalForward 9090 localhost:9090  # Prometheus
    LocalForward 5601 localhost:5601  # Kibana
```

Usage:
```bash
ssh wscore-vds
# Instead of: ssh deploy@msk.gritsenko.biz

# Access monitoring dashboards
open http://localhost:3000  # Grafana
open http://localhost:9090  # Prometheus
open http://localhost:5601  # Kibana
```

## Room System Health Checks

### Application Health Check

Add to `docker-compose.yml`:

```yaml
services:
  game-server:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:80/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

Health check endpoint (add to `Program.cs`):

```csharp
app.MapGet("/health", () => new
{
    Status = "healthy",
    Timestamp = DateTime.UtcNow,
    RoomStats = new
    {
        TotalRooms = _roomManager.GetAllRooms().Count(),
        ActiveConnections = _connectionManager.Connections.Count()
    }
});
```

## Room System Performance Tuning

### Server-Side Optimizations

```csharp
// In GameServer constructor or configuration
services.Configure<RoomOptions>(options =>
{
    options.MaxClientsPerRoom = 50;
    options.SpatialUpdateRate = 30; // Hz
    options.RoomCleanupInterval = TimeSpan.FromMinutes(5);
    options.EnableSpatialCaching = true;
    options.MaxSpatialRange2D = 500f;
    options.MaxSpatialRange3D = 500f;
});
```

### Client-Side Optimizations

```typescript
// Room client configuration
const roomConfig = {
  spatialUpdateRate: 30,  // Hz
  maxPredictionTicks: 60,
  interpolationDelay: 100,  // ms
  enableSpatialCulling: true,
  spatialCullingDistance: 500
};
```

---

These configuration examples are optimized for the WsCore room-based architecture with support for multiple communication modes and spatial filtering.
