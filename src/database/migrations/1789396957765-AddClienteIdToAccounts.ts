import { MigrationInterface, QueryRunner } from "typeorm";

export class AddClienteIdToAccounts1789396957765 implements MigrationInterface {
    name = 'AddClienteIdToAccounts1789396957765'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "accounts" ADD "cliente_id" uuid`);
        await queryRunner.query(`ALTER TABLE "accounts" ADD CONSTRAINT "FK_90eae748bcb7d7250704067a716" FOREIGN KEY ("cliente_id") REFERENCES "contacts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "accounts" DROP CONSTRAINT "FK_90eae748bcb7d7250704067a716"`);
        await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN "cliente_id"`);
    }

}
