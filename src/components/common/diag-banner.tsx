/**
 * 诊断面板：纯 HTML + 内联 JS，不依赖 React hydration。
 * 放在页面最顶部，手机端也能看到。
 */
export function DiagBanner() {
  return (
    <>
      {/* 诊断面板 - 内联样式确保手机可见 */}
      <div
        id="__diag_bar"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 999999,
          background: "#111",
          color: "#0f0",
          fontSize: "11px",
          fontFamily: "monospace",
          padding: "6px 10px",
          minHeight: "28px",
          lineHeight: 1.4,
          borderBottom: "2px solid #0f0",
        }}
      >
        <span id="__diag_text">🔍 诊断中...</span>
      </div>
      {/* 给页面留出空间 */}
      <div style={{ height: "40px" }} />
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              var el = document.getElementById('__diag_text');
              if (!el) return;
              var lines = [];
              var total = 0, ok = 0, fail = 0;

              // 每 500ms 扫描一次页面上的 img 标签
              var check = function() {
                var imgs = document.querySelectorAll('img[src]');
                var newTotal = imgs.length;
                var newOk = 0, newFail = 0;
                var sample = '';

                for (var i = 0; i < Math.min(imgs.length, 5); i++) {
                  if (imgs[i].complete && imgs[i].naturalWidth > 0) newOk++;
                  else if (imgs[i].complete && imgs[i].naturalWidth === 0) newFail++;
                  if (sample === '' && imgs[i].src.length > 0) {
                    sample = imgs[i].src.substring(0, 80);
                  }
                }

                if (newTotal !== total || newOk !== ok || newFail !== fail) {
                  total = newTotal; ok = newOk; fail = newFail;
                  var text = total + '张图 | ✅' + ok + ' ❌' + fail;
                  if (total === 0) text = '⚠ 页面上没有 <img> 标签';
                  if (sample) text += ' | ' + sample;
                  el.textContent = text;
                  el.style.color = fail > 0 ? '#f55' : total === 0 ? '#ff0' : '#0f0';
                }
              };

              setInterval(check, 500);
              check();
            })();
          `,
        }}
      />
    </>
  );
}
