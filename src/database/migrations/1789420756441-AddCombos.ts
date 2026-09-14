import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCombos1789420756441 implements MigrationInterface {
    name = 'AddCombos1789420756441'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "combos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nombre" character varying NOT NULL, "descripcion" character varying, "precio_combo" numeric(10,2) NOT NULL, "activo" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5b4bab633aee439e2bade42cc3c" PRIMARY KEY ("id"))`);
        // Secuencia propia para "codigo_venta" de combo_sales (formato
        // "C-00001"), igual criterio que sales_codigo_venta_seq: la consulta
        // directamente ComboSalesService.generateCodigoVentaCombo() con
        // nextval(), TypeORM no la genera desde la entidad.
        await queryRunner.query(`CREATE SEQUENCE "combo_sales_codigo_venta_seq" START 1`);
        await queryRunner.query(`CREATE TYPE "public"."combo_sales_moneda_enum" AS ENUM('PEN', 'USD', 'ARS', 'BS', 'CLP', 'COP', 'CRC', 'CUP', 'DOP', 'MXN', 'PYG', 'UYU')`);
        await queryRunner.query(`CREATE TABLE "combo_sales" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "cliente_id" uuid NOT NULL, "combo_id" uuid NOT NULL, "codigo_venta" character varying NOT NULL, "fecha_inicio" date NOT NULL, "fecha_fin" date NOT NULL, "duracion_meses" numeric(4,1) NOT NULL, "precio" numeric(10,2) NOT NULL, "moneda" "public"."combo_sales_moneda_enum" NOT NULL, "tasa_cambio" numeric(10,4) NOT NULL DEFAULT '1', "precio_pen" numeric(10,2) NOT NULL, "metodo_pago" character varying NOT NULL, "renovacion_automatica" boolean NOT NULL DEFAULT false, "activo" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_f9b7811cc72d4bece1697a23bcd" UNIQUE ("codigo_venta"), CONSTRAINT "PK_c22a52100509db59e69d1364074" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "combo_servicios" ("combo_id" uuid NOT NULL, "servicio_id" uuid NOT NULL, CONSTRAINT "PK_34ad81532eb238ca3b6f389e9fd" PRIMARY KEY ("combo_id", "servicio_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f1f5a003de90d35dbffca63f80" ON "combo_servicios"  ("combo_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_a36362e8dd070c1ce4987107b1" ON "combo_servicios"  ("servicio_id") `);
        await queryRunner.query(`ALTER TABLE "sales" ADD "venta_combo_id" uuid`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "venta_combo_id" uuid`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_31dee313a16866d5a5164b5759b"`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "venta_id" DROP NOT NULL`);
        // Un Payment pertenece a una Sale O a una VentaCombo, nunca ambas ni
        // ninguna (ver PROGRESS.md Fase 6).
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "CHK_payments_venta_xor_combo" CHECK (("venta_id" IS NOT NULL AND "venta_combo_id" IS NULL) OR ("venta_id" IS NULL AND "venta_combo_id" IS NOT NULL))`);
        await queryRunner.query(`ALTER TABLE "sales" ADD CONSTRAINT "FK_8e31b8cad1021f0a299db569979" FOREIGN KEY ("venta_combo_id") REFERENCES "combo_sales"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "combo_sales" ADD CONSTRAINT "FK_7ada3c91877d6187ee8496b894c" FOREIGN KEY ("cliente_id") REFERENCES "contacts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "combo_sales" ADD CONSTRAINT "FK_8a4d1d17ed7c483cc0d5f33e7a2" FOREIGN KEY ("combo_id") REFERENCES "combos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_31dee313a16866d5a5164b5759b" FOREIGN KEY ("venta_id") REFERENCES "sales"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_999d07ac5db8724c142ca8ed638" FOREIGN KEY ("venta_combo_id") REFERENCES "combo_sales"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "combo_servicios" ADD CONSTRAINT "FK_f1f5a003de90d35dbffca63f805" FOREIGN KEY ("combo_id") REFERENCES "combos"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "combo_servicios" ADD CONSTRAINT "FK_a36362e8dd070c1ce4987107b1a" FOREIGN KEY ("servicio_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "combo_servicios" DROP CONSTRAINT "FK_a36362e8dd070c1ce4987107b1a"`);
        await queryRunner.query(`ALTER TABLE "combo_servicios" DROP CONSTRAINT "FK_f1f5a003de90d35dbffca63f805"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_999d07ac5db8724c142ca8ed638"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_31dee313a16866d5a5164b5759b"`);
        await queryRunner.query(`ALTER TABLE "combo_sales" DROP CONSTRAINT "FK_8a4d1d17ed7c483cc0d5f33e7a2"`);
        await queryRunner.query(`ALTER TABLE "combo_sales" DROP CONSTRAINT "FK_7ada3c91877d6187ee8496b894c"`);
        await queryRunner.query(`ALTER TABLE "sales" DROP CONSTRAINT "FK_8e31b8cad1021f0a299db569979"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "CHK_payments_venta_xor_combo"`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "venta_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_31dee313a16866d5a5164b5759b" FOREIGN KEY ("venta_id") REFERENCES "sales"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "venta_combo_id"`);
        await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN "venta_combo_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a36362e8dd070c1ce4987107b1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f1f5a003de90d35dbffca63f80"`);
        await queryRunner.query(`DROP TABLE "combo_servicios"`);
        await queryRunner.query(`DROP TABLE "combo_sales"`);
        await queryRunner.query(`DROP TYPE "public"."combo_sales_moneda_enum"`);
        await queryRunner.query(`DROP SEQUENCE "combo_sales_codigo_venta_seq"`);
        await queryRunner.query(`DROP TABLE "combos"`);
    }

}
