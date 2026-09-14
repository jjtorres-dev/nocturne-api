import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ContactType } from '../contact-type.enum.js';

export class CreateContactDto {
  @IsString()
  @MinLength(1)
  nombre: string;

  @IsString()
  @MinLength(1)
  whatsapp: string;

  @IsEnum(ContactType)
  tipo: ContactType;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
