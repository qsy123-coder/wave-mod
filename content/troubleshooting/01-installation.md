## Q1 · 有弹窗显示软件包下载失败？

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image1.jpeg)

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image2.jpeg)

**解决方法**

1. 挂梯子更新即可。

2. 也可以看本站「先看我」页面的教程视频（不需要梯子也可以更新）。

---

## Q2 · 解压不了？或者怎么批量解压？

**解决方法**

1. 按本站的解压教程操作：[解压教程](https://go.sunnyrose.xyz/guide)。

> 解压工具、批量解压的方法都在里面，照着做即可。

---

## Q3 · 安装 XXMI 时弹出"缺少 C++"的弹窗？

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image48.jpeg)

**解决方法**

1. 安装微软官方的 VC++ 运行库（x64），下载后双击安装即可。

[vcredist x64 下载](https://aka.ms/vs/17/release/vc_redist.x64.exe)

2. 装完仍然弹窗的，先在「应用和功能」里卸载旧的 Microsoft Visual C++ 2015-2022 Redistributable，再重新安装一次，然后重启电脑。

---

## Q4 · 安装 XXMI 时出现安装失败的弹窗？

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image49.jpeg)

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image50.jpeg)

**解决方法**

1. 先看这个视频尝试解决：

[B 站视频](https://www.bilibili.com/video/BV19j411W7My/)

2. 如果还不行，XXMI 安装包里有「msi 安装程序安装失败的话看这个」文件夹，进去按说明操作，可以直接跳过安装阶段。

---

## Q37 · 怎么添加杀毒白名单（防止管理器被误报）？

管理器通过注入加载 Mod，可能被部分杀毒软件误报病毒。一定要先将 JASM 管理器、XXMI 启动器所在的整个文件夹加入白名单，再启动管理器。

**解决方法**

下面以 Windows 自带的 Microsoft Defender 为例。

1. **打开 Windows 安全中心**：在开始菜单搜索“Windows 安全中心”，点击“打开”。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/whitelist/whitelist1.png)

> 开始菜单 → Windows 安全中心 → 打开

2. **进入病毒和威胁防护**：点击“病毒和威胁防护”。如果这里显示由其他杀毒软件管理，还需要在对应软件里添加 JASM、XXMI 白名单。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/whitelist/whitelist2.png)

> Windows 安全中心 → 病毒和威胁防护

3. **点击管理设置**：找到“病毒和威胁防护”设置，点击“管理设置”。向下滚动即可找到这一项。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/whitelist/whitelist3.png)

> “病毒和威胁防护”设置 → 管理设置

4. **找到排除项**：向下找到“排除项”，点击“添加或删除排除项”。这就是 Defender 的白名单入口。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/whitelist/whitelist4.png)

> 排除项 → 添加或删除排除项

5. **添加一个文件夹**：点击“添加排除项”，选择“文件夹”。接下来需要选择 JASM 所在的整个文件夹。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/whitelist/whitelist5.png)

> 添加排除项 → 文件夹

6. **选择 JASM 文件夹**：找到你存放 JASM 的文件夹，点击“选择文件夹”。返回排除项列表，确认其中已经出现这个文件夹的路径。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/whitelist/whitelist6.png)

> 选择自己的 JASM 文件夹；盘符与文件夹名不必与截图相同

> **注意**：确认排除项列表中已经出现整个 JASM 文件夹，再启动管理器。JASM 管理器和 XXMI 启动器如果不在同一个文件夹，两个文件夹都要各加一次排除项。
