import {build} from 'vite';
await build({configFile:false,publicDir:false,ssr:{noExternal:['three']},build:{ssr:'server/team/validator.ts',outDir:'dist-team',emptyOutDir:true,rollupOptions:{output:{entryFileNames:'validator.mjs'}}}});
