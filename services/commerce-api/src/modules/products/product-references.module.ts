import { Module } from '@nestjs/common';
import { ProductReferencesService } from './product-references.service';

// A lightweight entry point to product-owned references. It does not import
// offers or sellers, preventing cycles through their composition modules.
@Module({
  providers: [ProductReferencesService],
  exports: [ProductReferencesService],
})
export class ProductReferencesModule {}
