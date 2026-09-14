import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ContactType } from '../contact-type.enum.js';

export class UpdateContactDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  whatsapp?: string;

  @IsOptional()
  @IsEnum(ContactType)
  tipo?: ContactType;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
