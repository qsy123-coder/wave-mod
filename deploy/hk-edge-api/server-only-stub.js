// `server-only` 在非 Next/React Server Component 环境里会直接抛错。
// 香港边缘服务复用的是 src/lib 下的服务端模块，它们都带这句 import，
// 所以 esbuild 打包时把这个包换成这个空实现（见 scripts/build-hk-edge-api.mjs）。
// 这里跑的本来就是服务端代码，语义上没有放松任何限制。
export {};
