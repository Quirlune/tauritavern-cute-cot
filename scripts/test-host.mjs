const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const cwd = process.cwd();
const plugin = cwd;
const artifacts = resolve(cwd, 'test-artifacts');
mkdirSync(artifacts, { recursive: true });
assert.ok(process.env.TAURITAVERN_SOURCE, 'Set TAURITAVERN_SOURCE to the v2.2.0 src directory');
const upstream = resolve(process.env.TAURITAVERN_SOURCE);
function extract(file, marker) {
    const source = readFileSync(resolve(upstream, file), 'utf8');
    const start = source.indexOf(marker);
    assert.ok(start >= 0);
    return source.slice(start, source.indexOf('\n}\n', start) + 3).replace(/^export /, '');
}
const dependencies = ['chat', 'eventSource', 'event_types', 'power_user', 'isHiddenReasoningModel', 'ReasoningState', 'ReasoningType', 'trimSpaces', 'getRegexedString', 'regex_placement', 'messageFormatting', 'shouldCommitStreamingMessage', 'setDatasetPropertyIfChanged', 't', 'cleanUpMessage', 'isOdd', 'countOccurrences', 'formatGenerationTimer', 'scrollLock', 'chatElement', 'syncMesToSwipe', 'saveLogprobsForActiveMessage'];
const nativeModule = `const {${dependencies.join(',')}}=globalThis.mock;\n` +
    extract('scripts/reasoning.js', 'export class ReasoningHandler {') + '\n' +
    extract('script.js', 'class StreamingProcessor {') + '\nexport { ReasoningHandler, StreamingProcessor };';
