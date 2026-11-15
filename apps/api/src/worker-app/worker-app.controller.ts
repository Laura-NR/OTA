import { randomBytes } from 'node:crypto';

import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import type { WorkerAppLatestDto } from '@ota/schemas';
import type { Response } from 'express';

import { Public } from '../auth/public.decorator';
import { WorkerAppService } from './worker-app.service';

/** expo-updates protocol 1's response headers; never cached, so a release is seen at once. */
const PROTOCOL_HEADERS = {
  'expo-protocol-version': '1',
  'expo-sfv-version': '0',
  'cache-control': 'private, max-age=0',
};

/**
 * The worker app's releases (`docs/worker-app-distribution-plan.md` U1a, U2a,
 * U5a): public, since the download page, a phone signed out and the update
 * check all read them, and nothing here is personal. The phone trusts an APK
 * by its signature and a JS update by the release key's signature, not by
 * this route.
 */
@Controller('worker-app')
export class WorkerAppController {
  constructor(private readonly workerApp: WorkerAppService) {}

  @Get('latest')
  @Public()
  latest(): Promise<WorkerAppLatestDto> {
    return this.workerApp.latest();
  }

  /** Served with ranges, so a download cut on mobile data resumes (ADR 0007). */
  @Get('apk/:file')
  @Public()
  async apk(@Param('file') file: string, @Res() res: Response): Promise<void> {
    const path = await this.workerApp.apkPath(file);
    if (!path) throw new NotFoundException();
    res.sendFile(path, {
      // The folder may sit under a dot-directory (`.worker-app` in development);
      // the path is already checked against the release.
      dotfiles: 'allow',
      headers: {
        'content-type': 'application/vnd.android.package-archive',
        'content-disposition': `attachment; filename="${file}"`,
      },
    });
  }

  /** expo-updates protocol 1: the latest signed manifest for the phone's runtime. */
  @Get('updates/manifest')
  @Public()
  async manifest(
    @Headers('expo-platform') platform: string | undefined,
    @Headers('expo-runtime-version') runtimeVersion: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (platform !== 'android' || !runtimeVersion) {
      throw new BadRequestException(
        'expo-platform android and expo-runtime-version are required',
      );
    }
    const manifest = await this.workerApp.manifest(runtimeVersion);
    res.set(PROTOCOL_HEADERS);
    if (!manifest) {
      res.status(204).end();
      return;
    }
    const boundary = `vereda-${randomBytes(12).toString('hex')}`;
    const part = (name: string, body: string, extra: string[] = []) =>
      [
        `--${boundary}`,
        'content-type: application/json; charset=utf-8',
        `content-disposition: form-data; name="${name}"`,
        ...extra,
        '',
        body,
      ].join('\r\n');
    // Node's own setHeader and a Buffer body: Express would add a charset
    // after the boundary.
    res.setHeader('content-type', `multipart/mixed; boundary=${boundary}`);
    res
      .status(200)
      .send(
        Buffer.from(
          [
            part('manifest', manifest.body, [`expo-signature: ${manifest.signature}`]),
            part('extensions', JSON.stringify({ assetRequestHeaders: {} })),
            `--${boundary}--`,
            '',
          ].join('\r\n'),
        ),
      );
  }

  /** An update's bundle or image; its name is its hash, so it never changes. */
  @Get('updates/:runtimeVersion/:updateId/assets/:file')
  @Public()
  async asset(
    @Param('runtimeVersion') runtimeVersion: string,
    @Param('updateId') updateId: string,
    @Param('file') file: string,
    @Res() res: Response,
  ): Promise<void> {
    const path = await this.workerApp.assetPath(runtimeVersion, updateId, file);
    if (!path) throw new NotFoundException();
    res.sendFile(path, { dotfiles: 'allow', maxAge: '365d', immutable: true });
  }
}
