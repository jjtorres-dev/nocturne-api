import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSales1789396958765 implements MigrationInterface {
    name = 'AddSales1789396958765'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Secuencia propia para "codigo_venta" (formato "V-00001"): la
        // consulta directamente SalesService.generateCodigoVenta() con
        // nextval(), no es algo que TypeORM sepa generar desde la entidad.
        await queryRunner.query(`CREATE SEQUENCE "sales_codigo_venta_seq" START 1`);
        await queryRunner.query(`CREATE TYPE "public"."sales_moneda_enum" AS ENUM('PEN', 'USD', 'ARS', 'BS', 'CLP', 'COP', 'CRC', 'CUP', 'DOP', 'MXN', 'PYG', 'UYU')`);
        await queryRunner.query(`CREATE TABLE "sales" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "cliente_id" uuid NOT NULL, "cuenta_id" uuid NOT NULL, "perfil_id" uuid, "servicio_id" uuid NOT NULL, "codigo_venta" character varying NOT NULL, "duracion_meses" numeric(4,1) NOT NULL, "fecha_inicio" date NOT NULL, "fecha_fin" date NOT NULL, "precio" numeric(10,2) NOT NULL, "moneda" "public"."sales_moneda_enum" NOT NULL, "tasa_cambio" numeric(10,4) NOT NULL DEFAULT '1', "precio_pen" numeric(10,2) NOT NULL, "metodo_pago" character varying NOT NULL, "renovacion_automatica" boolean NOT NULL DEFAULT false, "activo" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_2223af518f0071d1d8ac4440851" UNIQUE ("codigo_venta"), CONSTRAINT "PK_4f0bc990ae81dba46da680895ea" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "sales" ADD CONSTRAINT "FK_dfe57c565a9fa23906a085cde2b" FOREIGN KEY ("cliente_id") REFERENCES "contacts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sales" ADD CONSTRAINT "FK_a60a071a5d113966398eda65e0d" FOREIGN KEY ("cuenta_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sales" ADD CONSTRAINT "FK_2f52e70dc81f22353f74973b0fc" FOREIGN KEY ("perfil_id") REFERENCES "profiles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sales" ADD CONSTRAINT "FK_779fdbadf4a3450976724c36b24" FOREIGN KEY ("servicio_id") REFERENCES "services"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sales" DROP CONSTRAINT "FK_779fdbadf4a3450976724c36b24"`);
        await queryRunner.query(`ALTER TABLE "sales" DROP CONSTRAINT "FK_2f52e70dc81f22353f74973b0fc"`);
        await queryRunner.query(`ALTER TABLE "sales" DROP CONSTRAINT "FK_a60a071a5d113966398eda65e0d"`);
        await queryRunner.query(`ALTER TABLE "sales" DROP CONSTRAINT "FK_dfe57c565a9fa23906a085cde2b"`);
        await queryRunner.query(`DROP TABLE "sales"`);
        await queryRunner.query(`DROP TYPE "public"."sales_moneda_enum"`);
        await queryRunner.query(`DROP SEQUENCE "sales_codigo_venta_seq"`);
    }

}
