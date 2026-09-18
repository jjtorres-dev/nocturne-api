import { MigrationInterface, QueryRunner } from "typeorm";

export class MakeClaveServicioOptional1789698069770 implements MigrationInterface {
    name = 'MakeClaveServicioOptional1789698069770'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Ya hay cuentas existentes con clave_servicio en NOT NULL, todas
        // con valor — no hace falta backfill, solo permitir NULL de acá en
        // adelante (proveedores que solo dan un código, sin contraseña).
        await queryRunner.query(`ALTER TABLE "accounts" ALTER COLUMN "clave_servicio" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "accounts" ALTER COLUMN "clave_servicio" SET NOT NULL`);
    }

}
