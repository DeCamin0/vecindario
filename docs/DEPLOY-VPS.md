# Deploy API Vecindario pe VPS

Presupune: DNS `api.vecindario.decaminoservicios.com` → IP VPS; Traefik + container `vecindario-backend-proxy` (nginx) către `host.docker.internal:4001` (vezi conversația de setup).

## 1. Repo Git (local → GitHub/GitLab)

În folderul `vecindario-app`:

```bash
git init
git add -A
git status
```

Verifică că **nu** apare `.env` sau `server/.env`. Apoi:

```bash
git commit -m "Initial Vecindario"
```

Pe hosting Git: creezi repo **nou** (ex. `vecindario`), fără README generat dacă vrei istoric curat.

```bash
git remote add origin https://github.com/ORG/vecindario.git
git branch -M main
git push -u origin main
```

## 2. Pe VPS: clone

```bash
cd /opt
sudo git clone https://github.com/ORG/vecindario.git
sudo chown -R $USER:$USER vecindario
cd vecindario
```

## 3. Env (niciodată în Git)

```bash
cp .env.example .env
nano .env
```

Completează minim: `DATABASE_URL`, `JWT_SECRET`, `PORT=4001`, `CORS_ORIGIN` (URL HTTPS al frontului), opțional `VAPID_*`, SMTP.

## 4. Dependențe și build API

```bash
npm ci
npm ci --prefix server
npm run build --prefix server
```

## 5. Migrări Prisma

```bash
npx prisma migrate deploy
```

## 6. Pornește API (port 4001)

Test rapid (terminal deschis):

```bash
node server/dist/index.js
```

Verificare: `curl -s http://127.0.0.1:4001/health`

### Rămâne pornit după logout (systemd exemplu)

Fișier `/etc/systemd/system/vecindario-api.service`:

```ini
[Unit]
Description=Vecindario API
After=network.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/opt/vecindario
EnvironmentFile=/opt/vecindario/.env
ExecStart=/usr/bin/node server/dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Apoi:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now vecindario-api
sudo systemctl status vecindario-api
```

(Înlocuiește `YOUR_USER` și calea dacă ai alt folder.)

## 7. Front static (separat de API)

Pe mașina de build:

```bash
export VITE_VECINDARIO_API_URL=https://api.vecindario.decaminoservicios.com
npm ci
npm run build
```

Urcă conținutul din `dist/` pe hosting static (sau alt Nginx) cu `base` `/vecindario/` cum e configurat în Vite.

## 8. Verificare finală

- `https://api.vecindario.decaminoservicios.com/health`
- Front: login / apeluri API fără CORS errors (CORS_ORIGIN corect pe API).
