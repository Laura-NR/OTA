import { Module } from '@nestjs/common';
import { parsePassportKey } from '@ota/domain/passport-cipher';

import { TravelersController } from './travelers.controller';
import { TravelersService } from './travelers.service';
import { PASSPORT_KEY } from './travelers.tokens';

@Module({
  controllers: [TravelersController],
  providers: [
    TravelersService,
    {
      provide: PASSPORT_KEY,
      // Unset: the party works, but storing or reading a passport number is
      // refused (503). A malformed key fails startup rather than encrypt badly.
      useFactory: (): Buffer | null => {
        const raw = process.env.PASSPORT_ENCRYPTION_KEY;
        return raw ? parsePassportKey(raw) : null;
      },
    },
  ],
  // The Booking form (MeModule) stores passport numbers with the same key.
  exports: [PASSPORT_KEY],
})
export class TravelersModule {}
