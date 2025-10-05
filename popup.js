const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/* Elements */
const memoryListEl = $("#memoryList");
const addBtn = $("#addBtn");
const newText = $("#newText");
const newTag = $("#newTag");
const pinOnAdd = $("#pinOnAdd");
const clearAllBtn = $("#clearAll");
const searchInput = $("#search");
const exportBtn = $("#exportBtn");
const importBtn = $("#importBtn");
const importFile = $("#importFile");
const duplicateBtn = $("#duplicateBtn");
const mergeBtn = $("#mergeBtn");
const tagBar = $("#tagBar");
const viewToggle = $("#viewToggle");
const groupToggle = $("#groupToggle");
const listContainer = $("#listContainer");
const settingsBtn = $("#settingsBtn");
const settingsModal = $("#settingsModal");
const closeSettings = $("#closeSettings");
const saveSettings = $("#saveSettings");
const themeSelect = $("#themeSelect");
const accentColor = $("#accentColor");
const fontSizeInput = $("#fontSize");

const githubSettingsBtn = $("#githubSettingsBtn");
const githubModal = $("#githubModal");
const githubOwner = $("#githubOwner");
const githubRepo = $("#githubRepo");
const githubPath = $("#githubPath");
const githubToken = $("#githubToken");
const saveGithubSettings = $("#saveGithubSettings");
const closeGithubModal = $("#closeGithubModal");
const syncStatus = $("#syncStatus");
const testGithubConnection = $("#testGithubConnection");

/* state */
let activeTag = null;
let listView = true;
let groupBy = null;
let settings = { theme: "gradient", accent: "#2ea6ff", fontSize: 13 };

let githubConfig = {
  owner: "",
  repo: "",
  path: "memory.json",
  token: "",
};

async function getFileSHA() {
  try {
    const endpoint = `/repos/${githubConfig.owner}/${githubConfig.repo}/contents/${githubConfig.path}`;
    const fileInfo = await githubAPI(endpoint);
    return fileInfo.sha;
  } catch (error) {
    if (error.message.includes("404")) {
      return null;
    }

    throw error;
  }
}

async function saveToGitHub(data) {
  const dataWithoutImageData = data.map((item) => {
    if (item.type === "image") {
      const { meta, ...rest } = item;
      const { imageData, ...metaWithoutImageData } = meta || {};
      return {
        ...rest,
        meta: {
          ...metaWithoutImageData,
          imageStored: false,
        },
      };
    }
    return item;
  });

  if (!Array.isArray(dataWithoutImageData)) {
    console.error("Attempted to save non-array data to GitHub");
    dataWithoutImageData = [];
  }

  if (!githubConfig.owner || !githubConfig.repo || !githubConfig.token) {
    console.error("GitHub not configured properly");
    throw new Error("GitHub configuration incomplete");
  }

  const sha = await getFileSHA();
  const content = btoa(
    unescape(encodeURIComponent(JSON.stringify(dataWithoutImageData, null, 2)))
  );

  const endpoint = `/repos/${githubConfig.owner}/${githubConfig.repo}/contents/${githubConfig.path}`;
  const message = `Update memory data - ${new Date().toISOString()}`;

  return githubAPI(endpoint, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content,
      sha,
    }),
  });
}

async function loadFromGitHub() {
  try {
    const endpoint = `/repos/${githubConfig.owner}/${githubConfig.repo}/contents/${githubConfig.path}`;
    const fileInfo = await githubAPI(endpoint);
    const content = decodeURIComponent(escape(atob(fileInfo.content)));

    if (!content.trim()) {
      console.log("File is empty, returning empty array");
      return [];
    }

    try {
      return JSON.parse(content);
    } catch (parseError) {
      console.error("Invalid JSON in GitHub file:", parseError);

      return [];
    }
  } catch (error) {
    if (error.message.includes("404")) {
      console.log("No existing file on GitHub, starting fresh");
      return [];
    }
    console.error("Failed to load from GitHub:", error);
    throw error;
  }
}

async function verifyRepositoryAccess() {
  try {
    const endpoint = `/repos/${githubConfig.owner}/${githubConfig.repo}`;
    const repoInfo = await githubAPI(endpoint);
    console.log("Repository access verified:", repoInfo.full_name);
    return true;
  } catch (error) {
    console.error("Repository access failed:", error);

    if (error.message.includes("404")) {
      throw new Error(
        `Repository not found: ${githubConfig.owner}/${githubConfig.repo}. Please create it first.`
      );
    } else if (error.message.includes("403")) {
      throw new Error(
        'Permission denied. Please check your personal access token has "repo" permissions.'
      );
    }

    throw error;
  }
}

