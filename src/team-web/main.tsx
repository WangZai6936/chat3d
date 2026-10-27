import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {Theme} from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import '../ui-system.css';
import '../ui/team-library.css';
import './team-web.css';
import {TeamWebApp} from './TeamWebApp';

createRoot(document.getElementById('root')!).render(
 <StrictMode>
  <Theme accentColor="blue" grayColor="slate" radius="medium" scaling="100%">
   <TeamWebApp/>
  </Theme>
 </StrictMode>,
);
