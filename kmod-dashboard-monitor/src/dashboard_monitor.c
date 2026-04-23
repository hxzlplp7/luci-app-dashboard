#include <linux/init.h>
#include <linux/kernel.h>
#include <linux/math64.h>
#include <linux/module.h>
#include <linux/moduleparam.h>
#include <linux/netdevice.h>
#include <linux/netfilter.h>
#include <linux/netfilter_ipv4.h>
#include <linux/proc_fs.h>
#include <linux/seq_file.h>
#include <linux/spinlock.h>
#include <linux/string.h>
#include <linux/timekeeping.h>
#include <linux/version.h>
#include <net/net_namespace.h>

#define DASHBOARD_PROC_DIR "dashboard_monitor"
#define DASHBOARD_PROC_STATS "stats"

static char ifname[IFNAMSIZ] = "auto";
module_param_string(ifname, ifname, IFNAMSIZ, 0644);
MODULE_PARM_DESC(ifname, "Tracked interface name (default: auto tracks all non-loopback)");

struct dashboard_monitor_stats {
	spinlock_t lock;
	u64 tx_bytes;
	u64 rx_bytes;
	u64 tx_packets;
	u64 rx_packets;
	u64 last_tx_bytes;
	u64 last_rx_bytes;
	u64 tx_rate;
	u64 rx_rate;
	unsigned long last_sample_sec;
	char active_ifname[IFNAMSIZ];
	bool fixed_ifname;
};

static struct dashboard_monitor_stats g_stats;
static struct proc_dir_entry *g_proc_dir;
static struct proc_dir_entry *g_proc_stats;

static bool dashboard_match_dev(const struct net_device *dev)
{
	if (!dev) {
		return false;
	}

	if (dev->flags & IFF_LOOPBACK) {
		return false;
	}

	if (!g_stats.fixed_ifname) {
		return true;
	}

	return strncmp(dev->name, ifname, IFNAMSIZ) == 0;
}

static void dashboard_set_active_ifname(const struct net_device *dev)
{
	if (!dev || g_stats.fixed_ifname) {
		return;
	}

	if (g_stats.active_ifname[0] == '\0') {
		strscpy(g_stats.active_ifname, dev->name, IFNAMSIZ);
		return;
	}

	if (strncmp(g_stats.active_ifname, dev->name, IFNAMSIZ) != 0) {
		strscpy(g_stats.active_ifname, "all", IFNAMSIZ);
	}
}

static unsigned int dashboard_hook_prerouting(void *priv, struct sk_buff *skb, const struct nf_hook_state *state)
{
	const struct net_device *in = state ? state->in : NULL;

	if (!skb || !dashboard_match_dev(in)) {
		return NF_ACCEPT;
	}

	spin_lock_bh(&g_stats.lock);
	g_stats.rx_bytes += skb->len;
	g_stats.rx_packets += 1;
	dashboard_set_active_ifname(in);
	spin_unlock_bh(&g_stats.lock);

	return NF_ACCEPT;
}

static unsigned int dashboard_hook_postrouting(void *priv, struct sk_buff *skb, const struct nf_hook_state *state)
{
	const struct net_device *out = state ? state->out : NULL;

	if (!skb || !dashboard_match_dev(out)) {
		return NF_ACCEPT;
	}

	spin_lock_bh(&g_stats.lock);
	g_stats.tx_bytes += skb->len;
	g_stats.tx_packets += 1;
	dashboard_set_active_ifname(out);
	spin_unlock_bh(&g_stats.lock);

	return NF_ACCEPT;
}

static struct nf_hook_ops dashboard_nfops[] = {
	{
		.hook = dashboard_hook_prerouting,
		.pf = NFPROTO_IPV4,
		.hooknum = NF_INET_PRE_ROUTING,
		.priority = NF_IP_PRI_FIRST,
	},
	{
		.hook = dashboard_hook_postrouting,
		.pf = NFPROTO_IPV4,
		.hooknum = NF_INET_POST_ROUTING,
		.priority = NF_IP_PRI_FIRST,
	},
	{
		.hook = dashboard_hook_prerouting,
		.pf = NFPROTO_IPV6,
		.hooknum = NF_INET_PRE_ROUTING,
		.priority = NF_IP_PRI_FIRST,
	},
	{
		.hook = dashboard_hook_postrouting,
		.pf = NFPROTO_IPV6,
		.hooknum = NF_INET_POST_ROUTING,
		.priority = NF_IP_PRI_FIRST,
	},
};

