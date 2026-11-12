"""图片下载与 HTML 表格生成（**各来源共用**）。

CSV 里图片只是路径，表格里什么都看不到；所以另外生成 .html，
在浏览器里直接看图，点图跳原帖。

目录约定（每个来源一份）：
    out/<来源>/images/<id>.<ext>     下载好的缩略图
    out/<来源>/W-YYYY.M.D.html       当日表格
    out/<来源>/index.html            最近 200 条表格
"""

from __future__ import annotations

import csv
import html as html_mod
import logging
from pathlib import Path
from typing import Any, Iterable

import requests

log = logging.getLogger("gallery")

IMG_DIR = "images"
MAX_INDEX_ROWS = 200

_CSS = """
:root { color-scheme: light dark; }
body { font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
       margin: 0; padding: 16px; background: #f6f7f9; color: #1f2328; }
h1 { font-size: 18px; margin: 0 0 4px; }
.meta { color: #6b7280; font-size: 13px; margin-bottom: 14px; }
table { border-collapse: collapse; width: 100%; background: #fff;
        box-shadow: 0 1px 3px rgba(0,0,0,.08); border-radius: 8px; overflow: hidden; }
th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #eceff3;
         font-size: 14px; vertical-align: middle; }
th { background: #f0f2f5; font-weight: 600; white-space: nowrap; position: sticky; top: 0; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: #fafbfc; }
/* 缩略图：尺寸用 CSS 变量，按来源可调（--tw/--th，默认竖版）。
   ⚠️ 不要改成 max-width:100% —— img 外面套了 <a>，而 <a> 没有确定宽度、
   会收缩成图片原始尺寸，百分比就失去约束，图片会按原大小渲染而溢出。
   object-fit: contain 保证整张图完整可见（mod 预览是竖版长图，cover 会裁掉上下）。 */
.thumbbox { width: var(--tw, 150px); height: var(--th, 210px); border-radius: 6px;
            background: #eef1f4; overflow: hidden; }
.thumbbox a { display: block; width: var(--tw, 150px); height: var(--th, 210px); }
img.thumb { width: var(--tw, 150px); height: var(--th, 210px); object-fit: contain; display: block; }
.noimg { width: var(--tw, 150px); height: var(--th, 210px); border-radius: 6px; background: #eef1f4;
         display: flex; align-items: center; justify-content: center;
         color: #adb5bd; font-size: 11px; }
.copypanel { background: #fff; border: 1px solid #e3e6ea; border-radius: 8px;
             padding: 10px 12px; margin-bottom: 14px; }
.copypanel summary { cursor: pointer; font-weight: 600; font-size: 14px; }
.copypanel textarea { width: 100%; height: 190px; margin-top: 8px; font-size: 13px;
                      font-family: Consolas, Menlo, monospace; border: 1px solid #d8dce1;
                      border-radius: 6px; padding: 8px; box-sizing: border-box;
                      resize: vertical; white-space: pre; }
.copybtn { margin-top: 8px; padding: 6px 14px; border: 0; border-radius: 6px;
           background: #0969da; color: #fff; cursor: pointer; font-size: 13px; }
.copybtn:active { background: #0550ae; }
.hint { color: #6b7280; font-size: 12px; margin-left: 8px; }
td.title { font-weight: 600; min-width: 200px; }
td.title a { color: #1f2328; text-decoration: none; }
td.title a:hover { text-decoration: underline; color: #0969da; }
a.pill { display: inline-block; padding: 3px 9px; border-radius: 999px;
         background: #0969da; color: #fff; text-decoration: none; font-size: 12px;
         white-space: nowrap; }
a.pill.qk { background: #6f42c1; }
code { background: #f0f2f5; padding: 1px 5px; border-radius: 4px; font-size: 12px; }
.dim { color: #6b7280; font-size: 12px; white-space: nowrap; }
@media (prefers-color-scheme: dark) {
  body { background: #0d1117; color: #e6edf3; }
  table { background: #161b22; box-shadow: none; }
  th { background: #21262d; }
  td, th { border-color: #30363d; }
  tr:hover td { background: #1c2128; }
  td.title a { color: #e6edf3; }
  code, .noimg { background: #21262d; }
}
"""


def _ext_from(url: str, content_type: str = "") -> str:
    path = url.split("?")[0]
    if "." in path.rsplit("/", 1)[-1]:
        ext = path.rsplit(".", 1)[-1].lower()
        if 2 <= len(ext) <= 5 and ext.isalnum():
            return ext
    mapping = {"image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif"}
    return mapping.get(content_type.split(";")[0].strip(), "jpg")


