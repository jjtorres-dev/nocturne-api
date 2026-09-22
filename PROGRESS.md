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

## Fase 3 — Ventas — ✅ completa (2026-09-14)

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
- [x] Migración generada con `migration:generate` y revisada a mano — se le
      agregó a mano la secuencia `sales_codigo_venta_seq` (TypeORM no la
      genera desde la entidad; la usa directamente
      `SalesService.generateCodigoVenta()` con `nextval()`). Se separó en
      dos migraciones (`AddClienteIdToAccounts` + `AddSales`) para poder
      comitear el cambio de schema de Cuentas aparte del módulo de Ventas
      — el split no rompe nada porque `accounts.cliente_id` no tiene
      dependencia cruzada con `sales`; corridas contra Postgres local
- [x] Probado manualmente contra el servidor local: crear venta de perfil
      → confirmar `clienteId` sincronizado en el perfil → volver a vender
      el mismo perfil (409) → desactivar → confirmar que se liberó
      (`clienteId` null) → otro cliente ocupa el mismo perfil → reactivar
      la venta original (409, indica qué venta lo ocupa ahora) → venta
      directa sobre cuenta SIN_PERFILES con conversión de moneda
      (`precioPEN` correcto) → renovar y confirmar la nueva `fechaFin`
- [x] Migración corrida contra producción en Railway
- [x] Frontend de Ventas (`/sales`) — listado (`mat-table`) con código de
      venta, cliente, servicio, cuenta (correo) + perfil combinados,
      fechas, precio con moneda, estado; filtros por cliente/servicio/
      activo; acciones editar/renovar/desactivar/reactivar por fila
- [x] Frontend de Ventas — modal de creación con selects en cascada:
      Servicio (activos) → Cuenta (activas de ese servicio) → si
      CON_PERFILES/FAMILIAR, Perfil (activos y sin `clienteId`, es decir
      libres); si SIN_PERFILES/IPTV, sin selector de perfil y valida en
      el propio formulario que la cuenta no tenga ya `clienteId`
      asignado antes de llamar al backend; si el backend igual responde
      409 (carrera con otra venta), muestra el mensaje de error del
      backend en vez de uno genérico
- [x] Frontend de Ventas — modal de edición reducido a propósito:
      `fechaFin`/`precio`/`moneda`/`tasaCambio`/`metodoPago`/
      `renovacionAutomatica` únicamente, sin campos ni controles para
      `servicioId`/`cuentaId`/`perfilId`/`clienteId` en el DOM
      (reasignar exige desactivar + crear una venta nueva, ver
      `UpdateVentaPayload`)
- [x] Frontend de Ventas — botón "Renovar" con confirmación simple; la
      nueva `fechaFin` que se muestra en el snackbar de éxito viene tal
      cual de la respuesta del backend, el frontend no la calcula
- [x] Cambio necesario en Cuentas (Fase 2) para soportar esto: se agregó
      `clienteId` a `Cuenta`/`CuentaListItem` en el frontend, reflejando
      la columna que el backend ya devuelve desde el punto anterior —
      el modal de creación de venta lo necesita para la validación de
      cuentas SIN_PERFILES/IPTV ya asignadas
- [x] Tests de componente (25 nuevos, 81 en total en el repo): listado
      (incluye la combinación cuenta+perfil en la tabla), la cascada del
      form de creación (que Cuenta/Perfil se filtran correctamente al
      cambiar Servicio, y que los perfiles ocupados no aparecen como
      opción), y que el modal de editar no expone los campos
      estructurales ni en el `FormGroup` ni en el DOM
- [x] **Verificado end-to-end** contra el servidor local: exclusividad de
      asignación (perfil/cuenta ocupados → 409 visible en el modal),
      liberación al desactivar y bloqueo al reactivar si alguien más lo
      ocupó mientras tanto, conversión de moneda (`precioPEN` correcto
      con `tasaCambio` distinto de 1), renovación con la `fechaFin` real
      devuelta por el backend, y que las credenciales de Cuentas (Fase 2)
      siguen sin exponerse en ningún punto de este flujo

## Fase 4 — Vencimientos / Alertas — ✅ completa (2026-09-14)

- [x] `GET /api/sales` extendido con filtros opcionales `vencimiento`
      (`vencida`/`por_vencer`/`al_dia`) y `diasAlerta` (int, default 3,
      define el borde entre `por_vencer` y `al_dia`) — se calcula sobre
      ventas activas según `fechaFin`: `vencida` = `fechaFin < hoy`,
      `por_vencer` = `fechaFin` entre `hoy` y `hoy + diasAlerta`
      (ambos bordes inclusive), `al_dia` = `fechaFin > hoy + diasAlerta`.
      Sigue soportando los filtros `clienteId`/`servicioId` existentes en
      combinación con `vencimiento`
- [x] `GET /api/sales/summary` — `{ vencidas, porVencer, alDia }` sobre
      ventas activas, mismo `diasAlerta` configurable por query param
      (default 3); pensado para tarjetas del dashboard. Ruta declarada
      antes que `GET /:id` en el controller (si no, Nest matchea
      "summary" como el parámetro `:id`)
- [x] Usa `CURRENT_DATE` de Postgres (vía `QueryBuilder` con SQL crudo
      para las tres condiciones), no la fecha del cliente que hace el
      request — evita que el reloj/zona horaria de quien llama afecte
      qué cuenta como vencido
- [x] Cuando se pide `vencimiento`, el filtro `activo` que venga en el
      query se ignora a propósito y se fuerza `activo = true`: los tres
      estados solo tienen sentido sobre ventas activas
- [x] Tests unitarios (8 nuevos, 74 en total): las tres condiciones SQL
      armadas correctamente (bordes, `diasAlerta` default y explícito,
      combinación con `clienteId`/`servicioId`), que sin `vencimiento`
      se sigue usando `find()` simple sin `QueryBuilder`, y `summary()`
      con los tres conteos
- [x] Tests e2e nuevos (`test/sales-vencimiento.e2e-spec.ts`, requieren
      Postgres corriendo) — únicos capaces de verificar de verdad la
      aritmética de `CURRENT_DATE` (un test unitario con repositorio
      mockeado solo puede confirmar qué SQL se arma, no que el cálculo
      de fechas sea correcto): los tres estados con fechas calculadas
      relativas a "hoy" dentro del test (nunca fijas, para no romperse
      con el paso del tiempo), los bordes inclusive/exclusive, el efecto
      de un `diasAlerta` explícito corriendo el borde, y el `summary`
      verificado por delta antes/después de crear una venta (la BD de
      desarrollo es compartida entre corridas, así que un conteo
      absoluto sería frágil)
- [x] Probado manualmente contra el servidor local: ventas con `fechaFin`
      en el pasado, dentro de la ventana de `diasAlerta` y lejana;
      cada filtro devolvió exactamente lo esperado y `summary` cuadró
      con los conteos reales (`{vencidas:2, porVencer:3, alDia:4}` sobre
      9 ventas creadas a propósito, verificado con la BD limpia antes y
      después)
- [x] Frontend de Vencimientos (`/vencimientos`) — listado de ventas
      filtrado por `vencimiento` (`vencida`/`por_vencer`/`al_dia`) y
      `diasAlerta`, con botón directo a WhatsApp por fila para avisarle
      al cliente
- [x] Dashboard — tarjetas de resumen (`vencidas`/`porVencer`/`alDia`)
      consumiendo `GET /api/sales/summary`; cada tarjeta navega a
      `/vencimientos` con el filtro correspondiente
- [x] **Bug encontrado y corregido**: `limpiarNumeroWhatsapp()`
      (`nocturne-web/src/app/features/sales/whatsapp.util.ts`) no
      anteponía el código de país — los números de Contactos suelen
      guardarse en formato local peruano (9 dígitos, sin `+51`), y
      `wa.me` con esos 9 dígitos se queda cargando indefinidamente en
      vez de abrir el chat. Ahora antepone `51` cuando el número
      limpio tiene exactamente 9 dígitos; si ya viene con código de
      país lo deja igual. Con test de regresión para ambos casos
- [x] El cambio de `vencimiento`/`diasAlerta`/`summary` no requirió
      migración (solo lógica de query) y ya está corriendo en
      producción en Railway
- [x] **Verificado end-to-end**: los tres filtros de vencimiento y el
      `summary` del dashboard contra el servidor local, y el botón de
      WhatsApp del listado abriendo el chat directo con un número real
      de Contactos (antes se quedaba cargando por el bug de arriba)

## Fase 5 — Contabilidad / Caja — ✅ completa (2026-09-14)

- [x] Entidad `Payment` (`src/payments/`, tabla `payments`) y `Expense`
      (`src/expenses/`, tabla `expenses`) — nombres en inglés por el mismo
      criterio que `Sale`/`Account`/`Profile` (el pedido original las
      llamaba "Pago"/"Gasto", pero se mantiene la convención del repo).
      Ambas calculan `montoPEN = monto * tasaCambio` (redondeado a 2
      decimales) igual que `Sale.precioPEN`; se extrajo ese redondeo a
      `src/common/round2.ts` para no triplicarlo entre `SalesService`,
      `PaymentsService` y `ExpensesService`
- [x] `Payment` no tiene endpoints propios: lo crea `SalesService`
      automáticamente. Al `create()` de una venta, genera un `Payment`
      `tipo=venta_inicial` con el precio/moneda/tasaCambio/metodoPago de la
      venta y `fecha=fechaInicio`
- [x] `POST /api/sales/:id/renew` extendido con body opcional
      `{ precio?, moneda?, tasaCambio?, metodoPago? }`. **Decisión no
      pedida explícitamente pero necesaria para que el reporte de
      contabilidad tenga sentido**: además de crear el `Payment`
      `tipo=renovacion`, la venta misma actualiza esos 4 campos (y
      recalcula `precioPEN`) a los valores de la renovación — si no, la
      venta quedaría mostrando el precio original mientras el historial de
      pagos ya refleja el nuevo, dos fuentes de verdad desincronizadas. Sin
      body, los valores "nuevos" son los mismos que ya tenía la venta, así
      que el resultado es idéntico al comportamiento previo a esta fase
      salvo por el `Payment` nuevo (eso sí es intencional, pedido
      explícitamente). La fecha del `Payment` de renovación es la fecha
      real del servidor al momento de renovar (no viene en el body)
- [x] CRUD de Gastos (`/api/expenses`) — mismo patrón que Servicios/
      Contactos (soft delete, reactivate, admin-only para escritura)
- [x] Módulo `src/accounting/` con 4 reportes, todos con query params
      opcionales `desde`/`hasta` (default: mes calendario actual completo,
      calculado en el proceso de Node, no con `CURRENT_DATE` de Postgres
      como vencimiento — acá el resultado son fechas que se reparten entre
      varias queries distintas, y así se puede testear como función pura):
      `GET /summary` (`{ingresos, inversion, gastos, ganancia}`,
      `ganancia = ingresos - inversion - gastos`), `GET /by-service`
      (por servicio, `ganancia = ingresos - inversion`, sin gastos porque
      los gastos operativos no se atribuyen a un servicio en particular),
      `GET /by-payment-method` (`neto = ingresos - gastos`), y
      `GET /timeline?groupBy=day|week|month` (`ganancia = ingresos -
      gastos`, ordenado por período)
- [x] `ingresos` sale de `Payment.montoPEN` por `fecha` del pago;
      `inversion` de `Account.costo` por fecha de **creación** de la
      cuenta (incluye cuentas ya desactivadas: el costo se pagó igual);
      `gastos` de `Expense.montoPEN` por `fecha`, solo gastos `activo=true`
- [x] Migración `AddPaymentsAndExpenses` — crea `payments`/`expenses` y,
      además, una **data migration** que inserta un `Payment` retroactivo
      `tipo=venta_inicial` por cada `Sale` ya existente (precio/moneda/
      tasaCambio/precioPEN de la venta, `fecha=fechaInicio`), con
      `WHERE NOT EXISTS` para que sea idempotente si se corre dos veces.
      Corrida y verificada contra Postgres local (3 ventas preexistentes →
      3 Payments retroactivos, segunda corrida manual del INSERT no
      duplicó nada)
- [x] **Bug encontrado corrigiendo tests existentes**: `payments.venta_id`
      tiene FK hacia `sales`, así que el cleanup de
      `test/sales-vencimiento.e2e-spec.ts` (que borra las `sales` de prueba
      directo por SQL) empezó a fallar por la FK — ahora borra primero los
      `payments` de esas ventas
- [x] Tests unitarios: cálculo de `montoPEN` en `Payment`/`Expense`
      (`payments.service.spec.ts`, `expenses.service.spec.ts`), que
      `SalesService.create()` genera su `Payment` inicial y que `renew()`
      genera el de renovación tanto con body como sin él
      (`sales.service.spec.ts`), `AccountingService` orquestando los 4
      reportes con números conocidos (`accounting.service.spec.ts`), y
      `resolveRango()` como función pura, incluyendo bordes de mes de 31
      días y año bisiesto (`date-range.util.spec.ts`)
- [x] Test e2e nuevo (`test/accounting.e2e-spec.ts`): a diferencia de
      `sales-vencimiento.e2e-spec.ts` (que compara por delta contra
      "ahora"), acá se usa una fecha fija en el pasado (2020-06-15) que
      ningún otro test o uso manual toca, filtrando los 4 reportes a
      exactamente ese día — así el número esperado es exacto y no le
      afecta que los archivos de e2e corran en paralelo sobre la misma BD
      compartida (justo el problema que tenía un primer intento por delta:
      otro e2e corriendo en paralelo contaminaba `inversion`). El `Payment`
      de renovación y el `created_at` de la cuenta se backdatean a mano
      con SQL directo porque ninguno de los dos viene expuesto en la API
- [x] Probado manualmente contra el servidor local: creada una venta
      (precio 50) → confirmado su `Payment venta_inicial` (monto_pen=50) →
      renovada con precio 35 → confirmado el segundo `Payment renovacion`
      (monto_pen=35) → `GET /accounting/by-service` y `/by-payment-method`
      del día, filtrados al servicio/método de este caso, mostraron
      exactamente `ingresos=85` (50+35) con `inversion=100` (el costo de
      la cuenta) — ambos pagos sumados correctamente. Datos de prueba
      borrados después
- [x] Migración y backend corridos y verificados contra producción en
      Railway (nocturne-api), igual que las fases anteriores
- [x] Frontend de Gastos (`nocturne-web`, `/expenses`) — mismo patrón que
      Servicios/Contactos: listado con filtro por activo, modal de
      crear/editar (descripcion, monto, moneda, tasaCambio, metodoPago,
      fecha), soft-delete/reactivar con confirmación
- [x] Frontend de Contabilidad (`nocturne-web`, `/accounting`) — date
      pickers Desde/Hasta (vacíos por defecto, dejan que el backend
      aplique su default de mes actual) + botón Aplicar; 4 tarjetas de
      resumen (Ingresos/Inversión/Gastos/Ganancia, esta última
      destacada visualmente); tablas "Por servicio" y "Por método de
      pago"; gráfico de barras de la línea de tiempo con Chart.js
      (`npm install chart.js`) y selector Día/Semana/Mes
- [x] **Bug encontrado y corregido en frontend**: el pipe `currency` de
      Angular con código `'PEN'` cae al código ISO ("PEN") en vez del
      símbolo "S/", porque el proyecto nunca registró el locale `es-PE`
      (los símbolos narrow de monedas poco comunes en `en-US`, el
      locale por defecto, no están en esa tabla). Se creó un pipe propio
      `SolesPipe` (`shared/soles.pipe.ts`) que antepone "S/" a mano en
      vez de depender de datos de locale no cargados. Se aplicó no solo
      en Contabilidad sino en todos los montos en soles del panel que
      antes se mostraban como decimal crudo o con el código de moneda
      pegado: Gastos, Ventas, Vencimientos, Servicios (`precioBase`) y
      el detalle de Cuenta (`costo`). Para los campos que sí tienen
      moneda propia (`Sale.precio`, `Expense.monto`, pueden no ser PEN),
      se usa el equivalente ya calculado en soles (`precioPEN`/
      `montoPEN`) con `SolesPipe`, mostrando el monto original entre
      paréntesis solo cuando la moneda no es PEN — aplicar el símbolo
      de soles directo sobre esos campos habría sido incorrecto (un
      gasto de 15 USD se habría visto como "S/ 15.00"). 7 tests de
      regresión nuevos cubren ambos casos (PEN directo y moneda
      extranjera con el monto original visible)
- [x] Probado contra el backend local con datos de prueba reales
      (servicios, cuenta, venta y gasto creados a propósito): los 4
      endpoints de Contabilidad y `/expenses` devolvieron exactamente
      los montos esperados, consumidos correctamente por el frontend

## Fase 6 — Combos — ✅ completa (2026-09-15)

- [x] Entidad `Combo` (`src/combos/`) — `nombre`, `descripcion` (nullable),
      `servicios` (many-to-many con `Service` vía tabla de unión
      `combo_servicios`), `precioCombo`, `activo`. CRUD completo, mismo
      patrón admin-only/soft-delete/reactivate que Servicios. **Decisión no
      pedida explícitamente**: mínimo 2 servicios por combo (`ArrayMinSize`
      en los DTOs) — un "combo" de un solo servicio no tiene sentido como
      concepto de negocio, sería un Service normal
