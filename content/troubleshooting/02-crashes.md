## Q5 · 点击启动进入游戏直接闪退，或 XXMI 弹窗加载失败？

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image3.jpeg)

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image4.jpeg)

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image5.png)

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image6.png)

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image7.png)

**解决方法**

1. 先确保你玩的不是 WeGame 版本，如果是请换官服。（账号数据是互通的，放心！）WeGame 用不了资源。

2. 可能是某个资源导致，建议先把 Mods 清空试试能不能进。如果还不行，也建议保持 Mods 为空来做下面几条，方便控制变量。

3. 点击 XXMI 右上角「设置」→「WWMI」→「XXMI DLL 初始化延迟」，把数值调大再试，比如 1000、2000。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image8.png)

4. 点击 XXMI 右上角「设置」→「通用」→「游戏进程启动等待超时」，把数值调大再试。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image9.png)

5. 点击 XXMI 右上角「设置」→「通用」→「启动方式」，改成 shell 选项试试。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image10.png)

> **注意**：Manual 选项需要先在 XXMI 点「启动」，再手动点游戏启动器的「进入游戏」，不建议选。

6. 点击 XXMI 右上角「设置」→「通用」，往下滑找到「进程优先级」，逐个选项试。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image11.png)

> 部分人每次加载资源进游戏都要重新调一次进程优先级。

7. 点击「启动」旁边的三个点 →「修复 WWMI」试试。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image12.png)

8. 先确保后台游戏完全关闭，且没有任何大型软件在运行。然后进游戏设置，把「各向异性采样」改成「1x」。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image13.png)

9. **N 卡用户**：右键桌面打开 NVIDIA 控制面板，台式机和笔记本可能不一样，看自己是哪种情况：
   - [方案 A] 点击「管理显示设置」，有三个选项时选择 Optimus，再点下方「应用」。如果还不行，换其他选项逐个试。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image14.png)

   - [方案 B] 如果没有上面这一项，就点击「管理 Surround.PhysX」，在「PhysX 设置」里逐个尝试三个选项（每次改完点「应用」），试一个重启一次电脑再进游戏，三个都试完，其中一个应该能进。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image15.png)

   **A 卡用户**：同样右键桌面打开 A 卡控制面板 →「游戏」→「库」里的鸣潮（没有就先右上角扫描导入），在「游戏体验」一栏把选项改为性能（有的叫「HYPR-RX」，闪电图标），改完应该就能进了。

10. 打开英伟达 App（没有就装一个），回退一下显卡驱动版本。

---

## Q6 · 游戏闪退并出现弹窗显示 UE4 崩溃？

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image33.jpeg)

**解决方法**

1. 自己筛查一下是哪个资源导致的（把 Mods 清空再试）。确定是某个资源的话，把它的文件名改成英文（不要有中文）即可。

2. 点击 XXMI 右上角「设置」→「通用」，往下滑找到「进程优先级」，逐个选项试。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image11.png)

3. 确保游戏启动器的资源等级是**高清**，而不是「极致」或「流畅」。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image18.png)

4. 在资源等级为高清的同时，确保 XXMI 设置里的「客户端资源质量」是 **HD**。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image19.png)

5. 点击 XXMI 右上角「设置」→「WWMI」→「XXMI DLL 初始化延迟」，把数值调大再试。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image8.png)

6. 可能是显存不足，建议少装点资源、降低游戏内画质或升级电脑配置。

7. 可以换个显卡驱动版本试试。

8. 游戏内设置里把 DLSS 关了试试。

---

## Q7 · 游戏出现多开弹窗，强制退出后重新进入还是这样？

**解决方法**

1. 不是资源导致的，重启电脑即可。

---

## Q8 · 进入游戏时弹出 ACE 安全中心弹窗？

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image42.jpeg)

**解决方法**

1. 如果是 WeGame 版，请换官方启动器（账号数据互通）。

2. 如果不是 WeGame 还出现这种情况，请把电脑上的腾讯系游戏删掉，特别是 WeGame 以及里面的游戏，无畏契约、三角洲行动之类的，要删干净，最好到盘里找到本地文件夹彻底删除。

3. 如果电脑上单独安装了 ACE 安全中心，也一并删掉（不会删干净可以上网搜「怎么彻底删除 ACE」）。

4. 删干净后建议重启电脑。

---

## Q9 · 游戏内出现弹窗显示"参数获取异常"？

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image37.jpeg)

**解决方法**

1. 多重启几次游戏或电脑，看看能不能正常进入。

2. 检查后台有没有挂梯子，有的话关掉。

3. 还不行的话换官方启动器（不要用 WeGame），账号数据互通。

---

## Q10 · XXMI 一直显示"正在等待 Client-Win64-shipping.exe 启动…"？

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image57.png)

**解决方法**

1. 先确保 XXMI「设置」→「通用」里的「游戏启动」不是「手动」。手动模式需要点 XXMI 的「启动」后，再手动点游戏启动器的「进入游戏」。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image58.png)

2. 在 XXMI「设置」→「通用」→「进程优先级」，逐个选项试。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image59.png)
