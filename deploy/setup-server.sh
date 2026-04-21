#!/bin/bash
# ============================================================
# setup-server.sh — Instala el bot CURP en Ubuntu 22.04
# Ejecutar como: bash setup-server.sh
# ============================================================
set -e

echo "========================================"
echo "  SETUP BOT CURP — Oracle Cloud Ubuntu"
echo "========================================"

# ── 1. Actualizar sistema ─────────────────────────────────
echo "[1/8] Actualizando sistema..."
sudo apt-get update -qq && sudo apt-get upgrade -y -qq

# ── 2. Instalar Node.js 20 LTS ───────────────────────────
echo "[2/8] Instalando Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# ── 3. Instalar Chromium y dependencias de Puppeteer ─────
echo "[3/8] Instalando Chromium + dependencias..."
sudo apt-get install -y \
  chromium-browser \
  libgbm1 \
  libxshmfence1 \
  libgconf-2-4 \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libpango-1.0-0 \
  libcairo2 \
  libasound2 \
  fonts-liberation \
  xdg-utils

# ── 4. Instalar PM2 ──────────────────────────────────────
echo "[4/8] Instalando PM2..."
sudo npm install -g pm2

# ── 5. Clonar repositorio ────────────────────────────────
echo "[5/8] Clonando repositorio..."
cd /home/ubuntu
if [ -d "consultoria" ]; then
  echo "  → Directorio ya existe, haciendo git pull..."
  cd consultoria && git pull
else
  git clone https://github.com/ecabllerocode2/consultoria.git
  cd consultoria
fi

# ── 6. Instalar dependencias del bot ─────────────────────
echo "[6/8] Instalando dependencias del bot..."
cd /home/ubuntu/consultoria/bot
npm install

# ── 7. Configurar PM2 ────────────────────────────────────
echo "[7/8] Configurando PM2..."
cd /home/ubuntu/consultoria/bot

# Usar chromium del sistema en vez del que descarga Puppeteer
export PUPPETEER_SKIP_DOWNLOAD=true

pm2 delete curp-bot 2>/dev/null || true
pm2 start src/index.js \
  --name curp-bot \
  --interpreter node \
  --restart-delay 5000 \
  --max-restarts 10 \
  --env production

# Guardar config de PM2 y activar inicio automático
pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu | tail -1 | sudo bash

# ── 8. Firewall Oracle: abrir puerto 443 si existe regla ─
echo "[8/8] Verificando firewall UFW..."
sudo ufw allow OpenSSH 2>/dev/null || true
sudo ufw --force enable 2>/dev/null || true

echo ""
echo "========================================"
echo "  ✅ INSTALACIÓN COMPLETA"
echo "========================================"
echo ""
echo "Comandos útiles:"
echo "  pm2 logs curp-bot        → Ver logs en tiempo real"
echo "  pm2 status               → Estado del proceso"
echo "  pm2 restart curp-bot     → Reiniciar bot"
echo ""
echo "IMPORTANTE: Configura las variables de entorno en:"
echo "  /home/ubuntu/consultoria/bot/.env"
echo ""
