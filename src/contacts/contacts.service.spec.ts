import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { ContactsService } from './contacts.service.js';
import { Contact } from './entities/contact.entity.js';
import { ContactType } from './contact-type.enum.js';
import { UserRole } from '../users/user-role.enum.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';

describe('ContactsService', () => {
  const admin: AuthenticatedUser = {
    id: 'admin-1',
    email: 'admin@nocturne.dev',
    name: 'Admin',
    role: UserRole.ADMIN,
  };
  const revendedorA: AuthenticatedUser = {
    id: 'revendedor-a',
    email: 'a@nocturne.dev',
    name: 'Revendedor A',
    role: UserRole.REVENDEDOR,
  };
  const revendedorB: AuthenticatedUser = {
    id: 'revendedor-b',
    email: 'b@nocturne.dev',
    name: 'Revendedor B',
    role: UserRole.REVENDEDOR,
  };

  const baseContact: Contact = {
    id: 'contact-1',
    ownerId: revendedorA.id,
    owner: { id: revendedorA.id, name: revendedorA.name, email: revendedorA.email },
    nombre: 'Juan Pérez',
    whatsapp: '+51999999999',
    tipo: ContactType.CLIENTE_FINAL,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Contact;

  const OWNED_SELECT = {
    id: true,
    ownerId: true,
    nombre: true,
    whatsapp: true,
    tipo: true,
    activo: true,
    createdAt: true,
    updatedAt: true,
    owner: { id: true, name: true, email: true },
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

  it('crea un contacto a partir del DTO, con ownerId del usuario autenticado (no del body)', async () => {
    const dto = {
      nombre: 'María López',
      whatsapp: '+51988888888',
      tipo: ContactType.REVENDEDOR,
    };

    const result = await contactsService.create(dto, revendedorA);

    expect(repo.create).toHaveBeenCalledWith({ ...dto, ownerId: revendedorA.id });
    expect(result).toMatchObject({ ...dto, ownerId: revendedorA.id });
  });

  describe('findAllOwned', () => {
    it('un REVENDEDOR queda acotado a su propio ownerId, sin importar el query', async () => {
      repo.find.mockResolvedValue([baseContact]);

      await contactsService.findAllOwned(
        { tipo: ContactType.CLIENTE_FINAL, activo: true },
        revendedorA,
      );

      expect(repo.find).toHaveBeenCalledWith({
        where: { tipo: ContactType.CLIENTE_FINAL, activo: true, ownerId: revendedorA.id },
        relations: { owner: true },
        select: OWNED_SELECT,
        order: { nombre: 'ASC' },
      });
    });

    it('un ADMIN ve todo, sin filtro de ownerId', async () => {
      repo.find.mockResolvedValue([baseContact]);

      await contactsService.findAllOwned({}, admin);

      expect(repo.find).toHaveBeenCalledWith({
        where: {},
        relations: { owner: true },
        select: OWNED_SELECT,
        order: { nombre: 'ASC' },
      });
    });

    it('siempre incluye el owner {id, name, email}, para admin y para revendedor por igual', async () => {
      repo.find.mockResolvedValue([baseContact]);

      const [resultAdmin] = await contactsService.findAllOwned({}, admin);
      const [resultRevendedor] = await contactsService.findAllOwned({}, revendedorA);

      expect(resultAdmin.owner).toEqual({
        id: revendedorA.id,
        name: revendedorA.name,
        email: revendedorA.email,
      });
      expect(resultRevendedor.owner).toEqual(resultAdmin.owner);
    });
  });

  describe('findOneOwned', () => {
    it('el dueño puede ver su propio contacto, con el owner {id, name, email} poblado', async () => {
      repo.findOne.mockResolvedValue(baseContact);

      const result = await contactsService.findOneOwned(baseContact.id, revendedorA);

      expect(result).toBe(baseContact);
      expect(result.owner).toEqual({
        id: revendedorA.id,
        name: revendedorA.name,
        email: revendedorA.email,
      });
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: baseContact.id },
        relations: { owner: true },
        select: OWNED_SELECT,
      });
    });

    it('otro REVENDEDOR recibe NotFoundException (404, no 403) sobre un contacto ajeno', async () => {
      repo.findOne.mockResolvedValue(baseContact);

      await expect(
        contactsService.findOneOwned(baseContact.id, revendedorB),
      ).rejects.toThrow(NotFoundException);
    });

    it('el ADMIN puede ver el contacto de cualquiera, con el mismo owner poblado que ve el dueño', async () => {
      repo.findOne.mockResolvedValue(baseContact);

      const result = await contactsService.findOneOwned(baseContact.id, admin);

      expect(result).toBe(baseContact);
      expect(result.owner).toEqual({
        id: revendedorA.id,
        name: revendedorA.name,
        email: revendedorA.email,
      });
    });

    it('lanza NotFoundException si el contacto no existe', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(contactsService.findOneOwned('no-existe', admin)).rejects.toThrow(
        NotFoundException,
      );
    });
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
      revendedorA,
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

  it('update: un REVENDEDOR no puede tocar un contacto ajeno (404)', async () => {
    repo.findOne.mockResolvedValue(baseContact);

    await expect(
      contactsService.update(baseContact.id, { nombre: 'Hackeado' }, revendedorB),
    ).rejects.toThrow(NotFoundException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('softDelete pone activo en false sin borrar el registro', async () => {
    repo.findOne.mockResolvedValue({ ...baseContact, activo: true });

    const result = await contactsService.softDelete(baseContact.id, revendedorA);

    expect(result.activo).toBe(false);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ activo: false }),
    );
  });

  it('softDelete: un REVENDEDOR no puede desactivar un contacto ajeno (404)', async () => {
    repo.findOne.mockResolvedValue(baseContact);

    await expect(contactsService.softDelete(baseContact.id, revendedorB)).rejects.toThrow(
      NotFoundException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('reactivate pone activo en true', async () => {
    repo.findOne.mockResolvedValue({ ...baseContact, activo: false });

    const result = await contactsService.reactivate(baseContact.id, revendedorA);

    expect(result.activo).toBe(true);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ activo: true }),
    );
  });

  it('reactivate: un REVENDEDOR no puede reactivar un contacto ajeno (404)', async () => {
    repo.findOne.mockResolvedValue(baseContact);

    await expect(contactsService.reactivate(baseContact.id, revendedorB)).rejects.toThrow(
      NotFoundException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('reactivate lanza NotFoundException si el contacto no existe', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(contactsService.reactivate('no-existe', admin)).rejects.toThrow(
      NotFoundException,
    );
  });
});
