import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1789365242475 implements MigrationInterface {
    name = 'InitialSchema1789365242475'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."services_tipo_enum" AS ENUM('CON_PERFILES', 'SIN_PERFILES', 'FAMILIAR', 'IPTV')`);
        await queryRunner.query(`CREATE TABLE "services" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nombre" character varying NOT NULL, "tipo" "public"."services_tipo_enum" NOT NULL, "duracion_meses" numeric(4,1) NOT NULL, "pantallas_max" integer, "precio_base" numeric(10,2) NOT NULL, "activo" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ba2d347a3168a296416c6c5ccb2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."contacts_tipo_enum" AS ENUM('CLIENTE_FINAL', 'PROVEEDOR', 'REVENDEDOR')`);
        await queryRunner.query(`CREATE TABLE "contacts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nombre" character varying NOT NULL, "whatsapp" character varying NOT NULL, "tipo" "public"."contacts_tipo_enum" NOT NULL, "activo" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b99cd40cfd66a99f1571f4f72e6" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "contacts"`);
        await queryRunner.query(`DROP TYPE "public"."contacts_tipo_enum"`);
        await queryRunner.query(`DROP TABLE "services"`);
        await queryRunner.query(`DROP TYPE "public"."services_tipo_enum"`);
    }

}
