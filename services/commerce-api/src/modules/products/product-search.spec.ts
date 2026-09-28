import {
  MAX_SEARCH_TERM_LENGTH,
  MAX_SEARCH_TERMS,
  searchTerms,
} from './product-search';

describe('searchTerms', () => {
  it('returns no terms for a missing or blank query', () => {
    expect(searchTerms(undefined)).toEqual([]);
    expect(searchTerms('')).toEqual([]);
    expect(searchTerms(' \t\n ')).toEqual([]);
  });

  it('splits on any run of whitespace', () => {
    expect(searchTerms('  red\trunning \n shoes ')).toEqual([
      'red',
      'running',
      'shoes',
    ]);
  });

  it('keeps a single-word query as one term', () => {
    expect(searchTerms('Acme')).toEqual(['Acme']);
  });

  it('trims punctuation from the ends of a term but not its middle', () => {
    expect(searchTerms('(red), t-shirt H&M "AB-12"')).toEqual([
      'red',
      't-shirt',
      'H&M',
      'AB-12',
    ]);
  });

  it('keeps letters and digits from any script', () => {
    expect(searchTerms('café Ñandú 手机')).toEqual(['café', 'Ñandú', '手机']);
  });

  it('drops terms made only of punctuation', () => {
    expect(searchTerms('red - & shoes')).toEqual(['red', 'shoes']);
  });

  it('keeps short terms, so "iphone 5" still means model 5', () => {
    expect(searchTerms('iphone 5')).toEqual(['iphone', '5']);
  });

  it('collapses duplicates case-insensitively, keeping the first spelling', () => {
    expect(searchTerms('Red red RED shoes')).toEqual(['Red', 'shoes']);
  });

  it(`caps the query at ${MAX_SEARCH_TERMS} terms`, () => {
    const words = Array.from({ length: 20 }, (_, i) => `w${i}`);

    expect(searchTerms(words.join(' '))).toEqual(
      words.slice(0, MAX_SEARCH_TERMS),
    );
  });

  it('counts the cap after de-duplication', () => {
    const query = ['a', 'a', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].join(
      ' ',
    );

    expect(searchTerms(query)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
    ]);
  });

  it(`cuts a term to ${MAX_SEARCH_TERM_LENGTH} characters`, () => {
    const [term] = searchTerms('x'.repeat(500));

    expect(term).toBe('x'.repeat(MAX_SEARCH_TERM_LENGTH));
  });
});