- [x] Entidad `VentaCombo` (`src/combo-sales/`, tabla `combo_sales`) — el
      "wrapper" de una venta de combo: `clienteId`, `comboId`,
      `codigoVenta` (secuencia propia `combo_sales_codigo_venta_seq`,
      prefijo `C-`), `fechaInicio`/`fechaFin`, `duracionMeses` propio (a
      diferencia de `Sale`, que copia la duración del catálogo de un único
      Service, acá el combo agrupa servicios que pueden tener duraciones
      de catálogo distintas, así que necesita la suya propia para
      `renew()`), `precio`/`moneda`/`tasaCambio`/`precioPEN`,
      `metodoPago`, `renovacionAutomatica`, `activo`
- [x] `Sale` extendida con `ventaComboId` (FK nullable a `VentaCombo`): las
      ventas "hijas" de un combo (una por servicio) son filas normales de
      `sales`, comparten la misma secuencia `sales_codigo_venta_seq` y la
      misma lógica de exclusividad de cuenta/perfil que las ventas
      sueltas — así que vender el mismo perfil dos veces (una suelta, otra
      dentro de un combo) también se detecta sin código nuevo. Su
      `precio`/`precioPEN` quedan en 0: el dinero real se registra una
      sola vez, en el `Payment` de la `VentaCombo`
- [x] `Payment` extendida con `ventaComboId` (FK nullable) y `ventaId`
      ahora nullable — un Payment pertenece a una `Sale` **o** a una
      `VentaCombo`, nunca ambas ni ninguna, reforzado con un `CHECK`
      constraint a nivel de base de datos (no solo validación de
      aplicación) por ser un invariante crítico para la integridad de
      Contabilidad
- [x] `POST /api/combo-sales` — todo en una sola transacción de DB
      (`DataSource.transaction()`): valida que las asignaciones cubran
      exactamente los servicios del combo (ni de más ni de menos, sin
      duplicados) y la exclusividad de cada cuenta/perfil **antes** de
      escribir una sola fila; recién si todo pasa crea la `VentaCombo`,
      una `Sale` hija por asignación (con `cuentaId`/`perfilId` reales,
      `clienteId` sincronizado, `ventaComboId` apuntando al wrapper) y un
      único `Payment` `tipo=venta_inicial` ligado a la `VentaCombo`. Si
      cualquier asignación falla, 409 (o 400 si es un error estructural,
      p.ej. perfilId faltante) con el detalle de qué servicio falló, y no
      queda absolutamente nada creado
- [x] **Decisión de arquitectura no trivial**: dentro de la transacción no
      se pudo reusar `AccountsService`/`ProfilesService`/`SalesService`
      (usan sus propios repositorios inyectados, atados a la conexión por
      defecto, no al `EntityManager` de la transacción — llamarlos ahí
      habría roto la atomicidad). `ComboSalesService` reimplementa la
      misma lógica de exclusividad pero corriendo sobre el
      `EntityManager` transaccional directamente. Se extrajo
      `generateCodigoVenta` a `sales/codigo-venta.util.ts` (recibe un
      `EntityManager`, no un `Repository`) para poder compartirlo entre
      `SalesService` y `ComboSalesService` sin duplicar la secuencia
- [x] `SalesService` bloquea `reactivate`/`deactivate`/`renew` directos
      sobre una `Sale` con `ventaComboId` no nulo (400, explica que se
      gestiona desde el combo). `GET /sales` las sigue devolviendo
      normalmente (Vencimientos y el recordatorio de WhatsApp por
      servicio individual siguen funcionando)
- [x] `GET /api/combo-sales` (filtros `clienteId`/`comboId`/`activo`),
      `GET /:id` (incluye el detalle de las ventas hijas con su
      servicio/cuenta/perfil), `PATCH` (solo
      `fechaFin`/`precio`/`moneda`/`tasaCambio`/`metodoPago`/
      `renovacionAutomatica`, igual que Ventas — reasignar
      cliente/combo/asignaciones implica desactivar y crear de nuevo)
- [x] `DELETE /api/combo-sales/:id` — soft delete transaccional: desactiva
      el wrapper Y todas sus ventas hijas Y libera sus cuentas/perfiles
      (clienteId a null), todo o nada
- [x] `PATCH /api/combo-sales/:id/reactivate` — revalida la exclusividad
      de **todas** las ventas hijas antes de reactivar cualquiera (409 si
      alguna ya no está libre), y solo entonces reactiva + resincroniza
      clienteId en todas
- [x] `POST /api/combo-sales/:id/renew` — extiende `fechaFin` del wrapper
      usando su propio `duracionMeses`, sincroniza `fechaFin` en todas las
      ventas hijas, crea un `Payment` `tipo=renovacion` ligado al wrapper
      (no a las hijas)
- [x] Migración `AddCombos` — crea `combos`, `combo_servicios` (tabla de
      unión), `combo_sales` (+ su secuencia de código), agrega
      `venta_combo_id` nullable a `sales` y a `payments`, hace `venta_id`
      nullable en `payments` y agrega el `CHECK` constraint
      `venta_id`/`venta_combo_id` mutuamente excluyentes. Generada con
      `migration:generate` y revisada/completada a mano (la secuencia y
      el `CHECK` no los genera TypeORM), corrida contra Postgres local
- [x] **Bug encontrado en la propia infraestructura de tests**: los
      archivos e2e corren en paralelo por defecto en Vitest, y varios
      miden agregados globales por delta antes/después
      (`SalesService.summary`, `AccountingService`) — al agregar
      `combo-sales.e2e-spec.ts` (que crea ventas con `fechaFin` futuro)
      esas mediciones en otros archivos empezaron a fallar de forma
      intermitente por contaminación cruzada. Se corrigió de raíz con
      `fileParallelism: false` en `vitest.config.e2e.ts` en vez de otro
      parche de aislamiento por fecha
- [x] Tests unitarios: `CombosService` (CRUD, resolución de
      `servicioIds` a `Service`), `ComboSalesService` — cobertura de
      asignaciones (conteo exacto, duplicados, fuera del combo),
      validaciones por asignación (perfil requerido/prohibido según
      tipo de servicio), **el caso crítico de rollback** (2 asignaciones,
      la segunda falla por exclusividad → se verifica que `save()` no se
      llamó ni una sola vez, ni siquiera para la primera asignación que sí
      había validado bien), `softDelete`/`reactivate`/`renew`; y en
      `SalesService`, que `reactivate`/`deactivate`/`renew` rechazan una
      venta hija de combo
- [x] Test e2e nuevo (`test/combo-sales.e2e-spec.ts`): camino feliz
      (VentaCombo + 2 hijas + 1 Payment), bloqueo de acciones directas
      sobre una hija, `renew` sincronizando fechas, `deactivate`
      liberando cuentas, **el rollback verificado contra Postgres real**
      (conteos de `combo_sales`/`sales`/`payments` idénticos antes y
      después del intento fallido, y la cuenta que sí había validado
      sigue sin cliente asignado), y `/accounting/summary` sumando el
      ingreso de un combo vendido (fecha aislada, número exacto, misma
      técnica que `accounting.e2e-spec.ts`)
- [x] Probado manualmente el caso de rollback contra el servidor local:
      combo de 2 servicios, cuenta del segundo ya ocupada por otra venta
      → 409 con el servicio señalado, conteos de `combo_sales`/`sales`/
      `payments` verificados idénticos antes y después (0/12/12), y la
      cuenta del primer servicio (que sí había validado) confirmada sin
      `clienteId` asignado. Reintentado liberando la cuenta ocupada:
      combo creado correctamente (`C-00020`, 2 ventas hijas con
      `precio=0`). Datos de prueba borrados después
- [x] Frontend de Combos (`nocturne-web`, `features/combos/`): listado y
      modal de crear/editar con multi-select y chips para los servicios
      incluidos, desactivar/reactivar — mismo patrón que Servicios
- [x] Frontend de Ventas de Combo (`nocturne-web`, `features/combo-sales/`):
      listado, página de crear con las secciones de asignación dinámicas
      (una por servicio del combo, cascada cuenta→perfil igual que
      Ventas), detalle de solo lectura de las ventas hijas, y
      editar/renovar/desactivar/reactivar
- [x] Badge "Parte de combo" en el listado de Ventas (`features/sales/`)
      confirmado para las filas con `ventaComboId` no nulo, con el código
      de la venta de combo (`C-xxxxx`)
- [x] Rollback transaccional de `POST /api/combo-sales` verificado sin
      registros parciales (ver test e2e y prueba manual contra Postgres
      real arriba)

## Multi-usuario — Fase A: Gestión de Usuarios (backend)

No ligada a una fase numerada del roadmap: extiende el `AuthModule`/
`UsersModule` de la Fase 0 (hoy solo existía el usuario admin del seed) para
que el admin pueda dar de alta cuentas de tipo `REVENDEDOR`.

- [x] `UserRole` extendido con `REVENDEDOR` junto a `ADMIN`. El enum vive en
      Postgres como tipo nativo (`users_role_enum`) — la tabla `users` se
      creó con `synchronize` en la Fase 0, antes de que el proyecto usara
      migraciones, así que **esta es la primera migración que toca
      `users`** (`AddRevendedorRole`, `ALTER TYPE ... ADD VALUE`). El `down`
      recrea el tipo sin `revendedor` (Postgres no soporta quitar un valor
      de enum directamente) y falla a propósito si algún usuario quedó con
      ese rol — comportamiento esperado, no hay a qué otro rol migrarlo sin
      perder información. Corrida contra Postgres local
- [x] Módulo `src/users/` con controller nuevo (antes solo tenía
      `UsersService`, usado por `AuthModule`/`seed`) — **todo el módulo es
      admin-only** (`@UseGuards(JwtAuthGuard, RolesGuard)` +
      `@Roles(UserRole.ADMIN)` a nivel de controller), a diferencia de
      Servicios/Contactos donde la lectura está abierta a cualquier usuario
      autenticado: un `REVENDEDOR` no tiene motivo para ver la lista de
      usuarios
- [x] `GET /api/users`, `GET /api/users/:id` — nunca seleccionan
      `password_hash` de la DB (mismo criterio que `AccountsService` con las
      credenciales cifradas: exclusión a nivel de query con `select`, no
      un borrado manual del campo después de leerlo)
- [x] `POST /api/users` — hashea la contraseña con bcrypt (mismo costo que
      `seed.ts`, 10 rounds); 409 si el email ya existe (chequeo explícito
      antes del insert, mismo criterio que las validaciones de FK en
      Cuentas, en vez de parsear el error crudo de Postgres)
- [x] `PATCH /api/users/:id` — `name`/`role`/`password` opcionales
      (`repository.update()`, mismo patrón anti-`Object.assign` que
      Servicios/Contactos); si viene `password` se re-hashea. **No permite
      que un usuario se cambie su propio rol** (403 si `id` coincide con el
      usuario autenticado y el body trae `role`, sin importar si es un valor
      distinto o el mismo) — sí permite que se edite su propio nombre o
      contraseña, el bloqueo es específico de `role`
- [x] `DELETE /api/users/:id` (soft delete, `isActive=false`) — **no permite
      auto-desactivarse** (403 si `id` coincide con el usuario autenticado),
      evita que el admin se bloquee a sí mismo por accidente
- [x] `PATCH /api/users/:id/reactivate` — mismo patrón que
      Servicios/Contactos, sin restricción de auto-bloqueo (no aplica:
      reactivarse a uno mismo no tiene el mismo riesgo que desactivarse)
- [x] Sin auto-registro público — los usuarios nuevos los crea el admin a
      mano vía `POST /api/users` y les pasa la contraseña por fuera del
      sistema, mismo criterio informal que ya se usaba para el admin
      inicial. Recuperación de contraseña por email, fuera de alcance
- [x] Tests unitarios (`users.service.spec.ts`, 13 nuevos): hash de
      contraseña al crear (nunca se devuelve en la respuesta), 409 por
      email duplicado, `select` sin `password_hash` en el listado, PATCH
      no toca `password_hash` si no viene `password`, PATCH sí la
      re-hashea si viene, bloqueo de auto-cambio de rol (permite nombre/
      password propios), bloqueo de auto-desactivación, 404 en los casos
      de usuario inexistente
- [x] Test e2e nuevo (`test/users.e2e-spec.ts`, 11 tests, requiere Postgres
      corriendo — necesario para probar `RolesGuard` de verdad contra un
      JWT real con el rol real en el payload, algo que un test unitario con
      guards mockeados no puede confirmar): CRUD completo contra la API
      real, 409 por email duplicado, un `REVENDEDOR` recién creado puede
      loguearse, y **los 6 endpoints del módulo dan 403 a un `REVENDEDOR`**
      (`GET` lista, `GET :id`, `POST`, `PATCH`, `DELETE`, `PATCH
      :id/reactivate`), más los 2 casos de auto-bloqueo del admin (`PATCH`
      con `role` propio, `DELETE` de sí mismo)
- [x] Probado manualmente contra el servidor local: login admin → crear
      usuario `REVENDEDOR` (`POST /api/users`, respuesta sin
      `password_hash`) → login exitoso con esa cuenta nueva (JWT con
      `role: "revendedor"`) → `GET /api/users` con ese token da 403 →
      `GET /api/users` como admin lista los usuarios, `password_hash`
      ausente en todos. Datos de prueba borrados después

## Multi-usuario — Fase B1: Ownership en Servicios (backend)

No ligada a una fase numerada del roadmap. Primer módulo del patrón de
ownership que se va a repetir en Cuentas/Perfiles/Contactos/Ventas etc.:
se implementa acá primero y se revisa antes de replicarlo, en vez de
aplicarlo a ciegas en todos los módulos de una.

- [x] Columna `owner_id` (uuid, FK a `users`, `NOT NULL`) agregada a
      `services` — migración `AddServiceOwner`. Como ya había filas
      existentes (el Netflix real de producción, entre otras), la
      migración agrega la columna **nullable primero**, hace un
      `UPDATE` que asigna el admin más antiguo (`role='admin' ORDER BY
      created_at ASC LIMIT 1`) como dueño default de las filas sin
      owner, y recién ahí pone `NOT NULL` + agrega la FK — no puede
      quedar ninguna fila con `owner_id` nulo. Corrida contra Postgres
      local, verificada por SQL directo que las 8 filas existentes
      (incluida `Netflix`) quedaron con el admin como dueño
- [x] `ServicesService` separa explícitamente los métodos **sin** scope
      de ownership (`findOne`/`findAll`, sin cambios de firma) de los
      **con** scope (`findOneOwned`/`findAllOwned`, nuevos) — decisión
      no pedida explícitamente pero necesaria: `AccountsService`,
      `ProfilesService`, `SalesService`, `CombosService` y
      `AccountingService` ya llamaban a `servicesService.findOne()`/
      `findAll()` para validar FKs o armar reportes, sin ningún
      concepto de "usuario que hizo la request HTTP" — si esos métodos
      hubieran quedado con scope de ownership por default, un admin
      creando una Cuenta sobre un servicio de un revendedor habría
      roto, y Contabilidad habría dejado de sumar servicios ajenos al
      caller. Solo el controller usa las versiones `*Owned`
- [x] `ServicesController` — se sacó `RolesGuard`/`@Roles(ADMIN)` de
      `POST`/`PATCH`/`DELETE`/`reactivate` (antes admin-only): ahora
      un `REVENDEDOR` puede crear/editar/desactivar/reactivar
      servicios igual que un admin, pero acotado a los suyos. El
      control de acceso pasó de ser por rol a ser por ownership en
      este módulo
- [x] `create()` toma el `ownerId` del JWT decodificado
      (`@CurrentUser()`), nunca del body — el DTO no tiene ni tuvo
      nunca un campo `ownerId` que el cliente pueda mandar
- [x] `findAllOwned()`: un `REVENDEDOR` queda acotado a `ownerId = su
      propio id` **siempre**, agregado al `where` en el propio
      servicio sin importar qué mande el query string — la
      seguridad no depende de que el frontend filtre bien.
      `findOneOwned()`: un `REVENDEDOR` pidiendo/editando/desactivando/
      reactivando un servicio ajeno recibe **404, no 403** (mismo
      criterio en `update`/`softDelete`/`reactivate`, que llaman a
      `findOneOwned` antes de tocar nada) — no se le confirma que el
      recurso existe si no es suyo. Un `ADMIN` no tiene ningún filtro
      de `ownerId`, ve y toca todo
- [x] Tests unitarios (`services.service.spec.ts`, reescrito): creación
      con `ownerId` del usuario autenticado (no del DTO),
      `findAllOwned` agrega `ownerId` al `where` solo para
      `REVENDEDOR`, `findOneOwned`/`update`/`softDelete`/`reactivate`
      dan `NotFoundException` (no `ForbiddenException`) cuando un
      `REVENDEDOR` toca un recurso ajeno, y que un `ADMIN` pasa todos
      esos mismos casos sin restricción
