import { Global, Module } from '@nestjs/common';
import { SequenceService } from './services/sequence.service';
import { AuditService } from './services/audit.service';
import { StorageService } from './services/storage.service';

@Global()
@Module({
  providers: [SequenceService, AuditService, StorageService],
  exports: [SequenceService, AuditService, StorageService],
})
export class CommonModule {}
