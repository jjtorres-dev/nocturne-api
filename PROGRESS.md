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

## Fase 1 — Catálogo de Servicios + Contactos

- [ ] Entidad Servicio (Netflix, Disney, Crunchyroll, etc.)
- [ ] CRUD de Servicios (backend + UI)
- [ ] Entidad Contacto (clientes/proveedores)
- [ ] CRUD de Contactos (backend + UI)

## Fase 2 — Cuentas + Perfiles

- [ ] Entidad Cuenta (credenciales cifradas con AES)
- [ ] Entidad Perfil (perfil dentro de una cuenta, asociado a un Servicio)
- [ ] CRUD de Cuentas + Perfiles (backend + UI)
- [ ] Cifrado/descifrado de credenciales en el backend

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
