import { MigrationInterface, QueryRunner } from "typeorm";

export class AddComboOwner1789600000000 implements MigrationInterface {
    name = 'AddComboOwner1789600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Mismo patrón que AddServiceOwner/AddContactOwner/AddAccountOwner/
        // AddSaleOwner (Fase B1/B2/B3/B4): columna nullable primero, backfill
        // al admin más antiguo, recién ahí NOT NULL — hay combos existentes
        // sin dueño todavía.
        await queryRunner.query(`ALTER TABLE "combos" ADD "owner_id" uuid`);
        await queryRunner.query(`
            UPDATE "combos" SET "owner_id" = (
                SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "created_at" ASC LIMIT 1
            ) WHERE "owner_id" IS NULL
        `);
        await queryRunner.query(`ALTER TABLE "combos" ALTER COLUMN "owner_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "combos" ADD CONSTRAINT "FK_combos_owner_id" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "combos" DROP CONSTRAINT "FK_combos_owner_id"`);
        await queryRunner.query(`ALTER TABLE "combos" DROP COLUMN "owner_id"`);
    }

}