- [x] **Tratado con el mismo rigor que el rollback de Combos**: test
      e2e nuevo (`test/services-ownership.e2e-spec.ts`) con **dos
      usuarios `REVENDEDOR` reales**, creados vía `POST /api/users` y
      logueados vía `POST /api/auth/login` (JWT real con su `role`
      real en el payload, no un `userId` pasado a mano) — confirma
      contra la API real que Usuario B recibe 404 en `GET /:id`,
      `PATCH`, `DELETE` y `PATCH /:id/reactivate` sobre un servicio de
      Usuario A, que el listado de B nunca lo incluye, que A sigue
      viendo/tocando lo propio (control positivo), y que el admin ve y
      puede editar/desactivar/reactivar los servicios de ambos
- [x] Probado manualmente contra el servidor local con `curl`: creados
      2 usuarios `REVENDEDOR` reales, cada uno creó un servicio propio
      — confirmado que el listado de cada uno no incluye el del otro,
      que cada uno recibe 404 en `GET`/`PATCH`/`DELETE` sobre el
      servicio ajeno, y que el admin ve ambos en su listado y puede
      editar uno y desactivar el otro. Datos de prueba borrados después
- [x] **Ajuste posterior**: `GET /api/services` y `GET /api/services/:id`
      ahora siempre incluyen `owner: { id, name, email }` (join simple
      con `User`, sin condicional por rol — el admin ve el mismo objeto
      `owner` que ve el propio dueño). Implementado con `relations: {
      owner: true }` + `select` restringido (`OWNED_SELECT`) para que el
      join nunca traiga `password_hash` ni el resto de `User` — mismo
      criterio que `PUBLIC_SELECT` en `UsersService`. Los métodos sin
      scope (`findOne`/`findAll`, uso interno de otros módulos) no
      cargan el `owner`, para no pagar el join de más donde no hace
      falta. `POST`/`PATCH`/`DELETE`/`reactivate` no estaban pedidos
      explícitamente para este campo, pero `PATCH`/`DELETE`/
      `reactivate` lo terminan incluyendo igual porque reusan
      `findOneOwned` internamente — `POST` no, devuelve la entidad
      recién creada sin el join. Tests unitarios y e2e extendidos para
      confirmar el `owner` poblado (y sin `password_hash`/`role`) tanto
      en `GET /:id` como en `GET /`, para el dueño y para el admin por
      igual

## Multi-usuario — Fase B2: Ownership en Contactos (backend)

Réplica exacta del patrón validado en Fase B1 (Servicios), incluido el
campo `owner` desde el arranque (no como ajuste posterior).

- [x] Columna `owner_id` (uuid, FK a `users`, `NOT NULL`) agregada a
      `contacts` — migración `AddContactOwner`, mismo patrón nullable →
      backfill (admin más antiguo) → `NOT NULL` → FK. Corrida contra
      Postgres local; verificado que las 29 filas existentes quedaron
      con `owner_id` apuntando al admin (`count(DISTINCT owner_id) = 1`
      antes de que hubiera revendedores)
- [x] `ContactsService` con la misma separación que `ServicesService`:
      `findOne`/`findAll` sin scope (uso interno de `AccountsService`,
      `SalesService`, `ComboSalesService`, que validan
      `proveedorId`/`clienteId` sin ningún concepto de usuario HTTP) vs.
      `findOneOwned`/`findAllOwned` (con scope + `owner` poblado, solo
      para el controller)
- [x] `ContactsController` — mismo cambio que Servicios: se sacó
      `RolesGuard`/`@Roles(ADMIN)` de `POST`/`PATCH`/`DELETE`/
      `reactivate` (antes admin-only); ahora un `REVENDEDOR` puede
      crear/editar/desactivar/reactivar contactos propios, acotado por
      ownership en vez de por rol
- [x] `create()` toma `ownerId` del JWT decodificado, nunca del body.
      `findOneOwned`/`update`/`softDelete`/`reactivate` dan 404 (no 403)
      sobre un contacto ajeno. `GET /api/contacts` y `GET /:id` incluyen
      siempre `owner: { id, name, email }`, admin y revendedor por
      igual — mismo `select` restringido que Servicios, nunca
      `password_hash`
- [x] Tests unitarios (`contacts.service.spec.ts`, reescrito, 15 tests):
      mismo set que Servicios — creación con `ownerId` del usuario
      autenticado, `findAllOwned` acota por `ownerId` solo a
      `REVENDEDOR`, `owner` poblado igual para admin y revendedor,
      404 (no 403) en `findOneOwned`/`update`/`softDelete`/`reactivate`
      sobre un recurso ajeno
- [x] Test e2e nuevo (`test/contacts-ownership.e2e-spec.ts`, 3 tests,
      **dos usuarios `REVENDEDOR` reales** con JWT real de principio a
      fin): Usuario B da 404 en `GET/:id`, `PATCH`, `DELETE`, `PATCH
      /:id/reactivate` sobre un contacto de Usuario A y nunca lo ve en
      su listado (con control positivo de que A sí lo ve/toca), `owner`
      poblado igual en `GET`/`GET :id` para dueño y admin (y nunca
      expone `password_hash`/`role`), y el admin ve y puede editar/
      desactivar/reactivar los contactos de ambos. Mismo cuidado que en
      Servicios: `userA`/`userB` se crean **una sola vez** en
      `beforeAll` y se reusan en los 3 `it` (cada uno crea sus propios
      contactos de prueba) — crear un usuario nuevo por test agota el
      rate limit de `POST /auth/login` (5/min) dentro del mismo archivo
- [x] Verificado: lint limpio, 171 tests unitarios y 39 e2e (suite
      completa del repo) en verde, build limpio

## Multi-usuario — Fase B3: Ownership en Cuentas + Perfiles (backend)

Mismo patrón que Servicios/Contactos (Fase B1/B2), con una arista nueva:
Cuentas referencia Servicio/Proveedor por FK, así que además de "es mío",
hace falta validar que esas referencias también lo sean. Perfiles no
recibe columna propia — su scoping deriva siempre de la Cuenta padre.

- [x] Columna `owner_id` (uuid, FK a `users`, `NOT NULL`) agregada a
      `accounts` — migración `AddAccountOwner`, mismo patrón nullable →
      backfill (admin más antiguo) → `NOT NULL` → FK. Corrida contra
      Postgres local; verificado que las 9 cuentas existentes quedaron
      con el admin como dueño. `profiles` **no** recibe columna nueva,
      tal como se pidió
- [x] `AccountsService`: misma separación que Servicios/Contactos —
      `findOne`/`findAll` sin scope (uso interno de `ProfilesService`,
      `SalesService`, `AccountingService`) vs. `findOneOwned`/
      `findAllOwned` (con scope + `owner: {id, name, email}` poblado,
      solo para el controller). El listado (`findAllOwned`) sigue sin
      exponer `claveServicio`/`claveCorreo` (Fase 2); el detalle
      (`findOneOwned`) sí las devuelve, como siempre, ahora sumando el
      `owner`. **Decisión no pedida explícitamente**: como el `findAll`
      sin scope no tenía ningún caller interno real (solo lo usaba el
      controller viejo), se dejó sin `perfilesCount` ni `owner` — toda
      esa lógica de enriquecimiento vive ahora en `findAllOwned`, el
      único consumidor real. Se mantiene el método igual por paridad de
      patrón con Servicios/Contactos, no por necesidad actual
- [x] `AccountsController` — mismo cambio que Servicios/Contactos: se
      sacó `RolesGuard`/`@Roles(ADMIN)` de la escritura; ahora un
      `REVENDEDOR` puede crear/editar/desactivar/reactivar cuentas
      propias, acotado por ownership
- [x] **Validación nueva** en `create()`/`update()`
      (`assertReferencesOwnedBy`): si el body trae `servicioId` y/o
      `proveedorId`, cada uno tiene que existir Y pertenecer al mismo
      `owner_id` que la cuenta — en creación, el del usuario
      autenticado; en edición, el que la cuenta **ya tiene**, sin
      importar quién esté editando (así el admin puede editar una
      cuenta ajena sin poder "cruzarle" el catálogo de otro
      revendedor). No coincide → 404, misma razón que "recurso ajeno"
- [x] `ProfilesService`: sin columna `ownerId` propia — `create`/
      `findAllOwned`/`findOneOwned`/`update`/`softDelete`/`reactivate`
      reciben `currentUser` y arrancan llamando a
      `accountsService.findOneOwned(accountId, currentUser)`, que ya
      resuelve el "join" contra `account.owner_id` (404 si la cuenta no
      existe o es ajena) sin duplicar la lógica de ownership en dos
      lugares. `findOne(accountId, id)` sin scope se mantiene para el
      uso interno de `SalesService`. `ProfilesController` — mismo
      cambio: `RolesGuard`/`@Roles(ADMIN)` fuera de la escritura
- [x] El límite de `pantallasMax` (Fase 2) no se tocó — sigue operando
      sobre `accountId`/`servicioId` igual que siempre, verificado con
      test de regresión explícito
- [x] Tests unitarios: `accounts.service.spec.ts` (22 tests) — incluye
      404 al crear/editar referenciando un servicio o proveedor de otro
      dueño, y el caso específico "el admin edita una cuenta de A
      poniéndole un servicio de A (OK) vs. uno de B (404), sin importar
      que quien edita sea el admin". `profiles.service.spec.ts` (13
      tests) — incluye que `findOneOwned` delega en
      `accountsService.findOneOwned` y nunca llega a buscar el perfil
      si la cuenta ya dio 404
- [x] Test e2e nuevo (`test/accounts-ownership.e2e-spec.ts`, 5 tests,
      **dos usuarios `REVENDEDOR` reales** con JWT real de punta a
      punta, `userA`/`userB` y sus Servicios base creados **una sola
      vez** en `beforeAll` por el mismo motivo de rate limit que
      Servicios/Contactos): Usuario B da 404 en `GET`/`PATCH`/`DELETE`
      sobre una Cuenta de Usuario A y nunca la ve en su listado; B da
      404 en `GET`/`PATCH` de un Perfil dentro de una Cuenta de A (y
      404 al listar los perfiles de esa cuenta); A intenta crear una
      Cuenta con un Servicio **o** un Proveedor de B → 404 en ambos
      casos, confirmado por SQL directo que no quedó ninguna fila
      creada; el admin reasigna el servicio de una cuenta de A a otro
      servicio de A (funciona) y luego a uno de B (404, la cuenta sigue
      con su servicio y dueño anteriores); regresión de `pantallasMax`
      con un servicio de límite 1 (segundo perfil da 409)
- [x] Probado manualmente contra el servidor local: 2 revendedores, cada
      uno con su propio Servicio y Cuenta — listado de cada uno sin la
      cuenta del otro, 404 en `GET`/`PATCH`/`DELETE` de B sobre la
      cuenta de A, y el caso específico de A intentando crear una
      cuenta con el servicio de B → 404 confirmado
      (`"Servicio ... no encontrado"`). **Nota de la prueba**: el rate
      limit de login (5/min) se disparó a mitad de la secuencia manual
      por la cantidad de logins de prueba — se esperó la ventana y se
      confirmó igual, mismo comportamiento ya cubierto por
      `test/auth-throttle.e2e-spec.ts`, no es un bug. Datos de prueba
      borrados después
- [x] Verificado: lint limpio, 188 tests unitarios y 44 e2e (suite
      completa del repo) en verde, build limpio

## Multi-usuario — Fase B4: Ownership en Ventas (backend)

Mismo patrón que Servicios/Contactos/Cuentas (Fase B1/B2/B3), extendido a
las 4 referencias de una Venta y a endpoints más allá del CRUD básico
(vencimiento, summary, renew). El módulo con más superficie hasta ahora.

- [x] Columna `owner_id` (uuid, FK a `users`, `NOT NULL`) agregada a
      `sales` — migración `AddSaleOwner`, mismo patrón nullable →
      backfill (admin más antiguo) → `NOT NULL` → FK. Corrida contra
      Postgres local; verificado que las 19 ventas existentes quedaron
      con el admin como dueño
