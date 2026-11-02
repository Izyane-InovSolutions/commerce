import { Injectable } from '@nestjs/common';

/**
 * Process-wide flag flipped when a shutdown signal arrives, before anything
 * is torn down. Readiness reports 503 from then on so a load balancer stops
 * routing new requests here while in-flight ones finish.
 */
@Injectable()
export class ShutdownState {
  private drainingSince: Date | null = null;

  beginDraining(): void {
    this.drainingSince ??= new Date();
  }

  get isDraining(): boolean {
    return this.drainingSince !== null;
  }
}
