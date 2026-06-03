#ifdef _WIN32
/* Windows IDE 静态分析打桩：完全不引用任何外部头文件，手工声明项目所需的全部类型与函数 */
typedef unsigned long long size_t;
typedef long long ssize_t;
typedef long long time_t;
typedef int socklen_t;
typedef unsigned short sa_family_t;
typedef unsigned int in_addr_t;
typedef unsigned short uint16_t;

/* stdbool */
typedef _Bool bool;
#define true 1
#define false 0

/* stdarg（使用编译器内建） */
typedef __builtin_va_list va_list;
#define va_start(ap, param) __builtin_va_start(ap, param)
#define va_end(ap) __builtin_va_end(ap)

/* stdio */
typedef struct FILE FILE;
extern FILE *stderr;

/* 常量宏 */
#define NULL ((void*)0)
#define EINTR 4
#define SIGPIPE 13
#define SIG_IGN ((void (*)(int))1)
#define AF_INET 2
#define SOCK_STREAM 1
#define SOL_SOCKET 1
#define SO_REUSEADDR 2
#define PROT_READ 1

extern int errno;

/* 网络结构体 */
struct in_addr {
    in_addr_t s_addr;
};
struct sockaddr {
    unsigned short sa_family;
    char sa_data[14];
};
struct sockaddr_in {
    unsigned short sin_family;
    unsigned short sin_port;
    struct in_addr sin_addr;
    char sin_zero[8];
};
unsigned short htons(unsigned short hostshort);

/* 内存管理 */
void *calloc(size_t nmemb, size_t size);
void *malloc(size_t size);
void *realloc(void *ptr, size_t size);
void free(void *ptr);

/* 字符串 */
size_t strlen(const char *s);
void *memcpy(void *dest, const void *src, size_t n);
void *memmove(void *dest, const void *src, size_t n);
char *strcpy(char *dest, const char *src);
char *strncpy(char *dest, const char *src, size_t n);
int strcmp(const char *s1, const char *s2);
int strncmp(const char *s1, const char *s2, size_t n);
char *strstr(const char *haystack, const char *needle);
char *strchr(const char *s, int c);
char *strrchr(const char *s, int c);
void *memset(void *s, int c, size_t n);
char *strncat(char *dest, const char *src, size_t n);
char *strcat(char *dest, const char *src);

/* 文件 I/O */
FILE *fopen(const char *pathname, const char *mode);
char *fgets(char *s, int size, FILE *stream);
int fclose(FILE *stream);
FILE *popen(const char *command, const char *type);
int pclose(FILE *stream);
int fscanf(FILE *stream, const char *format, ...);

/* 格式化 I/O */
int sscanf(const char *str, const char *format, ...);
int sprintf(char *str, const char *format, ...);
int snprintf(char *str, size_t size, const char *format, ...);
int vsnprintf(char *str, size_t size, const char *format, va_list ap);
int printf(const char *format, ...);
int fprintf(FILE *stream, const char *format, ...);
int dprintf(int fd, const char *format, ...);
void perror(const char *s);

/* ctype */
int tolower(int c);
int toupper(int c);
int isspace(int c);
int isalnum(int c);
int isalpha(int c);
int isdigit(int c);

/* stdlib 数值转换 */
int atoi(const char *nptr);
long atol(const char *nptr);
double strtod(const char *nptr, char **endptr);
unsigned long long strtoull(const char *nptr, char **endptr, int base);
void qsort(void *base, size_t nmemb, size_t size, int (*compar)(const void *, const void *));

/* 网络套接字 */
int socket(int domain, int type, int protocol);
int setsockopt(int sockfd, int level, int optname, const void *optval, socklen_t optlen);
int bind(int sockfd, const struct sockaddr *addr, socklen_t addrlen);
int listen(int sockfd, int backlog);
int accept(int sockfd, struct sockaddr *addr, socklen_t *addrlen);
int inet_pton(int af, const char *src, void *dst);

/* 信号与时间 */
void (*signal(int signum, void (*handler)(int)))(int);
time_t time(time_t *tloc);

/* POSIX I/O */
ssize_t read(int fd, void *buf, size_t count);
ssize_t write(int fd, const void *buf, size_t count);
int close(int fd);
int usleep(unsigned int usec);
unsigned int sleep(unsigned int seconds);

#else
// Linux 正常编译分支导入所有标准及 POSIX 头文件
#include <arpa/inet.h>
#include <ctype.h>
#include <errno.h>
#include <netinet/in.h>
#include <signal.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>
#endif

#define DEFAULT_LISTEN_HOST "127.0.0.1"
#define DEFAULT_LISTEN_PORT 19090
#define MAX_TEXT 256
#define MAX_DEVICES 96

struct buffer {
    char *data;
    size_t len;
    size_t cap;
};

struct traffic_state {
    char iface[64];
    unsigned long long tx;
    unsigned long long rx;
    time_t ts;
};

struct cpu_state {
    unsigned long long idle;
    unsigned long long total;
    bool valid;
};

struct device {
    char ip[64];
    char mac[64];
    char name[128];
    bool active;
};

static struct traffic_state g_traffic;
static struct cpu_state g_cpu;

static void buf_init(struct buffer *b)
{
    b->cap = 8192;
    b->len = 0;
    b->data = calloc(1, b->cap);
}

static void buf_free(struct buffer *b)
{
    free(b->data);
    b->data = NULL;
    b->len = 0;
    b->cap = 0;
}

static void buf_reserve(struct buffer *b, size_t extra)
{
    size_t need = b->len + extra + 1;
    if (need <= b->cap) {
        return;
    }
    while (b->cap < need) {
        b->cap *= 2;
    }
    b->data = realloc(b->data, b->cap);
}

static void buf_append(struct buffer *b, const char *s)
{
    size_t n = strlen(s);
    buf_reserve(b, n);
    memcpy(b->data + b->len, s, n);
    b->len += n;
    b->data[b->len] = '\0';
}

static void buf_printf(struct buffer *b, const char *fmt, ...)
{
    va_list ap;
    char stack[1024];
    int n;

    va_start(ap, fmt);
    n = vsnprintf(stack, sizeof(stack), fmt, ap);
    va_end(ap);

    if (n < 0) {
        return;
    }
    if ((size_t)n < sizeof(stack)) {
        buf_append(b, stack);
        return;
    }

    char *tmp = malloc((size_t)n + 1);
    if (!tmp) {
        return;
    }
    va_start(ap, fmt);
    vsnprintf(tmp, (size_t)n + 1, fmt, ap);
    va_end(ap);
    buf_append(b, tmp);
    free(tmp);
}

static void trim(char *s)
{
    size_t len;
    char *p = s;

    while (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n') {
        p++;
    }
    if (p != s) {
        memmove(s, p, strlen(p) + 1);
    }

    len = strlen(s);
    while (len > 0 && (s[len - 1] == ' ' || s[len - 1] == '\t' ||
                       s[len - 1] == '\r' || s[len - 1] == '\n')) {
        s[--len] = '\0';
    }
}

static bool read_first_line(const char *path, char *out, size_t out_len)
{
    FILE *f = fopen(path, "r");
    if (!f) {
        if (out_len) {
            out[0] = '\0';
        }
        return false;
    }
    if (!fgets(out, (int)out_len, f)) {
        out[0] = '\0';
        fclose(f);
        return false;
    }
    fclose(f);
    trim(out);
    return true;
}

static unsigned long long read_ull_file(const char *path)
{
    char line[64];
    if (!read_first_line(path, line, sizeof(line))) {
        return 0;
    }
    return strtoull(line, NULL, 10);
}

static void read_cmd(const char *cmd, char *out, size_t out_len)
{
    FILE *p;
    if (out_len) {
        out[0] = '\0';
    }
    p = popen(cmd, "r");
    if (!p) {
        return;
    }
    if (fgets(out, (int)out_len, p)) {
        trim(out);
    }
    pclose(p);
}

static void json_string(struct buffer *b, const char *s)
{
    const unsigned char *p = (const unsigned char *)(s ? s : "");
    buf_append(b, "\"");
    while (*p) {
        switch (*p) {
        case '\\': buf_append(b, "\\\\"); break;
        case '"': buf_append(b, "\\\""); break;
        case '\b': buf_append(b, "\\b"); break;
        case '\f': buf_append(b, "\\f"); break;
        case '\n': buf_append(b, "\\n"); break;
        case '\r': buf_append(b, "\\r"); break;
        case '\t': buf_append(b, "\\t"); break;
        default:
            if (*p < 0x20) {
                buf_printf(b, "\\u%04x", *p);
            } else {
                char c[2] = { (char)*p, '\0' };
                buf_append(b, c);
            }
            break;
        }
        p++;
    }
    buf_append(b, "\"");
}

static void json_key_string(struct buffer *b, const char *key, const char *value)
{
    json_string(b, key);
    buf_append(b, ":");
    json_string(b, value);
}

static void get_default_iface(char *iface, size_t len)
{
    FILE *f = fopen("/proc/net/route", "r");
    char line[512];

    iface[0] = '\0';
    if (!f) {
        return;
    }

    while (fgets(line, sizeof(line), f)) {
        char name[64] = "";
        char dest[32] = "";
        if (sscanf(line, "%63s %31s", name, dest) == 2 && strcmp(dest, "00000000") == 0) {
            snprintf(iface, len, "%s", name);
            break;
        }
    }
    fclose(f);
}

static void get_openwrt_release_value(const char *key, char *out, size_t out_len)
{
    FILE *f = fopen("/etc/openwrt_release", "r");
    char line[512];
    size_t key_len = strlen(key);

    out[0] = '\0';
    if (!f) {
        return;
    }

    while (fgets(line, sizeof(line), f)) {
        trim(line);
        if (strncmp(line, key, key_len) == 0 && line[key_len] == '=') {
            char *v = line + key_len + 1;
            trim(v);
            if ((v[0] == '\'' || v[0] == '"') && strlen(v) >= 2) {
                char quote = v[0];
                v++;
                char *end = strrchr(v, quote);
                if (end) {
                    *end = '\0';
                }
            }
            snprintf(out, out_len, "%s", v);
            break;
        }
    }
    fclose(f);
}

static bool read_cpu_sample(unsigned long long *idle_out, unsigned long long *total_out)
{
    FILE *f = fopen("/proc/stat", "r");
    char cpu[16];
    unsigned long long user = 0, nice = 0, system = 0, idle = 0, iowait = 0;
    unsigned long long irq = 0, softirq = 0, steal = 0;

    if (!f) {
        return false;
    }
    if (fscanf(f, "%15s %llu %llu %llu %llu %llu %llu %llu %llu",
               cpu, &user, &nice, &system, &idle, &iowait, &irq, &softirq, &steal) < 5) {
        fclose(f);
        return false;
    }
    fclose(f);

    if (strcmp(cpu, "cpu") != 0) {
        return false;
    }

    *idle_out = idle + iowait;
    *total_out = user + nice + system + idle + iowait + irq + softirq + steal;
    return *total_out > 0;
}

static int calculate_cpu_usage(unsigned long long prev_idle, unsigned long long prev_total,
                               unsigned long long idle, unsigned long long total)
{
    unsigned long long idle_delta;
    unsigned long long total_delta;
    unsigned long long busy_delta;

    if (total <= prev_total || idle < prev_idle) {
        return 0;
    }

    idle_delta = idle - prev_idle;
    total_delta = total - prev_total;
    if (total_delta == 0 || idle_delta > total_delta) {
        return 0;
    }

    busy_delta = total_delta - idle_delta;
    return (int)((busy_delta * 100 + total_delta / 2) / total_delta);
}

static int get_cpu_usage(void)
{
    unsigned long long idle = 0;
    unsigned long long total = 0;
    int usage = 0;

    if (!read_cpu_sample(&idle, &total)) {
        return 0;
    }

    if (!g_cpu.valid) {
        g_cpu.idle = idle;
        g_cpu.total = total;
        g_cpu.valid = true;
        usleep(100000);
        if (!read_cpu_sample(&idle, &total)) {
            return 0;
        }
    }

    usage = calculate_cpu_usage(g_cpu.idle, g_cpu.total, idle, total);
    if (usage < 0) usage = 0;
    if (usage > 100) usage = 100;

    g_cpu.idle = idle;
    g_cpu.total = total;
    return usage;
}

