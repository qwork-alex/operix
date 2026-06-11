# Deploy do dominio `operix-pro.com`

## Estado validado

Nesta maquina:

- `nginx` do host esta instalado e ativo
- a aplicacao responde em `http://127.0.0.1:8080`
- a API responde em `http://127.0.0.1:4000`
- `operix-pro.com` e `www.operix-pro.com` resolvem para `72.62.27.129`
- `certbot` ainda nao esta instalado

## Bloqueio atual

O usuario atual nao possui permissao de escrita em `/etc/nginx` e tambem nao
tem `sudo` sem senha. Por isso a configuracao do Nginx e a emissao do
certificado precisam ser aplicadas por um usuario com privilegios de root.

## Arquivo de site pronto

Arquivo preparado no projeto:

- `deploy/nginx/operix-pro.com.conf`

Esse arquivo faz:

- proxy de `/` para `127.0.0.1:8080`
- proxy de `/api/` para `127.0.0.1:4000/api/`
- suporte a `operix-pro.com` e `www.operix-pro.com`

## Comandos para aplicar no servidor

### 1. Instalar o Certbot

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
```

### 2. Publicar o arquivo do site

```bash
sudo cp /home/deploy/apps/nexus/QW-Nexus-/deploy/nginx/operix-pro.com.conf /etc/nginx/sites-available/operix-pro.com.conf
sudo ln -sf /etc/nginx/sites-available/operix-pro.com.conf /etc/nginx/sites-enabled/operix-pro.com.conf
```

### 3. Desabilitar o site default, se necessario

```bash
sudo rm -f /etc/nginx/sites-enabled/default
```

### 4. Testar e recarregar o Nginx

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 5. Emitir o certificado

Substitua o email abaixo pelo email correto de notificacao/renovacao:

```bash
sudo certbot --nginx -d operix-pro.com -d www.operix-pro.com -m qwork@qworkgroup.com --agree-tos --no-eff-email --redirect
```

### 6. Validar renovacao automatica

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

## Ajustes recomendados na aplicacao

Para o frontend usar o dominio publico corretamente, o ideal e que o build use:

```env
VITE_API_URL=https://operix-pro.com/api
CORS_ORIGIN=https://operix-pro.com
```

Depois disso:

```bash
cd /home/deploy/apps/nexus/QW-Nexus-
docker compose build api frontend
docker compose up -d api frontend
```

## Validacoes finais

Depois da aplicacao do Nginx e do Certbot, validar:

```bash
curl -I http://operix-pro.com
curl -I https://operix-pro.com
curl -I https://operix-pro.com/api/health
```

Resultados esperados:

- `http` redirecionando para `https`
- frontend abrindo em `https://operix-pro.com`
- API respondendo em `https://operix-pro.com/api/health`
