import { describe, it, expect } from 'vitest';
import { WildwoodError } from '../client/errors.js';

describe('WildwoodError.fromResponse', () => {
  it("uses the body's errorMessage (the shape of Wildwood result DTOs)", () => {
    const err = WildwoodError.fromResponse(
      400,
      { success: false, errorMessage: 'Payment is required for this tier' },
      '',
    );

    expect(err.message).toBe('Payment is required for this tier');
    expect(err.status).toBe(400);
  });

  it('never produces an empty message when HTTP/2 supplies no status text', () => {
    const err = WildwoodError.fromResponse(400, { success: false }, '');

    expect(err.message).toBe('Request failed (HTTP 400)');
  });

  it('still prefers message over the other fields', () => {
    expect(WildwoodError.fromResponse(409, { message: 'first', errorMessage: 'second' }, 'Conflict').message).toBe(
      'first',
    );
  });
});
