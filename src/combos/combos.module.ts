import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Combo } from './entities/combo.entity.js';

// CombosService/CombosController llegan en el siguiente commit; este
// registro es lo mínimo necesario para que TypeORM resuelva la entidad
// Combo (Sale.ventaCombo -> VentaCombo -> Combo depende de que exista en
// algún forFeature, aunque nadie la use todavía).
@Module({
  imports: [TypeOrmModule.forFeature([Combo])],
})
export class CombosModule {}
