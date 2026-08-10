## Q11 · 角色模型贴图错误？

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image24.png)

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image25.png)

**解决方法**

1. 如果角色界面正常但大世界中贴图错误，先确保 XXMI 所有组件为最新版。

> 3.5 版本临时补充：[查看频道](https://pd.qq.com/s/6s28xrpjn)

2. 游戏内设置中，将「图形预设」调成「均衡」，还不行就继续调高。

3. 新版本新增了战损和湿身效果，掉血或沾水会导致贴图错误。在设置中关闭「受伤表现」后重启游戏即可。

4. 版本更新会导致部分角色贴图错误，去整合包下载最新版修复工具修复。

5. 部分 Mod 需要安装「反虚化 + 发光前置」才能正常显示。还不行的话，用修复工具勾选「应用稳定纹理」后点击「一键修复」。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image26.png)

6. 游戏设置中将「画面细节」调成「极高」。

7. 如果只有单个角色 Mod 贴图错误，可能是该 Mod 坏了，用修复工具修一下。还不行则说明有 Mod 与该角色不兼容。

> 常见不兼容：长离 Mod 与「滑翔翼改伞」类 Mod 不兼容；其他可能是武器类 Mod。

---

## Q12 · 全部角色脸部撕裂模糊错误？

**解决方法**

1. 确保加载器版本为最新。

2. 游戏内设置中把光线追踪（光追）相关选项关闭，重启游戏。

---

## Q13 · 角色模型变成不规则几何体、有倒刺、疯狂闪屏或抽搐？

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image27.png)

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image28.jpeg)

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image29.jpeg)

**解决方法**

1. 大概率是同个角色装了多个 Mod，务必保证每个角色只装一个 Mod。

2. 如果确实只装了一个，逐个打开 Mod 文件夹检查，可能有其他 Mod 文件夹不小心混进去了。

> 建议使用二分法筛查：先移出一半 Mod，缩小范围，反复排查定位问题 Mod。

---

## Q14 · 武器类 Mod 贴图错误？

**解决方法**

1. 武器没满级，升满级后就好了。

> 满级和未满级武器的 Hash 值不同，Mod 作者一般使用满级 Hash 值制作。

2. 如果还不行的就是 Mod 本身坏了。

---

## Q15 · 尤诺 Mod 头皮会秃？

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image30.png)

**解决方法**

1. 打开该 Mod 文件夹中的 ini 文件，查找 `cs-cb8=ref vs-cb3` 这一行。

2. 在该行最前面加上分号，改为 `;cs-cb8=ref vs-cb3`。

3. 保存文件即可。

---

## Q16 · 科考摩托 Mod 贴图错误或不生效？

**解决方法**

1. 确保只有一个科考摩托 Mod 生效。

2. 游戏设置中调整「画面细节」，多试几个档位。

---

## Q17 · 游戏界面出现角色或怪物剪影？

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image31.png)

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image32.png)

**解决方法**

1. 某两个 Mod 冲突了，自行筛查后删除其中一个即可。

---

## Q18 · 角色模型扭曲怎么办？

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image33.png)

**解决方法**

1. 没救。Mod 本身坏了，修复工具也修不好，只能等待作者修复。

---

## Q19 · 仇远的 Mod 贴图错误？

**解决方法**

1. 先用修复工具修复。

2. 如果不行，尝试在设置中将画质调到最高再调低。

> 仇远的 Mod 比较玄学，以上方法不一定能彻底解决，凑合用。
