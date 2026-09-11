import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SellerLogo } from './seller-logo';

describe('SellerLogo', () => {
  it('renders the logo when the store has one', () => {
    render(
      <SellerLogo
        seller={{
          name: 'Harbour Supply Co.',
          logoUrl: 'https://cdn.example.test/harbour.svg',
        }}
      />,
    );

    const image = screen.getByRole('presentation', { hidden: true });
    expect(image).toHaveAttribute(
      'src',
      'https://cdn.example.test/harbour.svg',
    );
    // Decorative: the store name is always rendered as text beside it, so
    // announcing it twice would just be noise.
    expect(image).toHaveAttribute('alt', '');
  });

  it('falls back to two initials when there is no logo', () => {
    render(
      <SellerLogo seller={{ name: 'Harbour Supply Co.', logoUrl: null }} />,
    );
    expect(screen.getByText('HS')).toBeInTheDocument();
  });

  it('uses a single initial for a one-word name', () => {
    render(<SellerLogo seller={{ name: 'Deskworks', logoUrl: null }} />);
    expect(screen.getByText('D')).toBeInTheDocument();
  });

  it('ignores punctuation-only words when picking initials', () => {
    render(<SellerLogo seller={{ name: 'Banda & Sons', logoUrl: null }} />);
    expect(screen.getByText('BS')).toBeInTheDocument();
  });

  it('never renders an empty monogram', () => {
    render(<SellerLogo seller={{ name: '   ', logoUrl: null }} />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});
