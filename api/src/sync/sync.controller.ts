import { Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SyncService, SyncSummary } from './sync.service';

@ApiTags('sync')
@Controller('api/sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @ApiOperation({ summary: 'Run a sync against the remote todo API' })
  @ApiOkResponse({ description: 'Summary of the sync run' })
  @Post()
  run(): Promise<SyncSummary> {
    return this.syncService.run();
  }
}
