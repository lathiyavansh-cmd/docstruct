import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { ROLE_LABEL, type ProjectDto } from '@docstruct/shared';
import { useToast } from '../components/toast';
import { Button, EmptyState, ErrorNote, Field, Input, Modal, PageHeader, Spinner, TextArea } from '../components/ui';
import { errorMessage, get, post } from '../lib/api';
import { plural, timeAgo } from '../lib/format';

/** Project.List and Project.Create (UI-3). */
export function ProjectsPage() {
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => get<ProjectDto[]>('/projects') });
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <PageHeader
        title="Projects"
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New project
          </Button>
        }
      >
        Projects you are a member of.
      </PageHeader>

      {projects.isLoading && <Spinner />}
      {projects.error && <ErrorNote>{errorMessage(projects.error)}</ErrorNote>}
      {projects.data?.length === 0 && (
        <EmptyState
          title="No projects yet"
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              Create your first project
            </Button>
          }
        >
          Create a project to start organising documents, or ask a project owner to add you to theirs.
        </EmptyState>
      )}
      {!!projects.data?.length && (
        <div className="overflow-hidden rounded-lg border border-rule">
          <table className="w-full text-sm">
            <thead className="bg-paper text-left text-[13px] text-ink-soft">
              <tr>
                <th className="px-4 py-2.5 font-medium">Project</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Your role</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Members</th>
                <th className="px-4 py-2.5 text-right font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {projects.data.map((p) => (
                <tr key={p.projectId} className="hover:bg-paper/60">
                  <td className="px-4 py-3">
                    <Link to={`/p/${p.projectId}`} className="font-medium text-ink hover:text-primary">
                      {p.name}
                    </Link>
                    {p.archivedAt && <span className="ml-2 rounded bg-st-archived-wash px-1.5 py-px text-xs text-st-archived">Archived</span>}
                    {p.description && <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-soft">{p.description}</p>}
                  </td>
                  <td className="hidden px-4 py-3 text-ink-soft sm:table-cell">{ROLE_LABEL[p.myRole]}</td>
                  <td className="hidden px-4 py-3 text-ink-soft md:table-cell tabular">{plural(p.memberCount, 'member')}</td>
                  <td className="px-4 py-3 text-right text-ink-faint">{timeAgo(p.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <CreateProjectDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateProjectDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const create = useMutation({
    mutationFn: () => post<ProjectDto>('/projects', { name, description }),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast(`Created ${project.name}`);
      navigate(`/p/${project.projectId}`);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  return (
    <Modal
      title="New project"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={create.isPending} disabled={!name.trim()} onClick={() => create.mutate()}>
            Create project
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {create.error && <ErrorNote>{errorMessage(create.error)}</ErrorNote>}
        <Field label="Name">{(id) => <Input id={id} autoFocus required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Description" hint="Optional. What is this project for?">
          {(id) => <TextArea id={id} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <p className="text-[13px] text-ink-faint">You will be the owner and can add members afterwards.</p>
      </form>
    </Modal>
  );
}
