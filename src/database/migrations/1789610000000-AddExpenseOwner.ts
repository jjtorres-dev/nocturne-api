import { MigrationInterface, QueryRunner } from "typeorm";

export class AddExpenseOwner1789610000000 implements MigrationInterface {
    name = 'AddExpenseOwner1789610000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Mismo patrón que AddServiceOwner/AddContactOwner/AddAccountOwner/
        // AddSaleOwner/AddComboOwner/AddComboSaleOwner (Fase B1-B5): columna
        // nullable primero, backfill al admin más antiguo, recién ahí NOT
        // NULL — hay gastos existentes sin dueño todavía.
        await queryRunner.query(`ALTER TABLE "expenses" ADD "owner_id" uuid`);
        await queryRunner.query(`
            UPDATE "expenses" SET "owner_id" = (
                SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "created_at" ASC LIMIT 1
            ) WHERE "owner_id" IS NULL
        `);
        await queryRunner.query(`ALTER TABLE "expenses" ALTER COLUMN "owner_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "expenses" ADD CONSTRAINT "FK_expenses_owner_id" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "expenses" DROP CONSTRAINT "FK_expenses_owner_id"`);
        await queryRunner.query(`ALTER TABLE "expenses" DROP COLUMN "owner_id"`);
    }

}