- [x] **Bug potencial encontrado y corregido antes de que llegara a
      romper nada**: `ComboSalesService.create()` inserta las "ventas
      hijas" del combo directo en `sales` vía `manager.create(Sale,
      {...})`, dentro de su propia transacción — sin este fix, la
      primera venta de combo creada después de la migración habría
      violado el `NOT NULL` de `owner_id` y roto `POST
      /api/combo-sales` (y varios tests e2e de Combos) en producción.
      **Decisión no pedida explícitamente pero necesaria**: como
      ComboSales no está scopeado por dueño todavía (fuera de alcance
      de esta fase — el pedido fue específicamente "Ventas"), las
      ventas hijas heredan el `ownerId` de la Cuenta a la que quedan
      asignadas (ya validada dentro de `validarAsignacion`), mismo
      criterio que usaría `SalesService.create()` si el flujo pasara
      por ahí. Verificado que los 44 tests e2e existentes (incluidos
      los de Combos) siguen en verde con este fix
- [x] `SalesService`: misma separación que los módulos anteriores —
      `findOne`/`findAll`/`summary` sin scope (uso interno; a diferencia
      de Servicios/Contactos/Cuentas, hoy no tienen ningún caller real,
      se mantienen solo por paridad de patrón) vs. `findOneOwned`/
      `findAllOwned`/`summaryOwned` (con scope + `owner` poblado, para
      el controller)
- [x] `SalesController` — mismo cambio: se sacó `RolesGuard`/
      `@Roles(ADMIN)` de la escritura (incluido `POST /:id/renew`); un
      `REVENDEDOR` puede crear/editar/desactivar/reactivar/renovar
      ventas propias, acotado por ownership
- [x] `assertReferencesOwnedBy` extendida a las 4 referencias
      (`clienteId`, `cuentaId`, `servicioId` derivado, `perfilId` si
      viene): en creación, cada una debe pertenecer al usuario
      autenticado. **Aclaración importante sobre las 4**:
      `UpdateSaleDto` no permite reasignar clienteId/cuentaId/perfilId
      (decisión ya tomada en Fase 3 — reasignar implica desactivar y
      crear de nuevo), así que a diferencia de Cuentas, en `update()`
      no hay nada que revalidar por esa vía; el 404 sobre una venta
      ajena en `update()` ya lo cubre `findOneOwned`. Y `servicioId` no
      viene en el body — se deriva de `cuenta.servicioId` — así que por
      el invariante que ya garantiza `AccountsService.
      assertReferencesOwnedBy` (Fase B3), una cuenta **siempre** tiene
      un servicio del mismo dueño: ese chequeo es defensivo (no
      alcanzable con datos reales vía la API), verificado con
      repositorio mockeado en el test unitario, no con un escenario e2e
      (documentado en el propio archivo de test para que quede claro
      por qué)
- [x] Scoping extendido a **todos** los endpoints de lectura, no solo el
      CRUD: `findAllOwned` filtra por `ownerId` tanto en el camino
      simple (`find()`) como en el de `vencimiento` (`QueryBuilder`,
      `andWhere('sale.ownerId = :ownerId', ...)` + `leftJoin` con
      `owner` restringido a id/name/email); `summaryOwned` aplica el
      mismo filtro a los 3 conteos (`vencidas`/`porVencer`/`alDia`). Un
      `ADMIN` no tiene filtro en ninguno de los dos
- [x] **La exclusividad (`assertPerfilLibre`/`assertCuentaLibre`) se
      dejó deliberadamente sin scope de ownership** — sigue mirando
      toda la tabla `sales` sin filtrar por dueño, tal como pedía la
      tarea ("el admin no debería poder saltarse la exclusividad de un
      perfil ajeno"): un perfil ocupado por la venta de otro usuario
      sigue "ocupado" para cualquiera que pregunte, admin incluido.
      Verificado con test unitario (mock) y test e2e real (el admin
      intenta reactivar una venta cuyo perfil ya fue reocupado por otra
      venta → 409, no 200 ni 404)
- [x] Tests unitarios (`sales.service.spec.ts`, reescrito, 54 tests):
      todo lo anterior (Fase 3) sigue verde + 404 en las 4 referencias
      ajenas al crear (incluido el caso defensivo de `servicioId`), 404
      en `findOneOwned`/`update`/`softDelete`/`reactivate`/`renew`
      sobre venta ajena, `findAllOwned`/`summaryOwned` acotando por
      `ownerId` (con y sin `vencimiento`) solo para `REVENDEDOR`, y el
      caso de exclusividad "sin importar quién pregunta" con mock
- [x] Test e2e nuevo (`test/sales-ownership.e2e-spec.ts`, 8 tests, **dos
      usuarios `REVENDEDOR` reales** con JWT real de punta a punta,
      fixtures base — Contacto/Servicio/Cuenta/Perfil de cada uno —
      creadas **una sola vez** en `beforeAll`): los 3 casos base (`GET`/
      `PATCH`/`DELETE` ajeno → 404, listado nunca lo incluye), `POST
      /:id/renew` ajeno → 404, crear venta con `clienteId` ajeno → 404,
      con `cuentaId` ajena → 404, con `perfilId` de la cuenta de otro
      dueño → 404 (perfil que no pertenece a la cuenta indicada, mismo
      motivo por el que ya daba 404 antes de esta fase, ahora también
      cubre "ajeno"), `GET /sales?vencimiento=vencida` y `GET
      /sales/summary` de A nunca reflejan datos de B, la exclusividad
      del admin descrita arriba, y que el admin ve las ventas de ambos
      con `owner` poblado
- [x] Probado manualmente contra el servidor local: 2 revendedores, cada
      uno con su Contacto/Servicio/Cuenta/Perfil propios — A crea su
      venta (`V-00557`), confirmado 404 al intentar crear con el
      `clienteId` o la `cuentaId` de B, listado/`GET`/`PATCH`/`DELETE`
      de B sobre la venta de A dan 404 (o no la incluyen), y `summary`
      de cada uno refleja solo sus propias ventas vencidas. Mismo rate
      limit de login que en Fase B3 a mitad de la prueba — mismo
      comportamiento esperado, se esperó la ventana. Datos de prueba
      borrados después
- [x] Verificado: lint limpio, 208 tests unitarios y 52 e2e (suite
      completa del repo) en verde, build limpio

### Nota para Fase de Contabilidad (Payment) — no implementado todavía

Cuando llegue el turno de scopear Contabilidad/`Payment` por dueño: **no
agregar una columna `owner_id` a `payments`**. El dueño de un `Payment` se
deriva siempre de la `Sale` o `VentaCombo` a la que pertenece (`ventaId`
XOR `ventaComboId`, ya es today un invariante reforzado con un `CHECK`
en DB desde Fase 6), mismo criterio que Perfiles con Cuentas en Fase B3
(scoping vía join al padre, sin columna propia). **Actualización — Fase
B5**: el bloqueo que describía este párrafo (ComboSales sin `ownerId`
propio) ya no aplica — `VentaCombo` tiene su propio `ownerId` desde Fase
B5, así que el dueño de un `Payment` ya puede derivarse de `Sale` **o**
`VentaCombo`, ambas con `ownerId` propio. Evaluar cuándo se llega a esta
fase si conviene además exponer un scoping explícito en
`AccountingService` (los reportes agregan sobre todas las filas sin
concepto de "usuario que pregunta" hoy), pero la derivación del dueño en
sí ya no tiene nada pendiente.

## Multi-usuario — Fase B5: Ownership en Combos + Ventas Combo (backend)

Mismo patrón que Servicios/Contactos/Cuentas/Ventas (Fase B1/B2/B3/B4),
extendido a los dos módulos de Fase 6 (Combos) que habían quedado fuera de
alcance explícitamente en ese momento. Esto desbloquea la nota de
Contabilidad de arriba: con `VentaCombo.ownerId` propio, el dueño de un
`Payment` ya puede derivarse de `Sale` **o** `VentaCombo` indistintamente.

- [x] Columna `owner_id` (uuid, FK a `users`, `NOT NULL`) agregada a
      `combos` (migración `AddComboOwner`) y a `combo_sales` (migración
      `AddComboSaleOwner`) — mismo patrón nullable → backfill (admin más
      antiguo) → `NOT NULL` → FK que el resto de módulos. Corridas contra
      Postgres local; verificado que los 4 combos y las 3 combo_sales
      existentes quedaron con el admin como dueño
- [x] `CombosService`: misma separación que los módulos anteriores —
      `findOne`/`findAll` sin scope (uso interno de `ComboSalesService`,
      que valida `comboId` sin ningún concepto de usuario HTTP) vs.
      `findOneOwned`/`findAllOwned` (con scope + `owner: {id, name,
      email}` poblado, solo para el controller)
- [x] `CombosController` — se sacó `RolesGuard`/`@Roles(ADMIN)` de la
      escritura: ahora un `REVENDEDOR` puede crear/editar/desactivar/
      reactivar combos propios, acotado por ownership, igual que
      Servicios/Contactos/Cuentas/Ventas
- [x] **Validación nueva** (`assertServiciosOwnedBy`): cada `Service`
      dentro del many-to-many `servicios` de un Combo debe pertenecer al
      mismo `ownerId` — un combo no puede mezclar catálogo de dueños
      distintos. En `create()` se valida contra el usuario autenticado; en
      `update()`, contra el `ownerId` que el combo **ya tiene**, sin
      importar quién esté editando (mismo criterio que
      `AccountsService.assertReferencesOwnedBy` con servicioId/proveedorId
      en Fase B3 — el admin puede editar un combo ajeno sin poder
      "cruzarle" el catálogo de otro revendedor). No coincide → 404
- [x] `ComboSalesService`: misma separación — `findOne`/`findAll` sin
      scope (uso interno; hoy sin caller real, se mantienen por paridad de
      patrón) vs. `findOneOwned`/`findAllOwned` (con scope + owner
      poblado). `ComboSalesController` — mismo cambio, `RolesGuard`/
      `@Roles(ADMIN)` fuera de toda la escritura (incluidos `renew` y
      `reactivate`)
- [x] `assertReferencesOwnedBy` (clienteId + comboId, corre **antes** de
      abrir la transacción) y la validación por asignación dentro de
      `validarAsignacion` (servicioId defensivo + cuentaId, corren
      **dentro** de la transacción, sobre el `EntityManager`, mismo motivo
      que en Fase 6 — los repositorios inyectados de otros servicios no
      participarían del rollback): todas deben pertenecer al mismo
      `ownerId` que la `VentaCombo` que se está creando (el usuario
      autenticado). El perfil de una asignación no tiene columna
      `ownerId` propia — se valida por transitividad a través de la
      cuenta, igual que Perfiles con Cuentas en Fase B3
- [x] Las Sales hijas creadas dentro de la transacción reciben
      `ownerId: currentUser.id` **explícito**, no derivado de
      `cuenta.ownerId` (a diferencia del fix de Fase B4, que sí lo derivaba
      de la cuenta porque ComboSales no estaba scopeado todavía) — en la
      práctica ambos valores siempre coinciden gracias a la validación del
      punto anterior, pero la venta hija no depende de esa coincidencia
      para tener el dueño correcto
- [x] **El punto de mayor riesgo de esta fase, resuelto explícitamente**:
      la exclusividad reimplementada dentro de `validarAsignacion` (los
      chequeos `ocupado`) y en `assertAsignacionSigueLibre` (usada por
      `reactivate`) siguen el MISMO criterio que en Ventas — miran TODA la
      tabla `sales`, nunca filtradas por `ownerId` de quien pregunta.
      Comentario extenso agregado junto a `validarAsignacion` explicando
      por qué la exclusividad es la EXCEPCIÓN deliberada a "todo se filtra
      por dueño" que rige el resto del servicio: una cuenta/perfil de
      streaming es un recurso físico compartido, no algo que se duplique
      por usuario — si se filtrara por owner, dos revendedores distintos
      (o el admin) podrían vender el mismo perfil real a la vez sin que el
      sistema lo detecte
- [x] Tests unitarios: `combos.service.spec.ts` (reescrito) — creación con
      `ownerId` del usuario autenticado, mezclar un servicio propio con
      uno ajeno en `create()` da `NotFoundException` sin llamar a
      `save()`, `update()` revalida contra el `ownerId` del combo (no de
      quien edita, incluido el caso "admin reasignando un servicio
      ajeno"), 404 en `findOneOwned`/`softDelete`/`reactivate` sobre
      recurso ajeno. `combo-sales.service.spec.ts` (reescrito) —
      clienteId/comboId ajenos dan 404 sin abrir la transacción; cuenta de
      una asignación ajena da 404 dentro de la transacción sin llamar a
      `save()`; el chequeo defensivo de servicioId (mock, no alcanzable
      con datos reales, mismo criterio documentado que el análogo en
      Ventas); las Sales hijas se crean con el `ownerId` explícito del
      usuario autenticado; 404 en `findOneOwned`/`update`/`softDelete`/
      `reactivate`/`renew` sobre VentaCombo ajena; y el caso de
      exclusividad sin scope con el **admin** reactivando una VentaCombo
      ajena cuyo perfil fue reocupado (sigue dando 409, no se salta la
      validación); los tests de rollback y camino feliz de Fase 6 siguen
      verdes con el `ownerId` de por medio
- [x] Tests e2e nuevos, **dos usuarios `REVENDEDOR` reales** con JWT real
      de punta a punta (mismo cuidado de crear usuarios/fixtures una sola
      vez en `beforeAll` que en Fase B1-B4, por el rate limit de login):
      `test/combos-ownership.e2e-spec.ts` (4 tests) — los 3 casos base
      (ver/editar/desactivar ajeno → 404, listado nunca lo incluye,
      control positivo, admin ve/edita/desactiva ambos), crear un combo
      mezclando un servicio propio con uno ajeno → 404 confirmado por
      conteo de `combos` idéntico antes/después, y reasignar un servicio
      ajeno en `update()` → 404 sin importar que edite el admin.
      `test/combo-sales-ownership.e2e-spec.ts` (8 tests) — los 3 casos
      base (incluye `renew`), crear con clienteId ajeno / comboId ajeno /
      cuenta de una asignación ajena → 404 con conteos de `combo_sales`/
      `sales`/`payments` idénticos antes/después (rollback completo, mismo
      rigor que el test de Fase 6), **el mismo nivel de asignación
      protegido en Cuentas/Perfiles en Fase B3**: crear con un `perfilId`
      que pertenece a la cuenta de otro dueño (con la `cuentaId` enviada sí
      propia) → 404 y rollback completo — requirió fixtures aparte con un
      servicio `CON_PERFILES` real, porque el resto de los e2e de Combos
      nunca habían ejercitado ese camino (solo `SIN_PERFILES` hasta ahora);
      el caso de exclusividad sin scope verificado tanto con el propio
      dueño como con el admin (ambos dan 409, ninguno se la salta), una
      repetición explícita del escenario de rollback transaccional de Fase
      6 con ownership de por medio (conteos idénticos + cuenta que sí
      validó sin `clienteId`), y el admin viendo las VentaCombo de ambos
      con `owner` poblado
- [x] Probado manualmente contra el servidor local: 2 revendedores, cada
      uno con su propio Combo completo (2 servicios, 1 cliente, 2
      cuentas) — confirmado 404 al mezclar un servicio de B en un combo de
      A (`"Servicio ... no encontrado"`), aislamiento total en
      `GET`/`PATCH`/`DELETE` de combos y de VentaCombo entre A y B (con
      control positivo y admin viendo ambos con `owner` poblado), 404 al
      crear una VentaCombo con `clienteId` de B, y el rollback
      transaccional intacto: ComboSale con la 2da asignación ocupada por
      una venta suelta → 409, conteos de `combo_sales`/`sales`/`payments`
      idénticos antes y después, y la cuenta de la 1ra asignación (que sí
      había validado) confirmada sin `clienteId`. Datos de prueba
      borrados después
- [x] Verificado: lint limpio, 231 tests unitarios y 64 e2e (suite
      completa del repo) en verde, build limpio

## Multi-usuario — Fase B6: Ownership en Gastos (backend)

Mismo patrón que Servicios/Contactos (Fase B1/B2) — módulo simple, sin
referencias cruzadas que validar (a diferencia de Cuentas/Ventas/Combos).

- [x] Columna `owner_id` (uuid, FK a `users`, `NOT NULL`) agregada a
      `expenses` — migración `AddExpenseOwner`, mismo patrón nullable →
      backfill (admin más antiguo) → `NOT NULL` → FK que el resto de
      módulos. Corrida contra Postgres local; verificado que los 5 gastos
      existentes quedaron con el admin como dueño
- [x] `ExpensesService`: misma separación que los módulos anteriores —
      `findOne`/`findAll` sin scope (uso interno de `AccountingService`,
      vía `sumMontoPEN`/`sumMontoPENByMetodoPago`/`sumMontoPENByPeriodo`,
      que hoy agregan sobre todos los gastos sin ningún concepto de
      usuario HTTP — Contabilidad sigue sin scopear, ver nota de la Fase
      B5) vs. `findOneOwned`/`findAllOwned` (con scope + `owner: {id,
      name, email}` poblado, solo para el controller)
- [x] `ExpensesController` — se sacó `RolesGuard`/`@Roles(ADMIN)` de
      `POST`/`PATCH`/`DELETE`/`reactivate` (antes admin-only): ahora un
      `REVENDEDOR` puede crear/editar/desactivar/reactivar gastos propios,
      acotado por ownership, igual que Servicios/Contactos/Cuentas/
      Ventas/Combos
- [x] `create()` toma el `ownerId` del JWT decodificado, nunca del body.
      `findOneOwned`/`update`/`softDelete`/`reactivate` dan 404 (no 403)
      sobre un gasto ajeno
- [x] Tests unitarios (`expenses.service.spec.ts`, reescrito, 10 nuevos):
      creación con `ownerId` del usuario autenticado, `findAllOwned`
      acota por `ownerId` solo a `REVENDEDOR`, `owner` poblado igual para
      admin y revendedor, 404 (no 403) en `findOneOwned`/`update`/
      `softDelete`/`reactivate` sobre un gasto ajeno; el cálculo de
      `montoPEN` (Fase 5) sigue verde sin cambios
- [x] Test e2e nuevo (`test/expenses-ownership.e2e-spec.ts`, 3 tests,
      **dos usuarios `REVENDEDOR` reales** con JWT real de punta a punta):
      los 3 casos base (`GET`/`PATCH`/`DELETE`/`reactivate` ajeno → 404,
      listado nunca lo incluye, control positivo), `owner` poblado igual
      para el dueño y el admin (sin `password_hash`/`role`), y el admin
      viendo y tocando los gastos de ambos
- [x] Probado manualmente contra el servidor local: 2 revendedores, cada
      uno creó un gasto propio — confirmado 404 de B sobre el gasto de A
      en `GET`/`PATCH`/`DELETE`, que el listado de cada uno no incluye el
      del otro (verificado en ambas direcciones), y que el admin ve el
      gasto de A con `owner` poblado. Datos de prueba borrados después
- [x] Verificado: lint limpio, 241 tests unitarios y 67 e2e (suite
      completa del repo) en verde, build limpio

## Multi-usuario — Fase B7: Ownership en Payment + Contabilidad (backend)

Cierra la nota pendiente de la Fase B5: `Payment` no recibe columna
`owner_id` propia — su dueño se deriva siempre de `Sale.ownerId` (vía
`venta_id`) o `VentaCombo.ownerId` (vía `venta_combo_id`), nunca ambos a
la vez (el `CHECK` constraint de Fase 6 ya lo garantiza). Es el único
módulo de ownership hasta ahora sin migración propia.

- [x] `PaymentsService`: los 4 métodos de agregación
      (`sumMontoPEN`/`sumMontoPENByServicio`/`sumMontoPENByMetodoPago`/
      `sumMontoPENByPeriodo`) reciben un `ownerId?: string` opcional
      (`undefined` = sin filtro). `sumMontoPEN`/`sumMontoPENByMetodoPago`/
      `sumMontoPENByPeriodo` agregan un `leftJoin` a `payment.venta` Y a
      `payment.ventaCombo`, filtrando `(venta.ownerId = :ownerId OR
      ventaCombo.ownerId = :ownerId)` — un Payment nunca tiene ambas
      relaciones pobladas, así que el OR nunca "duplica" un pago.
      `sumMontoPENByServicio` ya hacía `innerJoin('payment.venta', ...)`
      (los pagos de combo no tienen `servicioId` propio, mismo criterio de
      Fase 6 — no contribuyen al desglose por servicio); el filtro ahí va
      directo sobre `venta.ownerId`, sin necesitar `ventaCombo`
- [x] `AccountsService.sumCosto`/`sumCostoByServicio` y
      `ExpensesService.sumMontoPEN`/`sumMontoPENByMetodoPago`/
      `sumMontoPENByPeriodo` — mismo criterio, `ownerId?: string` opcional
      agregado como `andWhere` directo (`Account`/`Expense` sí tienen
      `ownerId` propio desde Fase B3/B6)
- [x] `AccountingService.resolveOwnerId` (privado, nuevo): resuelve el
      `ownerId` efectivo para los 4 reportes a partir del usuario
      autenticado y el query param opcional `viewOwnerId` —
      **REVENDEDOR**: siempre su propio id, `viewOwnerId` se ignora en
      silencio sin importar el valor (nunca se le confirma ni con un
      error que la opción existe); **ADMIN sin `viewOwnerId`**: por
      defecto ve exactamente lo mismo que vería como revendedor (solo lo
      suyo) — Contabilidad nunca expone el negocio completo por
      accidente; **ADMIN con `viewOwnerId=<uuid>`**: filtra por ese dueño
      en vez del propio (vista "ver como", pensada para que el frontend
      arme un selector con `GET /api/users`, ya existente desde Fase A —
      no hizo falta ningún endpoint nuevo); **ADMIN con
      `viewOwnerId=all`**: sin filtro, la vista de "todo el negocio"
      sumando todos los usuarios
- [x] `QueryRangeDto` (compartido por los 4 endpoints, `QueryTimelineDto`
      lo extiende) — `viewOwnerId?: string` opcional, `@IsString()` en vez
      de `@IsUUID()` porque el literal `"all"` también es un valor válido.
      `AccountingController` — sin `RolesGuard`/`@Roles`: todo usuario
      autenticado puede pedir los 4 endpoints, cada uno ve lo que le
      corresponde según su rol y el `viewOwnerId`, no según un guard
- [x] Tests unitarios: `accounting.service.spec.ts` (reescrito, 4 nuevos)
      — cubre las 4 ramas de `resolveOwnerId` explícitamente (REVENDEDOR
      ignora `viewOwnerId` sin importar el valor incluido `"all"`, ADMIN
      sin `viewOwnerId` ve solo lo suyo, ADMIN con uuid ve ese dueño,
      ADMIN con `"all"` no filtra); los tests existentes de composición de
      los 4 reportes (ganancia/neto/ganancia calculados) se actualizaron
      para pasar `currentUser` y siguen verdes sin cambios en su lógica
- [x] Test e2e nuevo (`test/accounting-ownership.e2e-spec.ts`, 10 tests,
      **dos usuarios `REVENDEDOR` reales + admin** con JWT real de punta a
      punta, fechas fijas exactas por escenario — mismo criterio que
      `accounting.e2e-spec.ts`, no por delta): escenario simple (A/B/admin
      cada uno con su cuenta/venta/gasto) — `summary`/`by-service` de A
      nunca incluyen los números de B (montos exactos, no solo "distinto
      de cero"), admin sin `viewOwnerId` ve solo lo suyo, admin con
      `viewOwnerId=<id de A>` ve exactamente los números de A, admin con
      `viewOwnerId=all` ve la suma exacta de los 3, y un REVENDEDOR
      mandando `viewOwnerId` (el propio, el de otro, o `"all"`) siempre ve
      solo lo suyo en los 3 casos. Escenario con Venta de Combo aparte
      (fecha distinta, aislado): confirma que `summary` scopea también el
      ingreso que llega vía `venta_combo_id` (no solo `venta_id`), que
      `by-service` sigue sin atribuirle ingresos al combo (solo
      `inversion` por cada cuenta/servicio involucrado, igual que antes de
      esta fase) sin dejar de estar bien scopeado, y que el admin ve ese
      mismo combo con `viewOwnerId=<id de A>` y sumado en `viewOwnerId=all`
- [x] Probado manualmente contra el servidor local: 2 revendedores + admin,
      cada uno con su propia cuenta/venta/gasto en una fecha fija — los 4
      escenarios confirmados por número exacto con `curl` (summary de A,
      de B, de admin sin `viewOwnerId`, admin con `viewOwnerId=<A>`, admin
      con `viewOwnerId=all` sumando los 3, y A intentando mandar
      `viewOwnerId` propio/ajeno/`all` sin que cambie nada en su
      resultado), más `by-service` y `timeline` puntuales. Datos de
      prueba borrados después
- [x] Verificado: lint limpio, 245 tests unitarios y 77 e2e (suite
      completa del repo) en verde, build limpio

## Multi-usuario — Frontend: Gestión de Usuarios (`nocturne-web`)

Cierra el lado de frontend de la Fase A (backend, `/api/users`, admin-only,
ya en producción). Vive en el repo `nocturne-web`, no en este.

- [x] `AuthenticatedUser.role` pasó de `string` a un enum `UserRole`
      (`core/auth/auth.ts`, mismos valores que el backend:
      `admin`/`revendedor`) — antes no había ningún lugar del frontend que
      necesitara distinguir el rol; ahora sí (el sidebar y el propio
      módulo de Usuarios)
- [x] `AdminLayout` — `navItems` pasó de array estático a un `computed()`
      que filtra por `item.role` contra `auth.currentUser()?.role`; el
      item "Usuarios" (`/users`) es el único con `role: UserRole.ADMIN`
      hoy, así que es el único que un `REVENDEDOR` nunca ve en su sidebar
- [x] `features/users/` — mismo patrón de CRUD que Servicios/Contactos:
      `usuario.model.ts`, `usuarios-api.ts`, `usuarios-list/`,
      `usuario-form-dialog/`. **Diferencia importante con el resto**:
      `GET /api/users` no acepta ningún filtro por query (a diferencia de
      Servicios/Contactos/etc.) — el filtro Activo/Inactivo/Todos se
      implementó enteramente del lado del cliente, sobre la lista
      completa ya traída, con un `computed()` que depende de una señal
      `activoFilter` (tuvo que ser señal, no un campo plano, para que el
      `computed` reaccione — quedó documentado en el propio código tras
      un test que lo detectó)
- [x] Protecciones del propio usuario, reflejando las que ya tiene el
      backend (Fase A): en el modal de editar, si la fila es la del
      usuario logueado, el select de Rol queda deshabilitado (con hint) y
      el payload de `PATCH` nunca incluye la clave `role` en absoluto —
      no alcanza con enviar el mismo valor, el backend da 403 si `role`
      viene definido y el id coincide con el usuario autenticado, sea
      cual sea el valor. En el listado, esa misma fila muestra el botón
      "Desactivar" deshabilitado con tooltip ("No puedes desactivarte a
      ti mismo") en vez de ocultarlo o dejarlo clickeable
- [x] El email no es editable (el backend no lo permite, `UpdateUserDto`
      no tiene ese campo): el input queda deshabilitado en modo edición,
      con hint explicando por qué. La contraseña es obligatoria al crear
      y opcional al editar ("Nueva contraseña", vacío = no cambiarla)
- [x] `GET /api/users` con un `REVENDEDOR` (llegando manualmente a
      `/users` aunque el link esté oculto) da 403 real del backend — se
      maneja con un panel dedicado ("Acceso restringido") en vez de dejar
      la tabla vacía en silencio o romper la pantalla
- [x] Tests de componente (17 nuevos, 222 en total en `nocturne-web`):
      `usuario-form-dialog.spec.ts` — creación, edición (incluye que el
      email queda deshabilitado), que editar a otro usuario sí manda
      `role`, que editarse a uno mismo nunca manda `role` (ni con el
      mismo valor), contraseña opcional al editar / obligatoria al crear.
      `usuarios-list.spec.ts` — filtro activo/inactivo/todos calculado en
      el cliente, 403 al cargar muestra el panel de acceso restringido
      (no el mensaje de error genérico), desactivar/reactivar,
      `isSelf()` identificando la fila propia. `admin-layout.spec.ts` —
      un ADMIN ve "Usuarios" en el sidebar (en el array `navItems()` y en
      el DOM), un REVENDEDOR no lo ve en ninguno de los dos
- [x] Verificado: lint limpio, build de producción limpio, 222 tests de
      componente (`ng test`) en verde
- [ ] **Verificación visual con Playwright — pendiente, no se pudo hacer
      en esta sesión**: el sandbox no tiene Chrome/Chromium instalado, y
      `npx playwright install chrome` intenta instalar dependencias de
      sistema vía `sudo` sin tener una terminal/password disponible
      (falla incluso después de instalar manualmente algunas librerías
      que pedía). Fedora tiene soporte limitado para los navegadores que
      Playwright puede instalar por su cuenta — no vale la pena seguir
      persiguiendo dependencias del SO una por una. **Queda pendiente
      probar a mano** (o desde un entorno con Chrome disponible) el flujo
      completo: login admin → crear un `REVENDEDOR` en `/users` → confirmar
      que aparece en la lista → editarlo (cambiar nombre) → cerrar sesión
      → loguearse con ese `REVENDEDOR` → confirmar que "Usuarios" no
      aparece en su sidebar → navegar manualmente a `/users` y confirmar
      el panel de "Acceso restringido" (no pantalla en blanco) → volver a
      loguear como admin → desactivar/reactivar el usuario de prueba y
      confirmar el estado en la lista

## Multi-usuario — Frontend: Mostrar dueño + selector "ver como" (`nocturne-web`)

Cierra el lado visual de las Fases B1-B7 (backend, `owner`/`ownerId` y
`viewOwnerId` ya en producción): hasta ahora el ownership existía en la
API pero un ADMIN no tenía forma de ver de quién era cada fila ni de
mirar la contabilidad de un revendedor puntual.

- [x] Columna "Dueño" (nombre, con el email como tooltip) en las tablas
      de Servicios, Contactos, Cuentas, Ventas, Combos, Ventas Combo y
      Gastos — **solo visible para ADMIN**, mismo patrón que ya existía
      para el link de Usuarios en el sidebar (`computed()` sobre
      `auth.currentUser()?.role`, no un `*ngIf` estático): un REVENDEDOR
      nunca ve esta columna porque todo lo que ve ya es suyo, mostrarla
      sería ruido. En `CuentasList` (la única lista sin columna
      "acciones") se agregó igual, antes de "Estado"
- [x] Cabecera de Cuenta detail y Venta Combo detail: fila "Dueño" con el
      mismo criterio admin-only, apoyada en el `owner` que ya viaja en
      `GET /accounts/:id` y `GET /combo-sales/:id`
- [x] Modelos de frontend (`Servicio`, `Contacto`, `Cuenta`,
      `CuentaListItem`, `Venta`, `Combo`, `VentaCombo`, `Gasto`) ganan un
      campo `owner: Owner` (`id`/`name`/`email`, tipo nuevo en
      `shared/owner.model.ts`) — refleja el `owner` que el backend ya
      agregaba desde las Fases B1-B7, pero que el frontend todavía no
      tipaba ni consumía
- [x] Contabilidad — selector "Viendo" arriba de los filtros de fecha,
      **solo para ADMIN**: "Mi negocio" (default, no manda `viewOwnerId`,
      así el admin entra viendo lo mismo que vería siendo revendedor),
      "Todo el negocio" (`viewOwnerId=all`), y un option por cada usuario
      de `GET /api/users` (`viewOwnerId=<id>`). Cambiar la selección
      refresca los 4 reportes (`summary`, `by-service`,
      `by-payment-method`, `timeline`) con el filtro nuevo y sincroniza el
      query param `viewOwnerId` de la URL (`Router.navigate` con
      `queryParamsHandling: 'merge'`, sin recargar la página) para que la
      selección sobreviva un refresh
- [x] Tests de componente (nuevos, 246 en total en `nocturne-web`): por
      cada una de las 7 listas y las 2 páginas de detalle, un caso que
      confirma la columna/fila "Dueño" visible + poblada para un ADMIN
      simulado y otro que confirma que no existe en absoluto en el DOM
      (`.mat-column-dueno` / texto "Dueño") para un REVENDEDOR simulado.
      En Contabilidad: el selector no aparece para REVENDEDOR, un ADMIN
      lo ve con "Mi negocio" por defecto y dispara `usuariosApi.list()`,
      cambiar a "Todo el negocio" o a un usuario específico manda las 4
      llamadas con el `viewOwnerId` correcto, y el valor inicial se lee
      del query param de la URL (sobrevive un refresh)
- [x] Verificado: lint limpio, build de producción limpio, 246 tests de
      componente (`ng test`) en verde
- [ ] **Verificación visual con Playwright — pendiente, mismo bloqueo que
      la fase anterior (sandbox sin Chrome/Chromium en Fedora, no vale la
      pena seguir persiguiendo dependencias del SO)**. Queda pendiente
      probar a mano (o desde un entorno con Chrome disponible) el flujo
      completo: loguear como admin → abrir Servicios (o cualquier otra de
      las 7 listas) y confirmar que la columna "Dueño" aparece poblada
      con el nombre correcto y el email en el tooltip → abrir el detalle
      de una Cuenta y de una Venta Combo y confirmar la fila "Dueño" en la
      cabecera → cerrar sesión y loguear como un `REVENDEDOR` → confirmar
      que ninguna de las 7 listas ni los 2 detalles muestran la columna o
      fila "Dueño" → volver a loguear como admin → abrir Contabilidad y
      confirmar el selector "Viendo" con "Mi negocio" por defecto → elegir
      "Todo el negocio" y confirmar que los 4 reportes cambian y que la
      URL agrega `?viewOwnerId=all` → refrescar la página (F5) y confirmar
      que la selección "Todo el negocio" sigue activa → elegir un
      revendedor específico por nombre y confirmar que los reportes
      cambian a los de ese usuario y la URL refleja su id → cerrar sesión
      y loguear como ese mismo `REVENDEDOR` → confirmar que Contabilidad
      no muestra el selector "Viendo" en absoluto

## Fase 7 — Extras

- [ ] Notificaciones por WhatsApp
- [ ] Tasas de cambio en vivo
- [ ] Backups automáticos

## Seguridad — Autenticación robusta (backend)

No ligada a una fase numerada del roadmap: refuerza el `AuthModule` de la
Fase 0 en vez de agregar una feature nueva.

- [x] `@nestjs/throttler` en `POST /api/auth/login` (`LoginThrottlerGuard`,
      `AuthController`) — máximo 5 intentos por minuto por IP, `429` con
      mensaje claro (`"Demasiados intentos de inicio de sesión..."`).
      **No es global**: no se registra `ThrottlerGuard` como `APP_GUARD`,
      solo se aplica con `@UseGuards()` en esa ruta puntual
- [x] `main.ts` configura `app.set('trust proxy', 1)` (`NestExpressApplication`)
      — Railway pone un único proxy delante de la API; sin esto, Express ve
      la IP del proxy para **todas** las requests y el rate limit por IP
      terminaría siendo, en la práctica, global para todos los clientes
- [x] Entidad `RefreshToken` (`src/auth/refresh-token.entity.ts`, tabla
      `refresh_tokens`) — `userId` (FK a `users`), `tokenHash`, `expiresAt`,
      `revoked`, `createdAt`. **Decisión de diseño no pedida explícitamente**:
      el valor real del refresh token nunca se guarda ni se puede
      reconstruir; se genera un secreto aleatorio (`crypto.randomBytes`), se
      guarda solo su hash (bcrypt, mismo criterio que `User.passwordHash`),
      y al cliente se le devuelve `"${id}:${secreto}"`. El `id` (de la fila
      recién creada) actúa de selector para encontrar el registro en O(1)
      por PK en vez de tener que comparar el secreto contra el hash de
      todos los refresh tokens activos con `bcrypt.compare`
- [x] **Bug encontrado corrigiendo la propia feature**: `expiresAt` se
      declaró primero como `timestamp` (sin zona horaria). Postgres en UTC
      + Node corriendo en una zona con offset negativo (Perú, UTC-5) hace
      que `pg` parsee ese valor como si fuera hora de pared **local**, no
      UTC — un token "vencido hace 1 hora" se leía como vencido varias
      horas en el **futuro**, y `POST /auth/refresh` lo aceptaba como
      válido. Se corrigió cambiando la columna a `timestamptz`
      (`TIMESTAMP WITH TIME ZONE`), que guarda un instante absoluto y no
      depende de la zona horaria de quien lo lee. Encontrado por el propio
      test e2e de token vencido, antes de llegar a producción
- [x] `ACCESS_TOKEN_EXPIRES_IN` (reemplaza `JWT_EXPIRES_IN`, default `15m`)
      y `REFRESH_TOKEN_EXPIRES_IN` (nueva, default `30d`) — `.env.example`,
      `README.md` y `.github/workflows/ci.yml` actualizados
- [x] `POST /api/auth/login` devuelve `{ accessToken, refreshToken, user }`
- [x] `POST /api/auth/refresh` — valida el refresh token recibido (existe,
      no vencido, no revocado) y **rota**: revoca el usado y crea uno
      nuevo, devuelve `{ accessToken, refreshToken }` nuevos. Inválido/
      vencido/revocado → `401` con mensaje claro ("Sesión expirada, inicia
      sesión de nuevo")
- [x] `POST /api/auth/logout` — protegido con `JwtAuthGuard` (hay que estar
      logueado para cerrar sesión), revoca el refresh token recibido;
      idempotente si ya no existe o ya estaba revocado
- [x] Migración `AddRefreshTokens` — crea `refresh_tokens` con su FK a
      `users`; el generador también proponía un DROP+ADD de
      `CHK_payments_venta_xor_combo` (falso positivo de cómo Postgres
      normaliza el texto de esa expresión vs. cómo TypeORM la arma desde la
      entidad, sin cambio real), se descartó a mano. Corrida contra
      Postgres local
- [x] Tests unitarios (`auth.service.spec.ts`, `refresh-tokens.service.spec.ts`):
      login devuelve ambos tokens; `refresh` rota y firma un access token
      nuevo; rechaza (401) token inválido/vencido/revocado/con secreto que
      no matchea el hash, y un formato de token malformado sin tocar la
      base de datos; `logout` delega la revocación y es idempotente si el
      token no existe
- [x] Tests e2e nuevos — `test/auth.e2e-spec.ts`: login con ambos tokens,
      rotación (el token viejo deja de servir, reusarlo da 401), token
      vencido (insertado directo por SQL con `expires_at` en el pasado,
      sin depender de esperar el TTL real) da 401, logout revoca y el
      token ya no sirve para refresh, logout sin access token válido da
      401. `test/auth-throttle.e2e-spec.ts` (aparte, con su propia
      instancia de app/`ThrottlerStorage` para no competir por la ventana
      de 5/min con los logins del otro archivo): 5 intentos pasan, el 6to
      da 429 con el mensaje del rate limit
- [x] Probado manualmente contra el servidor local con
      `ACCESS_TOKEN_EXPIRES_IN=10s`: login → `GET /auth/profile` con el
      access token fresco (200) → esperar el vencimiento → mismo access
      token ya da 401 → `POST /auth/refresh` con el refresh token da un
      par nuevo → el access token nuevo funciona en `/auth/profile` (200)
      → reusar el refresh token viejo da 401 ("Sesión expirada, inicia
      sesión de nuevo"). También probado el rate limit (intentos de login
      fallidos consecutivos desde la misma IP terminan en 429) y logout
      (revoca, el refresh token ya no sirve). `ACCESS_TOKEN_EXPIRES_IN`
      restaurado a `15m` en `.env` después de la prueba

## Rediseño visual — Fase 1: Sistema de diseño + layout compartido (`nocturne-web`) — ✅ completa, commiteada y pusheada a `origin/main` (2026-09-17)

Cambio puramente visual, sin tocar lógica ni endpoints. Todo vive en
`nocturne-web/src/styles.scss` (única hoja de estilos global, ver
`angular.json`) más el layout compartido
(`src/app/layout/admin-layout/`). Las pantallas individuales (Servicios,
Ventas, etc.) no se tocaron — heredan lo de abajo automáticamente vía los
system-tokens de Material y las reglas globales de botones/tarjetas/tablas.
**No commiteado todavía** — a la espera de que se revise visualmente.

- [x] Tokens de fondo (azul-marino oscuro, 3 niveles) en `:root` de
      `styles.scss`:
      - `--nc-bg: #0a0e17` (fondo base — body, sidenav, header)
      - `--nc-surface: #131826` (tarjetas, un tono más claro)
      - `--nc-surface-elevated: #1c2333` (hover / superficies elevadas:
        menús, sidebar item activo)
      - `--nc-border: #232b40` (borde sutil de tarjetas/sidebar/header)
