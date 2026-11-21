## Q11 · 角色模型贴图错误？

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image16.png)

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image17.png)

**解决方法**

1. 确保游戏启动器的资源等级是**高清**，而不是「极致」或「流畅」。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image18.png)

> 如果你的启动器样式和上图不一致，说明装的就是高清包，直接看下面几条。

2. 在资源等级为高清的同时，确保 XXMI 设置里的「客户端资源质量」是 **HD**。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image19.png)

3. 新版本新增了战损和湿身效果，掉血或沾水会导致贴图错误。在设置里关闭「受伤表现」，重启游戏即可。

4. 版本更新会导致部分角色贴图错误，去整合包下载最新版修复工具修复一下。

5. 部分资源需要安装「反虚化 + 发光前置」才能正常显示，去整合包下载安装即可。（反虚化只推荐 v75、v82 自定义、v83.2 这几个版本）

6. 游戏内设置里把「画面细节」调成最高档，再用修复工具勾选「补全贴图状态」，点击「一键修复」。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image20.png)

7. 如果只有单个或少数角色贴图错误，其他正常，可能是这个资源坏了，自己去整合包里拿修复工具修一下。

8. 修完还不行，说明你装的资源里有个别和该角色不兼容，建议用二分法筛查。

---

## Q12 · 全部角色脸部撕裂模糊错误？

**解决方法**

1. 确保加载器版本是最新的。

2. 版本没问题的话，进游戏设置把光追相关选项关闭，重启游戏。

---

## Q13 · 角色模型变成不规则几何体、有倒刺、疯狂闪屏或抽搐？

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image27.png)

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image28.jpeg)

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image29.jpeg)

**解决方法**

1. 大概率是同个角色装了多个资源，务必保证每个角色只装一个。

2. 如果确实只装了一个还这样，逐个打开资源文件夹检查，可能有其他资源的文件夹不小心混进去了。

> 建议用二分法筛查：先移出一半资源，缩小范围，反复排查定位问题资源。

---

## Q14 · 武器类资源贴图错误？

**解决方法**

1. 武器没满级，升满级后就好了。

> 满级和未满级武器的 Hash 值不同，作者制作时一般用的是满级 Hash。

2. 还不行的就是资源本身坏了。

---

## Q15 · 尤诺资源头皮会秃？

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image34.png)

**解决方法**

1. 打开该资源的 ini 文件，找到 `cs-cb8=ref vs-cb3` 这一行。

2. 在这一行最前面加上分号，改成 `;cs-cb8=ref vs-cb3`。

3. 点击左上角「文件」→「保存」即可。

---

## Q16 · 科考摩托资源贴图错误或不生效？

**解决方法**

1. 先确保只有一个科考摩托资源生效。

2. 去游戏设置里调整「画面细节」，多试几个档位。

---

## Q17 · 游戏界面出现角色或怪物剪影？

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image35.png)

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image36.png)

**解决方法**

1. 某两个资源冲突了，自己筛查一下，删掉其中一个即可。

---

## Q18 · 角色模型扭曲怎么办？

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image43.png)

**解决方法**

1. 没救。资源本身坏了，修复工具也修不好，只能等作者修复。

---

## Q19 · 仇远的资源贴图错误？

**解决方法**

1. 先用修复工具修一遍。

2. 如果还不行，试试在设置里把画质调到最高，然后再调低。

> 仇远的资源比较玄学，以上方法不一定能彻底解决，凑合用。

---

## Q36 · 资源贴图错误 + 模型错误同时出现怎么办？

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image60.jpeg)

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image61.png)

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image62.png)

**解决方法**

1. 先做个区分：这种情况要和「单独的贴图错误」「单独的模型错误」分开，先看 Q11 和 Q13。

2. 如果确认是贴图和模型同时出错，直接重装 WWMI 包即可。
