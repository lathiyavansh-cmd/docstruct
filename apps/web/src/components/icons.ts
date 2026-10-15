/**
 * What this file does
 *   A "barrel" file: it collects all the animated icons in one place and re-exports them.
 *
 * How it works
 *   - Each line re-exports one icon component from its own file in animate-ui/icons/.
 *   - AnimateIcon (last line) is the wrapper that starts an icon's animation on hover.
 *   - Pages write `import { SearchIcon, PlusIcon } from '../components/icons'` instead of 40 separate imports.
 *
 * Where it fits
 *   Used by most pages and components, e.g. AppLayout.tsx, ReviewPanel.tsx, UploadDialog.tsx and
 *   pages/project/DashboardPage.tsx. Appearance only. Module: shared core, web interface (owner: Vansh).
 */
// Animated icons (animate-ui, published on 21st.dev). Each plays when its own AnimateIcon parent is hovered.
export { ActivityIcon } from './animate-ui/icons/activity';
export { ArrowRightIcon } from './animate-ui/icons/arrow-right';
export { BadgeCheckIcon } from './animate-ui/icons/badge-check';
export { BellIcon } from './animate-ui/icons/bell';
export { CheckIcon } from './animate-ui/icons/check';
export { ChevronDownIcon } from './animate-ui/icons/chevron-down';
export { ChevronRightIcon } from './animate-ui/icons/chevron-right';
export { CircleCheckIcon } from './animate-ui/icons/circle-check';
export { ClipboardCheckIcon } from './animate-ui/icons/clipboard-check';
export { ClipboardListIcon } from './animate-ui/icons/clipboard-list';
export { ClockIcon } from './animate-ui/icons/clock';
export { CloudUploadIcon } from './animate-ui/icons/cloud-upload';
export { CopyIcon } from './animate-ui/icons/copy';
export { DownloadIcon } from './animate-ui/icons/download';
export { ExternalLinkIcon } from './animate-ui/icons/external-link';
export { GaugeIcon } from './animate-ui/icons/gauge';
export { KanbanIcon } from './animate-ui/icons/kanban';
export { LayersIcon } from './animate-ui/icons/layers';
export { LayoutDashboardIcon } from './animate-ui/icons/layout-dashboard';
export { LinkIcon } from './animate-ui/icons/link';
export { ListIcon } from './animate-ui/icons/list';
export { LoaderCircleIcon } from './animate-ui/icons/loader-circle';
export { LockIcon } from './animate-ui/icons/lock';
export { LogOutIcon } from './animate-ui/icons/log-out';
export { MessageCircleQuestionIcon } from './animate-ui/icons/message-circle-question';
export { MessageSquareIcon } from './animate-ui/icons/message-square';
export { PaperclipIcon } from './animate-ui/icons/paperclip';
export { PlusIcon } from './animate-ui/icons/plus';
export { RefreshCwIcon } from './animate-ui/icons/refresh-cw';
export { RotateCcwIcon } from './animate-ui/icons/rotate-ccw';
export { SearchIcon } from './animate-ui/icons/search';
export { SendIcon } from './animate-ui/icons/send';
export { SettingsIcon } from './animate-ui/icons/settings';
export { SparklesIcon } from './animate-ui/icons/sparkles';
export { SquarePlusIcon } from './animate-ui/icons/square-plus';
export { Trash2Icon } from './animate-ui/icons/trash-2';
export { UploadIcon } from './animate-ui/icons/upload';
export { UserIcon } from './animate-ui/icons/user';
export { UsersIcon } from './animate-ui/icons/users';
export { XIcon } from './animate-ui/icons/x';
export { AnimateIcon } from './animate-ui/icons/icon';