- [x] Tokens de texto (nunca blanco/negro puro):
      - `--nc-text-primary: #e6e9f0`
      - `--nc-text-secondary: #94a3b8`
- [x] Tokens de acento (degradado azul eléctrico → verde-turquesa):
      - `--nc-accent-blue: #3b82f6`, `--nc-accent-cyan: #06b6d4`,
        `--nc-accent-green: #10b981`
      - `--nc-gradient-primary: linear-gradient(135deg, #3b82f6 0%, #06b6d4 50%, #10b981 100%)`
        — fondo de botones primarios, glow del sidebar activo, wordmark
      - `--nc-accent-solid: #14b8a6` — color intermedio sólido (texto/
        íconos donde no aplica un degradado); es el valor detrás de
        `--mat-sys-primary`
      - `--nc-glow-primary` — `box-shadow` de glow sutil para hover
- [x] Tipografía: Inter (400/500/600/700) vía Google Fonts
      (`src/index.html`) + `typography: Inter` en el `mat.theme()` de
      `styles.scss`, reemplazando Roboto. JetBrains Mono (400/500)
      importada e importada como token `--nc-font-mono` — **definida pero
      sin aplicar todavía**: los códigos de venta/combo (V-00001,
      C-00001) viven en pantallas individuales (Ventas, Combos), así que
      su propagación queda para la Fase 2
