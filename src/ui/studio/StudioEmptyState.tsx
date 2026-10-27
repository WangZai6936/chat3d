import type {ReactNode} from 'react';

export function StudioEmptyState({
  icon,
  title,
  description,
  className = '',
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={['studio-empty-state', className].filter(Boolean).join(' ')}>
      <div className="studio-empty-icon" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </div>
  );
}