static void append_system_status(struct buffer *b)
{
    char model[MAX_TEXT] = "";
    char firmware[MAX_TEXT] = "";
    char kernel[MAX_TEXT] = "";
    char hostname[MAX_TEXT] = "";
    char uptime_line[128] = "";
    char temp_line[64] = "";
    unsigned long uptime = 0;
    int temp = 0;
    int mem_usage = 0;
    int cpu_usage = get_cpu_usage();

    read_first_line("/tmp/sysinfo/model", model, sizeof(model));
    if (model[0] == '\0') {
        read_first_line("/proc/device-tree/model", model, sizeof(model));
    }
    if (model[0] == '\0') {
        snprintf(model, sizeof(model), "OpenWrt Device");
    }

    get_openwrt_release_value("DISTRIB_DESCRIPTION", firmware, sizeof(firmware));
    if (firmware[0] == '\0') {
        snprintf(firmware, sizeof(firmware), "OpenWrt");
    }
    read_first_line("/proc/sys/kernel/osrelease", kernel, sizeof(kernel));
    read_first_line("/proc/sys/kernel/hostname", hostname, sizeof(hostname));

    if (read_first_line("/proc/uptime", uptime_line, sizeof(uptime_line))) {
        uptime = (unsigned long)strtod(uptime_line, NULL);
    }

    for (int i = 0; i < 10; i++) {
        char path[128];
        snprintf(path, sizeof(path), "/sys/class/thermal/thermal_zone%d/temp", i);
        if (read_first_line(path, temp_line, sizeof(temp_line))) {
            temp = atoi(temp_line);
            if (temp > 1000) {
                temp /= 1000;
            }
            if (temp > 0) {
                break;
            }
        }
    }

    FILE *mf = fopen("/proc/meminfo", "r");
    if (mf) {
        char line[256];
        unsigned long total = 0, avail = 0, free_mem = 0;
        while (fgets(line, sizeof(line), mf)) {
            sscanf(line, "MemTotal: %lu kB", &total);
            sscanf(line, "MemAvailable: %lu kB", &avail);
            sscanf(line, "MemFree: %lu kB", &free_mem);
        }
        fclose(mf);
        if (total > 0) {
            if (avail == 0) {
                avail = free_mem;
            }
            mem_usage = (int)(((total - avail) * 100) / total);
            if (mem_usage < 0) mem_usage = 0;
            if (mem_usage > 100) mem_usage = 100;
        }
    }

    buf_append(b, "\"system_status\":{");
    json_key_string(b, "hostname", hostname);
    buf_append(b, ",");
    json_key_string(b, "model", model);
    buf_append(b, ",");
    json_key_string(b, "firmware", firmware);
    buf_append(b, ",");
    json_key_string(b, "kernel", kernel);
    buf_printf(b, ",\"temp\":%d,\"systime_raw\":%ld,\"uptime_raw\":%lu,\"cpuUsage\":%d,\"memUsage\":%d}",
               temp, (long)time(NULL), uptime, cpu_usage, mem_usage);
}

static void append_network_status(struct buffer *b, const char *iface)
{
    char wan_ip[128] = "";
    char wan_ipv6[128] = "";
    char lan_ip[128] = "";
    char gateway[128] = "";
    char dns[128] = "";
    char cmd[384];
    bool online = iface && iface[0];
    /* 验证接口名格式：仅允许字母、数字、连字符、下划线和点 */
    if (online) {
        for (const char *p = iface; *p; p++) {
            if (!isalnum((unsigned char)*p) && *p != '-' && *p != '_' && *p != '.') {
                online = false;
                break;
            }
        }
    }

    if (online) {
        snprintf(cmd, sizeof(cmd), "ip -4 addr show dev '%s' 2>/dev/null | awk '/inet / {print $2; exit}' | cut -d/ -f1", iface);
        read_cmd(cmd, wan_ip, sizeof(wan_ip));
        snprintf(cmd, sizeof(cmd), "ip -6 addr show dev '%s' scope global 2>/dev/null | awk '/inet6 / {print $2; exit}' | cut -d/ -f1", iface);
        read_cmd(cmd, wan_ipv6, sizeof(wan_ipv6));
    }

    read_cmd("ip -4 addr show dev br-lan 2>/dev/null | awk '/inet / {print $2; exit}' | cut -d/ -f1", lan_ip, sizeof(lan_ip));
    read_cmd("ip route 2>/dev/null | awk '/^default/ {print $3; exit}'", gateway, sizeof(gateway));
    read_cmd("awk '/^nameserver/ {print $2; exit}' /tmp/resolv.conf.d/resolv.conf.auto /etc/resolv.conf 2>/dev/null", dns, sizeof(dns));

    buf_append(b, "\"status\":{");
    buf_printf(b, "\"online\":%s,\"internet\":", online ? "true" : "false");
    json_string(b, online ? "up" : "down");
    buf_append(b, ",\"online_reason\":");
    json_string(b, online ? "default-route" : "no-default-route");
    buf_printf(b, ",\"link_up\":%s,\"route_ready\":%s,\"probe_ok\":false,\"conn_count\":%llu},",
               online ? "true" : "false", online ? "true" : "false",
               read_ull_file("/proc/sys/net/netfilter/nf_conntrack_count"));

    buf_append(b, "\"network_status\":{");
    buf_printf(b, "\"internet\":%d,\"online_reason\":", online ? 0 : 1);
    json_string(b, online ? "default-route" : "no-default-route");
    buf_append(b, ",\"interface\":");
    json_string(b, iface ? iface : "");
    buf_append(b, ",\"lan\":{\"ip\":");
    json_string(b, lan_ip);
    buf_append(b, ",\"dns\":[");
    if (dns[0]) json_string(b, dns);
    buf_append(b, "]},\"wan\":{\"ip\":");
    json_string(b, wan_ip);
    buf_append(b, ",\"ipv6\":");
    json_string(b, wan_ipv6);
    buf_append(b, ",\"gateway\":");
    json_string(b, gateway);
    buf_append(b, ",\"dns\":[");
    if (dns[0]) json_string(b, dns);
    buf_append(b, "]}}");
}

static void append_traffic(struct buffer *b, const char *iface)
{
    char path[256];
    unsigned long long tx = 0, rx = 0;
    unsigned long long tx_rate = 0, rx_rate = 0;
    time_t now = time(NULL);

    if (iface && iface[0]) {
        snprintf(path, sizeof(path), "/sys/class/net/%s/statistics/tx_bytes", iface);
        tx = read_ull_file(path);
        snprintf(path, sizeof(path), "/sys/class/net/%s/statistics/rx_bytes", iface);
        rx = read_ull_file(path);
    }

    if (g_traffic.ts > 0 && strcmp(g_traffic.iface, iface ? iface : "") == 0 && now > g_traffic.ts) {
        unsigned long dt = (unsigned long)(now - g_traffic.ts);
        if (tx >= g_traffic.tx) {
            tx_rate = (tx - g_traffic.tx) / dt;
        }
        if (rx >= g_traffic.rx) {
            rx_rate = (rx - g_traffic.rx) / dt;
        }
    }

    snprintf(g_traffic.iface, sizeof(g_traffic.iface), "%s", iface ? iface : "");
    g_traffic.tx = tx;
    g_traffic.rx = rx;
    g_traffic.ts = now;

    buf_append(b, "\"interface_traffic\":{");
    buf_append(b, "\"interface\":");
    json_string(b, iface ? iface : "");
    buf_printf(b, ",\"tx_bytes\":%llu,\"rx_bytes\":%llu,\"tx_rate\":%llu,\"rx_rate\":%llu,\"sampled_at\":%ld,\"source\":\"dashboard-core\"}",
               tx, rx, tx_rate, rx_rate, (long)now);
}

static int load_devices(struct device *devices, int max_devices)
{
    FILE *leases = fopen("/tmp/dhcp.leases", "r");
    int count = 0;

    if (leases) {
        char line[512];
        while (count < max_devices && fgets(line, sizeof(line), leases)) {
            char ts[64] = "", mac[64] = "", ip[64] = "", name[128] = "";
            if (sscanf(line, "%63s %63s %63s %127s", ts, mac, ip, name) >= 3) {
                snprintf(devices[count].ip, sizeof(devices[count].ip), "%s", ip);
                snprintf(devices[count].mac, sizeof(devices[count].mac), "%s", mac);
                snprintf(devices[count].name, sizeof(devices[count].name), "%s", strcmp(name, "*") == 0 ? "" : name);
                devices[count].active = false;
                count++;
            }
        }
        fclose(leases);
    }

    FILE *arp = fopen("/proc/net/arp", "r");
    if (arp) {
        char line[512];
        while (fgets(line, sizeof(line), arp)) {
            char ip[64], hw[64], flags[64], mac[64];
            if (sscanf(line, "%63s %63s %63s %63s", ip, hw, flags, mac) == 4 && strcmp(ip, "IP") != 0) {
                bool found = false;
                for (int i = 0; i < count; i++) {
                    if (strcmp(devices[i].ip, ip) == 0) {
                        devices[i].active = strcmp(flags, "0x2") == 0;
                        found = true;
                        break;
                    }
                }
                if (!found && count < max_devices && strcmp(flags, "0x2") == 0) {
                    snprintf(devices[count].ip, sizeof(devices[count].ip), "%s", ip);
                    snprintf(devices[count].mac, sizeof(devices[count].mac), "%s", mac);
                    devices[count].name[0] = '\0';
                    devices[count].active = true;
                    count++;
                }
            }
        }
        fclose(arp);
    }

    return count;
}

static const char* determine_device_type(const char *name) {
    if (!name || !*name) return "laptop";
    
    char lower[128];
    int len = 0;
    for (int i = 0; name[i] && i < 127; i++) {
        lower[i] = (char)tolower((unsigned char)name[i]);
        len++;
    }
    lower[len] = '\0';

    if (strstr(lower, "router") || strstr(lower, "route") || strstr(lower, "openwrt") ||
        strstr(lower, "tplink") || strstr(lower, "tp-link") || strstr(lower, "dlink") ||
        strstr(lower, "d-link") || strstr(lower, "netgear") || strstr(lower, "linksys") ||
        strstr(lower, "mercury") || strstr(lower, "tenda") || strstr(lower, "totolink") ||
        strstr(lower, "fast") || strstr(lower, "miwifi") || strstr(lower, "ikuai") ||
        strstr(lower, "phicomm") || strstr(lower, "gl-inet") || strstr(lower, "gl.inet") ||
        strstr(lower, "repeater") || strstr(lower, "extender") ||
        strstr(lower, "ap-") || strstr(lower, "-ap")) {
        return "router";
    }

    if (strstr(lower, "iphone") || strstr(lower, "ipad") || strstr(lower, "android") ||
        strstr(lower, "phone") || strstr(lower, "mobile") ||
        strstr(lower, "huawei") || strstr(lower, "honor") || strstr(lower, "xiaomi") ||
        strstr(lower, "redmi") || strstr(lower, "oppo") || strstr(lower, "vivo") ||
        strstr(lower, "oneplus") || strstr(lower, "samsung") || strstr(lower, "meizu") ||
        strstr(lower, "realme") || strstr(lower, "iqoo") || strstr(lower, "galaxy") ||
        strstr(lower, "pad") || strstr(lower, "tab") ||
        strstr(lower, "yi-jia") || strstr(lower, "yijia") || strstr(lower, "smart")) {
        return "mobile";
    }

    return "laptop";
}

static void append_devices(struct buffer *b)
{
    struct device devices[MAX_DEVICES];
    int count = load_devices(devices, MAX_DEVICES);
    int active = 0;

    for (int i = 0; i < count; i++) {
        if (devices[i].active) {
            active++;
        }
    }

    buf_printf(b, "\"devices\":{\"total\":%d,\"active\":%d,\"list\":[", count, active);
    for (int i = 0; i < count; i++) {
        if (i) buf_append(b, ",");
        buf_append(b, "{");
        json_key_string(b, "mac", devices[i].mac);
        buf_append(b, ",");
        json_key_string(b, "ip", devices[i].ip);
        buf_append(b, ",");
        json_key_string(b, "name", devices[i].name[0] ? devices[i].name : devices[i].ip);
        buf_append(b, ",\"type\":");
        json_string(b, determine_device_type(devices[i].name));
        buf_append(b, ",\"active\":");
        buf_append(b, devices[i].active ? "true" : "false");
        buf_append(b, "}");
    }
    buf_append(b, "]}");
}


#define HASH_SIZE 4096

struct domain_node {
    char domain[128];
    int count;
    int last_seen;
    struct domain_node *next;
};

struct ip_domain_node {
    char domain[128];
    int weight;
    struct ip_domain_node *next;
};

struct ip_node {
    char ip[64];
    struct ip_domain_node *domains;
    struct ip_node *next;
};

struct client_node {
    char ip[64];
    struct client_node *next;
};

struct realtime_node {
    char domain[128];
    int count;
    int last_seen;
    int devices;
    struct client_node *clients;
    struct realtime_node *next;
};

struct app_node {
    char name[64];
    char class_name[64];
    int hits;
    int latest_seq;
    struct app_node *next;
};

struct app_rule {
    const char *app;
    const char *class_name;
    const char *pattern;
};

