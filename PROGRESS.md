# Nocturne — Progreso

Fuente de verdad del roadmap del proyecto. Se actualiza solo al **cerrar**
una tarea o fase, no durante el desarrollo (ver `CLAUDE.md`).

## Fase 0 — Auth + esqueleto + CI/CD + deploy temprano — ✅ completa (2026-09-14)

- [x] Backend: NestJS + TypeORM + PostgreSQL (docker-compose local)
- [x] Backend: Auth JWT (login, guard de rutas protegidas, módulo de
      usuarios con rol admin, estructura lista para más roles)
- [x] Backend: GitHub Actions (lint + build + tests en push/PR a main)
- [x] Backend: Railway conectado al repo, auto-deploy en verde — en
      producción en https://nocturne-api-production-cb15.up.railway.app
- [x] Frontend: Angular + Angular Material, layout de panel admin
      (sidebar + header), login conectado al backend
- [x] Frontend: GitHub Actions (lint + build en push/PR a main)
- [x] Frontend: deploy en producción en verde (terminó siendo Railway, no
      Vercel como se había planeado originalmente — ver nota abajo)
- [x] **Login verificado end-to-end** tanto local (docker-compose +
      `npm run seed`) como en producción (Railway: backend + frontend +
      Postgres)

### Nota — `RAILPACK_SPA_OUTPUT_DIR` para el deploy de nocturne-web en Railway

Railway usa Railpack para detectar y servir la SPA. El build de Angular no
deja los archivos estáticos en la raíz de `dist/`, sino en
`dist/nocturne-web/browser/`, así que Railpack no encontraba el `index.html`
hasta configurar en el servicio de Railway la variable de entorno:

```
RAILPACK_SPA_OUTPUT_DIR=dist/nocturne-web/browser
```

Si se recrea el servicio de Railway del frontend desde cero, hay que volver
a setear esta variable o el deploy sirve una app en blanco / 404 en rutas
que no sean `/`.

## Fase 1 — Catálogo de Servicios + Contactos — ✅ completa (2026-09-14)

- [x] Migraciones de TypeORM configuradas (dejamos `synchronize` atrás para
      cambios de schema, tanto en local como en producción a partir de
      ahora — ver `src/database/`)
- [x] Entidad Servicio (Netflix, Disney, Crunchyroll, etc.) — `tipo`
      (`CON_PERFILES`/`SIN_PERFILES`/`FAMILIAR`/`IPTV`), `duracionMeses`
      (decimal, soporta fracciones como 2.5), `pantallasMax` (nullable),
      `precioBase`, `activo`
- [x] CRUD de Servicios (backend) — listar con filtro por `tipo`/`activo`,
      detalle, crear/editar, soft delete (`activo=false`, sin borrado
      físico) y reactivar (`PATCH /:id/reactivate`), todo solo admin salvo
      lectura
- [x] CRUD de Servicios (UI) — listado (`mat-table`) con filtros de tipo y
      estado, formulario en modal (crear/editar), desactivar/reactivar con
      confirmación + snackbar
- [x] Entidad Contacto (clientes/proveedores/revendedores) — `whatsapp`,
      `tipo` (`CLIENTE_FINAL`/`PROVEEDOR`/`REVENDEDOR`), `activo`
- [x] CRUD de Contactos (backend) — mismo patrón que Servicios, incluye
      reactivar
- [x] CRUD de Contactos (UI) — mismo patrón que Servicios
- [x] Migración inicial (`InitialSchema`) generada, revisada a mano (solo
      crea `services`/`contacts` y sus enums, no toca `users`) y corrida
      contra Postgres local **y contra producción en Railway**
- [x] **Verificado end-to-end** en local (docker-compose + `npm run
      start:dev` + `ng serve`) y en producción (Railway): login, crear,
      listar, filtrar, editar, desactivar y reactivar en ambos módulos

### Nota — fix de UI: WhatsApp con label superpuesto al placeholder

En `contacto-form-dialog`, el input de `whatsapp` tenía `placeholder`
además de `mat-label`, lo que le rompía el floating label (quedaba
superpuesto con el texto de ejemplo) a diferencia del resto de los campos.
Se corrigió moviendo el texto de ejemplo a `mat-hint` en vez de
`placeholder`. Si se agrega un campo nuevo con formato de ejemplo (acá o en
Cuentas/Ventas más adelante), usar `mat-hint`, no `placeholder` +
`mat-label` juntos.

### Nota — bug encontrado y corregido: PATCH devolvía campos pisados

