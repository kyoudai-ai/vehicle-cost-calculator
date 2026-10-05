/* Screen-based confirmation: browser modal permission is deliberately unnecessary. */
(function (root) {
  let pending = null;
  root.KyoudaiLocationConfirm = {
    cancel() { if (pending) pending(); },
    ask(candidate, signal, stage) {
      this.cancel();
      return new Promise((resolve, reject) => {
        if (signal.aborted) { reject(new DOMException('中止', 'AbortError')); return; }
        const panel = document.createElement('section');
        panel.id = 'locationConfirmation';
        panel.setAttribute('aria-label', stage);
        panel.style.cssText = 'padding:16px;margin:12px 0;border:2px solid #2366ac;border-radius:8px;background:#f5f9ff;';
        const title = document.createElement('strong');
        title.textContent = stage + '：検索した場所を確認してください。';
        const detail = document.createElement('p');
        detail.style.whiteSpace = 'pre-line';
        detail.textContent = candidate.label + '\n位置精度：' + candidate.precision + '\n緯度・経度：' + candidate.coordinates[1] + ', ' + candidate.coordinates[0];
        const accept = document.createElement('button');
        accept.type = 'button'; accept.id = 'confirmLocation'; accept.textContent = 'この場所で進む';
        const cancel = document.createElement('button');
        cancel.type = 'button'; cancel.id = 'cancelLocation'; cancel.textContent = '取り消す';
        cancel.style.marginLeft = '8px';
        let settled = false;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener('abort', abort);
          panel.remove();
          if (pending === abort) pending = null;
          error ? reject(error) : resolve(true);
        };
        const abort = () => finish(new DOMException('中止', 'AbortError'));
        pending = abort;
        accept.addEventListener('click', () => finish());
        cancel.addEventListener('click', () => finish(new Error('場所確認を取り消しました')));
        signal.addEventListener('abort', abort, { once: true });
        panel.append(title, detail, accept, cancel);
        document.getElementById('routeStatus').after(panel);
        accept.focus();
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
