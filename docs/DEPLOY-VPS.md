# Deploy API Vecindario pe VPS

Presupune: DNS `api.vecindario.decaminoservicios.com` → IP VPS; Traefik + container `vecindario-backend-proxy` (nginx) către `host.docker.internal:4001` (vezi conversația de setup).

## 1. Repo Git (local → GitHub/GitLab)

În folderul `vecindario-app`:

Repo-ul poate fi deja inițializat local. Înainte de primul push:

```bash
git status
```

Verifică că **nu** apare `.env` sau `server/.env` în fișiere urmărite.

Pe GitHub/GitLab: creezi repo **nou** gol (ex. `vecindario`).

```bash
git remote add origin https://github.com/ORG/vecindario.git
git branch -M main
git push -u origin main
```

(Dacă nu ai setat încă identitatea Git: `git config user.name "..."` și `git config user.email "..."` — local sau `--global`.)

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

Urcă conținutul din `dist/` în **rădăcina** document root al vhost-ului (ex. `vecindario.decaminoservicios.com`), la fel ca DeCamino: Vite folosește `base: '/'`.

## 8. Verificare finală

- `https://api.vecindario.decaminoservicios.com/health`
- Front: login / apeluri API fără CORS errors (CORS_ORIGIN corect pe API).

## 9. App Links (Android) și Universal Links (iOS) — deschidere app din browser

Fără pașii de mai jos, site-ul **nu** poate deschide automat app-ul: trebuie același **domeniu** verificat și amprente de semnare corecte.

### Fișiere pe hosting (rădăcina frontului, lângă `index.html`)

După `npm run build`, în `dist/` există deja:

- `dist/.well-known/assetlinks.json` → trebuie servit la `https://DOMEINUL-TĂU/.well-known/assetlinks.json`
- `dist/.well-known/apple-app-site-association` → `https://DOMEINUL-TĂU/.well-known/apple-app-site-association` (fără extensie `.json`, `Content-Type` tipic `application/json`)

Multe servere servesc corect dacă urci tot `dist/` inclusiv folderul ascuns `.well-known`.

### `assetlinks.json` — amprente SHA-256

1. Înlocuiește placeholder-ele din `public/.well-known/assetlinks.json` **înainte de build** (sau editează direct în `dist/` după build).
2. Poți lista **mai multe** amprente în același array (ex.: cheie **debug** pentru APK de probă + cheie **Play App Signing** pentru release din magazin).
3. **Debug (APK local):** din keystore-ul debug Android Studio:
   - `keytool -list -v -keystore "%USERPROFILE%\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android`
   - Caută **SHA256** — copiază fără spații sau cu `:` în formatul acceptat de Google (64 hex fără `:` e uzual).
4. **Play Store:** Play Console → aplicația ta → **App integrity** / **App signing** → **App signing key certificate** → SHA-256.

`package_name` trebuie să rămână `com.decamino.vecindario` (ca în app).

### iOS — `apple-app-site-association`

- Înlocuiește `APPLE_TEAM_ID` cu Team ID-ul real din Apple Developer (10 caractere).
- `bundle` în app: `com.decamino.vecindario` (deja în `vecindario-mobile`).

### App mobilă — același host

La build nativ, setează `EXPO_PUBLIC_UNIVERSAL_LINK_HOSTS=domeniul.tău` (fără `https://`, poți lista mai multe separate prin virgulă). Apoi **prebuild + rebuild** APK/AAB.

### Verificare

- Google: [Statement List Generator / Digital Asset Links](https://developers.google.com/digital-asset-links/tools/generator) pentru domeniul tău.
- După instalare, pe Android: **Setări → Aplicații → Deschidere implicită** pentru Vecindario și link-uri verificate.

Pe web, butonul **„Abrir en la app”** folosește intent Android + schema `vecindario://` pe iOS; totuși **verificarea domeniului** rămâne obligatorie pentru comportamentul „ca la aplicațiile mari”.
