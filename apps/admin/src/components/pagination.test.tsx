import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Pagination } from './pagination';

const base = {
  pathname: '/things',
  params: { q: 'desk' },
  pageSize: 20,
  total: 45,
  totalPages: 3,
};

describe('Pagination', () => {
  it('summarises the range on show', () => {
    render(<Pagination {...base} page={2} />);
    expect(screen.getByText('Showing 21–40 of 45')).toBeInTheDocument();
  });

  it('clamps the final page to the total', () => {
    render(<Pagination {...base} page={3} />);
    expect(screen.getByText('Showing 41–45 of 45')).toBeInTheDocument();
  });

  it('keeps existing filters in the page links', () => {
    render(<Pagination {...base} page={2} />);

    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/things?q=desk&page=3',
    );
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute(
      'href',
      '/things?q=desk&page=1',
    );
  });

  it('offers no link past either end', () => {
    const { unmount } = render(<Pagination {...base} page={1} />);
    expect(screen.queryByRole('link', { name: 'Previous' })).toBeNull();
    unmount();

    render(<Pagination {...base} page={3} />);
    expect(screen.queryByRole('link', { name: 'Next' })).toBeNull();
  });

  it('renders nothing when there are no results', () => {
    const { container } = render(
      <Pagination {...base} page={1} total={0} totalPages={1} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
