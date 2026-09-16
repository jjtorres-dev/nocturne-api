import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRefreshTokens1789566268016 implements MigrationInterface {
    name = 'AddRefreshTokens1789566268016'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // El generador también proponía DROP+ADD del CHECK
        // "CHK_payments_venta_xor_combo" (falso positivo: Postgres normaliza
        // el texto de la expresión distinto a como TypeORM la arma desde la
        // entidad, no hay cambio real en esa constraint) — se descarta acá,
        // no tiene nada que ver con refresh_tokens.
        await queryRunner.query(`CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "token_hash" character varying NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4"`);
        await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    }

}
