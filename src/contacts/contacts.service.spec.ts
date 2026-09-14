import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { ContactsService } from './contacts.service.js';
import { Contact } from './entities/contact.entity.js';
import { ContactType } from './contact-type.enum.js';

describe('ContactsService', () => {
  const baseContact: Contact = {
    id: 'contact-1',
    nombre: 'Juan Pérez',
    whatsapp: '+51999999999',
    tipo: ContactType.CLIENTE_FINAL,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let repo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  let contactsService: ContactsService;

  beforeEach(() => {
    repo = {
      create: vi.fn((dto) => ({ ...dto })),
      save: vi.fn(async (entity) => entity),
      update: vi.fn(async () => ({ affected: 1 })),
      findOne: vi.fn(),
      find: vi.fn(),
    };
    contactsService = new ContactsService(repo as unknown as Repository<Contact>);
  });

  it('crea un contacto a partir del DTO', async () => {
    const dto = {
      nombre: 'María López',
      whatsapp: '+51988888888',
      tipo: ContactType.REVENDEDOR,
    };

    const result = await contactsService.create(dto);

    expect(repo.create).toHaveBeenCalledWith(dto);
    expect(result).toMatchObject(dto);
  });

  it('filtra por tipo y activo al listar', async () => {
    repo.find.mockResolvedValue([baseContact]);

    await contactsService.findAll({ tipo: ContactType.CLIENTE_FINAL, activo: true });

    expect(repo.find).toHaveBeenCalledWith({
      where: { tipo: ContactType.CLIENTE_FINAL, activo: true },
      order: { nombre: 'ASC' },
    });
  });

  it('lanza NotFoundException si el contacto no existe', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(contactsService.findOne('no-existe')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('update no pisa en la respuesta los campos no incluidos en el PATCH', async () => {
    const dtoConCamposNoEnviadosEnUndefined = {
      nombre: undefined,
      whatsapp: '+51977777777',
      tipo: undefined,
      activo: undefined,
    };
    repo.findOne.mockResolvedValue({
      ...baseContact,
      whatsapp: '+51977777777',
    });

    const result = await contactsService.update(
      baseContact.id,
      dtoConCamposNoEnviadosEnUndefined,
    );

    expect(repo.update).toHaveBeenCalledWith(
      baseContact.id,
      dtoConCamposNoEnviadosEnUndefined,
    );
    expect(result).toMatchObject({
      nombre: baseContact.nombre,
      tipo: baseContact.tipo,
      activo: baseContact.activo,
      whatsapp: '+51977777777',
    });
  });

  it('softDelete pone activo en false sin borrar el registro', async () => {
    repo.findOne.mockResolvedValue({ ...baseContact, activo: true });

    const result = await contactsService.softDelete(baseContact.id);

    expect(result.activo).toBe(false);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ activo: false }),
    );
  });

  it('reactivate pone activo en true', async () => {
    repo.findOne.mockResolvedValue({ ...baseContact, activo: false });

    const result = await contactsService.reactivate(baseContact.id);

    expect(result.activo).toBe(true);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ activo: true }),
    );
  });

  it('reactivate lanza NotFoundException si el contacto no existe', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(contactsService.reactivate('no-existe')).rejects.toThrow(
      NotFoundException,
    );
  });
});
