import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSaleOwner1789593460747 implements MigrationInterface {
    name = 'AddSaleOwner1789593460747'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Mismo patrón que AddServiceOwner/AddContactOwner/AddAccountOwner
        // (Fase B1/B2/B3): columna nullable primero, backfill al admin más
        // antiguo, recién ahí NOT NULL — hay 19 ventas existentes sin dueño
        // todavía.
        await queryRunner.query(`ALTER TABLE "sales" ADD "owner_id" uuid`);
        await queryRunner.query(`
            UPDATE "sales" SET "owner_id" = (
                SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "created_at" ASC LIMIT 1
            ) WHERE "owner_id" IS NULL
        `);
        await queryRunner.query(`ALTER TABLE "sales" ALTER COLUMN "owner_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "sales" ADD CONSTRAINT "FK_92c7cb23ffe1da245738c52ead6" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sales" DROP CONSTRAINT "FK_92c7cb23ffe1da245738c52ead6"`);
        await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN "owner_id"`);
    }

}
