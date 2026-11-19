// Xiaoler starts with a demo library when Supabase is not configured.
// After setup, replace these two values with your project's public values.
const SUPABASE_URL = "";
const SUPABASE_ANON_KEY = "";

const $ = (selector) => document.querySelector(selector);
const assetGrid = $("#assetGrid");
const emptyMessage = $("#emptyMessage");
const searchInput = $("#searchInput");
const categoryFilter = $("#categoryFilter");

const demoAssets = [
  {
    title: "Purple wizard",
    description: "A small fantasy character sprite.",
    category: "sprite",
    file_type: "image/png",
    file_name: "wizard.png",
    file_url: "",
  },
  {
    title: "Forest ambience",
    description: "Birds, wind, and distant leaves.",
    category: "sound",
    file_type: "audio/mpeg",
    file_name: "forest.mp3",
    file_url: "",
  },
  {
    title: "Blue sky",
    description: "A wide sky photograph for a level background.",
    category: "photo",
    file_type: "image/jpeg",
    file_name: "sky.jpg",
    file_url: "",
  },
];

let supabase = null;
let currentAssets = [...demoAssets];

async function initializeSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

  const module = await import("https://esm.sh/@supabase/supabase-js@2");
  supabase = module.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await loadAssets();
  await updateAuthButton();
}

async function loadAssets() {
  if (!supabase) return;

  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  currentAssets = data;
  renderAssets();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function previewFor(asset) {
  const type = asset.file_type || "";
  const url = escapeHtml(asset.file_url);

  if (type.startsWith("image/") && url) {
    return `<img src="${url}" alt="${escapeHtml(asset.title)}" loading="lazy">`;
  }
  if (type.startsWith("video/") && url) {
    return `<video src="${url}" controls preload="metadata"></video>`;
  }
  if (type.startsWith("audio/") && url) {
    return `<audio src="${url}" controls preload="metadata"></audio>`;
  }

  const icons = { sprite: "◆", sound: "♫", photo: "◉", video: "▶", other: "▦" };
  return `<span class="asset-preview-icon" aria-hidden="true">${icons[asset.category] || "▦"}</span>`;
}

function renderAssets() {
  const search = searchInput.value.trim().toLowerCase();
  const category = categoryFilter.value;

  const matches = currentAssets.filter((asset) => {
    const categoryMatches = category === "all" || asset.category === category;
    const text = `${asset.title} ${asset.description || ""} ${asset.file_name || ""}`.toLowerCase();
    return categoryMatches && text.includes(search);
  });

  assetGrid.innerHTML = matches.map((asset) => `
    <article class="asset-card">
      <div class="asset-preview">${previewFor(asset)}</div>
      <div class="asset-body">
        <h3 class="asset-title" title="${escapeHtml(asset.title)}">${escapeHtml(asset.title)}</h3>
        <p class="asset-description">${escapeHtml(asset.description || "Community asset")}</p>
        <div class="asset-meta">
          <span>${escapeHtml(asset.category)}</span>
          ${asset.file_url ? `<a class="asset-link" href="${escapeHtml(asset.file_url)}" target="_blank" rel="noopener">Download</a>` : "<span>Example</span>"}
        </div>
      </div>
    </article>
  `).join("");

  emptyMessage.hidden = matches.length !== 0;
}

searchInput.addEventListener("input", renderAssets);
categoryFilter.addEventListener("change", renderAssets);

const uploadDialog = $("#uploadDialog");
const authDialog = $("#authDialog");

$("#openUploadButton").addEventListener("click", async () => {
  if (!supabase) {
    alert("Supabase has not been configured yet. Follow the setup instructions in README.md.");
    return;
  }

  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    authDialog.showModal();
  } else {
    uploadDialog.showModal();
  }
});

$("#closeUploadButton").addEventListener("click", () => uploadDialog.close());
$("#closeAuthButton").addEventListener("click", () => authDialog.close());
$("#authButton").addEventListener("click", () => supabase ? authDialog.showModal() : alert("Supabase has not been configured yet."));

$("#authForm").addEventListener("submit", async (event) => {
  event.preventEvent?.();
  event.preventDefault();

  const email = new FormData(event.currentTarget).get("email");
  const status = $("#authStatus");
  status.className = "status";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href },
  });

  if (error) {
    status.textContent = error.message;
    status.className = "status error";
  } else {
    status.textContent = "Check your email for a secure sign-in link.";
  }
});

$("#uploadForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const submitButton = $("#submitUploadButton");
  const status = $("#uploadStatus");
  const values = new FormData(form);
  const file = values.get("file");

  if (file.size > 25 * 1024 * 1024) {
    status.textContent = "That file is larger than 25 MB.";
    status.className = "status error";
    return;
  }

  const blockedExtensions = [".exe", ".com", ".bat", ".cmd", ".msi", ".app", ".dmg", ".apk", ".js", ".html", ".php", ".sh"];
  if (blockedExtensions.some((extension) => file.name.toLowerCase().endsWith(extension))) {
    status.textContent = "Executable and script files are not allowed.";
    status.className = "status error";
    return;
  }

  submitButton.disabled = true;
  status.textContent = "Uploading...";
  status.className = "status";

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    status.textContent = "Please sign in before uploading.";
    status.className = "status error";
    submitButton.disabled = false;
    return;
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${userData.user.id}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("assets")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    status.textContent = uploadError.message;
    status.className = "status error";
    submitButton.disabled = false;
    return;
  }

  const { data: publicUrl } = supabase.storage.from("assets").getPublicUrl(path);

  const { error: insertError } = await supabase.from("assets").insert({
    title: values.get("title"),
    description: values.get("description"),
    category: values.get("category"),
    file_name: file.name,
    file_type: file.type,
    file_size: file.size,
    file_url: publicUrl.publicUrl,
  });

  if (insertError) {
    status.textContent = insertError.message;
    status.className = "status error";
  } else {
    status.textContent = "Upload complete!";
    form.reset();
    await loadAssets();
    setTimeout(() => uploadDialog.close(), 700);
  }

  submitButton.disabled = false;
});

async function updateAuthButton() {
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  $("#authButton").textContent = data.user ? "Sign out" : "Sign in";

  $("#authButton").onclick = async () => {
    if (data.user) {
      await supabase.auth.signOut();
      $("#authButton").textContent = "Sign in";
      $("#authButton").onclick = () => authDialog.showModal();
    } else {
      authDialog.showModal();
    }
  };
}

supabase?.auth?.onAuthStateChange?.(() => updateAuthButton());
initializeSupabase();
renderAssets();
