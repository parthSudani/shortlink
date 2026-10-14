import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { RedirectController } from './redirect.controller';

@Module({
  imports: [CoreModule],
  controllers: [RedirectController],
})
export class RedirectsModule {}