static const struct app_rule APP_RULES[] = {
    {"12306", "others", "12306.cn"},
    {"1688", "shopping", "1688.com"},
    {"17173游戏", "game", "17173.com"},
    {"1905电影", "video", "douban"},
    {"1905电影", "video", "movie"},
    {"1905电影", "video", "movie.douban.com"},
    {"1号店", "shopping", "yhd"},
    {"1号店", "shopping", "yhd.com"},
    {"2345", "developer", "m.2345.com"},
    {"2345", "developer", "www.2345.com"},
    {"2345游戏", "game", "wan"},
    {"2345游戏", "game", "wan.2345.com"},
    {"360文库", "developer", "so"},
    {"360文库", "developer", "wenku"},
    {"360文库", "developer", "wenku.so.com"},
    {"37网游", "game", "37.com"},
    {"4366页游", "game", "381pk"},
    {"4366页游", "game", "4366yy"},
    {"4366页游", "game", "4366yy.381pk.com"},
    {"4399游戏", "game", "4399.com"},
    {"51游戏", "game", "www.51.com"},
    {"58同城", "others", "58.com"},
    {"7k7k游戏", "game", "7k7k"},
    {"7k7k游戏", "game", "7k7k.com"},
    {"9377游戏", "game", "www.9377.com"},
    {"阿里云盘", "download", "aliyundrive"},
    {"艾米直播", "video", "imifun"},
    {"艾米直播", "video", "imifun.com"},
    {"爱卡汽车", "developer", "xcar"},
    {"爱卡汽车", "developer", "xcar.com.cn"},
    {"爱奇艺", "video", "71edge"},
    {"爱奇艺", "video", "inter"},
    {"爱奇艺", "video", "inter.71edge.com"},
    {"爱奇艺", "video", "iqiyi"},
    {"爱奇艺", "video", "qy"},
    {"爱奇艺", "video", "qy.net"},
    {"爱奇艺", "video", "videos"},
    {"爱企查", "developer", "aiqicha"},
    {"爱企查", "developer", "aiqicha.baidu.com"},
    {"安徽电视台", "video", "ahtv"},
    {"安徽电视台", "video", "ahtv.cn"},
    {"安居客", "others", "anjuke"},
    {"安居客", "others", "anjuke.com"},
    {"百度", "developer", "baidu"},
    {"百度", "developer", "m.baidu.com"},
    {"百度", "developer", "www.baidu.com"},
    {"百度贴吧", "developer", "tieba"},
    {"百度贴吧", "developer", "tieba.baidu.com"},
    {"百度文库", "developer", "wenku"},
    {"百度文库", "developer", "wenku.baidu.com"},
    {"百度页游", "game", "wan"},
    {"百度页游", "game", "wan.baidu.com"},
    {"百度游戏", "game", "wan"},
    {"百度游戏", "game", "wan.baidu.com"},
    {"百度知道", "developer", "zhidao"},
    {"百度知道", "developer", "zhidao.baidu.com"},
    {"百度直播", "video", "baidu"},
    {"百度直播", "video", "live"},
    {"百度直播", "video", "live.baidu.com"},
    {"保卫萝卜4", "game", "luobo"},
    {"保卫萝卜4", "game", "s4.luobo.cn"},
    {"爆米花视频", "video", "baomihua"},
    {"爆米花视频", "video", "baomihua.com"},
    {"北京银行", "others", "bankofbeijing"},
    {"必应", "developer", "bing"},
    {"必应", "developer", "bing.com"},
    {"哔哩哔哩", "video", "biliapi"},
    {"哔哩哔哩", "video", "biliapi.net"},
    {"哔哩哔哩", "video", "bilibili"},
    {"哔哩哔哩", "video", "bilibili.com"},
    {"哔哩哔哩", "video", "bilivideo"},
    {"哔哩哔哩", "video", "data.bilibili.com"},
    {"哔哩哔哩", "video", "hdslb"},
    {"哔哩哔哩", "video", "hdslb.com"},
    {"缤客", "developer", "booking"},
    {"缤客", "developer", "booking.com"},
    {"冰雪打金", "game", "caihong"},
    {"冰雪打金", "game", "caihong.com"},
    {"波波视频", "video", "miaopai"},
    {"播聊", "video", "5glive"},
    {"播聊", "video", "randlove"},
    {"播聊", "video", "randlove.cn"},
    {"播聊", "video", "yueliao"},
    {"唱吧", "music", "changba"},
    {"唱吧", "music", "changba.com"},
    {"唱鸭", "video", "singduck"},
    {"唱鸭", "video", "singduck.cn"},
    {"传奇页游", "game", "381pk"},
    {"传奇页游", "game", "381pk.com"},
    {"大街网", "social", "dajie"},
    {"大街网", "social", "dajie.com"},
    {"当当网", "shopping", "dangdang"},
    {"当当网", "shopping", "dangdang.com"},
    {"地下城与勇士", "game", "dnf"},
    {"地下城与勇士", "game", "dnf.qq.com"},
    {"地下城与勇士", "game", "dnfm"},
    {"地下城与勇士", "game", "dnfm.qq.com"},
    {"嘀哩嘀哩", "video", "dilidili"},
    {"嘀哩嘀哩", "video", "dilidili.io"},
    {"第五人格", "game", "id5"},
    {"第五人格", "game", "id5.163.com"},
    {"第五人格", "game", "identityv"},
    {"第五人格", "game", "identityvgame.com"},
    {"第一财经", "developer", "yicai"},
    {"第一财经", "developer", "yicai.com"},
    {"第一视频", "video", "v1"},
    {"第一视频", "video", "www.v1.cn"},
    {"叮咚买菜", "shopping", "ddxq"},
    {"叮咚买菜", "shopping", "ddxq.mobi"},
    {"叮咚买菜", "shopping", "mobi"},
    {"钉钉", "social", "dingtalk"},
    {"动漫之家", "others", "dmzj"},
    {"动漫之家", "others", "dmzj.com"},
    {"抖音", "video", "amemv"},
    {"抖音", "video", "amemv.com"},
    {"抖音", "video", "douyin"},
    {"抖音", "video", "douyincdn"},
    {"抖音", "video", "ecombdapi"},
    {"抖音", "video", "ecombdapi.com"},
    {"抖音", "video", "pstatp"},
    {"抖音", "video", "pstatp.com"},
    {"抖音", "video", "pull"},
    {"抖音", "video", "pull*.douyincdn.com"},
    {"抖音", "video", "volcsirius"},
    {"抖音", "video", "volcsirius.com"},
    {"抖音商城", "shopping", "ecombdimg"},
    {"抖音商城", "shopping", "ecombdimg.com"},
    {"斗米", "social", "doumi"},
    {"斗鱼", "video", "douyu"},
    {"豆瓣", "others", "douban"},
    {"豆瓣", "others", "douban.com"},
    {"豆瓣电影", "video", "1905.com"},
    {"豆瓣FM", "music", "douban"},
    {"豆瓣FM", "music", "douban.fm"},
    {"豆瓣FM", "music", "fm"},
    {"豆丁", "developer", "docin"},
    {"豆丁", "developer", "docin.com"},
    {"度小视", "video", "baidu"},
    {"度小视", "video", "quanmin"},
    {"度小视", "video", "quanmin.baidu.com"},
    {"多闪", "social", "ppkankan"},
    {"饿了么", "shopping", "eleme"},
    {"饿了么", "others", "eleme.com"},
    {"翻咔", "video", "finka"},
    {"翻咔", "video", "finka.cn"},
    {"房天下", "others", "fang"},
    {"房天下", "others", "fang.com"},
    {"飞书", "social", "feishu"},
    {"飞书", "social", "feishu.cn"},
    {"飞猪", "others", "fliggy"},
    {"飞猪", "others", "fliggy.com"},
    {"风行视频", "video", "funshion"},
    {"凤凰网", "developer", "ifeng"},
    {"凤凰网", "developer", "ifeng.com"},
    {"赶集网", "social", "58.com"},
    {"赶集网", "social", "58cdn"},
    {"谷歌", "developer", "google"},
    {"谷歌", "developer", "google.com"},
    {"光明网", "developer", "gmw"},
    {"光明网", "developer", "www.gmw.cn"},
    {"光遇", "game", "ma75.proxima.nie.netease"},
    {"光遇", "game", "ma75.update.netease.com"},
    {"国际在线", "developer", "cri"},
    {"国际在线", "developer", "www.cri.cn"},
    {"国美", "shopping", "gome"},
    {"国美", "shopping", "gome.com"},
    {"哈利波特", "game", "g92.proxima"},
    {"哈利波特", "game", "proxima"},
    {"韩剧TV", "video", "hanju"},
    {"韩剧TV", "video", "hanju.koudaibaobao"},
    {"韩剧TV", "video", "koudaibaobao"},
    {"好省", "shopping", "hzhstb"},
    {"好省", "shopping", "hzhstb.com"},
    {"和讯", "developer", "hexun"},
    {"和讯", "developer", "hexun.com"},
    {"红警OL", "game", "hj.qq.com"},
    {"红警OL", "game", "hjol"},
    {"红警OL", "game", "hjol.qq.com"},
    {"红警OL", "game", "redalert"},
    {"红警OL", "game", "redalert.qq.com"},
    {"虎扑体育", "developer", "hupu"},
    {"虎扑体育", "developer", "hupu.com"},
    {"虎牙直播", "video", "huya"},
    {"花椒直播", "video", "huajiao"},
    {"华数TV", "video", "wasu"},
    {"华数TV", "video", "wasu.cn"},
    {"华为官网", "developer", "huawei"},
    {"华为官网", "developer", "www.huawei.com"},
    {"华为商城", "developer", "vmall"},
    {"华为商城", "developer", "www.vmall.com"},
    {"华为云", "download", "cloud"},
    {"华为云", "download", "cloud.huawei.com"},
    {"华为云", "download", "hicloud"},
    {"华为云", "download", "hicloud.com"},
    {"华为云", "download", "huawei"},
    {"华为云", "download", "myhuaweicloud"},
    {"华为云", "download", "myhuaweicloud.cn"},
    {"欢乐斗地主", "game", "huanle.qq.com"},
    {"皇室战争", "game", "clashroyale"},
    {"皇室战争", "game", "clashroyale.com"},
    {"皇室战争", "game", "supercell"},
    {"皇室战争", "game", "supercell.com"},
    {"坚果云", "download", "jianguoyun"},
    {"建设银行", "others", "ccb"},
    {"建设银行", "others", "ccb.com"},
    {"江苏卫视", "video", "jstv"},
    {"江苏卫视", "video", "tv.jstv.com"},
    {"交通银行", "others", "bankcomm"},
    {"交通银行", "others", "bankcomm.com"},
    {"京东", "shopping", "300hu"},
    {"京东", "shopping", "360buyimg"},
    {"京东", "shopping", "jd"},
    {"京东", "shopping", "jd.com"},
    {"京东", "shopping", "jdcdn"},
    {"京东", "shopping", "jdcdn.com"},
    {"京东", "shopping", "vod"},
    {"京东", "shopping", "vod.300hu.com"},
    {"京东钱包", "others", "jdpay"},
    {"京东钱包", "others", "jdpay.com"},
    {"晶核", "game", "dailygn"},
    {"晶核", "game", "dailygn.com"},
    {"竞彩网", "developer", "sporttery"},
    {"竞彩网", "developer", "www.sporttery.cn"},
    {"酒仙网", "shopping", "jiuxian"},
    {"酒仙网", "shopping", "jiuxian.com"},
    {"开心消消乐", "game", "happyelements"},
    {"看准", "social", "kanzhun"},
    {"看准", "social", "kanzhun.com"},
    {"考拉海购", "shopping", "kaola"},
    {"酷6网", "video", "ku6"},
    {"酷6网", "video", "www.ku6.com"},
    {"酷狗短酷", "video", "bssdl"},
    {"酷狗短酷", "video", "bssdl.kugou"},
    {"酷狗短酷", "video", "kugou"},
    {"酷狗音乐", "music", "fanxing"},
    {"酷狗音乐", "music", "kgimg"},
    {"酷狗音乐", "music", "kugou"},
    {"酷狗直播", "video", "kgimg"},
    {"酷狗直播", "video", "kgimg.com"},
    {"酷狗直播", "video", "kugou"},
    {"酷狗直播", "video", "rt-m"},
    {"酷狗直播", "video", "rt-m.kugou"},
    {"酷米网", "video", "kumi"},
    {"酷米网", "video", "kumi.cn"},
    {"酷我音乐", "music", "kuwo"},
    {"酷我音乐", "music", "kuwo.cn"},
    {"狂野飙车", "game", "asphalt9"},
    {"拉勾网", "social", "lagou"},
    {"拉勾网", "social", "lagou.com"},
    {"蓝奏云", "download", "lanzou"},
    {"蓝奏云", "download", "pan"},
    {"蓝奏云", "download", "pan.lanzou.com"},
    {"懒人听书", "music", "lrts"},
    {"懒人听书", "music", "lrts.me"},
    {"狼人杀", "game", "fp"},
    {"狼人杀", "game", "lrs"},
    {"狼人杀", "game", "lrs.fp"},
    {"狼人杀", "game", "ma77"},
    {"乐逗游戏", "game", "uu"},
    {"乐逗游戏", "game", "uu.cc"},
    {"乐嗨秀场", "video", "ehaitv"},
    {"乐嗨秀场", "video", "ehaitv.com"},
    {"乐视视频", "video", "le"},
    {"乐视视频", "video", "www.le.com"},
    {"梨视频", "video", "pearvideo"},
    {"梨视频", "video", "pearvideo.com"},
    {"荔枝网", "video", "gdtv"},
    {"荔枝网", "video", "gdtv.com.cn"},
    {"恋与深空", "game", "papegames"},
    {"恋与深空", "game", "papegames.com"},
    {"链家", "others", "lianjia"},
    {"链家", "others", "lianjia.com"},
    {"猎聘", "social", "liepin"},
    {"领英", "social", "linkedin"},
    {"六间房", "video", "v.6.cn"},
    {"龙珠直播", "video", "longzhu"},
    {"龙珠直播", "video", "longzhu.com"},
    {"炉石传说", "game", "blizzard"},
    {"炉石传说", "game", "hearthstone"},
    {"炉石传说", "game", "hearthstone.com"},
    {"炉石传说", "game", "hearthstone.com.cn"},
    {"炉石传说", "game", "hs.blizzard.cn"},
    {"驴妈妈", "developer", "lvmama"},
    {"驴妈妈", "developer", "lvmama.com"},
    {"率土之滨", "game", "stzb"},
    {"率土之滨", "game", "stzb.163.com"},
    {"率土之滨", "game", "stzb163.com"},
    {"马蜂窝", "others", "mafengwo"},
    {"马蜂窝", "others", "mafengwo.cn"},
    {"芒果tv", "video", "hitv"},
    {"芒果tv", "video", "mgtv"},
    {"猫和老鼠", "game", "h18*.netease.com"},
    {"猫扑", "developer", "mop"},
    {"猫扑", "developer", "mop.com"},
    {"美团", "others", "meituan"},
    {"梦幻西游", "game", "g18.proxima.nie"},
    {"梦想城镇", "game", "playrix"},
    {"咪咕视频", "video", "migu"},
    {"咪咕视频", "video", "migu.cn"},
    {"咪咕视频", "video", "miguvideo"},
    {"迷你世界", "game", "mini1"},
    {"迷你世界", "game", "mini1.cn"},
    {"明日之后", "game", "g66.update.netease"},
    {"蘑菇街", "shopping", "mogucdn"},
    {"蘑菇街", "shopping", "mogujie"},
    {"陌陌", "social", "momo"},
    {"南瓜电影", "video", "vcinema"},
    {"南瓜电影", "video", "vcinema.cn"},
    {"农业银行", "others", "abchina"},
    {"农业银行", "others", "abchina.com"},
    {"派派", "social", "ifreetalk"},
    {"派派", "social", "ifreetalk.com"},
    {"跑跑卡丁车", "game", "kartdrift"},
    {"跑跑卡丁车", "game", "kartdrift.com"},
    {"跑跑卡丁车", "game", "popkart"},
    {"跑跑卡丁车", "game", "popkart.tiancity.com"},
    {"拼多多", "shopping", "cdntip"},
    {"拼多多", "shopping", "pinduoduo"},
    {"拼多多", "shopping", "s1p"},
    {"拼多多", "shopping", "s1p.cdntip.com"},
    {"拼多多", "shopping", "yangkeduo"},
    {"拼多多", "shopping", "yangkeduo.com"},
    {"平安银行", "others", "pingan"},
    {"平安银行", "others", "pingan.com.cn"},
    {"苹果官网", "developer", "apple"},
    {"苹果官网", "developer", "www.apple.com"},
    {"朴朴超市", "shopping", "pupuapi"},
    {"朴朴超市", "shopping", "pupumall"},
    {"浦发银行", "others", "spdb"},
    {"浦发银行", "others", "spdb.com.cn"},
    {"企鹅电竞", "video", "egame"},
    {"企鹅电竞", "video", "egame.qq"},
    {"企鹅电竞", "video", "liveplay"},
    {"企鹅电竞", "video", "pggame"},
    {"企鹅电竞", "video", "qq"},
    {"汽车之家", "others", "autohome"},
    {"汽车之家", "others", "autohome.com.cn"},
    {"千千音乐", "music", "music.taihe.com"},
    {"千千音乐", "music", "taihe"},
    {"前程无忧", "social", "51job"},
    {"穷游网", "developer", "qyer"},
    {"穷游网", "developer", "qyer.com"},
    {"求是网", "developer", "qstheory"},
    {"求是网", "developer", "qstheory.cn"},
    {"全景网", "developer", "p5w"},
    {"全景网", "developer", "p5w.net"},
    {"人民网", "developer", "people"},
    {"人民网", "developer", "people.com.cn"},
    {"人民银行", "others", "pbc"},
    {"人民银行", "others", "pbc.gov.cn"},
    {"人人视频", "video", "rr"},
    {"人人视频", "video", "rr.tv"},
    {"三角洲&穿越火线", "game", "cf"},
    {"三角洲&穿越火线", "game", "cf.qq.com"},
    {"三角洲&穿越火线", "game", "deltaforcegame"},
    {"三角洲&穿越火线", "game", "deltaforcegame.com"},
    {"三角洲&穿越火线", "game", "df.qq.com"},
    {"山东电视台", "video", "iqilu"},
    {"山东电视台", "video", "v.iqilu.com"},
    {"上海银行", "others", "bosc"},
    {"上海银行", "others", "bosc.cn"},
    {"什么值得买", "shopping", "smzdm"},
    {"什么值得买", "shopping", "smzdm.com"},
    {"神都夜行录", "game", "sd.163"},
    {"神都夜行录", "game", "sd.163.com"},
    {"神都夜行录", "game", "shendu"},
    {"神都夜行录", "game", "shendu.163.com"},
    {"识货", "shopping", "shihuo"},
    {"实习僧", "social", "shixiseng"},
    {"实习僧", "social", "shixiseng.com"},
    {"搜狗拼音", "others", "pinyin"},
    {"搜狗拼音", "others", "pinyin.sogou.com"},
    {"搜狗拼音", "others", "sogou"},
    {"搜狐", "developer", "m.sohu.com"},
    {"搜狐", "developer", "sohu"},
    {"搜狐", "developer", "www.sohu.com"},
    {"搜狐视频", "video", "aty"},
    {"搜狐视频", "video", "aty.sohu.com"},
    {"搜狐视频", "video", "itc"},
    {"搜狐视频", "video", "sohu"},
    {"搜狐视频", "video", "tv.itc.cn"},
    {"搜视网", "video", "tvsou"},
    {"搜视网", "video", "www.tvsou.com"},
    {"苏宁易购", "shopping", "suning"},
    {"太平洋电脑", "developer", "pconline"},
    {"太平洋电脑", "developer", "www.pconline.com.cn"},
    {"太平洋汽车", "developer", "pcauto"},
    {"太平洋汽车", "developer", "pcauto.com.cn"},
    {"坦克世界", "game", "wot"},
    {"坦克世界", "game", "wot.360.cn"},
    {"探探", "social", "tancdn"},
    {"探探", "social", "tantanapp"},
    {"淘宝", "shopping", "alicdn"},
    {"淘宝", "shopping", "alicdn.com"},
    {"淘宝", "shopping", "taobao"},
    {"淘宝", "shopping", "tmall"},
    {"淘宝", "shopping", "tmall.com"},
    {"腾讯加速器", "game", "acc"},
    {"腾讯加速器", "game", "m.acc.qq.com"},
    {"腾讯微云", "download", "aegis"},
    {"腾讯微云", "download", "aegis.qq.com"},
    {"腾讯微云", "download", "pingtas"},
    {"腾讯微云", "download", "pingtas.qq.com"},
    {"腾讯微云", "download", "weiyun"},
    {"腾讯微云", "download", "weiyun.com"},
    {"腾讯智影", "developer", "zenvideo"},
    {"腾讯智影", "developer", "zenvideo.qq.com"},
    {"体育彩票", "developer", "lottery"},
    {"体育彩票", "developer", "lottery.gov.cn"},
    {"天涯明月刀", "game", "ty.qq"},
    {"天涯明月刀", "game", "ty.qq.com"},
    {"天涯明月刀", "game", "wuxia"},
    {"天涯明月刀", "game", "wuxia.qq.com"},
    {"天涯社区", "developer", "tianya"},
    {"天涯社区", "developer", "tianya.cn"},
    {"天眼查", "others", "tianyancha"},
    {"天眼查", "others", "tianyancha.com"},
    {"天翼云盘", "download", "ctyunapi"},
    {"同城急聘", "social", "xiaomei"},
    {"途牛", "others", "tuniu"},
    {"途牛", "others", "tuniu.com"},
    {"王者荣耀", "game", "honorofkings"},
    {"王者荣耀", "game", "honorofkings.com"},
    {"王者荣耀", "game", "pvp"},
    {"王者荣耀", "game", "pvp.qq.com"},
    {"王者荣耀", "game", "sgame"},
    {"王者荣耀更新", "download", "sgame"},
    {"王者荣耀更新", "download", "sgame.qq.com"},
    {"王者荣耀更新", "download", "sgupdate.qq.com"},
    {"网易", "developer", "www.126.com"},
    {"网易", "developer", "www.163.com"},
    {"网易严选", "shopping", "yanxuan"},
    {"网易云音乐", "music", "music.126"},
    {"网易云音乐", "music", "music.163"},
    {"微博", "social", "weibo"},
    {"微店", "shopping", "weidian"},
    {"微信", "social", "weixin"},
    {"微信", "social", "weixin.qq"},
    {"唯品会", "shopping", "appsimg"},
    {"唯品会", "shopping", "appsimg.com"},
    {"唯品会", "shopping", "vip"},
    {"唯品会", "shopping", "vip.com"},
    {"唯品会", "shopping", "vips-mobile"},
    {"唯品会", "shopping", "vipshop"},
    {"唯品会", "shopping", "vipstatic"},
    {"唯品会", "shopping", "vipstatic.com"},
    {"我的世界", "game", "g79mclobt.nie.netease"},
    {"我的世界", "game", "mc"},
    {"我的世界", "game", "mc*.netease"},
    {"我的世界", "game", "netease"},
    {"我的世界", "game", "x19*.netease.com"},
    {"我叫MT4", "game", "dir"},
    {"我叫MT4", "game", "dir.mt4.qq.com"},
    {"我叫MT4", "game", "mt4"},
    {"我秀", "video", "oxiu"},
    {"我秀", "video", "oxiu.com"},
    {"西瓜视频", "video", "bdxigua"},
    {"西瓜视频", "video", "ixigua"},
    {"西瓜视频", "video", "snsdk"},
    {"西瓜视频", "video", "xg-p"},
    {"西瓜视频", "video", "xg-p.ixigua"},
    {"喜马拉雅", "music", "ximalaya"},
    {"喜马拉雅", "music", "ximalaya.com"},
    {"虾米音乐", "music", "xiami"},
    {"闲鱼", "shopping", "xianyu"},
    {"向日葵", "download", "oray"},
    {"向日葵", "download", "oray.com"},
    {"向日葵", "download", "oray.net"},
    {"潇湘书院", "developer", "xxsy"},
    {"潇湘书院", "developer", "xxsy.net"},
    {"小爱音箱", "others", "ai.xiaomi.com"},
    {"小爱音箱", "others", "mina.mi.com"},
    {"小度互娱", "video", "xiaodutv"},
    {"小度互娱", "video", "xiaodutv.com"},
    {"小黑盒", "game", "max-c"},
    {"小黑盒", "game", "max-c.com"},
    {"小黑盒", "game", "xiaoheihe"},
    {"小黑盒", "game", "xiaoheihe.cn"},
    {"小红书", "video", "xhscdn"},
    {"小红书", "video", "xiaohongshu"},
    {"小米官网", "developer", "mi.com"},
    {"小米官网", "developer", "www.mi.com"},
    {"小米有品", "shopping", "youpin.com"},
    {"小米有品", "shopping", "shopapi"},
    {"小米有品", "shopping", "shopapi.io.mi.com"},
    {"小米有品", "shopping", "youpin"},
    {"小森生活", "game", "xssh"},
    {"小森生活", "game", "xssh.qq"},
    {"小象优品", "shopping", "xiaoxiangyoupin"},
    {"小镇大厨", "game", "adjust"},
    {"小镇大厨", "game", "adjust.cn"},
    {"小镇大厨", "game", "fineboost"},
    {"小镇大厨", "game", "fineboost.cn"},
    {"小镇大厨", "game", "go2s"},
    {"小镇大厨", "game", "go2s.co"},
    {"新华网", "developer", "xinhuanet"},
    {"新华网", "developer", "xinhuanet.com"},
    {"新浪", "developer", "m.sina.com"},
    {"新浪", "developer", "sina"},
    {"新浪", "developer", "www.sina.com"},
    {"新浪彩票", "developer", "lottery"},
    {"新浪彩票", "developer", "lottery.sina.com.cn"},
    {"新浪彩票", "developer", "sina"},
    {"新浪视频", "video", "sina"},
    {"新浪视频", "video", "video.sina.com.cn"},
    {"新浪体育", "developer", "sina"},
    {"新浪体育", "developer", "sports"},
    {"新浪体育", "developer", "sports.sina.com.cn"},
    {"兴业银行", "others", "cib"},
    {"兴业银行", "others", "cib.com.cn"},
    {"迅游加速器", "game", "mobi"},
    {"迅游加速器", "game", "xunyou"},
    {"迅游加速器", "game", "xunyou.mobi"},
    {"亚马逊", "shopping", "amazon"},
    {"亚马逊", "shopping", "amazon.cn"},
    {"央视频", "video", "cctv"},
    {"央视频", "video", "cctv.cn"},
    {"央视频", "video", "cntv"},
    {"央视频", "video", "yangshi"},
    {"央视网", "developer", "cctv"},
    {"央视网", "developer", "www.cctv.com"},
    {"一刀传世", "game", "ydcs"},
    {"一刀传世", "game", "ydcs.37.com"},
    {"一刻短剧", "video", "contentchina"},
    {"一刻短剧", "video", "contentchina.com"},
    {"伊对", "social", "520yidui"},
    {"宜家家居", "shopping", "ikea"},
    {"宜家家居", "shopping", "ikea.cn"},
    {"易车网", "developer", "bitauto"},
    {"易车网", "developer", "bitauto.com"},
    {"音乐随心听", "music", "fm"},
    {"音乐随心听", "music", "fm.taihe.com"},
    {"音乐随心听", "music", "taihe"},
    {"音悦台", "music", "yinyuetai"},
    {"音悦台", "music", "yinyuetai.com"},
    {"银联在线", "others", "95516.com"},
    {"应届生求职", "social", "yingjiesheng"},
    {"应届生求职", "social", "yingjiesheng.com"},
    {"英雄联盟手游", "game", "lolm"},
    {"英雄联盟手游", "game", "lolm.qq.com"},
    {"英雄联盟手游", "game", "wildrift"},
    {"英雄联盟手游", "game", "wildrift.leagueoflegends.com"},
    {"萤石云", "others", "ys7"},
    {"萤石云", "others", "ys7.com"},
    {"映客直播", "video", "inke"},
    {"映客直播", "video", "inke.cn"},
    {"优酷", "video", "ykimg"},
    {"优酷", "video", "youku"},
    {"邮政储蓄", "others", "psbc"},
    {"邮政储蓄", "others", "psbc.com"},
    {"游民星空", "game", "gamersky"},
    {"游民星空", "game", "gamersky.com"},
    {"游侠网", "game", "ali213"},
    {"游侠网", "game", "ali213.net"},
    {"有道词典", "others", "dict"},
    {"有道词典", "others", "dict.youdao.com"},
    {"有道词典", "others", "youdao"},
    {"元梦之星", "game", "qq"},
    {"元梦之星", "game", "ymzx"},
    {"元梦之星", "game", "ymzx.qq.com"},
    {"原神", "game", "yuanshen"},
    {"原神", "game", "yuanshen.com"},
    {"云原神", "game", "mihoyo"},
    {"云原神", "game", "ys"},
    {"云原神", "game", "ys.mihoyo.com"},
    {"战舰世界", "game", "wows"},
    {"战舰世界", "game", "wows.360.cn"},
    {"掌阅", "others", "ireader"},
    {"掌阅", "others", "ireader.com"},
    {"掌阅", "others", "zhangyue"},
    {"招商银行", "others", "cmbchina"},
    {"招商银行", "others", "cmbchina.com"},
    {"折800", "shopping", "zhe800"},
    {"折800", "shopping", "zhe800.com"},
    {"浙江卫视", "video", "zjstv"},
    {"浙江卫视", "video", "zjstv.com"},
    {"支付宝", "social", "alipay"},
    {"支付宝", "social", "alipay.com"},
    {"支付宝", "social", "alipayobjects"},
    {"支付宝", "social", "alipayobjects.com"},
    {"支付宝", "social", "alive"},
    {"支付宝", "social", "alive.alipay.com"},
    {"知乎", "others", "zhihu"},
    {"知乎", "others", "zhihu.com"},
    {"知网", "developer", "cnki"},
    {"知网", "developer", "www.cnki.net"},
    {"智联招聘", "social", "zhaopin"},
    {"中彩网", "developer", "zhcw"},
    {"中彩网", "developer", "zhcw.com"},
    {"中国电信", "developer", "www.189.cn"},
    {"中国福利彩", "developer", "cwl"},
    {"中国福利彩", "developer", "www.cwl.gov.cn"},
    {"中国联通", "developer", "www.10010.com"},
    {"中国移动", "developer", "www.10086.cn"},
    {"中国银行", "others", "boc"},
    {"中国银行", "others", "boc.cn"},
    {"中华网", "developer", "china"},
    {"中华网", "developer", "www.china.com"},
    {"中华英才网", "social", "chinahr"},
    {"中华英才网", "social", "chinahr.com"},
    {"中经网", "developer", "ce"},
    {"中经网", "developer", "www.ce.cn"},
    {"中青网", "developer", "www.youth.cn"},
    {"中青网", "developer", "youth"},
    {"中信银行", "others", "citicbank"},
    {"中信银行", "others", "citicbank.com"},
    {"转转", "shopping", "zhuanstatic"},
    {"转转", "shopping", "zhuanzhuan"},
    {"最右", "video", "izuiyou"},
    {"Alipay", "shopping", "alipay.com"},
    {"Alipay", "shopping", "alipayobjects.com"},
    {"AliyunDrive", "cloud", "alipan.com"},
    {"AliyunDrive", "cloud", "aliyundrive.com"},
    {"AliyunDrive", "cloud", "aliyundrive.net"},
    {"Apple", "cloud", "apple.com"},
    {"Apple", "cloud", "icloud.com"},
    {"Apple", "cloud", "mzstatic.com"},
    {"AppStore", "download", "apple"},
    {"AppStore", "download", "itunes"},
    {"AppStore", "download", "itunes.apple.com"},
    {"Baidu", "search", "baidu.com"},
    {"Baidu", "search", "baidupcs.com"},
    {"Baidu", "search", "bdimg.com"},
    {"Baidu", "search", "bdstatic.com"},
    {"BBC", "developer", "bbc"},
    {"BBC", "developer", "www.bbc.com"},
    {"Bilibili", "video", "bilibili.com"},
    {"Bilibili", "video", "bilivideo.com"},
    {"Bing", "search", "bing.com"},
    {"Bing", "search", "bing.net"},
    {"biubiu加速器", "game", "biubiu001"},
    {"biubiu加速器", "game", "biubiu001.com"},
    {"boss直聘", "social", "zhipin"},
    {"boss直聘", "social", "zhipin.com"},
    {"CCTV", "video", "cctv.com"},
    {"CCTV", "video", "cctvpic.com"},
    {"CCTV", "video", "cntv.cn"},
    {"cctv5", "developer", "cctv"},
    {"cctv5", "developer", "sports"},
    {"cctv5", "developer", "sports.cctv.com"},
    {"DingTalk", "social", "dingtalk.com"},
    {"DingTalk", "social", "dingtalkapps.com"},
    {"Discord", "social", "discord.com"},
    {"Discord", "social", "discord.gg"},
    {"DJ嗨嗨网", "video", "7idj"},
    {"DJ嗨嗨网", "video", "7idj.com"},
    {"Douban", "social", "douban.com"},
    {"Douban", "social", "doubanio.com"},
    {"Douyin", "social", "amemv.com"},
    {"Douyin", "social", "bytegecko.com"},
    {"Douyin", "social", "douyin.com"},
    {"Douyin", "social", "douyincdn.com"},
    {"Douyin", "social", "douyinvod.com"},
    {"Douyin", "social", "ndcpp.com"},
    {"Douyin", "social", "snssdk.com"},
    {"Douyin", "social", "starrydyn.com"},
    {"Douyu", "video", "douyu.com"},
    {"Douyu", "video", "douyucdn.cn"},
    {"Douyu", "video", "douyutv.com"},
    {"Eleme", "shopping", "ele.me"},
    {"Eleme", "shopping", "elemecdn.com"},
    {"Feishu", "social", "feishu.cn"},
    {"Feishu", "social", "larksuite.com"},
    {"Genshin", "game", "hoyolab.com"},
    {"Genshin", "game", "hoyoverse.com"},
    {"Genshin", "game", "mihoyo.com"},
    {"gitee", "developer", "gitee"},
    {"gitee", "developer", "gitee.com"},
    {"github", "developer", "github"},
    {"github", "developer", "github.com"},
    {"GitHub", "developer", "github.com"},
    {"GitHub", "developer", "githubusercontent.com"},
    {"Google", "search", "google.com"},
    {"Google", "search", "googleapis.com"},
    {"Google", "search", "gstatic.com"},
    {"hao123", "developer", "hao123"},
    {"hao123", "developer", "m.hao123.com"},
    {"hao123", "developer", "www.hao123.com"},
    {"hao123手游", "game", "hao123"},
    {"hao123手游", "game", "sy"},
    {"hao123手游", "game", "sy.hao123.com"},
    {"hao123小游戏", "game", "hao123"},
    {"hao123小游戏", "game", "xyx"},
    {"hao123小游戏", "game", "xyx.hao123.com"},
    {"hao123页游", "game", "hao123"},
    {"hao123页游", "game", "wy"},
    {"hao123页游", "game", "wy.hao123.com"},
    {"hao123页游", "game", "wyyx"},
    {"hao123页游", "game", "wyyx.hao123.com"},
    {"hao123游戏", "game", "game.hao123.com"},
    {"hao123游戏", "game", "hao123"},
    {"HM", "shopping", "hm"},
    {"HM", "shopping", "measurement"},
    {"HM", "shopping", "measurement.com"},
    {"HM", "shopping", "www.hm.com"},
    {"Honor of Kings", "game", "pvp.qq.com"},
    {"Huya", "video", "huya.com"},
    {"Huya", "video", "huyacdn.com"},
    {"Huya", "video", "msstatic.com"},
    {"iQiyi", "video", "iqiyi.com"},
    {"iQiyi", "video", "iqiyipic.com"},
    {"iQiyi", "video", "qy.net"},
    {"IT之家", "developer", "ithome"},
    {"IT之家", "developer", "www.ithome.com"},
    {"JD", "shopping", "jd.com"},
    {"Kugou", "music", "kugou.com"},
    {"Kugou", "music", "kugou.net"},
    {"Lazada", "shopping", "lazada"},
    {"Lazada", "shopping", "lazada.com"},
    {"Meituan", "shopping", "dianping.com"},
    {"Meituan", "shopping", "meituan.com"},
    {"Meituan", "shopping", "meituan.net"},
    {"MGTV", "video", "hunantv.com"},
    {"MGTV", "video", "imgo.tv"},
    {"MGTV", "video", "mgtv.com"},
    {"Microsoft", "cloud", "live.com"},
    {"Microsoft", "cloud", "microsoft.com"},
    {"Microsoft", "cloud", "office.com"},
    {"NeteaseMusic", "music", "music.126.net"},
    {"NeteaseMusic", "music", "music.163.com"},
    {"Netflix", "video", "netflix.com"},
    {"Netflix", "video", "nflxvideo.net"},
    {"Pinduoduo", "shopping", "pddpic.com"},
    {"Pinduoduo", "shopping", "pinduoduo.com"},
    {"Pinduoduo", "shopping", "yangkeduo.com"},
    {"PlayStation", "game", "playstation.com"},
    {"PlayStation", "game", "psn"},
    {"QQ", "social", "qq.com"},
    {"QQ", "social", "qzone.qq.com"},
    {"QQ", "social", "smtcdns.com"},
    {"QQ", "social", "tencent.com"},
    {"QQ飞车", "game", "speed"},
    {"QQ飞车", "game", "speed.qq.com"},
    {"QQ飞车", "game", "speedm"},
    {"QQ飞车", "game", "speedm.qq.com"},
    {"QQ音乐", "music", "amobile"},
    {"QQ音乐", "music", "amobile.music.tc.qq.com"},
    {"QQ音乐", "music", "qq"},
    {"QQ音乐", "music", "qqmusic"},
    {"QQ音乐", "music", "tc"},
    {"QQMusic", "music", "music.tc.qq.com"},
    {"QQMusic", "music", "qqmusic.qq.com"},
    {"QQMusic", "music", "y.qq.com"},
    {"Soul", "social", "soulapp"},
    {"Steam", "game", "steampowered.com"},
    {"Steam", "game", "steamstatic.com"},
    {"Sunlogin", "cloud", "oray.com"},
    {"Sunlogin", "cloud", "sunlogin.net"},
    {"Taobao", "shopping", "alicdn.com"},
    {"Taobao", "shopping", "taobao.com"},
    {"Taobao", "shopping", "tbcache.com"},
    {"Taobao", "shopping", "tmall.com"},
    {"TeamViewer", "download", "teamviewer"},
    {"TeamViewer", "cloud", "teamviewer.com"},
    {"Telegram", "social", "t.me"},
    {"Telegram", "social", "telegram.org"},
    {"TikTok", "social", "byteoversea.com"},
    {"TikTok", "social", "musical.ly"},
    {"TikTok", "social", "tiktok.com"},
    {"uu加速器", "game", "mg"},
    {"uu加速器", "game", "mg.uu.163.com"},
    {"uu加速器", "game", "uu"},
    {"vimeo", "video", "vimeo"},
    {"vimeo", "video", "vimeo.com"},
    {"vivo官网", "developer", "vivo"},
    {"vivo官网", "developer", "www.vivo.com.cn"},
    {"vivo应用商店", "download", "apkappdefwsdl"},
    {"vivo应用商店", "download", "apkappdefwsdl.vivo"},
    {"vivo应用商店", "download", "appstore"},
    {"vivo应用商店", "download", "appstore.vivo"},
    {"vivo应用商店", "download", "vivo"},
    {"WeChat", "social", "qpic.cn"},
    {"WeChat", "social", "wechat.com"},
    {"WeChat", "social", "weixin.qq.com"},
    {"Weibo", "social", "sinaimg.cn"},
    {"Weibo", "social", "sinaimg.com"},
    {"Weibo", "social", "sinajs.cn"},
    {"Weibo", "social", "weibo.cn"},
    {"Weibo", "social", "weibo.com"},
    {"windows更新", "download", "microsoft"},
    {"windows更新", "download", "update.microsoft.com"},
    {"windows更新", "download", "windowsupdate"},
    {"windows更新", "download", "windowsupdate.com"},
    {"Xbox", "game", "xbox.com"},
    {"Xbox", "game", "xboxlive.com"},
    {"Xiaohongshu", "social", "xhscdn.com"},
    {"Xiaohongshu", "social", "xiaohongshu.com"},
    {"Xiaomi", "cloud", "miui.com"},
    {"Xiaomi", "cloud", "xiaomi.com"},
    {"Xigua", "video", "ixigua.com"},
    {"Xigua", "video", "xiguavideo.com"},
    {"Youku", "video", "ykimg.com"},
    {"Youku", "video", "youku.com"},
    {"YouTube", "video", "googlevideo.com"},
    {"YouTube", "video", "youtube.com"},
    {"YouTube", "video", "ytimg.com"},
    {"Zhihu", "social", "zhihu.com"},
    {"Zhihu", "social", "zhimg.com"},
    {NULL, NULL, NULL}
};

