import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity.js';
import { UserRole } from './user-role.enum.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async upsertAdmin(
    email: string,
    passwordHash: string,
    name: string,
  ): Promise<User> {
    const existing = await this.findByEmail(email);
    if (existing) {
      existing.passwordHash = passwordHash;
      existing.name = name;
      existing.role = UserRole.ADMIN;
      return this.usersRepository.save(existing);
    }
    const user = this.usersRepository.create({
      email,
      passwordHash,
      name,
      role: UserRole.ADMIN,
    });
    return this.usersRepository.save(user);
  }
}
