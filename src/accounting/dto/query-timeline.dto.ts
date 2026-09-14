import { IsEnum, IsOptional } from 'class-validator';
import { QueryRangeDto } from './query-range.dto.js';
import { TimelineGroupBy } from '../../common/timeline-group-by.enum.js';

export class QueryTimelineDto extends QueryRangeDto {
  @IsOptional()
  @IsEnum(TimelineGroupBy)
  groupBy?: TimelineGroupBy;
}
