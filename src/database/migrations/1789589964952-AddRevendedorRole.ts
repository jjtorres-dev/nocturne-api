import { MigrationInterface, QueryRunner } from "typeorm";

// La tabla `users` y su enum `users_role_enum` (hoy solo 'admin') se
// crearon con `synchronize` en la Fase 0, antes de que este proyecto usara
// migraciones (no hay ninguna migración anterior que cree `users`). Esta es
// la primera migración que toca esa tabla.
export class AddRevendedorRole1789589964952 implements MigrationInterface {
    name = 'AddRevendedorRole1789589964952'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."users_role_enum" ADD VALUE 'revendedor'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Postgres no soporta quitar un valor de un enum directamente: hay
        // que recrear el tipo sin 'revendedor'. Si algún usuario quedó con
        // ese rol, este paso falla (no hay a qué otro valor migrarlo sin
        // perder información) — es el comportamiento esperado de un down.
        await queryRunner.query(`ALTER TYPE "public"."users_role_enum" RENAME TO "users_role_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('admin')`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum" USING "role"::text::"public"."users_role_enum"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'admin'`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum_old"`);
    }

}
