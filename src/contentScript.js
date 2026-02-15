/* VRC Quick Open (Zendesk) - content script */

(() => {
  const ROOT_ID = "vrc-fab-root";
  if (document.getElementById(ROOT_ID)) return;

  const BUBBLE_SIZE = 56;
  const OPTION_SIZE = 44;
  const EDGE_MARGIN = 16;
  const TOP_BOTTOM_MARGIN = 8;
  const DRAG_THRESHOLD_PX = 6;

  const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

  const storageGet = (defaultsObj) =>
    new Promise((resolve) => chrome.storage.sync.get(defaultsObj, resolve));
  const storageSet = (items) =>
    new Promise((resolve) => chrome.storage.sync.set(items, resolve));

  // ---- UI (Shadow DOM) ----
  const host = document.createElement("div");
  host.id = ROOT_ID;

  // Keep it isolated from page CSS.
  host.style.position = "fixed";
  host.style.zIndex = "2147483647";
  host.style.width = `${BUBBLE_SIZE}px`;
  host.style.height = `${BUBBLE_SIZE}px`;
  host.style.top = "50%";
  host.style.right = `${EDGE_MARGIN}px`;
  host.style.left = "auto";

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
    .wrapper { position: relative; width: ${BUBBLE_SIZE}px; height: ${BUBBLE_SIZE}px; }
    .wrapper[data-side="left"] { transform-origin: left center; }
    .wrapper[data-side="right"] { transform-origin: right center; }

    button { -webkit-tap-highlight-color: transparent; }

    .fab {
      width: ${BUBBLE_SIZE}px;
      height: ${BUBBLE_SIZE}px;
      border-radius: 9999px;
      border: none;
      cursor: pointer;
      background: #008417;
      color: #ffffff;
      box-shadow: 0 10px 25px rgba(0,0,0,0.24);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      user-select: none;
      touch-action: none;
      transition: transform 140ms ease, box-shadow 140ms ease, outline 140ms ease;
      outline: none;
    }
    .fab:hover { transform: translateY(-1px); box-shadow: 0 14px 30px rgba(0,0,0,0.28); }
    .fab:active { transform: translateY(0px); }

    .fab.error { animation: shake 420ms ease; box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.35), 0 10px 25px rgba(0,0,0,0.24); }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-3px); }
      50% { transform: translateX(3px); }
      75% { transform: translateX(-2px); }
    }

    .menu {
      position: absolute;
      display: flex;
      flex-direction: column;
      gap: 10px;
      opacity: 0;
      pointer-events: none;
      transform: translateY(6px) scale(0.98);
      transition: opacity 160ms ease, transform 160ms ease;
      filter: drop-shadow(0 10px 18px rgba(0,0,0,0.18));
    }

    .wrapper[data-open="true"] .menu {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0px) scale(1);
    }

    .wrapper[data-direction="up"] .menu {
      bottom: calc(100% + 10px);
      right: 0;
      transform-origin: bottom right;
    }
    .wrapper[data-direction="down"] .menu {
      top: calc(100% + 10px);
      right: 0;
      transform-origin: top right;
    }

    .wrapper[data-side="left"][data-direction="up"] .menu,
    .wrapper[data-side="left"][data-direction="down"] .menu {
      left: 0;
      right: auto;
    }

    .option {
      width: ${OPTION_SIZE}px;
      height: ${OPTION_SIZE}px;
      border-radius: 9999px;
      border: 1px solid rgba(17, 24, 39, 0.10);
      background: #ffffff;
      color: #111827;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: transform 140ms ease, box-shadow 140ms ease;
      box-shadow: 0 10px 18px rgba(0,0,0,0.12);
    }
    .option:hover { transform: translateY(-1px); box-shadow: 0 14px 22px rgba(0,0,0,0.14); }
    .option:active { transform: translateY(0px); }

    .icon { width: 22px; height: 22px; display: block; }
    .tooltip {
      position: absolute;
      background: rgba(17,24,39,0.95);
      color: #fff;
      padding: 6px 8px;
      border-radius: 6px;
      font-size: 12px;
      line-height: 1;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transform: translateY(2px);
      transition: opacity 120ms ease, transform 120ms ease;
      z-index: 3;
    }
    .tooltip[data-visible="true"] { opacity: 1; transform: translateY(0); }
  `;

  const wrapper = document.createElement("div");
  wrapper.className = "wrapper";
  wrapper.dataset.side = "right";
  wrapper.dataset.open = "false";
  wrapper.dataset.direction = "up";

  const fab = document.createElement("button");
  fab.className = "fab";
  fab.type = "button";
  fab.title = "Open VRC menu";
  fab.setAttribute("aria-label", "Open VRC menu");
  fab.innerHTML = `
    <svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7.5C4 6.12 5.12 5 6.5 5h11C18.88 5 20 6.12 20 7.5v9c0 1.38-1.12 2.5-2.5 2.5h-11C5.12 19 4 17.88 4 16.5v-9Z" stroke="currentColor" stroke-width="1.8"/>
      <path d="M7 9h10M7 12h7M7 15h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

  const menu = document.createElement("div");
  menu.className = "menu";

  const btnStandard = document.createElement("button");
  btnStandard.className = "option";
  btnStandard.type = "button";
  btnStandard.title = "Open without payments";
  btnStandard.setAttribute("aria-label", "Open without payments");
  btnStandard.innerHTML = `
    <svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 12c2.21 0 4-1.79 4-4S14.21 4 12 4 8 5.79 8 8s1.79 4 4 4Z" stroke="currentColor" stroke-width="1.8"/>
      <path d="M4.5 20c1.5-4 13.5-4 15 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

  const btnPayments = document.createElement("button");
  btnPayments.className = "option";
  btnPayments.type = "button";
  btnPayments.title = "Open with payments";
  btnPayments.setAttribute("aria-label", "Open with payments");
  btnPayments.innerHTML = `
    <svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3.5 8.5c0-1.66 1.34-3 3-3h11c1.66 0 3 1.34 3 3v7c0 1.66-1.34 3-3 3h-11c-1.66 0-3-1.34-3-3v-7Z" stroke="currentColor" stroke-width="1.8"/>
      <path d="M3.5 10.5h17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M7 15h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

  menu.appendChild(btnPayments);
  menu.appendChild(btnStandard);

  // Tooltip element for option buttons (in shadow DOM so native title tooltips don't rely on host)
  const tooltip = document.createElement("div");
  tooltip.className = "tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.dataset.visible = "false";
  wrapper.appendChild(tooltip);

  wrapper.appendChild(menu);
  wrapper.appendChild(fab);

  shadow.appendChild(style);
  shadow.appendChild(wrapper);

  document.documentElement.appendChild(host);

  // ---- Positioning & persistence ----
  function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
  }

  function applyPosition({ side, top }) {
    const clampedTop = clamp(
      top,
      TOP_BOTTOM_MARGIN,
      window.innerHeight - BUBBLE_SIZE - TOP_BOTTOM_MARGIN,
    );
    host.style.top = `${clampedTop}px`;

    if (side === "left") {
      host.style.left = `${EDGE_MARGIN}px`;
      host.style.right = "auto";
    } else {
      host.style.right = `${EDGE_MARGIN}px`;
      host.style.left = "auto";
    }

    wrapper.dataset.side = side;
    storageSet({ fabPosition: { side, top: clampedTop } }).catch(() => {});
  }

  async function loadPosition() {
    const { fabPosition } = await storageGet({ fabPosition: null });
    if (
      !fabPosition ||
      (fabPosition.side !== "left" && fabPosition.side !== "right")
    ) {
      applyPosition({
        side: "right",
        top: Math.max(80, window.innerHeight / 2 - BUBBLE_SIZE / 2),
      });
      return;
    }
    applyPosition({
      side: fabPosition.side,
      top: Number(fabPosition.top) || 100,
    });
  }

  loadPosition().catch(() => {});

  window.addEventListener("resize", async () => {
    const { fabPosition } = await storageGet({ fabPosition: null });
    if (!fabPosition) return;
    applyPosition({
      side: fabPosition.side,
      top: Number(fabPosition.top) || 100,
    });
  });

  // ---- Menu open/close ----
  let isMenuOpen = false;

  function computeMenuDirection() {
    const rect = host.getBoundingClientRect();
    const needed = OPTION_SIZE * 2 + 10 + 10; // options + gaps + a little buffer
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceAbove >= needed) return "up";
    if (spaceBelow >= needed) return "down";
    return spaceBelow >= spaceAbove ? "down" : "up";
  }

  function openMenu() {
    wrapper.dataset.direction = computeMenuDirection();
    wrapper.dataset.open = "true";
    isMenuOpen = true;
  }

  function closeMenu() {
    wrapper.dataset.open = "false";
    isMenuOpen = false;
  }

  function toggleMenu() {
    if (isMenuOpen) closeMenu();
    else openMenu();
  }

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!isMenuOpen) return;
      const path = e.composedPath ? e.composedPath() : [];
      if (path.includes(host)) return;
      closeMenu();
    },
    true,
  );

  // ---- Email extraction ----
  function sanitizeEmail(email) {
    let out = String(email || "").trim();

    // Remove common label prefixes like "Email:" or "E-mail:"
    out = out.replace(/^(e-?mail)[:\s]*/i, "");

    // If the label got concatenated with the address (e.g. "Emailjohn@doe.com"),
    // strip a leading "Email" if that produces a valid email.
    if (/^email/i.test(out)) {
      const stripped = out.replace(/^email/i, "");
      if (EMAIL_RE.test(stripped)) out = stripped;
    }

    // Trim trailing punctuation/spaces
    out = out.replace(/[),.;:\s]+$/g, "");

    // If still not a clean email, try extracting a valid substring.
    if (!EMAIL_RE.test(out)) {
      const match = out.match(EMAIL_RE);
      if (match) out = match[0];
    }

    return out;
  }

  function extractEmailFromNode(node) {
    if (!node) return null;

    const mailto = node.querySelector?.('a[href^="mailto:"]');
    if (mailto) {
      const href = mailto.getAttribute("href") || "";
      const candidate = href.replace(/^mailto:/i, "").split("?")[0];
      if (EMAIL_RE.test(candidate)) return sanitizeEmail(candidate);
    }

    const text = node.textContent || "";
    const match = text.match(EMAIL_RE);
    return match ? sanitizeEmail(match[0]) : null;
  }

  function getTicketEmailNow() {
    const label = document.querySelector('span[title="Email"]');
    if (!label) return null;

    // If the span itself contains the email (as described), this will capture it.
    let email = extractEmailFromNode(label);
    if (email) return email;

    const container =
      label.closest("[data-test-id], li, dd, div, section, article") ||
      label.parentElement;

    email = extractEmailFromNode(container);
    if (email) return email;

    if (label.nextElementSibling) {
      email = extractEmailFromNode(label.nextElementSibling);
      if (email) return email;
    }

    if (label.parentElement?.nextElementSibling) {
      email = extractEmailFromNode(label.parentElement.nextElementSibling);
      if (email) return email;
    }

    // Walk up a few levels near the label (Zendesk markup can vary).
    let p = label.parentElement;
    for (let i = 0; i < 4 && p; i++) {
      email = extractEmailFromNode(p);
      if (email) return email;
      p = p.parentElement;
    }

    return null;
  }

  function waitForTicketEmail(timeoutMs = 3000) {
    const existing = getTicketEmailNow();
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve) => {
      const obs = new MutationObserver(() => {
        const email = getTicketEmailNow();
        if (email) {
          obs.disconnect();
          resolve(email);
        }
      });

      obs.observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
      });

      setTimeout(() => {
        obs.disconnect();
        resolve(null);
      }, timeoutMs);
    });
  }

  function flashError() {
    fab.classList.add("error");
    fab.title = "Email not found on this ticket";
    setTimeout(() => {
      fab.classList.remove("error");
      fab.title = "Open VRC menu";
    }, 700);
  }

  async function openVrc(includePayments) {
    closeMenu();
    const email = await waitForTicketEmail(3500);
    if (!email) {
      flashError();
      return;
    }
    chrome.runtime.sendMessage({ type: "OPEN_VRC", email, includePayments });
  }

  btnStandard.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openVrc(false);
  });

  btnPayments.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openVrc(true);
  });

  // Tooltip helpers
  function showOptionTooltip(btn, text) {
    if (!btn || !text) return;
    tooltip.textContent = text;
    // Temporarily make visible to measure
    tooltip.dataset.visible = "false";
    tooltip.style.left = "0px";
    tooltip.style.top = "0px";
    // Allow layout
    requestAnimationFrame(() => {
      const btnRect = btn.getBoundingClientRect();
      const wrapRect = wrapper.getBoundingClientRect();
      const ttRect = tooltip.getBoundingClientRect();

      // Default: show to the right of the button
      let left = btnRect.right - wrapRect.left + 8;
      // If wrapper is on the right side, show to the left
      if (wrapper.dataset.side === "right") {
        left = btnRect.left - wrapRect.left - ttRect.width - 8;
      }
      // Vertically center on the button
      const top =
        btnRect.top - wrapRect.top + (btnRect.height - ttRect.height) / 2;

      tooltip.style.left = `${Math.round(left)}px`;
      tooltip.style.top = `${Math.round(top)}px`;
      tooltip.dataset.visible = "true";
    });
  }

  function hideOptionTooltip() {
    tooltip.dataset.visible = "false";
  }

  // Show custom tooltip on hover (pointerenter/leave) and hide on pointerdown
  [btnStandard, btnPayments].forEach((b) => {
    b.addEventListener("pointerenter", (e) => {
      const txt = b.getAttribute("title") || b.getAttribute("aria-label") || "";
      showOptionTooltip(b, txt);
    });
    b.addEventListener("pointerleave", hideOptionTooltip);
    b.addEventListener("pointercancel", hideOptionTooltip);
    b.addEventListener("pointerdown", hideOptionTooltip);
  });

  // ---- Dragging ----
  let pointerDown = false;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let offsetX = 0;
  let offsetY = 0;

  fab.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    pointerDown = true;
    dragging = false;
    startX = e.clientX;
    startY = e.clientY;

    const rect = host.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    fab.setPointerCapture?.(e.pointerId);
  });

  fab.addEventListener("pointermove", (e) => {
    if (!pointerDown) return;

    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);

    if (!dragging && dx + dy >= DRAG_THRESHOLD_PX) {
      dragging = true;
      closeMenu();
    }
    if (!dragging) return;

    const left = clamp(e.clientX - offsetX, 0, window.innerWidth - BUBBLE_SIZE);
    const top = clamp(
      e.clientY - offsetY,
      TOP_BOTTOM_MARGIN,
      window.innerHeight - BUBBLE_SIZE - TOP_BOTTOM_MARGIN,
    );

    host.style.left = `${left}px`;
    host.style.right = "auto";
    host.style.top = `${top}px`;
  });

  async function onPointerUp(e) {
    if (!pointerDown) return;
    pointerDown = false;

    if (!dragging) {
      // It was a click, not a drag
      toggleMenu();
      return;
    }

    dragging = false;

    const rect = host.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const side = centerX < window.innerWidth / 2 ? "left" : "right";
    const top = rect.top;

    applyPosition({ side, top });
  }

  fab.addEventListener("pointerup", onPointerUp);
  fab.addEventListener("pointercancel", onPointerUp);
})();
