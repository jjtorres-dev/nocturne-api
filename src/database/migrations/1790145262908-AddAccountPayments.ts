import { MigrationInterface, QueryRunner } from "typeorm";

// Backfill (Bloque — Renovación con el proveedor): un pago `compra_inicial`
// por cada cuenta que ya existía, para que Contabilidad y la rentabilidad no
// pierdan la inversión de las cuentas creadas antes de este bloque. Account.
// costo está en PEN, así que el pago es PEN con tasa 1 (monto_pen = costo);
// la fecha es `fecha_inicio` de la cuenta (cuándo se compró), no created_at
// (cuándo se registró). Idempotente por el WHERE NOT EXISTS: correrlo dos
// veces, o sobre cuentas que ya tienen su pago porque se crearon por la API,
// no duplica nada. Exportado para que el e2e pruebe exactamente este SQL.
export const BACKFILL_ACCOUNT_PAYMENTS_SQL = `
    INSERT INTO "account_payments" ("cuenta_id", "fecha", "monto", "moneda", "tasa_cambio", "monto_pen", "metodo_pago", "tipo")
    SELECT a."id", a."fecha_inicio", a."costo", 'PEN', 1, a."costo", a."metodo_pago", 'compra_inicial'
    FROM "accounts" a
    WHERE NOT EXISTS (
        SELECT 1 FROM "account_payments" ap
        WHERE ap."cuenta_id" = a."id" AND ap."tipo" = 'compra_inicial'
    )
`;

export class AddAccountPayments1790145262908 implements MigrationInterface {
    name = 'AddAccountPayments1790145262908'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."account_payments_moneda_enum" AS ENUM('PEN', 'USD', 'ARS', 'BS', 'CLP', 'COP', 'CRC', 'CUP', 'DOP', 'MXN', 'PYG', 'UYU')`);
        await queryRunner.query(`CREATE TYPE "public"."account_payments_tipo_enum" AS ENUM('compra_inicial', 'renovacion')`);
        await queryRunner.query(`CREATE TABLE "account_payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "cuenta_id" uuid NOT NULL, "fecha" date NOT NULL, "monto" numeric(10,2) NOT NULL, "moneda" "public"."account_payments_moneda_enum" NOT NULL, "tasa_cambio" numeric(10,4) NOT NULL DEFAULT '1', "monto_pen" numeric(10,2) NOT NULL, "metodo_pago" character varying NOT NULL, "tipo" "public"."account_payments_tipo_enum" NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_8ae8532a16cc01a45809d8755fb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_8089fd3cb807692ef9753d9816" ON "account_payments"  ("cuenta_id") `);
        await queryRunner.query(`ALTER TABLE "account_payments" ADD CONSTRAINT "FK_8089fd3cb807692ef9753d98162" FOREIGN KEY ("cuenta_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);

        await queryRunner.query(BACKFILL_ACCOUNT_PAYMENTS_SQL);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "account_payments" DROP CONSTRAINT "FK_8089fd3cb807692ef9753d98162"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8089fd3cb807692ef9753d9816"`);
        await queryRunner.query(`DROP TABLE "account_payments"`);
        await queryRunner.query(`DROP TYPE "public"."account_payments_tipo_enum"`);
        await queryRunner.query(`DROP TYPE "public"."account_payments_moneda_enum"`);
    }

}
