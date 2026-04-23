#!/bin/bash
# Gera secrets fortes p/ producao e grava em /home/root/secrets/production.env.
# Rode UMA vez ao provisionar o servidor. Nao versione este output.
set -e

JWT_SECRET=$(openssl rand -hex 32)
WA_TOKEN=$(openssl rand -hex 24)
ADMIN_PASS=$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)

OUT_DIR=${OUT_DIR:-/home/root/secrets}
mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"

cat > "$OUT_DIR/production.env" <<EOF
# ==== SECRETS DE PRODUCAO - gerados em $(date -Iseconds) ====
# NAO COMMITAR. NAO COMPARTILHAR.
JWT_SECRET=$JWT_SECRET
WHATSAPP_SERVICE_TOKEN=$WA_TOKEN
INTERNAL_TOKEN=$WA_TOKEN
ADMIN_EMAIL=adminpalmilha
ADMIN_PASSWORD=$ADMIN_PASS
EOF

chmod 600 "$OUT_DIR/production.env"
echo "=== GERADO ==="
echo "JWT_SECRET=$JWT_SECRET"
echo "WA_TOKEN=$WA_TOKEN"
echo "ADMIN_PASS=$ADMIN_PASS"
echo ""
echo "Salvo em: $OUT_DIR/production.env"
echo ""
echo "Agora:"
echo "  1. copie os valores para backend/.env  (JWT_SECRET, WHATSAPP_SERVICE_TOKEN, ADMIN_*)"
echo "  2. copie INTERNAL_TOKEN para whatsapp-service/.env"
echo "  3. rode: pm2 restart axiom-backend --update-env"
echo "  4. rode: pm2 restart axiom-whatsapp --update-env"
echo "  5. rode: /home/root/venv/bin/python scripts/reset_admin.py"
