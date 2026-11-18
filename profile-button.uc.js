// ==UserScript==
// @name           Profile Button
// @description    Adds a profiles button to the Zen toolbar. Click it to switch, create or manage profiles.
// @author         Jprdgza
// @version        1.0.0
// @include        chrome://browser/content/browser.xhtml
// ==/UserScript==

(() => {
  "use strict";

  const WIDGET_ID = "zen-profile-button";
  const AVATAR_PREF = "zen-profile-button.show-avatar";
  const DEFAULT_AREA = "zen-sidebar-top-buttons";

  // Bundled with the mod; Sine serves the mod folder at chrome://sine/content/<id>/.
  // Being a chrome:// file lets the icon follow the toolbar's icon color.
  const PERSON_ICON = `chrome://sine/content/${WIDGET_ID}/person.svg`;

  const getService = (win) => {
    const sps = win.SelectableProfileService;
    return sps?.isEnabled ? sps : null;
  };

  async function updateIcon(node) {
    const win = node.ownerDocument.defaultView;
    let icon = PERSON_ICON;
    let label = null;
    try {
      const sps = getService(win);
      const current = sps?.initialized ? sps.currentProfile : null;
      if (current) {
        label = current.name;
        if (Services.prefs.getBoolPref(AVATAR_PREF, false)) {
          icon = await current.getAvatarURL(16);
        }
      }
    } catch (e) {
      console.warn("[Profile Button] Could not read the current profile:", e);
    }
    node.setAttribute("image", icon);
    node.setAttribute(
      "tooltiptext",
      label ? `Profiles (current: ${label})` : "Profiles",
    );
    node.toggleAttribute("profile-avatar", icon !== PERSON_ICON);
  }

  async function openProfiles(node) {
    const win = node.ownerDocument.defaultView;
    const sps = getService(win);

    // Profiles turned off in this build: fall back to the classic manager.
    if (!sps || !win.gProfiles) {
      win.openTrustedLinkIn("about:profiles", "tab");
      return;
    }

    const profiles = sps.initialized ? await sps.getAllProfiles() : [];
    if (!profiles.length) {
      // No profiles created yet: show Firefox's "create a profile" view.
      win.PanelUI.showSubView("PanelUI-fxa-menu-create-profile", node);
      return;
    }

    await win.gProfiles.populateSubView();
    win.PanelUI.showSubView("PanelUI-profiles", node);
  }

  function createWidget() {
    // The widget is shared by every window, so only create it once.
    if (
      CustomizableUI.getWidget(WIDGET_ID)?.provider ===
      CustomizableUI.PROVIDER_API
    ) {
      return;
    }
    CustomizableUI.createWidget({
      id: WIDGET_ID,
      type: "button",
      defaultArea: DEFAULT_AREA,
      label: "Profiles",
      tooltiptext: "Profiles",
      onCreated(node) {
        node.classList.add("toolbarbutton-1", "chromeclass-toolbar-additional");
        // Keep it visible in the narrow top-left area instead of hiding it in the "⋯" menu.
        node.setAttribute("overflows", "false");
        updateIcon(node);
      },
      onCommand(event) {
        openProfiles(event.target).catch((e) =>
          console.error("[Profile Button] Could not open profiles:", e),
        );
      },
    });
  }

  function refreshThisWindow() {
    const node = document.getElementById(WIDGET_ID);
    if (node) updateIcon(node);
  }

  function init() {
    createWidget();

    // Keep the icon in sync with the avatar setting and with profile edits.
    const prefObserver = () => refreshThisWindow();
    Services.prefs.addObserver(AVATAR_PREF, prefObserver);

    const sps = window.SelectableProfileService;
    const profileListener = () => refreshThisWindow();
    Services.obs.addObserver(profileListener, "sps-profiles-updated");
    sps?.on?.("enableChanged", profileListener);

    window.addEventListener(
      "unload",
      () => {
        Services.prefs.removeObserver(AVATAR_PREF, prefObserver);
        Services.obs.removeObserver(profileListener, "sps-profiles-updated");
        sps?.off?.("enableChanged", profileListener);
      },
      { once: true },
    );

    refreshThisWindow();
  }

  if (window.gBrowserInit?.delayedStartupFinished) {
    init();
  } else {
    const observer = (subject) => {
      if (subject === window) {
        Services.obs.removeObserver(
          observer,
          "browser-delayed-startup-finished",
        );
        init();
      }
    };
    Services.obs.addObserver(observer, "browser-delayed-startup-finished");
  }
})();
