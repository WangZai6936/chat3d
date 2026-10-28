import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
const server=await createServer({server:{port:4175,host:'127.0.0.1',strictPort:true},appType:'spa'});
let browser;
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.CHAT3D_BROWSER_PATH,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:4175/tests/visual/instancing.html');await page.waitForFunction(()=>window.testResult);
 const result=await page.evaluate(()=>window.testResult);assert.deepEqual(errors,[]);
 for(const frame of [result.initial,result.edited]){assert.equal(frame.afterCalls,1);assert.ok(frame.beforeCalls>=399);assert.ok(frame.meanPixelDifference<.5,JSON.stringify(frame));}
 assert.equal(result.restored,true);assert.ok(result.selected>0);assert.equal(result.includesHidden,false);
 assert.ok(result.shadow.meanPixelDifference<.5,JSON.stringify(result.shadow));
 console.log('PASS real WebGL pixel parity, shadows, ID selection and draw calls',JSON.stringify(result));
} finally {await browser?.close();await server.close();}
