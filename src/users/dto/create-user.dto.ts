import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { UserRole } from '../user-role.enum.js';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsEnum(UserRole)
  role: UserRole;
}
