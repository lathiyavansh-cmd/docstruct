/**
 * What this file does
 *   This is the Members tab of a project. It lists the project's members and their roles. An owner can add a member by email, change roles and remove members.
 *
 * How it works
 *   - Gets the project from ProjectLayout with useCurrentProject(), and the member list with useMembers (query key ['members', projectId], GET /projects/:projectId/members).
 *   - Change role: useMutation PATCH /projects/:projectId/members/:userId. Remove: useMutation DELETE on the same path. Add: useMutation POST /projects/:projectId/members.
 *   - Each of these returns the new member list, which is put straight into the cache with setQueryData.
 *   - useCan decides what is shown: 'member.role.change' shows the role dropdown and Remove button, 'member.add' shows the Add form. The server checks again.
 *
 * Where it fits
 *   Route /p/:projectId/members in App.tsx, drawn inside ProjectLayout. Module: M02 Project Management (owner: Vivan).
 */
import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PROJECT_ROLES, ROLE_DESCRIPTION, ROLE_LABEL, type MemberDto, type ProjectRole } from '@docstruct/shared';
import { useToast } from '../../components/toast';
import { Avatar, Button, ConfirmDialog, ErrorNote, Field, Input, Select, Skeleton } from '../../components/ui';
import { del, errorMessage, patch, post } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useCan, useCurrentProject, useMembers } from '../../lib/hooks';
import { UsersIcon, XIcon } from '../../components/icons';

/** M02 member management (UI-8) with role help where roles are assigned (UD-2). */
export function MembersPage() {
  const project = useCurrentProject();
  const members = useMembers(project.projectId);
  const allowed = useCan(project);
  const queryClient = useQueryClient();
  const toast = useToast();
  // The member waiting for the "Remove?" confirmation. null means no dialog is open.
  const [removing, setRemoving] = useState<MemberDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = (list: MemberDto[]) => {
    // The server sends back the updated member list, so we put it in the cache directly (no extra request).
    queryClient.setQueryData(['members', project.projectId], list);
    // Reload the project too, because its member count and possibly my own role have changed.
    queryClient.invalidateQueries({ queryKey: ['project', project.projectId] });
  };

  // Changes one member's role (PATCH /projects/:projectId/members/:userId).
  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: ProjectRole }) => patch<MemberDto[]>(`/projects/${project.projectId}/members/${userId}`, { role }),
    onSuccess: (list, v) => {
      refresh(list);
      toast(`Role changed to ${ROLE_LABEL[v.role]}`);
      setError(null);
    },
    onError: (e) => setError(errorMessage(e)),
  });
  // Removes a member from the project (DELETE /projects/:projectId/members/:userId).
  const remove = useMutation({
    mutationFn: (userId: string) => del<MemberDto[]>(`/projects/${project.projectId}/members/${userId}`),
    onSuccess: (list) => {
      refresh(list);
      toast(`Removed ${removing?.displayName}`);
      setRemoving(null);
    },
    onError: (e) => {
      setError(errorMessage(e));
      setRemoving(null);
    },
  });

  // Only roles allowed to change roles (the owner) see the dropdown and Remove button; others just see the role name.
  const manage = allowed('member.role.change');

  return (
    <div className="grid gap-10 px-5 py-6 lg:grid-cols-[1fr_20rem] lg:px-8">
      <section className="min-w-0">
        <h2 className="mb-3 font-semibold">Members</h2>
        {error && <ErrorNote className="mb-3">{error}</ErrorNote>}
        {members.isLoading && <Skeleton rows={3} />}
        <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-surface shadow-card">
          {members.data?.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-primary-wash/40">
              <Avatar name={m.displayName} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {m.displayName} {m.isYou && <span className="text-[13px] font-normal text-ink-faint">(you)</span>}
                </p>
                <p className="text-[13px] text-ink-faint">Added {formatDate(m.addedAt)}</p>
              </div>
              {manage ? (
                <>
                  <Select
                    aria-label={`Role of ${m.displayName}`}
                    value={m.role}
                    onChange={(e) => changeRole.mutate({ userId: m.userId, role: e.target.value as ProjectRole })}
                    className="w-36"
                  >
                    {PROJECT_ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                    ))}
                  </Select>
                  <Button variant="quiet" size="sm" icon={XIcon} onClick={() => setRemoving(m)}>
                    Remove
                  </Button>
                </>
              ) : (
                <span className="text-sm text-ink-soft">{ROLE_LABEL[m.role]}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <aside className="space-y-8">
        {allowed('member.add') && <AddMember projectId={project.projectId} onAdded={refresh} />}
        <section>
          <h2 className="mb-3 font-semibold">What each role can do</h2>
          <dl className="space-y-3 text-sm">
            {PROJECT_ROLES.map((r) => (
              <div key={r}>
                <dt className="font-medium">{ROLE_LABEL[r]}</dt>
                <dd className="text-ink-soft">{ROLE_DESCRIPTION[r]}</dd>
              </div>
            ))}
          </dl>
        </section>
      </aside>

      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.displayName}?`}
          confirmLabel="Remove member"
          danger
          busy={remove.isPending}
          onConfirm={() => remove.mutate(removing.userId)}
          onClose={() => setRemoving(null)}
        >
          They will immediately lose access to this project and its documents. Their earlier uploads, comments and reviews stay in the history.
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Form to add an existing DocStruct user to the project by email, with a chosen role (default Editor). */
function AddMember({ projectId, onAdded }: { projectId: string; onAdded: (list: MemberDto[]) => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ProjectRole>('EDITOR');
  const toast = useToast();
  // Adds the member (POST /projects/:projectId/members); the reply is the new member list.
  const add = useMutation({
    mutationFn: () => post<MemberDto[]>(`/projects/${projectId}/members`, { email, role }),
    onSuccess: (list) => {
      onAdded(list);
      toast(`Added ${email} as ${ROLE_LABEL[role]}`);
      setEmail('');
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate();
  };
  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-rule p-4">
      <h2 className="font-semibold">Add a member</h2>
      {add.error && <ErrorNote>{errorMessage(add.error)}</ErrorNote>}
      <Field label="Email" hint="They need a DocStruct account first.">
        {(id) => <Input id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
      </Field>
      <Field label="Role" hint={ROLE_DESCRIPTION[role]}>
        {(id) => (
          <Select id={id} value={role} onChange={(e) => setRole(e.target.value as ProjectRole)}>
            {PROJECT_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </Select>
        )}
      </Field>
      <Button type="submit" variant="primary" icon={UsersIcon} busy={add.isPending} className="w-full">
        Add member
      </Button>
    </form>
  );
}
