import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAccountOwner1789592566614 implements MigrationInterface {
    name = 'AddAccountOwner1789592566614'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Mismo patrón que AddServiceOwner/AddContactOwner (Fase B1/B2):
        // columna nullable primero, backfill al admin más antiguo, recién
        // ahí NOT NULL — hay 9 cuentas existentes sin dueño todavía.
        await queryRunner.query(`ALTER TABLE "accounts" ADD "owner_id" uuid`);
        await queryRunner.query(`
            UPDATE "accounts" SET "owner_id" = (
                SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "created_at" ASC LIMIT 1
            ) WHERE "owner_id" IS NULL
        `);
        await queryRunner.query(`ALTER TABLE "accounts" ALTER COLUMN "owner_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "accounts" ADD CONSTRAINT "FK_e6c1947a61f955558ccca3f7c46" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "accounts" DROP CONSTRAINT "FK_e6c1947a61f955558ccca3f7c46"`);
        await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN "owner_id"`);
    }

}
