"""Nexus Mods 鸣潮分区更新监测（**跑在首尔服务器**）。

为什么走官方 API 而不是爬网页：nexusmods.com 本体的 Cloudflare 会拦机房 IP
（首尔服务器实测 403「Just a moment...」），但 **api.nexusmods.com 不拦** ——
未带 key 时返回 401，说明请求本身能通。所以这个来源可以和其他来源一样跑在
服务器上，不必像 GameBanana 那样挪回本机。

只需一个免费 API key（nexusmods.com → Account → API），填进 config.nexus.ini。
"""

__version__ = "1.0.0"
