import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '../user-role.enum.js';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  // Opcional: presente solo cuando el admin quiere resetear la clave de
  // alguien. Sin este campo, PATCH no toca password_hash.
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
