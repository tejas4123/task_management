import { Plus, Users as UsersIcon } from "lucide-react";
import { useState } from "react";

import { useCreateUser, useUsers } from "@/api/queries";
import type { Role } from "@/api/types";
import { PageHeader } from "@/components/primitives/PageHeader";
import { RoleBadge } from "@/components/primitives/RoleBadge";
import { EmptyState, ErrorState } from "@/components/primitives/States";
import { UserChip } from "@/components/primitives/UserChip";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { ROLE_LABEL } from "@/lib/roles";

export function Users() {
  const [role, setRole] = useState<Role | "">("");
  const [creating, setCreating] = useState(false);

  const query = useUsers(role ? { role } : undefined);
  const rows = query.data?.results ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users"
        description="Who can sign in, and what they are allowed to do."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden />
            New user
          </Button>
        }
      />

      <Select
        aria-label="Filter by role"
        className="h-8 w-auto min-w-40 text-xs"
        value={role}
        onChange={(event) => setRole(event.target.value as Role | "")}
      >
        <option value="">Every role</option>
        {(Object.keys(ROLE_LABEL) as Role[]).map((option) => (
          <option key={option} value={option}>
            {ROLE_LABEL[option]}
          </option>
        ))}
      </Select>

      {query.isPending ? (
        <div className="space-y-1.5">
          {Array.from({ length: 5 }, (_, row) => (
            <Skeleton key={row} className="h-12 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={UsersIcon} title="No users match that role" />
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-hover/60 text-left">
                {["Name", "Username", "Email", "Role", "Status"].map((heading) => (
                  <th
                    key={heading}
                    className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-subtle-foreground"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-border last:border-0 hover:bg-surface-hover"
                >
                  <td className="px-3 py-2">
                    <UserChip user={user} />
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {user.username}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {user.email}
                  </td>
                  <td className="px-3 py-2">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {user.is_active ? (
                      <span className="text-tone-emerald-fg">Active</span>
                    ) : (
                      <span className="text-subtle-foreground">Deactivated</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating ? <NewUserDialog onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

function NewUserDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateUser();
  const toast = useToast();

  const [form, setForm] = useState({
    username: "",
    email: "",
    first_name: "",
    last_name: "",
    password: "",
    role: "TEAM_MEMBER" as Role,
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    try {
      await create.mutateAsync(form);
      toast.success(`${form.username} can now sign in.`);
      onClose();
    } catch (cause) {
      toast.fromError(cause);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="New user"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!form.username.trim() || !form.email.trim() || !form.password}
            onClick={() => void submit()}
          >
            Create user
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" htmlFor="user-first">
            <Input
              id="user-first"
              value={form.first_name}
              autoFocus
              onChange={(event) => set("first_name")(event.target.value)}
            />
          </Field>
          <Field label="Last name" htmlFor="user-last">
            <Input
              id="user-last"
              value={form.last_name}
              onChange={(event) => set("last_name")(event.target.value)}
            />
          </Field>
        </div>

        <Field label="Username" htmlFor="user-username">
          <Input
            id="user-username"
            value={form.username}
            onChange={(event) => set("username")(event.target.value)}
          />
        </Field>

        <Field label="Email" htmlFor="user-email">
          <Input
            id="user-email"
            type="email"
            value={form.email}
            onChange={(event) => set("email")(event.target.value)}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="user-password"
          hint="The user should change this after their first sign-in."
        >
          <Input
            id="user-password"
            type="password"
            value={form.password}
            autoComplete="new-password"
            onChange={(event) => set("password")(event.target.value)}
          />
        </Field>

        <Field label="Role" htmlFor="user-role">
          <Select
            id="user-role"
            value={form.role}
            onChange={(event) => set("role")(event.target.value)}
          >
            {(Object.keys(ROLE_LABEL) as Role[]).map((option) => (
              <option key={option} value={option}>
                {ROLE_LABEL[option]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}
