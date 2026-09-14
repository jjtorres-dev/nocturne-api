import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Combo } from './entities/combo.entity.js';
import { CombosService } from './combos.service.js';
import { CombosController } from './combos.controller.js';
import { ServicesModule } from '../services/services.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Combo]), ServicesModule],
  controllers: [CombosController],
  providers: [CombosService],
  exports: [CombosService],
})
export class CombosModule {}
