# Nocturne API

Backend de **Nocturne**, panel de gestión y reventa de cuentas/perfiles de
streaming (Netflix, Disney, Crunchyroll, etc). Reemplaza una plantilla de
Excel usada previamente para llevar el negocio.

## Stack

- [NestJS](https://nestjs.com/) 12 (Express, ESM/NodeNext)
- [TypeORM](https://typeorm.io/) + PostgreSQL
- Auth con JWT (Passport)
- Vitest para tests, oxlint para lint
- Docker Compose para Postgres local

## Requisitos

- Node.js 22+
- Docker (para levantar Postgres local)

## Puesta en marcha local

1. Copia el archivo de variables de entorno:

   ```bash
   cp .env.example .env
   ```

   Genera `ENCRYPTION_KEY` (se usa para cifrar en reposo las credenciales
   de Cuentas/Perfiles con AES-256-GCM) y pegala en `.env`:

   ```bash
   openssl rand -hex 32
   ```

   Si esta clave se pierde o se cambia, las credenciales ya guardadas
   quedan indescifrables — no hay forma de recuperarlas sin la clave
   original. En producción (Railway) va como variable de entorno del
   servicio, igual que el resto.

2. Levanta Postgres local con Docker Compose:

   ```bash
   docker compose up -d
   ```

3. Instala dependencias (el proyecto requiere `--legacy-peer-deps` por un
   conflicto de peer dependencies entre `vitest` y sus plugins):

   ```bash
   npm install --legacy-peer-deps
   ```

4. Crea el usuario admin inicial usando `ADMIN_EMAIL` / `ADMIN_PASSWORD`
   definidos en tu `.env`:

   ```bash
   npm run seed
   ```

5. Arranca el servidor en modo desarrollo:

   ```bash
   npm run start:dev
   ```

   La API queda disponible en `http://localhost:3000/api`.

6. Prueba el login:

   ```bash
   curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@nocturne.local","password":"tu-password"}'
   ```

   Con el `accessToken` de la respuesta puedes llamar a la ruta protegida:

   ```bash
   curl http://localhost:3000/api/auth/profile \
     -H "Authorization: Bearer <accessToken>"
   ```

## Scripts

| Script              | Descripción                                   |
| ------------------- | ---------------------------------------------- |
| `npm run start:dev` | Levanta la API en modo watch                   |
| `npm run build`     | Compila a `dist/`                              |
| `npm run lint`      | Lint con oxlint                                |
| `npm test`          | Tests unitarios (vitest)                       |
| `npm run test:e2e`  | Tests end-to-end (requiere Postgres corriendo) |
| `npm run seed`      | Crea/actualiza el usuario admin inicial        |

## Estructura de carpetas

```
src/
  auth/           # Login JWT, guards, decorators, estrategia passport
  users/          # Entidad de usuario y servicio (rol admin por ahora)
  config/         # Configuración y validación de variables de entorno
  app.module.ts   # Módulo raíz (TypeORM, Config, Users, Auth)
  main.ts         # Bootstrap (prefijo /api, CORS, ValidationPipe)
  seed.ts         # Script para crear el usuario admin inicial
test/             # Tests e2e
```

## Roles

Por ahora solo existe el rol `admin` (`UserRole.ADMIN`), pero la estructura
(`@Roles()`, `RolesGuard`, columna `role` en la entidad `User`) está lista
para agregar más roles en fases futuras sin cambios estructurales.

## CI/CD

### GitHub Actions

En cada push/PR a `main`, `.github/workflows/ci.yml` corre:

1. Instalación de dependencias
2. Lint (oxlint)
3. Build
4. Tests unitarios
5. Tests e2e contra un Postgres de servicio

### Railway (auto-deploy en merge a `main`)

El backend está desplegado en producción en Railway:
`https://nocturne-api-production-cb15.up.railway.app`.

**El frontend (`nocturne-web`) vive en el mismo proyecto de Railway**, como
un servicio separado — no en Vercel como se había planeado originalmente.
Ver el README de `nocturne-web` para el detalle de ese servicio (incluye la
variable `RAILPACK_SPA_OUTPUT_DIR`, necesaria para que Railway sirva bien
el build estático de Angular).

Setup del servicio de la API:

1. Proyecto en [Railway](https://railway.app/) con un servicio "Deploy from
   GitHub repo" apuntando a este repositorio.
2. Un plugin/servicio de **PostgreSQL** en el mismo proyecto (Railway lo
   provisiona y expone las variables `PGHOST`, `PGPORT`, etc. — mapear estas
   a `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` en las
   variables de entorno del servicio de la API).
3. Variables de entorno del servicio (mismas claves que `.env.example`):
   `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`,
   `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT`.
4. "Auto Deploy" activado en la rama `main` — cada merge a `main` que pase
   CI dispara un nuevo deploy automáticamente.
5. Los tokens/credenciales de Railway (por ejemplo, si se quisiera disparar
   deploys desde GitHub Actions con `RAILWAY_TOKEN`) **nunca se hardcodean**:
   van como GitHub Secrets del repositorio.