static struct domain_node *domain_hash_table[HASH_SIZE];
static struct ip_node *ip_hash_table[HASH_SIZE];
static struct realtime_node *realtime_hash_table[HASH_SIZE];
static struct app_node *app_hash_table[HASH_SIZE];
static int g_seq = 0;

static unsigned int hash_str(const char *str) {
    unsigned int hash = 5381;
    int c;
    while ((c = *str++))
        hash = ((hash << 5) + hash) + c;
    return hash % HASH_SIZE;
}

static void clear_hashes() {
    for (int i = 0; i < HASH_SIZE; i++) {
        struct domain_node *d = domain_hash_table[i];
        while (d) {
            struct domain_node *tmp = d;
            d = d->next;
            free(tmp);
        }
        domain_hash_table[i] = NULL;

        struct ip_node *ipn = ip_hash_table[i];
        while (ipn) {
            struct ip_node *tmp = ipn;
            struct ip_domain_node *dn = ipn->domains;
            while (dn) {
                struct ip_domain_node *dtmp = dn;
                dn = dn->next;
                free(dtmp);
            }
            ipn = ipn->next;
            free(tmp);
        }
        ip_hash_table[i] = NULL;

        struct realtime_node *rn = realtime_hash_table[i];
        while (rn) {
            struct realtime_node *tmp = rn;
            struct client_node *cn = rn->clients;
            while (cn) {
                struct client_node *ctmp = cn;
                cn = cn->next;
                free(ctmp);
            }
            rn = rn->next;
            free(tmp);
        }
        realtime_hash_table[i] = NULL;

        struct app_node *an = app_hash_table[i];
        while (an) {
            struct app_node *tmp = an;
            an = an->next;
            free(tmp);
        }
        app_hash_table[i] = NULL;
    }
}

