## Q25 · 怎么修改资源的切换键？

**解决方法**

1. 打开你要修改切换键的资源文件夹，里面会有一个或多个 ini 文件，打开它。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image21.png)

2. 里面有很多代码，翻一翻就能找到类似 `key = 5` 的行。`key=` 后面的就是切换键。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image22.png)

3. 把 `=` 后面的数字改成你想要的键位，比如改成 6 就是 `key = 6`。

4. 改完最重要的是一定点左上角「文件」→「保存」。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image23.png)

> **键位参考**：小键盘数字键要加 num 前缀，比如小键盘 1 写成 `key = num1`。
>
> 方向键分别写 `up`、`down`、`left`、`right`。
>
> 组合键同时写两个键位，比如 Alt+6 写成 `key = alt 6`。
>
> **注意**：部分资源虽然写了切换键，但可能无效。

---

## Q26 · 怎么修改或保存可切换类资源的初始形态？

**解决方法**

1. 资源文件名里不要有 `=`，有的话删掉。

2. 搭配 JASM 管理器时：打开单个角色的管理界面，点击启用上方的「自动同步」。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image24.png)

然后到「模组预设」界面，勾选「切换预设时自动同步 Mod 首选项」。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image25.png)

3. 也可以把资源文件名改短，然后在游戏内切换到自己喜欢的形态，按 F10 保存。

4. 还不行就直接改 ini 代码，把对应部位设成想要的形态再保存。

---

## Q27 · 怎么在游戏内切换资源？

**解决方法**

1. **单独使用 XXMI 加载器**：后台打开 Mods 文件夹，换掉资源文件后按 F10 加载。

> 举例：想换另一个今汐的资源，就把今汐原本的资源从 Mods 里移出去，放入新的今汐资源，回游戏按 F10 等待加载即可。

2. **使用 JASM 管理器**：后台打开 JASM 界面，勾选新资源（记得取消原资源的勾选），回游戏按 F10 加载。

---

## Q28 · JASM 管理器怎么在角色分区勾选多个资源？

**解决方法**

1. 打开角色分区，点击偏左上角的「显示」，取消勾选「单选模式」即可。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image30.png)

---

## Q29 · 怎么在游戏内快速取消启用所有资源？

**解决方法**

1. 游戏内按 F6 即可（部分资源可能取消不了）。

---

## Q30 · 游戏内出现写满英文的黑色弹窗怎么关闭？

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image32.png)

**解决方法**

1. 多按几次 F10，或按 X 隐藏。

> 自己翻译一下最后一行，不难懂的。

---

## Q31 · JASM 管理器设置的路径错了怎么修改？

**解决方法**

1. JASM 主界面左下角点击「设置」。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image46.png)

2. 要重置绑定的加载器路径，点「浏览」重新选择，设置完点击「更新路径」。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image47.png)

---

## Q32 · JASM 管理器怎么新增新角色的分区？

**解决方法**

1. 点击 JASM 左下角「设置」→「同步游戏数据」。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image51.png)

> 设置里没有这个按钮，说明 JASM 版本旧了，去整合包换个新版。
>
> 点击后一直显示同步中、完不成的，可以挂个梯子再试。

2. 也可以手动创建：点击 JASM 左上角的角色管理器（铅笔图标）→ 点击「+」。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image52.png)

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image53.png)

3. 按界面标注填写信息。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image54.png)

4. 填完后点击右下角「创建角色」。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image55.png)

5. 想删除这个分区，也可以在这个界面右上角「删除自定义角色」。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/v239/image56.png)
