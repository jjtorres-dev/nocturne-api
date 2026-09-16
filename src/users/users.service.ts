import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity.js';
import { UserRole } from './user-role.enum.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import type { PublicUser } from './public-user.js';

const PUBLIC_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  // password_hash queda afuera a propósito: ningún endpoint de /users debe
  // exponerlo, ni siquiera al crear/actualizar.
} as const;

const BCRYPT_ROUNDS = 10;

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

  findAll(): Promise<PublicUser[]> {
    return this.usersRepository.find({
      select: PUBLIC_SELECT,
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<PublicUser> {
    const user = await this.usersRepository.findOne({
      where: { id },
      select: PUBLIC_SELECT,
    });
    if (!user) {
      throw new NotFoundException(`Usuario ${id} no encontrado`);
    }
    return user;
  }

  async create(dto: CreateUserDto): Promise<PublicUser> {
    const existing = await this.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException(
        `Ya existe un usuario con el email ${dto.email}`,
      );
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = this.usersRepository.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      role: dto.role,
    });
    const saved = await this.usersRepository.save(user);
    return this.findOne(saved.id);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    currentUserId: string,
  ): Promise<PublicUser> {
    await this.findOne(id);
    if (id === currentUserId && dto.role !== undefined) {
      throw new ForbiddenException('No podés cambiar tu propio rol');
    }
    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, BCRYPT_ROUNDS)
      : undefined;
    // No usar Object.assign(entity, dto): mismo motivo documentado en
    // ServicesService.update (el ValidationPipe arma un dto con todas las
    // propiedades declaradas como propias, `undefined` en las no enviadas).
    await this.usersRepository.update(id, {
      name: dto.name,
      role: dto.role,
      passwordHash,
    });
    return this.findOne(id);
  }

  async softDelete(id: string, currentUserId: string): Promise<PublicUser> {
    if (id === currentUserId) {
      throw new ForbiddenException('No podés desactivar tu propia cuenta');
    }
    await this.findOne(id);
    await this.usersRepository.update(id, { isActive: false });
    return this.findOne(id);
  }

  async reactivate(id: string): Promise<PublicUser> {
    await this.findOne(id);
    await this.usersRepository.update(id, { isActive: true });
    return this.findOne(id);
  }
}
