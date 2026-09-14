import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VentaCombo } from './entities/venta-combo.entity.js';

// ComboSalesService/ComboSalesController llegan en los próximos commits;
// este registro es lo mínimo necesario para que TypeORM resuelva la
// entidad VentaCombo (Sale y Payment ya la referencian por relación).
@Module({
  imports: [TypeOrmModule.forFeature([VentaCombo])],
})
export class ComboSalesModule {}
