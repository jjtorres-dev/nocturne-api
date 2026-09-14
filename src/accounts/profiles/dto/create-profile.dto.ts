import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateProfileDto {
  @IsString()
  @MinLength(1)
  nombre: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  pin?: string;

  @IsOptional()
  @IsUUID()
  clienteId?: string;
}