def download_images(
    rows: Iterable[dict[str, str]],
    source_dir: str | Path,
    *,
    id_field: str,
    url_field: str,
    image_col: str = "预览图",
    session: requests.Session | None = None,
    timeout: int = 30,
) -> int:
    """把 rows 里 url_field 指向的图片下载到 source_dir/images/，并回填 image_col。

    已存在的文件跳过（重复轮询不会重复下载）。返回新下载数量。
    """
    source_dir = Path(source_dir)
    img_dir = source_dir / IMG_DIR
    img_dir.mkdir(parents=True, exist_ok=True)
    if session is not None:
        sess = session
    else:
        sess = requests.Session()
        # 绕过系统代理：本机开着 Clash 等系统代理时，requests 会自动读取并导致
        # 连接失败（且 GameBanana 经机房代理出口会被 503 拒绝）。
        sess.trust_env = False
        sess.proxies = {}
    sess.headers.setdefault("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0.0.0 Safari/537.36")
    downloaded = 0

    for row in rows:
        url = (row.get(url_field) or "").strip()
        rid = str(row.get(id_field, "")).strip()
        if not url or not rid:
            continue
        # 命中已有的任意扩展名则直接复用
        for existing in img_dir.glob(f"{rid}.*"):
            row[image_col] = f"{IMG_DIR}/{existing.name}"
            break
        else:
            try:
                resp = sess.get(url, timeout=timeout)
                resp.raise_for_status()
                ext = _ext_from(url, resp.headers.get("Content-Type", ""))
                dest = img_dir / f"{rid}.{ext}"
                dest.write_bytes(resp.content)
                row[image_col] = f"{IMG_DIR}/{dest.name}"
                downloaded += 1
            except Exception as exc:  # noqa: BLE001 - 单张失败不应中断整轮
                log.warning("图片下载失败 %s：%s", rid, exc)
                row.setdefault(image_col, "")
    return downloaded


def _cell(row: dict[str, str], col: str) -> str:
    return html_mod.escape(str(row.get(col, "") or ""))


def build_copy_text(rows: list[dict[str, str]], netdisk_pairs: list[tuple[str, str]]) -> str:
    """生成"可整段复制去转存"的链接文本。

    每行形如：https://pan.quark.cn/s/xxxx  提取码:keke
    一个单元格里若有多个链接（空白分隔，如 arca 的帖内下载链接），拆成多行。
    """
    lines: list[str] = []
    for row in rows:
        for link_col, code_col in netdisk_pairs:
            raw = (row.get(link_col) or "").strip()
            if not raw:
                continue
            code = (row.get(code_col) or "").strip() if code_col else ""
            for link in raw.split():
                lines.append(f"{link}  提取码:{code}" if code else link)
    return "\n".join(lines)


_COPY_JS = """
function copyAll(){
  var ta = document.getElementById('linkbox');
  ta.focus(); ta.select();
  var done = false;
  try { done = document.execCommand('copy'); } catch(e) { done = false; }
  if (!done && navigator.clipboard) {
    navigator.clipboard.writeText(ta.value).then(function(){ flash('已复制'); }, function(){ flash('请按 Ctrl+C'); });
    return;
  }
  flash(done ? '已复制' : '请按 Ctrl+C');
}
function flash(msg){
  var s = document.getElementById('copystate');
  s.textContent = msg;
  setTimeout(function(){ s.textContent = ''; }, 2500);
}
"""


