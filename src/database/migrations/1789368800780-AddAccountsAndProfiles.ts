import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAccountsAndProfiles1789368800780 implements MigrationInterface {
    name = 'AddAccountsAndProfiles1789368800780'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "servicio_id" uuid NOT NULL, "proveedor_id" uuid, "correo" character varying NOT NULL, "clave_servicio" character varying NOT NULL, "clave_correo" character varying, "fecha_inicio" date NOT NULL, "fecha_fin" date NOT NULL, "costo" numeric(10,2) NOT NULL, "metodo_pago" character varying NOT NULL, "url" character varying, "renovacion_automatica" boolean NOT NULL DEFAULT false, "activo" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5a7a02c20412299d198e097a8fe" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "cuenta_id" uuid NOT NULL, "nombre" character varying NOT NULL, "pin" character varying, "cliente_id" uuid, "activo" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_8e520eb4da7dc01d0e190447c8e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "accounts" ADD CONSTRAINT "FK_5c3bdaf7a05052b6faf89261ab4" FOREIGN KEY ("servicio_id") REFERENCES "services"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "accounts" ADD CONSTRAINT "FK_7b8ff3ec89b63edae65b2e09d1a" FOREIGN KEY ("proveedor_id") REFERENCES "contacts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "profiles" ADD CONSTRAINT "FK_7127df324a271b04843b7e6a8d7" FOREIGN KEY ("cuenta_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "profiles" ADD CONSTRAINT "FK_a5e4f78f89f83f59692c666d8e9" FOREIGN KEY ("cliente_id") REFERENCES "contacts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profiles" DROP CONSTRAINT "FK_a5e4f78f89f83f59692c666d8e9"`);
        await queryRunner.query(`ALTER TABLE "profiles" DROP CONSTRAINT "FK_7127df324a271b04843b7e6a8d7"`);
        await queryRunner.query(`ALTER TABLE "accounts" DROP CONSTRAINT "FK_7b8ff3ec89b63edae65b2e09d1a"`);
        await queryRunner.query(`ALTER TABLE "accounts" DROP CONSTRAINT "FK_5c3bdaf7a05052b6faf89261ab4"`);
        await queryRunner.query(`DROP TABLE "profiles"`);
        await queryRunner.query(`DROP TABLE "accounts"`);
    }

}
