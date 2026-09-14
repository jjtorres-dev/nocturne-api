import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPaymentsAndExpenses1789414121297 implements MigrationInterface {
    name = 'AddPaymentsAndExpenses1789414121297'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."expenses_moneda_enum" AS ENUM('PEN', 'USD', 'ARS', 'BS', 'CLP', 'COP', 'CRC', 'CUP', 'DOP', 'MXN', 'PYG', 'UYU')`);
        await queryRunner.query(`CREATE TABLE "expenses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "descripcion" character varying NOT NULL, "monto" numeric(10,2) NOT NULL, "moneda" "public"."expenses_moneda_enum" NOT NULL, "tasa_cambio" numeric(10,4) NOT NULL DEFAULT '1', "monto_pen" numeric(10,2) NOT NULL, "metodo_pago" character varying NOT NULL, "fecha" date NOT NULL, "activo" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_94c3ceb17e3140abc9282c20610" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."payments_moneda_enum" AS ENUM('PEN', 'USD', 'ARS', 'BS', 'CLP', 'COP', 'CRC', 'CUP', 'DOP', 'MXN', 'PYG', 'UYU')`);
        await queryRunner.query(`CREATE TYPE "public"."payments_tipo_enum" AS ENUM('venta_inicial', 'renovacion')`);
        await queryRunner.query(`CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "venta_id" uuid NOT NULL, "monto" numeric(10,2) NOT NULL, "moneda" "public"."payments_moneda_enum" NOT NULL, "tasa_cambio" numeric(10,4) NOT NULL DEFAULT '1', "monto_pen" numeric(10,2) NOT NULL, "metodo_pago" character varying NOT NULL, "fecha" date NOT NULL, "tipo" "public"."payments_tipo_enum" NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_31dee313a16866d5a5164b5759b" FOREIGN KEY ("venta_id") REFERENCES "sales"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);

        // Data migration: un Pago retroactivo (tipo=venta_inicial) por cada
        // Sale ya existente, para no perder el historial de ventas creadas
        // antes de esta fase (ver PROGRESS.md Fase 5). Usa el
        // precio/moneda/tasaCambio/precioPEN de la venta y su fechaInicio
        // como fecha del pago. El WHERE NOT EXISTS la hace idempotente: si
        // esta migración se corre dos veces (o ya se generó el Payment por
        // la vía normal de SalesService.create), no duplica filas.
        await queryRunner.query(`
            INSERT INTO "payments" ("venta_id", "monto", "moneda", "tasa_cambio", "monto_pen", "metodo_pago", "fecha", "tipo")
            SELECT s."id", s."precio", s."moneda"::text::"public"."payments_moneda_enum", s."tasa_cambio", s."precio_pen", s."metodo_pago", s."fecha_inicio", 'venta_inicial'
            FROM "sales" s
            WHERE NOT EXISTS (
                SELECT 1 FROM "payments" p
                WHERE p."venta_id" = s."id" AND p."tipo" = 'venta_inicial'
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_31dee313a16866d5a5164b5759b"`);
        await queryRunner.query(`DROP TABLE "payments"`);
        await queryRunner.query(`DROP TYPE "public"."payments_tipo_enum"`);
        await queryRunner.query(`DROP TYPE "public"."payments_moneda_enum"`);
        await queryRunner.query(`DROP TABLE "expenses"`);
        await queryRunner.query(`DROP TYPE "public"."expenses_moneda_enum"`);
    }

}
