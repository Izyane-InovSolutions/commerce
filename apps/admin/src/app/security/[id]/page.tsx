import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { ApiError, backendGetAdminUser } from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import { requireAdmin } from '@/lib/session';

import { AccountStatusControl } from '../_components/account-status-control';
import { RoleForm } from '../_components/role-form';
import { changeUserRoleAction, setUserActiveAction } from '../actions';
import {
  assignableRoles,
  fullName,
  roleChangeBlocker,
  roleLabel,
} from '../users';

export async function generateMetadata({
  params,
}: PageProps<'/security/[id]'>): Promise<Metadata> {
  const { id } = await params;
  try {
    const user = await backendGetAdminUser(apiClient, id);
    return { title: fullName(user) ?? user.email };
  } catch {
    return { title: 'User' };
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default async function UserPage({
  params,
}: PageProps<'/security/[id]'>) {
  const currentUser = await requireAdmin(true);
  const { id } = await params;

  const back = (
    <div>
      <Button variant="ghost" size="sm" asChild>
        <Link href="/security">
          <ArrowLeft data-icon="inline-start" />
          All users
        </Link>
      </Button>
    </div>
  );

  let user;
  try {
    user = await backendGetAdminUser(apiClient, id);
  } catch (error) {
    // A malformed id is a 400 from the API's UUID pipe, not a missing user,
    // but to someone following a link the two mean the same thing.
    if (
      error instanceof ApiError &&
      (error.status === 404 || error.status === 400)
    ) {
      notFound();
    }

    return (
      <div className="space-y-6">
        {back}
        <PageHeader title="User" description="Account, role, and access." />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  const name = fullName(user);
  const isSelf = user.id === currentUser.id;
  const blocker = roleChangeBlocker(user, currentUser.id);

  const details: { label: string; value: ReactNode }[] = [
    { label: 'Email', value: user.email },
    { label: 'Phone', value: user.phone ?? 'Not given' },
    { label: 'Joined', value: formatDate(user.createdAt) },
    { label: 'Last updated', value: formatDate(user.updatedAt) },
    {
      label: 'Signed-in sessions',
      value:
        user.activeSessionCount === 0
          ? 'None'
          : String(user.activeSessionCount),
    },
    {
      label: 'Seller account',
      value: user.seller ? (
        <span className="flex flex-wrap items-center gap-2">
          <Link href={`/sellers/${user.seller.id}`} className="hover:underline">
            {user.seller.businessName}
          </Link>
          <StatusBadge status={user.seller.status.toLowerCase()} />
        </span>
      ) : (
        'None'
      ),
    },
  ];

  return (
    <div className="space-y-8">
      {back}

      <PageHeader
        title={name ?? user.email}
        description={
          isSelf
            ? 'This is your own account. Another administrator has to change its role or disable it.'
            : 'Account, role, and access.'
        }
        action={
          <div className="flex items-center gap-2">
            <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
              {roleLabel(user.role)}
            </Badge>
            {user.isActive ? (
              <StatusBadge status="active" />
            ) : (
              <Badge variant="destructive">Disabled</Badge>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:row-span-2">
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>
              What the user gave when they registered, and where they stand.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              {details.map((detail) => (
                <div key={detail.label}>
                  <dt className="text-muted-foreground text-xs">
                    {detail.label}
                  </dt>
                  <dd className="text-pretty break-words">{detail.value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-muted-foreground mt-4 text-xs">
              <Link
                href={`/audit?targetId=${user.id}`}
                className="hover:underline"
              >
                Changes to this account in the audit log
              </Link>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Role</CardTitle>
            <CardDescription>
              Decides which parts of the platform this user can reach. A change
              signs them out everywhere, so it applies from their next sign-in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {blocker ? (
              <p className="text-muted-foreground text-sm text-pretty">
                {blocker}
              </p>
            ) : (
              <RoleForm
                current={user.role}
                roles={assignableRoles(user)}
                action={changeUserRoleAction.bind(null, user.id)}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Access</CardTitle>
            <CardDescription>
              {user.isActive
                ? 'Disabling refuses sign-in and ends every session at once. Nothing the user owns is deleted.'
                : 'This account is disabled: sign-in is refused and it has no live sessions.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isSelf ? (
              <p className="text-muted-foreground text-sm">
                You cannot disable your own account.
              </p>
            ) : (
              <AccountStatusControl
                isActive={user.isActive}
                email={user.email}
                action={setUserActiveAction.bind(null, user.id, !user.isActive)}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
