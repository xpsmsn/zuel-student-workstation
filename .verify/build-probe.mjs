import fs from 'node:fs';

const src = fs.readFileSync('app/src/index.html', 'utf8');

const probe = `
<script id="probe-run">
window.__probeClicked = 0;
(function(){
  var out = {};
  function n(sel){ return document.querySelectorAll(sel).length; }
  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

  (async function(){
    await sleep(300);                       /* 等 DOMContentLoaded 里的 boot() 跑完 */
    try{
      out.onclickTotal = n('[onclick]');
      out.upgraded = n('[data-kbd="1"]');
      out.ariaCurrent = n('[aria-current="page"]');
      out.roleButton = n('[role="button"]');
      out.tabindex0 = n('[tabindex="0"]');
      out.round2Flag = !!window.__a11yRound2;
      out.scanFn = typeof window.__a11yScan;
      if(window.__a11yScan){
        var scan = window.__a11yScan();
        out.unhandledCount = scan.unhandled.length;
        out.unhandledSample = scan.unhandled.slice(0, 10).map(function(el){
          return el.tagName + '.' + String(el.className||'').split(' ')[0] + '|' + (el.getAttribute('onclick')||'').slice(0,40);
        });
      }
      out.toastRole = document.getElementById('toast').getAttribute('role');
      out.toastLive = document.getElementById('toast').getAttribute('aria-live');
      out.undoMsgLive = document.getElementById('undoMsg').getAttribute('aria-live');
      out.undoClose = (function(){
        var el = document.querySelector('.undo-close');
        return el ? [el.getAttribute('data-kbd'), el.getAttribute('role'), el.getAttribute('aria-label')].join('/') : 'none';
      })();

      /* —— 动态插入的元素能否被升级（模拟视图重绘）—— */
      var probe = document.createElement('div');
      probe.id = 'kbd-probe';
      probe.setAttribute('onclick', 'window.__probeClicked = window.__probeClicked + 1');
      document.body.appendChild(probe);
      await sleep(60);
      out.probeTagged = [probe.getAttribute('data-kbd'), probe.getAttribute('role'),
                         probe.getAttribute('tabindex'), probe.getAttribute('aria-label')].join('/');
      probe.focus();
      out.probeFocusable = document.activeElement === probe;
      probe.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true, cancelable:true}));
      out.enterActivated = window.__probeClicked === 1;
      probe.dispatchEvent(new KeyboardEvent('keydown', {key:' ', bubbles:true, cancelable:true}));
      out.spaceActivated = window.__probeClicked === 2;

      /* —— 确认框：语义 + 初始焦点 —— */
      probe.focus();
      askConfirm({ title:'测试确认', html:'<b>真删吗</b>', okText:'删除' });
      await sleep(60);
      var modal = document.querySelector('#confirmRoot .modal');
      out.confirmRole = modal ? modal.getAttribute('role') : 'no-modal';
      out.confirmAriaModal = modal ? modal.getAttribute('aria-modal') : '-';
      out.confirmLabelled = modal ? !!modal.getAttribute('aria-labelledby') : false;
      out.confirmDescribed = modal ? !!modal.getAttribute('aria-describedby') : false;
      out.focusInModal = modal ? modal.contains(document.activeElement) : false;
      out.focusText = document.activeElement ? (document.activeElement.textContent||'').trim() : '';
      var btns = modal ? modal.querySelectorAll('button:not([disabled])') : [];
      out.buttonCount = btns.length;
      if(modal){
        /* 与页面里 focusables() 同一套筛选，才对得上「首/末」到底是谁 */
        var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
        var list = [].filter.call(modal.querySelectorAll(FOCUSABLE), function(el){ return el.offsetParent !== null; });
        out.focusableOrder = list.map(function(el){
          return el.tagName + '.' + String(el.className||'').split(' ')[0];
        });
        if(list.length > 1){
          list[list.length-1].focus();
          document.dispatchEvent(new KeyboardEvent('keydown', {key:'Tab', bubbles:true, cancelable:true}));
          out.tabWrapsForward = document.activeElement === list[0];
          list[0].focus();
          document.dispatchEvent(new KeyboardEvent('keydown', {key:'Tab', shiftKey:true, bubbles:true, cancelable:true}));
          out.tabWrapsBackward = document.activeElement === list[list.length-1];
        }
      }
      /* —— Esc 关闭 + 焦点归还到打开它的元素 —— */
      var opener = probe;
      opener.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true, cancelable:true}));
      out.confirmClosed = document.querySelectorAll('#confirmRoot .modal').length === 0;
      await sleep(60);
      out.focusRestored = document.activeElement === opener;
      out.focusAfterClose = document.activeElement
        ? document.activeElement.tagName + '#' + (document.activeElement.id||'') : 'none';

      /* —— 普通 dialog（#modalRoot）：role=dialog + 初始焦点 + Esc —— */
      document.getElementById('modalRoot').innerHTML =
        '<div class="mask"><div class="modal" onclick="event.stopPropagation()">' +
        '<div class="modal-head"><div class="modal-title">标题X</div><div class="modal-close" onclick="closeModal()">×</div></div>' +
        '<div class="modal-body">正文内容</div>' +
        '<div class="modal-foot"><button class="btn">好</button></div></div></div>';
      await sleep(60);
      var m2 = document.querySelector('#modalRoot .modal');
      out.dialogRole = m2 ? m2.getAttribute('role') : 'no-modal';
      out.dialogAriaModal = m2 ? m2.getAttribute('aria-modal') : '-';
      out.dialogLabelled = m2 ? !!m2.getAttribute('aria-labelledby') : false;
      out.dialogFocusIn = m2 ? m2.contains(document.activeElement) : false;
      out.dialogFocusText = document.activeElement ? (document.activeElement.textContent||'').trim() : '';
      out.dialogCloseBtn = (function(){
        var c = document.querySelector('#modalRoot .modal-close');
        return c ? [c.getAttribute('data-kbd'), c.getAttribute('role'), c.getAttribute('aria-label')].join('/') : 'none';
      })();
      document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true, cancelable:true}));
      out.dialogClosed = document.querySelectorAll('#modalRoot .modal').length === 0;

      /* —— 真·端到端：键盘切模块（侧栏 div.side-item），焦点不能被重绘吞掉 —— */
      var nav = null, cands = document.querySelectorAll('.side-item[data-kbd="1"]');
      for(var ni = 0; ni < cands.length; ni++){
        if((cands[ni].textContent||'').indexOf('宿舍看板') >= 0){ nav = cands[ni]; break; }
      }
      out.navFound = !!nav;
      if(nav){
        out.navText = (nav.textContent||'').trim().slice(0,12);
        out.navTabIndex = nav.getAttribute('tabindex');
        out.navRole = nav.getAttribute('role');
        var activeBefore = document.querySelector('.side-item.active');
        out.activeBefore = activeBefore ? (activeBefore.textContent||'').trim().slice(0,8) : 'none';
        var mainBefore = (document.getElementById('mainArea') || document.body).innerText.length;
        nav.focus();
        out.navFocusable = document.activeElement === nav;
        nav.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true, cancelable:true}));
        await sleep(700);
        var activeAfter = document.querySelector('.side-item.active');
        out.activeAfter = activeAfter ? (activeAfter.textContent||'').trim().slice(0,8) : 'none';
        out.navSwitched = !!activeAfter && (activeAfter.textContent||'').indexOf('宿舍') >= 0;
        out.mainLenChanged = (document.getElementById('mainArea') || document.body).innerText.length !== mainBefore;
        var ae = document.activeElement;
        out.focusAfterNav = ae ? (ae.tagName + '.' + String(ae.className||'').split(' ')[0]) : 'none';
        out.focusSurvivedNav = !!ae && ae !== document.body && document.body.contains(ae);
        out.focusAfterNavText = ae ? (ae.textContent||'').trim().slice(0,12) : '';
        /* aria-current 要跟着 active 走 */
        out.ariaCurrentCount = document.querySelectorAll('.side-item[aria-current="page"]').length;
        out.ariaCurrentOnActive = !!(activeAfter && activeAfter.getAttribute('aria-current') === 'page');
      }

      /* —— live region 真的会被读到吗（内容变化）—— */
      toast('测试提示');
      out.toastText = document.getElementById('toast').textContent;
      out.toastShown = document.getElementById('toast').classList.contains('show');
    }catch(e){
      out.err = String(e) + ' @ ' + String(e.stack||'').split('\\n')[1];
    }
    var d = document.createElement('div');
    d.id = 'probe-out';
    d.textContent = JSON.stringify(out, null, 1);
    document.body.appendChild(d);
  })();
})();
</script>
`;

const idx = src.lastIndexOf('</body>');
if (idx < 0) throw new Error('anchor </body> not found');
const out = src.slice(0, idx) + probe + src.slice(idx);
fs.writeFileSync('.verify/probe.html', out, 'utf8');
console.log('probe.html written:', out.length, 'chars');
