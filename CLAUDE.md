# CLAUDE.md — nocturne-api

Contexto para Claude Code (u otros asistentes) trabajando en este repo.

## Qué es esto

Backend de Nocturne, panel de gestión y reventa de cuentas/perfiles de
streaming, reemplazando una plantilla de Excel. Ver `PROGRESS.md` para el
roadmap completo y el estado actual de cada fase.

## Stack

- NestJS 12 (Express, ESM/NodeNext, TypeScript)
- TypeORM + PostgreSQL
- Auth JWT (Passport) con rol `admin` (estructura lista para más roles)
- Vitest (tests) + oxlint (lint)
- Docker Compose para Postgres local
- CI: GitHub Actions (lint + build + tests en cada push/PR a `main`)
- Deploy: Railway (auto-deploy en merge a `main`, ver README para el setup)

## Estructura de carpetas

```
src/
  auth/       # Login JWT, guards (JwtAuthGuard, RolesGuard), decorators
  users/      # Entidad User, UsersService (rol admin por ahora)
  config/     # Configuración tipada y validación de env vars (Joi)
  app.module.ts
  main.ts     # prefijo /api, CORS, ValidationPipe global
  seed.ts     # crea/actualiza el usuario admin desde ADMIN_EMAIL/ADMIN_PASSWORD
test/         # e2e (requieren Postgres corriendo)
```

Los imports relativos usan extensión `.js` (NodeNext ESM) aunque los
archivos sean `.ts` — es el patrón que genera `nest new` en esta versión y
debe mantenerse en todo archivo nuevo.

## Convenciones de este repo

- **Autoría de commits**: únicamente `jjtorres-dev` /
  `jjtorres.devtech@gmail.com`. No agregar `Co-Authored-By` ni ningún footer
  de Claude/asistente en los commits de este repo.
- **Merges**: siempre `--ff-only`. No merge commits, no squash automático
  sin avisar.
- **No commitear sin correr localmente primero**: antes de todo commit,
  correr `npm run lint`, `npm run build` y `npm test` (y `npm run test:e2e`
  si el cambio toca DB/auth) y confirmar que pasan.
- **Secrets de deploy**: cualquier token de Railway (o de cualquier otro
  servicio) va como GitHub Secret del repositorio. Nunca hardcodeado en
  código, `.env` commiteado, ni en workflows de Actions en texto plano.
- **`PROGRESS.md`**: se actualiza únicamente al **cerrar** una tarea/fase,
  no durante el desarrollo. No hacer commits intermedios que solo tocan
  `PROGRESS.md` a medias.

## Reglas de negocio a tener en cuenta (fases futuras)

- Fase 2 (Cuentas + Perfiles) requiere cifrado AES de credenciales en
  reposo — no guardar contraseñas de cuentas de streaming en texto plano.
- El rol único hoy es `admin`; el modelo de roles (`UserRole`, `@Roles()`,
  `RolesGuard`) ya está pensado para extenderse sin refactor grande.
