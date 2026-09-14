import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Profile } from './entities/profile.entity.js';
import { ProfilesService } from './profiles.service.js';
import { ProfilesController } from './profiles.controller.js';
import { AccountsModule } from '../accounts.module.js';
import { ServicesModule } from '../../services/services.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Profile]), AccountsModule, ServicesModule],
  controllers: [ProfilesController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
