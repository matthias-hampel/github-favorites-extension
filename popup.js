const favListEl = document.getElementById("fav-list");
const emptyStateEl = document.getElementById("empty-state");
const addFormEl = document.getElementById("add-form");
const addInputEl = document.getElementById("add-input");
const addErrorEl = document.getElementById("add-error");
const currentRepoSectionEl = document.getElementById("current-repo-section");
const currentRepoLabelEl = document.getElementById("current-repo-label");
const addCurrentBtnEl = document.getElementById("add-current-btn");

let favorites = [];
let currentRepo = null;

function parseOwnerRepo(text) {
  const trimmed = text.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\/+$/, "");
  const match = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

function load() {
  chrome.storage.sync.get(["favorites"], (data) => {
    favorites = Array.isArray(data.favorites) ? data.favorites : [];
    renderList();
  });
}

function save() {
  chrome.storage.sync.set({ favorites }, notifyOpenTabs);
}

function notifyOpenTabs() {
  // Belt-and-suspenders alongside the storage.onChanged listener in
  // content.js: message every open github.com tab directly so the bar
  // updates immediately, without relying solely on the storage event
  // (which is usually instant, but this removes any doubt).
  if (!chrome.tabs) return;
  chrome.tabs.query({ url: "https://github.com/*" }, (tabs) => {
    (tabs || []).forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, { type: "gh-favorites-updated" }, () => {
        // Ignore errors from tabs that don't have our content script
        // (e.g. github.com pages that failed to load it) — reading
        // lastError here just prevents it from being logged as unhandled.
        void chrome.runtime.lastError;
      });
    });
  });
}

function renderList() {
  favListEl.innerHTML = "";
  emptyStateEl.hidden = favorites.length > 0;

  favorites.forEach((fav, index) => {
    const li = document.createElement("li");
    li.className = "fav-item";
    li.draggable = true;

    const link = document.createElement("a");
    link.href = `https://github.com/${fav.owner}/${fav.repo}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `${fav.owner}/${fav.repo}`;
    li.appendChild(link);

    li.addEventListener("dragstart", (e) => {
      li.classList.add("fav-item--dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
    });
    li.addEventListener("dragend", () => {
      li.classList.remove("fav-item--dragging");
    });
    li.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      li.classList.add("fav-item--drop-target");
    });
    li.addEventListener("dragleave", () => {
      li.classList.remove("fav-item--drop-target");
    });
    li.addEventListener("drop", (e) => {
      e.preventDefault();
      li.classList.remove("fav-item--drop-target");
      const fromIndex = Number(e.dataTransfer.getData("text/plain"));
      if (Number.isNaN(fromIndex) || fromIndex === index) return;
      const next = [...favorites];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(index, 0, moved);
      favorites = next;
      save();
      renderList();
    });

    const removeBtn = document.createElement("button");
    removeBtn.className = "fav-remove";
    removeBtn.textContent = "×";
    removeBtn.title = "Remove";
    removeBtn.addEventListener("click", () => {
      chrome.storage.sync.get(["favorites"], (data) => {
        const latest = Array.isArray(data.favorites) ? data.favorites : [];
        favorites = latest.filter(
          (f) => !(f.owner === fav.owner && f.repo === fav.repo)
        );
        save();
        renderList();
      });
    });
    li.appendChild(removeBtn);

    favListEl.appendChild(li);
  });
}

function addFavorite(parsed) {
  return new Promise((resolve) => {
    // Re-read fresh rather than trusting the in-memory `favorites` array,
    // which could be stale if something was added on the page itself
    // since the popup opened.
    chrome.storage.sync.get(["favorites"], (data) => {
      const latest = Array.isArray(data.favorites) ? data.favorites : [];
      const exists = latest.some(
        (f) => f.owner.toLowerCase() === parsed.owner.toLowerCase() &&
               f.repo.toLowerCase() === parsed.repo.toLowerCase()
      );
      if (exists) {
        addErrorEl.textContent = "Already added";
        resolve(false);
        return;
      }
      favorites = [...latest, parsed];
      save();
      renderList();
      resolve(true);
    });
  });
}

addFormEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  addErrorEl.textContent = "";
  const parsed = parseOwnerRepo(addInputEl.value);
  if (!parsed) {
    addErrorEl.textContent = "Use the format owner/repo";
    return;
  }
  if (await addFavorite(parsed)) {
    addInputEl.value = "";
  }
});

function detectCurrentRepo(url) {
  if (!url) return null;
  let path;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const RESERVED = new Set([
    "settings", "notifications", "issues", "pulls", "marketplace",
    "sponsors", "topics", "trending", "search", "explore", "orgs",
    "codespaces", "new", "login", "join", "about", "pricing", "features",
    "collections", "events", "readme", "security", "apps"
  ]);
  if (RESERVED.has(parts[0].toLowerCase())) return null;
  return { owner: parts[0], repo: parts[1] };
}

function initCurrentRepoSection() {
  if (!chrome.tabs) return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.url || !/^https:\/\/github\.com\//i.test(tab.url)) return;
    const repo = detectCurrentRepo(tab.url);
    if (!repo) return;
    currentRepo = repo;
    currentRepoLabelEl.textContent = `${repo.owner}/${repo.repo}`;
    currentRepoSectionEl.hidden = false;
  });
}

addCurrentBtnEl.addEventListener("click", async () => {
  if (!currentRepo) return;
  addErrorEl.textContent = "";
  if (await addFavorite(currentRepo)) {
    currentRepoSectionEl.hidden = true;
  }
});

load();
initCurrentRepoSection();
