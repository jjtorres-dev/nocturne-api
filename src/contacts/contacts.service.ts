import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact } from './entities/contact.entity.js';
import { CreateContactDto } from './dto/create-contact.dto.js';
import { UpdateContactDto } from './dto/update-contact.dto.js';
import { QueryContactDto } from './dto/query-contact.dto.js';
import { UserRole } from '../users/user-role.enum.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import type { SearchResultItem } from '../common/search-result.js';

// Se agrega siempre a las respuestas de findOneOwned/findAllOwned (admin o
// REVENDEDOR, sin condicional por rol): solo id/name/email del dueño, nunca
// el resto de User (ni por accidente el password_hash) — mismo criterio que
// ServicesService (Fase B1).
const OWNED_SELECT = {
  id: true,
  ownerId: true,
  nombre: true,
  whatsapp: true,
  tipo: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  owner: {
    id: true,
    name: true,
    email: true,
  },
} as const;

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactsRepository: Repository<Contact>,
  ) {}

  create(dto: CreateContactDto, currentUser: AuthenticatedUser): Promise<Contact> {
    const contact = this.contactsRepository.create({
      ...dto,
      ownerId: currentUser.id,
    });
    return this.contactsRepository.save(contact);
  }

  // Sin scope de ownership: uso interno de otros módulos (AccountsService,
  // SalesService, ComboSalesService) que necesitan ver cualquier contacto
  // para validar FKs (proveedorId/clienteId), sin importar quién hizo la
  // request HTTP original. Nunca exponer este método (ni findOne) directo
  // en el controller — ver findAllOwned/findOneOwned para eso.
  findAll(query: QueryContactDto): Promise<Contact[]> {
    const where: Partial<Pick<Contact, 'tipo' | 'activo'>> = {};
    if (query.tipo) {
      where.tipo = query.tipo;
    }
    if (query.activo !== undefined) {
      where.activo = query.activo;
    }
    return this.contactsRepository.find({ where, order: { nombre: 'ASC' } });
  }

  async findOne(id: string): Promise<Contact> {
    const contact = await this.contactsRepository.findOne({ where: { id } });
    if (!contact) {
      throw new NotFoundException(`Contacto ${id} no encontrado`);
    }
    return contact;
  }

  // Punto de entrada para el controller: un REVENDEDOR SIEMPRE queda
  // acotado a lo suyo acá, sin depender de que el cliente mande el filtro
  // correcto — la seguridad vive en el backend.
  findAllOwned(
    query: QueryContactDto,
    currentUser: AuthenticatedUser,
  ): Promise<Contact[]> {
    const where: Partial<Pick<Contact, 'tipo' | 'activo' | 'ownerId'>> = {};
    if (query.tipo) {
      where.tipo = query.tipo;
    }
    if (query.activo !== undefined) {
      where.activo = query.activo;
    }
    if (currentUser.role === UserRole.REVENDEDOR) {
      where.ownerId = currentUser.id;
    }
    return this.contactsRepository.find({
      where,
      relations: { owner: true },
      select: OWNED_SELECT,
      order: { nombre: 'ASC' },
    });
  }

  // Un REVENDEDOR pidiendo un contacto ajeno recibe 404, no 403: no hay que
  // confirmarle que el recurso existe si no es suyo.
  async findOneOwned(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<Contact> {
    const contact = await this.contactsRepository.findOne({
      where: { id },
      relations: { owner: true },
      select: OWNED_SELECT,
    });
    if (
      !contact ||
      (currentUser.role === UserRole.REVENDEDOR &&
        contact.ownerId !== currentUser.id)
    ) {
      throw new NotFoundException(`Contacto ${id} no encontrado`);
    }
    return contact;
  }

  // Buscador global (ver src/search/): LIMIT 5, acotado por ownerId con el
  // mismo criterio que findAllOwned — un REVENDEDOR nunca ve contactos de
  // otro dueño en los resultados.
  async search(
    term: string,
    currentUser: AuthenticatedUser,
  ): Promise<SearchResultItem[]> {
    const qb = this.contactsRepository
      .createQueryBuilder('contact')
      .select(['contact.id', 'contact.nombre'])
      .where('contact.nombre ILIKE :term', { term: `%${term}%` })
      .orderBy('contact.createdAt', 'DESC')
      .limit(5);
    if (currentUser.role === UserRole.REVENDEDOR) {
      qb.andWhere('contact.ownerId = :ownerId', { ownerId: currentUser.id });
    }
    const contacts = await qb.getMany();
    return contacts.map((c) => ({ id: c.id, label: c.nombre }));
  }

  async update(
    id: string,
    dto: UpdateContactDto,
    currentUser: AuthenticatedUser,
  ): Promise<Contact> {
    // Ver comentario equivalente en ServicesService.update: evita que
    // Object.assign pise en memoria los campos no incluidos en el PATCH.
    await this.findOneOwned(id, currentUser);
    await this.contactsRepository.update(id, dto);
    return this.findOneOwned(id, currentUser);
  }

  async softDelete(id: string, currentUser: AuthenticatedUser): Promise<Contact> {
    const contact = await this.findOneOwned(id, currentUser);
    contact.activo = false;
    return this.contactsRepository.save(contact);
  }

  async reactivate(id: string, currentUser: AuthenticatedUser): Promise<Contact> {
    const contact = await this.findOneOwned(id, currentUser);
    contact.activo = true;
    return this.contactsRepository.save(contact);
  }
}
