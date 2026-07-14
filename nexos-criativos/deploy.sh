#!/bin/bash
# Script de deploy no VPS Hostinger
# Executar como: bash deploy.sh

set -e

APP_DIR="/var/www/nexos-criativos"
REPO="https://github.com/ph185982-crypto/assistente.git"
BRANCH="claude/nexos-criativos-ads-tnlc1t"
DOMAIN="criativos.nexosbrasil.com.br"
NODE_VERSION="22"

echo "==> Nexos Criativos — Deploy"

# 1. Dependências do sistema
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx

# 2. Node.js via nvm (se não instalado)
if ! command -v node &> /dev/null; then
  curl -fsSL https://fnm.vercel.app/install | bash
  source ~/.bashrc
  fnm use --install-if-missing $NODE_VERSION
fi

# 3. PM2
npm install -g pm2 2>/dev/null || true

# 4. Clonar / atualizar repositório
if [ -d "$APP_DIR" ]; then
  cd "$APP_DIR"
  git fetch origin
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi

cd "$APP_DIR/nexos-criativos"

# 5. Criar .env se não existir
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "ATENÇÃO: Configure as variáveis em $APP_DIR/nexos-criativos/.env antes de continuar!"
  echo "  DATABASE_URL, GEMINI_API_KEY, OPENAI_API_KEY, STORAGE_PATH, TEAM_PASSWORD"
  read -p "Pressione Enter após configurar o .env..."
fi

# 6. Storage dir
mkdir -p "$(grep STORAGE_PATH .env | cut -d= -f2)/uploads"

# 7. Instalar deps e build
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build

# 8. Seed (apenas se tabela clientes vazia)
npx prisma db seed 2>/dev/null || echo "Seed já executado ou falhou (ignorando)"

# 9. PM2
cat > "$APP_DIR/ecosystem.config.js" << 'EOF'
module.exports = {
  apps: [{
    name: 'nexos-criativos',
    cwd: '/var/www/nexos-criativos/nexos-criativos',
    script: 'node_modules/.bin/next',
    args: 'start -p 3001',
    env_file: '.env',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
  }]
}
EOF

pm2 stop nexos-criativos 2>/dev/null || true
pm2 start "$APP_DIR/ecosystem.config.js"
pm2 save
pm2 startup 2>/dev/null || true

# 10. Nginx
cat > "/etc/nginx/sites-available/nexos-criativos" << EOF
server {
    listen 80;
    server_name $DOMAIN;

    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
    }
}
EOF

ln -sf /etc/nginx/sites-available/nexos-criativos /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

# 11. SSL
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m admin@nexosbrasil.com.br 2>/dev/null || \
  echo "SSL: configure manualmente ou já está ativo"

echo ""
echo "==> Deploy concluído!"
echo "    App: https://$DOMAIN"
echo "    PM2: pm2 logs nexos-criativos"
