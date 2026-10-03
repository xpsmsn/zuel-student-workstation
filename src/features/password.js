/* ---------- 设置 / 导出 ---------- */

function changePw(){
  const o = $('oldPw').value, n = $('newPw').value;
  /* 没设过密码 → 直接设一个新密码，不校验「原密码」 */
  if(S.password && hash(o) !== S.password && o !== DEFAULT_PW){ $('setErr').textContent = '原密码不正确'; return; }
  if(n.length < 4){ $('setErr').textContent = '新密码至少 4 位'; return; }
  S.password = hash(n); save();
  $('setErr').textContent = '';
  $('oldPw').value = ''; $('newPw').value = '';
  toast('密码已更新（万一忘了，解锁码 8838 仍然有效）');
  closeModal();
  renderProfile();
}

function resetAll(){
  askConfirm({
    title:'清空全部数据', danger:true, okText:'清空全部数据',
    html:`确定<b>清空全部本地数据</b>？<br><br>清空后将回到空白状态（不会自动生成演示数据），<b>此操作不可撤销</b>。<br>如只是想重导一批数据，请到「批次管理」删除单个批次（可撤销）。`,
    onOk(){
      // 软清空：写回「空批次表」而不是删 key。
      // 删 key 的话，下次启动 boot() 会以为从未使用过，又把演示数据灌回来 —— 这是老版本的坑。
      S.batches = []; S.activeBatchId = null; S.students = []; S.grades = []; invalidateGradeMap();
      S.filters = {}; S.quickView = 'all'; S.classFilter = 'all'; S._search = '';
      S.guideSeen = false;      // 清空数据 = 从头开始 → 下次进入重新走一遍新手引导
      S.tourSeen = false;       // v1.9.2：浮窗批注导览也一并重来
      save();
      location.reload();
    }
  });
}