static void record_app(const char *name, const char *class_name) {
    unsigned int h = hash_str(name);
    struct app_node *node = app_hash_table[h];
    while (node) {
        if (strcmp(node->name, name) == 0) {
            node->hits++;
            node->latest_seq = g_seq;
            return;
        }
        node = node->next;
    }
    node = malloc(sizeof(struct app_node));
    if (!node) return;
    strncpy(node->name, name, sizeof(node->name)-1);
    node->name[sizeof(node->name)-1] = '\0';
    strncpy(node->class_name, class_name, sizeof(node->class_name)-1);
    node->class_name[sizeof(node->class_name)-1] = '\0';
    node->hits = 1;
    node->latest_seq = g_seq;
    node->next = app_hash_table[h];
    app_hash_table[h] = node;
}

static bool is_ipv4_literal(const char *value)
{
    int d1, d2, d3, d4;
    char tail;
    return value && sscanf(value, "%d.%d.%d.%d%c", &d1, &d2, &d3, &d4, &tail) == 4 &&
           d1 >= 0 && d1 <= 255 && d2 >= 0 && d2 <= 255 &&
           d3 >= 0 && d3 <= 255 && d4 >= 0 && d4 <= 255;
}

struct dynamic_app_rule {
    char app[64];
    char class_name[64];
    char pattern[128];
};