- [x] **Decisión de diseño — qué tokens M3 se remapean y cuáles no**: los
      colores de estado Activo/Inactivo (mat-chip con/sin `highlighted`,
      salen de `--mat-sys-secondary-container`/`on-secondary-container`),
      Vencida (`--mat-sys-error`) y Por vencer (`#b8860b` hardcodeado en
      `dashboard.scss`) dependen de tokens que **no se tocaron a
      propósito**: `--mat-sys-secondary*`, `--mat-sys-tertiary*` y
      `--mat-sys-error*` quedan exactamente como los generaba el
      `mat.theme()` original. Solo se remapearon superficie/fondo/texto
      neutro y `--mat-sys-primary*` (que antes ya alimentaba "Al día" en
      el dashboard y no es uno de los 4 estados protegidos)
- [x] Sidebar (`admin-layout.scss`/`.html`): fondo oscuro (hereda de
      `--mat-sys-surface`), wordmark "Nocturne" con el degradado aplicado
      al texto (`background-clip: text`), item activo con superficie
      elevada + barra de acento con glow en vez del
      `--mat-sys-secondary-container` que traía por defecto (ese token no
      se tocó para no afectar los chips de Activo/Inactivo). El header
      dejó de forzar `color="primary"` (barra sólida azul) y ahora usa la
      misma superficie oscura con un borde inferior sutil, para no
      desentonar con el resto
- [x] Botones primarios (`mat-flat-button`/`mat-raised-button`
      `color="primary"`): fondo con `--nc-gradient-primary` + glow sutil
      (`--nc-glow-primary`) en hover, regla global en `styles.scss`
- [x] Tarjetas (`mat-card`, global): borde sutil (`--nc-border`) + sombra
      suave; el fondo ya sale de `--mat-sys-surface-container-low`
      remapeado — cubre las tarjetas de Dashboard y Contabilidad sin
      tocar esos archivos
- [x] Tablas (global): encabezados en `--nc-text-secondary` (más
      discretos) y hover sutil en filas (`--nc-surface-elevated`)
- [x] Verificado: `npm run lint`, `npm run build` y `npm test` (246 tests)
      pasan en `nocturne-web` sin cambios
- [x] Revisión visual del usuario — aprobada, ver commit `cd5280c` en
      `nocturne-web`
- [x] Fase 2: propagar a pantallas individuales — ver sección siguiente

## Rediseño visual — Fase 2: Detalles por pantalla (`nocturne-web`) — ✅ completa, commiteada y pusheada a `origin/main` (2026-09-18)

Sigue siendo puramente visual. Toca pantallas individuales puntuales (lo
que la Fase 1 dejó explícitamente para después) más un par de componentes
compartidos. **No commiteado todavía** — a la espera de revisión.

- [x] `--nc-font-mono` (definida en Fase 1, sin usar) aplicada vía una
      clase utilitaria global nueva, `.nc-code` (en `styles.scss`), a los 5
      lugares donde se muestra `codigoVenta` (V-00001 / C-00001):
      `ventas-list.html`, `venta-combos-list.html`,
      `venta-combo-detail.html` (título), `venta-edit-dialog.html` y
      `venta-combo-edit-dialog.html` (títulos de diálogo)
- [x] Modales de crear/editar: el fondo ya salía oscuro desde la Fase 1
      (`--mat-sys-surface`, no había ningún gris de Material por defecto
      colgado), pero usaba el mismo tono que el fondo de la página en vez
      de leerse como una superficie elevada. Se agregó en `styles.scss`:
      `--mat-dialog-container-color: var(--nc-surface-elevated)` +
      borde sutil en `.mat-mdc-dialog-surface` — cubre los 10 diálogos
      (`mat-dialog-title`) de Servicios, Contactos, Cuentas, Perfiles,
      Ventas, Ventas Combo, Gastos, Combos, Usuarios y el
      `confirm-dialog` compartido, sin tocarlos uno por uno
- [x] Botones "Mostrar"/"Copiar" de credenciales (`app-secret-value`,
      compartido, usado en Cuentas y Perfiles): no eran chips, son
      `mat-button` de texto plano — ya tomaban el acento sólido
      (`--mat-sys-primary` = `--nc-accent-solid`) automáticamente desde la
      Fase 1. Se les dio forma de pastilla sutil
      (`background: var(--nc-surface-elevated)`, `border-radius: 999px`)
      para que se lean como controles secundarios y no compitan con el
      degradado de los botones primarios reales. El texto del secreto
      (`•••••••`/valor) pasa de `monospace` genérico a `--nc-font-mono`
- [x] Gráfico de línea de tiempo en Contabilidad (Chart.js,
      `accounting-chart.util.ts` + `accounting.ts`): los datasets
      (Ingresos/Gastos/Ganancia) usaban colores default de Material 2
      (`#2e7d32`/`#c62828`/`#1565c0`) que desentonaban con el tema oscuro.
      Se cambiaron a `#10b981`/`#ef4444`/`#3b82f6` (verde-turquesa, rojo,
      azul — de la misma familia del degradado de acento). Ejes, grid,
      leyenda y tooltip también se oscurecieron (`#94a3b8` texto de eje,
      `#e6e9f0` texto de leyenda/tooltip, fondo de tooltip
      `#1c2333`, grid `rgba(255,255,255,0.06)`). Chart.js pinta en
      `<canvas>`, así que no puede tomar `var(--mat-sys-*)` directo — son
      los mismos valores hex que los tokens de `styles.scss`, hardcodeados
      con comentario de a qué token corresponden
- [x] **Los 4 estados (Activo/Inactivo/Vencida/Por vencer) — verificados,
      sin cambiar el color de ninguno**: gracias a `color-scheme: dark` en
      `body` (Fase 1), Material resuelve sus propios `light-dark(...)`
      internos al valor de modo oscuro automáticamente, así que
      `--mat-sys-error` (Vencida) y `--mat-sys-secondary-container`
      (Activo, chip con `highlighted`) ya salían con las variantes
      correctas para fondo oscuro sin que nadie las tocara — contraste
      calculado a mano: Vencida `#ffb4ab` sobre `#0a0e17` ≈ 11.4:1, chip
      Activo `#dae2f9` sobre `#3e4759` ≈ 7.2:1, Por vencer (hardcodeado
      `#b8860b` en `dashboard.scss`) sobre `#0a0e17` ≈ 5.9:1. La única
      excepción real: Inactivo (`mat-chip` sin `highlighted`, texto en
      `on-surface-variant` con `opacity: 0.7` vía `.chip-inactive`) caía a
      ≈3.8:1, por debajo del 4.5:1 de WCAG AA para texto normal. Se subió
      la opacidad a `0.8` (≈4.9:1) — se toca la opacidad, no el color en
      sí, y de paso se centralizó `.chip-inactive` (estaba duplicado
      literal en 10 archivos `*-list.scss`/`*-detail.scss`) en una única
      regla global en `styles.scss`
- [x] Favicon: reemplazado el ícono default de Angular por un
      `public/favicon.svg` propio (círculo `--nc-bg` con 🌙), con el
      `.ico` original como `rel="alternate icon"` de respaldo
- [x] Verificado: `npm run lint`, `npm run build` y `npm test` (246 tests,
      sin cambios) pasan en `nocturne-web`
- [x] Revisión visual del usuario — aprobada, ver commit `8a3b02f` en
      `nocturne-web`

**Rediseño visual completo (Fase 1 + Fase 2).** Sistema de diseño oscuro
(azul-marino + degradado azul→verde-turquesa, tipografía Inter/JetBrains
Mono) propagado a layout compartido, componentes de Material (botones,
tarjetas, tablas, diálogos) y el detalle puntual de cada pantalla. Sin
cambios de lógica ni de endpoints en ningún momento de las dos fases.

## Fix — Feedback real de un revendedor sobre Ventas y Cuentas (`nocturne-web` + `nocturne-api`) — 🚧 en progreso, pendiente de revisión (2026-09-18)

Empezó como frontend puro en `nocturne-web`, terminó necesitando un fix
chico en `nocturne-api` (ver más abajo). Todo probado contra el backend
local (Postgres vía `docker-compose`, `npm run start:dev`, usuario admin
seed). **No commiteado todavía en ninguno de los dos repos** — a la
espera de revisión.

- [x] Cuentas (`cuenta-form-dialog.ts`): al elegir el Servicio,
      autocompleta `fechaFin` (`fechaInicio` + `servicio.duracionMeses`,
      util nueva `shared/fecha.util.ts::sumarMeses`) y `costo`
      (`servicio.precioBase`). Ambos campos siguen editables — el
      autocompletado solo corre por `valueChanges` de `servicioId` y
      `fechaInicio`, así que no pisa una edición manual salvo que se
      vuelva a tocar el servicio o la fecha de inicio. No dispara en modo
      edición mientras no se toque nada (`valueChanges` no emite por el
      valor inicial del form)
- [x] Ventas (`venta-create-dialog.ts`): mismo autocompletado de
      `fechaFin`, pero usando la duración del **servicio de la cuenta
      elegida** (`cuenta.servicioId` → `servicio.duracionMeses`), en
      `onCuentaChange` + `valueChanges` de `fechaInicio`
- [x] Ventas (`venta-create-dialog.ts`) y Ventas Combo
      (`venta-combo-create.ts`): el selector de Cliente ahora filtra
      `tipo: CLIENTE_FINAL` en `contactosApi.list(...)` — antes traía
      todos los contactos sin distinguir (de ahí que un revendedor viera
      sus propios proveedores mezclados en el selector de cliente de una
      venta). Aunque el pedido original solo mencionaba Ventas, Ventas
      Combo tenía exactamente el mismo bug y comparte el flujo de
      "+ Nuevo cliente" del punto siguiente, así que se corrigió en
      ambos
- [x] "+ Nuevo cliente" en Ventas y Ventas Combo: opción sentinel al
      final del selector de Cliente que abre
      `shared/cliente-quick-create-dialog/` (componente compartido
      nuevo) — modal chico con solo Nombre y WhatsApp, crea el contacto
      con `tipo: CLIENTE_FINAL` vía `POST /api/contacts` y lo selecciona
      automáticamente. El diálogo padre (venta) no se cierra ni pierde
      lo ya llenado: el nuevo contacto se agrega al signal `clientes()`
      en memoria en vez de recargar la lista completa. Si se cancela,
      vuelve al cliente que estaba seleccionado antes (nunca se deja el
      sentinel "seleccionado")
- [x] `claveServicio` en `cuenta-form-dialog.ts` (`nocturne-web`) pasa a
      ser opcional tanto al crear como al editar una Cuenta — el caso
      real es justo al crear (proveedor que solo da un código, sin
      contraseña). **Primer intento (corregido después)**: se asumió que
      el backend ya soportaba esto al crear porque `update-account.dto.ts`
      ya tenía `claveServicio` opcional; un `curl` contra el backend local
      probando `POST /api/accounts` sin el campo devolvió **400** — el
      soporte real solo existía para editar, no para crear. Ver el fix de
      backend más abajo
- [x] Tests de componente nuevos (17 en total): autocompletado de
      fechaFin/costo en `cuenta-form-dialog.spec.ts` (incluye que no
      dispara en edición sin tocar nada, y que sigue editable a mano);
      autocompletado de fechaFin por cuenta en
      `venta-create-dialog.spec.ts`; filtro `CLIENTE_FINAL` en ambos
      specs de creación de venta; flujo completo de "+ Nuevo cliente"
      (crea, selecciona, no pierde el resto del formulario; cancelar
      vuelve al cliente anterior) en ambos; `claveServicio` opcional en
      edición; 4 tests nuevos para `ClienteQuickCreateDialog` y 3 para
      `sumarMeses`
- [x] Probado contra el backend local: login admin seed, `GET
      /api/contacts?tipo=CLIENTE_FINAL&activo=true` (excluye
      proveedores), `POST /api/contacts` con el payload exacto del modal
      chico, `GET /api/services` y `GET /api/accounts?servicioId=...`
      (confirma los nombres de campo `duracionMeses`/`precioBase`/
      `servicioId` que usa el autocompletado), y el `PATCH` de
      `claveServicio` opcional. No se pudo probar con navegador real en
      este entorno (sin Chrome/Chromium con permisos para instalarlo sin
      contraseña) — verificación manual fue a nivel de contrato HTTP, no
      de UI renderizada
- [x] Verificado: `npm run lint`, `npm run build` y `npm test` (264
      tests) pasan en `nocturne-web`
- [ ] Revisión visual/funcional del usuario en el navegador (recomendado
      antes de comitear, dado que no se pudo probar UI en este entorno)

### Backend — `claveServicio` opcional en Cuentas de verdad (`nocturne-api`)

Corrige el 400 real encontrado arriba. Alcance acotado a
`claveServicio`/Cuentas — no toca `claveCorreo` (ya era opcional) ni
ningún otro módulo.

- [x] Migración `MakeClaveServicioOptional` (generada con
      `npm run migration:generate` y limpiada a mano — el generador
      también proponía el mismo ruido de siempre en este repo: 3 FK de
      `owner_id` con nombre de constraint autogenerado en vez del
      explícito, y el DROP+ADD de `CHK_payments_venta_xor_combo`, ver
      nota de Fase de Contabilidad; se descartó todo lo que no fuera la
      columna): `ALTER TABLE accounts ALTER COLUMN clave_servicio DROP
      NOT NULL`. Sin backfill — ya hay cuentas con valor, la migración
      solo permite que las nuevas lleguen en null. Corrida contra
      Postgres local
- [x] `create-account.dto.ts`: `claveServicio` con `@IsOptional()`
      agregado (se mantienen `@IsString()`/`@MinLength(1)` para cuando sí
      se manda). `update-account.dto.ts` no se tocó — ya la tenía opcional
- [x] `account.entity.ts`: columna `clave_servicio` con `nullable: true`,
      tipo `claveServicio: string | null` (antes `string`)