def render_html(
    rows: list[dict[str, str]],
    out_path: Path,
    *,
    title: str,
    source_name: str,
    image_col: str = "预览图",
    link_col: str,
    title_col: str,
    tag_cols: list[str] | None = None,
    pill_cols: list[str] | None = None,
    netdisk_pairs: list[tuple[str, str]] | None = None,
    thumb_size: tuple[int, int] = (150, 210),
    links_label: str = "网盘链接",
) -> None:
    """把 rows 渲染成一张带缩略图的 HTML 表格（含可整段复制的网盘链接区）。"""
    tag_cols = tag_cols or []
    pill_cols = pill_cols or []
    netdisk_pairs = netdisk_pairs or []

    parts: list[str] = []
    parts.append("<!doctype html><html lang='zh-CN'><head><meta charset='utf-8'>")
    parts.append("<meta name='viewport' content='width=device-width, initial-scale=1'>")
    parts.append(f"<title>{html_mod.escape(title)}</title>")
    parts.append(f"<style>:root{{--tw:{thumb_size[0]}px;--th:{thumb_size[1]}px}}{_CSS}</style></head><body>")
    parts.append(f"<h1>{html_mod.escape(title)}</h1>")
    parts.append(f"<div class='meta'>来源：{html_mod.escape(source_name)} · 共 {len(rows)} 条</div>")

    # 网盘链接汇总区：textarea 内容可全选复制，方便批量转存
    copy_text = build_copy_text(rows, netdisk_pairs)
    if copy_text:
        n = len(copy_text.splitlines())
        parts.append("<details class='copypanel' open>")
        parts.append(
            f"<summary>{links_label}汇总（{n} 条）—— 点下面框内全选复制，直接去转存</summary>"
        )
        parts.append(f"<textarea id='linkbox' readonly spellcheck='false'>{html_mod.escape(copy_text)}</textarea>")
        parts.append("<button class='copybtn' onclick='copyAll()'>一键复制全部</button>")
        parts.append("<span class='hint' id='copystate'></span>")
        parts.append("</details>")

    parts.append("<table><thead><tr><th>预览</th><th>标题</th><th>信息</th><th>链接</th></tr></thead><tbody>")

    for row in rows:
        img_rel = (row.get(image_col) or "").strip()
        link = (row.get(link_col) or "").strip()
        name = (row.get(title_col) or "").strip() or "(无标题)"
        if img_rel:
            # 点图看原图（本地文件），点标题去原帖
            thumb = (
                f"<div class='thumbbox'><a href='{html_mod.escape(img_rel)}' target='_blank' rel='noopener'>"
                f"<img class='thumb' loading='lazy' src='{html_mod.escape(img_rel)}' alt=''></a></div>"
            )
        else:
            thumb = "<div class='noimg'>无图</div>"

        tags = "".join(f"<code>{_cell(row, c)}</code> " for c in tag_cols if row.get(c))
        pills = "".join(
            f"<a class='pill{' qk' if '夸克' in c else ''}' target='_blank' rel='noopener' href='{_cell(row, c)}'>打开</a> "
            for c in pill_cols
            if row.get(c)
        )
        parts.append(
            "<tr>"
            f"<td>{thumb}</td>"
            f"<td class='title'><a target='_blank' rel='noopener' href='{html_mod.escape(link)}'>{html_mod.escape(name)}</a></td>"
            f"<td><div class='dim'>{tags}</div></td>"
            f"<td>{pills or ''}</td>"
            "</tr>"
        )

    parts.append("</tbody></table>")
    parts.append(f"<script>{_COPY_JS}</script>")
    parts.append("</body></html>")
    out_path.write_text("\n".join(parts), encoding="utf-8")


def write_links_txt(
    rows: list[dict[str, str]],
    out_path: Path,
    netdisk_pairs: list[tuple[str, str]],
) -> int:
    """额外落一份纯文本链接表，方便直接 Ctrl+A / Ctrl+C。返回条数。"""
    text = build_copy_text(rows, netdisk_pairs)
    if not text:
        return 0
    out_path.write_text(text + "\n", encoding="utf-8")
    return len(text.splitlines())


def read_csv_rows(path: Path, encoding: str = "utf-8-sig") -> list[dict[str, str]]:
    """读取归档 CSV。

    ⚠️ 过滤条件必须与来源无关：早期版本只认 article_id/product_id，
    导致 GameBanana（去重键是 mod_id）的行被全部过滤掉、HTML 静默生成不出来。
    现在只剔除完全空白的行。
    """
    if not path.exists():
        return []
    with path.open("r", encoding=encoding, newline="") as fh:
        return [r for r in csv.DictReader(fh) if any((v or "").strip() for v in r.values())]


def rebuild_gallery(
    source_dir: str | Path,
    source_name: str,
    *,
    link_col: str,
    title_col: str,
    tag_cols: list[str] | None = None,
    pill_cols: list[str] | None = None,
    netdisk_pairs: list[tuple[str, str]] | None = None,
    thumb_size: tuple[int, int] = (150, 210),
    links_label: str = "网盘链接",
    links_filename: str = "网盘链接.txt",
    image_col: str = "预览图",
    encoding: str = "utf-8-sig",
) -> int:
    """依据 CSV 重建全部当日 HTML 表 + index.html + 网盘链接 txt。

    从 CSV 读（而不是只用本轮新增），保证页面内容始终是完整的一天。
    """
    source_dir = Path(source_dir)
    tag_cols = tag_cols or []
    pill_cols = pill_cols or []
    netdisk_pairs = netdisk_pairs or []
    common = dict(
        source_name=source_name,
        image_col=image_col,
        link_col=link_col,
        title_col=title_col,
        tag_cols=tag_cols,
        pill_cols=pill_cols,
        netdisk_pairs=netdisk_pairs,
        thumb_size=thumb_size,
        links_label=links_label,
    )

    count = 0
    for csv_path in sorted(source_dir.glob("W-*.csv")):
        rows = read_csv_rows(csv_path, encoding)
        if not rows:
            continue
        render_html(rows, csv_path.with_suffix(".html"), title=f"{source_name} · {csv_path.stem[2:]}", **common)
        count += 1

    all_rows = read_csv_rows(source_dir / "all_mods.csv", encoding)
    if all_rows:
        recent = list(reversed(all_rows))[:MAX_INDEX_ROWS]
        render_html(recent, source_dir / "index.html", title=f"{source_name} · 最近 {len(recent)} 条", **common)

    # 单独的纯文本链接表：全量，方便直接 Ctrl+A / Ctrl+C 批量转存
    write_links_txt(all_rows, source_dir / links_filename, netdisk_pairs)
    return count
