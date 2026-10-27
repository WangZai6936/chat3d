import {build} from 'vite';
import {copyFile,cp} from 'node:fs/promises';

await build({configFile: 'vite.team-web.config.ts'});
await copyFile('dist-team-web/team-web.html','dist-team-web/index.html');
await cp('public/chat3d.svg', 'dist-team-web/chat3d.svg');
