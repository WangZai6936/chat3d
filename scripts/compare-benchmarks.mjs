import fs from 'node:fs';import {createServer} from 'vite';
const [a,b]=process.argv.slice(2);if(!a||!b)throw Error('Usage: node scripts/compare-benchmarks.mjs baseline.json candidate.json');
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try{const {compareBenchmarks}=await server.ssrLoadModule('/src/domain/benchmark.ts');console.log(JSON.stringify(compareBenchmarks(JSON.parse(fs.readFileSync(a)),JSON.parse(fs.readFileSync(b))),null,2));}finally{await server.close()}