/* utils */
function uid() {
  return Date.now().toString() + Math.floor(Math.random() * 1000);
}
function randomColor() {
  const h = Math.floor(Math.random() * 360);
  const s = 60 + Math.floor(Math.random() * 20);
  const l = 45 + Math.floor(Math.random() * 10);
  return `hsl(${h} ${s}% ${l}%)`;
}
function formatDate(iso) {
  return new Date(iso).toLocaleString();
}
function applySettings() {
  document.documentElement.style.setProperty("--accent", settings.accent);
  document.documentElement.style.setProperty(
    "--font-size",
    settings.fontSize + "px"
  );

  listView = settings.listView !== false;
  updateLayoutView();

  if (settings.theme === "light") {
    document.body.style.background = "linear-gradient(135deg,#f4f7fb,#e9eef7)";
    document.body.style.color = "#111";
  } else if (settings.theme === "dark") {
    document.body.style.background = "linear-gradient(135deg,#050607,#0b0c0d)";
    document.body.style.color = "#e6eef6";
  } else {
    document.body.style.background =
      "linear-gradient(135deg,var(--bg1),var(--bg2))";
    document.body.style.color = "#e6eef6";
  }
}
function updateLayoutView() {
  if (listView) {
    listContainer.classList.remove("grid-view");
    listContainer.classList.add("list-view");
    viewToggle.textContent = "▦";
  } else {
    listContainer.classList.remove("list-view");
    listContainer.classList.add("grid-view");
    viewToggle.textContent = "≡";
  }
}
/* storage helpers */
function getMemory(cb) {
  chrome.storage.local.get(
    { memory: [], settings: {}, githubConfig: {} },
    async (res) => {
      if (res.settings) settings = Object.assign(settings, res.settings);
      if (res.githubConfig)
        githubConfig = Object.assign(githubConfig, res.githubConfig);
      listView = settings.listView !== false;

      if (githubConfig.owner && githubConfig.repo && githubConfig.token) {
        try {
          const githubMemory = await loadFromGitHub();
          if (githubMemory.length > 0) {
            const merged = [
              ...githubMemory.map((githubItem) => {
                if (
                  githubItem.type === "image" &&
                  githubItem.meta?.imageStored === false
                ) {
                  const localImageItem = res.memory.find(
                    (localItem) =>
                      localItem.id === githubItem.id &&
                      localItem.type === "image"
                  );

                  if (localImageItem && localImageItem.meta?.imageData) {
                    return localImageItem;
                  }
                }
                return githubItem;
              }),
              ...res.memory.filter(
                (localItem) =>
                  !githubMemory.some(
                    (githubItem) => githubItem.id === localItem.id
                  )
              ),
            ];
            chrome.storage.local.set({ memory: merged }, () => cb(merged));
            return;
          }
        } catch (error) {
          console.error("GitHub sync failed, using local storage:", error);
        }
      }

      cb(res.memory || []);
    }
  );
}

function setMemory(memory, cb) {
  updateSyncStatus("syncing");
  chrome.storage.local.set({ memory }, async () => {
    if (githubConfig.owner && githubConfig.repo && githubConfig.token) {
      try {
        await saveToGitHub(memory);
        console.log("Successfully synced to GitHub (images excluded)");
        updateSyncStatus("synced");

        chrome.storage.local.set({ lastSync: new Date().toISOString() });
      } catch (error) {
        console.error("Failed to sync to GitHub:", error);
        updateSyncStatus("error");
      }
    } else {
      updateSyncStatus("local");
    }
    cb && cb();
  });
}

function updateSyncStatus(status) {
  syncStatus.className = "";
  switch (status) {
    case "syncing":
      syncStatus.textContent = "⏳ Saving to cloud...";
      syncStatus.classList.add("syncing");
      break;
    case "synced":
      syncStatus.textContent = "✅ Saved to cloud";
      syncStatus.classList.add("synced");
      break;
    case "error":
      syncStatus.textContent = "❌ Couldn't save";
      syncStatus.classList.add("error");
      break;
    default:
      syncStatus.textContent = "● Only on this computer";
  }
}

