import { Module } from '@nestjs/common';

import { AdminAttributesController } from './admin-attributes.controller';
import { AttributesService } from './attributes.service';

@Module({
  controllers: [AdminAttributesController],
  providers: [AttributesService],
  exports: [AttributesService],
})
export class AttributesModule {}
