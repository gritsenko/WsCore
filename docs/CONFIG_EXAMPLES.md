# Environment Configuration Examples

## .env.vds (For VDS Deployment)

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

# Game Configuration
GAME_TICK_RATE=60
GAME_MAX_PLAYERS=100
GAME_PORT=5000

# Database (if needed later)
# DB_CONNECTION_STRING=Server=db;Database=gamedb;User=sa;Password=YourPassword
```

## docker-compose.override.yml (Local Development)

Create this file locally for development without SSL:

```yaml
version: "3.8"

services:
  game-server:
    environment:
      - ASPNETCORE_ENVIRONMENT=Development

  certbot:
    profiles:
      - disabled
```

Usage:
```bash
# Uses both docker-compose.yml and docker-compose.override.yml
docker-compose up -d
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
}
```

Generate self-signed cert:
```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
# Copy to VDS ./ssl/ directory
```

## Scaling Configuration

### For Heavy Load (Multiple Server Instances)

Update `docker-compose.yml`:

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

With `nginx-lb.conf`:

```nginx
upstream game_backend {
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
    }
}
```

## Resource Limits

Add to `docker-compose.yml` for each service:

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

nginx:
  deploy:
    resources:
      limits:
        cpus: '0.5'
        memory: 512M
      reservations:
        cpus: '0.25'
        memory: 256M
```

## Monitoring & Logging

### Centralized Logging (ELK Stack)

Add to `docker-compose.yml`:

```yaml
elasticsearch:
  image: docker.elastic.co/elasticsearch/elasticsearch:8.0.0
  environment:
    - discovery.type=single-node

kibana:
  image: docker.elastic.co/kibana/kibana:8.0.0
  ports:
    - "5601:5601"

logstash:
  image: docker.elastic.co/logstash/logstash:8.0.0
  volumes:
    - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf
```

### Prometheus Monitoring

Add to `docker-compose.yml`:

```yaml
prometheus:
  image: prom/prometheus
  volumes:
    - ./prometheus.yml:/etc/prometheus/prometheus.yml
  ports:
    - "9090:9090"

grafana:
  image: grafana/grafana
  ports:
    - "3000:3000"
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=admin
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
```

Usage:
```bash
ssh wscore-vds
# Instead of: ssh deploy@msk.gritsenko.biz
```

---

These examples can be customized based on your specific needs!
