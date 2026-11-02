/** Upper bounds, in seconds, shared by request and job duration histograms. */
export const DURATION_BUCKETS_SECONDS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30,
] as const;

/** Wider bounds for queue lag, where minutes of backlog are still meaningful. */
export const LAG_BUCKETS_SECONDS = [
  0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 300, 900, 3600,
] as const;

export type HistogramSnapshot = {
  count: number;
  sumSeconds: number;
  /** Cumulative counts per upper bound, ending with +Inf. */
  buckets: { le: number | '+Inf'; count: number }[];
};

/**
 * A fixed-bucket histogram in the Prometheus style: cheap to update on every
 * request, constant memory, and mergeable by a scraper. Quantiles derived
 * from it are bucket-interpolated estimates, not exact percentiles.
 */
export class Histogram {
  private readonly counts: number[];
  private total = 0;
  private sum = 0;

  constructor(private readonly bounds: readonly number[]) {
    this.counts = new Array<number>(bounds.length + 1).fill(0);
  }

  observe(seconds: number): void {
    const value = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    let index = this.bounds.findIndex((bound) => value <= bound);
    if (index === -1) index = this.bounds.length;
    this.counts[index] = (this.counts[index] ?? 0) + 1;
    this.total += 1;
    this.sum += value;
  }

  get count(): number {
    return this.total;
  }

  get sumSeconds(): number {
    return this.sum;
  }

  /** Linear interpolation within the bucket holding quantile `q` (0..1). */
  quantile(q: number): number | null {
    if (this.total === 0) return null;
    const rank = q * this.total;
    let seen = 0;
    for (let index = 0; index < this.counts.length; index += 1) {
      const inBucket = this.counts[index] ?? 0;
      if (seen + inBucket >= rank && inBucket > 0) {
        const lower = index === 0 ? 0 : (this.bounds[index - 1] ?? 0);
        const upper = this.bounds[index];
        // The overflow bucket has no upper bound; report its lower edge.
        if (upper === undefined) return lower;
        return lower + ((upper - lower) * (rank - seen)) / inBucket;
      }
      seen += inBucket;
    }
    return this.bounds[this.bounds.length - 1] ?? null;
  }

  snapshot(): HistogramSnapshot {
    let cumulative = 0;
    const buckets: HistogramSnapshot['buckets'] = this.bounds.map(
      (bound, index) => {
        cumulative += this.counts[index] ?? 0;
        return { le: bound, count: cumulative };
      },
    );
    buckets.push({ le: '+Inf', count: this.total });
    return { count: this.total, sumSeconds: this.sum, buckets };
  }
}

/**
 * Caps how many distinct values a label may take. Values come from code
 * (route templates, job types, topics), but a cap keeps a bug or an
 * unexpected database value from growing memory and scrape size without
 * bound: once full, unseen values collapse into `other`.
 */
export class BoundedLabel {
  private readonly seen = new Set<string>();

  constructor(private readonly capacity: number) {}

  normalize(value: string): string {
    if (this.seen.has(value)) return value;
    if (this.seen.size >= this.capacity) return BoundedLabel.OVERFLOW;
    this.seen.add(value);
    return value;
  }

  static readonly OVERFLOW = 'other';
}
