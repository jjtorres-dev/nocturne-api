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

## Fase 2 — Cuentas + Perfiles — ✅ completa (2026-09-14)

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
- [x] Migración corrida contra producción en Railway y `ENCRYPTION_KEY`
      configurada ahí
- [x] Frontend de Cuentas (`/accounts`) — listado (`mat-table`) sin
      credenciales visibles, con columna de cantidad de perfiles
      (`activos/pantallasMax`, ej. "2/5") y filtros por servicio,
      proveedor y estado; click en fila navega al detalle
- [x] Frontend de Cuentas — formulario en modal (crear/editar) con selects
      de Servicio y Proveedor (Contactos `tipo=PROVEEDOR`), ambos filtrados
      a solo activos; `claveServicio`/`claveCorreo` como campos tipo
      password con toggle de mostrar/ocultar; valida que `fechaFin` sea
      posterior a `fechaInicio`
- [x] Frontend de detalle de Cuenta (`/accounts/:id`) — toda la info de la
      cuenta, con `claveServicio`/`claveCorreo` ocultas por defecto (botón
      "Mostrar" por campo) y botón "Copiar" que usa
      `navigator.clipboard.writeText` sin revelar en pantalla; acciones de
      editar/desactivar/reactivar la cuenta
- [x] Frontend de Perfiles anidados en el detalle de Cuenta — mismo patrón
      ocultar/mostrar/copiar para el `pin`; columna de cliente asignado
      (vacía por ahora, se llena en Fase 3); botón "Agregar perfil" se
      deshabilita con texto explicativo cuando se alcanza `pantallasMax`
      del servicio, en vez de dejar que falle con el 409 del backend;
      editar/desactivar/reactivar por perfil con el mismo patrón de
      confirmación del resto de la app
- [x] Componente compartido `SecretValue` (`shared/secret-value/`) para el
      patrón ocultar/mostrar/copiar, reutilizado en `claveServicio`,
      `claveCorreo` y `pin` — el valor real nunca se renderiza en el DOM
      hasta presionar "Mostrar", y en ningún punto del código (frontend ni
      backend) se hace `console.log` de `claveServicio`/`claveCorreo`/`pin`
- [x] Tests de componente: listado, form dialog de cuenta, y detalle
      (incluyendo que las claves no aparecen en el DOM hasta presionar
      "Mostrar")
- [x] **Verificado end-to-end** contra Postgres local: cifrado simétrico
      confirmado en DB, credenciales nunca expuestas en el listado ni en
      consola/logs, límite de pantallas validado tanto al crear como al
      reactivar un perfil (409 limpio, manejado en la UI sin romper)

## Fase 3 — Ventas — 🚧 en curso (backend completo)

- [x] Migración: columna `cliente_id` (FK a `contacts`, nullable) agregada a
      `accounts` — mismo propósito que ya tiene `profiles.clienteId`, para
      el caso de servicios SIN_PERFILES/IPTV donde se vende la cuenta
      completa en vez de un perfil individual. Se agregó también
      `clienteId` opcional a `CreateAccountDto`/`UpdateAccountDto` por
      simetría con `Profile` (en la práctica lo sincroniza `SalesService`,
      no se edita a mano desde el CRUD de Cuentas)
- [x] Entidad Venta (`src/sales/`, clase `Sale` — mismo criterio en inglés
      que `Service`/`Contact`/`Account`/`Profile`) — `clienteId`/
      `cuentaId`/`perfilId` (nullable)/`servicioId` (copiado de la cuenta
      al crear), `codigoVenta` único autogenerado desde la secuencia de
      Postgres `sales_codigo_venta_seq` (formato `V-00001`), fechas,
      `precio`/`moneda` (enum de 12 monedas: PEN, USD, ARS, BS, CLP, COP,
      CRC, CUP, DOP, MXN, PYG, UYU)/`tasaCambio` (default 1)/`precioPEN`
      (`precio * tasaCambio`, calculado al guardar), `metodoPago`,
      `renovacionAutomatica`, `activo`
- [x] **Agregado no pedido explícitamente pero necesario**: columna
      `duracionMeses` (snapshot de `Service.duracionMeses` al momento de
      la venta) — el endpoint de renovación tiene que sumar la duración
      "congelada" en la venta, no la del catálogo actual, y no había otro
      lugar de donde sacar ese valor
- [x] Validaciones al crear: CON_PERFILES/FAMILIAR exige `perfilId` (400 si
      falta) y que ese perfil no tenga ya otra venta activa (409);
      SIN_PERFILES/IPTV exige que NO venga `perfilId` (400 si viene) y que
      la cuenta no tenga ya otra venta activa directa (409); sincroniza
      `clienteId` en el Perfil o la Cuenta según corresponda
- [x] Al desactivar una venta: libera el `clienteId` del Perfil/Cuenta
      correspondiente. Al reactivar: vuelve a validar exclusividad antes
      de reasignar — 409 (indicando qué venta lo ocupa) si alguien más lo
      tomó mientras tanto
- [x] `POST /api/sales/:id/renew` — extiende `fechaFin` sumando el
      `duracionMeses` *snapshot* de la venta, no el del catálogo actual.
      Los meses fraccionarios (ej. 2.5, ver `Service.duracionMeses`) se
      aproximan a días asumiendo mes de 30 días (`src/sales/date.util.ts`,
      documentado ahí — no hay otra convención de negocio definida para
      "medio mes")
- [x] CRUD completo — `GET` con filtros `clienteId`/`servicioId`/`activo`,
      `GET /:id`, `POST`, `PATCH` (`repository.update()`, recalcula
      `precioPEN` si cambian `precio`/`tasaCambio`), `DELETE` soft,
      `reactivate`; mismo guard admin-only para escritura. `PATCH`
      deliberadamente NO permite reasignar `clienteId`/`cuentaId`/
      `perfilId` (ver comentario en `UpdateSaleDto`): esa reasignación
      tiene que pasar por las validaciones de exclusividad, así que
      reasignar implica desactivar la venta y crear una nueva
- [x] Tests unitarios (23 nuevos, 66 en total en el repo): exclusividad de
      asignación (perfil y cuenta ocupados → 409), exigencia/rechazo de
      `perfilId` según tipo de servicio (400), liberación al desactivar,
      bloqueo al reactivar si ya no está libre, cálculo de `precioPEN` (en
      creación y en `update`), generación de `codigoVenta`, y el endpoint
      de renovación (incluye la aritmética de meses fraccionarios en
      `date.util.spec.ts`)
- [x] Migración (`AddSalesAndAccountCliente`) generada con
      `migration:generate` y revisada a mano — se le agregó a mano la
      secuencia `sales_codigo_venta_seq` (TypeORM no la genera desde la
      entidad; la usa directamente `SalesService.generateCodigoVenta()`
      con `nextval()`); corrida contra Postgres local
- [x] Probado manualmente contra el servidor local: crear venta de perfil
      → confirmar `clienteId` sincronizado en el perfil → volver a vender
      el mismo perfil (409) → desactivar → confirmar que se liberó
      (`clienteId` null) → otro cliente ocupa el mismo perfil → reactivar
      la venta original (409, indica qué venta lo ocupa ahora) → venta
      directa sobre cuenta SIN_PERFILES con conversión de moneda
      (`precioPEN` correcto) → renovar y confirmar la nueva `fechaFin`
- [ ] **Pendiente**: frontend de Ventas
- [ ] **Pendiente**: correr la migración contra producción en Railway

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