- [x] `encrypted-column.transformer.ts`: **no necesitó cambios** — ya
      manejaba `null`/`undefined` sin cifrar/descifrar (se escribió así
      desde el principio porque lo comparte `claveCorreo`, que ya era
      nullable). Se le agregó `encrypted-column.transformer.spec.ts`
      (spec nuevo, no existía ninguno) para dejarlo cubierto: cifra/
      descifra un valor real de ida y vuelta, y deja pasar `null`/
      `undefined` sin tocarlos ni al guardar ni al leer
- [x] Tests nuevos (4 en total): unit test en `accounts.service.spec.ts`
      — crea la cuenta sin `claveServicio` si no se envía; 3 en
      `encrypted-column.transformer.spec.ts` (arriba)
- [x] Probado a mano con `curl` contra el backend local: `POST
      /api/accounts` sin `claveServicio` → **201**, `claveServicio: null`
      en la respuesta; `GET /api/accounts/:id` del detalle de esa misma
      cuenta → **200**, sin reventar al "descifrar" el `null`. Cuenta de
      prueba desactivada después (`DELETE /api/accounts/:id`) para no
      dejar basura en la base local
- [x] `nocturne-web`: `Cuenta.claveServicio` actualizado a `string | null`
      (antes `string`) para que el tipo no mienta — `app-secret-value` ya
      manejaba `null` correctamente (`@if (value())`), no hubo que tocar
      su lógica. `npm run lint`/`build`/`test` (264 tests) siguen en verde
- [x] Verificado: `npm run lint`, `npm run build` y `npm test` (249
      tests, +4) pasan en `nocturne-api`
- [x] Revisión del usuario — aprobada y commiteada en ambos repos:
      `9ec0526`/`b1b63f3` en `nocturne-web`, `5ef6116` en `nocturne-api`

## Rediseño visual — Login (`nocturne-web`) — ✅ completa, commiteada y pusheada a `origin/main` (2026-09-18)

Sigue el mismo sistema de diseño de las Fases 1-2 (`login.ts`/`.html`/
`.scss`, sin tocar lógica de auth). Dos commits:

- [x] `6d491fa` — fondo con glow decorativo (dos manchas grandes
      desenfocadas, azul y verde-turquesa, en diagonal, opacidad baja,
      detrás de la tarjeta); wordmark "Nocturne" grande arriba del
      formulario con el degradado en el texto (mismo `background-clip:
      text` del sidebar); ícono de luna (`bedtime`, sin estrellas/nubes)
      junto al wordmark; tarjeta con `--nc-surface-elevated` (la misma
      superficie que los diálogos); el botón "Ingresar" no se tocó —
      ya heredaba el degradado + glow global de Fase 1 al ser
      `mat-flat-button color="primary"`. Mensaje de "sesión expirada"
      verificado sin cambiarlo (~6.1:1 de contraste sobre la superficie
      nueva)
- [x] `ff0bfa1` — **bug encontrado tras el commit anterior**: el
      wordmark se veía cortado abajo. Causa: `.brand-text` heredaba el
      `line-height` chico y fijo de `--mat-sys-body-medium` (pensado
      para texto de 0.875rem), que a 2.5rem de font-size quedaba
      recortado contra el `overflow: hidden` de `.login-page` (necesario
      para contener el glow). `.login-page` no tiene altura fija —
      usa `min-height: 100vh` — así que no se le quitó el
      `overflow: hidden`. Fix: `line-height: 1.35` explícito en
      `.brand-text` + `padding-bottom: 4px` en `.login-brand` como
      margen de seguridad extra para el recorte típico de
      `background-clip: text`
- [x] Verificado: `npm run lint`, `npm run build` y `npm test` (264
      tests, sin cambios) pasan en `nocturne-web` en los dos commits

## Rediseño visual — Íconos de servicio, avatares y estados vacíos (`nocturne-web`) — ✅ completa, commiteada y pusheada a `origin/main` (2026-09-21)

Continúa el sistema de diseño de las Fases 1-2 y el login. Puesta al día
(esta entrada se escribió después del trabajo). Dos commits:

