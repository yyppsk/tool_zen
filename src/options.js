/* VRC Quick Open (Zendesk) - options page */

const DEFAULT_UPDATE_CHECKS = { enabled: false, repo: "" };

const $ = (id) => document.getElementById(id);

const storageGet = (defaultsObj) =>
  new Promise((resolve) => chrome.storage.sync.get(defaultsObj, resolve));
const storageSet = (items) =>
  new Promise((resolve) => chrome.storage.sync.set(items, resolve));
const sendMessage = (msg) =>
  new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));

function formatTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "";
  }
}

function renderStatus(updateInfo) {
  const statusEl = $("status");
  const openReleaseBtn = $("openRelease");

  openReleaseBtn.disabled = true;

  if (!updateInfo) {
    statusEl.textContent = "Update checks are disabled.";
    return;
  }

  const checkedAt = formatTime(updateInfo.checkedAt);

  if (updateInfo.status === "disabled") {
    statusEl.textContent = "Update checks are disabled.";
    return;
  }

  if (updateInfo.status === "error") {
    statusEl.textContent = `Update check failed: ${updateInfo.error || "Unknown error"}${checkedAt ? ` (last checked: ${checkedAt})` : ""}`;
    return;
  }

  if (updateInfo.status === "update_available") {
    statusEl.textContent = `Update available: ${updateInfo.latestVersion} (current: ${updateInfo.currentVersion})${checkedAt ? ` • checked: ${checkedAt}` : ""}`;
    openReleaseBtn.disabled = !updateInfo.releaseUrl;
    openReleaseBtn.dataset.url = updateInfo.releaseUrl || "";
    return;
  }

  if (updateInfo.status === "up_to_date") {
    statusEl.textContent = `Up to date (latest: ${updateInfo.latestVersion})${checkedAt ? ` • checked: ${checkedAt}` : ""}`;
    openReleaseBtn.disabled = !updateInfo.releaseUrl;
    openReleaseBtn.dataset.url = updateInfo.releaseUrl || "";
    return;
  }

  statusEl.textContent = "Unknown update state.";
}

async function load() {
  const { updateChecks, updateInfo } = await storageGet({
    updateChecks: DEFAULT_UPDATE_CHECKS,
    updateInfo: null,
  });

  $("updatesEnabled").checked = Boolean(updateChecks?.enabled);
  $("repo").value = String(updateChecks?.repo || "");
  $("version").textContent = `Extension version: ${chrome.runtime.getManifest().version}`;

  renderStatus(updateInfo);
}

async function save() {
  const enabled = $("updatesEnabled").checked;
  const repo = $("repo").value.trim();

  await storageSet({
    updateChecks: { enabled, repo },
  });

  // Kick an immediate check (background will ignore if disabled)
  const info = await sendMessage({ type: "CHECK_UPDATES_NOW" });
  renderStatus(info);
}

async function checkNow() {
  const info = await sendMessage({ type: "CHECK_UPDATES_NOW" });
  renderStatus(info);
}

async function openRelease() {
  const url = $("openRelease").dataset.url;
  if (!url) return;
  await sendMessage({ type: "OPEN_URL", url });
}

async function resetBubblePosition() {
  await storageSet({ fabPosition: null });
  $("status").textContent = "Bubble position reset. Reload a Zendesk ticket tab to re-place it.";
}

document.addEventListener("DOMContentLoaded", () => {
  load().catch(() => {});

  $("save").addEventListener("click", () => save().catch(() => {}));
  $("checkNow").addEventListener("click", () => checkNow().catch(() => {}));
  $("openRelease").addEventListener("click", () => openRelease().catch(() => {}));
  $("resetPos").addEventListener("click", () => resetBubblePosition().catch(() => {}));
});