const nativeFade = readFileSync(resolve(upstream, 'scripts/util/stream-fadein.js'), 'utf8')
    .replace("import { morphdom } from '../../lib.js';", "import morphdom from '/morphdom.js';");
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/plugin/style.css"><style>body{font-family:system-ui;margin:20px;background:#faf7f8}.mes_reasoning_details{display:none}.mes_text{line-height:1.8}.mes{display:flex}.mesAvatarWrapper{width:56px;height:56px;background:#dec7d4;border-radius:50%;display:grid;place-items:center}.mes_block{padding-left:10px;width:100%;overflow:hidden}.ch_name{min-height:56px;padding-top:8px}#chat button{background:#e9e1d3!important;box-shadow:0 3px 12px #888!important;border:2px solid pink!important}</style><main id="chat"><article class="mes" mesid="0" is_user="false"><div class="mesAvatarWrapper">Q</div><div class="mes_block"><div class="ch_name">Quirlune</div><details class="mes_reasoning_details"><summary><span class="mes_reasoning_header_title"></span></summary><div class="mes_reasoning"></div></details><button class="mes_edit_add_reasoning" hidden></button><div class="mes_text"></div><span class="mes_timer"></span><span class="tokenCounterDisplay"></span></div></article></main>`;
const server = createServer((req, res) => {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
    if (req.url === '/upstream.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(nativeModule); return; }
    if (req.url === '/reasoning.js') { res.setHeader('Content-Type', 'text/javascript'); res.end('export {ReasoningHandler} from "/upstream.js";'); return; }
    if (req.url === '/native-fade.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(nativeFade); return; }
    if (req.url === '/morphdom.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(readFileSync(process.env.MORPHDOM_MODULE || resolve(plugin, 'node_modules/morphdom/dist/morphdom-esm.js'))); return; }
    if (req.url.startsWith('/plugin/')) {
        const path = resolve(plugin, req.url.slice(8));
        if (!path.startsWith(plugin + sep)) { res.writeHead(403).end(); return; }
        try { res.setHeader('Content-Type', extname(path) === '.css' ? 'text/css' : extname(path) === '.html' ? 'text/html' : 'text/javascript'); res.end(readFileSync(path)); } catch { res.writeHead(404).end(); }
        return;
    }
    res.writeHead(404).end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
    await page.goto(origin);
    const result = await page.evaluate(async () => {
        const { DEFAULTS, KEY } = await import('/plugin/parser.js');
        const { renderPanel } = await import('/plugin/panel.js');
        const { installIntegration } = await import('/plugin/integration.js');
        const { configureBodyFade } = await import('/plugin/body-fade.js');
        const { applyStreamFadeIn } = await import('/native-fade.js');
        globalThis.applyStreamFadeIn = applyStreamFadeIn;
        const listeners = new Map();
        const events = {
            on(k, fn) { const a=listeners.get(k)??[];a.push(fn);listeners.set(k,a); },
            makeFirst(k, fn) { const a=listeners.get(k)??[];a.unshift(fn);listeners.set(k,a); },
            makeLast(k, fn) { this.on(k,fn); },
            async emit(k,...args) { for(const fn of listeners.get(k)??[]) await fn(...args); },
        };
        const eventTypes = Object.fromEntries(['STREAM_TOKEN_RECEIVED','MESSAGE_RECEIVED','MESSAGE_EDITED','MESSAGE_UPDATED','GENERATION_STOPPED','GENERATION_ENDED','CHAT_CHANGED','CHAT_COMPLETION_PROMPT_READY','STREAM_REASONING_DONE','CHARACTER_MESSAGE_RENDERED'].map(x=>[x,x]));
        const message={name:'Q',mes:'',extra:{},swipes:[''],swipe_id:0,swipe_info:[{extra:{}}]};
        const calls=[];
        const guard=text=>{if(text.includes('PRIVATE')) throw Error('Thought reached native formatter');calls.push(text);return text;};
        const escape=text=>{const el=document.createElement('div');el.textContent=guard(text);return el.innerHTML;};
        globalThis.replaceTransientMesTextHtmlWithRuntimePolicy=(root,html,{fadeIn=false}={})=>{
            const text=root.querySelector('.mes_text');
            if(fadeIn) applyStreamFadeIn(text,html); else text.innerHTML=html;
        };
        globalThis.replaceMesTextHtmlWithRuntimePolicy=(root,html)=>root.querySelector('.mes_text').innerHTML=html;
        globalThis.updateSwipeCounter=()=>{};
        globalThis.mock={chat:[message],eventSource:events,event_types:eventTypes,
            power_user:{reasoning:{auto_parse:true,prefix:'<think>',suffix:'</think>'},stream_fade_in:false,message_token_count_enabled:false},
            isHiddenReasoningModel:()=>false,ReasoningState:{None:'none',Thinking:'thinking',Done:'done',Hidden:'hidden'},ReasoningType:{Parsed:'parsed',Model:'model'},
            trimSpaces:text=>text.trim(),getRegexedString:text=>guard(text),regex_placement:{REASONING:1},messageFormatting:escape,
            shouldCommitStreamingMessage:()=>true,setDatasetPropertyIfChanged:(el,key,value)=>{if(value===null)delete el.dataset[key];else el.dataset[key]=value;},t:a=>a.join(''),
            cleanUpMessage:({getMessage})=>guard(getMessage),isOdd:n=>n%2===1,countOccurrences:(a,b)=>a.split(b).length-1,
            formatGenerationTimer:()=>({timerValue:'',timerTitle:''}),scrollLock:true,chatElement:{find:()=>({})},
            syncMesToSwipe:()=>{message.swipes[0]=message.mes;message.swipe_info[0].extra=structuredClone(message.extra);},saveLogprobsForActiveMessage:()=>{},
        };
        const {ReasoningHandler,StreamingProcessor}=await import('/upstream.js');
        const ctx={chat:mock.chat,eventSource:events,eventTypes,saveChat:async()=>{},powerUserSettings:mock.power_user};
        configureBodyFade(ctx,{...DEFAULTS});
        installIntegration({getContext:()=>ctx,ReasoningHandler,getSettings:()=>DEFAULTS,render:renderPanel});
        const p=new StreamingProcessor('normal',false,new Date(),'',{});
        p.messageId=0;
        ctx.streamingProcessor=p;
        const raw='<think>PRIVATE\n<style>body{display:none}</style>\n<xml>原样显示</xml>\n**不加粗**\n'+('逐步梳理这一段思考。\n'.repeat(25))+'</think>正文仍然正常显示。';
        const end=raw.indexOf('</think>');
        for(let i=1;i<end;i+=5){const chunk=raw.slice(0,i);await events.emit(eventTypes.STREAM_TOKEN_RECEIVED,chunk);await p.onProgressStreaming(0,chunk);}
        if(document.querySelector('.cute-cot').dataset.open!=='true') throw Error('Not expanded while thinking');
        if(document.querySelector('.cute-cot-text').children.length) throw Error('Thought markup was rendered');
        globalThis.harness={p,ctx,message,events,raw,KEY,ReasoningHandler,DEFAULTS,renderPanel,calls};
        return { rawTokensChecked:calls.length, privateText:message.extra[KEY].text.includes('PRIVATE') };
    });
    await page.waitForTimeout(500);
    const live = await page.locator('.cute-cot-viewport').evaluate(el=>({height:el.clientHeight,scroll:el.scrollTop,overflow:el.scrollHeight-el.clientHeight}));
    assert.ok(live.height <= 180);
    assert.ok(live.scroll > 0, 'thought scroll follows new content');
    const geometry=await page.evaluate(()=>{
        const row=document.querySelector('.mes').getBoundingClientRect(),panel=document.querySelector('.cute-cot').getBoundingClientRect(),body=document.querySelector('.mes_text').getBoundingClientRect();
        const button=getComputedStyle(document.querySelector('.cute-cot-toggle'));
        return {gutter:panel.left-row.left,bodyGutter:body.left-row.left,panelWidth:panel.width,rowWidth:row.width,buttonShadow:button.boxShadow,buttonBorder:button.borderTopWidth,buttonBackground:button.backgroundColor};
    });
    assert.ok(geometry.bodyGutter > 50 && Math.abs(geometry.gutter-geometry.bodyGutter)<1);
    assert.ok(geometry.panelWidth < geometry.rowWidth-50);
    assert.equal(geometry.buttonShadow,'none');assert.equal(geometry.buttonBorder,'0px');assert.equal(geometry.buttonBackground,'rgba(0, 0, 0, 0)');
    // Verify the actual host segmentation/morphdom helper and CSS together.
    const fade=await page.evaluate(async()=>{
        const h=harness,base=h.raw.slice(0,h.raw.indexOf('</think>')+8);
        await h.p.onProgressStreaming(0,base+'第一句。');
        const text=document.querySelector('.mes_text'),old=text.querySelector('.text_segment');
        const firstAnimation=old.getAnimations()[0];
        await h.p.onProgressStreaming(0,base+'第一句。 第二句。');
        return {complete:text.textContent,reused:old===text.querySelector('.text_segment'),sameAnimation:firstAnimation===old.getAnimations()[0],duration:getComputedStyle(text.querySelector('.text_segment:last-child')).animationDuration,delay:getComputedStyle(old).animationDelay};
    });
    assert.equal(fade.complete,'第一句。 第二句。');assert.equal(fade.reused,true);assert.equal(fade.sameAnimation,true);assert.equal(fade.duration,'0.16s');assert.equal(fade.delay,'0s');
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.mes_text .text_segment').first().evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.screenshot({ path: resolve(artifacts,'thinking.png') });
    await page.evaluate(async()=>{const h=harness;await h.p.finalizeIntermediaryMessage(0,h.raw,{unlockUI:false});});
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.cute-cot-toggle').getAttribute('aria-expanded'),'false');
    assert.equal(await page.locator('.mes_text').textContent(),'正文仍然正常显示。');
    await page.screenshot({ path: resolve(artifacts,'collapsed.png') });
    const collapsedBody = await page.locator('.mes_text').boundingBox();
    assert.equal(await page.locator('.cute-cot-slot').evaluate(el=>el.getBoundingClientRect().height),0);
    const dockBox = await page.locator('.cute-cot-dock').boundingBox();
    assert.ok(dockBox.x+dockBox.width <= collapsedBody.x);
    await page.locator('.cute-cot-dock').click();
    await page.waitForTimeout(80);
    const middle = await page.locator('.cute-cot-reveal').evaluate(el=>el.getBoundingClientRect().height);
    await page.waitForTimeout(500);
    const expanded = await page.locator('.cute-cot-reveal').evaluate(el=>el.getBoundingClientRect().height);
    assert.ok(middle>0 && middle<expanded, `animated height: ${middle} / ${expanded}`);
    const expandedBody = await page.locator('.mes_text').boundingBox();
    assert.equal(expandedBody.x, collapsedBody.x);
    assert.equal(expandedBody.width, collapsedBody.width);
    assert.ok(expandedBody.y > collapsedBody.y+100);
    const swipes = await page.evaluate(()=>{
        const h=harness, row=document.querySelector('.mes'), message=h.ctx.chat[0];
        const archive=message.extra.cute_cot;
        new h.ReasoningHandler().initHandleMessage(row,{reset:true});
        const cleared=!row.querySelector('.cute-cot, .cute-cot-slot, .cute-cot-dock');
        const preserved=message.extra.cute_cot===archive;
        new h.ReasoningHandler().initHandleMessage(row);
        message.swipe_id=1;
        message.extra.cute_cot={...archive,text:'Second candidate'};
        new h.ReasoningHandler().initHandleMessage(row);
        const switched=row.querySelector('.cute-cot-text').textContent==='Second candidate' && row.querySelector('.cute-cot').dataset.open==='false';
        delete message.extra.cute_cot;
        new h.ReasoningHandler().initHandleMessage(row);
        const empty=!row.querySelector('.cute-cot, .cute-cot-dock');
        message.swipe_id=0;message.extra.cute_cot=archive;
        new h.ReasoningHandler().initHandleMessage(row);
        return {cleared,preserved,switched,empty};
    });
    assert.deepEqual(swipes,{cleared:true,preserved:true,switched:true,empty:true});
    const virtualized = await page.evaluate(()=>{
        const h=harness;
        const row=document.querySelector('.mes');
        const fresh=row.cloneNode(true);fresh.querySelector('.cute-cot').remove();
        new h.ReasoningHandler().initHandleMessage(fresh);
        row.replaceWith(fresh);
        return {panels:fresh.querySelectorAll('.cute-cot').length,open:fresh.querySelector('.cute-cot').dataset.open,text:fresh.querySelector('.cute-cot-text').textContent};
    });
    assert.equal(virtualized.panels,1);
    assert.equal(virtualized.open,'false');
    assert.ok(virtualized.text.includes('<style>body{display:none}</style>'));
    assert.equal(await page.locator('.cute-cot-text style').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.evaluate(async()=>{
        harness.ctx.extensionSettings={};harness.ctx.saveSettingsDebounced=()=>{};
        globalThis.SillyTavern={getContext:()=>harness.ctx};
        const host=document.createElement('div');host.id='extensions_settings2';document.body.append(host);
        const entry=await import('/plugin/index.js');entry.activate();
    });
    await page.locator('#cute-cot-settings [data-key="open"]').fill('[思考]');
    await page.locator('#cute-cot-settings [data-key="close"]').fill('[/思考]');
    // Native drawer visibility is controlled by jQuery in the full app; the fixture has no drawer JS.
    await page.locator('#cute-cot-settings [data-save]').click();
    assert.equal(await page.evaluate(()=>harness.ctx.extensionSettings.cute_cot.open),'[思考]');
    await page.locator('#cute-cot-settings [data-key="close"]').fill('[思考]');
    await page.locator('#cute-cot-settings [data-save]').click();
    assert.ok((await page.locator('#cute-cot-settings [role="status"]').textContent()).includes('不能'));
    await page.goto(origin+'/plugin/preview.html');
    await page.waitForTimeout(2300);
    await page.screenshot({ path: resolve(artifacts,'preview.png') });
    assert.equal(await page.locator('.cute-cot-text style').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
    const report={upstream:'TauriTavern v2.2.0 / 2b4de4b8a8aab467d9e75d546be84754918cc026',result,live,geometry,fade,animatedHeight:{middle,expanded},virtualized:true,mobileWidth:390,browser:'headless Chrome',errors};
    writeFileSync(resolve(artifacts,'browser-report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
} finally {await browser.close();server.close();}
