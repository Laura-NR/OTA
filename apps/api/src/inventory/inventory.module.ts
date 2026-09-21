import { Module } from '@nestjs/common';

import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { PublicCatalogController } from './public-catalog.controller';

@Module({
  controllers: [InventoryController, PublicCatalogController],
  providers: [InventoryService],
})
export class InventoryModule {}
