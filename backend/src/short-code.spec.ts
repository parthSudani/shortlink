import { generateCode } from './links/domain/short-code';
describe('generateCode', () => {
  it('creates URL-safe Base62 codes in the requested 7–8 character range', () => {
    for (const n of [7, 8]) expect(generateCode(n)).toMatch(new RegExp(`^[0-9A-Za-z]{${n}}$`));
  });
  it('rejects unsafe lengths', () => expect(() => generateCode(2)).toThrow(RangeError));
});
