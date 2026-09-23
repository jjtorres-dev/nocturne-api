import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Service } from '../services/entities/service.entity.js';
import { Account } from '../accounts/entities/account.entity.js';
import { Profile } from '../accounts/profiles/entities/profile.entity.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Service, Account, Profile])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
