import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SellerApplicationForm } from './seller-application-form';
import { idleFormState } from '@/lib/form';

function file(name: string, type = 'application/pdf'): File {
  return new File(['content'], name, { type });
}

describe('SellerApplicationForm', () => {
  it('prefills business fields from defaultValues', () => {
    render(
      <SellerApplicationForm
        defaultValues={{
          businessName: 'Acme Traders',
          registrationNumber: 'REG-123',
          country: 'ZM',
          businessAddress: '1 Cairo Road, Lusaka',
          contactEmail: 'acme@example.test',
        }}
        submitLabel="Resubmit application"
        submit={vi.fn().mockResolvedValue(idleFormState)}
        uploadDocument={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Business name')).toHaveValue(
      'Acme Traders',
    );
    expect(screen.getByLabelText('Registration number')).toHaveValue(
      'REG-123',
    );
    expect(screen.getByLabelText('Country')).toHaveValue('ZM');
    expect(screen.getByLabelText('Business address')).toHaveValue(
      '1 Cairo Road, Lusaka',
    );
    expect(screen.getByLabelText('Contact email')).toHaveValue(
      'acme@example.test',
    );
    expect(
      screen.getByRole('button', { name: 'Resubmit application' }),
    ).toBeInTheDocument();
  });

  it('uploads a chosen file and lists it once done', async () => {
    const uploadDocument = vi.fn().mockResolvedValue({
      status: 'ok',
      document: { id: 'doc-1', fileName: 'registration.pdf' },
    });

    const { container } = render(
      <SellerApplicationForm
        submitLabel="Submit application"
        submit={vi.fn().mockResolvedValue(idleFormState)}
        uploadDocument={uploadDocument}
      />,
    );

    fireEvent.change(screen.getByLabelText('Verification documents'), {
      target: { files: [file('registration.pdf')] },
    });

    await vi.waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('registration.pdf')).toBeInTheDocument();

    const hidden = container.querySelector(
      'input[type="hidden"][name="documentIds"]',
    );
    expect(hidden).toHaveValue('doc-1');
  });

  it('shows an error and adds nothing when the upload fails', async () => {
    const uploadDocument = vi
      .fn()
      .mockResolvedValue({ status: 'error', message: 'Too large.' });

    render(
      <SellerApplicationForm
        submitLabel="Submit application"
        submit={vi.fn().mockResolvedValue(idleFormState)}
        uploadDocument={uploadDocument}
      />,
    );

    fireEvent.change(screen.getByLabelText('Verification documents'), {
      target: { files: [file('too-big.pdf')] },
    });

    expect(await screen.findByText('Too large.')).toBeInTheDocument();
    expect(screen.queryByText('too-big.pdf')).not.toBeInTheDocument();
  });

  it('removes an uploaded document, dropping its hidden input', async () => {
    const uploadDocument = vi.fn().mockResolvedValue({
      status: 'ok',
      document: { id: 'doc-1', fileName: 'registration.pdf' },
    });

    const { container } = render(
      <SellerApplicationForm
        submitLabel="Submit application"
        submit={vi.fn().mockResolvedValue(idleFormState)}
        uploadDocument={uploadDocument}
      />,
    );

    fireEvent.change(screen.getByLabelText('Verification documents'), {
      target: { files: [file('registration.pdf')] },
    });
    await screen.findByText('registration.pdf');

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(screen.queryByText('registration.pdf')).not.toBeInTheDocument();
    expect(
      container.querySelector('input[type="hidden"][name="documentIds"]'),
    ).not.toBeInTheDocument();
  });

  it('submits every uploaded document id alongside the business fields', async () => {
    const uploadDocument = vi.fn().mockResolvedValue({
      status: 'ok',
      document: { id: 'doc-1', fileName: 'registration.pdf' },
    });
    const submit = vi.fn().mockResolvedValue(idleFormState);

    render(
      <SellerApplicationForm
        submitLabel="Submit application"
        submit={submit}
        uploadDocument={uploadDocument}
      />,
    );

    fireEvent.change(screen.getByLabelText('Business name'), {
      target: { value: 'Acme Traders' },
    });
    fireEvent.change(screen.getByLabelText('Registration number'), {
      target: { value: 'REG-123' },
    });
    fireEvent.change(screen.getByLabelText('Country'), {
      target: { value: 'ZM' },
    });
    fireEvent.change(screen.getByLabelText('Business address'), {
      target: { value: '1 Cairo Road, Lusaka' },
    });
    fireEvent.change(screen.getByLabelText('Contact email'), {
      target: { value: 'acme@example.test' },
    });
    fireEvent.change(screen.getByLabelText('Verification documents'), {
      target: { files: [file('registration.pdf')] },
    });
    await screen.findByText('registration.pdf');

    fireEvent.click(
      screen.getByRole('button', { name: 'Submit application' }),
    );

    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const formData = submit.mock.calls[0]?.[1] as FormData;
    expect(formData.get('businessName')).toBe('Acme Traders');
    expect(formData.getAll('documentIds')).toEqual(['doc-1']);
  });
});
