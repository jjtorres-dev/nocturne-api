-- Esquema de la Fase 0 para una base vacía (solo CI).
--
-- La tabla `users` y su enum se crearon con `synchronize` antes de que el
-- proyecto usara migraciones: ninguna migración las crea, y la primera que
-- las toca (AddRevendedorRole) ya las da por existentes. En una Postgres
-- recién creada hay que ponerlas a mano antes de `migration:run`.
--
-- Es la forma que tenían entonces: el enum solo con 'admin'. Lo demás
-- (rol revendedor, refresh tokens, dueños) lo agregan las migraciones.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE "public"."users_role_enum" AS ENUM ('admin');

CREATE TABLE "users" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "email" character varying NOT NULL,
  "password_hash" character varying NOT NULL,
  "name" character varying NOT NULL,
  "role" "public"."users_role_enum" NOT NULL DEFAULT 'admin',
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"),
  CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
);
