import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ContactType } from '../contact-type.enum.js';

export class QueryContactDto {
  @IsOptional()
  @IsEnum(ContactType)
  tipo?: ContactType;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  activo?: boolean;
}
