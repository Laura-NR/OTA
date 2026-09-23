import { Module } from '@nestjs/common';

import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';
import { PublicPackagesController } from './public-packages.controller';

@Module({
  controllers: [PackagesController, PublicPackagesController],
  providers: [PackagesService],
})
export class PackagesModule {}
