import { Module } from '@nestjs/common';
import { join } from 'node:path';

import { DOCUMENT_RENDERER, PlaywrightDocumentRenderer } from './document-renderer';
import { DOCUMENT_STORAGE, LocalDocumentStorage } from './document-storage';
import { DocumentDownloadsController } from './document-downloads.controller';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  controllers: [DocumentsController, DocumentDownloadsController],
  providers: [
    DocumentsService,
    { provide: DOCUMENT_RENDERER, useClass: PlaywrightDocumentRenderer },
    {
      provide: DOCUMENT_STORAGE,
      useFactory: () =>
        new LocalDocumentStorage(
          process.env.DOCUMENTS_DIR ?? join(process.cwd(), '.documents'),
        ),
    },
  ],
  exports: [DocumentsService],
})
export class DocumentsModule {}
