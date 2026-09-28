import type { Metadata } from 'next';
import Link from 'next/link';

import { backendListAdminUsers } from '@commerce/api-client';
import { backendRoles, backendUserStatuses } from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { SelectField } from '@/components/select-field';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/lib/api';
import { explainMissingRoute } from '@/lib/api-route-errors';
import { requireAdmin } from '@/lib/session';

import {
  fullName,
  isUserFiltered,
  readUserFilters,
  roleLabel,
  toAdminUserQuery,
  type UserFilters,
} from './users';

export const metadata: Metadata = { title: 'Security' };

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function UserFilterForm({ filters }: { filters: UserFilters }) {
  return (
    <form className="flex flex-wrap items-end gap-3" action="/security">
      <div className="space-y-1.5">
        <Label htmlFor="user-search">Search</Label>
        <Input
          id="user-search"
          name="q"
          type="search"
          defaultValue={filters.q ?? ''}
          placeholder="Email or name"
          maxLength={200}
          className="w-64"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="user-role-filter">Role</Label>
        <SelectField
          id="user-role-filter"
          name="role"
          placeholder="Any role"
          defaultValue={filters.role ?? ''}
          options={backendRoles.map((role) => ({
            value: role,
            label: roleLabel(role),
          }))}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="user-status-filter">Status</Label>
        <SelectField
          id="user-status-filter"
          name="status"
          placeholder="Any status"
          defaultValue={filters.status ?? ''}
          options={backendUserStatuses.map((status) => ({
            value: status,
            label: status.charAt(0) + status.slice(1).toLowerCase(),
          }))}
        />
      </div>
      <Button type="submit" variant="secondary">
        Apply
      </Button>
      {isUserFiltered(filters) ? (
        <Button variant="ghost" asChild>
          <Link href="/security">Clear</Link>
        </Button>
      ) : null}
    </form>
  );
}

export default async function SecurityPage({
  searchParams,
}: PageProps<'/security'>) {
  await requireAdmin(true);
  const params = await searchParams;
  const filters = readUserFilters(params);

  const header = (
    <PageHeader
      title="Security"
      description="Every account on the platform and the role it holds. Changing a role or disabling an account signs that user out everywhere; every change is kept in the audit log."
    />
  );

  let users;
  try {
    users = await backendListAdminUsers(apiClient, toAdminUserQuery(filters));
  } catch (error) {
    return (
      <div className="space-y-6">
        {header}
        <UserFilterForm filters={filters} />
        <ApiErrorNotice error={explainMissingRoute(error, 'user management')} />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(users.total / users.limit));
  const filtered = isUserFiltered(filters);

  return (
    <div className="space-y-6">
      {header}
      <UserFilterForm filters={filters} />

      {users.items.length === 0 ? (
        <EmptyState
          title={filtered ? 'No users match these filters' : 'No users yet'}
          description={
            filtered
              ? 'Nobody fits every filter at once — try removing one.'
              : 'Accounts appear here as people register.'
          }
          action={
            filtered ? (
              <Button asChild>
                <Link href="/security">Clear filters</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Seller account</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.items.map((user) => {
                const name = fullName(user);
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <Link
                        href={`/security/${user.id}`}
                        className="font-medium hover:underline"
                      >
                        {name ?? user.email}
                      </Link>
                      {name ? (
                        <p className="text-muted-foreground text-xs">
                          {user.email}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          user.role === 'ADMIN' ? 'default' : 'secondary'
                        }
                      >
                        {roleLabel(user.role)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.isActive ? (
                        <StatusBadge status="active" />
                      ) : (
                        <Badge variant="destructive">Disabled</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {user.seller ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/sellers/${user.seller.id}`}
                            className="hover:underline"
                          >
                            {user.seller.businessName}
                          </Link>
                          <StatusBadge
                            status={user.seller.status.toLowerCase()}
                          />
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatDate(user.createdAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination
        pathname="/security"
        params={params}
        page={users.page}
        pageSize={users.limit}
        total={users.total}
        totalPages={totalPages}
      />
    </div>
  );
}
