const url = "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/mods/%E7%90%B3%E5%A5%88/dae6e3ee-d9f2-48e4-96b5-630ee97babff/preview.webp";
const r = await fetch(url + "?t=" + Date.now());
console.log("normal url  status", r.status);
console.log("  content-length", r.headers.get("content-length"));
console.log("  last-modified", r.headers.get("last-modified"));
console.log("  etag", r.headers.get("etag"));

const enc = "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/mods/%25E7%2590%25B3%25E5%25A5%2588/dae6e3ee-d9f2-48e4-96b5-630ee97babff/preview.webp";
const r2 = await fetch(enc);
console.log("double-encoded(stranded?) status", r2.status, "len", r2.headers.get("content-length"));
