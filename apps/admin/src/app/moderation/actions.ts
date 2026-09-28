'use server';

import { revalidatePath } from 'next/cache';

import {
  backendApproveReview,
  backendDismissReviewReport,
  backendHideReview,
  backendRemoveReview,
  backendRestoreReview,
} from '@commerce/api-client';
import type { BackendReviewTarget } from '@commerce/contracts';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';
import { parseModerationForm, type ModerationDecision } from '@/lib/moderation';
import { guardAction } from '@/lib/session';

/*
 * Every route here is `@Roles(Role.ADMIN)`, hence `guardAction(true)`.
 *
 * Each action takes an `idempotencyKey` bound by the moderation page, which
 * mints one per render (the API insists on a UUID v4). A double-click or a
 * retry after a timeout replays the same key and the API deduplicates it; a
 * successful decision revalidates the page, which re-renders it with a fresh
 * key for the next one.
 */

const CONFIRMATIONS: Record<ModerationDecision, string> = {
  approve: 'Approved. Any open reports were dismissed.',
  hide: 'Hidden from the storefront. Open reports were closed as actioned.',
  remove: 'Removed for good. Open reports were closed as actioned.',
  restore: 'Restored to the storefront.',
};

/**
 * Approve, hide, remove, or restore one review or seller rating.
 *
 * All four are one moderation call under four paths, so which button was
 * pressed arrives as a form value. The version is the one the page rendered:
 * the API refuses a stale one, so two moderators cannot each decide against a
 * different view of the same review.
 */
export async function moderateReviewAction(
  type: BackendReviewTarget,
  reviewId: string,
  idempotencyKey: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction(true);
  if (denied) {
    return denied;
  }

  const parsed = parseModerationForm(formData);
  if (!parsed.ok) {
    return {
      status: 'error',
      message: 'Check the form and try again.',
      fieldErrors: parsed.fieldErrors,
    };
  }

  const { decision, version, reason } = parsed;
  try {
    if (decision === 'approve') {
      await backendApproveReview(
        apiClient,
        type,
        reviewId,
        { version },
        idempotencyKey,
      );
    } else {
      const moderate = {
        hide: backendHideReview,
        remove: backendRemoveReview,
        restore: backendRestoreReview,
      }[decision];
      await moderate(
        apiClient,
        type,
        reviewId,
        { version, reason: reason ?? '' },
        idempotencyKey,
      );
    }
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/moderation');
  return { status: 'idle', message: CONFIRMATIONS[decision] };
}

/** Dismisses one open report and leaves the review as it stands. */
export async function dismissReportAction(
  reportId: string,
  idempotencyKey: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction(true);
  if (denied) {
    return denied;
  }

  const reason = String(formData.get('reason') ?? '').trim();
  if (reason === '') {
    return {
      status: 'error',
      message: 'Check the form and try again.',
      fieldErrors: { reason: ['Say why the report is being dismissed.'] },
    };
  }

  try {
    await backendDismissReviewReport(
      apiClient,
      reportId,
      { reason },
      idempotencyKey,
    );
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath('/moderation');
  return { status: 'idle', message: 'Report dismissed.' };
}