static int dashboard_proc_show(struct seq_file *m, void *v)
{
	u64 tx_bytes;
	u64 rx_bytes;
	u64 tx_packets;
	u64 rx_packets;
	u64 tx_rate;
	u64 rx_rate;
	unsigned long sampled_at;
	unsigned long dt;
	char iface[IFNAMSIZ];

	spin_lock_bh(&g_stats.lock);
	tx_bytes = g_stats.tx_bytes;
	rx_bytes = g_stats.rx_bytes;
	tx_packets = g_stats.tx_packets;
	rx_packets = g_stats.rx_packets;
	sampled_at = ktime_get_real_seconds();
	dt = sampled_at > g_stats.last_sample_sec ? sampled_at - g_stats.last_sample_sec : 0;

	if (dt > 0 && g_stats.last_sample_sec > 0) {
		u64 tx_delta = tx_bytes >= g_stats.last_tx_bytes ? tx_bytes - g_stats.last_tx_bytes : 0;
		u64 rx_delta = rx_bytes >= g_stats.last_rx_bytes ? rx_bytes - g_stats.last_rx_bytes : 0;
		g_stats.tx_rate = div64_u64(tx_delta, dt);
		g_stats.rx_rate = div64_u64(rx_delta, dt);
	}

	g_stats.last_tx_bytes = tx_bytes;
	g_stats.last_rx_bytes = rx_bytes;
	g_stats.last_sample_sec = sampled_at;
	tx_rate = g_stats.tx_rate;
	rx_rate = g_stats.rx_rate;

	if (g_stats.fixed_ifname) {
		strscpy(iface, ifname, IFNAMSIZ);
	} else if (g_stats.active_ifname[0] != '\0') {
		strscpy(iface, g_stats.active_ifname, IFNAMSIZ);
	} else {
		strscpy(iface, "all", IFNAMSIZ);
	}
	spin_unlock_bh(&g_stats.lock);

	seq_puts(m, "source=kmod-dashboard-monitor\n");
	seq_printf(m, "interface=%s\n", iface);
	seq_printf(m, "sampled_at=%lu\n", sampled_at);
	seq_printf(m, "tx_bytes=%llu\n", (unsigned long long)tx_bytes);
	seq_printf(m, "rx_bytes=%llu\n", (unsigned long long)rx_bytes);
	seq_printf(m, "tx_rate=%llu\n", (unsigned long long)tx_rate);
	seq_printf(m, "rx_rate=%llu\n", (unsigned long long)rx_rate);
	seq_printf(m, "tx_packets=%llu\n", (unsigned long long)tx_packets);
	seq_printf(m, "rx_packets=%llu\n", (unsigned long long)rx_packets);

	return 0;
}

static int dashboard_proc_open(struct inode *inode, struct file *file)
{
	return single_open(file, dashboard_proc_show, NULL);
}

#if LINUX_VERSION_CODE >= KERNEL_VERSION(5, 6, 0)
static const struct proc_ops dashboard_proc_ops = {
	.proc_open = dashboard_proc_open,
	.proc_read = seq_read,
	.proc_lseek = seq_lseek,
	.proc_release = single_release,
};
#else
static const struct file_operations dashboard_proc_ops = {
	.owner = THIS_MODULE,
	.open = dashboard_proc_open,
	.read = seq_read,
	.llseek = seq_lseek,
	.release = single_release,
};
#endif

static int __init dashboard_monitor_init(void)
{
	int ret;

	memset(&g_stats, 0, sizeof(g_stats));
	spin_lock_init(&g_stats.lock);

	if (strncmp(ifname, "auto", IFNAMSIZ) != 0 && ifname[0] != '\0') {
		g_stats.fixed_ifname = true;
		strscpy(g_stats.active_ifname, ifname, IFNAMSIZ);
	} else {
		g_stats.fixed_ifname = false;
		strscpy(g_stats.active_ifname, "all", IFNAMSIZ);
	}

	ret = nf_register_net_hooks(&init_net, dashboard_nfops, ARRAY_SIZE(dashboard_nfops));
	if (ret) {
		pr_err("dashboard_monitor: failed to register netfilter hooks (%d)\n", ret);
		return ret;
	}

	g_proc_dir = proc_mkdir(DASHBOARD_PROC_DIR, NULL);
	if (!g_proc_dir) {
		nf_unregister_net_hooks(&init_net, dashboard_nfops, ARRAY_SIZE(dashboard_nfops));
		return -ENOMEM;
	}

	g_proc_stats = proc_create(DASHBOARD_PROC_STATS, 0444, g_proc_dir, &dashboard_proc_ops);
	if (!g_proc_stats) {
		remove_proc_subtree(DASHBOARD_PROC_DIR, NULL);
		g_proc_dir = NULL;
		nf_unregister_net_hooks(&init_net, dashboard_nfops, ARRAY_SIZE(dashboard_nfops));
		return -ENOMEM;
	}

	pr_info("dashboard_monitor: loaded (ifname=%s)\n", ifname);
	return 0;
}

static void __exit dashboard_monitor_exit(void)
{
	if (g_proc_stats || g_proc_dir) {
		remove_proc_subtree(DASHBOARD_PROC_DIR, NULL);
		g_proc_stats = NULL;
		g_proc_dir = NULL;
	}

	nf_unregister_net_hooks(&init_net, dashboard_nfops, ARRAY_SIZE(dashboard_nfops));
	pr_info("dashboard_monitor: unloaded\n");
}

module_init(dashboard_monitor_init);
module_exit(dashboard_monitor_exit);

MODULE_LICENSE("GPL");
MODULE_AUTHOR("dashboard-community");
MODULE_DESCRIPTION("Realtime packet counters for luci-app-dashboard");
