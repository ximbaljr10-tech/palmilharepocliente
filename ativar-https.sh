#!/bin/bash
# ============================================================
# Dente de Tubarao - Ativar HTTPS (SSL/TLS)
# ============================================================
# Execute este script DEPOIS de apontar o DNS no Registro.br
# Uso: bash /home/root/webapp/ativar-https.sh
# ============================================================

DOMAIN="dentedetubarao.com.br"
WWW_DOMAIN="www.dentedetubarao.com.br"
EMAIL="kaykep7@gmail.com"

echo "=== Ativando HTTPS para $DOMAIN e $WWW_DOMAIN ==="
echo ""

# Verificar se o DNS ja esta apontando
echo "1. Verificando DNS..."
IP_DOMAIN=$(dig +short $DOMAIN A 2>/dev/null | head -1)
IP_WWW=$(dig +short $WWW_DOMAIN A 2>/dev/null | head -1)
MY_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

echo "   IP do servidor: $MY_IP"
echo "   IP de $DOMAIN: $IP_DOMAIN"
echo "   IP de $WWW_DOMAIN: $IP_WWW"

if [ "$IP_DOMAIN" != "$MY_IP" ] && [ "$IP_WWW" != "$MY_IP" ]; then
    echo ""
    echo "   ERRO: DNS ainda nao esta apontando para este servidor!"
    echo "   Configure o DNS no Registro.br primeiro."
    echo "   Aponte $DOMAIN e $WWW_DOMAIN para $MY_IP"
    exit 1
fi

echo "   DNS OK!"
echo ""

# Gerar certificado
echo "2. Gerando certificado SSL..."
certbot --nginx -d $DOMAIN -d $WWW_DOMAIN --non-interactive --agree-tos -m $EMAIL --redirect

if [ $? -ne 0 ]; then
    echo "   ERRO ao gerar certificado. Tentando apenas com o dominio disponivel..."
    if [ "$IP_DOMAIN" = "$MY_IP" ]; then
        certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL --redirect
    elif [ "$IP_WWW" = "$MY_IP" ]; then
        certbot --nginx -d $WWW_DOMAIN --non-interactive --agree-tos -m $EMAIL --redirect
    fi
fi

echo ""

# Atualizar Medusa para HTTPS
echo "3. Atualizando configuracao do Medusa para HTTPS..."
cd /home/root/medusa-backend

# Update .env CORS settings
sed -i "s|http://dentedetubarao.com.br|https://dentedetubarao.com.br|g" .env
sed -i "s|http://www.dentedetubarao.com.br|https://www.dentedetubarao.com.br|g" .env
sed -i "s|MEDUSA_BACKEND_URL=http://|MEDUSA_BACKEND_URL=https://|g" .env

# Restart Medusa
pm2 restart medusa
echo "   Medusa reiniciado com HTTPS."
echo ""

# Verificar renovacao automatica
echo "4. Verificando renovacao automatica..."
certbot renew --dry-run 2>&1 | tail -3
echo ""

# Adicionar HSTS apos SSL funcionar
echo "5. Adicionando HSTS header..."
if ! grep -q "Strict-Transport-Security" /etc/nginx/sites-enabled/dentedetubarao; then
    sed -i '/X-Frame-Options/a\    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;' /etc/nginx/sites-enabled/dentedetubarao
    nginx -t && nginx -s reload
    echo "   HSTS ativado."
else
    echo "   HSTS ja estava ativo."
fi

echo ""
echo "=== HTTPS ATIVADO COM SUCESSO! ==="
echo "   https://$WWW_DOMAIN"
echo "   https://$DOMAIN"
echo ""
echo "O certificado sera renovado automaticamente pelo certbot."
