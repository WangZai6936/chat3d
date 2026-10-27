import type {ReactNode} from 'react';

export function StudioPageHeader({
  eyebrow,
  title,
  description,
  icon,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="resource-heading studio-page-header">
      <div>
        {eyebrow && <span className="resource-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions}
      {icon}
    </header>
  );
}