static struct dynamic_app_rule *g_dynamic_rules = NULL;
static int g_dynamic_rules_count = 0;
static int g_dynamic_rules_cap = 0;

static void add_dynamic_rule(const char *app, const char *class_name, const char *pattern) {
    if (g_dynamic_rules_count >= g_dynamic_rules_cap) {
        g_dynamic_rules_cap = g_dynamic_rules_cap == 0 ? 128 : g_dynamic_rules_cap * 2;
        struct dynamic_app_rule *new_rules = realloc(g_dynamic_rules, g_dynamic_rules_cap * sizeof(struct dynamic_app_rule));
        if (!new_rules) return;
        g_dynamic_rules = new_rules;
    }
    struct dynamic_app_rule *r = &g_dynamic_rules[g_dynamic_rules_count++];
    strncpy(r->app, app, sizeof(r->app) - 1);
    r->app[sizeof(r->app) - 1] = '\0';
    strncpy(r->class_name, class_name, sizeof(r->class_name) - 1);
    r->class_name[sizeof(r->class_name) - 1] = '\0';
    strncpy(r->pattern, pattern, sizeof(r->pattern) - 1);
    r->pattern[sizeof(r->pattern) - 1] = '\0';
}

static bool wildcard_match(const char *pat, const char *str) {
    while (*pat) {
        if (*pat == '*') {
            while (*pat == '*') pat++;
            if (!*pat) return true;
            while (*str) {
                if (wildcard_match(pat, str)) return true;
                str++;
            }
            return false;
        } else {
            if (*pat != *str) return false;
            pat++;
            str++;
        }
    }
    return *str == '\0';
}

static bool match_pattern(const char *domain, const char *pattern) {
    if (!domain || !pattern) return false;
    
    // 若包含通配符，则采用现有的通配符模式匹配
    if (strchr(pattern, '*')) {
        const char *p = domain;
        while (*p) {
            if (wildcard_match(pattern, p)) {
                return true;
            }
            p++;
        }
        return false;
    }
    
    // 若不包含通配符，执行更安全的域名/子域名后缀匹配或独立的 label 关键词匹配
    size_t dom_len = strlen(domain);
    size_t pat_len = strlen(pattern);
    if (pat_len > dom_len) return false;
    
    // 1. 若 pattern 中包含 '.'（域名或子域名特征）
    if (strchr(pattern, '.')) {
        // 精确相等
        if (strcmp(domain, pattern) == 0) return true;
        // 子域名后缀匹配（如 mail.google.com 匹配 google.com）
        if (dom_len > pat_len && domain[dom_len - pat_len - 1] == '.' &&
            strcmp(domain + (dom_len - pat_len), pattern) == 0) {
            return true;
        }
        return false;
    }
    
    // 2. 若 pattern 不包含 '.'，说明它是一个关键词。我们要求它必须是 domain 中的一个完整 label（如 www.baidu.com 中的 baidu）
    const char *p = domain;
    while (p) {
        const char *next_dot = strchr(p, '.');
        size_t label_len = next_dot ? (size_t)(next_dot - p) : strlen(p);
        if (label_len == pat_len && strncmp(p, pattern, pat_len) == 0) {
            return true;
        }
        if (!next_dot) break;
        p = next_dot + 1;
    }
    
    return false;
}

static bool is_likely_domain_keyword(const char *s) {
    if (!s || !*s) return false;
    size_t len = strlen(s);
    if (len < 3) return false;

    if (strcmp(s, "tcp") == 0 || strcmp(s, "udp") == 0) return false;

    if (s[0] == '/' || s[0] == '^') return false;

    if (strchr(s, ':') || strchr(s, '|')) return false;

    bool all_digits = true;
    bool range_format = true;
    int hyphen_count = 0;
    for (size_t i = 0; i < len; i++) {
        if (!isdigit((unsigned char)s[i])) {
            all_digits = false;
        }
        if (s[i] == '-') {
            hyphen_count++;
        } else if (!isdigit((unsigned char)s[i])) {
            range_format = false;
        }
    }
    if (all_digits) return false;
    if (range_format && hyphen_count == 1) return false;

    return true;
}

static void parse_feature_line(const char *line, const char *class_name) {
    const char *colon = strchr(line, ':');
    if (!colon) return;

    const char *p = colon - 1;
    while (p > line && *p != ' ' && *p != '\t') {
        p--;
    }
    if (p == line) return;
    char app_name[64];
    size_t name_len = (size_t)(colon - (p + 1));
    if (name_len >= sizeof(app_name)) name_len = sizeof(app_name) - 1;
    memcpy(app_name, p + 1, name_len);
    app_name[name_len] = '\0';

    const char *bracket_start = strchr(colon, '[');
    if (!bracket_start) return;
    const char *bracket_end = strchr(bracket_start, ']');
    if (!bracket_end || bracket_end <= bracket_start) return;

    const char *curr = bracket_start + 1;
    char token[128];
    size_t token_idx = 0;

    while (curr <= bracket_end) {
        char c = *curr;
        if (c == ';' || c == ',' || c == ']') {
            if (token_idx > 0) {
                token[token_idx] = '\0';
                char *t_start = token;
                while (*t_start == ' ' || *t_start == '\t') t_start++;
                size_t t_len = strlen(t_start);
                while (t_len > 0 && (t_start[t_len - 1] == ' ' || t_start[t_len - 1] == '\t')) {
                    t_start[--t_len] = '\0';
                }
                if (is_likely_domain_keyword(t_start)) {
                    add_dynamic_rule(app_name, class_name, t_start);
                }
                token_idx = 0;
            }
        } else {
            if (token_idx < sizeof(token) - 1) {
                token[token_idx++] = c;
            }
        }
        curr++;
    }
}

static void load_feature_cfg() {
    if (g_dynamic_rules) {
        free(g_dynamic_rules);
        g_dynamic_rules = NULL;
    }
    g_dynamic_rules_count = 0;
    g_dynamic_rules_cap = 0;

    const char *paths[] = {
        "/usr/share/luci-app-dashboard/oaf-default/feature.cfg",
        "/usr/share/luci-app-dashboard/oaf/feature.cfg",
        "./root/usr/share/luci-app-dashboard/oaf-default/feature.cfg",
        "feature.cfg",
        NULL
    };

    FILE *f = NULL;
    for (int i = 0; paths[i] != NULL; i++) {
        f = fopen(paths[i], "r");
        if (f) break;
    }

    if (!f) {
        return;
    }

    char line[1024];
    char current_class[64] = "other";

    while (fgets(line, sizeof(line), f)) {
        size_t len = strlen(line);
        while (len > 0 && (line[len - 1] == '\r' || line[len - 1] == '\n')) {
            line[--len] = '\0';
        }

        char *trimmed = line;
        while (*trimmed == ' ' || *trimmed == '\t') trimmed++;
        if (*trimmed == '\0') continue;

        if (strncmp(trimmed, "#class", 6) == 0) {
            char class_key[64];
            int class_id;
            char class_cn[64];
            if (sscanf(trimmed, "#class %63s %d %63s", class_key, &class_id, class_cn) >= 1) {
                strncpy(current_class, class_key, sizeof(current_class) - 1);
                current_class[sizeof(current_class) - 1] = '\0';
            }
            continue;
        }

        if (trimmed[0] == '#') {
            continue;
        }

        parse_feature_line(trimmed, current_class);
    }

    fclose(f);
}
/* 英文应用名→中文应用名的归一化映射，避免同一应用以两种语言重复出现 */
static const struct { const char *alias; const char *canonical; } APP_NAME_ALIASES[] = {
    {"Alipay", "支付宝"},
    {"AliyunDrive", "阿里云盘"},
    {"Apple", "苹果官网"},
    {"Baidu", "百度"},
    {"Bilibili", "哔哩哔哩"},
    {"Bing", "必应"},
    {"CCTV", "央视频"},
    {"DingTalk", "钉钉"},
    {"Douban", "豆瓣"},
    {"Douyin", "抖音"},
    {"Douyu", "斗鱼"},
    {"Eleme", "饿了么"},
    {"Feishu", "飞书"},
    {"Genshin", "原神"},
    {"GitHub", "github"},
    {"Google", "谷歌"},
    {"Honor of Kings", "王者荣耀"},
    {"Huya", "虎牙直播"},
    {"iQiyi", "爱奇艺"},
    {"JD", "京东"},
    {"Kugou", "酷狗音乐"},
    {"Meituan", "美团"},
    {"MGTV", "芒果tv"},
    {"NeteaseMusic", "网易云音乐"},
    {"Pinduoduo", "拼多多"},
    {"QQMusic", "QQ音乐"},
    {"Sunlogin", "向日葵"},
    {"Taobao", "淘宝"},
    {"WeChat", "微信"},
    {"Weibo", "微博"},
    {"Xiaohongshu", "小红书"},
    {"Xiaomi", "小米官网"},
    {"Xigua", "西瓜视频"},
    {"Youku", "优酷"},
    {"Zhihu", "知乎"},
    {NULL, NULL}
};

static const char* normalize_app_name(const char *name) {
    for (int i = 0; APP_NAME_ALIASES[i].alias != NULL; i++) {
        if (strcmp(name, APP_NAME_ALIASES[i].alias) == 0)
            return APP_NAME_ALIASES[i].canonical;
    }
    return name;
}

static void match_app(const char *domain) {
    for (int i = 0; i < g_dynamic_rules_count; i++) {
        if (match_pattern(domain, g_dynamic_rules[i].pattern)) {
            const char *name = normalize_app_name(g_dynamic_rules[i].app);
            record_app(name, g_dynamic_rules[i].class_name);
            return;
        }
    }
    for (int i = 0; APP_RULES[i].app != NULL; i++) {
        if (match_pattern(domain, APP_RULES[i].pattern)) {
            const char *name = normalize_app_name(APP_RULES[i].app);
            record_app(name, APP_RULES[i].class_name);
            return;
        }
    }
}

