import type {ReactNode} from 'react';
import {Badge} from '@radix-ui/themes';

export function StudioSectionHeader({
  id,
  title,
  count,
  actions,
  level = 2,
}: {
  id?: string;
  title: string;
  count?: number;
  actions?: ReactNode;
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <header className="studio-section-header home-panel-heading">
      <Heading id={id} className="studio-section-title">
        {title}
        {count !== undefined && (
          <Badge variant="soft" color="gray" radius="medium" className="studio-section-count">
            {count}
          </Badge>
        )}
      </Heading>
      {actions}
    </header>
  );
}
