/* VRC Quick Open (Zendesk) - background service worker (MV3) */

const UPDATE_CHECK_ALARM = "vrc_update_check_alarm";
const DEFAULT_UPDATE_CHECKS = { enabled: false, repo: "" };

function storageSyncGet(defaultsObj) {
  return new Promise((resolve) => chrome.storage.sync.get(defaultsObj, resolve));
}
function storageSyncSet(items) {
  return new Promise((resolve) => chrome.storage.sync.set(items, resolve));
}
function alarmsClear(name) {
  return new Promise((resolve) => chrome.alarms.clear(name, resolve));
}

function normalizeVersion(v) {
  return String(v || "").trim().replace(/^v/i, "");
}
function parseSemver(v) {
  return normalizeVersion(v)
    .split(".")
    .map((x) => parseInt(x, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
}
function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

function buildVrcUrl(email, includePayments) {
  const url = new URL("https://vrc.a8c.com/");
  url.searchParams.set("user_query", email);
  url.searchParams.set("user_type", "wpcom");

  if (includePayments) {
    url.searchParams.set("include-transactions", "on");
    url.searchParams.set("include-payment-failures", "on");
  }

  return url.toString();
}

async function getUpdateChecks() {
  const { updateChecks } = await storageSyncGet({ updateChecks: DEFAULT_UPDATE_CHECKS });
  return updateChecks || DEFAULT_UPDATE_CHECKS;
}

async function rescheduleUpdateAlarm() {
  const { enabled } = await getUpdateChecks();
  await alarmsClear(UPDATE_CHECK_ALARM);

  if (enabled) {
    // Check every 6 hours to stay well within GitHub's unauthenticated rate limit.
    chrome.alarms.create(UPDATE_CHECK_ALARM, { periodInMinutes: 60 * 6 });
  }
}

async function checkForUpdates() {
  const { enabled, repo } = await getUpdateChecks();
  if (!enabled || !repo) {
    await storageSyncSet({ updateInfo: null });
    return { status: "disabled" };
  }

  const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;

  try {
    const res = await fetch(apiUrl, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    });

    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

    const data = await res.json();
    const latestTag = String(data?.tag_name || "").trim();
    const latestVersion = normalizeVersion(latestTag) || normalizeVersion(data?.name);
    const currentVersion = normalizeVersion(chrome.runtime.getManifest().version);
    const releaseUrl = String(data?.html_url || `https://github.com/${repo}/releases/latest`);

    if (!latestVersion) {
      const updateInfo = {
        status: "error",
        error: "Could not read latest version from GitHub release.",
        checkedAt: new Date().toISOString(),
      };
      await storageSyncSet({ updateInfo });
      return updateInfo;
    }

    const updateAvailable = compareSemver(latestVersion, currentVersion) > 0;

    const updateInfo = {
      status: updateAvailable ? "update_available" : "up_to_date",
      latestVersion,
      currentVersion,
      releaseUrl,
      checkedAt: new Date().toISOString(),
    };

    await storageSyncSet({ updateInfo });
    return updateInfo;
  } catch (err) {
    const updateInfo = {
      status: "error",
      error: String(err?.message || err),
      checkedAt: new Date().toISOString(),
    };
    await storageSyncSet({ updateInfo });
    return updateInfo;
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await rescheduleUpdateAlarm();
  // Do a one-time check on install if enabled
  const { enabled } = await getUpdateChecks();
  if (enabled) await checkForUpdates();
});

chrome.runtime.onStartup.addListener(async () => {
  await rescheduleUpdateAlarm();
});

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "sync") return;
  if (!changes.updateChecks) return;

  await rescheduleUpdateAlarm();

  const next = changes.updateChecks.newValue || DEFAULT_UPDATE_CHECKS;
  if (next.enabled && next.repo) {
    await checkForUpdates();
  } else {
    await storageSyncSet({ updateInfo: null });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === UPDATE_CHECK_ALARM) checkForUpdates();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message?.type;

  if (type === "OPEN_VRC") {
    const email = String(message?.email || "").trim();
    if (!email) return;
    const includePayments = Boolean(message?.includePayments);
    const url = buildVrcUrl(email, includePayments);
    chrome.tabs.create({ url, active: true });
    return;
  }

  if (type === "OPEN_URL") {
    const url = String(message?.url || "").trim();
    if (!url) return;
    chrome.tabs.create({ url, active: true });
    return;
  }

  if (type === "CHECK_UPDATES_NOW") {
    checkForUpdates().then(sendResponse);
    return true; // keep SW alive for async response
  }
});