static void record_ip_domain(const char *ip, const char *domain) {
    if (!ip || !domain || !*ip || !*domain) return;
    unsigned int h = hash_str(ip);
    struct ip_node *node = ip_hash_table[h];
    while (node) {
        if (strcmp(node->ip, ip) == 0) {
            struct ip_domain_node *dn = node->domains;
            while (dn) {
                if (strcmp(dn->domain, domain) == 0) {
                    dn->weight++;
                    return;
                }
                dn = dn->next;
            }
            dn = calloc(1, sizeof(*dn));
            if (!dn) return;
            snprintf(dn->domain, sizeof(dn->domain), "%s", domain);
            dn->weight = 1;
            dn->next = node->domains;
            node->domains = dn;
            return;
        }
        node = node->next;
    }
    node = calloc(1, sizeof(*node));
    if (!node) return;
    snprintf(node->ip, sizeof(node->ip), "%s", ip);
    node->next = ip_hash_table[h];
    ip_hash_table[h] = node;
    record_ip_domain(ip, domain);
}

static const char* lookup_ip(const char *ip) {
    if (!ip || !*ip) return NULL;
    unsigned int h = hash_str(ip);
    struct ip_node *node = ip_hash_table[h];
    while (node) {
        if (strcmp(node->ip, ip) == 0) {
            struct ip_domain_node *best = NULL;
            for (struct ip_domain_node *dn = node->domains; dn; dn = dn->next) {
                if (!best || dn->weight > best->weight) {
                    best = dn;
                }
            }
            return best ? best->domain : NULL;
        }
        node = node->next;
    }
    return NULL;
}

static void record_realtime_domain(const char *domain, const char *client_ip)
{
    if (!domain || !*domain) return;

    match_app(domain);

    unsigned int h = hash_str(domain);
    struct realtime_node *node = realtime_hash_table[h];
    while (node) {
        if (strcmp(node->domain, domain) == 0) {
            node->count++;
            node->last_seen = g_seq;
            break;
        }
        node = node->next;
    }
    if (!node) {
        node = calloc(1, sizeof(*node));
        if (!node) return;
        snprintf(node->domain, sizeof(node->domain), "%s", domain);
        node->count = 1;
        node->last_seen = g_seq;
        node->next = realtime_hash_table[h];
        realtime_hash_table[h] = node;
    }

    if (client_ip && *client_ip) {
        for (struct client_node *cn = node->clients; cn; cn = cn->next) {
            if (strcmp(cn->ip, client_ip) == 0) {
                return;
            }
        }
        struct client_node *cn = calloc(1, sizeof(*cn));
        if (!cn) return;
        snprintf(cn->ip, sizeof(cn->ip), "%s", client_ip);
        cn->next = node->clients;
        node->clients = cn;
        node->devices++;
    }
}

static void record_domain(const char *domain, int weight) {
    if (!domain || !*domain) return;
    unsigned int h = hash_str(domain);
    struct domain_node *node = domain_hash_table[h];
    while (node) {
        if (strcmp(node->domain, domain) == 0) {
            node->count += weight;
            node->last_seen = ++g_seq;
            return;
        }
        node = node->next;
    }
    node = calloc(1, sizeof(*node));
    if (!node) return;
    snprintf(node->domain, sizeof(node->domain), "%s", domain);
    node->count = weight;
    node->last_seen = ++g_seq;
    node->next = domain_hash_table[h];
    domain_hash_table[h] = node;
}

static bool is_domain_label_char(char c)
{
    return isalnum((unsigned char)c) || c == '-';
}

static bool str_in_list(const char *value, const char *const *list)
{
    if (!value) return false;
    for (int i = 0; list[i]; i++) {
        if (strcmp(value, list[i]) == 0) {
            return true;
        }
    }
    return false;
}

static bool is_blocked_file_suffix(const char *tld)
{
    static const char *const suffixes[] = {
        "cfg", "conf", "css", "dat", "eot", "gz", "ipk", "js", "json",
        "ko", "list", "lock", "log", "lua", "map", "pid", "rules", "sh", "so",
        "tar", "tmp", "ttf", "txt", "woff", "woff2", "zip", NULL
    };
    return str_in_list(tld, suffixes);
}

static bool is_syslog_facility_token(const char *domain, const char *last_label)
{
    static const char *const facilities[] = {
        "auth", "authpriv", "cron", "daemon", "kern", "kernel", "local0",
        "local1", "local2", "local3", "local4", "local5", "local6", "local7",
        "mail", "news", "syslog", "user", "uucp", NULL
    };
    static const char *const levels[] = {
        "alert", "crit", "debug", "emerg", "err", "error", "info", "notice",
        "warn", "warning", NULL
    };
    char first_label[64];
    const char *dot = strchr(domain, '.');
    size_t len;

    if (!dot || !str_in_list(last_label, levels)) {
        return false;
    }

    len = (size_t)(dot - domain);
    if (len == 0 || len >= sizeof(first_label)) {
        return false;
    }
    memcpy(first_label, domain, len);
    first_label[len] = '\0';
    return str_in_list(first_label, facilities);
}

static bool is_valid_domain_name(const char *domain)
{
    const char *label = domain;
    const char *last_label = domain;
    int label_len = 0;
    int label_count = 1;
    bool has_alpha = false;

    if (!domain || !*domain || strlen(domain) >= 254) {
        return false;
    }

    for (const char *p = domain; ; p++) {
        char c = *p;

        if (c == '.' || c == '\0') {
            if (label_len == 0 || label_len > 63) {
                return false;
            }
            if (label[0] == '-' || p[-1] == '-') {
                return false;
            }
            if (c == '\0') {
                break;
            }
            label = p + 1;
            last_label = label;
            label_len = 0;
            label_count++;
            continue;
        }

        if (!is_domain_label_char(c)) {
            return false;
        }
        if (isalpha((unsigned char)c)) {
            has_alpha = true;
        }
        label_len++;
    }

    if (label_count < 2 || !has_alpha || is_ipv4_literal(domain)) {
        return false;
    }

    if (is_blocked_file_suffix(last_label) || is_syslog_facility_token(domain, last_label)) {
        return false;
    }

    if (!isalpha((unsigned char)last_label[0])) {
        return false;
    }
    if (strncmp(last_label, "xn--", 4) == 0) {
        for (const char *p = last_label; *p; p++) {
            if (!is_domain_label_char(*p)) {
                return false;
            }
        }
    } else {
        for (const char *p = last_label; *p; p++) {
            if (!isalpha((unsigned char)*p) && *p != '-') {
                return false;
            }
        }
    }

    return true;
}

static void normalize_domain(const char *raw, char *out, size_t out_len) {
    out[0] = '\0';
    if (!raw || !*raw) return;
    const char *p = raw;
    while (*p && isspace((unsigned char)*p)) p++;
    if (strncmp(p, "https://", 8) == 0) p += 8;
    else if (strncmp(p, "http://", 7) == 0) p += 7;

    if (strncmp(p, "*.", 2) == 0) p += 2;

    size_t i = 0;
    bool has_alpha = false;
    while (*p && !isspace((unsigned char)*p) && *p != '/' && *p != ':' &&
           *p != '&' && *p != '"' && *p != '\'' && *p != ',' &&
           *p != ')' && *p != ']' && i < out_len - 1) {
        if (isalpha((unsigned char)*p)) has_alpha = true;
        out[i++] = tolower((unsigned char)*p);
        p++;
    }
    out[i] = '\0';

    while (i > 0 && out[i-1] == '.') {
        out[--i] = '\0';
    }

    if (!strchr(out, '.') || !has_alpha || !is_valid_domain_name(out)) {
        out[0] = '\0';
        return;
    }

    if (is_ipv4_literal(out)) {
        out[0] = '\0';
        return;
    }
    if (strstr(out, "in-addr.arpa") || strcmp(out, "localhost") == 0) {
        out[0] = '\0';
    }
}

static bool remember_line_domain(char seen[][128], int *seen_count, const char *domain)
{
    for (int i = 0; i < *seen_count; i++) {
        if (strcmp(seen[i], domain) == 0) {
            return false;
        }
    }
    if (*seen_count < 32) {
        snprintf(seen[*seen_count], sizeof(seen[*seen_count]), "%s", domain);
        (*seen_count)++;
    }
    return true;
}

static void record_candidate(const char *raw, int weight, char seen[][128], int *seen_count)
{
    char dom[256];
    normalize_domain(raw, dom, sizeof(dom));
    if (dom[0] && remember_line_domain(seen, seen_count, dom)) {
        record_domain(dom, weight);
        match_app(dom);
    }
}

static void extract_and_record(const char *line, int weight) {
    char buf[256];
    const char *p;
    char seen[32][128];
    int seen_count = 0;

    if ((p = strstr(line, "--> "))) {
        if (sscanf(p + 4, "%255[^:]", buf) == 1) {
            record_candidate(buf, weight, seen, &seen_count);
        }
    }
    if ((p = strstr(line, "[DNS] "))) {
        if (sscanf(p + 6, "%255s", buf) == 1) {
            record_candidate(buf, weight, seen, &seen_count);
        }
    }
    if ((p = strstr(line, "host="))) {
        if (sscanf(p + 5, "%255[^ \t\r\n&\"']", buf) == 1) {
            record_candidate(buf, weight, seen, &seen_count);
        }
    }
    if ((p = strstr(line, "sni="))) {
        if (sscanf(p + 4, "%255[^ \t\r\n&\"']", buf) == 1) {
            record_candidate(buf, weight, seen, &seen_count);
        }
    }
    if ((p = strstr(line, "query"))) {
        const char *q = strstr(p, " from");
        const char *name = p + 5;
        while (*name && (isalnum((unsigned char)*name) || *name == '[' || *name == ']')) name++;
        while (*name && isspace((unsigned char)*name)) name++;
        if (q && q > name && (size_t)(q - name) < sizeof(buf)) {
            memcpy(buf, name, (size_t)(q - name));
            buf[q - name] = '\0';
            record_candidate(buf, weight, seen, &seen_count);
        }
    }
    if ((p = strstr(line, "reply "))) {
        char reply_dom[256], is_word[16], reply_ip[64];
        if (sscanf(p + 6, "%255s %15s %63s", reply_dom, is_word, reply_ip) == 3 && strcmp(is_word, "is") == 0) {
            char dom[256];
            normalize_domain(reply_dom, dom, sizeof(dom));
            if (dom[0]) {
                if (remember_line_domain(seen, &seen_count, dom)) record_domain(dom, weight);
                record_ip_domain(reply_ip, dom);
            }
        }
    }
    if ((p = strstr(line, "cached "))) {
        char reply_dom[256], is_word[16], reply_ip[64];
        if (sscanf(p + 7, "%255s %15s %63s", reply_dom, is_word, reply_ip) == 3 && strcmp(is_word, "is") == 0) {
            char dom[256];
            normalize_domain(reply_dom, dom, sizeof(dom));
            if (dom[0]) {
                if (remember_line_domain(seen, &seen_count, dom)) record_domain(dom, weight);
                record_ip_domain(reply_ip, dom);
            }
        }
    }

    if ((p = strstr(line, "\"domain\"")) || (p = strstr(line, "\"host\"")) || (p = strstr(line, "\"url\"")) || (p = strstr(line, "\"sni\""))) {
        const char *colon = strchr(p, ':');
        if (colon) {
            const char *quote = strchr(colon, '"');
            if (quote) {
                if (sscanf(quote + 1, "%255[^\"]", buf) == 1) {
                    record_candidate(buf, weight, seen, &seen_count);
                }
            }
        }
    }
    (void)weight;
}

static void parse_conntrack() {
    FILE *p = popen("conntrack -L 2>/dev/null", "r");
    if (!p) return;
    char line[512];
    while (fgets(line, sizeof(line), p)) {
        char *dst = strstr(line, "dst=");
        char *src = strstr(line, "src=");
        if (dst) {
            char ip[64];
            if (sscanf(dst + 4, "%63[^ \t\r\n]", ip) == 1) {
                const char *dom = lookup_ip(ip);
                if (dom) {
                    char src_ip[64] = "";
                    if (src) {
                        sscanf(src + 4, "%63[^ \t\r\n]", src_ip);
                    }
                    record_domain(dom, 1);
                    record_realtime_domain(dom, src_ip);
                }
            }
        }
    }
    pclose(p);
}

static void parse_command_lines(const char *cmd) {
    FILE *p = popen(cmd, "r");
    if (!p) return;
    char line[1024];
    while (fgets(line, sizeof(line), p)) {
        extract_and_record(line, 1);
    }
    pclose(p);
}

static int cmp_domain_count(const void *a, const void *b) {
    const struct domain_node *na = *(const struct domain_node **)a;
    const struct domain_node *nb = *(const struct domain_node **)b;
    if (na->count != nb->count) return nb->count - na->count;
    return nb->last_seen - na->last_seen;
}

static int cmp_domain_recent(const void *a, const void *b) {
    const struct domain_node *na = *(const struct domain_node **)a;
    const struct domain_node *nb = *(const struct domain_node **)b;
    return nb->last_seen - na->last_seen;
}

static int cmp_realtime_count(const void *a, const void *b) {
    const struct realtime_node *na = *(const struct realtime_node **)a;
    const struct realtime_node *nb = *(const struct realtime_node **)b;
    if (na->count != nb->count) return nb->count - na->count;
    return nb->last_seen - na->last_seen;
}

