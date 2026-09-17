import { MigrationInterface, QueryRunner } from "typeorm";

export class AddContactOwner1789592033206 implements MigrationInterface {
    name = 'AddContactOwner1789592033206'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Mismo patrón que AddServiceOwner (Fase B1): columna nullable
        // primero, backfill al admin más antiguo, recién ahí NOT NULL — hay
        // 29 contactos existentes que no tienen dueño todavía.
        await queryRunner.query(`ALTER TABLE "contacts" ADD "owner_id" uuid`);
        await queryRunner.query(`
            UPDATE "contacts" SET "owner_id" = (
                SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "created_at" ASC LIMIT 1
            ) WHERE "owner_id" IS NULL
        `);
        await queryRunner.query(`ALTER TABLE "contacts" ALTER COLUMN "owner_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "contacts" ADD CONSTRAINT "FK_ac270d32a01ee22d2e98a8f8532" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "contacts" DROP CONSTRAINT "FK_ac270d32a01ee22d2e98a8f8532"`);
        await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "owner_id"`);
    }

}