`ServicesService.update`/`ContactsService.update` hacían
`Object.assign(entity, dto)` antes de guardar. El `dto` que arma el
`ValidationPipe` (con `transform: true`) es una instancia de la clase DTO,
y por `useDefineForClassFields` (default de TS con target ES2022+) esa
instancia tiene **todas** las propiedades declaradas como propias, en
`undefined` las que no vinieron en el body. `Object.assign` pisaba con esos
`undefined` los valores ya cargados en memoria — la fila en la base de
datos quedaba bien (TypeORM ignora columnas `undefined` al armar el
`UPDATE`), pero la respuesta HTTP del PATCH salía con campos faltantes o en
`null`. Se corrigió reemplazando el merge manual por
`repository.update(id, dto)` + un `findOne` fresco para la respuesta. Tiene
test de regresión en `services.service.spec.ts` / `contacts.service.spec.ts`.
Si se agrega un DTO de update nuevo en fases futuras, evitar el patrón
`Object.assign(entity, dto)`.

## Fase 2 — Cuentas + Perfiles — 🚧 en curso (backend completo)

- [x] Cifrado AES-256-GCM (`src/common/encryption/`) — `encrypt`/`decrypt`
      con Node `crypto` nativo, clave en `ENCRYPTION_KEY` (32 bytes hex,
      `openssl rand -hex 32`), `ValueTransformer` de TypeORM
      (`encrypted-column.transformer.ts`) para aplicarlo a columnas sin
      tocar el resto de la lógica de negocio
- [x] Entidad Cuenta (`src/accounts/`) — `servicioId`/`proveedorId` (FK
      reales, con constraint en DB), `correo`, `claveServicio`/
      `claveCorreo` cifradas, fechas, `costo`, `metodoPago`, `url`,
      `renovacionAutomatica`, `activo` (soft delete)
- [x] Entidad Perfil (`src/accounts/profiles/`, subrecurso anidado bajo
      cuenta — rutas `/api/accounts/:accountId/profiles`) — `cuentaId`,
      `nombre`, `pin` cifrado, `clienteId` (FK a Contact, se usa en Fase 3),
      `activo`
- [x] CRUD de Cuentas (backend) — `GET /accounts` **nunca** incluye
      `claveServicio`/`claveCorreo` (select explícito a nivel de query, ni
      se leen de la DB), sí trae `perfilesCount`; `GET /accounts/:id` sí
      devuelve las credenciales descifradas; filtros por
      `servicioId`/`proveedorId`/`activo`; crear/editar validan que el
      servicio/proveedor referenciado exista (404 limpio en vez de un
      error crudo de FK de Postgres); reactivar
- [x] CRUD de Perfiles (backend) — `POST` valida que los perfiles activos
      de la cuenta no superen `pantallasMax` del servicio asociado (sin
      límite si `pantallasMax` es null); **la misma validación se aplica
      también al reactivar** un perfil desactivado (no estaba pedido
      explícitamente, pero reactivar sin este chequeo permitía saltarse el
      límite — lo agregué por consistencia, revisar si se quiere así)
- [x] Migración (`AddAccountsAndProfiles`) generada, revisada a mano (solo
      crea `accounts`/`profiles` y sus FKs hacia `services`/`contacts`, no
      toca tablas existentes) y corrida contra Postgres local
- [x] Tests unitarios: cifrado (simétrico, IV aleatorio, clave inválida,
      auth tag manipulado), `AccountsService` (incluye que el listado
      nunca selecciona las columnas cifradas), `ProfilesService` (incluye
      el límite de `pantallasMax` al crear y al reactivar) — 43 tests en
      total en el repo
- [x] Probado manualmente contra Postgres local: login, crear cuenta,
      confirmar que el listado no trae claves y el detalle sí (y que en la
      tabla `accounts` quedan cifradas en el formato `iv:authTag:data`),
      crear perfiles hasta `pantallasMax`, confirmar 409 al superarlo,
      desactivar/reactivar respetando el límite, filtros, 401/404
- [ ] **Pendiente**: frontend de Cuentas + Perfiles
- [ ] **Pendiente**: correr la migración contra producción en Railway
      (junto con configurar `ENCRYPTION_KEY` ahí — lo hacemos juntos)

## Fase 3 — Ventas

- [ ] Entidad Venta que conecta Servicios + Cuentas/Perfiles + Contactos
- [ ] Flujo de creación de venta (asignar perfil libre a un contacto)
- [ ] Listado e historial de ventas

## Fase 4 — Vencimientos / Alertas

- [ ] Cálculo de vencimientos por venta/perfil
- [ ] Listado de próximos a vencer / vencidos
- [ ] Alertas (in-app como mínimo; canal externo se define en Fase 7)

## Fase 5 — Contabilidad / Caja

- [ ] Registro de ingresos/egresos ligados a ventas
- [ ] Reporte de caja (por período)

## Fase 6 — Combos

- [ ] Entidad Combo (agrupación de servicios/perfiles con precio propio)
- [ ] Ventas de combos

## Fase 7 — Extras

- [ ] Notificaciones por WhatsApp
- [ ] Tasas de cambio en vivo
- [ ] Backups automáticos