static int cmp_app_count(const void *a, const void *b) {
    const struct app_node *na = *(const struct app_node **)a;
    const struct app_node *nb = *(const struct app_node **)b;
    if (na->hits != nb->hits) return nb->hits - na->hits;
    return nb->latest_seq - na->latest_seq;
}

static int count_domain_hits(void)
{
    int total = 0;
    for (int i = 0; i < HASH_SIZE; i++) {
        for (struct domain_node *node = domain_hash_table[i]; node; node = node->next) {
            total += node->count;
        }
    }
    return total;
}

static int count_realtime_rows(void)
{
    int total = 0;
    for (int i = 0; i < HASH_SIZE; i++) {
        for (struct realtime_node *node = realtime_hash_table[i]; node; node = node->next) {
            total++;
        }
    }
    return total;
}

static void append_source_label(char *dst, size_t dst_len, const char *label)
{
    size_t used;
    if (!label || !*label || dst_len == 0) return;
    used = strlen(dst);
    if (used >= dst_len - 1) return;
    if (dst[0] != '\0') {
        strncat(dst, "+", dst_len - used - 1);
        used = strlen(dst);
        if (used >= dst_len - 1) return;
    }
    strncat(dst, label, dst_len - used - 1);
}

static void parse_named_source(const char *label, const char *cmd, char *source, size_t source_len)
{
    int before = count_domain_hits();
    parse_command_lines(cmd);
    if (count_domain_hits() > before) {
        append_source_label(source, source_len, label);
    }
}

static void append_domains_and_apps(struct buffer *b) {
    char source[256] = "";
    char realtime_source[64] = "none";
    static bool feature_loaded = false;

    if (!feature_loaded) {
        load_feature_cfg();
        feature_loaded = true;
    }

    g_seq = 0;
    clear_hashes();

    parse_named_source("appfilter", "ubus call appfilter visit_list 2>/dev/null", source, sizeof(source));
    parse_named_source("dnsmasq-logread", "logread | grep -iE 'dnsmasq' | tail -n 12000", source, sizeof(source));

    int before_conntrack = count_domain_hits();
    parse_conntrack();
    if (count_domain_hits() > before_conntrack) {
        append_source_label(source, sizeof(source), "conntrack+dnsmasq");
        snprintf(realtime_source, sizeof(realtime_source), "conntrack+dnsmasq");
    }

    parse_named_source("smartdns", "tail -n 6000 /tmp/smartdns.log 2>/dev/null", source, sizeof(source));
    parse_named_source("adguardhome", "tail -n 6000 /tmp/AdGuardHome.log 2>/dev/null", source, sizeof(source));
    parse_named_source("mosdns", "tail -n 6000 /tmp/mosdns.log 2>/dev/null", source, sizeof(source));
    parse_named_source("openclash", "tail -n 6000 /tmp/openclash.log 2>/dev/null", source, sizeof(source));
    parse_named_source("passwall", "tail -n 6000 /tmp/log/passwall.log 2>/dev/null", source, sizeof(source));
    parse_named_source("passwall2", "tail -n 6000 /tmp/log/passwall2.log 2>/dev/null", source, sizeof(source));
    parse_named_source("homeproxy", "tail -n 6000 /tmp/homeproxy.log 2>/dev/null", source, sizeof(source));
    parse_named_source("mihomo", "tail -n 6000 /tmp/mihomo.log 2>/dev/null", source, sizeof(source));
    parse_named_source("sing-box", "tail -n 6000 /tmp/sing-box.log 2>/dev/null", source, sizeof(source));
    parse_named_source("logread-dns", "logread | grep -iE 'smartdns|adguardhome|mosdns|unbound|pdnsd|chinadns|openclash|passwall|mihomo|sing-box|homeproxy|appfilter' | tail -n 8000", source, sizeof(source));
    if (source[0] == '\0') {
        snprintf(source, sizeof(source), "none");
    }

    int g_all_domains_count = 0;
    for (int i = 0; i < HASH_SIZE; i++) {
        struct domain_node *node = domain_hash_table[i];
        while (node) {
            g_all_domains_count++;
            node = node->next;
        }
    }

    struct domain_node **g_all_domains = malloc(sizeof(struct domain_node *) * (g_all_domains_count + 1));
    if (!g_all_domains) {
        g_all_domains_count = 0;
    }
    int idx = 0;
    if (g_all_domains) {
        for (int i = 0; i < HASH_SIZE; i++) {
            struct domain_node *node = domain_hash_table[i];
            while (node) {
                g_all_domains[idx++] = node;
                node = node->next;
            }
        }
    }

    int g_all_realtime_count = count_realtime_rows();
    struct realtime_node **g_all_realtime = NULL;
    if (g_all_realtime_count > 0) {
        g_all_realtime = malloc(sizeof(struct realtime_node *) * (size_t)g_all_realtime_count);
        if (g_all_realtime) {
            int ridx = 0;
            for (int i = 0; i < HASH_SIZE; i++) {
                struct realtime_node *node = realtime_hash_table[i];
                while (node) {
                    g_all_realtime[ridx++] = node;
                    node = node->next;
                }
            }
            qsort(g_all_realtime, g_all_realtime_count, sizeof(struct realtime_node *), cmp_realtime_count);
        } else {
            g_all_realtime_count = 0;
        }
    }

    buf_append(b, "\"domains\":{\"source\":");
    json_string(b, source);
    buf_append(b, ",\"realtime_source\":");
    json_string(b, realtime_source);
    buf_append(b, ",\"top\":[");
    qsort(g_all_domains, g_all_domains_count, sizeof(struct domain_node *), cmp_domain_count);
    int top_count = g_all_domains_count > 25 ? 25 : g_all_domains_count;
    for (int i = 0; i < top_count; i++) {
        if (i > 0) buf_append(b, ",");
        buf_append(b, "{");
        json_key_string(b, "domain", g_all_domains[i]->domain);
        buf_printf(b, ",\"count\":%d}", g_all_domains[i]->count);
    }
    buf_append(b, "],\"recent\":[");
    qsort(g_all_domains, g_all_domains_count, sizeof(struct domain_node *), cmp_domain_recent);
    int recent_count = g_all_domains_count > 25 ? 25 : g_all_domains_count;
    for (int i = 0; i < recent_count; i++) {
        if (i > 0) buf_append(b, ",");
        buf_append(b, "{");
        json_key_string(b, "domain", g_all_domains[i]->domain);
        buf_printf(b, ",\"count\":%d}", g_all_domains[i]->count);
    }
    buf_append(b, "],\"realtime\":[");
    int realtime_count = g_all_realtime_count > 25 ? 25 : g_all_realtime_count;
    for (int i = 0; i < realtime_count; i++) {
        if (i > 0) buf_append(b, ",");
        buf_append(b, "{");
        json_key_string(b, "domain", g_all_realtime[i]->domain);
        buf_printf(b, ",\"count\":%d,\"devices\":%d}", g_all_realtime[i]->count, g_all_realtime[i]->devices);
    }
    buf_append(b, "]},\"realtime_urls\":{\"source\":");
    json_string(b, realtime_source);
    buf_printf(b, ",\"total\":%d,\"list\":[", realtime_count);
    for (int i = 0; i < realtime_count; i++) {
        if (i > 0) buf_append(b, ",");
        buf_append(b, "{");
        json_key_string(b, "domain", g_all_realtime[i]->domain);
        buf_printf(b, ",\"count\":%d,\"hits\":%d,\"devices\":%d}", g_all_realtime[i]->count, g_all_realtime[i]->count, g_all_realtime[i]->devices);
    }
    buf_append(b, "]},");

    free(g_all_domains);
    free(g_all_realtime);

    // Apps
    int g_all_apps_count = 0;
    for (int i = 0; i < HASH_SIZE; i++) {
        struct app_node *node = app_hash_table[i];
        while (node) {
            g_all_apps_count++;
            node = node->next;
        }
    }

    struct app_node **g_all_apps = malloc(sizeof(struct app_node *) * (g_all_apps_count + 1));
    if (!g_all_apps) {
        g_all_apps_count = 0;
    }
    idx = 0;
    if (g_all_apps) {
        for (int i = 0; i < HASH_SIZE; i++) {
            struct app_node *node = app_hash_table[i];
            while (node) {
                g_all_apps[idx++] = node;
                node = node->next;
            }
        }
    }

    qsort(g_all_apps, g_all_apps_count, sizeof(struct app_node *), cmp_app_count);
    int top_apps = g_all_apps_count > 12 ? 12 : g_all_apps_count;

    buf_printf(b, "\"online_apps\":{\"total\":%d,\"list\":[", top_apps);
    for (int i = 0; i < top_apps; i++) {
        if (i > 0) buf_append(b, ",");
        buf_append(b, "{");
        json_key_string(b, "name", g_all_apps[i]->name);
        buf_append(b, ",");
        json_key_string(b, "class", g_all_apps[i]->class_name);
        buf_append(b, ",");
        json_key_string(b, "class_label", g_all_apps[i]->class_name);
        buf_append(b, ",");
        json_key_string(b, "source", "domain-heuristic");
        buf_printf(b, ",\"hits\":%d,\"time\":%d,\"id\":%d}", g_all_apps[i]->hits, g_all_apps[i]->hits, i);
    }
    buf_append(b, "],\"source\":\"domain-heuristic\"},");

    // app_recognition
    buf_append(b, "\"app_recognition\":{\"available\":");
    buf_append(b, top_apps > 0 ? "true" : "false");
    buf_append(b, ",\"source\":\"domain-heuristic\",\"engine\":\"dashboard-core\",\"feature_version\":\"\",\"class_stats\":[]}");

    free(g_all_apps);
}


static char *build_databus(void)
{
    struct buffer b;
    char iface[64];

    get_default_iface(iface, sizeof(iface));
    buf_init(&b);

    buf_append(&b, "{\"code\":0,\"timestamp\":");
    buf_printf(&b, "%ld,", (long)time(NULL));
    append_network_status(&b, iface);
    buf_append(&b, ",");
    append_system_status(&b);
    buf_append(&b, ",");
    append_traffic(&b, iface);
    buf_append(&b, ",");
    append_domains_and_apps(&b);
    buf_append(&b, ",");
    append_devices(&b);
    buf_append(&b, "}");

    return b.data;
}

static void send_response(int fd, int status, const char *status_text, const char *body)
{
    const char *payload = body ? body : "";
    dprintf(fd,
            "HTTP/1.1 %d %s\r\n"
            "Content-Type: application/json\r\n"
            "Cache-Control: no-store\r\n"
            "Connection: close\r\n"
            "Content-Length: %zu\r\n\r\n%s",
            status, status_text, strlen(payload), payload);
}

static void handle_client(int fd)
{
    char req[1024];
    ssize_t n = read(fd, req, sizeof(req) - 1);
    if (n <= 0) {
        close(fd);
        return;
    }
    req[n] = '\0';

    if (strncmp(req, "GET /databus", 12) == 0 || strncmp(req, "GET /databus?", 13) == 0) {
        char *body = build_databus();
        send_response(fd, 200, "OK", body);
        free(body);
    } else if (strncmp(req, "GET /health", 11) == 0) {
        send_response(fd, 200, "OK", "{\"ok\":true}");
    } else {
        send_response(fd, 404, "Not Found", "{\"code\":404,\"error\":\"not found\"}");
    }
    close(fd);
}

static void parse_listen(const char *value, char *host, size_t host_len, int *port)
{
    const char *colon = strrchr(value, ':');
    snprintf(host, host_len, "%s", DEFAULT_LISTEN_HOST);
    *port = DEFAULT_LISTEN_PORT;

    if (!value || !*value) {
        return;
    }
    if (colon) {
        size_t n = (size_t)(colon - value);
        if (n >= host_len) n = host_len - 1;
        memcpy(host, value, n);
        host[n] = '\0';
        *port = atoi(colon + 1);
    } else {
        *port = atoi(value);
    }
    if (*port <= 0 || *port > 65535) {
        *port = DEFAULT_LISTEN_PORT;
    }
}

int main(int argc, char **argv)
{
    char host[64] = DEFAULT_LISTEN_HOST;
    int port = DEFAULT_LISTEN_PORT;
    int server_fd;
    struct sockaddr_in addr;
    int one = 1;

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--listen") == 0 && i + 1 < argc) {
            parse_listen(argv[++i], host, sizeof(host), &port);
        }
    }

    signal(SIGPIPE, SIG_IGN);

    server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) {
        perror("socket");
        return 1;
    }

    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof(one));
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons((uint16_t)port);
    if (inet_pton(AF_INET, host, &addr.sin_addr) != 1) {
        fprintf(stderr, "Invalid listen host: %s\n", host);
        close(server_fd);
        return 1;
    }

    if (bind(server_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("bind");
        close(server_fd);
        return 1;
    }
    if (listen(server_fd, 16) < 0) {
        perror("listen");
        close(server_fd);
        return 1;
    }

    fprintf(stderr, "dashboard-core listening on %s:%d\n", host, port);
    for (;;) {
        int client_fd = accept(server_fd, NULL, NULL);
        if (client_fd < 0) {
            if (errno == EINTR) {
                continue;
            }
            perror("accept");
            break;
        }
        handle_client(client_fd);
    }

    close(server_fd);
    return 0;
}
