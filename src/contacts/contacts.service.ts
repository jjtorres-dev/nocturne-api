import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact } from './entities/contact.entity.js';
import { CreateContactDto } from './dto/create-contact.dto.js';
import { UpdateContactDto } from './dto/update-contact.dto.js';
import { QueryContactDto } from './dto/query-contact.dto.js';

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactsRepository: Repository<Contact>,
  ) {}

  create(dto: CreateContactDto): Promise<Contact> {
    const contact = this.contactsRepository.create(dto);
    return this.contactsRepository.save(contact);
  }

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

  async update(id: string, dto: UpdateContactDto): Promise<Contact> {
    // Ver comentario equivalente en ServicesService.update: evita que
    // Object.assign pise en memoria los campos no incluidos en el PATCH.
    await this.findOne(id);
    await this.contactsRepository.update(id, dto);
    return this.findOne(id);
  }

  async softDelete(id: string): Promise<Contact> {
    const contact = await this.findOne(id);
    contact.activo = false;
    return this.contactsRepository.save(contact);
  }
}
