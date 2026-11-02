import { Global, Module } from '@nestjs/common';

import { ShutdownState } from './shutdown-state.service';

@Global()
@Module({
  providers: [ShutdownState],
  exports: [ShutdownState],
})
export class LifecycleModule {}
