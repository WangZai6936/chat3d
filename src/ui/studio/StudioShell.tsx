import type {ReactNode} from 'react';
import {Button} from '@radix-ui/themes';
import {GearIcon} from '@radix-ui/react-icons';
import {BrandMark} from '../BrandMark';
import {AppearanceMenu} from '../Appearance';
import {AppUpdateNavEntry} from '../AppUpdateNotice';
import {TaskQueue} from '../TaskQueue';

export type StudioNavPage = 'home' | 'workbench' | 'asset' | 'scene' | 'team' | 'tasks' | 'settings';

const NAV_ITEMS: ReadonlyArray<{page: StudioNavPage; label: string; accessibleLabel: string}> = [
  {page: 'home', label: '首页', accessibleLabel: '首页'},
  {page: 'asset', label: '资产', accessibleLabel: '资产库'},
  {page: 'scene', label: '场景', accessibleLabel: '场景库'},
  {page: 'team', label: '团队', accessibleLabel: '团队库'},
  {page: 'workbench', label: '工作台', accessibleLabel: '建模工作台'},
];

export function StudioShell({
  activePage,
  onNavigate,
  disabled,
  taskQueueRequest,
  onTaskOpen,
  onTaskHistory,
}: {
  activePage: StudioNavPage;
  onNavigate: (page: StudioNavPage) => void;
  disabled: boolean;
  taskQueueRequest: number;
  onTaskOpen: () => void;
  onTaskHistory: () => void;
}) {
  return (
    <nav className="app-navigation studio-shell" aria-label="主导航">
      <div className="app-brand studio-shell-brand">
        <BrandMark />
        <strong>Scenivo</strong>
      </div>
      <div className="navigation-pages studio-shell-nav" role="navigation" aria-label="工作室页面">
        {NAV_ITEMS.map(({page, label, accessibleLabel}) => (
          <Button
            variant="ghost"
            color="gray"
            key={page}
            className="studio-nav-item"
            title={accessibleLabel}
            aria-label={accessibleLabel}
            disabled={disabled}
            aria-current={activePage === page ? 'page' : undefined}
            onClick={() => onNavigate(page)}
          >
            <span>{label}</span>
          </Button>
        ))}
      </div>
      <div className="navigation-utilities studio-shell-utilities">
        <AppearanceMenu />
        <AppUpdateNavEntry disabled={disabled} />
        <TaskQueue openRequest={taskQueueRequest} disabled={disabled} onOpen={onTaskOpen} onHistory={onTaskHistory} />
        <Button
          variant="ghost"
          color="gray"
          className="studio-utility-btn"
          title="设置"
          aria-label="设置"
          disabled={disabled}
          aria-current={activePage === 'settings' ? 'page' : undefined}
          onClick={() => onNavigate('settings')}
        >
          <GearIcon />
        </Button>
      </div>
    </nav>
  );
}

export function StudioMain({children}:{children:ReactNode}){
  return <section className="studio-main studio-shell-main">{children}</section>;
}
