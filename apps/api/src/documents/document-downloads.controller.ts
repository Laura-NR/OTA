import { Controller, Get, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import type { Response } from 'express';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { DocumentsService } from './documents.service';

@Controller('documents')
export class DocumentDownloadsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get(':id/download')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Res() response: Response,
  ): Promise<void> {
    const { document, data } = await this.documents.read(id, actor);
    response.setHeader('content-type', 'application/pdf');
    response.setHeader(
      'content-disposition',
      `inline; filename="${document.type.toLowerCase()}.pdf"`,
    );
    response.send(Buffer.from(data));
  }
}
