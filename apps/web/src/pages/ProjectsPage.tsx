import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLE_LABEL, type ProjectDto, type ReviewDto } from '@docstruct/shared';
import { AnimateIcon, ArrowRightIcon, ClipboardCheckIcon, LayersIcon, PlusIcon, SquarePlusIcon, UsersIcon } from '../components/icons';
import { BlurFade } from '../components/magicui/blur-fade';
import { NumberTicker } from '../components/magicui/number-ticker';
import { useToast } from '../components/toast';
import { Button, EmptyState, ErrorNote, Field, GlowCard, Input, Modal, Skeleton, TextArea } from '../components/ui';
import { errorMessage, get, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { plural, timeAgo } from '../lib/format';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** Project.List and Project.Create (UI-3). */
export function ProjectsPage() {
  const { user } = useAuth();
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => get<ProjectDto[]>('/projects') });
  const queue = useQuery({ queryKey: ['review-queue'], queryFn: () => get<ReviewDto[]>('/reviews/queue') });
  const [creating, setCreating] = useState(false);
  const active = projects.data?.filter((p) => !p.archivedAt).length ?? 0;
  const waiting = queue.data?.length ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <BlurFade>
        <section className="relative mb-8 overflow-hidden rounded-2xl border border-rule bg-gradient-to-br from-primary-wash via-surface to-surface px-6 py-7 sm:px-8">
          <div className="bg-dots pointer-events-none absolute inset-y-0 right-0 w-1/2 [mask-image:linear-gradient(to_left,black,transparent)]" aria-hidden />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-medium text-primary">{greeting()},</p>
              <h1 className="mt-0.5 text-3xl font-semibold tracking-tight">{user?.displayName.split(' ')[0] ?? 'there'}</h1>
              <p className="mt-1.5 max-w-md text-sm text-ink-soft">Here are the projects you belong to. Open one to see its documents, reviews and activity.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-xl bg-surface/80 px-4 py-2.5 ring-1 ring-rule backdrop-blur">
                <p className="text-xs text-ink-faint">Active projects</p>
                <NumberTicker value={active} className="text-2xl font-semibold tracking-tight text-ink" />
              </div>
              <AnimateIcon animateOnHover asChild>
                <Link to="/reviews" className="group rounded-xl bg-surface/80 px-4 py-2.5 ring-1 ring-rule backdrop-blur transition-shadow hover:shadow-lift">
                  <p className="flex items-center gap-1.5 text-xs text-ink-faint">
                    <ClipboardCheckIcon size={13} className="text-st-review" /> Waiting for your review
                  </p>
                  <NumberTicker value={waiting} className="text-2xl font-semibold tracking-tight text-ink" />
                </Link>
              </AnimateIcon>
              <Button variant="primary" icon={PlusIcon} onClick={() => setCreating(true)}>
                New project
              </Button>
            </div>
          </div>
        </section>
      </BlurFade>

      {projects.isLoading && <Skeleton rows={3} />}
      {projects.error && <ErrorNote>{errorMessage(projects.error)}</ErrorNote>}
      {projects.data?.length === 0 && (
        <EmptyState
          icon={LayersIcon}
          title="No projects yet"
          action={
            <Button variant="primary" icon={PlusIcon} onClick={() => setCreating(true)}>
              Create your first project
            </Button>
          }
        >
          Create a project to start organising documents, or ask a project owner to add you to theirs.
        </EmptyState>
      )}
      {!!projects.data?.length && (
        <>
          <h2 className="mb-3 text-sm font-medium text-ink-soft">Your projects</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.data.map((p, i) => (
              <BlurFade key={p.projectId} delay={0.06 + i * 0.05} className="h-full">
                <ProjectCard project={p} />
              </BlurFade>
            ))}
            <BlurFade delay={0.06 + projects.data.length * 0.05} className="h-full">
              <AnimateIcon animateOnHover asChild>
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="group flex h-full min-h-44 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-rule-strong text-sm text-ink-soft transition-colors hover:border-primary/50 hover:bg-primary-wash/40 hover:text-primary"
                >
                  <span className="flex size-10 items-center justify-center rounded-xl bg-surface shadow-card ring-1 ring-rule transition-transform group-hover:scale-110">
                    <SquarePlusIcon size={20} />
                  </span>
                  New project
                </button>
              </AnimateIcon>
            </BlurFade>
          </div>
        </>
      )}
      {creating && <CreateProjectDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function ProjectCard({ project: p }: { project: ProjectDto }) {
  return (
    <AnimateIcon animateOnHover asChild>
      <Link to={`/p/${p.projectId}`} className="group block h-full rounded-xl focus-visible:outline-offset-4">
        <GlowCard className="h-full">
          <div className="flex h-full min-h-44 flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary-wash text-primary ring-1 ring-primary/10 transition-colors duration-300 group-hover:bg-primary group-hover:text-white">
                <LayersIcon size={20} />
              </span>
              <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-medium text-ink-soft ring-1 ring-rule">{ROLE_LABEL[p.myRole]}</span>
            </div>
            <h3 className="mt-4 font-semibold leading-snug text-ink transition-colors group-hover:text-primary">
              {p.name}
              {p.archivedAt && <span className="ml-2 rounded bg-st-archived-wash px-1.5 py-px align-middle text-xs font-normal text-st-archived">Archived</span>}
            </h3>
            {p.description && <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-soft">{p.description}</p>}
            <div className="mt-auto flex items-center gap-4 pt-4 text-[12.5px] text-ink-faint">
              <span className="flex items-center gap-1.5">
                <UsersIcon size={14} /> {plural(p.memberCount, 'member')}
              </span>
              <span>Updated {timeAgo(p.updatedAt)}</span>
              <span className="ml-auto -translate-x-1 text-primary opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100">
                <ArrowRightIcon size={16} />
              </span>
            </div>
          </div>
        </GlowCard>
      </Link>
    </AnimateIcon>
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
          <Button variant="primary" icon={PlusIcon} busy={create.isPending} disabled={!name.trim()} onClick={() => create.mutate()}>
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
