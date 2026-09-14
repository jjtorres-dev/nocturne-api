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

## Fase 5 — Contabilidad / Caja — 🚧 en curso (backend completo)

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
- [ ] **Pendiente**: frontend de Contabilidad (reportes + registro de
      Gastos)

## Fase 6 — Combos

- [ ] Entidad Combo (agrupación de servicios/perfiles con precio propio)
- [ ] Ventas de combos

## Fase 7 — Extras

- [ ] Notificaciones por WhatsApp
- [ ] Tasas de cambio en vivo
- [ ] Backups automáticos
