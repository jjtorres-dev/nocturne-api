import { MigrationInterface, QueryRunner } from "typeorm";

// Bloque — Cuentas caídas y reposición del proveedor: `accounts.fecha_caida`
// (la cuenta está caída si no es null) y `sale_adjustments`, los días que se
// le compensan a cada venta/combo cuando el proveedor repone la cuenta. El
// CHECK venta XOR combo es el mismo criterio que "CHK_payments_venta_xor_combo".
export class AddAccountDownAndSaleAdjustments1791100800000 implements MigrationInterface {
    name = 'AddAccountDownAndSaleAdjustments1791100800000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "accounts" ADD "fecha_caida" date`);
        await queryRunner.query(`CREATE TYPE "public"."sale_adjustments_tipo_enum" AS ENUM('compensacion')`);
        await queryRunner.query(`CREATE TABLE "sale_adjustments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "venta_id" uuid, "venta_combo_id" uuid, "cuenta_id" uuid NOT NULL, "tipo" "public"."sale_adjustments_tipo_enum" NOT NULL, "dias" integer NOT NULL, "fecha_caida" date NOT NULL, "fecha_reposicion" date NOT NULL, "motivo" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_sale_adjustments" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_264436e4acdb61ec02ad5f48ec" ON "sale_adjustments" ("venta_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_fc2cb2a2ac3d5ef9f877ca4af8" ON "sale_adjustments" ("venta_combo_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_98fb7e829d4744001766ad273e" ON "sale_adjustments" ("cuenta_id") `);
        await queryRunner.query(`ALTER TABLE "sale_adjustments" ADD CONSTRAINT "CHK_sale_adjustments_venta_xor_combo" CHECK (("venta_id" IS NOT NULL AND "venta_combo_id" IS NULL) OR ("venta_id" IS NULL AND "venta_combo_id" IS NOT NULL))`);
        await queryRunner.query(`ALTER TABLE "sale_adjustments" ADD CONSTRAINT "FK_264436e4acdb61ec02ad5f48ecb" FOREIGN KEY ("venta_id") REFERENCES "sales"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sale_adjustments" ADD CONSTRAINT "FK_fc2cb2a2ac3d5ef9f877ca4af88" FOREIGN KEY ("venta_combo_id") REFERENCES "combo_sales"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sale_adjustments" ADD CONSTRAINT "FK_98fb7e829d4744001766ad273e5" FOREIGN KEY ("cuenta_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sale_adjustments" DROP CONSTRAINT "FK_98fb7e829d4744001766ad273e5"`);
        await queryRunner.query(`ALTER TABLE "sale_adjustments" DROP CONSTRAINT "FK_fc2cb2a2ac3d5ef9f877ca4af88"`);
        await queryRunner.query(`ALTER TABLE "sale_adjustments" DROP CONSTRAINT "FK_264436e4acdb61ec02ad5f48ecb"`);
        await queryRunner.query(`ALTER TABLE "sale_adjustments" DROP CONSTRAINT "CHK_sale_adjustments_venta_xor_combo"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_98fb7e829d4744001766ad273e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fc2cb2a2ac3d5ef9f877ca4af8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_264436e4acdb61ec02ad5f48ec"`);
        await queryRunner.query(`DROP TABLE "sale_adjustments"`);
        await queryRunner.query(`DROP TYPE "public"."sale_adjustments_tipo_enum"`);
        await queryRunner.query(`ALTER TABLE "accounts" DROP COLUMN "fecha_caida"`);
    }

}