- [x] `ae1da17` — `feat: add service icons, colored initials avatars, and
      richer empty states across all lists`
  - **`shared/avatar-inicial/`**: círculo con 1-2 iniciales; el color sale de
    un hash djb2 del nombre normalizado (sin espacios extremos, minúsculas),
    elegido de una paleta de 6 tonos (`#2563eb`, `#0e7490`, `#0f766e`,
    `#047857`, `#4f46e5`, `#0369a1`) que armoniza con el degradado de marca y
    conserva contraste con texto blanco. Mismo nombre → mismo color siempre.
    Iniciales: primera letra de las dos primeras palabras, prefiriendo las
    que empiezan con letra ("Netflix 2 Meses" → "NM", no "N2"); `?` si no hay
    nada usable
  - **`shared/service-icon/`**: 18 íconos de [Simple Icons](https://simpleicons.org)
    (v16.32.0, CC0) como **datos locales** (path SVG en el código, sin CDN).
    `resolveServiceIcon(nombre)` compara por substring sin distinguir
    mayúsculas ni acentos; **gana la keyword más larga** ("hbo max" antes que
    "hbo", "youtube music" antes que "youtube") y las keywords de 1-3 letras
    ("hbo", "max") exigen palabra completa para que "Maximo" no se lleve el
    ícono de otra marca. Los logos casi negros (HBO, HBO Max, Tidal, Apple
    TV) van sobre un tile claro para no desaparecer en el tema oscuro. Sin
    match → mismo avatar de iniciales
  - **`shared/service-icon-stack/`** (no estaba en el pedido): íconos
    superpuestos de los servicios de un combo, con tooltip y `aria-label`
    por ícono y un "+N" pasado el 5.º
  - **`shared/empty-state/`**: ícono grande atenuado + mensaje + submensaje
    opcional. Reemplaza el texto plano "No hay X con estos filtros" en las
    **9 listas** (Servicios, Contactos, Cuentas, Ventas, Combos, Ventas Combo,
    Gastos, Usuarios, Vencimientos), cada una con el ícono de su entrada del
    sidebar. Se quitaron las reglas `.empty-state` de esas listas
  - Aplicación: ícono junto al nombre en Servicios y Cuentas (el ícono del
    servicio de la cuenta), avatar en Contactos, íconos de los servicios en
    el listado de Combos y en la fila "Combo" del detalle de Venta Combo
    (no existe una pantalla de detalle de Combo)
  - Tests (347 en total tras el commit): resolución de ícono con y sin match,
    color determinístico del avatar, estado vacío en varias listas
- [x] `907726f` — `feat: add real Disney+ and Prime Video icons from Dashboard
      Icons`
  - Disney+ y Prime Video **no están en el paquete de Simple Icons**. Se
    probó primero un fallback de "avatar con color de marca" y se reemplazó
    (nunca se commiteó) por los íconos reales de
    [Dashboard Icons](https://github.com/homarr-labs/dashboard-icons)
    (**Apache-2.0**): `disney-plus.svg` (cuadrado 512×512 con fondo propio,
    a pantalla completa en el tile) y `prime-video-alt.svg` (versión
    cuadrada con "prime / video" apilado; `prime-video` es un wordmark ancho
    con "video" casi invisible sobre fondo oscuro y `amazon-prime` dice solo
    "prime"). Copiados **sin modificar**
  - `shared/service-icon/assets/` guarda los SVG, `LICENSE-dashboard-icons`
    y `NOTICE.md` (origen, commit, autores). La licencia cubre el trabajo del
    repo, **no** concede derechos sobre las marcas: se usan solo para
    identificar el servicio
  - `angular.json` publica solo los `*.svg` de esa carpeta en
    `/service-icons/`. `ServiceIconDef` pasa a ser una unión glifo (`path`) |
    imagen (`src`); el componente dibuja las imágenes con `<img>`
  - **Bug encontrado:** el ícono de Disney+ salía roto en el navegador
    porque el `ng serve` ya corría cuando se agregó la regla de assets a
    `angular.json` y no la recoge hasta reiniciarse (404 en
    `/service-icons/*.svg`); tras reiniciar sirve ambos con 200 y el
    contenido idéntico
  - Tests: 351 en total

## Rediseño — Usuario y salir al pie del sidebar + esqueleto de Configuración (`nocturne-web`) — ✅ completa, commiteada y pusheada a `origin/main` (2026-09-21)

Un commit: `eda2c4f` — `feat: move user card and logout to sidebar footer, add
Configuracion page shell`. Puesta al día (entrada escrita después del trabajo).

- [x] El bloque de usuario y salir vivía en el **header** (no arriba del
      sidebar); se movió al **pie del sidebar**, debajo de los links, pegado
      al fondo (`position: sticky`, así sigue visible si la lista de links
      desborda en pantallas bajas). El header quedó solo con el título
- [x] Tarjeta clickeable: avatar de iniciales (`shared/avatar-inicial`),
      nombre y rol debajo ("Admin" / "Revendedor", de `USER_ROLE_LABELS`).
      Abre un `mat-menu` hacia arriba con "Configuración" y "Cerrar sesión"
      (el mismo `Auth.logout()`, que revoca el refresh token). En móvil el
      pie vive dentro del drawer y elegir Configuración lo cierra. Los links
      de navegación no cambiaron
- [x] Ruta `/configuracion`: hija del layout protegido por `authGuard`, sin
      restricción de rol, y **fuera de `navItems`** (solo se llega desde el
      menú del pie). Página esqueleto con título y un contenedor
      `.secciones` para lo que viene
- [x] Detalle de estilos: Material fija `min-width: 112px` en
      `.mat-mdc-menu-panel`, así que el panel del menú (que vive en un
      overlay) usa `.mat-mdc-menu-panel.nc-user-menu` en `styles.scss`
- [x] Tests (366 tras el commit): menú abre/cierra (click, Escape, click
      fuera), navegación a Configuración, "Cerrar sesión" revoca el refresh
      token y manda a `/login`, el usuario está en el pie y no en el header,
      y `/configuracion` carga para ambos roles (y sin sesión redirige a
      `/login`)
- [x] Revisado en navegador (Chromium headless): pie pegado al fondo a 760 px
      de alto y aún visible a 480 px, menú hacia arriba en desktop y móvil

## Configuración — Cambiar contraseña propia (`nocturne-api` + `nocturne-web`) — ✅ completa, commiteada y pusheada a `origin/main` (2026-09-21)

Primera sección real de `/configuracion` (la página y la entrada desde el
menú del pie del sidebar ya existían como esqueleto vacío en `nocturne-web`).
Commits:

- [x] `nocturne-api` `c819348` — `feat: add self-service password change with
      transactional token revocation and rate limiting` (endpoint,
      throttling, transacción y sus tests, y el ejemplo del README)
- [x] `nocturne-api` `40970cc` — `fix: use before/after time window in
      refresh token expiry test to avoid flakiness under load` (commit
      aparte: es un hallazgo independiente de la feature, ver la
      investigación más abajo)
- [x] `nocturne-web` `0c25310` — `feat: add change password UI to
      Configuracion`

### Backend (`nocturne-api`)

- [x] `PATCH /api/auth/change-password` — solo `JwtAuthGuard` (sin
      `@Roles`): cualquier usuario logueado cambia **su** contraseña, no
      solo admin. Body `{ currentPassword, newPassword }`
      (`ChangePasswordDto`; `newPassword` mín. 8, igual que login y alta de
      usuarios). Responde `200 { message: "Contraseña actualizada" }`
- [x] `AuthService.changePassword` — valida `currentPassword` contra el
      hash guardado del usuario autenticado. Si no coincide: **`400`** con
      `"La contraseña actual no es correcta"`, sin tocar nada (ni la
      contraseña ni los refresh tokens). Si coincide: hashea la nueva
      (`UsersService.setPassword`, mismos `BCRYPT_ROUNDS` que el resto),
      la guarda y **revoca todos los refresh tokens del usuario**
      (`RefreshTokensService.revokeAllForUser`: un solo `UPDATE ... SET
      revoked = true WHERE user_id = ? AND revoked = false`), incluida la
      sesión actual
- [x] **Decisión: `400`, no `401`, para la contraseña actual incorrecta.**
      El usuario sí está autenticado; con `401` el interceptor del
      frontend intentaría refrescar la sesión y reintentar en vez de
      mostrar el error
- [x] **Límite conocido (no pedido, pero conviene tenerlo presente):**
      los **access tokens ya emitidos siguen valiendo hasta que expiran**
      (`ACCESS_TOKEN_EXPIRES_IN`, 15 min por defecto) — son JWT stateless y
      `JwtStrategy` no consulta refresh tokens. Lo que sí se corta al
      instante es la capacidad de **renovar** cualquier sesión. Cerrarlo
      del todo requeriría invalidar access tokens por usuario (p. ej. un
      `tokenVersion` en el JWT), fuera del alcance de este paso
- [x] **Rate limit** (endurecimiento posterior, antes de commitear): mismo
      límite que login, 5 intentos por minuto por IP, `429`. Guard propio
      `ChangePasswordThrottlerGuard` (análogo a `LoginThrottlerGuard`, con su
      propio mensaje: *"Demasiados intentos de cambio de contraseña..."*) +
      `@Throttle({ default: { limit: 5, ttl: 60_000 } })`. Detalles: el
      contador es **por handler** (la clave del throttler incluye clase y
      método), así que es independiente del de login aunque compartan
      `ThrottlerModule`; `JwtAuthGuard` va **antes** que el throttler, así
      que solo las requests autenticadas consumen cupo (tráfico anónimo, que
      da 401, no agota el de nadie); cuentan todos los intentos autenticados,
      también los que fallan por 400. Motivo: el endpoint acepta la
      contraseña actual, y con un access token robado se podrían probar
      contraseñas durante su vigencia
- [x] **Transacción** (endurecimiento posterior): guardar la contraseña nueva
      y revocar todos los refresh tokens van en **una sola
      `DataSource.transaction()`** (`AuthService.changePassword`): si
      cualquiera falla, no se aplica ninguna (ni cambia la contraseña ni se
      toca algún token). `UsersService.updatePasswordHash(id, hash,
      manager?)` y `RefreshTokensService.revokeAllForUser(userId, manager?)`
      reciben el `EntityManager` opcional (sin él siguen usando su
      repositorio). El **hasheo bcrypt se hace antes** de abrir la
      transacción (`UsersService.hashPassword`), para no mantenerla abierta
      mientras corre CPU. Reemplaza al `setPassword` de la primera versión
- [x] Tests unitarios — `auth.service.spec.ts` (ambas operaciones reciben el
      **mismo** manager de una única transacción, la contraseña se guarda
      antes de revocar y el hasheo ocurre antes de abrir la transacción;
      contraseña actual incorrecta → 400 con el mensaje y sin abrir
      transacción; usuario inexistente/inactivo → 401; y con una
      **transacción simulada con commit/rollback**: si la revocación falla,
      la contraseña tampoco queda cambiada, y si el guardado falla, ningún
      token se toca), `refresh-tokens.service.spec.ts` (`revokeAllForUser`
      actualiza solo `{ userId, revoked: false }`, y con `EntityManager` usa
      el de la transacción) y `users.service.spec.ts` (`hashPassword`,
      `updatePasswordHash` con y sin manager)
- [x] Test e2e nuevo — `test/auth-change-password.e2e-spec.ts` (Postgres
      real, usuario propio de tipo REVENDEDOR en vez del admin del seed,
      para no romper el login de los demás e2e): sin token → 401;
      `newPassword` corta → 400 sin tocar nada; contraseña actual incorrecta
      → 400 con mensaje claro, hash y tokens intactos y la sesión sigue
      sirviendo; cambio exitoso con **3 sesiones** (1 por login real + 2
      simuladas con `RefreshTokensService.create`) → las tres quedan
      revocadas (0 activos en DB, las tres dan 401 en `/auth/refresh`), la
      contraseña vieja da 401 y la nueva sirve para loguearse; el hash
      guardado no es texto plano. **Rollback real:** un test hace fallar la
      revocación con un `vi.spyOn` (después de que el `UPDATE` de la
      contraseña ya corrió dentro de la transacción) → la request da 500 y,
      contra Postgres, el hash de la contraseña sigue siendo el viejo y los
      dos tokens siguen activos. Para no consumir el cupo de login (5/min)
      este archivo firma los access tokens con `JwtService` y crea las
      sesiones extra con `RefreshTokensService`, en vez de pasar por
      `POST /auth/login`
- [x] Test e2e nuevo — `test/auth-change-password-throttle.e2e-spec.ts`
      (aparte, con su propia instancia de app/`ThrottlerStorage`, mismo
      criterio que `auth-throttle.e2e-spec.ts`): 8 requests sin token dan 401
      y **no** consumen cupo; 5 intentos autenticados pasan (400) y el **6to
      da 429** con el mensaje del rate limit — llevando la contraseña actual
      *correcta*, y se comprueba que no cambió nada (hash intacto, sesión
      viva); agotar change-password no bloquea `POST /auth/login`
      (contadores independientes)
- [x] Verificado con mutaciones: quitar la transacción hace fallar el e2e
      de rollback (el hash queda cambiado pese al fallo de la revocación) y
      4 unit; quitar el guard hace fallar los 2 e2e de rate limit; quitar la
      llamada a `revokeAllForUser` hace fallar el e2e y el unit
      correspondientes
- [x] `README.md`: ejemplo `curl` del endpoint junto a login/refresh/logout

### Frontend (`nocturne-web`)

- [x] `Auth.changePassword(current, new)` (`PATCH /auth/change-password`) y
      `Auth.logout(reason?)`: con `'passwordChanged'` hace **el mismo
      logout de siempre** (revoca el refresh token en el servidor, limpia
      la sesión local) y redirige a `/login?passwordChanged=1`. Sin
      argumento no cambia nada (`navigate(['/login'])`)
- [x] `Login`: `?passwordChanged=1` muestra *"Contraseña actualizada.
      Inicia sesión de nuevo."*, distinto del *"Tu sesión expiró..."* de
      `?sessionExpired=1` (que no cambia; si llegaran ambos, gana el de
      contraseña)
- [x] `features/configuracion/cambiar-password/` — sección "Cambiar
      contraseña" en `/configuracion`: contraseña actual, nueva y
      confirmación. La confirmación se revalida cuando cambia la nueva; si
      no coincide (o el formulario es inválido) `submit()` se detiene
      **antes de llamar al backend**. Éxito → `auth.changePassword` →
      `auth.logout('passwordChanged')`. `400` → muestra el mensaje del
      backend en el formulario y en snackbar, **sin cerrar sesión**; otro
      error → mensaje genérico, tampoco cierra sesión. El aviso "se
      cerrará tu sesión en todos los dispositivos" está visible en la tarjeta
- [x] **Bug encontrado en la prueba manual:** el snackbar de un intento
      fallido ("La contraseña actual no es correcta", 5 s) seguía visible
      encima de `/login` si el reintento salía bien inmediatamente. Se
      descarta (`snackBar.dismiss()`) al iniciar cada envío, solo en este
      componente (el helper compartido `injectFormError` no se tocó, para
      no afectar los demás formularios); test agregado
- [x] Tests: `auth.spec.ts` (PATCH con el body correcto; el 400 se propaga
      sin tocar la sesión; `logout('passwordChanged')` revoca, limpia y
      navega con `?passwordChanged=1`, no `sessionExpired`),
      `login.spec.ts` (aviso nuevo, distinto del de sesión expirada),
      `cambiar-password.spec.ts` (envío exitoso → PATCH, luego logout y
      redirect con el parámetro correcto y sesión local borrada; contraseña
      actual incorrecta → error visible, **sin** request de logout, sin
      redirect y con los tokens intactos; 500 → mensaje genérico; no
      coincide / corta / vacío → cero requests; revalidación de la
      confirmación; descarte del snackbar al reintentar) y
      `configuracion.spec.ts`. Verificado con una mutación (quitar el guard
      de `submit()`): el test de "no coincide" falla
- [x] `429` (rate limit del backend): el formulario muestra el mensaje del
      backend (*"Demasiados intentos de cambio de contraseña..."*) en vez
      del genérico, y tampoco cierra sesión; test agregado

### Prueba manual (backend local + navegador)

- [x] Contra Postgres local (docker/podman) con una **instancia nueva de la
      API en `:3001`** (la de `:3000` no se tocó) y un **usuario de prueba
      propio** (REVENDEDOR, creado por SQL y borrado al terminar — el
      admin del seed no se modificó). Por `curl`: 2 sesiones → contraseña
      actual incorrecta da `400` `"La contraseña actual no es correcta"` y
      la sesión sigue sirviendo → cambio correcto `200` → ambos refresh
      tokens dan `401` → login con la contraseña vieja `401`, con la nueva
      `201` → sin token `401`
- [x] Misma prueba **en navegador** (Chromium headless con el build de
      desarrollo, tráfico a `:3000` redirigido a `:3001` y todo host externo
      bloqueado para no tocar producción): login → menú del pie →
      Configuración → confirmación distinta (botón deshabilitado, 0
      llamadas al backend) → actual incorrecta (error, sigue en
      `/configuracion`, tokens intactos) → cambio correcto (redirige a
      `/login?passwordChanged=1` con el aviso, `localStorage` de sesión
      vacío) → contraseña vieja falla ("Email o contraseña incorrectos.") →
      contraseña nueva entra a `/dashboard`
- [x] Ojo al probar a mano: `POST /auth/login` tiene rate limit de 5 por
      minuto por IP; varios logins seguidos dan `429` (visto durante la
      prueba, no es un fallo del cambio de contraseña)

### Verificación

- [x] `nocturne-api`: `npm run lint`, `npm run build`, `npm test` (261
      tests; antes de este cambio eran 249) y `npm run test:e2e` (85 tests
      en 18 archivos; antes 77) pasan
- [x] `nocturne-web`: `npm run lint`, `npm test` (380 tests; antes 366) y
      `npm run build` pasan

### Investigación — el test que falló una vez en `npm test` (`nocturne-api`)

Una corrida aislada de la suite unitaria mostró `1 failed | 252 passed` sin
que se viera cuál. Se intentó reproducir sobre el código tal como estaba
entonces (sin editar nada mientras corría):

- [x] **Sin carga:** 40 vueltas × 3 suites (unit de change-password
      `auth.service.spec` + `refresh-tokens.service.spec`, e2e de
      change-password aislado, y la suite unitaria completa) = 120
      corridas, **0 fallos**
- [x] **Con la máquina saturada** (24 procesos `yes` sobre 12 núcleos,
      mismas 3 suites, 40 vueltas): otras 120 corridas, **0 fallos**.
      **No se reprodujo de forma natural** en 240 corridas
- [x] Se descartó la colisión de rate limit entre archivos (los unit no
      usan HTTP ni el `ThrottlerStorage`, y los e2e corrieron con
      `fileParallelism: false` y aislados)
- [x] **Candidato con mecanismo confirmado (no se sabe si fue el que falló):**
      `refresh-tokens.service.spec.ts` › *"calcula expiresAt a partir de
      jwt.refreshTokenExpiresIn"* — test **preexistente, ajeno a
      change-password**. Toma `before = Date.now()`, llama a
      `service.create()` (que hace un `bcrypt.hash`, ~50-100 ms) y exige
      que `expiresAt` caiga en `before + 30d ± 1000 ms`; como `expiresAt` se
      calcula *después* del hash, falla si esa parte tarda más de 1 s
      (atasco de la máquina, pausa de GC...). Con un `bcrypt.hash` de 1,3 s
      inyectado desde fuera del repo falla exactamente ese test:
      `AssertionError: expected 1792627660034 to be less than or equal to
      1792627659676`
- [x] **Corregido:** el test ahora captura también `after` (justo después
      de `create()`) y valida `before + 30d - 1 s <= expiresAt <= after +
      30d + 1 s`: como `expiresAt` se calcula después del hash, el instante
      base cae en `[before, after]` sin importar cuánto tarde; la tolerancia
      de 1 s solo cubre redondeo/deriva del reloj. **Verificado con el mismo
      experimento:** con el `bcrypt.hash` de 1,3 s inyectado el test fallaba
      antes (`expected 1792628105445 to be less than or equal to
      1792628105081`) y con el fix pasa (5 corridas seguidas, el test tarda
      ~1,36 s, o sea que el retraso sí se aplicó). Una mutación (sumar 60 s de
      más al TTL en `RefreshTokensService.create`) sigue haciéndolo fallar,
      así que no perdió poder de detección

## Buscador global (backend)

No ligada a una fase numerada del roadmap: agrega un endpoint de búsqueda
transversal sobre el catálogo existente, sin tocar reglas de negocio de
ningún módulo.

- [x] `GET /api/search?q=<termino>` (`SearchController`, `JwtAuthGuard`,
      sin `@Roles()` — cualquier usuario autenticado puede buscar). `q` con
      menos de 2 caracteres o ausente → `400` (`QuerySearchDto`, `@IsString()
      @MinLength(2)`, sin `@IsOptional()`)
- [x] `SearchService.search()` corre las 7 búsquedas en paralelo
      (`Promise.all`), delegando a un método `search(term, currentUser)`
      agregado a cada servicio de dominio (`ContactsService`,
      `AccountsService`, `ServicesService`, `CombosService`, `SalesService`,
      `ComboSalesService`, `ExpensesService`) — mismo criterio de ownership
      que `findAllOwned` (REVENDEDOR ve solo lo suyo vía `andWhere ownerId`,
      admin ve todo), `LIMIT 5` por categoría
- [x] Campos buscados (`ILIKE '%term%'`): Contactos → `nombre`, Cuentas →
      `correo`, Servicios → `nombre`, Combos → `nombre`, Ventas →
      `codigoVenta`, VentasCombo → `codigoVenta`, Gastos → `descripcion`.
      **`AccountsService.search()` nunca trae `claveServicio`/`claveCorreo`**
      (cifradas): el `.select()` del query builder ni siquiera las carga a
      memoria, y el resultado solo expone `{ id, label }`
      (`SearchResultItem`, `src/common/search-result.ts`), con `label` de
      Cuentas sumando el nombre del servicio como contexto
      (`"correo — Servicio"`)
- [x] Respuesta: `{ contactos, cuentas, servicios, combos, ventas,
      ventasCombo, gastos }`, cada uno `SearchResultItem[]`
      (`src/search/search-response.ts`)
- [x] `SearchModule` no tiene repositorios propios: importa los módulos de
      dominio y reusa sus servicios (mismo patrón que `AccountingModule`
      con los reportes), no lee tablas ajenas directo
- [x] Tests: `search.service.spec.ts` (orquestación — las 7 categorías se
      llaman en paralelo con el término y el usuario correctos, la
      respuesta arma las claves esperadas) y
      `test/search-ownership.e2e-spec.ts` (nuevo, 6 tests) — cada categoría
      filtra por `ownerId` (un REVENDEDOR nunca ve resultados de otro
      dueño; Ventas/VentasCombo se prueban buscando el `codigoVenta` ya
      generado, porque no es un campo libre), el mínimo de 2 caracteres se
      respeta (`400`), sin token da `401`, la clave cifrada de Cuentas
      nunca aparece en el JSON de la respuesta (ni el campo ni el valor), y
      el admin ve resultados de ambos revendedores en la misma búsqueda
- [x] Prueba manual con `curl` contra el servidor local (`:3000`, ya
      corriendo): 2 revendedores nuevos, registros en Contactos/Cuentas/
      Servicios/Gastos/Ventas con un término compartido — buscar como A
      devuelve solo lo de A (nunca lo de B), la clave cifrada de Cuentas no
      aparece en la respuesta, `q` de 1 carácter o ausente da `400`, sin
      token da `401`. Datos de prueba borrados al terminar (usuarios,
      contactos, servicios, cuentas, gastos, venta)

### Verificación

- [x] `npm run lint`, `npm run build`, `npm test` (262 tests; antes 261) y
      `npm run test:e2e` (91 tests en 19 archivos; antes 85 en 18) pasan

## Buscador global (frontend) (`nocturne-web`)

Consume el `GET /api/search` de la sección anterior desde el header del
panel admin.

- [x] `GlobalSearch` (`src/app/shared/global-search/`), montado en
      `AdminLayout` dentro de `<mat-toolbar class="header">`: en desktop,
      input con lupa fijo a la derecha (`width: min(360px, 40vw)`); en
      móvil solo el ícono, que al tocarlo expande el buscador a todo el
      ancho del header ocultando hamburguesa y título —
      `[(mobileExpanded)]` two-way con `AdminLayout.searchExpanded`, ya que
      ocultar los hermanos del header no puede quedar encapsulado dentro
      del propio componente
- [x] Debounce de 300ms + mínimo de 2 caracteres + `switchMap` (cancela la
      búsqueda anterior si el usuario sigue escribiendo) — verificado con
      un test que arma la cancelación con dos `Subject` (la respuesta
      vieja, aunque llegue después que la nueva, se ignora)
- [x] Resultados agrupados por categoría (mismos íconos que el sidebar),
      grupos vacíos no se muestran, estado vacío con `shared/empty-state`
      cuando no hay nada
- [x] Click/Enter navega: Cuentas → `/accounts/:id`, Ventas Combo →
      `/combo-sales/:id`, el resto → su lista; limpia el buscador y cierra
      el panel al navegar
- [x] Teclado: flechas mueven el ítem activo (arranca en el primero),
      Enter abre el activo, Escape cierra el panel; click afuera también
      cierra
- [x] Si quien busca es ADMIN, cada resultado muestra el nombre del dueño
      en una segunda línea chica, leído directo de
      `SearchResultItem.ownerName` (campo aparte del backend — ver Bloque
      A más abajo sobre por qué no es un sufijo pegado al label)
- [x] Tests: `global-search.spec.ts` (16 casos: debounce, mínimo de
      caracteres, cancelación por switchMap, agrupación, navegación por
      categoría, dueño solo a admin, teclado, click afuera, expandir/
      colapsar en móvil) y `search-api.spec.ts`

### Verificación

- [x] `npm run lint`, `npm test` (455 tests) y build de producción con
      `NODE_OPTIONS=--network-family-autoselection-attempt-timeout=3000
      npm run build` pasan

## Bloque A — Autocompletados + buscador en móvil (`nocturne-web`)

Solo frontend: ajustes puntuales sobre formularios ya existentes y sobre
el buscador global de arriba, sin tocar el backend.

- [x] **Buscador en móvil, corregido**: en un celular real la barra y el
      panel de resultados se salían de la pantalla. El panel ahora usa
      `position: fixed` con `left/right: 0` (ancla al viewport, no al
      wrapper que podía no llegar de punta a punta) y `bottom: 0` en vez
      de un `max-height` en `vh` (que salta con la barra de URL móvil); el
      único valor que no sale de CSS puro es el `top` (el borde inferior
      real del header ya renderizado), medido con `getBoundingClientRect()`
      y reactualizado también en `window:resize`. Desktop no cambió.
- [x] **Cuentas — se quita el autocompletado de Costo** al elegir el
      Servicio: el costo es lo que se pagó al proveedor por la cuenta
      completa, no tiene relación con `precioBase` del servicio (precio de
      venta de un perfil) — se escribe siempre a mano. fechaFin sigue
      autocompletándose igual que antes.
- [x] **Ventas (crear)**: al elegir la Cuenta, el Precio se autocompleta
      con el `precioBase` del Servicio de esa cuenta; fechaInicio arranca
      en el día de hoy (`hoyIso()`). Ambos quedan editables — el guard de
      "no pisar un valor que el usuario ya editó a mano" usa `dirty` del
      `FormControl` (no un flag propio): `setValue()` programático no lo
      marca, solo la interacción real con el input, así que es la señal
      correcta para distinguir "lo puso el autocompletado" de "lo tocó el
      usuario".
- [x] **tasaCambio oculto en PEN**, en los 5 formularios con moneda
      (Ventas crear/editar, Ventas Combo crear/editar, Gastos): en PEN se
      fuerza a 1 y el campo se oculta (`@if (moneda !== PEN)`); con
      cualquier otra moneda aparece y queda editable; al volver a PEN
      vuelve a 1. Wireado con un `moneda.valueChanges.subscribe(...)` por
      formulario (mismo criterio de no abstraer que el resto de estos
      autocompletados, que tampoco comparten código entre sí).
- [x] **Recordar el último método de pago usado**: `UltimoMetodoPago`
      (`shared/metodo-pago/ultimo-metodo-pago.ts`) guarda en localStorage
      con clave por `userId` (no mezcla sesiones en el mismo navegador).
      Se lee como valor inicial SOLO en los 4 formularios de CREAR (Cuentas,
      Ventas, Ventas Combo, Gastos — en editar siempre gana el metodoPago
      real del registro) y se graba al guardar con éxito en los 6
      formularios (los 4 de arriba + Ventas/Ventas Combo editar): tanto
      crear como editar representan un método realmente usado.
- [x] **Backend, cambio pedido en este mismo bloque**: `ownerName` pasó de
      ir pegado al `label` con un `\n` (ver Buscador global (backend) más
      arriba) a ser un campo aparte de `SearchResultItem` — un
      `\n` real dentro de la descripción de un Gasto (texto libre del
      usuario) se podía confundir con el separador. `resolveOwnerName()`
      reemplaza a `withOwnerSuffix()` en los 7 `search()`; el frontend deja
      de parsear la segunda línea del label y lee `item.ownerName` directo.
      Test agregado con una descripción de Gasto que contiene un `\n` real,
      confirmando que no se confunde con el dueño.
- [x] Tests para cada punto de arriba (mobile panel, autocompletados,
      tasaCambio × 5 formularios, UltimoMetodoPago × 6 formularios + su
      propio spec) — 483 tests en total en `nocturne-web` (antes 455).

### Verificación

- [x] `nocturne-web`: `npm run lint`, `npm test` (483 tests) y build de
      producción con
      `NODE_OPTIONS=--network-family-autoselection-attempt-timeout=3000
      npm run build` pasan
- [x] `nocturne-api`: `npm run lint`, `npm test` (262 tests) y
      `npm run test:e2e` (92 tests) pasan (cambio de `ownerName`)
