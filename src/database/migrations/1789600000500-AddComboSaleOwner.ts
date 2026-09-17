import { MigrationInterface, QueryRunner } from "typeorm";

export class AddComboSaleOwner1789600000500 implements MigrationInterface {
    name = 'AddComboSaleOwner1789600000500'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Mismo patrón que AddComboOwner (y AddServiceOwner/AddContactOwner/
        // AddAccountOwner/AddSaleOwner de Fase B1/B2/B3/B4): columna nullable
        // primero, backfill al admin más antiguo, recién ahí NOT NULL — hay
        // combo_sales existentes sin dueño todavía.
        await queryRunner.query(`ALTER TABLE "combo_sales" ADD "owner_id" uuid`);
        await queryRunner.query(`
            UPDATE "combo_sales" SET "owner_id" = (
                SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "created_at" ASC LIMIT 1
            ) WHERE "owner_id" IS NULL
        `);
        await queryRunner.query(`ALTER TABLE "combo_sales" ALTER COLUMN "owner_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "combo_sales" ADD CONSTRAINT "FK_combo_sales_owner_id" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "combo_sales" DROP CONSTRAINT "FK_combo_sales_owner_id"`);
        await queryRunner.query(`ALTER TABLE "combo_sales" DROP COLUMN "owner_id"`);
    }

}
