import { MigrationInterface, QueryRunner } from "typeorm";

export class AddServiceOwner1789591074758 implements MigrationInterface {
    name = 'AddServiceOwner1789591074758'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Columna nullable primero: hay filas existentes (servicios ya
        // creados antes de Multi-usuario) que no tienen dueño todavía. Se
        // asignan al admin más antiguo como default y recién ahí se puede
        // poner NOT NULL sin romper esas filas.
        await queryRunner.query(`ALTER TABLE "services" ADD "owner_id" uuid`);
        await queryRunner.query(`
            UPDATE "services" SET "owner_id" = (
                SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "created_at" ASC LIMIT 1
            ) WHERE "owner_id" IS NULL
        `);
        await queryRunner.query(`ALTER TABLE "services" ALTER COLUMN "owner_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "services" ADD CONSTRAINT "FK_51d4a7f07c0dd4df864fb442ab7" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "services" DROP CONSTRAINT "FK_51d4a7f07c0dd4df864fb442ab7"`);
        await queryRunner.query(`ALTER TABLE "services" DROP COLUMN "owner_id"`);
    }

}
