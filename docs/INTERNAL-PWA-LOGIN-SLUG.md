# Intern: `lastLoginSlug`, bootstrap web și deschidere nativă

Document scurt pentru mentenanță. Publicul țintă: echipa care lucrează la Vecindario web/PWA.

## Separare clară

| Zonă | Rol | Fișiere cheie |
|------|-----|----------------|
| **Bootstrap web / PWA** | Intrare `start_url` → `/app`, rutare SPA (autentificat → `/`, neautentificat → `/c/{slug}/login` sau `/login`). **Nu** deschide app-ul nativ. | `src/bootstrap/AppBootstrap.jsx`, `readLaunchContext.js`, `resolveInitialRoute.js`, `vite.config.js` (`start_url: /app`) |
| **Deschidere nativă** | Link „Abrir en la app”: intent HTTPS / `vecindario://`, slug explicit sau din storage pe path-uri generice. **Nu** amestecat cu `AppBootstrap`. | `src/utils/resolveNativeOpenHref.js`, `src/utils/nativeAppOpen.js` |
| **Login web** | Rute `/login`, `/c/:loginSlug/login`; redirect centralizat. | `src/utils/signInWebPath.js` (`getSignInPath`) |

## `lastLoginSlug` (storage)

- **Cheie**: `vecindario-last-login-slug` (vezi `LAST_LOGIN_SLUG_STORAGE_KEY` în `src/utils/lastLoginSlug.js`).
- **Izolare tab** (impersonare): același model ca tokenul — `sessionStorage` când `vecindario_tab_isolated`, altfel `localStorage`.
- **Curățare la logout de context comunitate**: `setCommunity(null)` → `clearLastLoginSlug()` (în `AuthContext.setCommunity`).
- **Curățare la rol global**: `super_admin` / `company_admin` după `login` / `me` → `clearLastLoginSlug()` (în `AuthContext`).

## Surse care alimentează slug-ul (în practică)

1. **URL** — `/c/{slug}/login`; la validare API, `setCommunity(..., { loginSlug: data.loginSlug ?? routeSlug })`.
2. **Backend** — `community.loginSlug` în `POST /api/auth/login` și `GET /api/auth/me` → `syncLoginSlugFromServerCommunity` + `communityFromLogin` în `applyServerSession`.
3. **UI comunitate activă** — `ManagedCommunitySwitcher` și fallback `managedCommunities[0]` → `setCommunity(..., { loginSlug })`.
4. **VEC** — `GET /api/public/community-by-code` returnează `loginSlug` → `setCommunity` la verificare cod.

## PWA vs browser

- **PWA instalată** pornește de regulă la `/app` (manifest).
- **Browser** poate intra direct pe orice rută; nu e obligatoriu să treacă prin `/app`.

## Testare manuală (reminder)

- iPhone: Safari → Add to Home Screen; Android: Chrome → Install / Add to Home screen.
- Verifică: cold start neautentificat cu/fără slug salvat, autentificat, schimbare comunitate + „Abrir en la app” din `/app`.

## Teste unitare (idee)

Helperi puri ușor de testat: `readLaunchContext`, `resolveInitialRoute`, `resolveSlugForNativeOpen` (intern sau exportat pentru test), `getSignInPath` (mock `localStorage`). Proiectul nu include încă Vitest pentru front; se poate adăuga `vitest` + un fișier `*.test.js` lângă module.

## Legătură

- Instalare PWA generală: `PWA.md` (rădăcină proiect).
