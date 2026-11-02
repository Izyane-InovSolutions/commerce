import { BoundedLabel, Histogram } from './histogram';

describe('Histogram', () => {
  it('counts each observation into its bucket and keeps the sum', () => {
    const histogram = new Histogram([0.1, 1]);
    histogram.observe(0.05);
    histogram.observe(0.5);
    histogram.observe(5);

    expect(histogram.snapshot()).toEqual({
      count: 3,
      sumSeconds: 5.55,
      buckets: [
        { le: 0.1, count: 1 },
        { le: 1, count: 2 },
        { le: '+Inf', count: 3 },
      ],
    });
  });

  it('interpolates quantiles within a bucket', () => {
    const histogram = new Histogram([0.1, 0.2]);
    for (let i = 0; i < 10; i += 1) histogram.observe(0.15);

    expect(histogram.quantile(0.5)).toBeCloseTo(0.15);
    expect(histogram.quantile(0.99)).toBeCloseTo(0.199);
  });

  it('reports the overflow bucket at its lower edge and nothing when empty', () => {
    const histogram = new Histogram([0.1]);
    expect(histogram.quantile(0.5)).toBeNull();
    histogram.observe(42);
    expect(histogram.quantile(0.99)).toBe(0.1);
  });

  it('treats negative and non-finite durations as zero', () => {
    const histogram = new Histogram([0.1]);
    histogram.observe(-1);
    histogram.observe(Number.NaN);
    expect(histogram.sumSeconds).toBe(0);
    expect(histogram.count).toBe(2);
  });
});

describe('BoundedLabel', () => {
  it('keeps known values and collapses new ones once full', () => {
    const label = new BoundedLabel(2);
    expect(label.normalize('a')).toBe('a');
    expect(label.normalize('b')).toBe('b');
    expect(label.normalize('c')).toBe('other');
    expect(label.normalize('a')).toBe('a');
  });
});