function checkSyncStatus() {
  chrome.storage.local.get(["githubConfig", "lastSync"], (result) => {
    if (result.githubConfig && result.githubConfig.owner) {
      if (result.lastSync) {
        const lastSync = new Date(result.lastSync);
        const now = new Date();
        const diffHours = (now - lastSync) / (1000 * 60 * 60);

        if (diffHours < 1) {
          syncStatus.textContent = "✅ Saved to cloud";
          syncStatus.classList.add("synced");
        } else {
          syncStatus.textContent = "⚠️ Not saved yet";
          syncStatus.classList.add("syncing");
        }
      } else {
        syncStatus.textContent = "⚠️ Never saved to cloud";
        syncStatus.classList.add("syncing");
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  getMemory(() => {
    applySettings();
    loadMemory();
    checkSyncStatus();
  });
});

const viewOnGithubBtn = document.createElement("button");
viewOnGithubBtn.innerHTML =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-git-icon lucide-folder-git"><circle cx="12" cy="13" r="2"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M14 13h3"/><path d="M7 13h3"/></svg>';
viewOnGithubBtn.title = "Open file on GitHub";
viewOnGithubBtn.style.marginLeft = "8px";
viewOnGithubBtn.style.fontSize = "12px";
viewOnGithubBtn.addEventListener("click", () => {
  if (githubConfig.owner && githubConfig.repo && githubConfig.path) {
    const url = `https://github.com/${githubConfig.owner}/${githubConfig.repo}/blob/main/${githubConfig.path}`;
    chrome.tabs.create({ url });
  } else {
    alert("GitHub not configured. Please set up GitHub integration first.");
  }
});

document.querySelector(".small-controls").appendChild(viewOnGithubBtn);

async function githubAPI(endpoint, options = {}) {
  const url = `https://api.github.com${endpoint}`;
  console.log("GitHub API Request:", url, options.method || "GET");

  if (!githubConfig.token) {
    throw new Error("GitHub token not configured");
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `token ${githubConfig.token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  console.log("GitHub API Response:", response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    console.error("GitHub API Error Details:", errorText);

    if (response.status === 403) {
      throw new Error(
        'GitHub API: Permission denied. Check your token has "repo" permissions.'
      );
    } else if (response.status === 404) {
      throw new Error(
        "GitHub API: Not found. Check repository name and file path."
      );
    } else {
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`
      );
    }
  }

  return response.json();
}

function saveSettingsToStorage() {
  chrome.storage.local.set({ settings }, () => applySettings());
}

/* detection & auto-tagging */
function detectType(text) {
  const t = text.trim();
  const urlRegex = /^https?:\/\/[^\s]+$/i;
  if (urlRegex.test(t)) {
    try {
      const u = new URL(t);
      return {
        type: "url",
        meta: {
          title: t,
          favicon: `https://www.google.com/s2/favicons?domain=${u.hostname}`,
        },
      };
    } catch (e) {}
  }
  return { type: "text", meta: {} };
}

function autoTagForText(text) {
  return []; // Always return empty array - no auto-tagging
}

/* rendering */
function renderTagBar(allItems) {
  const tags = new Set();
  allItems.forEach((i) => (i.tags || []).forEach((t) => tags.add(t)));
  tagBar.innerHTML = "";
  const allBtn = document.createElement("button");
  allBtn.className = "tag-btn" + (activeTag === null ? " active" : "");
  allBtn.textContent = "All";
  allBtn.addEventListener("click", () => {
    activeTag = null;
    loadMemory();
    Array.from(tagBar.children).forEach((c) => c.classList.remove("active"));
    allBtn.classList.add("active");
  });
  tagBar.appendChild(allBtn);
  Array.from(tags)
    .sort()
    .forEach((t) => {
      const b = document.createElement("button");
      b.className = "tag-btn" + (activeTag === t ? " active" : "");
      b.textContent = t;
      b.addEventListener("click", () => {
        activeTag = t;
        Array.from(tagBar.children).forEach((c) =>
          c.classList.remove("active")
        );
        b.classList.add("active");
        loadMemory();
      });
      tagBar.appendChild(b);
    });
}

function renderList(items) {
  memoryListEl.innerHTML = "";
  if (!items.length) {
    memoryListEl.innerHTML = `<div style="color:var(--muted); text-align:center; padding:16px">No saved items</div>`;
    return;
  }

  if (groupBy === "tag") {
    const groups = {};
    items.forEach((it) =>
      (it.tags || ["Z-NTA"]).forEach((t) => {
        groups[t] = groups[t] || [];
        groups[t].push(it);
      })
    );
    for (const [tag, group] of Object.entries(groups)) {
      const header = document.createElement("div");
      header.className = "group-header";
      header.innerHTML = `<strong>${tag}</strong> <button class="action-btn" data-tag="${tag}">Toggle</button>`;
      const ul = document.createElement("ul");
      ul.className = "group-list";
      group.forEach((it) => ul.appendChild(renderItem(it)));
      const liWrap = document.createElement("li");
      liWrap.appendChild(header);
      liWrap.appendChild(ul);
      memoryListEl.appendChild(liWrap);
    }
    return;
  }

  items.forEach((it) => memoryListEl.appendChild(renderItem(it)));
}

function renderItem(item) {
  const li = document.createElement("li");
  li.className = "memory-item";
  li.dataset.id = item.id;
  li.dataset.type = item.type || "text";

  const toolbar = document.createElement("div");
  toolbar.className = "item-toolbar";
  const left = document.createElement("div");
  left.className = "toolbar-left";
  const right = document.createElement("div");
  right.className = "item-actions";
  const pill = document.createElement("div");
  pill.className = "color-pill";
  pill.style.background = item.color || randomColor();
  left.appendChild(pill);

  const meta = document.createElement("div");
  meta.className = "item-meta";
  meta.textContent = formatDate(item.created);
  left.appendChild(meta);

  const selChk = document.createElement("input");
  selChk.type = "checkbox";
  selChk.className = "select-item";
  selChk.style.marginRight = "6px";
  right.appendChild(selChk);

  const copyBtn = actionBtn("📋", "Copy", () =>
    navigator.clipboard.writeText(item.text).catch(() => {})
  );
  right.appendChild(copyBtn);

  const editBtn = actionBtn("✏️", "Edit", () => startEdit(item.id));
  right.appendChild(editBtn);

  const pinBtn = actionBtn(item.pinned ? "📌" : "📍", "Pin", () =>
    togglePin(item.id)
  );
  if (item.pinned) pinBtn.classList.add("active");
  right.appendChild(pinBtn);

  const delBtn = actionBtn("❌", "Delete", () => deleteItem(item.id));
  right.appendChild(delBtn);

  if (item.meta?.sourceUrl) {
    const sourceBtn = actionBtn("🌐", "Open Source", () =>
      chrome.tabs.create({ url: item.meta.sourceUrl })
    );
    right.insertBefore(sourceBtn, right.children[1]);
  }

  toolbar.appendChild(left);
  toolbar.appendChild(right);

  const body = document.createElement("div");
  if (item.type === "url") {
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "8px";
    const fav = document.createElement("img");
    fav.src = item.meta && item.meta.favicon ? item.meta.favicon : "icon.png";
    fav.width = 20;
    fav.height = 20;
    fav.style.borderRadius = "4px";
    const a = document.createElement("a");
    a.href = item.text;
    a.textContent = item.meta && item.meta.title ? item.meta.title : item.text;
    a.target = "_blank";
    a.style.color = "var(--accent)";
    wrap.appendChild(fav);
    wrap.appendChild(a);
    body.appendChild(wrap);
    const p = document.createElement("p");
    p.className = "item-text";
    p.textContent = item.text;
    body.appendChild(p);
  } else if (item.type === "code") {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.innerHTML = window.SimpleHighlighter.highlight(item.text);
    pre.appendChild(code);

    body.appendChild(pre);
  } else if (item.type === "mixed") {
    const contentDiv = document.createElement("div");
    contentDiv.className = "mixed-content";

    const p = document.createElement("p");
    p.className = "item-text";
    p.textContent = item.text;
    contentDiv.appendChild(p);

    if (item.meta?.mergedImages) {
      const imagesContainer = document.createElement("div");
      imagesContainer.className = "attachments-grid";

      item.meta.mergedImages.forEach((img, index) => {
        if (img.imageData) {
          const imgContainer = document.createElement("div");
          imgContainer.className = "attachment-item";

          const imgEl = document.createElement("img");
          imgEl.src = img.imageData;
          imgEl.className = "attachment-thumbnail";
          imgEl.addEventListener("click", () =>
            showFullscreenImage(img.imageData)
          );

          const caption = document.createElement("div");
          caption.className = "attachment-caption";
          caption.textContent = img.caption || `Image ${index + 1}`;

          imgContainer.appendChild(imgEl);
          imgContainer.appendChild(caption);
          imagesContainer.appendChild(imgContainer);
        }
      });

      contentDiv.appendChild(imagesContainer);
    }

    if (item.meta?.sourceUrls && item.meta.sourceUrls.length > 0) {
      const sourcesDiv = document.createElement("div");
      sourcesDiv.className = "merged-sources";
      sourcesDiv.innerHTML = `<strong>Sources:</strong>`;

      const sourcesList = document.createElement("ul");
      item.meta.sourceUrls.forEach((source) => {
        const li = document.createElement("li");
        const a = document.createElement("a");

        if (typeof source === "object" && source.url) {
          a.href = source.url;
          a.target = "_blank";
          a.textContent = source.title || new URL(source.url).hostname;
        } else if (typeof source === "string") {
          a.href = source;
          a.target = "_blank";
          a.textContent = new URL(source).hostname;
        } else {
          return;
        }

        li.appendChild(a);
        sourcesList.appendChild(li);
      });

      if (sourcesList.children.length > 0) {
        sourcesDiv.appendChild(sourcesList);
        contentDiv.appendChild(sourcesDiv);
      }
    }

    body.appendChild(contentDiv);
  } else {
    const p = document.createElement("p");
    p.className = "item-text";
    p.textContent = item.text;
    p.addEventListener("click", () => {
      showFullContent(item);
    });

    body.appendChild(p);

    if (item.meta?.sourceUrl) {
      const sourceDiv = document.createElement("div");
      sourceDiv.className = "source-indicator";

      let sourceUrl = item.meta.sourceUrl;
      let sourceTitle = new URL(sourceUrl).hostname;

      if (typeof sourceUrl === "object" && sourceUrl.url) {
        sourceTitle = sourceUrl.title || new URL(sourceUrl.url).hostname;
        sourceUrl = sourceUrl.url;
      }

      sourceDiv.innerHTML = `
    <span>Saved from:</span>
    <a href="${sourceUrl}" target="_blank">${sourceTitle}</a>
  `;
      body.appendChild(sourceDiv);
    }
  }

  if (item.type === "image") {
    const imgContainer = document.createElement("div");
    imgContainer.className = "image-container";

    if (item.meta?.imageData) {
      const img = document.createElement("img");
      img.src = item.meta.imageData;
      img.className = "image-thumbnail";
      img.addEventListener("click", () =>
        showFullscreenImage(item.meta.imageData)
      );
      imgContainer.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "image-placeholder";
      placeholder.innerHTML = "🖼️ Image (stored locally)";
      placeholder.style.cssText = `
        padding: 20px;
        text-align: center;
        background: rgba(255,255,255,0.05);
        border-radius: 8px;
        color: var(--muted);
      `;
      imgContainer.appendChild(placeholder);
    }

    const caption = document.createElement("p");
    caption.className = "image-caption";
    caption.textContent = item.text || "Screenshot";
    imgContainer.appendChild(caption);

    body.appendChild(imgContainer);
  }

  const tagWrap = document.createElement("div");
  tagWrap.className = "item-tags";
  (item.tags || []).forEach((t) => {
    const tg = document.createElement("div");
    tg.className = "tag";
    tg.textContent = t;
    tg.addEventListener("click", () => {
      activeTag = t;
      loadMemory();
      Array.from(tagBar.children).forEach((c) => c.classList.remove("active"));
      const btn = Array.from(tagBar.children).find((b) => b.textContent === t);
      if (btn) btn.classList.add("active");
    });
    tagWrap.appendChild(tg);
  });

  li.appendChild(toolbar);
  li.appendChild(body);
  li.appendChild(tagWrap);
  return li;
}

function actionBtn(symbol, title, cb) {
  const b = document.createElement("button");
  b.className = "action-btn";
  b.title = title;
  b.innerText = symbol;
  b.addEventListener("click", cb);
  return b;
}

/* load & filters */
function loadMemory() {
  getMemory((list) => {
    list.sort(
      (a, b) => b.pinned - a.pinned || new Date(b.created) - new Date(a.created)
    );

    const q = searchInput.value.trim().toLowerCase();
    let filtered = list.filter((i) => {
      const inText = i.text.toLowerCase().includes(q);
      const inTags = (i.tags || []).some((t) => t.toLowerCase().includes(q));
      return q ? inText || inTags : true;
    });

    if (activeTag)
      filtered = filtered.filter((i) => (i.tags || []).includes(activeTag));

    renderTagBar(list);
    renderList(filtered);
  });
}

/* CRUD operations */
addBtn.addEventListener("click", () => {
  const text = newText.value.trim();
  if (!text) return;
  const tagsInput = newTag.value.trim();
  const userTags = tagsInput
    ? tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const tags = userTags.length ? userTags : ["Z-NTA"];

  const detected = detectType(text);
  const item = {
    id: uid(),
    text,
    created: new Date().toISOString(),
    color: randomColor(),
    pinned: pinOnAdd.checked,
    tags, // Only user tags now
    type: detected.type,
    meta: detected.meta || {},
    versions: [],
  };
  getMemory((list) => {
    setMemory([item, ...list], () => {
      newText.value = "";
      newTag.value = "";
      pinOnAdd.checked = false;
      loadMemory();
    });
  });
});
let undoQueue = [];
let isShowingUndo = false;

/* delete single with queued undo */
function deleteItem(id) {
  getMemory((list) => {
    const itemToDelete = list.find((i) => i.id === id);
    const updatedList = list.filter((i) => i.id !== id);

    setMemory(updatedList, () => {
      loadMemory();

      undoQueue.push({ item: itemToDelete, id: id });

      if (!isShowingUndo) {
        showNextUndoBar();
      }
    });
  });
}

/* show next undo bar from queue */
function showNextUndoBar() {
  if (undoQueue.length === 0 || isShowingUndo) return;

  isShowingUndo = true;
  const { item, id } = undoQueue.shift();

  const undoBar = document.createElement("div");
  undoBar.className = "undo-bar";
  undoBar.dataset.id = id;

  const itemTitle =
    item.text.length > 30 ? item.text.substring(0, 30) + "..." : item.text;

  undoBar.innerHTML = `
    <span>Deleted: "${itemTitle}"</span>
    <button class="undo-btn">Undo</button>
    <button class="close-btn">×</button>
    <div class="border-timer"></div>
  `;

  const borderTimer = undoBar.querySelector(".border-timer");

  setTimeout(() => {
    borderTimer.style.transition = "width 5s linear";
    borderTimer.style.width = "100%";
  }, 10);

  undoBar.querySelector(".undo-btn").addEventListener("click", () => {
    getMemory((list) => {
      setMemory([item, ...list], () => {
        loadMemory();
        undoBar.remove();
        isShowingUndo = false;
        showNextUndoBar();
      });
    });
  });

  undoBar.querySelector(".close-btn").addEventListener("click", () => {
    undoBar.remove();
    isShowingUndo = false;
    showNextUndoBar();
  });

  setTimeout(() => {
    if (undoBar.parentNode) {
      undoBar.remove();
      isShowingUndo = false;
      showNextUndoBar();
    }
  }, 5000);

  document.body.appendChild(undoBar);
}

/* clear all with queued undo */
function clearAllWithUndo() {
  getMemory((list) => {
    if (list.length === 0) return;

    const allItems = [...list];

    setMemory([], () => {
      loadMemory();

      undoQueue.push({
        items: allItems,
        isBulk: true,
        count: allItems.length,
      });

      if (!isShowingUndo) {
        showNextUndoBar();
      }
    });
  });
}

/* toggle pin */
function togglePin(id) {
  getMemory((list) => {
    const upd = list.map((i) =>
      i.id === id ? { ...i, pinned: !i.pinned } : i
    );
    setMemory(upd, () => loadMemory());
  });
}

/* duplicate */
function duplicateItem(id) {
  getMemory((list) => {
    const it = list.find((i) => i.id === id);
    if (!it) return;
    const copy = { ...it, id: uid(), created: new Date().toISOString() };
    setMemory([copy, ...list], () => loadMemory());
  });
}

/* start inline edit */
function startEdit(id) {
  getMemory((list) => {
    const item = list.find((i) => i.id === id);
    if (!item) return;
    const li = document.querySelector(`li[data-id='${id}']`);
    if (!li) return;
    const body =
      li.querySelector(".item-text, pre, .item-text") ||
      li.querySelector("div");

    const editor = document.createElement("div");
    editor.setAttribute("data-edit", "true");

    const ta = document.createElement("textarea");
    ta.value = item.text;
    ta.style.width = "100%";
    ta.rows = 4;

    const tagIn = document.createElement("input");
    tagIn.type = "text";
    tagIn.value = (item.tags || []).join(", ");

    const save = document.createElement("button");
    save.className = "action-btn";
    save.innerText = "Save";

    const cancel = document.createElement("button");
    cancel.className = "action-btn";
    cancel.innerText = "Cancel";

    const actions = document.createElement("div");
    actions.className = "edit-actions";
    actions.append(save, cancel);

    editor.append(ta, tagIn, actions);
    body.replaceWith(editor);

    save.addEventListener("click", () => finishEdit(id, ta.value, tagIn.value));
    cancel.addEventListener("click", loadMemory);
  });
}

function finishEdit(id, newTextVal, tagsVal) {
  getMemory((list) => {
    const updated = list.map((i) => {
      if (i.id === id) {
        const prev = { text: i.text, date: new Date().toISOString() };
        const versions = i.versions || [];
        versions.unshift(prev);
        const newTags = tagsVal
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        return {
          ...i,
          text: newTextVal,
          tags: newTags.length ? newTags : ["Z-NTA"],
          versions,
        };
      }
      return i;
    });
    setMemory(updated, () => loadMemory());
  });
}

/* selection helpers for batch actions */
function getSelectedIds() {
  return Array.from(document.querySelectorAll(".select-item"))
    .filter((cb) => cb.checked)
    .map((cb) => {
      const li = cb.closest("li");
      return li ? li.dataset.id : null;
    })
    .filter(Boolean);
}

/* duplicate selected */
duplicateBtn.addEventListener("click", () => {
  const ids = getSelectedIds();
  if (!ids.length) {
    alert("No selection");
    return;
  }
  getMemory((list) => {
    const copies = [];
    ids.forEach((id) => {
      const it = list.find((i) => i.id === id);
      if (it)
        copies.push({ ...it, id: uid(), created: new Date().toISOString() });
    });
    setMemory([...copies, ...list], () => loadMemory());
  });
});

/* merge selected */
mergeBtn.addEventListener("click", () => {
  const ids = getSelectedIds();
  if (ids.length < 2) {
    alert("Select at least 2 items to merge");
    return;
  }
  if (!confirm("Merge selected items into one note?")) return;

  getMemory((list) => {
    const items = ids
      .map((id) => list.find((i) => i.id === id))
      .filter(Boolean);

    let mergedText = "";
    let allImages = [];
    let allSourceUrls = [];

    items.forEach((item) => {
      if (item.type === "mixed" && item.meta?.mergedImages) {
        mergedText += item.text + "\n--\n";

        allImages = [...allImages, ...item.meta.mergedImages];

        if (item.meta.sourceUrls) {
          item.meta.sourceUrls.forEach((source) => {
            if (typeof source === "object" && source.url) {
              allSourceUrls.push(source);
            } else if (typeof source === "string") {
              allSourceUrls.push({
                url: source,
                title: new URL(source).hostname,
              });
            }
          });
        }
      } else if (item.type === "image") {
        const imageRef = `[Image: ${item.text || "Screenshot"}]`;
        mergedText += imageRef + "\n";

        allImages.push({
          imageData: item.meta?.imageData,
          caption: item.text || "Screenshot",
          sourceUrl: item.meta?.sourceUrl,
        });

        if (item.meta?.sourceUrl) {
          allSourceUrls.push({
            url: item.meta.sourceUrl,
            title: item.text || "Screenshot",
          });
        }
      } else {
        mergedText += item.text + "\n";
        if (item.meta?.sourceUrl) {
          allSourceUrls.push({
            url: item.meta.sourceUrl,
            title: item.meta.title || new URL(item.meta.sourceUrl).hostname,
          });
        }
      }
    });

    const mergedTags = Array.from(new Set(items.flatMap((i) => i.tags || [])));
    const hasImages = allImages.length > 0;

    const merged = {
      id: uid(),
      text: mergedText.trim(),
      created: new Date().toISOString(),
      color: randomColor(),
      pinned: items.some((i) => i.pinned),
      tags: mergedTags.length ? mergedTags : ["Z-NTA"],
      type: hasImages ? "mixed" : "text",
      meta: {
        ...(hasImages && {
          mergedImages: allImages,

          sourceUrls: allSourceUrls.filter(Boolean),
        }),
        versions: [],
      },
    };

    if (!hasImages && allSourceUrls.length > 0) {
      merged.meta.sourceUrls = allSourceUrls.filter(Boolean);
    }

    const remaining = list.filter((i) => !ids.includes(i.id));
    setMemory([merged, ...remaining], () => loadMemory());
  });
});
/* export all */
exportBtn.addEventListener("click", () => {
  getMemory((list) => {
    const blob = new Blob([JSON.stringify(list, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `memory-all-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
});

/* import */
importBtn.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const imported = JSON.parse(ev.target.result);
      if (!Array.isArray(imported)) throw new Error("Invalid");
      getMemory((existing) => {
        const merged = [...imported, ...existing];
        setMemory(merged.slice(0, 5000), () => loadMemory());
      });
    } catch (err) {
      alert("Import failed");
    }
  };
  reader.readAsText(f);
  importFile.value = "";
});

/* replace the existing clearAllBtn event listener */
/* replace the existing clearAllBtn event listener */
clearAllBtn.addEventListener("click", () => {
  if (clearAllBtn.classList.contains("confirm-mode")) {
    clearAllWithUndo();
    clearAllBtn.classList.remove("confirm-mode");
    clearAllBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-icon lucide-trash"><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    clearAllBtn.style.background = "";
  } else {
    clearAllBtn.classList.add("confirm-mode");
    clearAllBtn.innerHTML = "❓ Clear All?";
    clearAllBtn.style.background = "#ff6b6b";

    setTimeout(() => {
      clearAllBtn.classList.remove("confirm-mode");
      clearAllBtn.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-icon lucide-trash"><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
      clearAllBtn.style.background = "";
    }, 3000);
  }
});

/* search/filter events */
searchInput.addEventListener("input", () => loadMemory());

/* view toggle */
viewToggle.addEventListener("click", () => {
  listView = !listView;
  settings.listView = listView;
  saveSettingsToStorage();
  updateLayoutView();
});

/* group toggle */
groupToggle.addEventListener("click", () => {
  if (groupBy === null) groupBy = "tag";
  else groupBy = null;
  loadMemory();
});

document.getElementById("openInTabBtn").addEventListener("click", () => {
  chrome.tabs.create({
    url:
      chrome.runtime.getURL("popup.html") +
      `?text=${encodeURIComponent(newText.value)}` +
      `&tags=${encodeURIComponent(newTag.value)}`,
  });
});

function showFullscreenImage(imageSrc) {
  const viewer = document.createElement("div");
  viewer.id = "image-viewer";

  viewer.innerHTML = `
    <img src="${imageSrc}" alt="Fullscreen screenshot">
    <button class="close-btn">×</button>
  `;

  viewer.querySelector(".close-btn").addEventListener("click", () => {
    viewer.remove();
  });

  viewer.addEventListener("click", (e) => {
    if (e.target === viewer) viewer.remove();
  });

  document.body.appendChild(viewer);

  document.addEventListener("keydown", function closeOnEscape(e) {
    if (e.key === "Escape") {
      viewer.remove();
      document.removeEventListener("keydown", closeOnEscape);
    }
  });
}

githubSettingsBtn.addEventListener("click", () => {
  githubOwner.value = githubConfig.owner;
  githubRepo.value = githubConfig.repo;
  githubPath.value = githubConfig.path;
  githubToken.value = githubConfig.token;
  githubModal.classList.remove("hidden");
});

closeGithubModal.addEventListener("click", () => {
  githubModal.classList.add("hidden");
});

saveGithubSettings.addEventListener("click", () => {
  githubConfig = {
    owner: githubOwner.value,
    repo: githubRepo.value,
    path: githubPath.value,
    token: githubToken.value,
  };

  chrome.storage.local.set({ githubConfig }, () => {
    githubModal.classList.add("hidden");
  });
});

const syncBtn = document.createElement("button");
syncBtn.title = "Sync with GitHub";
syncBtn.innerHTML =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-sync-icon lucide-folder-sync"><path d="M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M12 10v4h4"/><path d="m12 14 1.535-1.605a5 5 0 0 1 8 1.5"/><path d="M22 22v-4h-4"/><path d="m22 18-1.535 1.605a5 5 0 0 1-8-1.5"/></svg>';
syncBtn.id = "syncBtn";

syncBtn.addEventListener("click", async () => {
  try {
    updateSyncStatus("syncing");
    getMemory(async (memory) => {
      try {
        await setMemory(memory, () => {
          console.log("Manual sync completed");
          loadMemory();
        });
      } catch (error) {
        console.error("Sync failed:", error);
        updateSyncStatus("error");
        alert(`Sync failed: ${error.message}`);
      }
    });
  } catch (error) {
    updateSyncStatus("error");
    alert(`Sync failed: ${error.message}`);
  }
});

document.querySelector(".small-controls").appendChild(syncBtn);

testGithubConnection.addEventListener("click", async () => {
  const testConfig = {
    owner: githubOwner.value,
    repo: githubRepo.value,
    path: githubPath.value,
    token: githubToken.value,
  };

  const originalConfig = { ...githubConfig };
  githubConfig = testConfig;

  try {
    updateSyncStatus("syncing");
    await verifyRepositoryAccess();
    alert("✅ Connection successful! Repository exists and is accessible.");
    updateSyncStatus("synced");
  } catch (error) {
    alert(`❌ Connection failed: ${error.message}`);
    updateSyncStatus("error");
  } finally {
    githubConfig = originalConfig;
  }
});

// function toggleContentExpansion(element, button, item) {
//   const isExpanded = element.classList.contains("expanded");

//   if (isExpanded) {
//     element.classList.remove("expanded");
//     button.textContent = "Show more";
//   } else {
//     element.classList.add("expanded");
//     button.textContent = "Show less";

//     element.scrollIntoView({ behavior: "smooth", block: "nearest" });
//   }
// }

function showFullContent(item) {
  const viewer = document.createElement("div");
  viewer.id = "content-viewer";

  viewer.innerHTML = `
    <div class="content-container">
      <button class="close-btn">×</button>
      <div class="content-meta">
        <strong>${formatDate(item.created)}</strong> | 
        Tags: ${(item.tags || []).join(", ")}
      </div>
      <div class="content-body">${
        item.type === "code"
          ? "<pre><code>" +
            window.SimpleHighlighter.highlight(item.text) +
            "</code></pre>"
          : item.text
      }</div>
    </div>
  `;

  viewer.querySelector(".close-btn").addEventListener("click", () => {
    viewer.remove();
  });

  viewer.addEventListener("click", (e) => {
    if (e.target === viewer) viewer.remove();
  });

  document.addEventListener("keydown", function closeOnEscape(e) {
    if (e.key === "Escape") {
      viewer.remove();
      document.removeEventListener("keydown", closeOnEscape);
    }
  });

  document.body.appendChild(viewer);
}
