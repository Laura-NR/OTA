import { Module } from '@nestjs/common';
import { createLlmProvider } from '@ota/ai';

import { AnalyticsModule } from '../analytics/analytics.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { LLM_PROVIDER } from './assistant.tokens';

/**
 * AI assistant surfaces. The concrete LLM is injected behind `LLM_PROVIDER`;
 * the mock is the default so drafting/summarising/translation work without a
 * vendor dependency or API key (spec §4.8).
 */
@Module({
  imports: [AnalyticsModule],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    {
      provide: LLM_PROVIDER,
      useFactory: () =>
        createLlmProvider({
          provider: (process.env.AI_PROVIDER as 'mock' | undefined) ?? 'mock',
        }),
    },
  ],
})
export class AssistantModule {}
