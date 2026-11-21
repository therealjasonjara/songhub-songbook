import { describe, expect, it } from 'vitest';
import { normalize } from '../../src/lib/normalize.ts';

describe('normalize (business rule 1)', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalize('  The   BEATLES ')).toBe('the beatles');
  });
  it('drops apostrophes and quotes without a gap', () => {
    expect(normalize("'Di Ka Na Others")).toBe('di ka na others');
    expect(normalize('(I\'ve Had) the Time of My Life')).toBe('ive had the time of my life');
    expect(normalize('Guns N’ Roses')).toBe('guns n roses');
    expect(normalize('"Weird Al"')).toBe('weird al');
  });
  it('turns brackets and other punctuation into spaces', () => {
    expect(normalize('Taylor Swift(Taylor Swift Version)')).toBe('taylor swift taylor swift version');
    expect(normalize('Jay-R')).toBe('jay r');
    expect(normalize('Anne-Marie, Ksi')).toBe('anne marie ksi');
  });
  it('drops dots', () => {
    expect(normalize('R.E.M.')).toBe('rem');
  });
  it('strips diacritics', () => {
    expect(normalize('Beyoncé')).toBe('beyonce');
    expect(normalize('Sigur Rós Ørjan Łódź')).toBe('sigur ros orjan lodz');
  });
  it('treats & and and alike', () => {
    expect(normalize('Ben&Ben')).toBe('ben and ben');
    expect(normalize('Ben & Ben')).toBe(normalize('Ben and Ben'));
    expect(normalize('Brooks & Dunn')).toBe(normalize('brooks AND dunn'));
  });
  it('treats underscores as spaces', () => {
    expect(normalize('April Boy_jc Regino')).toBe('april boy jc regino');
    expect(normalize('_the Take over the Breaks Over_')).toBe('the take over the breaks over');
  });
  it('tolerates source damage', () => {
    expect(normalize('Trafn¬nC Lights')).toBe('trafn nc lights');
    expect(normalize('')).toBe('');
    expect(normalize('...')).toBe('');
  });
});
