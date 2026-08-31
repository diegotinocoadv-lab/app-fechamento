# Publicar o Fechamento de Caixa na sua VPN

Guia completo: domínio/IP, portas, Docker, variáveis de ambiente e HTTPS via Nginx.

---

## 1. Pré-requisitos no servidor

```sh
# Docker + Compose
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # relogue depois
docker compose version
```

Copie o código para o servidor (ZIP exportado do Lovable ou `git clone` do seu repositório) em `/opt/fechamento`.

---

## 2. Definir domínio / IP e portas

| Item | Onde configurar | Valor |
|---|---|---|
| Porta interna do app | `Dockerfile` / `.env.production` (`PORT`) | `3000` (não exposta na rede) |
| Portas públicas | `docker-compose.yml` → serviço `nginx` | `80` e `443` |
| Domínio | `deploy/nginx/app.conf` → `server_name` | `SEU_DOMINIO` |

**Com domínio próprio:** crie um registro `A` apontando para o IP do servidor (ou para o IP da VPN, se o acesso é só interno).

**Só IP da VPN (sem domínio):** em `app.conf` use `server_name 10.8.0.5;` (o IP do servidor na VPN) e gere um certificado self-signed:

```sh
mkdir -p deploy/certbot/conf/live/10.8.0.5
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout deploy/certbot/conf/live/10.8.0.5/privkey.pem \
  -out    deploy/certbot/conf/live/10.8.0.5/fullchain.pem \
  -subj "/CN=10.8.0.5"
```

**Expor somente pela VPN** (recomendado): no `docker-compose.yml`, troque as portas do nginx por
`"10.8.0.5:80:80"` e `"10.8.0.5:443:443"` — assim nada escuta na interface pública.

Firewall:

```sh
sudo ufw allow in on wg0 to any port 443 proto tcp   # wg0 = interface da VPN
sudo ufw allow in on wg0 to any port 80 proto tcp
sudo ufw deny 3000                                   # app nunca direto
sudo ufw enable
```

---

## 3. Checklist das variáveis de ambiente

```sh
cp .env.production.example .env.production
nano .env.production
chmod 600 .env.production
```

- [ ] `NODE_ENV=production`
- [ ] `PORT=3000`, `HOST=0.0.0.0`
- [ ] `APP_URL` = `https://SEU_DOMINIO` (ou `https://IP_DA_VPN`)
- [ ] `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` (servidor)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — apenas se precisar de operações administrativas; nunca no cliente
- [ ] `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` — **embutidas no build**, precisam estar preenchidas *antes* de `docker compose build`
- [ ] `EMAIL_TO=diego.tinoco.adv@gmail.com` e `EMAIL_FROM=fechamento@SEU_DOMINIO`
- [ ] SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`) **ou** `LOVABLE_API_KEY`
- [ ] `.env.production` fora do Git (já coberto pelo `.gitignore`)

Validar antes de subir:

```sh
docker compose config   # mostra as variáveis resolvidas
```

---

## 4. Build e subida

```sh
cd /opt/fechamento
set -a && . ./.env.production && set +a   # exporta VITE_* para os build args
docker compose build
docker compose up -d
docker compose logs -f app
```

Teste local no servidor: `curl -I http://127.0.0.1:80` e depois pelo navegador em `https://SEU_DOMINIO`.

---

## 5. HTTPS com Let's Encrypt (se houver domínio público)

```sh
# 1) suba apenas o nginx com a parte HTTP (comente o bloco 443 no app.conf)
docker compose up -d nginx
# 2) emita o certificado
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
  -d SEU_DOMINIO -d www.SEU_DOMINIO --email seu@email.com --agree-tos --no-eff-email
# 3) descomente o bloco 443 e recarregue
docker compose exec nginx nginx -s reload
```

O serviço `certbot` do compose renova automaticamente a cada 12h.

---

## 6. Restringir acesso à VPN

Em `deploy/nginx/app.conf`, dentro do `server` 443, descomente e ajuste:

```nginx
allow 10.8.0.0/24;   # faixa da sua VPN
deny all;
```

---

## 7. Atualizar / manter

```sh
git pull                       # ou substitua os arquivos do ZIP
docker compose build app
docker compose up -d app
docker compose ps              # healthcheck deve ficar "healthy"
docker compose logs --tail=100 app
```

Backup: os fechamentos ficam no banco gerenciado (Lovable Cloud/Supabase). Se migrar para um Postgres próprio na VPN, adicione um serviço `postgres` no compose com volume nomeado e agende `pg_dump` diário.
