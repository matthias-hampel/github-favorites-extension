(() => {
  const BAR_ID = "gh-fav-bar";

  // GitHub's own plus icon (octicon-plus), used elsewhere in their header —
  // reused here so our button matches natively instead of a text glyph
  // that never quite centers right.
  const PLUS_ICON_SVG = `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"></path></svg>`;

  function parseOwnerRepo(text) {
    const trimmed = text.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\/+$/, "");
    const match = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
  }

  function getFavorites() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(["favorites"], (data) => {
        resolve(Array.isArray(data.favorites) ? data.favorites : []);
      });
    });
  }

  function saveFavorites(favorites) {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ favorites }, resolve);
    });
  }

  function findAnchor() {
    // The sitewide header — present on every github.com page, so anchoring
    // here (rather than to a page-specific tabs nav) means the bar shows
    // up everywhere consistently.
    return document.querySelector('header[role="banner"]');
  }

  // Each favorite is its own separate chip — not joined into one shared
  // pill — so the add control (see below) can swap itself for a bare
  // input without dragging the rest of the row's box/border along with it.
  function buildChip(fav, favorites, onChange) {
    const chip = document.createElement("a");
    chip.className = "gh-fav-chip";
    chip.href = `https://github.com/${fav.owner}/${fav.repo}`;
    chip.title = `${fav.owner}/${fav.repo}`;
    chip.draggable = true;

    const label = document.createElement("span");
    label.className = "gh-fav-chip-label";
    label.textContent = `${fav.owner}/${fav.repo}`;
    chip.appendChild(label);

    const remove = document.createElement("span");
    remove.className = "gh-fav-chip-remove";
    remove.textContent = "×";
    remove.title = "Remove favorite";
    remove.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const latest = await getFavorites();
      const next = latest.filter(
        (f) => !(f.owner === fav.owner && f.repo === fav.repo)
      );
      await saveFavorites(next);
      onChange(next);
    });
    chip.appendChild(remove);

    // Reordering: drag a chip onto another one to swap its position.
    // Dragged identity travels as JSON via dataTransfer rather than an
    // array index, since indices can shift between dragstart and drop.
    chip.addEventListener("dragstart", (e) => {
      chip.classList.add("gh-fav-chip--dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(
        "application/x-gh-favorite",
        JSON.stringify({ owner: fav.owner, repo: fav.repo })
      );
    });
    chip.addEventListener("dragend", () => {
      chip.classList.remove("gh-fav-chip--dragging");
    });
    chip.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      chip.classList.add("gh-fav-chip--drop-target");
    });
    chip.addEventListener("dragleave", () => {
      chip.classList.remove("gh-fav-chip--drop-target");
    });
    chip.addEventListener("drop", async (e) => {
      e.preventDefault();
      chip.classList.remove("gh-fav-chip--drop-target");
      const raw = e.dataTransfer.getData("application/x-gh-favorite");
      if (!raw) return;
      let dragged;
      try {
        dragged = JSON.parse(raw);
      } catch {
        return;
      }
      if (dragged.owner === fav.owner && dragged.repo === fav.repo) return;

      const latest = await getFavorites();
      const fromIndex = latest.findIndex(
        (f) => f.owner === dragged.owner && f.repo === dragged.repo
      );
      const toIndex = latest.findIndex(
        (f) => f.owner === fav.owner && f.repo === fav.repo
      );
      if (fromIndex === -1 || toIndex === -1) return;

      const next = [...latest];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      await saveFavorites(next);
      onChange(next);
    });

    return chip;
  }

  // A single box that shows either the "+" button or, once clicked, just
  // the input — never both, and never wrapped in extra chrome. Cancelling
  // (Escape / blur / click away) re-renders with the same favorites list,
  // which naturally puts the button back.
  function buildAddControl(favorites, onChange) {
    const wrap = document.createElement("div");
    wrap.className = "gh-fav-add-wrap";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gh-fav-add-btn";
    btn.title = "Add favorite repository";
    btn.innerHTML = PLUS_ICON_SVG;

    btn.addEventListener("click", () => {
      wrap.classList.add("gh-fav-add-wrap--editing");
      wrap.innerHTML = "";

      const form = document.createElement("form");
      form.className = "gh-fav-add-form";

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "owner/repo";
      input.className = "gh-fav-add-input";
      form.appendChild(input);

      const errorEl = document.createElement("span");
      errorEl.className = "gh-fav-add-error";
      form.appendChild(errorEl);

      // Tracks whether the form has already been resolved (successful
      // submit or Escape), so the blur handler below doesn't fire its
      // delayed revert after the fact using its now-stale favorites list.
      let settled = false;

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const parsed = parseOwnerRepo(input.value);
        if (!parsed) {
          errorEl.textContent = "Use owner/repo";
          return;
        }
        // Re-read from storage rather than trusting the favorites array
        // captured when this control was built — it may be stale if a
        // favorite was added elsewhere (another tab, the popup) since
        // then, which is exactly what let duplicates slip through before.
        const latest = await getFavorites();
        const exists = latest.some(
          (f) => f.owner.toLowerCase() === parsed.owner.toLowerCase() &&
                 f.repo.toLowerCase() === parsed.repo.toLowerCase()
        );
        if (exists) {
          errorEl.textContent = "Already added";
          return;
        }
        const next = [...latest, parsed];
        await saveFavorites(next);
        settled = true;
        onChange(next);
      });

      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          settled = true;
          onChange(favorites);
        }
      });
      input.addEventListener("blur", () => {
        // slight delay so a submit click isn't cancelled by the blur first
        setTimeout(() => {
          if (!settled && document.activeElement !== input) {
            onChange(favorites);
          }
        }, 150);
      });

      wrap.appendChild(form);
      input.focus();
    });

    wrap.appendChild(btn);
    return wrap;
  }

  function render(favorites) {
    const anchor = findAnchor();
    if (!anchor) return;

    let bar = document.getElementById(BAR_ID);
    if (!bar) {
      bar = document.createElement("div");
      bar.id = BAR_ID;
      anchor.insertAdjacentElement("afterend", bar);
    } else if (bar.previousElementSibling !== anchor) {
      // Header was replaced by Turbo; make sure our bar is still right after it.
      anchor.insertAdjacentElement("afterend", bar);
    }
    bar.innerHTML = "";

    const rerender = (newFavorites) => render(newFavorites);

    favorites.forEach((fav) => {
      bar.appendChild(buildChip(fav, favorites, rerender));
    });
    bar.appendChild(buildAddControl(favorites, rerender));
  }

  async function init() {
    if (!findAnchor()) return;
    const favorites = await getFavorites();
    render(favorites);
  }

  // GitHub uses Turbo for navigation, so the page doesn't always do a full
  // reload when moving around. Re-run init on those events so the bar
  // survives client-side navigation.
  document.addEventListener("turbo:load", init);
  document.addEventListener("turbo:render", init);
  window.addEventListener("popstate", () => setTimeout(init, 50));

  // Belt-and-suspenders: re-sync whenever the tab regains focus, in case a
  // favorite was added/removed via the popup while this tab was in the
  // background and the storage event above didn't get here in time.
  window.addEventListener("focus", init);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") init();
  });

  // Fallback: watch for the header being replaced entirely by Turbo.
  const observer = new MutationObserver(() => {
    if (!document.getElementById(BAR_ID) && findAnchor()) {
      init();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.favorites) {
      init();
    }
  });

  // Direct message from the popup — a second, more immediate path to the
  // same effect as the storage event above, in case that one is ever
  // delayed or missed.
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.type === "gh-favorites-updated") {
        init();
      }
    });
  }

  init();
})();
