import type {ReactNode} from 'react';

export function StudioEmptyState({
  icon,
  title,
  description,
  actions,
  className = '',
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={['studio-empty-state', className].filter(Boolean).join(' ')}>
      <div className="studio-empty-icon" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {actions && <div className="studio-empty-actions">{actions}</div>}
    </div>
  );
}
