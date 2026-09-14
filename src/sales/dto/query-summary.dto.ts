import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class QuerySummaryDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  diasAlerta?: number;
}
