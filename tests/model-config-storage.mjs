import assert from 'node:assert/strict';
import {createServer} from 'vite';
const memory=new Map();
globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const {saveModelConfig,loadModelConfig,modelConfigStorageError,MODEL_CONFIG_KEY:key}=await server.ssrLoadModule('/src/ai/modelConfigStorage.ts');
  const config={baseURL:'https://provider.test/v1',model:'test',apiKey:'test-only-secret',taskBudget:{maxMinutes:30,maxRounds:80,maxReportedTokens:3000000}};
  saveModelConfig(config);assert.ok(!memory.get(key).includes(config.apiKey));assert.equal(loadModelConfig().apiKey,'');assert.equal(loadModelConfig().taskBudget.maxRounds,80);
  saveModelConfig({...config,rememberApiKey:true});assert.equal(loadModelConfig().apiKey,config.apiKey);
  saveModelConfig({...config,rememberApiKey:false});assert.ok(!memory.get(key).includes(config.apiKey));
  memory.set(key,JSON.stringify(config));assert.equal(loadModelConfig().apiKey,config.apiKey,'legacy key retained for this session');assert.ok(!memory.get(key).includes(config.apiKey),'legacy durable key removed');
  assert.equal(loadModelConfig().apiKey,'','subsequent load requires entry');
  memory.set(key,JSON.stringify({...config,useMock:true}));assert.equal(loadModelConfig(),null);assert.equal(memory.has(key),false);
  memory.set(key,JSON.stringify({...config,rememberApiKey:true}));localStorage.setItem=()=>{throw Error('quota');};
  saveModelConfig(config);assert.equal(memory.has(key),false);assert.ok(modelConfigStorageError());
  localStorage.removeItem=()=>{throw Error('denied');};saveModelConfig(null);assert.match(modelConfigStorageError(),/旧密钥可能/);
  console.log('PASS memory-only defaults, opt-in persistence, legacy migration, preserved budget and storage failure reporting');
} finally {delete globalThis.localStorage;await server.close();}
